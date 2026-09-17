import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { isPlaceholderEnv } from '@/lib/supabase/authContext';
import { resolveSendInstance, sendRealMessageDetailed } from '@/lib/evolutionService';
import { checkDispatchGate, recordDispatch, dentroDaJanela, ANTIBAN } from '@/lib/antiBan';
import { gerarMensagem1 } from '@/lib/pesquisaSenado';
import { createOrUpdateSessionByPhone } from '@/lib/pesquisaSenadoStore';
import { addBotDispatchedMessage } from '@/lib/conversationStore';
import { persistMessageByJid } from '@/lib/conversationRepo';
import { sincronizarContatoEleitor } from '@/lib/pesquisaContatoSync';
import {
  getControlState,
  setNextAllowedAt,
  nextPendingItem,
  markItemSent,
  markItemError,
  getQueueStatus,
} from '@/lib/dispatchQueue';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Autoriza a chamada do cron. A Vercel Cron SÓ injeta Authorization: Bearer
// <CRON_SECRET> quando a env CRON_SECRET existe — sem ela todo tick volta 401.
// ?token= (cron externo) aceita CRON_SECRET ou EVOLUTION_API_KEY.
function autorizado(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET || '';
  const tokenSecret = cronSecret || process.env.EVOLUTION_API_KEY || '';
  if (!tokenSecret) return process.env.NODE_ENV !== 'production'; // dev sem segredo: libera
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer && cronSecret && safeEqual(bearer, cronSecret)) return true;
  const token = req.nextUrl.searchParams.get('token') || '';
  return Boolean(token) && safeEqual(token, tokenSecret);
}

async function runTick(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }
  if (isPlaceholderEnv()) {
    return NextResponse.json({ success: true, skipped: 'placeholder' });
  }

  // 1. Pausado?
  const ctrl = await getControlState();
  if (ctrl.paused) {
    return NextResponse.json({ success: true, skipped: 'pausado' });
  }

  // 2. Janela de horário (fuso MS).
  if (!dentroDaJanela()) {
    return NextResponse.json({ success: true, skipped: 'fora_horario' });
  }

  // 3. Intervalo anti-ban dinâmico (35s a 75s) desde o último envio.
  if (ctrl.nextAllowedAtMs && Date.now() < ctrl.nextAllowedAtMs) {
    const faltamMs = ctrl.nextAllowedAtMs - Date.now();
    // Como o cron da Vercel roda a cada 60s e o gap aleatório é entre 35s e 75s,
    // se faltam até 16 segundos, aguarda esse tempinho restante na própria execução
    // para disparar pontualmente sem perder o minuto inteiro.
    if (faltamMs > 0 && faltamMs <= 16000) {
      await new Promise((resolve) => setTimeout(resolve, faltamMs));
    } else {
      return NextResponse.json({ success: true, skipped: 'aguardando_intervalo', faltamMs });
    }
  }

  // 4. Instância ativa + teto diário/warmup.
  const inst = await resolveSendInstance();
  const gate = await checkDispatchGate(inst);
  if (!gate.allowed) {
    // Fora do teto: espera ~10min antes de tentar de novo (evita loop).
    await setNextAllowedAt(Date.now() + 10 * 60 * 1000);
    return NextResponse.json({ success: true, skipped: gate.reason, sentToday: gate.sentToday, dailyCap: gate.dailyCap });
  }

  // 5. Próximo da fila.
  const item = await nextPendingItem();
  if (!item) {
    return NextResponse.json({ success: true, done: true, status: await getQueueStatus() });
  }

  const seed = item.phone;
  try {
    await createOrUpdateSessionByPhone(item.phone, item.name || `Eleitor ${item.phone.slice(-4)}`, {
      bairro: item.bairro,
      etapa: 'disparado',
      voto1Id: undefined, voto1Nome: undefined, voto2Id: undefined, voto2Nome: undefined,
    });

    const msg1 = gerarMensagem1(item.name, seed);
    const r = await sendRealMessageDetailed(item.phone, msg1, inst, ANTIBAN.PRESENCA_MS);

    if (r.ok) {
      await markItemSent(item.id, r.instance);
      await recordDispatch(r.instance);
      persistMessageByJid({ phoneOrJid: item.phone, senderType: 'agent', content: msg1, name: item.name, externalId: r.messageId, instanceName: r.instance })
        .catch((e) => console.error('[tick] persist Msg1:', e));
      try { addBotDispatchedMessage({ toPhone: item.phone, name: item.name, text: msg1, botName: 'Robô Pesquisa Senado', instanceName: r.instance }); } catch {}
      sincronizarContatoEleitor({ name: item.name || '', phone: item.phone, bairro: item.bairro, etapa: 'disparado' })
        .catch((e) => console.error('[tick] sync contato:', e));

      // Próximo envio: intervalo aleatório anti-ban (40–90s).
      const gap = Math.floor(Math.random() * (ANTIBAN.GAP_MAX_S - ANTIBAN.GAP_MIN_S + 1)) + ANTIBAN.GAP_MIN_S;
      await setNextAllowedAt(Date.now() + gap * 1000);

      return NextResponse.json({ success: true, enviado: item.phone, proximoEmS: gap, status: await getQueueStatus() });
    }

    // Falha no envio → tenta de novo em breve (até 3x).
    const { failed } = await markItemError(item.id, item.attempts || 0, 'Falha no envio pelo WhatsApp');
    await setNextAllowedAt(Date.now() + 30 * 1000);
    return NextResponse.json({ success: true, falha: item.phone, definitiva: failed });
  } catch (err: any) {
    await markItemError(item.id, item.attempts || 0, err.message || 'erro');
    await setNextAllowedAt(Date.now() + 30 * 1000);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runTick(req);
}
export async function POST(req: NextRequest) {
  return runTick(req);
}
