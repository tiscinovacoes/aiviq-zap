-- =====================================================================
-- 012_dispatch_multi_instance.sql
-- Disparo de UMA campanha por VÁRIAS instâncias (cluster de chips), com
-- teto rígido de 480 mensagens por chip por dia.
--
-- O que muda em relação à 011:
--   1. Reserva ATÔMICA de slot no teto diário (reserve_dispatch_slot).
--      Antes era ler+gravar em duas etapas: dois ticks concorrentes liam o
--      mesmo sent_count e ambos enviavam → o teto vazava.
--   2. Claim ATÔMICO do contato (claim_dispatch_items, FOR UPDATE SKIP LOCKED).
--      Antes um SELECT sem lock: dois ticks concorrentes pegavam o MESMO
--      contato e o eleitor recebia a abordagem duas vezes.
--   3. Ritmo por instância (dispatch_instance_control), não mais um relógio
--      global. Um chip no teto não trava os outros.
--   4. campaign_id na fila, para atribuir os contatos à campanha de origem.
--
-- Pré-requisitos: 001, 002, 009 (dispatch_counters), 011 (dispatch_queue).
-- Idempotente. Escrita real é via service-role (server-to-server).
-- =====================================================================

-- ----------------------------------------------------------------------
-- 1. Fila: estado 'processando' (contato reservado por um tick) + origem.
-- ----------------------------------------------------------------------
ALTER TABLE dispatch_queue ADD COLUMN IF NOT EXISTS claimed_at  TIMESTAMPTZ;
ALTER TABLE dispatch_queue ADD COLUMN IF NOT EXISTS campaign_id UUID;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_claimed
    ON dispatch_queue (organization_id, status, claimed_at);
CREATE INDEX IF NOT EXISTS idx_dispatch_queue_campaign
    ON dispatch_queue (organization_id, campaign_id);

-- ----------------------------------------------------------------------
-- 2. Ritmo por instância: cada chip tem seu próprio próximo horário de envio.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispatch_instance_control (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    instance_name   TEXT NOT NULL,
    next_allowed_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, instance_name)
);

ALTER TABLE dispatch_instance_control ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'dispatch_instance_control'
       AND policyname = 'dispatch_instance_control_same_org'
  ) THEN
    CREATE POLICY dispatch_instance_control_same_org ON dispatch_instance_control FOR ALL
      USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND is_active = TRUE))
      WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND is_active = TRUE));
  END IF;
END $$;

-- ----------------------------------------------------------------------
-- 3. Reserva atômica de slot no teto diário do chip.
--    Retorna o novo sent_count, ou NULL quando o chip já bateu o teto.
--    O INSERT ... ON CONFLICT DO UPDATE trava a linha: dois ticks simultâneos
--    são serializados pelo Postgres e o segundo enxerga o incremento do primeiro.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_dispatch_slot(
    p_org      UUID,
    p_instance TEXT,
    p_day      DATE,
    p_cap      INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sent INTEGER;
BEGIN
    INSERT INTO dispatch_counters (organization_id, instance_name, day, sent_count, last_sent_at)
    VALUES (p_org, p_instance, p_day, 1, now())
    ON CONFLICT (organization_id, instance_name, day) DO UPDATE
        SET sent_count   = dispatch_counters.sent_count + 1,
            last_sent_at = now()
        WHERE dispatch_counters.sent_count < p_cap
    RETURNING sent_count INTO v_sent;

    RETURN v_sent; -- NULL = teto atingido, nenhuma linha tocada
END;
$$;

-- Devolve o slot quando o envio falhou (a mensagem não saiu do chip).
CREATE OR REPLACE FUNCTION public.release_dispatch_slot(
    p_org      UUID,
    p_instance TEXT,
    p_day      DATE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE dispatch_counters
       SET sent_count = GREATEST(0, sent_count - 1)
     WHERE organization_id = p_org
       AND instance_name   = p_instance
       AND day             = p_day;
END;
$$;

-- ----------------------------------------------------------------------
-- 4. Claim atômico de contatos da fila.
--    SKIP LOCKED: ticks concorrentes (cron + abas abertas + worker) pegam
--    contatos DIFERENTES em vez de disputarem o mesmo.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_dispatch_items(
    p_org   UUID,
    p_limit INTEGER
) RETURNS SETOF dispatch_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE dispatch_queue q
       SET status     = 'processando',
           claimed_at = now()
     WHERE q.id IN (
            SELECT d.id
              FROM dispatch_queue d
             WHERE d.organization_id = p_org
               AND d.status          = 'pendente'
             ORDER BY d.created_at
             LIMIT p_limit
             FOR UPDATE SKIP LOCKED
           )
    RETURNING q.*;
END;
$$;

-- Devolve à fila os contatos presos em 'processando' (worker serverless que
-- morreu no meio). Chamado no início de cada tick.
CREATE OR REPLACE FUNCTION public.reap_stale_dispatch_claims(
    p_org         UUID,
    p_older_than  INTERVAL DEFAULT '5 minutes'
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE dispatch_queue
       SET status = 'pendente', claimed_at = NULL
     WHERE organization_id = p_org
       AND status          = 'processando'
       AND claimed_at < now() - p_older_than;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------
-- 5. Só o service-role chama estas funções (alerta 0028/0029 do advisor).
-- ----------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.reserve_dispatch_slot(UUID, TEXT, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_dispatch_slot(UUID, TEXT, DATE)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_dispatch_items(UUID, INTEGER)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reap_stale_dispatch_claims(UUID, INTERVAL)       FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- FIM 012_dispatch_multi_instance.sql
-- =====================================================================
