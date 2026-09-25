-- =====================================================================
-- 023_pesquisa_instance_name.sql
-- BUG: `pesquisa_senado` nunca teve a coluna `instance_name` -- o codigo
-- (dispatcher, painel Kanban) sempre tentou gravar/ler qual chip abordou
-- cada eleitor, mas como a coluna nao existia o INSERT/UPDATE caia no
-- fallback "salva sem ela" (savePesquisaSession) e a leitura sempre voltava
-- undefined. Resultado: o badge "chip que abordou" no painel nunca
-- aparecia para NENHUM lead, silenciosamente, desde que a feature foi
-- escrita.
--
-- Fix: cria a coluna. Sessoes antigas ficam com instance_name NULL (nao da
-- para recuperar retroativamente qual chip disparou pra elas); sessoes
-- novas passam a gravar normalmente, pois o dispatcher ja seta
-- `instanceName` na sessao -- so faltava onde persistir.
-- =====================================================================

alter table public.pesquisa_senado
  add column if not exists instance_name text;

comment on column public.pesquisa_senado.instance_name is
  'Nome do chip/instancia Evolution que disparou a Msg 1 para este eleitor.';
