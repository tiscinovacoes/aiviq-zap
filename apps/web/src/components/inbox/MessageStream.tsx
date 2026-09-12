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
    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/60">
      {/* Date Header */}
      <div className="text-center">
        <span className="text-[11px] px-3 py-1 rounded-full bg-white text-slate-500 border border-slate-200 shadow-xs">
          Hoje, 24 de Outubro
        </span>
      </div>

      {isLoadingMessages ? (
        <div className="flex items-center justify-center p-12 text-slate-400 gap-2 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
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
                <span className="text-xs font-medium text-slate-600">
                  {msg.sender_name || (isAgent ? 'Você' : activeConversation?.contact?.name)}
                </span>
                <span className="text-[10px] text-slate-400">{msg.created_at}</span>
              </div>

              <div
                className={`max-w-xl p-3.5 rounded-2xl text-sm leading-relaxed flex flex-col gap-1.5 ${
                  isAgent
                    ? 'bg-emerald-600 text-white rounded-tr-sm shadow-sm'
                    : 'bg-white text-slate-800 rounded-tl-sm border border-slate-200 shadow-xs'
                }`}
              >
                <span>{msg.content}</span>
                {isAgent && (
                  <div className="self-end flex items-center gap-1 text-[10px] text-emerald-100">
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
        <div className="p-4 rounded-xl bg-white border border-indigo-200 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-700 text-xs font-semibold">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Sugestão de IA (AIVIQ Copilot)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                98% de precisão
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-normal">
            Gerar link de checkout seguro do Plano Pro (R$ 890,00) via gateway integrado com 1 clique.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() =>
                onApplySuggestion?.(
                  'Perfeito, Mariana! Aqui está o link seguro para contratação imediata do Plano Pro: https://checkout.aiviq-zap.dev/pro?org=techcorp'
                )
              }
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
            >
              Inserir na Resposta
            </button>
            <button
              onClick={() => {}}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors"
            >
              Dispensar
            </button>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
