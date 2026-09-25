// ==============================================================================
// Relatório em PDF da Pesquisa Eleitoral (Senado MS)
//
// Renderizado com @react-pdf/renderer -- gera o PDF direto em componentes,
// sem depender de um browser headless (puppeteer/chromium), o que é mais leve
// e mais previsível rodando em função serverless (Vercel).
// ==============================================================================
import React from 'react';
// @react-pdf/renderer declara Document/Page/View/Text como subclasses de
// React.Component, mas o TS as compara contra uma instanciação diferente de
// Component<any,any,any> e recusa como elemento JSX (erro "X cannot be used
// as a JSX component" em toda a arvore). E um problema de tipagem do pacote,
// nao do uso -- em runtime os componentes funcionam normalmente. Cast para o
// tipo de componente React generico resolve sem perder a checagem de props
// (StyleSheet.create, por exemplo, continua tipado).
import * as ReactPDF from '@react-pdf/renderer';
import type { ComponentType, PropsWithChildren } from 'react';
const Document = ReactPDF.Document as unknown as ComponentType<PropsWithChildren<any>>;
const Page = ReactPDF.Page as unknown as ComponentType<PropsWithChildren<any>>;
const Text = ReactPDF.Text as unknown as ComponentType<PropsWithChildren<any>>;
const View = ReactPDF.View as unknown as ComponentType<PropsWithChildren<any>>;
const { StyleSheet } = ReactPDF;
import type { PesquisaStats } from '@/lib/pesquisaSenadoStore';

const CORES = {
  texto: '#1e293b',
  textoClaro: '#64748b',
  linha: '#e2e8f0',
  fundoClaro: '#f8fafc',
  verde: '#059669',
  verdeClaro: '#ecfdf5',
  azul: '#2563eb',
  ambar: '#d97706',
  roxo: '#7c3aed',
  barraFundo: '#e2e8f0',
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    color: CORES.texto,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: CORES.verde,
    paddingBottom: 14,
    marginBottom: 18,
  },
  titulo: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: CORES.texto },
  subtitulo: { fontSize: 10, color: CORES.textoClaro, marginTop: 3 },
  geradoEm: { fontSize: 8, color: CORES.textoClaro, textAlign: 'right' },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  kpiCard: {
    flex: 1,
    backgroundColor: CORES.fundoClaro,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: CORES.linha,
  },
  kpiLabel: { fontSize: 8, color: CORES.textoClaro, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  kpiValor: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  secaoTitulo: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: CORES.texto,
    marginTop: 8,
    marginBottom: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: CORES.linha,
  },
  linhaRanking: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  posicao: {
    width: 16,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: CORES.textoClaro,
  },
  nomeCandidato: { width: 150, fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  barraContainer: {
    flex: 1,
    height: 10,
    backgroundColor: CORES.barraFundo,
    borderRadius: 5,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  barraPreenchida: {
    height: '100%',
    borderRadius: 5,
  },
  votosTexto: { width: 78, fontSize: 8.5, color: CORES.textoClaro, textAlign: 'right' },
  duasColunas: { flexDirection: 'row', gap: 24 },
  coluna: { flex: 1 },
  tabela: { marginTop: 4 },
  tabelaHeader: {
    flexDirection: 'row',
    backgroundColor: CORES.fundoClaro,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  tabelaHeaderTexto: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: CORES.textoClaro },
  tabelaLinha: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: CORES.linha,
  },
  tabelaTexto: { fontSize: 9 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: CORES.linha,
    paddingTop: 6,
  },
  footerTexto: { fontSize: 7.5, color: CORES.textoClaro },
});

function formatarDataHora(d: Date): string {
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Campo_Grande',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Barra horizontal proporcional ao percentual (0-100), sem depender de gráfico externo. */
function Barra({ percentual, cor }: { percentual: number; cor: string }) {
  return (
    <View style={styles.barraContainer}>
      <View style={[styles.barraPreenchida, { width: `${Math.min(100, Math.max(0, percentual))}%`, backgroundColor: cor }]} />
    </View>
  );
}

function RankingLista({
  titulo,
  itens,
  cor,
}: {
  titulo: string;
  itens: Array<{ nome: string; rotulo: string; votos: number; percentual: string }>;
  cor: string;
}) {
  return (
    <View>
      <Text style={{ fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginBottom: 8 }}>{titulo}</Text>
      {itens.length === 0 ? (
        <Text style={{ fontSize: 9, color: CORES.textoClaro }}>Sem votos registrados.</Text>
      ) : (
        itens.map((c, idx) => {
          const pct = parseFloat(c.percentual.replace('%', '').replace(',', '.')) || 0;
          return (
            <View key={idx} style={styles.linhaRanking}>
              <Text style={styles.posicao}>{idx + 1}º</Text>
              <Text style={styles.nomeCandidato}>{c.rotulo}</Text>
              <Barra percentual={pct} cor={cor} />
              <Text style={styles.votosTexto}>{c.votos} ({c.percentual})</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

export interface RelatorioPesquisaPdfProps {
  stats: PesquisaStats;
  geradoEm?: Date;
}

export default function RelatorioPesquisaPdf({ stats, geradoEm = new Date() }: RelatorioPesquisaPdfProps) {
  const emAndamento =
    (stats.porEtapa.disparado || 0) + (stats.porEtapa.aguardando_voto1 || 0) + (stats.porEtapa.aguardando_voto2 || 0);

  const rankingGeralOrdenado = [...stats.rankingGeral].sort((a, b) => b.totalVotos - a.totalVotos);

  return (
    <Document title="Pesquisa Eleitoral - Senado MS" author="AIVIQ">
      <Page size="A4" style={styles.page}>
        {/* Cabeçalho */}
        <View style={styles.header}>
          <View>
            <Text style={styles.titulo}>Pesquisa Eleitoral — Senado Federal / MS</Text>
            <Text style={styles.subtitulo}>Relatório consolidado de resultados</Text>
          </View>
          <Text style={styles.geradoEm}>Gerado em{'\n'}{formatarDataHora(geradoEm)}</Text>
        </View>

        {/* KPIs */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TOTAL DISPARADO</Text>
            <Text style={[styles.kpiValor, { color: CORES.texto }]}>{stats.totalEleitores}</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: CORES.verdeClaro, borderColor: '#a7f3d0' }]}>
            <Text style={[styles.kpiLabel, { color: CORES.verde }]}>CONCLUÍDAS</Text>
            <Text style={[styles.kpiValor, { color: CORES.verde }]}>{stats.totalConcluidos}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiLabel, { color: CORES.azul }]}>TAXA DE CONVERSÃO</Text>
            <Text style={[styles.kpiValor, { color: CORES.azul }]}>{stats.taxaConclusao}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiLabel, { color: CORES.ambar }]}>EM ANDAMENTO</Text>
            <Text style={[styles.kpiValor, { color: CORES.ambar }]}>{emAndamento}</Text>
          </View>
        </View>

        {/* Resultado consolidado */}
        <Text style={styles.secaoTitulo}>Resultado Consolidado (1º + 2º voto)</Text>
        <RankingLista
          titulo=""
          itens={rankingGeralOrdenado.map((c) => ({ nome: c.nome, rotulo: c.rotulo, votos: c.totalVotos, percentual: c.percentual }))}
          cor={CORES.verde}
        />

        {/* 1º e 2º voto lado a lado */}
        <Text style={styles.secaoTitulo}>Votos por Opção</Text>
        <View style={styles.duasColunas}>
          <View style={styles.coluna}>
            <RankingLista titulo="1º Voto" itens={[...stats.rankingVoto1].sort((a, b) => b.votos - a.votos)} cor={CORES.azul} />
          </View>
          <View style={styles.coluna}>
            <RankingLista titulo="2º Voto" itens={[...stats.rankingVoto2].sort((a, b) => b.votos - a.votos)} cor={CORES.roxo} />
          </View>
        </View>

        {/* Funil de coleta */}
        <Text style={styles.secaoTitulo}>Funil de Coleta</Text>
        <View style={styles.tabela}>
          <View style={styles.tabelaHeader}>
            <Text style={[styles.tabelaHeaderTexto, { flex: 2 }]}>ETAPA</Text>
            <Text style={[styles.tabelaHeaderTexto, { flex: 1, textAlign: 'right' }]}>CONTATOS</Text>
          </View>
          {[
            { label: '1. Disparado (aguardando resposta à saudação)', valor: stats.porEtapa.disparado },
            { label: '2. Aguardando 1º voto', valor: stats.porEtapa.aguardando_voto1 },
            { label: '3. Aguardando 2º voto', valor: stats.porEtapa.aguardando_voto2 },
            { label: '4. Concluído', valor: stats.porEtapa.concluido },
            { label: 'Recusado / opt-out', valor: stats.porEtapa.recusado },
          ].map((row, idx) => (
            <View key={idx} style={styles.tabelaLinha}>
              <Text style={[styles.tabelaTexto, { flex: 2 }]}>{row.label}</Text>
              <Text style={[styles.tabelaTexto, { flex: 1, textAlign: 'right' }]}>{row.valor || 0}</Text>
            </View>
          ))}
        </View>

        {/* Rodapé */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerTexto}>AIVIQ — Pesquisa Eleitoral Senado MS</Text>
          <Text
            style={styles.footerTexto}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
