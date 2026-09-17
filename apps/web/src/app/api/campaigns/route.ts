import { NextRequest, NextResponse } from 'next/server';
import { Campaign } from '@/types/campaign';
import { getDbContext, isPlaceholderEnv } from '@/lib/supabase/authContext';
import {
  listCampaignsStore,
  addCampaignStore,
  computeCampaignMetrics,
} from '@/lib/campaignStore';

export const dynamic = 'force-dynamic';

function mapDbToCampaign(row: any): Campaign {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel || 'WhatsApp Cloud Oficial',
    status: row.status || 'draft',
    messageText: row.message_text ?? '',
    attachmentUrl: row.attachment_url ?? undefined,
    totalContacts: Number(row.total_contacts ?? 0),
    sentCount: Number(row.sent_count ?? 0),
    deliveredCount: Number(row.delivered_count ?? 0),
    readCount: Number(row.read_count ?? 0),
    repliedCount: Number(row.replied_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    scheduledAt: row.scheduled_at ?? undefined,
    createdAt: row.created_at || new Date().toISOString(),
    tags: Array.isArray(row.tags) ? row.tags : [],
    botToTriggerOnReply: row.bot_to_trigger_on_reply ?? undefined,
    avoidDuplicates: row.avoid_duplicates !== false,
    ddiPlus55: row.ddi_plus_55 !== false,
  };
}

export async function GET(request: NextRequest) {
  try {
    const search = new URL(request.url).searchParams.get('q')?.toLowerCase() || '';
    let list: Campaign[] = [];

    if (isPlaceholderEnv()) {
      list = listCampaignsStore();
    } else {
      const ctx = await getDbContext();
      if (ctx) {
        const { data, error } = await ctx.db
          .from('campaigns')
          .select('*')
          .eq('organization_id', ctx.organizationId)
          .order('created_at', { ascending: false });
        if (error) {
          // Tabela ausente (migration 010 pendente) ou outro erro → não derruba a
          // tela; devolve vazio com um aviso para o front sinalizar.
          console.warn('[API campaigns GET] Supabase indisponível:', error.message);
          return NextResponse.json({
            success: true,
            campaigns: [],
            metrics: computeCampaignMetrics([]),
            dbUnavailable: true,
          });
        }
        list = (data || []).map(mapDbToCampaign);
      }
    }

    if (search) list = list.filter((c) => c.name.toLowerCase().includes(search));

    return NextResponse.json({
      success: true,
      campaigns: list,
      metrics: computeCampaignMetrics(list),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao listar campanhas' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Contagem REAL de contatos (dos leads importados, se houver). Sem métricas
    // fabricadas: a campanha nasce zerada e só evolui com disparo de verdade.
    const totalContacts = Number(
      body.totalContacts ??
        (Array.isArray(body.importedLeads) ? body.importedLeads.length : 0) ??
        0
    );
    const status: string = body.status || (body.scheduledAt ? 'scheduled' : 'draft');

    const base: Omit<Campaign, 'id' | 'createdAt'> = {
      name: body.name?.trim() || 'Nova Campanha',
      channel: body.channel || 'WhatsApp Cloud Oficial',
      status: status as Campaign['status'],
      messageText: body.messageText || '',
      attachmentUrl: body.attachmentUrl,
      totalContacts,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      repliedCount: 0,
      failedCount: 0,
      scheduledAt: body.scheduledAt || undefined,
      tags: Array.isArray(body.tags) ? body.tags : [],
      botToTriggerOnReply: body.botToTriggerOnReply || 'Nenhum',
      avoidDuplicates: body.avoidDuplicates !== false,
      ddiPlus55: body.ddiPlus55 !== false,
    };

    if (isPlaceholderEnv()) {
      const created = addCampaignStore({
        ...base,
        id: `camp_${Date.now()}`,
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, campaign: created }, { status: 201 });
    }

    const ctx = await getDbContext();
    if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { data, error } = await ctx.db
      .from('campaigns')
      .insert({
        organization_id: ctx.organizationId,
        name: base.name,
        channel: base.channel,
        status: base.status,
        message_text: base.messageText,
        attachment_url: base.attachmentUrl || null,
        total_contacts: base.totalContacts,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        failed_count: 0,
        scheduled_at: base.scheduledAt || null,
        tags: base.tags,
        bot_to_trigger_on_reply: base.botToTriggerOnReply,
        avoid_duplicates: base.avoidDuplicates,
        ddi_plus_55: base.ddiPlus55,
        created_by: ctx.isDemo ? null : ctx.userId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: `Não foi possível salvar a campanha: ${error.message}. Aplique a migration 010 no Supabase.` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, campaign: mapDbToCampaign(data) }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao criar campanha' },
      { status: 400 }
    );
  }
}
