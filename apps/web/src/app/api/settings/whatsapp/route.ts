import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Origem da app configurável por ambiente (evita domínio Vercel hardcoded).
// Só usada como fallback quando a origem da requisição não está disponível.
const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL || 'https://aiviq-zap-web.vercel.app';

interface WhatsAppConfig {
  phoneNumberId: string;
  wabaId: string;
  phoneNumber: string;
  verifiedName: string;
  webhookVerifyToken: string;
  appSecret: string;
  accessTokenMasked: string;
  status: 'connected' | 'pending' | 'disconnected';
  qualityRating: string;
  webhookUrl: string;
}

let mockConfig: WhatsAppConfig = {
  phoneNumberId: '1049281928374',
  wabaId: '1092837461928',
  phoneNumber: '+55 11 99999-8888',
  verifiedName: 'AIVIQ-ZAP Atendimento Oficial',
  webhookVerifyToken: 'aiviq_webhook_secret_token_2026',
  appSecret: '••••••••••••••••••••••••••••••••',
  accessTokenMasked: 'EAAGbZCoq8L...••••••••••••••',
  status: 'connected',
  qualityRating: 'GREEN (Alta Qualidade)',
  webhookUrl: `${APP_ORIGIN}/api/webhooks/whatsapp`,
};

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();

        if (profile?.organization_id) {
          const { data: inbox } = await supabase
            .from('inboxes')
            .select('*')
            .eq('organization_id', profile.organization_id)
            .eq('channel_type', 'whatsapp_cloud')
            .single();

          if (inbox) {
            const creds = inbox.credentials || {};
            const origin = req.nextUrl.origin || APP_ORIGIN;
            return NextResponse.json({
              success: true,
              config: {
                phoneNumberId: inbox.phone_number_id || '',
                wabaId: inbox.waba_id || '',
                phoneNumber: creds.phone_number || '+55 11 99999-8888',
                verifiedName: creds.verified_name || 'Conta WhatsApp Business',
                webhookVerifyToken: creds.webhook_verify_token || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'aiviq_webhook_secret_token_2026',
                appSecret: creds.app_secret ? '••••••••••••••••' : '',
                accessTokenMasked: creds.access_token ? `${creds.access_token.slice(0, 8)}...••••••` : '',
                status: inbox.is_active ? 'connected' : 'pending',
                qualityRating: creds.quality_rating || 'GREEN (Alta Qualidade)',
                webhookUrl: `${origin}/api/webhooks/whatsapp`,
              },
            });
          }
        }
      }
    }

    // Fallback com URL dinâmica
    const origin = req.nextUrl.origin || APP_ORIGIN;
    return NextResponse.json({
      success: true,
      config: {
        ...mockConfig,
        webhookUrl: `${origin}/api/webhooks/whatsapp`,
        webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || mockConfig.webhookVerifyToken,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao buscar configurações', message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      phoneNumberId,
      wabaId,
      accessToken,
      appSecret,
      webhookVerifyToken,
      phoneNumber,
      verifiedName,
    } = body;

    if (!phoneNumberId || !wabaId) {
      return NextResponse.json({ error: 'Phone Number ID e WABA ID são obrigatórios' }, { status: 400 });
    }

    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();

        if (profile?.organization_id) {
          const credentialsPayload = {
            access_token: accessToken || undefined,
            app_secret: appSecret || undefined,
            webhook_verify_token: webhookVerifyToken || 'aiviq_webhook_secret_token_2026',
            phone_number: phoneNumber || '+55 11 99999-8888',
            verified_name: verifiedName || 'AIVIQ-ZAP Oficial',
            quality_rating: 'GREEN (Alta Qualidade)',
          };

          // Upsert inbox
          const { error: upsertError } = await supabase
            .from('inboxes')
            .upsert({
              organization_id: profile.organization_id,
              name: 'WhatsApp Business Oficial',
              channel_type: 'whatsapp_cloud',
              phone_number_id: phoneNumberId,
              waba_id: wabaId,
              credentials: credentialsPayload,
              is_active: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'organization_id, channel_type' });

          if (!upsertError) {
            return NextResponse.json({
              success: true,
              message: 'Configurações salvas no Supabase com sucesso!',
            });
          }
        }
      }
    }

    // Fallback in-memory
    mockConfig = {
      ...mockConfig,
      phoneNumberId,
      wabaId,
      phoneNumber: phoneNumber || mockConfig.phoneNumber,
      verifiedName: verifiedName || mockConfig.verifiedName,
      webhookVerifyToken: webhookVerifyToken || mockConfig.webhookVerifyToken,
      appSecret: appSecret ? '••••••••••••••••' : mockConfig.appSecret,
      accessTokenMasked: accessToken ? `${accessToken.slice(0, 8)}...••••••` : mockConfig.accessTokenMasked,
      status: 'connected',
    };

    return NextResponse.json({
      success: true,
      message: 'Configurações do WhatsApp salvas com sucesso!',
      simulated: isPlaceholder,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao salvar configurações', message: err.message }, { status: 500 });
  }
}
