import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    if (!isPlaceholder) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const newVersion = (body.version || 3) + 1;

    return NextResponse.json({
      success: true,
      simulated: true,
      botId: params.id,
      publishedVersion: newVersion,
      publishedAt: new Date().toISOString(),
      message: `Versão ${newVersion} publicada em ambiente simulado (WhatsApp Cloud e Webchat).`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao publicar versão do bot' },
      { status: 500 }
    );
  }
}

