import type { BotV1 } from '@/types/bot';
import { demoBot } from '@/lib/bot/demoBot';
import { makeBlankBot } from '@/lib/bot/blankBot';

// Store em memória (dev / sem Supabase). Espelha o comportamento da tabela
// `bots`: persiste dentro da instância do servidor. Em produção serverless
// sem Supabase é efêmero — a persistência real exige o banco (RLS).
export interface BotRecord {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused';
  document: BotV1;
  publishedDocument: BotV1 | null;
  publishedVersion: number;
  createdAt: string;
  updatedAt: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __aiviq_bots: Record<string, BotRecord> | undefined;
  // eslint-disable-next-line no-var
  var __aiviq_bots_seeded: boolean | undefined;
}

function store(): Record<string, BotRecord> {
  if (!global.__aiviq_bots) global.__aiviq_bots = {};
  if (!global.__aiviq_bots_seeded) {
    global.__aiviq_bots_seeded = true;
    const now = new Date().toISOString();
    const seed: BotRecord[] = [
      {
        id: demoBot.id,
        name: demoBot.name,
        status: 'active',
        document: demoBot,
        publishedDocument: demoBot,
        publishedVersion: 3,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'bot_suporte_n1',
        name: 'FAQ & Informações ao Cidadão',
        status: 'active',
        document: makeBlankBot('bot_suporte_n1', 'FAQ & Informações ao Cidadão'),
        publishedDocument: null,
        publishedVersion: 5,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'bot_fora_expediente',
        name: 'Atendimento Fora do Expediente',
        status: 'paused',
        document: makeBlankBot('bot_fora_expediente', 'Atendimento Fora do Expediente'),
        publishedDocument: null,
        publishedVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];
    for (const r of seed) global.__aiviq_bots[r.id] = r;
  }
  return global.__aiviq_bots;
}

export function listBotRecords(): BotRecord[] {
  return Object.values(store()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getBotRecord(id: string): BotRecord | undefined {
  return store()[id];
}

export function createBotRecord(name: string): BotRecord {
  const id = `bot_${Date.now()}`;
  const now = new Date().toISOString();
  const rec: BotRecord = {
    id,
    name: name || 'Novo Fluxo de Automação',
    status: 'draft',
    document: makeBlankBot(id, name),
    publishedDocument: null,
    publishedVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
  store()[id] = rec;
  return rec;
}

export function saveBotDocument(id: string, document: BotV1): BotRecord | undefined {
  const rec = store()[id];
  if (!rec) return undefined;
  rec.document = document;
  if (document?.name) rec.name = document.name;
  rec.updatedAt = new Date().toISOString();
  return rec;
}

export function publishBotRecord(id: string): BotRecord | undefined {
  const rec = store()[id];
  if (!rec) return undefined;
  rec.publishedDocument = rec.document;
  rec.publishedVersion += 1;
  rec.status = 'active';
  rec.updatedAt = new Date().toISOString();
  return rec;
}

export function deleteBotRecord(id: string): boolean {
  const s = store();
  if (!s[id]) return false;
  delete s[id];
  return true;
}
