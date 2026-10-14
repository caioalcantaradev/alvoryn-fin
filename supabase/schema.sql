-- Sistema Financeiro — execute no SQL Editor do projeto Supabase.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  type text not null check (type in ('income', 'expense')),
  color text not null default '#8b78ff',
  created_at timestamptz not null default now(),
  unique (user_id, name, type),
  unique (id, user_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  type text not null check (type in ('income', 'expense')),
  description text not null check (char_length(trim(description)) between 1 and 120),
  amount numeric(12,2) not null check (amount > 0),
  date date not null default current_date,
  created_at timestamptz not null default now(),
  constraint transactions_category_owner_fkey
    foreign key (category_id, user_id)
    references public.categories(id, user_id)
    on delete set null (category_id)
);

create index if not exists categories_user_type_idx on public.categories(user_id, type);
create index if not exists transactions_user_date_idx on public.transactions(user_id, date desc);
create index if not exists transactions_user_category_idx on public.transactions(user_id, category_id);
create index if not exists transactions_category_owner_idx on public.transactions(category_id, user_id);

alter table public.categories enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "Users manage their own categories" on public.categories;
create policy "Users manage their own categories" on public.categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own transactions" on public.transactions;
create policy "Users manage their own transactions" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;

-- A função fica fora do schema exposto e não pode ser chamada pela Data API.
create or replace function private.seed_finance_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name, type, color) values
    (new.id, 'Salário', 'income', '#9be564'),
    (new.id, 'Freelance', 'income', '#7dcebb'),
    (new.id, 'Vendas', 'income', '#83a8ff'),
    (new.id, 'Investimentos', 'income', '#c3a6ff'),
    (new.id, 'Outros', 'income', '#a7a7b4'),
    (new.id, 'Alimentação', 'expense', '#ff9b8f'),
    (new.id, 'Transporte', 'expense', '#ffc878'),
    (new.id, 'Moradia', 'expense', '#a8a0ff'),
    (new.id, 'Lazer', 'expense', '#f39ac7'),
    (new.id, 'Saúde', 'expense', '#79d8d0'),
    (new.id, 'Assinaturas', 'expense', '#9eb6ff'),
    (new.id, 'Outros', 'expense', '#a7a7b4')
  on conflict (user_id, name, type) do nothing;
  return new;
end;
$$;
revoke all on function private.seed_finance_categories() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_seed_categories on auth.users;
create trigger on_auth_user_created_seed_categories
after insert on auth.users
for each row execute function private.seed_finance_categories();
