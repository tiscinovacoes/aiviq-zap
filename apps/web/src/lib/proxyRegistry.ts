import { getServiceContext, isPlaceholderEnv } from '@/lib/supabase/authContext';

// ============================================================================
// Registro de IPs de proxy (tabela proxy_ip_registry, migration 019).
//
// Existe por causa da QUARENTENA: o "IP em uso" vem da Evolution, e ao apagar a
// instancia o IP volta a parecer livre. Aqui guardamos que aquele IP pertenceu a
// um chip aposentado e nao deve ir direto para um numero novo.
//
// Tudo e BEST-EFFORT: se a migration 019 ainda nao foi aplicada (a tabela nao
// existe), as leituras devolvem vazio e as escritas sao ignoradas. O app segue
// funcionando; so a quarentena nao vale ate a tabela existir.
// ============================================================================

export const QUARENTENA_DIAS = 30;

export interface RegistroIp {
  proxyKey: string;
  host: string;
  port: string;
  status: 'ativo' | 'livre' | 'quarentena';
  instanceName?: string;
  egressIp?: string;
  egressCountry?: string;
  assignedAt?: string;
  quarantineUntil?: string;
  retiredReason?: string;
}

async function contexto() {
  if (isPlaceholderEnv()) return null;
  try {
    return await getServiceContext();
  } catch {
    return null;
  }
}

function mapear(r: any): RegistroIp {
  return {
    proxyKey: r.proxy_key,
    host: r.host,
    port: r.port,
    status: r.status,
    instanceName: r.instance_name || undefined,
    egressIp: r.egress_ip || undefined,
    egressCountry: r.egress_country || undefined,
    assignedAt: r.assigned_at || undefined,
    quarantineUntil: r.quarantine_until || undefined,
    retiredReason: r.retired_reason || undefined,
  };
}

export async function listarRegistroIps(): Promise<RegistroIp[]> {
  const ctx = await contexto();
  if (!ctx) return [];
  try {
    const { data, error } = await ctx.db
      .from('proxy_ip_registry')
      .select('*')
      .eq('organization_id', ctx.organizationId);
    if (error) return [];
    return (data || []).map(mapear);
  } catch {
    return [];
  }
}

/** Chaves em quarentena AGORA numa lista ja carregada (vencida a data, o IP volta a ser elegivel). */
export function quarentenaDe(lista: RegistroIp[], agora: number = Date.now()): Set<string> {
  return new Set(
    lista
      .filter(
        (r) =>
          r.status === 'quarentena' &&
          (!r.quarantineUntil || Date.parse(r.quarantineUntil) > agora)
      )
      .map((r) => r.proxyKey)
  );
}

/** Le o registro e devolve as chaves em quarentena. */
export async function chavesEmQuarentena(): Promise<Set<string>> {
  return quarentenaDe(await listarRegistroIps());
}

async function gravar(linha: Record<string, unknown>): Promise<void> {
  const ctx = await contexto();
  if (!ctx) return;
  try {
    await ctx.db
      .from('proxy_ip_registry')
      .upsert(
        { organization_id: ctx.organizationId, updated_at: new Date().toISOString(), ...linha },
        { onConflict: 'organization_id,proxy_key' }
      );
  } catch {
    // tabela ausente / rede: nao derruba o fluxo
  }
}

/** Marca o IP como ATIVO no chip (e limpa quarentena antiga). */
export async function registrarAtribuicao(p: {
  proxyKey: string;
  host: string;
  port: string;
  instanceName: string;
}): Promise<void> {
  await gravar({
    proxy_key: p.proxyKey,
    host: p.host,
    port: p.port,
    status: 'ativo',
    instance_name: p.instanceName,
    assigned_at: new Date().toISOString(),
    quarantine_until: null,
    retired_reason: null,
  });
}

/** Guarda o IP de saida medido pelo proxy (usado para detectar IP repetido). */
export async function registrarEgress(
  proxyKey: string,
  host: string,
  port: string,
  egressIp: string,
  country?: string
): Promise<void> {
  await gravar({
    proxy_key: proxyKey,
    host,
    port,
    egress_ip: egressIp,
    egress_country: country || null,
  });
}

/** Aposentadoria: o IP fica fora de uso por `dias` (padrao 30). */
export async function colocarEmQuarentena(p: {
  proxyKey: string;
  host: string;
  port: string;
  instanceName: string;
  motivo: string;
  dias?: number;
}): Promise<string> {
  const ate = new Date(Date.now() + (p.dias ?? QUARENTENA_DIAS) * 86_400_000).toISOString();
  await gravar({
    proxy_key: p.proxyKey,
    host: p.host,
    port: p.port,
    status: 'quarentena',
    instance_name: p.instanceName,
    quarantine_until: ate,
    retired_reason: p.motivo.slice(0, 200),
  });
  return ate;
}

/** Outro chip ATIVO ja sai por este IP publico? (devolve o nome dele) */
export async function outroChipComEgress(egressIp: string, instanceName: string): Promise<string | null> {
  const ctx = await contexto();
  if (!ctx) return null;
  try {
    const { data, error } = await ctx.db
      .from('proxy_ip_registry')
      .select('instance_name')
      .eq('organization_id', ctx.organizationId)
      .eq('egress_ip', egressIp)
      .eq('status', 'ativo')
      .neq('instance_name', instanceName)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data?.instance_name as string) || null;
  } catch {
    return null;
  }
}
