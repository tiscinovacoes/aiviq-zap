import { isPlaceholderEnv } from '@/lib/supabase/authContext';
import { resolveSendInstance, sendRealMessageDetailed, getConnectedDispatchInstances } from '@/lib/evolutionService';
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

  // 4. Detecção e Health Check do Pool de Instâncias Conectadas
  const candidateInstances = await getConnectedDispatchInstances();
  const availableInstances: string[] = [];

  for (const instName of candidateInstances) {
    const gate = await checkDispatchGate(instName);
    if (gate.allowed) {
      availableInstances.push(instName);
    }
  }

  if (availableInstances.length === 0) {
    // Se nenhuma instância passou no gate, agenda espera de 5 minutos
    await setNextAllowedAt(Date.now() + 5 * 60 * 1000);
    return { success: true, skipped: 'todas_instancias_bloqueadas', status: await getQueueStatus() };
  }

  // 5. Busca N contatos pendentes, onde N = quantidade de instâncias conectadas e aptas
  // Cada instância disparará EXATAMENTE 1 lead a cada ciclo de 60 segundos
  const batchSize = availableInstances.length;
  const items = await nextPendingItems(batchSize);
  if (items.length === 0) {
    return { success: true, skipped: 'fila_vazia', status: await getQueueStatus() };
  }

  // 6. Distribui 1 contato exclusivo para cada instância disponível e dispara simultaneamente
  const enviadosNoTick: string[] = [];
  const falhasNoTick: string[] = [];

  const promessasDisparo = items.map(async (item, idx) => {
    // Alocação 1:1 garantida (1 lead por instância)
    const targetInst = availableInstances[idx % availableInstances.length];
    const seed = item.phone;

    try {
      await createOrUpdateSessionByPhone(item.phone, item.name || `Eleitor ${item.phone.slice(-4)}`, {
        bairro: item.bairro,
        etapa: 'disparado',
        instanceName: targetInst,
        voto1Id: undefined,
        voto1Nome: undefined,
        voto2Id: undefined,
        voto2Nome: undefined,
      });

      const msg1 = gerarMensagem1(item.name, seed);
      const r = await sendRealMessageDetailed(item.phone, msg1, targetInst, ANTIBAN.PRESENCA_MS);

      if (r.ok) {
        await markItemSent(item.id, r.instance || targetInst);
        await recordDispatch(r.instance || targetInst);
        persistMessageByJid({
          phoneOrJid: item.phone,
          senderType: 'agent',
          content: msg1,
          name: item.name,
          externalId: r.messageId,
          instanceName: r.instance || targetInst,
        }).catch((e) => console.error('[tick] persist Msg1:', e));

        try {
          addBotDispatchedMessage({
            toPhone: item.phone,
            name: item.name,
            text: msg1,
            botName: 'Robô Pesquisa Senado',
            instanceName: r.instance || targetInst,
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
        const errorReason = r.error || 'Falha no envio pelo WhatsApp';
        await markItemError(item.id, item.attempts || 0, errorReason);
        falhasNoTick.push(item.phone);
      }
    } catch (err: any) {
      await markItemError(item.id, item.attempts || 0, err.message || 'Erro inesperado no envio');
      falhasNoTick.push(item.phone);
    }
  });

  // Aguarda todos os disparos simultâneos do lote finalizarem
  await Promise.allSettled(promessasDisparo);

  // 7. Define o próximo envio do pool para exatamente 60 segundos (1 minuto)
  // Garantindo que nenhum chip ultrapasse 1 disparo por minuto
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
