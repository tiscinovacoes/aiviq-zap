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
  cpf?: string; // documento do cidadão (opcional)
  bairro?: string; // bairro/região do cidadão
  avatar_url?: string;
  company?: string; // órgão/entidade, quando a manifestação vem de PJ
  tags: string[];
  assigned_to?: string; // Carteira do atendente
  assigned_user?: UserProfile;
  custom_attributes: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

// No domínio de Ouvidoria, um Contact é sempre um Cidadão. Alias semântico
// para deixar o código legível sem quebrar as referências existentes.
export type Cidadao = Contact;

export interface Conversation {
  id: string;
  organization_id: string;
  inbox_id: string;
  instance_name?: string;
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
  category: 'saudacao' | 'informacao' | 'encaminhamento' | 'conclusao';
}

// =====================================================================
// OUVIDORIA / PROTOCOLOS — atendimento ao cidadão. Substitui o modelo
// comercial de "Deal / funil de vendas". Um Protocolo é cada
// manifestação/pedido de um cidadão que tramita no CRM.
// =====================================================================

// Situação do protocolo (fluxo de atendimento — substitui o funil de vendas)
export type ProtocoloStatus =
  | 'aberto'             // recebido, aguardando triagem
  | 'em_analise'         // em triagem / classificação
  | 'em_atendimento'     // encaminhado ao órgão responsável
  | 'aguardando_cidadao' // pendência com o cidadão
  | 'resolvido'          // concluído / respondido
  | 'arquivado';         // encerrado sem tramitação (terminal)

// Tipo de manifestação — Lei 13.460/2017 (Defesa do Usuário de Serviços Públicos)
export type TipoManifestacao =
  | 'denuncia'
  | 'reclamacao'
  | 'solicitacao'
  | 'sugestao'
  | 'elogio'
  | 'informacao'; // pedido de acesso à informação (SIC)

export type Prioridade = 'baixa' | 'media' | 'alta' | 'urgente';

export interface Protocolo {
  id: string;
  organization_id: string;
  contact_id: string;
  contact?: Cidadao; // cidadão que abriu o protocolo
  protocol_number: string; // número público rastreável, ex: 2026-000123
  title: string; // assunto / resumo da manifestação
  tipo_manifestacao: TipoManifestacao;
  categoria?: string; // área / tema: Saúde, Iluminação, Saneamento...
  orgao_responsavel?: string; // secretaria / órgão que trata
  bairro?: string;
  prioridade: Prioridade;
  status: ProtocoloStatus;
  due_date?: string; // prazo legal / SLA (ISO date)
  assignee_id?: string; // servidor responsável
  assignee_name?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
  closed_at?: string; // data de resolução / encerramento
}
