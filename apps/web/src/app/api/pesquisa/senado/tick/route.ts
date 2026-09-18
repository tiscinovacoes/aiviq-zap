import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbContext } from '@/lib/supabase/authContext';
import { runTickCore } from '@/lib/pesquisaSenadoDispatcher';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Autoriza a chamada do cron ou runner de segundo plano:
// 1. Bearer <CRON_SECRET> da Vercel
// 2. Query param ?token=
// 3. Usuário autenticado na sessão do app (permite que o runner global em 2º plano mantenha os disparos)
// 4. Modo desenvolvimento
async function autorizado(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET || '';
  const tokenSecret = cronSecret || process.env.EVOLUTION_API_KEY || '';

  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer && cronSecret && safeEqual(bearer, cronSecret)) return true;

  const token = req.nextUrl.searchParams.get('token') || '';
  if (token && tokenSecret && safeEqual(token, tokenSecret)) return true;

  // Se não houver segredo configurado no ambiente
  if (!tokenSecret) return true;

  // Permite chamada do runner em segundo plano de usuário autenticado
  try {
    const ctx = await getDbContext();
    if (ctx) return true;
  } catch {
    // ignore
  }

  return process.env.NODE_ENV !== 'production';
}

async function handleRequest(req: NextRequest) {
  const isAuth = await autorizado(req);
  if (!isAuth) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  const force =
    req.nextUrl.searchParams.get('force') === 'true' ||
    req.nextUrl.searchParams.get('bypass') === 'true';

  const result = await runTickCore({ bypassHorario: force, forceNow: force });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
