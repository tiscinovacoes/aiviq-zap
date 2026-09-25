-- =====================================================================
-- 022_resfriamento_reseta_contador.sql
-- BUG: falhas_seguidas/acks_erro_seguidos so zeravam em SUCESSO -- nunca
-- quando o proprio resfriamento era acionado. Resultado observado em
-- producao (25/09/2026, chip Magrela e outros): o chip saia do cooldown,
-- a 1a tentativa seguinte falhava (so 1 falha nova) e o contador -- que
-- continuava contando a partir do valor antigo, ja acima do limiar --
-- reacionava o resfriamento na hora. Do ponto de vista do operador
-- parecia "voltou do resfriamento e resfriou de novo sem nenhuma falha",
-- porque so 1 falha aparecia mas o contador ja estava perto do limite de
-- uma rodada anterior havia horas.
--
-- Fix: ao ACIONAR o cooldown (falhas_seguidas ou acks_erro_seguidos batendo
-- o limiar), zera o contador correspondente no mesmo UPDATE. A proxima
-- falha, depois que o chip volta a disparar, passa a contar a partir do
-- zero de novo -- exige o limiar inteiro (2 falhas seguidas de verdade)
-- antes de resfriar outra vez, em vez de qualquer falha isolada empilhada
-- em cima de um resto antigo.
--
-- Pre-requisitos: 017, 018. Idempotente (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.registrar_resultado_chip(
    p_org             UUID,
    p_instance        TEXT,
    p_sucesso         BOOLEAN,
    p_max_falhas      INTEGER,
    p_cooldown_min    INTEGER,
    p_lote_tamanho    INTEGER,
    p_pausa_lote_min  INTEGER
) RETURNS TABLE (falhas_seguidas INTEGER, cooldown_ate TIMESTAMPTZ, cooldown_motivo TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE dispatch_instance_control d
       SET falhas_seguidas = CASE
             WHEN p_sucesso THEN 0
             -- Acionou o cooldown agora: zera aqui mesmo, senao o contador
             -- fica "pre-carregado" e uma unica falha isolada, bem depois,
             -- reaciona o resfriamento sem representar um padrao novo.
             WHEN d.falhas_seguidas + 1 >= p_max_falhas THEN 0
             ELSE d.falhas_seguidas + 1
           END,
           -- Uma unica atribuicao de lote_atual: zera quando a pausa de lote
           -- entra, incrementa no sucesso normal, mantem na falha.
           lote_atual = CASE
             WHEN p_sucesso AND d.lote_atual + 1 >= p_lote_tamanho THEN 0
             WHEN p_sucesso THEN d.lote_atual + 1
             ELSE d.lote_atual
           END,
           cooldown_ate = CASE
             -- Falhas seguidas demais: sinal precoce de shadowban.
             WHEN NOT p_sucesso AND d.falhas_seguidas + 1 >= p_max_falhas
               THEN now() + make_interval(mins => p_cooldown_min)
             -- Lote cheio: pausa longa para quebrar a cadencia mecanica.
             WHEN p_sucesso AND d.lote_atual + 1 >= p_lote_tamanho
               THEN now() + make_interval(mins => p_pausa_lote_min)
             ELSE d.cooldown_ate
           END,
           cooldown_motivo = CASE
             WHEN NOT p_sucesso AND d.falhas_seguidas + 1 >= p_max_falhas THEN 'falhas_seguidas'
             WHEN p_sucesso AND d.lote_atual + 1 >= p_lote_tamanho       THEN 'pausa_de_lote'
             ELSE d.cooldown_motivo
           END,
           updated_at = now()
     WHERE d.organization_id = p_org
       AND d.instance_name   = p_instance
    RETURNING d.falhas_seguidas, d.cooldown_ate, d.cooldown_motivo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_resultado_chip(UUID, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

-- Mesmo fix, mesmo motivo, para o circuit breaker alimentado por ACK de
-- entrega (018): acks_erro_seguidos tambem so zerava em ack OK.
CREATE OR REPLACE FUNCTION public.registrar_ack_chip(
    p_org          UUID,
    p_instance     TEXT,
    p_ok           BOOLEAN,
    p_ack          TEXT,
    p_max_erros    INTEGER,
    p_cooldown_min INTEGER
) RETURNS TABLE (acks_erro_seguidos INTEGER, cooldown_ate TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE dispatch_instance_control d
       SET acks_erro_seguidos = CASE
             WHEN p_ok THEN 0
             WHEN d.acks_erro_seguidos + 1 >= p_max_erros THEN 0
             ELSE d.acks_erro_seguidos + 1
           END,
           ultimo_ack         = p_ack,
           ultimo_ack_em      = now(),
           cooldown_ate = CASE
             WHEN NOT p_ok AND d.acks_erro_seguidos + 1 >= p_max_erros
               THEN now() + make_interval(mins => p_cooldown_min)
             ELSE d.cooldown_ate
           END,
           cooldown_motivo = CASE
             WHEN NOT p_ok AND d.acks_erro_seguidos + 1 >= p_max_erros
               THEN 'entrega_recusada'
             ELSE d.cooldown_motivo
           END,
           -- Chip que nao entrega sai do pool: seguir disparando com ele so
           -- queima contatos, porque cada um e marcado como enviado e nunca
           -- mais tentado.
           dispatch_enabled = CASE
             WHEN NOT p_ok AND d.acks_erro_seguidos + 1 >= p_max_erros THEN FALSE
             ELSE d.dispatch_enabled
           END,
           updated_at = now()
     WHERE d.organization_id = p_org
       AND d.instance_name   = p_instance
    RETURNING d.acks_erro_seguidos, d.cooldown_ate;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_ack_chip(UUID, TEXT, BOOLEAN, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

-- Remediacao unica: zera quem ja esta preso nesse contador inflado agora
-- (nao mexe em cooldown_ate/motivo -- quem estiver resfriando ainda
-- termina o cooldown atual normalmente, so nao reaciona na 1a falha
-- seguinte).
UPDATE dispatch_instance_control
   SET falhas_seguidas = 0
 WHERE falhas_seguidas > 0;

-- =====================================================================
-- FIM 022_resfriamento_reseta_contador.sql
-- =====================================================================
