import { NextRequest, NextResponse } from 'next/server';
import { resolveSendInstance, fetchInstanceMessagesRaw } from '@/lib/evolutionService';
import { reconcileEvolutionRecords } from '@/lib/conversationRepo';
import { isPlaceholderEnv } from '@/lib/supabase/authContext';

export const dynamic = 'force-dynamic';

// Rede de segurança: puxa o histórico armazenado pela Evolution (resolvendo o
// telefone real do LID) e grava no Supabase o que faltar — garante que TODA
// resposta fique gravada mesmo se um evento de webhook for perdido, e recupera
// respostas antigas. Throttle no servidor para o poll do Inbox não martelar.
let lastRun = 0;

export async function GET(req: NextRequest) {
  if (isPlaceholderEnv()) {
    return NextResponse.json({ success: true, skipped: 'placeholder' });
  }

  const force = req.nextUrl.searchParams.get('force') === '1';
  const now = Date.now();
  if (!force && now - lastRun < 15000) {
    return NextResponse.json({ success: true, throttled: true });
  }
  lastRun = now;

  try {
    const requested = req.nextUrl.searchParams.get('instance') || undefined;
    const inst = await resolveSendInstance(requested);
    const records = await fetchInstanceMessagesRaw(inst);
    const { persisted, scanned } = await reconcileEvolutionRecords(records, inst);
    return NextResponse.json({ success: true, instance: inst, scanned, persisted });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
