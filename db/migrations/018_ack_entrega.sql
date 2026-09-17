-- =====================================================================
-- 018_ack_entrega.sql
-- Confirmacao REAL de entrega (ack) como fonte de verdade.
--
-- O problema que isso resolve, observado em producao em 17/09: o chip
-- 67998454509 ficou 1h13 "disparando" com o painel mostrando sucesso e
-- nenhuma mensagem chegando. Ele estava `open`, a Evolution aceitava o
-- sendText e devolvia HTTP 200 -- mas o HTTP 200 so quer dizer "aceitei para
-- enfileirar". O veredito real vem depois, de forma assincrona, no evento
-- MESSAGES_UPDATE, e nos nao escutavamos esse evento.
--
-- Consequencias do furo:
--   - 11 contatos marcados como enviados sem nunca terem recebido nada, e
--     nunca mais tentados.
--   - O circuit breaker (017) ficou mudo o tempo todo: ele conta FALHAS DE
--     ENVIO, e aqui nao houve nenhuma -- todo envio "deu certo".
--
-- Pre-requisitos: 011, 012, 015, 016, 017. Idempotente.
-- =====================================================================

-- ----------------------------------------------------------------------
-- 1. Liga a linha da fila a mensagem enviada, para que o ack encontre o
--    contato de volta quando chegar.
-- ----------------------------------------------------------------------
ALTER TABLE dispatch_queue ADD COLUMN IF NOT EXISTS message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_message
    ON dispatch_queue (organization_id, message_id)
    WHERE message_id IS NOT NULL;

-- Guarda o ultimo veredito de entrega observado para o chip, para a tela.
ALTER TABLE dispatch_instance_control
    ADD COLUMN IF NOT EXISTS ultimo_ack         TEXT,
    ADD COLUMN IF NOT EXISTS ultimo_ack_em      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS acks_erro_seguidos INTEGER NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------
-- 2. Circuit breaker alimentado por ACK.
--
-- Separado de registrar_resultado_chip (017) de proposito: aquele conta o
-- lote (lote_atual) para a pausa longa, e o ack chega DEPOIS do envio -- se
-- os dois mexessem no mesmo contador, cada disparo contaria em dobro e a
-- pausa de lote cairia na metade do tempo.
-- ----------------------------------------------------------------------
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
       SET acks_erro_seguidos = CASE WHEN p_ok THEN 0 ELSE d.acks_erro_seguidos + 1 END,
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

-- =====================================================================
-- FIM 018_ack_entrega.sql
-- =====================================================================
