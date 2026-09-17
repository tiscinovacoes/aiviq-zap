import { Conversation, Message, QuickTemplate } from '@/types';

export interface GetConversationsResult {
  conversations: Conversation[];
  whatsappConnected: boolean;
}

// Número (instância Evolution) atualmente selecionado — persistido no localStorage
// pelo useInstanceStore. Todas as chamadas anexam ?instance= para operar no número certo.
function currentInstance(): string | null {
  try {
    return localStorage.getItem('aiviq_selected_instance');
  } catch {
    return null;
  }
}

export const conversationService = {
  async getConversations(params?: {
    status?: string;
    channel?: string;
    q?: string;
  }): Promise<GetConversationsResult> {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.channel && params.channel !== 'all') search.set('channel', params.channel);
    if (params?.q) search.set('q', params.q);
    const inst = currentInstance();
    if (inst) search.set('instance', inst);

    const res = await fetch(`/api/conversations?${search.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar conversas');
    const data = await res.json();
    return {
      conversations: data.conversations || [],
      whatsappConnected: Boolean(data.whatsapp_connected),
    };
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    const inst = currentInstance();
    const qs = inst ? `?instance=${encodeURIComponent(inst)}` : '';
    const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages${qs}`);
    if (!res.ok) throw new Error('Falha ao carregar histórico');
    const data = await res.json();
    return data.messages || [];
  },

  async sendMessage(
    conversationId: string,
    content: string,
    messageType: string = 'text',
    phone?: string
  ): Promise<Message> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, message_type: messageType, phone, instance: currentInstance() || undefined }),
    });
    if (!res.ok) throw new Error('Falha ao enviar mensagem');
    const data = await res.json();
    return data.message;
  },

  async updateConversation(
    conversationId: string,
    updates: { status?: string; priority?: string; assignee_id?: string }
  ): Promise<void> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Falha ao atualizar conversa');
  },

  async getTemplates(): Promise<QuickTemplate[]> {
    const res = await fetch('/api/templates');
    if (!res.ok) throw new Error('Falha ao obter templates');
    const data = await res.json();
    return data.templates || [];
  },
};
