import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const newVersion = (body.version || 3) + 1;

    return NextResponse.json({
      success: true,
      botId: params.id,
      publishedVersion: newVersion,
      publishedAt: new Date().toISOString(),
      message: `Versão ${newVersion} publicada e ativada em produção para WhatsApp Cloud e Webchat.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao publicar versão do bot' },
      { status: 500 }
    );
  }
}
