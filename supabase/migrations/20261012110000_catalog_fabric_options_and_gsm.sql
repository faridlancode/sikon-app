-- =========================================================================
-- SIKon — Katalog Fase 1b: Opsi Kain, Penyesuaian Harga, & GSM Material
-- =========================================================================
-- Tambahkan:
--   1. Kolom `materials.weight_gsm` & `catalog_description`
--   2. Tabel `product_fabric_options` — opsi kain per produk dengan
--      penyesuaian harga, default kain, dan flag is_offered
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Atribut publik material (GSM & deskripsi katalog)
-- -------------------------------------------------------------------------
alter table public.materials
  add column if not exists weight_gsm          integer null,
  add column if not exists catalog_description text    null;

-- -------------------------------------------------------------------------
-- 2. Tabel opsi kain produk
-- -------------------------------------------------------------------------
create table if not exists public.product_fabric_options (
  id               uuid         primary key default gen_random_uuid(),
  user_id          uuid         not null references auth.users(id) on delete cascade,
  product_id       uuid         not null references public.products(id) on delete cascade,
  material_id      uuid         not null references public.materials(id) on delete cascade,
  price_adjustment numeric(12,2) not null default 0,
  is_offered       boolean      not null default true,
  is_default       boolean      not null default false,
  sort_order       integer      not null default 0,
  created_at       timestamptz  not null default now(),
  constraint uq_product_fabric_option unique (product_id, material_id)
);

-- Hanya satu kain default per produk
create unique index if not exists uq_product_fabric_default
  on public.product_fabric_options(product_id)
  where is_default = true;

create index if not exists idx_product_fabric_options_product
  on public.product_fabric_options(product_id, is_offered, sort_order);

alter table public.product_fabric_options enable row level security;

create policy "product_fabric_options_owner_manage"
  on public.product_fabric_options for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
