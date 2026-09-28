// ==============================================================================
// Módulo Oficial: Pesquisa Eleitoral para o Senado Federal em Mato Grosso do Sul
// ==============================================================================
import { spin } from '@/lib/spintax';

export interface CandidatoSenado {
  /** Identificador ESTÁVEL gravado no banco (voto1_id/voto2_id). Nunca renumerar. */
  id: number;
  /** Número que o eleitor digita na lista ATUAL (1..7). Ausente = fora da lista. */
  opcao?: number;
  nome: string;
  partido?: string;
  rotulo: string;
  emoji: string;
  isEspecial?: boolean;
  /** Outras grafias aceitas quando o eleitor responde por texto. */
  aliases?: string[];
}

// ------------------------------------------------------------------------------
// LISTA ATUAL (v3, 25/09/2026): mesmos 5 candidatos, com Vander Loubet
// reordenado para a 1ª opção (decisão do operador). Os `id` continuam os
// MESMOS de sempre, para os votos já gravados continuarem apontando para o
// candidato certo; o que muda é só a `opcao`, o número exibido na mensagem.
// ------------------------------------------------------------------------------
// LISTA ATUAL (v4, 28/09/2026): Fluxo clicável com Soraya em 1ª opção
// ------------------------------------------------------------------------------
export const LISTA_VERSAO_ATUAL = 4;

export const CANDIDATOS_SENADO_MS: CandidatoSenado[] = [
  { id: 7, opcao: 1, nome: 'Soraya', partido: 'PSB', rotulo: 'Soraya (PSB)', emoji: '1️⃣', aliases: ['soraya thronicke', 'thronicke', 'soraya'] },
  { id: 10, opcao: 2, nome: 'Vander Loubet', partido: 'PT', rotulo: 'Vander Loubet (PT)', emoji: '2️⃣', aliases: ['vander', 'loubet'] },
  { id: 2, opcao: 3, nome: 'Capitão Contar', partido: 'PL', rotulo: 'Capitão Contar (PL)', emoji: '3️⃣', aliases: ['contar', 'capitao'] },
  { id: 5, opcao: 4, nome: 'Reinaldo Azambuja', partido: 'PL', rotulo: 'Reinaldo Azambuja (PL)', emoji: '4️⃣', aliases: ['azambuja', 'reinaldo'] },
  { id: 11, opcao: 5, nome: 'Branco/nulo', rotulo: 'Branco ou nulo', emoji: '5️⃣', isEspecial: true, aliases: ['branco', 'nulo'] },
];

// ------------------------------------------------------------------------------
// LISTA v3 (25 a 28/09/2026): Vander em 1º
// ------------------------------------------------------------------------------
export const CANDIDATOS_LISTA_V3: CandidatoSenado[] = [
  { id: 10, opcao: 1, nome: 'Vander Loubet', partido: 'PT', rotulo: 'Vander Loubet (PT)', emoji: '1️⃣', aliases: ['vander', 'loubet'] },
  { id: 2, opcao: 2, nome: 'Capitão Contar', partido: 'PL', rotulo: 'Capitão Contar (PL)', emoji: '2️⃣' },
  { id: 5, opcao: 3, nome: 'Reinaldo Azambuja', partido: 'PL', rotulo: 'Reinaldo Azambuja (PL)', emoji: '3️⃣', aliases: ['azambuja', 'reinaldo'] },
  { id: 6, opcao: 4, nome: 'Roberto Oshiro', partido: 'NOVO', rotulo: 'Roberto Oshiro (NOVO)', emoji: '4️⃣', aliases: ['oshiro'] },
  { id: 7, opcao: 5, nome: 'Soraya', partido: 'PSB', rotulo: 'Soraya (PSB)', emoji: '5️⃣', aliases: ['soraya thronicke', 'thronicke'] },
  { id: 11, opcao: 6, nome: 'Branco/nulo', rotulo: 'Branco/nulo', emoji: '6️⃣', isEspecial: true, aliases: ['branco', 'nulo'] },
  { id: 12, opcao: 7, nome: 'Não sabe/não respondeu', rotulo: 'Não sabe/não respondeu', emoji: '7️⃣', isEspecial: true, aliases: ['nao sabe', 'não sei', 'nao sei'] },
];

// ------------------------------------------------------------------------------
// LISTA v2 (23 a 25/09/2026): ordem alfabética
// ------------------------------------------------------------------------------
export const CANDIDATOS_LISTA_V2: CandidatoSenado[] = [
  { id: 2, opcao: 1, nome: 'Capitão Contar', rotulo: 'Capitão Contar (PL)', emoji: '1️⃣' },
  { id: 5, opcao: 2, nome: 'Reinaldo Azambuja', rotulo: 'Reinaldo Azambuja (PL)', emoji: '2️⃣', aliases: ['azambuja', 'reinaldo'] },
  { id: 6, opcao: 3, nome: 'Roberto Oshiro', rotulo: 'Roberto Oshiro (NOVO)', emoji: '3️⃣', aliases: ['oshiro'] },
  { id: 7, opcao: 4, nome: 'Soraya', rotulo: 'Soraya (PSB)', emoji: '4️⃣', aliases: ['soraya thronicke', 'thronicke'] },
  { id: 10, opcao: 5, nome: 'Vander Loubet', rotulo: 'Vander Loubet (PT)', emoji: '5️⃣', aliases: ['vander', 'loubet'] },
  { id: 11, opcao: 6, nome: 'Branco/nulo', rotulo: 'Branco/nulo', emoji: '6️⃣', isEspecial: true, aliases: ['branco', 'nulo'] },
  { id: 12, opcao: 7, nome: 'Não sabe/não respondeu', rotulo: 'Não sabe/não respondeu', emoji: '7️⃣', isEspecial: true, aliases: ['nao sabe', 'não sei', 'nao sei'] },
];

// ------------------------------------------------------------------------------
// LISTA ANTIGA (v1, até 23/09/2026): 12 opções
// ------------------------------------------------------------------------------
export const CANDIDATOS_LISTA_V1: CandidatoSenado[] = [
  { id: 1, nome: 'Beto do Movimento', rotulo: 'Beto do Movimento', emoji: '1️⃣' },
  { id: 2, nome: 'Capitão Contar', rotulo: 'Capitão Contar', emoji: '2️⃣' },
  { id: 3, nome: 'Daniel Junior', rotulo: 'Daniel Junior', emoji: '3️⃣' },
  { id: 4, nome: 'Luiz Lemes', rotulo: 'Luiz Lemes', emoji: '4️⃣' },
  { id: 5, nome: 'Reinaldo Azambuja', rotulo: 'Reinaldo Azambuja', emoji: '5️⃣' },
  { id: 6, nome: 'Roberto Oshiro', rotulo: 'Roberto Oshiro', emoji: '6️⃣' },
  { id: 7, nome: 'Soraya Thronicke', rotulo: 'Soraya Thronicke', emoji: '7️⃣' },
  { id: 8, nome: 'Valderi Garcia', rotulo: 'Valderi Garcia', emoji: '8️⃣' },
  { id: 9, nome: 'Valter da Comagran', rotulo: 'Valter da Comagran', emoji: '9️⃣' },
  { id: 10, nome: 'Vander Loubet', rotulo: 'Vander Loubet', emoji: '🔟' },
  { id: 11, nome: 'Branco/nulo', rotulo: 'Branco/nulo', emoji: '1️⃣1️⃣', isEspecial: true },
  { id: 12, nome: 'Não sabe/não respondeu', rotulo: 'Não sabe/não respondeu', emoji: '1️⃣2️⃣', isEspecial: true },
];

// ------------------------------------------------------------------------------
// LISTA CLIQUE (v4, 28/09/2026): reta final da campanha, teste de fluxo por
// CLIQUE (WhatsApp list message) em vez de resposta digitada. Só os 4
// candidatos do teste + branco/nulo (decisão do operador), na ordem pedida.
// Mesmos `id` estáveis de sempre -- só muda quem entra na lista, a ordem e a
// `opcao` (numeração própria desta lista, 1-5).
// ------------------------------------------------------------------------------
export const LISTA_VERSAO_CLIQUE = 4;

export const CANDIDATOS_CLIQUE: CandidatoSenado[] = [
  { id: 7, opcao: 1, nome: 'Soraya', partido: 'PSB', rotulo: 'Soraya (PSB)', emoji: '1️⃣', aliases: ['soraya thronicke', 'thronicke'] },
  { id: 10, opcao: 2, nome: 'Vander Loubet', partido: 'PT', rotulo: 'Vander Loubet (PT)', emoji: '2️⃣', aliases: ['vander', 'loubet'] },
  { id: 2, opcao: 3, nome: 'Capitão Contar', partido: 'PL', rotulo: 'Capitão Contar (PL)', emoji: '3️⃣' },
  { id: 5, opcao: 4, nome: 'Reinaldo Azambuja', partido: 'PL', rotulo: 'Reinaldo Azambuja (PL)', emoji: '4️⃣', aliases: ['azambuja', 'reinaldo'] },
  { id: 11, opcao: 5, nome: 'Branco/nulo', rotulo: 'Branco/nulo', emoji: '5️⃣', isEspecial: true, aliases: ['branco', 'nulo'] },
];

/** Candidatos que saíram da lista (só aparecem no painel se tiverem voto gravado). */
export const CANDIDATOS_FORA_DA_LISTA: CandidatoSenado[] = CANDIDATOS_LISTA_V1
  .filter((c) => !CANDIDATOS_SENADO_MS.some((a) => a.id === c.id))
  .map((c) => ({ ...c, emoji: '⏸️', rotulo: `${c.nome} (fora da lista)` }));

/** Lista para exibir no painel: a atual + quem saiu mas tem voto gravado. */
export function candidatosParaExibir(votosPorId: Record<number, number>): CandidatoSenado[] {
  return [
    ...CANDIDATOS_SENADO_MS,
    ...CANDIDATOS_FORA_DA_LISTA.filter((c) => (votosPorId[c.id] || 0) > 0),
  ];
}

export type EtapaPesquisa =
  | 'disparado' // Msg 1 enviada (com botões), aguardando clique/resposta
  | 'aguardando_voto1' // Msg 2 enviada (lista clicável), aguardando 1º voto
  | 'aguardando_voto2' // Msg 3 enviada (lista clicável filtrada), aguardando 2º voto
  | 'concluido' // Msg 4 enviada (obrigado), pesquisa finalizada
  | 'recusado'; // Usuário recusou participar ("Agora não")

export interface RespostaEleitor {
  id: string;
  phone: string;
  name: string;
  bairro?: string;
  etapa: EtapaPesquisa;
  voto1Id?: number;
  voto1Nome?: string;
  voto2Id?: number;
  voto2Nome?: string;
  instanceName?: string;
  listaVersao?: number;
  saudacaoRespondidaEm?: string;
  msg3EnviadaEm?: string;
  lastMessageAt: string;
  createdAt: string;
}

// ------------------------------------------------------------------------------
// Helpers de Horário e Período (Fuso de Campo Grande / MS - UTC-4)
// ------------------------------------------------------------------------------
export function getSaudacaoPeriodo(data: Date = new Date()): { saudacao: string; despedida: string } {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Campo_Grande',
    hour: 'numeric',
    hour12: false,
  });
  const hora = parseInt(formatter.format(data), 10);

  if (hora >= 5 && hora < 12) {
    return { saudacao: 'bom dia', despedida: 'Bom dia!' };
  } else if (hora >= 12 && hora < 18) {
    return { saudacao: 'boa tarde', despedida: 'Boa tarde!' };
  } else {
    return { saudacao: 'boa noite', despedida: 'Boa noite!' };
  }
}

export function extrairPrimeiroNome(nomeCompleto?: string): string {
  if (!nomeCompleto || !nomeCompleto.trim()) return '';
  const trimmed = nomeCompleto.trim();
  const lower = trimmed.toLowerCase();

  if (
    lower === 'eleitor' ||
    lower.startsWith('eleitor ') ||
    lower.startsWith('eleitor_') ||
    lower.startsWith('eleitor-') ||
    lower === 'contato' ||
    lower.startsWith('contato ') ||
    lower === 'whatsapp' ||
    lower.startsWith('whatsapp ') ||
    /^\+?\d+$/.test(trimmed.replace(/[\s\-\(\)\.]/g, ''))
  ) {
    return '';
  }

  const clean = trimmed.split(' ')[0];
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

// ------------------------------------------------------------------------------
// Geradores de Mensagens do Novo Fluxo Interativo por Clique
// ------------------------------------------------------------------------------

export interface Mensagem1Data {
  title: string;
  buttons: { id: string; text: string }[];
  fallbackText: string;
}

/**
 * Msg 1: Saudação + Convite direto com botões [ Sim, pode ] [ Agora não ]
 */
export function gerarMensagem1Data(seed?: string): Mensagem1Data {
  const title = `Oi! Tudo bem? Posso te fazer uma pesquisa rápida sobre a eleição pro Senado aqui em MS?`;
  return {
    title,
    buttons: [
      { id: 'SIM_PODE', text: 'Sim, pode' },
      { id: 'AGORA_NAO', text: 'Agora não' },
    ],
    fallbackText: `${title}\n\n1 - Sim, pode\n2 - Agora não`,
  };
}

export function gerarMensagem1(nome?: string, seed?: string): string {
  return gerarMensagem1Data(seed).fallbackText;
}

export const gerarMensagem1Clique = gerarMensagem1;

// Mensagem 2: Contextualização da pesquisa + saída de descadastro.
//
// O rodapé de opt-out fica AQUI, e não na Msg 1: a saudação é curta e casual
// ("Olá Alfredo, boa tarde, tudo bem?") e um aviso de descadastro nela faria a
// abertura parecer disparo em massa — o oposto do que se quer. Esta é a
// mensagem em que a pesquisa se apresenta, então é onde a saída pertence.
// Exigência de LGPD e, na prática, anti-ban: quem tem como pedir para sair não
export function gerarMensagem2(seed?: string): string {
  return `Pensando no seu primeiro voto, em qual desses você votaria?`;
}

export interface MensagemListaData {
  title: string;
  buttonText: string;
  rows: { id: string; title: string; description?: string }[];
  fallbackText: string;
}

/**
 * Msg 2: Lista clicável do 1º Voto
 */
export function gerarMensagemPrimeiroVotoData(seed?: string): MensagemListaData {
  const title = `Pensando no seu primeiro voto, em qual desses você votaria?`;
  const rows = CANDIDATOS_SENADO_MS.map((c) => ({
    id: `VOTO_${c.id}`,
    title: c.nome,
    description: c.partido ? `Partido ${c.partido}` : c.rotulo,
  }));
  const listaText = CANDIDATOS_SENADO_MS.map((c) => `${c.emoji} ${c.rotulo}`).join('\n');
  return {
    title,
    buttonText: 'Escolher opção',
    rows,
    fallbackText: `${title}\n\n${listaText}\n\nResponda apenas com o número ou nome da opção.`,
  };
}

export function gerarMensagem3(seed?: string): string {
  return gerarMensagemPrimeiroVotoData(seed).fallbackText;
}

/**
 * Msg 3: Lista clicável do 2º Voto (exclui a opção escolhida no 1º voto)
 */
export function gerarMensagemSegundoVotoData(voto1Id: number, seed?: string): MensagemListaData {
  const title = `E no seu segundo voto?`;
  const opcoesFiltradas = CANDIDATOS_SENADO_MS.filter((c) => {
    if (c.isEspecial) return true;
    return c.id !== voto1Id;
  });
  const rows = opcoesFiltradas.map((c) => ({
    id: `VOTO_${c.id}`,
    title: c.nome,
    description: c.partido ? `Partido ${c.partido}` : c.rotulo,
  }));
  const listaText = opcoesFiltradas.map((c) => `${c.emoji} ${c.rotulo}`).join('\n');
  return {
    title,
    buttonText: 'Escolher opção',
    rows,
    fallbackText: `${title}\n\n${listaText}\n\nResponda apenas com o número ou nome da opção.\n\nO segundo voto deve ser diferente do primeiro.`,
  };
}

export function gerarMensagem4(voto1Id: number, seed?: string): string {
  return gerarMensagemSegundoVotoData(voto1Id, seed).fallbackText;
}

/**
 * Msg 4: Agradecimento final
 */
export function gerarMensagem5(seed?: string): string {
  return `Obrigado por participar! 🙏`;
}

export function gerarMensagemAgradecimentoData(): string {
  return `Obrigado por participar! 🙏`;
}

// ------------------------------------------------------------------------------
// Listas CLICÁVEIS (WhatsApp list message) do fluxo por clique (teste, 28/09/2026)
//
// Mesma ideia da Msg 3/4 em texto, mas como estrutura para a Evolution montar
// um `message/sendList` -- o eleitor toca a opção em vez de digitar o número.
// `textoFallback` acompanha o payload só para o histórico da conversa (Inbox
// e Supabase) mostrarem algo legível; quem decide o que chega no WhatsApp é o
// `sections`, enviado pela Evolution.
// ------------------------------------------------------------------------------
export interface ListaPayload {
  title: string;
  description: string;
  footerText?: string;
  buttonText: string;
  sections: Array<{ title: string; rows: Array<{ title: string; description?: string; rowId: string }> }>;
  /** Representação em texto puro, só para persistir/exibir no histórico. */
  textoFallback: string;
}

function construirListaPayload(candidatos: CandidatoSenado[], descricao: string, tituloSecao: string): ListaPayload {
  return {
    title: 'Pesquisa Eleitoral MS',
    description: descricao,
    footerText: 'Pesquisa Eleitoral Senado MS 2026',
    buttonText: 'Ver opções',
    sections: [
      {
        title: tituloSecao,
        rows: candidatos.map((c) => ({ title: c.rotulo, rowId: `voto_${c.id}` })),
      },
    ],
    textoFallback: `${descricao}\n\n${candidatos.map((c) => `${c.emoji} ${c.rotulo}`).join('\n')}`,
  };
}

/** Lista clicável do 1º voto (candidatos da lista CLIQUE, v4). */
export function gerarListaVoto1Payload(seed?: string): ListaPayload {
  const descricao = spin(
    `{Pensando no seu primeiro voto|Considerando seu primeiro voto|No seu primeiro voto}, em qual destes candidatos você votaria?`,
    seed
  );
  return construirListaPayload(CANDIDATOS_CLIQUE, descricao, 'Primeiro voto');
}

/** Lista clicável do 2º voto (exclui o candidato já escolhido no 1º voto). */
export function gerarListaVoto2Payload(voto1Id: number, seed?: string): ListaPayload {
  const opcoesFiltradas = CANDIDATOS_CLIQUE.filter((c) => c.isEspecial || c.id !== voto1Id);
  const descricao = spin(
    `{Agora, considerando seu segundo voto|E no seu segundo voto|Agora, pensando no segundo voto}, em qual destes candidatos você votaria?`,
    seed
  );
  return construirListaPayload(opcoesFiltradas, descricao, 'Segundo voto');
}

/** Lê o `rowId` (formato `voto_<id>`) devolvido pelo clique do eleitor na lista. */
export function parseListRowId(rowId?: string | null): number | null {
  if (!rowId) return null;
  const m = /^voto_(\d+)$/.exec(rowId.trim());
  return m ? parseInt(m[1], 10) : null;
}

// ------------------------------------------------------------------------------
// Validação de Resposta do Eleitor
// ------------------------------------------------------------------------------
// Faixa Unicode dos diacríticos combinantes (para strip de acento após NFD),
// de U+0300 a U+036F. Construída via fromCharCode em vez de escape literal no
// regex, que era decodificado para os caracteres reais ao transitar por este
// ambiente e quebrava a regex.
const DIACRITICOS_RE = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');
const normalizar = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(DIACRITICOS_RE, '').trim();

const LISTAS_POR_VERSAO: Record<number, CandidatoSenado[]> = {
  1: CANDIDATOS_LISTA_V1,
  2: CANDIDATOS_LISTA_V2,
  3: CANDIDATOS_LISTA_V3,
  4: CANDIDATOS_SENADO_MS,
};

/**
 * Lê a resposta do eleitor e devolve o `id` do candidato (ou null).
 * Suporta cliques no menu (VOTO_X) e respostas por texto/número.
 */
export function parseOpcaoVoto(respostaTexto: string, listaVersao: number = LISTA_VERSAO_ATUAL): number | null {
  const cleanStr = respostaTexto.trim();

  // 1. Clique em menu clicável: rowId = "VOTO_X"
  const matchVoto = cleanStr.match(/^VOTO_(\d+)$/i);
  if (matchVoto) {
    const idFromKey = parseInt(matchVoto[1], 10);
    if (!isNaN(idFromKey)) return idFromKey;
  }

  const lista = LISTAS_POR_VERSAO[listaVersao] || CANDIDATOS_SENADO_MS;

  // 2. Extrai número digitado
  const cleanNum = cleanStr.match(/\d+/)?.[0] || '';
  if (cleanNum) {
    const num = parseInt(cleanNum, 10);
    if (listaVersao === 1) return num >= 1 && num <= 12 ? num : null;
    return lista.find((c) => c.opcao === num || c.id === num)?.id ?? null;
  }

  // 3. Correspondência textual por nome ou aliases
  const lower = normalizar(respostaTexto);
  const achado = lista.find((c) =>
    [c.nome, ...(c.aliases || [])].some((n) => lower.includes(normalizar(n)))
  );
  return achado ? achado.id : null;
}

export function ultimaOpcao(listaVersao: number = LISTA_VERSAO_ATUAL): number {
  return listaVersao === 1 ? 12 : (LISTAS_POR_VERSAO[listaVersao] || CANDIDATOS_SENADO_MS).length;
}

export const gerarMensagemSegundoVoto = gerarMensagem4;
export const gerarMensagemAgradecimento = gerarMensagem5;
export const validarVoto = parseOpcaoVoto;

export function obterCandidatoPorId(id: number): CandidatoSenado | undefined {
  return CANDIDATOS_SENADO_MS.find((c) => c.id === id) || CANDIDATOS_LISTA_V1.find((c) => c.id === id);
}
