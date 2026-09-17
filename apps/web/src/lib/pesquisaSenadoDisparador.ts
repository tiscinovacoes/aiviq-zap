import { createOrUpdateSessionByPhone } from './pesquisaSenadoStore';
import { gerarMensagem1 } from './pesquisaSenado';
import { sendRealMessage } from './evolutionService';
import { addBotDispatchedMessage } from './conversationStore';
import { sincronizarContatoEleitor } from './pesquisaContatoSync';

export interface ItemFilaDisparo {
  id: string;
  name: string;
  phone: string;
  bairro?: string;
  status: 'pendente' | 'enviado' | 'erro';
  enviadoEm?: string;
  erroMsg?: string;
}

export interface EstadoDisparador {
  ativo: boolean;
  pausado: boolean;
  total: number;
  enviados: number;
  erros: number;
  segundosRestantesProximo: number;
  contatoAtual?: { name: string; phone: string };
  fila: ItemFilaDisparo[];
}

declare global {
  // eslint-disable-next-line no-var
  var __aiviq_disparador_senado: EstadoDisparador | undefined;
  // eslint-disable-next-line no-var
  var __aiviq_disparador_timeout: NodeJS.Timeout | undefined;
}

if (!global.__aiviq_disparador_senado) {
  global.__aiviq_disparador_senado = {
    ativo: false,
    pausado: false,
    total: 0,
    enviados: 0,
    erros: 0,
    segundosRestantesProximo: 0,
    fila: [],
  };
}

export function getEstadoDisparador(): EstadoDisparador {
  return global.__aiviq_disparador_senado!;
}

// Sorteia delay entre 35 e 75 segundos conforme regra de ouro anti-ban
export function sortearDelaySegundos(min = 35, max = 75): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function carregarFila(itens: Array<{ name: string; phone: string; bairro?: string }>): EstadoDisparador {
  const filaFormatada: ItemFilaDisparo[] = itens.map((it, idx) => {
    const cleanPhone = it.phone.replace(/\D/g, '');
    const cleanName = it.name?.trim() || '';
    const bairro = it.bairro || 'Mato Grosso do Sul';

    // 1. Registra imediatamente o eleitor na sessão da Pesquisa para aparecer no Kanban
    try {
      createOrUpdateSessionByPhone(cleanPhone, cleanName, {
        bairro,
        etapa: 'disparado',
      });
    } catch (e) {
      console.error('[Disparador] Erro ao registrar sessão da pesquisa:', e);
    }

    // 2. Registra imediatamente a conversa no Inbox para acompanhamento ao vivo
    try {
      const msg1Previa = gerarMensagem1(cleanName);
      addBotDispatchedMessage({
        toPhone: cleanPhone,
        name: cleanName,
        text: msg1Previa,
        botName: 'Robô Pesquisa Senado',
      });
    } catch (e) {
      console.error('[Disparador] Erro ao registrar conversa no inbox:', e);
    }

    // 3. Registra e persiste imediatamente o contato e informações no Banco de Dados (CRM)
    try {
      sincronizarContatoEleitor({
        name: cleanName,
        phone: cleanPhone,
        bairro,
        etapa: 'disparado',
      });
    } catch (e) {
      console.error('[Disparador] Erro ao sincronizar contato no banco:', e);
    }

    return {
      id: `fila-${Date.now()}-${idx}`,
      name: cleanName,
      phone: cleanPhone,
      bairro,
      status: 'pendente',
    };
  });

  global.__aiviq_disparador_senado = {
    ativo: false,
    pausado: false,
    total: filaFormatada.length,
    enviados: 0,
    erros: 0,
    segundosRestantesProximo: 0,
    fila: filaFormatada,
  };

  return global.__aiviq_disparador_senado;
}

export function pausarDisparador(): EstadoDisparador {
  if (global.__aiviq_disparador_senado) {
    global.__aiviq_disparador_senado.pausado = true;
  }
  if (global.__aiviq_disparador_timeout) {
    clearTimeout(global.__aiviq_disparador_timeout);
    global.__aiviq_disparador_timeout = undefined;
  }
  return getEstadoDisparador();
}

export function pararDisparador(): EstadoDisparador {
  if (global.__aiviq_disparador_senado) {
    global.__aiviq_disparador_senado.ativo = false;
    global.__aiviq_disparador_senado.pausado = false;
    global.__aiviq_disparador_senado.segundosRestantesProximo = 0;
  }
  if (global.__aiviq_disparador_timeout) {
    clearTimeout(global.__aiviq_disparador_timeout);
    global.__aiviq_disparador_timeout = undefined;
  }
  return getEstadoDisparador();
}

export async function processarProximoDisparo(): Promise<void> {
  const estado = global.__aiviq_disparador_senado;
  if (!estado || !estado.ativo || estado.pausado) return;

  const proximo = estado.fila.find((it) => it.status === 'pendente');
  if (!proximo) {
    estado.ativo = false;
    estado.contatoAtual = undefined;
    estado.segundosRestantesProximo = 0;
    console.log('[Disparador Pesquisa Senado] Fila de disparos concluída com sucesso!');
    return;
  }

  estado.contatoAtual = { name: proximo.name, phone: proximo.phone };

  try {
    // 1. Cria ou reinicia a sessão de pesquisa do eleitor
    createOrUpdateSessionByPhone(proximo.phone, proximo.name, {
      bairro: proximo.bairro,
      etapa: 'disparado',
      voto1Id: undefined,
      voto1Nome: undefined,
      voto2Id: undefined,
      voto2Nome: undefined,
    });

    // 2. Dispara a Msg 1 com a saudação de acordo com o fuso de MS
    const msg1 = gerarMensagem1(proximo.name);
    const sent = await sendRealMessage(proximo.phone, msg1);

    // Registra a mensagem enviada no Inbox para o atendente acompanhar e assumir se quiser
    try {
      addBotDispatchedMessage({
        toPhone: proximo.phone,
        name: proximo.name,
        text: msg1,
        botName: 'Robô Pesquisa Senado',
      });
    } catch (inboxErr) {
      console.error('[Disparador Inbox Sync Error]:', inboxErr);
    }

    if (sent) {
      proximo.status = 'enviado';
      proximo.enviadoEm = new Date().toISOString();
      estado.enviados += 1;
      console.log(`[Disparador Pesquisa Senado] Msg 1 enviada para ${proximo.name} (${proximo.phone})`);
      
      sincronizarContatoEleitor({
        name: proximo.name,
        phone: proximo.phone,
        bairro: proximo.bairro,
        etapa: 'enviado',
      }).catch((e) => console.error('[Disparador] Erro ao atualizar status no banco:', e));
    } else {
      proximo.status = 'erro';
      proximo.erroMsg = 'Falha no envio pelo WhatsApp';
      estado.erros += 1;
      console.warn(`[Disparador Pesquisa Senado] Falha ao enviar para ${proximo.phone}`);

      sincronizarContatoEleitor({
        name: proximo.name,
        phone: proximo.phone,
        bairro: proximo.bairro,
        etapa: 'erro_envio',
      }).catch((e) => console.error('[Disparador] Erro ao atualizar status de erro no banco:', e));
    }
  } catch (err: any) {
    proximo.status = 'erro';
    proximo.erroMsg = err.message || 'Erro inesperado';
    estado.erros += 1;
  }

  // Se ainda existirem itens pendentes, agenda o próximo após intervalo de 35 a 75 segundos
  const temMais = estado.fila.some((it) => it.status === 'pendente');
  if (temMais && estado.ativo && !estado.pausado) {
    const delaySegundos = sortearDelaySegundos(35, 75);
    estado.segundosRestantesProximo = delaySegundos;
    console.log(`[Disparador Pesquisa Senado] Próximo disparo em ${delaySegundos} segundos (anti-ban ativado)...`);

    // Timer regressivo
    const decrementInterval = setInterval(() => {
      if (global.__aiviq_disparador_senado && global.__aiviq_disparador_senado.segundosRestantesProximo > 0) {
        global.__aiviq_disparador_senado.segundosRestantesProximo -= 1;
      } else {
        clearInterval(decrementInterval);
      }
    }, 1000);

    global.__aiviq_disparador_timeout = setTimeout(() => {
      clearInterval(decrementInterval);
      processarProximoDisparo();
    }, delaySegundos * 1000);
  } else {
    estado.ativo = false;
    estado.contatoAtual = undefined;
    estado.segundosRestantesProximo = 0;
  }
}

export function iniciarDisparador(): EstadoDisparador {
  const estado = getEstadoDisparador();
  if (estado.ativo && !estado.pausado) return estado;

  estado.ativo = true;
  estado.pausado = false;
  processarProximoDisparo();
  return estado;
}
