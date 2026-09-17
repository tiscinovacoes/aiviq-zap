-- =====================================================================
-- 014_claim_instance_slot.sql
-- Reserva ATOMICA do ritmo (intervalo anti-ban) de um chip.
--
-- O teto diario (012) e o contato da fila (012) ja eram atomicos; o INTERVALO
-- nao era. O tick lia next_allowed_at, decidia quem estava liberado, e so
-- gravava o novo horario no fim. Dois ticks concorrentes -- e eles SAO varios:
-- o cron da Vercel, o runner global de CADA aba aberta e o worker de servidor
-- -- liam o mesmo valor ja vencido, os dois passavam no teste, e o MESMO chip
-- disparava duas mensagens no mesmo instante. Rajada num unico numero e
-- exatamente o padrao que queima o chip.
--
-- Agora o intervalo e disputado num unico UPDATE condicional: so quem consegue
-- avancar next_allowed_at ganha o direito de enviar por aquele chip naquele
-- ciclo. Os perdedores saem sem enviar.
--
-- Pre-requisito: 012 (dispatch_instance_control). Idempotente.
-- =====================================================================

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
        WHERE dispatch_instance_control.next_allowed_at IS NULL
           OR dispatch_instance_control.next_allowed_at <= now()
    RETURNING TRUE INTO v_ok;

    RETURN COALESCE(v_ok, FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_instance_slot(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- FIM 014_claim_instance_slot.sql
-- =====================================================================
