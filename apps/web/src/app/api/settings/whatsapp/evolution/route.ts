import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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

let localEvolutionState: EvolutionState = {
  apiUrl:
    process.env.EVOLUTION_API_URL ||
    'https://evolution-api-production-8ecf.up.railway.app',
  apiKey: process.env.EVOLUTION_API_KEY || 'aiviq_zap_secret_2026',
  instanceName: 'aiviq_inbox_01',
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

          // Se tiver origin, garante auto-configuração do webhook para receber mensagens
          if (appOrigin && !appOrigin.includes('localhost')) {
            const targetWebhookUrl = `${appOrigin}/api/webhooks/whatsapp`;
            try {
              await fetch(`${apiUrl}/webhook/set/${instanceName}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  apikey: apiKey,
                },
                body: JSON.stringify({
                  webhook: {
                    enabled: true,
                    url: targetWebhookUrl,
                    byEvents: false,
                    base64: false,
                    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
                  },
                }),
                signal: AbortSignal.timeout(3500),
              });
            } catch (wErr) {
              // Silently catch webhook set error
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
    const body = await req.json();
    const { action, apiUrl, apiKey, instanceName } = body;
    const origin = req.nextUrl?.origin;

    if (apiUrl) localEvolutionState.apiUrl = apiUrl.replace(/\/$/, '');
    if (apiKey) localEvolutionState.apiKey = apiKey;
    if (instanceName) localEvolutionState.instanceName = instanceName;

    const currentUrl = localEvolutionState.apiUrl;
    const currentKey = localEvolutionState.apiKey;
    const currentInstance = localEvolutionState.instanceName;

    // Ação 0: Testar se o servidor da Evolution API está acessível
    if (action === 'test_server') {
      try {
        const res = await fetch(`${currentUrl}/instance/fetchInstances`, {
          headers: { apikey: currentKey },
          signal: AbortSignal.timeout(5000),
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
          message: `Não foi possível conectar ao servidor Evolution API em ${currentUrl}. Verifique se a API está em execução no Docker ou na sua VPS.`,
        });
      }
    }

    // Ação 1: Gerar QR Code Real (Baileys)
    if (action === 'get_qr') {
      let lastError = '';

      // 1. Tenta criar a instância na Evolution API (modo Baileys)
      try {
        await fetch(`${currentUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: currentKey,
          },
          body: JSON.stringify({
            instanceName: currentInstance,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (e: any) {
        lastError = e.message;
      }

      // 2. Busca o QR code real gerado pelo Baileys
      try {
        const qrRes = await fetch(`${currentUrl}/instance/connect/${currentInstance}`, {
          headers: { apikey: currentKey },
          signal: AbortSignal.timeout(6000),
        });

        if (qrRes.ok) {
          const qrData = await qrRes.json();
          let rawBase64 = qrData.base64 || qrData.qrcode?.base64;

          if (rawBase64) {
            const base64Clean = rawBase64.startsWith('data:')
              ? rawBase64
              : `data:image/png;base64,${rawBase64}`;

            localEvolutionState.qrCodeBase64 = base64Clean;
            localEvolutionState.pairingCode = qrData.pairingCode;
            localEvolutionState.status = 'connecting';

            return NextResponse.json({
              success: true,
              qrCode: base64Clean,
              pairingCode: qrData.pairingCode,
              status: 'connecting',
              message: 'QR Code real gerado com sucesso pela Evolution API!',
            });
          }
        }
      } catch (err: any) {
        lastError = err.message;
      }

      return NextResponse.json(
        {
          success: false,
          error: 'server_offline',
          message: `Servidor Evolution API inacessível em ${currentUrl}. Verifique se o container Docker ou VPS está ativo e se a Global API Key está correta.`,
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
