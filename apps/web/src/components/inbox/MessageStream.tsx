'use client';

import React, { useEffect, useRef } from 'react';
import { Check, CheckCheck, Sparkles, Loader2 } from 'lucide-react';
import { useInboxStore } from '@/store/useInboxStore';

interface MessageStreamProps {
  onApplySuggestion?: (text: string) => void;
}

export default function MessageStream({ onApplySuggestion }: MessageStreamProps) {
  const { messages, isLoadingMessages, activeConversation } = useInboxStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-slate-400" />;
      case 'sent':
        return <Check className="w-3.5 h-3.5 text-slate-400" />;
      case 'sending':
        return <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-[#090d16] to-[#0a0e17]/80">
      {/* Date Header */}
      <div className="text-center">
        <span className="text-[11px] px-3 py-1 rounded-full bg-white/5 text-slate-400 border border-white/5">
          Hoje, 24 de Outubro
        </span>
      </div>

      {isLoadingMessages ? (
        <div className="flex items-center justify-center p-12 text-slate-500 gap-2 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Carregando histórico...</span>
        </div>
      ) : (
        messages.map((msg) => {
          const isAgent = msg.sender_type === 'agent';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-baseline gap-2 mb-1 px-1">
                <span className="text-xs font-medium text-slate-400">
                  {msg.sender_name || (isAgent ? 'Você' : activeConversation?.contact?.name)}
                </span>
                <span className="text-[10px] text-slate-500">{msg.created_at}</span>
              </div>

              <div
                className={`max-w-xl p-3.5 rounded-2xl text-sm leading-relaxed flex flex-col gap-1.5 ${
                  isAgent
                    ? 'bg-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-600/20'
                    : 'bg-[#181b25] text-slate-200 rounded-tl-sm border border-white/10'
                }`}
              >
                <span>{msg.content}</span>
                {isAgent && (
                  <div className="self-end flex items-center gap-1 text-[10px] text-indigo-200">
                    <span>{msg.created_at}</span>
                    {getStatusIcon(msg.delivery_status)}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* AI Copilot Suggestion Box (for Mariana Silva or when last message asks for payment) */}
      {activeConversation?.id === 'conv-001' && (
        <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 backdrop-blur-md shadow-lg space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
              <Sparkles className="w-4 h-4" />
              <span>Sugestão de IA (Qwen / Poli Agent)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                98% de precisão
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-normal">
            Gerar link de checkout seguro do Plano Pro (R$ 890,00) via gateway integrado com 1 clique.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() =>
                onApplySuggestion?.(
                  'Perfeito, Mariana! Aqui está o link seguro para contratação imediata do Plano Pro: https://checkout.poli.dev/pro?org=techcorp'
                )
              }
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Inserir Sugestão
            </button>
            <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs transition-colors">
              Regerar
            </button>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
