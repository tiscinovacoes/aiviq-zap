-- ============================================================================
-- Teste de isolamento multi-tenant — valida 001 + 002
-- Autor: Claude (Arquiteto) · 11/09/2026
--
-- ⚠️ RODAR APENAS EM PROJETO DESCARTÁVEL. Cria usuários em auth.users.
--
-- Cobre os critérios de validação do ADR-009 e do ADR-002.
-- Cada bloco imprime PASS/FAIL via RAISE NOTICE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SEED: duas organizações. Sem a segunda, isolamento não é testável.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
    org_a  UUID := '11111111-1111-1111-1111-111111111111';
    org_b  UUID := '22222222-2222-2222-2222-222222222222';
    u_admin_a UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
    u_agent_a UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
    u_admin_b UUID := 'bbbbbbbb-0000-0000-0000-000000000001';
    u_multi   UUID := 'cccccccc-0000-0000-0000-000000000001'; -- membro de A e B
    inbox_a UUID; inbox_b UUID;
    cont_a  UUID; cont_b  UUID;
BEGIN
    -- auth.users (mínimo necessário para satisfazer as FKs)
    INSERT INTO auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at, created_at, updated_at)
    SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           v.email, '$2a$10$notarealhash', NOW(), NOW(), NOW()
    FROM (VALUES
        (u_admin_a, 'admin.a@teste.local'),
        (u_agent_a, 'agent.a@teste.local'),
        (u_admin_b, 'admin.b@teste.local'),
        (u_multi,   'multi@teste.local')
    ) AS v(id, email)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO organizations (id, name, slug) VALUES
        (org_a, 'Org A - Acme',  'acme-teste'),
        (org_b, 'Org B - Beta',  'beta-teste')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO profiles (id, organization_id, email, full_name, role) VALUES
        (u_admin_a, org_a, 'admin.a@teste.local', 'Admin A', 'admin'),
        (u_agent_a, org_a, 'agent.a@teste.local', 'Agente A', 'agent'),
        (u_admin_b, org_b, 'admin.b@teste.local', 'Admin B', 'admin'),
        (u_multi,   org_a, 'multi@teste.local',   'Multi Org', 'agent')
    ON CONFLICT (id) DO NOTHING;

    -- Vínculos N:N (002). "multi" é agent em A e admin em B — papel por organização.
    INSERT INTO organization_members (organization_id, user_id, role) VALUES
        (org_a, u_admin_a, 'admin'),
        (org_a, u_agent_a, 'agent'),
        (org_b, u_admin_b, 'admin'),
        (org_a, u_multi,   'agent'),
        (org_b, u_multi,   'admin')
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    INSERT INTO inboxes (organization_id, name, channel_type)
        VALUES (org_a, 'WhatsApp A', 'whatsapp_cloud') RETURNING id INTO inbox_a;
    INSERT INTO inboxes (organization_id, name, channel_type)
        VALUES (org_b, 'WhatsApp B', 'whatsapp_cloud') RETURNING id INTO inbox_b;

    INSERT INTO contacts (organization_id, name, phone)
        VALUES (org_a, 'Contato A', '+5511900000001') RETURNING id INTO cont_a;
    INSERT INTO contacts (organization_id, name, phone)
        VALUES (org_b, 'Contato B', '+5511900000002') RETURNING id INTO cont_b;

    INSERT INTO conversations (organization_id, inbox_id, contact_id, status)
        VALUES (org_a, inbox_a, cont_a, 'open');
    INSERT INTO conversations (organization_id, inbox_id, contact_id, status)
        VALUES (org_b, inbox_b, cont_b, 'open');

    RAISE NOTICE 'SEED OK: 2 organizacoes, 4 usuarios, 2 conversas';
END $$;

-- ----------------------------------------------------------------------------
-- Helpers de teste
-- ----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS tests;

CREATE OR REPLACE FUNCTION tests.act_as(p_user UUID, p_org UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    IF p_org IS NULL THEN
        PERFORM set_config('request.headers', '{}', true);
    ELSE
        PERFORM set_config('request.headers',
            json_build_object('x-organization-id', p_org)::text, true);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION tests.check(p_label TEXT, p_actual BIGINT, p_expected BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_actual = p_expected THEN
        RAISE NOTICE 'PASS | % (esperado=%, obtido=%)', p_label, p_expected, p_actual;
    ELSE
        RAISE WARNING 'FAIL | % (esperado=%, obtido=%)', p_label, p_expected, p_actual;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TESTES
-- ----------------------------------------------------------------------------

DO $$
DECLARE
    org_a UUID := '11111111-1111-1111-1111-111111111111';
    org_b UUID := '22222222-2222-2222-2222-222222222222';
    u_agent_a UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
    u_admin_b UUID := 'bbbbbbbb-0000-0000-0000-000000000001';
    u_multi   UUID := 'cccccccc-0000-0000-0000-000000000001';
    n BIGINT;
    ok BOOLEAN;
BEGIN
    SET LOCAL ROLE authenticated;

    -- T1: agente da org A, com header de A, vê a conversa de A
    PERFORM tests.act_as(u_agent_a, org_a);
    SELECT COUNT(*) INTO n FROM conversations;
    PERFORM tests.check('T1 agente A + header A ve conversas de A', n, 1);

    -- T2: agente da org A forjando header da org B -> NADA (fail-closed)
    PERFORM tests.act_as(u_agent_a, org_b);
    SELECT COUNT(*) INTO n FROM conversations;
    PERFORM tests.check('T2 agente A + header B forjado = 0 linhas', n, 0);

    -- T3: admin da org B nao alcanca dados da org A
    PERFORM tests.act_as(u_admin_b, org_a);
    SELECT COUNT(*) INTO n FROM conversations;
    PERFORM tests.check('T3 admin B + header A forjado = 0 linhas', n, 0);

    -- T4: fallback de transicao — sem header, membro de UMA organizacao
    PERFORM tests.act_as(u_agent_a, NULL);
    SELECT COUNT(*) INTO n FROM conversations;
    PERFORM tests.check('T4 agente A sem header (1 org) usa fallback', n, 1);

    -- T5: sem header, membro de DUAS organizacoes -> ambiguo, nega
    PERFORM tests.act_as(u_multi, NULL);
    SELECT COUNT(*) INTO n FROM conversations;
    PERFORM tests.check('T5 multi-org sem header = 0 linhas (ambiguo)', n, 0);

    -- T6: usuario multi-org enxerga AS DUAS organizacoes no seletor
    PERFORM tests.act_as(u_multi, org_a);
    SELECT COUNT(*) INTO n FROM organizations;
    PERFORM tests.check('T6 multi-org ve as 2 organizacoes', n, 2);

    -- T7: multi-org com header A ve so a conversa de A
    SELECT COUNT(*) INTO n FROM conversations;
    PERFORM tests.check('T7 multi-org header A ve so conversas de A', n, 1);

    -- T8: multi-org com header B ve so a conversa de B
    PERFORM tests.act_as(u_multi, org_b);
    SELECT COUNT(*) INTO n FROM conversations;
    PERFORM tests.check('T8 multi-org header B ve so conversas de B', n, 1);

    -- T9: papel POR ORGANIZACAO — multi e agent em A, admin em B
    PERFORM tests.act_as(u_multi, org_a);
    SELECT private.is_organization_admin() INTO ok;
    PERFORM tests.check('T9a multi NAO e admin na org A', ok::int::bigint, 0);
    PERFORM tests.act_as(u_multi, org_b);
    SELECT private.is_organization_admin() INTO ok;
    PERFORM tests.check('T9b multi E admin na org B', ok::int::bigint, 1);

    -- T10: mensagens tambem isoladas
    PERFORM tests.act_as(u_agent_a, org_b);
    SELECT COUNT(*) INTO n FROM messages;
    PERFORM tests.check('T10 mensagens isoladas entre organizacoes', n, 0);

    -- T11: contatos isolados
    PERFORM tests.act_as(u_agent_a, org_a);
    SELECT COUNT(*) INTO n FROM contacts;
    PERFORM tests.check('T11 agente A ve so contatos de A', n, 1);

    RESET ROLE;
END $$;

-- ----------------------------------------------------------------------------
-- T12: WITH CHECK impede mover conversa para outra organizacao
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    org_a UUID := '11111111-1111-1111-1111-111111111111';
    org_b UUID := '22222222-2222-2222-2222-222222222222';
    u_admin_a UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM tests.act_as(u_admin_a, org_a);
    BEGIN
        UPDATE conversations SET organization_id = org_b WHERE organization_id = org_a;
        RAISE WARNING 'FAIL | T12 conseguiu mover conversa para outra organizacao';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        RAISE NOTICE 'PASS | T12 WITH CHECK bloqueou mudanca de organizacao';
    END;
    RESET ROLE;
END $$;

-- ----------------------------------------------------------------------------
-- T13: nenhuma funcao SECURITY DEFINER sem search_path travado (CR-001 B5)
-- ----------------------------------------------------------------------------
DO $$
DECLARE n BIGINT;
BEGIN
    SELECT COUNT(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE p.prosecdef
      AND ns.nspname IN ('public', 'private')
      AND (p.proconfig IS NULL OR NOT (p.proconfig @> ARRAY['search_path=']));
    PERFORM tests.check('T13 funcoes SECURITY DEFINER sem search_path', n, 0);
END $$;

-- ----------------------------------------------------------------------------
-- T14: dedup de webhook (CR-001 I4)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    org_a UUID := '11111111-1111-1111-1111-111111111111';
    conv UUID;
BEGIN
    SELECT id INTO conv FROM conversations WHERE organization_id = org_a LIMIT 1;
    INSERT INTO messages (organization_id, conversation_id, sender_type, content, external_message_id)
        VALUES (org_a, conv, 'contact', 'primeira entrega', 'WA_DEDUP_TESTE');
    BEGIN
        INSERT INTO messages (organization_id, conversation_id, sender_type, content, external_message_id)
            VALUES (org_a, conv, 'contact', 'entrega duplicada', 'WA_DEDUP_TESTE');
        RAISE WARNING 'FAIL | T14 permitiu external_message_id duplicado';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS | T14 indice de dedup bloqueou duplicata';
    END;
END $$;

-- ----------------------------------------------------------------------------
-- T15: backfill preservou todos os vinculos
-- ----------------------------------------------------------------------------
DO $$
DECLARE n_profiles BIGINT; n_members BIGINT;
BEGIN
    SELECT COUNT(*) INTO n_profiles FROM profiles WHERE organization_id IS NOT NULL;
    SELECT COUNT(DISTINCT user_id) INTO n_members FROM organization_members;
    PERFORM tests.check('T15 todo profile com org virou membership',
                        (n_members >= n_profiles)::int::bigint, 1);
END $$;

-- ============================================================================
-- LIMPEZA (opcional — comentar para inspecionar os dados)
-- ============================================================================
-- DELETE FROM organizations WHERE slug IN ('acme-teste','beta-teste');
-- DELETE FROM auth.users WHERE email LIKE '%@teste.local';
-- DROP SCHEMA tests CASCADE;
