import { create } from 'zustand';
import { Contact, Protocolo, ProtocoloStatus } from '@/types';
import { crmService } from '@/services/crmService';

interface OuvidoriaMetrics {
  totalProtocolos: number;
  abertos: number;
  resolvidos: number;
  foraDoPrazo: number;
  taxaResolucao: string;
}

interface CRMState {
  contacts: Contact[];
  protocolos: Protocolo[];
  metrics: OuvidoriaMetrics;
  isLoading: boolean;
  error: string | null;
  selectedTag: string;
  searchQuery: string;

  // Actions
  setSelectedTag: (tag: string) => void;
  setSearchQuery: (query: string) => void;
  fetchContacts: () => Promise<void>;
  fetchProtocolos: () => Promise<void>;
  moveProtocoloStatus: (protocoloId: string, newStatus: ProtocoloStatus) => Promise<void>;
  addProtocolo: (protocoloData: Partial<Protocolo> & { contact_name?: string }) => Promise<void>;
  addContact: (contactData: Partial<Contact>) => Promise<void>;
}

export const useCRMStore = create<CRMState>((set, get) => ({
  contacts: [],
  protocolos: [],
  metrics: {
    totalProtocolos: 0,
    abertos: 0,
    resolvidos: 0,
    foraDoPrazo: 0,
    taxaResolucao: '0%',
  },
  isLoading: false,
  error: null,
  selectedTag: 'all',
  searchQuery: '',

  setSelectedTag: (tag) => {
    set({ selectedTag: tag });
    get().fetchContacts();
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().fetchContacts();
  },

  fetchContacts: async () => {
    set({ isLoading: true, error: null });
    try {
      const contacts = await crmService.getContacts({
        tag: get().selectedTag,
        q: get().searchQuery,
      });
      set({ contacts, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchProtocolos: async () => {
    set({ isLoading: true, error: null });
    try {
      const { protocolos, metrics } = await crmService.getProtocolos();
      set({ protocolos, metrics, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  moveProtocoloStatus: async (protocoloId, newStatus) => {
    // Atualização otimista
    const previous = get().protocolos;
    const updated = previous.map((p) =>
      p.id === protocoloId ? { ...p, status: newStatus } : p
    );
    set({ protocolos: updated });

    try {
      await crmService.updateProtocoloStatus(protocoloId, newStatus);
      // Atualiza as métricas
      get().fetchProtocolos();
    } catch (err: any) {
      // Reverte em caso de erro
      set({ protocolos: previous, error: err.message });
    }
  },

  addProtocolo: async (protocoloData) => {
    try {
      await crmService.createProtocolo(protocoloData);
      get().fetchProtocolos();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  addContact: async (contactData) => {
    try {
      await crmService.createContact(contactData);
      get().fetchContacts();
    } catch (err: any) {
      set({ error: err.message });
    }
  },
}));
