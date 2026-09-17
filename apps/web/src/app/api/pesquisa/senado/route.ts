import { NextRequest, NextResponse } from 'next/server';
import {
  getPesquisaSessions,
  getPesquisaStats,
  createOrUpdateSessionByPhone,
  savePesquisaSession,
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
import { sendRealMessage } from '@/lib/evolutionService';
import { addBotDispatchedMessage } from '@/lib/conversationStore';
import { sincronizarContatoEleitor } from '@/lib/pesquisaContatoSync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sessions = getPesquisaSessions();
    const stats = getPesquisaStats();
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
      const session = createOrUpdateSessionByPhone(cleanPhone, name || `Eleitor ${cleanPhone.slice(-4)}`, {
        bairro,
        etapa: 'disparado',
        voto1Id: undefined,
        voto1Nome: undefined,
        voto2Id: undefined,
        voto2Nome: undefined,
      });

      const msg1 = gerarMensagem1(name);

      let dispatched = false;
      if (sendWhatsApp) {
        dispatched = await sendRealMessage(cleanPhone, msg1);
      }

      // Registra a mensagem enviada no Inbox para o atendente acompanhar e intervir
      try {
        addBotDispatchedMessage({
          toPhone: cleanPhone,
          name: name || session.name,
          text: msg1,
          botName: 'Robô Pesquisa Senado',
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
        message: 'Pesquisa iniciada com sucesso (Msg 1 enviada)',
        session,
        dispatchedWhatsApp: dispatched,
      });
    }

    // Ação: Simulação de resposta no fluxo (ótimo para testes manuais no painel)
    if (action === 'simular_resposta') {
      const session = createOrUpdateSessionByPhone(cleanPhone, name || 'Eleitor', {});

      if (session.etapa === 'disparado') {
        session.etapa = 'aguardando_voto1';
        savePesquisaSession(session);
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
          savePesquisaSession(session);
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
          savePesquisaSession(session);
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
