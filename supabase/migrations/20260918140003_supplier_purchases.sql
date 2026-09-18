-- =========================================================
-- Migration: supplier_purchases
-- Version: 20260918140003
-- =========================================================

-- 1. Tabel supplier_purchases (pembelian ke supplier tetap lunas di awal)
create table if not exists public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  requested_by uuid references public.staff(id),
  supplier_name varchar not null,
  payment_date date not null default current_date,
  received_date timestamptz,
  status varchar not null default 'ordered',
  total_amount numeric not null default 0,
  notes text,
  created_at timestamptz default now(),
  constraint supplier_purchases_status_check check (status in ('ordered','received'))
);

alter table public.supplier_purchases enable row level security;

drop policy if exists "Manage own supplier purchases" on public.supplier_purchases;
create policy "Manage own supplier purchases" on public.supplier_purchases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_supplier_purchases_status on public.supplier_purchases(status);
create index if not exists idx_supplier_purchases_staff on public.supplier_purchases(requested_by);

-- 2. Tabel supplier_purchase_items (item-item pembelian supplier)
create table if not exists public.supplier_purchase_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  purchase_id uuid not null references public.supplier_purchases(id) on delete cascade,
  stock_request_id uuid references public.stock_requests(id),
  material_id uuid not null references public.materials(id),
  material_color_id uuid references public.material_colors(id),
  category_id uuid references public.categories(id),
  quantity numeric not null,
  unit varchar not null,
  unit_price numeric not null,
  total_price numeric not null,
  created_at timestamptz default now(),
  constraint supplier_purchase_items_quantity_check check (quantity > 0),
  constraint supplier_purchase_items_price_check check (unit_price >= 0)
);

alter table public.supplier_purchase_items enable row level security;

drop policy if exists "Manage own supplier purchase items" on public.supplier_purchase_items;
create policy "Manage own supplier purchase items" on public.supplier_purchase_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_supplier_purchase_items_purchase on public.supplier_purchase_items(purchase_id);

-- 3. Circular FK: Tambahkan supplier_purchase_id ke stock_requests
alter table public.stock_requests
  add column if not exists supplier_purchase_id uuid references public.supplier_purchases(id);
