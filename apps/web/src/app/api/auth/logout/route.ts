import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    // Continue even if signOut fails on remote
  }

  const response = NextResponse.json({ success: true, message: 'Desconectado com sucesso' });
  
  // Clear httpOnly cookie
  response.cookies.set('poli_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
