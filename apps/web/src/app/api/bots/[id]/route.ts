import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    return NextResponse.json({
      success: true,
      botId: params.id,
      name: 'Qualificação Comercial & Triagem Inteligente',
      version: '1',
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Bot não encontrado' },
      { status: 404 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    return NextResponse.json({
      success: true,
      botId: params.id,
      savedAt: new Date().toISOString(),
      message: 'Rascunho do fluxo salvo com sucesso.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao salvar rascunho do bot' },
      { status: 400 }
    );
  }
}
