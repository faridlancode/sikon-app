-- =========================================================================
-- SIKon — Katalog Fase 1a: Galeri Foto Produk & Kontrol Publikasi
-- =========================================================================
-- Tambahkan:
--   1. Tabel `product_images`  — galeri multi-foto per produk
--   2. Kolom `products.is_published`, `is_featured`, `sort_order`, `updated_at`
--   3. Trigger `updated_at` otomatis pada tabel products
--   4. Backfill: produk aktif eksisting langsung is_published = true
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Tabel galeri foto produk
-- -------------------------------------------------------------------------
create table if not exists public.product_images (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  product_id  uuid        not null references public.products(id) on delete cascade,
  image_url   text        not null,
  is_primary  boolean     not null default false,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now()
);

-- Hanya boleh ada 1 foto utama (is_primary = true) per produk
create unique index if not exists uq_product_images_primary_per_product
  on public.product_images(product_id)
  where is_primary = true;

create index if not exists idx_product_images_product_sort
  on public.product_images(product_id, sort_order, created_at);

alter table public.product_images enable row level security;

create policy "product_images_owner_manage"
  on public.product_images for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -------------------------------------------------------------------------
-- 2. Kolom kontrol kurasi & publikasi produk
-- -------------------------------------------------------------------------
alter table public.products
  add column if not exists is_published boolean     not null default false,
  add column if not exists is_featured  boolean     not null default false,
  add column if not exists sort_order   integer     not null default 0,
  add column if not exists updated_at   timestamptz not null default now();

-- -------------------------------------------------------------------------
-- 3. Trigger updated_at otomatis pada tabel products
-- -------------------------------------------------------------------------
create or replace function public.trg_touch_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.trg_touch_products_updated_at();

-- -------------------------------------------------------------------------
-- 4. Backfill: produk aktif yang sudah ada langsung tampil di katalog dev
-- -------------------------------------------------------------------------
update public.products
   set is_published = true
 where is_active = true and is_published = false;
