import { NextRequest, NextResponse } from 'next/server';
import {
  getPesquisaSessions,
  getPesquisaStats,
  getPesquisaSessionByPhone,
  createOrUpdateSessionByPhone,
  savePesquisaSession,
  aplicarRecorteFunil,
} from '@/lib/pesquisaSenadoStore';
import {
  gerarMensagem1,
  gerarMensagem2,
  gerarMensagem3,
  gerarMensagemSegundoVoto,
  gerarMensagemAgradecimento,
  validarVoto,
  obterCandidatoPorId,
} from '@/lib/pesquisaSenado';
import { sendRealMessageDetailed, resolveSendInstance } from '@/lib/evolutionService';
import { addBotDispatchedMessage } from '@/lib/conversationStore';
import { sincronizarContatoEleitor } from '@/lib/pesquisaContatoSync';
import { persistMessageByJid } from '@/lib/conversationRepo';
import { reserveDispatchSlot, releaseDispatchSlot, ANTIBAN } from '@/lib/antiBan';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Recorte do funil: disparos sem resposta anteriores a 19/09 ficam de fora.
    const sessions = aplicarRecorteFunil(await getPesquisaSessions());
    const stats = await getPesquisaStats(sessions);
    return NextResponse.json({
      success: true,
      sessions,
      stats,
    });
  } catch (error: any) {
    console.error('[API Pesquisa Senado GET Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao carregar pesquisa' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, phone, name, bairro, sendWhatsApp = true, voto1Id, voto2Id } = body;

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'O número de telefone é obrigatório' },
        { status: 400 }
      );
    }

    const cleanPhone = phone.replace(/\D/g, '');

    // Ação: Iniciar disparo da Pesquisa (Msg 1)
    if (!action || action === 'disparar') {
      const instance = body.instance || undefined;

      // ============ ANTI-BAN: não re-disparar a quem já está no fluxo ============
      const existente = await getPesquisaSessionByPhone(cleanPhone);
      if (
        existente &&
        existente.etapa !== 'disparado' &&
        !body.forcar
      ) {
        return NextResponse.json({
          success: true,
          gated: true,
          reason: 'ja_em_fluxo',
          message: `Contato já está na etapa "${existente.etapa}" — disparo pulado para não re-enviar.`,
          session: existente,
          dispatchedWhatsApp: false,
        });
      }

      // Instância que REALMENTE vai disparar — gate, envio e contador no mesmo chip.
      const instAlvo = await resolveSendInstance(instance);

      // ============ ANTI-BAN: janela de horário + teto diário/warmup ============
      if (sendWhatsApp) {
        const gate = await reserveDispatchSlot(instAlvo);
        if (!gate.ok) {
          const motivo =
            gate.reason === 'fora_horario'
              ? `Fora da janela de disparo (${ANTIBAN.HORA_INICIO}h–${ANTIBAN.HORA_FIM}h MS).`
              : `Teto diário do chip atingido (${gate.sentToday}/${gate.dailyCap}). Retome amanhã ou aumente o warmup.`;
          return NextResponse.json({
            success: true,
            gated: true,
            reason: gate.reason,
            sentToday: gate.sentToday,
            dailyCap: gate.dailyCap,
            message: motivo,
            dispatchedWhatsApp: false,
          });
        }
      }

      const session = await createOrUpdateSessionByPhone(cleanPhone, name || `Eleitor ${cleanPhone.slice(-4)}`, {
        bairro,
        etapa: 'disparado',
        voto1Id: undefined,
        voto1Nome: undefined,
        voto2Id: undefined,
        voto2Nome: undefined,
      });

      // Spintax semeado pelo telefone → cada lead recebe uma abertura diferente.
      const msg1 = gerarMensagem1(name, cleanPhone);

      let dispatched = false;
      let instanciaUsada: string | undefined = instAlvo;
      if (sendWhatsApp) {
        // Presença "digitando..." humaniza o disparo em massa (anti-ban).
        const r = await sendRealMessageDetailed(cleanPhone, msg1, instAlvo, ANTIBAN.PRESENCA_MS);
        dispatched = r.ok;
        instanciaUsada = r.instance;
        if (r.ok) {
          // slot ja reservado antes do envio (reserveDispatchSlot)
          // Persiste a Msg 1 no Supabase (keyed por JID) — grava a conversa de verdade.
          persistMessageByJid({
            phoneOrJid: cleanPhone,
            senderType: 'agent',
            content: msg1,
            name: name || session.name,
            externalId: r.messageId,
            instanceName: r.instance,
          }).catch((e) => console.error('[API Pesquisa] persist Msg1:', e));
        } else {
          // Envio falhou: nada saiu do chip, devolve o slot reservado.
          await releaseDispatchSlot(instAlvo);
        }
      }

      // Espelha no Inbox em memória (acompanhamento instantâneo do atendente).
      try {
        addBotDispatchedMessage({
          toPhone: cleanPhone,
          name: name || session.name,
          text: msg1,
          botName: 'Robô Pesquisa Senado',
          instanceName: instanciaUsada,
        });
      } catch (err) {
        console.error('[Pesquisa Manual Inbox Sync Error]:', err);
      }

      // Sincroniza imediatamente o contato com o banco de dados
      sincronizarContatoEleitor({
        name: session.name,
        phone: cleanPhone,
        bairro,
        etapa: 'disparado',
      }).catch((e) => console.error('[API Pesquisa] Erro sync contato:', e));

      return NextResponse.json({
        success: true,
        message: dispatched ? 'Pesquisa iniciada (Msg 1 enviada)' : 'Falha no envio pelo WhatsApp',
        session,
        dispatchedWhatsApp: dispatched,
      });
    }

    // Ação: Simulação de resposta no fluxo (ótimo para testes manuais no painel)
    if (action === 'simular_resposta') {
      const session = await createOrUpdateSessionByPhone(cleanPhone, name || 'Eleitor', {});

      if (session.etapa === 'disparado') {
        session.etapa = 'aguardando_voto1';
        await savePesquisaSession(session);
        sincronizarContatoEleitor({
          name: session.name,
          phone: cleanPhone,
          bairro: session.bairro,
          etapa: 'aguardando_voto1',
        }).catch((e) => console.error('[API Pesquisa] Erro sync contato:', e));

        return NextResponse.json({
          success: true,
          proximaMensagem: `${gerarMensagem2()}\n\n${gerarMensagem3()}`,
          session,
        });
      }

      if (session.etapa === 'aguardando_voto1' && voto1Id) {
        const c1 = obterCandidatoPorId(voto1Id);
        if (c1) {
          session.voto1Id = c1.id;
          session.voto1Nome = c1.nome;
          session.etapa = 'aguardando_voto2';
          await savePesquisaSession(session);
          sincronizarContatoEleitor({
            name: session.name,
            phone: cleanPhone,
            bairro: session.bairro,
            voto1Nome: c1.nome,
            etapa: 'aguardando_voto2',
          }).catch((e) => console.error('[API Pesquisa] Erro sync contato:', e));

          return NextResponse.json({
            success: true,
            proximaMensagem: gerarMensagemSegundoVoto(c1.id),
            session,
          });
        }
      }

      if (session.etapa === 'aguardando_voto2' && voto2Id) {
        const c2 = obterCandidatoPorId(voto2Id);
        if (c2) {
          session.voto2Id = c2.id;
          session.voto2Nome = c2.nome;
          session.etapa = 'concluido';
          await savePesquisaSession(session);
          sincronizarContatoEleitor({
            name: session.name,
            phone: cleanPhone,
            bairro: session.bairro,
            voto1Nome: session.voto1Nome,
            voto2Nome: c2.nome,
            etapa: 'concluido',
          }).catch((e) => console.error('[API Pesquisa] Erro sync contato:', e));

          return NextResponse.json({
            success: true,
            proximaMensagem: gerarMensagemAgradecimento(),
            session,
          });
        }
      }
    }

    return NextResponse.json({ success: false, error: 'Ação não reconhecida' }, { status: 400 });
  } catch (error: any) {
    console.error('[API Pesquisa Senado POST Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao processar ação' },
      { status: 500 }
    );
  }
}
