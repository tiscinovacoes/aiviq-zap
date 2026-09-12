import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas públicas que não exigem autenticação
  const isPublicRoute =
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico';

  // Validação real de sessão com Supabase Auth e renovação automática de token (CR-001 B2, I5)
  const { supabaseResponse, user } = await updateSession(request);

  // Se o usuário tentar acessar a raiz '/', redireciona com base no status da sessão real
  if (pathname === '/') {
    if (user) {
      return NextResponse.redirect(new URL('/inbox', request.url));
    }
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Se não estiver autenticado e tentar rota protegida
  if (!user && !isPublicRoute) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Se já estiver autenticado e tentar acessar tela de login
  if (user && pathname === '/auth/login') {
    return NextResponse.redirect(new URL('/inbox', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
