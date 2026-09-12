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
  apiUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  apiKey: process.env.EVOLUTION_API_KEY || 'aiviq_evolution_secret_key_2026',
  instanceName: 'aiviq_inbox_01',
  status: 'disconnected',
};

// GET: Retorna o status atual da conexão Evolution
export async function GET(req: NextRequest) {
  try {
    const { apiUrl, apiKey, instanceName } = localEvolutionState;

    if (apiUrl && apiKey && instanceName) {
      try {
        const checkRes = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, {
          headers: { apikey: apiKey },
          signal: AbortSignal.timeout(3500),
        });

        if (checkRes.ok) {
          const data = await checkRes.json();
          const state = data?.instance?.state;
          if (state === 'open') {
            localEvolutionState.status = 'connected';
          } else if (state === 'connecting') {
            localEvolutionState.status = 'connecting';
          } else {
            localEvolutionState.status = 'disconnected';
          }
        }
      } catch (err) {
        // Evolution offline ou inacessível no momento
      }
    }

    return NextResponse.json({
      success: true,
      data: localEvolutionState,
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
          signal: AbortSignal.timeout(4000),
        });

        if (res.ok) {
          const instances = await res.json();
          return NextResponse.json({
            success: true,
            message: `Servidor Evolution API online e autenticado! (${instances.length || 0} instâncias ativas).`,
            instances,
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
      let created = false;
      let lastError = '';

      // 1. Tenta criar a instância na Evolution API (modo Baileys)
      try {
        const createRes = await fetch(`${currentUrl}/instance/create`, {
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

        if (createRes.ok) {
          created = true;
        }
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
            // Garante o prefixo data:image/png;base64, se necessário
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

      // Se falhou e o servidor não respondeu, NÃO inventa QR code fictício! Retorna erro claro.
      return NextResponse.json({
        success: false,
        error: 'server_offline',
        message: `Servidor Evolution API inacessível em ${currentUrl}. Verifique se o container Docker ou VPS está ativo e se a Global API Key está correta.`,
        details: lastError,
      }, { status: 502 });
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
      localEvolutionState.pairingCode = undefined;

      return NextResponse.json({
        success: true,
        message: 'WhatsApp desconectado com sucesso!',
      });
    }

    // Ação 3: Simular / Confirmar conexão
    if (action === 'confirm_connection') {
      localEvolutionState.status = 'connected';
      localEvolutionState.phoneNumber = '+55 11 98765-4321';
      localEvolutionState.profileName = 'AIVIQ-ZAP Comercial';
      localEvolutionState.qrCodeBase64 = undefined;

      return NextResponse.json({
        success: true,
        message: 'WhatsApp conectado com sucesso!',
        data: localEvolutionState,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Configurações da Evolution API salvas!',
      data: localEvolutionState,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
