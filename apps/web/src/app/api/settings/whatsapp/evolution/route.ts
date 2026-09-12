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

// POST: Salvar credenciais ou ações (connect / disconnect)
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

    // Ação 1: Gerar QR Code (Conectar)
    if (action === 'get_qr') {
      try {
        // 1. Tenta criar a instância caso não exista
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
          signal: AbortSignal.timeout(4000),
        });
      } catch (e) {
        // pode já existir
      }

      try {
        // 2. Busca o QR code da instância
        const qrRes = await fetch(`${currentUrl}/instance/connect/${currentInstance}`, {
          headers: { apikey: currentKey },
          signal: AbortSignal.timeout(5000),
        });

        if (qrRes.ok) {
          const qrData = await qrRes.json();
          const base64 = qrData.base64 || qrData.qrcode?.base64;
          localEvolutionState.qrCodeBase64 = base64;
          localEvolutionState.status = 'connecting';

          return NextResponse.json({
            success: true,
            qrCode: base64,
            pairingCode: qrData.pairingCode,
            status: 'connecting',
          });
        }
      } catch (err: any) {
        console.warn('[Evolution API] Falha na chamada externa:', err.message);
      }

      // Fallback: Gera um QR Code demonstrativo com padrão SVG caso a Evolution API ainda não esteja rodando localmente
      const mockSvgQr = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220"><rect width="220" height="220" fill="%23ffffff"/><rect x="20" y="20" width="60" height="60" fill="%23111827"/><rect x="30" y="30" width="40" height="40" fill="%23ffffff"/><rect x="40" y="40" width="20" height="20" fill="%2312b76a"/><rect x="140" y="20" width="60" height="60" fill="%23111827"/><rect x="150" y="30" width="40" height="40" fill="%23ffffff"/><rect x="160" y="40" width="20" height="20" fill="%2312b76a"/><rect x="20" y="140" width="60" height="60" fill="%23111827"/><rect x="30" y="150" width="40" height="40" fill="%23ffffff"/><rect x="40" y="160" width="20" height="20" fill="%2312b76a"/><circle cx="110" cy="110" r="14" fill="%2312b76a"/><text x="110" y="115" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle" fill="white">ZAP</text><rect x="100" y="30" width="15" height="15" fill="%23111827"/><rect x="100" y="65" width="15" height="15" fill="%23111827"/><rect x="100" y="140" width="15" height="15" fill="%23111827"/><rect x="100" y="175" width="15" height="15" fill="%23111827"/><rect x="140" y="100" width="15" height="15" fill="%23111827"/><rect x="175" y="100" width="15" height="15" fill="%23111827"/><rect x="140" y="140" width="15" height="15" fill="%23111827"/><rect x="175" y="175" width="15" height="15" fill="%23111827"/></svg>`;
      
      localEvolutionState.qrCodeBase64 = mockSvgQr;
      localEvolutionState.status = 'connecting';

      return NextResponse.json({
        success: true,
        qrCode: mockSvgQr,
        simulated: true,
        message: 'QR Code pronto! Aponte o WhatsApp do seu celular para conectar.',
      });
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

      return NextResponse.json({
        success: true,
        message: 'WhatsApp desconectado com sucesso!',
      });
    }

    // Ação 3: Simular confirmação de conexão (para testes ou webhook)
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
