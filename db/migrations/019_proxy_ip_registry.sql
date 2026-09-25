-- =====================================================================
-- 019_proxy_ip_registry.sql
-- Registro dos IPs de proxy (1 IP fixo por chip) com QUARENTENA.
--
-- Decisao do PO (21/09/2026): cada numero de WhatsApp tem 1 IP fixo. Quando um
-- numero e perdido (banido), abre-se um numero novo com um IP NOVO, e o IP do
-- chip aposentado fica em quarentena (30 dias) para nao ser reaproveitado
-- logo em seguida por outro numero.
--
-- Por que precisa de tabela: o "IP em uso" vem da Evolution (cada instancia
-- guarda o seu proxy). Ao apagar a instancia, o IP volta a parecer LIVRE e o
-- proximo numero criado o receberia na hora. A quarentena so pode viver aqui.
--
-- O codigo DEGRADA sem esta tabela (lookups devolvem vazio): aplicar e opcional
-- para o app subir, obrigatorio para a quarentena valer.
--
-- Pre-requisito: 001 (organizations). Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS proxy_ip_registry (
    organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    proxy_key        TEXT        NOT NULL,           -- host:porta:usuario (identidade do IP)
    host             TEXT        NOT NULL,
    port             TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'ativo',
    instance_name    TEXT,                            -- chip que esta (ou esteve) com o IP
    egress_ip        TEXT,                            -- IP publico de saida medido pelo proxy
    egress_country   TEXT,
    assigned_at      TIMESTAMPTZ,
    quarantine_until TIMESTAMPTZ,
    retired_reason   TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, proxy_key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proxy_ip_registry_status_chk'
  ) THEN
    ALTER TABLE proxy_ip_registry
      ADD CONSTRAINT proxy_ip_registry_status_chk
      CHECK (status IN ('ativo', 'livre', 'quarentena'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proxy_ip_registry_status
    ON proxy_ip_registry (organization_id, status);

-- Um IP de saida so pode estar ATIVO em um chip: detecta dois chips saindo
-- pelo mesmo endereco publico mesmo que os proxies tenham hosts diferentes.
CREATE INDEX IF NOT EXISTS idx_proxy_ip_registry_egress
    ON proxy_ip_registry (organization_id, egress_ip)
    WHERE egress_ip IS NOT NULL;

ALTER TABLE proxy_ip_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='proxy_ip_registry' AND policyname='proxy_ip_registry_same_org') THEN
    CREATE POLICY proxy_ip_registry_same_org ON proxy_ip_registry FOR ALL
      USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND is_active = TRUE))
      WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND is_active = TRUE));
  END IF;
END $$;

-- =====================================================================
-- FIM 019_proxy_ip_registry.sql
-- =====================================================================
