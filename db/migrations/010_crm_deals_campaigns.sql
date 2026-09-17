-- =====================================================================
-- 010_crm_deals_campaigns.sql
-- Cria as tabelas do CRM/Campanhas que NUNCA foram aplicadas em produção
-- (o projeto pulou da 002 para a Ouvidoria/004). Sem elas, /crm (deals) e
-- /campaigns quebram ou caem no mock.
--   - `deals`     → pipeline CRM (da 003_crm_campaigns.sql).
--   - `campaigns` → disparo em massa (da 005_campaigns.sql, versão canônica).
--
-- Pré-requisitos: 001, 002 (organizations, contacts, profiles, schema private,
--   private.current_organization_id(), private.is_organization_admin(),
--   touch_updated_at()). Idempotente / re-executável.
-- =====================================================================

-- ---------------------- deals (pipeline CRM) --------------------------
CREATE TABLE IF NOT EXISTS deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    value NUMERIC(14,2) NOT NULL DEFAULT 0,
    stage TEXT NOT NULL DEFAULT 'contato_inicial',
    probability INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    expected_close_date DATE,
    assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assignee_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deals_org ON deals (organization_id);
CREATE INDEX IF NOT EXISTS idx_deals_org_stage ON deals (organization_id, stage);
CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals (contact_id) WHERE contact_id IS NOT NULL;

-- ---------------------- campaigns (disparo em massa) ------------------
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'WhatsApp Cloud Oficial',
    status TEXT NOT NULL DEFAULT 'draft',
    message_text TEXT NOT NULL DEFAULT '',
    attachment_url TEXT,
    total_contacts INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    read_count INTEGER NOT NULL DEFAULT 0,
    replied_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMPTZ,
    tags TEXT[] NOT NULL DEFAULT '{}',
    bot_to_trigger_on_reply TEXT,
    avoid_duplicates BOOLEAN NOT NULL DEFAULT true,
    ddi_plus_55 BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaigns_status_chk') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_chk CHECK (status IN ('draft','scheduled','running','completed','paused'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns (organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON campaigns (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns (organization_id, created_at DESC);

-- ---------------------- RLS multi-tenant ------------------------------
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON deals FROM anon;
REVOKE ALL ON campaigns FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON deals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO authenticated;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN ('deals','campaigns') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY deals_select ON deals FOR SELECT TO authenticated USING (organization_id=(SELECT private.current_organization_id()));
CREATE POLICY deals_insert ON deals FOR INSERT TO authenticated WITH CHECK (organization_id=(SELECT private.current_organization_id()));
CREATE POLICY deals_update ON deals FOR UPDATE TO authenticated USING (organization_id=(SELECT private.current_organization_id())) WITH CHECK (organization_id=(SELECT private.current_organization_id()));
CREATE POLICY deals_delete ON deals FOR DELETE TO authenticated USING (organization_id=(SELECT private.current_organization_id()) AND (SELECT private.is_organization_admin()));

CREATE POLICY campaigns_select ON campaigns FOR SELECT TO authenticated USING (organization_id=(SELECT private.current_organization_id()));
CREATE POLICY campaigns_insert ON campaigns FOR INSERT TO authenticated WITH CHECK (organization_id=(SELECT private.current_organization_id()));
CREATE POLICY campaigns_update ON campaigns FOR UPDATE TO authenticated USING (organization_id=(SELECT private.current_organization_id())) WITH CHECK (organization_id=(SELECT private.current_organization_id()));
CREATE POLICY campaigns_delete ON campaigns FOR DELETE TO authenticated USING (organization_id=(SELECT private.current_organization_id()) AND (SELECT private.is_organization_admin()));

DROP TRIGGER IF EXISTS deals_touch ON deals;
CREATE TRIGGER deals_touch BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS campaigns_touch ON campaigns;
CREATE TRIGGER campaigns_touch BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =====================================================================
-- FIM 010_crm_deals_campaigns.sql
-- =====================================================================
