import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { addInboundMessage, addBotDispatchedMessage } from '@/lib/conversationStore';
import { invalidateEvolutionCache, sendRealMessageDetailed } from '@/lib/evolutionService';
import { persistMessageByJid } from '@/lib/conversationRepo';
import { isOptOut } from '@/lib/spintax';
import { registrarOptOut, processarAckEntrega, setDispatchEnabled } from '@/lib/dispatchQueue';
import { ANTIBAN } from '@/lib/antiBan';
import {
  getPesquisaSessionByPhone,
  savePesquisaSession,
} from '@/lib/pesquisaSenadoStore';
import {
  gerarMensagem2,
  gerarMensagem3,
  gerarMensagemSegundoVoto,
  gerarMensagemAgradecimento,
  validarVoto,
  obterCandidatoPorId,
} from '@/lib/pesquisaSenado';
import { sincronizarContatoEleitor } from '@/lib/pesquisaContatoSync';

export const dynamic = 'force-dynamic';

const isProduction = process.env.NODE_ENV === 'production';
const VERIFY_TOKEN =
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
  (!isProduction ? 'aiviq_webhook_secret_token_2026' : undefined);
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;

// Comparação em tempo constante para segredos (evita timing attacks).
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// GET: Verificação de Webhook para a Meta Cloud API
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
    return new NextResponse(challenge || '', { status: 200 });
  }

  // Health check simples para a Evolution API
  return NextResponse.json({
    status: 'ok',
    message: 'AIVIQ-ZAP WhatsApp Webhook Receiver Active',
  });
}

// POST: Processamento unificado de mensagens (Evolution API + Meta Cloud API)
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-hub-signature-256');

    // Se tiver assinatura HMAC da Meta, valida (apenas para Meta Cloud API)
    if (signatureHeader && APP_SECRET) {
      const expectedSignature =
        'sha256=' +
        crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');

      const isValid =
        signatureHeader.length === expectedSignature.length &&
        crypto.timingSafeEqual(
          Buffer.from(signatureHeader),
          Buffer.from(expectedSignature)
        );

      if (!isValid) {
        console.warn('[WhatsApp Webhook] Assinatura HMAC da Meta inválida.');
        return NextResponse.json(
          { error: 'Assinatura HMAC inválida' },
          { status: 401 }
        );
      }
    } else if (signatureHeader && !APP_SECRET && isProduction) {
      // CR-004 T3: assinatura presente mas sem segredo p/ validar em produção → falha fechada.
      return NextResponse.json(
        { error: 'Webhook não configurado (WHATSAPP_APP_SECRET ausente)' },
        { status: 401 }
      );
    }

    // CR-004 T3 (fail-closed, sem segredo hardcoded): eventos SEM assinatura da
    // Meta (ex.: Evolution API) exigem um token compartilhado válido. Sem token
    // fornecido — ou sem token configurado no ambiente — o ingress é rejeitado.
    if (!signatureHeader) {
      const expectedToken =
        process.env.EVOLUTION_WEBHOOK_TOKEN || process.env.EVOLUTION_API_KEY;
      // Preferir header (não vaza em logs de acesso); query mantida por compat
      // com Evolution self-hosted, que ainda não reenvia headers customizados.
      const providedToken =
        req.headers.get('x-webhook-token') ||
        req.headers.get('apikey') ||
        req.nextUrl.searchParams.get('token');

      if (isProduction || expectedToken) {
        if (!expectedToken || !providedToken || !safeEqual(providedToken, expectedToken)) {
          console.warn('[WhatsApp Webhook] Ingress sem token válido — rejeitado (CR-004 T3).');
          return NextResponse.json({ error: 'Webhook não autorizado' }, { status: 401 });
        }
      }
    }

    const payload = JSON.parse(rawBody || '{}');
    console.log(
      '[WhatsApp Webhook Event]:',
      payload.event || (payload.entry ? 'meta.event' : 'unknown')
    );

    // Instância (número) de origem do evento — Evolution API envia em payload.instance.
    const instanceName: string | undefined =
      payload.instance || payload.instanceName || undefined;

    const incomingMessages: Array<{
      from: string;
      text: string;
      externalId: string;
      name?: string;
    }> = [];

    // ============ 0. ACK DE ENTREGA (MESSAGES_UPDATE) ============
    // O HTTP 200 do sendText so significa "aceitei para enfileirar". O veredito
    // real de entrega chega aqui, depois. Em 17/09 um chip ficou 1h13 com o
    // painel verde e nada chegando porque este evento era ignorado: 11 contatos
    // foram marcados como enviados sem nunca terem recebido nada.
    const eventoAck =
      payload.event === 'messages.update' || payload.event === 'MESSAGES_UPDATE';

    if (eventoAck && instanceName) {
      const d = payload.data || {};
      // A Evolution v2 varia a forma entre versoes: ora keyId, ora key.id.
      const msgId: string | undefined =
        d.keyId || d.messageId || d.key?.id || d.id || undefined;
      const ack: string = String(d.status || d.ack || '').toUpperCase();
      const fromMe = d.fromMe ?? d.key?.fromMe ?? true;

      // So os nossos envios interessam: ack de mensagem recebida nao diz nada
      // sobre a saude do chip.
      if (msgId && ack && fromMe) {
        try {
          const r = await processarAckEntrega(instanceName, msgId, ack, {
            maxErros: ANTIBAN.MAX_ACKS_ERRO,
            cooldownMin: ANTIBAN.COOLDOWN_ACK_MIN,
          });
          if (r.conhecido && !r.entregue) {
            console.warn(
              `[ack] ${instanceName} recusou entrega (${ack})` +
                `${r.devolvido ? ' — contato devolvido à fila' : ''}` +
                `${r.chipDesativado ? ' — CHIP REMOVIDO DO POOL' : ''}`
            );
          }
        } catch (e) {
          console.error('[ack] falha ao processar MESSAGES_UPDATE:', e);
        }
      }
      return NextResponse.json({ success: true, handled: 'ack' });
    }

    // ============ 0b. STATUS DE CONEXÃO (CONNECTION_UPDATE) ============
    // Plug-and-play: quando o operador lê o QR Code e a instância conecta ('open'),
    // ela entra automaticamente no pool de disparo sem nenhuma ação manual.
    // Se a conexão cair ou for recusada ('close'), é desligada do pool para blindagem.
    const eventoConnection =
      payload.event === 'connection.update' || payload.event === 'CONNECTION_UPDATE';

    if (eventoConnection && instanceName) {
      const state = String(payload.data?.state || payload.data?.connection || '').toLowerCase();
      console.log(`[WhatsApp Webhook Connection Update] Instância: ${instanceName} | Estado: ${state}`);
      if (state === 'open') {
        try {
          await setDispatchEnabled(instanceName, true);
        } catch (e) {
          console.error('[connection.update] Erro ao ativar instância no pool:', e);
        }
      } else if (state === 'close' || state === 'refused') {
        try {
          await setDispatchEnabled(instanceName, false);
        } catch (e) {
          console.error('[connection.update] Erro ao desativar instância do pool:', e);
        }
      }
      return NextResponse.json({ success: true, handled: 'connection_update' });
    }

    // ================= 1. EVENTO DA EVOLUTION API (Baileys) =================
    if (
      payload.event === 'messages.upsert' ||
      payload.event === 'MESSAGES_UPSERT' ||
      (payload.data && payload.data.key)
    ) {
      const data = payload.data;
      const key = data?.key;
      const fromMe = key?.fromMe;

      // WhatsApp LID: mensagens recebidas podem chegar com remoteJid = "<lid>@lid"
      // (sem o telefone). O número real vem em key.remoteJidAlt (fallback senderPn).
      // Sem resolver isso, o webhook não casava a sessão da pesquisa (que é por
      // telefone) → o bot ficava mudo e a resposta não gravava.
      const rawJid: string = key?.remoteJid || '';
      const isLid = rawJid.endsWith('@lid') || key?.addressingMode === 'lid';
      const realJid: string = isLid
        ? (key?.remoteJidAlt || key?.senderPn || rawJid)
        : rawJid;
      const isGroup = rawJid.includes('@g.us') || realJid.includes('@g.us');

      // Processa apenas mensagens recebidas de contatos (ignora grupos e as minhas)
      if (!fromMe && realJid && !isGroup) {
        const from = realJid.replace('@s.whatsapp.net', '').replace('@lid', '');
        const text =
          data.message?.conversation ||
          data.message?.extendedTextMessage?.text ||
          data.message?.imageMessage?.caption ||
          data.message?.documentMessage?.caption ||
          (data.message?.audioMessage ? '🎵 [Mensagem de Áudio]' : '') ||
          (data.message?.imageMessage ? '📷 [Foto]' : '') ||
          '';

        const externalId = key.id || `evo-${Date.now()}`;
        const name = data.pushName || `WhatsApp ${from.slice(-4)}`;

        if (text) {
          incomingMessages.push({ from, text, externalId, name });
          console.log(
            `[Evolution API Inbound] De: ${from} (${name}) | Mensagem: "${text}"`
          );
        }
      }
    }

    // ================= 2. EVENTO DA META CLOUD API OFICIAL =================
    else if (payload.entry?.[0]?.changes?.[0]?.value?.messages) {
      const changesValue = payload.entry[0].changes[0].value;
      const msgs = changesValue.messages || [];
      const contactProfile = changesValue.contacts?.[0]?.profile?.name;

      for (const m of msgs) {
        if (m.text?.body) {
          incomingMessages.push({
            from: m.from,
            text: m.text.body,
            externalId: m.id,
            name: contactProfile || `WhatsApp ${m.from.slice(-4)}`,
          });
          console.log(
            `[Meta Cloud API Inbound] De: ${m.from} | Mensagem: "${m.text.body}"`
          );
        }
      }
    }

    // ================= INGESTÃO + AUTOMAÇÃO =================
    if (incomingMessages.length > 0) {
      // 1. Espelho em memória (Inbox instantâneo) + invalida o cache da instância.
      for (const msg of incomingMessages) {
        try {
          addInboundMessage({
            fromPhone: msg.from,
            text: msg.text,
            name: msg.name,
            externalId: msg.externalId,
            instanceName,
          });
        } catch (memErr) {
          console.error('[Memory Store Inbound Error]:', memErr);
        }
      }
      invalidateEvolutionCache(instanceName);

      // 2. Persiste cada recebido no Supabase, keyed pelo JID canônico
      //    (idempotente por external_message_id). É isto que faz a RESPOSTA do
      //    lead aparecer na thread e sobreviver ao serverless.
      for (const msg of incomingMessages) {
        persistMessageByJid({
          phoneOrJid: msg.from,
          senderType: 'contact',
          content: msg.text,
          name: msg.name,
          externalId: msg.externalId,
          instanceName,
        }).catch((e) => console.error('[Webhook persist inbound]:', e));
      }

      // Helper: resposta do bot ao vivo (delay 0), persistida no banco + espelhada.
      const botReply = async (to: string, name: string, text: string, overrideInstance?: string) => {
        const sendInst = overrideInstance || instanceName;
        const r = await sendRealMessageDetailed(to, text, sendInst, 0);
        persistMessageByJid({
          phoneOrJid: to,
          senderType: 'agent',
          content: text,
          name,
          externalId: r.messageId,
          instanceName: sendInst,
        }).catch((e) => console.error('[Webhook persist bot reply]:', e));
        try {
          addBotDispatchedMessage({ toPhone: to, name, text, instanceName: sendInst });
        } catch {}
        return r.ok;
      };

      // 3. AUTOMAÇÃO: Pesquisa Eleitoral Senado MS (spintax semeado pelo telefone)
      for (const msg of incomingMessages) {
        try {
          const session = await getPesquisaSessionByPhone(msg.from);
          if (!session || session.etapa === 'concluido' || session.etapa === 'recusado') continue;

          // Sticky Routing: preserva e responde pela mesma instância de WhatsApp
          const stickyInst = instanceName || session.instanceName;
          if (!session.instanceName && instanceName) {
            session.instanceName = instanceName;
          }

          const cleanText = msg.text.trim();
          const seed = msg.from.replace(/\D/g, '');

          // Opt-out: encerra o fluxo educadamente (protege o chip e respeita o lead).
          if (isOptOut(cleanText)) {
            session.etapa = 'recusado';
            await savePesquisaSession(session);
            // Entra na lista de opt-out e CANCELA os disparos pendentes dele em
            // qualquer campanha. Antes a sessao virava 'recusado' mas a linha
            // seguia pendente na fila: a pessoa seria reabordada depois de ter
            // pedido para sair.
            const rOpt = await registrarOptOut(msg.from, 'respondeu opt-out no WhatsApp');
            if (rOpt.cancelados > 0) {
              console.log(`[Opt-out] ${msg.from}: ${rOpt.cancelados} disparo(s) pendente(s) cancelado(s)`);
            }
            await botReply(msg.from, session.name, 'Combinado! Já retirei seu contato da lista e você não vai mais receber mensagens. Desculpe qualquer incômodo e um abraço! 👍', stickyInst);
            sincronizarContatoEleitor({
              name: session.name, phone: msg.from, bairro: session.bairro, etapa: 'recusado',
            }).catch((e) => console.error('[Webhook] Erro sync opt-out:', e));
            continue;
          }

          // Etapa 1: respondeu à saudação → Msg 2 + Msg 3
          if (session.etapa === 'disparado') {
            session.etapa = 'aguardando_voto1';
            await savePesquisaSession(session);
            sincronizarContatoEleitor({
              name: session.name, phone: msg.from, bairro: session.bairro, etapa: 'aguardando_voto1',
            }).catch((e) => console.error('[Webhook] Erro sync contato:', e));

            await botReply(msg.from, session.name, gerarMensagem2(seed), stickyInst);
            await botReply(msg.from, session.name, gerarMensagem3(seed), stickyInst);
            console.log(`[Pesquisa Senado MS] Saudação respondida — Msg 2 e 3 enviadas para ${msg.from} via ${stickyInst || 'default'}`);
          }

          // Etapa 2: aguardando 1º voto
          else if (session.etapa === 'aguardando_voto1') {
            const votoValido = validarVoto(cleanText);
            if (!votoValido) {
              await botReply(msg.from, session.name, 'Opa, não consegui identificar direitinho por aqui 😅 Pode me mandar só o número da opção (de 1 a 12)?', stickyInst);
            } else {
              const candidato1 = obterCandidatoPorId(votoValido);
              if (candidato1) {
                session.voto1Id = candidato1.id;
                session.voto1Nome = candidato1.nome;
                session.etapa = 'aguardando_voto2';
                await savePesquisaSession(session);
                sincronizarContatoEleitor({
                  name: session.name, phone: msg.from, bairro: session.bairro,
                  voto1Nome: candidato1.nome, etapa: 'aguardando_voto2',
                }).catch((e) => console.error('[Webhook] Erro sync contato 1º voto:', e));

                await botReply(msg.from, session.name, gerarMensagemSegundoVoto(candidato1.id, seed), stickyInst);
                console.log(`[Pesquisa Senado MS] 1º Voto (${candidato1.nome}) — Msg 4 enviada para ${msg.from} via ${stickyInst || 'default'}`);
              }
            }
          }

          // Etapa 3: aguardando 2º voto
          else if (session.etapa === 'aguardando_voto2') {
            const votoValido = validarVoto(cleanText);
            if (!votoValido) {
              await botReply(msg.from, session.name, 'Opa, não consegui identificar por aqui 😅 Pode me mandar só o número da sua segunda escolha?', stickyInst);
            } else if (session.voto1Id && session.voto1Id === votoValido && votoValido <= 10) {
              await botReply(msg.from, session.name, 'Como a gente tem direito a dois votos para candidatos diferentes, essa segunda escolha precisa ser em outro nome 🙂\nDá uma olhadinha na lista e me fala quem seria sua segunda opção:', stickyInst);
            } else {
              const candidato2 = obterCandidatoPorId(votoValido);
              if (candidato2) {
                session.voto2Id = candidato2.id;
                session.voto2Nome = candidato2.nome;
                session.etapa = 'concluido';
                await savePesquisaSession(session);
                sincronizarContatoEleitor({
                  name: session.name, phone: msg.from, bairro: session.bairro,
                  voto1Nome: session.voto1Nome, voto2Nome: candidato2.nome, etapa: 'concluido',
                }).catch((e) => console.error('[Webhook] Erro sync contato 2º voto:', e));

                await botReply(msg.from, session.name, gerarMensagemAgradecimento(seed), stickyInst);
                console.log(`[Pesquisa Senado MS] 2º Voto (${candidato2.nome}) — pesquisa concluída para ${msg.from} via ${stickyInst || 'default'}`);
              }
            }
          }
        } catch (pesqErr) {
          console.error('[Pesquisa Senado Handler Error]:', pesqErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: incomingMessages.length,
      status: 'EVENT_PROCESSED',
    });
  } catch (err: any) {
    console.error('[WhatsApp Webhook Error]:', err);
    return NextResponse.json(
      { error: 'Erro ao processar webhook', message: err.message },
      { status: 500 }
    );
  }
}
