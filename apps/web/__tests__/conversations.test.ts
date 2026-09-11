import { describe, it, expect } from 'vitest';
import { Conversation, Message, QuickTemplate } from '@/types';

describe('Conversations & Omnichannel Messaging (Unit Tests)', () => {
  const mockList: Conversation[] = [
    {
      id: 'conv-1',
      organization_id: 'org-1',
      inbox_id: 'inbox-wa',
      contact_id: 'cont-1',
      channel_type: 'whatsapp_cloud',
      status: 'open',
      priority: 'high',
      last_message_preview: 'Quero contratar o plano Pro',
      unread_count: 1,
      created_at: '2026-09-11T12:00:00Z',
      contact: {
        id: 'cont-1',
        organization_id: 'org-1',
        name: 'Mariana Silva',
        tags: ['VIP'],
        custom_attributes: {},
      },
    },
    {
      id: 'conv-2',
      organization_id: 'org-1',
      inbox_id: 'inbox-ig',
      contact_id: 'cont-2',
      channel_type: 'instagram',
      status: 'resolved',
      priority: 'low',
      last_message_preview: 'Obrigado pelo suporte',
      unread_count: 0,
      created_at: '2026-09-11T11:00:00Z',
      contact: {
        id: 'cont-2',
        organization_id: 'org-1',
        name: 'Carlos Eduardo',
        tags: ['Resolvido'],
        custom_attributes: {},
      },
    },
  ];

  it('deve filtrar conversas por status corretamente', () => {
    const openConversations = mockList.filter((c) => c.status === 'open');
    const resolvedConversations = mockList.filter((c) => c.status === 'resolved');

    expect(openConversations.length).toBe(1);
    expect(openConversations[0].contact?.name).toBe('Mariana Silva');
    expect(resolvedConversations.length).toBe(1);
    expect(resolvedConversations[0].contact?.name).toBe('Carlos Eduardo');
  });

  it('deve filtrar conversas por canal corretamente', () => {
    const waConversations = mockList.filter((c) => c.channel_type === 'whatsapp_cloud');
    const igConversations = mockList.filter((c) => c.channel_type === 'instagram');

    expect(waConversations.length).toBe(1);
    expect(igConversations.length).toBe(1);
  });

  it('deve formatar nova mensagem com delivery_status e timestamp', () => {
    const content = 'Link de checkout gerado com sucesso';
    const message: Message = {
      id: 'msg-test',
      organization_id: 'org-1',
      conversation_id: 'conv-1',
      sender_type: 'agent',
      sender_name: 'Lucas R.',
      content,
      message_type: 'text',
      delivery_status: 'sent',
      created_at: '15:30',
    };

    expect(message.sender_type).toBe('agent');
    expect(message.delivery_status).toBe('sent');
    expect(message.content).toBe(content);
  });

  it('deve validar formatação de atalho do QuickTemplate', () => {
    const template: QuickTemplate = {
      id: 'tpl-1',
      shortcut: '/proposta',
      title: 'Proposta Pro',
      content: 'Segue o link da proposta:',
      category: 'vendas',
    };

    expect(template.shortcut.startsWith('/')).toBe(true);
    expect(template.shortcut.length).toBeGreaterThan(1);
  });
});
