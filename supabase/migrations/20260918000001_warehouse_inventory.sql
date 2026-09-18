-- =========================================================
-- Migration: warehouse_inventory
-- Version: 20260918000001
--
-- Tahap 1 Warehouse / Inventory Management:
--   - Tambah stock_qty & minimum_stock ke materials (non-kain)
--   - Tambah stock_qty & minimum_stock ke material_colors (kain, per warna)
--   - Tabel stock_movements: audit trail semua pergerakan stok
--   - Tabel purchase_receipts + purchase_receipt_items: penerimaan barang
--   - RPC confirm_stock_movement: konfirmasi stok keluar/masuk
--   - RPC cancel_stock_movement: batalkan pending stock request
--   - RPC pay_purchase_receipt: bayar tagihan → expense di Finance
--   - Seed kategori expense "Pembelian Material"
-- =========================================================

-- ── 1. Tambah kolom stok ke materials (non-kain) ─────────────────────────────
alter table public.materials
  add column if not exists stock_qty      numeric not null default 0,
  add column if not exists minimum_stock  numeric not null default 0;

alter table public.materials
  add constraint materials_stock_qty_check    check (stock_qty    >= 0),
  add constraint materials_minimum_stock_check check (minimum_stock >= 0);

-- ── 2. Tambah kolom stok ke material_colors (kain, per warna) ─────────────────
alter table public.material_colors
  add column if not exists stock_qty      numeric not null default 0,
  add column if not exists minimum_stock  numeric not null default 0;

alter table public.material_colors
  add constraint material_colors_stock_qty_check    check (stock_qty    >= 0),
  add constraint material_colors_minimum_stock_check check (minimum_stock >= 0);

-- ── 3. Tabel stock_movements ──────────────────────────────────────────────────
-- Setiap pergerakan stok (masuk / keluar / koreksi) dicatat di sini.
-- Untuk 'out' dari order: status='pending' dulu sampai staf gudang konfirmasi.
-- Untuk 'in' dari penerimaan barang: langsung status='confirmed'.
create table if not exists public.stock_movements (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id),
  material_id         uuid not null references public.materials(id) on delete cascade,
  material_color_id   uuid references public.material_colors(id) on delete set null,
  movement_type       varchar not null check (movement_type in ('in','out','adjustment')),
  source_type         varchar check (source_type in ('initial','purchase','order_consumption','manual')),
  source_id           uuid,          -- order_id atau purchase_receipt_id (traceability)
  qty                 numeric not null check (qty > 0),
  unit                varchar not null,   -- snapshot satuan saat pergerakan terjadi
  notes               text,
  status              varchar not null default 'confirmed'
                      check (status in ('pending','confirmed','cancelled')),
  confirmed_at        timestamptz,
  created_at          timestamptz default now()
);

alter table public.stock_movements enable row level security;

create policy "Manage own stock movements" on public.stock_movements
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_stock_movements_material   on public.stock_movements(material_id);
create index if not exists idx_stock_movements_color      on public.stock_movements(material_color_id);
create index if not exists idx_stock_movements_source     on public.stock_movements(source_id);
create index if not exists idx_stock_movements_status     on public.stock_movements(status);

-- ── 4. Tabel purchase_receipts ────────────────────────────────────────────────
-- Dokumen penerimaan barang dari supplier (bisa belum / sudah dibayar).
create table if not exists public.purchase_receipts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id),
  supplier_name   varchar,           -- free text, tidak ada master supplier dulu
  total_amount    numeric not null default 0 check (total_amount >= 0),
  notes           text,
  received_date   date not null default current_date,
  status          varchar not null default 'unpaid' check (status in ('unpaid','paid')),
  paid_date       date,
  transaction_id  uuid references public.transactions(id) on delete set null,
  created_at      timestamptz default now()
);

alter table public.purchase_receipts enable row level security;

create policy "Manage own purchase receipts" on public.purchase_receipts
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 5. Tabel purchase_receipt_items ──────────────────────────────────────────
-- Detail per baris barang dalam satu penerimaan.
create table if not exists public.purchase_receipt_items (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id),
  purchase_receipt_id   uuid not null references public.purchase_receipts(id) on delete cascade,
  stock_movement_id     uuid references public.stock_movements(id) on delete set null,
  material_id           uuid not null references public.materials(id),
  material_color_id     uuid references public.material_colors(id) on delete set null,
  qty                   numeric not null check (qty > 0),
  unit                  varchar not null,
  unit_price            numeric not null default 0 check (unit_price >= 0),
  total_price           numeric not null default 0 check (total_price >= 0),
  created_at            timestamptz default now()
);

alter table public.purchase_receipt_items enable row level security;

create policy "Manage own purchase receipt items" on public.purchase_receipt_items
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_purchase_receipt_items_receipt   on public.purchase_receipt_items(purchase_receipt_id);
create index if not exists idx_purchase_receipt_items_material  on public.purchase_receipt_items(material_id);

-- ── 6. RPC: confirm_stock_movement ───────────────────────────────────────────
-- Konfirmasi pending stock out dari order → stok berkurang.
-- Throw error kalau stok tidak mencukupi (tidak boleh negatif).
create or replace function public.confirm_stock_movement(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id         uuid := auth.uid();
  v_movement        stock_movements%rowtype;
  v_current_stock   numeric;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select * into v_movement
  from stock_movements
  where id = p_movement_id and user_id = v_user_id;

  if not found then
    raise exception 'Stock movement tidak ditemukan';
  end if;

  if v_movement.status != 'pending' then
    raise exception 'Hanya movement berstatus pending yang bisa dikonfirmasi';
  end if;

  -- Ambil stok saat ini
  if v_movement.material_color_id is not null then
    -- Kain: stok per warna
    select stock_qty into v_current_stock
    from material_colors
    where id = v_movement.material_color_id;
  else
    -- Non-kain: stok per material
    select stock_qty into v_current_stock
    from materials
    where id = v_movement.material_id;
  end if;

  -- Validasi stok cukup untuk 'out'
  if v_movement.movement_type = 'out' and v_current_stock < v_movement.qty then
    raise exception 'Stok tidak mencukupi. Stok tersedia: %, dibutuhkan: %',
      v_current_stock, v_movement.qty;
  end if;

  -- Update stok
  if v_movement.material_color_id is not null then
    update material_colors set
      stock_qty = case
        when v_movement.movement_type = 'in'         then stock_qty + v_movement.qty
        when v_movement.movement_type = 'out'        then stock_qty - v_movement.qty
        when v_movement.movement_type = 'adjustment' then v_movement.qty  -- set langsung
      end
    where id = v_movement.material_color_id;
  else
    update materials set
      stock_qty = case
        when v_movement.movement_type = 'in'         then stock_qty + v_movement.qty
        when v_movement.movement_type = 'out'        then stock_qty - v_movement.qty
        when v_movement.movement_type = 'adjustment' then v_movement.qty  -- set langsung
      end
    where id = v_movement.material_id;
  end if;

  -- Tandai confirmed
  update stock_movements set
    status       = 'confirmed',
    confirmed_at = now()
  where id = p_movement_id;
end;
$$;

revoke execute on function public.confirm_stock_movement(uuid) from public, anon;
grant  execute on function public.confirm_stock_movement(uuid) to authenticated;

-- ── 7. RPC: cancel_stock_movement ────────────────────────────────────────────
-- Batalkan pending stock request (stok tidak berubah).
create or replace function public.cancel_stock_movement(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_movement stock_movements%rowtype;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select * into v_movement
  from stock_movements
  where id = p_movement_id and user_id = v_user_id;

  if not found then
    raise exception 'Stock movement tidak ditemukan';
  end if;

  if v_movement.status != 'pending' then
    raise exception 'Hanya movement berstatus pending yang bisa dibatalkan';
  end if;

  update stock_movements set status = 'cancelled'
  where id = p_movement_id;
end;
$$;

revoke execute on function public.cancel_stock_movement(uuid) from public, anon;
grant  execute on function public.cancel_stock_movement(uuid) to authenticated;

-- ── 8. RPC: pay_purchase_receipt ─────────────────────────────────────────────
-- Bayar tagihan penerimaan barang → buat expense di transactions.
create or replace function public.pay_purchase_receipt(
  p_receipt_id      uuid,
  p_payment_date    date,
  p_payment_method  varchar default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_receipt   purchase_receipts%rowtype;
  v_trx_id    uuid;
  v_cat_id    uuid;
  v_supplier  varchar;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select * into v_receipt
  from purchase_receipts
  where id = p_receipt_id and user_id = v_user_id;

  if not found then
    raise exception 'Purchase receipt tidak ditemukan';
  end if;

  if v_receipt.status = 'paid' then
    raise exception 'Tagihan ini sudah dibayar';
  end if;

  -- Ambil category_id untuk "Pembelian Material"
  select id into v_cat_id
  from categories
  where user_id = v_user_id and name = 'Pembelian Material' and type = 'expense'
  limit 1;

  -- Buat title transaksi
  v_supplier := coalesce(v_receipt.supplier_name, 'Supplier');

  -- Insert ke transactions
  insert into transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (
    v_user_id,
    v_cat_id,
    'Pembelian Material - ' || v_supplier,
    v_receipt.total_amount,
    'expense',
    p_payment_date,
    coalesce(v_receipt.notes, '')
  )
  returning id into v_trx_id;

  -- Update purchase_receipt
  update purchase_receipts set
    status         = 'paid',
    paid_date      = p_payment_date,
    transaction_id = v_trx_id
  where id = p_receipt_id;
end;
$$;

revoke execute on function public.pay_purchase_receipt(uuid, date, varchar) from public, anon;
grant  execute on function public.pay_purchase_receipt(uuid, date, varchar) to authenticated;

-- ── 9. Seed kategori expense "Pembelian Material" ─────────────────────────────
insert into public.categories (user_id, name, type)
select u.id, 'Pembelian Material', 'expense'
from auth.users u
where not exists (
  select 1 from public.categories c
  where c.user_id = u.id and c.name = 'Pembelian Material'
);
