import { Protocolo, Cidadao } from '@/types';

// =====================================================================
// Dados de exemplo da Ouvidoria (modo dev / sem banco). Fonte ÚNICA para
// os protocolos e para os cidadãos, garantindo que a lista de cidadãos e
// o CRM 360º apontem para os mesmos registros.
// =====================================================================

// Situações não-terminais (protocolo ainda em tramitação)
export const EM_ABERTO: Protocolo['status'][] = [
  'aberto',
  'em_analise',
  'em_atendimento',
  'aguardando_cidadao',
];

export const mockProtocolos: Protocolo[] = [
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
      email: 'mariana.silva@email.com',
      cpf: '123.456.789-00',
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
      phone: '+55 (11) 97654-3210',
      cpf: '234.567.890-11',
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
      phone: '+55 (11) 96543-2109',
      cpf: '345.678.901-22',
      bairro: 'Vila Nova',
      tags: ['Zeladoria Urbana'],
      custom_attributes: {},
    },
  },
  {
    id: 'prot-004',
    organization_id: '00000000-0000-0000-0000-000000000000',
    contact_id: 'cid-001',
    protocol_number: '2026-000104',
    title: 'Iluminação pública queimada há duas semanas',
    tipo_manifestacao: 'reclamacao',
    categoria: 'Iluminação',
    orgao_responsavel: 'Secretaria de Obras',
    bairro: 'Centro',
    prioridade: 'media',
    status: 'aguardando_cidadao',
    due_date: '2026-09-20',
    assignee_name: 'Lucas R.',
    created_at: '2026-09-09T16:00:00Z',
    contact: {
      id: 'cid-001',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Mariana Silva',
      phone: '+55 (11) 98765-4321',
      email: 'mariana.silva@email.com',
      cpf: '123.456.789-00',
      bairro: 'Centro',
      tags: ['Infraestrutura'],
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
      phone: '+55 (11) 95432-1098',
      cpf: '456.789.012-33',
      bairro: 'Centro',
      tags: ['Saúde'],
      custom_attributes: {},
    },
  },
];

// Métricas globais do painel de protocolos
export function computeProtocoloMetrics(protocolos: Protocolo[]) {
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

// Resumo por cidadão (para o CRM 360º)
export function resumoCidadao(protocolos: Protocolo[]) {
  const total = protocolos.length;
  const abertos = protocolos.filter((p) => EM_ABERTO.includes(p.status)).length;
  const resolvidos = protocolos.filter((p) => p.status === 'resolvido').length;
  return { total, abertos, resolvidos };
}

// Cidadãos derivados dos protocolos (deduplicados por id) — usados no modo mock
export const mockCidadaos: Cidadao[] = Array.from(
  mockProtocolos.reduce((map, p) => {
    if (p.contact && !map.has(p.contact.id)) map.set(p.contact.id, p.contact);
    return map;
  }, new Map<string, Cidadao>()).values()
);

export function protocolosDoCidadao(contactId: string): Protocolo[] {
  return mockProtocolos.filter((p) => p.contact_id === contactId);
}

export function acharCidadaoMock(id: string): Cidadao | undefined {
  return mockCidadaos.find((c) => c.id === id);
}
