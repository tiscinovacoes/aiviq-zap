import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { addInboundMessage, addBotDispatchedMessage } from '@/lib/conversationStore';
import { invalidateEvolutionCache, sendRealMessage } from '@/lib/evolutionService';
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

    // ================= 1. EVENTO DA EVOLUTION API (Baileys) =================
    if (
      payload.event === 'messages.upsert' ||
      payload.event === 'MESSAGES_UPSERT' ||
      (payload.data && payload.data.key)
    ) {
      const data = payload.data;
      const key = data?.key;
      const fromMe = key?.fromMe;

      // Processa apenas mensagens recebidas de contatos (ignora grupos @g.us e mensagens enviadas por mim)
      if (!fromMe && key?.remoteJid && !key.remoteJid.includes('@g.us')) {
        const from = key.remoteJid.replace('@s.whatsapp.net', '');
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

    // ================= INGESTÃO: MEMÓRIA / CACHE + SUPABASE =================
    if (incomingMessages.length > 0) {
      // 1. Sempre registra no repositório em memória para refletir no Inbox imediatamente
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

      // Invalida o cache desta instância para o novo recebido refletir de imediato.
      invalidateEvolutionCache(instanceName);

      // ================= PROCESSAMENTO AUTOMÁTICO: PESQUISA ELEITORAL SENADO MS =================
      for (const msg of incomingMessages) {
        try {
          const session = getPesquisaSessionByPhone(msg.from);
          if (session && session.etapa !== 'concluido' && session.etapa !== 'recusado') {
            const cleanText = msg.text.trim();

            // Etapa 1: Lead respondeu à saudação inicial (Msg 1) -> Dispara Msg 2 e Msg 3
            if (session.etapa === 'disparado') {
              session.etapa = 'aguardando_voto1';
              savePesquisaSession(session);

              const msg2 = gerarMensagem2();
              const msg3 = gerarMensagem3();

              // Envia Msg 2
              await sendRealMessage(msg.from, msg2, instanceName);
              addBotDispatchedMessage({ toPhone: msg.from, name: session.name, text: msg2, instanceName });

              // Pequena pausa natural de leitura
              await new Promise((r) => setTimeout(r, 600));

              // Envia Msg 3
              await sendRealMessage(msg.from, msg3, instanceName);
              addBotDispatchedMessage({ toPhone: msg.from, name: session.name, text: msg3, instanceName });

              console.log(`[Pesquisa Senado MS] Respondeu saudação! Enviadas Msg 2 e Msg 3 para ${msg.from}`);
            }

            // Etapa 2: Aguardando 1º voto
            else if (session.etapa === 'aguardando_voto1') {
              const votoValido = validarVoto(cleanText);
              if (!votoValido) {
                const msgInvalida = `Por favor, digite apenas o número correspondente à sua opção (de 1 a 12).`;
                await sendRealMessage(msg.from, msgInvalida, instanceName);
                addBotDispatchedMessage({ toPhone: msg.from, name: session.name, text: msgInvalida, instanceName });
              } else {
                const candidato1 = obterCandidatoPorId(votoValido);
                if (candidato1) {
                  session.voto1Id = candidato1.id;
                  session.voto1Nome = candidato1.nome;
                  session.etapa = 'aguardando_voto2';
                  savePesquisaSession(session);

                  // Envia Msg 4 com a lista atualizada (sem o candidato votado)
                  const msg4 = gerarMensagemSegundoVoto(candidato1.id);
                  await sendRealMessage(msg.from, msg4, instanceName);
                  addBotDispatchedMessage({ toPhone: msg.from, name: session.name, text: msg4, instanceName });
                  console.log(`[Pesquisa Senado MS] 1º Voto (${candidato1.nome}) computado para ${msg.from}. Msg 4 enviada.`);
                }
              }
            }

            // Etapa 3: Aguardando 2º voto
            else if (session.etapa === 'aguardando_voto2') {
              const votoValido = validarVoto(cleanText);
              if (!votoValido) {
                const msgInvalida = `Por favor, digite apenas o número da sua escolha para o segundo voto.`;
                await sendRealMessage(msg.from, msgInvalida, instanceName);
                addBotDispatchedMessage({ toPhone: msg.from, name: session.name, text: msgInvalida, instanceName });
              } else if (
                session.voto1Id &&
                session.voto1Id === votoValido &&
                votoValido <= 10
              ) {
                // Segundo voto deve ser diferente do primeiro (conforme instrução)
                const msgRepetido = `O segundo voto deve ser diferente do primeiro.\nPor favor, escolha outro candidato da lista acima.`;
                await sendRealMessage(msg.from, msgRepetido, instanceName);
                addBotDispatchedMessage({ toPhone: msg.from, name: session.name, text: msgRepetido, instanceName });
              } else {
                const candidato2 = obterCandidatoPorId(votoValido);
                if (candidato2) {
                  session.voto2Id = candidato2.id;
                  session.voto2Nome = candidato2.nome;
                  session.etapa = 'concluido';
                  savePesquisaSession(session);

                  // Envia Msg 5 com despedida de acordo com o período MS
                  const msg5 = gerarMensagemAgradecimento();
                  await sendRealMessage(msg.from, msg5, instanceName);
                  addBotDispatchedMessage({ toPhone: msg.from, name: session.name, text: msg5, instanceName });
                  console.log(`[Pesquisa Senado MS] 2º Voto (${candidato2.nome}) computado para ${msg.from}. Pesquisa finalizada com sucesso!`);
                }
              }
            }
          }
        } catch (pesqErr) {
          console.error('[Pesquisa Senado Handler Error]:', pesqErr);
        }
      }

      // 2. Registra no Supabase caso configurado
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const isPlaceholder =
        !supabaseUrl || supabaseUrl.includes('placeholder-project');

      if (!isPlaceholder) {
        try {
          const supabase = serviceRoleKey
            ? createSupabaseClient(supabaseUrl, serviceRoleKey)
            : await createClient();

          const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .limit(1)
            .single();

          if (org) {
            const organizationId = org.id;

            for (const msg of incomingMessages) {
              // Localizar ou criar contato
              let { data: contact } = await supabase
                .from('contacts')
                .select('id, organization_id')
                .eq('phone', msg.from)
                .limit(1)
                .single();

              if (!contact) {
                const { data: newContact } = await supabase
                  .from('contacts')
                  .insert({
                    organization_id: organizationId,
                    name: msg.name || `WhatsApp ${msg.from.slice(-4)}`,
                    phone: msg.from,
                    tags: ['WhatsApp Inbound'],
                  })
                  .select('id, organization_id')
                  .single();
                contact = newContact;
              }

              if (contact) {
                // Localizar ou criar conversa
                let { data: conversation } = await supabase
                  .from('conversations')
                  .select('id')
                  .eq('contact_id', contact.id)
                  .eq('status', 'open')
                  .limit(1)
                  .single();

                if (!conversation) {
                  // Resolve o inbox pela instância (número) de origem. Se a coluna
                  // evolution_instance_name ainda não existir (migration 006 não
                  // aplicada) ou não houver correspondência, cai no primeiro inbox.
                  let inbox: { id: string } | null = null;
                  if (instanceName) {
                    const { data, error } = await supabase
                      .from('inboxes')
                      .select('id')
                      .eq('organization_id', organizationId)
                      .eq('evolution_instance_name', instanceName)
                      .limit(1)
                      .maybeSingle();
                    if (!error && data) inbox = data as { id: string };
                  }
                  if (!inbox) {
                    const { data } = await supabase
                      .from('inboxes')
                      .select('id')
                      .eq('organization_id', organizationId)
                      .limit(1)
                      .maybeSingle();
                    inbox = (data as { id: string } | null) || null;
                  }

                  const { data: newConversation } = await supabase
                    .from('conversations')
                    .insert({
                      organization_id: organizationId,
                      inbox_id: inbox?.id,
                      contact_id: contact.id,
                      status: 'open',
                      last_message_preview: msg.text,
                      last_message_at: new Date().toISOString(),
                    })
                    .select('id')
                    .single();

                  conversation = newConversation;
                }

                if (conversation) {
                  await supabase.from('messages').insert({
                    organization_id: organizationId,
                    conversation_id: conversation.id,
                    sender_type: 'contact',
                    content: msg.text,
                    message_type: 'text',
                    delivery_status: 'delivered',
                    external_message_id: msg.externalId,
                  });

                  await supabase
                    .from('conversations')
                    .update({
                      last_message_preview: msg.text,
                      last_message_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', conversation.id);
                }
              }
            }
          }
        } catch (dbErr) {
          console.warn('[Supabase Ingestion Warn]:', dbErr);
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
