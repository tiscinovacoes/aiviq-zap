-- =====================================================================
-- 006_multi_instance.sql
-- Suporte a MÚLTIPLAS instâncias / números de WhatsApp por organização.
--
-- Modelo: mesmo servidor Evolution (EVOLUTION_API_URL/KEY), várias instâncias
-- nomeadas. Cada instância = 1 número = 1 linha em `inboxes`. Esta migration
-- adiciona a coluna que identifica a instância Evolution e um índice único por
-- número dentro da organização, permitindo N caixas WhatsApp por org.
--
-- Pré-requisitos: 001_initial_schema.sql (tabela `inboxes`).
-- Re-executável (idempotente).
-- =====================================================================

-- ----------------------------------------------------------------------
-- 1. COLUNAS NOVAS EM inboxes
-- ----------------------------------------------------------------------
ALTER TABLE inboxes
    ADD COLUMN IF NOT EXISTS evolution_instance_name TEXT;

ALTER TABLE inboxes
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution_baileys';

-- Rótulo amigável opcional para exibição (ex.: "Ouvidoria", "Protocolo").
ALTER TABLE inboxes
    ADD COLUMN IF NOT EXISTS display_label TEXT;

-- ----------------------------------------------------------------------
-- 2. ÍNDICES
--    Unicidade do nome de instância dentro da organização (permite N números
--    por org, mas sem duplicar a mesma instância). Índice parcial: só se aplica
--    a linhas que tenham evolution_instance_name preenchido.
-- ----------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_inboxes_org_instance
    ON inboxes (organization_id, evolution_instance_name)
    WHERE evolution_instance_name IS NOT NULL;

-- Lookup rápido no webhook (resolver inbox pela instância de origem).
CREATE INDEX IF NOT EXISTS idx_inboxes_instance
    ON inboxes (evolution_instance_name)
    WHERE evolution_instance_name IS NOT NULL;

-- ----------------------------------------------------------------------
-- 3. BACKFILL (best-effort)
--    Caixas WhatsApp já existentes sem instância recebem um nome padrão para
--    manter retrocompatibilidade com a instância única anterior.
-- ----------------------------------------------------------------------
UPDATE inboxes
    SET evolution_instance_name = 'aiviq_inbox_01'
    WHERE channel_type = 'whatsapp_cloud'
      AND (evolution_instance_name IS NULL OR evolution_instance_name = '');

-- =====================================================================
-- FIM 006_multi_instance.sql
-- =====================================================================
