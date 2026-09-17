import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  listKnownInstances,
  registerInstance,
  isValidInstanceName,
  DEFAULT_INSTANCE,
} from '@/lib/instanceRegistry';
import { fetchLiveEvolutionInstances, EvolutionLiveInstance } from '@/lib/evolutionService';
import { getDispatchPool } from '@/lib/dispatchQueue';

import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

// Defesa em profundidade: exige usuário autenticado (a não ser em modo placeholder/local ou demo autorizado).
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

export interface InstanceView {
  instanceName: string;
  label: string;
  isDefault: boolean;
  status: EvolutionLiveInstance['status'];
  phoneNumber?: string;
  profileName?: string;
  profilePicUrl?: string;
  /** Participa do cluster de disparo (multiplo, por organizacao). */
  dispatchEnabled: boolean;
}

// GET: lista todas as instâncias conhecidas (registro local + servidor Evolution),
// com status de conexão real de cada número.
export async function GET() {
  try {
    const unauthorized = await requireUser();
    if (unauthorized) return unauthorized;

    const [live, pool] = await Promise.all([fetchLiveEvolutionInstances(), getDispatchPool()]);
    const liveByName = new Map(live.map((i) => [i.instanceName, i]));

    // Qualquer instância que exista no servidor mas não no registro local é auto-registrada,
    // para aparecer no seletor e permitir troca.
    for (const li of live) {
      if (!listKnownInstances().some((k) => k.instanceName === li.instanceName)) {
        registerInstance(li.instanceName, li.profileName || li.instanceName);
      }
    }

    const known = listKnownInstances();
    const instances: InstanceView[] = known.map((k) => {
      const l = liveByName.get(k.instanceName);
      return {
        instanceName: k.instanceName,
        label: k.label,
        isDefault: k.instanceName === DEFAULT_INSTANCE,
        status: l?.status || 'disconnected',
        phoneNumber: l?.phoneNumber,
        profileName: l?.profileName,
        profilePicUrl: l?.profilePicUrl,
        dispatchEnabled: pool[k.instanceName] !== false, // ausente = participa
      };
    });

    return NextResponse.json({ success: true, instances });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Erro ao listar instâncias' },
      { status: 500 }
    );
  }
}

// POST: cria uma nova instância (novo número) no servidor Evolution e a registra.
export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireUser();
    if (unauthorized) return unauthorized;

    const body = await req.json();
    const instanceName = String(body.instanceName || '').trim();
    const label = String(body.label || instanceName).trim();

    if (!isValidInstanceName(instanceName)) {
      return NextResponse.json(
        {
          success: false,
          error: 'invalid_name',
          message: 'Nome inválido. Use 3 a 48 caracteres: letras, números, _ ou -.',
        },
        { status: 400 }
      );
    }

    if (listKnownInstances().some((k) => k.instanceName === instanceName)) {
      return NextResponse.json(
        { success: false, error: 'exists', message: 'Já existe uma instância com esse nome.' },
        { status: 409 }
      );
    }

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'not_configured',
          message: 'Servidor Evolution não configurado (EVOLUTION_API_URL / EVOLUTION_API_KEY).',
        },
        { status: 400 }
      );
    }

    let qrCode: string | undefined;
    let pairingCode: string | undefined;

    try {
      const res = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
        signal: AbortSignal.timeout(8000),
      });

      const data = await res.json().catch(() => ({}));
      const rawBase64 = data?.qrcode?.base64 || data?.base64;
      if (rawBase64) {
        qrCode = rawBase64.startsWith('data:') ? rawBase64 : `data:image/png;base64,${rawBase64}`;
      }
      pairingCode = data?.qrcode?.pairingCode || data?.pairingCode;

      if (!res.ok && res.status !== 403 && res.status !== 409) {
        return NextResponse.json(
          {
            success: false,
            error: 'create_failed',
            message: `Servidor Evolution respondeu ${res.status} ao criar a instância.`,
          },
          { status: 502 }
        );
      }
    } catch (err: any) {
      return NextResponse.json(
        {
          success: false,
          error: 'unreachable',
          message: `Não foi possível contactar o servidor Evolution em ${EVOLUTION_API_URL}.`,
          details: err.message,
        },
        { status: 502 }
      );
    }

    const entry = registerInstance(instanceName, label);

    return NextResponse.json(
      { success: true, instance: entry, qrCode, pairingCode },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Erro ao criar instância' },
      { status: 500 }
    );
  }
}
