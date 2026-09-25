import { isPlaceholderEnv } from '@/lib/supabase/authContext';
import { sendRealMessageDetailed, getConnectedDispatchInstances } from '@/lib/evolutionService';
import {
  reserveDispatchSlot,
  releaseDispatchSlot,
  dentroDaJanela,
  intervaloFixoDoChipSegundos,
  intervaloEntreChipsSegundos,
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
  ehErroPermanente,
  getQueueStatus,
  getChipsEmCooldown,
  type QueueItem,
} from '@/lib/dispatchQueue';

// ===========================================================================
// MOTOR DE DISPARO MULTI-INSTANCIA
//
// Uma campanha, N chips. Cada chip tem o SEU teto diario (ANTIBAN.DAILY_CAP =
// 150) e o SEU intervalo FIXO (janela util 8h-21h / teto -> 5 min). A cada tick:
//
//   1. devolve a fila contatos presos em 'processando' (worker que morreu);
//   2. pergunta a Evolution quais instancias estao conectadas;
//   3. seleciona as que ja venceram o proprio intervalo fixo;
//   4. disputa o REVEZAMENTO do pool: no maximo 1 envio por vez, espacado de
//      (intervalo / no de chips), para os chips se alternarem;
//   5. disputa atomicamente o relogio do chip da vez e reserva 1 slot no teto;
//   6. faz o claim de 1 contato da sub-lista dele e dispara.
//
// Vazao = (no de chips conectados) x 150/dia, espalhada pela janela inteira.
// Nenhum chip acelera porque outro parou.
// ===========================================================================

/**
 * Linha de controle do POOL em dispatch_instance_control: guarda o relogio do
 * revezamento entre chips. Nao e uma instancia da Evolution -- nunca aparece
 * como conectada, entao nunca entra no pool de disparo.
 */
const POOL_SLOT = '__revezamento_pool__';

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

/**
 * Dispara 1 contato por um chip especifico. Devolve o slot se o envio falhar.
 *
 * A sessao da pesquisa (pesquisa_senado, etapa='disparado') so e criada DEPOIS
 * do envio confirmado. Antes, a sessao nascia ANTES da tentativa de envio: um
 * numero que nao existe (ou qualquer outra falha) ficava com etapa='disparado'
 * no funil mesmo sem a Msg 1 ter chegado -- inflava a coluna 1 do funil e as
 * estatisticas com contatos que nunca receberam nada.
 */
async function dispararContato(item: QueueItem, instancia: string): Promise<boolean> {
  try {
    const msg1 = gerarMensagem1(item.name, item.phone);
    const r = await sendRealMessageDetailed(item.phone, msg1, instancia, ANTIBAN.PRESENCA_MS);

    if (!r.ok) {
      const erroMsg = r.error || 'Falha no envio pelo WhatsApp';
      await markItemError(item.id, item.attempts || 0, erroMsg, instancia);
      await releaseDispatchSlot(instancia); // nada saiu do chip: devolve a cota
      // Numero que nao existe no WhatsApp nao e culpa do CHIP -- nao conta
      // para o cooldown de falhas seguidas dele (90 min de resfriamento).
      if (!ehErroPermanente(erroMsg)) await registrarSaude(instancia, false);
      return false;
    }

    const instEnviou = r.instance || instancia;
    await markItemSent(item.id, instEnviou, r.messageId);

    // So agora, com o envio CONFIRMADO, a sessao entra no funil como
    // 'disparado' -- e essa mesma sessao que o disparo individual usa para
    // bloquear reenvio (ver route.ts), entao registra-la antes do envio
    // deixava tanto o funil quanto aquele bloqueio errados numa falha.
    await createOrUpdateSessionByPhone(item.phone, item.name || `Eleitor ${item.phone.slice(-4)}`, {
      bairro: item.bairro,
      etapa: 'disparado',
      instanceName: instEnviou,
      voto1Id: undefined,
      voto1Nome: undefined,
      voto2Id: undefined,
      voto2Nome: undefined,
    });

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

export async function runTickCore(options?: {
  bypassHorario?: boolean;
  forceNow?: boolean;
}): Promise<TickCoreResult> {
  if (isPlaceholderEnv()) {
    return { success: true, skipped: 'placeholder' };
  }

  // 1. Pausado pelo operador?
  const ctrl = await getControlState();
  if (ctrl.paused) {
    return { success: true, skipped: 'pausado', status: await getQueueStatus() };
  }

  // 2. Janela de horario (fuso MS: 8h-21h) — permite bypass em testes explicitamente autorizados
  if (!options?.bypassHorario && !dentroDaJanela()) {
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

  // forceNow NAO zera mais o intervalo dos chips. Zerar o relogio a cada
  // chamada (?force=true, test_simultaneo) fazia o chip disparar varias vezes
  // em segundos, furando o gap anti-ban -- rajada e o perfil que derruba chip.
  // O intervalo fixo de cada chip e respeitado sempre; force so libera a
  // janela de horario.

  // 5. Carga e intervalo FIXO de cada chip. O intervalo sai do teto do dia do
  //    proprio chip (janela util / teto): 150/dia -> 5 min cravados. Ordem de
  //    atendimento: MENOR carga relativa (sentToday/cap) primeiro, para o chip
  //    que ficou para tras (warm-up, reconexao) nao ser atropelado.
  const agora = Date.now();
  const [carga, proximos, cooldowns] = await Promise.all([
    Promise.all(
      conectadas.map(async (inst) => {
        const gate = await checkDispatchGate(inst, options?.bypassHorario);
        const cap = gate.dailyCap || ANTIBAN.DAILY_CAP;
        return { inst, rel: gate.sentToday / (cap || 1), gap: intervaloFixoDoChipSegundos(cap) };
      })
    ),
    getInstanceNextAllowedAt(conectadas),
    getChipsEmCooldown(),
  ]);
  const ordenadas = carga.sort((a, b) => a.rel - b.rel);

  // Chips cujo relogio fixo ja venceu (e que nao estao resfriando).
  const vencidos = ordenadas.filter(
    (c) => (proximos[c.inst] || 0) <= agora && !cooldowns[c.inst]
  );
  if (vencidos.length === 0) {
    return {
      success: true,
      skipped: 'aguardando_intervalo',
      instanciasConectadas: conectadas.length,
      instanciasProntas: 0,
      status: await getQueueStatus(),
    };
  }

  // 6. REVEZAMENTO entre chips: no maximo UM envio do pool por vez, espacado
  //    de (menor intervalo fixo / no de chips). Com 2 chips de 5 min sai uma
  //    mensagem a cada 2m30, alternando A/B -- os chips nunca disparam no
  //    mesmo segundo. A disputa e atomica (mesma RPC do ritmo por chip, numa
  //    linha de controle do pool), entao o cron, o worker e as abas abertas
  //    nao furam o espacamento.
  const espacoPool = intervaloEntreChipsSegundos(ordenadas.map((c) => c.gap));
  const poolLiberado = await claimInstanceSlot(POOL_SLOT, espacoPool);
  if (!poolLiberado) {
    return {
      success: true,
      skipped: 'revezamento_entre_chips',
      instanciasConectadas: conectadas.length,
      instanciasProntas: vencidos.length,
      status: await getQueueStatus(),
    };
  }

  // 7. Disputa ATOMICA do relogio do chip escolhido: quem vence avanca o
  //    proprio next_allowed_at em exatamente o intervalo fixo dele. Se outro
  //    tick levou esse chip no meio do caminho, tenta o proximo vencido.
  let escolhido: string | null = null;
  for (const c of vencidos) {
    if (await claimInstanceSlot(c.inst, c.gap)) {
      escolhido = c.inst;
      break;
    }
  }
  if (!escolhido) {
    return {
      success: true,
      skipped: 'aguardando_intervalo',
      instanciasConectadas: conectadas.length,
      instanciasProntas: 0,
      status: await getQueueStatus(),
    };
  }
  const prontas = [escolhido];

  // Reserva 1 slot no teto diario do chip escolhido. A reserva e atomica: e
  // ela que garante o limite diario mesmo com ticks simultaneos.
  const habilitadas: string[] = [];
  for (const inst of prontas) {
    const slot = await reserveDispatchSlot(inst, options?.bypassHorario);
    if (slot.ok) {
      habilitadas.push(inst);
    } else if (slot.reason === 'teto_diario') {
      // Chip fechou o teto do dia: dorme 1h antes de reavaliar.
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

  // O chip puxa da PROPRIA sub-lista (carimbada na importacao). Se a sub-lista
  // dele acabou, ou se outro chip caiu e deixou orfaos, o claim redistribui --
  // mas nunca toca no que esta reservado para um chip vivo.
  const pares: Array<{ inst: string; item: QueueItem }> = [];
  for (const inst of habilitadas) {
    const [item] = await claimPendingItemsForInstance(inst, 1, conectadas);
    if (item) pares.push({ inst, item });
    else await releaseDispatchSlot(inst); // nada para este chip: devolve a cota
  }

  if (pares.length === 0) {
    return { success: true, skipped: 'fila_vazia', status: await getQueueStatus() };
  }

  // 8. Dispara: 1 contato, pelo chip da vez.
  const enviados: string[] = [];
  const falhas: string[] = [];

  const resultados = await Promise.allSettled(
    pares.map((p) => dispararContato(p.item, p.inst))
  );

  resultados.forEach((r, idx) => {
    if (r.status === 'fulfilled' && r.value) enviados.push(pares[idx].item.phone);
    else falhas.push(pares[idx].item.phone);
  });

  // 9. NAO reagenda aqui: o intervalo do chip ja foi fixado no passo 7,
  //    ANTES do envio, pelo claimInstanceSlot atomico. Regravar depois abriria
  //    de novo a janela de corrida que o passo 7 fecha.

  // Relogio agregado (o que a UI mostra): o chip que libera primeiro.
  // Respeita tambem o revezamento: o pool so libera o proximo envio quando o
  // chip da vez venceu E o espacamento entre chips passou.
  const novosProximos = await getInstanceNextAllowedAt([...conectadas, POOL_SLOT]);
  const proximoDoPool = Math.max(
    Math.min(...conectadas.map((i) => novosProximos[i] || 0)),
    novosProximos[POOL_SLOT] || 0
  );
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
