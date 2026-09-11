import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('poli_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // Check dev token fallback
  if (token === 'mock-dev-token-jwt') {
    return NextResponse.json({
      user: {
        id: '00000000-0000-0000-0000-000000000001',
        organization_id: '00000000-0000-0000-0000-000000000000',
        email: 'admin@poli.dev',
        full_name: 'Lucas Reis',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json({ error: 'Sessão expirada ou inválida' }, { status: 401 });
  }

  return NextResponse.json({ user });
}
