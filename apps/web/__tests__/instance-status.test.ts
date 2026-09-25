import { describe, it, expect } from 'vitest';
import { mapConnectionStatus, precisaConfirmar, teveLogoutDefinitivo } from '../src/lib/instanceStatus';

// Linha real do /instance/fetchInstances de um chip que levou logout (401) e
// foi reconectado por QR: a Evolution volta connectionStatus para 'open' mas
// mantem o 401 e o device_removed do logout anterior.
const reconectadoAposLogout = {
  name: 'Antonio',
  connectionStatus: 'open',
  ownerJid: '5567998185948@s.whatsapp.net',
  disconnectionReasonCode: 401,
  disconnectionObject: '{"error":{"data":{"content":[{"tag":"conflict","attrs":{"type":"device_removed"}}]}}}',
};

describe('status da instancia (fetchInstances)', () => {
  it('chip reconectado depois de logout fica conectado, nao desconectado', () => {
    expect(teveLogoutDefinitivo(reconectadoAposLogout)).toBe(true);
    expect(mapConnectionStatus('open', reconectadoAposLogout)).toBe('connected');
  });

  it('open com logout antigo pede confirmacao ao connectionState', () => {
    expect(precisaConfirmar('open', reconectadoAposLogout)).toBe(true);
  });

  it('open sem historico de logout nao precisa de segunda opiniao', () => {
    expect(mapConnectionStatus('open', { connectionStatus: 'open' })).toBe('connected');
    expect(precisaConfirmar('open', { connectionStatus: 'open' })).toBe(false);
  });

  it('connecting com logout definitivo continua desconectado', () => {
    const preso = { connectionStatus: 'connecting', disconnectionReasonCode: 401 };
    expect(mapConnectionStatus('connecting', preso)).toBe('disconnected');
    expect(precisaConfirmar('connecting', preso)).toBe(true);
  });

  it('close e connecting simples mantem o comportamento anterior', () => {
    expect(mapConnectionStatus('close', {})).toBe('disconnected');
    expect(mapConnectionStatus('connecting', {})).toBe('connecting');
    expect(precisaConfirmar('close', {})).toBe(false);
  });
});
