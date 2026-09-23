import { sendRealMessageDetailed } from '@/lib/evolutionService';
import { persistMessageByJid } from '@/lib/conversationRepo';
import { addBotDispatchedMessage } from '@/lib/conversationStore';
import { gerarMensagem2, gerarMensagem3, type RespostaEleitor } from '@/lib/pesquisaSenado';
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

/** Rede de segurança do tick: reenvia Msg 2/3 que ficaram para trás. */
export async function reenviarMsg3Atrasadas(): Promise<number> {
  const atrasadas = await listarMsg3Atrasadas();
  let enviados = 0;
  for (const s of atrasadas) {
    if (await enviarMsg2e3(s, s.instanceName)) enviados++;
  }
  return enviados;
}
