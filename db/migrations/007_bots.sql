-- =====================================================================
-- 007_bots.sql
-- Persistência dos fluxos de chatbot (ADR-004 §2.5: draft vs published).
-- Um bot guarda o documento-rascunho (BotV1 em JSONB) e, à parte, o
-- documento publicado (imutável até novo publish) — editar o rascunho não
-- afeta quem está conversando com a versão publicada.
--
-- Pré-requisitos: 001..003 (organizations, schema `private`,
--   private.current_organization_id(), private.is_organization_admin(),
--   touch_updated_at()).
-- Re-executável (idempotente).
-- =====================================================================

CREATE TABLE IF NOT EXISTS bots (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name               TEXT NOT NULL DEFAULT 'Novo Fluxo de Automação',
    status             TEXT NOT NULL DEFAULT 'draft',
    document           JSONB NOT NULL DEFAULT '{}'::jsonb,   -- rascunho (BotV1)
    published_document JSONB,                                -- versão publicada (imutável até novo publish)
    published_version  INT  NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bots_status_chk') THEN
        ALTER TABLE bots ADD CONSTRAINT bots_status_chk
            CHECK (status IN ('draft','active','paused'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bots_org        ON bots (organization_id);
CREATE INDEX IF NOT EXISTS idx_bots_org_status ON bots (organization_id, status);

-- ----------------------------------------------------------------------
-- RLS — mesmo padrão multi-tenant das demais tabelas
-- ----------------------------------------------------------------------
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON bots FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON bots TO authenticated;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'bots'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON bots', r.policyname);
    END LOOP;
END $$;

CREATE POLICY bots_select ON bots
    FOR SELECT TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY bots_insert ON bots
    FOR INSERT TO authenticated
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY bots_update ON bots
    FOR UPDATE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) )
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY bots_delete ON bots
    FOR DELETE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id())
            AND (SELECT private.is_organization_admin()) );

-- ----------------------------------------------------------------------
-- updated_at automático (reusa touch_updated_at() da 002)
-- ----------------------------------------------------------------------
DROP TRIGGER IF EXISTS bots_touch ON bots;
CREATE TRIGGER bots_touch
    BEFORE UPDATE ON bots
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
