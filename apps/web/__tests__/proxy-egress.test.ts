import { describe, it, expect } from 'vitest';
import { interpretarIpApi, consultarIpDeSaida } from '../src/lib/proxyEgress';

describe('proxyEgress: interpretarIpApi', () => {
  it('le IP, pais, regiao, operadora e flag de datacenter', () => {
    const r = interpretarIpApi({
      status: 'success',
      query: '181.191.192.81',
      countryCode: 'BR',
      regionName: 'Mato Grosso do Sul',
      city: 'Caarapó',
      isp: 'LANG & WALDOW LTDA',
      hosting: false,
    });
    expect(r).toEqual({
      ok: true,
      ip: '181.191.192.81',
      countryCode: 'BR',
      region: 'Mato Grosso do Sul',
      city: 'Caarapó',
      isp: 'LANG & WALDOW LTDA',
      hosting: false,
    });
  });

  it('usa org quando nao ha isp e marca datacenter', () => {
    const r = interpretarIpApi({ status: 'success', query: '1.2.3.4', countryCode: 'US', org: 'Amazon', hosting: true });
    expect(r.isp).toBe('Amazon');
    expect(r.hosting).toBe(true);
  });

  it('resposta de falha ou sem IP nao e ok', () => {
    expect(interpretarIpApi({ status: 'fail', message: 'reserved range' })).toEqual({ ok: false, error: 'reserved range' });
    expect(interpretarIpApi(null).ok).toBe(false);
    expect(interpretarIpApi({ status: 'success' }).ok).toBe(false);
  });
});

describe('proxyEgress: consultarIpDeSaida', () => {
  it('recusa protocolos que nao sao http sem abrir conexao', async () => {
    const r = await consultarIpDeSaida({ host: 'x', port: 1, protocol: 'socks5' });
    expect(r).toEqual({ ok: false, error: 'protocolo_nao_suportado' });
  });

  it('proxy inalcancavel devolve erro em vez de travar', async () => {
    const r = await consultarIpDeSaida({ host: '127.0.0.1', port: 9 }, 1500);
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });
});
