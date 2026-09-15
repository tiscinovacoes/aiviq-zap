import { create } from 'zustand';
import { Conversation, Message, QuickTemplate, ConversationStatus, ChannelType } from '@/types';
import { conversationService } from '@/services/conversationService';

interface InboxState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  templates: QuickTemplate[];
  statusFilter: ConversationStatus;
  channelFilter: string;
  searchQuery: string;
  isLoading: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  isSyncing: boolean;
  isWhatsAppConnected: boolean;
  error: string | null;

  // Actions
  setStatusFilter: (status: ConversationStatus) => void;
  setChannelFilter: (channel: string) => void;
  setSearchQuery: (query: string) => void;
  fetchConversations: () => Promise<void>;
  syncConversations: () => Promise<void>;
  selectConversation: (conversation: Conversation) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  resolveConversation: (conversationId: string) => Promise<void>;
  fetchTemplates: () => Promise<void>;
}

function areConversationsEqual(a: Conversation[], b: Conversation[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].last_message_preview !== b[i].last_message_preview ||
      a[i].last_message_at !== b[i].last_message_at ||
      a[i].unread_count !== b[i].unread_count ||
      a[i].status !== b[i].status
    ) {
      return false;
    }
  }
  return true;
}

function areMessagesEqual(a: Message[], b: Message[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const lastA = a[a.length - 1];
  const lastB = b[b.length - 1];
  return (
    lastA.id === lastB.id &&
    lastA.delivery_status === lastB.delivery_status &&
    lastA.content === lastB.content
  );
}

export const useInboxStore = create<InboxState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  templates: [],
  statusFilter: 'open',
  channelFilter: 'all',
  searchQuery: '',
  isLoading: false,
  isLoadingMessages: false,
  isSending: false,
  isSyncing: false,
  isWhatsAppConnected: false,
  error: null,

  setStatusFilter: (status) => {
    set({ statusFilter: status });
    get().fetchConversations();
  },

  setChannelFilter: (channel) => {
    set({ channelFilter: channel });
    get().fetchConversations();
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().fetchConversations();
  },

  fetchConversations: async () => {
    const { statusFilter, channelFilter, searchQuery } = get();
    set({ isLoading: true, error: null });

    try {
      const { conversations, whatsappConnected } = await conversationService.getConversations({
        status: statusFilter,
        channel: channelFilter,
        q: searchQuery,
      });

      set({
        conversations,
        isWhatsAppConnected: whatsappConnected,
        isLoading: false,
      });

      // Se a lista estiver vazia (ex: sem whatsapp conectado), limpa seleção ativa
      const currentActive = get().activeConversation;
      if (conversations.length === 0) {
        set({ activeConversation: null, messages: [] });
      } else if (!currentActive || !conversations.some((c) => c.id === currentActive.id)) {
        get().selectConversation(conversations[0]);
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  selectConversation: async (conversation) => {
    // Limpar mensagens imediatamente para evitar que mensagens de outra conversa vazem na tela
    set({ activeConversation: conversation, messages: [], isLoadingMessages: true });
    await get().fetchMessages(conversation.id);
  },

  fetchMessages: async (conversationId) => {
    set({ isLoadingMessages: true });
    try {
      const messages = await conversationService.getMessages(conversationId);
      // Verificar se a conversa ativa ainda é a mesma antes de gravar no estado
      if (get().activeConversation?.id === conversationId) {
        set({ messages, isLoadingMessages: false });
      }
    } catch (err: any) {
      if (get().activeConversation?.id === conversationId) {
        set({ error: err.message, isLoadingMessages: false });
      }
    }
  },

  syncConversations: async () => {
    // Evita chamadas concorrentes sobrepostas que sobrecarregam o servidor
    if (get().isSyncing) return;
    set({ isSyncing: true });

    const { statusFilter, channelFilter, searchQuery, activeConversation, conversations: currentConvs, messages: currentMsgs } = get();
    try {
      const { conversations, whatsappConnected } = await conversationService.getConversations({
        status: statusFilter,
        channel: channelFilter,
        q: searchQuery,
      });

      const hasConvsChanged = !areConversationsEqual(currentConvs, conversations);
      const hasConnectionChanged = get().isWhatsAppConnected !== whatsappConnected;

      if (hasConvsChanged || hasConnectionChanged) {
        set({
          conversations,
          isWhatsAppConnected: whatsappConnected,
        });

        // Se a conversa ativa não existe mais na nova lista (ex: desconectou número), limpa
        if (activeConversation && !conversations.some((c) => c.id === activeConversation.id)) {
          set({ activeConversation: null, messages: [] });
        }
      }

      // Se houver conversa ativa válida, busca mensagens de forma suave sem causar re-render desnecessário
      const currentActive = get().activeConversation;
      if (currentActive) {
        const messages = await conversationService.getMessages(currentActive.id);
        if (get().activeConversation?.id === currentActive.id && !areMessagesEqual(currentMsgs, messages)) {
          set({ messages });
        }
      }
    } catch (e) {
      // Falha silenciosa em background polling
    } finally {
      set({ isSyncing: false });
    }
  },

  sendMessage: async (content: string) => {
    const { activeConversation, messages } = get();
    if (!activeConversation || !content.trim()) return;

    set({ isSending: true });

    // Optimistic message addition
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      organization_id: activeConversation.organization_id,
      conversation_id: activeConversation.id,
      sender_type: 'agent',
      sender_name: 'Lucas R.',
      content,
      message_type: 'text',
      delivery_status: 'sending',
      created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    set({ messages: [...messages, optimisticMessage] });

    try {
      const sentMessage = await conversationService.sendMessage(
        activeConversation.id,
        content,
        'text',
        activeConversation.contact?.phone
      );

      // Update message status in state
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === optimisticMessage.id ? { ...sentMessage, delivery_status: 'sent' } : m
        ),
        conversations: state.conversations.map((c) =>
          c.id === activeConversation.id
            ? { ...c, last_message_preview: content, last_message_at: sentMessage.created_at }
            : c
        ),
        isSending: false,
      }));
    } catch (err: any) {
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === optimisticMessage.id ? { ...m, delivery_status: 'failed' } : m
        ),
        isSending: false,
        error: err.message,
      }));
    }
  },

  resolveConversation: async (conversationId: string) => {
    try {
      await conversationService.updateConversation(conversationId, { status: 'resolved' });
      // Remove or update locally
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, status: 'resolved' } : c
        ),
      }));
      get().fetchConversations();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchTemplates: async () => {
    try {
      const templates = await conversationService.getTemplates();
      set({ templates });
    } catch (err) {
      // Keep empty if fails
    }
  },
}));
