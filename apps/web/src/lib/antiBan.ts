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
export const ANTIBAN = {
  // Teto diário definido pelo operador: MÁX 800/dia. O intervalo 40–90s + a
  // janela 8h–20h já espalham os envios (na prática ~700/dia no melhor caso),
  // então o teto de 800 funciona como limite rígido de segurança.
  WARMUP_BASE: 800, // sem rampa artificial (teto cheio desde o 1º dia)
  WARMUP_STEP: 0,
  DAILY_CAP: 800, // teto máximo por chip/dia
  HORA_INICIO: 8, // 08:00 MS
  HORA_FIM: 20, // 20:00 MS (exclusivo)
  GAP_MIN_S: 35, // intervalo mínimo entre disparos (35s)
  GAP_MAX_S: 75, // intervalo máximo entre disparos (75s dinâmico/aleatório)
  PRESENCA_MS: 1200, // "digitando..." antes de cada disparo em massa (humaniza)
};

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
    const cap = warmupCap(diffDays(firstDay, day));
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

  const { data: first } = await ctx.db
    .from('dispatch_counters')
    .select('day')
    .eq('organization_id', ctx.organizationId)
    .eq('instance_name', inst)
    .order('day', { ascending: true })
    .limit(1)
    .maybeSingle();

  const firstDay = (first?.day as string) || day;
  const sentToday = (today?.sent_count as number) || 0;
  const cap = warmupCap(diffDays(firstDay, day));
  return {
    allowed: sentToday < cap,
    reason: sentToday < cap ? undefined : 'teto_diario',
    sentToday,
    dailyCap: cap,
    hora: hour,
  };
}

/** Registra 1 disparo bem-sucedido (incrementa o contador do dia). */
export async function recordDispatch(instanceName?: string): Promise<void> {
  const inst = resolveInstanceName(instanceName);
  const { day } = nowInMS();

  if (isPlaceholderEnv()) {
    const cur = global.__aiviq_dispatch_counters![inst];
    if (cur && cur.day === day) cur.sent += 1;
    else global.__aiviq_dispatch_counters![inst] = { day, sent: 1, firstDay: cur?.firstDay || day };
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  try {
    // Incremento atômico via RPC não disponível → leitura+upsert best-effort.
    const { data: today } = await ctx.db
      .from('dispatch_counters')
      .select('sent_count')
      .eq('organization_id', ctx.organizationId)
      .eq('instance_name', inst)
      .eq('day', day)
      .maybeSingle();
    const next = ((today?.sent_count as number) || 0) + 1;
    await ctx.db.from('dispatch_counters').upsert(
      {
        organization_id: ctx.organizationId,
        instance_name: inst,
        day,
        sent_count: next,
        last_sent_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,instance_name,day' }
    );
  } catch {
    // best-effort
  }
}

