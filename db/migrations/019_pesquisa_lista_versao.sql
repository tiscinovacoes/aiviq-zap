-- =====================================================================
-- 019_pesquisa_lista_versao.sql
-- Versao da lista de candidatos que o eleitor RECEBEU.
--
-- Em 23/09/2026 a lista caiu de 12 para 7 opcoes (5 candidatos + branco/nulo
-- + nao sabe), com numeracao nova. Quem recebeu a lista antiga e ainda nao
-- respondeu digita o numero ANTIGO -- "10" era Vander Loubet, e na lista nova
-- nem existe. Esta coluna diz qual numeracao usar para ler a resposta.
--   1 = lista antiga (12 opcoes, numero = id)   <- default: tudo que ja existe
--   2 = lista de 5 candidatos em ordem alfabetica
-- Idempotente.
-- =====================================================================
ALTER TABLE pesquisa_senado
    ADD COLUMN IF NOT EXISTS lista_versao INTEGER NOT NULL DEFAULT 1;
