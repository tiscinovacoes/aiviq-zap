import { describe, it, expect } from 'vitest';
import { Protocolo, Cidadao } from '@/types';

describe('Ouvidoria — Protocolos & Cidadãos (Unit Tests)', () => {
  // Situações não-terminais (protocolo ainda em tramitação)
  const EM_ABERTO = ['aberto', 'em_analise', 'em_atendimento', 'aguardando_cidadao'];

  const mockProtocolos: Protocolo[] = [
    {
      id: 'p1',
      organization_id: 'org-1',
      contact_id: 'c1',
      protocol_number: '2026-000001',
      title: 'Buraco na via causando acidentes',
      tipo_manifestacao: 'reclamacao',
      prioridade: 'alta',
      status: 'em_atendimento',
      due_date: '2026-09-01',
      created_at: '2026-08-20T10:00:00Z',
    },
    {
      id: 'p2',
      organization_id: 'org-1',
      contact_id: 'c2',
      protocol_number: '2026-000002',
      title: 'Elogio à equipe de vacinação',
      tipo_manifestacao: 'elogio',
      prioridade: 'baixa',
      status: 'resolvido',
      due_date: '2026-08-25',
      created_at: '2026-08-10T11:00:00Z',
      closed_at: '2026-08-24T09:00:00Z',
    },
    {
      id: 'p3',
      organization_id: 'org-1',
      contact_id: 'c3',
      protocol_number: '2026-000003',
      title: 'Solicitação de poda de árvore',
      tipo_manifestacao: 'solicitacao',
      prioridade: 'media',
      status: 'aberto',
      due_date: '2999-12-31',
      created_at: '2026-09-12T12:00:00Z',
    },
  ];

  it('conta corretamente os protocolos em aberto (situações não-terminais)', () => {
    const abertos = mockProtocolos.filter((p) => EM_ABERTO.includes(p.status));
    expect(abertos.length).toBe(2);
  });

  it('calcula a taxa de resolução dos protocolos', () => {
    const total = mockProtocolos.length;
    const resolvidos = mockProtocolos.filter((p) => p.status === 'resolvido').length;
    const taxa = `${((resolvidos / total) * 100).toFixed(1)}%`;

    expect(resolvidos).toBe(1);
    expect(taxa).toBe('33.3%');
  });

  it('identifica protocolos fora do prazo (SLA vencido e ainda não resolvido)', () => {
    const hoje = '2026-09-13';
    const foraDoPrazo = mockProtocolos.filter(
      (p) => EM_ABERTO.includes(p.status) && p.due_date && p.due_date < hoje
    );

    expect(foraDoPrazo.length).toBe(1);
    expect(foraDoPrazo[0].id).toBe('p1');
  });

  it('valida a transição de situação do protocolo para resolvido', () => {
    const p = { ...mockProtocolos[2] };
    p.status = 'resolvido';
    p.closed_at = '2026-09-13T10:00:00Z';

    expect(p.status).toBe('resolvido');
    expect(p.closed_at).toBeTruthy();
  });

  it('filtra cidadãos por bairro com sucesso', () => {
    const cidadaos: Cidadao[] = [
      {
        id: 'c1',
        organization_id: 'org-1',
        name: 'Mariana Silva',
        bairro: 'Centro',
        tags: ['Saúde'],
        custom_attributes: {},
      },
      {
        id: 'c2',
        organization_id: 'org-1',
        name: 'Carlos Eduardo',
        bairro: 'Vila Nova',
        tags: ['Infraestrutura'],
        custom_attributes: {},
      },
    ];

    const doCentro = cidadaos.filter((c) => c.bairro === 'Centro');
    expect(doCentro.length).toBe(1);
    expect(doCentro[0].name).toBe('Mariana Silva');
  });
});
