import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parsePool,
  pickFreeProxy,
  proxyKey,
  ensureInstanceProxy,
  countFreeProxies,
  expandForInstance,
} from '../src/lib/proxyPool';

const P1 = { host: 'ip1.exemplo.net', port: '3001', username: 'u1', password: 'p1', protocol: 'http', perInstance: false };
const P2 = { host: 'ip2.exemplo.net', port: '3002', username: 'u2', password: 'p2', protocol: 'http', perInstance: false };
// Template residencial com sessao sticky por instancia (o que existe hoje).
const T1 = {
  host: 'proxy.smartproxy.net',
  port: '3120',
  username: 'smart-x_area-BR_life-120_session-{instance}',
  password: 'p',
  protocol: 'http',
  perInstance: true,
};

describe('proxyPool: parsePool', () => {
  it('retorna vazio para env ausente, vazia ou JSON invalido', () => {
    expect(parsePool(undefined)).toEqual([]);
    expect(parsePool('')).toEqual([]);
    expect(parsePool('nao e json')).toEqual([]);
    expect(parsePool('{"host":"x"}')).toEqual([]);
  });

  it('aceita entradas validas e descarta as sem host ou com porta invalida', () => {
    const pool = parsePool(
      JSON.stringify([P1, { host: '', port: '1' }, { host: 'x', port: 'abc' }, { ...P2, port: 3002 }])
    );
    expect(pool.map((p) => p.host)).toEqual(['ip1.exemplo.net', 'ip2.exemplo.net']);
    expect(pool[1].port).toBe('3002');
    expect(pool[0].perInstance).toBe(false);
  });

  it('nao duplica a mesma entrada (um IP nao pode contar duas vezes)', () => {
    expect(parsePool(JSON.stringify([P1, P1]))).toHaveLength(1);
  });

  it('protocolo padrao e http', () => {
    const [p] = parsePool(JSON.stringify([{ host: 'h', port: '1' }]));
    expect(p.protocol).toBe('http');
  });

  it('detecta template por instancia pelo {instance} no username', () => {
    const [p] = parsePool(JSON.stringify([{ ...T1, perInstance: undefined }]));
    expect(p.perInstance).toBe(true);
  });
});

describe('proxyPool: expandForInstance / pickFreeProxy', () => {
  it('expande o template com o nome da instancia saneado', () => {
    const e = expandForInstance(T1, 'aiviq_inbox-01');
    expect(e.username).toBe('smart-x_area-BR_life-120_session-aiviqinbox01');
  });

  it('escolhe o primeiro estatico livre e pula os em uso', () => {
    expect(pickFreeProxy([P1, P2], new Set())).toEqual(P1);
    expect(pickFreeProxy([P1, P2], new Set([proxyKey(P1)]))).toEqual(P2);
  });

  it('retorna null quando todos os estaticos estao em uso e nao ha template', () => {
    expect(pickFreeProxy([P1, P2], new Set([proxyKey(P1), proxyKey(P2)]))).toBeNull();
    expect(pickFreeProxy([], new Set())).toBeNull();
  });

  it('com template, cada instancia recebe a sua sessao (nunca esgota)', () => {
    const a = pickFreeProxy([T1], new Set(), 'chipA');
    const b = pickFreeProxy([T1], new Set([proxyKey(a!)]), 'chipB');
    expect(a?.username).toContain('session-chipa');
    expect(b?.username).toContain('session-chipb');
    expect(proxyKey(a!)).not.toBe(proxyKey(b!));
  });

  it('prefere o estatico livre ao template', () => {
    expect(pickFreeProxy([T1, P1], new Set(), 'x')).toEqual(P1);
  });
});

describe('proxyPool: ensureInstanceProxy / countFreeProxies', () => {
  const originalEnv = process.env;
  const chamadas: { url: string; body?: any }[] = [];

  function mockEvolution(instances: any[], opts: { rejectProxy?: boolean } = {}) {
    chamadas.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        const body = init?.body ? JSON.parse(init.body) : undefined;
        chamadas.push({ url, body });
        if (url.endsWith('/instance/fetchInstances')) return new Response(JSON.stringify(instances), { status: 200 });
        if (url.includes('/proxy/set/')) {
          if (opts.rejectProxy) return new Response('{"message":["Invalid proxy"]}', { status: 400 });
          // simula o Evolution gravando o proxy na instancia
          const name = decodeURIComponent(url.split('/proxy/set/')[1]);
          const inst = instances.find((i) => i.name === name);
          if (inst) inst.Proxy = body.enabled ? { enabled: true, host: body.host, port: body.port, username: body.username } : null;
          return new Response('{}', { status: 201 });
        }
        return new Response('{}', { status: 200 });
      })
    );
  }

  beforeEach(() => {
    process.env = { ...originalEnv, EVOLUTION_PROXY_POOL: JSON.stringify([P1, P2]), EVOLUTION_PROXY_REQUIRED: 'true' };
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('modo estrito: recusa sem pool configurado, sem chamar o Evolution', async () => {
    delete process.env.EVOLUTION_PROXY_POOL;
    mockEvolution([]);
    const r = await ensureInstanceProxy('http://evo', 'k', 'num_01');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('pool_not_configured');
    expect(chamadas).toHaveLength(0);
  });

  it('modo padrao (nao estrito): sem pool deixa conectar com aviso', async () => {
    delete process.env.EVOLUTION_PROXY_POOL;
    delete process.env.EVOLUTION_PROXY_REQUIRED;
    mockEvolution([]);
    const r = await ensureInstanceProxy('http://evo', 'k', 'num_01');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warning).toBe('sem_proxy');
  });

  it('atribui o primeiro IP livre a uma instancia sem proxy', async () => {
    mockEvolution([{ name: 'num_01', connectionStatus: 'close', Proxy: null }]);
    const r = await ensureInstanceProxy('http://evo', 'k', 'num_01');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assigned).toBe(true);
      expect(r.host).toBe(P1.host);
    }
    expect(chamadas.find((c) => c.url.includes('/proxy/set/'))?.body.username).toBe('u1');
  });

  it('cada instancia recebe um IP diferente', async () => {
    const insts = [
      { name: 'a', Proxy: { enabled: true, host: P1.host, port: P1.port, username: P1.username } },
      { name: 'b', Proxy: null },
    ];
    mockEvolution(insts);
    const r = await ensureInstanceProxy('http://evo', 'k', 'b');
    expect(r.ok && r.host).toBe(P2.host);
  });

  it('e idempotente: instancia que ja tem um IP do pool so dela nao e alterada', async () => {
    mockEvolution([{ name: 'a', Proxy: { enabled: true, host: P2.host, port: P2.port, username: P2.username } }]);
    const r = await ensureInstanceProxy('http://evo', 'k', 'a');
    expect(r.ok && r.assigned).toBe(false);
    expect(chamadas.some((c) => c.url.includes('/proxy/set/'))).toBe(false);
  });

  it('e idempotente com template: instancia com a propria sessao nao e alterada', async () => {
    process.env.EVOLUTION_PROXY_POOL = JSON.stringify([T1]);
    const exp = expandForInstance(T1, 'chipA');
    mockEvolution([{ name: 'chipA', Proxy: { enabled: true, host: exp.host, port: exp.port, username: exp.username } }]);
    const r = await ensureInstanceProxy('http://evo', 'k', 'chipA');
    expect(r.ok && r.assigned).toBe(false);
  });

  it('troca um proxy fora do pool (ex.: rotativo de teste) por um do pool', async () => {
    mockEvolution([{ name: 'a', Proxy: { enabled: true, host: 'gate.rotativo.com', port: '7000', username: 'x' } }]);
    const r = await ensureInstanceProxy('http://evo', 'k', 'a');
    expect(r.ok && r.assigned).toBe(true);
  });

  it('modo estrito: recusa quando todos os IPs do pool estao em uso por outras instancias', async () => {
    mockEvolution([
      { name: 'a', Proxy: { enabled: true, host: P1.host, port: P1.port, username: P1.username } },
      { name: 'b', Proxy: { enabled: true, host: P2.host, port: P2.port, username: P2.username } },
      { name: 'c', Proxy: null },
    ]);
    const r = await ensureInstanceProxy('http://evo', 'k', 'c');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('no_proxy_available');
      expect(r.status).toBe(409);
    }
    expect(chamadas.some((c) => c.url.includes('/proxy/set/'))).toBe(false);
  });

  it('recusa quando o Evolution rejeita o proxy (Invalid proxy)', async () => {
    mockEvolution([{ name: 'a', Proxy: null }], { rejectProxy: true });
    const r = await ensureInstanceProxy('http://evo', 'k', 'a');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('proxy_rejected');
  });

  it('duas atribuicoes simultaneas nao escolhem o mesmo IP', async () => {
    mockEvolution([
      { name: 'a', Proxy: null },
      { name: 'b', Proxy: null },
    ]);
    const [ra, rb] = await Promise.all([
      ensureInstanceProxy('http://evo', 'k', 'a'),
      ensureInstanceProxy('http://evo', 'k', 'b'),
    ]);
    expect(ra.ok && rb.ok).toBe(true);
    if (ra.ok && rb.ok) expect(ra.host).not.toBe(rb.host);
  });

  it('countFreeProxies conta os livres e informa o modo', async () => {
    mockEvolution([{ name: 'a', Proxy: { enabled: true, host: P1.host, port: P1.port, username: P1.username } }]);
    expect(await countFreeProxies('http://evo', 'k')).toEqual({
      total: 2,
      free: 1,
      quarentena: 0,
      ilimitado: false,
      obrigatorio: true,
    });
  });
});

describe('proxyPool: quarentena de IP (chip aposentado)', () => {
  const originalEnv = process.env;
  const chamadas: { url: string; body?: any }[] = [];

  function mockEvolution(instances: any[]) {
    chamadas.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        const body = init?.body ? JSON.parse(init.body) : undefined;
        chamadas.push({ url, body });
        if (url.endsWith('/instance/fetchInstances')) return new Response(JSON.stringify(instances), { status: 200 });
        if (url.includes('/proxy/set/')) {
          const name = decodeURIComponent(url.split('/proxy/set/')[1]);
          const inst = instances.find((i) => i.name === name);
          if (inst) inst.Proxy = body.enabled ? { enabled: true, host: body.host, port: body.port, username: body.username } : null;
          return new Response('{}', { status: 201 });
        }
        return new Response('{}', { status: 200 });
      })
    );
  }

  beforeEach(() => {
    process.env = { ...originalEnv, EVOLUTION_PROXY_POOL: JSON.stringify([P1, P2]), EVOLUTION_PROXY_REQUIRED: 'true' };
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('nunca da a um numero novo o IP que esta em quarentena', async () => {
    // P1 pertenceu a um chip banido (instancia ja apagada); so P2 esta elegivel.
    mockEvolution([{ name: 'novo', Proxy: null }]);
    const r = await ensureInstanceProxy('http://evo', 'k', 'novo', { quarantined: new Set([proxyKey(P1)]) });
    expect(r.ok && r.host).toBe(P2.host);
    expect(chamadas.find((c) => c.url.includes('/proxy/set/'))?.body.username).toBe('u2');
  });

  it('recusa (modo estrito) quando os unicos IPs livres estao em quarentena', async () => {
    mockEvolution([
      { name: 'a', Proxy: { enabled: true, host: P2.host, port: P2.port, username: P2.username } },
      { name: 'novo', Proxy: null },
    ]);
    const r = await ensureInstanceProxy('http://evo', 'k', 'novo', { quarantined: new Set([proxyKey(P1)]) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('no_proxy_available');
      expect(r.message).toContain('1 em quarentena');
    }
    expect(chamadas.some((c) => c.url.includes('/proxy/set/'))).toBe(false);
  });

  it('devolve o proxyKey do IP atribuido (para o registro de IPs)', async () => {
    mockEvolution([{ name: 'novo', Proxy: null }]);
    const r = await ensureInstanceProxy('http://evo', 'k', 'novo');
    expect(r.ok && r.proxyKey).toBe(proxyKey(P1));
  });

  it('countFreeProxies desconta os IPs em quarentena', async () => {
    mockEvolution([]);
    const c = await countFreeProxies('http://evo', 'k', { quarantined: new Set([proxyKey(P1)]) });
    expect(c).toMatchObject({ total: 2, free: 1, quarentena: 1 });
  });

  it('pickFreeProxy ignora IP indisponivel (uso ou quarentena)', () => {
    expect(pickFreeProxy([P1, P2], new Set([proxyKey(P1)]))).toEqual(P2);
  });
});
