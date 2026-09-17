-- =====================================================================
-- 009_conversation_channel_dispatch.sql
--
-- Objetivo 1 (persistência): unificar a IDENTIDADE de conversa no JID/telefone
--   canônico do WhatsApp. Até aqui o Inbox/bot usavam o JID como id enquanto o
--   Supabase usava UUID — os dois nunca se reconciliavam, então mensagens do bot
--   e do atendente não gravavam e as respostas ficavam invisíveis. Agora o JID
--   canônico (55 + DDD + 8 finais) vive em `conversations.channel_id`, com índice
--   único por organização, e todas as rotas resolvem a conversa por ele.
--
-- Objetivo 2 (anti-ban): tabela de contadores de disparo por instância/dia para
--   impor teto diário + warmup + janela de horário (padrão conservador), evitando
--   novo bloqueio do chip.
--
-- Pré-requisitos: 001 (conversations, messages), 006 (inboxes.evolution_instance_name).
-- Re-executável (idempotente).
-- =====================================================================

-- ----------------------------------------------------------------------
-- 1. IDENTIDADE CANÔNICA DA CONVERSA (channel_id = JID canônico)
--    channel_id já existe em `conversations` (001). Aqui garantimos unicidade
--    por organização para permitir upsert atômico e lookup O(1) por JID.
-- ----------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_org_channel
    ON conversations (organization_id, channel_id)
    WHERE channel_id IS NOT NULL;

-- Idempotência de ingestão: nunca gravar a mesma mensagem do WhatsApp duas vezes
-- (o webhook pode reentregar). external_message_id é o id do WhatsApp/Evolution.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_org_external
    ON messages (organization_id, external_message_id)
    WHERE external_message_id IS NOT NULL;

-- ----------------------------------------------------------------------
-- 2. CONTADORES DE DISPARO (anti-ban): 1 linha por (org, instância, dia).
--    first_dispatch_at ancora o warmup (dias desde o 1º disparo daquele chip).
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispatch_counters (
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    instance_name     TEXT NOT NULL,
    day               DATE NOT NULL,
    sent_count        INTEGER NOT NULL DEFAULT 0,
    last_sent_at      TIMESTAMPTZ,
    first_dispatch_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, instance_name, day)
);

-- ----------------------------------------------------------------------
-- 3. REALTIME: publica messages/conversations para assinatura ao vivo no Inbox
--    (Supabase Realtime). Guardado contra "já publicado".
-- ----------------------------------------------------------------------
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
  END;
END $$;

-- ----------------------------------------------------------------------
-- 4. RLS para dispatch_counters (mesma org). Escrita real é via service-role.
-- ----------------------------------------------------------------------
ALTER TABLE dispatch_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dispatch_counters' AND policyname = 'dispatch_counters_same_org'
  ) THEN
    CREATE POLICY dispatch_counters_same_org ON dispatch_counters
      FOR ALL
      USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND is_active = TRUE
      ))
      WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND is_active = TRUE
      ));
  END IF;
END $$;

-- =====================================================================
-- FIM 009_conversation_channel_dispatch.sql
-- =====================================================================
