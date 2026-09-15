'use client';

import React from 'react';
import Link from 'next/link';
import { Search, Loader2, Smartphone, QrCode } from 'lucide-react';
import { useInboxStore } from '@/store/useInboxStore';
import { Conversation, ConversationStatus } from '@/types';

export default function ConversationList() {
  const {
    conversations,
    activeConversation,
    selectConversation,
    statusFilter,
    setStatusFilter,
    channelFilter,
    setChannelFilter,
    searchQuery,
    setSearchQuery,
    isLoading,
    isWhatsAppConnected,
  } = useInboxStore();

  const getChannelBadge = (channel?: string) => {
    switch (channel) {
      case 'whatsapp_cloud':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">WhatsApp</span>;
      case 'instagram':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-700 border border-pink-200 font-medium">Instagram</span>;
      case 'webchat':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 font-medium">Webchat</span>;
      default:
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">Omni</span>;
    }
  };

  return (
    <section className="w-[360px] h-full bg-white border-r border-slate-200 flex flex-col">
      {/* Header & Controls */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base text-slate-900">Conversas</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
            {conversations.length} ativas
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar contatos, tags (⌘K)..."
            className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Status Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
          {(['open', 'pending', 'resolved'] as ConversationStatus[]).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`flex-1 py-1 rounded-md transition-all font-medium capitalize ${
                statusFilter === st ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {st === 'open' ? 'Abertas' : st === 'pending' ? 'Pendentes' : 'Resolvidas'}
            </button>
          ))}
        </div>

        {/* Channel filter pills */}
        <div className="flex gap-1.5 overflow-x-auto text-[11px] pt-1">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'whatsapp_cloud', label: 'WhatsApp' },
            { key: 'instagram', label: 'Instagram' },
            { key: 'webchat', label: 'Webchat' },
          ].map((ch) => (
            <button
              key={ch.key}
              onClick={() => setChannelFilter(ch.key)}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                channelFilter === ch.key
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold'
                  : 'bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-900'
              }`}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversations Feed */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-slate-400 gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Carregando conversas...</span>
          </div>
        ) : !isWhatsAppConnected && conversations.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs flex flex-col items-center justify-center my-auto py-12">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-3 text-amber-600 shadow-xs">
              <Smartphone className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-800 text-sm mb-1">WhatsApp Desconectado</p>
            <p className="text-slate-500 text-xs mb-4 max-w-[240px] leading-relaxed">
              Nenhum número conectado no momento. Conecte seu WhatsApp para carregar mensagens em tempo real.
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              Conectar WhatsApp
            </Link>
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            Nenhuma conversa encontrada neste filtro.
          </div>
        ) : (
          conversations.map((conv) => {
            const isSelected = activeConversation?.id === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`p-3.5 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-emerald-50/60 border-l-4 border-emerald-600'
                    : 'hover:bg-slate-50 border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">
                      {conv.contact?.name || 'Cidadão'}
                    </span>
                    {getChannelBadge(conv.channel_type)}
                  </div>
                  <span className="text-[11px] text-slate-400">{conv.last_message_at}</span>
                </div>

                <p className="text-xs text-slate-600 line-clamp-1 mb-2">
                  {conv.last_message_preview}
                </p>

                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex gap-1.5 flex-wrap">
                    {conv.contact?.tags?.map((tag) => (
                      <span
                        key={tag}
                        className={`px-1.5 py-0.5 rounded font-medium ${
                          tag === 'VIP'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : tag === 'Urgente'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {conv.unread_count > 0 && (
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Realtime telemetry status bar */}
      <div className="p-2.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isWhatsAppConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="font-medium text-slate-700">
            {isWhatsAppConnected ? 'WhatsApp: Conectado' : 'WhatsApp: Desconectado'}
          </span>
        </div>
        <span className="text-slate-400 text-[10px] font-medium">Poli 2.0 Realtime</span>
      </div>
    </section>
  );
}
