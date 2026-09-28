import { sendRealMessageDetailed, sendListMessageDetailed } from '@/lib/evolutionService';
import { persistMessageByJid } from '@/lib/conversationRepo';
import { addBotDispatchedMessage } from '@/lib/conversationStore';
import {
  gerarMensagem2,
  gerarMensagem3,
  gerarListaVoto1Payload,
  gerarListaVoto2Payload,
  LISTA_VERSAO_CLIQUE,
  type RespostaEleitor,
  type ListaPayload,
} from '@/lib/pesquisaSenado';
import {
  ESPERA_SAUDACAO_S,
  reivindicarEnvioMsg3,
  liberarEnvioMsg3,
  listarMsg3Atrasadas,
} from '@/lib/pesquisaSenadoStore';

// ===========================================================================
// ENVIO DA MSG 2/3 COM ESPERA
// O webhook marca a 1ª resposta e agenda este envio para ESPERA_SAUDACAO_S
// depois, em segundo plano (waitUntil da Vercel), respondendo à Evolution na
// hora. Se a função morrer antes, o tick reenvia (reenviarMsg3Atrasadas).
// ===========================================================================

/** Mantém a função viva após a resposta HTTP (Vercel). Fora da Vercel, só dispara. */
export function emSegundoPlano(p: Promise<unknown>): void {
  const seguro = p.catch((e) => console.error('[pesquisa] tarefa em segundo plano:', e));
  const ctx = (globalThis as any)[Symbol.for('@vercel/request-context')]?.get?.();
  if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(seguro);
}

async function enviar(to: string, name: string, text: string, instancia?: string): Promise<boolean> {
  const r = await sendRealMessageDetailed(to, text, instancia, 0);
  if (!r.ok) return false;
  const inst = r.instance || instancia;
  persistMessageByJid({
    phoneOrJid: to,
    senderType: 'agent',
    content: text,
    name,
    externalId: r.messageId,
    instanceName: inst,
  }).catch((e) => console.error('[pesquisa] persist Msg 2/3:', e));
  try {
    addBotDispatchedMessage({ toPhone: to, name, text, instanceName: inst });
  } catch {}
  return true;
}

/**
 * Envia Msg 2 + Msg 3 uma única vez por sessão (reserva atômica). `para` é o
 * número de onde o eleitor escreveu (o webhook usa esse); sem ele, o da sessão.
 */
export async function enviarMsg2e3(session: RespostaEleitor, instancia?: string, para?: string): Promise<boolean> {
  if (!(await reivindicarEnvioMsg3(session.id))) return false; // outro processo já enviou
  const destino = para || session.phone;
  const seed = destino.replace(/\D/g, '');
  const ok2 = await enviar(destino, session.name, gerarMensagem2(seed), instancia);
  if (!ok2) {
    await liberarEnvioMsg3(session.id); // nada saiu: o tick tenta de novo
    return false;
  }
  await enviar(destino, session.name, gerarMensagem3(seed), instancia);
  console.log(`[Pesquisa Senado MS] Msg 2 e 3 enviadas para ${destino} via ${instancia || 'default'}`);
  return true;
}

/** Aguarda a espera da saudação e envia a Msg 2/3. */
export async function enviarMsg2e3AposEspera(session: RespostaEleitor, instancia?: string, para?: string): Promise<void> {
  await new Promise((r) => setTimeout(r, ESPERA_SAUDACAO_S * 1000));
  await enviarMsg2e3(session, instancia, para);
}

/**
 * Rede de segurança do tick: reenvia Msg 2/3 que ficaram para trás.
 * Pula sessões do fluxo por CLIQUE (listaVersao === LISTA_VERSAO_CLIQUE):
 * essas usam a mesma reserva atômica mas o próximo passo delas é a lista
 * clicável (reenviarListaVoto1Atrasadas), nunca a Msg 2/3 em texto.
 */
export async function reenviarMsg3Atrasadas(): Promise<number> {
  const atrasadas = await listarMsg3Atrasadas();
  let enviados = 0;
  for (const s of atrasadas) {
    if (s.listaVersao === LISTA_VERSAO_CLIQUE) continue;
    if (await enviarMsg2e3(s, s.instanceName)) enviados++;
  }
  return enviados;
}

// ===========================================================================
// FLUXO POR CLIQUE (teste, 28/09/2026) — mesma espera de 30s e mesma reserva
// atômica da Msg 2/3, mas o que sai no lugar é a LISTA clicável do 1º voto
// (a Msg 1 do fluxo por clique já funde saudação + contexto + pergunta, então
// não há Msg 2/3 em texto aqui). Restrito ao disparo avulso de teste.
// ===========================================================================

async function enviarLista(to: string, name: string, payload: ListaPayload, instancia?: string): Promise<boolean> {
  const r = await sendListMessageDetailed(to, payload, instancia);
  if (!r.ok) return false;
  const inst = r.instance || instancia;
  persistMessageByJid({
    phoneOrJid: to,
    senderType: 'agent',
    content: payload.textoFallback,
    name,
    externalId: r.messageId,
    instanceName: inst,
  }).catch((e) => console.error('[pesquisa] persist lista clicável:', e));
  try {
    addBotDispatchedMessage({ toPhone: to, name, text: payload.textoFallback, instanceName: inst });
  } catch {}
  return true;
}

/** Envia a lista clicável do 1º voto uma única vez por sessão (reserva atômica). */
export async function enviarListaVoto1(session: RespostaEleitor, instancia?: string, para?: string): Promise<boolean> {
  if (!(await reivindicarEnvioMsg3(session.id))) return false; // outro processo já enviou
  const destino = para || session.phone;
  const seed = destino.replace(/\D/g, '');
  const ok = await enviarLista(destino, session.name, gerarListaVoto1Payload(seed), instancia);
  if (!ok) {
    await liberarEnvioMsg3(session.id); // nada saiu: o tick tenta de novo
    return false;
  }
  console.log(`[Pesquisa Senado MS] (clique) Lista do 1º voto enviada para ${destino} via ${instancia || 'default'}`);
  return true;
}

/** Aguarda a espera da saudação e envia a lista clicável do 1º voto. */
export async function enviarListaVoto1AposEspera(session: RespostaEleitor, instancia?: string, para?: string): Promise<void> {
  await new Promise((r) => setTimeout(r, ESPERA_SAUDACAO_S * 1000));
  await enviarListaVoto1(session, instancia, para);
}

/** Envia a lista clicável do 2º voto (resposta imediata ao clique do 1º voto). */
export async function enviarListaVoto2(voto1Id: number, session: RespostaEleitor, instancia?: string, para?: string): Promise<boolean> {
  const destino = para || session.phone;
  const seed = destino.replace(/\D/g, '');
  return enviarLista(destino, session.name, gerarListaVoto2Payload(voto1Id, seed), instancia);
}

/** Rede de segurança do tick: reenvia lista de 1º voto que ficou para trás (fluxo por clique). */
export async function reenviarListaVoto1Atrasadas(): Promise<number> {
  const atrasadas = await listarMsg3Atrasadas();
  let enviados = 0;
  for (const s of atrasadas) {
    if (s.listaVersao === LISTA_VERSAO_CLIQUE && (await enviarListaVoto1(s, s.instanceName))) enviados++;
  }
  return enviados;
}
