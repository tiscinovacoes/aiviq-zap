import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  listKnownInstances,
  registerInstance,
  isValidInstanceName,
  DEFAULT_INSTANCE,
} from '@/lib/instanceRegistry';
import {
  fetchLiveEvolutionInstances,
  invalidateEvolutionCache,
  EvolutionLiveInstance,
  configurarWebhookInstancia,
  getWebhookInstancia,
  getProxyInstancia,
} from '@/lib/evolutionService';
import { getDispatchPool, getMaturidadeChips, getProgressoPorChip } from '@/lib/dispatchQueue';
import { capDoChip, ANTIBAN } from '@/lib/antiBan';
import {
  countFreeProxies,
  ensureInstanceProxy,
  estaNoPool,
  parsePool,
  proxyKey,
  proxyObrigatorio,
} from '@/lib/proxyPool';
import { chavesEmQuarentena, listarRegistroIps, quarentenaDe } from '@/lib/proxyRegistry';
import { validarIpDaInstancia } from '@/lib/proxyGuard';
import { classificarChip, type EstadoChip } from '@/lib/chipState';

import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
// Criar instancia = criar + atribuir proxy + medir IP de saida: passa dos 10s padrao.
export const maxDuration = 60;

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

// Defesa em profundidade: exige usuário autenticado (a não ser em modo placeholder/local ou demo autorizado).
async function requireUser(req?: NextRequest): Promise<NextResponse | null> {
  const isPlaceholder =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder-project');
  if (isPlaceholder) return null;

  const allowDemo = process.env.NODE_ENV === 'development' || process.env.ALLOW_DEMO_LOGIN === 'true';
  if (allowDemo) {
    let token = req?.cookies?.get('poli_dev_token')?.value || req?.cookies?.get('poli_token')?.value;
    if (!token) {
      try {
        const cookieStore = await cookies();
        token = cookieStore.get('poli_dev_token')?.value || cookieStore.get('poli_token')?.value;
      } catch {}
    }
    if (token === 'mock-dev-token-jwt') {
      return null;
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado', message: 'Sessão expirada ou usuário não autenticado.' }, { status: 401 });
  return null;
}

export interface InstanceView {
  instanceName: string;
  label: string;
  isDefault: boolean;
  status: EvolutionLiveInstance['status'];
  phoneNumber?: string;
  profileName?: string;
  profilePicUrl?: string;
  /** Participa do cluster de disparo (multiplo, por organizacao). */
  dispatchEnabled: boolean;
  /** 'novo' entra na curva de warm-up; 'maduro' usa o teto de regime. */
  maturidade: 'novo' | 'maduro';
  /** Teto de mensagens permitido HOJE para este chip. */
  capHoje: number;
  /** Fora do pool ate este horario (resfriamento por falhas ou pausa de lote). */
  cooldownAte?: string;
  cooldownMotivo?: string;
  /** Quantos contatos pendentes estao carimbados (assigned_instance) para
   *  este chip agora -- 0 com o chip operando normalmente = fatia esgotada,
   *  ocioso ate a proxima importacao ou redistribuicao. */
  pendentesNaFila: number;
  /** false = a Evolution nao tem para onde avisar respostas nem acks. */
  webhookOk: boolean;
  /** true = a instancia tem IP dedicado (proxy) configurado na Evolution. */
  proxyOk: boolean;
  proxyHost?: string;
  proxyPort?: string;
  proxyProtocol?: string;
  proxyUsername?: string;
  proxyHasPassword?: boolean;
  /** Caiu / recusando entrega / duplicada / online (ver lib/chipState). */
  estado?: EstadoChip;
  estadoMotivo?: string;
  /** host:porta do IP do chip (usuario e senha nunca saem do servidor). */
  proxyHostPort?: string;
  /** false = o chip usa um proxy que NAO esta no EVOLUTION_PROXY_POOL (ex.: o rotativo antigo). */
  ipNoPool?: boolean;
  /** IP publico medido pelo proxy e pais (registro de IPs). */
  egressIp?: string;
  egressCountry?: string;
}

export interface PoolResumo {
  total: number;
  emUso: number;
  livres: number;
  emQuarentena: number;
  ilimitado: boolean;
  obrigatorio: boolean;
}

// GET: lista todas as instâncias conhecidas (registro local + servidor Evolution),
// com status de conexão real de cada número.
export async function GET() {
  try {
    const unauthorized = await requireUser();
    if (unauthorized) return unauthorized;

    const [live, pool, maturidades, progressoPorChip, registro] = await Promise.all([
      fetchLiveEvolutionInstances(),
      getDispatchPool(),
      getMaturidadeChips(),
      getProgressoPorChip(),
      listarRegistroIps(),
    ]);
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Campo_Grande' });
    const liveByName = new Map(live.map((i) => [i.instanceName, i]));
    const pendentesByName = new Map(progressoPorChip.map((p) => [p.instancia, p.pendentes]));
    const regPorChave = new Map(registro.map((r) => [r.proxyKey, r]));

    // Qualquer instância que exista no servidor mas não no registro local é auto-registrada,
    // para aparecer no seletor e permitir troca.
    for (const li of live) {
      if (!listKnownInstances().some((k) => k.instanceName === li.instanceName)) {
        registerInstance(li.instanceName, li.profileName || li.instanceName);
      }
    }

    // Instancia apagada na Evolution nao pode continuar aparecendo (o registro em
    // memoria sempre carrega a instancia padrao, mesmo que ela nao exista mais).
    // Se a Evolution nao respondeu (lista vazia), mostra tudo para nao deixar a tela em branco.
    const known = listKnownInstances().filter(
      (k) => live.length === 0 || liveByName.has(k.instanceName)
    );
    const instances: InstanceView[] = await Promise.all(
      known.map(async (k) => {
        const l = liveByName.get(k.instanceName);
        const m = maturidades[k.instanceName];
        const proxy = await getProxyInstancia(k.instanceName);
        const status = l?.status || 'disconnected';
        const est = classificarChip({
          status,
          cooldownAte: m?.cooldownAte,
          cooldownMotivo: m?.cooldownMotivo,
          duplicateOf: l?.duplicateOf,
        });
        const reg = l?.proxyKey ? regPorChave.get(l.proxyKey) : undefined;
        return {
          instanceName: k.instanceName,
          label: k.label,
          isDefault: k.instanceName === DEFAULT_INSTANCE,
          status,
          phoneNumber: l?.phoneNumber,
          profileName: l?.profileName,
          profilePicUrl: l?.profilePicUrl,
          dispatchEnabled: pool[k.instanceName] !== false, // ausente = participa
          maturidade: (m?.maturidade || 'novo') as 'novo' | 'maduro',
          capHoje: await capDoChip(k.instanceName, hoje),
          cooldownAte: m?.cooldownAte,
          cooldownMotivo: m?.cooldownMotivo,
          pendentesNaFila: pendentesByName.get(k.instanceName) || 0,
          webhookOk: Boolean(await getWebhookInstancia(k.instanceName)),
          proxyOk: Boolean(proxy?.enabled && proxy?.host),
          proxyHost: proxy?.host,
          proxyPort: proxy?.port,
          proxyProtocol: proxy?.protocol,
          proxyUsername: proxy?.username,
          proxyHasPassword: proxy?.hasPassword,
          estado: est.estado,
          estadoMotivo: est.motivo,
          proxyHostPort: l?.proxyHost ? `${l.proxyHost}:${l.proxyPort}` : undefined,
          ipNoPool: l?.proxyKey ? estaNoPool(l.proxyKey, k.instanceName) : undefined,
          egressIp: reg?.egressIp,
          egressCountry: reg?.egressCountry,
        };
      })
    );

    // Resumo do pool de IPs: quantos livres, em uso e em quarentena.
    const poolCfg = parsePool(process.env.EVOLUTION_PROXY_POOL);
    const estaticos = poolCfg.filter((p) => !p.perInstance);
    const usadas = new Set(live.map((i) => i.proxyKey).filter((k): k is string => Boolean(k)));
    const quarentena = quarentenaDe(registro);
    const poolResumo: PoolResumo = {
      total: poolCfg.length,
      emUso: estaticos.filter((p) => usadas.has(proxyKey(p))).length,
      livres: estaticos.filter((p) => !usadas.has(proxyKey(p)) && !quarentena.has(proxyKey(p))).length,
      emQuarentena: estaticos.filter((p) => quarentena.has(proxyKey(p))).length,
      ilimitado: poolCfg.some((p) => p.perInstance),
      obrigatorio: proxyObrigatorio(),
    };

    return NextResponse.json({ success: true, instances, poolResumo });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Erro ao listar instâncias' },
      { status: 500 }
    );
  }
}

// POST: cria uma nova instância (novo número) no servidor Evolution e a registra.
export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireUser();
    if (unauthorized) return unauthorized;

    const body = await req.json();
    const instanceName = String(body.instanceName || '').trim();
    const label = String(body.label || instanceName).trim();

    if (!isValidInstanceName(instanceName)) {
      return NextResponse.json(
        {
          success: false,
          error: 'invalid_name',
          message: 'Nome inválido. Use 3 a 48 caracteres: letras, números, _ ou -.',
        },
        { status: 400 }
      );
    }

    if (listKnownInstances().some((k) => k.instanceName === instanceName)) {
      return NextResponse.json(
        { success: false, error: 'exists', message: 'Já existe uma instância com esse nome.' },
        { status: 409 }
      );
    }

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'not_configured',
          message: 'Servidor Evolution não configurado (EVOLUTION_API_URL / EVOLUTION_API_KEY).',
        },
        { status: 400 }
      );
    }

    // No modo estrito (EVOLUTION_PROXY_REQUIRED=true) recusa cedo, antes de
    // criar qualquer coisa: numero sem IP fixo dedicado cai. Fora dele, so
    // avisa (ensureInstanceProxy devolve `warning`).
    // IPs de chips aposentados ficam em quarentena e nao entram na escolha.
    const quarantined = await chavesEmQuarentena();
    const cap = await countFreeProxies(EVOLUTION_API_URL, EVOLUTION_API_KEY, { quarantined });
    if (cap.obrigatorio && cap.total === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'pool_not_configured',
          message:
            'Nenhum proxy configurado (EVOLUTION_PROXY_POOL). Sem IP fixo dedicado o número cai no WhatsApp, por isso a criação foi recusada.',
        },
        { status: 503 }
      );
    }
    if (cap.obrigatorio && cap.free === 0 && !cap.ilimitado) {
      return NextResponse.json(
        {
          success: false,
          error: 'no_proxy_available',
          message:
            `Nenhum IP livre no pool (${cap.total} configurados` +
            `${cap.quarentena ? `, ${cap.quarentena} em quarentena` : ''}). ` +
            'Contrate/adicione outro IP ISP em EVOLUTION_PROXY_POOL antes de criar outro número.',
        },
        { status: 409 }
      );
    }

    // Sem QR na criacao: o socket so pode abrir DEPOIS do proxy. O painel busca
    // o QR em seguida via get_qr (que tambem garante o proxy).
    try {
      const res = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({
          instanceName,
          qrcode: false,
          integration: 'WHATSAPP-BAILEYS',
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok && res.status !== 403 && res.status !== 409) {
        return NextResponse.json(
          {
            success: false,
            error: 'create_failed',
            message: `Servidor Evolution respondeu ${res.status} ao criar a instância.`,
          },
          { status: 502 }
        );
      }
    } catch (err: any) {
      return NextResponse.json(
        {
          success: false,
          error: 'unreachable',
          message: `Não foi possível contactar o servidor Evolution em ${EVOLUTION_API_URL}.`,
          details: err.message,
        },
        { status: 502 }
      );
    }

    // IP fixo dedicado. Se nao der, desfaz a instancia recem-criada e recusa:
    // nao existe instancia "sem proxy" no sistema.
    const desfazer = () =>
      fetch(`${EVOLUTION_API_URL}/instance/delete/${encodeURIComponent(instanceName)}`, {
        method: 'DELETE',
        headers: { apikey: EVOLUTION_API_KEY },
        signal: AbortSignal.timeout(8000),
      }).catch(() => undefined);

    const proxy = await ensureInstanceProxy(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName, {
      quarantined,
    });
    if (!proxy.ok) {
      await desfazer();
      return NextResponse.json(
        { success: false, error: proxy.error, message: proxy.message },
        { status: proxy.status }
      );
    }

    // Confere o IP de saida (Brasil, sem repeticao entre chips) e registra a atribuicao.
    const ip = await validarIpDaInstancia(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName);
    if (ip.bloqueio) {
      await desfazer();
      return NextResponse.json(
        { success: false, error: ip.bloqueio.error, message: ip.bloqueio.message },
        { status: ip.bloqueio.status }
      );
    }

    // Sem isto a instancia nasce SURDA: a Evolution nao teria para onde avisar
    // respostas nem acks de entrega, e a campanha coletaria zero sem nenhum
    // sinal na tela -- foi o que aconteceu em 17/09 com 69 eleitores.
    // Origem da propria requisicao como ultimo recurso: se a env nao estiver
    // definida, ainda assim a instancia nasce ouvindo.
    const origem = req.nextUrl?.origin || undefined;
    const wh = await configurarWebhookInstancia(instanceName, undefined, origem);
    if (!wh.ok) {
      console.error('[instances] webhook nao configurado em ' + instanceName + ': ' + wh.error);
    }

    const entry = registerInstance(instanceName, label);
    // A lista viva da Evolution tem cache de 4s: sem isto o numero recem-criado
    // some da tela por alguns segundos.
    invalidateEvolutionCache();

    return NextResponse.json(
      {
        success: true,
        instance: entry,
        proxyIp: proxy.host ? `${proxy.host}:${proxy.port}` : undefined,
        proxyWarning: proxy.warning,
        proxyMessage: proxy.message,
        egressIp: ip.egress?.ip,
        egressCountry: ip.egress?.countryCode,
        ipAviso: ip.aviso,
        webhookConfigurado: wh.ok,
        webhookUrl: wh.url,
        webhookErro: wh.ok ? undefined : wh.error,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Erro ao criar instância' },
      { status: 500 }
    );
  }
}
