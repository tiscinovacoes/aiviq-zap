-- =====================================================================
-- 017_warmup_saude_optout.sql
-- Tres frentes de protecao de chip:
--   1. WARM-UP por chip (teto que cresce com a idade do numero).
--   2. SAUDE do chip: pausa por lote e circuit breaker por falhas seguidas.
--   3. OPT-OUT que aborta a fila (quem pediu SAIR nao pode ser reabordado).
--
-- Pre-requisitos: 011, 012, 015, 016. Idempotente.
-- =====================================================================

-- ----------------------------------------------------------------------
-- 1. WARM-UP
-- `maturidade` e declarada pelo OPERADOR, nao inferida. O first_dispatch_at
-- de dispatch_counters so sabe quando o numero comecou a disparar por AQUI --
-- um numero em uso ha anos apareceria como "dia zero" e seria estrangulado
-- sem ganho nenhum de seguranca. Por isso: default 'novo' (o lado seguro), e
-- o operador marca como 'maduro' o que ja esta aquecido.
-- ----------------------------------------------------------------------
ALTER TABLE dispatch_instance_control
    ADD COLUMN IF NOT EXISTS maturidade        TEXT NOT NULL DEFAULT 'novo',
    ADD COLUMN IF NOT EXISTS warmup_started_on DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dispatch_instance_control_maturidade_chk'
  ) THEN
    ALTER TABLE dispatch_instance_control
      ADD CONSTRAINT dispatch_instance_control_maturidade_chk
      CHECK (maturidade IN ('novo', 'maduro'));
  END IF;
END $$;

-- ----------------------------------------------------------------------
-- 2. SAUDE DO CHIP
-- `lote_atual`      -> disparos desde a ultima pausa longa (pausa por lote).
-- `falhas_seguidas` -> falhas consecutivas; N seguidas e sinal precoce de
--                      shadowban, antes mesmo de a conexao cair.
-- `cooldown_ate`    -> chip fora do pool ate esse horario (resfriamento).
-- ----------------------------------------------------------------------
ALTER TABLE dispatch_instance_control
    ADD COLUMN IF NOT EXISTS lote_atual      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS falhas_seguidas INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cooldown_ate    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cooldown_motivo TEXT;

-- O claim do ritmo passa a respeitar o cooldown: um chip em resfriamento nao
-- ganha o slot nem que o intervalo ja tenha vencido.
CREATE OR REPLACE FUNCTION public.claim_instance_slot(
    p_org          UUID,
    p_instance     TEXT,
    p_gap_seconds  INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ok BOOLEAN;
BEGIN
    INSERT INTO dispatch_instance_control (organization_id, instance_name, next_allowed_at, updated_at)
    VALUES (p_org, p_instance, now() + make_interval(secs => p_gap_seconds), now())
    ON CONFLICT (organization_id, instance_name) DO UPDATE
        SET next_allowed_at = now() + make_interval(secs => p_gap_seconds),
            updated_at      = now()
        WHERE (dispatch_instance_control.next_allowed_at IS NULL
               OR dispatch_instance_control.next_allowed_at <= now())
          AND (dispatch_instance_control.cooldown_ate IS NULL
               OR dispatch_instance_control.cooldown_ate <= now())
    RETURNING TRUE INTO v_ok;

    RETURN COALESCE(v_ok, FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_instance_slot(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- Registra sucesso/falha do chip: zera ou incrementa as falhas seguidas,
-- conta o lote e aplica o resfriamento num unico passo atomico.
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
       SET falhas_seguidas = CASE WHEN p_sucesso THEN 0 ELSE d.falhas_seguidas + 1 END,
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

-- ----------------------------------------------------------------------
-- 3. OPT-OUT ABORTA A FILA
-- Antes o webhook marcava a sessao como 'recusado' e respondia educadamente,
-- mas a linha continuava PENDENTE na fila: se o numero estivesse em outra
-- lista, seria reabordado depois de ter pedido para sair. Alem do problema
-- legal (LGPD), e o caminho mais curto para uma denuncia -- que derruba chip.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opt_out (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    phone           TEXT NOT NULL,
    motivo          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, phone)
);

ALTER TABLE opt_out ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='opt_out' AND policyname='opt_out_same_org') THEN
    CREATE POLICY opt_out_same_org ON opt_out FOR ALL
      USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND is_active = TRUE))
      WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND is_active = TRUE));
  END IF;
END $$;

-- =====================================================================
-- FIM 017_warmup_saude_optout.sql
-- =====================================================================
