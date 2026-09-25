-- =====================================================================
-- 020_pesquisa_espera_saudacao.sql
-- Espera de 30s entre a 1a resposta do eleitor e a Msg 2/3.
--
-- O eleitor costuma responder a saudacao em pedacos ("oi" ... "tudo bem").
-- Antes, o "oi" disparava a Msg 2/3 na hora e o "tudo bem" caia na etapa do
-- 1o voto, recebendo "nao consegui identificar". Agora:
--   saudacao_respondida_em -> 1a resposta (marcada de forma atomica: so a
--                             primeira mensagem vence, mesmo com webhooks
--                             concorrentes); abre a janela de 30s em que as
--                             mensagens seguintes sao ignoradas.
--   msg3_enviada_em        -> Msg 2/3 enviada (reivindicada de forma atomica:
--                             so um processo envia). Nulo com a janela vencida
--                             ha mais de 2 min = envio perdido, o tick reenvia.
-- Linhas antigas ficam com as duas colunas nulas e nao entram na regra.
-- Idempotente.
-- =====================================================================
ALTER TABLE pesquisa_senado
    ADD COLUMN IF NOT EXISTS saudacao_respondida_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS msg3_enviada_em        TIMESTAMPTZ;
