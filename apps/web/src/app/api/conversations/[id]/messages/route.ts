import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Message } from '@/types';
import {
  getMessagesByConversationId,
  getPhoneByConversationId,
  addOutboundMessage,
} from '@/lib/conversationStore';

export const dynamic = 'force-dynamic';

// GET: Buscar histórico de mensagens
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const supabase = await createClient();
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let messages: Message[] = [];

    if (!isPlaceholder) {
      const { data: dbMessages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (error || !dbMessages || dbMessages.length === 0) {
        messages = getMessagesByConversationId(id);
      } else {
        messages = (dbMessages || []).map((m: any) => ({
          ...m,
          sender_name: m.sender_type === 'agent' ? 'Atendente' : 'Contato',
        })) as unknown as Message[];
      }
    } else {
      messages = getMessagesByConversationId(id);
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
    const body = await req.json();
    const { content, message_type = 'text', sender_name = 'Lucas R.' } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Conteúdo da mensagem é obrigatório' }, { status: 400 });
    }

    const supabase = await createClient();
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    // Recuperar telefone de destino do body ou da conversa
    let targetPhone = body.phone || body.recipient_phone || getPhoneByConversationId(id);

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

        // Buscar telefone do contato associado à conversa caso ainda não tenha
        if (!targetPhone) {
          const { data: convData } = await supabase
            .from('conversations')
            .select('contact:contacts(phone)')
            .eq('id', id)
            .single();
          targetPhone = (convData as any)?.contact?.phone;
        }

        // Inserir mensagem no banco
        const { data: dbMsg } = await supabase
          .from('messages')
          .insert({
            organization_id: organizationId,
            conversation_id: id,
            sender_type: 'agent',
            sender_id: user?.id || null,
            content: content.trim(),
            message_type,
            delivery_status: 'sent',
          })
          .select()
          .single();

        insertedMessage = dbMsg;

        // Atualizar preview da conversa
        await supabase
          .from('conversations')
          .update({
            last_message_preview: content.trim(),
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      } catch (dbErr) {
        console.warn('[Supabase Insert Warn]:', dbErr);
      }
    }

    // ================= DISPARO REAL PELA EVOLUTION API =================
    const evolutionUrl =
      process.env.EVOLUTION_API_URL ||
      'https://evolution-api-production-8ecf.up.railway.app';
    const evolutionKey =
      process.env.EVOLUTION_API_KEY || 'aiviq_zap_secret_2026';
    const instanceName = 'aiviq_inbox_01';

    let evoDispatched = false;
    let evoResponse = null;

    if (targetPhone) {
      const cleanPhone = targetPhone.replace(/\D/g, '');
      if (cleanPhone.length >= 8) {
        try {
          const evoRes = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: evolutionKey,
            },
            body: JSON.stringify({
              number: cleanPhone,
              text: content.trim(),
              delay: 1000,
              linkPreview: true,
            }),
            signal: AbortSignal.timeout(8000),
          });

          if (evoRes.ok) {
            evoDispatched = true;
            evoResponse = await evoRes.json();
            console.log(
              `[Evolution API Outbound Success] Mensagem enviada para ${cleanPhone}: "${content.trim()}"`
            );
          } else {
            const errData = await evoRes.text();
            console.warn(`[Evolution API Outbound HTTP ${evoRes.status}]:`, errData);
          }
        } catch (err: any) {
          console.error('[Evolution API Outbound Error]:', err.message);
        }
      }
    }

    // Salva no store persistente em memória (para funcionar mesmo sem banco)
    const storeMessage = addOutboundMessage({
      conversationId: id,
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
        evoResponse,
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
