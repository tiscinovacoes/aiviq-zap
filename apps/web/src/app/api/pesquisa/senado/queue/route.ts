import { NextRequest, NextResponse } from 'next/server';
import { enqueueContacts, setPaused, clearPending, getQueueStatus } from '@/lib/dispatchQueue';

export const dynamic = 'force-dynamic';

// GET: status da fila para a UI (progresso, pausado, próximo em Xs).
export async function GET() {
  try {
    const status = await getQueueStatus();
    return NextResponse.json({ success: true, status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: aç​ões de controle da fila do disparo em massa.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === 'enfileirar' || action === 'enqueue') {
      const contatos = Array.isArray(body.contatos) ? body.contatos : [];
      if (contatos.length === 0) {
        return NextResponse.json({ success: false, error: 'Lista de contatos vazia' }, { status: 400 });
      }
      const r = await enqueueContacts(contatos);
      const status = await getQueueStatus();
      return NextResponse.json({ success: true, ...r, status });
    }

    if (action === 'pausar' || action === 'pause') {
      await setPaused(true);
      return NextResponse.json({ success: true, status: await getQueueStatus() });
    }

    if (action === 'retomar' || action === 'resume') {
      await setPaused(false);
      return NextResponse.json({ success: true, status: await getQueueStatus() });
    }

    if (action === 'parar' || action === 'clear') {
      await clearPending();
      await setPaused(true);
      return NextResponse.json({ success: true, status: await getQueueStatus() });
    }

    return NextResponse.json({ success: false, error: 'Ação não reconhecida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
