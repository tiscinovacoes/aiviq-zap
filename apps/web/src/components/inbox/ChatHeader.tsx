'use client';

import React from 'react';
import { Clock, CheckCircle2, ChevronDown, UserCheck } from 'lucide-react';
import { useInboxStore } from '@/store/useInboxStore';

export default function ChatHeader() {
  const { activeConversation, resolveConversation } = useInboxStore();

  if (!activeConversation) return null;

  const contact = activeConversation.contact;

  return (
    <header className="h-16 px-6 border-b border-white/5 flex items-center justify-between bg-[#0f131c]/80 backdrop-blur-md z-10">
      {/* Left: Contact Info */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center font-bold text-sm text-indigo-300">
          {contact?.name.slice(0, 2).toUpperCase() || 'CX'}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-white">{contact?.name}</h3>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {activeConversation.channel_type === 'whatsapp_cloud'
                ? 'WhatsApp Oficial'
                : activeConversation.channel_type === 'instagram'
                ? 'Instagram DM'
                : 'Webchat'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {contact?.custom_attributes?.empresa || contact?.phone || 'Atendimento em andamento'} • Atribuído a: Lucas R. (Você)
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
          <Clock className="w-3.5 h-3.5" />
          <span>SLA Resposta: 42s</span>
        </div>

        {activeConversation.status !== 'resolved' ? (
          <button
            onClick={() => resolveConversation(activeConversation.id)}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Resolver</span>
          </button>
        ) : (
          <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-500/30">
            Atendimento Resolvido
          </span>
        )}
      </div>
    </header>
  );
}
