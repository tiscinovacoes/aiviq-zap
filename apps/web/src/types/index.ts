export type UserRole = 'owner' | 'admin' | 'agent' | 'viewer';

export interface UserProfile {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'pro' | 'enterprise';
  max_agents: number;
}

export type ChannelType = 'whatsapp_cloud' | 'instagram' | 'webchat' | 'telegram';

export interface Inbox {
  id: string;
  organization_id: string;
  name: string;
  channel_type: ChannelType;
  phone_number_id?: string;
  is_active: boolean;
}

export type ConversationStatus = 'open' | 'pending' | 'resolved';

export interface Contact {
  id: string;
  organization_id: string;
  name: string;
  phone?: string;
  email?: string;
  avatar_url?: string;
  company?: string;
  tags: string[];
  assigned_to?: string; // Carteira do atendente
  assigned_user?: UserProfile;
  custom_attributes: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface Conversation {
  id: string;
  organization_id: string;
  inbox_id: string;
  contact_id: string;
  contact?: Contact;
  assignee_id?: string;
  assignee?: UserProfile;
  status: ConversationStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  channel_type?: ChannelType;
  last_message_preview?: string;
  last_message_at?: string;
  unread_count: number;
  created_at: string;
}

export interface Message {
  id: string;
  organization_id: string;
  conversation_id: string;
  sender_type: 'contact' | 'agent' | 'bot' | 'system';
  sender_id?: string;
  sender_name?: string;
  content: string;
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'template';
  delivery_status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  external_message_id?: string;
  created_at: string;
}

export interface QuickTemplate {
  id: string;
  shortcut: string;
  title: string;
  content: string;
  category: 'saudacao' | 'vendas' | 'suporte' | 'cobranca';
}

export type DealStage =
  | 'lead_qualificado'
  | 'contato_inicial'
  | 'demonstracao'
  | 'proposta_enviada'
  | 'fechado_ganho'
  | 'perdido';

export interface Deal {
  id: string;
  organization_id: string;
  contact_id: string;
  contact?: Contact;
  title: string;
  value: number; // Em centavos ou valor float em Reais
  stage: DealStage;
  probability: number; // 0 - 100%
  expected_close_date?: string;
  assignee_id?: string;
  assignee_name?: string;
  created_at: string;
  updated_at?: string;
}
