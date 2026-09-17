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
  nextPendingItems,
  markItemSent,
  markItemError,
  getQueueStatus,
} from '@/lib/dispatchQueue';

export interface TickCoreResult {
  success: boolean;
  skipped?: string;
  enviados?: string[];
  totalEnviados?: number;
  falhas?: string[];
  status?: any;
  error?: string;
}

export async function runTickCore(): Promise<TickCoreResult> {
  if (isPlaceholderEnv()) {
    return { success: true, skipped: 'placeholder' };
  }

  // 1. Pausado?
  const initialCtrl = await getControlState();
  if (initialCtrl.paused) {
    return { success: true, skipped: 'pausado', status: await getQueueStatus() };
  }

  // 2. Janela de horário (fuso MS: 8h–20h)
  if (!dentroDaJanela()) {
    return { success: true, skipped: 'fora_horario', status: await getQueueStatus() };
  }

  // 3. Intervalo de 60s entre rodadas de disparo simultâneo
  const agora = Date.now();
  if (initialCtrl.nextAllowedAtMs && agora < initialCtrl.nextAllowedAtMs) {
    const faltamMs = initialCtrl.nextAllowedAtMs - agora;
    // Se faltam menos de 5 segundos para a virada do minuto, aguarda e dispara pontualmente
    if (faltamMs > 0 && faltamMs <= 5000) {
      await new Promise((resolve) => setTimeout(resolve, faltamMs));
    } else {
      return {
        success: true,
        skipped: 'aguardando_intervalo',
        status: await getQueueStatus(),
      };
    }
  }

  // Instância ativa e gate anti-ban
  const inst = await resolveSendInstance();
  const gate = await checkDispatchGate(inst);
  if (!gate.allowed) {
    await setNextAllowedAt(Date.now() + 10 * 60 * 1000);
    return { success: true, skipped: 'gate_bloqueado', status: await getQueueStatus() };
  }

  // 4. Busca 2 contatos pendentes para disparo SIMULTÂNEO por minuto
  const SIMULTANEOS = 2;
  const items = await nextPendingItems(SIMULTANEOS);
  if (items.length === 0) {
    return { success: true, skipped: 'fila_vazia', status: await getQueueStatus() };
  }

  // 5. Executa os disparos SIMULTANEAMENTE (ao mesmo tempo)
  const enviadosNoTick: string[] = [];
  const falhasNoTick: string[] = [];

  const promessasDisparo = items.map(async (item) => {
    const seed = item.phone;
    try {
      await createOrUpdateSessionByPhone(item.phone, item.name || `Eleitor ${item.phone.slice(-4)}`, {
        bairro: item.bairro,
        etapa: 'disparado',
        voto1Id: undefined,
        voto1Nome: undefined,
        voto2Id: undefined,
        voto2Nome: undefined,
      });

      const msg1 = gerarMensagem1(item.name, seed);
      const r = await sendRealMessageDetailed(item.phone, msg1, inst, ANTIBAN.PRESENCA_MS);

      if (r.ok) {
        await markItemSent(item.id, r.instance);
        await recordDispatch(r.instance);
        persistMessageByJid({
          phoneOrJid: item.phone,
          senderType: 'agent',
          content: msg1,
          name: item.name,
          externalId: r.messageId,
          instanceName: r.instance,
        }).catch((e) => console.error('[tick] persist Msg1:', e));

        try {
          addBotDispatchedMessage({
            toPhone: item.phone,
            name: item.name,
            text: msg1,
            botName: 'Robô Pesquisa Senado',
            instanceName: r.instance,
          });
        } catch {}

        sincronizarContatoEleitor({
          name: item.name || '',
          phone: item.phone,
          bairro: item.bairro,
          etapa: 'disparado',
        }).catch((e) => console.error('[tick] sync contato:', e));

        enviadosNoTick.push(item.phone);
      } else {
        await markItemError(item.id, item.attempts || 0, 'Falha no envio pelo WhatsApp');
        falhasNoTick.push(item.phone);
      }
    } catch (err: any) {
      await markItemError(item.id, item.attempts || 0, err.message || 'erro');
      falhasNoTick.push(item.phone);
    }
  });

  // Aguarda ambos os disparos simultâneos finalizarem
  await Promise.allSettled(promessasDisparo);

  // 6. Define o próximo envio simultâneo de 2 contatos para exatamente 60 segundos (1 minuto)
  const INTERVALO_MINUTO_MS = 60 * 1000;
  await setNextAllowedAt(Date.now() + INTERVALO_MINUTO_MS);

  return {
    success: true,
    enviados: enviadosNoTick,
    totalEnviados: enviadosNoTick.length,
    falhas: falhasNoTick,
    status: await getQueueStatus(),
  };
}
