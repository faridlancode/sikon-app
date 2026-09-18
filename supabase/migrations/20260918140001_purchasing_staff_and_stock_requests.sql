-- =========================================================
-- Migration: purchasing_staff_and_stock_requests
-- Version: 20260918140001
-- =========================================================

-- 1. Tabel staff
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name varchar not null,
  phone varchar,
  role varchar,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

alter table public.staff enable row level security;

drop policy if exists "Manage own staff" on public.staff;
create policy "Manage own staff" on public.staff
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Tabel stock_requests (titik awal pengajuan restock dari gudang)
create table if not exists public.stock_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  requested_by uuid references public.staff(id),
  material_id uuid not null references public.materials(id),
  material_color_id uuid references public.material_colors(id),
  quantity_needed numeric not null,
  unit varchar not null,
  reason text,
  status varchar not null default 'pending',
  fulfillment_type varchar,
  requested_date date not null default current_date,
  fulfilled_date timestamptz,
  created_at timestamptz default now(),
  constraint stock_requests_quantity_check check (quantity_needed > 0),
  constraint stock_requests_status_check check (status in ('pending','in_progress','fulfilled','cancelled')),
  constraint stock_requests_fulfillment_type_check check (fulfillment_type is null or fulfillment_type in ('spj','supplier_purchase'))
);

alter table public.stock_requests enable row level security;

drop policy if exists "Manage own stock requests" on public.stock_requests;
create policy "Manage own stock requests" on public.stock_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_stock_requests_status on public.stock_requests(status);
create index if not exists idx_stock_requests_material on public.stock_requests(material_id);
create index if not exists idx_stock_requests_staff on public.stock_requests(requested_by);
