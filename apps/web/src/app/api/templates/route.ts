import { NextRequest, NextResponse } from 'next/server';
import { QuickTemplate } from '@/types';

export const dynamic = 'force-dynamic';

let mockTemplates: QuickTemplate[] = [
  {
    id: 'tpl-001',
    shortcut: '/ola',
    title: 'Boas-vindas Padrão',
    content: 'Olá! Seja muito bem-vindo(a) à Poli. Em que posso te ajudar hoje?',
    category: 'saudacao',
  },
  {
    id: 'tpl-002',
    shortcut: '/proposta',
    title: 'Envio de Proposta Comercial',
    content: 'Segue o link da proposta comercial personalizada para a sua empresa com vigência imediata e suporte prioritário:',
    category: 'vendas',
  },
  {
    id: 'tpl-003',
    shortcut: '/checkout-pro',
    title: 'Link de Checkout Plano Pro',
    content: 'Aqui está o seu link seguro para ativação imediata do Plano Pro com desconto especial: https://checkout.poli.dev/pro',
    category: 'vendas',
  },
  {
    id: 'tpl-004',
    shortcut: '/pix',
    title: 'Dados para Pagamento via Pix',
    content: 'Nossa chave Pix oficial (CNPJ) é: 00.000.000/0001-00 (Poli Tecnologia Ltda). Após o envio, basta anexar o comprovante aqui.',
    category: 'cobranca',
  },
  {
    id: 'tpl-005',
    shortcut: '/encerrar',
    title: 'Encerramento de Atendimento',
    content: 'Ficamos felizes em te atender! Caso precise de qualquer outra ajuda, estamos sempre à disposição. Tenha um excelente dia!',
    category: 'suporte',
  },
];

export async function GET(req: NextRequest) {
  return NextResponse.json({
    success: true,
    count: mockTemplates.length,
    templates: mockTemplates,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shortcut, title, content, category = 'vendas' } = body;

    if (!shortcut || !content || !title) {
      return NextResponse.json({ error: 'Atalho, título e conteúdo são obrigatórios' }, { status: 400 });
    }

    const newTemplate: QuickTemplate = {
      id: `tpl-${Date.now()}`,
      shortcut: shortcut.startsWith('/') ? shortcut : `/${shortcut}`,
      title,
      content,
      category,
    };

    mockTemplates.push(newTemplate);

    return NextResponse.json({ success: true, template: newTemplate }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao criar template', message: err.message }, { status: 500 });
  }
}
