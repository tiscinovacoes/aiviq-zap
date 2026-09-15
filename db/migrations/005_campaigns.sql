-- =====================================================================
-- 005_campaigns.sql
-- Criação da tabela `campaigns` (disparos e comunicados em massa da Ouvidoria)
-- no Supabase com isolamento multi-tenant RLS rigoroso via `private.*`,
-- índices otimizados e suporte a todos os campos consumidos pelo app.
--
-- Nota de contexto: A migration 003 original (`003_crm_campaigns.sql`)
-- continha `deals` e `campaigns`, mas nunca foi aplicada no banco de produção
-- porque o projeto migrou direto para Ouvidoria (`004_ouvidoria_protocolos.sql`),
-- deixando a tabela `campaigns` pendente. Esta migration 005 supre essa lacuna
-- de forma isolada, limpa e segura.
--
-- Pré-requisitos: 001_initial_schema.sql e 002_multi_org_membership.sql
-- (definem `organizations`, `profiles`, o schema `private`,
--  `private.current_organization_id()`, `private.is_organization_admin()`
--  e a função `touch_updated_at()` com search_path travado).
-- Re-executável (idempotente).
-- =====================================================================

-- ----------------------------------------------------------------------
-- 1. TABELA: campaigns
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    channel                 TEXT NOT NULL DEFAULT 'WhatsApp Cloud Oficial',
    status                  TEXT NOT NULL DEFAULT 'draft',
    message_text            TEXT NOT NULL DEFAULT '',
    attachment_url          TEXT,
    total_contacts          INTEGER NOT NULL DEFAULT 0,
    sent_count              INTEGER NOT NULL DEFAULT 0,
    delivered_count         INTEGER NOT NULL DEFAULT 0,
    read_count              INTEGER NOT NULL DEFAULT 0,
    replied_count           INTEGER NOT NULL DEFAULT 0,
    failed_count            INTEGER NOT NULL DEFAULT 0,
    scheduled_at            TIMESTAMPTZ,
    tags                    TEXT[] NOT NULL DEFAULT '{}',
    bot_to_trigger_on_reply TEXT,
    avoid_duplicates        BOOLEAN NOT NULL DEFAULT true,
    ddi_plus_55             BOOLEAN NOT NULL DEFAULT true,
    created_by              UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------
-- 2. CHECK CONSTRAINTS
-- ----------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_status_chk') THEN
        ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_chk
            CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'paused'));
    END IF;
END $$;

-- ----------------------------------------------------------------------
-- 3. ÍNDICES
-- ----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campaigns_org        ON campaigns (organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON campaigns (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns (organization_id, created_at DESC);

-- ----------------------------------------------------------------------
-- 4. RLS (Row Level Security)
-- ----------------------------------------------------------------------
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON campaigns FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO authenticated;

-- Re-executável: remove as policies antes de recriar
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'campaigns'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON campaigns', r.policyname);
    END LOOP;
END $$;

CREATE POLICY campaigns_select ON campaigns
    FOR SELECT TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY campaigns_insert ON campaigns
    FOR INSERT TO authenticated
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY campaigns_update ON campaigns
    FOR UPDATE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) )
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY campaigns_delete ON campaigns
    FOR DELETE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id())
            AND (SELECT private.is_organization_admin()) );

-- ----------------------------------------------------------------------
-- 5. TRIGGER updated_at (reusa touch_updated_at() da 002)
-- ----------------------------------------------------------------------
DROP TRIGGER IF EXISTS campaigns_touch ON campaigns;
CREATE TRIGGER campaigns_touch
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
