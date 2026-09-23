import { RespostaEleitor, EtapaPesquisa, candidatosParaExibir } from './pesquisaSenado';
import { getServiceContext, isPlaceholderEnv } from './supabase/authContext';

// Persistência das sessões da Pesquisa Senado.
// - Com Supabase configurado: tabela `pesquisa_senado` (durável, sem flicker).
// - Sem Supabase (dev): fallback em memória, começando VAZIO (sem seed mock).

declare global {
  // eslint-disable-next-line no-var
  var __aiviq_pesquisa_senado: RespostaEleitor[] | undefined;
}
if (!global.__aiviq_pesquisa_senado) {
  global.__aiviq_pesquisa_senado = [];
}

const TABLE = 'pesquisa_senado';

function rowToSession(r: any): RespostaEleitor {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    bairro: r.bairro ?? undefined,
    etapa: r.etapa as EtapaPesquisa,
    voto1Id: r.voto1_id ?? undefined,
    voto1Nome: r.voto1_nome ?? undefined,
    voto2Id: r.voto2_id ?? undefined,
    voto2Nome: r.voto2_nome ?? undefined,
    instanceName: r.instance_name ?? r.instanceName ?? undefined,
    listaVersao: r.lista_versao ?? undefined,
    saudacaoRespondidaEm: r.saudacao_respondida_em ?? undefined,
    msg3EnviadaEm: r.msg3_enviada_em ?? undefined,
    createdAt: r.created_at,
    lastMessageAt: r.updated_at,
  };
}

const cleanPhone = (p: string) => p.replace(/\D/g, '');

export async function getPesquisaSessions(): Promise<RespostaEleitor[]> {
  if (isPlaceholderEnv()) return global.__aiviq_pesquisa_senado || [];
  const ctx = await getServiceContext();
  if (!ctx) return [];
  const { data } = await ctx.db
    .from(TABLE)
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('updated_at', { ascending: false });
  return (data ?? []).map(rowToSession);
}

export async function getPesquisaSessionByPhone(
  phone: string
): Promise<RespostaEleitor | undefined> {
  const clean = cleanPhone(phone);
  if (isPlaceholderEnv()) {
    return (global.__aiviq_pesquisa_senado || []).find((s) => {
      const sc = cleanPhone(s.phone);
      return sc === clean || sc.endsWith(clean) || clean.endsWith(sc);
    });
  }
  const ctx = await getServiceContext();
  if (!ctx) return undefined;
  // Match exato; fallback por sufixo (variações de DDI 55).
  let { data } = await ctx.db
    .from(TABLE)
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('phone', clean)
    .maybeSingle();
  if (!data && clean.length >= 8) {
    const sufixo = clean.slice(-8);
    const res = await ctx.db
      .from(TABLE)
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .ilike('phone', `%${sufixo}`)
      .limit(1)
      .maybeSingle();
    data = res.data;
  }
  return data ? rowToSession(data) : undefined;
}

export async function savePesquisaSession(
  session: RespostaEleitor
): Promise<RespostaEleitor> {
  const clean = cleanPhone(session.phone);
  if (isPlaceholderEnv()) {
    const list = global.__aiviq_pesquisa_senado!;
    const idx = list.findIndex((s) => s.id === session.id || cleanPhone(s.phone) === clean);
    const now = new Date().toISOString();
    if (idx >= 0) {
      list[idx] = { ...session, phone: clean, lastMessageAt: now };
      return list[idx];
    }
    const created = { ...session, phone: clean, createdAt: session.createdAt || now, lastMessageAt: now };
    list.unshift(created);
    return created;
  }

  const ctx = await getServiceContext();
  if (!ctx) throw new Error('Supabase indisponível para salvar pesquisa');
  
  const payloadBase: any = {
    organization_id: ctx.organizationId,
    phone: clean,
    name: session.name,
    bairro: session.bairro ?? null,
    etapa: session.etapa,
    voto1_id: session.voto1Id ?? null,
    voto1_nome: session.voto1Nome ?? null,
    voto2_id: session.voto2Id ?? null,
    voto2_nome: session.voto2Nome ?? null,
  };
  // Só grava a versão da lista quando ela foi definida (ao enviar Msg 3/4);
  // omitida, o banco mantém a que já estava.
  if (session.listaVersao) payloadBase.lista_versao = session.listaVersao;

  let data: any;
  let error: any;

  if (session.instanceName) {
    const res = await ctx.db
      .from(TABLE)
      .upsert({ ...payloadBase, instance_name: session.instanceName }, { onConflict: 'organization_id,phone' })
      .select('*')
      .single();
    if (!res.error) {
      data = res.data;
    } else {
      // Se a coluna ainda nao existe no schema, salva sem ela
      const fallbackRes = await ctx.db
        .from(TABLE)
        .upsert(payloadBase, { onConflict: 'organization_id,phone' })
        .select('*')
        .single();
      data = fallbackRes.data;
      error = fallbackRes.error;
    }
  } else {
    const res = await ctx.db
      .from(TABLE)
      .upsert(payloadBase, { onConflict: 'organization_id,phone' })
      .select('*')
      .single();
    data = res.data;
    error = res.error;
  }

  if (error) throw error;
  return rowToSession(data);
}

export async function createOrUpdateSessionByPhone(
  phone: string,
  name: string,
  updates: Partial<RespostaEleitor>
): Promise<RespostaEleitor> {
  const existing = await getPesquisaSessionByPhone(phone);
  const merged: RespostaEleitor = existing
    ? { ...existing, ...updates, name: name || existing.name }
    : {
        id: `ps-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        phone: cleanPhone(phone),
        name: name || `Eleitor ${cleanPhone(phone).slice(-4)}`,
        etapa: 'disparado',
        createdAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        ...updates,
      };
  return savePesquisaSession(merged);
}

export interface PesquisaStats {
  totalEleitores: number;
  totalConcluidos: number;
  taxaConclusao: string;
  porEtapa: Record<EtapaPesquisa, number>;
  rankingVoto1: Array<{ id: number; nome: string; rotulo: string; votos: number; percentual: string }>;
  rankingVoto2: Array<{ id: number; nome: string; rotulo: string; votos: number; percentual: string }>;
  rankingGeral: Array<{ id: number; nome: string; rotulo: string; votos1: number; votos2: number; totalVotos: number; percentual: string }>;
}

// ---------------------------------------------------------------------------
// RECORTE DO FUNIL (decisão do operador, 23/09/2026)
// A coluna "1. Disparado" e o total de disparos contam só a partir de 19/09.
// Os contatos abordados antes disso que NUNCA responderam ficam fora do funil e
// das proporções (são da fase em que os chips caíram / disparavam no vazio).
// Quem respondeu, votou ou concluiu continua valendo, qualquer que seja a data.
// Nada é apagado do banco: é só o recorte do que o painel mostra.
// ---------------------------------------------------------------------------
export const CORTE_DISPAROS_ISO = '2026-09-19T00:00:00-04:00'; // 19/09 00h MS

export function aplicarRecorteFunil(sessions: RespostaEleitor[]): RespostaEleitor[] {
  const corte = new Date(CORTE_DISPAROS_ISO).getTime();
  return sessions.filter((s) => {
    if (s.etapa !== 'disparado') return true;
    const t = s.createdAt ? new Date(s.createdAt).getTime() : NaN;
    return isNaN(t) || t >= corte;
  });
}

export async function getPesquisaStats(base?: RespostaEleitor[]): Promise<PesquisaStats> {
  const sessions = base ?? aplicarRecorteFunil(await getPesquisaSessions());
  const totalEleitores = sessions.length;
  const concluidos = sessions.filter((s) => s.etapa === 'concluido');
  const totalConcluidos = concluidos.length;
  const taxaConclusao =
    totalEleitores > 0 ? `${((totalConcluidos / totalEleitores) * 100).toFixed(1)}%` : '0%';

  const porEtapa: Record<EtapaPesquisa, number> = {
    disparado: 0,
    aguardando_voto1: 0,
    aguardando_voto2: 0,
    concluido: 0,
    recusado: 0,
  };
  sessions.forEach((s) => {
    porEtapa[s.etapa] = (porEtapa[s.etapa] || 0) + 1;
  });

  const mapVoto1: Record<number, number> = {};
  const mapVoto2: Record<number, number> = {};
  concluidos.forEach((s) => {
    if (s.voto1Id) mapVoto1[s.voto1Id] = (mapVoto1[s.voto1Id] || 0) + 1;
    if (s.voto2Id) mapVoto2[s.voto2Id] = (mapVoto2[s.voto2Id] || 0) + 1;
  });

  const rankingVoto1 = candidatosParaExibir(mapVoto1).map((c) => {
    const votos = mapVoto1[c.id] || 0;
    const percentual = totalConcluidos > 0 ? `${((votos / totalConcluidos) * 100).toFixed(1)}%` : '0.0%';
    return { id: c.id, nome: c.nome, rotulo: c.rotulo, votos, percentual };
  }).sort((a, b) => b.votos - a.votos);

  const rankingVoto2 = candidatosParaExibir(mapVoto2).map((c) => {
    const votos = mapVoto2[c.id] || 0;
    const percentual = totalConcluidos > 0 ? `${((votos / totalConcluidos) * 100).toFixed(1)}%` : '0.0%';
    return { id: c.id, nome: c.nome, rotulo: c.rotulo, votos, percentual };
  }).sort((a, b) => b.votos - a.votos);

  const somaVotos: Record<number, number> = {};
  for (const [id, n] of [...Object.entries(mapVoto1), ...Object.entries(mapVoto2)]) {
    somaVotos[Number(id)] = (somaVotos[Number(id)] || 0) + n;
  }
  const totalVotosCombinados = totalConcluidos * 2;
  const rankingGeral = candidatosParaExibir(somaVotos).map((c) => {
    const votos1 = mapVoto1[c.id] || 0;
    const votos2 = mapVoto2[c.id] || 0;
    const totalVotos = votos1 + votos2;
    const percentual =
      totalVotosCombinados > 0 ? `${((totalVotos / totalVotosCombinados) * 100).toFixed(1)}%` : '0.0%';
    return { id: c.id, nome: c.nome, rotulo: c.rotulo, votos1, votos2, totalVotos, percentual };
  }).sort((a, b) => b.totalVotos - a.totalVotos);

  return { totalEleitores, totalConcluidos, taxaConclusao, porEtapa, rankingVoto1, rankingVoto2, rankingGeral };
}

// ---------------------------------------------------------------------------
// ESPERA DE 30s ENTRE A 1ª RESPOSTA E A MSG 2/3 (020)
// O eleitor costuma responder a saudação em pedaços ("oi" ... "tudo bem"). A 1ª
// mensagem marca a sessão e agenda a Msg 2/3 para 30s depois; as seguintes,
// enquanto a Msg 2/3 não saiu, são ignoradas. As duas marcações são UPDATEs
// condicionais (atômicos): com webhooks concorrentes, só um vence.
// ---------------------------------------------------------------------------
export const ESPERA_SAUDACAO_S = 30;

/** 1ª resposta à saudação: disparado -> aguardando_voto1. true = esta chamada venceu. */
export async function marcarSaudacaoRespondida(id: string, listaVersao: number): Promise<boolean> {
  const agora = new Date().toISOString();
  if (isPlaceholderEnv()) {
    const s = (global.__aiviq_pesquisa_senado || []).find((x) => x.id === id);
    if (!s || s.etapa !== 'disparado') return false;
    Object.assign(s, { etapa: 'aguardando_voto1', listaVersao, saudacaoRespondidaEm: agora, lastMessageAt: agora });
    return true;
  }
  const ctx = await getServiceContext();
  if (!ctx) return false;
  const { data, error } = await ctx.db
    .from(TABLE)
    .update({ etapa: 'aguardando_voto1', lista_versao: listaVersao, saudacao_respondida_em: agora })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id)
    .eq('etapa', 'disparado')
    .select('id');
  if (error) {
    console.error('[pesquisa] marcarSaudacaoRespondida:', error.message);
    return false;
  }
  return (data?.length || 0) > 0;
}

/** Reserva o envio da Msg 2/3 para ESTE processo. true = pode enviar. */
export async function reivindicarEnvioMsg3(id: string): Promise<boolean> {
  const agora = new Date().toISOString();
  if (isPlaceholderEnv()) {
    const s = (global.__aiviq_pesquisa_senado || []).find((x) => x.id === id);
    if (!s || s.msg3EnviadaEm) return false;
    s.msg3EnviadaEm = agora;
    return true;
  }
  const ctx = await getServiceContext();
  if (!ctx) return false;
  const { data, error } = await ctx.db
    .from(TABLE)
    .update({ msg3_enviada_em: agora })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id)
    .eq('etapa', 'aguardando_voto1')
    .is('msg3_enviada_em', null)
    .select('id');
  if (error) {
    console.error('[pesquisa] reivindicarEnvioMsg3:', error.message);
    return false;
  }
  return (data?.length || 0) > 0;
}

/** Desfaz a reserva quando o envio falhou (o tick tenta de novo depois). */
export async function liberarEnvioMsg3(id: string): Promise<void> {
  if (isPlaceholderEnv()) {
    const s = (global.__aiviq_pesquisa_senado || []).find((x) => x.id === id);
    if (s) s.msg3EnviadaEm = undefined;
    return;
  }
  const ctx = await getServiceContext();
  if (!ctx) return;
  await ctx.db
    .from(TABLE)
    .update({ msg3_enviada_em: null })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id);
}

/** Sessões cuja espera venceu há mais de `atrasoMin` e a Msg 2/3 não saiu (envio perdido). */
export async function listarMsg3Atrasadas(atrasoMin = 2, limite = 5): Promise<RespostaEleitor[]> {
  const corte = new Date(Date.now() - (ESPERA_SAUDACAO_S + atrasoMin * 60) * 1000).toISOString();
  if (isPlaceholderEnv()) {
    return (global.__aiviq_pesquisa_senado || [])
      .filter((s) => s.etapa === 'aguardando_voto1' && s.saudacaoRespondidaEm && !s.msg3EnviadaEm && s.saudacaoRespondidaEm < corte)
      .slice(0, limite);
  }
  const ctx = await getServiceContext();
  if (!ctx) return [];
  const { data } = await ctx.db
    .from(TABLE)
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('etapa', 'aguardando_voto1')
    .is('msg3_enviada_em', null)
    .not('saudacao_respondida_em', 'is', null)
    .lt('saudacao_respondida_em', corte)
    .limit(limite);
  return (data ?? []).map(rowToSession);
}
