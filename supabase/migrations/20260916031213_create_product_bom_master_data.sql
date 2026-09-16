-- Migration: create_product_bom_master_data
-- Version: 20260916031213
--
-- Tahap 1 dari fitur Product / COGS / BOM. Membuat seluruh master data:
-- kategori product, kategori material, material (termasuk field khusus
-- kain), warna material, product itu sendiri (resep/BOM), BOM item fix
-- (aksesoris), dan slot kebutuhan kain (belum terikat kain spesifik).
--
-- Urutan pilih nanti di form Order: Kategori Product -> Product (model) ->
-- Kain (material) -> Warna.

-- -- 1. product_categories (Kemeja, Rompi, dll) -----------------------------
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name varchar not null,
  created_at timestamptz default now(),
  constraint product_categories_user_id_name_key unique (user_id, name)
);
alter table public.product_categories enable row level security;
drop policy if exists "Manage own product categories" on public.product_categories;
create policy "Manage own product categories" on public.product_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -- 2. material_categories (Kain, Kancing, Resleting, dll) -----------------
-- is_fabric menentukan apakah field khusus kain (komposisi, perawatan, dst)
-- wajib ditampilkan di form Material.
create table if not exists public.material_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name varchar not null,
  is_fabric boolean not null default false,
  created_at timestamptz default now(),
  constraint material_categories_user_id_name_key unique (user_id, name)
);
alter table public.material_categories enable row level security;
drop policy if exists "Manage own material categories" on public.material_categories;
create policy "Manage own material categories" on public.material_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -- 3. materials (bahan baku: kain, aksesoris, dll) -------------------------
-- composition/care_instruction/description cuma keisi kalau category.is_fabric = true
-- (divalidasi di aplikasi, bukan di DB, supaya fleksibel).
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  category_id uuid references public.material_categories(id) on delete set null,
  name varchar not null,
  unit varchar not null,
  price numeric not null default 0,
  composition text,
  care_instruction text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  constraint materials_price_check check (price >= 0)
);
alter table public.materials enable row level security;
drop policy if exists "Manage own materials" on public.materials;
create policy "Manage own materials" on public.materials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_materials_category on public.materials(category_id);

-- -- 4. material_colors (warna per kain, harga sama semua warna) ------------
create table if not exists public.material_colors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  material_id uuid not null references public.materials(id) on delete cascade,
  color_name varchar not null,
  color_code varchar,
  is_active boolean not null default true,
  created_at timestamptz default now()
);
alter table public.material_colors enable row level security;
drop policy if exists "Manage own material colors" on public.material_colors;
create policy "Manage own material colors" on public.material_colors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_material_colors_material on public.material_colors(material_id);

-- -- 5. products (resep/BOM, bukan barang fisik) -----------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  category_id uuid references public.product_categories(id) on delete set null,
  name varchar not null,
  description text,
  sewing_cost_per_pcs numeric not null default 0,
  cutting_cost_per_pcs numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  constraint products_sewing_cost_check check (sewing_cost_per_pcs >= 0),
  constraint products_cutting_cost_check check (cutting_cost_per_pcs >= 0)
);
alter table public.products enable row level security;
drop policy if exists "Manage own products" on public.products;
create policy "Manage own products" on public.products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_products_category on public.products(category_id);

-- -- 6. product_materials (BOM item fix: kancing, resleting, dll) -----------
create table if not exists public.product_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  product_id uuid not null references public.products(id) on delete cascade,
  material_id uuid not null references public.materials(id),
  quantity numeric not null,
  created_at timestamptz default now(),
  constraint product_materials_quantity_check check (quantity > 0)
);
alter table public.product_materials enable row level security;
drop policy if exists "Manage own product materials" on public.product_materials;
create policy "Manage own product materials" on public.product_materials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_product_materials_product on public.product_materials(product_id);
create index if not exists idx_product_materials_material on public.product_materials(material_id);

-- -- 7. product_fabric_slots (kebutuhan kain, belum terikat kain spesifik) --
-- Satu product bisa punya lebih dari 1 slot (kain utama, furing, dll).
-- fabric_category_id memfilter pilihan material kain apa saja yang valid
-- untuk slot ini (misal harus dari kategori "Kain").
create table if not exists public.product_fabric_slots (
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
drop policy if exists "Manage own product fabric slots" on public.product_fabric_slots;
create policy "Manage own product fabric slots" on public.product_fabric_slots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_product_fabric_slots_product on public.product_fabric_slots(product_id);
