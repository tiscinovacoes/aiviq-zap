'use client';

import React from 'react';
import { Search, Loader2 } from 'lucide-react';
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
  } = useInboxStore();

  const getChannelBadge = (channel?: string) => {
    switch (channel) {
      case 'whatsapp_cloud':
        return <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-medium">WhatsApp</span>;
      case 'instagram':
        return <span className="text-[10px] px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 font-medium">Instagram</span>;
      case 'webchat':
        return <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-medium">Webchat</span>;
      default:
        return <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-500/20 text-slate-300 font-medium">Omni</span>;
    }
  };

  return (
    <section className="w-[360px] h-full bg-[#0f131c] border-r border-white/5 flex flex-col">
      {/* Header & Controls */}
      <div className="p-4 border-b border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base text-white">Conversas</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
            {conversations.length} ativas
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar contatos, tags (⌘K)..."
            className="w-full h-9 pl-9 pr-3 bg-[#0a0e17] border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Status Tabs */}
        <div className="flex bg-[#0a0e17] p-1 rounded-lg border border-white/5 text-xs">
          {(['open', 'pending', 'resolved'] as ConversationStatus[]).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`flex-1 py-1 rounded-md transition-all font-medium capitalize ${
                statusFilter === st ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
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
                  ? 'bg-white/10 text-white font-semibold'
                  : 'bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversations Feed */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-slate-500 gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Carregando conversas...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
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
                    ? 'bg-indigo-600/10 border-l-4 border-indigo-500'
                    : 'hover:bg-white/5 border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white">
                      {conv.contact?.name || 'Cliente'}
                    </span>
                    {getChannelBadge(conv.channel_type)}
                  </div>
                  <span className="text-[11px] text-slate-400">{conv.last_message_at}</span>
                </div>

                <p className="text-xs text-slate-300 line-clamp-1 mb-2">
                  {conv.last_message_preview}
                </p>

                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex gap-1.5 flex-wrap">
                    {conv.contact?.tags?.map((tag) => (
                      <span
                        key={tag}
                        className={`px-1.5 py-0.5 rounded font-medium ${
                          tag === 'VIP'
                            ? 'bg-amber-500/20 text-amber-300'
                            : tag === 'Lead Quente'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {conv.unread_count > 0 && (
                    <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">
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
      <div className="p-2.5 border-t border-white/5 bg-[#0a0e17] text-[11px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>WebSocket: Conectado (28ms)</span>
        </div>
        <span className="text-slate-500 text-[10px]">AIVIQ Realtime</span>
      </div>
    </section>
  );
}
