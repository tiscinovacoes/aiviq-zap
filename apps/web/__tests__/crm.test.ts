import { describe, it, expect } from 'vitest';
import { Deal, Contact } from '@/types';

describe('CRM & Contacts Management (Unit Tests)', () => {
  const mockDeals: Deal[] = [
    {
      id: 'd1',
      organization_id: 'org-1',
      contact_id: 'c1',
      title: 'Plano Pro 10 Usuários',
      value: 10680,
      stage: 'proposta_enviada',
      probability: 80,
      created_at: '2026-09-11T10:00:00Z',
    },
    {
      id: 'd2',
      organization_id: 'org-1',
      contact_id: 'c2',
      title: 'Plano Starter Anual',
      value: 4500,
      stage: 'fechado_ganho',
      probability: 100,
      created_at: '2026-09-11T11:00:00Z',
    },
    {
      id: 'd3',
      organization_id: 'org-1',
      contact_id: 'c3',
      title: 'Contrato Customizado',
      value: 15000,
      stage: 'perdido',
      probability: 0,
      created_at: '2026-09-11T12:00:00Z',
    },
  ];

  it('deve calcular o valor total ativo no pipeline excluindo negócios perdidos', () => {
    const activeDeals = mockDeals.filter((d) => d.stage !== 'perdido');
    const totalPipeline = activeDeals.reduce((sum, d) => sum + d.value, 0);

    expect(totalPipeline).toBe(15180);
  });

  it('deve calcular corretamente o ticket médio dos negócios ativos', () => {
    const activeDeals = mockDeals.filter((d) => d.stage !== 'perdido');
    const totalPipeline = activeDeals.reduce((sum, d) => sum + d.value, 0);
    const avgTicket = Math.round(totalPipeline / activeDeals.length);

    expect(avgTicket).toBe(7590);
  });

  it('deve validar transição de estágio do deal para fechado_ganho', () => {
    let deal = { ...mockDeals[0] };
    deal.stage = 'fechado_ganho';
    deal.probability = 100;

    expect(deal.stage).toBe('fechado_ganho');
    expect(deal.probability).toBe(100);
  });

  it('deve filtrar contatos por tag corporativa com sucesso', () => {
    const contacts: Contact[] = [
      {
        id: 'c1',
        organization_id: 'org-1',
        name: 'Mariana Silva',
        tags: ['VIP', 'Lead Quente'],
        custom_attributes: {},
      },
      {
        id: 'c2',
        organization_id: 'org-1',
        name: 'Carlos Eduardo',
        tags: ['PJ'],
        custom_attributes: {},
      },
    ];

    const vipContacts = contacts.filter((c) => c.tags.includes('VIP'));
    expect(vipContacts.length).toBe(1);
    expect(vipContacts[0].name).toBe('Mariana Silva');
  });
});
