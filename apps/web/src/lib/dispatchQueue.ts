import { getServiceContext, isPlaceholderEnv } from '@/lib/supabase/authContext';
import { canonicalDigits } from '@/lib/conversationRepo';

// ============================================================================
// Fila de disparo PERSISTENTE (Supabase). Um cron chama o tick e consome a fila
// UM contato por vez. Sobrevive a fechar a aba e retoma sozinho. Fallback em
// memória para dev/placeholder.
// ============================================================================

export interface QueueItem {
  id: string;
  phone: string;
  name?: string;
  bairro?: string;
  status: 'pendente' | 'processando' | 'enviado' | 'erro';
  attempts: number;
  instanceName?: string;
}

export interface QueueStatus {
  total: number;
  enviados: number;
  erros: number;
  pendentes: number;
  /** Pendentes que JA falharam ao menos uma vez e estao em retentativa. */
  emRetentativa: number;
  pausado: boolean;
  ativo: boolean;
  segundosRestantesProximo: number;
}

// ---- Fallback em memória (dev) ----
declare global {
  // eslint-disable-next-line no-var
  var __aiviq_queue: QueueItem[] | undefined;
  // eslint-disable-next-line no-var
  var __aiviq_queue_ctrl: { paused: boolean; nextAllowedAt: number } | undefined;
}
if (!global.__aiviq_queue) global.__aiviq_queue = [];
if (!global.__aiviq_queue_ctrl) global.__aiviq_queue_ctrl = { paused: false, nextAllowedAt: 0 };

function secsUntil(nextAllowedAtMs: number): number {
  return Math.max(0, Math.ceil((nextAllowedAtMs - Date.now()) / 1000));
}

// -------------------- ENQUEUE --------------------
export interface EnqueueResult {
  enfileirados: number;
  ignorados: number;
  /** Ja receberam a abordagem numa rodada anterior e foram pulados. */
  jaEnviados: number;
}

/**
 * Enfileira contatos. Por padrao PULA quem ja recebeu a abordagem (status
 * 'enviado'): reimportar a mesma planilha e o jeito mais facil de mandar a
 * mesma mensagem duas vezes para a mesma pessoa -- ruim para o eleitor e um
 * sinal classico de spam para a Meta. Passe `permitirReenvio` para forcar.
 */
export async function enqueueContacts(
  contatos: Array<{ name?: string; phone: string; bairro?: string }>,
  opts: { permitirReenvio?: boolean } = {}
): Promise<EnqueueResult> {
  const permitirReenvio = opts.permitirReenvio === true;
  const limpos = contatos
    .map((c) => ({ name: (c.name || '').trim(), phone: canonicalDigits(c.phone), bairro: c.bairro || 'Mato Grosso do Sul' }))
    .filter((c) => c.phone && c.phone.length >= 10);

  // Dedup no lote.
  const seen = new Set<string>();
  const unicos = limpos.filter((c) => (seen.has(c.phone) ? false : (seen.add(c.phone), true)));

  if (isPlaceholderEnv()) {
    const q = global.__aiviq_queue!;
    const naFila = new Set(
      q.filter((i) => i.status === 'pendente' || i.status === 'processando').map((i) => i.phone)
    );
    const enviados = new Set(q.filter((i) => i.status === 'enviado').map((i) => i.phone));
    let n = 0;
    let ja = 0;
    for (const c of unicos) {
      if (naFila.has(c.phone)) continue;
      if (!permitirReenvio && enviados.has(c.phone)) { ja++; continue; }
      q.push({ id: `q-${Date.now()}-${n}`, phone: c.phone, name: c.name, bairro: c.bairro, status: 'pendente', attempts: 0 });
      n++;
    }
    return { enfileirados: n, ignorados: unicos.length - n - ja, jaEnviados: ja };
  }

  const ctx = await getServiceContext();
  if (!ctx) return { enfileirados: 0, ignorados: 0, jaEnviados: 0 };

  // Ja na fila (pendente/processando) -> pula sempre.
  const { data: pend } = await ctx.db
    .from('dispatch_queue')
    .select('phone')
    .eq('organization_id', ctx.organizationId)
    .in('status', ['pendente', 'processando']);
  const naFila = new Set((pend || []).map((r: any) => r.phone));

  // Ja abordado -> pula, a menos que o operador peca reenvio explicitamente.
  let jaEnviados = new Set<string>();
  if (!permitirReenvio) {
    const { data: env } = await ctx.db
      .from('dispatch_queue')
      .select('phone')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'enviado');
    jaEnviados = new Set((env || []).map((r: any) => r.phone));
  }

  let puladosPorEnvio = 0;
  const rows = unicos
    .filter((c) => {
      if (naFila.has(c.phone)) return false;
      if (jaEnviados.has(c.phone)) { puladosPorEnvio++; return false; }
      return true;
    })
    .map((c) => ({ organization_id: ctx.organizationId, phone: c.phone, name: c.name, bairro: c.bairro, status: 'pendente' }));

  // Insere em lotes de 500 (limite de payload). O indice unico parcial da
  // migration 015 recusa um telefone que ja esteja ativo na fila; no Postgres
  // isso aborta o LOTE INTEIRO. Sem checar o erro, uma unica colisao derrubava
  // 500 contatos em silencio e a tela ainda dizia que foram enfileirados.
  // Por isso: se o lote falhar, reinsere linha a linha e conta o que entrou.
  let inseridos = 0;
  let colisoes = 0;
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 500) {
      const lote = rows.slice(i, i + 500);
      const { error } = await ctx.db.from('dispatch_queue').insert(lote);
      if (!error) {
        inseridos += lote.length;
        continue;
      }
      console.warn('[dispatchQueue] lote recusado, reinserindo individualmente:', error.message);
      for (const linha of lote) {
        const { error: e1 } = await ctx.db.from('dispatch_queue').insert(linha);
        if (e1) colisoes++;
        else inseridos++;
      }
    }
    if (inseridos > 0) {
      // Ao enfileirar, garante que não está pausado e libera o próximo envio.
      await setPaused(false);
    }
  }
  return {
    enfileirados: inseridos,
    ignorados: unicos.length - rows.length - puladosPorEnvio + colisoes,
    jaEnviados: puladosPorEnvio,
  };
}

// -------------------- CONTROLE (pausa) --------------------
export async function setPaused(paused: boolean): Promise<void> {
  if (isPlaceholderEnv()) {
    global.__aiviq_queue_ctrl!.paused = paused;
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  await ctx.db
    .from('dispatch_control')
    .upsert(
      { organization_id: ctx.organizationId, paused, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id' }
    );
}

export async function clearPending(): Promise<void> {
  if (isPlaceholderEnv()) {
    global.__aiviq_queue = (global.__aiviq_queue || []).filter((i) => i.status !== 'pendente');
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  await ctx.db.from('dispatch_queue').delete().eq('organization_id', ctx.organizationId).in('status', ['pendente', 'processando']);
}

// -------------------- STATUS (para a UI) --------------------
export async function getQueueStatus(): Promise<QueueStatus> {
  if (isPlaceholderEnv()) {
    const q = global.__aiviq_queue!;
    const enviados = q.filter((i) => i.status === 'enviado').length;
    const erros = q.filter((i) => i.status === 'erro').length;
    const pendentes = q.filter((i) => i.status === 'pendente' || i.status === 'processando').length;
    const ctrl = global.__aiviq_queue_ctrl!;
    return {
      total: q.length, enviados, erros, pendentes,
      emRetentativa: q.filter((i) => i.status === 'pendente' && i.attempts > 0).length,
      pausado: ctrl.paused, ativo: pendentes > 0 && !ctrl.paused,
      segundosRestantesProximo: secsUntil(ctrl.nextAllowedAt),
    };
  }
  const ctx = await getServiceContext();
  if (!ctx) return { total: 0, enviados: 0, erros: 0, pendentes: 0, emRetentativa: 0, pausado: false, ativo: false, segundosRestantesProximo: 0 };

  const counts: Record<string, number> = { pendente: 0, processando: 0, enviado: 0, erro: 0 };
  // Conta por status (3 queries baratas por índice, evita puxar linhas).
  for (const s of ['pendente', 'processando', 'enviado', 'erro'] as const) {
    const { count } = await ctx.db
      .from('dispatch_queue')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('status', s);
    counts[s] = count || 0;
  }
  // Pendentes que ja falharam ao menos uma vez (falha parcial, invisivel antes:
  // so viravam 'erro' na 3a tentativa).
  const { count: retry } = await ctx.db
    .from('dispatch_queue')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'pendente')
    .gt('attempts', 0);

  const { data: ctrl } = await ctx.db
    .from('dispatch_control')
    .select('paused, next_allowed_at')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  const paused = Boolean(ctrl?.paused);
  const nextMs = ctrl?.next_allowed_at ? new Date(ctrl.next_allowed_at).getTime() : 0;
  return {
    total: counts.pendente + counts.processando + counts.enviado + counts.erro,
    enviados: counts.enviado,
    erros: counts.erro,
    pendentes: counts.pendente + counts.processando,
    emRetentativa: retry || 0,
    pausado: paused,
    ativo: counts.pendente + counts.processando > 0 && !paused,
    segundosRestantesProximo: secsUntil(nextMs),
  };
}

// ==================== CONSUMO (usado pelo tick/cron) ====================
export async function getControlState(): Promise<{ paused: boolean; nextAllowedAtMs: number }> {
  if (isPlaceholderEnv()) {
    const c = global.__aiviq_queue_ctrl!;
    return { paused: c.paused, nextAllowedAtMs: c.nextAllowedAt };
  }
  const ctx = await getServiceContext();
  if (!ctx) return { paused: false, nextAllowedAtMs: 0 };
  const { data } = await ctx.db
    .from('dispatch_control')
    .select('paused, next_allowed_at')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  return {
    paused: Boolean(data?.paused),
    nextAllowedAtMs: data?.next_allowed_at ? new Date(data.next_allowed_at).getTime() : 0,
  };
}

export async function setNextAllowedAt(ms: number): Promise<void> {
  if (isPlaceholderEnv()) {
    global.__aiviq_queue_ctrl!.nextAllowedAt = ms;
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  await ctx.db
    .from('dispatch_control')
    .upsert(
      { organization_id: ctx.organizationId, next_allowed_at: new Date(ms).toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'organization_id' }
    );
}

// -------------------- RITMO POR INSTÂNCIA --------------------
// Antes havia um único next_allowed_at para a organização inteira: todos os
// chips andavam em lockstep e um chip no teto travava os demais. Agora cada
// instância tem o seu relógio (dispatch_instance_control).

declare global {
  // eslint-disable-next-line no-var
  var __aiviq_inst_next: Record<string, number> | undefined;
}
if (!global.__aiviq_inst_next) global.__aiviq_inst_next = {};

/** Próximo horário de envio (ms) de cada instância informada. */
export async function getInstanceNextAllowedAt(
  instances: string[]
): Promise<Record<string, number>> {
  if (instances.length === 0) return {};
  if (isPlaceholderEnv()) {
    const out: Record<string, number> = {};
    for (const i of instances) out[i] = global.__aiviq_inst_next![i] || 0;
    return out;
  }
  const ctx = await getServiceContext();
  if (!ctx) return {};
  const { data } = await ctx.db
    .from('dispatch_instance_control')
    .select('instance_name, next_allowed_at')
    .eq('organization_id', ctx.organizationId)
    .in('instance_name', instances);

  const out: Record<string, number> = {};
  for (const i of instances) out[i] = 0;
  for (const r of data || []) {
    out[(r as any).instance_name] = (r as any).next_allowed_at
      ? new Date((r as any).next_allowed_at).getTime()
      : 0;
  }
  return out;
}

export async function setInstanceNextAllowedAt(instance: string, ms: number): Promise<void> {
  if (isPlaceholderEnv()) {
    global.__aiviq_inst_next![instance] = ms;
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  await ctx.db.from('dispatch_instance_control').upsert(
    {
      organization_id: ctx.organizationId,
      instance_name: instance,
      next_allowed_at: new Date(ms).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,instance_name' }
  );
}

// -------------------- CLAIM ATÔMICO --------------------
// Substitui o SELECT sem lock. O cron da Vercel, o worker de servidor e CADA
// aba aberta chamam o tick; sem o claim, dois deles pegavam o mesmo contato e
// o eleitor recebia a abordagem duas vezes (além de queimar 2 slots do chip).

/** Reserva `count` contatos pendentes para ESTE tick (FOR UPDATE SKIP LOCKED). */
export async function claimPendingItems(count = 1): Promise<QueueItem[]> {
  if (count <= 0) return [];
  if (isPlaceholderEnv()) {
    const itens = (global.__aiviq_queue || []).filter((i) => i.status === 'pendente').slice(0, count);
    itens.forEach((i) => { i.status = 'processando'; });
    return itens;
  }
  const ctx = await getServiceContext();
  if (!ctx) return [];
  const { data, error } = await ctx.db.rpc('claim_dispatch_items', {
    p_org: ctx.organizationId,
    p_limit: count,
  });
  if (error) {
    console.error('[dispatchQueue] claim_dispatch_items falhou:', error.message);
    return [];
  }
  return (data || []) as QueueItem[];
}

/** Devolve o contato à fila sem consumir tentativa (chip indisponível, etc.). */
export async function releaseItem(id: string): Promise<void> {
  if (isPlaceholderEnv()) {
    const it = (global.__aiviq_queue || []).find((i) => i.id === id);
    if (it && it.status === 'processando') it.status = 'pendente';
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  await ctx.db
    .from('dispatch_queue')
    .update({ status: 'pendente', claimed_at: null })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id);
}

/** Devolve à fila contatos presos em 'processando' (worker que morreu no meio). */
export async function reapStaleClaims(): Promise<number> {
  if (isPlaceholderEnv()) return 0;
  const ctx = await getServiceContext();
  if (!ctx) return 0;
  const { data, error } = await ctx.db.rpc('reap_stale_dispatch_claims', {
    p_org: ctx.organizationId,
  });
  if (error) return 0;
  return typeof data === 'number' ? data : 0;
}

export async function markItemSent(id: string, instanceName: string): Promise<void> {
  if (isPlaceholderEnv()) {
    const it = (global.__aiviq_queue || []).find((i) => i.id === id);
    if (it) it.status = 'enviado';
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  await ctx.db
    .from('dispatch_queue')
    .update({ status: 'enviado', sent_at: new Date().toISOString(), instance_name: instanceName })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id);
}

/** Incrementa tentativas; marca 'erro' após 3 falhas. Retorna se falhou de vez. */
export async function markItemError(
  id: string,
  attempts: number,
  err: string,
  instanceName?: string
): Promise<{ failed: boolean }> {
  const failed = attempts + 1 >= 3;
  if (isPlaceholderEnv()) {
    const it = (global.__aiviq_queue || []).find((i) => i.id === id);
    if (it) { it.attempts = attempts + 1; if (failed) it.status = 'erro'; }
    return { failed };
  }
  const ctx = await getServiceContext();
  if (!ctx) return { failed };
  await ctx.db
    .from('dispatch_queue')
    .update({
      attempts: attempts + 1,
      error: err.slice(0, 300),
      status: failed ? 'erro' : 'pendente',
      // Registra em QUAL chip a falha aconteceu -- antes so o sucesso gravava
      // isso, entao a auditoria de falhas nao sabia dizer qual numero falhou.
      ...(instanceName ? { instance_name: instanceName } : {}),
      claimed_at: null,
    })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id);
  return { failed };
}

export interface FailedQueueItem {
  id: string;
  phone: string;
  name?: string;
  bairro?: string;
  error?: string;
  attempts: number;
  instanceName?: string;
  createdAt?: string;
}

export async function getFailedItems(limit = 100): Promise<FailedQueueItem[]> {
  if (isPlaceholderEnv()) {
    return (global.__aiviq_queue || [])
      .filter((i) => i.status === 'erro')
      .slice(0, limit)
      .map((i) => ({
        id: i.id,
        phone: i.phone,
        name: i.name,
        bairro: i.bairro,
        error: 'Falha no envio WhatsApp',
        attempts: i.attempts,
      }));
  }
  const ctx = await getServiceContext();
  if (!ctx) return [];
  const { data } = await ctx.db
    .from('dispatch_queue')
    .select('id, phone, name, bairro, error, attempts, instance_name, created_at')
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'erro')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).map((r: any) => ({
    id: r.id,
    phone: r.phone,
    name: r.name,
    bairro: r.bairro,
    error: r.error || 'Falha de entrega no WhatsApp',
    instanceName: r.instance_name || undefined,
    attempts: r.attempts || 1,
    createdAt: r.created_at,
  }));
}

export async function requeueFailedItems(): Promise<number> {
  if (isPlaceholderEnv()) {
    let count = 0;
    (global.__aiviq_queue || []).forEach((i) => {
      if (i.status === 'erro') {
        i.status = 'pendente';
        i.attempts = 0;
        count++;
      }
    });
    return count;
  }
  const ctx = await getServiceContext();
  if (!ctx) return 0;
  const { data } = await ctx.db
    .from('dispatch_queue')
    // Preserva o texto do erro anterior: zerar apagava o historico da auditoria.
    .update({ status: 'pendente', attempts: 0, claimed_at: null })
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'erro')
    .select('id');

  return data?.length || 0;
}


// -------------------- POOL DE DISPARO (quais chips entram no rodizio) --------------------
// Diferente do "ATIVO" da tela de Configuracoes: aquele e um radio de
// VISUALIZACAO (qual numero o Inbox/Contatos mostram), vive no localStorage do
// navegador e nunca chegou ao motor de disparo. Este flag e por organizacao,
// fica no servidor e e MULTIPLO: decide quais chips conectados participam da
// campanha. Default true, para que um chip recem-conectado ja entre no cluster.

declare global {
  // eslint-disable-next-line no-var
  var __aiviq_dispatch_pool: Record<string, boolean> | undefined;
}
if (!global.__aiviq_dispatch_pool) global.__aiviq_dispatch_pool = {};

/** Mapa instancia -> participa do disparo. Ausente = true (default). */
export async function getDispatchPool(): Promise<Record<string, boolean>> {
  if (isPlaceholderEnv()) return { ...global.__aiviq_dispatch_pool! };
  const ctx = await getServiceContext();
  if (!ctx) return {};
  const { data, error } = await ctx.db
    .from('dispatch_instance_control')
    .select('instance_name, dispatch_enabled')
    .eq('organization_id', ctx.organizationId);
  if (error) return {};
  const out: Record<string, boolean> = {};
  for (const r of data || []) out[(r as any).instance_name] = (r as any).dispatch_enabled !== false;
  return out;
}

/** Liga/desliga uma instancia no cluster de disparo. */
export async function setDispatchEnabled(instance: string, enabled: boolean): Promise<void> {
  if (isPlaceholderEnv()) {
    global.__aiviq_dispatch_pool![instance] = enabled;
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  await ctx.db.from('dispatch_instance_control').upsert(
    {
      organization_id: ctx.organizationId,
      instance_name: instance,
      dispatch_enabled: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,instance_name' }
  );
}

/** Filtra uma lista de instancias conectadas, mantendo so as do pool de disparo. */
export async function filterDispatchPool(instances: string[]): Promise<string[]> {
  if (instances.length === 0) return [];
  const pool = await getDispatchPool();
  return instances.filter((i) => pool[i] !== false); // ausente = participa
}

/**
 * Disputa ATOMICA do ritmo de um chip: avanca next_allowed_at em `gapSeconds`
 * e devolve true SO para quem venceu a disputa. Os ticks concorrentes que
 * perderem saem sem enviar.
 *
 * Substitui o par getInstanceNextAllowedAt()+setInstanceNextAllowedAt(), que era
 * ler-depois-gravar: dois ticks liam o mesmo horario vencido, os dois passavam,
 * e o MESMO chip mandava duas mensagens no mesmo segundo.
 */
export async function claimInstanceSlot(instance: string, gapSeconds: number): Promise<boolean> {
  if (isPlaceholderEnv()) {
    const agora = Date.now();
    const prox = global.__aiviq_inst_next![instance] || 0;
    if (prox && agora < prox) return false;
    global.__aiviq_inst_next![instance] = agora + gapSeconds * 1000;
    return true;
  }
  const ctx = await getServiceContext();
  if (!ctx) return false;
  const { data, error } = await ctx.db.rpc('claim_instance_slot', {
    p_org: ctx.organizationId,
    p_instance: instance,
    p_gap_seconds: gapSeconds,
  });
  if (error) {
    console.error('[dispatchQueue] claim_instance_slot falhou:', error.message);
    // Sem confirmacao, nao envia: erra para o lado de proteger o chip.
    return false;
  }
  return data === true;
}
