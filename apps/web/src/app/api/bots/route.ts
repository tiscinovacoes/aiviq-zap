import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { BotV1 } from '@/types/bot';
import { listBotRecords, createBotRecord } from '@/lib/botStore';
import { makeBlankBot } from '@/lib/bot/blankBot';

export const dynamic = 'force-dynamic';

interface BotSummary {
  id: string;
  name: string;
  status: 'active' | 'draft' | 'paused';
  channels: string[];
  groupsCount: number;
  publishedVersion: number;
  totalConversations: number;
  resolutionRate: string;
  updatedAt: string;
}

function summaryFrom(
  id: string,
  name: string,
  status: string,
  document: any,
  publishedVersion: number,
  updatedAt: string
): BotSummary {
  const groups = document && Array.isArray(document.groups) ? document.groups : [];
  return {
    id,
    name: name || document?.name || 'Fluxo de Automação',
    status: (status as BotSummary['status']) || 'draft',
    channels: ['WhatsApp Cloud Oficial'],
    groupsCount: groups.length,
    publishedVersion: publishedVersion ?? 0,
    totalConversations: 0,
    resolutionRate: '—',
    updatedAt: updatedAt || new Date().toISOString(),
  };
}

function isPlaceholderEnv() {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project')
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const isPlaceholder = isPlaceholderEnv();
    const search = new URL(request.url).searchParams.get('q')?.toLowerCase() || '';

    let bots: BotSummary[] = [];

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

      const { data, error } = await supabase
        .from('bots')
        .select('id, name, status, document, published_version, updated_at')
        .order('updated_at', { ascending: false });

      if (error) {
        return NextResponse.json(
          { success: false, error: 'Falha ao listar chatbots', message: error.message },
          { status: 500 }
        );
      }
      bots = (data ?? []).map((r: any) =>
        summaryFrom(r.id, r.name, r.status, r.document, r.published_version, r.updated_at)
      );
    } else {
      bots = listBotRecords().map((r) =>
        summaryFrom(r.id, r.name, r.status, r.document, r.publishedVersion, r.updatedAt)
      );
    }

    if (search) bots = bots.filter((b) => b.name.toLowerCase().includes(search));

    const metrics = {
      totalBots: bots.length,
      activeBots: bots.filter((b) => b.status === 'active').length,
      totalAutomations: 0,
      avgResolution: '—',
    };

    return NextResponse.json({ success: true, bots, metrics });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao listar chatbots' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const isPlaceholder = isPlaceholderEnv();
    const body = await request.json();
    const name = (body?.name && String(body.name).trim()) || 'Novo Fluxo de Automação';

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();
      if (!profile?.organization_id) {
        return NextResponse.json({ error: 'Perfil de organização não encontrado' }, { status: 403 });
      }

      // Insere primeiro para obter o UUID e então grava o documento com o id real.
      const { data: inserted, error: insErr } = await supabase
        .from('bots')
        .insert({ organization_id: profile.organization_id, name, status: 'draft', document: {} })
        .select('id, name, status, published_version, updated_at')
        .single();

      if (insErr || !inserted) {
        return NextResponse.json(
          { success: false, error: 'Falha ao criar o fluxo', message: insErr?.message },
          { status: 500 }
        );
      }

      const document: BotV1 = makeBlankBot(inserted.id, name);
      const { error: updErr } = await supabase
        .from('bots')
        .update({ document })
        .eq('id', inserted.id);
      if (updErr) {
        return NextResponse.json(
          { success: false, error: 'Falha ao inicializar o fluxo', message: updErr.message },
          { status: 500 }
        );
      }

      const bot = summaryFrom(inserted.id, name, 'draft', document, 0, inserted.updated_at);
      return NextResponse.json({ success: true, bot }, { status: 201 });
    }

    // Fallback dev/sem banco
    const rec = createBotRecord(name);
    const bot = summaryFrom(rec.id, rec.name, rec.status, rec.document, rec.publishedVersion, rec.updatedAt);
    return NextResponse.json({ success: true, simulated: true, bot }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao criar bot' },
      { status: 400 }
    );
  }
}
