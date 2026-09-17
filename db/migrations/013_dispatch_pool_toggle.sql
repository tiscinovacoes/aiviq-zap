-- =====================================================================
-- 013_dispatch_pool_toggle.sql
-- Selecao MULTIPLA de chips no cluster de disparo.
--
-- O "ATIVO" da tela de Configuracoes e um radio de VISUALIZACAO (qual numero
-- o Inbox/Contatos exibem): vive no localStorage do navegador e nunca chegou
-- ao motor de disparo. Este flag e o oposto -- e por organizacao, fica no
-- servidor (o cron precisa enxerga-lo) e aceita varios chips ao mesmo tempo.
--
-- Default true: um chip recem-conectado ja entra no cluster, preservando o
-- comportamento anterior (todo chip conectado disparava).
--
-- Pre-requisito: 012 (dispatch_instance_control). Idempotente.
-- =====================================================================

ALTER TABLE dispatch_instance_control
    ADD COLUMN IF NOT EXISTS dispatch_enabled BOOLEAN NOT NULL DEFAULT true;

-- =====================================================================
-- FIM 013_dispatch_pool_toggle.sql
-- =====================================================================
