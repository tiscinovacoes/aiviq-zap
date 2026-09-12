import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Deal } from '@/types';

export const dynamic = 'force-dynamic';

let mockDeals: Deal[] = [
  {
    id: 'deal-001',
    organization_id: '00000000-0000-0000-0000-000000000000',
    contact_id: 'cont-001',
    title: 'Upgrade Plano Pro (10 licenças)',
    value: 10680,
    stage: 'proposta_enviada',
    probability: 80,
    expected_close_date: '2026-09-30',
    assignee_id: 'usr-001',
    assignee_name: 'Lucas R.',
    created_at: '2026-09-10T14:00:00Z',
    contact: {
      id: 'cont-001',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Mariana Silva',
      phone: '+55 (11) 98765-4321',
      company: 'TechCorp Soluções Digitais',
      tags: ['VIP', 'Lead Quente'],
      custom_attributes: {},
    },
  },
  {
    id: 'deal-002',
    organization_id: '00000000-0000-0000-0000-000000000000',
    contact_id: 'cont-002',
    title: 'Implantação WhatsApp Cloud API (PJ)',
    value: 4500,
    stage: 'contato_inicial',
    probability: 40,
    expected_close_date: '2026-10-15',
    assignee_id: 'usr-001',
    assignee_name: 'Lucas R.',
    created_at: '2026-09-11T10:30:00Z',
    contact: {
      id: 'cont-002',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Carlos Eduardo',
      company: 'Eduardo Logística Ltda',
      tags: ['PJ'],
      custom_attributes: {},
    },
  },
  {
    id: 'deal-003',
    organization_id: '00000000-0000-0000-0000-000000000000',
    contact_id: 'cont-003',
    title: 'Demonstração Escritório Advocacia',
    value: 3200,
    stage: 'demonstracao',
    probability: 60,
    expected_close_date: '2026-10-05',
    assignee_name: 'Ana Paula',
    created_at: '2026-09-08T15:20:00Z',
    contact: {
      id: 'cont-003',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Juliana Mendes',
      company: 'Mendes Advocacia',
      tags: ['Novo Lead'],
      custom_attributes: {},
    },
  },
  {
    id: 'deal-004',
    organization_id: '00000000-0000-0000-0000-000000000000',
    contact_id: 'cont-005',
    title: 'Contrato Anual Enterprise Multicanal',
    value: 28400,
    stage: 'lead_qualificado',
    probability: 30,
    expected_close_date: '2026-11-01',
    assignee_name: 'Lucas R.',
    created_at: '2026-09-09T16:00:00Z',
    contact: {
      id: 'cont-005',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Fernanda Rocha',
      company: 'AgroForte Distribuidora',
      tags: ['Enterprise'],
      custom_attributes: {},
    },
  },
  {
    id: 'deal-005',
    organization_id: '00000000-0000-0000-0000-000000000000',
    contact_id: 'cont-004',
    title: 'Renovação Suporte N2 + Webhooks',
    value: 7200,
    stage: 'fechado_ganho',
    probability: 100,
    expected_close_date: '2026-08-25',
    assignee_name: 'Lucas R.',
    created_at: '2026-08-25T11:00:00Z',
    contact: {
      id: 'cont-004',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Roberto Almeida',
      company: 'DevLab Solutions',
      tags: ['Cliente Ativo'],
      custom_attributes: {},
    },
  },
];

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const isDev = process.env.NODE_ENV === 'development';
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let deals: Deal[] = mockDeals;

    if (!isPlaceholder) {
      const { data: dbDeals, error } = await supabase
        .from('deals')
        .select('*, contact:contacts(*)');

      if (!error && dbDeals) {
        deals = dbDeals as unknown as Deal[];
      } else if (!isDev && error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const totalPipelineValue = deals
      .filter((d) => d.stage !== 'perdido')
      .reduce((acc, d) => acc + (d.value || 0), 0);

    const wonValue = deals
      .filter((d) => d.stage === 'fechado_ganho')
      .reduce((acc, d) => acc + (d.value || 0), 0);

    const averageTicket = deals.length > 0 ? Math.round(totalPipelineValue / deals.length) : 0;

    return NextResponse.json({
      success: true,
      metrics: {
        totalPipelineValue,
        wonValue,
        averageTicket,
        totalDeals: deals.length,
        conversionRate: '28.5%',
      },
      deals,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao listar oportunidades', message: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, value, stage = 'lead_qualificado', contact_name, company, assignee_name = 'Lucas R.' } = body;

    if (!title || !value) {
      return NextResponse.json({ error: 'Título e valor são obrigatórios' }, { status: 400 });
    }

    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile || !profile.organization_id) {
        return NextResponse.json({ error: 'Perfil de organização não encontrado' }, { status: 403 });
      }

      // Create or locate contact
      const { data: contact } = await supabase
        .from('contacts')
        .insert({
          organization_id: profile.organization_id,
          name: contact_name || 'Cliente Novo',
          tags: ['Novo Lead CRM'],
        })
        .select()
        .single();

      const { data: insertedDeal, error: dealError } = await supabase
        .from('deals')
        .insert({
          organization_id: profile.organization_id,
          contact_id: contact?.id,
          title,
          value: Number(value),
          stage,
          probability: stage === 'fechado_ganho' ? 100 : stage === 'proposta_enviada' ? 80 : 30,
          assignee_id: user.id,
        })
        .select('*, contact:contacts(*)')
        .single();

      if (dealError) {
        // If deals table is not yet provisioned in DB, gracefully return prepared object
        console.warn('[CRM Deals DB] Table not present or error:', dealError.message);
      } else if (insertedDeal) {
        return NextResponse.json({ success: true, deal: insertedDeal }, { status: 201 });
      }
    }

    // Dev mode / fallback
    const newDeal: Deal = {
      id: `deal-${Date.now()}`,
      organization_id: '00000000-0000-0000-0000-000000000000',
      contact_id: `cont-${Date.now()}`,
      title,
      value: Number(value),
      stage,
      probability: stage === 'fechado_ganho' ? 100 : stage === 'proposta_enviada' ? 80 : 30,
      assignee_name,
      created_at: new Date().toISOString(),
      contact: {
        id: `cont-${Date.now()}`,
        organization_id: '00000000-0000-0000-0000-000000000000',
        name: contact_name || 'Cliente Novo',
        company: company || '',
        tags: ['Novo Lead'],
        custom_attributes: {},
      },
    };

    mockDeals.unshift(newDeal);

    return NextResponse.json({ success: true, simulated: true, deal: newDeal }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao criar oportunidade', message: err.message },
      { status: 500 }
    );
  }
}

