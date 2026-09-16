import { Contact, Protocolo, ProtocoloStatus } from '@/types';

export const crmService = {
  async getContacts(params?: { tag?: string; assigned_to?: string; q?: string }): Promise<Contact[]> {
    const search = new URLSearchParams();
    if (params?.tag && params.tag !== 'all') search.set('tag', params.tag);
    if (params?.assigned_to && params.assigned_to !== 'all') search.set('assigned_to', params.assigned_to);
    if (params?.q) search.set('q', params.q);
    try {
      const inst = localStorage.getItem('aiviq_selected_instance');
      if (inst) search.set('instance', inst);
    } catch {}

    const res = await fetch(`/api/contacts?${search.toString()}`);
    if (!res.ok) throw new Error('Falha ao obter cidadãos');
    const data = await res.json();
    return data.contacts || [];
  },

  async createContact(contactData: Partial<Contact>): Promise<Contact> {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactData),
    });
    if (!res.ok) throw new Error('Falha ao cadastrar cidadão');
    const data = await res.json();
    return data.contact;
  },

  async getCitizen(id: string): Promise<{
    contact: Contact;
    protocolos: Protocolo[];
    resumo: { total: number; abertos: number; resolvidos: number };
  }> {
    const res = await fetch(`/api/contacts/${id}`);
    if (!res.ok) throw new Error('Falha ao carregar a ficha do cidadão');
    const data = await res.json();
    return { contact: data.contact, protocolos: data.protocolos || [], resumo: data.resumo };
  },

  async getProtocolos(): Promise<{ protocolos: Protocolo[]; metrics: any }> {
    const res = await fetch('/api/crm/protocolos');
    if (!res.ok) throw new Error('Falha ao obter protocolos da ouvidoria');
    const data = await res.json();
    return { protocolos: data.protocolos || [], metrics: data.metrics || {} };
  },

  async createProtocolo(protocoloData: Partial<Protocolo> & { contact_name?: string }): Promise<Protocolo> {
    const res = await fetch('/api/crm/protocolos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(protocoloData),
    });
    if (!res.ok) throw new Error('Falha ao abrir protocolo');
    const data = await res.json();
    return data.protocolo;
  },

  async updateProtocoloStatus(protocoloId: string, status: ProtocoloStatus): Promise<void> {
    const res = await fetch(`/api/crm/protocolos/${protocoloId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Falha ao atualizar situação do protocolo');
  },

  async updateContact(id: string, patch: Partial<Contact>): Promise<Contact> {
    const res = await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Falha ao atualizar cidadão');
    const data = await res.json();
    return data.contact;
  },

  // Registra uma observação interna (persistida em custom_attributes.notes).
  async addContactNote(id: string, note: string): Promise<Contact> {
    const res = await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) throw new Error('Falha ao registrar observação');
    const data = await res.json();
    return data.contact;
  },
};
