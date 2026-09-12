import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Conversation } from '@/types';
import { getAllConversations } from '@/lib/conversationStore';
import { getRealConversations } from '@/lib/evolutionService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const channel = searchParams.get('channel');
    const query = searchParams.get('q')?.toLowerCase();

    const supabase = await createClient();
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let conversations: Conversation[] = [];

    // 1. Se houver banco Supabase conectado, tenta buscar
    if (!isPlaceholder) {
      try {
        const { data: dbConversations } = await supabase
          .from('conversations')
          .select('*, contact:contacts(*), assignee:profiles(*)');

        if (dbConversations && dbConversations.length > 0) {
          conversations = dbConversations as unknown as Conversation[];
        }
      } catch (e) {
        // Fallback para Evolution API
      }
    }

    // 2. Se não houver conversas do banco, busca as conversas REAIS da Evolution API
    if (conversations.length === 0) {
      const realChats = await getRealConversations();
      const memoryChats = getAllConversations();

      // Mescla chats em memória (mensagens recebidas recentes) com os chats reais da Evolution
      const map = new Map<string, Conversation>();

      for (const m of memoryChats) {
        map.set(m.id, m);
      }

      for (const r of realChats) {
        if (!map.has(r.id)) {
          map.set(r.id, r);
        }
      }

      conversations = Array.from(map.values());
    }

    // Apply query filters
    if (status) {
      conversations = conversations.filter((c) => c.status === status);
    }
    if (channel && channel !== 'all') {
      conversations = conversations.filter((c) => c.channel_type === channel);
    }
    if (query) {
      conversations = conversations.filter(
        (c) =>
          c.contact?.name.toLowerCase().includes(query) ||
          c.contact?.phone?.includes(query) ||
          c.last_message_preview?.toLowerCase().includes(query) ||
          c.contact?.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    return NextResponse.json({
      success: true,
      count: conversations.length,
      conversations,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao listar conversas', message: err.message },
      { status: 500 }
    );
  }
}
