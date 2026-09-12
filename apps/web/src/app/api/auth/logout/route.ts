import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (err) {
    // Continue even if signOut fails on remote
  }

  const response = NextResponse.json({ success: true, message: 'Desconectado com sucesso' });
  
  // Clear all auth cookies (poli_token, poli_dev_token, and Supabase SSR cookies)
  const cookiesToClear = ['poli_token', 'poli_dev_token', 'sb-access-token', 'sb-refresh-token'];
  cookiesToClear.forEach((cookieName) => {
    response.cookies.set(cookieName, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  });

  return response;
}
