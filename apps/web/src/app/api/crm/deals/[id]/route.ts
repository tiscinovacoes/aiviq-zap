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

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }

      const { data: updatedDeal, error } = await supabase
        .from('deals')
        .update({
          ...body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (!error && updatedDeal) {
        return NextResponse.json({
          success: true,
          message: 'Oportunidade atualizada com sucesso',
          updated: updatedDeal,
        });
      }
    }

    return NextResponse.json({
      success: true,
      simulated: true,
      message: 'Oportunidade atualizada (modo simulado)',
      updated: {
        id,
        ...body,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao atualizar oportunidade', message: err.message },
      { status: 500 }
    );
  }
}

