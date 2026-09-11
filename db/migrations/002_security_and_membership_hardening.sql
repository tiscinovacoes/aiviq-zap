-- Migration: 002_security_and_membership_hardening.sql
-- Description: Security hardening, RLS performance optimization, membership tables, deduplication and SLA tracking (Addresses CR-001 B5, I1, I2, I3, I4, D4)

-- ==============================================================================
-- 1. SECURITY DEFINER & PRIVATE SCHEMA (CR-001 B5)
-- ==============================================================================
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

-- Hardened helper function: isolated in private schema with search_path = '' and fully qualified names
CREATE OR REPLACE FUNCTION private.current_account_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.organization_id FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
  LIMIT 1;
$$;

-- Grant execution to authenticated users only
GRANT EXECUTE ON FUNCTION private.current_account_id() TO authenticated;

-- ==============================================================================
-- 2. DEDUPLICATION INDEX ON MESSAGES (CR-001 I4)
-- ==============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_source_dedup
  ON messages (organization_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

-- ==============================================================================
-- 3. INBOX MEMBERSHIP & TEAMS (CR-001 I2)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(organization_id);

CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_team_member UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);

CREATE TABLE IF NOT EXISTS inbox_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    inbox_id UUID NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_inbox_member UNIQUE (inbox_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_members_user ON inbox_members(user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_members_inbox ON inbox_members(inbox_id);

-- ==============================================================================
-- 4. MESSAGES INBOX_ID & PRIVATE NOTES & SLA FIELDS (CR-001 I3, D4)
-- ==============================================================================
-- Direct inbox_id in messages for single-table policy evaluation
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS inbox_id UUID REFERENCES inboxes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_messages_inbox ON messages(inbox_id);

-- Private internal notes (not sent to the contact)
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

-- WhatsApp 24-hour customer care window & SLA tracking on conversations
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_reply_created_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_incoming_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_last_incoming ON conversations(last_incoming_at);

-- ==============================================================================
-- 5. RLS PERFORMANCE HARDENING (CR-001 I1)
-- ==============================================================================
-- Replace functions in policies with (SELECT private.current_account_id()) for InitPlan execution

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_members ENABLE ROW LEVEL SECURITY;

-- Recreate policies on existing tables with (SELECT private.current_account_id())
DROP POLICY IF EXISTS "Tenants can only view own organization" ON organizations;
CREATE POLICY "Tenants can only view own organization"
    ON organizations FOR SELECT
    USING (id = (SELECT private.current_account_id()));

DROP POLICY IF EXISTS "Tenants can only view profiles within their organization" ON profiles;
CREATE POLICY "Tenants can only view profiles within their organization"
    ON profiles FOR ALL
    USING (organization_id = (SELECT private.current_account_id()));

DROP POLICY IF EXISTS "Tenants can only access their own inboxes" ON inboxes;
CREATE POLICY "Tenants can only access their own inboxes"
    ON inboxes FOR ALL
    USING (organization_id = (SELECT private.current_account_id()));

DROP POLICY IF EXISTS "Tenants can only access their own contacts" ON contacts;
CREATE POLICY "Tenants can only access their own contacts"
    ON contacts FOR ALL
    USING (organization_id = (SELECT private.current_account_id()));

DROP POLICY IF EXISTS "Tenants can only access their own conversations" ON conversations;
CREATE POLICY "Tenants can only access their own conversations"
    ON conversations FOR ALL
    USING (organization_id = (SELECT private.current_account_id()));

DROP POLICY IF EXISTS "Tenants can only access their own messages" ON messages;
CREATE POLICY "Tenants can only access their own messages"
    ON messages FOR ALL
    USING (organization_id = (SELECT private.current_account_id()));

-- Policies for new membership tables
CREATE POLICY "Tenants can only access their own teams"
    ON teams FOR ALL
    USING (organization_id = (SELECT private.current_account_id()));

CREATE POLICY "Tenants can only access their own team members"
    ON team_members FOR ALL
    USING (organization_id = (SELECT private.current_account_id()));

CREATE POLICY "Tenants can only access their own inbox members"
    ON inbox_members FOR ALL
    USING (organization_id = (SELECT private.current_account_id()));
