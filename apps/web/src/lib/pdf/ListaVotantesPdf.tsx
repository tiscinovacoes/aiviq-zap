// ==============================================================================
// Lista de Eleitores por Voto (Senado MS) -- PDF
//
// Diferente do RelatorioPesquisaPdf (só números agregados), este lista os
// eleitores UM A UM, agrupados pelo candidato do 1º voto -- útil para quem
// precisa saber QUEM votou em quem, não só quanto cada um teve.
// ==============================================================================
import React from 'react';
import * as ReactPDF from '@react-pdf/renderer';
import type { ComponentType, PropsWithChildren } from 'react';
const Document = ReactPDF.Document as unknown as ComponentType<PropsWithChildren<any>>;
const Page = ReactPDF.Page as unknown as ComponentType<PropsWithChildren<any>>;
const Text = ReactPDF.Text as unknown as ComponentType<PropsWithChildren<any>>;
const View = ReactPDF.View as unknown as ComponentType<PropsWithChildren<any>>;
const { StyleSheet } = ReactPDF;
import type { RespostaEleitor } from '@/lib/pesquisaSenado';
import { candidatosParaExibir } from '@/lib/pesquisaSenado';

const CORES = {
  texto: '#1e293b',
  textoClaro: '#64748b',
  linha: '#e2e8f0',
  fundoClaro: '#f8fafc',
  verde: '#059669',
  verdeClaro: '#ecfdf5',
};

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, color: CORES.texto, fontFamily: 'Helvetica' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: CORES.verde,
    paddingBottom: 14,
    marginBottom: 16,
  },
  titulo: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: CORES.texto },
  subtitulo: { fontSize: 9.5, color: CORES.textoClaro, marginTop: 3 },
  geradoEm: { fontSize: 8, color: CORES.textoClaro, textAlign: 'right' },
  grupoTitulo: {
    fontSize: 11.5,
    fontFamily: 'Helvetica-Bold',
    color: CORES.texto,
    backgroundColor: CORES.verdeClaro,
    padding: 6,
    borderRadius: 4,
    marginTop: 14,
    marginBottom: 6,
  },
  tabelaHeader: {
    flexDirection: 'row',
    backgroundColor: CORES.fundoClaro,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 3,
  },
  tabelaHeaderTexto: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: CORES.textoClaro },
  linha: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: CORES.linha,
  },
  celTexto: { fontSize: 9 },
  vazio: { fontSize: 9, color: CORES.textoClaro, fontStyle: 'italic', paddingHorizontal: 6, paddingVertical: 4 },
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

function formatarTelefone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
  return phone;
}

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

function Grupo({ titulo, eleitores }: { titulo: string; eleitores: RespostaEleitor[] }) {
  return (
    <View wrap={false}>
      <Text style={styles.grupoTitulo}>
        {titulo} — {eleitores.length} {eleitores.length === 1 ? 'eleitor' : 'eleitores'}
      </Text>
      {eleitores.length === 0 ? (
        <Text style={styles.vazio}>Nenhum eleitor nesta opção.</Text>
      ) : (
        <View>
          <View style={styles.tabelaHeader}>
            <Text style={[styles.tabelaHeaderTexto, { flex: 3 }]}>NOME</Text>
            <Text style={[styles.tabelaHeaderTexto, { flex: 2 }]}>TELEFONE</Text>
            <Text style={[styles.tabelaHeaderTexto, { flex: 2 }]}>BAIRRO</Text>
            <Text style={[styles.tabelaHeaderTexto, { flex: 3 }]}>2º VOTO</Text>
          </View>
          {eleitores.map((e) => (
            <View key={e.id} style={styles.linha}>
              <Text style={[styles.celTexto, { flex: 3 }]}>{e.name}</Text>
              <Text style={[styles.celTexto, { flex: 2 }]}>{formatarTelefone(e.phone)}</Text>
              <Text style={[styles.celTexto, { flex: 2 }]}>{e.bairro || '—'}</Text>
              <Text style={[styles.celTexto, { flex: 3 }]}>{e.voto2Nome || '—'}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export interface ListaVotantesPdfProps {
  /** Só entram aqui pesquisas concluídas (1º e 2º votos computados). */
  eleitores: RespostaEleitor[];
  geradoEm?: Date;
}

export default function ListaVotantesPdf({ eleitores, geradoEm = new Date() }: ListaVotantesPdfProps) {
  const porVoto1: Record<number, RespostaEleitor[]> = {};
  for (const e of eleitores) {
    if (!e.voto1Id) continue;
    (porVoto1[e.voto1Id] ||= []).push(e);
  }
  const candidatos = candidatosParaExibir(
    Object.fromEntries(Object.entries(porVoto1).map(([id, list]) => [id, list.length]))
  );

  return (
    <Document title="Lista de Eleitores por Voto - Senado MS" author="AIVIQ">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.titulo}>Lista de Eleitores por Voto — Senado MS</Text>
            <Text style={styles.subtitulo}>Agrupado pelo 1º voto de cada eleitor</Text>
          </View>
          <Text style={styles.geradoEm}>Gerado em{'\n'}{formatarDataHora(geradoEm)}</Text>
        </View>

        {candidatos.map((c) => (
          <Grupo key={c.id} titulo={c.rotulo} eleitores={(porVoto1[c.id] || []).sort((a, b) => a.name.localeCompare(b.name))} />
        ))}

        <View style={styles.footer} fixed>
          <Text style={styles.footerTexto}>AIVIQ — Pesquisa Eleitoral Senado MS · {eleitores.length} eleitores no total</Text>
          <Text
            style={styles.footerTexto}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
