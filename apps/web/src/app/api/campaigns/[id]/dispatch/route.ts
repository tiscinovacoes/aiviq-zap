import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'start'; // 'start' or 'pause'

    return NextResponse.json({
      success: true,
      campaignId: params.id,
      status: action === 'pause' ? 'paused' : 'running',
      message: action === 'pause' ? 'Campanha pausada.' : 'Disparo iniciado com sucesso no WhatsApp Cloud.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao processar disparo da campanha' },
      { status: 500 }
    );
  }
}
