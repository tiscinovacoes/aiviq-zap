import type { BotV1 } from '@/types/bot';

// Fluxo-demo da Ouvidoria (dados de exemplo). Compartilhado entre o editor e a
// camada de persistência fallback (dev/sem Supabase), para o card demo abrir o
// mesmo fluxo rico em ambos.
export const demoBot: BotV1 = {
  version: '1',
  id: 'bot_qualifica_01',
  accountId: 1,
  name: 'Triagem de Manifestações da Ouvidoria',
  events: [
    {
      id: 'event_start_01',
      type: 'start',
      graphCoordinates: { x: 50, y: 150 },
      outgoingEdgeId: 'edge_start_to_g1',
    },
  ],
  groups: [
    {
      id: 'group_welcome',
      title: '1. Recepção & Boas-Vindas',
      graphCoordinates: { x: 260, y: 100 },
      blocks: [
        { id: 'b_welcome_txt', type: 'text', content: { text: 'Olá! 👋 Você está na *Ouvidoria Municipal*.' } },
        { id: 'b_welcome_ask_name', type: 'text', content: { text: 'Para começarmos e personalizarmos seu atendimento, como prefere ser chamado?' } },
        { id: 'b_input_name', type: 'text_input', options: { placeholder: 'Seu primeiro nome...', variableId: 'nome' }, outgoingEdgeId: 'edge_g1_to_g2' },
      ],
    },
    {
      id: 'group_interest',
      title: '2. Identificação de Demanda',
      graphCoordinates: { x: 620, y: 100 },
      blocks: [
        { id: 'b_interest_greeting', type: 'text', content: { text: 'Prazer em falar com você, *{{nome}}*!' } },
        {
          id: 'b_interest_choices',
          type: 'choice_input',
          options: { isMultiple: false, variableId: 'departamento' },
          items: [
            { id: 'opt_vendas', content: 'Registrar uma Manifestação', outgoingEdgeId: 'edge_choice_vendas' },
            { id: 'opt_suporte', content: 'Suporte Técnico', outgoingEdgeId: 'edge_choice_suporte' },
            { id: 'opt_duvidas', content: 'Tirar Dúvidas Gerais', outgoingEdgeId: 'edge_choice_duvidas' },
          ],
        },
      ],
    },
    {
      id: 'group_sales',
      title: '3. Registro de Manifestação',
      graphCoordinates: { x: 980, y: 30 },
      blocks: [
        { id: 'b_sales_msg', type: 'text', content: { text: 'Certo, *{{nome}}*! Vou registrar sua manifestação e gerar um número de protocolo para acompanhamento.' } },
        { id: 'b_sales_assign', type: 'assign_to_agent', options: { strategy: 'round_robin', agentName: 'Servidor da Ouvidoria' } },
        { id: 'b_sales_label', type: 'add_label', options: { labels: ['Urgente', 'WhatsApp Cloud'] } },
      ],
    },
    {
      id: 'group_support',
      title: '4. Fila de Suporte',
      graphCoordinates: { x: 980, y: 340 },
      blocks: [
        { id: 'b_supp_msg', type: 'text', content: { text: 'Entendido, *{{nome}}*. Estou transferindo sua conversa para a equipe de atendimento.' } },
        { id: 'b_supp_assign', type: 'assign_to_agent', options: { strategy: 'team', agentName: 'Equipe de Atendimento' } },
        { id: 'b_supp_label', type: 'add_label', options: { labels: ['Suporte', 'Fila de Atendimento'] } },
      ],
    },
  ],
  edges: [
    { id: 'edge_start_to_g1', from: { eventId: 'event_start_01' }, to: { groupId: 'group_welcome' } },
    { id: 'edge_g1_to_g2', from: { blockId: 'b_input_name' }, to: { groupId: 'group_interest' } },
    { id: 'edge_choice_vendas', from: { blockId: 'b_interest_choices', itemId: 'opt_vendas' }, to: { groupId: 'group_sales' } },
    { id: 'edge_choice_suporte', from: { blockId: 'b_interest_choices', itemId: 'opt_suporte' }, to: { groupId: 'group_support' } },
  ],
  variables: [
    { id: 'var_nome', name: 'nome' },
    { id: 'var_dept', name: 'departamento' },
  ],
  settings: { typingDelayMs: 600, handoffOnFailure: true },
  createdAt: '2026-09-11T14:30:00.000Z',
  updatedAt: '2026-09-11T14:30:00.000Z',
};
