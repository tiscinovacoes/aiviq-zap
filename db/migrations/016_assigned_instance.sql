-- =====================================================================
-- 016_assigned_instance.sql
-- Divisao previa da lista entre os chips.
--
-- Antes o chip era escolhido no INSTANTE do envio: se um caia no meio da
-- campanha, a distribuicao desequilibrava em silencio e nao dava para conferir
-- chip a chip. Agora cada contato ja entra na fila carimbado com o chip que vai
-- aborda-lo, decidido na importacao (round-robin sobre os chips do pool).
--
-- Quando um chip cai, sua sub-lista NAO fica presa: o claim redistribui para os
-- chips de pe (decisao do operador). A regra de prioridade esta na RPC abaixo.
--
-- Pre-requisitos: 011, 012, 015. Idempotente.
-- =====================================================================

ALTER TABLE dispatch_queue ADD COLUMN IF NOT EXISTS assigned_instance TEXT;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_assigned
    ON dispatch_queue (organization_id, assigned_instance, status, created_at);

-- Claim POR CHIP. Prioridade:
--   1. contatos carimbados para ESTE chip;
--   2. contatos sem carimbo, ou carimbados para um chip que NAO esta na lista
--      de chips vivos (p_live) -- ou seja, orfaos de um chip que caiu.
-- Continua usando FOR UPDATE SKIP LOCKED: dois ticks concorrentes nunca pegam
-- a mesma linha.
CREATE OR REPLACE FUNCTION public.claim_dispatch_items_for_instance(
    p_org      UUID,
    p_instance TEXT,
    p_limit    INTEGER,
    p_live     TEXT[] DEFAULT ARRAY[]::TEXT[]
) RETURNS SETOF dispatch_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE dispatch_queue q
       SET status            = 'processando',
           claimed_at        = now(),
           assigned_instance = p_instance
     WHERE q.id IN (
            SELECT d.id
              FROM dispatch_queue d
             WHERE d.organization_id = p_org
               AND d.status          = 'pendente'
               AND (
                     d.assigned_instance = p_instance
                  OR d.assigned_instance IS NULL
                  OR NOT (d.assigned_instance = ANY (p_live))
               )
             ORDER BY (d.assigned_instance = p_instance) DESC NULLS LAST,
                      d.created_at
             LIMIT p_limit
             FOR UPDATE SKIP LOCKED
           )
    RETURNING q.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_dispatch_items_for_instance(UUID, TEXT, INTEGER, TEXT[]) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- FIM 016_assigned_instance.sql
-- =====================================================================
