import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'start'; // 'start' or 'pause'
    const newStatus = action === 'pause' ? 'paused' : 'running';

    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }

      await supabase
        .from('campaigns')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id);
    }

    return NextResponse.json({
      success: true,
      simulated: true,
      campaignId: params.id,
      status: newStatus,
      message: action === 'pause' ? 'Campanha pausada.' : 'Disparo simulado com sucesso (integração WhatsApp Cloud em fila simulada).',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao processar disparo da campanha' },
      { status: 500 }
    );
  }
}

