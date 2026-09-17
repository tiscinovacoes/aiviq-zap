import { NextRequest, NextResponse } from 'next/server';
import { ensurePesquisaConversation } from '@/lib/conversationStore';
import { getPesquisaSessionByPhone } from '@/lib/pesquisaSenadoStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone') || searchParams.get('id') || '';
    if (!phone) {
      return NextResponse.json({ error: 'Telefone ou ID obrigatório' }, { status: 400 });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const session = await getPesquisaSessionByPhone(cleanPhone);

    const name = searchParams.get('name') || session?.name || `Eleitor ${cleanPhone.slice(-4)}`;
    const bairro = searchParams.get('bairro') || session?.bairro || 'Mato Grosso do Sul';
    const etapa = searchParams.get('etapa') || session?.etapa || 'aguardando_voto2';
    const voto1Nome = searchParams.get('voto1Nome') || session?.voto1Nome;
    const voto1Id = session?.voto1Id;
    const voto2Nome = searchParams.get('voto2Nome') || session?.voto2Nome;
    const voto2Id = session?.voto2Id;

    const conversation = ensurePesquisaConversation({
      phone: cleanPhone,
      name,
      bairro,
      etapa,
      voto1Nome,
      voto1Id,
      voto2Nome,
      voto2Id,
    });

    return NextResponse.json({ success: true, conversation });
  } catch (err: any) {
    console.error('[API conversations/ensure GET error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = body.phone || body.id || '';
    if (!phone) {
      return NextResponse.json({ error: 'Telefone ou ID obrigatório' }, { status: 400 });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    const session = await getPesquisaSessionByPhone(cleanPhone);

    const name = body.name || session?.name || `Eleitor ${cleanPhone.slice(-4)}`;
    const bairro = body.bairro || session?.bairro || 'Mato Grosso do Sul';
    const etapa = body.etapa || session?.etapa || 'aguardando_voto2';
    const voto1Nome = body.voto1Nome || session?.voto1Nome;
    const voto1Id = body.voto1Id ?? session?.voto1Id;
    const voto2Nome = body.voto2Nome || session?.voto2Nome;
    const voto2Id = body.voto2Id ?? session?.voto2Id;

    const conversation = ensurePesquisaConversation({
      phone: cleanPhone,
      name,
      bairro,
      etapa,
      voto1Nome,
      voto1Id,
      voto2Nome,
      voto2Id,
    });

    return NextResponse.json({ success: true, conversation });
  } catch (err: any) {
    console.error('[API conversations/ensure POST error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
