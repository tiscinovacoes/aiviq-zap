import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ReportData } from '@/types/campaign';

export const dynamic = 'force-dynamic';

const mockReportData: ReportData = {
  period: 'Últimos 30 Dias (Setembro 2026)',
  totalConversations: 8420,
  resolvedConversations: 7980,
  avgFirstResponseTime: '1m 12s',
  avgResolutionTime: '14m 30s',
  csatOverall: 4.8,
  csatPositivePercentage: '96.2%',
  aiDeflectionRate: '68.4%',
  channels: [
    {
      channel: 'whatsapp_cloud',
      label: 'WhatsApp Cloud Oficial',
      totalMessages: 64200,
      conversations: 6240,
      percentage: 74,
      color: '#10b981',
    },
    {
      channel: 'instagram_direct',
      label: 'Instagram Direct',
      totalMessages: 14800,
      conversations: 1420,
      percentage: 17,
      color: '#ec4899',
    },
    {
      channel: 'webchat',
      label: 'Webchat Corporativo',
      totalMessages: 7600,
      conversations: 760,
      percentage: 9,
      color: '#6366f1',
    },
  ],
  attendants: [
    {
      id: 'att_01',
      name: 'Lucas Reis',
      avatar: 'LR',
      department: 'Ouvidoria',
      chatsResolved: 480,
      avgResponseTime: '45s',
      csatScore: 4.9,
      status: 'online',
    },
    {
      id: 'att_02',
      name: 'Beatriz Castro',
      avatar: 'BC',
      department: 'Secretaria de Saúde',
      chatsResolved: 395,
      avgResponseTime: '1m 05s',
      csatScore: 4.8,
      status: 'online',
    },
    {
      id: 'att_03',
      name: 'Rafael Santos',
      avatar: 'RS',
      department: 'Secretaria de Obras',
      chatsResolved: 340,
      avgResponseTime: '1m 30s',
      csatScore: 4.7,
      status: 'busy',
    },
    {
      id: 'att_04',
      name: 'Camila Fernandes',
      avatar: 'CF',
      department: 'Assistência Social',
      chatsResolved: 290,
      avgResponseTime: '1m 15s',
      csatScore: 4.9,
      status: 'offline',
    },
  ],
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }

      // Query live conversation counts for tenant under RLS
      const { count: liveConvCount } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true });

      const { count: liveResolvedCount } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved');

      const liveReport = {
        ...mockReportData,
        totalConversations: liveConvCount !== null && liveConvCount > 0 ? liveConvCount : mockReportData.totalConversations,
        resolvedConversations: liveResolvedCount !== null && liveResolvedCount > 0 ? liveResolvedCount : mockReportData.resolvedConversations,
      };

      return NextResponse.json({
        success: true,
        data: liveReport,
      });
    }

    return NextResponse.json({
      success: true,
      data: mockReportData,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao carregar relatórios analíticos' },
      { status: 500 }
    );
  }
}

