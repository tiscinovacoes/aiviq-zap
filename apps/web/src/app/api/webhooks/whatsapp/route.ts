import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'poli_webhook_secret_token_2026';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Verificação de webhook rejeitada', { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Log payload for audit / observability
    console.log('[WhatsApp Webhook Event Received]:', JSON.stringify(payload));

    // Handle incoming messages structure from Meta WhatsApp Cloud API
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (messages && messages.length > 0) {
      const incomingMsg = messages[0];
      const from = incomingMsg.from; // Phone number
      const text = incomingMsg.text?.body || '';

      console.log(`[WhatsApp Message Ingested] De: ${from} | Texto: "${text}"`);
    }

    return NextResponse.json({ success: true, status: 'EVENT_RECEIVED' });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao processar webhook', message: err.message },
      { status: 500 }
    );
  }
}
