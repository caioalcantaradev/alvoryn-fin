-- AlvorynFIN: status de pagamento para os lançamentos existentes.
-- Lançamentos antigos são considerados pagos para preservar o histórico; novos gastos
-- são criados como pendentes pela aplicação.
alter table public.transactions
  add column if not exists status text not null default 'paid';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_status_check'
  ) then
    alter table public.transactions
      add constraint transactions_status_check check (status in ('paid', 'pending'));
  end if;
end $$;
