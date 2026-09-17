import { NextRequest, NextResponse } from 'next/server';
import {
  getEstadoDisparador,
  carregarFila,
  iniciarDisparador,
  pausarDisparador,
  pararDisparador,
} from '@/lib/pesquisaSenadoDisparador';

export const dynamic = 'force-dynamic';

export async function GET() {
  const estado = getEstadoDisparador();
  return NextResponse.json({ success: true, estado });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, contatos } = body;

    if (action === 'carregar_fila') {
      if (!Array.isArray(contatos) || contatos.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Lista de contatos vazia ou inválida' },
          { status: 400 }
        );
      }
      const estado = carregarFila(contatos);
      return NextResponse.json({ success: true, estado });
    }

    if (action === 'iniciar') {
      const estado = iniciarDisparador();
      return NextResponse.json({ success: true, estado });
    }

    if (action === 'pausar') {
      const estado = pausarDisparador();
      return NextResponse.json({ success: true, estado });
    }

    if (action === 'parar') {
      const estado = pararDisparador();
      return NextResponse.json({ success: true, estado });
    }

    return NextResponse.json({ success: false, error: 'Ação não reconhecida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
