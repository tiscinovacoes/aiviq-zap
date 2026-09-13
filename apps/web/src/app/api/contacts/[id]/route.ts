import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Cidadao, Protocolo } from '@/types';
import { getRealContacts } from '@/lib/evolutionService';
import { getCustomContacts } from '@/lib/conversationStore';
import { acharCidadaoMock, protocolosDoCidadao, resumoCidadao } from '@/lib/mockOuvidoria';

export const dynamic = 'force-dynamic';

// CRM 360º — dados de um cidadão + todos os protocolos vinculados a ele.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const supabase = await createClient();
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let contact: Cidadao | null = null;
    let protocolos: Protocolo[] = [];

    // 1. Banco conectado: cidadão + protocolos por RLS
    if (!isPlaceholder) {
      const { data: dbContact } = await supabase
        .from('contacts')
        .select('*, assigned_user:profiles(*)')
        .eq('id', id)
        .single();

      if (dbContact) contact = dbContact as unknown as Cidadao;

      const { data: dbProtocolos } = await supabase
        .from('protocolos')
        .select('*')
        .eq('contact_id', id)
        .order('created_at', { ascending: false });

      if (dbProtocolos) protocolos = dbProtocolos as unknown as Protocolo[];
    }

    // 2. Fallback (dev/mock): procura em mock -> custom -> Evolution
    if (!contact) {
      contact =
        acharCidadaoMock(id) ||
        getCustomContacts().find((c) => c.id === id) ||
        (await getRealContacts()).find((c) => c.id === id) ||
        null;

      if (protocolos.length === 0) {
        protocolos = protocolosDoCidadao(id);
      }
    }

    if (!contact) {
      return NextResponse.json({ error: 'Cidadão não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      contact,
      protocolos,
      resumo: resumoCidadao(protocolos),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao carregar ficha do cidadão', message: err.message },
      { status: 500 }
    );
  }
}

// Atualização de contato/cidadão (mantido do endpoint original — stub simulado).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();

    return NextResponse.json({
      success: true,
      message: 'Cidadão atualizado com sucesso',
      updated: {
        id,
        ...body,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao atualizar cidadão', message: err.message },
      { status: 500 }
    );
  }
}
