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
import NavigationRail from '@/components/layout/NavigationRail';

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
      <NavigationRail />

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
