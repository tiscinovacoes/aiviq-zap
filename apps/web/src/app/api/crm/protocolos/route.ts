import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Protocolo } from '@/types';
import { mockProtocolos, computeProtocoloMetrics } from '@/lib/mockOuvidoria';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let protocolos: Protocolo[] = mockProtocolos;

    if (!isPlaceholder) {
      const { data: dbProtocolos, error } = await supabase
        .from('protocolos')
        .select('*, contact:contacts(*)');

      if (!error && dbProtocolos && dbProtocolos.length > 0) {
        protocolos = dbProtocolos as unknown as Protocolo[];
      } else {
        // Fallback para os protocolos de exemplo (dá dados iniciais ao painel)
        protocolos = mockProtocolos;
      }
    }

    return NextResponse.json({
      success: true,
      metrics: computeProtocoloMetrics(protocolos),
      protocolos,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao listar protocolos', message: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      tipo_manifestacao = 'solicitacao',
      categoria,
      orgao_responsavel,
      bairro,
      prioridade = 'media',
      status = 'aberto',
      due_date,
      contact_name,
      assignee_name = 'Equipe de Ouvidoria',
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'O assunto do protocolo é obrigatório' }, { status: 400 });
    }

    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile || !profile.organization_id) {
        return NextResponse.json({ error: 'Perfil de organização não encontrado' }, { status: 403 });
      }

      // Localiza ou cria o cidadão
      const { data: contact } = await supabase
        .from('contacts')
        .insert({
          organization_id: profile.organization_id,
          name: contact_name || 'Cidadão não identificado',
          bairro: bairro || null,
          tags: ['Ouvidoria'],
        })
        .select()
        .single();

      const { data: insertedProtocolo, error: protocoloError } = await supabase
        .from('protocolos')
        .insert({
          organization_id: profile.organization_id,
          contact_id: contact?.id,
          title,
          tipo_manifestacao,
          categoria: categoria || null,
          orgao_responsavel: orgao_responsavel || null,
          bairro: bairro || null,
          prioridade,
          status,
          due_date: due_date || null,
          assignee_id: user.id,
        })
        .select('*, contact:contacts(*)')
        .single();

      if (protocoloError) {
        // Se a tabela protocolos ainda não foi provisionada, cai no fallback simulado.
        console.warn('[Ouvidoria Protocolos DB] Tabela ausente ou erro:', protocoloError.message);
      } else if (insertedProtocolo) {
        return NextResponse.json({ success: true, protocolo: insertedProtocolo }, { status: 201 });
      }
    }

    // Modo dev / fallback (número de protocolo simulado)
    const ano = new Date().getFullYear();
    const seq = String(mockProtocolos.length + 1).padStart(6, '0');
    const cidId = `cid-${Date.now()}`;
    const newProtocolo: Protocolo = {
      id: `prot-${Date.now()}`,
      organization_id: '00000000-0000-0000-0000-000000000000',
      contact_id: cidId,
      protocol_number: `${ano}-${seq}`,
      title,
      tipo_manifestacao,
      categoria,
      orgao_responsavel,
      bairro,
      prioridade,
      status,
      due_date,
      assignee_name,
      created_at: new Date().toISOString(),
      contact: {
        id: cidId,
        organization_id: '00000000-0000-0000-0000-000000000000',
        name: contact_name || 'Cidadão não identificado',
        bairro,
        tags: ['Ouvidoria'],
        custom_attributes: {},
      },
    };

    mockProtocolos.unshift(newProtocolo);

    return NextResponse.json({ success: true, simulated: true, protocolo: newProtocolo }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao abrir protocolo', message: err.message },
      { status: 500 }
    );
  }
}
