-- =========================================================================
-- SIKon — Clean Baseline 1/5: Master Data Product & Material
-- =========================================================================
-- Tidak bergantung ke tabel lain selain auth.users. Sengaja diletakkan
-- paling awal supaya file berikutnya (orders, dll) bisa langsung FK ke sini
-- tanpa perlu ALTER TABLE belakangan.

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name varchar not null,
  created_at timestamptz not null default now(),
  constraint product_categories_user_id_name_key unique (user_id, name)
);
alter table public.product_categories enable row level security;
create policy "Manage own product categories" on public.product_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.material_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name varchar not null,
  is_fabric boolean not null default false,
  created_at timestamptz default now(),
  constraint material_categories_user_id_name_key unique (user_id, name)
);
alter table public.material_categories enable row level security;
create policy "Manage own material categories" on public.material_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  category_id uuid references public.material_categories(id) on delete set null,
  name varchar not null,
  unit varchar not null,
  price numeric not null default 0,
  stock_qty numeric not null default 0,
  minimum_stock numeric not null default 0,
  composition text,
  care_instruction text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  constraint materials_price_check check (price >= 0),
  constraint materials_stock_qty_check check (stock_qty >= 0),
  constraint materials_minimum_stock_check check (minimum_stock >= 0)
);
alter table public.materials enable row level security;
create policy "Manage own materials" on public.materials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_materials_category on public.materials(category_id);

create table public.material_colors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  material_id uuid not null references public.materials(id) on delete cascade,
  color_name varchar not null,
  color_code varchar,
  stock_qty numeric not null default 0,
  minimum_stock numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  constraint material_colors_stock_qty_check check (stock_qty >= 0),
  constraint material_colors_minimum_stock_check check (minimum_stock >= 0)
);
alter table public.material_colors enable row level security;
create policy "Manage own material colors" on public.material_colors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_material_colors_material on public.material_colors(material_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  category_id uuid references public.product_categories(id) on delete set null,
  name varchar not null,
  description text,
  sewing_cost_per_pcs numeric not null default 0,
  cutting_cost_per_pcs numeric not null default 0,
  default_price numeric not null default 0,
  sales_bonus_per_pcs numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  constraint products_sewing_cost_check check (sewing_cost_per_pcs >= 0),
  constraint products_cutting_cost_check check (cutting_cost_per_pcs >= 0),
  constraint products_default_price_check check (default_price >= 0),
  constraint products_sales_bonus_per_pcs_check check (sales_bonus_per_pcs >= 0)
);
alter table public.products enable row level security;
create policy "Manage own products" on public.products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_products_category on public.products(category_id);

create table public.product_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  product_id uuid not null references public.products(id) on delete cascade,
  material_id uuid not null references public.materials(id),
  quantity numeric not null,
  created_at timestamptz default now(),
  constraint product_materials_quantity_check check (quantity > 0)
);
alter table public.product_materials enable row level security;
create policy "Manage own product materials" on public.product_materials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_product_materials_product on public.product_materials(product_id);
create index idx_product_materials_material on public.product_materials(material_id);

create table public.product_fabric_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  product_id uuid not null references public.products(id) on delete cascade,
  fabric_category_id uuid references public.material_categories(id),
  label varchar not null default 'Kain Utama',
  usage_qty numeric not null,
  unit varchar not null default 'meter',
  created_at timestamptz default now(),
  constraint product_fabric_slots_usage_qty_check check (usage_qty > 0)
);
alter table public.product_fabric_slots enable row level security;
create policy "Manage own product fabric slots" on public.product_fabric_slots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_product_fabric_slots_product on public.product_fabric_slots(product_id);
