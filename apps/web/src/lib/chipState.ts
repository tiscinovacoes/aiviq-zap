// ============================================================================
// Estado de saude de um chip para o painel. Funcao PURA (sem servidor).
//
// Tres situacoes que o operador precisa distinguir, porque o que fazer em cada
// uma e diferente (ver RUNBOOK_IP_FIXO_POR_CHIP.md):
//   caiu       -> reconectar por QR, MESMO IP, sem trocar nada;
//   recusando  -> deixar resfriar (o circuit breaker ja pausou o chip);
//   banido     -> nao ha como detectar sozinho: e o operador que aposenta.
// ============================================================================

export type EstadoChip = 'online' | 'conectando' | 'caiu' | 'recusando' | 'duplicada';

export interface EntradaEstado {
  status: 'connected' | 'connecting' | 'disconnected';
  cooldownAte?: string | null;
  cooldownMotivo?: string | null;
  /** Outra instancia ja esta vinculada ao MESMO numero. */
  duplicateOf?: string | null;
}

export interface SaidaEstado {
  estado: EstadoChip;
  /** Frase curta para o painel (tooltip). */
  motivo: string;
}

/** Cooldowns que significam "o WhatsApp esta recusando as mensagens deste chip". */
function ehRecusa(motivo?: string | null): boolean {
  if (!motivo) return false;
  return (
    motivo === 'entrega_recusada' ||
    motivo === 'falhas_seguidas' ||
    motivo.startsWith('circuit_breaker')
  );
}

export function classificarChip(i: EntradaEstado, agora: number = Date.now()): SaidaEstado {
  if (i.duplicateOf) {
    return {
      estado: 'duplicada',
      motivo: `Mesmo número de "${i.duplicateOf}". Duas sessões da mesma conta derrubam uma à outra; apague esta.`,
    };
  }

  const emCooldown = Boolean(i.cooldownAte) && Date.parse(String(i.cooldownAte)) > agora;
  if (emCooldown && ehRecusa(i.cooldownMotivo)) {
    return {
      estado: 'recusando',
      motivo: 'O WhatsApp está recusando as mensagens deste chip. Ele resfria sozinho; não troque o IP.',
    };
  }

  if (i.status === 'connected') return { estado: 'online', motivo: 'Conectado.' };
  if (i.status === 'connecting') return { estado: 'conectando', motivo: 'Conectando…' };
  return {
    estado: 'caiu',
    motivo: 'Desconectado. Reconecte por QR com o mesmo IP. Se o celular mostrar conta banida, aposente o chip.',
  };
}
