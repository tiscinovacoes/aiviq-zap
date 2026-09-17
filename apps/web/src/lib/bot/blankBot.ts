import type { BotV1 } from '@/types/bot';

// Documento de fluxo em branco (novo bot). Fonte única usada tanto pelo editor
// (store) quanto pela persistência no servidor, para não divergirem.
export function makeBlankBot(id: string, name?: string): BotV1 {
  const now = new Date().toISOString();
  const seed = Date.now();
  const startId = `event_start_${seed}`;
  const groupId = `group_${seed}`;
  return {
    version: '1',
    id,
    accountId: 1,
    name: name || 'Novo Fluxo de Automação',
    events: [
      { id: startId, type: 'start', graphCoordinates: { x: 60, y: 160 }, outgoingEdgeId: undefined },
    ],
    groups: [
      {
        id: groupId,
        title: '1. Boas-Vindas',
        graphCoordinates: { x: 300, y: 120 },
        blocks: [
          { id: `b_${seed}`, type: 'text', content: { text: 'Olá! 👋 Como posso ajudar?' } },
        ],
      },
    ],
    edges: [],
    variables: [],
    settings: { typingDelayMs: 600, handoffOnFailure: true },
    createdAt: now,
    updatedAt: now,
  };
}
