import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();

    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    // CR-004 T2/T6: whitelist de colunas — impede que `...body` injete
    // organization_id (mover tenant) ou colunas inexistentes.
    const ALLOWED = [
      'title', 'status', 'tipo_manifestacao', 'categoria', 'orgao_responsavel',
      'bairro', 'prioridade', 'due_date', 'assignee_id', 'assignee_name',
      'contact_id', 'notes', 'closed_at',
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in body) patch[k] = body[k];

    // Ao resolver, carimba a data de encerramento automaticamente.
    if (patch.status === 'resolvido' && !('closed_at' in patch)) {
      patch.closed_at = new Date().toISOString();
    }

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }

      const { data: updatedProtocolo, error } = await supabase
        .from('protocolos')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      // CR-004 T2: banco conectado → erro do banco é ERRO (não "simulado").
      if (error) {
        return NextResponse.json(
          { error: 'Falha ao atualizar protocolo', message: error.message },
          { status: 500 }
        );
      }
      if (!updatedProtocolo) {
        return NextResponse.json(
          { error: 'Protocolo não encontrado' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        message: 'Protocolo atualizado com sucesso',
        updated: updatedProtocolo,
      });
    }

    // Sem banco configurado (placeholder/local) → resposta simulada explícita.
    return NextResponse.json({
      success: true,
      simulated: true,
      message: 'Protocolo atualizado (modo simulado — banco não configurado)',
      updated: { id, ...patch, updated_at: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao atualizar protocolo', message: err.message },
      { status: 500 }
    );
  }
}
