import { z } from 'zod';

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const blockSourceSchema = z.object({
  blockId: z.string(),
  itemId: z.string().optional(),
});

export const eventSourceSchema = z.object({
  eventId: z.string(),
});

export const edgeSchema = z.object({
  id: z.string(),
  from: blockSourceSchema.or(eventSourceSchema),
  to: z.object({
    groupId: z.string(),
    blockId: z.string().optional(),
  }),
});

export const itemSchema = z.object({
  id: z.string(),
  content: z.string(),
  outgoingEdgeId: z.string().optional(),
});

export const comparisonSchema = z.object({
  variableId: z.string(),
  op: z.enum(['equals', 'not_equals', 'contains', 'starts_with', 'greater', 'less', 'is_set', 'is_empty']),
  value: z.string().optional(),
});

export const conditionItemSchema = itemSchema.extend({
  comparisons: z.array(comparisonSchema).default([]),
  logic: z.enum(['and', 'or']).default('and'),
});

// Discriminated union of 12 MVP Blocks as specified in Design Doc 4 / ADR-004
export const blockSchema = z.discriminatedUnion('type', [
  // BUBBLE — O bot envia mensagem proativamente
  z.object({
    id: z.string(),
    type: z.literal('text'),
    outgoingEdgeId: z.string().optional(),
    content: z.object({
      text: z.string(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('image'),
    outgoingEdgeId: z.string().optional(),
    content: z.object({
      url: z.string(),
      caption: z.string().optional(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('file'),
    outgoingEdgeId: z.string().optional(),
    content: z.object({
      url: z.string(),
      name: z.string(),
    }),
  }),

  // INPUT — O bot pergunta algo e pausa a execução aguardando interação do usuário
  z.object({
    id: z.string(),
    type: z.literal('text_input'),
    outgoingEdgeId: z.string().optional(),
    options: z.object({
      placeholder: z.string().optional(),
      variableId: z.string().optional(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('choice_input'),
    outgoingEdgeId: z.string().optional(),
    items: z.array(itemSchema).default([]),
    options: z.object({
      isMultiple: z.boolean().default(false),
      variableId: z.string().optional(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('email_input'),
    outgoingEdgeId: z.string().optional(),
    options: z.object({
      retryMessage: z.string().optional(),
      variableId: z.string().optional(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('phone_input'),
    outgoingEdgeId: z.string().optional(),
    options: z.object({
      defaultCountry: z.string().default('BR'),
      variableId: z.string().optional(),
    }),
  }),

  // LOGIC — Decisões internas e ramificação
  z.object({
    id: z.string(),
    type: z.literal('condition'),
    outgoingEdgeId: z.string().optional(),
    items: z.array(conditionItemSchema).default([]),
  }),
  z.object({
    id: z.string(),
    type: z.literal('set_variable'),
    outgoingEdgeId: z.string().optional(),
    options: z.object({
      variableId: z.string(),
      expression: z.string(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('wait'),
    outgoingEdgeId: z.string().optional(),
    options: z.object({
      seconds: z.number().int().min(1).max(3600),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('jump'),
    outgoingEdgeId: z.string().optional(),
    options: z.object({
      groupId: z.string(),
    }),
  }),

  // ACTION — Ações de negócio integradas ao Inbox
  z.object({
    id: z.string(),
    type: z.literal('http_request'),
    outgoingEdgeId: z.string().optional(),
    options: z.object({
      url: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      headers: z.record(z.string(), z.string()).default({}),
      body: z.string().optional(),
      responseMapping: z.array(z.object({ path: z.string(), variableId: z.string() })).default([]),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('assign_to_agent'),
    outgoingEdgeId: z.string().optional(),
    options: z.object({
      strategy: z.enum(['round_robin', 'specific_agent', 'team']),
      agentId: z.string().optional(),
      teamId: z.number().optional(),
      agentName: z.string().optional(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('add_label'),
    outgoingEdgeId: z.string().optional(),
    options: z.object({
      labels: z.array(z.string()),
    }),
  }),
]);

export const groupSchema = z.object({
  id: z.string(),
  title: z.string(),
  graphCoordinates: positionSchema,
  blocks: z.array(blockSchema).default([]),
});

export const variableSchema = z.object({
  id: z.string(),
  name: z.string(),
  defaultValue: z.string().optional(),
});

export const startEventSchema = z.object({
  id: z.string(),
  type: z.literal('start'),
  graphCoordinates: positionSchema,
  outgoingEdgeId: z.string().optional(),
});

export const botV1Schema = z.object({
  version: z.literal('1'),
  id: z.string(),
  accountId: z.number(),
  name: z.string(),
  events: z.tuple([startEventSchema]),
  groups: z.array(groupSchema),
  edges: z.array(edgeSchema),
  variables: z.array(variableSchema),
  settings: z.object({
    typingDelayMs: z.number().default(800),
    handoffOnFailure: z.boolean().default(true),
  }),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
