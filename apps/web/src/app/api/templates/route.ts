import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { QuickTemplate } from '@/types';

export const dynamic = 'force-dynamic';

// Generic default templates without production sensitive data (M1 fix)
let mockTemplates: QuickTemplate[] = [
  {
    id: 'tpl-001',
    shortcut: '/ola',
    title: 'Boas-vindas Padrão',
    content: 'Olá! Seja muito bem-vindo(a) à AIVIQ-ZAP. Em que posso te ajudar hoje?',
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
    content: 'Aqui está o seu link seguro para ativação: {{link_checkout}}',
    category: 'vendas',
  },
  {
    id: 'tpl-004',
    shortcut: '/pix',
    title: 'Dados para Pagamento via Pix',
    content: 'Chave Pix (CNPJ): {{chave_pix}}. Após o envio, basta anexar o comprovante aqui.',
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
  try {
    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }
    }

    return NextResponse.json({
      success: true,
      count: mockTemplates.length,
      templates: mockTemplates,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao carregar templates', message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }
    }

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

    return NextResponse.json({
      success: true,
      simulated: true,
      template: newTemplate,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao criar template', message: err.message }, { status: 500 });
  }
}

