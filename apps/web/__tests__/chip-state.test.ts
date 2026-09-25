import { describe, it, expect } from 'vitest';
import { classificarChip } from '../src/lib/chipState';

const AGORA = Date.parse('2026-09-21T15:00:00Z');
const DAQUI_1H = '2026-09-21T16:00:00Z';
const HA_1H = '2026-09-21T14:00:00Z';

describe('chipState: classificarChip', () => {
  it('chip conectado e sem cooldown esta online', () => {
    expect(classificarChip({ status: 'connected' }, AGORA).estado).toBe('online');
  });

  it('conectando e desconectado', () => {
    expect(classificarChip({ status: 'connecting' }, AGORA).estado).toBe('conectando');
    expect(classificarChip({ status: 'disconnected' }, AGORA).estado).toBe('caiu');
  });

  it('caiu: o texto orienta reconectar com o MESMO IP', () => {
    const r = classificarChip({ status: 'disconnected' }, AGORA);
    expect(r.motivo.toLowerCase()).toContain('mesmo ip');
  });

  it('cooldown por ack recusado ou falhas seguidas = recusando (mesmo conectado)', () => {
    for (const motivo of ['entrega_recusada', 'falhas_seguidas', 'circuit_breaker_2_erros_consecutivos']) {
      const r = classificarChip({ status: 'connected', cooldownAte: DAQUI_1H, cooldownMotivo: motivo }, AGORA);
      expect(r.estado).toBe('recusando');
    }
  });

  it('recusando avisa para NAO trocar o IP', () => {
    const r = classificarChip({ status: 'connected', cooldownAte: DAQUI_1H, cooldownMotivo: 'entrega_recusada' }, AGORA);
    expect(r.motivo.toLowerCase()).toContain('não troque o ip');
  });

  it('pausa de lote e rotina, nao e recusa', () => {
    const r = classificarChip({ status: 'connected', cooldownAte: DAQUI_1H, cooldownMotivo: 'pausa_de_lote' }, AGORA);
    expect(r.estado).toBe('online');
  });

  it('cooldown que ja venceu nao conta', () => {
    const r = classificarChip({ status: 'connected', cooldownAte: HA_1H, cooldownMotivo: 'entrega_recusada' }, AGORA);
    expect(r.estado).toBe('online');
  });

  it('instancia duplicada do mesmo numero tem prioridade sobre tudo', () => {
    const r = classificarChip(
      { status: 'connected', duplicateOf: '67992143047', cooldownAte: DAQUI_1H, cooldownMotivo: 'entrega_recusada' },
      AGORA
    );
    expect(r.estado).toBe('duplicada');
    expect(r.motivo).toContain('67992143047');
  });
});
