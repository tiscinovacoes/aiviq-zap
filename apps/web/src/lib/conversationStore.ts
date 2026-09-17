import { Contact, Conversation, Message } from '@/types';

// Global singleton to persist across Next.js API requests in development and serverless invocations
declare global {
  // eslint-disable-next-line no-var
  var __aiviq_conversations: Conversation[] | undefined;
  // eslint-disable-next-line no-var
  var __aiviq_messages: Record<string, Message[]> | undefined;
  // eslint-disable-next-line no-var
  var __aiviq_custom_contacts: Contact[] | undefined;
}

if (!global.__aiviq_conversations) {
  global.__aiviq_conversations = [];
}

if (!global.__aiviq_messages) {
  global.__aiviq_messages = {};
}

if (!global.__aiviq_custom_contacts) {
  global.__aiviq_custom_contacts = [];
}

export function getAllConversations(instanceName?: string): Conversation[] {
  const all = global.__aiviq_conversations || [];
  if (!instanceName) return all;
  // Retorna as conversas da instância pedida. Conversas antigas sem instance_name
  // (legado) são consideradas da instância pedida para não sumirem da tela.
  return all.filter((c) => !c.instance_name || c.instance_name === instanceName);
}

export function setMemoryConversations(convs: Conversation[]) {
  global.__aiviq_conversations = convs;
}

export function clearWhatsAppConversations(instanceName?: string) {
  global.__aiviq_conversations = (global.__aiviq_conversations || []).filter((c) => {
    if (c.channel_type !== 'whatsapp_cloud') return true;
    // Só expurga as conversas da instância indicada (ou todas, se não indicada).
    if (instanceName && c.instance_name && c.instance_name !== instanceName) return true;
    return false;
  });
  if (!instanceName) {
    global.__aiviq_messages = {};
  }
}

export function getMessagesByConversationId(conversationId: string): Message[] {
  if (!global.__aiviq_messages) return [];
  return global.__aiviq_messages[conversationId] || [];
}

export function setMessagesByConversationId(conversationId: string, messages: Message[]) {
  if (!global.__aiviq_messages) global.__aiviq_messages = {};
  global.__aiviq_messages[conversationId] = messages;
}

export function getPhoneByConversationId(conversationId: string): string | undefined {
  const conv = (global.__aiviq_conversations || []).find((c) => c.id === conversationId);
  return conv?.contact?.phone || conversationId;
}

export function getCustomContacts(): Contact[] {
  return global.__aiviq_custom_contacts || [];
}

export function addCustomContact(contact: Contact) {
  if (!global.__aiviq_custom_contacts) global.__aiviq_custom_contacts = [];
  const cleanPhone = contact.phone ? contact.phone.replace(/\D/g, '') : '';
  
  // Localiza contato existente pelo telefone
  const existsIdx = global.__aiviq_custom_contacts.findIndex(
    (c) => c.phone && cleanPhone && c.phone.replace(/\D/g, '') === cleanPhone
  );

  if (existsIdx >= 0) {
    const existing = global.__aiviq_custom_contacts[existsIdx];
    const mergedTags = Array.from(new Set([...(existing.tags || []), ...(contact.tags || [])]));
    const mergedCustom = {
      ...(existing.custom_attributes || {}),
      ...(contact.custom_attributes || {}),
    };
    global.__aiviq_custom_contacts[existsIdx] = {
      ...existing,
      name: contact.name && !contact.name.startsWith('WhatsApp') ? contact.name : existing.name,
      bairro: contact.bairro || existing.bairro,
      tags: mergedTags,
      custom_attributes: mergedCustom,
    };
  } else {
    global.__aiviq_custom_contacts.unshift(contact);
  }
}

// Atualiza um contato manual em memória (fallback dev, espelha o UPDATE do banco).
// Retorna o contato atualizado, ou undefined se não existir no store.
export function updateCustomContact(
  id: string,
  patch: Partial<Contact>
): Contact | undefined {
  const list = global.__aiviq_custom_contacts || [];
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  const updated = { ...list[idx], ...patch } as Contact;
  list[idx] = updated;
  return updated;
}

export function addInboundMessage(params: {
  fromPhone: string;
  text: string;
  name?: string;
  externalId?: string;
  instanceName?: string;
}): { conversation: Conversation; message: Message } {
  const { fromPhone, text, name, externalId, instanceName } = params;
  const cleanPhone = fromPhone.replace(/\D/g, '');
  const convs = global.__aiviq_conversations || [];
  const msgs = global.__aiviq_messages || {};

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
  const nowIso = new Date().toISOString();
  const nowTime = new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Campo_Grande',
    hour: '2-digit',
    minute: '2-digit',
  });

  let conv = convs.find(
    (c) =>
      c.id === `${cleanPhone}@s.whatsapp.net` ||
      c.id === fromPhone ||
      c.contact?.phone?.replace(/\D/g, '') === cleanPhone
  );

  if (!conv) {
    conv = {
      id: `${cleanPhone}@s.whatsapp.net`,
      organization_id: '00000000-0000-0000-0000-000000000000',
      inbox_id: 'inbox-whatsapp',
      instance_name: instanceName,
      contact_id: `cont-${cleanPhone}`,
      channel_type: 'whatsapp_cloud',
      status: 'open',
      priority: 'high',
      last_message_preview: text,
      last_message_at: nowTime,
      unread_count: 1,
      created_at: nowIso,
      contact: {
        id: `cont-${cleanPhone}`,
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
    if (instanceName && !conv.instance_name) conv.instance_name = instanceName;
    if (name && (!conv.contact?.name || conv.contact.name.startsWith('WhatsApp'))) {
      if (conv.contact) conv.contact.name = name;
    }
    const index = convs.indexOf(conv);
    if (index > 0) {
      convs.splice(index, 1);
      convs.unshift(conv);
    }
  }

  const message: Message = {
    id: externalId || `msg-${Date.now()}`,
    organization_id: '00000000-0000-0000-0000-000000000000',
    conversation_id: conv.id,
    sender_type: 'contact',
    sender_name: contactName,
    content: text,
    message_type: 'text',
    delivery_status: 'delivered',
    external_message_id: externalId,
    created_at: nowIso,
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
  const { conversationId, content, senderName = 'Luca Scandola', deliveryStatus = 'delivered' } = params;
  const convs = global.__aiviq_conversations || [];
  const msgs = global.__aiviq_messages || {};
  const nowIso = new Date().toISOString();
  const nowTime = new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Campo_Grande',
    hour: '2-digit',
    minute: '2-digit',
  });

  const conv = convs.find((c) => c.id === conversationId);
  if (conv) {
    conv.last_message_preview = content;
    conv.last_message_at = nowTime;
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
    created_at: nowIso,
  };

  if (!msgs[conversationId]) {
    msgs[conversationId] = [];
  }
  msgs[conversationId].push(message);

  global.__aiviq_conversations = convs;
  global.__aiviq_messages = msgs;

  return message;
}

export function addBotDispatchedMessage(params: {
  toPhone: string;
  name?: string;
  text: string;
  instanceName?: string;
  botName?: string;
}): { conversation: Conversation; message: Message } {
  const { toPhone, name, text, instanceName, botName = 'Robô Pesquisa Senado' } = params;
  const cleanPhone = toPhone.replace(/\D/g, '');
  const convs = global.__aiviq_conversations || [];
  const msgs = global.__aiviq_messages || {};

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

  const contactName = name || `Eleitor ${formattedPhone}`;
  const nowIso = new Date().toISOString();
  const nowTime = new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Campo_Grande',
    hour: '2-digit',
    minute: '2-digit',
  });

  const convId = `${cleanPhone}@s.whatsapp.net`;
  let conv = convs.find(
    (c) =>
      c.id === convId ||
      c.id === toPhone ||
      c.contact?.phone?.replace(/\D/g, '') === cleanPhone
  );

  if (!conv) {
    conv = {
      id: convId,
      organization_id: '00000000-0000-0000-0000-000000000000',
      inbox_id: 'inbox-whatsapp',
      instance_name: instanceName,
      contact_id: `cont-${cleanPhone}`,
      channel_type: 'whatsapp_cloud',
      status: 'open',
      priority: 'high',
      last_message_preview: `🤖 ${text}`,
      last_message_at: nowTime,
      unread_count: 0,
      created_at: nowIso,
      contact: {
        id: `cont-${cleanPhone}`,
        organization_id: '00000000-0000-0000-0000-000000000000',
        name: contactName,
        phone: formattedPhone,
        tags: ['Pesquisa Senado MS', 'Chatbot Ativo'],
        custom_attributes: {},
      },
    };
    convs.unshift(conv);
  } else {
    conv.last_message_preview = `🤖 ${text}`;
    conv.last_message_at = nowTime;
    conv.status = 'open';
    if (name && (!conv.contact?.name || conv.contact.name.startsWith('WhatsApp') || conv.contact.name.startsWith('Eleitor'))) {
      if (conv.contact) conv.contact.name = name;
    }
    if (conv.contact && !conv.contact.tags?.includes('Pesquisa Senado MS')) {
      conv.contact.tags = [...(conv.contact.tags || []), 'Pesquisa Senado MS'];
    }
    const index = convs.indexOf(conv);
    if (index > 0) {
      convs.splice(index, 1);
      convs.unshift(conv);
    }
  }

  const message: Message = {
    id: `bot-msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    organization_id: '00000000-0000-0000-0000-000000000000',
    conversation_id: conv.id,
    sender_type: 'agent',
    sender_name: botName,
    content: text,
    message_type: 'text',
    delivery_status: 'delivered',
    created_at: nowIso,
  };

  if (!msgs[conv.id]) {
    msgs[conv.id] = [];
  }
  msgs[conv.id].push(message);

  global.__aiviq_conversations = convs;
  global.__aiviq_messages = msgs;

  return { conversation: conv, message };
}

