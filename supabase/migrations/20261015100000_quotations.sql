-- =========================================================================
-- Migration: Quotations & Quotation Items Schema (Fase 1 - Dokumen Order: M2)
-- =========================================================================
-- Menambahkan:
-- 1. Tabel public.quotations (Surat Penawaran)
-- 2. Tabel public.quotation_items (Baris Item Penawaran, tanpa kolom HPP)
-- 3. RLS policy select-only dan revoke insert/update/delete dari authenticated
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. TABEL quotations
-- ---------------------------------------------------------------------------
create table if not exists public.quotations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  quotation_no     varchar not null,
  quotation_date   date not null default current_date,
  valid_until      date,
  customer_name    varchar not null,
  customer_company varchar,
  customer_address text,
  sales_id         uuid references public.sales(id) on delete set null,
  dp_percent       numeric,
  payment_terms    text,
  lead_time        text,
  bank_account_id  uuid references public.company_bank_accounts(id) on delete set null,
  notes            text,
  status           varchar not null default 'draft',
  order_id         uuid references public.orders(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quotations_status_check check (status in ('draft', 'sent', 'accepted', 'rejected')),
  constraint quotations_dp_percent_check check (dp_percent is null or (dp_percent >= 0 and dp_percent <= 100)),
  constraint quotations_user_no_key unique (user_id, quotation_no)
);

comment on table  public.quotations                  is 'Header Surat Penawaran Harga kepada calon pelanggan';
comment on column public.quotations.quotation_no     is 'Nomor surat penawaran unik per user: PNW-YYYYMM-NNNN';
comment on column public.quotations.quotation_date   is 'Tanggal penawaran dibuat';
comment on column public.quotations.valid_until      is 'Batas tanggal berlaku (default +14 hari)';
comment on column public.quotations.sales_id         is 'Salesperson penanggung jawab penawaran';
comment on column public.quotations.dp_percent       is 'Persentase uang muka yang disyaratkan (0 - 100)';
comment on column public.quotations.payment_terms    is 'Keterangan syarat pembayaran';
comment on column public.quotations.lead_time        is 'Estimasi waktu pengerjaan / penyelesaian';
comment on column public.quotations.bank_account_id  is 'Rekening bank tujuan pembayaran DP';
comment on column public.quotations.status           is 'Status dokumen: draft, sent, accepted, rejected (kedaluwarsa dihitung di tampilan)';
comment on column public.quotations.order_id         is 'Tautan ke orders jika penawaran sudah disetujui dan dibuatkan pesanan';

create index if not exists idx_quotations_user_date   on public.quotations(user_id, quotation_date);
create index if not exists idx_quotations_user_status on public.quotations(user_id, status);
create index if not exists idx_quotations_order       on public.quotations(order_id);
create index if not exists idx_quotations_sales       on public.quotations(sales_id);

alter table public.quotations enable row level security;

drop policy if exists "Select own quotations" on public.quotations;
create policy "Select own quotations" on public.quotations
  for select using (auth.uid() = user_id);

grant select on table public.quotations to authenticated;
revoke insert, update, delete on table public.quotations from authenticated;
grant all on table public.quotations to service_role;

-- ---------------------------------------------------------------------------
-- 2. TABEL quotation_items
-- ---------------------------------------------------------------------------
create table if not exists public.quotation_items (
  id               uuid primary key default gen_random_uuid(),
  quotation_id     uuid not null references public.quotations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  sort_order       int not null default 0,
  product_name     varchar not null,
  fabric_type      text,
  fabric_color     text,
  sewing_notes     text,
  embroidery_notes text,
  print_notes      text,
  size_breakdown   jsonb,
  -- Catatan: Tidak ada kolom HPP (Keputusan Pemilik #1)
  qty              numeric not null default 0,
  unit             varchar not null default 'pcs',
  unit_price       numeric not null default 0,
  subtotal         numeric generated always as (qty * unit_price) stored,
  item_notes       text,

  constraint quotation_items_qty_check check (qty >= 0),
  constraint quotation_items_price_check check (unit_price >= 0)
);

comment on table  public.quotation_items              is 'Baris rincian item dalam Surat Penawaran';
comment on column public.quotation_items.product_name is 'Nama produk / pesanan (teks bebas atau nama master produk)';
comment on column public.quotation_items.size_breakdown is 'Rincian jumlah ukuran dalam format JSON (mis. {"S":10,"M":20})';
comment on column public.quotation_items.subtotal     is 'Nilai total per baris: qty * unit_price (computed stored)';

create index if not exists idx_quotation_items_quotation on public.quotation_items(quotation_id);
create index if not exists idx_quotation_items_user      on public.quotation_items(user_id);

alter table public.quotation_items enable row level security;

drop policy if exists "Select own quotation_items" on public.quotation_items;
create policy "Select own quotation_items" on public.quotation_items
  for select using (auth.uid() = user_id);

grant select on table public.quotation_items to authenticated;
revoke insert, update, delete on table public.quotation_items from authenticated;
grant all on table public.quotation_items to service_role;
