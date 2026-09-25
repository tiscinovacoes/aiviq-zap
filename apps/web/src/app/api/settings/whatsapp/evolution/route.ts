import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { prepareInstanceForQr } from '@/lib/proxyPool';
import { garantirWebhookAtual, invalidateEvolutionCache } from '@/lib/evolutionService';
import { chavesEmQuarentena } from '@/lib/proxyRegistry';
import { validarIpDaInstancia } from '@/lib/proxyGuard';

export const dynamic = 'force-dynamic';
// QR = criar + proxy + medir IP de saida + connect: passa dos 10s padrao.
export const maxDuration = 60;

// CR-004 T5: exige usuário autenticado na própria rota (defesa em profundidade,
// não só no middleware). Retorna null se ok, ou uma resposta 401.
async function requireUser(req?: NextRequest): Promise<NextResponse | null> {
  const isPlaceholder =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');
  if (isPlaceholder) return null; // dev/local sem banco: liberado

  // CR-002 B1-R: Suporte a usuário demo quando explicitamente habilitado (ALLOW_DEMO_LOGIN ou dev)
  const allowDemo = process.env.NODE_ENV === 'development' || process.env.ALLOW_DEMO_LOGIN === 'true';
  if (allowDemo) {
    let token = req?.cookies?.get('poli_dev_token')?.value || req?.cookies?.get('poli_token')?.value;
    if (!token) {
      try {
        const cookieStore = await cookies();
        token = cookieStore.get('poli_dev_token')?.value || cookieStore.get('poli_token')?.value;
      } catch {}
    }
    if (token === 'mock-dev-token-jwt') {
      return null;
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado', message: 'Sessão expirada ou usuário não autenticado.' }, { status: 401 });
  return null;
}

// CR-004 T5: bloqueia SSRF — só permite http(s) para hosts públicos (sem
// localhost, IPs privados/link-local ou metadata de cloud).
function isSafeEvolutionUrl(raw?: string): boolean {
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '169.254.169.254' || // metadata
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return false;
  }
  return true;
}

interface EvolutionState {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  status: 'connected' | 'connecting' | 'disconnected';
  phoneNumber?: string;
  profileName?: string;
  profilePicUrl?: string;
  qrCodeBase64?: string;
  pairingCode?: string;
}

// CR-004 T1: sem default de credencial/URL no código — exige env, falha fechada.
let localEvolutionState: EvolutionState = {
  apiUrl: process.env.EVOLUTION_API_URL || '',
  apiKey: process.env.EVOLUTION_API_KEY || '',
  instanceName: process.env.EVOLUTION_INSTANCE || 'aiviq_inbox_01',
  status: 'disconnected',
};

// Formata número do WhatsApp para exibição no padrão brasileiro
function formatPhoneNumber(rawJidOrNumber?: string | null): string {
  if (!rawJidOrNumber) return '';
  const clean = rawJidOrNumber.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  if (clean.length === 12 && clean.startsWith('55')) {
    // 55 + 2 dígitos DDD + 8 dígitos -> +55 (DD) 9XXXX-XXXX
    const ddd = clean.slice(2, 4);
    const num = clean.slice(4);
    return `+55 (${ddd}) 9${num.slice(0, 4)}-${num.slice(4)}`;
  } else if (clean.length === 13 && clean.startsWith('55')) {
    // 55 + 2 dígitos DDD + 9 dígitos
    const ddd = clean.slice(2, 4);
    const num = clean.slice(4);
    return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  } else if (clean.length > 8) {
    return `+${clean}`;
  }
  return rawJidOrNumber;
}

// Sincroniza estado real consultando a Evolution API no Railway
async function syncInstanceDetails(appOrigin?: string): Promise<EvolutionState> {
  const { apiUrl, apiKey, instanceName } = localEvolutionState;
  if (!apiUrl || !apiKey) return localEvolutionState;

  try {
    const res = await fetch(`${apiUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(4500),
    });

    if (res.ok) {
      const instances = await res.json();
      const inst = Array.isArray(instances)
        ? instances.find((i: any) => i.name === instanceName) || instances[0]
        : null;

      if (inst) {
        if (inst.connectionStatus === 'open') {
          localEvolutionState.status = 'connected';
          localEvolutionState.phoneNumber = formatPhoneNumber(inst.ownerJid || inst.number);
          localEvolutionState.profileName = inst.profileName || 'Luca Scandola';
          localEvolutionState.profilePicUrl = inst.profilePicUrl || undefined;
          localEvolutionState.qrCodeBase64 = undefined;
          localEvolutionState.pairingCode = undefined;

          // Webhook: idempotente e com a MESMA URL/token do receptor. Antes esta
          // rotina REESCREVIA o webhook a cada poll da tela de Configuracoes com
          // a origem de quem estava olhando (ex.: URL de preview `git-master`) e,
          // sem EVOLUTION_WEBHOOK_TOKEN, SEM token -- o receptor respondia 401 e a
          // instancia ficava surda (foi assim que a aiviq_inbox_01 perdeu o
          // tempo real). urlDoWebhook() prioriza a env e cai no mesmo fallback do
          // receptor; so regrava se divergir.
          if (appOrigin && !appOrigin.includes('localhost')) {
            try {
              await garantirWebhookAtual(instanceName, appOrigin);
            } catch {
              // best-effort
            }
          }
        } else if (inst.connectionStatus === 'connecting') {
          localEvolutionState.status = 'connecting';
        } else {
          localEvolutionState.status = 'disconnected';
          localEvolutionState.phoneNumber = undefined;
        }
      }
    }
  } catch (e) {
    // API temporariamente fora de alcance
  }

  return localEvolutionState;
}

// GET: Retorna o status atual da conexão Evolution com dados reais
export async function GET(req: NextRequest) {
  try {
    const unauthorized = await requireUser(req);
    if (unauthorized) return unauthorized;

    const origin = req.nextUrl?.origin;
    const currentState = await syncInstanceDetails(origin);

    return NextResponse.json({
      success: true,
      data: currentState,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Salvar credenciais ou ações (connect / disconnect / test)
export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireUser(req);
    if (unauthorized) return unauthorized;

    const body = await req.json();
    const { action, apiUrl, apiKey, instanceName } = body;
    const origin = req.nextUrl?.origin;

    // CR-004 T5: rejeita apiUrl inseguro (SSRF) antes de armazenar/usar.
    if (apiUrl) {
      const normalized = String(apiUrl).replace(/\/$/, '');
      if (!isSafeEvolutionUrl(normalized)) {
        return NextResponse.json(
          { success: false, error: 'invalid_url', message: 'URL da Evolution API inválida ou não permitida (bloqueada por segurança).' },
          { status: 400 }
        );
      }
      localEvolutionState.apiUrl = normalized;
    }
    if (apiKey) localEvolutionState.apiKey = apiKey;
    if (instanceName) localEvolutionState.instanceName = instanceName;

    const currentUrl = localEvolutionState.apiUrl;
    const currentKey = localEvolutionState.apiKey;
    const currentInstance = localEvolutionState.instanceName;

    // Ação 0: Testar se o servidor da Evolution API está acessível
    if (action === 'test_server') {
      if (!currentUrl || !currentKey) {
        return NextResponse.json(
          {
            success: false,
            error: 'not_configured',
            message: 'URL e Chave da Evolution API não informadas. Preencha os campos no painel abaixo.',
          },
          { status: 400 }
        );
      }
      try {
        const res = await fetch(`${currentUrl}/instance/fetchInstances`, {
          headers: { apikey: currentKey },
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const instances = await res.json();
          await syncInstanceDetails(origin);
          return NextResponse.json({
            success: true,
            message: `Servidor Evolution API online e autenticado! (${instances.length || 0} instâncias ativas).`,
            instances,
            data: localEvolutionState,
          });
        }

        return NextResponse.json({
          success: false,
          error: 'auth_failed',
          message: `Servidor Evolution API respondeu com status ${res.status}. Verifique se a Chave de API (Global API Key) está correta.`,
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: 'unreachable',
          message: `Não foi possível conectar ao servidor Evolution API em ${currentUrl}. Verifique se a API está em execução e acessível.`,
        });
      }
    }

    // Ação 1: Gerar QR Code Real (Baileys)
    if (action === 'get_qr') {
      if (!currentUrl || !currentKey) {
        return NextResponse.json(
          {
            success: false,
            error: 'not_configured',
            message: 'URL e Chave da Evolution API não informadas. Preencha os campos no painel abaixo antes de gerar o QR Code.',
          },
          { status: 400 }
        );
      }

      let lastError = '';
      let lastHttp = 0;
      let lastState = '';

      // 1. Cria a instância (sem abrir o socket) e garante o IP dedicado
      //    (estrito só com EVOLUTION_PROXY_REQUIRED=true; senão avisa).
      const quarantined = await chavesEmQuarentena();
      const proxy = await prepareInstanceForQr(currentUrl, currentKey, currentInstance, { quarantined });
      if (!proxy.ok) {
        return NextResponse.json(
          { success: false, error: proxy.error, message: proxy.message },
          { status: proxy.status }
        );
      }

      // IP de saida do Brasil, sem repeticao entre chips; registra a atribuicao.
      const ip = await validarIpDaInstancia(currentUrl, currentKey, currentInstance);
      if (ip.bloqueio) {
        return NextResponse.json(
          { success: false, error: ip.bloqueio.error, message: ip.bloqueio.message },
          { status: ip.bloqueio.status }
        );
      }

      // 2. Busca o QR code real gerado pelo Baileys
      try {
        const qrRes = await fetch(`${currentUrl}/instance/connect/${currentInstance}`, {
          headers: { apikey: currentKey },
          signal: AbortSignal.timeout(12000),
        });

        if (qrRes.ok) {
          const qrData = await qrRes.json();
          let rawBase64 = qrData.base64 || qrData.qrcode?.base64 || (typeof qrData.qrcode === 'string' && qrData.qrcode.startsWith('data:') ? qrData.qrcode : null);

          if (rawBase64) {
            const base64Clean = rawBase64.startsWith('data:')
              ? rawBase64
              : `data:image/png;base64,${rawBase64}`;

            localEvolutionState.qrCodeBase64 = base64Clean;
            localEvolutionState.pairingCode = qrData.pairingCode;
            localEvolutionState.status = 'connecting';

            // Webhook com URL/token atuais antes de o numero conectar.
            const wh = await garantirWebhookAtual(currentInstance, origin).catch(() => null);
            invalidateEvolutionCache(currentInstance);

            return NextResponse.json({
              success: true,
              qrCode: base64Clean,
              pairingCode: qrData.pairingCode,
              status: 'connecting',
              proxyIp: proxy.host ? `${proxy.host}:${proxy.port}` : undefined,
              proxyWarning: proxy.warning,
              egressIp: ip.egress?.ip,
              egressCountry: ip.egress?.countryCode,
              ipAviso: ip.aviso,
              webhookConfigurado: wh?.ok ?? false,
              message:
                (proxy.warning ? `⚠️ ${proxy.message} ` : '') +
                (ip.aviso ? `⚠️ ${ip.aviso} ` : '') +
                'QR Code real gerado com sucesso pela Evolution API!',
            });
          }
          lastState = qrData?.instance?.state || qrData?.state || '';
          lastHttp = qrRes.status;
        } else {
          lastHttp = qrRes.status;
          lastError = (await qrRes.text().catch(() => '')).slice(0, 300);
        }
      } catch (err: any) {
        lastError = err.message;
      }

      // Erro HONESTO: antes qualquer falha virava "servidor inacessivel", o que
      // mascarava o motivo real (instancia ja conectada, sessao presa, 401...).
      if (lastState === 'open') {
        return NextResponse.json(
          {
            success: false,
            error: 'already_connected',
            message: 'Este número já está conectado na Evolution. Desconecte antes de gerar um novo QR.',
          },
          { status: 409 }
        );
      }
      if (lastState) {
        return NextResponse.json(
          {
            success: false,
            error: 'no_qr',
            message: `A Evolution não devolveu QR (estado da instância: ${lastState}). Se ficar preso em "connecting", remova a instância e crie de novo.`,
          },
          { status: 409 }
        );
      }
      if (lastHttp) {
        return NextResponse.json(
          {
            success: false,
            error: 'evolution_error',
            message: `A Evolution respondeu HTTP ${lastHttp} ao gerar o QR${lastError ? ': ' + lastError : ''}.`,
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: 'server_offline',
          message: `Servidor Evolution API inacessível em ${currentUrl} (${lastError || 'timeout'}). Verifique a URL e a Global API Key.`,
          details: lastError,
        },
        { status: 502 }
      );
    }

    // Ação 2: Desconectar instância
    if (action === 'disconnect') {
      try {
        await fetch(`${currentUrl}/instance/logout/${currentInstance}`, {
          method: 'DELETE',
          headers: { apikey: currentKey },
          signal: AbortSignal.timeout(4000),
        });
      } catch (err) {}

      localEvolutionState.status = 'disconnected';
      localEvolutionState.qrCodeBase64 = undefined;
      localEvolutionState.phoneNumber = undefined;
      localEvolutionState.profileName = undefined;
      localEvolutionState.pairingCode = undefined;

      return NextResponse.json({
        success: true,
        message: 'WhatsApp desconectado com sucesso!',
      });
    }

    // Ação 3: Confirmar conexão (Sincroniza dados reais)
    if (action === 'confirm_connection') {
      const updatedState = await syncInstanceDetails(origin);

      return NextResponse.json({
        success: true,
        message: 'WhatsApp conectado com sucesso!',
        data: updatedState,
      });
    }

    const savedState = await syncInstanceDetails(origin);
    return NextResponse.json({
      success: true,
      message: 'Configurações da Evolution API salvas!',
      data: savedState,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
