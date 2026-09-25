import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbContext } from '@/lib/supabase/authContext';
import { fecharCampanhaDoDia } from '@/lib/campanhaDiaria';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Mesmo esquema de autorização do /tick: cron da Vercel (Bearer CRON_SECRET),
// token por query, usuário autenticado no app, ou modo dev.
async function autorizado(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET || '';
  const tokenSecret = cronSecret || process.env.EVOLUTION_API_KEY || '';

  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer && cronSecret && safeEqual(bearer, cronSecret)) return true;

  const token = req.nextUrl.searchParams.get('token') || '';
  if (token && tokenSecret && safeEqual(token, tokenSecret)) return true;

  if (!tokenSecret) return true;

  try {
    const ctx = await getDbContext();
    if (ctx) return true;
  } catch {
    // ignore
  }

  return process.env.NODE_ENV !== 'production';
}

// POST /api/pesquisa/senado/fechar-dia — fecha o dia de disparo: cria a
// campanha de hoje com as metricas reais, cancela filas pendentes que
// sobraram e reseta os marcadores dos chips para o dia seguinte. Chamado
// pelo cron da Vercel todo dia as 21h (Campo Grande) -- ver vercel.json.
export async function POST(req: NextRequest) {
  const isAuth = await autorizado(req);
  if (!isAuth) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const r = await fecharCampanhaDoDia(typeof body.nome === 'string' ? body.nome : undefined);
    return NextResponse.json({ success: r.ok, ...r });
  } catch (err: any) {
    console.error('[fechar-dia] erro:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
