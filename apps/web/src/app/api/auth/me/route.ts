import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('poli_token')?.value;

  // Development / unprovisioned placeholder fallback
  const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');
  const allowDemo = process.env.NODE_ENV === 'development' || isPlaceholder || process.env.ALLOW_DEMO_LOGIN === 'true';

  if (allowDemo && token === 'mock-dev-token-jwt') {
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

  // Create server client per request reading user cookies (CR-001 B3)
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Sessão expirada ou inválida' }, { status: 401 });
  }

  // Fetch tenant profile information
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, organization_id, email, full_name, avatar_url, role, is_active')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    user: profile ? { ...user, ...profile } : user,
  });
}
