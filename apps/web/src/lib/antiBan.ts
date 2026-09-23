import { getServiceContext, isPlaceholderEnv } from '@/lib/supabase/authContext';
import { resolveInstanceName } from '@/lib/instanceRegistry';

// Spintax/opt-out são puros (sem deps de servidor) e ficam em lib/spintax.ts para
// poderem ser usados também no bundle do cliente. Reexportados aqui por conveniência.
export { spin, isOptOut } from '@/lib/spintax';

// ============================================================================
// Padrão anti-bloqueio de chip (perfil CONSERVADOR) para disparo em massa.
//   - Teto diário por chip com WARMUP crescente (chip novo manda pouco e sobe).
//   - Janela de horário 8h-21h (fuso MS).
//   - Intervalo FIXO por chip (janela / teto) + revezamento entre chips.
//   - Variação de texto (spintax) — leads diferentes recebem redações diferentes.
//   - Detecção de opt-out ("PARAR"/"SAIR"...).
// Contadores persistem em `dispatch_counters` (Supabase) → sobrevivem ao
// serverless; em dev (placeholder) caem num fallback em memória.
// ============================================================================

// -------- Parâmetros do perfil conservador (ajuste central) --------
// Perfil pós-ban (23/09/2026), definido pelo operador:
//   - teto de 150 mensagens por CHIP por dia;
//   - janela de trabalho das 8h às 21h (fuso MS);
//   - TEMPO FIXO por chip: o intervalo de cada chip é a janela dividida pelo
//     teto dele, então as mensagens saem espalhadas pelo dia inteiro, sem
//     rajada e sem silêncio no fim da tarde.
//
// Conta para um chip de 150/dia:
//   janela útil = 13h (780 min) - 30 min de margem = 750 min
//   750 min / 150 = 5 min cravados entre um envio e outro do MESMO chip.
// Chip em warm-up (teto menor) ganha intervalo proporcionalmente maior:
// 30/dia -> 25 min; 50/dia -> 15 min; ...
//
// Os chips também são ESCALONADOS entre si (ver intervaloEntreChipsSegundos):
// com 2 chips de 5 min, sai uma mensagem do pool a cada 2m30, alternando
// chip A / chip B, em vez dos dois dispararem no mesmo segundo.
//
// O teto continua sendo limite rígido, reservado de forma ATÔMICA a cada envio
// (reserveDispatchSlot), e o intervalo é disputado de forma atômica por chip
// (claimInstanceSlot) para que dois ticks concorrentes nunca façam o mesmo chip
// enviar duas vezes no mesmo segundo.
export const ANTIBAN = {
  // WARM-UP: chip declarado "novo" começa baixo e sobe. Número novo despejando
  // centenas de mensagens no primeiro dia é o perfil de ban mais clássico.
  WARMUP_BASE: 30, // teto do dia 0
  WARMUP_STEP: 20, // ganho por dia até alcançar DAILY_CAP (~6 dias)
  DAILY_CAP: 150, // teto de regime, por chip/dia
  HORA_INICIO: 8, // 08:00 MS
  HORA_FIM: 21, // 21:00 MS (exclusivo)
  // Folga no fim da janela para absorver atrasos do cron/ticks perdidos sem
  // deixar o chip abaixo do teto do dia.
  MARGEM_JANELA_MIN: 30,
  PRESENCA_MS: 3000, // "digitando..." antes de cada disparo em massa (humaniza)

  // SAÚDE DO CHIP
  // Falhas seguidas costumam ser o sinal PRECOCE de shadowban -- aparecem
  // antes de a conexão cair, então reagir só a connectionStatus chega tarde.
  MAX_FALHAS_SEGUIDAS: 3,
  COOLDOWN_MIN: 90, // resfriamento após as falhas seguidas
  // Pausa por lote DESLIGADA: com o tempo fixo o chip já trabalha em ritmo
  // baixo o dia todo, e uma pausa extra quebraria a conta da janela (o chip
  // não fecharia as 150). Valor alto = nunca atinge o lote.
  LOTE_TAMANHO: 100000,
  PAUSA_LOTE_MIN: 0,
  // Entrega recusada (ack ERROR) é gravíssimo: indica rejeição da Meta/Baileys.
  // Interrompe no 2º erro consecutivo para blindar e salvar o chip.
  MAX_ACKS_ERRO: 2,
  COOLDOWN_ACK_MIN: 180,
};

/** Minutos úteis da janela diária (já descontada a margem). */
function janelaUtilMin(): number {
  return (ANTIBAN.HORA_FIM - ANTIBAN.HORA_INICIO) * 60 - ANTIBAN.MARGEM_JANELA_MIN;
}

/**
 * Intervalo FIXO entre dois envios do MESMO chip: janela útil / teto do dia.
 * 150/dia -> 300s (5 min). Chip em warm-up (teto menor) -> intervalo maior.
 */
export function intervaloFixoDoChipSegundos(capDoDia: number): number {
  const cap = Math.max(1, capDoDia || ANTIBAN.DAILY_CAP);
  return Math.floor((janelaUtilMin() * 60) / cap);
}

/**
 * Espaçamento mínimo entre DOIS envios quaisquer do pool, para os chips se
 * revezarem em vez de dispararem juntos: menor intervalo fixo / nº de chips.
 * 2 chips de 150/dia -> 150s; 3 chips -> 100s.
 */
export function intervaloEntreChipsSegundos(intervalosFixos: number[]): number {
  if (intervalosFixos.length === 0) return 0;
  return Math.floor(Math.min(...intervalosFixos) / intervalosFixos.length);
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
export async function checkDispatchGate(instanceName?: string, bypassHorario = false): Promise<DispatchGate> {
  const inst = resolveInstanceName(instanceName);
  const { hour, day } = nowInMS();

  if (!bypassHorario && !dentroDaJanela()) {
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
// enviavam: o teto diário vazava justamente nas horas de maior volume. Agora o
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
export async function reserveDispatchSlot(instanceName?: string, bypassHorario = false): Promise<SlotReservation> {
  const inst = resolveInstanceName(instanceName);
  const { day } = nowInMS();
  const cap = await capDoChip(inst, day);

  if (!bypassHorario && !dentroDaJanela()) {
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
