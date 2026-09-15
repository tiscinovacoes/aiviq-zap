import { create } from 'zustand';

export interface InstanceView {
  instanceName: string;
  label: string;
  isDefault: boolean;
  status: 'connected' | 'connecting' | 'disconnected';
  phoneNumber?: string;
  profileName?: string;
  profilePicUrl?: string;
}

export const SELECTED_INSTANCE_KEY = 'aiviq_selected_instance';

export function getSelectedInstance(): string | null {
  try {
    return localStorage.getItem(SELECTED_INSTANCE_KEY);
  } catch {
    return null;
  }
}

interface InstanceState {
  instances: InstanceView[];
  selected: string | null;
  isLoading: boolean;
  fetchInstances: () => Promise<void>;
  setSelected: (instanceName: string) => void;
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  selected: typeof window !== 'undefined' ? getSelectedInstance() : null,
  isLoading: false,

  fetchInstances: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/instances');
      const data = await res.json();
      if (data?.success) {
        const instances: InstanceView[] = data.instances || [];
        set({ instances, isLoading: false });

        // Garante uma seleção válida: mantém a atual se ainda existir, senão usa
        // a instância padrão (ou a primeira disponível).
        const cur = get().selected;
        if (!cur || !instances.some((i) => i.instanceName === cur)) {
          const def = instances.find((i) => i.isDefault) || instances[0];
          if (def) get().setSelected(def.instanceName);
        }
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setSelected: (instanceName: string) => {
    if (get().selected === instanceName) return;
    try {
      localStorage.setItem(SELECTED_INSTANCE_KEY, instanceName);
    } catch {}
    set({ selected: instanceName });
    // Avisa as telas (inbox, contatos) para recarregarem os dados do novo número.
    try {
      window.dispatchEvent(new CustomEvent('aiviq:instance-changed', { detail: instanceName }));
    } catch {}
  },
}));
