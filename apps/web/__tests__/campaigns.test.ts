import { describe, it, expect } from 'vitest';
import { Campaign } from '../src/types/campaign';

export function sanitizePhoneNumber(phone: string, ddiPlus55: boolean = true): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  if (ddiPlus55) {
    if (digits.startsWith('55')) {
      return `+${digits}`;
    }
    // If standard Brazilian mobile without DDI (10 or 11 digits)
    if (digits.length === 10 || digits.length === 11) {
      return `+55${digits}`;
    }
  }

  return digits.startsWith('+') ? digits : `+${digits}`;
}

export function filterDuplicateContacts(contacts: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const c of contacts) {
    const sanitized = sanitizePhoneNumber(c);
    if (sanitized && !seen.has(sanitized)) {
      seen.add(sanitized);
      unique.push(sanitized);
    }
  }

  return unique;
}

export function calculateCampaignRates(campaign: Campaign) {
  const deliveryRate =
    campaign.sentCount > 0 ? (campaign.deliveredCount / campaign.sentCount) * 100 : 0;
  const readRate =
    campaign.deliveredCount > 0 ? (campaign.readCount / campaign.deliveredCount) * 100 : 0;
  const replyRate =
    campaign.deliveredCount > 0 ? (campaign.repliedCount / campaign.deliveredCount) * 100 : 0;

  return {
    deliveryRate: Number(deliveryRate.toFixed(1)),
    readRate: Number(readRate.toFixed(1)),
    replyRate: Number(replyRate.toFixed(1)),
  };
}

describe('Campaigns & Mass Dispatch Engine (Unit Tests)', () => {
  it('correctly calculates delivery, read and reply conversion rates', () => {
    const mockCampaign: Campaign = {
      id: 'camp_test',
      name: 'Black Friday VIP',
      channel: 'WhatsApp Cloud Oficial',
      status: 'completed',
      messageText: 'Oferta exclusiva {{nome}}',
      totalContacts: 10000,
      sentCount: 10000,
      deliveredCount: 9800,
      readCount: 8330,
      repliedCount: 3136,
      failedCount: 200,
      createdAt: new Date().toISOString(),
      tags: ['VIP'],
      avoidDuplicates: true,
      ddiPlus55: true,
    };

    const rates = calculateCampaignRates(mockCampaign);
    expect(rates.deliveryRate).toBe(98.0);
    expect(rates.readRate).toBe(85.0);
    expect(rates.replyRate).toBe(32.0);
  });

  it('sanitizes Brazilian phone numbers adding DDI +55 automatically', () => {
    expect(sanitizePhoneNumber('(11) 98765-4321')).toBe('+5511987654321');
    expect(sanitizePhoneNumber('21999998888')).toBe('+5521999998888');
    expect(sanitizePhoneNumber('+55 11 98888-7777')).toBe('+5511988887777');
  });

  it('filters out duplicated phone numbers from dispatch base', () => {
    const list = [
      '11987654321',
      '(11) 98765-4321',
      '+5511987654321',
      '21988887777',
      '21988887777',
    ];

    const unique = filterDuplicateContacts(list);
    expect(unique.length).toBe(2);
    expect(unique).toEqual(['+5511987654321', '+5521988887777']);
  });

  it('verifies campaign trigger configuration for automatic chatbot reply', () => {
    const campaignWithBot: Campaign = {
      id: 'camp_bot',
      name: 'Qualificação Outbound',
      channel: 'WhatsApp Cloud Oficial',
      status: 'running',
      messageText: 'Olá!',
      totalContacts: 500,
      sentCount: 500,
      deliveredCount: 495,
      readCount: 410,
      repliedCount: 120,
      failedCount: 5,
      createdAt: new Date().toISOString(),
      tags: ['Outbound'],
      botToTriggerOnReply: 'Qualificação Comercial & Triagem Inteligente',
      avoidDuplicates: true,
      ddiPlus55: true,
    };

    expect(campaignWithBot.botToTriggerOnReply).toBe('Qualificação Comercial & Triagem Inteligente');
    expect(campaignWithBot.avoidDuplicates).toBe(true);
  });
});
