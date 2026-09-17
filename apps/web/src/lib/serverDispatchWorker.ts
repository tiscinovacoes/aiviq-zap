import { runTickCore } from '@/lib/pesquisaSenadoDispatcher';
import { getQueueStatus } from '@/lib/dispatchQueue';

declare global {
  // eslint-disable-next-line no-var
  var __aiviq_server_dispatch_timer: NodeJS.Timeout | null | undefined;
  // eslint-disable-next-line no-var
  var __aiviq_server_dispatch_busy: boolean | undefined;
}

if (typeof global.__aiviq_server_dispatch_timer === 'undefined') {
  global.__aiviq_server_dispatch_timer = null;
}
if (typeof global.__aiviq_server_dispatch_busy === 'undefined') {
  global.__aiviq_server_dispatch_busy = false;
}

export function stopServerDispatchWorker() {
  if (global.__aiviq_server_dispatch_timer) {
    clearTimeout(global.__aiviq_server_dispatch_timer);
    global.__aiviq_server_dispatch_timer = null;
  }
  global.__aiviq_server_dispatch_busy = false;
  console.log('[ServerDispatchWorker] Worker de segundo plano interrompido.');
}

export async function triggerServerDispatchCycle(immediate = false) {
  if (global.__aiviq_server_dispatch_busy) {
    return;
  }

  // Se já há um timer agendado e não é disparo imediato, aguarda o timer natural
  if (global.__aiviq_server_dispatch_timer && !immediate) {
    return;
  }

  if (global.__aiviq_server_dispatch_timer) {
    clearTimeout(global.__aiviq_server_dispatch_timer);
    global.__aiviq_server_dispatch_timer = null;
  }

  const status = await getQueueStatus();
  if (status.pausado || status.pendentes <= 0) {
    stopServerDispatchWorker();
    return;
  }

  const delayMs = immediate
    ? 0
    : Math.max(1000, (status.segundosRestantesProximo || 60) * 1000);

  global.__aiviq_server_dispatch_timer = setTimeout(async () => {
    global.__aiviq_server_dispatch_timer = null;
    global.__aiviq_server_dispatch_busy = true;

    try {
      const res = await runTickCore();
      console.log('[ServerDispatchWorker] Ciclo executado:', {
        enviados: res.enviados?.length || 0,
        pendentes: res.status?.pendentes || 0,
        pausado: res.status?.pausado || false,
      });

      if (res.status && res.status.pendentes > 0 && !res.status.pausado) {
        // Agenda o próximo ciclo de 2 contatos por minuto (60s)
        const proximoDelayMs = Math.max(5000, (res.status.segundosRestantesProximo || 60) * 1000);
        global.__aiviq_server_dispatch_timer = setTimeout(() => {
          triggerServerDispatchCycle(true);
        }, proximoDelayMs);
      } else {
        console.log('[ServerDispatchWorker] Fila de disparos concluída ou pausada.');
      }
    } catch (err) {
      console.error('[ServerDispatchWorker] Erro no ciclo de disparo:', err);
      // Tenta novamente após 15 segundos em caso de falha transitória
      global.__aiviq_server_dispatch_timer = setTimeout(() => {
        triggerServerDispatchCycle(true);
      }, 15000);
    } finally {
      global.__aiviq_server_dispatch_busy = false;
    }
  }, delayMs);
}
