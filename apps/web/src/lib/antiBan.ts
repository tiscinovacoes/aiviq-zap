import { getServiceContext, isPlaceholderEnv } from '@/lib/supabase/authContext';
import { resolveInstanceName } from '@/lib/instanceRegistry';

// Spintax/opt-out são puros (sem deps de servidor) e ficam em lib/spintax.ts para
// poderem ser usados também no bundle do cliente. Reexportados aqui por conveniência.
export { spin, isOptOut } from '@/lib/spintax';

// ============================================================================
// Padrão anti-bloqueio de chip (perfil CONSERVADOR) para disparo em massa.
//   - Teto diário por chip com WARMUP crescente (chip novo manda pouco e sobe).
//   - Janela de horário comercial (fuso MS).
//   - Intervalo aleatório entre disparos (o relógio real é o cliente).
//   - Variação de texto (spintax) — leads diferentes recebem redações diferentes.
//   - Detecção de opt-out ("PARAR"/"SAIR"...).
// Contadores persistem em `dispatch_counters` (Supabase) → sobrevivem ao
// serverless; em dev (placeholder) caem num fallback em memória.
// ============================================================================

// -------- Parâmetros do perfil conservador (ajuste central) --------
// Teto e cadencia definidos pelo operador: 480 mensagens por CHIP por dia, a
// 1 envio por minuto em cada chip (60s fixo).
//
// Consequencia registrada: a janela 8h-20h tem 720 minutos, entao a 1/min o
// chip cumpre as 480 em cerca de 8h e fica mudo as ultimas 4h. Rajada seguida
// de silencio e um padrao que a Meta detecta, e o intervalo exato de 60s e
// mecanicamente regular -- a alternativa avaliada foi 75-105s sorteado, que
// espalharia as 480 pelas 12h inteiras. O operador optou pela cadencia fixa.
//
// O teto continua sendo limite rigido, reservado de forma ATOMICA a cada envio
// (reserveDispatchSlot), e o intervalo e disputado de forma atomica por chip
// (claimInstanceSlot) para que dois ticks concorrentes nunca facam o mesmo chip
// enviar duas vezes no mesmo segundo.
export const ANTIBAN = {
  // WARM-UP: chip declarado "novo" comeca baixo e sobe. Numero novo despejando
  // centenas de mensagens no primeiro dia e o perfil de ban mais classico.
  WARMUP_BASE: 30, // teto do dia 0
  WARMUP_STEP: 20, // ganho por dia ate alcancar DAILY_CAP (~23 dias)
  DAILY_CAP: 480, // teto de regime, por chip/dia
  HORA_INICIO: 8, // 08:00 MS
  HORA_FIM: 20, // 20:00 MS (exclusivo)
  // Cadência definida pelo operador: 1 envio por minuto POR CHIP (60s fixo).
  // Consequência registrada: a 1/min o chip cumpre as 480 em 8h e fica mudo as
  // últimas 4h da janela. O teto continua sendo o limite rígido.
  GAP_MIN_S: 60,
  GAP_MAX_S: 60,
  PRESENCA_MS: 1200, // "digitando..." antes de cada disparo em massa (humaniza)

  // SAUDE DO CHIP
  // Falhas seguidas costumam ser o sinal PRECOCE de shadowban -- aparecem
  // antes de a conexao cair, entao reagir so a connectionStatus chega tarde.
  MAX_FALHAS_SEGUIDAS: 5,
  COOLDOWN_MIN: 60, // resfriamento apos as falhas seguidas
  // Pausa por lote: quebra a cadencia mecanica de um chip que dispara sem parar.
  LOTE_TAMANHO: 25,
  PAUSA_LOTE_MIN: 12,
  // Entrega recusada (ack ERROR) e mais grave que falha de envio: o chip esta
  // aceitando e nao entregando, entao cada disparo QUEIMA um contato. Gatilho
  // mais curto, e o chip sai do pool em vez de so esfriar.
  MAX_ACKS_ERRO: 3,
  COOLDOWN_ACK_MIN: 180,
};

/** Intervalo até o próximo envio DAQUELE chip: 60s fixo (1 por minuto). */
export function sortearGapSegundos(): number {
  const { GAP_MIN_S, GAP_MAX_S } = ANTIBAN;
  return Math.floor(Math.random() * (GAP_MAX_S - GAP_MIN_S + 1)) + GAP_MIN_S;
}

const TZ = 'America/Campo_Grande';

function nowInMS(): { hour: number; day: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const hour = parseInt(get('hour'), 10);
  const day = `${get('year')}-${get('month')}-${get('day')}`; // YYYY-MM-DD MS
  return { hour: isNaN(hour) ? new Date().getHours() : hour, day };
}

export function dentroDaJanela(): boolean {
  const { hour } = nowInMS();
  return hour >= ANTIBAN.HORA_INICIO && hour < ANTIBAN.HORA_FIM;
}

// Fallback em memória (dev/placeholder).
declare global {
  // eslint-disable-next-line no-var
  var __aiviq_dispatch_counters:
    | Record<string, { day: string; sent: number; firstDay: string }>
    | undefined;
}
if (!global.__aiviq_dispatch_counters) global.__aiviq_dispatch_counters = {};

function warmupCap(daysSinceFirst: number): number {
  return Math.min(ANTIBAN.DAILY_CAP, ANTIBAN.WARMUP_BASE + Math.max(0, daysSinceFirst) * ANTIBAN.WARMUP_STEP);
}

function diffDays(fromISODate: string, todayISODate: string): number {
  const a = new Date(fromISODate + 'T00:00:00Z').getTime();
  const b = new Date(todayISODate + 'T00:00:00Z').getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export interface DispatchGate {
  allowed: boolean;
  reason?: 'fora_horario' | 'teto_diario';
  sentToday: number;
  dailyCap: number;
  hora: number;
}

/** Verifica se PODE disparar agora (sem incrementar). */
export async function checkDispatchGate(instanceName?: string): Promise<DispatchGate> {
  const inst = resolveInstanceName(instanceName);
  const { hour, day } = nowInMS();

  if (!dentroDaJanela()) {
    return { allowed: false, reason: 'fora_horario', sentToday: 0, dailyCap: 0, hora: hour };
  }

  // Dev/placeholder → memória.
  if (isPlaceholderEnv()) {
    const rec = global.__aiviq_dispatch_counters![inst];
    const firstDay = rec?.firstDay || day;
    const sentToday = rec && rec.day === day ? rec.sent : 0;
    const cap = await capDoChip(inst, day);
    return { allowed: sentToday < cap, reason: sentToday < cap ? undefined : 'teto_diario', sentToday, dailyCap: cap, hora: hour };
  }

  const ctx = await getServiceContext();
  if (!ctx) return { allowed: true, sentToday: 0, dailyCap: ANTIBAN.DAILY_CAP, hora: hour };

  // Linha de hoje + primeiro disparo do chip (para o warmup).
  const { data: today } = await ctx.db
    .from('dispatch_counters')
    .select('sent_count')
    .eq('organization_id', ctx.organizationId)
    .eq('instance_name', inst)
    .eq('day', day)
    .maybeSingle();

  const sentToday = (today?.sent_count as number) || 0;
  // Mesma fonte de verdade da reserva: maturidade declarada + curva de warm-up.
  const cap = await capDoChip(inst, day);
  return {
    allowed: sentToday < cap,
    reason: sentToday < cap ? undefined : 'teto_diario',
    sentToday,
    dailyCap: cap,
    hora: hour,
  };
}

// ---------------------------------------------------------------------------
// RESERVA ATÔMICA DE SLOT — substitui o antigo recordDispatch().
//
// O par checkDispatchGate() + recordDispatch() era ler-depois-gravar em duas
// etapas. Com o cron da Vercel, o worker de servidor E cada aba aberta do app
// chamando o tick, dois disparos concorrentes liam o mesmo sent_count e ambos
// enviavam: o teto de 480 vazava justamente nas horas de maior volume. Agora o
// slot é reservado ANTES do envio, num único UPDATE atômico no Postgres.
// ---------------------------------------------------------------------------

export interface SlotReservation {
  ok: boolean;
  reason?: 'fora_horario' | 'teto_diario' | 'sem_contexto';
  sentToday: number;
  dailyCap: number;
}

/**
 * Teto do DIA para este chip.
 *
 * "maduro" -> teto de regime cheio. "novo" -> curva de warm-up contada a partir
 * do dia em que o warm-up comecou. A maturidade e DECLARADA pelo operador, nao
 * inferida: o primeiro disparo por aqui nao diz nada sobre a idade real do
 * numero -- um chip em uso ha anos apareceria como "dia zero" e seria
 * estrangulado sem ganho nenhum de seguranca.
 */
export async function capDoChip(inst: string, hoje: string): Promise<number> {
  if (isPlaceholderEnv()) return ANTIBAN.DAILY_CAP;
  const ctx = await getServiceContext();
  if (!ctx) return ANTIBAN.WARMUP_BASE; // sem contexto, erra para o lado seguro

  const { data } = await ctx.db
    .from('dispatch_instance_control')
    .select('maturidade, warmup_started_on')
    .eq('organization_id', ctx.organizationId)
    .eq('instance_name', inst)
    .maybeSingle();

  const linha = data as { maturidade?: string; warmup_started_on?: string } | null;
  if (linha?.maturidade === 'maduro') return ANTIBAN.DAILY_CAP;

  const dias = linha?.warmup_started_on ? diffDays(linha.warmup_started_on, hoje) : 0;
  return warmupCap(dias);
}

/**
 * Reserva 1 slot no teto diário do chip. Só devolve ok=true se a reserva foi
 * efetivada — só então pode enviar. Em caso de falha no envio, chame
 * releaseDispatchSlot() para devolver o slot.
 */
export async function reserveDispatchSlot(instanceName?: string): Promise<SlotReservation> {
  const inst = resolveInstanceName(instanceName);
  const { day } = nowInMS();
  const cap = await capDoChip(inst, day);

  if (!dentroDaJanela()) {
    return { ok: false, reason: 'fora_horario', sentToday: 0, dailyCap: cap };
  }

  // Dev/placeholder → memória (single-process, sem concorrência real).
  if (isPlaceholderEnv()) {
    const cur = global.__aiviq_dispatch_counters![inst];
    const sent = cur && cur.day === day ? cur.sent : 0;
    if (sent >= cap) return { ok: false, reason: 'teto_diario', sentToday: sent, dailyCap: cap };
    if (cur && cur.day === day) cur.sent += 1;
    else global.__aiviq_dispatch_counters![inst] = { day, sent: 1, firstDay: cur?.firstDay || day };
    return { ok: true, sentToday: sent + 1, dailyCap: cap };
  }

  const ctx = await getServiceContext();
  if (!ctx) return { ok: false, reason: 'sem_contexto', sentToday: 0, dailyCap: cap };

  const { data, error } = await ctx.db.rpc('reserve_dispatch_slot', {
    p_org: ctx.organizationId,
    p_instance: inst,
    p_day: day,
    p_cap: cap,
  });

  if (error) {
    console.error('[antiBan] reserve_dispatch_slot falhou:', error.message);
    // Sem confirmação de reserva não se envia: erra para o lado de proteger o chip.
    return { ok: false, reason: 'sem_contexto', sentToday: 0, dailyCap: cap };
  }

  const sentToday = typeof data === 'number' ? data : 0;
  if (!sentToday) {
    return { ok: false, reason: 'teto_diario', sentToday: cap, dailyCap: cap };
  }
  return { ok: true, sentToday, dailyCap: cap };
}

/** Devolve o slot quando o envio falhou (nenhuma mensagem saiu do chip). */
export async function releaseDispatchSlot(instanceName?: string): Promise<void> {
  const inst = resolveInstanceName(instanceName);
  const { day } = nowInMS();

  if (isPlaceholderEnv()) {
    const cur = global.__aiviq_dispatch_counters![inst];
    if (cur && cur.day === day) cur.sent = Math.max(0, cur.sent - 1);
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  try {
    await ctx.db.rpc('release_dispatch_slot', {
      p_org: ctx.organizationId,
      p_instance: inst,
      p_day: day,
    });
  } catch {
    // best-effort: um slot a menos no dia é o lado seguro do erro.
  }
}

/** @deprecated Use reserveDispatchSlot() — o incremento agora é feito na reserva. */
export async function recordDispatch(_instanceName?: string): Promise<void> {
  // no-op: mantido para não quebrar chamadores legados.
}
