-- =====================================================================
-- 021_dispatch_definitivo.sql
-- Status 'definitivo' para contatos que falharam para sempre.
--
-- O fluxo de tentativas: pendente -> processando -> enviado (sucesso) ou
-- erro (falha, tentativas < 3) -> erro (falha, tentativas = 3). Quando chega
-- a 3 falhas, o contato passa para 'definitivo' e nunca é enfileirado de novo,
-- mesmo que o operador clique em "Reenviar".
-- Notificação: traz a falha a cada tentativa (1, 2, 3), mas só a 3ª já marca
-- como 'definitivo'.
-- Idempotente.
-- =====================================================================
ALTER TABLE dispatch_queue
    ADD COLUMN IF NOT EXISTS status_definitivo BOOLEAN DEFAULT FALSE;

-- Índice: achar pendentes para o tick, sem os definitivos.
CREATE INDEX IF NOT EXISTS dispatch_queue_por_disparo
    ON dispatch_queue (organization_id, status, status_definitivo)
    WHERE status = 'pendente' AND status_definitivo = FALSE;
