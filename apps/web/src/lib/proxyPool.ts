// ============================================================================
// POOL DE PROXIES POR INSTANCIA (1 IP/sessao fixa por numero de WhatsApp)
//
// O WhatsApp derruba o aparelho vinculado (401 conflict / device_removed) quando
// a mesma conta aparece saindo de IPs diferentes. Por isso cada instancia recebe
// um proxy brasileiro FIXO e exclusivo. Nunca duas instancias no mesmo IP.
//
// Dois tipos de entrada em EVOLUTION_PROXY_POOL (JSON array):
//
//  1. ESTATICO (ISP/dedicado, 1 por chip) -- o ideal:
//     { "host": "1.2.3.4", "port": "8080", "username": "u", "password": "p", "protocol": "http" }
//     Cada entrada so pode ser usada por UMA instancia.
//
//  2. TEMPLATE POR INSTANCIA (residencial com sessao sticky) -- o que ha hoje:
//     { "host": "proxy.smartproxy.net", "port": "3120",
//       "username": "smart-xxx_area-BR_life-120_session-{instance}", "password": "p" }
//     O `{instance}` vira o nome da instancia: cada chip ganha a SUA sessao
//     sticky (IP proprio enquanto a sessao durar). Uma entrada assim serve
//     para N instancias. Limitacao: quando a sessao expira (life-120 = 2h) o
//     IP troca e o WhatsApp pode derrubar a sessao -- use a maior duracao que
//     o provedor permitir e prefira o tipo 1 em producao.
//
// Se EVOLUTION_PROXY_REQUIRED=true, a conexao e RECUSADA sem proxy (comporta-
// mento estrito). Caso contrario, sem pool configurado o QR sai mesmo assim
// (pelo IP do servidor ou pelo proxy global da Evolution) com aviso na resposta
// -- porque em 21/09 o bloqueio estrito era o motivo de "nao consigo escanear
// o QR" com um unico IP no pool.
//
// Fonte da verdade do que esta em uso: o proprio Evolution (cada instancia
// guarda o seu proxy), entao nao existe segundo cadastro para dessincronizar.
// ============================================================================

export interface PoolProxy {
  host: string;
  port: string;
  username: string;
  password: string;
  protocol: string;
  /** Entrada-template: `{instance}` no username/password vira o nome da instancia. */
  perInstance: boolean;
}

export type ProxyErrorCode =
  | 'pool_not_configured'
  | 'no_proxy_available'
  | 'proxy_rejected'
  | 'evolution_unreachable';

export type ProxyWarning = 'sem_proxy' | 'sem_ip_livre';

export type EnsureProxyResult =
  | {
      ok: true;
      /** true = o proxy foi atribuido/trocado agora; false = ja estava correto (ou nao ha proxy). */
      assigned: boolean;
      host: string;
      port: string;
      /** Estado do socket da instancia no momento da atribuicao. */
      connectionStatus?: string;
      ownerJid?: string | null;
      /** Conectou SEM proxy dedicado (modo nao estrito). O painel deve avisar. */
      warning?: ProxyWarning;
      message?: string;
      /** Identidade (host:porta:usuario) do IP em uso; ausente quando nao ha proxy. */
      proxyKey?: string;
    }
  | { ok: false; error: ProxyErrorCode; message: string; status: number };

/** Proxy dedicado e obrigatorio? (default: nao -- avisa, mas deixa conectar) */
export function proxyObrigatorio(): boolean {
  return process.env.EVOLUTION_PROXY_REQUIRED === 'true';
}

export interface ProxyOpts {
  /**
   * IPs em QUARENTENA (chave host:porta:usuario): pertenceram a um chip
   * aposentado e nao podem ser dados a um numero novo. O modulo nao le o banco;
   * quem chama (rota) carrega de `lib/proxyRegistry`.
   */
  quarantined?: Set<string>;
}

const TEMPLATE_TOKEN = '{instance}';

/** Interpreta a env EVOLUTION_PROXY_POOL. Entradas invalidas sao descartadas. */
export function parsePool(raw?: string | null): PoolProxy[] {
  if (!raw || !raw.trim()) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const seen = new Set<string>();
  const pool: PoolProxy[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const host = String(o.host ?? '').trim();
    const port = String(o.port ?? '').trim();
    if (!host || !/^\d{1,5}$/.test(port)) continue;
    const username = String(o.username ?? '').trim();
    const password = String(o.password ?? '');
    const entry: PoolProxy = {
      host,
      port,
      username,
      password,
      protocol: String(o.protocol ?? 'http').trim().toLowerCase() || 'http',
      perInstance:
        o.perInstance === true || username.includes(TEMPLATE_TOKEN) || password.includes(TEMPLATE_TOKEN),
    };
    const key = proxyKey(entry);
    if (seen.has(key)) continue; // mesma entrada duas vezes nao duplica IP
    seen.add(key);
    pool.push(entry);
  }
  return pool;
}

/** Identidade de um proxy (a senha nao entra: o Evolution nao a devolve de forma confiavel). */
export function proxyKey(p: { host?: string | null; port?: string | number | null; username?: string | null }): string {
  return `${String(p.host ?? '').trim()}:${String(p.port ?? '').trim()}:${String(p.username ?? '').trim()}`;
}

/** Nome da instancia como id de sessao (so [A-Za-z0-9]; provedores recusam `_`/`-`). */
function sessionIdFor(instanceName: string): string {
  const s = instanceName.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return s || 'inst';
}

/** Materializa um template para a instancia (no-op para entrada estatica). */
export function expandForInstance(p: PoolProxy, instanceName: string): PoolProxy {
  if (!p.perInstance) return p;
  const sid = sessionIdFor(instanceName);
  return {
    ...p,
    username: p.username.split(TEMPLATE_TOKEN).join(sid),
    password: p.password.split(TEMPLATE_TOKEN).join(sid),
    perInstance: true,
  };
}

/**
 * Escolhe o proxy para a instancia: primeiro um ESTATICO livre; se nao houver,
 * um TEMPLATE expandido com a sessao propria da instancia (nunca "esgota").
 */
export function pickFreeProxy(pool: PoolProxy[], usedKeys: Set<string>, instanceName = ''): PoolProxy | null {
  const estatico = pool.find((p) => !p.perInstance && !usedKeys.has(proxyKey(p)));
  if (estatico) return estatico;
  const template = pool.find((p) => p.perInstance);
  if (template) {
    const exp = expandForInstance(template, instanceName);
    // Colisao so se OUTRA instancia estiver com exatamente esta sessao.
    return usedKeys.has(proxyKey(exp)) ? null : exp;
  }
  return null;
}

interface LiveInstance {
  name: string;
  connectionStatus?: string;
  ownerJid?: string | null;
  /** 401 = a Meta deslogou a sessao (device_removed / logout): credencial morta. */
  disconnectionReasonCode?: number | null;
  Proxy?: { enabled?: boolean; host?: string; port?: string; username?: string } | null;
}

async function listInstances(apiUrl: string, apiKey: string): Promise<LiveInstance[]> {
  const res = await fetch(`${apiUrl}/instance/fetchInstances`, {
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`fetchInstances HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((i: any) => ({
    name: i.name || i.instanceName || i.instance?.instanceName || '',
    connectionStatus: i.connectionStatus,
    ownerJid: i.ownerJid,
    disconnectionReasonCode: i.disconnectionReasonCode ?? null,
    Proxy: i.Proxy || null,
  }));
}

function usedKeysExcluding(instances: LiveInstance[], instanceName: string): Set<string> {
  const used = new Set<string>();
  for (const i of instances) {
    if (i.name === instanceName) continue;
    if (i.Proxy?.enabled && i.Proxy.host) used.add(proxyKey(i.Proxy));
  }
  return used;
}

// Serializa as atribuicoes neste processo: duas criacoes simultaneas nao podem
// escolher o mesmo IP livre. (Entre lambdas diferentes a corrida continua
// possivel; a pos-verificacao abaixo detecta o caso.)
let fila: Promise<unknown> = Promise.resolve();
function emSerie<T>(fn: () => Promise<T>): Promise<T> {
  const run = fila.then(fn, fn);
  fila = run.catch(() => undefined);
  return run;
}

export interface PoolAvailability {
  /** Entradas configuradas (estaticas + templates). */
  total: number;
  /** IPs estaticos ainda livres (nem em uso nem em quarentena). */
  free: number;
  /** IPs estaticos em quarentena (fora de uso por decisao). */
  quarentena: number;
  /** Ha template por instancia (capacidade ilimitada de sessoes). */
  ilimitado: boolean;
  /** Proxy dedicado e obrigatorio (EVOLUTION_PROXY_REQUIRED=true). */
  obrigatorio: boolean;
}

/** Capacidade do pool (para recusar cedo, antes de criar, no modo estrito). */
export async function countFreeProxies(
  apiUrl: string,
  apiKey: string,
  opts: ProxyOpts = {}
): Promise<PoolAvailability> {
  const pool = parsePool(process.env.EVOLUTION_PROXY_POOL);
  const obrigatorio = proxyObrigatorio();
  const ilimitado = pool.some((p) => p.perInstance);
  const q = opts.quarantined ?? new Set<string>();
  const quarentena = pool.filter((p) => !p.perInstance && q.has(proxyKey(p))).length;
  if (pool.length === 0) return { total: 0, free: 0, quarentena: 0, ilimitado: false, obrigatorio };
  try {
    const used = usedKeysExcluding(await listInstances(apiUrl, apiKey), '');
    const free = pool.filter((p) => !p.perInstance && !used.has(proxyKey(p)) && !q.has(proxyKey(p))).length;
    return { total: pool.length, free, quarentena, ilimitado, obrigatorio };
  } catch {
    return { total: pool.length, free: 0, quarentena, ilimitado, obrigatorio };
  }
}

/**
 * Garante que a instancia tenha um proxy EXCLUSIVO do pool. Idempotente: se ja
 * tem um proxy do pool que ninguem mais usa (ou a sua propria sessao do
 * template), nao mexe. A instancia precisa existir. Um proxy fora do pool
 * (ex.: um rotativo de teste) e substituido.
 */
export function ensureInstanceProxy(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  opts: ProxyOpts = {}
): Promise<EnsureProxyResult> {
  return emSerie(async (): Promise<EnsureProxyResult> => {
    const pool = parsePool(process.env.EVOLUTION_PROXY_POOL);
    const estrito = proxyObrigatorio();

    if (pool.length === 0) {
      if (estrito) {
        return {
          ok: false,
          error: 'pool_not_configured',
          status: 503,
          message:
            'Nenhum proxy configurado (EVOLUTION_PROXY_POOL) e EVOLUTION_PROXY_REQUIRED=true: sem proxy dedicado o número cai no WhatsApp, por isso a conexão foi recusada.',
        };
      }
      return {
        ok: true,
        assigned: false,
        host: '',
        port: '',
        warning: 'sem_proxy',
        message:
          'Conectando SEM proxy dedicado (EVOLUTION_PROXY_POOL vazio). O número sai pelo IP do servidor Evolution; risco maior de queda/ban.',
      };
    }

    let instances: LiveInstance[];
    try {
      instances = await listInstances(apiUrl, apiKey);
    } catch (e: any) {
      return {
        ok: false,
        error: 'evolution_unreachable',
        status: 502,
        message: `Não foi possível consultar o servidor Evolution: ${e.message}`,
      };
    }

    const self = instances.find((i) => i.name === instanceName);
    const used = usedKeysExcluding(instances, instanceName);

    // Ja tem um proxy valido do pool (estatico livre OU a propria sessao do template): mantem.
    if (self?.Proxy?.enabled && self.Proxy.host) {
      const key = proxyKey(self.Proxy);
      const valido = pool.some((p) => proxyKey(expandForInstance(p, instanceName)) === key);
      if (valido && !used.has(key)) {
        return {
          ok: true,
          assigned: false,
          host: self.Proxy.host,
          port: String(self.Proxy.port ?? ''),
          connectionStatus: self.connectionStatus,
          ownerJid: self.ownerJid,
          proxyKey: key,
        };
      }
    }

    // Em uso por OUTRO chip ou em quarentena (chip aposentado): nenhum dos dois
    // pode ser dado a esta instancia.
    const indisponiveis = new Set<string>(Array.from(used).concat(Array.from(opts.quarantined ?? [])));
    const escolhido = pickFreeProxy(pool, indisponiveis, instanceName);
    if (!escolhido) {
      const emQuarentena = pool.filter((p) => !p.perInstance && (opts.quarantined ?? new Set()).has(proxyKey(p))).length;
      if (estrito) {
        return {
          ok: false,
          error: 'no_proxy_available',
          status: 409,
          message:
            `Nenhum IP livre no pool (${pool.length} configurados, ${used.size} em uso` +
            `${emQuarentena ? `, ${emQuarentena} em quarentena` : ''}). ` +
            'Adicione outro IP ISP em EVOLUTION_PROXY_POOL antes de criar/conectar outro número.',
        };
      }
      return {
        ok: true,
        assigned: false,
        host: self?.Proxy?.host || '',
        port: String(self?.Proxy?.port ?? ''),
        connectionStatus: self?.connectionStatus,
        ownerJid: self?.ownerJid,
        warning: 'sem_ip_livre',
        message: `Todos os ${pool.length} IPs do pool estão em uso; conectando sem IP dedicado. Adicione um proxy em EVOLUTION_PROXY_POOL.`,
      };
    }

    try {
      const res = await fetch(`${apiUrl}/proxy/set/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({
          enabled: true,
          host: escolhido.host,
          port: escolhido.port,
          protocol: escolhido.protocol,
          username: escolhido.username,
          password: escolhido.password,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        return {
          ok: false,
          error: 'proxy_rejected',
          status: 502,
          message: `O Evolution recusou o proxy ${escolhido.host}:${escolhido.port} (HTTP ${res.status}). Verifique se o IP está ativo e as credenciais estão corretas.`,
        };
      }
    } catch (e: any) {
      return {
        ok: false,
        error: 'evolution_unreachable',
        status: 502,
        message: `Falha ao configurar o proxy no Evolution: ${e.message}`,
      };
    }

    // Pos-verificacao: se outra instancia pegou o mesmo IP ao mesmo tempo
    // (corrida entre lambdas), desfaz e recusa em vez de compartilhar o IP.
    try {
      const depois = await listInstances(apiUrl, apiKey);
      const conflito = depois.some(
        (i) => i.name !== instanceName && i.Proxy?.enabled && proxyKey(i.Proxy) === proxyKey(escolhido)
      );
      if (conflito) {
        await fetch(`${apiUrl}/proxy/set/${encodeURIComponent(instanceName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({ enabled: false }),
          signal: AbortSignal.timeout(8000),
        }).catch(() => undefined);
        return {
          ok: false,
          error: 'no_proxy_available',
          status: 409,
          message: 'O IP escolhido foi tomado por outra instância ao mesmo tempo. Tente novamente.',
        };
      }
    } catch {
      // a verificacao e best-effort; o proxy ja foi gravado com sucesso
    }

    return {
      ok: true,
      assigned: true,
      host: escolhido.host,
      port: escolhido.port,
      connectionStatus: self?.connectionStatus,
      ownerJid: self?.ownerJid,
      proxyKey: proxyKey(escolhido),
    };
  });
}

/** Credenciais do proxy hoje gravado na instancia (a Evolution devolve a senha). */
export async function lerProxyDaInstancia(
  apiUrl: string,
  apiKey: string,
  instanceName: string
): Promise<{
  enabled: boolean;
  host: string;
  port: string;
  protocol: string;
  username: string;
  password: string;
  key: string;
} | null> {
  try {
    const res = await fetch(`${apiUrl}/proxy/find/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const d: any = await res.json().catch(() => null);
    if (!d || !d.host) return null;
    const p = {
      enabled: d.enabled !== false,
      host: String(d.host),
      port: String(d.port ?? ''),
      protocol: String(d.protocol ?? 'http').toLowerCase(),
      username: String(d.username ?? ''),
      password: String(d.password ?? ''),
    };
    return { ...p, key: proxyKey(p) };
  } catch {
    return null;
  }
}

/** A chave do proxy pertence ao pool configurado (estatico ou sessao do template)? */
export function estaNoPool(key: string, instanceName: string): boolean {
  return parsePool(process.env.EVOLUTION_PROXY_POOL).some(
    (p) => proxyKey(expandForInstance(p, instanceName)) === key
  );
}

/**
 * Prepara a instancia para gerar QR: cria (sem abrir o socket), garante o proxy
 * dedicado e, se o socket ja estava aberto sem esse proxy e o numero nunca foi
 * vinculado, recria a instancia para o socket nascer ja saindo pelo IP fixo.
 * O `connect` do Evolution NAO reinicia um socket em "connecting".
 */
export async function prepareInstanceForQr(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  opts: ProxyOpts = {}
): Promise<EnsureProxyResult> {
  const headers = { 'Content-Type': 'application/json', apikey: apiKey };
  const criar = () =>
    fetch(`${apiUrl}/instance/create`, {
      method: 'POST',
      headers,
      // qrcode:false => nao abre o socket ainda; o proxy tem de existir antes.
      body: JSON.stringify({ instanceName, qrcode: false, integration: 'WHATSAPP-BAILEYS' }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => undefined); // 403/409 "ja existe" e esperado

  // SESSAO MORTA: a Meta deslogou o aparelho (401 device_removed / logout) e a
  // instancia ficou presa em "connecting" tentando reabrir com credencial
  // invalida. Nesse estado o `connect` da Evolution devolve {count:0} SEM QR
  // (nao reinicia socket em "connecting") -- era o motivo de "nao consigo
  // escanear o QR" na instancia padrao. Como ela ja nao esta logada, apagar e
  // recriar nao derruba ninguem e devolve um socket limpo que gera QR.
  try {
    const antes = (await listInstances(apiUrl, apiKey)).find((i) => i.name === instanceName);
    if (antes && antes.connectionStatus !== 'open' && antes.disconnectionReasonCode === 401) {
      await fetch(`${apiUrl}/instance/delete/${encodeURIComponent(instanceName)}`, {
        method: 'DELETE',
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(8000),
      }).catch(() => undefined);
    }
  } catch {
    // se nao deu para listar, segue o fluxo normal
  }

  await criar();
  const r = await ensureInstanceProxy(apiUrl, apiKey, instanceName, opts);
  if (!r.ok) return r;

  const socketSemProxy = r.assigned && r.connectionStatus === 'connecting' && !r.ownerJid;
  if (socketSemProxy) {
    try {
      await fetch(`${apiUrl}/instance/delete/${encodeURIComponent(instanceName)}`, {
        method: 'DELETE',
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(8000),
      });
    } catch {}
    await criar();
    return ensureInstanceProxy(apiUrl, apiKey, instanceName, opts);
  }
  return r;
}
