import { NextResponse } from 'next/server';
import React from 'react';
// @react-pdf/renderer usa "export =" (CommonJS): named import resolve para o
// tipo errado. Import default + desestruturação.
import * as ReactPDF from '@react-pdf/renderer';
const { renderToBuffer } = ReactPDF;
import { getPesquisaSessions, getPesquisaStats, aplicarRecorteFunil } from '@/lib/pesquisaSenadoStore';
import RelatorioPesquisaPdf from '@/lib/pdf/RelatorioPesquisaPdf';

export const dynamic = 'force-dynamic';
// Renderizar o PDF (varias secoes, texto por candidato) pode passar 1-2s em
// listas maiores; o padrao da Vercel cortaria a funcao antes de terminar.
export const maxDuration = 30;

// GET /api/pesquisa/senado/relatorio-pdf — baixa o relatorio em PDF com os
// mesmos numeros que o painel mostra (mesmo recorte do funil e mesmas stats).
export async function GET() {
  try {
    const sessions = await aplicarRecorteFunil(await getPesquisaSessions());
    const stats = await getPesquisaStats(sessions);

    const buffer = await renderToBuffer(
      React.createElement(RelatorioPesquisaPdf, { stats, geradoEm: new Date() })
    );

    const dataArquivo = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="pesquisa_senado_ms_${dataArquivo}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[API Relatório PDF Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao gerar o relatório em PDF' },
      { status: 500 }
    );
  }
}
