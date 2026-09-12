import { Conversation, Message } from '@/types';

// Seed sample data strictly for local development inspection when database is unprovisioned
const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-001',
    organization_id: '00000000-0000-0000-0000-000000000000',
    inbox_id: 'inbox-whatsapp',
    contact_id: 'cont-001',
    channel_type: 'whatsapp_cloud',
    status: 'open',
    priority: 'high',
    last_message_preview: 'Perfeito, aguardo o link de pagamento do plano Pro!',
    last_message_at: '14:32',
    unread_count: 2,
    created_at: new Date().toISOString(),
    contact: {
      id: 'cont-001',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Mariana Silva',
      phone: '+55 (11) 98765-4321',
      email: 'mariana@techcorp.com.br',
      tags: ['VIP', 'Lead Quente', 'Plano Pro'],
      custom_attributes: {
        empresa: 'TechCorp Soluções Digitais',
        cargo: 'Head de Operações & CS',
        deal_value: 'R$ 10.680/ano',
      },
    },
    assignee: {
      id: 'usr-001',
      organization_id: '00000000-0000-0000-0000-000000000000',
      email: 'admin@aiviqzap.dev',
      full_name: 'Lucas R.',
      role: 'admin',
      is_active: true,
      created_at: new Date().toISOString(),
    },
  },
  {
    id: 'conv-002',
    organization_id: '00000000-0000-0000-0000-000000000000',
    inbox_id: 'inbox-whatsapp',
    contact_id: 'cont-002',
    channel_type: 'whatsapp_cloud',
    status: 'pending',
    priority: 'medium',
    last_message_preview: 'Vocês emitem nota fiscal para pessoa jurídica?',
    last_message_at: '14:20',
    unread_count: 0,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    contact: {
      id: 'cont-002',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Carlos Eduardo',
      phone: '+55 (21) 99876-1234',
      email: 'carlos@empresa.com.br',
      tags: ['Aguardando Atendente', 'PJ'],
      custom_attributes: {
        empresa: 'Eduardo Logística Ltda',
        deal_value: 'R$ 4.500/ano',
      },
    },
  },
];

const INITIAL_MESSAGES: Record<string, Message[]> = {
  'conv-001': [
    {
      id: 'msg-1',
      organization_id: '00000000-0000-0000-0000-000000000000',
      conversation_id: 'conv-001',
      sender_type: 'contact',
      sender_name: 'Mariana Silva',
      content: 'Olá! Gostaria de saber mais sobre a integração com o WhatsApp e os planos.',
      message_type: 'text',
      delivery_status: 'read',
      created_at: '14:28',
    },
    {
      id: 'msg-2',
      organization_id: '00000000-0000-0000-0000-000000000000',
      conversation_id: 'conv-001',
      sender_type: 'agent',
      sender_name: 'Lucas R.',
      content: 'Olá Mariana! Seja muito bem-vinda à AIVIQ-ZAP. A nossa plataforma permite atendimento simultâneo via Evolution API e Meta Cloud API.',
      message_type: 'text',
      delivery_status: 'read',
      created_at: '14:29',
    },
    {
      id: 'msg-3',
      organization_id: '00000000-0000-0000-0000-000000000000',
      conversation_id: 'conv-001',
      sender_type: 'contact',
      sender_name: 'Mariana Silva',
      content: 'Perfeito, aguardo o link de pagamento do plano Pro!',
      message_type: 'text',
      delivery_status: 'delivered',
      created_at: '14:32',
    },
  ],
  'conv-002': [
    {
      id: 'msg-201',
      organization_id: '00000000-0000-0000-0000-000000000000',
      conversation_id: 'conv-002',
      sender_type: 'contact',
      sender_name: 'Carlos Eduardo',
      content: 'Boa tarde! Vocês emitem nota fiscal para pessoa jurídica?',
      message_type: 'text',
      delivery_status: 'delivered',
      created_at: '14:20',
    },
  ],
};

// Global singleton to persist across Next.js API requests in development and serverless invocations
declare global {
  // eslint-disable-next-line no-var
  var __aiviq_conversations: Conversation[] | undefined;
  // eslint-disable-next-line no-var
  var __aiviq_messages: Record<string, Message[]> | undefined;
}

if (!global.__aiviq_conversations) {
  global.__aiviq_conversations = [...INITIAL_CONVERSATIONS];
}

if (!global.__aiviq_messages) {
  global.__aiviq_messages = { ...INITIAL_MESSAGES };
}

export function getAllConversations(): Conversation[] {
  return global.__aiviq_conversations || [];
}

export function getMessagesByConversationId(conversationId: string): Message[] {
  if (!global.__aiviq_messages) return [];
  return global.__aiviq_messages[conversationId] || [];
}

export function getPhoneByConversationId(conversationId: string): string | undefined {
  const conv = (global.__aiviq_conversations || []).find((c) => c.id === conversationId);
  return conv?.contact?.phone;
}

export function addInboundMessage(params: {
  fromPhone: string;
  text: string;
  name?: string;
  externalId?: string;
}): { conversation: Conversation; message: Message } {
  const { fromPhone, text, name, externalId } = params;
  const cleanPhone = fromPhone.replace(/\D/g, '');
  const convs = global.__aiviq_conversations || [];
  const msgs = global.__aiviq_messages || {};

  // Formatar telefone para exibição: +55 (DDD) 9XXXX-XXXX
  let formattedPhone = `+${cleanPhone}`;
  if (cleanPhone.length >= 12 && cleanPhone.startsWith('55')) {
    const ddd = cleanPhone.slice(2, 4);
    const rest = cleanPhone.slice(4);
    if (rest.length === 9) {
      formattedPhone = `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    } else if (rest.length === 8) {
      formattedPhone = `+55 (${ddd}) 9${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }

  const contactName = name || `WhatsApp ${formattedPhone}`;
  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Verificar se já existe conversa com este telefone
  let conv = convs.find(
    (c) =>
      c.contact?.phone?.replace(/\D/g, '') === cleanPhone ||
      c.id === `conv-evo-${cleanPhone}`
  );

  if (!conv) {
    conv = {
      id: `conv-evo-${cleanPhone}`,
      organization_id: '00000000-0000-0000-0000-000000000000',
      inbox_id: 'inbox-whatsapp',
      contact_id: `cont-evo-${cleanPhone}`,
      channel_type: 'whatsapp_cloud',
      status: 'open',
      priority: 'high',
      last_message_preview: text,
      last_message_at: nowTime,
      unread_count: 1,
      created_at: new Date().toISOString(),
      contact: {
        id: `cont-evo-${cleanPhone}`,
        organization_id: '00000000-0000-0000-0000-000000000000',
        name: contactName,
        phone: formattedPhone,
        tags: ['WhatsApp Inbound', 'Evolution API'],
        custom_attributes: {},
      },
    };
    convs.unshift(conv);
  } else {
    conv.last_message_preview = text;
    conv.last_message_at = nowTime;
    conv.unread_count = (conv.unread_count || 0) + 1;
    conv.status = 'open';
    if (name && (!conv.contact?.name || conv.contact.name.startsWith('WhatsApp'))) {
      if (conv.contact) conv.contact.name = name;
    }
    // Mover para o topo da lista
    const index = convs.indexOf(conv);
    if (index > 0) {
      convs.splice(index, 1);
      convs.unshift(conv);
    }
  }

  const message: Message = {
    id: externalId || `msg-evo-${Date.now()}`,
    organization_id: '00000000-0000-0000-0000-000000000000',
    conversation_id: conv.id,
    sender_type: 'contact',
    sender_name: contactName,
    content: text,
    message_type: 'text',
    delivery_status: 'delivered',
    external_message_id: externalId,
    created_at: nowTime,
  };

  if (!msgs[conv.id]) {
    msgs[conv.id] = [];
  }
  msgs[conv.id].push(message);

  global.__aiviq_conversations = convs;
  global.__aiviq_messages = msgs;

  return { conversation: conv, message };
}

export function addOutboundMessage(params: {
  conversationId: string;
  content: string;
  senderName?: string;
  deliveryStatus?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}): Message {
  const { conversationId, content, senderName = 'Lucas R.', deliveryStatus = 'delivered' } = params;
  const convs = global.__aiviq_conversations || [];
  const msgs = global.__aiviq_messages || {};
  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const conv = convs.find((c) => c.id === conversationId);
  if (conv) {
    conv.last_message_preview = content;
    conv.last_message_at = nowTime;
    // Mover para o topo
    const index = convs.indexOf(conv);
    if (index > 0) {
      convs.splice(index, 1);
      convs.unshift(conv);
    }
  }

  const message: Message = {
    id: `msg-${Date.now()}`,
    organization_id: '00000000-0000-0000-0000-000000000000',
    conversation_id: conversationId,
    sender_type: 'agent',
    sender_name: senderName,
    content,
    message_type: 'text',
    delivery_status: deliveryStatus,
    created_at: nowTime,
  };

  if (!msgs[conversationId]) {
    msgs[conversationId] = [];
  }
  msgs[conversationId].push(message);

  global.__aiviq_conversations = convs;
  global.__aiviq_messages = msgs;

  return message;
}
