import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const loginSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido' }),
  password: z.string().min(6, { message: 'A senha deve ter no mínimo 6 caracteres' }),
  rememberMe: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = loginSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, password, rememberMe } = parseResult.data;

    // Supabase auth sign-in
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      // CR-002 B1-R: o backdoor NUNCA é habilitado por env var ausente (isPlaceholder removido).
      // Exige dev local OU opt-in explícito. Em produção mal configurada, falha fechada.
      const allowDemo = process.env.NODE_ENV === 'development' || process.env.ALLOW_DEMO_LOGIN === 'true';

      // Fallback demo account allowed only in development or explicit demo mode (ALLOW_DEMO_LOGIN)
      if (allowDemo && email === 'admin@poli.dev' && password === 'admin123') {
        const mockUser = {
          id: '00000000-0000-0000-0000-000000000001',
          organization_id: '00000000-0000-0000-0000-000000000000',
          email: 'admin@poli.dev',
          full_name: 'Lucas Reis',
          role: 'admin',
          is_active: true,
          created_at: new Date().toISOString(),
        };

        const response = NextResponse.json({
          success: true,
          message: 'Autenticado com sucesso (Dev Mode)',
          user: mockUser,
        });

        response.cookies.set('poli_token', 'mock-dev-token-jwt', {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
          maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24, // 30 dias ou 24h
        });

        response.cookies.set('poli_dev_token', 'mock-dev-token-jwt', {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
          maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24,
        });

        return response;
      }

      return NextResponse.json(
        { error: error?.message || 'E-mail ou senha incorretos' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      user: data.user,
    });

    // Set secure httpOnly cookie with token
    response.cookies.set('poli_token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24,
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro interno ao processar login' },
      { status: 500 }
    );
  }
}
