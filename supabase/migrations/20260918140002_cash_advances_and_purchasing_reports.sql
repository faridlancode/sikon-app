-- =========================================================
-- Migration: cash_advances_and_purchasing_reports
-- Version: 20260918140002
-- =========================================================

-- 1. Tabel cash_advances (uang muka / kasbon purchasing)
create table if not exists public.cash_advances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  staff_id uuid not null references public.staff(id),
  amount numeric not null,
  purpose text,
  date_given date not null default current_date,
  status varchar not null default 'outstanding',
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz default now(),
  constraint cash_advances_amount_check check (amount > 0),
  constraint cash_advances_status_check check (status in ('outstanding','settled'))
);

alter table public.cash_advances enable row level security;

drop policy if exists "Manage own cash advances" on public.cash_advances;
create policy "Manage own cash advances" on public.cash_advances
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_cash_advances_staff on public.cash_advances(staff_id);
create index if not exists idx_cash_advances_status on public.cash_advances(status);

-- 2. Tabel purchasing_reports (laporan SPJ belanja)
create table if not exists public.purchasing_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  staff_id uuid not null references public.staff(id),
  cash_advance_id uuid references public.cash_advances(id),
  report_date date not null default current_date,
  status varchar not null default 'draft',
  total_amount numeric not null default 0,
  notes text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz default now(),
  constraint purchasing_reports_status_check check (status in ('draft','submitted','approved','rejected'))
);

alter table public.purchasing_reports enable row level security;

drop policy if exists "Manage own purchasing reports" on public.purchasing_reports;
create policy "Manage own purchasing reports" on public.purchasing_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_purchasing_reports_staff on public.purchasing_reports(staff_id);
create index if not exists idx_purchasing_reports_status on public.purchasing_reports(status);

-- 3. Tabel purchasing_report_items (item-item belanja nota SPJ)
create table if not exists public.purchasing_report_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  report_id uuid not null references public.purchasing_reports(id) on delete cascade,
  stock_request_id uuid references public.stock_requests(id),
  material_id uuid references public.materials(id),
  material_color_id uuid references public.material_colors(id),
  category_id uuid references public.categories(id),
  description text,
  supplier_name varchar,
  quantity numeric not null,
  unit varchar not null,
  unit_price numeric not null,
  total_price numeric not null,
  receipt_photo_url text,
  created_at timestamptz default now(),
  constraint purchasing_report_items_quantity_check check (quantity > 0),
  constraint purchasing_report_items_price_check check (unit_price >= 0)
);

alter table public.purchasing_report_items enable row level security;

drop policy if exists "Manage own purchasing report items" on public.purchasing_report_items;
create policy "Manage own purchasing report items" on public.purchasing_report_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_purchasing_report_items_report on public.purchasing_report_items(report_id);

-- 4. Circular FK: Tambahkan purchasing_report_id ke stock_requests
alter table public.stock_requests
  add column if not exists purchasing_report_id uuid references public.purchasing_reports(id);
