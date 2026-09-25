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
  //
  // CORRECAO 21/09/2026 (auditoria A0): antes, com ALLOW_DEMO_LOGIN=true QUALQUER
  // visitante anonimo virava "usuario demo" aqui (e ganhava os cookies), o que
  // liberava paginas E APIs sem login -- inclusive dados de eleitores e o envio
  // de WhatsApp. Agora o demo so vale:
  //   - em desenvolvimento local (NODE_ENV=development), auto-login como antes; ou
  //   - se a requisicao JA traz o cookie que a rota /api/auth/login so emite
  //     depois de validar admin@poli.dev/admin123 (opt-in ALLOW_DEMO_LOGIN).
  const isDev = process.env.NODE_ENV === 'development';
  const demoOptIn = process.env.ALLOW_DEMO_LOGIN === 'true';
  const devToken = request.cookies.get('poli_dev_token')?.value;
  const demoCookieOk = devToken === 'mock-dev-token-jwt';
  if (!user && (isDev || (demoOptIn && demoCookieOk))) {
    user = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@poli.dev',
      user_metadata: { full_name: 'Lucas Reis (AIVIQ-ZAP)' },
    } as any;

    // Cookies automaticos so em dev local; em prod quem os emite e o login.
    if (isDev && !demoCookieOk) {
      supabaseResponse.cookies.set('poli_dev_token', 'mock-dev-token-jwt', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
      supabaseResponse.cookies.set('poli_token', 'mock-dev-token-jwt', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }
  }

  return { supabaseResponse, user, supabase };
}
