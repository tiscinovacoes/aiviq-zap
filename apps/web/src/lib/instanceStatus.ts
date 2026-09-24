// Regra de status das instancias da Evolution, sem dependencias: testavel
// isolada (__tests__/instance-status.test.ts) e usada por evolutionService.

export type StatusInstancia = 'connected' | 'connecting' | 'disconnected';

/**
 * O chip ja levou logout definitivo (401 / device_removed) em algum momento.
 *
 * ATENCAO: a Evolution grava disconnectionReasonCode/disconnectionObject no
 * logout e NAO limpa esses campos quando o chip reconecta por QR -- o update de
 * `connection === 'open'` so mexe em ownerJid, profileName, profilePicUrl e
 * connectionStatus. Entao isso sozinho nao prova que o chip esta fora: prova so
 * que ele ja caiu uma vez.
 */
export function teveLogoutDefinitivo(rawObj?: any): boolean {
  return (
    rawObj?.disconnectionReasonCode === 401 ||
    Boolean(rawObj?.disconnectionObject && String(rawObj.disconnectionObject).includes('device_removed'))
  );
}

/**
 * Status de uma linha do /instance/fetchInstances.
 *
 * `open` manda: um chip que levou logout e foi reconectado por QR volta como
 * `open` com o 401 antigo ainda gravado (ver teveLogoutDefinitivo). Tratar esse
 * 401 como verdade deixava o chip reconectado "Desconectado" para sempre -- fora
 * do disparo mesmo com o aparelho mostrando "Ativo". Quem confirma um `open`
 * com logout antigo e o /instance/connectionState (precisaConfirmar).
 */
export function mapConnectionStatus(raw?: string, rawObj?: any): StatusInstancia {
  if (raw === 'open') return 'connected';
  if (teveLogoutDefinitivo(rawObj)) return 'disconnected';
  if (raw === 'connecting') return 'connecting';
  return 'disconnected';
}

/** Linhas cujo status a lista nao garante e o /instance/connectionState deve confirmar. */
export function precisaConfirmar(raw?: string, rawObj?: any): boolean {
  return raw === 'connecting' || (raw === 'open' && teveLogoutDefinitivo(rawObj));
}
