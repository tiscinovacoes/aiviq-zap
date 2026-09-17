// ==============================================================================
// Módulo Oficial: Pesquisa Eleitoral para o Senado Federal em Mato Grosso do Sul
// ==============================================================================
import { spin } from '@/lib/spintax';

export interface CandidatoSenado {
  id: number;
  nome: string;
  numero?: string;
  rotulo: string;
  emoji: string;
  isEspecial?: boolean;
}

export const CANDIDATOS_SENADO_MS: CandidatoSenado[] = [
  { id: 1, nome: 'Beto do Movimento', numero: '500', rotulo: 'Beto do Movimento — 500', emoji: '1️⃣' },
  { id: 2, nome: 'Capitão Contar', numero: '221', rotulo: 'Capitão Contar — 221', emoji: '2️⃣' },
  { id: 3, nome: 'Daniel Junior', numero: '365', rotulo: 'Daniel Junior — 365', emoji: '3️⃣' },
  { id: 4, nome: 'Luiz Lemes', numero: '277', rotulo: 'Luiz Lemes — 277', emoji: '4️⃣' },
  { id: 5, nome: 'Reinaldo Azambuja', numero: '222', rotulo: 'Reinaldo Azambuja — 222', emoji: '5️⃣' },
  { id: 6, nome: 'Roberto Oshiro', numero: '300', rotulo: 'Roberto Oshiro — 300', emoji: '6️⃣' },
  { id: 7, nome: 'Soraya Thronicke', numero: '400', rotulo: 'Soraya Thronicke — 400', emoji: '7️⃣' },
  { id: 8, nome: 'Valderi Garcia', numero: '290', rotulo: 'Valderi Garcia — 290', emoji: '8️⃣' },
  { id: 9, nome: 'Valter da Comagran', numero: '258', rotulo: 'Valter da Comagran — 258', emoji: '9️⃣' },
  { id: 10, nome: 'Vander Loubet', numero: '133', rotulo: 'Vander Loubet — 133', emoji: '🔟' },
  { id: 11, nome: 'Branco/nulo', rotulo: 'Branco/nulo', emoji: '1️⃣1️⃣', isEspecial: true },
  { id: 12, nome: 'Não sabe/não respondeu', rotulo: 'Não sabe/não respondeu', emoji: '1️⃣2️⃣', isEspecial: true },
];

export type EtapaPesquisa =
  | 'disparado' // Msg 1 enviada, aguardando qualquer resposta
  | 'aguardando_voto1' // Msg 2 e 3 enviadas, aguardando voto 1 (1-12)
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

// Mensagem 2: Contextualização da pesquisa
export function gerarMensagem2(seed?: string): string {
  return spin(
    `{Estou realizando|Estamos fazendo|Faço parte de} uma pesquisa {de opinião|rápida de opinião|de opinião pública} sobre a eleição para o Senado {Federal |}em Mato Grosso do Sul.`,
    seed
  );
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
  // Se o eleitor votou em um candidato específico (1 a 10), exclui do 2º voto
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
export function parseOpcaoVoto(respostaTexto: string): number | null {
  const clean = respostaTexto.trim().replace(/[^\d]/g, '');
  if (!clean) {
    // Tenta correspondência textual por nome
    const lower = respostaTexto.toLowerCase().trim();
    const achado = CANDIDATOS_SENADO_MS.find(
      (c) =>
        lower.includes(c.nome.toLowerCase()) ||
        (c.numero && lower.includes(c.numero))
    );
    return achado ? achado.id : null;
  }
  const num = parseInt(clean, 10);
  if (num >= 1 && num <= 12) {
    return num;
  }
  return null;
}

export const gerarMensagemSegundoVoto = gerarMensagem4;
export const gerarMensagemAgradecimento = gerarMensagem5;
export const validarVoto = parseOpcaoVoto;

export function obterCandidatoPorId(id: number): CandidatoSenado | undefined {
  return CANDIDATOS_SENADO_MS.find((c) => c.id === id);
}

