import { Contact, Deal, DealStage } from '@/types';

export const crmService = {
  async getContacts(params?: { tag?: string; assigned_to?: string; q?: string }): Promise<Contact[]> {
    const search = new URLSearchParams();
    if (params?.tag && params.tag !== 'all') search.set('tag', params.tag);
    if (params?.assigned_to && params.assigned_to !== 'all') search.set('assigned_to', params.assigned_to);
    if (params?.q) search.set('q', params.q);

    const res = await fetch(`/api/contacts?${search.toString()}`);
    if (!res.ok) throw new Error('Falha ao obter contatos');
    const data = await res.json();
    return data.contacts || [];
  },

  async createContact(contactData: Partial<Contact>): Promise<Contact> {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactData),
    });
    if (!res.ok) throw new Error('Falha ao criar contato');
    const data = await res.json();
    return data.contact;
  },

  async getDeals(): Promise<{ deals: Deal[]; metrics: any }> {
    const res = await fetch('/api/crm/deals');
    if (!res.ok) throw new Error('Falha ao obter pipeline do CRM');
    const data = await res.json();
    return { deals: data.deals || [], metrics: data.metrics || {} };
  },

  async createDeal(dealData: Partial<Deal>): Promise<Deal> {
    const res = await fetch('/api/crm/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dealData),
    });
    if (!res.ok) throw new Error('Falha ao criar oportunidade');
    const data = await res.json();
    return data.deal;
  },

  async updateDealStage(dealId: string, stage: DealStage): Promise<void> {
    const res = await fetch(`/api/crm/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) throw new Error('Falha ao atualizar fase da oportunidade');
  },
};
