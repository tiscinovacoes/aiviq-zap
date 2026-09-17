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

    // 4. Mescla conversas do banco/Evolution com as locais (Pesquisas/Campanhas/Bot),
    //    deduplicando pelo MESMO contato. Chave canônica BR colapsa a variação do
    //    9º dígito (o WhatsApp resolve nº de 13→12 dígitos) e o LID vs número real,
    //    evitando diálogos duplicados do mesmo cidadão.
    const canonicalKey = (c: Conversation): string => {
      const d = String(c.contact?.phone || c.id || '').replace(/\D/g, '');
      if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
        return '55' + d.slice(2, 4) + d.slice(4).slice(-8); // 55 + DDD + 8 finais
      }
      return d || c.id;
    };

    const memoryChats = getAllConversations(instance);
    const byKey = new Map<string, Conversation>();
    const upsert = (c: Conversation, isReal: boolean) => {
      const key = canonicalKey(c);
      const ex = byKey.get(key);
      if (!ex) {
        byKey.set(key, c);
        return;
      }
      const unread = Math.max(ex.unread_count || 0, c.unread_count || 0);
      // Prefere o diálogo "real" (Evolution/banco) e/ou o JID de número real.
      const preferC = isReal || (c.id.includes('@s.whatsapp.net') && !ex.id.includes('@s.whatsapp.net'));
      const base = preferC ? c : ex;
      const other = preferC ? ex : c;
      const goodName =
        base.contact?.name && !base.contact.name.startsWith('WhatsApp')
          ? base.contact
          : other.contact || base.contact;
      byKey.set(key, { ...base, unread_count: unread, contact: goodName });
    };

    for (const m of memoryChats) upsert(m, false);
    for (const c of dbOrRealConversations) upsert(c, true);

    let conversations: Conversation[] = Array.from(byKey.values());

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
