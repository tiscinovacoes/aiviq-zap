import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

const mockBots: BotSummary[] = [
  {
    id: 'bot_qualifica_01',
    name: 'Triagem de Manifestações da Ouvidoria',
    status: 'active',
    channels: ['WhatsApp Cloud Oficial', 'Webchat'],
    groupsCount: 4,
    publishedVersion: 3,
    totalConversations: 1248,
    resolutionRate: '68.4%',
    updatedAt: '2026-09-11T14:30:00Z',
  },
  {
    id: 'bot_suporte_n1',
    name: 'FAQ & Informações ao Cidadão',
    status: 'active',
    channels: ['WhatsApp Cloud Oficial'],
    groupsCount: 6,
    publishedVersion: 5,
    totalConversations: 890,
    resolutionRate: '74.2%',
    updatedAt: '2026-09-10T18:15:00Z',
  },
  {
    id: 'bot_fora_expediente',
    name: 'Atendimento Fora do Expediente',
    status: 'paused',
    channels: ['WhatsApp Cloud Oficial', 'Instagram Direct'],
    groupsCount: 3,
    publishedVersion: 1,
    totalConversations: 312,
    resolutionRate: '52.0%',
    updatedAt: '2026-09-08T11:00:00Z',
  },
];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q')?.toLowerCase() || '';

    let list = mockBots;
    if (search) {
      list = list.filter((b) => b.name.toLowerCase().includes(search));
    }

    const metrics = {
      totalBots: mockBots.length,
      activeBots: mockBots.filter((b) => b.status === 'active').length,
      totalAutomations: mockBots.reduce((acc, curr) => acc + curr.totalConversations, 0),
      avgResolution: '64.8%',
    };

    return NextResponse.json({
      success: true,
      bots: list,
      metrics,
    });
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
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }
    }

    const body = await request.json();
    const newBot: BotSummary = {
      id: `bot_${Date.now()}`,
      name: body.name || 'Novo Fluxo de Automação',
      status: 'draft',
      channels: body.channels || ['WhatsApp Cloud Oficial'],
      groupsCount: 1,
      publishedVersion: 1,
      totalConversations: 0,
      resolutionRate: '0%',
      updatedAt: new Date().toISOString(),
    };

    mockBots.unshift(newBot);

    return NextResponse.json(
      {
        success: true,
        simulated: true,
        bot: newBot,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao criar bot' },
      { status: 400 }
    );
  }
}

