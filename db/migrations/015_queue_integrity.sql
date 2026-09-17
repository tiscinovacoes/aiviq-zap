-- =====================================================================
-- 015_queue_integrity.sql
-- 1) Impede FISICAMENTE que o mesmo contato esteja na fila duas vezes ao
--    mesmo tempo -- que e o unico jeito de dois chips diferentes mandarem a
--    mesma pesquisa para a mesma pessoa.
--
--    O dedup de enqueueContacts() e no aplicativo e portanto sujeito a corrida:
--    duas importacoes simultaneas (ou duas abas) leem a fila antes de qualquer
--    uma inserir, as duas passam no teste, e o contato entra duplicado. Como o
--    claim distribui 1 linha por chip, as duas linhas do MESMO telefone vao
--    para chips diferentes e a pessoa recebe a abordagem duas vezes.
--
--    O indice e PARCIAL (so linhas ativas): assim uma campanha futura pode
--    reabordar quem ja foi concluido, sem travar.
--
-- 2) Falha passa a registrar em qual chip ela ocorreu (a coluna ja existe; o
--    codigo so a preenchia no sucesso).
--
-- Pre-requisito: 011, 012. Idempotente.
-- =====================================================================

-- Limpa duplicatas ativas pre-existentes, mantendo a linha mais antiga.
DELETE FROM dispatch_queue d
 WHERE d.status IN ('pendente', 'processando')
   AND EXISTS (
        SELECT 1 FROM dispatch_queue k
         WHERE k.organization_id = d.organization_id
           AND k.phone           = d.phone
           AND k.status IN ('pendente', 'processando')
           AND (k.created_at < d.created_at
                OR (k.created_at = d.created_at AND k.id < d.id))
   );

CREATE UNIQUE INDEX IF NOT EXISTS uq_dispatch_queue_ativo_por_telefone
    ON dispatch_queue (organization_id, phone)
    WHERE status IN ('pendente', 'processando');

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_instance
    ON dispatch_queue (organization_id, instance_name, status);

-- =====================================================================
-- FIM 015_queue_integrity.sql
-- =====================================================================
