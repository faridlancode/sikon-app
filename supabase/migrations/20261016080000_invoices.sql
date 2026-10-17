-- =========================================================================
-- Migration: Invoices & Invoice Items Schema (Fase 2 - Dokumen Order: M4)
-- =========================================================================
-- Menambahkan:
-- 1. Tabel public.invoices (Invoice: Proforma / DP / Pelunasan / Penuh)
-- 2. Tabel public.invoice_items (Rincian Item Pekerjaan/Barang Invoice)
-- 3. RLS policy select-only dan revoke insert/update/delete dari authenticated
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. TABEL invoices
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  invoice_no       varchar not null,
  invoice_date     date not null default current_date,
  due_date         date,
  invoice_type     varchar not null default 'dp',
  customer_name    varchar not null,
  customer_address text,
  source_type      varchar not null default 'manual',
  quotation_id     uuid references public.quotations(id) on delete set null,
  order_id         uuid references public.orders(id) on delete set null,
  subtotal         numeric not null default 0,       -- dihitung RPC dari jumlah subtotal item
  shipping_cost    numeric not null default 0,
  grand_total      numeric generated always as (subtotal + shipping_cost) stored,
  paid_amount      numeric not null default 0,       -- snapshot pembayaran sebelum invoice ini
  amount_due       numeric not null default 0,       -- jumlah yang ditagih di invoice ini
  bank_account_id  uuid references public.company_bank_accounts(id) on delete set null,
  notes            text,
  status           varchar not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint invoices_type_check check (invoice_type in ('dp', 'pelunasan', 'penuh')),
  constraint invoices_source_check check (source_type in ('quotation', 'order', 'manual')),
  constraint invoices_status_check check (status in ('draft', 'sent', 'paid', 'cancelled')),
  constraint invoices_amounts_check check (
    shipping_cost >= 0 and paid_amount >= 0 and amount_due >= 0 and subtotal >= 0
  ),
  constraint invoices_user_no_key unique (user_id, invoice_no)
);

comment on table  public.invoices                  is 'Header Invoice penagihan (DP, Pelunasan, atau Penuh)';
comment on column public.invoices.invoice_no       is 'Nomor invoice unik per user: INV-YYYYMM-NNNN';
comment on column public.invoices.invoice_date     is 'Tanggal invoice diterbitkan';
comment on column public.invoices.due_date         is 'Tanggal jatuh tempo pembayaran';
comment on column public.invoices.invoice_type     is 'Jenis invoice: dp, pelunasan, penuh';
comment on column public.invoices.source_type      is 'Sumber pembuatan invoice: quotation, order, manual';
comment on column public.invoices.quotation_id     is 'Tautan ke penawaran (on delete set null)';
comment on column public.invoices.order_id         is 'Tautan ke pesanan (on delete set null)';
comment on column public.invoices.subtotal         is 'Subtotal nilai barang/pekerjaan (dihitung RPC)';
comment on column public.invoices.shipping_cost    is 'Ongkos kirim (default 0)';
comment on column public.invoices.grand_total      is 'Total tagihan: subtotal + shipping_cost (computed stored)';
comment on column public.invoices.paid_amount      is 'Snapshot pembayaran sebelumnya (0 untuk invoice DP)';
comment on column public.invoices.amount_due       is 'Nominal bersih yang ditagih pada invoice ini';
comment on column public.invoices.bank_account_id  is 'Rekening bank tujuan pembayaran invoice';
comment on column public.invoices.status           is 'Status dokumen: draft, sent, paid, cancelled';

create index if not exists idx_invoices_user_date    on public.invoices(user_id, invoice_date);
create index if not exists idx_invoices_user_status  on public.invoices(user_id, status);
create index if not exists idx_invoices_quotation    on public.invoices(quotation_id);
create index if not exists idx_invoices_order        on public.invoices(order_id);
create index if not exists idx_invoices_bank_account on public.invoices(bank_account_id);

alter table public.invoices enable row level security;

drop policy if exists "Select own invoices" on public.invoices;
create policy "Select own invoices" on public.invoices
  for select using (auth.uid() = user_id);

grant select on table public.invoices to authenticated;
revoke insert, update, delete on table public.invoices from authenticated;
grant all on table public.invoices to service_role;

-- ---------------------------------------------------------------------------
-- 2. TABEL invoice_items
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  sort_order    int not null default 0,
  product_name  varchar not null,
  description   text,
  qty           numeric not null default 0,
  unit          varchar not null default 'pcs',
  unit_price    numeric not null default 0,
  subtotal      numeric generated always as (qty * unit_price) stored,

  constraint invoice_items_qty_check check (qty >= 0),
  constraint invoice_items_price_check check (unit_price >= 0)
);

comment on table  public.invoice_items              is 'Baris rincian item dalam Invoice';
comment on column public.invoice_items.product_name is 'Nama produk / pesanan / baris tagihan';
comment on column public.invoice_items.description  is 'Deskripsi pekerjaan / catatan spesifik item';
comment on column public.invoice_items.subtotal     is 'Nilai total per baris: qty * unit_price (computed stored)';

create index if not exists idx_invoice_items_invoice on public.invoice_items(invoice_id);
create index if not exists idx_invoice_items_user    on public.invoice_items(user_id);

alter table public.invoice_items enable row level security;

drop policy if exists "Select own invoice_items" on public.invoice_items;
create policy "Select own invoice_items" on public.invoice_items
  for select using (auth.uid() = user_id);

grant select on table public.invoice_items to authenticated;
revoke insert, update, delete on table public.invoice_items from authenticated;
grant all on table public.invoice_items to service_role;
