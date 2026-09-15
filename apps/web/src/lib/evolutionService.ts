import { Contact, Conversation, Message } from '@/types';

// CR-004 T1: sem default de credencial/URL no código — exige env, falha fechada.
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'aiviq_inbox_01';

export function formatCleanPhone(raw?: string | null): string {
  if (!raw) return '';
  const clean = raw.replace('@s.whatsapp.net', '').replace(/@lid$/, '').replace(/\D/g, '');
  if (clean.length === 12 && clean.startsWith('55')) {
    const ddd = clean.slice(2, 4);
    const num = clean.slice(4);
    return `+55 (${ddd}) 9${num.slice(0, 4)}-${num.slice(4)}`;
  } else if (clean.length === 13 && clean.startsWith('55')) {
    const ddd = clean.slice(2, 4);
    const num = clean.slice(4);
    return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  } else if (clean.length > 8) {
    return `+${clean}`;
  }
  return raw;
}

export function formatTime(timestamp?: number | string): string {
  if (!timestamp) return '';
  const tsMs =
    typeof timestamp === 'number' && timestamp < 1000000000000
      ? timestamp * 1000
      : Number(timestamp);
  const d = !isNaN(tsMs) && tsMs > 0 ? new Date(tsMs) : new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  // Usar fuso horário do Mato Grosso do Sul (UTC-4) no servidor
  return d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Campo_Grande',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

let connectionStateCache: CacheEntry<boolean> | null = null;
let conversationsCache: CacheEntry<Conversation[]> | null = null;
let contactsCache: CacheEntry<Contact[]> | null = null;
const messagesCache = new Map<string, CacheEntry<Message[]>>();

const CONNECTION_CACHE_TTL_MS = 5000; // 5s cache para status de conexão
const DATA_CACHE_TTL_MS = 4000; // 4s cache de dados reais

export async function isEvolutionConnected(forceRefresh = false): Promise<boolean> {
  const now = Date.now();
  if (!forceRefresh && connectionStateCache && now - connectionStateCache.timestamp < CONNECTION_CACHE_TTL_MS) {
    return connectionStateCache.data;
  }

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    connectionStateCache = { data: false, timestamp: now };
    return false;
  }

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`, {
      headers: { apikey: EVOLUTION_API_KEY },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      connectionStateCache = { data: false, timestamp: now };
      return false;
    }

    const data = await res.json();
    const state = data?.instance?.state || data?.state;
    const isConnected = state === 'open';

    connectionStateCache = { data: isConnected, timestamp: now };
    return isConnected;
  } catch (err) {
    connectionStateCache = { data: false, timestamp: now };
    return false;
  }
}

export function invalidateEvolutionCache() {
  connectionStateCache = null;
  conversationsCache = null;
  contactsCache = null;
  messagesCache.clear();
}

// ================= 1. BUSCAR CHATS REAIS DO WHATSAPP =================
export async function getRealConversations(): Promise<Conversation[]> {
  // CRÍTICO: Se o número não estiver conectado, NUNCA carrega chats antigos residuais da sessão anterior
  const isConnected = await isEvolutionConnected();
  if (!isConnected) {
    return [];
  }

  const now = Date.now();
  if (conversationsCache && now - conversationsCache.timestamp < DATA_CACHE_TTL_MS) {
    return conversationsCache.data;
  }

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/findChats/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      console.warn(`[Evolution findChats HTTP ${res.status}]`);
      return [];
    }

    const chats = await res.json();
    if (!Array.isArray(chats)) return [];

    const conversations: Conversation[] = chats.map((c: any) => {
      let rawPhone = c.remoteJid;
      if (
        c.lastMessage?.key?.remoteJidAlt &&
        c.lastMessage.key.remoteJidAlt.includes('@s.whatsapp.net')
      ) {
        rawPhone = c.lastMessage.key.remoteJidAlt;
      }

      const formattedPhone = formatCleanPhone(rawPhone);
      const contactName =
        c.pushName ||
        c.lastMessage?.pushName ||
        (c.remoteJid.includes('@g.us') ? 'Grupo WhatsApp' : formattedPhone);

      const isGroup = c.remoteJid.includes('@g.us');

      const lastText =
        c.lastMessage?.message?.conversation ||
        c.lastMessage?.message?.extendedTextMessage?.text ||
        (c.lastMessage?.message?.imageMessage ? '📷 Foto' : '') ||
        (c.lastMessage?.message?.audioMessage ? '🎵 Mensagem de Voz' : '') ||
        (c.lastMessage?.message?.documentMessage ? '📄 Documento' : '') ||
        '';

      const contact: Contact = {
        id: c.id || `cont-${c.remoteJid}`,
        organization_id: '00000000-0000-0000-0000-000000000000',
        name: contactName,
        phone: formattedPhone,
        avatar_url: c.profilePicUrl || undefined,
        tags: isGroup ? ['Grupo WhatsApp'] : ['WhatsApp'],
        custom_attributes: {},
      };

      const dateStr =
        c.lastMessage?.messageTimestamp
          ? formatTime(c.lastMessage.messageTimestamp)
          : c.updatedAt
          ? formatTime(c.updatedAt)
          : '';

      return {
        id: c.remoteJid,
        organization_id: '00000000-0000-0000-0000-000000000000',
        inbox_id: 'inbox-whatsapp',
        contact_id: contact.id,
        contact,
        status: 'open',
        priority: 'medium',
        channel_type: 'whatsapp_cloud',
        last_message_preview: lastText || 'Conversa iniciada',
        last_message_at: dateStr,
        unread_count: c.unreadCount || 0,
        created_at: c.createdAt || new Date().toISOString(),
      };
    });

    conversationsCache = { data: conversations, timestamp: now };
    return conversations;
  } catch (err: any) {
    console.error('[Evolution getRealConversations Error]:', err.message);
    return [];
  }
}

// ================= 2. BUSCAR MENSAGENS REAIS DE UM CHAT =================
export async function getRealMessages(remoteJid: string): Promise<Message[]> {
  const isConnected = await isEvolutionConnected();
  if (!isConnected) {
    return [];
  }

  const now = Date.now();
  const cached = messagesCache.get(remoteJid);
  if (cached && now - cached.timestamp < DATA_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/findMessages/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        where: {
          key: {
            remoteJid,
          },
        },
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      console.warn(`[Evolution findMessages HTTP ${res.status}]`);
      return [];
    }

    const data = await res.json();
    const records = data?.messages?.records || data?.records || [];
    if (!Array.isArray(records)) return [];

    const messageMap = new Map<string, Message>();

    for (const m of records) {
      // 1. Isolamento estrito de conversa: ignorar mensagens pertencentes a outro remoteJid
      const itemJid = m.key?.remoteJid;
      if (itemJid && itemJid !== remoteJid) {
        continue;
      }

      const msgId = m.key?.id;
      if (!msgId) continue;

      // 2. Deduplicação por ID: se já temos essa mensagem, descartar réplica de ACK/status
      if (messageMap.has(msgId)) {
        continue;
      }

      const fromMe = Boolean(m.key?.fromMe);
      const text =
        m.message?.conversation ||
        m.message?.extendedTextMessage?.text ||
        m.message?.imageMessage?.caption ||
        (m.message?.imageMessage ? '📷 [Foto]' : '') ||
        (m.message?.audioMessage ? '🎵 [Mensagem de Áudio]' : '') ||
        (m.message?.documentMessage ? '📄 [Documento]' : '') ||
        '';

      let isoTime = new Date().toISOString();
      if (m.messageTimestamp) {
        const tsMs =
          typeof m.messageTimestamp === 'number' && m.messageTimestamp < 1000000000000
            ? m.messageTimestamp * 1000
            : Number(m.messageTimestamp);
        const d = new Date(tsMs);
        if (!isNaN(d.getTime())) {
          isoTime = d.toISOString();
        }
      }

      messageMap.set(msgId, {
        id: msgId,
        organization_id: '00000000-0000-0000-0000-000000000000',
        conversation_id: remoteJid,
        sender_type: fromMe ? 'agent' : 'contact',
        sender_name: fromMe ? 'Você (Atendente)' : m.pushName || 'Contato',
        content: text,
        message_type: 'text',
        delivery_status: fromMe ? 'delivered' : 'read',
        external_message_id: msgId,
        created_at: isoTime,
      });
    }

    const messages = Array.from(messageMap.values());
    // Ordena do mais antigo para o mais recente cronologicamente
    messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    messagesCache.set(remoteJid, { data: messages, timestamp: now });
    return messages;
  } catch (err: any) {
    console.error('[Evolution getRealMessages Error]:', err.message);
    return [];
  }
}

// ================= 3. BUSCAR CONTATOS REAIS DO WHATSAPP =================
export async function getRealContacts(): Promise<Contact[]> {
  const isConnected = await isEvolutionConnected();
  if (!isConnected) {
    return [];
  }

  const now = Date.now();
  if (contactsCache && now - contactsCache.timestamp < DATA_CACHE_TTL_MS) {
    return contactsCache.data;
  }

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/findContacts/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return [];

    const rawContacts = await res.json();
    if (!Array.isArray(rawContacts)) return [];

    const contacts: Contact[] = [];
    const seenPhones = new Set<string>();

    for (const c of rawContacts) {
      if (!c.remoteJid) continue;
      const isGroup = c.remoteJid.includes('@g.us');
      const formattedPhone = formatCleanPhone(c.remoteJid);

      // Pular contatos sem nome nem número válido
      if (!isGroup && !c.pushName && c.remoteJid.includes('@lid')) {
        continue;
      }

      if (seenPhones.has(formattedPhone)) continue;
      seenPhones.add(formattedPhone);

      const name =
        c.pushName ||
        (isGroup ? 'Grupo WhatsApp' : formattedPhone);

      contacts.push({
        id: c.id || `cont-${c.remoteJid}`,
        organization_id: '00000000-0000-0000-0000-000000000000',
        name,
        phone: isGroup ? undefined : formattedPhone,
        avatar_url: c.profilePicUrl || undefined,
        tags: isGroup ? ['Grupo WhatsApp'] : ['WhatsApp Oficial'],
        assigned_to: 'Luca Scandola',
        custom_attributes: {},
        created_at: c.createdAt || new Date().toISOString(),
      });
    }

    contactsCache = { data: contacts, timestamp: now };
    return contacts;
  } catch (err: any) {
    console.error('[Evolution getRealContacts Error]:', err.message);
    return [];
  }
}

// ================= 4. ENVIAR MENSAGEM REAL NO WHATSAPP =================
export async function sendRealMessage(target: string, text: string): Promise<boolean> {
  // Se não estiver conectado, rejeita imediatamente
  const isConnected = await isEvolutionConnected();
  if (!isConnected) {
    console.warn('[Evolution Send Real] Tentativa de envio com WhatsApp desconectado.');
    return false;
  }

  try {
    const cleanNumber = target.replace('@s.whatsapp.net', '').replace(/@lid$/, '').replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 8) return false;

    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: text.trim(),
        delay: 1000,
        linkPreview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      console.log(`[Evolution Send Real Success] Enviado para ${cleanNumber}: "${text}"`);
      invalidateEvolutionCache();
      return true;
    }

    const err = await res.text();
    console.warn(`[Evolution Send Real Failed HTTP ${res.status}]:`, err);
    return false;
  } catch (err: any) {
    console.error('[Evolution Send Real Error]:', err.message);
    return false;
  }
}
