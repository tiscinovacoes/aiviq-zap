import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Message } from '@/types';
import {
  getMessagesByConversationId,
  getPhoneByConversationId,
  addOutboundMessage,
} from '@/lib/conversationStore';
import { getRealMessages, sendRealMessage } from '@/lib/evolutionService';

export const dynamic = 'force-dynamic';

// GET: Buscar histórico de mensagens REAIS da conversa
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    // Decodifica o id caso venha URL encoded (ex: lid ou @s.whatsapp.net)
    const decodedId = decodeURIComponent(id);
    const instance = req.nextUrl.searchParams.get('instance') || undefined;

    const supabase = await createClient();
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let messages: Message[] = [];

    // 1. Tenta buscar do Supabase se configurado
    if (!isPlaceholder) {
      try {
        const { data: dbMessages } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', decodedId)
          .order('created_at', { ascending: true });

        if (dbMessages && dbMessages.length > 0) {
          messages = (dbMessages || []).map((m: any) => ({
            ...m,
            sender_name: m.sender_type === 'agent' ? 'Você (Atendente)' : 'Contato',
          })) as unknown as Message[];
        }
      } catch (dbErr) {}
    }

    // 2. Se não houver mensagens no banco, busca mensagens REAIS da Evolution API
    if (messages.length === 0) {
      const realMsgs = await getRealMessages(decodedId, instance);
      const memoryMsgs = getMessagesByConversationId(decodedId);

      // Mescla mensagens da API com mensagens em memória (enviadas na sessão atual)
      const existingIds = new Set(realMsgs.map((m) => m.id));
      const extraMemory = memoryMsgs.filter((m) => !existingIds.has(m.id));

      messages = [...realMsgs, ...extraMemory];
    }

    return NextResponse.json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao buscar mensagens', message: err.message },
      { status: 500 }
    );
  }
}

// POST: Enviar nova mensagem & disparar de verdade para o WhatsApp via Evolution API
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const decodedId = decodeURIComponent(id);
    const body = await req.json();
    const { content, message_type = 'text', sender_name = 'Luca Scandola' } = body;
    const instance = body.instance || req.nextUrl.searchParams.get('instance') || undefined;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Conteúdo da mensagem é obrigatório' }, { status: 400 });
    }

    const supabase = await createClient();
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    // Recuperar telefone ou JID de destino
    const targetPhone = body.phone || body.recipient_phone || getPhoneByConversationId(decodedId) || decodedId;

    // ================= DISPARO REAL PELA EVOLUTION API =================
    const evoDispatched = await sendRealMessage(targetPhone, content.trim(), instance);

    // Disparo para o banco de dados Supabase (se configurado)
    let insertedMessage: any = null;

    if (!isPlaceholder) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data: profile } = user
          ? await supabase
              .from('profiles')
              .select('organization_id')
              .eq('id', user.id)
              .single()
          : { data: null };

        const organizationId =
          profile?.organization_id || '00000000-0000-0000-0000-000000000000';

        const { data: dbMsg } = await supabase
          .from('messages')
          .insert({
            organization_id: organizationId,
            conversation_id: decodedId,
            sender_type: 'agent',
            sender_id: user?.id || null,
            content: content.trim(),
            message_type,
            delivery_status: evoDispatched ? 'delivered' : 'sent',
          })
          .select()
          .single();

        insertedMessage = dbMsg;

        await supabase
          .from('conversations')
          .update({
            last_message_preview: content.trim(),
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', decodedId);
      } catch (dbErr) {
        console.warn('[Supabase Insert Warn]:', dbErr);
      }
    }

    // Salva no store persistente em memória
    const storeMessage = addOutboundMessage({
      conversationId: decodedId,
      content: content.trim(),
      senderName: sender_name,
      deliveryStatus: evoDispatched ? 'delivered' : 'sent',
    });

    const finalMessage: Message = insertedMessage || storeMessage;

    return NextResponse.json(
      {
        success: true,
        evolutionDispatched: evoDispatched,
        message: finalMessage,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao enviar mensagem', message: err.message },
      { status: 500 }
    );
  }
}
