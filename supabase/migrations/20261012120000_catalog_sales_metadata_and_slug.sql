-- =========================================================================
-- SIKon — Katalog Fase 1c: Pengayaan Metadata Sales & Slug Unik
-- =========================================================================
-- Tambahkan kolom pada tabel `sales`:
--   photo_url, tagline, display_order, show_in_catalog,
--   slug (unik case-insensitive), open_time, close_time
-- =========================================================================

alter table public.sales
  add column if not exists photo_url       text          null,
  add column if not exists tagline         text          null,
  add column if not exists display_order   integer       not null default 0,
  add column if not exists show_in_catalog boolean       not null default true,
  add column if not exists slug            varchar(50)   null,
  add column if not exists open_time       time          null,
  add column if not exists close_time      time          null;

-- Slug unik: case-insensitive, hanya berlaku bila slug tidak null/kosong
create unique index if not exists uq_sales_slug
  on public.sales(lower(trim(slug)))
  where slug is not null and trim(slug) <> '';
