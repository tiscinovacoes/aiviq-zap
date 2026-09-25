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
export const LISTA_VERSAO_ATUAL = 3;

export const CANDIDATOS_SENADO_MS: CandidatoSenado[] = [
  { id: 10, opcao: 1, nome: 'Vander Loubet', partido: 'PT', rotulo: 'Vander Loubet (PT)', emoji: '1️⃣', aliases: ['vander', 'loubet'] },
  { id: 2, opcao: 2, nome: 'Capitão Contar', partido: 'PL', rotulo: 'Capitão Contar (PL)', emoji: '2️⃣' },
  { id: 5, opcao: 3, nome: 'Reinaldo Azambuja', partido: 'PL', rotulo: 'Reinaldo Azambuja (PL)', emoji: '3️⃣', aliases: ['azambuja', 'reinaldo'] },
  { id: 6, opcao: 4, nome: 'Roberto Oshiro', partido: 'NOVO', rotulo: 'Roberto Oshiro (NOVO)', emoji: '4️⃣', aliases: ['oshiro'] },
  { id: 7, opcao: 5, nome: 'Soraya', partido: 'PSB', rotulo: 'Soraya (PSB)', emoji: '5️⃣', aliases: ['soraya thronicke', 'thronicke'] },
  { id: 11, opcao: 6, nome: 'Branco/nulo', rotulo: 'Branco/nulo', emoji: '6️⃣', isEspecial: true, aliases: ['branco', 'nulo'] },
  { id: 12, opcao: 7, nome: 'Não sabe/não respondeu', rotulo: 'Não sabe/não respondeu', emoji: '7️⃣', isEspecial: true, aliases: ['nao sabe', 'não sei', 'nao sei'] },
];

// ------------------------------------------------------------------------------
// LISTA v2 (23 a 25/09/2026): os mesmos 5 candidatos em ordem alfabética.
// Mantida só para ler a resposta de quem recebeu essa ordem e ainda não votou.
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
// LISTA ANTIGA (v1, até 23/09/2026): 12 opções, o número digitado era o próprio
// id. Mantida só para ler a resposta de quem recebeu essa lista e ainda não
// votou, e para exibir votos já gravados em candidatos que saíram.
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
  | 'disparado' // Msg 1 enviada, aguardando qualquer resposta
  | 'aguardando_voto1' // Msg 2 e 3 enviadas, aguardando voto 1 (1-7)
  | 'aguardando_voto2' // Msg 4 enviada (lista filtrada), aguardando voto 2
  | 'concluido' // Msg 5 enviada, pesquisa finalizada
  | 'recusado'; // Usuário recusou participar

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
  /** Versão da lista de candidatos que o eleitor recebeu (1 = antiga de 12, 2 = atual). */
  listaVersao?: number;
  /** 1ª resposta do eleitor à saudação (abre a espera de 30s antes da Msg 2/3). */
  saudacaoRespondidaEm?: string;
  /** Quando a Msg 2/3 saiu. Nulo com saudacaoRespondidaEm preenchido = ainda esperando. */
  msg3EnviadaEm?: string;
  lastMessageAt: string;
  createdAt: string;
}

// ------------------------------------------------------------------------------
// Helpers de Horário e Período (Fuso de Campo Grande / MS - UTC-4)
// ------------------------------------------------------------------------------
export function getSaudacaoPeriodo(data: Date = new Date()): { saudacao: string; despedida: string } {
  // Ajuste para fuso de MS (-04:00)
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

  // Se for placeholder genérico como "Eleitor", "Eleitor 1234", "WhatsApp", "Contato", ou apenas números
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
// Geradores de Mensagens do Fluxo Oficial
//
// Anti-ban: o texto ao redor é variado por spintax `{a|b|c}` e SEMEADO pelo
// telefone (`seed`) — cada eleitor recebe uma redação equivalente e estável
// (mesma em retry), evitando a abertura byte-a-byte idêntica que dispara o
// detector de spam do WhatsApp. A LISTA de candidatos é sempre idêntica
// (integridade da pesquisa).
// ------------------------------------------------------------------------------

// Mensagem 1: Saudação inicial com nome e período
export function gerarMensagem1(nome?: string, seed?: string): string {
  const pNome = extrairPrimeiroNome(nome);
  const { saudacao } = getSaudacaoPeriodo();
  const alvo = pNome ? `{Olá|Oi|Olá,|Oi,} ${pNome}` : `{Olá|Oi|Olá!|Oi!}`;
  return spin(`${alvo}, ${saudacao}{!|,}\n{tudo bem|como vai|espero que esteja bem|tudo certo}?`, seed);
}

// Mensagem 2: Contextualização da pesquisa + saída de descadastro.
//
// O rodapé de opt-out fica AQUI, e não na Msg 1: a saudação é curta e casual
// ("Olá Alfredo, boa tarde, tudo bem?") e um aviso de descadastro nela faria a
// abertura parecer disparo em massa — o oposto do que se quer. Esta é a
// mensagem em que a pesquisa se apresenta, então é onde a saída pertence.
// Exigência de LGPD e, na prática, anti-ban: quem tem como pedir para sair não
// precisa usar o botão de denunciar, que é o que derruba chip.
export function gerarMensagem2(seed?: string): string {
  const corpo = spin(
    `{Estou fazendo|Estou realizando} uma pesquisa {de opinião|rápida de opinião|de opinião pública} sobre a eleição para o Senado {Federal |}em Mato Grosso do Sul.`,
    seed
  );
  const saida = spin(
    `{Se preferir não participar, responda SAIR|Caso não queira receber, é só responder SAIR|Para não receber mais, responda SAIR}.`,
    seed
  );
  return `${corpo}\n\n${saida}`;
}

// Mensagem 3: Opções do 1º voto
export function gerarMensagem3(seed?: string): string {
  const lista = CANDIDATOS_SENADO_MS.map((c) => `${c.emoji} ${c.rotulo}`).join('\n');
  const intro = spin(
    `{Pensando no seu primeiro voto|Considerando seu primeiro voto|No seu primeiro voto}, em qual destes candidatos você votaria?`,
    seed
  );
  const closing = spin(
    `{Digite apenas o número da opção escolhida.|Responda apenas com o número da opção.|Basta digitar o número correspondente à sua escolha.}`,
    seed
  );
  return `${intro}\n\n${lista}\n\n${closing}`;
}

// Mensagem 4: Opções do 2º voto (com exclusão dinâmica do 1º voto)
export function gerarMensagem4(voto1Id: number, seed?: string): string {
  // Exclui do 2º voto o candidato escolhido no 1º. Os números continuam os
  // mesmos da lista do 1º voto, para o eleitor não se confundir.
  const opcoesFiltradas = CANDIDATOS_SENADO_MS.filter((c) => {
    if (c.isEspecial) return true; // Branco/Nulo ou Não Sabe pode ser votado de novo
    return c.id !== voto1Id;
  });

  const lista = opcoesFiltradas.map((c) => `${c.emoji} ${c.rotulo}`).join('\n');
  const intro = spin(
    `{Agora, considerando seu segundo voto|E no seu segundo voto|Agora, pensando no segundo voto}, em qual destes candidatos você votaria?`,
    seed
  );
  return `${intro}\n\n${lista}\n\nDigite apenas o número da opção escolhida.\n\nO segundo voto deve ser diferente do primeiro.`;
}

// Mensagem 5: Agradecimento final
export function gerarMensagem5(seed?: string): string {
  const { despedida } = getSaudacaoPeriodo();
  return spin(
    `{Obrigado|Muito obrigado|Agradecemos} por participar da pesquisa! 🙏\n\nSua resposta foi registrada. {Sua opinião é importante|Sua participação é muito importante|Contamos com a sua opinião} para o levantamento sobre a eleição para o Senado em Mato Grosso do Sul.\n\n${despedida}`,
    seed
  );
}

// ------------------------------------------------------------------------------
// Validação de Resposta do Eleitor
// ------------------------------------------------------------------------------
const normalizar = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Toda numeração que já existiu, por versão: 1 = lista antiga de 12 (o número
// digitado era o próprio id); 2 = lista de 5 em ordem alfabética; 3 = atual
// (Vander em 1º). Cada mudança de ORDEM na lista precisa de uma versão nova
// aqui -- reaproveitar a mesma versão faria quem já recebeu a mensagem antiga
// e ainda não votou ter a resposta lida com a numeração errada.
const LISTAS_POR_VERSAO: Record<number, CandidatoSenado[]> = {
  1: CANDIDATOS_LISTA_V1,
  2: CANDIDATOS_LISTA_V2,
  3: CANDIDATOS_SENADO_MS,
};

/**
 * Lê a resposta do eleitor e devolve o `id` do candidato (ou null).
 * `listaVersao` diz qual numeração ele recebeu (ver LISTAS_POR_VERSAO).
 */
export function parseOpcaoVoto(respostaTexto: string, listaVersao: number = LISTA_VERSAO_ATUAL): number | null {
  const lista = LISTAS_POR_VERSAO[listaVersao] || CANDIDATOS_SENADO_MS;
  // Pega só o PRIMEIRO número da resposta -- "2 e 3" ou "2, 3" não pode virar
  // "23" (concatenando os dois), que nunca bate com nenhuma opção (1-7) e
  // descarta o voto em silêncio. O eleitor só pode escolher um candidato por
  // vez aqui, entao a primeira escolha e a que vale.
  const clean = respostaTexto.trim().match(/\d+/)?.[0] || '';
  if (!clean) {
    // Tenta correspondência textual por nome (e grafias alternativas).
    const lower = normalizar(respostaTexto);
    const achado = lista.find((c) =>
      [c.nome, ...(c.aliases || [])].some((n) => lower.includes(normalizar(n)))
    );
    return achado ? achado.id : null;
  }
  const num = parseInt(clean, 10);
  if (listaVersao === 1) return num >= 1 && num <= 12 ? num : null;
  return lista.find((c) => c.opcao === num)?.id ?? null;
}

/** Maior número válido na lista (para a mensagem de "não entendi"). */
export function ultimaOpcao(listaVersao: number = LISTA_VERSAO_ATUAL): number {
  return listaVersao === 1 ? 12 : (LISTAS_POR_VERSAO[listaVersao] || CANDIDATOS_SENADO_MS).length;
}

export const gerarMensagemSegundoVoto = gerarMensagem4;
export const gerarMensagemAgradecimento = gerarMensagem5;
export const validarVoto = parseOpcaoVoto;

export function obterCandidatoPorId(id: number): CandidatoSenado | undefined {
  return CANDIDATOS_SENADO_MS.find((c) => c.id === id) || CANDIDATOS_LISTA_V1.find((c) => c.id === id);
}

