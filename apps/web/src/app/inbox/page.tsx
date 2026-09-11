'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Users,
  Bot,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useInboxStore } from '@/store/useInboxStore';
import ConversationList from '@/components/inbox/ConversationList';
import ChatHeader from '@/components/inbox/ChatHeader';
import MessageStream from '@/components/inbox/MessageStream';
import MessageComposer from '@/components/inbox/MessageComposer';
import ContactInspector from '@/components/inbox/ContactInspector';

export default function InboxPage() {
  const { user, logout, fetchUser } = useAuth();
  const { activeConversation, fetchConversations } = useInboxStore();
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    fetchUser();
    fetchConversations();
  }, [fetchUser, fetchConversations]);

  return (
    <div className="flex h-screen w-screen bg-[#090d16] text-slate-100 overflow-hidden font-sans select-none">
      {/* 1. Persistent Left Navigation Rail (72px) */}
      <nav className="w-[72px] h-full bg-[#0a0e17] border-r border-white/5 flex flex-col items-center justify-between py-5 z-20 shrink-0">
        <div className="flex flex-col items-center gap-6">
          {/* Logo */}
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-indigo-600/30">
            P
          </div>

          {/* Navigation Items */}
          <div className="flex flex-col items-center gap-3">
            <button
              title="Caixa de Entrada"
              className="w-11 h-11 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center relative shadow-sm"
            >
              <MessageSquare className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-black font-bold text-[9px] rounded-full flex items-center justify-center">
                14
              </span>
            </button>

            <button
              title="CRM & Contatos"
              className="w-11 h-11 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors"
            >
              <Users className="w-5 h-5" />
            </button>

            <button
              title="Automações & IA"
              className="w-11 h-11 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors"
            >
              <Bot className="w-5 h-5" />
            </button>

            <button
              title="Métricas & Relatórios"
              className="w-11 h-11 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors"
            >
              <BarChart3 className="w-5 h-5" />
            </button>

            <button
              title="Configurações"
              className="w-11 h-11 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* User / Logout */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => logout()}
            title="Sair da Plataforma"
            className="w-10 h-10 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <div className="relative" title={user?.full_name || 'Usuário Online'}>
            <div className="w-9 h-9 rounded-full bg-slate-700 border border-white/10 flex items-center justify-center font-semibold text-xs text-white">
              {user?.full_name ? user.full_name.slice(0, 2).toUpperCase() : 'LR'}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0a0e17]" />
          </div>
        </div>
      </nav>

      {/* 2. Conversation List Column (360px) */}
      <ConversationList />

      {/* 3. Center Active Chat Canvas (flex-1) */}
      <main className="flex-1 h-full bg-[#090d16] flex flex-col relative min-w-0">
        {activeConversation ? (
          <>
            <ChatHeader />
            <MessageStream onApplySuggestion={(text) => setInputText(text)} />
            <MessageComposer inputText={inputText} setInputText={setInputText} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 text-indigo-400 border border-white/5">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">
              Selecione uma conversa para iniciar o atendimento
            </h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Visualize o histórico em tempo real, responda clientes por WhatsApp, Instagram ou Webchat e acione copilotos de IA.
            </p>
          </div>
        )}
      </main>

      {/* 4. Right Panel (Contextual CRM & Contact Inspector - 340px) */}
      {activeConversation && <ContactInspector />}
    </div>
  );
}
