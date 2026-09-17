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
  status: 'pendente' | 'enviado' | 'erro';
  attempts: number;
}

export interface QueueStatus {
  total: number;
  enviados: number;
  erros: number;
  pendentes: number;
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
export async function enqueueContacts(
  contatos: Array<{ name?: string; phone: string; bairro?: string }>
): Promise<{ enfileirados: number; ignorados: number }> {
  const limpos = contatos
    .map((c) => ({ name: (c.name || '').trim(), phone: canonicalDigits(c.phone), bairro: c.bairro || 'Mato Grosso do Sul' }))
    .filter((c) => c.phone && c.phone.length >= 10);

  // Dedup no lote.
  const seen = new Set<string>();
  const unicos = limpos.filter((c) => (seen.has(c.phone) ? false : (seen.add(c.phone), true)));

  if (isPlaceholderEnv()) {
    const q = global.__aiviq_queue!;
    const jaPendente = new Set(q.filter((i) => i.status === 'pendente').map((i) => i.phone));
    let n = 0;
    for (const c of unicos) {
      if (jaPendente.has(c.phone)) continue;
      q.push({ id: `q-${Date.now()}-${n}`, phone: c.phone, name: c.name, bairro: c.bairro, status: 'pendente', attempts: 0 });
      n++;
    }
    return { enfileirados: n, ignorados: unicos.length - n };
  }

  const ctx = await getServiceContext();
  if (!ctx) return { enfileirados: 0, ignorados: 0 };

  // Pula quem já está pendente na fila.
  const { data: pend } = await ctx.db
    .from('dispatch_queue')
    .select('phone')
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'pendente');
  const jaPendente = new Set((pend || []).map((r: any) => r.phone));
  const rows = unicos
    .filter((c) => !jaPendente.has(c.phone))
    .map((c) => ({ organization_id: ctx.organizationId, phone: c.phone, name: c.name, bairro: c.bairro, status: 'pendente' }));

  if (rows.length > 0) {
    // Insere em lotes de 500 (limite de payload).
    for (let i = 0; i < rows.length; i += 500) {
      await ctx.db.from('dispatch_queue').insert(rows.slice(i, i + 500));
    }
    // Ao enfileirar, garante que não está pausado e libera o próximo envio.
    await setPaused(false);
  }
  return { enfileirados: rows.length, ignorados: unicos.length - rows.length };
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
  await ctx.db.from('dispatch_queue').delete().eq('organization_id', ctx.organizationId).eq('status', 'pendente');
}

// -------------------- STATUS (para a UI) --------------------
export async function getQueueStatus(): Promise<QueueStatus> {
  if (isPlaceholderEnv()) {
    const q = global.__aiviq_queue!;
    const enviados = q.filter((i) => i.status === 'enviado').length;
    const erros = q.filter((i) => i.status === 'erro').length;
    const pendentes = q.filter((i) => i.status === 'pendente').length;
    const ctrl = global.__aiviq_queue_ctrl!;
    return {
      total: q.length, enviados, erros, pendentes,
      pausado: ctrl.paused, ativo: pendentes > 0 && !ctrl.paused,
      segundosRestantesProximo: secsUntil(ctrl.nextAllowedAt),
    };
  }
  const ctx = await getServiceContext();
  if (!ctx) return { total: 0, enviados: 0, erros: 0, pendentes: 0, pausado: false, ativo: false, segundosRestantesProximo: 0 };

  const counts: Record<string, number> = { pendente: 0, enviado: 0, erro: 0 };
  // Conta por status (3 queries baratas por índice, evita puxar linhas).
  for (const s of ['pendente', 'enviado', 'erro'] as const) {
    const { count } = await ctx.db
      .from('dispatch_queue')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('status', s);
    counts[s] = count || 0;
  }
  const { data: ctrl } = await ctx.db
    .from('dispatch_control')
    .select('paused, next_allowed_at')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  const paused = Boolean(ctrl?.paused);
  const nextMs = ctrl?.next_allowed_at ? new Date(ctrl.next_allowed_at).getTime() : 0;
  return {
    total: counts.pendente + counts.enviado + counts.erro,
    enviados: counts.enviado,
    erros: counts.erro,
    pendentes: counts.pendente,
    pausado: paused,
    ativo: counts.pendente > 0 && !paused,
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

export async function nextPendingItem(): Promise<QueueItem | null> {
  if (isPlaceholderEnv()) {
    return (global.__aiviq_queue || []).find((i) => i.status === 'pendente') || null;
  }
  const ctx = await getServiceContext();
  if (!ctx) return null;
  const { data } = await ctx.db
    .from('dispatch_queue')
    .select('id, phone, name, bairro, status, attempts')
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'pendente')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? (data as QueueItem) : null;
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
export async function markItemError(id: string, attempts: number, err: string): Promise<{ failed: boolean }> {
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
    .update({ attempts: attempts + 1, error: err.slice(0, 300), status: failed ? 'erro' : 'pendente' })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id);
  return { failed };
}
