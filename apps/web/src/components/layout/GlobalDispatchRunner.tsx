'use client';

import React, { useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Send,
  Pause,
  Play,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ChevronRight,
  X,
} from 'lucide-react';
import type { EstadoDisparador } from '@/lib/disparadorTypes';

export default function GlobalDispatchRunner() {
  const pathname = usePathname();
  const router = useRouter();

  const [status, setStatus] = useState<EstadoDisparador | null>(null);
  const [bannerFechado, setBannerFechado] = useState(false);
  const [concluidoToast, setConcluidoToast] = useState<string | null>(null);

  const statusRef = useRef<EstadoDisparador | null>(null);
  const isTickRunningRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const previousTotalRef = useRef<number>(0);

  // 1. Inicializa Web Worker para evitar throttling do navegador em aba em 2º plano
  useEffect(() => {
    // Código do Web Worker em blob: gera um tick a cada 1000ms ininterruptamente
    const workerBlob = new Blob(
      [
        `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!timer) {
              timer = setInterval(() => {
                self.postMessage('tick');
              }, 1000);
            }
          } else if (e.data === 'stop') {
            if (timer) {
              clearInterval(timer);
              timer = null;
            }
          }
        };
      `,
      ],
      { type: 'application/javascript' }
    );

    const workerUrl = URL.createObjectURL(workerBlob);
    const worker = new Worker(workerUrl);
    workerRef.current = worker;

    worker.postMessage('start');

    worker.onmessage = () => {
      // A cada segundo pelo worker ininterrupto
      const cur = statusRef.current;
      if (!cur || !cur.ativo || cur.pausado) return;

      if (cur.segundosRestantesProximo > 0) {
        const nextSec = cur.segundosRestantesProximo - 1;
        const updated = { ...cur, segundosRestantesProximo: nextSec };
        statusRef.current = updated;
        setStatus(updated);

        // Se zerou, aciona o tick para disparar 2 simultâneos
        if (nextSec === 0 && !isTickRunningRef.current) {
          executarTick();
        }
      } else if (!isTickRunningRef.current) {
        executarTick();
      }
    };

    return () => {
      worker.postMessage('stop');
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, []);

  // 2. Consulta o status da fila no servidor
  const consultarFila = async () => {
    try {
      const res = await fetch(`/api/pesquisa/senado/queue?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      if (data?.success && data.status) {
        const s = data.status;
        const novoStatus: EstadoDisparador = {
          ativo: Boolean(s.ativo),
          pausado: Boolean(s.pausado),
          total: s.total || 0,
          enviados: s.enviados || 0,
          erros: s.erros || 0,
          emRetentativa: s.emRetentativa || 0,
          segundosRestantesProximo: s.segundosRestantesProximo || 0,
          fila: [],
        };

        // Detecta conclusão
        if (
          previousTotalRef.current > 0 &&
          novoStatus.total > 0 &&
          novoStatus.enviados + novoStatus.erros >= novoStatus.total &&
          !novoStatus.ativo
        ) {
          setConcluidoToast(
            `🎉 Disparo em segundo plano finalizado! ${novoStatus.enviados} mensagens enviadas.`
          );
          previousTotalRef.current = 0;
          setTimeout(() => setConcluidoToast(null), 8000);
        }

        if (novoStatus.ativo && novoStatus.total > 0) {
          previousTotalRef.current = novoStatus.total;
        }

        statusRef.current = novoStatus;
        setStatus(novoStatus);

        // Notifica outros componentes (como o Kanban) da atualização em tempo real
        window.dispatchEvent(
          new CustomEvent('aiviq:queue-updated', {
            detail: { status: novoStatus, falhas: data.falhas || [] },
          })
        );
      }
    } catch {
      // Silencioso em background
    }
  };

  // 3. Executa o tick (disparo de 2 contatos simultâneos)
  const executarTick = async () => {
    if (isTickRunningRef.current) return;
    isTickRunningRef.current = true;

    try {
      const res = await fetch(`/api/pesquisa/senado/tick?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        cache: 'no-store',
      });
      const data = await res.json();

      if (data?.status) {
        const s = data.status;
        const novoStatus: EstadoDisparador = {
          ativo: Boolean(s.ativo),
          pausado: Boolean(s.pausado),
          total: s.total || 0,
          enviados: s.enviados || 0,
          erros: s.erros || 0,
          emRetentativa: s.emRetentativa || 0,
          segundosRestantesProximo: s.segundosRestantesProximo || 60,
          fila: [],
        };
        statusRef.current = novoStatus;
        setStatus(novoStatus);

        window.dispatchEvent(
          new CustomEvent('aiviq:queue-updated', {
            detail: { status: novoStatus, falhas: [] },
          })
        );
      } else {
        await consultarFila();
      }
    } catch {
      await consultarFila();
    } finally {
      isTickRunningRef.current = false;
    }
  };

  // Polling periódico de reconciliação com o banco (a cada 10 segundos)
  useEffect(() => {
    consultarFila();
    const interval = setInterval(consultarFila, 10000);
    return () => clearInterval(interval);
  }, []);

  // Controles de Pausar / Retomar da barra global
  const handleControlarFila = async (action: 'retomar' | 'pausar') => {
    try {
      await fetch('/api/pesquisa/senado/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await consultarFila();
    } catch (e) {
      console.error('Erro ao controlar fila:', e);
    }
  };

  const estaNoKanban = pathname === '/crm';
  const temFilaAtiva = status && status.total > 0 && status.enviados + status.erros < status.total;

  return (
    <>
      {/* Toast de Conclusão de Disparo */}
      {concluidoToast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-700 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 text-xs font-semibold animate-in slide-in-from-top duration-300">
          <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
          <span>{concluidoToast}</span>
          <button
            onClick={() => setConcluidoToast(null)}
            className="ml-2 hover:bg-emerald-800 p-1 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* Floating Bar em Segundo Plano (visível quando o usuário sai da tela do CRM / Kanban) */}
      {!estaNoKanban && temFilaAtiva && !bannerFechado && (
        <div className="fixed bottom-4 left-20 right-6 z-40 bg-slate-900/95 text-white border border-slate-700/80 rounded-xl px-5 py-3 shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4 text-xs animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <Send className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">Disparo Ativo em Segundo Plano:</span>
                <span className="text-emerald-400 font-semibold">
                  {status.enviados} de {status.total} enviados
                </span>
                {status.erros > 0 && (
                  <span className="text-rose-400 text-[11px]">({status.erros} falhas)</span>
                )}
                {status.pausado ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30">
                    PAUSADO
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/30 flex items-center gap-1">
                    <Clock className="w-3 h-3 animate-spin" />
                    Multi-Instâncias (1/min por chip)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                {status.pausado
                  ? 'Envios pausados pelo operador.'
                  : `Próximo ciclo em ${status.segundosRestantesProximo || 60}s. A campanha continua mesmo navegando no sistema.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {status.pausado ? (
              <button
                onClick={() => handleControlarFila('retomar')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Retomar</span>
              </button>
            ) : (
              <button
                onClick={() => handleControlarFila('pausar')}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pausar</span>
              </button>
            )}

            <button
              onClick={() => router.push('/crm')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors border border-slate-700"
            >
              <span>Ver no CRM</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => setBannerFechado(true)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
              title="Minimizar aviso (os disparos continuam em 2º plano)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
