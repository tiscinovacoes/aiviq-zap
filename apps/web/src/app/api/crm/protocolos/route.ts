import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Protocolo } from '@/types';

export const dynamic = 'force-dynamic';

// Situações não-terminais (protocolo ainda em tramitação)
const EM_ABERTO: Protocolo['status'][] = [
  'aberto',
  'em_analise',
  'em_atendimento',
  'aguardando_cidadao',
];

let mockProtocolos: Protocolo[] = [
  {
    id: 'prot-001',
    organization_id: '00000000-0000-0000-0000-000000000000',
    contact_id: 'cid-001',
    protocol_number: '2026-000101',
    title: 'Buraco na via causando acidentes na Rua das Acácias',
    tipo_manifestacao: 'reclamacao',
    categoria: 'Infraestrutura',
    orgao_responsavel: 'Secretaria de Obras',
    bairro: 'Centro',
    prioridade: 'alta',
    status: 'em_atendimento',
    due_date: '2026-09-25',
    assignee_name: 'Ana Paula',
    created_at: '2026-09-10T14:00:00Z',
    contact: {
      id: 'cid-001',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Mariana Silva',
      phone: '+55 (11) 98765-4321',
      bairro: 'Centro',
      tags: ['Infraestrutura'],
      custom_attributes: {},
    },
  },
  {
    id: 'prot-002',
    organization_id: '00000000-0000-0000-0000-000000000000',
    contact_id: 'cid-002',
    protocol_number: '2026-000102',
    title: 'Falta de medicamento na UBS do bairro',
    tipo_manifestacao: 'denuncia',
    categoria: 'Saúde',
    orgao_responsavel: 'Secretaria de Saúde',
    bairro: 'Jardim União',
    prioridade: 'urgente',
    status: 'em_analise',
    due_date: '2026-09-18',
    assignee_name: 'Carlos Eduardo',
    created_at: '2026-09-11T10:30:00Z',
    contact: {
      id: 'cid-002',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Carlos Eduardo',
      bairro: 'Jardim União',
      tags: ['Saúde'],
      custom_attributes: {},
    },
  },
  {
    id: 'prot-003',
    organization_id: '00000000-0000-0000-0000-000000000000',
    contact_id: 'cid-003',
    protocol_number: '2026-000103',
    title: 'Solicitação de poda de árvore em frente à residência',
    tipo_manifestacao: 'solicitacao',
    categoria: 'Zeladoria Urbana',
    orgao_responsavel: 'Secretaria de Meio Ambiente',
    bairro: 'Vila Nova',
    prioridade: 'media',
    status: 'aberto',
    due_date: '2026-10-05',
    assignee_name: 'Ana Paula',
    created_at: '2026-09-12T15:20:00Z',
    contact: {
      id: 'cid-003',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Juliana Mendes',
      bairro: 'Vila Nova',
      tags: ['Zeladoria Urbana'],
      custom_attributes: {},
    },
  },
  {
    id: 'prot-004',
    organization_id: '00000000-0000-0000-0000-000000000000',
    contact_id: 'cid-004',
    protocol_number: '2026-000104',
    title: 'Iluminação pública queimada há duas semanas',
    tipo_manifestacao: 'reclamacao',
    categoria: 'Iluminação',
    orgao_responsavel: 'Secretaria de Obras',
    bairro: 'Parque Industrial',
    prioridade: 'media',
    status: 'aguardando_cidadao',
    due_date: '2026-09-20',
    assignee_name: 'Lucas R.',
    created_at: '2026-09-09T16:00:00Z',
    contact: {
      id: 'cid-004',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Fernanda Rocha',
      bairro: 'Parque Industrial',
      tags: ['Iluminação'],
      custom_attributes: {},
    },
  },
  {
    id: 'prot-005',
    organization_id: '00000000-0000-0000-0000-000000000000',
    contact_id: 'cid-005',
    protocol_number: '2026-000098',
    title: 'Elogio ao atendimento da equipe de vacinação',
    tipo_manifestacao: 'elogio',
    categoria: 'Saúde',
    orgao_responsavel: 'Secretaria de Saúde',
    bairro: 'Centro',
    prioridade: 'baixa',
    status: 'resolvido',
    due_date: '2026-08-25',
    assignee_name: 'Lucas R.',
    created_at: '2026-08-20T11:00:00Z',
    closed_at: '2026-08-24T09:00:00Z',
    contact: {
      id: 'cid-005',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Roberto Almeida',
      bairro: 'Centro',
      tags: ['Saúde'],
      custom_attributes: {},
    },
  },
];

function computeMetrics(protocolos: Protocolo[]) {
  const hoje = new Date().toISOString().slice(0, 10);
  const total = protocolos.length;
  const resolvidos = protocolos.filter((p) => p.status === 'resolvido').length;
  const abertos = protocolos.filter((p) => EM_ABERTO.includes(p.status)).length;
  const foraDoPrazo = protocolos.filter(
    (p) => EM_ABERTO.includes(p.status) && p.due_date && p.due_date < hoje
  ).length;
  const taxaResolucao = total > 0 ? `${((resolvidos / total) * 100).toFixed(1)}%` : '0%';

  return { totalProtocolos: total, abertos, resolvidos, foraDoPrazo, taxaResolucao };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let protocolos: Protocolo[] = mockProtocolos;

    if (!isPlaceholder) {
      const { data: dbProtocolos, error } = await supabase
        .from('protocolos')
        .select('*, contact:contacts(*)');

      if (!error && dbProtocolos && dbProtocolos.length > 0) {
        protocolos = dbProtocolos as unknown as Protocolo[];
      } else {
        // Fallback para os protocolos de exemplo (dá dados iniciais ao painel)
        protocolos = mockProtocolos;
      }
    }

    return NextResponse.json({
      success: true,
      metrics: computeMetrics(protocolos),
      protocolos,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao listar protocolos', message: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      tipo_manifestacao = 'solicitacao',
      categoria,
      orgao_responsavel,
      bairro,
      prioridade = 'media',
      status = 'aberto',
      due_date,
      contact_name,
      assignee_name = 'Equipe de Ouvidoria',
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'O assunto do protocolo é obrigatório' }, { status: 400 });
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

      // Localiza ou cria o cidadão
      const { data: contact } = await supabase
        .from('contacts')
        .insert({
          organization_id: profile.organization_id,
          name: contact_name || 'Cidadão não identificado',
          bairro: bairro || null,
          tags: ['Ouvidoria'],
        })
        .select()
        .single();

      const { data: insertedProtocolo, error: protocoloError } = await supabase
        .from('protocolos')
        .insert({
          organization_id: profile.organization_id,
          contact_id: contact?.id,
          title,
          tipo_manifestacao,
          categoria: categoria || null,
          orgao_responsavel: orgao_responsavel || null,
          bairro: bairro || null,
          prioridade,
          status,
          due_date: due_date || null,
          assignee_id: user.id,
        })
        .select('*, contact:contacts(*)')
        .single();

      if (protocoloError) {
        // Se a tabela protocolos ainda não foi provisionada, cai no fallback simulado.
        console.warn('[Ouvidoria Protocolos DB] Tabela ausente ou erro:', protocoloError.message);
      } else if (insertedProtocolo) {
        return NextResponse.json({ success: true, protocolo: insertedProtocolo }, { status: 201 });
      }
    }

    // Modo dev / fallback (número de protocolo simulado)
    const ano = new Date().getFullYear();
    const seq = String(mockProtocolos.length + 1).padStart(6, '0');
    const newProtocolo: Protocolo = {
      id: `prot-${Date.now()}`,
      organization_id: '00000000-0000-0000-0000-000000000000',
      contact_id: `cid-${Date.now()}`,
      protocol_number: `${ano}-${seq}`,
      title,
      tipo_manifestacao,
      categoria,
      orgao_responsavel,
      bairro,
      prioridade,
      status,
      due_date,
      assignee_name,
      created_at: new Date().toISOString(),
      contact: {
        id: `cid-${Date.now()}`,
        organization_id: '00000000-0000-0000-0000-000000000000',
        name: contact_name || 'Cidadão não identificado',
        bairro,
        tags: ['Ouvidoria'],
        custom_attributes: {},
      },
    };

    mockProtocolos.unshift(newProtocolo);

    return NextResponse.json({ success: true, simulated: true, protocolo: newProtocolo }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao abrir protocolo', message: err.message },
      { status: 500 }
    );
  }
}
