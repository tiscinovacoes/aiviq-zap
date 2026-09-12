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
      const conversations = await conversationService.getConversations({
        status: statusFilter,
        channel: channelFilter,
        q: searchQuery,
      });

      set({ conversations, isLoading: false });

      // Automatically select the first conversation if none selected or if active is not in list
      const currentActive = get().activeConversation;
      if (!currentActive && conversations.length > 0) {
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
    const { statusFilter, channelFilter, searchQuery, activeConversation } = get();
    try {
      const conversations = await conversationService.getConversations({
        status: statusFilter,
        channel: channelFilter,
        q: searchQuery,
      });
      set({ conversations });
      if (activeConversation) {
        const messages = await conversationService.getMessages(activeConversation.id);
        if (get().activeConversation?.id === activeConversation.id) {
          set({ messages });
        }
      }
    } catch (e) {}
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
