import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { QuickTemplate } from '@/types';

export const dynamic = 'force-dynamic';

// Generic default templates without production sensitive data (M1 fix)
let mockTemplates: QuickTemplate[] = [
  {
    id: 'tpl-001',
    shortcut: '/ola',
    title: 'Boas-vindas da Ouvidoria',
    content: 'Olá! Você está falando com a Ouvidoria. Em que podemos ajudar hoje?',
    category: 'saudacao',
  },
  {
    id: 'tpl-002',
    shortcut: '/protocolo',
    title: 'Confirmação de Abertura de Protocolo',
    content: 'Sua manifestação foi registrada sob o protocolo {{numero_protocolo}}. Você pode acompanhar o andamento por este mesmo canal.',
    category: 'informacao',
  },
  {
    id: 'tpl-003',
    shortcut: '/encaminhamento',
    title: 'Encaminhamento ao Órgão Responsável',
    content: 'Sua solicitação foi encaminhada à {{orgao_responsavel}}. O prazo estimado de retorno é de {{prazo}} dias úteis.',
    category: 'encaminhamento',
  },
  {
    id: 'tpl-004',
    shortcut: '/documentos',
    title: 'Solicitação de Documentos',
    content: 'Para dar andamento ao seu protocolo, por favor envie {{documentos}} (foto ou PDF) por aqui.',
    category: 'informacao',
  },
  {
    id: 'tpl-005',
    shortcut: '/encerrar',
    title: 'Encerramento de Atendimento',
    content: 'Seu protocolo foi concluído. Caso precise de qualquer outra coisa, a Ouvidoria está sempre à disposição. Tenha um excelente dia!',
    category: 'conclusao',
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
    const { shortcut, title, content, category = 'informacao' } = body;

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

