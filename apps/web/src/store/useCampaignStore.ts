import { create } from 'zustand';
import { Campaign, CampaignMetrics } from '@/types/campaign';

interface CampaignStoreState {
  campaigns: Campaign[];
  metrics: CampaignMetrics | null;
  loading: boolean;
  filterStatus: string;
  searchQuery: string;

  fetchCampaigns: () => Promise<void>;
  createCampaign: (data: Partial<Campaign>) => Promise<Campaign | null>;
  toggleCampaignStatus: (id: string) => Promise<void>;
  setFilterStatus: (status: string) => void;
  setSearchQuery: (q: string) => void;
}

export const useCampaignStore = create<CampaignStoreState>((set, get) => ({
  campaigns: [],
  metrics: null,
  loading: false,
  filterStatus: 'all',
  searchQuery: '',

  fetchCampaigns: async () => {
    set({ loading: true });
    try {
      const q = get().searchQuery;
      const res = await fetch(`/api/campaigns?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) {
        set({ campaigns: data.campaigns, metrics: data.metrics });
      }
    } catch {
      // ignore
    } finally {
      set({ loading: false });
    }
  },

  createCampaign: async (data: Partial<Campaign>) => {
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success && result.campaign) {
        set((s) => ({ campaigns: [result.campaign, ...s.campaigns] }));
        return result.campaign;
      }
    } catch {
      // ignore
    }
    return null;
  },

  toggleCampaignStatus: async (id: string) => {
    const { campaigns } = get();
    const campaign = campaigns.find((c) => c.id === id);
    if (!campaign) return;

    const newStatus = campaign.status === 'running' ? 'paused' : 'running';

    // Optimistic update
    set({
      campaigns: campaigns.map((c) => (c.id === id ? { ...c, status: newStatus } : c)),
    });

    try {
      await fetch(`/api/campaigns/${id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: newStatus === 'running' ? 'start' : 'pause' }),
      });
    } catch {
      // Revert if error
      set({ campaigns });
    }
  },

  setFilterStatus: (status: string) => set({ filterStatus: status }),
  setSearchQuery: (q: string) => {
    set({ searchQuery: q });
    get().fetchCampaigns();
  },
}));
