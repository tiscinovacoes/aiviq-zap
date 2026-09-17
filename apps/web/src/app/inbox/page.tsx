'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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

function InboxMain() {
  const { user, logout, fetchUser } = useAuth();
  const {
    activeConversation,
    fetchConversations,
    syncConversations,
    selectConversationByPhoneOrId,
  } = useInboxStore();
  const [inputText, setInputText] = useState('');
  const searchParams = useSearchParams();

  useEffect(() => {
    fetchUser();
    fetchConversations().then(() => {
      const targetPhoneOrId =
        searchParams?.get('conversationId') ||
        searchParams?.get('phone') ||
        searchParams?.get('id');

      if (targetPhoneOrId) {
        selectConversationByPhoneOrId(targetPhoneOrId);
      }
    });

    let timeoutId: NodeJS.Timeout;
    let isCancelled = false;

    const runSync = async () => {
      // Poupa CPU e conexões de rede quando a aba estiver em segundo plano
      if (document.visibilityState === 'visible') {
        await syncConversations();
      }
      if (!isCancelled) {
        timeoutId = setTimeout(runSync, 4500);
      }
    };

    timeoutId = setTimeout(runSync, 4500);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncConversations();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Ao trocar o número ativo, recarrega as conversas do novo número.
    const onInstanceChanged = () => {
      fetchConversations();
    };
    window.addEventListener('aiviq:instance-changed', onInstanceChanged);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('aiviq:instance-changed', onInstanceChanged);
    };
  }, [fetchUser, fetchConversations, syncConversations, searchParams, selectConversationByPhoneOrId]);

  // Se o query param mudar com a tela já aberta, sincroniza seleção imediatamente
  useEffect(() => {
    const targetPhoneOrId =
      searchParams?.get('conversationId') ||
      searchParams?.get('phone') ||
      searchParams?.get('id');

    if (targetPhoneOrId) {
      selectConversationByPhoneOrId(targetPhoneOrId);
    }
  }, [searchParams, selectConversationByPhoneOrId]);

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden font-sans select-none">
      {/* 1. Persistent Left Navigation Rail (72px) */}
      <NavigationRail />

      {/* 2. Conversation List Column (360px) */}
      <ConversationList />

      {/* 3. Center Active Chat Canvas (flex-1) */}
      <main className="flex-1 h-full bg-slate-50/50 flex flex-col relative min-w-0">
        {activeConversation ? (
          <>
            <ChatHeader />
            <MessageStream onApplySuggestion={(text) => setInputText(text)} />
            <MessageComposer inputText={inputText} setInputText={setInputText} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-slate-50">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-4 text-emerald-600">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">
              Selecione uma conversa para iniciar o atendimento
            </h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Visualize o histórico em tempo real, responda cidadãos por WhatsApp, Instagram ou Webchat e acione copilotos de IA.
            </p>
          </div>
        )}
      </main>

      {/* 4. Right Panel (Contextual CRM & Contact Inspector - 340px) */}
      {activeConversation && <ContactInspector />}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-slate-500 text-xs">Carregando Inbox...</div>}>
      <InboxMain />
    </Suspense>
  );
}
