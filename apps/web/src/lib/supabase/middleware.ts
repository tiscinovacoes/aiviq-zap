import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() validates the JWT on the Supabase Auth server and handles token rotation/refresh
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      user = data.user;
    }
  } catch {
    user = null;
  }

  // CR-002 B1-R: o backdoor NUNCA é habilitado por env var ausente (isPlaceholder removido).
  // Exige dev local OU opt-in explícito. Em produção mal configurada, falha fechada.
  const allowDemo = process.env.NODE_ENV === 'development' || process.env.ALLOW_DEMO_LOGIN === 'true';
  const devToken = request.cookies.get('poli_dev_token')?.value;
  if (!user && allowDemo && devToken === 'mock-dev-token-jwt') {
    user = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@poli.dev',
      user_metadata: { full_name: 'Lucas Reis (Demo)' },
    } as any;
  }

  return { supabaseResponse, user, supabase };
}
