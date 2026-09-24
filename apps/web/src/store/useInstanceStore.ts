import { create } from 'zustand';

export interface InstanceView {
  instanceName: string;
  label: string;
  isDefault: boolean;
  status: 'connected' | 'connecting' | 'disconnected';
  phoneNumber?: string;
  profileName?: string;
  profilePicUrl?: string;
  /** Participa do cluster de disparo (selecao MULTIPLA, salva no servidor). */
  dispatchEnabled?: boolean;
  maturidade?: 'novo' | 'maduro';
  capHoje?: number;
  cooldownAte?: string;
  cooldownMotivo?: string;
  webhookOk?: boolean;
  /** true = IP dedicado configurado na Evolution para este numero. */
  proxyOk?: boolean;
  proxyHost?: string;
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
  setDispatchEnabled: (instanceName: string, enabled: boolean) => Promise<void>;
  setMaturidade: (instanceName: string, maturidade: 'novo' | 'maduro') => Promise<void>;
  repararWebhook: (instanceName: string) => Promise<boolean>;
  setProxy: (
    instanceName: string,
    config: { host: string; port: string; protocol?: string; username?: string; password?: string }
  ) => Promise<{ ok: boolean; message?: string }>;
  removeProxy: (instanceName: string) => Promise<{ ok: boolean; message?: string }>;
  liberarCooldown: (instanceName: string) => Promise<boolean>;
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

  // Reconfigura o webhook de uma instancia surda: sem ele a Evolution nao tem
  // para onde avisar respostas nem acks, e a campanha coleta zero em silencio.
  repararWebhook: async (instanceName: string) => {
    try {
      const res = await fetch(`/api/instances/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fix_webhook' }),
      });
      const data = await res.json();
      await get().fetchInstances();
      return Boolean(data?.success);
    } catch {
      return false;
    }
  },

  // Declara se o numero ja esta aquecido. Nao e inferido: o primeiro disparo
  // por aqui nao diz nada sobre a idade real do chip, entao um numero em uso ha
  // anos apareceria como "dia zero" e seria estrangulado sem ganho nenhum.
  setMaturidade: async (instanceName: string, maturidade: 'novo' | 'maduro') => {
    set({
      instances: get().instances.map((i) =>
        i.instanceName === instanceName ? { ...i, maturidade } : i
      ),
    });
    try {
      await fetch(`/api/instances/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_maturidade', maturidade }),
      });
    } finally {
      await get().fetchInstances();
    }
  },

  // Selecao MULTIPLA: quais chips participam do cluster de disparo. Diferente do
  // `selected` acima (radio de visualizacao do Inbox, localStorage), este estado
  // e por organizacao e mora no servidor — o cron de disparo precisa enxerga-lo.
  setDispatchEnabled: async (instanceName: string, enabled: boolean) => {
    // Otimista: a lista reflete na hora, o servidor confirma em seguida.
    set({
      instances: get().instances.map((i) =>
        i.instanceName === instanceName ? { ...i, dispatchEnabled: enabled } : i
      ),
    });
    try {
      await fetch(`/api/instances/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_dispatch', enabled }),
      });
    } finally {
      await get().fetchInstances();
    }
  },

  // Associa um IP dedicado (ISP/residencial) a este numero. Sem proxy, a
  // instancia sai pelo IP compartilhado do servidor Evolution -- o mesmo de
  // todos os outros chips -- e herda a reputacao deles mesmo sendo "quente".
  setProxy: async (instanceName, config) => {
    try {
      const res = await fetch(`/api/instances/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_proxy', ...config }),
      });
      const data = await res.json();
      await get().fetchInstances();
      return { ok: Boolean(data?.success), message: data?.message };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },

  removeProxy: async (instanceName) => {
    try {
      const res = await fetch(`/api/instances/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_proxy' }),
      });
      const data = await res.json();
      await get().fetchInstances();
      return { ok: Boolean(data?.success), message: data?.message };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },

  // Libera manualmente um chip em RESFRIANDO/PAUSA DE LOTE (zera o cooldown
  // e os contadores de falha), sem esperar os 90/180 min.
  liberarCooldown: async (instanceName) => {
    try {
      const res = await fetch(`/api/instances/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'liberar_cooldown' }),
      });
      const data = await res.json();
      await get().fetchInstances();
      return Boolean(data?.success);
    } catch {
      return false;
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
