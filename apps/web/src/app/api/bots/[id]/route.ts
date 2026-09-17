import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { BotV1 } from '@/types/bot';
import { getBotRecord, saveBotDocument } from '@/lib/botStore';
import { makeBlankBot } from '@/lib/bot/blankBot';

export const dynamic = 'force-dynamic';

function isPlaceholderEnv() {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project')
  );
}

function hasGroups(doc: any): doc is BotV1 {
  return !!doc && Array.isArray(doc.groups) && Array.isArray(doc.events);
}

// GET — documento completo do fluxo (rascunho) para carregar no editor.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const supabase = await createClient();
    const isPlaceholder = isPlaceholderEnv();

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

      const { data, error } = await supabase
        .from('bots')
        .select('id, name, status, document, published_version, updated_at')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { success: false, error: 'Falha ao carregar o fluxo', message: error.message },
          { status: 500 }
        );
      }
      if (!data) return NextResponse.json({ success: false, error: 'Fluxo não encontrado' }, { status: 404 });

      // Documento vazio (recém-criado) → devolve um template em branco com o id.
      const bot = hasGroups(data.document)
        ? (data.document as BotV1)
        : makeBlankBot(data.id, data.name);

      return NextResponse.json({
        success: true,
        bot,
        name: data.name,
        status: data.status,
        publishedVersion: data.published_version ?? 0,
        updatedAt: data.updated_at,
      });
    }

    // Fallback dev/sem banco
    const rec = getBotRecord(id);
    if (!rec) return NextResponse.json({ success: false, error: 'Fluxo não encontrado' }, { status: 404 });
    return NextResponse.json({
      success: true,
      bot: rec.document,
      name: rec.name,
      status: rec.status,
      publishedVersion: rec.publishedVersion,
      updatedAt: rec.updatedAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Bot não encontrado' },
      { status: 404 }
    );
  }
}

// PATCH — salva o documento-rascunho (autosave do editor).
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const document = body?.document as BotV1 | undefined;
    if (!hasGroups(document)) {
      return NextResponse.json({ success: false, error: 'Documento de fluxo inválido' }, { status: 400 });
    }

    const supabase = await createClient();
    const isPlaceholder = isPlaceholderEnv();

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

      const { data, error } = await supabase
        .from('bots')
        .update({ document, name: document.name })
        .eq('id', id)
        .select('id, updated_at')
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { success: false, error: 'Falha ao salvar o fluxo', message: error.message },
          { status: 500 }
        );
      }
      if (!data) return NextResponse.json({ success: false, error: 'Fluxo não encontrado' }, { status: 404 });

      return NextResponse.json({ success: true, botId: id, savedAt: data.updated_at });
    }

    // Fallback dev/sem banco
    const rec = saveBotDocument(id, document);
    if (!rec) return NextResponse.json({ success: false, error: 'Fluxo não encontrado' }, { status: 404 });
    return NextResponse.json({ success: true, simulated: true, botId: id, savedAt: rec.updatedAt });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao salvar rascunho do bot' },
      { status: 400 }
    );
  }
}
