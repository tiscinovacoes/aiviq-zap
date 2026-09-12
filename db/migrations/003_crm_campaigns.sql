-- =====================================================================
-- 003_crm_campaigns.sql
-- CR-004 §T2 — cria as tabelas que os Sprints 3-5 já consomem (`deals`,
-- `campaigns`) e que estavam ausentes do schema, com RLS multi-tenant no
-- mesmo padrão da 002 (isolamento por organização via `private.*`,
-- policies com (SELECT ...) para InitPlan, escrita separada por comando).
--
-- Pré-requisitos: 001_initial_schema.sql e 002_multi_org_membership.sql
-- (definem `organizations`, `contacts`, `profiles`, o schema `private`,
--  `private.current_organization_id()`, `private.is_organization_admin()`
--  e a função `touch_updated_at()` com search_path travado).
-- Re-executável.
-- =====================================================================

-- ----------------------------------------------------------------------
-- 1. TABELA: deals (pipeline CRM)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
    title               TEXT NOT NULL,
    value               NUMERIC(14,2) NOT NULL DEFAULT 0,
    stage               TEXT NOT NULL DEFAULT 'contato_inicial',
    probability         INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    expected_close_date DATE,
    assignee_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assignee_name       TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deals_org           ON deals (organization_id);
CREATE INDEX IF NOT EXISTS idx_deals_org_stage     ON deals (organization_id, stage);
CREATE INDEX IF NOT EXISTS idx_deals_contact       ON deals (contact_id) WHERE contact_id IS NOT NULL;

-- ----------------------------------------------------------------------
-- 2. TABELA: campaigns (disparo em massa)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    channel          TEXT NOT NULL DEFAULT 'whatsapp_cloud',
    status           TEXT NOT NULL DEFAULT 'draft',  -- draft | scheduled | running | paused | done
    message_text     TEXT NOT NULL DEFAULT '',
    scheduled_at     TIMESTAMPTZ,
    sent_count       INTEGER NOT NULL DEFAULT 0,
    delivered_count  INTEGER NOT NULL DEFAULT 0,
    replied_count    INTEGER NOT NULL DEFAULT 0,
    created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_org        ON campaigns (organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON campaigns (organization_id, status);

-- ----------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------
ALTER TABLE deals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON deals     FROM anon;
REVOKE ALL ON campaigns FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON deals     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO authenticated;

-- Re-executável: remove as policies destas tabelas antes de recriar.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('deals', 'campaigns')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- deals -----------------------------------------------------------------
CREATE POLICY deals_select ON deals
    FOR SELECT TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY deals_insert ON deals
    FOR INSERT TO authenticated
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY deals_update ON deals
    FOR UPDATE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) )
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY deals_delete ON deals
    FOR DELETE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id())
            AND (SELECT private.is_organization_admin()) );

-- campaigns -------------------------------------------------------------
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
-- 4. updated_at automático (reusa touch_updated_at() da 002)
-- ----------------------------------------------------------------------
DROP TRIGGER IF EXISTS deals_touch ON deals;
CREATE TRIGGER deals_touch
    BEFORE UPDATE ON deals
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS campaigns_touch ON campaigns;
CREATE TRIGGER campaigns_touch
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ----------------------------------------------------------------------
-- NOTA (para a app): o GET de campanhas lê `c.sentCount/deliveredCount/
-- repliedCount` (camelCase) mas as colunas são snake_case (sent_count...).
-- Ajustar o mapeamento no código ao consumir estas tabelas.
-- ----------------------------------------------------------------------
