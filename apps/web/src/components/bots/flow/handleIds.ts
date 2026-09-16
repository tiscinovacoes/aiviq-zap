import type { Edge } from '@/types/bot';

// Codificação dos handles do React Flow ↔ âncoras do domínio (ADR-004 §2.3).
// O canvas é a única camada que conhece esses ids; o documento continua falando
// em { eventId } | { blockId, itemId? }.

export const START_SOURCE = 'evt';
export const GROUP_TARGET = 'in';

export const blockHandle = (blockId: string) => `blk__${blockId}`;
export const itemHandle = (blockId: string, itemId: string) =>
  `itm__${blockId}__${itemId}`;

// Decodifica o handle de origem em uma âncora de bloco/item do documento.
// O `eventId` (start) é resolvido à parte pelo canvas, pois depende do node id.
export function decodeBlockSource(
  handle: string | null | undefined
): { blockId: string; itemId?: string } | null {
  if (!handle) return null;
  if (handle.startsWith('itm__')) {
    const [blockId, itemId] = handle.slice(5).split('__');
    if (!blockId || !itemId) return null;
    return { blockId, itemId };
  }
  if (handle.startsWith('blk__')) {
    const blockId = handle.slice(5);
    return blockId ? { blockId } : null;
  }
  return null;
}

// Dado uma aresta do documento, devolve os campos que o React Flow precisa
// (source node id + source handle). Requer o mapa blockId → groupId.
export function edgeToFlow(
  edge: Edge,
  blockToGroup: Map<string, string>
): { source: string; sourceHandle: string } | null {
  if ('eventId' in edge.from) {
    return { source: edge.from.eventId, sourceHandle: START_SOURCE };
  }
  const groupId = blockToGroup.get(edge.from.blockId);
  if (!groupId) return null;
  if (edge.from.itemId) {
    return { source: groupId, sourceHandle: itemHandle(edge.from.blockId, edge.from.itemId) };
  }
  return { source: groupId, sourceHandle: blockHandle(edge.from.blockId) };
}
