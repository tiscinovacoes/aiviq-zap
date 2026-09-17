-- =====================================================================
-- 011_dispatch_queue.sql
-- Fila de disparo PERSISTENTE no servidor (não mais no navegador). Um cron
-- chama /api/pesquisa/senado/tick a cada minuto e envia UM contato por vez,
-- respeitando janela de horário, teto/warmup (dispatch_counters) e intervalo
-- anti-ban (dispatch_control.next_allowed_at). Sobrevive a fechar a aba/F5 e
-- retoma de onde parou.
--
-- Pré-requisitos: 001 (organizations), 002 (organization_members p/ RLS).
-- Idempotente. Escrita real é via service-role (server-to-server).
-- =====================================================================

CREATE TABLE IF NOT EXISTS dispatch_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    phone           TEXT NOT NULL,          -- dígitos canônicos
    name            TEXT,
    bairro          TEXT,
    status          TEXT NOT NULL DEFAULT 'pendente', -- pendente|enviado|erro
    attempts        INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    instance_name   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dispatch_queue_org_status
    ON dispatch_queue (organization_id, status, created_at);

CREATE TABLE IF NOT EXISTS dispatch_control (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    paused          BOOLEAN NOT NULL DEFAULT false,
    next_allowed_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dispatch_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_control ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dispatch_queue' AND policyname='dispatch_queue_same_org') THEN
    CREATE POLICY dispatch_queue_same_org ON dispatch_queue FOR ALL
      USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND is_active = TRUE))
      WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND is_active = TRUE));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dispatch_control' AND policyname='dispatch_control_same_org') THEN
    CREATE POLICY dispatch_control_same_org ON dispatch_control FOR ALL
      USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND is_active = TRUE))
      WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND is_active = TRUE));
  END IF;
END $$;

-- =====================================================================
-- FIM 011_dispatch_queue.sql
-- =====================================================================
