import { Contact, Conversation, Message } from '@/types';
import { getDefaultInstanceName, resolveInstanceName } from '@/lib/instanceRegistry';

// CR-004 T1: sem default de credencial/URL no código — exige env, falha fechada.
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

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

// ============================================================================
// Caches POR INSTÂNCIA (multi-número). Antes eram singletons globais; agora cada
// número tem seu próprio estado, evitando vazamento de dados entre instâncias.
// ============================================================================
const connectionStateCache = new Map<string, CacheEntry<boolean>>();
const conversationsCache = new Map<string, CacheEntry<Conversation[]>>();
const contactsCache = new Map<string, CacheEntry<Contact[]>>();
const messagesCache = new Map<string, CacheEntry<Message[]>>(); // chave: `${instance}::${jid}`

const CONNECTION_CACHE_TTL_MS = 5000; // 5s cache para status de conexão
const DATA_CACHE_TTL_MS = 4000; // 4s cache de dados reais

export function invalidateEvolutionCache(instanceName?: string) {
  if (!instanceName) {
    connectionStateCache.clear();
    conversationsCache.clear();
    contactsCache.clear();
    messagesCache.clear();
    liveInstancesCache = null;
    return;
  }
  const inst = resolveInstanceName(instanceName);
  connectionStateCache.delete(inst);
  conversationsCache.delete(inst);
  contactsCache.delete(inst);
  for (const key of Array.from(messagesCache.keys())) {
    if (key.startsWith(`${inst}::`)) messagesCache.delete(key);
  }
}

export async function isEvolutionConnected(
  instanceName?: string,
  forceRefresh = false
): Promise<boolean> {
  const inst = resolveInstanceName(instanceName);
  const now = Date.now();
  const cached = connectionStateCache.get(inst);
  if (!forceRefresh && cached && now - cached.timestamp < CONNECTION_CACHE_TTL_MS) {
    return cached.data;
  }

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    connectionStateCache.set(inst, { data: false, timestamp: now });
    return false;
  }

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${inst}`, {
      headers: { apikey: EVOLUTION_API_KEY },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      connectionStateCache.set(inst, { data: false, timestamp: now });
      return false;
    }

    const data = await res.json();
    const state = data?.instance?.state || data?.state;
    const isConnected = state === 'open';

    connectionStateCache.set(inst, { data: isConnected, timestamp: now });
    return isConnected;
  } catch (err) {
    connectionStateCache.set(inst, { data: false, timestamp: now });
    return false;
  }
}

// ================= 1. BUSCAR CHATS REAIS DO WHATSAPP =================
export async function getRealConversations(instanceName?: string): Promise<Conversation[]> {
  const inst = resolveInstanceName(instanceName);
  // CRÍTICO: Se o número não estiver conectado, NUNCA carrega chats antigos residuais da sessão anterior
  const isConnected = await isEvolutionConnected(inst);
  if (!isConnected) {
    return [];
  }

  const now = Date.now();
  const cached = conversationsCache.get(inst);
  if (cached && now - cached.timestamp < DATA_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/findChats/${inst}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      console.warn(`[Evolution findChats HTTP ${res.status}] (${inst})`);
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
        instance_name: inst,
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

    // Unifica conversas duplicadas do MESMO contato: o WhatsApp às vezes devolve
    // o mesmo número como LID (@lid, números longos) além do número real
    // (@s.whatsapp.net), criando dois diálogos. Dedup por telefone canônico,
    // preferindo o JID de telefone real e somando o não-lido.
    const dedupMap = new Map<string, number>();
    const deduped: Conversation[] = [];
    for (const conv of conversations) {
      const isGroup = conv.id.includes('@g.us');
      const phone = (conv.contact?.phone || '').replace(/\D/g, '');
      if (isGroup || !phone) {
        deduped.push(conv);
        continue;
      }
      const idx = dedupMap.get(phone);
      if (idx === undefined) {
        dedupMap.set(phone, deduped.length);
        deduped.push(conv);
        continue;
      }
      const existing = deduped[idx];
      const convIsRealPhone = conv.id.includes('@s.whatsapp.net');
      const existingIsRealPhone = existing.id.includes('@s.whatsapp.net');
      const unread = Math.max(conv.unread_count || 0, existing.unread_count || 0);
      // Mantém preferencialmente o diálogo do número real; funde o não-lido.
      if (convIsRealPhone && !existingIsRealPhone) {
        deduped[idx] = { ...conv, unread_count: unread };
      } else {
        deduped[idx] = { ...existing, unread_count: unread };
      }
    }

    conversationsCache.set(inst, { data: deduped, timestamp: now });
    return deduped;
  } catch (err: any) {
    console.error(`[Evolution getRealConversations Error] (${inst}):`, err.message);
    return [];
  }
}

// ================= 2. BUSCAR MENSAGENS REAIS DE UM CHAT =================
export async function getRealMessages(
  remoteJid: string,
  instanceName?: string
): Promise<Message[]> {
  const inst = resolveInstanceName(instanceName);
  const isConnected = await isEvolutionConnected(inst);
  if (!isConnected) {
    return [];
  }

  const now = Date.now();
  const cacheKey = `${inst}::${remoteJid}`;
  const cached = messagesCache.get(cacheKey);
  if (cached && now - cached.timestamp < DATA_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/findMessages/${inst}`, {
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
      console.warn(`[Evolution findMessages HTTP ${res.status}] (${inst})`);
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
    messagesCache.set(cacheKey, { data: messages, timestamp: now });
    return messages;
  } catch (err: any) {
    console.error(`[Evolution getRealMessages Error] (${inst}):`, err.message);
    return [];
  }
}

// ================= 3. BUSCAR CONTATOS REAIS DO WHATSAPP =================
export async function getRealContacts(instanceName?: string): Promise<Contact[]> {
  const inst = resolveInstanceName(instanceName);
  const isConnected = await isEvolutionConnected(inst);
  if (!isConnected) {
    return [];
  }

  const now = Date.now();
  const cached = contactsCache.get(inst);
  if (cached && now - cached.timestamp < DATA_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/findContacts/${inst}`, {
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

    contactsCache.set(inst, { data: contacts, timestamp: now });
    return contacts;
  } catch (err: any) {
    console.error(`[Evolution getRealContacts Error] (${inst}):`, err.message);
    return [];
  }
}

// ================= 4. ENVIAR MENSAGEM REAL NO WHATSAPP =================
export interface SendResult {
  ok: boolean;
  messageId?: string; // id do WhatsApp/Evolution (para dedupe na persistência)
  instance: string;
  error?: string;
}

/**
 * Envia texto pela Evolution.
 * @param delayMs presença "digitando..." antes de enviar. 0 (padrão) = envio
 *   imediato (respostas ao vivo do atendente/bot, menor latência). O disparo em
 *   massa passa um valor > 0 para humanizar (anti-ban).
 */
export async function sendRealMessageDetailed(
  target: string,
  text: string,
  instanceName?: string,
  delayMs = 0
): Promise<SendResult> {
  let inst = resolveInstanceName(instanceName);
  let isConnected = await isEvolutionConnected(inst);

  // Fallback anti-"parece que enviou": se a instância resolvida (ex.: a padrão)
  // não estiver conectada, procura QUALQUER instância conectada no servidor
  // Evolution e envia por ela. Sem isso, o envio falhava calado enquanto a msg
  // aparecia no Inbox.
  if (!isConnected) {
    try {
      const live = await fetchLiveEvolutionInstances();
      const conectada = live.find((i) => i.status === 'connected');
      if (conectada) {
        inst = conectada.instanceName;
        isConnected = true;
      }
    } catch {}
  }

  if (!isConnected) {
    console.warn(`[Evolution Send Real] Nenhuma instância conectada para envio (tentada: ${inst}).`);
    return { ok: false, instance: inst, error: 'Instância WhatsApp desconectada' };
  }

  try {
    const cleanNumber = target.replace('@s.whatsapp.net', '').replace(/@lid$/, '').replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 8) {
      return { ok: false, instance: inst, error: 'Número de telefone inválido ou incompleto' };
    }

    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${inst}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: text.trim(),
        delay: delayMs,
        linkPreview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      let messageId: string | undefined;
      try {
        const data = await res.json();
        messageId = data?.key?.id || data?.messageId || undefined;
      } catch {}
      invalidateEvolutionCache(inst);
      return { ok: true, messageId, instance: inst };
    }

    const err = await res.text();
    console.warn(`[Evolution Send Real Failed HTTP ${res.status}] (${inst}):`, err);
    let msgErro = `Falha no envio (HTTP ${res.status})`;
    try {
      const parsed = JSON.parse(err);
      msgErro = parsed?.response?.message || parsed?.message || msgErro;
    } catch {}
    return { ok: false, instance: inst, error: msgErro };
  } catch (err: any) {
    console.error(`[Evolution Send Real Error] (${inst}):`, err.message);
    return { ok: false, instance: inst, error: err.message || 'Erro de conexão no envio' };
  }
}

/** Resolve a instância que REALMENTE será usada para enviar (a padrão se
 *  conectada, senão a primeira conectada no servidor). Serve para gatear o
 *  anti-ban e registrar o contador no MESMO chip que dispara. */
export async function resolveSendInstance(instanceName?: string): Promise<string> {
  const inst = resolveInstanceName(instanceName);
  if (await isEvolutionConnected(inst)) return inst;
  try {
    const live = await fetchLiveEvolutionInstances();
    const conectada = live.find((i) => i.status === 'connected');
    if (conectada) return conectada.instanceName;
  } catch {}
  return inst;
}

/** Compat: mantém a API booleana usada pela maioria dos chamadores. */
export async function sendRealMessage(
  target: string,
  text: string,
  instanceName?: string,
  delayMs = 0
): Promise<boolean> {
  return (await sendRealMessageDetailed(target, text, instanceName, delayMs)).ok;
}

// ================= 4b. HISTÓRICO BRUTO (para reconciliação/backfill) =================
/** Busca as mensagens brutas armazenadas pela Evolution na instância (todas as
 *  conversas). Usado pela reconciliação que garante que TUDO seja gravado no
 *  Supabase mesmo se um evento de webhook for perdido. */
export async function fetchInstanceMessagesRaw(
  instanceName?: string,
  limit = 300
): Promise<any[]> {
  const inst = resolveInstanceName(instanceName);
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) return [];
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/findMessages/${inst}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ where: {}, limit }),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.messages?.records || data?.records || (Array.isArray(data) ? data : []);
  } catch {
    return [];
  }
}

// ================= 5. LISTAR INSTÂNCIAS REAIS DO SERVIDOR EVOLUTION =================
export interface EvolutionLiveInstance {
  instanceName: string;
  status: 'connected' | 'connecting' | 'disconnected';
  phoneNumber?: string;
  profileName?: string;
  profilePicUrl?: string;
}

function mapConnectionStatus(raw?: string, rawObj?: any): EvolutionLiveInstance['status'] {
  if (rawObj?.disconnectionReasonCode === 401 || (rawObj?.disconnectionObject && String(rawObj.disconnectionObject).includes('device_removed'))) {
    return 'disconnected';
  }
  if (raw === 'open') return 'connected';
  if (raw === 'connecting') return 'connecting';
  return 'disconnected';
}

let liveInstancesCache: CacheEntry<EvolutionLiveInstance[]> | null = null;

/** Consulta o servidor Evolution e retorna TODAS as instâncias existentes nele. */
/**
 * Reconciliacao de status: o /instance/fetchInstances devolve um
 * `connectionStatus` que fica preso em "connecting" para sessoes que na
 * verdade ja morreram (socket Baileys derrubado, device_removed, etc.). O
 * /instance/connectionState de cada instancia diz a verdade.
 *
 * Sem isso a tela pinta de amarelo "Conectando..." um chip que esta `close`, e
 * o operador fica esperando uma conexao que nunca vem -- achando que tem N
 * chips no cluster quando tem menos.
 */
async function confirmarConnecting(name: string): Promise<EvolutionLiveInstance['status']> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${encodeURIComponent(name)}`, {
      headers: { apikey: EVOLUTION_API_KEY },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return 'disconnected';
    const data = await res.json().catch(() => ({}));
    return mapConnectionStatus(data?.instance?.state || data?.state);
  } catch {
    return 'disconnected';
  }
}

/** Consulta o servidor Evolution e retorna TODAS as instâncias existentes nele. */
export async function fetchLiveEvolutionInstances(forceRefresh = false): Promise<EvolutionLiveInstance[]> {
  const now = Date.now();
  if (!forceRefresh && liveInstancesCache && now - liveInstancesCache.timestamp < DATA_CACHE_TTL_MS) {
    return liveInstancesCache.data;
  }

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) return [];
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
      headers: { apikey: EVOLUTION_API_KEY },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const instances = data.map((i: any) => ({
      instanceName: i.name || i.instanceName || i.instance?.instanceName || '',
      status: mapConnectionStatus(i.connectionStatus || i.state || i.instance?.state, i),
      phoneNumber: formatCleanPhone(i.ownerJid || i.number || i.instance?.owner) || undefined,
      profileName: i.profileName || i.instance?.profileName || undefined,
      profilePicUrl: i.profilePicUrl || i.instance?.profilePicUrl || undefined,
    })).filter((i: EvolutionLiveInstance) => i.instanceName);

    // So os "connecting" precisam de segunda opiniao: 'open' e 'close' a lista
    // reporta corretamente. Em paralelo, para nao somar latencia.
    const pendentes = instances.filter((i: EvolutionLiveInstance) => i.status === 'connecting');
    if (pendentes.length > 0) {
      const reais = await Promise.all(pendentes.map((i: EvolutionLiveInstance) => confirmarConnecting(i.instanceName)));
      pendentes.forEach((i: EvolutionLiveInstance, idx: number) => {
        i.status = reais[idx];
      });
    }

    liveInstancesCache = { data: instances, timestamp: now };
    return instances;
  } catch {
    return [];
  }
}

/**
 * Retorna os nomes de todas as instâncias conectadas e disponíveis para despacho.
 * Se houver instâncias conectadas na Evolution API, retorna apenas elas.
 * Fallback: retorna a instância padrão resolvida.
 */
export async function getConnectedDispatchInstances(): Promise<string[]> {
  try {
    const live = await fetchLiveEvolutionInstances(true);
    const connected = live
      .filter((i) => i.status === 'connected' && i.instanceName)
      .map((i) => i.instanceName);
    if (connected.length > 0) {
      return Array.from(new Set(connected));
    }
  } catch (e) {
    console.warn('[getConnectedDispatchInstances] Falha ao listar instâncias ativas:', e);
  }
  const fallback = await resolveSendInstance();
  return fallback ? [fallback] : [getDefaultInstanceName()];
}

export { getDefaultInstanceName };

// ============================================================================
// WEBHOOK DA INSTANCIA
//
// Toda instancia criada pelo painel nascia SURDA: o /instance/create so recebia
// qrcode e integration, e o webhook nunca era configurado. Resultado observado
// em 17/09: 69 eleitores receberam a saudacao, responderam, e o robo nunca
// respondeu -- a Evolution nao tinha para onde avisar. Como o painel so mostra
// envios, a campanha ficou horas coletando zero sem sinal nenhum na tela.
// ============================================================================

/** Eventos indispensaveis: respostas, ack de entrega e queda de conexao. */
export const EVENTOS_WEBHOOK = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'];

/**
 * URL para onde a Evolution deve avisar. Aceita uma origem detectada em tempo
 * de requisicao como ultimo recurso: depender so de env transforma uma variavel
 * esquecida em instancia surda -- e essa e uma falha silenciosa, porque a
 * campanha dispara normalmente e simplesmente nao coleta nada.
 */
export function urlDoWebhook(origemDetectada?: string): string {
  let base =
    process.env.EVOLUTION_WEBHOOK_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    origemDetectada ||
    'https://aiviq-zap-web-tiscinovacoes-projects.vercel.app';
  if (base.includes('aiviq-zap-web.vercel.app') && !base.includes('-tiscinovacoes-projects')) {
    base = 'https://aiviq-zap-web-tiscinovacoes-projects.vercel.app';
  }
  const token = process.env.EVOLUTION_WEBHOOK_TOKEN || process.env.EVOLUTION_API_KEY || 'aiviq_zap_secret_2026';
  let target = base.endsWith('/api/webhooks/whatsapp')
    ? base
    : `${base.replace(/\/$/, '')}/api/webhooks/whatsapp`;
  if (token && !target.includes('token=')) {
    target += `${target.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }
  return target;
}


/** Le a configuracao de webhook da instancia (null = nao configurado). */
export async function getWebhookInstancia(
  instanceName: string
): Promise<{ enabled: boolean; url?: string; events?: string[] } | null> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) return null;
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/webhook/find/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: EVOLUTION_API_KEY },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    const w = data.webhook || data;
    if (!w || !w.url) return null;
    return { enabled: w.enabled !== false, url: w.url, events: w.events || [] };
  } catch {
    return null;
  }
}

/**
 * Configura (ou repara) o webhook da instancia. A Evolution v2 mudou o formato
 * do payload entre versoes -- aninhado em `webhook` nas mais novas, plano nas
 * anteriores -- entao tenta o novo e cai para o antigo.
 */
export async function configurarWebhookInstancia(
  instanceName: string,
  url?: string,
  origemDetectada?: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return { ok: false, error: 'Servidor Evolution não configurado.' };
  }
  const alvo = url || urlDoWebhook(origemDetectada);
  if (!alvo) {
    return {
      ok: false,
      error:
        'URL do webhook desconhecida. Defina EVOLUTION_WEBHOOK_URL ou NEXT_PUBLIC_APP_URL no ambiente.',
    };
  }

  const endpoint = `${EVOLUTION_API_URL}/webhook/set/${encodeURIComponent(instanceName)}`;
  const corpoNovo = {
    webhook: {
      enabled: true,
      url: alvo,
      byEvents: false,
      base64: false,
      events: EVENTOS_WEBHOOK,
    },
  };
  const corpoAntigo = {
    enabled: true,
    url: alvo,
    webhook_by_events: false,
    webhook_base64: false,
    events: EVENTOS_WEBHOOK,
  };

  for (const corpo of [corpoNovo, corpoAntigo]) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) return { ok: true, url: alvo };
    } catch {
      // tenta o proximo formato
    }
  }
  return { ok: false, error: 'A Evolution recusou a configuração do webhook.' };
}
