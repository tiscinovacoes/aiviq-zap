'use client';

import React from 'react';
import { Clock, CheckCircle2, ChevronDown, UserCheck } from 'lucide-react';
import { useInboxStore } from '@/store/useInboxStore';

export default function ChatHeader() {
  const { activeConversation, resolveConversation } = useInboxStore();

  if (!activeConversation) return null;

  const contact = activeConversation.contact;

  return (
    <header className="h-16 px-6 border-b border-slate-200 flex items-center justify-between bg-white z-10">
      {/* Left: Contact Info */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center font-bold text-sm text-emerald-700">
          {contact?.name.slice(0, 2).toUpperCase() || 'CX'}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-900">{contact?.name}</h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {activeConversation.channel_type === 'whatsapp_cloud'
                ? 'WhatsApp Oficial'
                : activeConversation.channel_type === 'instagram'
                ? 'Instagram DM'
                : 'Webchat'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            {contact?.custom_attributes?.empresa || contact?.phone || 'Atendimento em andamento'} • Atribuído a: Lucas R. (Você)
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-xs">
          <Clock className="w-3.5 h-3.5 text-emerald-600" />
          <span>SLA Resposta: 42s</span>
        </div>

        {activeConversation.status !== 'resolved' ? (
          <button
            onClick={() => resolveConversation(activeConversation.id)}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Resolver</span>
          </button>
        ) : (
          <span className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
            Atendimento Resolvido
          </span>
        )}
      </div>
    </header>
  );
}
