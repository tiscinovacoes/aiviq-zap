import { NextRequest, NextResponse } from 'next/server';
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
    expected_close_date: '2026-09-01',
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
    const totalPipelineValue = mockDeals
      .filter((d) => d.stage !== 'perdido')
      .reduce((acc, d) => acc + d.value, 0);

    const wonValue = mockDeals
      .filter((d) => d.stage === 'fechado_ganho')
      .reduce((acc, d) => acc + d.value, 0);

    const averageTicket = mockDeals.length > 0 ? Math.round(totalPipelineValue / mockDeals.length) : 0;

    return NextResponse.json({
      success: true,
      metrics: {
        totalPipelineValue,
        wonValue,
        averageTicket,
        totalDeals: mockDeals.length,
        conversionRate: '28.5%',
      },
      deals: mockDeals,
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

    return NextResponse.json({ success: true, deal: newDeal }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao criar oportunidade', message: err.message },
      { status: 500 }
    );
  }
}
