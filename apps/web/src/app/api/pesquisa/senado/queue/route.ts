import { NextRequest, NextResponse } from 'next/server';
import {
  enqueueContacts,
  setPaused,
  clearPending,
  getQueueStatus,
  getFailedItems,
  requeueFailedItems,
  filterDispatchPool,
  getProgressoPorChip,
  prepararDisparoSimultaneo,
  listarLotesAtivos,
  cancelarLote,
} from '@/lib/dispatchQueue';
import { triggerServerDispatchCycle, stopServerDispatchWorker } from '@/lib/serverDispatchWorker';
import { getConnectedDispatchInstances } from '@/lib/evolutionService';
import { runTickCore } from '@/lib/pesquisaSenadoDispatcher';

export const dynamic = 'force-dynamic';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

// GET: status da fila para a UI (progresso, pausado, próximo em Xs) + lista de falhas para auditoria.
export async function GET() {
  try {
    const [status, falhas, porChip, lotes] = await Promise.all([
      getQueueStatus(),
      getFailedItems(100),
      getProgressoPorChip(),
      listarLotesAtivos(),
    ]);

    // Se a fila estiver ativa com pendentes e sem timer rodando, aciona o worker em 2º plano
    if (status.ativo && status.pendentes > 0 && !status.pausado) {
      triggerServerDispatchCycle(false).catch((e) =>
        console.error('[queue GET] Erro ao engatilhar worker:', e)
      );
    }

    return NextResponse.json(
      { success: true, status, falhas, porChip, lotes },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

// POST: ações de controle da fila do disparo em massa.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === 'enfileirar' || action === 'enqueue') {
      const contatos = Array.isArray(body.contatos) ? body.contatos : [];
      if (contatos.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Lista de contatos vazia' },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }
      // Divide a lista entre os chips conectados E no pool de disparo, na hora
      // da importacao. Assim da para conferir chip a chip em vez de descobrir a
      // distribuicao so depois que a campanha rodou.
      const chips = await filterDispatchPool(await getConnectedDispatchInstances());
      const r = await enqueueContacts(contatos, {
        permitirReenvio: body.permitirReenvio === true,
        chips,
        nomeLote: typeof body.nomeLote === 'string' ? body.nomeLote.slice(0, 200) : undefined,
      });
      const status = await getQueueStatus();

      // Dispara imediatamente o primeiro ciclo de 2 contatos simultâneos em segundo plano
      triggerServerDispatchCycle(true).catch((e) =>
        console.error('[queue POST enfileirar] Erro ao acionar worker:', e)
      );

      return NextResponse.json(
        { success: true, ...r, status },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // Cancela SÓ um lote (uma importação específica) -- os pendentes de
    // outras filas continuam sendo trabalhados normalmente.
    if (action === 'cancelar_lote') {
      const loteId = String(body.loteId || '');
      if (!loteId) {
        return NextResponse.json(
          { success: false, error: 'loteId é obrigatório' },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }
      const cancelados = await cancelarLote(loteId);
      return NextResponse.json(
        { success: true, cancelados },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (action === 'pausar' || action === 'pause') {
      await setPaused(true);
      stopServerDispatchWorker();
      return NextResponse.json(
        { success: true, status: await getQueueStatus() },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (action === 'retomar' || action === 'resume' || action === 'iniciar') {
      const preparo = await prepararDisparoSimultaneo();
      await setPaused(false);
      // Retoma imediatamente os disparos em segundo plano
      triggerServerDispatchCycle(true).catch((e) =>
        console.error('[queue POST retomar] Erro ao acionar worker:', e)
      );
      return NextResponse.json(
        {
          success: true,
          status: await getQueueStatus(),
          preparo,
          porChip: await getProgressoPorChip(),
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (action === 'sincronizar_chips' || action === 'preparar') {
      const preparo = await prepararDisparoSimultaneo();
      await setPaused(false);
      return NextResponse.json(
        {
          success: true,
          status: await getQueueStatus(),
          preparo,
          porChip: await getProgressoPorChip(),
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (action === 'test_simultaneo') {
      const rodadas = Math.min(Number(body.rodadas) || 3, 5);
      const delayMs = Math.min(Number(body.delayEntreRodadasMs) || 5000, 15000);
      const historicoRodadas: any[] = [];

      // Sincroniza chips antes de iniciar o teste
      await prepararDisparoSimultaneo();

      for (let r = 1; r <= rodadas; r++) {
        const tickRes = await runTickCore({ bypassHorario: true, forceNow: true });
        historicoRodadas.push({
          rodada: r,
          timestamp: new Date().toISOString(),
          enviados: tickRes.enviados || [],
          totalEnviados: tickRes.totalEnviados || 0,
          falhas: tickRes.falhas || [],
          instanciasConectadas: tickRes.instanciasConectadas,
          instanciasProntas: tickRes.instanciasProntas,
          skipped: tickRes.skipped,
        });

        if (r < rodadas) {
          await new Promise((res) => setTimeout(res, delayMs));
        }
      }

      return NextResponse.json(
        {
          success: true,
          rodadasExecutadas: rodadas,
          totalMensagensEnviadas: historicoRodadas.reduce((acc, cur) => acc + (cur.totalEnviados || 0), 0),
          historicoRodadas,
          status: await getQueueStatus(),
          porChip: await getProgressoPorChip(),
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (action === 'parar' || action === 'clear') {
      await clearPending();
      await setPaused(true);
      stopServerDispatchWorker();
      return NextResponse.json(
        { success: true, status: await getQueueStatus() },
        { headers: NO_CACHE_HEADERS }
      );
    }

    if (action === 'reenfileirar_falhas' || action === 'requeue_errors') {
      const reativados = await requeueFailedItems();
      await setPaused(false);
      triggerServerDispatchCycle(true).catch((e) =>
        console.error('[queue POST reenfileirar_falhas] Erro:', e)
      );
      return NextResponse.json(
        {
          success: true,
          reativados,
          message: `${reativados} contatos com falha foram re-enfileirados.`,
          status: await getQueueStatus(),
          falhas: await getFailedItems(100),
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Ação não reconhecida' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
