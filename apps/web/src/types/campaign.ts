export type CampaignStatus = 'scheduled' | 'running' | 'completed' | 'paused' | 'draft';

export interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: CampaignStatus;
  messageText: string;
  attachmentUrl?: string;
  totalContacts: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  scheduledAt?: string;
  createdAt: string;
  tags: string[];
  botToTriggerOnReply?: string;
  avoidDuplicates: boolean;
  ddiPlus55: boolean;
}

export interface CampaignMetrics {
  totalCampaigns: number;
  activeCampaigns: number;
  monthlyDispatches: number;
  avgDeliveryRate: string;
  avgReplyRate: string;
}

export interface AttendantPerformance {
  id: string;
  name: string;
  avatar: string;
  department: string;
  chatsResolved: number;
  avgResponseTime: string;
  csatScore: number;
  status: 'online' | 'busy' | 'offline';
}

export interface ChannelVolume {
  channel: string;
  label: string;
  totalMessages: number;
  conversations: number;
  percentage: number;
  color: string;
}

export interface ReportData {
  period: string;
  totalConversations: number;
  resolvedConversations: number;
  avgFirstResponseTime: string;
  avgResolutionTime: string;
  csatOverall: number;
  csatPositivePercentage: string;
  aiDeflectionRate: string;
  channels: ChannelVolume[];
  attendants: AttendantPerformance[];
}
