import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sprint 6: Security Hardening & CR-001 Verification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('B1 & I6: Backdoor Gating and Service Role Hardening', () => {
    it('should throw an error in production if SUPABASE_SERVICE_ROLE_KEY is missing (CR-001 I6)', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { getServiceSupabase } = await import('../src/lib/supabase');
      expect(() => getServiceSupabase()).toThrowError(
        'SUPABASE_SERVICE_ROLE_KEY ausente no ambiente de produção.'
      );
    });

    it('should allow getServiceSupabase when SUPABASE_SERVICE_ROLE_KEY is properly set', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid-service-role-key-12345';

      const { getServiceSupabase } = await import('../src/lib/supabase');
      const client = getServiceSupabase();
      expect(client).toBeDefined();
    });
  });

  describe('Migration 002: SQL Security Hardening & Multi-Tenant Audit (CR-001 B5, I1, I2, I3, I4, D4)', () => {
    const migrationPath = path.resolve(__dirname, '../../../db/migrations/002_security_and_membership_hardening.sql');

    it('should have migration 002 file on disk', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('should contain private schema and security definer with empty search_path (CR-001 B5)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS private');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION private.current_account_id()');
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain("SET search_path = ''");
      expect(sql).toContain('REVOKE ALL ON SCHEMA private FROM anon, authenticated');
    });

    it('should contain deduplication unique index on external_message_id (CR-001 I4)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_source_dedup');
      expect(sql).toContain('messages (organization_id, external_message_id)');
      expect(sql).toContain('WHERE external_message_id IS NOT NULL');
    });

    it('should contain inbox_members and team_members tables (CR-001 I2)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS inbox_members');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS team_members');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS teams');
      expect(sql).toContain('ALTER TABLE inbox_members ENABLE ROW LEVEL SECURITY');
    });

    it('should contain inbox_id in messages and SLA/WhatsApp fields in conversations (CR-001 I3, D4)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('ALTER TABLE messages');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS inbox_id UUID');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_private BOOLEAN');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS last_incoming_at TIMESTAMPTZ');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ');
    });

    it('should optimize RLS policies with (SELECT private.current_account_id()) (CR-001 I1)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('USING (id = (SELECT private.current_account_id()))');
      expect(sql).toContain('USING (organization_id = (SELECT private.current_account_id()))');
    });
  });
});
