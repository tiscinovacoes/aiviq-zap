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
export const maxDuration = 60; // 60s para comportar 2 disparos espaçados no cron da Vercel

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
  const initialCtrl = await getControlState();
  if (initialCtrl.paused) {
    return NextResponse.json({ success: true, skipped: 'pausado' });
  }

  // 2. Janela de horário (fuso MS: 8h–20h).
  if (!dentroDaJanela()) {
    return NextResponse.json({ success: true, skipped: 'fora_horario' });
  }

  // 3. Verifica intervalo anti-ban antes de iniciar o tick
  if (initialCtrl.nextAllowedAtMs && Date.now() < initialCtrl.nextAllowedAtMs) {
    const faltamMs = initialCtrl.nextAllowedAtMs - Date.now();
    // Se faltam até 20 segundos, aguarda esse tempinho para disparar pontualmente sem pular o minuto
    if (faltamMs > 0 && faltamMs <= 20000) {
      await new Promise((resolve) => setTimeout(resolve, faltamMs));
    } else {
      return NextResponse.json({ success: true, skipped: 'aguardando_intervalo', faltamMs });
    }
  }

  // Dispara 2 contatos por execução do cron (60s), mantendo intervalo anti-ban aleatório entre eles
  const MAX_PER_TICK = 2;
  const enviadosNoTick: string[] = [];
  const falhasNoTick: string[] = [];

  for (let step = 0; step < MAX_PER_TICK; step++) {
    // Para o 2º contato, aguarda intervalo aleatório seguro (35s a 45s) após o 1º
    if (step > 0) {
      const gapEntreContatos = Math.floor(Math.random() * (45 - 35 + 1)) + 35;
      await new Promise((resolve) => setTimeout(resolve, gapEntreContatos * 1000));
    }

    // Re-checa pausa e horário antes de cada envio
    const currentCtrl = await getControlState();
    if (currentCtrl.paused) break;
    if (!dentroDaJanela()) break;

    // Instância ativa + teto diário/warmup
    const inst = await resolveSendInstance();
    const gate = await checkDispatchGate(inst);
    if (!gate.allowed) {
      await setNextAllowedAt(Date.now() + 10 * 60 * 1000);
      break;
    }

    // Próximo da fila
    const item = await nextPendingItem();
    if (!item) {
      break;
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

        enviadosNoTick.push(item.phone);

        // Define quando será permitido o próximo envio (entre 35s e 75s aleatório)
        const gap = Math.floor(Math.random() * (ANTIBAN.GAP_MAX_S - ANTIBAN.GAP_MIN_S + 1)) + ANTIBAN.GAP_MIN_S;
        await setNextAllowedAt(Date.now() + gap * 1000);
      } else {
        const { failed } = await markItemError(item.id, item.attempts || 0, 'Falha no envio pelo WhatsApp');
        falhasNoTick.push(item.phone);
        await setNextAllowedAt(Date.now() + 20 * 1000);
      }
    } catch (err: any) {
      await markItemError(item.id, item.attempts || 0, err.message || 'erro');
      falhasNoTick.push(item.phone);
      await setNextAllowedAt(Date.now() + 20 * 1000);
    }
  }

  return NextResponse.json({
    success: true,
    enviados: enviadosNoTick,
    totalEnviados: enviadosNoTick.length,
    falhas: falhasNoTick,
    status: await getQueueStatus(),
  });
}

export async function GET(req: NextRequest) {
  return runTick(req);
}
export async function POST(req: NextRequest) {
  return runTick(req);
}
