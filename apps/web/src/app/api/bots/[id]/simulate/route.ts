import { NextRequest, NextResponse } from 'next/server';
import { walkFlowForward } from '@/lib/bot/engine/walkFlowForward';
import { BotV1, SessionState } from '@/types/bot';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const bot: BotV1 = body.bot;
    const userMessage: string = body.message || '';
    const state: SessionState = body.state || {
      botId: params.id,
      variables: {},
    };

    const isFirstTurn = !userMessage && !state.currentGroupId;

    const result = await walkFlowForward(
      bot,
      isFirstTurn
        ? { type: 'start', eventId: bot.events[0]?.id || 'start' }
        : { type: 'edge', edgeId: state.pendingEdgeId || '' },
      {
        state: {
          ...state,
          lastInput: userMessage || undefined,
        },
      }
    );

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro na simulação do fluxo' },
      { status: 500 }
    );
  }
}
