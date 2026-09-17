import { NextRequest, NextResponse } from 'next/server';
import { Campaign } from '@/types/campaign';
import { getDbContext, isPlaceholderEnv } from '@/lib/supabase/authContext';
import { getCampaignStore, updateCampaignStore, removeCampaignStore } from '@/lib/campaignStore';

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

export const dynamic = 'force-dynamic';

// Whitelist de campos EDITÁVEIS (conteúdo da campanha). Métricas (sent/delivered
// /read/replied/failed) NÃO são editáveis por aqui — só o disparo real as altera.
const EDITABLE: Record<string, string> = {
  name: 'name',
  channel: 'channel',
  status: 'status',
  messageText: 'message_text',
  attachmentUrl: 'attachment_url',
  totalContacts: 'total_contacts',
  scheduledAt: 'scheduled_at',
  tags: 'tags',
  botToTriggerOnReply: 'bot_to_trigger_on_reply',
  avoidDuplicates: 'avoid_duplicates',
  ddiPlus55: 'ddi_plus_55',
};

const VALID_STATUS = ['draft', 'scheduled', 'running', 'completed', 'paused'];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (isPlaceholderEnv()) {
    const c = getCampaignStore(params.id);
    return c
      ? NextResponse.json({ success: true, campaign: c })
      : NextResponse.json({ success: false, error: 'Campanha não encontrada' }, { status: 404 });
  }
  const ctx = await getDbContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { data, error } = await ctx.db
    .from('campaigns')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('id', params.id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ success: false, error: 'Campanha não encontrada' }, { status: 404 });
  }
  return NextResponse.json({ success: true, campaign: mapDbToCampaign(data) });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();

    // Monta o patch só com campos permitidos e presentes no body.
    const patchCamel: Partial<Campaign> = {};
    const patchDb: Record<string, any> = {};
    for (const [camel, col] of Object.entries(EDITABLE)) {
      if (body[camel] === undefined) continue;
      let val = body[camel];
      if (camel === 'status' && !VALID_STATUS.includes(val)) continue;
      if (camel === 'name') val = String(val).trim() || undefined;
      if (val === undefined) continue;
      if (camel === 'tags' && !Array.isArray(val)) continue;
      if (camel === 'totalContacts') val = Number(val) || 0;
      (patchCamel as any)[camel] = val;
      patchDb[col] = val;
    }

    if (Object.keys(patchDb).length === 0) {
      return NextResponse.json({ success: false, error: 'Nada para atualizar' }, { status: 400 });
    }

    if (isPlaceholderEnv()) {
      const updated = updateCampaignStore(params.id, patchCamel);
      return updated
        ? NextResponse.json({ success: true, campaign: updated })
        : NextResponse.json({ success: false, error: 'Campanha não encontrada' }, { status: 404 });
    }

    const ctx = await getDbContext();
    if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    patchDb.updated_at = new Date().toISOString();
    const { data, error } = await ctx.db
      .from('campaigns')
      .update(patchDb)
      .eq('organization_id', ctx.organizationId)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, campaign: mapDbToCampaign(data) });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao atualizar campanha' },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (isPlaceholderEnv()) {
    const ok = removeCampaignStore(params.id);
    return NextResponse.json({ success: ok });
  }
  const ctx = await getDbContext();
  if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { error } = await ctx.db
    .from('campaigns')
    .delete()
    .eq('organization_id', ctx.organizationId)
    .eq('id', params.id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
