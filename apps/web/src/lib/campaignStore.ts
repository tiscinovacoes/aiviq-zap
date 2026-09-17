import { Campaign, CampaignMetrics } from '@/types/campaign';

// Fallback em memória (dev/placeholder, sem Supabase). Em produção as rotas usam
// o Supabase. As campanhas-demo abaixo só aparecem no modo placeholder (dev).
declare global {
  // eslint-disable-next-line no-var
  var __aiviq_campaigns: Campaign[] | undefined;
}

const demoSeed: Campaign[] = [
  {
    id: 'camp_demo_01',
    name: '[DEMO] Comunicado de exemplo',
    channel: 'WhatsApp Cloud Oficial',
    status: 'draft',
    messageText: 'Olá {{nome}}! Este é um exemplo de comunicado. Edite o conteúdo desta campanha.',
    totalContacts: 0,
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    repliedCount: 0,
    failedCount: 0,
    createdAt: new Date().toISOString(),
    tags: ['Exemplo'],
    botToTriggerOnReply: 'Nenhum',
    avoidDuplicates: true,
    ddiPlus55: true,
  },
];

if (!global.__aiviq_campaigns) {
  global.__aiviq_campaigns = [...demoSeed];
}

export function listCampaignsStore(): Campaign[] {
  return global.__aiviq_campaigns || [];
}

export function getCampaignStore(id: string): Campaign | undefined {
  return (global.__aiviq_campaigns || []).find((c) => c.id === id);
}

export function addCampaignStore(c: Campaign): Campaign {
  global.__aiviq_campaigns = [c, ...(global.__aiviq_campaigns || [])];
  return c;
}

export function updateCampaignStore(id: string, patch: Partial<Campaign>): Campaign | undefined {
  const list = global.__aiviq_campaigns || [];
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  list[idx] = { ...list[idx], ...patch, id: list[idx].id };
  return list[idx];
}

export function removeCampaignStore(id: string): boolean {
  const list = global.__aiviq_campaigns || [];
  const next = list.filter((c) => c.id !== id);
  global.__aiviq_campaigns = next;
  return next.length !== list.length;
}

// ============================================================================
// KPIs REAIS — calculados a partir das campanhas de verdade (sem números fake).
// ============================================================================
function pct(part: number, whole: number): string {
  if (!whole || whole <= 0) return '—';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export function computeCampaignMetrics(list: Campaign[]): CampaignMetrics {
  const sum = (f: (c: Campaign) => number) => list.reduce((a, c) => a + (f(c) || 0), 0);

  const totalContacts = sum((c) => c.totalContacts);
  const totalSent = sum((c) => c.sentCount);
  const totalDelivered = sum((c) => c.deliveredCount);
  const totalRead = sum((c) => c.readCount);
  const totalReplied = sum((c) => c.repliedCount);
  const totalFailed = sum((c) => c.failedCount);

  return {
    totalCampaigns: list.length,
    activeCampaigns: list.filter((c) => c.status === 'running').length,
    scheduledCampaigns: list.filter((c) => c.status === 'scheduled').length,
    completedCampaigns: list.filter((c) => c.status === 'completed').length,
    draftCampaigns: list.filter((c) => c.status === 'draft').length,
    pausedCampaigns: list.filter((c) => c.status === 'paused').length,

    totalContacts,
    totalSent,
    totalDelivered,
    totalRead,
    totalReplied,
    totalFailed,

    deliveryRate: pct(totalDelivered, totalSent),
    readRate: pct(totalRead, totalDelivered),
    replyRate: pct(totalReplied, totalDelivered),
    failureRate: pct(totalFailed, totalSent),

    // Legado (compat com código antigo que ainda referencia estes campos).
    monthlyDispatches: totalSent,
    avgDeliveryRate: pct(totalDelivered, totalSent),
    avgReplyRate: pct(totalReplied, totalDelivered),
  };
}
