import { NextRequest, NextResponse } from 'next/server';
import { getBotRecord, publishBotRecord } from '@/lib/botStore';
import { getDbContext, isPlaceholderEnv } from '@/lib/supabase/authContext';

export const dynamic = 'force-dynamic';

// Publica o rascunho: copia `document` -> `published_document` e incrementa a
// versão. Editar o rascunho depois não afeta a versão publicada (ADR-004 §2.5).
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const isPlaceholder = isPlaceholderEnv();

    if (!isPlaceholder) {
      const ctx = await getDbContext();
      if (!ctx) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

      const { data: current, error: readErr } = await ctx.db
        .from('bots')
        .select('document, published_version')
        .eq('organization_id', ctx.organizationId)
        .eq('id', id)
        .maybeSingle();
      if (readErr) {
        return NextResponse.json(
          { success: false, error: 'Falha ao ler o fluxo', message: readErr.message },
          { status: 500 }
        );
      }
      if (!current) return NextResponse.json({ success: false, error: 'Fluxo não encontrado' }, { status: 404 });

      const newVersion = (current.published_version ?? 0) + 1;
      const { error: updErr } = await ctx.db
        .from('bots')
        .update({
          published_document: current.document,
          published_version: newVersion,
          status: 'active',
        })
        .eq('organization_id', ctx.organizationId)
        .eq('id', id);
      if (updErr) {
        return NextResponse.json(
          { success: false, error: 'Falha ao publicar', message: updErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        botId: id,
        publishedVersion: newVersion,
        publishedAt: new Date().toISOString(),
        message: `Versão ${newVersion} publicada com sucesso.`,
      });
    }

    // Fallback dev/sem banco
    if (!getBotRecord(id)) {
      return NextResponse.json({ success: false, error: 'Fluxo não encontrado' }, { status: 404 });
    }
    const rec = publishBotRecord(id)!;
    return NextResponse.json({
      success: true,
      simulated: true,
      botId: id,
      publishedVersion: rec.publishedVersion,
      publishedAt: rec.updatedAt,
      message: `Versão ${rec.publishedVersion} publicada (modo protótipo).`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao publicar versão do bot' },
      { status: 500 }
    );
  }
}
