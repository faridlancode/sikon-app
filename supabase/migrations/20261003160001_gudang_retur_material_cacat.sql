-- =========================================================================
-- SIKon — Gudang: Retur Material Cacat & Edit Pengajuan Restock (Modul 4)
-- =========================================================================

-- 1. Tabel pencatatan retur material cacat dari penjahit ke gudang
create table if not exists public.material_defect_returns (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id),
  order_id               uuid null references public.orders(id) on delete set null,
  sewing_assignment_id   uuid null references public.sewing_assignments(id) on delete set null,
  staff_id               uuid not null references public.staff(id),   -- Penjahit yang mengembalikan
  received_by            uuid not null references public.staff(id),   -- Staf gudang penerima
  material_id            uuid not null references public.materials(id),
  material_color_id      uuid null references public.material_colors(id),
  qty                    numeric not null check (qty > 0),
  unit                   varchar not null,
  defect_reason          text not null,         -- Contoh: 'sleting macet', 'kain sobek'
  is_replaced            boolean not null default true,
  replacement_movement_id uuid null references public.stock_movements(id),
  disposition            varchar not null default 'scrap'
                           check (disposition in ('scrap', 'reworked')),
  created_at             timestamptz not null default now()
);

comment on table public.material_defect_returns is
  'Riwayat material cacat dari meja jahit yang diserahkan kembali ke gudang untuk dicatat sebagai susut/scrap';

-- RLS
alter table public.material_defect_returns enable row level security;

create policy "material_defect_returns: owner full access"
  on public.material_defect_returns
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2. Tambah kolom scrap_qty ke materials (akumulasi barang rusak/afkir)
alter table public.materials
  add column if not exists scrap_qty numeric not null default 0 check (scrap_qty >= 0);

comment on column public.materials.scrap_qty is
  'Total akumulasi barang rusak/afkir (scrap/write-off) yang sudah disusutkan dari stok aktif';

-- 3. RPC: process_defect_material_return
-- Logika:
-- a) Jika stok tersedia >= qty cacat  → serahkan pengganti + potong stok + catat scrap
-- b) Jika stok habis / kurang         → catat scrap saja + buat stock_request darurat
create or replace function public.process_defect_material_return(
  p_staff_id             uuid,     -- Penjahit yang mengembalikan
  p_received_by          uuid,     -- Staf gudang penerima
  p_material_id          uuid,
  p_qty                  numeric,
  p_defect_reason        text,
  p_order_id             uuid default null,
  p_sewing_assignment_id uuid default null,
  p_material_color_id    uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_mat          record;
  v_return_id    uuid;
  v_mov_id       uuid := null;
  v_req_id       uuid := null;
  v_is_replaced  boolean := false;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  if p_qty <= 0 then raise exception 'Jumlah cacat harus lebih dari 0'; end if;
  if p_defect_reason is null or trim(p_defect_reason) = '' then
    raise exception 'Alasan cacat wajib diisi';
  end if;

  -- Ambil data material
  select * into v_mat from public.materials
  where id = p_material_id and user_id = v_user_id;
  if not found then raise exception 'Material tidak ditemukan'; end if;

  -- a) Stok tersedia → serahkan pengganti & potong stok
  if coalesce(v_mat.stock_qty, 0) >= p_qty then
    v_is_replaced := true;

    insert into public.stock_movements (
      user_id, material_id, material_color_id,
      movement_type, source_type, source_id,
      qty, unit, status, confirmed_at,
      taken_by, recorded_by, notes
    ) values (
      v_user_id,
      p_material_id,
      p_material_color_id,
      'out',
      'order_consumption',
      p_order_id,
      p_qty,
      v_mat.unit,
      'confirmed',
      now(),
      p_staff_id,
      p_received_by,
      'Serah barang pengganti retur cacat: ' || p_defect_reason
    ) returning id into v_mov_id;

    -- Kurangi stok aktif + naikkan scrap
    update public.materials
    set stock_qty = stock_qty - p_qty,
        scrap_qty = scrap_qty + p_qty
    where id = p_material_id;

  else
    -- b) Stok habis/kurang → hanya catat scrap + buat pengajuan darurat
    v_is_replaced := false;

    update public.materials
    set scrap_qty = scrap_qty + p_qty
    where id = p_material_id;

    -- Hitung qty yg dibutuhkan (defisit penuh)
    insert into public.stock_requests (
      user_id, material_id, material_color_id,
      quantity_needed, unit,
      requested_by, status, fulfillment_type, reason
    ) values (
      v_user_id,
      p_material_id,
      p_material_color_id,
      p_qty,                         -- request penuh qty cacat
      v_mat.unit,
      p_received_by,
      'pending',
      'spj',
      'DARURAT — Pengganti material cacat (' || p_defect_reason || '). Stok habis saat retur.'
    ) returning id into v_req_id;
  end if;

  -- Simpan catatan retur
  insert into public.material_defect_returns (
    user_id,
    order_id,
    sewing_assignment_id,
    staff_id,
    received_by,
    material_id,
    material_color_id,
    qty,
    unit,
    defect_reason,
    is_replaced,
    replacement_movement_id,
    disposition
  ) values (
    v_user_id,
    p_order_id,
    p_sewing_assignment_id,
    p_staff_id,
    p_received_by,
    p_material_id,
    p_material_color_id,
    p_qty,
    v_mat.unit,
    p_defect_reason,
    v_is_replaced,
    v_mov_id,
    'scrap'
  ) returning id into v_return_id;

  return jsonb_build_object(
    'success',                true,
    'return_id',              v_return_id,
    'is_replaced',            v_is_replaced,
    'stock_request_created',  (v_req_id is not null),
    'stock_request_id',       v_req_id,
    'replacement_movement_id', v_mov_id
  );
end;
$$;

revoke execute on function public.process_defect_material_return(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid)
  from public, anon;
grant  execute on function public.process_defect_material_return(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid)
  to authenticated;

-- 4. RPC: update_pending_stock_request
-- Edit pengajuan restock yang masih 'pending' (terkunci begitu approved/in_progress/fulfilled)
create or replace function public.update_pending_stock_request(
  p_request_id       uuid,
  p_material_id      uuid,
  p_quantity_needed  numeric,
  p_fulfillment_type varchar,
  p_reason           text,
  p_material_color_id uuid default null,
  p_estimated_price  numeric default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_current public.stock_requests;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select * into v_current
  from public.stock_requests
  where id = p_request_id and user_id = v_user_id;

  if not found then
    raise exception 'Pengajuan restock tidak ditemukan';
  end if;

  if v_current.status <> 'pending' then
    raise exception 'Pengajuan tidak dapat diedit. Status saat ini: %. Hanya status "pending" yang boleh diedit.', v_current.status;
  end if;

  if p_quantity_needed <= 0 then
    raise exception 'Qty yang diminta harus lebih dari 0';
  end if;

  update public.stock_requests
  set
    material_id       = p_material_id,
    material_color_id = p_material_color_id,
    quantity_needed   = p_quantity_needed,
    fulfillment_type  = p_fulfillment_type,
    reason            = p_reason,
    estimated_price   = p_estimated_price,
    updated_at        = now()
  where id = p_request_id and user_id = v_user_id and status = 'pending';

  return jsonb_build_object(
    'success',     true,
    'request_id',  p_request_id
  );
end;
$$;

revoke execute on function public.update_pending_stock_request(uuid, uuid, numeric, varchar, text, uuid, numeric)
  from public, anon;
grant  execute on function public.update_pending_stock_request(uuid, uuid, numeric, varchar, text, uuid, numeric)
  to authenticated;
