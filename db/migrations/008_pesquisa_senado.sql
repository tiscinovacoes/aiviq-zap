-- =====================================================================
-- 008_pesquisa_senado.sql
-- Persistência das sessões da Pesquisa Eleitoral (Senado MS). Antes eram
-- in-memory (global + seed), o que no serverless piscava entre instâncias e
-- não durava. Agora cada eleitor abordado vira uma linha durável por org.
--
-- Pré-requisitos: 001..003 (organizations, schema private, funções de RLS,
--   touch_updated_at()).
-- Re-executável (idempotente).
-- =====================================================================

CREATE TABLE IF NOT EXISTS pesquisa_senado (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    phone           TEXT NOT NULL,
    name            TEXT NOT NULL DEFAULT 'Eleitor',
    bairro          TEXT,
    etapa           TEXT NOT NULL DEFAULT 'disparado',
    voto1_id        INT,
    voto1_nome      TEXT,
    voto2_id        INT,
    voto2_nome      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pesquisa_senado_phone_org UNIQUE (organization_id, phone)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pesquisa_senado_etapa_chk') THEN
        ALTER TABLE pesquisa_senado ADD CONSTRAINT pesquisa_senado_etapa_chk
            CHECK (etapa IN ('disparado','aguardando_voto1','aguardando_voto2','concluido','recusado'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pesquisa_senado_org       ON pesquisa_senado (organization_id);
CREATE INDEX IF NOT EXISTS idx_pesquisa_senado_org_etapa ON pesquisa_senado (organization_id, etapa);

-- ----------------------------------------------------------------------
-- RLS — mesmo padrão multi-tenant das demais tabelas
-- ----------------------------------------------------------------------
ALTER TABLE pesquisa_senado ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON pesquisa_senado FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON pesquisa_senado TO authenticated;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pesquisa_senado'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON pesquisa_senado', r.policyname);
    END LOOP;
END $$;

CREATE POLICY pesquisa_senado_select ON pesquisa_senado
    FOR SELECT TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY pesquisa_senado_insert ON pesquisa_senado
    FOR INSERT TO authenticated
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY pesquisa_senado_update ON pesquisa_senado
    FOR UPDATE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) )
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY pesquisa_senado_delete ON pesquisa_senado
    FOR DELETE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id())
            AND (SELECT private.is_organization_admin()) );

-- ----------------------------------------------------------------------
-- updated_at automático (reusa touch_updated_at() da 002)
-- ----------------------------------------------------------------------
DROP TRIGGER IF EXISTS pesquisa_senado_touch ON pesquisa_senado;
CREATE TRIGGER pesquisa_senado_touch
    BEFORE UPDATE ON pesquisa_senado
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
