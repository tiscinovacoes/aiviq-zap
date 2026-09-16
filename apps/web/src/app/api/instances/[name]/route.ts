import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  isValidInstanceName,
  unregisterInstance,
  DEFAULT_INSTANCE,
} from '@/lib/instanceRegistry';
import { invalidateEvolutionCache } from '@/lib/evolutionService';

import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

async function requireUser(req?: NextRequest): Promise<NextResponse | null> {
  const isPlaceholder =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');
  if (isPlaceholder) return null;

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

function serverReady(): NextResponse | null {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'not_configured', message: 'Servidor Evolution não configurado.' },
      { status: 400 }
    );
  }
  return null;
}

// POST: ações sobre um número específico — get_qr | disconnect | status
export async function POST(req: NextRequest, { params }: { params: { name: string } }) {
  try {
    const unauthorized = await requireUser();
    if (unauthorized) return unauthorized;

    const instanceName = decodeURIComponent(params.name);
    if (!isValidInstanceName(instanceName)) {
      return NextResponse.json({ success: false, error: 'invalid_name' }, { status: 400 });
    }

    const notReady = serverReady();
    if (notReady) return notReady;

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Gera/renova QR Code real para conectar este número
    if (action === 'get_qr') {
      // Garante que a instância exista (idempotente — ignora 403/409 "já existe")
      try {
        await fetch(`${EVOLUTION_API_URL}/instance/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
          signal: AbortSignal.timeout(6000),
        });
      } catch {}

      try {
        const qrRes = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
          headers: { apikey: EVOLUTION_API_KEY },
          signal: AbortSignal.timeout(6000),
        });
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          const raw = qrData.base64 || qrData.qrcode?.base64;
          if (raw) {
            const base64Clean = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
            return NextResponse.json({
              success: true,
              status: 'connecting',
              qrCode: base64Clean,
              pairingCode: qrData.pairingCode || qrData.qrcode?.pairingCode,
              message: 'QR Code gerado. Aponte o WhatsApp do número.',
            });
          }
        }
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: 'server_offline', message: err.message },
          { status: 502 }
        );
      }

      return NextResponse.json(
        { success: false, error: 'no_qr', message: 'Não foi possível obter o QR Code.' },
        { status: 502 }
      );
    }

    // Desconecta (logout) o número, mantendo a instância registrada
    if (action === 'disconnect') {
      try {
        await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: { apikey: EVOLUTION_API_KEY },
          signal: AbortSignal.timeout(5000),
        });
      } catch {}
      invalidateEvolutionCache(instanceName);
      return NextResponse.json({ success: true, message: 'Número desconectado.' });
    }

    // Status atual da conexão
    if (action === 'status') {
      try {
        const res = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
          headers: { apikey: EVOLUTION_API_KEY },
          signal: AbortSignal.timeout(4000),
        });
        const data = await res.json().catch(() => ({}));
        const state = data?.instance?.state || data?.state || 'disconnected';
        invalidateEvolutionCache(instanceName);
        return NextResponse.json({ success: true, state });
      } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 502 });
      }
    }

    return NextResponse.json({ success: false, error: 'unknown_action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE: remove por completo a instância do servidor Evolution e do registro.
export async function DELETE(req: NextRequest, { params }: { params: { name: string } }) {
  try {
    const unauthorized = await requireUser();
    if (unauthorized) return unauthorized;

    const instanceName = decodeURIComponent(params.name);
    if (!isValidInstanceName(instanceName)) {
      return NextResponse.json({ success: false, error: 'invalid_name' }, { status: 400 });
    }
    if (instanceName === DEFAULT_INSTANCE) {
      return NextResponse.json(
        { success: false, error: 'default_locked', message: 'A instância padrão não pode ser removida.' },
        { status: 400 }
      );
    }

    const notReady = serverReady();
    if (!notReady) {
      // logout + delete no servidor Evolution (best-effort)
      try {
        await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: { apikey: EVOLUTION_API_KEY },
          signal: AbortSignal.timeout(5000),
        });
      } catch {}
      try {
        await fetch(`${EVOLUTION_API_URL}/instance/delete/${instanceName}`, {
          method: 'DELETE',
          headers: { apikey: EVOLUTION_API_KEY },
          signal: AbortSignal.timeout(5000),
        });
      } catch {}
    }

    invalidateEvolutionCache(instanceName);
    unregisterInstance(instanceName);

    return NextResponse.json({ success: true, message: 'Instância removida.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
