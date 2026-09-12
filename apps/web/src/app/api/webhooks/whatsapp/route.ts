import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const isProduction = process.env.NODE_ENV === 'production';
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || (!isProduction ? 'poli_webhook_secret_token_2026' : undefined);
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (isProduction && !VERIFY_TOKEN) {
    console.error('[WhatsApp Webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN ausente nas variáveis de produção.');
    return new NextResponse('Configuração de webhook incompleta no servidor', { status: 500 });
  }

  if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
    return new NextResponse(challenge || '', { status: 200 });
  }

  return new NextResponse('Verificação de webhook rejeitada', { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-hub-signature-256');

    // N3 — HMAC signature verification
    if (isProduction && !APP_SECRET) {
      console.error('[WhatsApp Webhook] WHATSAPP_APP_SECRET não configurado em produção.');
      return NextResponse.json({ error: 'Configuração de webhook incompleta no servidor' }, { status: 500 });
    }

    if (APP_SECRET) {
      if (!signatureHeader) {
        return NextResponse.json({ error: 'Assinatura HMAC ausente' }, { status: 401 });
      }

      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', APP_SECRET)
        .update(rawBody)
        .digest('hex');

      const isValid = signatureHeader.length === expectedSignature.length &&
        crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSignature));

      if (!isValid) {
        console.warn('[WhatsApp Webhook] Assinatura HMAC inválida recebida.');
        return NextResponse.json({ error: 'Assinatura HMAC inválida' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody || '{}');

    // Log payload for audit / observability
    console.log('[WhatsApp Webhook Event Received]:', JSON.stringify(payload));

    // Handle incoming messages structure from Meta WhatsApp Cloud API
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (messages && messages.length > 0) {
      const incomingMsg = messages[0];
      const from = incomingMsg.from; // Phone number
      const text = incomingMsg.text?.body || '';
      const externalId = incomingMsg.id;

      console.log(`[WhatsApp Message Ingested] De: ${from} | Texto: "${text}" | ID: ${externalId}`);

      // Ingest message to Supabase DB if configured
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const isPlaceholder = !supabaseUrl || supabaseUrl.includes('placeholder-project');

      if (!isPlaceholder) {
        // Use service role client if available (system webhook execution without cookie session)
        const supabase = serviceRoleKey
          ? createSupabaseClient(supabaseUrl, serviceRoleKey)
          : await createClient();

        // 1. Locate organization (default first org or inbox org)
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .limit(1)
          .single();

        if (org) {
          const organizationId = org.id;

          // 2. Find or create contact
          let { data: contact } = await supabase
            .from('contacts')
            .select('id, organization_id')
            .eq('phone', from)
            .limit(1)
            .single();

          if (!contact) {
            const { data: newContact } = await supabase
              .from('contacts')
              .insert({
                organization_id: organizationId,
                name: incomingMsg.profile?.name || `WhatsApp ${from.slice(-4)}`,
                phone: from,
                tags: ['WhatsApp Inbound'],
              })
              .select('id, organization_id')
              .single();
            contact = newContact;
          }

          if (contact) {
            // 3. Find or create conversation
            let { data: conversation } = await supabase
              .from('conversations')
              .select('id')
              .eq('contact_id', contact.id)
              .eq('status', 'open')
              .limit(1)
              .single();

            if (!conversation) {
              const { data: inbox } = await supabase
                .from('inboxes')
                .select('id')
                .eq('organization_id', organizationId)
                .limit(1)
                .single();

              const { data: newConversation } = await supabase
                .from('conversations')
                .insert({
                  organization_id: organizationId,
                  inbox_id: inbox?.id,
                  contact_id: contact.id,
                  status: 'open',
                  last_message_preview: text,
                  last_message_at: new Date().toISOString(),
                })
                .select('id')
                .single();

              conversation = newConversation;
            }

            if (conversation) {
              // 4. Insert message with unique deduplication on external_message_id
              const { error: insertError } = await supabase
                .from('messages')
                .insert({
                  organization_id: organizationId,
                  conversation_id: conversation.id,
                  sender_type: 'contact',
                  content: text,
                  message_type: 'text',
                  delivery_status: 'delivered',
                  external_message_id: externalId,
                });

              if (insertError) {
                // If message already exists (deduplication key collision), acknowledge idempotently
                console.log('[WhatsApp Webhook] Mensagem já ingerida (dedup ativado):', externalId);
              } else {
                await supabase
                  .from('conversations')
                  .update({
                    last_message_preview: text,
                    last_message_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', conversation.id);
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, status: 'EVENT_RECEIVED' });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao processar webhook', message: err.message },
      { status: 500 }
    );
  }
}


