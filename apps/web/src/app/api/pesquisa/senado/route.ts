import { NextRequest, NextResponse } from 'next/server';
import {
  getPesquisaSessions,
  getPesquisaStats,
  getPesquisaSessionByPhone,
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
import { sendRealMessageDetailed, resolveSendInstance } from '@/lib/evolutionService';
import { addBotDispatchedMessage } from '@/lib/conversationStore';
import { sincronizarContatoEleitor } from '@/lib/pesquisaContatoSync';
import { persistMessageByJid } from '@/lib/conversationRepo';
import { reserveDispatchSlot, releaseDispatchSlot, ANTIBAN } from '@/lib/antiBan';
import { getDispatchErrorForPhone } from '@/lib/dispatchQueue';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sessions = await getPesquisaSessions();
    const stats = await getPesquisaStats();
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

      // ============ ANTI-BAN: banco de erros bloqueia automaticamente ============
      // Numero que ja esgotou 3 tentativas no disparo em massa (dispatch_queue
      // status 'erro') e bloqueado aqui tambem -- mesmo que nunca tenha existido
      // sessao de pesquisa para ele (ela so nasce em envio com sucesso). Sem
      // isso, um numero comprovadamente sem WhatsApp voltava a ser tentado
      // pelo formulario manual mesmo depois de bloqueado pelo disparo em lote.
      const erroAnterior = await getDispatchErrorForPhone(cleanPhone);
      if (erroAnterior && !body.forcar) {
        return NextResponse.json({
          success: true,
          gated: true,
          reason: 'banco_de_erros',
          message: `Número já deu erro em um disparo anterior (${erroAnterior.error || 'falha de entrega'}) — bloqueado automaticamente para não arriscar ban. Use "Tentar Novamente" na auditoria de falhas se quiser reabordar.`,
          dispatchedWhatsApp: false,
        });
      }

      // ============ ANTI-BAN: não re-disparar a quem já foi abordado ============
      // Qualquer sessao existente (inclusive etapa 'disparado', que e o proprio
      // registro de "Msg 1 ja enviada") bloqueia um novo disparo. Antes so
      // etapa !== 'disparado' bloqueava -- ou seja, quem tinha acabado de
      // receber a Msg 1 e ainda nao respondeu (o caso mais comum de "esse
      // numero reapareceu na lista") passava direto e levava um segundo
      // disparo, o sinal mais classico de spam para a Meta.
      const existente = await getPesquisaSessionByPhone(cleanPhone);
      if (existente && !body.forcar) {
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

      // Spintax semeado pelo telefone → cada lead recebe uma abertura diferente.
      const msg1 = gerarMensagem1(name, cleanPhone);
      const nomeExibicao = name || existente?.name || `Eleitor ${cleanPhone.slice(-4)}`;

      let dispatched = false;
      let instanciaUsada: string | undefined = instAlvo;
      let session = existente;

      if (sendWhatsApp) {
        // Presença "digitando..." humaniza o disparo em massa (anti-ban).
        const r = await sendRealMessageDetailed(cleanPhone, msg1, instAlvo, ANTIBAN.PRESENCA_MS);
        dispatched = r.ok;
        instanciaUsada = r.instance;
        if (r.ok) {
          // slot ja reservado antes do envio (reserveDispatchSlot)
          // So registra 'disparado' -- o que a checagem anti-ban acima usa
          // para bloquear um proximo disparo -- depois de confirmar que a
          // mensagem realmente saiu. Assim uma falha de envio nao fica
          // marcada como "ja abordado" e trava um reenvio legitimo.
          session = await createOrUpdateSessionByPhone(cleanPhone, nomeExibicao, {
            bairro,
            etapa: 'disparado',
            voto1Id: undefined,
            voto1Nome: undefined,
            voto2Id: undefined,
            voto2Nome: undefined,
          });

          // Persiste a Msg 1 no Supabase (keyed por JID) — grava a conversa de verdade.
          persistMessageByJid({
            phoneOrJid: cleanPhone,
            senderType: 'agent',
            content: msg1,
            name: nomeExibicao,
            externalId: r.messageId,
            instanceName: r.instance,
          }).catch((e) => console.error('[API Pesquisa] persist Msg1:', e));

          // Espelha no Inbox em memória (acompanhamento instantâneo do atendente).
          try {
            addBotDispatchedMessage({
              toPhone: cleanPhone,
              name: nomeExibicao,
              text: msg1,
              botName: 'Robô Pesquisa Senado',
              instanceName: instanciaUsada,
            });
          } catch (err) {
            console.error('[Pesquisa Manual Inbox Sync Error]:', err);
          }

          // Sincroniza imediatamente o contato com o banco de dados
          sincronizarContatoEleitor({
            name: nomeExibicao,
            phone: cleanPhone,
            bairro,
            etapa: 'disparado',
          }).catch((e) => console.error('[API Pesquisa] Erro sync contato:', e));
        } else {
          // Envio falhou: nada saiu do chip, devolve o slot reservado.
          await releaseDispatchSlot(instAlvo);
        }
      } else {
        // Registro manual sem envio real (uso interno/API): mantem o
        // comportamento anterior de so anotar a sessao.
        session = await createOrUpdateSessionByPhone(cleanPhone, nomeExibicao, {
          bairro,
          etapa: 'disparado',
          voto1Id: undefined,
          voto1Nome: undefined,
          voto2Id: undefined,
          voto2Nome: undefined,
        });
      }

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
