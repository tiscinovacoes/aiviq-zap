import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Message } from '@/types';

export const dynamic = 'force-dynamic';

// In-memory messages map per conversation for dev mode
const conversationMessages: Record<string, Message[]> = {
  'conv-001': [
    {
      id: 'msg-1',
      organization_id: '00000000-0000-0000-0000-000000000000',
      conversation_id: 'conv-001',
      sender_type: 'contact',
      sender_name: 'Mariana Silva',
      content: 'Olá! Gostaria de saber mais sobre a integração com a WhatsApp Cloud API oficial e os planos empresariais.',
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
      content: 'Olá Mariana! Seja muito bem-vinda à Poli. A nossa plataforma utiliza a API Oficial da Cloud API com isolamento multi-tenant e RLS completo.',
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
      content: 'Excelente! Qual o valor do plano Pro para 10 atendentes?',
      message_type: 'text',
      delivery_status: 'read',
      created_at: '14:31',
    },
    {
      id: 'msg-4',
      organization_id: '00000000-0000-0000-0000-000000000000',
      conversation_id: 'conv-001',
      sender_type: 'agent',
      sender_name: 'Lucas R.',
      content: 'O plano Pro para 10 atendentes fica por R$ 890/mês com CRM integrado e automações ilimitadas. Deseja que eu envie a proposta formal?',
      message_type: 'text',
      delivery_status: 'read',
      created_at: '14:31',
    },
    {
      id: 'msg-5',
      organization_id: '00000000-0000-0000-0000-000000000000',
      conversation_id: 'conv-001',
      sender_type: 'contact',
      sender_name: 'Mariana Silva',
      content: 'Perfeito, aguardo o link de pagamento do plano Pro!',
      message_type: 'text',
      delivery_status: 'read',
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
      content: 'Boa tarde! Vocês emitem nota fiscal para pessoa jurídica e faturam via boleto bancário?',
      message_type: 'text',
      delivery_status: 'delivered',
      created_at: '14:20',
    },
  ],
  'conv-003': [
    {
      id: 'msg-301',
      organization_id: '00000000-0000-0000-0000-000000000000',
      conversation_id: 'conv-003',
      sender_type: 'contact',
      sender_name: 'Juliana Mendes',
      content: 'Gostaria de agendar uma demonstração do sistema para nosso escritório de advocacia.',
      message_type: 'text',
      delivery_status: 'delivered',
      created_at: '13:58',
    },
  ],
  'conv-004': [
    {
      id: 'msg-401',
      organization_id: '00000000-0000-0000-0000-000000000000',
      conversation_id: 'conv-004',
      sender_type: 'contact',
      sender_name: 'Roberto Almeida',
      content: 'Tive um erro ao sincronizar o webhook com o sistema legado, o erro retornado foi 401 unauthorized.',
      message_type: 'text',
      delivery_status: 'read',
      created_at: '11:45',
    },
  ],
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const supabase = await createClient();
    const isDev = process.env.NODE_ENV === 'development';
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let messages: Message[] = [];

    if (!isPlaceholder) {
      const { data: dbMessages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (error) {
        if (!isDev) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        messages = conversationMessages[id] || [];
      } else {
        messages = (dbMessages || []).map((m: any) => ({
          ...m,
          sender_name: m.sender_type === 'agent' ? 'Atendente' : 'Contato',
        })) as unknown as Message[];
      }
    } else {
      messages = conversationMessages[id] || [];
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
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }

      // Query user profile to obtain organization_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile || !profile.organization_id) {
        return NextResponse.json({ error: 'Organização não encontrada para o usuário' }, { status: 403 });
      }

      // Insert message into DB
      const { data: insertedMessage, error: msgError } = await supabase
        .from('messages')
        .insert({
          organization_id: profile.organization_id,
          conversation_id: id,
          sender_type: 'agent',
          sender_id: user.id,
          content: content.trim(),
          message_type,
          delivery_status: 'sent',
        })
        .select()
        .single();

      if (msgError) {
        return NextResponse.json({ error: msgError.message }, { status: 500 });
      }

      // Update conversation last message preview & timestamp
      await supabase
        .from('conversations')
        .update({
          last_message_preview: content.trim(),
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      return NextResponse.json({
        success: true,
        message: {
          ...insertedMessage,
          sender_name,
        },
      }, { status: 201 });
    }

    // Fallback for dev mode without database connected
    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      organization_id: '00000000-0000-0000-0000-000000000000',
      conversation_id: id,
      sender_type: 'agent',
      sender_name,
      content,
      message_type,
      delivery_status: 'sent',
      created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    if (!conversationMessages[id]) {
      conversationMessages[id] = [];
    }
    conversationMessages[id].push(newMessage);

    return NextResponse.json({
      success: true,
      simulated: true,
      message: newMessage,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao enviar mensagem', message: err.message },
      { status: 500 }
    );
  }
}

