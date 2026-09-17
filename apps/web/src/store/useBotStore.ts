import { create } from 'zustand';
import {
  BotV1,
  Group,
  Block,
  BlockType,
  Edge,
  Position,
  SessionState,
  OutgoingMessage,
  InputRequest,
} from '@/types/bot';
import { walkFlowForward } from '@/lib/bot/engine/walkFlowForward';
import { demoBot } from '@/lib/bot/demoBot';
import { makeBlankBot } from '@/lib/bot/blankBot';

interface BotHistory {
  past: BotV1[];
  future: BotV1[];
}

interface BotEditorState {
  bot: BotV1 | null;
  history: BotHistory;
  selectedGroupId: string | null;
  selectedBlockId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;

  // Simulator
  isSimulating: boolean;
  simulationState: SessionState | null;
  simulationMessages: { sender: 'bot' | 'user'; text: string; options?: any }[];
  currentInputRequest: InputRequest | null;

  // Actions
  setBot: (bot: BotV1) => void;
  initBlankBot: (id: string, name?: string) => void;
  selectBlock: (groupId: string | null, blockId: string | null) => void;
  createGroup: (title?: string, position?: Position) => void;
  updateGroup: (groupId: string, patch: Partial<Group>) => void;
  deleteGroup: (groupId: string) => void;
  moveGroup: (groupId: string, position: Position) => void;

  addBlock: (groupId: string, type: BlockType) => void;
  updateBlock: (groupId: string, blockId: string, patch: any) => void;
  deleteBlock: (groupId: string, blockId: string) => void;

  createEdge: (from: Edge['from'], to: Edge['to']) => void;
  deleteEdge: (edgeId: string) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Simulation controls
  openSimulation: () => void;
  closeSimulation: () => void;
  startSimulation: () => Promise<void>;
  sendSimulationMessage: (userText: string) => Promise<void>;
  resetSimulation: () => void;
}

const defaultMockBot: BotV1 = demoBot;

export const useBotStore = create<BotEditorState>((set, get) => ({
  bot: defaultMockBot,
  history: { past: [], future: [] },
  selectedGroupId: null,
  selectedBlockId: null,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,

  // Simulator
  isSimulating: false,
  simulationState: null,
  simulationMessages: [],
  currentInputRequest: null,

  setBot: (bot: BotV1) => {
    set({ bot, history: { past: [], future: [] }, isDirty: false });
  },

  // Inicia um fluxo em branco editável (novo bot), a partir do template
  // compartilhado (mesma base usada na persistência do servidor).
  initBlankBot: (id: string, name?: string) => {
    set({
      bot: makeBlankBot(id, name),
      history: { past: [], future: [] },
      selectedGroupId: null,
      selectedBlockId: null,
      isDirty: false,
    });
  },

  selectBlock: (groupId: string | null, blockId: string | null) => {
    set({ selectedGroupId: groupId, selectedBlockId: blockId });
  },

  createGroup: (title?: string, position?: Position) => {
    const { bot, history } = get();
    if (!bot) return;

    const newGroupId = `group_${Date.now()}`;
    const newGroup: Group = {
      id: newGroupId,
      title: title || `Novo Grupo (${bot.groups.length + 1})`,
      graphCoordinates: position || { x: 300 + bot.groups.length * 50, y: 150 + bot.groups.length * 30 },
      blocks: [
        {
          id: `block_${Date.now()}`,
          type: 'text',
          content: { text: 'Mensagem inicial do grupo' },
        },
      ],
    };

    set({
      history: { past: [...history.past, bot], future: [] },
      bot: { ...bot, groups: [...bot.groups, newGroup], updatedAt: new Date().toISOString() },
      selectedGroupId: newGroupId,
      selectedBlockId: newGroup.blocks[0].id,
      isDirty: true,
    });
  },

  updateGroup: (groupId: string, patch: Partial<Group>) => {
    const { bot, history } = get();
    if (!bot) return;

    set({
      history: { past: [...history.past, bot], future: [] },
      bot: {
        ...bot,
        groups: bot.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  deleteGroup: (groupId: string) => {
    const { bot, history } = get();
    if (!bot) return;

    set({
      history: { past: [...history.past, bot], future: [] },
      bot: {
        ...bot,
        groups: bot.groups.filter((g) => g.id !== groupId),
        edges: bot.edges.filter((e) => e.to.groupId !== groupId),
        updatedAt: new Date().toISOString(),
      },
      selectedGroupId: null,
      selectedBlockId: null,
      isDirty: true,
    });
  },

  moveGroup: (groupId: string, position: Position) => {
    const { bot } = get();
    if (!bot) return;

    // Movement does not enter undo history per pixel to avoid spam (ADR-004 §2)
    set({
      bot: {
        ...bot,
        groups: bot.groups.map((g) => (g.id === groupId ? { ...g, graphCoordinates: position } : g)),
      },
      isDirty: true,
    });
  },

  addBlock: (groupId: string, type: BlockType) => {
    const { bot, history } = get();
    if (!bot) return;

    const blockId = `b_${Date.now()}`;
    let newBlock: Block;

    switch (type) {
      case 'text':
        newBlock = { id: blockId, type: 'text', content: { text: 'Digite sua mensagem aqui...' } };
        break;
      case 'text_input':
        newBlock = { id: blockId, type: 'text_input', options: { placeholder: 'Digite sua resposta...' } };
        break;
      case 'choice_input':
        newBlock = {
          id: blockId,
          type: 'choice_input',
          options: { isMultiple: false },
          items: [
            { id: `item_${Date.now()}_1`, content: 'Opção 1' },
            { id: `item_${Date.now()}_2`, content: 'Opção 2' },
          ],
        };
        break;
      case 'email_input':
        newBlock = { id: blockId, type: 'email_input', options: { variableId: 'email', retryMessage: 'E-mail inválido. Tente novamente.' } };
        break;
      case 'phone_input':
        newBlock = { id: blockId, type: 'phone_input', options: { defaultCountry: 'BR' } };
        break;
      case 'condition':
        newBlock = {
          id: blockId,
          type: 'condition',
          items: [
            {
              id: `cond_${Date.now()}`,
              content: 'Se condição atendida',
              comparisons: [{ variableId: 'nome', op: 'is_set' }],
              logic: 'and',
            },
          ],
        };
        break;
      case 'assign_to_agent':
        newBlock = {
          id: blockId,
          type: 'assign_to_agent',
          options: { strategy: 'round_robin', agentName: 'Fila da Ouvidoria' },
        };
        break;
      case 'add_label':
        newBlock = {
          id: blockId,
          type: 'add_label',
          options: { labels: ['Novo Protocolo'] },
        };
        break;
      case 'http_request':
        newBlock = {
          id: blockId,
          type: 'http_request',
          options: { url: 'https://api.empresa.com/webhook', method: 'POST', headers: {}, responseMapping: [] },
        };
        break;
      default:
        newBlock = { id: blockId, type: 'text', content: { text: 'Mensagem' } };
        break;
    }

    set({
      history: { past: [...history.past, bot], future: [] },
      bot: {
        ...bot,
        groups: bot.groups.map((g) =>
          g.id === groupId ? { ...g, blocks: [...g.blocks, newBlock] } : g
        ),
        updatedAt: new Date().toISOString(),
      },
      selectedGroupId: groupId,
      selectedBlockId: blockId,
      isDirty: true,
    });
  },

  updateBlock: (groupId: string, blockId: string, patch: any) => {
    const { bot, history } = get();
    if (!bot) return;

    set({
      history: { past: [...history.past, bot], future: [] },
      bot: {
        ...bot,
        groups: bot.groups.map((g) =>
          g.id === groupId
            ? {
                ...g,
                blocks: g.blocks.map((b) => (b.id === blockId ? ({ ...b, ...patch } as Block) : b)),
              }
            : g
        ),
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  deleteBlock: (groupId: string, blockId: string) => {
    const { bot, history } = get();
    if (!bot) return;

    set({
      history: { past: [...history.past, bot], future: [] },
      bot: {
        ...bot,
        groups: bot.groups.map((g) =>
          g.id === groupId ? { ...g, blocks: g.blocks.filter((b) => b.id !== blockId) } : g
        ),
        edges: bot.edges.filter(
          (e) => !('blockId' in e.from && e.from.blockId === blockId)
        ),
        updatedAt: new Date().toISOString(),
      },
      selectedBlockId: null,
      isDirty: true,
    });
  },

  createEdge: (from: Edge['from'], to: Edge['to']) => {
    const { bot, history } = get();
    if (!bot) return;

    const edgeId = `edge_${Date.now()}`;
    const newEdge: Edge = { id: edgeId, from, to };

    // Invariant: 1 outgoing edge per anchor (replaces if exists)
    const filteredEdges = bot.edges.filter((e) => {
      if ('eventId' in from && 'eventId' in e.from) {
        return e.from.eventId !== from.eventId;
      }
      if ('blockId' in from && 'blockId' in e.from) {
        if (from.itemId && e.from.itemId) {
          return e.from.itemId !== from.itemId;
        }
        return e.from.blockId !== from.blockId;
      }
      return true;
    });

    // Also attach outgoingEdgeId to the source block/item/event
    const updatedGroups = bot.groups.map((g) => ({
      ...g,
      blocks: g.blocks.map((b) => {
        if ('blockId' in from && b.id === from.blockId) {
          if (from.itemId && 'items' in b && b.items) {
            return {
              ...b,
              items: (b.items as any[]).map((item) =>
                item.id === from.itemId ? { ...item, outgoingEdgeId: edgeId } : item
              ),
            } as Block;
          }
          return { ...b, outgoingEdgeId: edgeId } as Block;
        }
        return b;
      }),
    }));

    const updatedEvents = bot.events.map((ev) =>
      'eventId' in from && ev.id === from.eventId ? { ...ev, outgoingEdgeId: edgeId } : ev
    ) as [any];

    set({
      history: { past: [...history.past, bot], future: [] },
      bot: {
        ...bot,
        events: updatedEvents,
        groups: updatedGroups,
        edges: [...filteredEdges, newEdge],
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  deleteEdge: (edgeId: string) => {
    const { bot, history } = get();
    if (!bot) return;

    set({
      history: { past: [...history.past, bot], future: [] },
      bot: {
        ...bot,
        edges: bot.edges.filter((e) => e.id !== edgeId),
        groups: bot.groups.map((g) => ({
          ...g,
          blocks: g.blocks.map((b) => {
            if (b.outgoingEdgeId === edgeId) {
              const { outgoingEdgeId, ...rest } = b;
              return rest as Block;
            }
            if ('items' in b && b.items) {
              return {
                ...b,
                items: (b.items as any[]).map((it) =>
                  it.outgoingEdgeId === edgeId ? { ...it, outgoingEdgeId: undefined } : it
                ),
              } as Block;
            }
            return b;
          }),
        })),
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  undo: () => {
    const { bot, history } = get();
    if (!bot || history.past.length === 0) return;

    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, history.past.length - 1);

    set({
      bot: previous,
      history: {
        past: newPast,
        future: [bot, ...history.future],
      },
      isDirty: true,
    });
  },

  redo: () => {
    const { bot, history } = get();
    if (!bot || history.future.length === 0) return;

    const next = history.future[0];
    const newFuture = history.future.slice(1);

    set({
      bot: next,
      history: {
        past: [...history.past, bot],
        future: newFuture,
      },
      isDirty: true,
    });
  },

  canUndo: () => get().history.past.length > 0,
  canRedo: () => get().history.future.length > 0,

  // Simulator controls
  openSimulation: () => {
    set({ isSimulating: true });
    get().startSimulation();
  },

  closeSimulation: () => {
    set({ isSimulating: false, simulationMessages: [], simulationState: null, currentInputRequest: null });
  },

  startSimulation: async () => {
    const { bot } = get();
    if (!bot) return;

    const initialResult = await walkFlowForward(
      bot,
      { type: 'start', eventId: bot.events[0]?.id || 'start' },
      { state: { botId: bot.id, variables: {} } }
    );

    const formattedMsgs = initialResult.messages.map((m) => ({
      sender: 'bot' as const,
      text: m.content,
      options: m.options,
    }));

    set({
      simulationState: initialResult.state,
      simulationMessages: formattedMsgs,
      currentInputRequest: initialResult.input || null,
    });
  },

  sendSimulationMessage: async (userText: string) => {
    const { bot, simulationState, simulationMessages } = get();
    if (!bot || !simulationState) return;

    // Push user message to chat feed
    const updatedMessages = [...simulationMessages, { sender: 'user' as const, text: userText }];
    set({ simulationMessages: updatedMessages, currentInputRequest: null });

    // Step forward
    const nextResult = await walkFlowForward(
      bot,
      { type: 'edge', edgeId: simulationState.pendingEdgeId || '' },
      {
        state: {
          ...simulationState,
          lastInput: userText,
        },
      }
    );

    const botNewMsgs = nextResult.messages.map((m) => ({
      sender: 'bot' as const,
      text: m.content,
      options: m.options,
    }));

    // If there were side effects, log them as an internal action badge in chat
    if (nextResult.sideEffects.length > 0) {
      nextResult.sideEffects.forEach((se) => {
        if (se.kind === 'assign_agent') {
          botNewMsgs.push({
            sender: 'bot',
            text: `⚙️ [Ação Automática]: Conversa transferida para ${se.agentName || 'Atendente'}`,
            options: undefined,
          });
        } else if (se.kind === 'add_label') {
          botNewMsgs.push({
            sender: 'bot',
            text: `🏷️ [Etiquetas Adicionadas]: ${se.labels.join(', ')}`,
            options: undefined,
          });
        }
      });
    }

    set({
      simulationState: nextResult.state,
      simulationMessages: [...updatedMessages, ...botNewMsgs],
      currentInputRequest: nextResult.input || null,
    });
  },

  resetSimulation: () => {
    get().startSimulation();
  },
}));
