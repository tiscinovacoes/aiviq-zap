import { describe, it, expect } from 'vitest';
import { walkFlowForward, interpolateVariables } from '../src/lib/bot/engine/walkFlowForward';
import { BotV1 } from '../src/types/bot';

describe('Bot Execution Engine (walkFlowForward)', () => {
  it('interpolates variables correctly in strings', () => {
    const text = 'Olá, {{nome}}! Seu plano é {{ plano }}.';
    const vars = { nome: 'Carlos Eduardo', plano: 'Enterprise' };
    expect(interpolateVariables(text, vars)).toBe('Olá, Carlos Eduardo! Seu plano é Enterprise.');
  });

  it('executes a linear flow accumulating bubble messages and pauses on text_input', async () => {
    const mockBot: BotV1 = {
      version: '1',
      id: 'bot_test_1',
      accountId: 1,
      name: 'Bot Qualificação',
      events: [{ id: 'ev_start', type: 'start', graphCoordinates: { x: 0, y: 0 }, outgoingEdgeId: 'edge_start_g1' }],
      groups: [
        {
          id: 'g1',
          title: 'Boas-Vindas',
          graphCoordinates: { x: 100, y: 100 },
          blocks: [
            { id: 'b1', type: 'text', content: { text: 'Olá! Seja bem-vindo à Poli.digital.' } },
            { id: 'b2', type: 'text', content: { text: 'Para começarmos, qual é o seu nome completo?' } },
            { id: 'b3', type: 'text_input', options: { placeholder: 'Digite seu nome', variableId: 'nome' } },
          ],
        },
      ],
      edges: [
        { id: 'edge_start_g1', from: { eventId: 'ev_start' }, to: { groupId: 'g1' } },
      ],
      variables: [{ id: 'var_nome', name: 'nome' }],
      settings: { typingDelayMs: 500, handoffOnFailure: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await walkFlowForward(mockBot, { type: 'start', eventId: 'ev_start' }, { state: { botId: 'bot_test_1', variables: {} } });

    expect(result.messages.length).toBe(2);
    expect(result.messages[0].content).toContain('Seja bem-vindo à Poli.digital');
    expect(result.messages[1].content).toContain('qual é o seu nome completo?');
    expect(result.input).toBeDefined();
    expect(result.input?.type).toBe('text_input');
    expect(result.input?.variableId).toBe('nome');
    expect(result.isCompleted).toBe(false);
  });

  it('resumes execution after input, saves variable and branches on choice_input', async () => {
    const mockBot: BotV1 = {
      version: '1',
      id: 'bot_test_2',
      accountId: 1,
      name: 'Bot Triagem Segmento',
      events: [{ id: 'ev_start', type: 'start', graphCoordinates: { x: 0, y: 0 }, outgoingEdgeId: 'edge_start_g1' }],
      groups: [
        {
          id: 'g1',
          title: 'Captura Nome',
          graphCoordinates: { x: 100, y: 100 },
          blocks: [
            { id: 'b1', type: 'text_input', options: { variableId: 'nome' }, outgoingEdgeId: 'edge_g1_g2' },
          ],
        },
        {
          id: 'g2',
          title: 'Segmento de Mercado',
          graphCoordinates: { x: 400, y: 100 },
          blocks: [
            { id: 'b2', type: 'text', content: { text: 'Perfeito, {{nome}}!' } },
            {
              id: 'b3',
              type: 'choice_input',
              options: { isMultiple: false, variableId: 'interesse' },
              items: [
                { id: 'item_1', content: 'Falar com Comercial', outgoingEdgeId: 'edge_comercial' },
                { id: 'item_2', content: 'Suporte Técnico', outgoingEdgeId: 'edge_suporte' },
              ],
            },
          ],
        },
        {
          id: 'g_comercial',
          title: 'Encaminhamento Comercial',
          graphCoordinates: { x: 700, y: 0 },
          blocks: [
            { id: 'b4', type: 'text', content: { text: 'Ótimo, {{nome}}, transferindo para nosso consultor comercial...' } },
            { id: 'b5', type: 'assign_to_agent', options: { strategy: 'round_robin', agentName: 'Consultor Enterprise' } },
            { id: 'b6', type: 'add_label', options: { labels: ['Lead Quente', 'WhatsApp'] } },
          ],
        },
      ],
      edges: [
        { id: 'edge_start_g1', from: { eventId: 'ev_start' }, to: { groupId: 'g1' } },
        { id: 'edge_g1_g2', from: { blockId: 'b1' }, to: { groupId: 'g2' } },
        { id: 'edge_comercial', from: { blockId: 'b3', itemId: 'item_1' }, to: { groupId: 'g_comercial' } },
      ],
      variables: [{ id: 'v1', name: 'nome' }, { id: 'v2', name: 'interesse' }],
      settings: { typingDelayMs: 500, handoffOnFailure: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Step 1: User provides name
    const step1 = await walkFlowForward(
      mockBot,
      { type: 'edge', edgeId: 'edge_g1_g2' },
      {
        state: {
          botId: 'bot_test_2',
          variables: {},
          lastInput: 'Mariana Lima',
          currentGroupId: 'g1',
          currentBlockIndex: 0,
        },
      }
    );

    expect(step1.state.variables['nome']).toBe('Mariana Lima');
    expect(step1.messages[0].content).toBe('Perfeito, Mariana Lima!');
    expect(step1.input?.type).toBe('choice_input');
    expect(step1.input?.choices).toEqual(['Falar com Comercial', 'Suporte Técnico']);

    // Step 2: User chooses "Falar com Comercial"
    const step2 = await walkFlowForward(
      mockBot,
      { type: 'edge', edgeId: 'edge_comercial' },
      {
        state: {
          ...step1.state,
          lastInput: 'Falar com Comercial',
        },
      }
    );

    expect(step2.messages[0].content).toContain('transferindo para nosso consultor comercial');
    expect(step2.sideEffects.length).toBe(2);
    expect(step2.sideEffects[0]).toEqual({
      kind: 'assign_agent',
      strategy: 'round_robin',
      agentId: undefined,
      agentName: 'Consultor Enterprise',
      teamId: undefined,
    });
    expect(step2.sideEffects[1]).toEqual({
      kind: 'add_label',
      labels: ['Lead Quente', 'WhatsApp'],
    });
    expect(step2.isCompleted).toBe(true);
  });

  it('detects infinite loops and protects the system', async () => {
    const cyclingBot: BotV1 = {
      version: '1',
      id: 'bot_loop',
      accountId: 1,
      name: 'Bot com Loop Infinito',
      events: [{ id: 'ev_start', type: 'start', graphCoordinates: { x: 0, y: 0 }, outgoingEdgeId: 'edge_loop_1' }],
      groups: [
        {
          id: 'g_loop1',
          title: 'Loop A',
          graphCoordinates: { x: 0, y: 0 },
          blocks: [{ id: 'b_loop1', type: 'jump', options: { groupId: 'g_loop2' } }],
        },
        {
          id: 'g_loop2',
          title: 'Loop B',
          graphCoordinates: { x: 200, y: 0 },
          blocks: [{ id: 'b_loop2', type: 'jump', options: { groupId: 'g_loop1' } }],
        },
      ],
      edges: [
        { id: 'edge_loop_1', from: { eventId: 'ev_start' }, to: { groupId: 'g_loop1' } },
      ],
      variables: [],
      settings: { typingDelayMs: 0, handoffOnFailure: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await walkFlowForward(cyclingBot, { type: 'start', eventId: 'ev_start' }, { state: { botId: 'bot_loop', variables: {} } });
    expect(result.error).toContain('Ciclo infinito detectado');
    expect(result.isCompleted).toBe(false);
  });
});
