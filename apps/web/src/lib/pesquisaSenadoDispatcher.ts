import { isPlaceholderEnv } from '@/lib/supabase/authContext';
import { sendRealMessageDetailed, getConnectedDispatchInstances } from '@/lib/evolutionService';
import {
  reserveDispatchSlot,
  releaseDispatchSlot,
  dentroDaJanela,
  sortearGapSegundos,
  capDoChip,
  checkDispatchGate,
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
  claimPendingItemsForInstance,
  releaseItem,
  reapStaleClaims,
  filterDispatchPool,
  claimInstanceSlot,
  registrarResultadoChip,
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
//   3. seleciona as que ja venceram o proprio intervalo (60s = 1 por minuto);
//   4. reserva ATOMICAMENTE 1 slot no teto diario de cada uma;
//   5. faz o claim de 1 contato por chip habilitado (SKIP LOCKED) e dispara
//      todos em paralelo;
//   6. reagenda cada chip individualmente com um novo intervalo sorteado.
//
// Vazao = (no de chips conectados) x 480/dia, com o piso de seguranca de um
// envio por minuto POR CHIP, cada um puxando da sua sub-lista carimbada na
// importacao. Nenhum chip acelera porque outro parou.
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

/**
 * Registra sucesso/falha do chip e deixa o banco decidir o resfriamento:
 * N falhas seguidas (sinal precoce de shadowban, aparece antes de a conexao
 * cair) ou lote cheio (pausa longa para quebrar a cadencia mecanica).
 */
async function registrarSaude(instancia: string, sucesso: boolean): Promise<void> {
  try {
    const r = await registrarResultadoChip(instancia, sucesso, {
      maxFalhas: ANTIBAN.MAX_FALHAS_SEGUIDAS,
      cooldownMin: ANTIBAN.COOLDOWN_MIN,
      loteTamanho: ANTIBAN.LOTE_TAMANHO,
      pausaLoteMin: ANTIBAN.PAUSA_LOTE_MIN,
    });
    if (r?.cooldownAte && r.motivo) {
      console.warn(`[tick] chip ${instancia} em resfriamento (${r.motivo}) ate ${r.cooldownAte}`);
    }
  } catch (e) {
    console.error('[tick] registrarSaude:', e);
  }
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
      await markItemError(item.id, item.attempts || 0, r.error || 'Falha no envio pelo WhatsApp', instancia);
      await releaseDispatchSlot(instancia); // nada saiu do chip: devolve a cota
      await registrarSaude(instancia, false);
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

    await registrarSaude(instancia, true);
    return true;
  } catch (err: any) {
    await markItemError(item.id, item.attempts || 0, err?.message || 'Erro inesperado no envio', instancia);
    await releaseDispatchSlot(instancia);
    await registrarSaude(instancia, false);
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
  const todasConectadas = await getConnectedDispatchInstances();
  // Filtra pelo pool: chips conectados mas desmarcados no disparo ficam de fora
  // (atendimento manual no Inbox continua funcionando neles).
  const conectadas = await filterDispatchPool(todasConectadas);
  if (conectadas.length === 0) {
    return {
      success: true,
      skipped: todasConectadas.length > 0 ? 'nenhum_chip_no_pool_de_disparo' : 'nenhuma_instancia_conectada',
      instanciasConectadas: todasConectadas.length,
      status: await getQueueStatus(),
    };
  }

  // 5. Disputa ATOMICA do ritmo de cada chip. Quem vence avanca o proprio
  //    next_allowed_at e ganha o direito de enviar neste ciclo; os ticks
  //    concorrentes que perderem saem sem enviar. Isso e o que impede o MESMO
  //    chip de mandar duas mensagens no mesmo segundo quando o cron, o worker
  //    e as abas abertas disparam o tick ao mesmo tempo.
  // Ordem de atendimento: MENOR carga relativa (sentToday/cap) primeiro. Com o
  // warm-up ligado os tetos ficam diferentes entre os chips, entao round-robin
  // cego sobrecarregaria o chip novo enquanto o maduro fica ocioso.
  const carga = await Promise.all(
    conectadas.map(async (inst) => {
      const gate = await checkDispatchGate(inst);
      return { inst, rel: gate.sentToday / (gate.dailyCap || 1) };
    })
  );
  const ordenadas = carga.sort((a, b) => a.rel - b.rel).map((c) => c.inst);

  const prontas: string[] = [];
  for (const inst of ordenadas) {
    const venceu = await claimInstanceSlot(inst, sortearGapSegundos());
    if (venceu) prontas.push(inst);
  }

  if (prontas.length === 0) {
    return {
      success: true,
      skipped: 'aguardando_intervalo',
      instanciasConectadas: conectadas.length,
      instanciasProntas: 0,
      status: await getQueueStatus(),
    };
  }

  // 6. Reserva 1 slot no teto diario de cada chip que venceu o ritmo. A reserva
  //    e atomica: e ela que garante o limite de 480/dia mesmo com ticks
  //    simultaneos.
  const habilitadas: string[] = [];
  for (const inst of prontas) {
    const slot = await reserveDispatchSlot(inst);
    if (slot.ok) {
      habilitadas.push(inst);
    } else if (slot.reason === 'teto_diario') {
      // Chip fechou as 480 do dia: dorme 1h antes de reavaliar.
      await setInstanceNextAllowedAt(inst, Date.now() + 60 * 60 * 1000);
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

  // 7. Cada chip puxa da PROPRIA sub-lista (carimbada na importacao). Se a
  //    sub-lista dele acabou, ou se outro chip caiu e deixou orfaos, o claim
  //    redistribui -- mas nunca toca no que esta reservado para um chip vivo.
  const pares: Array<{ inst: string; item: QueueItem }> = [];
  for (const inst of habilitadas) {
    const [item] = await claimPendingItemsForInstance(inst, 1, conectadas);
    if (item) pares.push({ inst, item });
    else await releaseDispatchSlot(inst); // nada para este chip: devolve a cota
  }

  if (pares.length === 0) {
    return { success: true, skipped: 'fila_vazia', status: await getQueueStatus() };
  }

  // 8. Dispara em paralelo: 1 contato por chip, exatamente.
  const enviados: string[] = [];
  const falhas: string[] = [];

  const resultados = await Promise.allSettled(
    pares.map((p) => dispararContato(p.item, p.inst))
  );

  resultados.forEach((r, idx) => {
    if (r.status === 'fulfilled' && r.value) enviados.push(pares[idx].item.phone);
    else falhas.push(pares[idx].item.phone);
  });

  // 9. NAO reagenda aqui: o intervalo de cada chip ja foi fixado no passo 5,
  //    ANTES do envio, pelo claimInstanceSlot atomico. Regravar depois abriria
  //    de novo a janela de corrida que o passo 5 fecha.

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
