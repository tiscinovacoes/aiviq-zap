import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('poli_token')?.value;

  // Rotas públicas que não exigem autenticação
  const isPublicRoute =
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico';

  // Se o usuário tentar acessar a raiz '/', redireciona com base no status do token
  if (pathname === '/') {
    if (token) {
      return NextResponse.redirect(new URL('/inbox', request.url));
    }
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Se não estiver autenticado e tentar rota protegida
  if (!token && !isPublicRoute) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Se já estiver autenticado e tentar acessar tela de login
  if (token && pathname === '/auth/login') {
    return NextResponse.redirect(new URL('/inbox', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
