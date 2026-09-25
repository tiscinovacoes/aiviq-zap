import { lerProxyDaInstancia, proxyObrigatorio } from '@/lib/proxyPool';
import { consultarIpDeSaida, type EgressInfo } from '@/lib/proxyEgress';
import { registrarAtribuicao, registrarEgress, outroChipComEgress } from '@/lib/proxyRegistry';

// ============================================================================
// Validacao do IP da instancia, chamada logo DEPOIS de o proxy ser atribuido e
// ANTES de o QR ser devolvido. Regras do runbook "1 IP fixo por chip":
//   - o IP de saida tem de ser do Brasil;
//   - nenhum outro chip ATIVO pode sair pelo mesmo endereco publico;
//   - IP marcado como datacenter gera aviso (em ISP estatico pode ser falso positivo).
// So BLOQUEIA no modo estrito (EVOLUTION_PROXY_REQUIRED=true). Fora dele, so avisa.
// Sempre registra a atribuicao e o IP de saida no registro (best-effort).
// ============================================================================

export interface ResultadoIp {
  ok: boolean;
  bloqueio?: { error: string; message: string; status: number };
  aviso?: string;
  egress?: EgressInfo;
  /** host:porta do IP em uso (sem usuario/senha). */
  proxyHostPort?: string;
}

export async function validarIpDaInstancia(
  apiUrl: string,
  apiKey: string,
  instanceName: string
): Promise<ResultadoIp> {
  const estrito = proxyObrigatorio();
  const px = await lerProxyDaInstancia(apiUrl, apiKey, instanceName);
  if (!px || !px.enabled) {
    return { ok: true, aviso: 'A instância não tem proxy configurado.' };
  }
  const hostPort = `${px.host}:${px.port}`;

  await registrarAtribuicao({ proxyKey: px.key, host: px.host, port: px.port, instanceName });

  const egress = await consultarIpDeSaida(px, 5000);
  if (!egress.ok || !egress.ip) {
    return {
      ok: true,
      egress,
      proxyHostPort: hostPort,
      aviso: `Não consegui medir o IP de saída de ${hostPort} (${egress.error || 'sem resposta'}). Confira usuário, senha e porta do proxy.`,
    };
  }

  await registrarEgress(px.key, px.host, px.port, egress.ip, egress.countryCode);

  const avisos: string[] = [];

  if (egress.countryCode && egress.countryCode !== 'BR') {
    const msg = `O IP de saída ${egress.ip} é de ${egress.countryCode}, não do Brasil.`;
    if (estrito) {
      return {
        ok: false,
        egress,
        proxyHostPort: hostPort,
        bloqueio: { error: 'ip_fora_do_brasil', message: msg, status: 409 },
      };
    }
    avisos.push(msg);
  }

  const outro = await outroChipComEgress(egress.ip, instanceName);
  if (outro) {
    const msg = `O IP de saída ${egress.ip} já é usado pelo chip "${outro}". Dois chips no mesmo IP aumentam o risco de ban.`;
    if (estrito) {
      return {
        ok: false,
        egress,
        proxyHostPort: hostPort,
        bloqueio: { error: 'ip_duplicado', message: msg, status: 409 },
      };
    }
    avisos.push(msg);
  }

  if (egress.hosting) {
    avisos.push(
      `O IP ${egress.ip} é marcado como datacenter (${egress.isp || 'sem operadora'}). Em ISP estático pode ser falso positivo; confirme com o provedor.`
    );
  }

  return { ok: true, egress, proxyHostPort: hostPort, aviso: avisos.length ? avisos.join(' ') : undefined };
}
