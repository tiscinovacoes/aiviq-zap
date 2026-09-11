-- Migration: 001_initial_schema.sql
-- Description: Initial schema for Poli 2.0 (Multi-tenant, Auth, Inboxes, Contacts, Conversations, Messages, RLS)

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ORGANIZATIONS / TENANTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'pro', -- starter, pro, enterprise
    max_agents INTEGER NOT NULL DEFAULT 5,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 2. USERS & PROFILES (Linked to Supabase Auth)
-- ==============================================================================
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'agent', 'viewer');

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'agent',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(organization_id);

-- ==============================================================================
-- 3. INBOXES / CHANNELS (WhatsApp Cloud API, Instagram, Webchat)
-- ==============================================================================
CREATE TYPE channel_type AS ENUM ('whatsapp_cloud', 'instagram', 'webchat', 'telegram');

CREATE TABLE IF NOT EXISTS inboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    channel_type channel_type NOT NULL,
    phone_number_id VARCHAR(100),
    waba_id VARCHAR(100),
    credentials JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inboxes_org ON inboxes(organization_id);

-- ==============================================================================
-- 4. CONTACTS & CRM DEALS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    avatar_url TEXT,
    tags TEXT[] DEFAULT '{}',
    custom_attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contact_phone_org UNIQUE (organization_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);

-- ==============================================================================
-- 5. CONVERSATIONS / CHATS
-- ==============================================================================
CREATE TYPE conversation_status AS ENUM ('open', 'pending', 'resolved');

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    inbox_id UUID NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status conversation_status NOT NULL DEFAULT 'open',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
    channel_id VARCHAR(255), -- external thread / session ID
    last_message_preview TEXT,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    unread_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_org_status ON conversations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assignee ON conversations(assignee_id);

-- ==============================================================================
-- 6. MESSAGES
-- ==============================================================================
CREATE TYPE message_sender_type AS ENUM ('contact', 'agent', 'bot', 'system');
CREATE TYPE message_delivery_status AS ENUM ('sending', 'sent', 'delivered', 'read', 'failed');

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type message_sender_type NOT NULL,
    sender_id UUID, -- References profiles(id) if sender_type = 'agent'
    content TEXT,
    message_type VARCHAR(50) NOT NULL DEFAULT 'text', -- text, image, audio, video, document, template, interactive
    metadata JSONB DEFAULT '{}'::jsonb,
    delivery_status message_delivery_status NOT NULL DEFAULT 'sent',
    external_message_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_org ON messages(organization_id);

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's organization
CREATE OR REPLACE FUNCTION current_user_organization_id()
RETURNS UUID AS $$
    SELECT organization_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- RLS Policies
CREATE POLICY "Tenants can only view own organization"
    ON organizations FOR SELECT
    USING (id = current_user_organization_id());

CREATE POLICY "Tenants can only view profiles within their organization"
    ON profiles FOR ALL
    USING (organization_id = current_user_organization_id());

CREATE POLICY "Tenants can only access their own inboxes"
    ON inboxes FOR ALL
    USING (organization_id = current_user_organization_id());

CREATE POLICY "Tenants can only access their own contacts"
    ON contacts FOR ALL
    USING (organization_id = current_user_organization_id());

CREATE POLICY "Tenants can only access their own conversations"
    ON conversations FOR ALL
    USING (organization_id = current_user_organization_id());

CREATE POLICY "Tenants can only access their own messages"
    ON messages FOR ALL
    USING (organization_id = current_user_organization_id());
