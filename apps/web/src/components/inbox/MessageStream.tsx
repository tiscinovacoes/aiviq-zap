'use client';

import React, { useEffect, useRef } from 'react';
import { Check, CheckCheck, Loader2, MessageSquare } from 'lucide-react';
import { useInboxStore } from '@/store/useInboxStore';

interface MessageStreamProps {
  onApplySuggestion?: (text: string) => void;
}

function formatClientTime(val?: string): string {
  if (!val) return '';
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return val;
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
        return (
          <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
        );
      default:
        return null;
    }
  };

  const todayLabel = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/60">
      {/* Date Header Dinâmico */}
      <div className="text-center">
        <span className="text-[11px] px-3 py-1 rounded-full bg-white text-slate-500 border border-slate-200 shadow-xs">
          Hoje, {todayLabel}
        </span>
      </div>

      {isLoadingMessages ? (
        <div className="flex items-center justify-center p-12 text-slate-400 gap-2 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          <span>Carregando histórico...</span>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-2 text-xs">
          <MessageSquare className="w-7 h-7 text-slate-300" />
          <span>Nenhuma mensagem nesta conversa ainda.</span>
        </div>
      ) : (
        messages.map((msg) => {
          const isAgent = msg.sender_type === 'agent';
          const formattedTime = formatClientTime(msg.created_at);

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-baseline gap-2 mb-1 px-1">
                <span className="text-xs font-medium text-slate-600">
                  {msg.sender_name || (isAgent ? 'Você' : activeConversation?.contact?.name)}
                </span>
                <span className="text-[10px] text-slate-400">{formattedTime}</span>
              </div>

              <div
                className={`max-w-xl p-3.5 rounded-2xl text-sm leading-relaxed flex flex-col gap-1.5 ${
                  isAgent
                    ? 'bg-emerald-600 text-white rounded-tr-sm shadow-sm'
                    : 'bg-white text-slate-800 rounded-tl-sm border border-slate-200 shadow-xs'
                }`}
              >
                <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                {isAgent && (
                  <div className="self-end flex items-center gap-1 text-[10px] text-emerald-100">
                    <span>{formattedTime}</span>
                    {getStatusIcon(msg.delivery_status)}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      <div ref={bottomRef} />
    </div>
  );
}
