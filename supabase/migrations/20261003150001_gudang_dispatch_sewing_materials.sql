-- =========================================================================
-- SIKon — Gudang: Pengeluaran Bahan Worklog & Floor Stock (Modul 3)
-- =========================================================================

-- 1. Tambah kolom is_floor_stock pada tabel materials
alter table public.materials
  add column if not exists is_floor_stock boolean not null default false;

comment on column public.materials.is_floor_stock is
  'True jika material didistribusikan via Floor Stock (benang, kancing mesin finishing, jarum) bukan via Direct BOM penjahit';

-- Tandai material benang, kancing, dan jarum sebagai floor stock secara otomatis
update public.materials
set is_floor_stock = true
where lower(name) like '%benang%'
   or lower(name) like '%kancing%'
   or lower(name) like '%jarum%';

-- 2. Tambah kolom sewing_assignment_id pada stock_movements (FK ke sewing_assignments)
alter table public.stock_movements
  add column if not exists sewing_assignment_id uuid null
    references public.sewing_assignments(id) on delete set null;

comment on column public.stock_movements.sewing_assignment_id is
  'Tautan ke penugasan jahit penjahit penerima bahan (untuk traceability serah terima bahan Direct BOM)';

-- 3. RPC: dispatch_sewing_materials (Pengeluaran Bahan Penjahit Berbasis Worklog)
-- Memvalidasi ketersediaan stok seluruh bahan Direct BOM (wajib lengkap, tidak parsial)
-- lalu memotong stok dan mencatat stock_movements utk setiap bahan secara atomik.
create or replace function public.dispatch_sewing_materials(
  p_sewing_assignment_id uuid,
  p_recorded_by uuid       -- staff_id staf gudang yang menyerahkan
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_assignment    record;
  v_mat           record;
  v_needed_qty    numeric;
  v_dispatched    jsonb := '[]'::jsonb;
  v_mov_id        uuid;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  -- 1. Ambil detail assignment & pastikan belum pernah diserahkan bahannya
  select
    sa.id,
    sa.staff_id,
    sa.assigned_qty,
    sa.user_id      as sa_user_id,
    oi.product_id,
    oi.id           as order_item_id,
    o.order_id      as order_code,
    o.id            as order_id,
    st.name         as staff_name
  into v_assignment
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  join public.orders o       on o.id  = oi.order_id
  join public.staff st       on st.id = sa.staff_id
  where sa.id = p_sewing_assignment_id
    and sa.user_id = v_user_id;

  if not found then
    raise exception 'Penugasan jahit tidak ditemukan atau bukan milik akun Anda';
  end if;

  -- Cek apakah bahan sudah pernah diserahkan untuk assignment ini
  if exists (
    select 1 from public.stock_movements sm
    where sm.sewing_assignment_id = p_sewing_assignment_id
      and sm.movement_type = 'out'
      and sm.status = 'confirmed'
      and sm.user_id = v_user_id
  ) then
    raise exception 'Bahan untuk penugasan jahit ini sudah pernah diserahkan sebelumnya';
  end if;

  -- 2. Validasi stok lengkap SEMUA bahan Direct BOM (non-floor-stock)
  for v_mat in
    select
      pm.material_id,
      m.name as mat_name,
      pm.quantity as bom_qty_per_pcs,
      coalesce(m.stock_qty, 0) as stock_qty,
      m.unit
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed_qty := v_assignment.assigned_qty * v_mat.bom_qty_per_pcs;
    if v_mat.stock_qty < v_needed_qty then
      raise exception 'Stok tidak cukup untuk bahan "%": butuh % %, tersedia % %. Serah terima harus menunggu restock.',
        v_mat.mat_name,
        v_needed_qty,
        v_mat.unit,
        v_mat.stock_qty,
        v_mat.unit;
    end if;
  end loop;

  -- 3. Eksekusi pengeluaran bahan (insert stock_movements + kurangi stok)
  for v_mat in
    select
      pm.material_id,
      m.name as mat_name,
      pm.quantity as bom_qty_per_pcs,
      m.unit
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed_qty := v_assignment.assigned_qty * v_mat.bom_qty_per_pcs;

    insert into public.stock_movements (
      user_id,
      material_id,
      movement_type,
      source_type,
      source_id,
      sewing_assignment_id,
      qty,
      unit,
      status,
      confirmed_at,
      taken_by,
      recorded_by,
      notes
    ) values (
      v_user_id,
      v_mat.material_id,
      'out',
      'order_consumption',
      v_assignment.order_item_id,
      p_sewing_assignment_id,
      v_needed_qty,
      v_mat.unit,
      'confirmed',
      now(),
      v_assignment.staff_id,
      p_recorded_by,
      'Serah bahan jahit SPK ' || v_assignment.order_code
        || ' → ' || v_assignment.staff_name
        || ' (' || v_assignment.assigned_qty || ' pcs)'
    ) returning id into v_mov_id;

    -- Kurangi stok material
    update public.materials
    set stock_qty = stock_qty - v_needed_qty
    where id = v_mat.material_id;

    v_dispatched := v_dispatched || jsonb_build_object(
      'material_id',   v_mat.material_id,
      'material_name', v_mat.mat_name,
      'qty_dispatched', v_needed_qty,
      'unit',           v_mat.unit,
      'movement_id',    v_mov_id
    );
  end loop;

  return jsonb_build_object(
    'success',       true,
    'assignment_id', p_sewing_assignment_id,
    'dispatched',    v_dispatched
  );
end;
$$;

revoke execute on function public.dispatch_sewing_materials(uuid, uuid) from public, anon;
grant  execute on function public.dispatch_sewing_materials(uuid, uuid) to authenticated;

-- 4. Helper RPC: check_sewing_material_stock
-- Digunakan frontend untuk preview ketersediaan bahan (tanpa mutasi)
create or replace function public.check_sewing_material_stock(
  p_sewing_assignment_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id    uuid := auth.uid();
  v_assignment record;
  v_mat        record;
  v_needed     numeric;
  v_result     jsonb := '[]'::jsonb;
  v_all_ok     boolean := true;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select
    sa.assigned_qty,
    oi.product_id
  into v_assignment
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  where sa.id = p_sewing_assignment_id
    and sa.user_id = v_user_id;

  if not found then
    raise exception 'Penugasan jahit tidak ditemukan';
  end if;

  for v_mat in
    select
      pm.material_id,
      m.name as mat_name,
      pm.quantity as bom_qty_per_pcs,
      coalesce(m.stock_qty, 0) as stock_qty,
      m.unit
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed := v_assignment.assigned_qty * v_mat.bom_qty_per_pcs;
    v_result := v_result || jsonb_build_object(
      'material_id',   v_mat.material_id,
      'material_name', v_mat.mat_name,
      'needed_qty',    v_needed,
      'stock_qty',     v_mat.stock_qty,
      'unit',          v_mat.unit,
      'is_sufficient', v_mat.stock_qty >= v_needed
    );
    if v_mat.stock_qty < v_needed then
      v_all_ok := false;
    end if;
  end loop;

  return jsonb_build_object(
    'all_sufficient', v_all_ok,
    'assigned_qty',   v_assignment.assigned_qty,
    'materials',      v_result
  );
end;
$$;

revoke execute on function public.check_sewing_material_stock(uuid) from public, anon;
grant  execute on function public.check_sewing_material_stock(uuid) to authenticated;
