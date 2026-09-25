// ==============================================================================
// Fechamento diário da campanha (Pesquisa Senado MS)
//
// Todo dia às 21h (fuso Campo Grande -- fim da janela útil de disparo, ver
// ANTIBAN.janelaUtilMin), o dia de disparo se encerra e vira um registro
// fechado na aba de Campanhas: métricas do dia, fila zerada, chips prontos
// para o dia seguinte. Sem isso, tudo era uma bola só sem corte por dia,
// impossível de metrificar "quanto rendeu hoje" separado de ontem.
// ==============================================================================
import { getServiceContext, isPlaceholderEnv } from '@/lib/supabase/authContext';
import { listarLotesAtivos, cancelarLote } from '@/lib/dispatchQueue';

export interface FechamentoDiaResult {
  ok: boolean;
  /** true = não havia campanha atuando hoje (nada enviado, ninguém respondeu,
   *  nenhuma fila pendente) -- não criou registro nenhum, não mexeu em nada. */
  skipped: boolean;
  campaignId: string | null;
  data: string;
  stats: {
    totalContacts: number;
    sentCount: number;
    repliedCount: number;
    failedCount: number;
  };
  lotesCancelados: number;
  contatosCancelados: number;
  instanciasResetadas: number;
}

function hojeCampoGrande(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Campo_Grande' });
}

/**
 * Fecha o dia de disparo: cria o registro da campanha de HOJE em `campaigns`
 * com as métricas reais, cancela o que sobrou pendente nas filas (não
 * carrega para amanhã) e reseta os marcadores de saúde dos chips (falhas
 * seguidas, cooldown) para todos começarem o dia seguinte limpos.
 */
export async function fecharCampanhaDoDia(nome?: string): Promise<FechamentoDiaResult> {
  const hoje = hojeCampoGrande();
  const inicioDia = `${hoje}T00:00:00-04:00`;

  const vazio = (skipped: boolean): FechamentoDiaResult => ({
    // skipped=true (nada pra fechar hoje) e um resultado valido, nao erro.
    // skipped=false so acontece aqui por falta de contexto de banco (dev/placeholder).
    ok: skipped,
    skipped,
    campaignId: null,
    data: hoje,
    stats: { totalContacts: 0, sentCount: 0, repliedCount: 0, failedCount: 0 },
    lotesCancelados: 0,
    contatosCancelados: 0,
    instanciasResetadas: 0,
  });

  if (isPlaceholderEnv()) return vazio(false);
  const ctx = await getServiceContext();
  if (!ctx) return vazio(false);

  // -------- 1. Métricas reais do dia --------
  const { count: sentCount } = await ctx.db
    .from('dispatch_queue')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'enviado')
    .gte('sent_at', inicioDia);

  // Lotes criados hoje -- os erros so contam quando pertencem a um lote de
  // hoje (dispatch_queue.error nao tem timestamp proprio confiavel).
  const { data: lotesHoje } = await ctx.db
    .from('dispatch_lotes')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .gte('created_at', inicioDia);
  const idsLotesHoje = (lotesHoje || []).map((l: any) => l.id);

  let failedCount = 0;
  if (idsLotesHoje.length > 0) {
    const { count } = await ctx.db
      .from('dispatch_queue')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'erro')
      .in('lote_id', idsLotesHoje);
    failedCount = count || 0;
  }

  const { count: repliedCount } = await ctx.db
    .from('pesquisa_senado')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
    .gte('saudacao_respondida_em', inicioDia);

  const lotesAtivos = await listarLotesAtivos();

  // Só fecha campanha se ela estava de fato atuando: algo foi enviado, algo
  // falhou, alguem respondeu, ou ainda tem fila pendente pra cancelar. Dia
  // parado (ex: fim de semana, nenhum disparo) não gera registro nenhum --
  // nem campanha vazia na aba, nem reset de chip à toa.
  const atuou = (sentCount || 0) > 0 || failedCount > 0 || (repliedCount || 0) > 0 || lotesAtivos.length > 0;
  if (!atuou) return vazio(true);

  // -------- 2. Cancela o que sobrou pendente (não carrega para amanhã) --------
  let contatosCancelados = 0;
  for (const lote of lotesAtivos) {
    contatosCancelados += await cancelarLote(lote.id);
  }

  // -------- 3. Reseta os marcadores de saúde de TODOS os chips cadastrados --------
  const { data: instanciasResetadas } = await ctx.db
    .from('dispatch_instance_control')
    .update({
      falhas_seguidas: 0,
      acks_erro_seguidos: 0,
      cooldown_ate: null,
      cooldown_motivo: null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', ctx.organizationId)
    .select('instance_name');

  // -------- 4. Fecha a campanha do dia na aba Campanhas --------
  const totalContacts = (sentCount || 0) + failedCount + contatosCancelados;
  const nomeCampanha =
    nome || `Pesquisa Senado MS — ${new Date(`${hoje}T12:00:00-04:00`).toLocaleDateString('pt-BR')}`;

  const { data: campanha, error } = await ctx.db
    .from('campaigns')
    .insert({
      organization_id: ctx.organizationId,
      name: nomeCampanha,
      channel: 'WhatsApp (Evolution API)',
      status: 'completed',
      message_text: 'Pesquisa Eleitoral — Senado Federal / MS',
      total_contacts: totalContacts,
      sent_count: sentCount || 0,
      delivered_count: sentCount || 0,
      read_count: 0,
      replied_count: repliedCount || 0,
      failed_count: failedCount,
      tags: ['Pesquisa Senado'],
      avoid_duplicates: true,
      ddi_plus_55: true,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[fecharCampanhaDoDia] erro ao criar campanha:', error.message);
  }

  return {
    ok: !error,
    skipped: false,
    campaignId: campanha?.id || null,
    data: hoje,
    stats: {
      totalContacts,
      sentCount: sentCount || 0,
      repliedCount: repliedCount || 0,
      failedCount,
    },
    lotesCancelados: lotesAtivos.length,
    contatosCancelados,
    instanciasResetadas: instanciasResetadas?.length || 0,
  };
}
