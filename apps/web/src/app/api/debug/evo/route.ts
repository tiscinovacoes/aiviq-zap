import { NextRequest, NextResponse } from 'next/server';
import { fetchLiveEvolutionInstances } from '@/lib/evolutionService';

export const dynamic = 'force-dynamic';

const URL = process.env.EVOLUTION_API_URL;
const KEY = process.env.EVOLUTION_API_KEY;

// DEBUG TEMPORÁRIO — inspeciona instâncias e o envio cru na Evolution.
export async function GET() {
  try {
    const live = await fetchLiveEvolutionInstances(true);
    return NextResponse.json({ ok: true, url: URL, hasKey: !!KEY, live });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { phone, text = 'Teste de envio AIVIQ', instance } = await req.json();
    if (!URL || !KEY) return NextResponse.json({ ok: false, error: 'Evolution env ausente' });

    const live = await fetchLiveEvolutionInstances(true);
    const inst = instance || live.find((i) => i.status === 'connected')?.instanceName;
    if (!inst) return NextResponse.json({ ok: false, error: 'Nenhuma instância conectada', live });

    const number = String(phone || '').replace(/\D/g, '');

    // 1. Confere se o número existe no WhatsApp (whatsappNumbers).
    let existsResp: any = null;
    try {
      const cr = await fetch(`${URL}/chat/whatsappNumbers/${inst}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: KEY },
        body: JSON.stringify({ numbers: [number] }),
        signal: AbortSignal.timeout(8000),
      });
      existsResp = { status: cr.status, body: await cr.text() };
    } catch (e: any) {
      existsResp = { error: e.message };
    }

    // 2. Envia de fato.
    const sr = await fetch(`${URL}/message/sendText/${inst}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ number, text, delay: 800, linkPreview: false }),
      signal: AbortSignal.timeout(10000),
    });
    const sendBody = await sr.text();
    let sent: any = null;
    try { sent = JSON.parse(sendBody); } catch {}
    const msgId = sent?.key?.id;
    const jid = sent?.key?.remoteJid;

    // 3. Espera e confere o STATUS de entrega da mensagem (PENDING travado =
    //    sessão morta; SERVER_ACK/DELIVERY_ACK/READ = entregou).
    await new Promise((r) => setTimeout(r, 5000));
    let statusCheck: any = null;
    try {
      const fr = await fetch(`${URL}/chat/findMessages/${inst}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: KEY },
        body: JSON.stringify({ where: { key: { remoteJid: jid } } }),
        signal: AbortSignal.timeout(8000),
      });
      const fb = await fr.json();
      const arr = Array.isArray(fb) ? fb : fb?.messages?.records || fb?.records || [];
      const found = Array.isArray(arr) ? arr.find((m: any) => m?.key?.id === msgId) : null;
      const ultimas = (Array.isArray(arr) ? arr : [])
        .slice(-8)
        .map((m: any) => ({ fromMe: m?.key?.fromMe, status: m?.status, ts: m?.messageTimestamp, id: m?.key?.id }));
      statusCheck = { httpStatus: fr.status, msgStatus: found?.status ?? 'nao-encontrada', total: Array.isArray(arr) ? arr.length : 0, ultimas };
    } catch (e: any) {
      statusCheck = { error: e.message };
    }

    return NextResponse.json({
      ok: true,
      instanceUsada: inst,
      number,
      existsCheck: existsResp,
      send: { status: sr.status, ok: sr.ok, msgId, jid, statusInicial: sent?.status },
      entrega: statusCheck,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
