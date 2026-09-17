import { NextRequest, NextResponse } from 'next/server';
import { Message } from '@/types';
import {
  getMessagesByConversationId,
  getPhoneByConversationId,
  addOutboundMessage,
} from '@/lib/conversationStore';
import { getRealMessages, sendRealMessageDetailed } from '@/lib/evolutionService';
import { getDbContext, isPlaceholderEnv } from '@/lib/supabase/authContext';
import { resolveOrCreateConversation, persistMessage, canonicalDigits } from '@/lib/conversationRepo';

export const dynamic = 'force-dynamic';

function dbRowToMessage(m: any): Message {
  return {
    ...m,
    sender_name: m.sender_type === 'agent' ? 'Você (Atendente)' : 'Contato',
  } as Message;
}

// GET: histórico da conversa = mensagens PERSISTIDAS (Supabase, keyed por JID) +
// enriquecimento com o que a Evolution tem ao vivo, deduplicado por id externo.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const decodedId = decodeURIComponent(params.id);
    const instance = req.nextUrl.searchParams.get('instance') || undefined;

    // Lê Supabase (fonte durável) e Evolution (histórico ao vivo) EM PARALELO
    // para cortar latência — antes eram duas idas sequenciais.
    const dbPromise: Promise<Message[]> = (async () => {
      if (isPlaceholderEnv()) return [];
      try {
        const ctx = await getDbContext();
        if (!ctx) return [];
        const conv = await resolveOrCreateConversation({
          db: ctx.db,
          organizationId: ctx.organizationId,
          phoneOrJid: decodedId,
          instanceName: instance,
          createIfMissing: false,
        });
        if (!conv) return [];
        const { data } = await ctx.db
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });
        return (data || []).map(dbRowToMessage);
      } catch (dbErr) {
        console.warn('[API messages GET] leitura Supabase falhou:', dbErr);
        return [];
      }
    })();

    const [dbMessages, realMsgs] = await Promise.all([
      dbPromise,
      getRealMessages(decodedId, instance),
    ]);

    // Mensagens da sessão de pesquisa em memória (fallback dev/instante).
    let memoryMsgs = getMessagesByConversationId(decodedId);
    if (memoryMsgs.length === 0) {
      const cleanDigits = decodedId.replace(/\D/g, '');
      if (cleanDigits) {
        try {
          const { getPesquisaSessionByPhone } = await import('@/lib/pesquisaSenadoStore');
          const { ensurePesquisaConversation } = await import('@/lib/conversationStore');
          const session = await getPesquisaSessionByPhone(cleanDigits);
          if (session) {
            ensurePesquisaConversation({
              phone: session.phone,
              name: session.name,
              bairro: session.bairro,
              etapa: session.etapa,
              voto1Nome: session.voto1Nome,
              voto1Id: session.voto1Id,
              voto2Nome: session.voto2Nome,
              voto2Id: session.voto2Id,
            });
            memoryMsgs = getMessagesByConversationId(decodedId);
            if (memoryMsgs.length === 0) {
              memoryMsgs = getMessagesByConversationId(`${cleanDigits}@s.whatsapp.net`);
            }
          }
        } catch (e) {
          console.error('[API messages] Erro ao recuperar mensagens de pesquisa:', e);
        }
      }
    }

    // Merge deduplicado: DB (fonte durável) → Evolution → memória.
    const byKey = new Map<string, Message>();
    const keyOf = (m: any) => m.external_message_id || m.id;
    for (const m of dbMessages) byKey.set(keyOf(m), m);
    for (const m of realMsgs) if (!byKey.has(keyOf(m))) byKey.set(keyOf(m), m);
    for (const m of memoryMsgs) if (!byKey.has(keyOf(m))) byKey.set(keyOf(m), m);

    const messages = Array.from(byKey.values()).sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );

    return NextResponse.json({ success: true, count: messages.length, messages });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao buscar mensagens', message: err.message },
      { status: 500 }
    );
  }
}

// POST: envia de verdade pela Evolution E persiste no Supabase (keyed por JID).
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const decodedId = decodeURIComponent(params.id);
    const body = await req.json();
    const { content, message_type = 'text', sender_name = 'Atendente' } = body;
    const instance = body.instance || req.nextUrl.searchParams.get('instance') || undefined;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Conteúdo da mensagem é obrigatório' }, { status: 400 });
    }

    const targetPhone =
      body.phone || body.recipient_phone || getPhoneByConversationId(decodedId) || decodedId;

    // 1. DISPARO REAL (delay 0 = resposta ao vivo, menor latência).
    const sendRes = await sendRealMessageDetailed(targetPhone, content.trim(), instance, 0);

    // 2. PERSISTÊNCIA no Supabase (resolve/cria conversa pelo JID canônico).
    let insertedMessage: Message | null = null;
    if (!isPlaceholderEnv()) {
      try {
        const ctx = await getDbContext();
        if (ctx) {
          const conv = await resolveOrCreateConversation({
            db: ctx.db,
            organizationId: ctx.organizationId,
            phoneOrJid: targetPhone,
            name: body.name,
            instanceName: instance,
          });
          if (conv) {
            await persistMessage({
              db: ctx.db,
              organizationId: ctx.organizationId,
              conversationId: conv.id,
              senderType: 'agent',
              content: content.trim(),
              externalId: sendRes.messageId, // dedupe vs eco da Evolution
              senderId: ctx.isDemo ? null : ctx.userId,
              deliveryStatus: sendRes.ok ? 'sent' : 'failed',
            });
            insertedMessage = {
              id: sendRes.messageId || `db-${Date.now()}`,
              organization_id: ctx.organizationId,
              conversation_id: canonicalDigits(targetPhone),
              sender_type: 'agent',
              sender_name,
              content: content.trim(),
              message_type,
              delivery_status: sendRes.ok ? 'sent' : 'failed',
              external_message_id: sendRes.messageId,
              created_at: new Date().toISOString(),
            } as Message;
          }
        }
      } catch (dbErr) {
        console.warn('[API messages POST] persistência Supabase falhou:', dbErr);
      }
    }

    // 3. Espelho em memória (instantâneo no Inbox / fallback dev).
    const storeMessage = addOutboundMessage({
      conversationId: decodedId,
      content: content.trim(),
      senderName: sender_name,
      deliveryStatus: sendRes.ok ? 'sent' : 'failed',
    });

    const finalMessage: Message = insertedMessage || storeMessage;

    return NextResponse.json(
      { success: true, evolutionDispatched: sendRes.ok, message: finalMessage },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao enviar mensagem', message: err.message },
      { status: 500 }
    );
  }
}
