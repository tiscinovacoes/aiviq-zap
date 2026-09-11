-- Migration: 002_multi_org_membership.sql
-- Description: Multi-organização por usuário (N:N) + correções de segurança do CR-001 (B5, I1)
-- Autor: Claude (Arquiteto) · Data: 11/09/2026
-- Decisão: PO aprovou multi-organização em 11/09/2026 (CR-001 §D2)
--
-- O QUE MUDA
--   1. Um usuário passa a poder pertencer a N organizações (organization_members)
--   2. `profiles` vira identidade GLOBAL (email, nome, avatar) — sem organização
--   3. Funções auxiliares movidas para o schema `private`, com SET search_path = '' (B5)
--   4. Todas as policies reescritas com (select fn()) — InitPlan (I1)
--
-- O QUE NÃO MUDA
--   Semântica de visibilidade: quem está na organização continua vendo tudo dela.
--   O modelo de membership por inbox (CR-001 §I2) fica para a migration 003.
--
-- ⚠️ AÇÃO NECESSÁRIA NA APLICAÇÃO
--   A partir daqui, toda request autenticada deve enviar o header:
--       x-organization-id: <uuid da organização ativa>
--   Há um fallback de transição: se o header não vier E o usuário pertencer a
--   exatamente UMA organização, ela é resolvida automaticamente (ver §3).

BEGIN;

-- ==============================================================================
-- 1. TABELA DE MEMBERSHIP (N:N)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS organization_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role            user_role NOT NULL DEFAULT 'agent',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_org_member UNIQUE (organization_id, user_id)
);

-- Índice mais crítico do banco: consultado por TODA policy, em TODA query.
CREATE INDEX IF NOT EXISTS idx_org_members_user_org
    ON organization_members (user_id, organization_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_org_members_org
    ON organization_members (organization_id);

-- ==============================================================================
-- 2. BACKFILL — preserva os vínculos existentes
-- ==============================================================================

INSERT INTO organization_members (organization_id, user_id, role, is_active)
SELECT p.organization_id, p.id, p.role, p.is_active
FROM profiles p
WHERE p.organization_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- `profiles` vira identidade global. As colunas abaixo passam a ser espelho
-- histórico — a fonte de verdade é organization_members.
-- Mantidas NULLABLE por uma versão para não quebrar código em voo; a migration
-- 003 as remove depois que a aplicação estiver migrada.
ALTER TABLE profiles ALTER COLUMN organization_id DROP NOT NULL;

COMMENT ON COLUMN profiles.organization_id IS
    'DEPRECADO (002): usar organization_members. Remover na 003.';
COMMENT ON COLUMN profiles.role IS
    'DEPRECADO (002): o papel agora é por organização, em organization_members.role. Remover na 003.';

-- ==============================================================================
-- 3. FUNÇÕES AUXILIARES — schema privado, search_path travado
--    Corrige CR-001 §B5 (escalada de privilégio via search_path)
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

-- As policies antigas dependem de public.current_user_organization_id().
-- Postgres recusa remover uma função referenciada por policy, então elas caem primeiro.
DROP POLICY IF EXISTS "Tenants can only view own organization"                  ON organizations;
DROP POLICY IF EXISTS "Tenants can only view profiles within their organization" ON profiles;
DROP POLICY IF EXISTS "Tenants can only access their own inboxes"               ON inboxes;
DROP POLICY IF EXISTS "Tenants can only access their own contacts"              ON contacts;
DROP POLICY IF EXISTS "Tenants can only access their own conversations"         ON conversations;
DROP POLICY IF EXISTS "Tenants can only access their own messages"              ON messages;

-- Organização ativa da request.
-- Resolve pelo header x-organization-id, SEMPRE validado contra a associação real:
-- um header forjado para uma organização da qual o usuário não é membro retorna NULL,
-- e toda policy passa a negar (fail-closed).
--
-- Fallback de transição: sem header e com exatamente uma organização ativa,
-- resolve para ela. Continua sendo impossível alcançar uma organização alheia.
CREATE OR REPLACE FUNCTION private.current_organization_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    WITH requested AS (
        SELECT NULLIF(
            current_setting('request.headers', true)::json ->> 'x-organization-id', ''
        )::uuid AS id
    ),
    memberships AS (
        SELECT m.organization_id
        FROM public.organization_members m
        WHERE m.user_id = (SELECT auth.uid()) AND m.is_active
    )
    SELECT COALESCE(
        -- 1) header presente e válido
        (SELECT m.organization_id FROM memberships m, requested r
          WHERE m.organization_id = r.id LIMIT 1),
        -- 2) transição: sem header e membro de exatamente uma organização
        (SELECT m.organization_id FROM memberships m
          WHERE (SELECT r.id FROM requested r) IS NULL
            AND (SELECT COUNT(*) FROM memberships) = 1
          LIMIT 1)
    );
$$;

CREATE OR REPLACE FUNCTION private.is_organization_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.user_id = (SELECT auth.uid())
          AND m.is_active
          AND m.organization_id = private.current_organization_id()
          AND m.role IN ('owner', 'admin')
    );
$$;

-- Todas as organizações do usuário — para o seletor de organização na UI.
-- RETURNS SETOF (não UUID[]): permite a forma `= ANY (ARRAY(SELECT ...))`, que é
-- a sintaxe benchmarkada pelo Supabase (173.000 ms -> 16 ms). Com UUID[] a
-- expressão `= ANY (SELECT fn())` compararia uuid com uuid[] e daria erro de tipo.
CREATE OR REPLACE FUNCTION private.my_organization_ids()
RETURNS SETOF UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT m.organization_id
    FROM public.organization_members m
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active;
$$;

-- Colegas na organização ativa — evita recursão na policy de `profiles`.
CREATE OR REPLACE FUNCTION private.member_ids_in_current_org()
RETURNS SETOF UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT m.user_id
    FROM public.organization_members m
    WHERE m.organization_id = private.current_organization_id() AND m.is_active;
$$;

-- A função antiga vivia em `public` (exposta como RPC na API REST) e sem
-- search_path travado. Removida.
DROP FUNCTION IF EXISTS public.current_user_organization_id();

-- ==============================================================================
-- 4. POLICIES REESCRITAS
--    Corrige CR-001 §I1: toda chamada de função envolvida em (select ...),
--    o que gera InitPlan e executa 1x por statement em vez de 1x por linha.
--    Benchmark oficial: 178.000 ms -> 12 ms.
-- ==============================================================================

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON organization_members FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_members TO authenticated;

-- (as policies antigas já foram removidas no §3, antes do DROP FUNCTION)

-- Torna a migration re-executável durante o desenvolvimento: CREATE POLICY não
-- tem IF NOT EXISTS, então removemos as novas antes de recriá-las.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'organizations:organizations_select',    'organizations:organizations_update',
      'organization_members:org_members_select','organization_members:org_members_write',
      'profiles:profiles_select',              'profiles:profiles_update_self',
      'inboxes:inboxes_select',                'inboxes:inboxes_write',
      'contacts:contacts_select',              'contacts:contacts_insert',
      'contacts:contacts_update',              'contacts:contacts_delete',
      'conversations:conversations_select',    'conversations:conversations_insert',
      'conversations:conversations_update',    'conversations:conversations_delete',
      'messages:messages_select',              'messages:messages_insert',
      'messages:messages_update',
      'inboxes:tenant_guard',                  'contacts:tenant_guard',
      'conversations:tenant_guard',            'messages:tenant_guard'
    ]) AS spec
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   split_part(r.spec, ':', 2), split_part(r.spec, ':', 1));
  END LOOP;
END $$;

-- ---------------------------------------------------------------- organizations
-- O usuário enxerga TODAS as organizações das quais participa (menu de troca),
-- mas só opera dentro da organização ativa.
CREATE POLICY organizations_select ON organizations
    FOR SELECT TO authenticated
    USING ( id = ANY (ARRAY(SELECT private.my_organization_ids())) );

CREATE POLICY organizations_update ON organizations
    FOR UPDATE TO authenticated
    USING ( id = (SELECT private.current_organization_id())
            AND (SELECT private.is_organization_admin()) )
    WITH CHECK ( id = (SELECT private.current_organization_id()) );

-- ---------------------------------------------------------- organization_members
CREATE POLICY org_members_select ON organization_members
    FOR SELECT TO authenticated
    USING (
        user_id = (SELECT auth.uid())                                -- as próprias associações
        OR organization_id = (SELECT private.current_organization_id())
    );

CREATE POLICY org_members_write ON organization_members
    FOR ALL TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id())
            AND (SELECT private.is_organization_admin()) )
    WITH CHECK ( organization_id = (SELECT private.current_organization_id())
                 AND (SELECT private.is_organization_admin()) );

-- --------------------------------------------------------------------- profiles
-- Identidade global: cada um vê a si mesmo e aos colegas da organização ativa.
CREATE POLICY profiles_select ON profiles
    FOR SELECT TO authenticated
    USING (
        id = (SELECT auth.uid())
        OR id = ANY (ARRAY(SELECT private.member_ids_in_current_org()))
    );

CREATE POLICY profiles_update_self ON profiles
    FOR UPDATE TO authenticated
    USING ( id = (SELECT auth.uid()) )
    WITH CHECK ( id = (SELECT auth.uid()) );

-- ---------------------------------------------------------------------- inboxes
CREATE POLICY inboxes_select ON inboxes
    FOR SELECT TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY inboxes_write ON inboxes
    FOR ALL TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id())
            AND (SELECT private.is_organization_admin()) )
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

-- --------------------------------------------------------------------- contacts
CREATE POLICY contacts_select ON contacts
    FOR SELECT TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY contacts_insert ON contacts
    FOR INSERT TO authenticated
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY contacts_update ON contacts
    FOR UPDATE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) )
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY contacts_delete ON contacts
    FOR DELETE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id())
            AND (SELECT private.is_organization_admin()) );

-- ---------------------------------------------------------------- conversations
-- WITH CHECK explícito impede mover uma conversa para outra organização —
-- proteção que a policy anterior (FOR ALL só com USING) não dava de forma clara.
CREATE POLICY conversations_select ON conversations
    FOR SELECT TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY conversations_insert ON conversations
    FOR INSERT TO authenticated
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY conversations_update ON conversations
    FOR UPDATE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) )
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY conversations_delete ON conversations
    FOR DELETE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id())
            AND (SELECT private.is_organization_admin()) );

-- --------------------------------------------------------------------- messages
CREATE POLICY messages_select ON messages
    FOR SELECT TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY messages_insert ON messages
    FOR INSERT TO authenticated
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

CREATE POLICY messages_update ON messages
    FOR UPDATE TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) )
    WITH CHECK ( organization_id = (SELECT private.current_organization_id()) );

-- ==============================================================================
-- 5. CINTO DE SEGURANÇA — policy RESTRICTIVE
--    RESTRICTIVE é AND com todas as demais. Se no futuro alguém escrever uma
--    policy permissiva mal feita, o vazamento entre organizações continua barrado.
-- ==============================================================================

CREATE POLICY tenant_guard ON inboxes       AS RESTRICTIVE FOR ALL TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );
CREATE POLICY tenant_guard ON contacts      AS RESTRICTIVE FOR ALL TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );
CREATE POLICY tenant_guard ON conversations AS RESTRICTIVE FOR ALL TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );
CREATE POLICY tenant_guard ON messages      AS RESTRICTIVE FOR ALL TO authenticated
    USING ( organization_id = (SELECT private.current_organization_id()) );

-- ==============================================================================
-- 6. DEDUPLICAÇÃO DE WEBHOOK (CR-001 §I4)
--    Evolution API faz até 10 retentativas com timeout de 30s; a Meta reentrega.
--    Sem este índice, mensagem duplicada na timeline é questão de tempo.
-- ==============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_dedup
    ON messages (organization_id, external_message_id)
    WHERE external_message_id IS NOT NULL;

-- ==============================================================================
-- 7. updated_at automático em organization_members
-- ==============================================================================

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS org_members_touch ON organization_members;
CREATE TRIGGER org_members_touch
    BEFORE UPDATE ON organization_members
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;

-- ==============================================================================
-- VERIFICAÇÃO PÓS-MIGRATION
-- ==============================================================================
-- 1) Todo profile com organização virou membership:
--      SELECT COUNT(*) FROM profiles WHERE organization_id IS NOT NULL;
--      SELECT COUNT(*) FROM organization_members;          -- deve bater
--
-- 2) Nenhuma função SECURITY DEFINER sem search_path:
--      SELECT p.proname, p.proconfig
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE p.prosecdef AND n.nspname IN ('public','private')
--        AND (p.proconfig IS NULL OR NOT p.proconfig @> ARRAY['search_path=']);
--      -- deve retornar 0 linhas
--
-- 3) Isolamento entre organizações (rodar com duas organizações no seed):
--      SELECT set_config('request.jwt.claims',
--             json_build_object('sub','<user da org A>','role','authenticated')::text, true);
--      SELECT set_config('request.headers',
--             json_build_object('x-organization-id','<uuid da org B>')::text, true);
--      SET ROLE authenticated;
--      SELECT COUNT(*) FROM conversations;                 -- deve ser 0
