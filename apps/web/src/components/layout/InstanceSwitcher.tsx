'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Smartphone, Check, Plus, ChevronRight } from 'lucide-react';
import { useInstanceStore } from '@/store/useInstanceStore';

const statusColor: Record<string, string> = {
  connected: 'bg-emerald-500',
  connecting: 'bg-amber-500',
  disconnected: 'bg-slate-300',
};
const statusLabel: Record<string, string> = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
};

export default function InstanceSwitcher() {
  const { instances, selected, fetchInstances, setSelected } = useInstanceStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchInstances();
    const id = setInterval(fetchInstances, 20000);
    return () => clearInterval(id);
  }, [fetchInstances]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const active = instances.find((i) => i.instanceName === selected);
  const activeStatus = active?.status || 'disconnected';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Número ativo: ${active?.label || '—'}`}
        className="w-11 h-11 rounded-xl flex items-center justify-center relative text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all"
      >
        <Smartphone className="w-5 h-5" />
        <span
          className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${statusColor[activeStatus]}`}
        />
      </button>

      {open && (
        <div className="absolute left-[54px] top-0 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-2">
          <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Números de WhatsApp
          </div>
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {instances.length === 0 && (
              <div className="px-2 py-3 text-xs text-slate-400">
                Nenhum número encontrado. Adicione em Configurações.
              </div>
            )}
            {instances.map((i) => {
              const isSel = i.instanceName === selected;
              return (
                <button
                  key={i.instanceName}
                  onClick={() => {
                    setSelected(i.instanceName);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors ${
                    isSel ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor[i.status]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-800 truncate">{i.label}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {i.phoneNumber || statusLabel[i.status]}
                    </div>
                  </div>
                  {isSel && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                </button>
              );
            })}
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center justify-between px-2 py-2 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border-t border-slate-100"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Gerenciar números
            </span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
