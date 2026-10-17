-- ============================================================================
-- Migration 62 (M6): receipts_notas.sql
-- Keterangan:
-- 1. Membuat tabel public.receipts (Kwitansi pembayaran order)
-- 2. Membuat tabel public.notas (Nota pesanan lunas)
-- 3. Mengaktifkan RLS (select-only untuk authenticated, no direct write)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabel receipts
-- ----------------------------------------------------------------------------
create table if not exists public.receipts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  receipt_no      varchar not null,
  receipt_date    date not null,
  order_id        uuid not null references public.orders(id) on delete cascade,
  payment_id      uuid not null unique references public.order_payments(id) on delete cascade,
  order_code      varchar not null,
  customer_name   varchar not null,
  amount          numeric not null,
  payment_type    varchar not null,
  payment_method  varchar,
  description     text,
  created_at      timestamptz not null default now(),
  constraint receipts_amount_check check (amount > 0),
  constraint receipts_payment_type_check check (payment_type in ('dp', 'pelunasan')),
  constraint receipts_user_no_key unique (user_id, receipt_no)
);

create index if not exists idx_receipts_user_order on public.receipts(user_id, order_id);
create index if not exists idx_receipts_payment on public.receipts(payment_id);

-- ----------------------------------------------------------------------------
-- 2. Tabel notas
-- ----------------------------------------------------------------------------
create table if not exists public.notas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nota_no       varchar not null,
  nota_date     date not null default current_date,
  order_id      uuid not null unique references public.orders(id) on delete cascade,
  order_code    varchar not null,
  customer_name varchar not null,
  grand_total   numeric not null,
  paid_amount   numeric not null,
  snapshot      jsonb not null,
  notes         text,
  created_at    timestamptz not null default now(),
  constraint notas_amounts_check check (grand_total >= 0 and paid_amount >= 0),
  constraint notas_user_no_key unique (user_id, nota_no)
);

create index if not exists idx_notas_user_order on public.notas(user_id, order_id);

-- ----------------------------------------------------------------------------
-- 3. Keamanan RLS & Hak Akses (Select-Only untuk Authenticated)
-- ----------------------------------------------------------------------------
alter table public.receipts enable row level security;
alter table public.notas enable row level security;

drop policy if exists "Users can view their own receipts" on public.receipts;
create policy "Users can view their own receipts"
  on public.receipts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own notas" on public.notas;
create policy "Users can view their own notas"
  on public.notas for select
  using (auth.uid() = user_id);

-- Batasi hak akses role
grant select on public.receipts to authenticated;
revoke insert, update, delete on public.receipts from authenticated;

grant select on public.notas to authenticated;
revoke insert, update, delete on public.notas from authenticated;

revoke all on public.receipts from anon, public;
revoke all on public.notas from anon, public;

grant all on public.receipts to service_role;
grant all on public.notas to service_role;
