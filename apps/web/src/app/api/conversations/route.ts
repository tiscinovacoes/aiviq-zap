import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Conversation } from '@/types';

export const dynamic = 'force-dynamic';

// Seed sample data strictly for local development inspection when database is unprovisioned
const DEV_SAMPLE_CONVERSATIONS: Conversation[] = [
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
        deal_stage: 'Proposta Enviada',
        nota: 'Lead altamente interessada em fechar hoje antes do final do mês.',
      },
    },
    assignee: {
      id: 'usr-001',
      organization_id: '00000000-0000-0000-0000-000000000000',
      email: 'admin@poli.dev',
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
  {
    id: 'conv-003',
    organization_id: '00000000-0000-0000-0000-000000000000',
    inbox_id: 'inbox-instagram',
    contact_id: 'cont-003',
    channel_type: 'instagram',
    status: 'open',
    priority: 'low',
    last_message_preview: 'Gostaria de agendar uma demonstração do sistema...',
    last_message_at: '13:58',
    unread_count: 0,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    contact: {
      id: 'cont-003',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Juliana Mendes',
      phone: '+55 (31) 97654-8901',
      email: 'juliana@mendesadv.com',
      tags: ['Novo Lead', 'Instagram'],
      custom_attributes: {
        empresa: 'Mendes Advocacia',
      },
    },
  },
  {
    id: 'conv-004',
    organization_id: '00000000-0000-0000-0000-000000000000',
    inbox_id: 'inbox-webchat',
    contact_id: 'cont-004',
    channel_type: 'webchat',
    status: 'resolved',
    priority: 'urgent',
    last_message_preview: 'Tive um erro ao sincronizar o webhook',
    last_message_at: '11:45',
    unread_count: 0,
    created_at: new Date(Date.now() - 14400000).toISOString(),
    contact: {
      id: 'cont-004',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Roberto Almeida',
      phone: '+55 (41) 98456-7890',
      email: 'roberto@devlab.io',
      tags: ['Suporte N2', 'Resolvido'],
      custom_attributes: {
        empresa: 'DevLab Solutions',
      },
    },
  },
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const channel = searchParams.get('channel');
    const query = searchParams.get('q')?.toLowerCase();

    // Authenticated server client reading user session cookies (CR-001 B3)
    const supabase = await createClient();
    const isDev = process.env.NODE_ENV === 'development';
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let conversations: Conversation[] = [];

    if (!isPlaceholder) {
      // Direct RLS query with user session JWT
      const { data: dbConversations, error } = await supabase
        .from('conversations')
        .select('*, contact:contacts(*), assignee:profiles(*)');

      if (error) {
        if (!isDev) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        conversations = DEV_SAMPLE_CONVERSATIONS;
      } else {
        // Legitimate empty list is returned without fallback (CR-001 B4)
        conversations = (dbConversations || []) as unknown as Conversation[];
      }
    } else {
      // Local dev mode without database connected
      conversations = isDev ? DEV_SAMPLE_CONVERSATIONS : [];
    }

    // Apply query filters
    if (status) {
      conversations = conversations.filter((c) => c.status === status);
    }
    if (channel && channel !== 'all') {
      conversations = conversations.filter((c) => c.channel_type === channel);
    }
    if (query) {
      conversations = conversations.filter(
        (c) =>
          c.contact?.name.toLowerCase().includes(query) ||
          c.contact?.phone?.includes(query) ||
          c.last_message_preview?.toLowerCase().includes(query) ||
          c.contact?.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    return NextResponse.json({
      success: true,
      count: conversations.length,
      conversations,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao listar conversas', message: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contact_name, phone, channel_type = 'whatsapp_cloud', initial_message } = body;

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

      if (!profile) {
        return NextResponse.json({ error: 'Perfil de usuário não encontrado' }, { status: 404 });
      }

      // Insert contact
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          organization_id: profile.organization_id,
          name: contact_name || 'Novo Contato',
          phone: phone || null,
          tags: ['Novo Lead'],
        })
        .select()
        .single();

      if (contactError) {
        return NextResponse.json({ error: contactError.message }, { status: 500 });
      }

      // Find or insert inbox
      const { data: inbox } = await supabase
        .from('inboxes')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .limit(1)
        .single();

      // Insert conversation
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          organization_id: profile.organization_id,
          inbox_id: inbox?.id,
          contact_id: contact.id,
          status: 'open',
          last_message_preview: initial_message || 'Nova conversa iniciada',
        })
        .select('*, contact:contacts(*)')
        .single();

      if (convError) {
        return NextResponse.json({ error: convError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, conversation }, { status: 201 });
    }

    // Dev mode fallback
    const newConversation: Conversation = {
      id: `conv-${Date.now()}`,
      organization_id: '00000000-0000-0000-0000-000000000000',
      inbox_id: `inbox-${channel_type}`,
      contact_id: `cont-${Date.now()}`,
      channel_type,
      status: 'open',
      priority: 'medium',
      last_message_preview: initial_message || 'Nova conversa iniciada',
      last_message_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      unread_count: 0,
      created_at: new Date().toISOString(),
      contact: {
        id: `cont-${Date.now()}`,
        organization_id: '00000000-0000-0000-0000-000000000000',
        name: contact_name || 'Novo Contato',
        phone: phone || '',
        tags: ['Novo Lead'],
        custom_attributes: {},
      },
    };

    return NextResponse.json({
      success: true,
      conversation: newConversation,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao criar conversa', message: err.message },
      { status: 500 }
    );
  }
}
