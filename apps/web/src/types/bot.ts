import { z } from 'zod';
import {
  positionSchema,
  edgeSchema,
  itemSchema,
  blockSchema,
  groupSchema,
  variableSchema,
  startEventSchema,
  botV1Schema,
} from '../lib/bot/schema';

export type Position = z.infer<typeof positionSchema>;
export type Edge = z.infer<typeof edgeSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block['type'];
export type Group = z.infer<typeof groupSchema>;
export type BotVariable = z.infer<typeof variableSchema>;
export type StartEvent = z.infer<typeof startEventSchema>;
export type BotV1 = z.infer<typeof botV1Schema>;

export type StartingPoint =
  | { type: 'start'; eventId: string }
  | { type: 'edge'; edgeId: string };

export interface SessionState {
  botId: string;
  variables: Record<string, any>;
  lastInput?: string;
  pendingEdgeId?: string;
  currentGroupId?: string;
  currentBlockIndex?: number;
}

export type OutgoingMessage = {
  id: string;
  type: 'text' | 'image' | 'file';
  content: string;
  options?: {
    choices?: string[];
    placeholder?: string;
    inputType?: 'text' | 'email' | 'phone' | 'choice';
  };
};

export type SideEffect =
  | { kind: 'assign_agent'; strategy: string; agentId?: string; agentName?: string; teamId?: number }
  | { kind: 'add_label'; labels: string[] }
  | { kind: 'http_request'; url: string; method: string; body?: string };

export interface VisitedEdge {
  edgeId: string;
  isOffDefaultPath: boolean;
}

export interface InputRequest {
  blockId: string;
  type: 'text_input' | 'choice_input' | 'email_input' | 'phone_input';
  placeholder?: string;
  choices?: string[];
  variableId?: string;
}

export interface WalkResult {
  state: SessionState;
  messages: OutgoingMessage[];
  input?: InputRequest;
  visitedEdges: VisitedEdge[];
  sideEffects: SideEffect[];
  isCompleted: boolean;
  error?: string;
}
