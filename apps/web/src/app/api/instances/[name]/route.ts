import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  isValidInstanceName,
  unregisterInstance,
  DEFAULT_INSTANCE,
} from '@/lib/instanceRegistry';
import { invalidateEvolutionCache, configurarWebhookInstancia, getProxyInstancia, configurarProxyInstancia, garantirWebhookAtual } from '@/lib/evolutionService';
import { setDispatchEnabled, setMaturidadeChip, liberarCooldownChip, aposentarChipNaFila } from '@/lib/dispatchQueue';
import { prepareInstanceForQr, ensureInstanceProxy, lerProxyDaInstancia } from '@/lib/proxyPool';
import { chavesEmQuarentena, colocarEmQuarentena, QUARENTENA_DIAS } from '@/lib/proxyRegistry';
import { validarIpDaInstancia } from '@/lib/proxyGuard';
import { dentroDaJanela } from '@/lib/antiBan';

import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
// QR = criar + proxy + medir IP de saida + connect: passa dos 10s padrao.
export const maxDuration = 60;

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

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

function serverReady(): NextResponse | null {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'not_configured', message: 'Servidor Evolution não configurado.' },
      { status: 400 }
    );
  }
  return null;
}

// POST: ações sobre um número específico — get_qr | disconnect | status
export async function POST(req: NextRequest, { params }: { params: { name: string } }) {
  try {
    const unauthorized = await requireUser();
    if (unauthorized) return unauthorized;

    const instanceName = decodeURIComponent(params.name);
    if (!isValidInstanceName(instanceName)) {
      return NextResponse.json({ success: false, error: 'invalid_name' }, { status: 400 });
    }

    const notReady = serverReady();
    if (notReady) return notReady;

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Gera/renova QR Code real para conectar este número
    if (action === 'get_qr') {
      // Garante a instância (idempotente) e o IP fixo dedicado ANTES de abrir o
      // socket. Sem proxy do pool a conexão é recusada: número sem IP fixo cai.
      // IPs de chips aposentados (quarentena) nao podem ir para este numero.
      const quarantined = await chavesEmQuarentena();
      const proxy = await prepareInstanceForQr(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName, {
        quarantined,
      });
      if (!proxy.ok) {
        return NextResponse.json(
          { success: false, error: proxy.error, message: proxy.message },
          { status: proxy.status }
        );
      }

      // IP de saida do Brasil, sem repeticao entre chips; registra a atribuicao.
      const ip = await validarIpDaInstancia(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName);
      if (ip.bloqueio) {
        return NextResponse.json(
          { success: false, error: ip.bloqueio.error, message: ip.bloqueio.message },
          { status: ip.bloqueio.status }
        );
      }

      try {
        const qrRes = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
          headers: { apikey: EVOLUTION_API_KEY },
          signal: AbortSignal.timeout(6000),
        });
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          const raw =
            qrData.base64 ||
            qrData.qrcode?.base64 ||
            (typeof qrData.qrcode === 'string' && qrData.qrcode.startsWith('data:') ? qrData.qrcode : null);
          if (raw) {
            const base64Clean = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
            // Webhook com URL/token atuais ANTES de o numero conectar: senao a
            // instancia nasce/volta surda (respostas e acks nunca chegam).
            const wh = await garantirWebhookAtual(instanceName, req.nextUrl?.origin).catch(() => null);
            invalidateEvolutionCache(instanceName);
            return NextResponse.json({
              success: true,
              status: 'connecting',
              qrCode: base64Clean,
              pairingCode: qrData.pairingCode || qrData.qrcode?.pairingCode,
              proxyIp: proxy.host ? `${proxy.host}:${proxy.port}` : undefined,
              proxyWarning: proxy.warning,
              egressIp: ip.egress?.ip,
              egressCountry: ip.egress?.countryCode,
              ipAviso: ip.aviso,
              webhookConfigurado: wh?.ok ?? false,
              webhookUrl: wh?.url,
              message:
                (proxy.warning ? `⚠️ ${proxy.message} ` : '') +
                (ip.aviso ? `⚠️ ${ip.aviso} ` : '') +
                'QR Code gerado. Aponte o WhatsApp do número.',
            });
          }
          // A Evolution respondeu mas sem QR: normalmente a instancia JA esta
          // conectada (state open) ou em "connecting" com sessao antiga. Devolve
          // o motivo em vez de "servidor inacessivel".
          const estado = qrData?.instance?.state || qrData?.state;
          return NextResponse.json(
            {
              success: false,
              error: estado === 'open' ? 'already_connected' : 'no_qr',
              state: estado,
              message:
                estado === 'open'
                  ? 'Este número já está conectado. Desconecte antes de gerar um novo QR.'
                  : `A Evolution não devolveu QR (estado: ${estado || 'desconhecido'}). Se ficar preso em "connecting", remova a instância e crie de novo.`,
            },
            { status: 409 }
          );
        }
        const txt = await qrRes.text().catch(() => '');
        return NextResponse.json(
          { success: false, error: 'evolution_error', message: `Evolution respondeu HTTP ${qrRes.status} ao gerar o QR: ${txt.slice(0, 300)}` },
          { status: 502 }
        );
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: 'server_offline', message: err.message },
          { status: 502 }
        );
      }
    }

    // Mede o IP publico de saida do chip (pelo proprio proxy) e confere: Brasil,
    // sem repeticao entre chips, sem marca de datacenter.
    if (action === 'check_ip') {
      const ip = await validarIpDaInstancia(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName);
      return NextResponse.json(
        {
          success: ip.ok,
          proxyIp: ip.proxyHostPort,
          egressIp: ip.egress?.ip,
          egressCountry: ip.egress?.countryCode,
          egressRegion: ip.egress?.region,
          egressCity: ip.egress?.city,
          egressIsp: ip.egress?.isp,
          hosting: ip.egress?.hosting,
          error: ip.bloqueio?.error,
          message: ip.bloqueio?.message || ip.aviso || 'IP de saída verificado: Brasil e sem repetição.',
        },
        { status: ip.bloqueio?.status ?? 200 }
      );
    }

    // Atribui um IP livre do pool a uma instancia JA existente (ex.: migrar o chip
    // do proxy rotativo antigo para um IP fixo). Reiniciar o socket e o que faz o
    // IP novo valer, e derruba os envios por instantes: por isso recusa dentro da
    // janela de disparo (8h-20h MS), a menos que venha force:true.
    if (action === 'assign_ip') {
      const reiniciar = body.restart !== false;
      if (reiniciar && dentroDaJanela() && body.force !== true) {
        return NextResponse.json(
          {
            success: false,
            error: 'dentro_da_janela',
            message:
              'Reiniciar o chip agora interrompe os disparos (janela 8h–20h MS). Faça fora da janela ou confirme com force.',
          },
          { status: 409 }
        );
      }
      const quarantined = await chavesEmQuarentena();
      const r = await ensureInstanceProxy(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName, {
        quarantined,
      });
      if (!r.ok) {
        return NextResponse.json({ success: false, error: r.error, message: r.message }, { status: r.status });
      }
      if (!r.proxyKey) {
        return NextResponse.json(
          {
            success: false,
            error: 'sem_ip_livre',
            message: r.message || 'Nenhum IP livre no pool (EVOLUTION_PROXY_POOL).',
          },
          { status: 409 }
        );
      }
      const ip = await validarIpDaInstancia(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName);
      if (ip.bloqueio) {
        return NextResponse.json(
          {
            success: false,
            error: ip.bloqueio.error,
            message: `${ip.bloqueio.message} O IP foi gravado na instância, mas o chip NÃO foi reiniciado.`,
          },
          { status: ip.bloqueio.status }
        );
      }
      let reiniciado = false;
      if (r.assigned && reiniciar) {
        try {
          const rr = await fetch(`${EVOLUTION_API_URL}/instance/restart/${encodeURIComponent(instanceName)}`, {
            method: 'POST',
            headers: { apikey: EVOLUTION_API_KEY },
            signal: AbortSignal.timeout(15000),
          });
          reiniciado = rr.ok;
        } catch {}
      }
      invalidateEvolutionCache(instanceName);
      return NextResponse.json({
        success: true,
        assigned: r.assigned,
        reiniciado,
        proxyIp: `${r.host}:${r.port}`,
        egressIp: ip.egress?.ip,
        egressCountry: ip.egress?.countryCode,
        ipAviso: ip.aviso,
        message: r.assigned
          ? reiniciado
            ? 'IP fixo aplicado e chip reiniciado. Em instantes ele volta a `open` sem pedir QR.'
            : 'IP fixo gravado. Reinicie o chip para ele passar a sair por esse IP.'
          : 'O chip já usa um IP do pool; nada a alterar.',
      });
    }

    // APOSENTAR (chip banido/perdido): apaga a instancia, tira do disparo, devolve
    // a fila os contatos reservados para ele e poe o IP em QUARENTENA -- o IP nao
    // vai direto para o numero novo. Banimento e da CONTA, nao do IP: trocar de
    // IP so ajuda ao abrir um numero novo.
    if (action === 'retire') {
      if (instanceName === DEFAULT_INSTANCE) {
        return NextResponse.json(
          {
            success: false,
            error: 'default_locked',
            message:
              'Esta é a instância padrão (EVOLUTION_INSTANCE). Defina outra instância como padrão antes de aposentá-la.',
          },
          { status: 400 }
        );
      }
      const motivo = String(body.motivo || 'banido').trim().slice(0, 120) || 'banido';

      // Le o IP ANTES de apagar: depois de apagada, a instancia leva o proxy junto.
      const px = await lerProxyDaInstancia(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName);

      for (const [metodo, caminho] of [
        ['DELETE', 'logout'],
        ['DELETE', 'delete'],
      ] as const) {
        try {
          await fetch(`${EVOLUTION_API_URL}/instance/${caminho}/${encodeURIComponent(instanceName)}`, {
            method: metodo,
            headers: { apikey: EVOLUTION_API_KEY },
            signal: AbortSignal.timeout(8000),
          });
        } catch {}
      }

      const { devolvidos } = await aposentarChipNaFila(instanceName);
      let quarentenaAte: string | undefined;
      if (px?.key) {
        quarentenaAte = await colocarEmQuarentena({
          proxyKey: px.key,
          host: px.host,
          port: px.port,
          instanceName,
          motivo,
        });
      }
      invalidateEvolutionCache(instanceName);
      unregisterInstance(instanceName);

      return NextResponse.json({
        success: true,
        contatosDevolvidos: devolvidos,
        ipEmQuarentena: px ? `${px.host}:${px.port}` : undefined,
        quarentenaAte,
        message:
          `Chip aposentado. ${devolvidos} contato(s) voltaram para a fila dos outros chips.` +
          (px
            ? ` O IP ${px.host}:${px.port} ficou ${QUARENTENA_DIAS} dias em quarentena.`
            : ' O chip não tinha IP registrado.') +
          ' Para substituir, crie um número novo: ele recebe outro IP livre.',
      });
    }

    // Desconecta (logout) o número, mantendo a instância registrada
    if (action === 'disconnect') {
      try {
        await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: { apikey: EVOLUTION_API_KEY },
          signal: AbortSignal.timeout(5000),
        });
      } catch {}
      invalidateEvolutionCache(instanceName);
      return NextResponse.json({ success: true, message: 'Número desconectado.' });
    }

    // Status atual da conexão
    if (action === 'status') {
      try {
        const res = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
          headers: { apikey: EVOLUTION_API_KEY },
          signal: AbortSignal.timeout(4000),
        });
        const data = await res.json().catch(() => ({}));
        const state = data?.instance?.state || data?.state || 'disconnected';
        invalidateEvolutionCache(instanceName);
        return NextResponse.json({ success: true, state });
      } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 502 });
      }
    }

    // Liga/desliga a instancia no CLUSTER DE DISPARO (selecao multipla).
    // Nao confundir com o "ATIVO" da tela, que e o radio de visualizacao do
    // Inbox e vive no localStorage do navegador.
    // Declara se o numero ja esta aquecido. Nao da para inferir: o primeiro
    // disparo por aqui nao diz nada sobre a idade real do chip.
    // Repara o webhook de uma instancia que nasceu (ou ficou) surda.
    if (action === 'fix_webhook') {
      const r = await configurarWebhookInstancia(instanceName, undefined, req.nextUrl?.origin);
      return NextResponse.json({
        success: r.ok,
        instanceName,
        url: r.url,
        message: r.ok
          ? 'Webhook configurado: respostas e confirmações de entrega voltam a chegar.'
          : r.error,
      }, { status: r.ok ? 200 : 502 });
    }

    if (action === 'set_maturidade') {
      const mat = body.maturidade === 'maduro' ? 'maduro' : 'novo';
      await setMaturidadeChip(instanceName, mat);
      return NextResponse.json({
        success: true,
        instanceName,
        maturidade: mat,
        message:
          mat === 'maduro'
            ? 'Numero marcado como aquecido: usa o teto de regime.'
            : 'Numero em warm-up: o teto comeca baixo e cresce a cada dia.',
      });
    }

    if (action === 'get_proxy') {
      const proxy = await getProxyInstancia(instanceName);
      return NextResponse.json({ success: true, instanceName, proxy });
    }

    // Associa um proxy (IP dedicado, ISP/residencial) a este número. Sem
    // proxy configurado, a instância sai pelo IP compartilhado do servidor
    // Evolution -- o mesmo de todos os outros chips -- e herda a reputação
    // dele mesmo sendo um número "quente".
    if (action === 'set_proxy') {
      const { host, port, protocol, username, password } = body;
      if (!host || !port) {
        return NextResponse.json(
          { success: false, error: 'Host e porta do proxy são obrigatórios.' },
          { status: 400 }
        );
      }
      const r = await configurarProxyInstancia(instanceName, { host, port, protocol, username, password });
      return NextResponse.json({
        success: r.ok,
        instanceName,
        message: r.ok
          ? `Proxy configurado: ${instanceName} agora sai por ${host}:${port}.`
          : r.error,
      }, { status: r.ok ? 200 : 502 });
    }

    // Remove o proxy: a instância volta a sair pelo IP compartilhado do servidor.
    if (action === 'remove_proxy') {
      const r = await configurarProxyInstancia(instanceName, null);
      return NextResponse.json({
        success: r.ok,
        instanceName,
        message: r.ok
          ? 'Proxy removido: o número volta a sair pelo IP do servidor.'
          : r.error,
      }, { status: r.ok ? 200 : 502 });
    }

    // Libera manualmente um chip em RESFRIANDO/PAUSA DE LOTE, sem esperar os
    // 90/180 min. Usar quando a causa da pausa ja foi resolvida (numero
    // conferido, proxy corrigido).
    if (action === 'liberar_cooldown') {
      await liberarCooldownChip(instanceName);
      return NextResponse.json({
        success: true,
        instanceName,
        message: 'Cooldown liberado: o número volta ao disparo normal agora.',
      });
    }

    if (action === 'set_dispatch') {
      const enabled = body.enabled !== false;
      await setDispatchEnabled(instanceName, enabled);
      return NextResponse.json({
        success: true,
        instanceName,
        dispatchEnabled: enabled,
        message: enabled
          ? 'Número incluído no cluster de disparo.'
          : 'Número fora do cluster de disparo (segue disponível para atendimento no Inbox).',
      });
    }

    return NextResponse.json({ success: false, error: 'unknown_action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE: remove por completo a instância do servidor Evolution e do registro.
export async function DELETE(req: NextRequest, { params }: { params: { name: string } }) {
  try {
    const unauthorized = await requireUser();
    if (unauthorized) return unauthorized;

    const instanceName = decodeURIComponent(params.name);
    if (!isValidInstanceName(instanceName)) {
      return NextResponse.json({ success: false, error: 'invalid_name' }, { status: 400 });
    }
    if (instanceName === DEFAULT_INSTANCE) {
      return NextResponse.json(
        { success: false, error: 'default_locked', message: 'A instância padrão não pode ser removida.' },
        { status: 400 }
      );
    }

    const notReady = serverReady();
    if (!notReady) {
      // logout + delete no servidor Evolution (best-effort)
      try {
        await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: { apikey: EVOLUTION_API_KEY },
          signal: AbortSignal.timeout(5000),
        });
      } catch {}
      try {
        await fetch(`${EVOLUTION_API_URL}/instance/delete/${instanceName}`, {
          method: 'DELETE',
          headers: { apikey: EVOLUTION_API_KEY },
          signal: AbortSignal.timeout(5000),
        });
      } catch {}
    }

    invalidateEvolutionCache(instanceName);
    unregisterInstance(instanceName);

    return NextResponse.json({ success: true, message: 'Instância removida.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
