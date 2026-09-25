import { getServiceContext, isPlaceholderEnv } from '@/lib/supabase/authContext';
import { canonicalDigits } from '@/lib/conversationRepo';
import { getConnectedDispatchInstances } from '@/lib/evolutionService';

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
  /** Ja deram erro definitivo (3 tentativas) antes e foram bloqueados -- banco de erros. */
  jaErrados: number;
  /** Quantos contatos couberam a cada chip (divisao previa da lista). */
  divisaoPorChip: Record<string, number>;
  /** Pulados por terem pedido opt-out. */
  optOut: number;
}

/**
 * Enfileira contatos. Por padrao PULA quem ja recebeu a abordagem (status
 * 'enviado'): reimportar a mesma planilha e o jeito mais facil de mandar a
 * mesma mensagem duas vezes para a mesma pessoa -- ruim para o eleitor e um
 * sinal classico de spam para a Meta. Passe `permitirReenvio` para forcar.
 *
 * Tambem PULA SEMPRE -- mesmo com `permitirReenvio` -- quem ja esgotou as 3
 * tentativas e esta no banco de erros (status 'erro'): numero sem WhatsApp
 * ou que rejeitou a mensagem continua sem WhatsApp na proxima importacao, e
 * insistir e o que realmente arrisca o numero levar um ban. Quem tem
 * status_definitivo=true (banco de erros pos-migration 021) fica bloqueado
 * para sempre, nem o botao "Tentar Novamente" da auditoria reativa; so os
 * poucos 'erro' antigos (de antes da 021, sem a marcacao) ainda voltam por
 * ali, 1 a 1, depois do operador checar o motivo.
 */
export async function enqueueContacts(
  contatos: Array<{ name?: string; phone: string; bairro?: string }>,
  opts: { permitirReenvio?: boolean; chips?: string[] } = {}
): Promise<EnqueueResult> {
  const permitirReenvio = opts.permitirReenvio === true;
  // Chips que vao dividir a lista. Vazio = sem carimbo (o claim decide na hora).
  const chips = Array.isArray(opts.chips) ? opts.chips.filter(Boolean) : [];
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
    const errados = new Set(q.filter((i) => i.status === 'erro').map((i) => i.phone));
    let n = 0;
    let ja = 0;
    let jaErrou = 0;
    for (const c of unicos) {
      if (naFila.has(c.phone)) continue;
      if (errados.has(c.phone)) { jaErrou++; continue; }
      if (!permitirReenvio && enviados.has(c.phone)) { ja++; continue; }
      q.push({ id: `q-${Date.now()}-${n}`, phone: c.phone, name: c.name, bairro: c.bairro, status: 'pendente', attempts: 0 });
      n++;
    }
    return { enfileirados: n, ignorados: unicos.length - n - ja - jaErrou, jaEnviados: ja, jaErrados: jaErrou, divisaoPorChip: {}, optOut: 0 };
  }

  const ctx = await getServiceContext();
  if (!ctx) return { enfileirados: 0, ignorados: 0, jaEnviados: 0, jaErrados: 0, divisaoPorChip: {}, optOut: 0 };

  // Ja na fila (pendente/processando) -> pula sempre.
  const { data: pend } = await ctx.db
    .from('dispatch_queue')
    .select('phone')
    .eq('organization_id', ctx.organizationId)
    .in('status', ['pendente', 'processando']);
  const naFila = new Set((pend || []).map((r: any) => r.phone));

  // Quem pediu para sair NUNCA volta para a fila, nem com permitirReenvio.
  const optOut = await getOptOutSet();
  let puladosOptOut = 0;

  // Banco de erros: quem ja esgotou 3 tentativas -> pula SEMPRE, mesmo com
  // permitirReenvio (esse flag e para reabordar quem JA RECEBEU a mensagem
  // numa nova onda, nao para insistir em numero que comprovadamente falhou).
  const { data: err } = await ctx.db
    .from('dispatch_queue')
    .select('phone')
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'erro');
  const jaErrados = new Set((err || []).map((r: any) => r.phone));
  let puladosPorErro = 0;

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
      if (optOut.has(c.phone)) { puladosOptOut++; return false; }
      if (jaErrados.has(c.phone)) { puladosPorErro++; return false; }
      if (jaEnviados.has(c.phone)) { puladosPorEnvio++; return false; }
      return true;
    })
    .map((c, idx) => ({
      organization_id: ctx.organizationId,
      phone: c.phone,
      name: c.name,
      bairro: c.bairro,
      status: 'pendente',
      // Divisao previa da lista: round-robin sobre os chips do pool. O contato
      // ja entra carimbado com quem vai aborda-lo, em vez de sortear o chip no
      // instante do envio.
      assigned_instance: chips.length > 0 ? chips[idx % chips.length] : null,
    }));

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
  // Quanto coube a cada chip, para a tela mostrar a divisao da lista.
  const divisaoPorChip: Record<string, number> = {};
  for (const r of rows) {
    const chip = (r as any).assigned_instance;
    if (chip) divisaoPorChip[chip] = (divisaoPorChip[chip] || 0) + 1;
  }

  return {
    enfileirados: inseridos,
    ignorados: unicos.length - rows.length - puladosPorEnvio - puladosPorErro - puladosOptOut + colisoes,
    jaEnviados: puladosPorEnvio,
    jaErrados: puladosPorErro,
    divisaoPorChip,
    optOut: puladosOptOut,
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

// -------------------- LOTE ATUAL (para a UI) --------------------
// O banner da fila e o KPI de falhas mostram o que ESTA sendo executado, nao o
// historico inteiro da tabela. "Lote atual" = tudo o que foi enfileirado a
// partir do contato pendente mais antigo. Sem pendentes (lote terminou), vale
// o ultimo lote: o que foi enfileirado no mesmo dia do contato mais recente.
async function inicioLoteAtual(ctx: NonNullable<Awaited<ReturnType<typeof getServiceContext>>>): Promise<string | null> {
  const { data: pend } = await ctx.db
    .from('dispatch_queue')
    .select('created_at')
    .eq('organization_id', ctx.organizationId)
    .in('status', ['pendente', 'processando'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pend?.created_at) return pend.created_at as string;

  const { data: ult } = await ctx.db
    .from('dispatch_queue')
    .select('created_at')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ult?.created_at) return null;
  // Inicio do dia (fuso MS, UTC-4) do contato mais recente.
  const dia = new Date(new Date(ult.created_at as string).getTime() - 4 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return `${dia}T00:00:00-04:00`;
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
  const inicio = await inicioLoteAtual(ctx);
  // Conta por status (queries baratas por índice, evita puxar linhas), só do lote atual.
  for (const s of ['pendente', 'processando', 'enviado', 'erro'] as const) {
    let q = ctx.db
      .from('dispatch_queue')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('status', s);
    if (inicio) q = q.gte('created_at', inicio);
    const { count } = await q;
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

export async function markItemSent(
  id: string,
  instanceName: string,
  messageId?: string
): Promise<void> {
  if (isPlaceholderEnv()) {
    const it = (global.__aiviq_queue || []).find((i) => i.id === id);
    if (it) it.status = 'enviado';
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  await ctx.db
    .from('dispatch_queue')
    .update({
      status: 'enviado',
      sent_at: new Date().toISOString(),
      instance_name: instanceName,
      // Guarda o id da mensagem para que o ack de entrega -- que chega depois,
      // de forma assincrona, pelo MESSAGES_UPDATE -- consiga encontrar este
      // contato de volta e devolve-lo a fila se a entrega for recusada.
      message_id: messageId || null,
    })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id);
}

// Erros PERMANENTES: o numero nao existe no WhatsApp (a Evolution devolve
// "exists":false ao consultar o JID antes de enviar). Tentar de novo nunca
// muda o resultado -- a 2a e a 3a tentativa dao o mesmo erro sempre. Sem essa
// distincao, cada numero invalido gastava 3 tentativas (e 3 falhas) a toa,
// inclusive contando contra o cooldown de falhas seguidas do CHIP, que nao
// tem culpa nenhuma do numero nao existir.
const PADROES_ERRO_PERMANENTE = [/"exists"\s*:\s*false/i, /numero.{0,20}n[aã]o existe/i, /invalid.{0,10}number/i];

export function ehErroPermanente(err: string): boolean {
  return PADROES_ERRO_PERMANENTE.some((re) => re.test(err));
}

/** Incrementa tentativas; marca 'erro' após 3 falhas (ou na 1ª, se for erro permanente). Retorna se falhou de vez. */
export async function markItemError(
  id: string,
  attempts: number,
  err: string,
  instanceName?: string
): Promise<{ failed: boolean }> {
  const permanente = ehErroPermanente(err);
  const failed = permanente || attempts + 1 >= 3;
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
      // Falha definitiva: 3ª tentativa esgotada, OU 1ª tentativa com erro
      // permanente (numero nao existe -- nao ha 2ª/3ª tentativa que resolva).
      status_definitivo: failed || undefined,
      // Registra em QUAL chip a falha aconteceu -- antes so o sucesso gravava
      // isso, entao a auditoria de falhas nao sabia dizer qual numero falhou.
      ...(instanceName ? { instance_name: instanceName } : {}),
      claimed_at: null,
    })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id);
  return { failed };
}

/**
 * Verifica se o telefone ja esta no banco de erros (3 tentativas esgotadas,
 * ou 1a tentativa com erro permanente -- ver markItemError). Usado pelo
 * disparo INDIVIDUAL para bloquear com a MESMA regra do reimport em massa --
 * mesmo que nunca tenha existido uma sessao de pesquisa para esse numero
 * (ela so nasce em envio com sucesso).
 */
export async function getDispatchErrorForPhone(
  phoneRaw: string
): Promise<{ error?: string; attempts: number } | null> {
  const phone = canonicalDigits(phoneRaw);
  if (isPlaceholderEnv()) {
    const it = (global.__aiviq_queue || []).find((i) => i.phone === phone && i.status === 'erro');
    return it ? { attempts: it.attempts } : null;
  }
  const ctx = await getServiceContext();
  if (!ctx) return null;
  let { data } = await ctx.db
    .from('dispatch_queue')
    .select('error, attempts')
    .eq('organization_id', ctx.organizationId)
    .eq('phone', phone)
    .eq('status', 'erro')
    .maybeSingle();
  if (!data && phone.length >= 8) {
    const sufixo = phone.slice(-8);
    const res = await ctx.db
      .from('dispatch_queue')
      .select('error, attempts')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'erro')
      .ilike('phone', `%${sufixo}`)
      .limit(1)
      .maybeSingle();
    data = res.data;
  }
  return data ? { error: (data as any).error || undefined, attempts: (data as any).attempts || 0 } : null;
}

/**
 * Telefones (digitos canonicos) que tentaram e NAO tem nenhum envio
 * confirmado -- so falhas (erro/status_definitivo). Usado para tirar do
 * funil da pesquisa contatos que nunca receberam a Msg 1 de verdade, mesmo
 * que uma sessao tenha chegado a existir para eles.
 */
export async function getTelefonesComFalhaSemEnvio(): Promise<Set<string>> {
  if (isPlaceholderEnv()) return new Set();
  const ctx = await getServiceContext();
  if (!ctx) return new Set();
  const [comErro, comEnvio] = await Promise.all([
    ctx.db.from('dispatch_queue').select('phone').eq('organization_id', ctx.organizationId).eq('status', 'erro'),
    ctx.db.from('dispatch_queue').select('phone').eq('organization_id', ctx.organizationId).eq('status', 'enviado'),
  ]);
  // Um telefone com pelo menos 1 envio confirmado NUNCA e excluido, mesmo que
  // outra tentativa dele tenha falhado (retry apos reconexao, por exemplo).
  const enviados = new Set((comEnvio.data || []).map((r: any) => canonicalDigits(r.phone)));
  const semEnvio = new Set<string>();
  for (const r of comErro.data || []) {
    const tel = canonicalDigits(r.phone);
    if (!enviados.has(tel)) semEnvio.add(tel);
  }
  return semEnvio;
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
  /** 'erro' = ja desistiu (3 tentativas, ou 1a com erro permanente); 'pendente'
   *  = ja falhou ao menos 1x e segue em retentativa automatica. Antes o
   *  segundo grupo nao aparecia na auditoria nem no KPI -- so virava visivel
   *  na 3a tentativa, entao uma falha real podia ficar 1-2 ciclos "invisivel"
   *  mesmo com o motivo do erro ja gravado no banco. */
  status: 'erro' | 'pendente';
  /** true = banco de erros (status_definitivo): bloqueado para sempre, nem
   *  "Tentar Novamente" reativa. false com status 'erro' = falha registrada
   *  antes da migration 021 (sem a marcacao), ainda reativavel manualmente. */
  definitivo: boolean;
}

export async function getFailedItems(limit = 100): Promise<FailedQueueItem[]> {
  if (isPlaceholderEnv()) {
    return (global.__aiviq_queue || [])
      .filter((i) => i.status === 'erro' || (i.status === 'pendente' && i.attempts > 0))
      .slice(0, limit)
      .map((i) => ({
        id: i.id,
        phone: i.phone,
        name: i.name,
        bairro: i.bairro,
        error: 'Falha no envio WhatsApp',
        attempts: i.attempts,
        status: i.status as 'erro' | 'pendente',
        definitivo: i.status === 'erro',
      }));
  }
  const ctx = await getServiceContext();
  if (!ctx) return [];
  const inicio = await inicioLoteAtual(ctx);
  let q = ctx.db
    .from('dispatch_queue')
    .select('id, phone, name, bairro, error, attempts, status, status_definitivo, instance_name, created_at')
    .eq('organization_id', ctx.organizationId)
    // Inclui tanto quem ja desistiu (3 tentativas ou erro permanente, 'erro')
    // quanto quem ja falhou ao menos 1x e segue 'pendente' aguardando a
    // proxima retentativa.
    .or('status.eq.erro,and(status.eq.pendente,attempts.gt.0)');
  if (inicio) q = q.gte('created_at', inicio);
  const { data } = await q
    .order('attempts', { ascending: false })
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
    status: r.status,
    // Linhas 'erro' de antes da migration 021 nao tem status_definitivo
    // marcado (fica null/false) -- essas ainda dao para reativar; as novas
    // ja nascem com a marcacao junto do status em markItemError.
    definitivo: r.status === 'erro' && r.status_definitivo !== false,
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
  // Requeue ignora os contatos marcados como definitivos (falharam para sempre).
  // Só recoloca na fila os erros temporarios (ainda tem tentativas).
  const { data } = await ctx.db
    .from('dispatch_queue')
    .update({ status: 'pendente', attempts: 0, claimed_at: null })
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'erro')
    .eq('status_definitivo', false)
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

/** Liga/desliga uma instancia no cluster de disparo. Ao ligar, limpa cooldowns e zera o ritmo para que o chip fique pronto imediatamente. */
export async function setDispatchEnabled(instance: string, enabled: boolean): Promise<void> {
  if (isPlaceholderEnv()) {
    global.__aiviq_dispatch_pool![instance] = enabled;
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  const payload: Record<string, any> = {
    organization_id: ctx.organizationId,
    instance_name: instance,
    dispatch_enabled: enabled,
    updated_at: new Date().toISOString(),
  };
  if (enabled) {
    payload.next_allowed_at = null;
    payload.cooldown_ate = null;
    payload.cooldown_motivo = null;
    payload.falhas_seguidas = 0;
    payload.acks_erro_seguidos = 0;
  }
  await ctx.db.from('dispatch_instance_control').upsert(
    payload,
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
 * Prepara TODOS os dispositivos conectados para trabalharem SIMULTANEAMENTE:
 * 1. Ativa todos os chips conectados no pool de disparo (dispatch_enabled = true).
 * 2. Zera cooldowns, contadores de falha e o relógio de cada chip (next_allowed_at = null).
 * 3. Re-enfileira os contatos com falha (status = 'erro').
 * 4. Re-enfileira os contatos que ficaram com 'enviado' mas sofreram erro na Evolution (ex.: Novovivo, thome).
 * 5. Divide e redistribui uniformemente a fila de pendentes entre todas as instâncias conectadas.
 * 6. Zera a pausa e o relógio global para início imediato e simultâneo.
 */
export async function prepararDisparoSimultaneo(): Promise<{
  instanciasAtivadas: string[];
  reativadosErros: number;
  recuperadosNaoEntregues: number;
  redistribuidos: number;
}> {
  if (isPlaceholderEnv()) {
    return { instanciasAtivadas: [], reativadosErros: 0, recuperadosNaoEntregues: 0, redistribuidos: 0 };
  }
  const ctx = await getServiceContext();
  if (!ctx) return { instanciasAtivadas: [], reativadosErros: 0, recuperadosNaoEntregues: 0, redistribuidos: 0 };

  // 1. Instâncias conectadas agora
  const conectadas = await getConnectedDispatchInstances();

  // 2. Garante que TODAS as conectadas estejam ativas no pool e prontas para disparar juntas
  for (const inst of conectadas) {
    await ctx.db.from('dispatch_instance_control').upsert(
      {
        organization_id: ctx.organizationId,
        instance_name: inst,
        dispatch_enabled: true,
        next_allowed_at: null,
        cooldown_ate: null,
        cooldown_motivo: null,
        falhas_seguidas: 0,
        acks_erro_seguidos: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,instance_name' }
    );
  }

  // 2.1 Desativa do pool qualquer instância no banco que não esteja mais conectada
  const { data: dbInsts } = await ctx.db
    .from('dispatch_instance_control')
    .select('instance_name')
    .eq('organization_id', ctx.organizationId);
  
  const conhecidas = Array.from(new Set([
    ...(dbInsts || []).map((r: any) => r.instance_name),
    'thome', 'paloma', 'Novovivo', 'Paloma', 'aiviq_inbox_01'
  ]));
  const desconectadas = conhecidas.filter((i) => !conectadas.includes(i));
  for (const disc of desconectadas) {
    await ctx.db.from('dispatch_instance_control').upsert(
      {
        organization_id: ctx.organizationId,
        instance_name: disc,
        dispatch_enabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,instance_name' }
    );
  }

  // 2.2 Se houver instâncias desconectadas, libera seus contatos pendentes para que os chips ativos os assumam
  if (desconectadas.length > 0) {
    await ctx.db
      .from('dispatch_queue')
      .update({ assigned_instance: null })
      .in('assigned_instance', desconectadas)
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'pendente');

    await ctx.db
      .from('pesquisa_senado_fila')
      .update({ instancia_alocada: null })
      .in('instancia_alocada', desconectadas)
      .eq('status', 'pendente');
  }

  // 3. Re-enfileira os contatos que estavam com status 'erro'
  const { data: erros } = await ctx.db
    .from('dispatch_queue')
    .update({ status: 'pendente', attempts: 0, claimed_at: null, error: null })
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'erro')
    .select('id');

  // 4. Re-enfileira os contatos que ficaram como 'enviado' pelas instâncias
  //    que tiveram recusa/erro de entrega Baileys e não foram abordados
  const { data: falsos } = await ctx.db
    .from('dispatch_queue')
    .update({
      status: 'pendente',
      attempts: 0,
      sent_at: null,
      instance_name: null,
      message_id: null,
      claimed_at: null,
      error: null,
    })
    .eq('organization_id', ctx.organizationId)
    .in('instance_name', ['Novovivo', 'thome'])
    .eq('status', 'enviado')
    .select('id');

  // 5. Redistribui todos os pendentes de maneira equilibrada entre os chips conectados
  let totalRedistribuidos = 0;
  if (conectadas.length > 0) {
    const { data: pendentes } = await ctx.db
      .from('dispatch_queue')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'pendente')
      .order('created_at', { ascending: true })
      .limit(10000);

    if (pendentes && pendentes.length > 0) {
      for (let i = 0; i < conectadas.length; i++) {
        const inst = conectadas[i];
        const ids = pendentes
          .filter((_, idx) => idx % conectadas.length === i)
          .map((p: any) => p.id);

        for (let c = 0; c < ids.length; c += 200) {
          const chunk = ids.slice(c, c + 200);
          await ctx.db
            .from('dispatch_queue')
            .update({ assigned_instance: inst })
            .in('id', chunk);
        }
      }
      totalRedistribuidos = pendentes.length;
    }
  }

  // 6. Reset no relógio do disparo para começar imediatamente
  await ctx.db.from('dispatch_control').upsert(
    {
      organization_id: ctx.organizationId,
      paused: false,
      next_allowed_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  );

  return {
    instanciasAtivadas: conectadas,
    reativadosErros: erros?.length || 0,
    recuperadosNaoEntregues: falsos?.length || 0,
    redistribuidos: totalRedistribuidos,
  };
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

/**
 * Claim da sub-lista DE UM CHIP. Prioriza os contatos carimbados para ele na
 * importacao; se a sub-lista dele acabou (ou se um chip caiu e deixou orfaos),
 * puxa contatos sem carimbo ou carimbados para chips que nao estao mais vivos.
 *
 * `live` = chips atualmente conectados e no pool. E o que distingue "orfao de
 * chip caido" (pode redistribuir) de "reservado para um chip que esta de pe"
 * (nao toca).
 */
export async function claimPendingItemsForInstance(
  instance: string,
  count: number,
  live: string[]
): Promise<QueueItem[]> {
  if (count <= 0) return [];
  if (isPlaceholderEnv()) {
    const fila = global.__aiviq_queue || [];
    const meus = fila.filter(
      (i) => i.status === 'pendente' && (i as any).assignedInstance === instance
    );
    const orfaos = fila.filter(
      (i) =>
        i.status === 'pendente' &&
        (!(i as any).assignedInstance || !live.includes((i as any).assignedInstance))
    );
    const itens = [...meus, ...orfaos].slice(0, count);
    itens.forEach((i) => {
      i.status = 'processando';
      (i as any).assignedInstance = instance;
    });
    return itens;
  }
  const ctx = await getServiceContext();
  if (!ctx) return [];
  const { data, error } = await ctx.db.rpc('claim_dispatch_items_for_instance', {
    p_org: ctx.organizationId,
    p_instance: instance,
    p_limit: count,
    p_live: live,
  });
  if (error) {
    console.error('[dispatchQueue] claim_dispatch_items_for_instance falhou:', error.message);
    return [];
  }
  return (data || []) as QueueItem[];
}

export interface ProgressoChip {
  instancia: string;
  pendentes: number;
  enviados: number;
  erros: number;
}

/** Progresso por chip no LOTE ATUAL: quanto da sub-lista de cada um ja saiu. */
export async function getProgressoPorChip(): Promise<ProgressoChip[]> {
  if (isPlaceholderEnv()) return [];
  const ctx = await getServiceContext();
  if (!ctx) return [];
  const inicio = await inicioLoteAtual(ctx);
  let q = ctx.db
    .from('dispatch_queue')
    .select('assigned_instance, instance_name, status')
    .eq('organization_id', ctx.organizationId);
  if (inicio) q = q.gte('created_at', inicio);
  const { data, error } = await q;
  if (error || !data) return [];

  const mapa = new Map<string, ProgressoChip>();
  for (const r of data as any[]) {
    // Pendente conta pelo carimbo; enviado/erro contam pelo chip que de fato
    // tentou (podem divergir quando houve redistribuicao).
    const chip =
      r.status === 'pendente' || r.status === 'processando'
        ? r.assigned_instance
        : r.instance_name || r.assigned_instance;
    if (!chip) continue;
    if (!mapa.has(chip)) mapa.set(chip, { instancia: chip, pendentes: 0, enviados: 0, erros: 0 });
    const alvo = mapa.get(chip)!;
    if (r.status === 'pendente' || r.status === 'processando') alvo.pendentes++;
    else if (r.status === 'enviado') alvo.enviados++;
    else if (r.status === 'erro') alvo.erros++;
  }
  return Array.from(mapa.values()).sort((a, b) => a.instancia.localeCompare(b.instancia));
}

// ==================== SAUDE DO CHIP ====================
// Pausa por lote e circuit breaker por falhas seguidas. O gatilho de falhas e o
// que o healthcheck de conexao nao pega: uma sequencia de recusas costuma
// aparecer ANTES de a instancia cair, e e o sinal precoce de shadowban.

export interface ResultadoChip {
  falhasSeguidas: number;
  cooldownAte?: string;
  motivo?: string;
}

export async function registrarResultadoChip(
  instance: string,
  sucesso: boolean,
  cfg: {
    maxFalhas: number;
    cooldownMin: number;
    loteTamanho: number;
    pausaLoteMin: number;
  }
): Promise<ResultadoChip | null> {
  if (isPlaceholderEnv()) return null;
  const ctx = await getServiceContext();
  if (!ctx) return null;
  const { data, error } = await ctx.db.rpc('registrar_resultado_chip', {
    p_org: ctx.organizationId,
    p_instance: instance,
    p_sucesso: sucesso,
    p_max_falhas: cfg.maxFalhas,
    p_cooldown_min: cfg.cooldownMin,
    p_lote_tamanho: cfg.loteTamanho,
    p_pausa_lote_min: cfg.pausaLoteMin,
  });
  if (error) {
    console.error('[dispatchQueue] registrar_resultado_chip falhou:', error.message);
    return null;
  }
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return null;
  return {
    falhasSeguidas: (linha as any).falhas_seguidas ?? 0,
    cooldownAte: (linha as any).cooldown_ate ?? undefined,
    motivo: (linha as any).cooldown_motivo ?? undefined,
  };
}

/** Chips em resfriamento agora (fora do pool ate cooldown_ate). */
export async function getChipsEmCooldown(): Promise<Record<string, { ate: string; motivo?: string }>> {
  if (isPlaceholderEnv()) return {};
  const ctx = await getServiceContext();
  if (!ctx) return {};
  const { data } = await ctx.db
    .from('dispatch_instance_control')
    .select('instance_name, cooldown_ate, cooldown_motivo')
    .eq('organization_id', ctx.organizationId)
    .gt('cooldown_ate', new Date().toISOString());
  const out: Record<string, { ate: string; motivo?: string }> = {};
  for (const r of (data || []) as any[]) {
    out[r.instance_name] = { ate: r.cooldown_ate, motivo: r.cooldown_motivo || undefined };
  }
  return out;
}

// ==================== OPT-OUT ====================
// Quem pede SAIR entra na lista e tem TODOS os disparos pendentes cancelados,
// em qualquer campanha da organizacao. Antes a sessao virava 'recusado' mas a
// linha seguia pendente na fila -- a pessoa seria reabordada depois de pedir
// para sair. Alem do problema legal, e o caminho mais curto para uma denuncia.

export async function registrarOptOut(
  phone: string,
  motivo?: string
): Promise<{ cancelados: number }> {
  const alvo = canonicalDigits(phone);
  if (!alvo) return { cancelados: 0 };

  if (isPlaceholderEnv()) {
    let n = 0;
    (global.__aiviq_queue || []).forEach((i) => {
      if (i.phone === alvo && (i.status === 'pendente' || i.status === 'processando')) {
        i.status = 'erro';
        n++;
      }
    });
    return { cancelados: n };
  }

  const ctx = await getServiceContext();
  if (!ctx) return { cancelados: 0 };

  await ctx.db
    .from('opt_out')
    .upsert(
      { organization_id: ctx.organizationId, phone: alvo, motivo: motivo || 'pediu para sair' },
      { onConflict: 'organization_id,phone' }
    );

  // Remove da fila em vez de marcar erro: nao e falha de entrega, e uma pessoa
  // que pediu para nao ser mais abordada -- nao deve voltar num re-enfileiramento.
  const { data } = await ctx.db
    .from('dispatch_queue')
    .delete()
    .eq('organization_id', ctx.organizationId)
    .eq('phone', alvo)
    .in('status', ['pendente', 'processando'])
    .select('id');

  return { cancelados: data?.length || 0 };
}

/** Telefones que pediram opt-out (para filtrar no enfileiramento). */
export async function getOptOutSet(): Promise<Set<string>> {
  if (isPlaceholderEnv()) return new Set();
  const ctx = await getServiceContext();
  if (!ctx) return new Set();
  const { data } = await ctx.db
    .from('opt_out')
    .select('phone')
    .eq('organization_id', ctx.organizationId);
  return new Set((data || []).map((r: any) => r.phone));
}

export interface MaturidadeChip {
  maturidade: 'novo' | 'maduro';
  warmupStartedOn?: string;
  cooldownAte?: string;
  cooldownMotivo?: string;
}

export async function getMaturidadeChips(): Promise<Record<string, MaturidadeChip>> {
  if (isPlaceholderEnv()) return {};
  const ctx = await getServiceContext();
  if (!ctx) return {};
  const { data } = await ctx.db
    .from('dispatch_instance_control')
    .select('instance_name, maturidade, warmup_started_on, cooldown_ate, cooldown_motivo')
    .eq('organization_id', ctx.organizationId);
  const out: Record<string, MaturidadeChip> = {};
  for (const r of (data || []) as any[]) {
    out[r.instance_name] = {
      maturidade: r.maturidade === 'maduro' ? 'maduro' : 'novo',
      warmupStartedOn: r.warmup_started_on || undefined,
      cooldownAte: r.cooldown_ate || undefined,
      cooldownMotivo: r.cooldown_motivo || undefined,
    };
  }
  return out;
}

/**
 * Declara a maturidade do chip. Ao marcar como 'novo', o warm-up passa a contar
 * a partir de hoje (a menos que ja tenha uma data), porque e quando o operador
 * esta dizendo "este numero comeca agora".
 */
export async function setMaturidadeChip(
  instance: string,
  maturidade: 'novo' | 'maduro'
): Promise<void> {
  if (isPlaceholderEnv()) return;
  const ctx = await getServiceContext();
  if (!ctx) return;
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: atual } = await ctx.db
    .from('dispatch_instance_control')
    .select('warmup_started_on')
    .eq('organization_id', ctx.organizationId)
    .eq('instance_name', instance)
    .maybeSingle();

  await ctx.db.from('dispatch_instance_control').upsert(
    {
      organization_id: ctx.organizationId,
      instance_name: instance,
      maturidade,
      warmup_started_on:
        maturidade === 'novo' ? (atual as any)?.warmup_started_on || hoje : (atual as any)?.warmup_started_on || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,instance_name' }
  );
}

/**
 * Libera manualmente um chip que esta em cooldown (RESFRIANDO / PAUSA DE
 * LOTE): zera o horario de resfriamento e os contadores de falha, sem mexer
 * no relogio normal de disparo (intervalo fixo continua valendo). O operador
 * usa isto quando confirma que a causa da pausa ja foi resolvida (proxy
 * corrigido, numero verificado etc.) e nao quer esperar os 90/180 min.
 */
export async function liberarCooldownChip(instance: string): Promise<void> {
  if (isPlaceholderEnv()) return;
  const ctx = await getServiceContext();
  if (!ctx) return;
  await ctx.db.from('dispatch_instance_control').upsert(
    {
      organization_id: ctx.organizationId,
      instance_name: instance,
      cooldown_ate: null,
      cooldown_motivo: null,
      falhas_seguidas: 0,
      acks_erro_seguidos: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,instance_name' }
  );
}

// ==================== ACK DE ENTREGA ====================
// A verdade sobre entrega nao esta no HTTP 200 do sendText -- esse so quer
// dizer "aceitei para enfileirar". Ela chega depois, de forma assincrona, no
// evento MESSAGES_UPDATE. Em 17/09 um chip passou 1h13 "disparando" com o
// painel verde e nada chegando, porque ninguem escutava esse evento.

/** Acks que significam que a mensagem chegou (ou passou) do servidor. */
const ACK_OK = ['SERVER_ACK', 'DELIVERY_ACK', 'READ', 'PLAYED'];
/** Acks que significam que a mensagem NAO foi entregue. */
const ACK_FALHA = ['ERROR', 'FAILED'];

export interface ResultadoAck {
  conhecido: boolean;
  entregue: boolean;
  /** Contato devolvido a fila porque a entrega foi recusada. */
  devolvido: boolean;
  acksErroSeguidos?: number;
  chipDesativado?: boolean;
}

/**
 * Processa um ack de entrega. Em caso de recusa:
 *   1. devolve o contato a fila (ele nao recebeu nada -- marcar como enviado
 *      seria queima-lo: nunca mais seria tentado);
 *   2. alimenta o circuit breaker por ack, que tira o chip do pool.
 */
export async function processarAckEntrega(
  instance: string,
  messageId: string,
  ack: string,
  cfg: { maxErros: number; cooldownMin: number }
): Promise<ResultadoAck> {
  const status = (ack || '').toUpperCase();
  const falhou = ACK_FALHA.includes(status);
  const ok = ACK_OK.includes(status);
  if (!falhou && !ok) return { conhecido: false, entregue: false, devolvido: false };

  if (isPlaceholderEnv()) return { conhecido: true, entregue: ok, devolvido: false };

  const ctx = await getServiceContext();
  if (!ctx) return { conhecido: true, entregue: ok, devolvido: false };

  let devolvido = false;

  if (falhou && messageId) {
    // Devolve o contato: nunca recebeu nada. Limpa o carimbo de chip para que
    // outra instancia o pegue -- insistir no mesmo chip repetiria a recusa.
    const { data } = await ctx.db
      .from('dispatch_queue')
      .update({
        status: 'pendente',
        attempts: 0,
        sent_at: null,
        instance_name: null,
        assigned_instance: null,
        message_id: null,
        claimed_at: null,
        error: null,
      })
      .eq('organization_id', ctx.organizationId)
      .eq('message_id', messageId)
      .eq('status', 'enviado')
      .select('id');
    // Também devolve na fila da pesquisa do senado caso o disparo tenha vindo dela
    try {
      await ctx.db
        .from('pesquisa_senado_fila')
        .update({
          status: 'pendente',
          tentativas: 0,
          instancia_alocada: null,
          erro_motivo: `recusa_ack_${status}`,
          abordado_em: null,
        })
        .eq('status', 'disparado')
        .filter('detalhes->>messageId', 'eq', messageId);
    } catch {}
    devolvido = (data?.length || 0) > 0;
  }

  const { data: saude } = await ctx.db.rpc('registrar_ack_chip', {
    p_org: ctx.organizationId,
    p_instance: instance,
    p_ok: ok,
    p_ack: status,
    p_max_erros: cfg.maxErros,
    p_cooldown_min: cfg.cooldownMin,
  });

  const linha = Array.isArray(saude) ? saude[0] : saude;
  const seguidos = (linha as any)?.acks_erro_seguidos ?? 0;
  const chipDesativado = falhou && seguidos >= cfg.maxErros;

  // Disjuntor imediato: se atingiu o teto de erros seguidos, desativa do pool
  // imediatamente para salvar o chip contra banimento pelo WhatsApp.
  if (chipDesativado) {
    try {
      await ctx.db
        .from('dispatch_instance_control')
        .update({
          dispatch_enabled: false,
          cooldown_ate: new Date(Date.now() + cfg.cooldownMin * 60 * 1000).toISOString(),
          cooldown_motivo: `circuit_breaker_${seguidos}_erros_consecutivos`,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', ctx.organizationId)
        .eq('instance_name', instance);

      // Libera contatos presos neste chip
      await ctx.db
        .from('pesquisa_senado_fila')
        .update({ instancia_alocada: null })
        .eq('instancia_alocada', instance)
        .eq('status', 'pendente');
    } catch {}
  }

  return {
    conhecido: true,
    entregue: ok,
    devolvido,
    acksErroSeguidos: seguidos,
    chipDesativado,
  };
}
