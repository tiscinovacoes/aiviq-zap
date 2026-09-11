import { NextRequest, NextResponse } from 'next/server';
import { Campaign } from '@/types/campaign';

export const dynamic = 'force-dynamic';

const mockCampaigns: Campaign[] = [
  {
    id: 'camp_01',
    name: 'Oferta Especial de Renovação Anual (Pro)',
    channel: 'WhatsApp Cloud Oficial',
    status: 'running',
    messageText: 'Olá {{nome}}! Seu plano anual da Poli possui 25% de desconto neste mês. Clique para resgatar!',
    totalContacts: 12500,
    sentCount: 11200,
    deliveredCount: 11040,
    readCount: 9450,
    repliedCount: 3820,
    failedCount: 160,
    createdAt: '2026-09-11T10:00:00Z',
    scheduledAt: '2026-09-11T11:00:00Z',
    tags: ['Cliente Ativo', 'SaaS', 'Renovação'],
    botToTriggerOnReply: 'Qualificação Comercial & Triagem Inteligente',
    avoidDuplicates: true,
    ddiPlus55: true,
  },
  {
    id: 'camp_02',
    name: 'Webinar: Como Escalar Atendimento com IA Oficial',
    channel: 'WhatsApp Cloud Oficial',
    status: 'completed',
    messageText: 'Participe amanhã às 19h do nosso treinamento exclusivo com demonstração prática da API oficial da Meta.',
    totalContacts: 8400,
    sentCount: 8400,
    deliveredCount: 8310,
    readCount: 7100,
    repliedCount: 2640,
    failedCount: 90,
    createdAt: '2026-09-08T14:00:00Z',
    scheduledAt: '2026-09-09T09:00:00Z',
    tags: ['Lead Inbound', 'Webinar'],
    botToTriggerOnReply: 'Qualificação Comercial & Triagem Inteligente',
    avoidDuplicates: true,
    ddiPlus55: true,
  },
  {
    id: 'camp_03',
    name: 'Reativação de Oportunidades Perdidas Q3',
    channel: 'WhatsApp Cloud Oficial',
    status: 'scheduled',
    messageText: 'Oi {{nome}}, preparamos uma condição especial para destravar a implantação do seu atendimento multicanal.',
    totalContacts: 3400,
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    repliedCount: 0,
    failedCount: 0,
    createdAt: '2026-09-11T14:30:00Z',
    scheduledAt: '2026-09-12T10:00:00Z',
    tags: ['Oportunidade Perdida', 'CRM'],
    botToTriggerOnReply: 'Qualificação Comercial & Triagem Inteligente',
    avoidDuplicates: true,
    ddiPlus55: true,
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q')?.toLowerCase() || '';

    let list = mockCampaigns;
    if (search) {
      list = list.filter((c) => c.name.toLowerCase().includes(search));
    }

    const totalDispatches = mockCampaigns.reduce((acc, c) => acc + c.sentCount, 0);
    const totalDelivered = mockCampaigns.reduce((acc, c) => acc + c.deliveredCount, 0);
    const totalReplied = mockCampaigns.reduce((acc, c) => acc + c.repliedCount, 0);

    const metrics = {
      totalCampaigns: mockCampaigns.length,
      activeCampaigns: mockCampaigns.filter((c) => c.status === 'running').length,
      monthlyDispatches: 48500,
      avgDeliveryRate: totalDispatches > 0 ? `${((totalDelivered / totalDispatches) * 100).toFixed(1)}%` : '98.7%',
      avgReplyRate: totalDelivered > 0 ? `${((totalReplied / totalDelivered) * 100).toFixed(1)}%` : '31.4%',
    };

    return NextResponse.json({
      success: true,
      campaigns: list,
      metrics,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao listar campanhas' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const newCampaign: Campaign = {
      id: `camp_${Date.now()}`,
      name: body.name || 'Nova Campanha de Disparo',
      channel: body.channel || 'WhatsApp Cloud Oficial',
      status: body.scheduledAt ? 'scheduled' : 'running',
      messageText: body.messageText || '',
      attachmentUrl: body.attachmentUrl,
      totalContacts: body.totalContacts || 1500,
      sentCount: body.scheduledAt ? 0 : Math.floor((body.totalContacts || 1500) * 0.4),
      deliveredCount: body.scheduledAt ? 0 : Math.floor((body.totalContacts || 1500) * 0.38),
      readCount: body.scheduledAt ? 0 : Math.floor((body.totalContacts || 1500) * 0.3),
      repliedCount: body.scheduledAt ? 0 : Math.floor((body.totalContacts || 1500) * 0.12),
      failedCount: 0,
      scheduledAt: body.scheduledAt,
      createdAt: new Date().toISOString(),
      tags: body.tags || ['Geral'],
      botToTriggerOnReply: body.botToTriggerOnReply || 'Qualificação Comercial & Triagem Inteligente',
      avoidDuplicates: body.avoidDuplicates !== false,
      ddiPlus55: body.ddiPlus55 !== false,
    };

    mockCampaigns.unshift(newCampaign);

    return NextResponse.json({
      success: true,
      campaign: newCampaign,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao criar campanha' },
      { status: 400 }
    );
  }
}
