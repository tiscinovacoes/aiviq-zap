import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  return NextResponse.json({
    success: true,
    contact_id: id,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();

    return NextResponse.json({
      success: true,
      message: 'Contato atualizado com sucesso',
      updated: {
        id,
        ...body,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao atualizar contato', message: err.message },
      { status: 500 }
    );
  }
}
