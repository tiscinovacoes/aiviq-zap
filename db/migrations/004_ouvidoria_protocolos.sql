-- =====================================================================
-- 004_ouvidoria_protocolos.sql
-- Pivô de domínio: CRM comercial (vendas/leads) -> Ouvidoria (atendimento
-- ao cidadão). Renomeia `deals` -> `protocolos`, remove as colunas
-- comerciais (value, probability), remodela `stage` -> `status` com o
-- fluxo de atendimento, adiciona os campos de manifestação/órgão/prazo e
-- gera número público de protocolo. Enriquece `contacts` (cidadãos) com
-- cpf/bairro.
--
-- Pré-requisitos: 001, 002 e 003 (definem `deals`, `contacts`, o schema
--   `private`, `private.current_organization_id()`,
--   `private.is_organization_admin()` e `touch_updated_at()`).
-- Re-executável (idempotente).
-- =====================================================================

-- ----------------------------------------------------------------------
-- 1. RENOMEIA deals -> protocolos (só se ainda não foi feito)
-- ----------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'deals')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_schema = 'public' AND table_name = 'protocolos')
    THEN
        ALTER TABLE deals RENAME TO protocolos;
    END IF;
END $$;

-- Se nem deals nem protocolos existem (base nova), cria protocolos do zero.
CREATE TABLE IF NOT EXISTS protocolos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
    title               TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'aberto',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------
-- 2. REMODELA COLUNAS
-- ----------------------------------------------------------------------
-- 2a. stage -> status (renomeia se ainda houver `stage`)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='protocolos' AND column_name='stage')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='protocolos' AND column_name='status')
    THEN
        ALTER TABLE protocolos RENAME COLUMN stage TO status;
    END IF;
END $$;

-- 2b. expected_close_date -> due_date (prazo / SLA)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='protocolos' AND column_name='expected_close_date')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='protocolos' AND column_name='due_date')
    THEN
        ALTER TABLE protocolos RENAME COLUMN expected_close_date TO due_date;
    END IF;
END $$;

-- 2c. Novas colunas de ouvidoria
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS protocol_number   TEXT;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS tipo_manifestacao TEXT NOT NULL DEFAULT 'solicitacao';
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS categoria         TEXT;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS orgao_responsavel TEXT;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS bairro            TEXT;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS prioridade        TEXT NOT NULL DEFAULT 'media';
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS due_date          DATE;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS closed_at         TIMESTAMPTZ;
ALTER TABLE protocolos ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'aberto';

-- 2d. Remapeia os valores antigos do funil de vendas -> fluxo de atendimento
UPDATE protocolos SET status = CASE status
    WHEN 'lead_qualificado' THEN 'aberto'
    WHEN 'contato_inicial'  THEN 'em_analise'
    WHEN 'demonstracao'     THEN 'em_atendimento'
    WHEN 'proposta_enviada' THEN 'aguardando_cidadao'
    WHEN 'fechado_ganho'    THEN 'resolvido'
    WHEN 'perdido'          THEN 'arquivado'
    ELSE status
END
WHERE status IN ('lead_qualificado','contato_inicial','demonstracao',
                 'proposta_enviada','fechado_ganho','perdido');

ALTER TABLE protocolos ALTER COLUMN status SET DEFAULT 'aberto';

-- 2e. Remove as colunas comerciais (não fazem sentido para o cidadão)
ALTER TABLE protocolos DROP COLUMN IF EXISTS value;
ALTER TABLE protocolos DROP COLUMN IF EXISTS probability;

-- 2f. CHECK constraints do domínio (recriáveis)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocolos_status_chk') THEN
        ALTER TABLE protocolos ADD CONSTRAINT protocolos_status_chk
            CHECK (status IN ('aberto','em_analise','em_atendimento',
                              'aguardando_cidadao','resolvido','arquivado'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocolos_tipo_chk') THEN
        ALTER TABLE protocolos ADD CONSTRAINT protocolos_tipo_chk
            CHECK (tipo_manifestacao IN ('denuncia','reclamacao','solicitacao',
                                         'sugestao','elogio','informacao'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocolos_prioridade_chk') THEN
        ALTER TABLE protocolos ADD CONSTRAINT protocolos_prioridade_chk
            CHECK (prioridade IN ('baixa','media','alta','urgente'));
    END IF;
END $$;

-- ----------------------------------------------------------------------
-- 3. NÚMERO PÚBLICO DE PROTOCOLO (sequência + trigger)
--    Formato AAAA-NNNNNN (ex.: 2026-000123). Sequência global monotônica,
--    prefixada pelo ano de abertura.
-- ----------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS protocolos_number_seq;

CREATE OR REPLACE FUNCTION set_protocol_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.protocol_number IS NULL OR NEW.protocol_number = '' THEN
        NEW.protocol_number :=
            to_char(now(), 'YYYY') || '-' ||
            lpad(nextval('protocolos_number_seq')::text, 6, '0');
    END IF;
    RETURN NEW;
END;
$$;

-- Função de trigger não deve ser chamável via API: PostgREST expõe funções
-- SECURITY DEFINER do schema public como RPC (/rest/v1/rpc/...). Revoga EXECUTE
-- dos papéis expostos — o trigger BEFORE INSERT continua funcionando.
REVOKE EXECUTE ON FUNCTION set_protocol_number() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS protocolos_set_number ON protocolos;
CREATE TRIGGER protocolos_set_number
    BEFORE INSERT ON protocolos
    FOR EACH ROW EXECUTE FUNCTION set_protocol_number();

-- Backfill dos protocolos existentes sem número
UPDATE protocolos
SET protocol_number = to_char(created_at, 'YYYY') || '-' ||
                      lpad(nextval('protocolos_number_seq')::text, 6, '0')
WHERE protocol_number IS NULL OR protocol_number = '';

-- ----------------------------------------------------------------------
-- 4. CONTACTS (cidadãos) — enriquece com cpf/bairro
-- ----------------------------------------------------------------------
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cpf    TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bairro TEXT;

-- ----------------------------------------------------------------------
-- 5. ÍNDICES (troca os idx_deals_* por idx_protocolos_*)
-- ----------------------------------------------------------------------
DROP INDEX IF EXISTS idx_deals_org;
DROP INDEX IF EXISTS idx_deals_org_stage;
DROP INDEX IF EXISTS idx_deals_contact;

CREATE INDEX IF NOT EXISTS idx_protocolos_org         ON protocolos (organization_id);
CREATE INDEX IF NOT EXISTS idx_protocolos_org_status  ON protocolos (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_protocolos_contact     ON protocolos (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_protocolos_due         ON protocolos (organization_id, due_date) WHERE due_date IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_protocolos_number ON protocolos (protocol_number);

-- ----------------------------------------------------------------------
-- 6. RLS — mantém o padrão multi-tenant da 003 (renomeia policies)
-- ----------------------------------------------------------------------
ALTER TABLE protocolos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON protocolos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON protocolos TO authenticated;
GRANT USAGE ON SEQUENCE protocolos_number_seq TO authenticated;

-- Remove policies antigas (deals_*) e quaisquer protocolos_* antes de recriar.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'protocolos'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON protocolos', r.policyname);
    END LOOP;
END $$;

CREATE POLICY protocolos_select ON protocolos
    FOR SELECT TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY protocolos_insert ON protocolos
    FOR INSERT TO authenticated
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY protocolos_update ON protocolos
    FOR UPDATE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) )
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY protocolos_delete ON protocolos
    FOR DELETE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id())
            AND (SELECT private.is_organization_admin()) );

-- ----------------------------------------------------------------------
-- 7. updated_at automático (reusa touch_updated_at() da 002)
-- ----------------------------------------------------------------------
DROP TRIGGER IF EXISTS deals_touch      ON protocolos;
DROP TRIGGER IF EXISTS protocolos_touch ON protocolos;
CREATE TRIGGER protocolos_touch
    BEFORE UPDATE ON protocolos
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
