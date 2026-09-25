import { NextResponse } from 'next/server';
import React from 'react';
// @react-pdf/renderer usa "export =" (CommonJS): named import resolve para o
// tipo errado. Import default + desestruturação.
import * as ReactPDF from '@react-pdf/renderer';
const { renderToBuffer } = ReactPDF;
import { getPesquisaSessions, aplicarRecorteFunil } from '@/lib/pesquisaSenadoStore';
import ListaVotantesPdf from '@/lib/pdf/ListaVotantesPdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/pesquisa/senado/lista-votantes-pdf — baixa a lista de eleitores
// (nome, telefone, bairro) agrupada pelo 1º voto de cada um. Só entram
// pesquisas concluídas (1º e 2º votos computados) -- quem ainda não votou
// não tem candidato pra agrupar.
export async function GET() {
  try {
    const sessions = await aplicarRecorteFunil(await getPesquisaSessions());
    const eleitores = sessions.filter((s) => s.etapa === 'concluido');

    const buffer = await renderToBuffer(
      React.createElement(ListaVotantesPdf, { eleitores, geradoEm: new Date() })
    );

    const dataArquivo = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="eleitores_por_voto_senado_ms_${dataArquivo}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[API Lista Votantes PDF Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao gerar a lista de eleitores em PDF' },
      { status: 500 }
    );
  }
}
