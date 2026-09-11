import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  return NextResponse.json({
    success: true,
    conversation_id: id,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { status, priority, assignee_id } = body;

    return NextResponse.json({
      success: true,
      message: 'Conversa atualizada com sucesso',
      updated: {
        id,
        status,
        priority,
        assignee_id,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao atualizar conversa', message: err.message },
      { status: 500 }
    );
  }
}
