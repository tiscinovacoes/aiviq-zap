-- =====================================================================
-- 024_dispatch_lotes.sql
-- Ate aqui, "fila de disparo" era uma coisa so: TODOS os contatos pendentes
-- de TODAS as importacoes misturados na mesma dispatch_queue, sem nenhuma
-- marca de qual planilha cada um veio. O botao "Parar" (clearPending)
-- cancelava TUDO que estava pendente, mesmo leads de uma lista importada
-- depois que nao tinha nada a ver com a que o operador queria cancelar.
--
-- Fix: cada importacao (ou disparo individual) passa a criar um "lote" --
-- uma fila propria, rastreavel e cancelavel sem afetar as outras. Cancelar
-- um lote so mexe nos contatos DAQUELE lote; os demais continuam sendo
-- trabalhados normalmente.
-- =====================================================================

create table if not exists public.dispatch_lotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  nome text,
  total_contatos integer not null default 0,
  status text not null default 'ativo' check (status in ('ativo', 'cancelado', 'concluido')),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create index if not exists idx_dispatch_lotes_org_status
  on public.dispatch_lotes (organization_id, status);

alter table public.dispatch_queue
  add column if not exists lote_id uuid references public.dispatch_lotes(id);

create index if not exists idx_dispatch_queue_lote_id
  on public.dispatch_queue (lote_id);

comment on table public.dispatch_lotes is
  'Cada importacao de planilha (ou disparo individual, quando aplicavel) vira um lote proprio, cancelavel isoladamente sem afetar outras filas em andamento.';
comment on column public.dispatch_queue.lote_id is
  'Lote (fila) a que este contato pertence. NULL = contato antigo, de antes desta coluna existir.';

-- RLS multi-tenant, no mesmo padrao de dispatch_queue/dispatch_instance_control.
alter table public.dispatch_lotes enable row level security;
revoke all on public.dispatch_lotes from anon;
grant select, insert, update, delete on public.dispatch_lotes to authenticated;

drop policy if exists dispatch_lotes_same_org on public.dispatch_lotes;
create policy dispatch_lotes_same_org on public.dispatch_lotes
  for all to authenticated
  using (organization_id in (
    select organization_members.organization_id from organization_members
    where organization_members.user_id = auth.uid() and organization_members.is_active = true
  ))
  with check (organization_id in (
    select organization_members.organization_id from organization_members
    where organization_members.user_id = auth.uid() and organization_members.is_active = true
  ));
