import { create } from 'zustand';
import { Contact, Deal, DealStage } from '@/types';
import { crmService } from '@/services/crmService';

interface CRMState {
  contacts: Contact[];
  deals: Deal[];
  metrics: {
    totalPipelineValue: number;
    wonValue: number;
    averageTicket: number;
    totalDeals: number;
    conversionRate: string;
  };
  isLoading: boolean;
  error: string | null;
  selectedTag: string;
  searchQuery: string;

  // Actions
  setSelectedTag: (tag: string) => void;
  setSearchQuery: (query: string) => void;
  fetchContacts: () => Promise<void>;
  fetchDeals: () => Promise<void>;
  moveDealStage: (dealId: string, newStage: DealStage) => Promise<void>;
  addDeal: (dealData: Partial<Deal>) => Promise<void>;
  addContact: (contactData: Partial<Contact>) => Promise<void>;
}

export const useCRMStore = create<CRMState>((set, get) => ({
  contacts: [],
  deals: [],
  metrics: {
    totalPipelineValue: 0,
    wonValue: 0,
    averageTicket: 0,
    totalDeals: 0,
    conversionRate: '0%',
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

  fetchDeals: async () => {
    set({ isLoading: true, error: null });
    try {
      const { deals, metrics } = await crmService.getDeals();
      set({ deals, metrics, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  moveDealStage: async (dealId, newStage) => {
    // Optimistic update
    const previousDeals = get().deals;
    const updatedDeals = previousDeals.map((d) =>
      d.id === dealId ? { ...d, stage: newStage } : d
    );
    set({ deals: updatedDeals });

    try {
      await crmService.updateDealStage(dealId, newStage);
      // Refresh metrics
      get().fetchDeals();
    } catch (err: any) {
      // Revert if error
      set({ deals: previousDeals, error: err.message });
    }
  },

  addDeal: async (dealData) => {
    try {
      await crmService.createDeal(dealData);
      get().fetchDeals();
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
