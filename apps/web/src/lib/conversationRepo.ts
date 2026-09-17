import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceContext, isPlaceholderEnv } from '@/lib/supabase/authContext';
import { resolveInstanceName } from '@/lib/instanceRegistry';

// ============================================================================
// Camada ÚNICA de persistência de conversa/mensagem no Supabase, keyed pelo JID
// canônico do WhatsApp (55 + DDD + 8 finais) gravado em conversations.channel_id.
//
// Antes desta camada o Inbox/bot usavam o JID como id e o Supabase usava UUID —
// os dois nunca se reconciliavam, então: (a) mensagens do bot/disparo só iam para
// RAM (somem no serverless), (b) o envio do atendente inseria conversation_id=JID
// num campo UUID e falhava calado, (c) as respostas gravavam sob um UUID novo e
// o GET (que lia por JID) não as encontrava. Tudo passa a resolver por aqui.
// ============================================================================

/** Canonicaliza qualquer telefone/JID para a chave estável (dígitos). Colapsa o
 *  9º dígito BR (Evolution resolve 13→12) e o LID vs número real. */
export function canonicalDigits(input: string): string {
  const d = String(input || '').replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    return '55' + d.slice(2, 4) + d.slice(4).slice(-8); // 55 + DDD + 8 finais
  }
  return d;
}

export type SenderType = 'agent' | 'contact';

export interface ResolvedConversation {
  id: string; // UUID do Supabase
  contactId: string;
  channelId: string; // JID canônico
}

/** Encontra o contato pelo sufixo de 8 dígitos (casa dígitos, +dígitos e
 *  formatado); cria com dígitos canônicos só se não existir. */
async function findOrCreateContact(
  db: SupabaseClient,
  organizationId: string,
  channelId: string,
  name?: string
): Promise<string | null> {
  const last8 = channelId.slice(-8);
  const findBySuffix = async () => {
    const { data } = await db
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('phone', `%${last8}`)
      .limit(1)
      .maybeSingle();
    return (data?.id as string) || null;
  };

  const existing = await findBySuffix();
  if (existing) return existing;

  const contactName = name?.trim() || `WhatsApp ${channelId.slice(-4)}`;
  const { data: created } = await db
    .from('contacts')
    .insert({ organization_id: organizationId, name: contactName, phone: channelId, tags: ['WhatsApp'] })
    .select('id')
    .single();
  if (created?.id) return created.id as string;

  // Corrida (constraint única por telefone) → relê pelo sufixo.
  return findBySuffix();
}

async function resolveInboxId(
  db: SupabaseClient,
  organizationId: string,
  instanceName?: string
): Promise<string | null> {
  // conversations.inbox_id é NOT NULL — precisamos sempre de um inbox válido.
  const { data: inboxes } = await db
    .from('inboxes')
    .select('id, channel_type')
    .eq('organization_id', organizationId);
  const list = (inboxes || []) as Array<{ id: string; channel_type: string }>;
  if (list.length === 0) return null;
  if (list.length === 1) return list[0].id;

  // Só com MÚLTIPLOS inboxes vale casar pela instância — e apenas se a coluna
  // evolution_instance_name existir (migration 006). O erro de coluna ausente é
  // tolerado (data=null) e caímos no primeiro inbox WhatsApp.
  if (instanceName) {
    const inst = resolveInstanceName(instanceName);
    const { data: matched } = await db
      .from('inboxes')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('evolution_instance_name', inst)
      .limit(1)
      .maybeSingle();
    if (matched?.id) return matched.id as string;
  }
  const wa = list.find((i) => i.channel_type === 'whatsapp_cloud');
  return (wa?.id as string) || list[0].id;
}

/** Encontra ou cria a conversa (e o contato) pelo JID canônico. */
export async function resolveOrCreateConversation(params: {
  db: SupabaseClient;
  organizationId: string;
  phoneOrJid: string;
  name?: string;
  instanceName?: string;
  createIfMissing?: boolean;
}): Promise<ResolvedConversation | null> {
  const { db, organizationId, phoneOrJid, name, instanceName, createIfMissing = true } = params;
  const channelId = canonicalDigits(phoneOrJid);
  if (!channelId || channelId.length < 8) return null;

  try {
    // 1. Conversa já existe por (org, channel_id)?
    const { data: existing } = await db
      .from('conversations')
      .select('id, contact_id, channel_id')
      .eq('organization_id', organizationId)
      .eq('channel_id', channelId)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      return { id: existing.id as string, contactId: existing.contact_id as string, channelId };
    }
    if (!createIfMissing) return null;

    // 2. Contato: REUSA o existente (o disparo/CRM grava o telefone FORMATADO,
    //    ex. "+55 (67) 9XXXX-XXXX"; aqui a chave é dígitos). Casa pelo sufixo de
    //    8 dígitos para não duplicar o cadastro nem descolar a conversa do
    //    contato que o CRM/Pesquisa exibe. Só cria se realmente não existir.
    const contactId = await findOrCreateContact(db, organizationId, channelId, name);
    if (!contactId) return null;

    // 3. Cria a conversa amarrando o JID canônico em channel_id.
    const inboxId = await resolveInboxId(db, organizationId, instanceName);
    const nowIso = new Date().toISOString();
    const { data: created, error } = await db
      .from('conversations')
      .insert({
        organization_id: organizationId,
        inbox_id: inboxId,
        contact_id: contactId,
        channel_id: channelId,
        status: 'open',
        last_message_at: nowIso,
      })
      .select('id, contact_id, channel_id')
      .single();
    // Corrida: outra request criou primeiro → relê.
    if (error) {
      const { data: raced } = await db
        .from('conversations')
        .select('id, contact_id, channel_id')
        .eq('organization_id', organizationId)
        .eq('channel_id', channelId)
        .limit(1)
        .maybeSingle();
      if (raced?.id) return { id: raced.id as string, contactId: raced.contact_id as string, channelId };
      return null;
    }
    return { id: created.id as string, contactId: created.contact_id as string, channelId };
  } catch {
    return null;
  }
}

/** Insere a mensagem no Supabase de forma idempotente (dedupe por external_message_id). */
export async function persistMessage(params: {
  db: SupabaseClient;
  organizationId: string;
  conversationId: string;
  senderType: SenderType;
  content: string;
  externalId?: string;
  senderId?: string | null;
  senderName?: string;
  deliveryStatus?: string;
  updateConversationPreview?: boolean;
  createdAt?: string; // preserva o horário original no backfill histórico
}): Promise<boolean> {
  const {
    db, organizationId, conversationId, senderType, content, externalId,
    senderId = null, deliveryStatus = senderType === 'agent' ? 'sent' : 'delivered',
    updateConversationPreview = true, createdAt,
  } = params;
  try {
    if (externalId) {
      // Já existe? (reentrega do webhook / reconciliação) → não duplica.
      const { data: dup } = await db
        .from('messages')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('external_message_id', externalId)
        .limit(1)
        .maybeSingle();
      if (dup?.id) return false;
    }
    await db.from('messages').insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      sender_type: senderType,
      sender_id: senderId,
      content,
      message_type: 'text',
      delivery_status: deliveryStatus,
      external_message_id: externalId || null,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
    if (updateConversationPreview) {
      await db
        .from('conversations')
        .update({
          last_message_preview: content.slice(0, 500),
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
    }
    return true;
  } catch {
    // best-effort: falha de persistência não deve derrubar o envio/recebimento.
    return false;
  }
}

/** Lê as mensagens persistidas de uma conversa pelo JID canônico (ordem cronológica). */
export async function getPersistedMessagesByJid(
  jid: string
): Promise<Array<Record<string, any>> | null> {
  if (isPlaceholderEnv()) return null;
  const ctx = await getServiceContext();
  if (!ctx) return null;
  const conv = await resolveOrCreateConversation({
    db: ctx.db,
    organizationId: ctx.organizationId,
    phoneOrJid: jid,
    createIfMissing: false,
  });
  if (!conv) return null;
  const { data } = await ctx.db
    .from('messages')
    .select('*')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true });
  return data || [];
}

function tsToIso(messageTimestamp: any): string | undefined {
  if (!messageTimestamp) return undefined;
  const n = typeof messageTimestamp === 'number' ? messageTimestamp : Number(messageTimestamp);
  if (!n || isNaN(n)) return undefined;
  const ms = n < 1000000000000 ? n * 1000 : n;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Reconciliação/backfill: recebe os registros brutos da Evolution e persiste no
 *  Supabase o que faltar (idempotente por external_message_id), resolvendo o
 *  telefone real do LID (key.remoteJidAlt). Garante que TUDO fique gravado mesmo
 *  se um evento de webhook tiver sido perdido, e recupera respostas antigas. */
export async function reconcileEvolutionRecords(
  records: any[],
  instanceName?: string
): Promise<{ persisted: number; scanned: number }> {
  if (isPlaceholderEnv() || !Array.isArray(records) || records.length === 0) {
    return { persisted: 0, scanned: 0 };
  }
  const ctx = await getServiceContext();
  if (!ctx) return { persisted: 0, scanned: 0 };

  // Ordena do mais antigo p/ o mais novo (preserva a ordem no banco).
  const sorted = [...records].sort(
    (a, b) => Number(a?.messageTimestamp || 0) - Number(b?.messageTimestamp || 0)
  );

  let persisted = 0;
  for (const m of sorted) {
    const key = m?.key;
    if (!key) continue;
    const rawJid: string = key.remoteJid || '';
    const isLid = rawJid.endsWith('@lid') || key.addressingMode === 'lid';
    const realJid: string = isLid ? (key.remoteJidAlt || key.senderPn || rawJid) : rawJid;
    if (!realJid || realJid.includes('@g.us')) continue;
    const digits = canonicalDigits(realJid);
    if (!digits || digits.length < 8) continue; // LID sem telefone → não dá p/ casar

    const text =
      m.message?.conversation ||
      m.message?.extendedTextMessage?.text ||
      m.message?.imageMessage?.caption ||
      m.message?.documentMessage?.caption ||
      '';
    if (!text) continue;

    const conv = await resolveOrCreateConversation({
      db: ctx.db,
      organizationId: ctx.organizationId,
      phoneOrJid: realJid,
      name: m.pushName,
      instanceName,
    });
    if (!conv) continue;

    const inserted = await persistMessage({
      db: ctx.db,
      organizationId: ctx.organizationId,
      conversationId: conv.id,
      senderType: key.fromMe ? 'agent' : 'contact',
      content: text,
      externalId: key.id,
      deliveryStatus: key.fromMe ? 'sent' : 'delivered',
      updateConversationPreview: false,
      createdAt: tsToIso(m.messageTimestamp),
    });
    if (inserted) persisted++;
  }
  return { persisted, scanned: sorted.length };
}

/** Persiste uma mensagem a partir do JID (resolve/cria a conversa antes). Usado
 *  por webhook e disparo, que rodam server-to-server com service-role. */
export async function persistMessageByJid(params: {
  phoneOrJid: string;
  senderType: SenderType;
  content: string;
  name?: string;
  externalId?: string;
  instanceName?: string;
  deliveryStatus?: string;
}): Promise<string | null> {
  if (isPlaceholderEnv()) return null;
  const ctx = await getServiceContext();
  if (!ctx) return null;
  const conv = await resolveOrCreateConversation({
    db: ctx.db,
    organizationId: ctx.organizationId,
    phoneOrJid: params.phoneOrJid,
    name: params.name,
    instanceName: params.instanceName,
  });
  if (!conv) return null;
  await persistMessage({
    db: ctx.db,
    organizationId: ctx.organizationId,
    conversationId: conv.id,
    senderType: params.senderType,
    content: params.content,
    externalId: params.externalId,
    deliveryStatus: params.deliveryStatus,
  });
  return conv.id;
}
