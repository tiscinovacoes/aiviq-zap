import { Contact, Conversation, Message } from '@/types';

// ============================================================================
// Registro de instâncias (números de WhatsApp) da Evolution API.
//
// Modelo adotado: MESMO servidor Evolution (EVOLUTION_API_URL + EVOLUTION_API_KEY),
// várias instâncias nomeadas — cada instância = 1 número/celular. O registro é um
// singleton global (mesmo padrão de conversationStore) para sobreviver entre
// invocações de rota no Next.js. Quando o Supabase estiver configurado, cada
// instância também é persistida como um `inbox` (channel_type whatsapp_cloud).
// ============================================================================

export interface KnownInstance {
  instanceName: string;
  label: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __aiviq_instances: KnownInstance[] | undefined;
}

// Instância padrão (retrocompatível com a config single-instância anterior).
export const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE || 'aiviq_inbox_01';

if (!global.__aiviq_instances) {
  global.__aiviq_instances = [
    { instanceName: DEFAULT_INSTANCE, label: 'Número Principal' },
  ];
}

export function getDefaultInstanceName(): string {
  return DEFAULT_INSTANCE;
}

/** Resolve o nome de instância a usar: o informado (limpo) ou o padrão. */
export function resolveInstanceName(name?: string | null): string {
  const clean = (name || '').trim();
  return clean || DEFAULT_INSTANCE;
}

/** Valida o nome de uma instância nova (evita injeção em path da Evolution API). */
export function isValidInstanceName(name?: string | null): boolean {
  if (!name) return false;
  return /^[A-Za-z0-9_-]{3,48}$/.test(name.trim());
}

export function listKnownInstances(): KnownInstance[] {
  return global.__aiviq_instances || [];
}

export function registerInstance(instanceName: string, label?: string): KnownInstance {
  const list = global.__aiviq_instances || [];
  const existing = list.find((i) => i.instanceName === instanceName);
  if (existing) {
    if (label) existing.label = label;
    global.__aiviq_instances = list;
    return existing;
  }
  const entry: KnownInstance = { instanceName, label: label || instanceName };
  list.push(entry);
  global.__aiviq_instances = list;
  return entry;
}

export function unregisterInstance(instanceName: string) {
  if (instanceName === DEFAULT_INSTANCE) return; // nunca remove a instância padrão
  global.__aiviq_instances = (global.__aiviq_instances || []).filter(
    (i) => i.instanceName !== instanceName
  );
}

// Reexports de tipo apenas para conveniência de quem importa este módulo.
export type { Contact, Conversation, Message };
