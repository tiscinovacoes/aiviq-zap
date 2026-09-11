import {
  BotV1,
  StartingPoint,
  SessionState,
  WalkResult,
  OutgoingMessage,
  VisitedEdge,
  SideEffect,
  InputRequest,
  Group,
  Block,
} from '../../../types/bot';

export function interpolateVariables(template: string, variables: Record<string, any>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val = variables[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

function evaluateComparison(
  actual: any,
  op: 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'greater' | 'less' | 'is_set' | 'is_empty',
  target?: string
): boolean {
  const actualStr = String(actual ?? '').toLowerCase().trim();
  const targetStr = String(target ?? '').toLowerCase().trim();

  switch (op) {
    case 'equals':
      return actualStr === targetStr;
    case 'not_equals':
      return actualStr !== targetStr;
    case 'contains':
      return actualStr.includes(targetStr);
    case 'starts_with':
      return actualStr.startsWith(targetStr);
    case 'greater':
      return Number(actual) > Number(target);
    case 'less':
      return Number(actual) < Number(target);
    case 'is_set':
      return actual !== undefined && actual !== null && actualStr !== '';
    case 'is_empty':
      return actual === undefined || actual === null || actualStr === '';
    default:
      return false;
  }
}

export async function walkFlowForward(
  bot: BotV1,
  start: StartingPoint,
  ctx: { state: SessionState; timeoutMs?: number }
): Promise<WalkResult> {
  const messages: OutgoingMessage[] = [];
  const visitedEdges: VisitedEdge[] = [];
  const sideEffects: SideEffect[] = [];
  let input: InputRequest | undefined;
  let state: SessionState = {
    botId: bot.id,
    variables: { ...(ctx.state.variables || {}) },
    lastInput: ctx.state.lastInput,
    pendingEdgeId: ctx.state.pendingEdgeId,
    currentGroupId: ctx.state.currentGroupId,
    currentBlockIndex: ctx.state.currentBlockIndex,
  };

  const deadline = Date.now() + (ctx.timeoutMs ?? 10_000);
  let iterations = 0;

  // Process user input from previous turn if pending
  if (state.lastInput && state.currentGroupId !== undefined && state.currentBlockIndex !== undefined) {
    const currentGroup = bot.groups.find((g) => g.id === state.currentGroupId);
    if (currentGroup && currentGroup.blocks[state.currentBlockIndex]) {
      const pendingBlock = currentGroup.blocks[state.currentBlockIndex];
      
      // Save value into variable if mapped
      if ('options' in pendingBlock && (pendingBlock.options as any)?.variableId) {
        state.variables[(pendingBlock.options as any).variableId] = state.lastInput;
      }

      // Check if choice input had a specific item edge chosen
      if (pendingBlock.type === 'choice_input' && pendingBlock.items?.length) {
        const chosen = pendingBlock.items.find(
          (item) => item.content.toLowerCase().trim() === state.lastInput?.toLowerCase().trim()
        );
        if (chosen?.outgoingEdgeId) {
          state.pendingEdgeId = chosen.outgoingEdgeId;
        } else if (pendingBlock.outgoingEdgeId) {
          state.pendingEdgeId = pendingBlock.outgoingEdgeId;
        }
      }

      // Clear input and advance past current block
      state.lastInput = undefined;
      state.currentBlockIndex = state.currentBlockIndex + 1;
    }
  }

  // Resolve initial target
  let currentGroup: Group | undefined;
  let blockIndex = 0;

  if (start.type === 'start') {
    const startEvent = bot.events[0];
    if (startEvent?.outgoingEdgeId) {
      const edge = bot.edges.find((e) => e.id === startEvent.outgoingEdgeId);
      if (edge) {
        visitedEdges.push({ edgeId: edge.id, isOffDefaultPath: false });
        currentGroup = bot.groups.find((g) => g.id === edge.to.groupId);
        blockIndex = 0;
      }
    } else {
      // Fallback: start at the first group if no edge
      currentGroup = bot.groups[0];
      blockIndex = 0;
    }
  } else if (start.type === 'edge' || state.pendingEdgeId) {
    const targetEdgeId = start.type === 'edge' ? start.edgeId : state.pendingEdgeId;
    const edge = bot.edges.find((e) => e.id === targetEdgeId);
    if (edge) {
      visitedEdges.push({ edgeId: edge.id, isOffDefaultPath: false });
      currentGroup = bot.groups.find((g) => g.id === edge.to.groupId);
      blockIndex = 0;
      state.pendingEdgeId = undefined;
    } else if (state.currentGroupId) {
      currentGroup = bot.groups.find((g) => g.id === state.currentGroupId);
      blockIndex = state.currentBlockIndex || 0;
    }
  }

  while (currentGroup && !input) {
    if (Date.now() > deadline || ++iterations > 200) {
      return {
        state,
        messages,
        visitedEdges,
        sideEffects,
        isCompleted: false,
        error: 'Ciclo infinito detectado ou timeout de execução (limite 200 passos excedido).',
      };
    }

    if (blockIndex >= currentGroup.blocks.length) {
      // Finished all blocks in group, check if last block has outgoing edge
      const lastBlock = currentGroup.blocks[currentGroup.blocks.length - 1];
      if (lastBlock?.outgoingEdgeId) {
        const nextEdge = bot.edges.find((e) => e.id === lastBlock.outgoingEdgeId);
        if (nextEdge) {
          visitedEdges.push({ edgeId: nextEdge.id, isOffDefaultPath: false });
          currentGroup = bot.groups.find((g) => g.id === nextEdge.to.groupId);
          blockIndex = 0;
          continue;
        }
      }
      break; // Flow reached end
    }

    const block = currentGroup.blocks[blockIndex];

    switch (block.type) {
      case 'text': {
        const rendered = interpolateVariables(block.content.text, state.variables);
        messages.push({
          id: `msg_${block.id}_${Date.now()}`,
          type: 'text',
          content: rendered,
        });

        if (block.outgoingEdgeId) {
          const nextEdge = bot.edges.find((e) => e.id === block.outgoingEdgeId);
          if (nextEdge) {
            visitedEdges.push({ edgeId: nextEdge.id, isOffDefaultPath: false });
            currentGroup = bot.groups.find((g) => g.id === nextEdge.to.groupId);
            blockIndex = 0;
            continue;
          }
        }
        blockIndex++;
        break;
      }

      case 'image': {
        messages.push({
          id: `msg_${block.id}_${Date.now()}`,
          type: 'image',
          content: block.content.url,
          options: { placeholder: block.content.caption },
        });
        blockIndex++;
        break;
      }

      case 'file': {
        messages.push({
          id: `msg_${block.id}_${Date.now()}`,
          type: 'file',
          content: block.content.url,
          options: { placeholder: block.content.name },
        });
        blockIndex++;
        break;
      }

      case 'text_input': {
        input = {
          blockId: block.id,
          type: 'text_input',
          placeholder: block.options?.placeholder || 'Digite sua resposta...',
          variableId: block.options?.variableId,
        };
        state.currentGroupId = currentGroup.id;
        state.currentBlockIndex = blockIndex;
        state.pendingEdgeId = block.outgoingEdgeId;
        return { state, messages, input, visitedEdges, sideEffects, isCompleted: false };
      }

      case 'choice_input': {
        input = {
          blockId: block.id,
          type: 'choice_input',
          choices: block.items?.map((i) => i.content) || [],
          variableId: block.options?.variableId,
        };
        state.currentGroupId = currentGroup.id;
        state.currentBlockIndex = blockIndex;
        state.pendingEdgeId = block.outgoingEdgeId;
        return { state, messages, input, visitedEdges, sideEffects, isCompleted: false };
      }

      case 'email_input': {
        input = {
          blockId: block.id,
          type: 'email_input',
          placeholder: 'exemplo@empresa.com.br',
          variableId: block.options?.variableId,
        };
        state.currentGroupId = currentGroup.id;
        state.currentBlockIndex = blockIndex;
        state.pendingEdgeId = block.outgoingEdgeId;
        return { state, messages, input, visitedEdges, sideEffects, isCompleted: false };
      }

      case 'phone_input': {
        input = {
          blockId: block.id,
          type: 'phone_input',
          placeholder: '+55 (11) 99999-9999',
          variableId: block.options?.variableId,
        };
        state.currentGroupId = currentGroup.id;
        state.currentBlockIndex = blockIndex;
        state.pendingEdgeId = block.outgoingEdgeId;
        return { state, messages, input, visitedEdges, sideEffects, isCompleted: false };
      }

      case 'condition': {
        let matchedBranchEdgeId: string | undefined;

        for (const item of block.items || []) {
          const comparisons = item.comparisons || [];
          if (!comparisons.length) continue;

          let pass = item.logic === 'or' ? false : true;

          for (const comp of comparisons) {
            const actualVal = state.variables[comp.variableId];
            const compResult = evaluateComparison(actualVal, comp.op, comp.value);

            if (item.logic === 'or') {
              if (compResult) {
                pass = true;
                break;
              }
            } else {
              if (!compResult) {
                pass = false;
                break;
              }
            }
          }

          if (pass && item.outgoingEdgeId) {
            matchedBranchEdgeId = item.outgoingEdgeId;
            break;
          }
        }

        const targetEdgeId = matchedBranchEdgeId || block.outgoingEdgeId;
        if (targetEdgeId) {
          const nextEdge = bot.edges.find((e) => e.id === targetEdgeId);
          if (nextEdge) {
            visitedEdges.push({ edgeId: nextEdge.id, isOffDefaultPath: !matchedBranchEdgeId });
            currentGroup = bot.groups.find((g) => g.id === nextEdge.to.groupId);
            blockIndex = 0;
            continue;
          }
        }
        blockIndex++;
        break;
      }

      case 'set_variable': {
        const val = interpolateVariables(block.options.expression, state.variables);
        state.variables[block.options.variableId] = val;
        blockIndex++;
        break;
      }

      case 'jump': {
        const targetGroup = bot.groups.find((g) => g.id === block.options.groupId);
        if (targetGroup) {
          currentGroup = targetGroup;
          blockIndex = 0;
          continue;
        }
        blockIndex++;
        break;
      }

      case 'assign_to_agent': {
        sideEffects.push({
          kind: 'assign_agent',
          strategy: block.options.strategy,
          agentId: block.options.agentId,
          agentName: block.options.agentName || 'Atendente da Fila',
          teamId: block.options.teamId,
        });
        blockIndex++;
        break;
      }

      case 'add_label': {
        sideEffects.push({
          kind: 'add_label',
          labels: block.options.labels || [],
        });
        blockIndex++;
        break;
      }

      case 'http_request': {
        sideEffects.push({
          kind: 'http_request',
          url: block.options.url,
          method: block.options.method,
          body: block.options.body,
        });
        blockIndex++;
        break;
      }

      default:
        blockIndex++;
        break;
    }
  }

  return {
    state,
    messages,
    input,
    visitedEdges,
    sideEffects,
    isCompleted: !input,
  };
}
