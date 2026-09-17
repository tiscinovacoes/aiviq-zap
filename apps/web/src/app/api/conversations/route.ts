import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Conversation } from '@/types';
import { getAllConversations, clearWhatsAppConversations, ensurePesquisaConversation } from '@/lib/conversationStore';
import { getRealConversations, isEvolutionConnected } from '@/lib/evolutionService';
import { getPesquisaSessions } from '@/lib/pesquisaSenadoStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const channel = searchParams.get('channel');
    const query = searchParams.get('q')?.toLowerCase();
    const instance = searchParams.get('instance') || undefined;

    const supabase = await createClient();
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');

    let dbOrRealConversations: Conversation[] = [];
    const isConnected = await isEvolutionConnected(instance);

    // 1. Se houver banco Supabase conectado, tenta buscar
    if (!isPlaceholder) {
      try {
        const { data: dbConversations } = await supabase
          .from('conversations')
          .select('*, contact:contacts(*), assignee:profiles(*)');

        if (dbConversations && dbConversations.length > 0) {
          dbOrRealConversations = dbConversations as unknown as Conversation[];
        }
      } catch (e) {
        // Fallback para Evolution API
      }
    }

    // 2. Se não houver conversas do banco, busca as conversas REAIS da Evolution API se conectada
    if (dbOrRealConversations.length === 0 && isConnected) {
      try {
        const realChats = await getRealConversations(instance);
        dbOrRealConversations = realChats;
      } catch (e) {
        console.error('[API conversations] Erro ao buscar conversas da Evolution:', e);
      }
    }

    // 3. Garante que todas as sessões da Pesquisa Eleitoral tenham suas conversas prontas para o Inbox
    try {
      const sessions = await getPesquisaSessions();
      for (const s of sessions) {
        ensurePesquisaConversation({
          phone: s.phone,
          name: s.name,
          bairro: s.bairro,
          etapa: s.etapa,
          voto1Nome: s.voto1Nome,
          voto1Id: s.voto1Id,
          voto2Nome: s.voto2Nome,
          voto2Id: s.voto2Id,
        });
      }
    } catch (e) {
      console.error('[API conversations] Erro ao carregar sessões de pesquisa:', e);
    }

    // 4. Mescla conversas do banco/Evolution com conversas locais da plataforma (Pesquisas, Campanhas e Bot)
    const memoryChats = getAllConversations(instance);
    const map = new Map<string, Conversation>();

    for (const m of memoryChats) {
      map.set(m.id, m);
    }
    for (const c of dbOrRealConversations) {
      map.set(c.id, c);
    }

    let conversations: Conversation[] = Array.from(map.values());

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
      whatsapp_connected: isConnected,
      conversations,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao listar conversas', message: err.message },
      { status: 500 }
    );
  }
}
