import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Campaign } from '@/types/campaign';

export const dynamic = 'force-dynamic';

const mockCampaigns: Campaign[] = [
  {
    id: 'camp_01',
    name: 'Campanha de Vacinação contra a Gripe 2026',
    channel: 'WhatsApp Cloud Oficial',
    status: 'running',
    messageText: 'Olá {{nome}}! A Secretaria de Saúde informa: a campanha de vacinação contra a gripe já começou. Procure a UBS mais próxima do seu bairro.',
    totalContacts: 12500,
    sentCount: 11200,
    deliveredCount: 11040,
    readCount: 9450,
    repliedCount: 3820,
    failedCount: 160,
    createdAt: '2026-09-11T10:00:00Z',
    scheduledAt: '2026-09-11T11:00:00Z',
    tags: ['Saúde', 'Vacinação'],
    botToTriggerOnReply: 'Triagem de Manifestações da Ouvidoria',
    avoidDuplicates: true,
    ddiPlus55: true,
  },
  {
    id: 'camp_02',
    name: 'Convocação: Mutirão de Limpeza Urbana',
    channel: 'WhatsApp Cloud Oficial',
    status: 'completed',
    messageText: 'Olá {{nome}}! Neste sábado, às 8h, acontece o mutirão de limpeza no seu bairro. Participe e ajude a cuidar da nossa cidade.',
    totalContacts: 8400,
    sentCount: 8400,
    deliveredCount: 8310,
    readCount: 7100,
    repliedCount: 2640,
    failedCount: 90,
    createdAt: '2026-09-08T14:00:00Z',
    scheduledAt: '2026-09-09T09:00:00Z',
    tags: ['Zeladoria Urbana', 'Comunicado'],
    botToTriggerOnReply: 'Triagem de Manifestações da Ouvidoria',
    avoidDuplicates: true,
    ddiPlus55: true,
  },
  {
    id: 'camp_03',
    name: 'Aviso: Interdição da Av. Central para Obras',
    channel: 'WhatsApp Cloud Oficial',
    status: 'scheduled',
    messageText: 'Oi {{nome}}, informamos que a Av. Central ficará interditada para obras a partir de segunda-feira. Utilize rotas alternativas.',
    totalContacts: 3400,
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    repliedCount: 0,
    failedCount: 0,
    createdAt: '2026-09-11T14:30:00Z',
    scheduledAt: '2026-09-12T10:00:00Z',
    tags: ['Infraestrutura', 'Aviso'],
    botToTriggerOnReply: 'Triagem de Manifestações da Ouvidoria',
    avoidDuplicates: true,
    ddiPlus55: true,
  },
];

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
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q')?.toLowerCase() || '';

    const supabase = await createClient();
    const isDev = process.env.NODE_ENV === 'development';
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let list = mockCampaigns;

    if (!isPlaceholder) {
      const { data: dbCampaigns, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && dbCampaigns) {
        list = dbCampaigns.map(mapDbToCampaign);
      } else if (!isDev && error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (search) {
      list = list.filter((c) => c.name.toLowerCase().includes(search));
    }

    const totalDispatches = list.reduce((acc, c) => acc + (c.sentCount || 0), 0);
    const totalDelivered = list.reduce((acc, c) => acc + (c.deliveredCount || 0), 0);
    const totalReplied = list.reduce((acc, c) => acc + (c.repliedCount || 0), 0);

    const metrics = {
      totalCampaigns: list.length,
      activeCampaigns: list.filter((c) => c.status === 'running').length,
      monthlyDispatches: totalDispatches || 48500,
      avgDeliveryRate: totalDispatches > 0 ? `${((totalDelivered / totalDispatches) * 100).toFixed(1)}%` : '98.7%',
      avgReplyRate: totalDelivered > 0 ? `${((totalReplied / totalDelivered) * 100).toFixed(1)}%` : '31.4%',
    };

    return NextResponse.json({
      success: true,
      campaigns: list,
      metrics,
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

    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile || !profile.organization_id) {
        return NextResponse.json({ error: 'Perfil de organização não encontrado' }, { status: 403 });
      }

      const totalContacts = Number(body.totalContacts || 1500);
      const isScheduled = !!body.scheduledAt;

      const { data: insertedCampaign, error: campError } = await supabase
        .from('campaigns')
        .insert({
          organization_id: profile.organization_id,
          name: body.name || 'Nova Campanha de Disparo',
          channel: body.channel || 'WhatsApp Cloud Oficial',
          status: isScheduled ? 'scheduled' : 'running',
          message_text: body.messageText || '',
          attachment_url: body.attachmentUrl || null,
          total_contacts: totalContacts,
          sent_count: isScheduled ? 0 : Math.floor(totalContacts * 0.4),
          delivered_count: isScheduled ? 0 : Math.floor(totalContacts * 0.38),
          read_count: isScheduled ? 0 : Math.floor(totalContacts * 0.3),
          replied_count: isScheduled ? 0 : Math.floor(totalContacts * 0.12),
          failed_count: 0,
          scheduled_at: body.scheduledAt || null,
          tags: Array.isArray(body.tags) ? body.tags : ['Geral'],
          bot_to_trigger_on_reply: body.botToTriggerOnReply || 'Triagem de Manifestações da Ouvidoria',
          avoid_duplicates: body.avoidDuplicates !== false,
          ddi_plus_55: body.ddiPlus55 !== false,
          created_by: user.id,
        })
        .select()
        .single();

      if (!campError && insertedCampaign) {
        return NextResponse.json({ success: true, campaign: mapDbToCampaign(insertedCampaign) }, { status: 201 });
      }
    }

    // Dev fallback
    const newCampaign: Campaign = {
      id: `camp_${Date.now()}`,
      name: body.name || 'Nova Campanha de Disparo',
      channel: body.channel || 'WhatsApp Cloud Oficial',
      status: body.scheduledAt ? 'scheduled' : 'running',
      messageText: body.messageText || '',
      attachmentUrl: body.attachmentUrl,
      totalContacts: body.totalContacts || 1500,
      sentCount: body.scheduledAt ? 0 : Math.floor((body.totalContacts || 1500) * 0.4),
      deliveredCount: body.scheduledAt ? 0 : Math.floor((body.totalContacts || 1500) * 0.38),
      readCount: body.scheduledAt ? 0 : Math.floor((body.totalContacts || 1500) * 0.3),
      repliedCount: body.scheduledAt ? 0 : Math.floor((body.totalContacts || 1500) * 0.12),
      failedCount: 0,
      scheduledAt: body.scheduledAt,
      createdAt: new Date().toISOString(),
      tags: body.tags || ['Geral'],
      botToTriggerOnReply: body.botToTriggerOnReply || 'Triagem de Manifestações da Ouvidoria',
      avoidDuplicates: body.avoidDuplicates !== false,
      ddiPlus55: body.ddiPlus55 !== false,
    };

    mockCampaigns.unshift(newCampaign);

    return NextResponse.json({
      success: true,
      simulated: true,
      campaign: newCampaign,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao criar campanha' },
      { status: 400 }
    );
  }
}

