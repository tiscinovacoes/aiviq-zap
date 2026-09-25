import http from 'http';

// ============================================================================
// IP PUBLICO DE SAIDA de um proxy, medido pelo proprio proxy.
//
// Serve para tres verificacoes do runbook de "1 IP fixo por chip":
//   - o IP e do Brasil?
//   - dois chips estao saindo pelo mesmo endereco?
//   - o IP e marcado como datacenter (sinal de que nao e ISP de verdade)?
//
// Usa `http.request` direto (sem dependencia nova): para um proxy HTTP basta
// pedir a URL absoluta. Proxies SOCKS/HTTPS nao sao suportados aqui.
// ============================================================================

export interface EgressInfo {
  ok: boolean;
  ip?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  isp?: string;
  /** ip-api marca IP de datacenter/hospedagem. Em ISP estatico pode ser falso positivo. */
  hosting?: boolean;
  error?: string;
}

const CAMPOS = 'status,message,country,countryCode,regionName,city,isp,org,hosting,query';
const URL_CONSULTA = `http://ip-api.com/json/?fields=${CAMPOS}`;

/** Interpreta o JSON do ip-api (funcao pura, testavel). */
export function interpretarIpApi(body: any): EgressInfo {
  if (!body || body.status !== 'success' || !body.query) {
    return { ok: false, error: String(body?.message || 'resposta_invalida') };
  }
  return {
    ok: true,
    ip: String(body.query),
    countryCode: body.countryCode ? String(body.countryCode) : undefined,
    region: body.regionName ? String(body.regionName) : undefined,
    city: body.city ? String(body.city) : undefined,
    isp: body.isp ? String(body.isp) : body.org ? String(body.org) : undefined,
    hosting: Boolean(body.hosting),
  };
}

export interface ProxyParaMedir {
  host: string;
  port: string | number;
  username?: string;
  password?: string;
  protocol?: string;
}

/** Pergunta ao ip-api "qual e o meu IP?" atraves do proxy. */
export function consultarIpDeSaida(p: ProxyParaMedir, timeoutMs = 6000): Promise<EgressInfo> {
  if ((p.protocol || 'http').toLowerCase() !== 'http') {
    return Promise.resolve({ ok: false, error: 'protocolo_nao_suportado' });
  }
  return new Promise<EgressInfo>((resolve) => {
    let feito = false;
    const fim = (r: EgressInfo) => {
      if (!feito) {
        feito = true;
        resolve(r);
      }
    };

    const headers: Record<string, string> = {
      Host: 'ip-api.com',
      'User-Agent': 'aiviq-zap-egress-check',
      Connection: 'close',
    };
    if (p.username) {
      headers['Proxy-Authorization'] =
        'Basic ' + Buffer.from(`${p.username}:${p.password ?? ''}`).toString('base64');
    }

    const req = http.request(
      {
        host: p.host,
        port: Number(p.port),
        method: 'GET',
        path: URL_CONSULTA,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode === 407) {
          res.resume();
          return fim({ ok: false, error: 'proxy_auth_recusada' });
        }
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => {
          corpo += c;
          if (corpo.length > 20000) req.destroy();
        });
        res.on('end', () => {
          try {
            fim(interpretarIpApi(JSON.parse(corpo)));
          } catch {
            fim({ ok: false, error: `resposta_invalida (HTTP ${res.statusCode})` });
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      fim({ ok: false, error: 'timeout' });
    });
    req.on('error', (e) => fim({ ok: false, error: e.message }));
    req.end();
  });
}
