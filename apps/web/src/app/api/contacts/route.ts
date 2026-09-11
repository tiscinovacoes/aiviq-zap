import { NextRequest, NextResponse } from 'next/server';
import { Contact } from '@/types';

export const dynamic = 'force-dynamic';

let mockContacts: Contact[] = [
  {
    id: 'cont-001',
    organization_id: '00000000-0000-0000-0000-000000000000',
    name: 'Mariana Silva',
    phone: '+55 (11) 98765-4321',
    email: 'mariana@techcorp.com.br',
    company: 'TechCorp Soluções Digitais',
    tags: ['VIP', 'Lead Quente', 'Plano Pro'],
    assigned_to: 'Lucas R.',
    custom_attributes: {
      cargo: 'Head de Operações & CS',
      cidade: 'São Paulo - SP',
      segmento: 'Tecnologia B2B',
    },
    created_at: '2026-08-15T10:00:00Z',
  },
  {
    id: 'cont-002',
    organization_id: '00000000-0000-0000-0000-000000000000',
    name: 'Carlos Eduardo',
    phone: '+55 (21) 99876-1234',
    email: 'carlos@empresa.com.br',
    company: 'Eduardo Logística Ltda',
    tags: ['Aguardando Atendente', 'PJ'],
    assigned_to: 'Lucas R.',
    custom_attributes: {
      cargo: 'Diretor Financeiro',
      cidade: 'Rio de Janeiro - RJ',
    },
    created_at: '2026-08-20T14:30:00Z',
  },
  {
    id: 'cont-003',
    organization_id: '00000000-0000-0000-0000-000000000000',
    name: 'Juliana Mendes',
    phone: '+55 (31) 97654-8901',
    email: 'juliana@mendesadv.com',
    company: 'Mendes Advocacia Associada',
    tags: ['Novo Lead', 'Instagram'],
    assigned_to: 'Ana Paula',
    custom_attributes: {
      cargo: 'Sócia Fundadora',
      cidade: 'Belo Horizonte - MG',
    },
    created_at: '2026-09-01T09:15:00Z',
  },
  {
    id: 'cont-004',
    organization_id: '00000000-0000-0000-0000-000000000000',
    name: 'Roberto Almeida',
    phone: '+55 (41) 98456-7890',
    email: 'roberto@devlab.io',
    company: 'DevLab Software & AI',
    tags: ['Suporte N2', 'Cliente Ativo'],
    assigned_to: 'Lucas R.',
    custom_attributes: {
      cargo: 'CTO',
      cidade: 'Curitiba - PR',
    },
    created_at: '2026-07-10T11:45:00Z',
  },
  {
    id: 'cont-005',
    organization_id: '00000000-0000-0000-0000-000000000000',
    name: 'Fernanda Rocha',
    phone: '+55 (19) 99123-4567',
    email: 'fernanda@agroforte.com.br',
    company: 'AgroForte Distribuidora',
    tags: ['Enterprise', 'Lead Quente'],
    assigned_to: 'Lucas R.',
    custom_attributes: {
      cargo: 'Gerente Comercial',
      cidade: 'Campinas - SP',
    },
    created_at: '2026-09-05T16:20:00Z',
  },
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tag = searchParams.get('tag');
    const assigned = searchParams.get('assigned_to');
    const query = searchParams.get('q')?.toLowerCase();

    let contacts = [...mockContacts];

    if (tag && tag !== 'all') {
      contacts = contacts.filter((c) => c.tags.includes(tag));
    }

    if (assigned && assigned !== 'all') {
      contacts = contacts.filter((c) => c.assigned_to === assigned);
    }

    if (query) {
      contacts = contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.email?.toLowerCase().includes(query) ||
          c.phone?.includes(query) ||
          c.company?.toLowerCase().includes(query)
      );
    }

    return NextResponse.json({
      success: true,
      count: contacts.length,
      contacts,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao listar contatos', message: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, email, company, tags = [], assigned_to = 'Lucas R.' } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nome do contato é obrigatório' }, { status: 400 });
    }

    const newContact: Contact = {
      id: `cont-${Date.now()}`,
      organization_id: '00000000-0000-0000-0000-000000000000',
      name,
      phone: phone || '',
      email: email || '',
      company: company || '',
      tags: tags.length > 0 ? tags : ['Novo Lead'],
      assigned_to,
      custom_attributes: {},
      created_at: new Date().toISOString(),
    };

    mockContacts.unshift(newContact);

    return NextResponse.json({ success: true, contact: newContact }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao cadastrar contato', message: err.message },
      { status: 500 }
    );
  }
}
