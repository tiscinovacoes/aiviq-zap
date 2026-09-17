import { isPlaceholderEnv } from '@/lib/supabase/authContext';
import { sendRealMessageDetailed, getConnectedDispatchInstances } from '@/lib/evolutionService';
import {
  reserveDispatchSlot,
  releaseDispatchSlot,
  dentroDaJanela,
  sortearGapSegundos,
  ANTIBAN,
} from '@/lib/antiBan';
import { gerarMensagem1 } from '@/lib/pesquisaSenado';
import { createOrUpdateSessionByPhone } from '@/lib/pesquisaSenadoStore';
import { addBotDispatchedMessage } from '@/lib/conversationStore';
import { persistMessageByJid } from '@/lib/conversationRepo';
import { sincronizarContatoEleitor } from '@/lib/pesquisaContatoSync';
import {
  getControlState,
  setNextAllowedAt,
  getInstanceNextAllowedAt,
  setInstanceNextAllowedAt,
  claimPendingItems,
  releaseItem,
  reapStaleClaims,
  markItemSent,
  markItemError,
  getQueueStatus,
  type QueueItem,
} from '@/lib/dispatchQueue';

// ===========================================================================
// MOTOR DE DISPARO MULTI-INSTANCIA
//
// Uma campanha, N chips. Cada chip e uma fila independente, com o SEU proprio
// relogio e o SEU proprio teto diario de ANTIBAN.DAILY_CAP (480). A cada tick:
//
//   1. devolve a fila contatos presos em 'processando' (worker que morreu);
//   2. pergunta a Evolution quais instancias estao conectadas;
//   3. seleciona as que ja venceram o proprio intervalo (75-105s, media 90s);
//   4. reserva ATOMICAMENTE 1 slot no teto diario de cada uma;
//   5. faz o claim de 1 contato por chip habilitado (SKIP LOCKED) e dispara
//      todos em paralelo;
//   6. reagenda cada chip individualmente com um novo intervalo sorteado.
//
// Vazao = (no de chips conectados) x 480/dia, com o piso de seguranca de um
// envio a cada ~90s POR CHIP. Nenhum chip acelera porque outro parou.
// ===========================================================================

export interface TickCoreResult {
  success: boolean;
  skipped?: string;
  enviados?: string[];
  totalEnviados?: number;
  falhas?: string[];
  instanciasConectadas?: number;
  instanciasProntas?: number;
  status?: any;
  error?: string;
}

/** Dispara 1 contato por um chip especifico. Devolve o slot se o envio falhar. */
async function dispararContato(item: QueueItem, instancia: string): Promise<boolean> {
  try {
    await createOrUpdateSessionByPhone(item.phone, item.name || `Eleitor ${item.phone.slice(-4)}`, {
      bairro: item.bairro,
      etapa: 'disparado',
      instanceName: instancia,
      voto1Id: undefined,
      voto1Nome: undefined,
      voto2Id: undefined,
      voto2Nome: undefined,
    });

    const msg1 = gerarMensagem1(item.name, item.phone);
    const r = await sendRealMessageDetailed(item.phone, msg1, instancia, ANTIBAN.PRESENCA_MS);

    if (!r.ok) {
      await markItemError(item.id, item.attempts || 0, r.error || 'Falha no envio pelo WhatsApp');
      await releaseDispatchSlot(instancia); // nada saiu do chip: devolve a cota
      return false;
    }

    const instEnviou = r.instance || instancia;
    await markItemSent(item.id, instEnviou);

    persistMessageByJid({
      phoneOrJid: item.phone,
      senderType: 'agent',
      content: msg1,
      name: item.name,
      externalId: r.messageId,
      instanceName: instEnviou,
    }).catch((e) => console.error('[tick] persist Msg1:', e));

    try {
      addBotDispatchedMessage({
        toPhone: item.phone,
        name: item.name,
        text: msg1,
        botName: 'Robo Pesquisa Senado',
        instanceName: instEnviou,
      });
    } catch {}

    sincronizarContatoEleitor({
      name: item.name || '',
      phone: item.phone,
      bairro: item.bairro,
      etapa: 'disparado',
    }).catch((e) => console.error('[tick] sync contato:', e));

    return true;
  } catch (err: any) {
    await markItemError(item.id, item.attempts || 0, err?.message || 'Erro inesperado no envio');
    await releaseDispatchSlot(instancia);
    return false;
  }
}

export async function runTickCore(): Promise<TickCoreResult> {
  if (isPlaceholderEnv()) {
    return { success: true, skipped: 'placeholder' };
  }

  // 1. Pausado pelo operador?
  const ctrl = await getControlState();
  if (ctrl.paused) {
    return { success: true, skipped: 'pausado', status: await getQueueStatus() };
  }

  // 2. Janela de horario (fuso MS: 8h-20h).
  if (!dentroDaJanela()) {
    return { success: true, skipped: 'fora_horario', status: await getQueueStatus() };
  }

  // 3. Recupera contatos presos num tick que morreu antes de concluir.
  await reapStaleClaims();

  // 4. Chips conectados agora.
  const conectadas = await getConnectedDispatchInstances();
  if (conectadas.length === 0) {
    return { success: true, skipped: 'nenhuma_instancia_conectada', status: await getQueueStatus() };
  }

  // 5. Quais ja venceram o proprio intervalo anti-ban.
  const agora = Date.now();
  const proximos = await getInstanceNextAllowedAt(conectadas);
  const prontas = conectadas.filter((i) => !proximos[i] || agora >= proximos[i]);

  if (prontas.length === 0) {
    const menorEspera = Math.min(...conectadas.map((i) => proximos[i] || 0));
    await setNextAllowedAt(menorEspera); // relogio agregado, so para a UI
    return {
      success: true,
      skipped: 'aguardando_intervalo',
      instanciasConectadas: conectadas.length,
      instanciasProntas: 0,
      status: await getQueueStatus(),
    };
  }

  // 6. Reserva 1 slot no teto diario de cada chip pronto. A reserva e atomica:
  //    e ela que garante o limite de 480/dia mesmo com ticks simultaneos.
  const habilitadas: string[] = [];
  for (const inst of prontas) {
    const slot = await reserveDispatchSlot(inst);
    if (slot.ok) {
      habilitadas.push(inst);
    } else if (slot.reason === 'teto_diario') {
      // Chip fechou as 480 do dia: dorme 1h antes de reavaliar.
      await setInstanceNextAllowedAt(inst, agora + 60 * 60 * 1000);
    }
  }

  if (habilitadas.length === 0) {
    return {
      success: true,
      skipped: 'todas_instancias_no_teto',
      instanciasConectadas: conectadas.length,
      instanciasProntas: prontas.length,
      status: await getQueueStatus(),
    };
  }

  // 7. Claim de 1 contato por chip habilitado (exclusivo entre ticks concorrentes).
  const items = await claimPendingItems(habilitadas.length);
  if (items.length === 0) {
    // Fila vazia: devolve os slots reservados que nao serao usados.
    await Promise.allSettled(habilitadas.map((i) => releaseDispatchSlot(i)));
    return { success: true, skipped: 'fila_vazia', status: await getQueueStatus() };
  }

  // Sobrou slot reservado sem contato? Devolve.
  const sobrando = habilitadas.slice(items.length);
  await Promise.allSettled(sobrando.map((i) => releaseDispatchSlot(i)));

  // 8. Dispara em paralelo: 1 contato por chip, exatamente.
  const usadas = habilitadas.slice(0, items.length);
  const enviados: string[] = [];
  const falhas: string[] = [];

  const resultados = await Promise.allSettled(
    items.map((item, idx) => dispararContato(item, usadas[idx]))
  );

  resultados.forEach((r, idx) => {
    if (r.status === 'fulfilled' && r.value) enviados.push(items[idx].phone);
    else falhas.push(items[idx].phone);
  });

  // 9. Reagenda cada chip com o SEU proprio intervalo sorteado (75-105s).
  //    Sorteio por chip: dois chips nunca ficam sincronizados no mesmo segundo.
  await Promise.allSettled(
    usadas.map((inst) => setInstanceNextAllowedAt(inst, Date.now() + sortearGapSegundos() * 1000))
  );

  // Relogio agregado (o que a UI mostra): o chip que libera primeiro.
  const novosProximos = await getInstanceNextAllowedAt(conectadas);
  const proximoDoPool = Math.min(...conectadas.map((i) => novosProximos[i] || 0));
  await setNextAllowedAt(proximoDoPool);

  return {
    success: true,
    enviados,
    totalEnviados: enviados.length,
    falhas,
    instanciasConectadas: conectadas.length,
    instanciasProntas: prontas.length,
    status: await getQueueStatus(),
  };
}

/** Devolve um contato preso a fila (usado por diagnosticos). */
export async function liberarItem(id: string): Promise<void> {
  await releaseItem(id);
}
