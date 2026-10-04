-- =========================================================================
-- SIKon — Gate Check Material Gudang Sebelum Mulai Jahit
-- =========================================================================
-- Tujuan:
--   Mencegah inkonsistensi data di mana sewing_assignment berstatus
--   'in_progress' / 'done' tapi bahan Direct BOM belum pernah dikeluarkan
--   gudang (tidak ada stock_movements terkait).
--
-- Strategi:
--   1. Tambah kolom material_dispatched_at di sewing_assignments
--      → diset otomatis oleh dispatch_sewing_materials() saat berhasil
--   2. Tambah kolom notes di sewing_assignments
--      → untuk menyimpan log alasan Supervisor force-override
--   3. Patch dispatch_sewing_materials() → set material_dispatched_at
--   4. Replace start_sewing_assignment() → gate check + force override
--   5. Replace start_all_sewing_assignments() → skip logic + return count
-- =========================================================================

-- 1. Tambah kolom material_dispatched_at pada sewing_assignments
alter table public.sewing_assignments
  add column if not exists material_dispatched_at timestamptz null;

comment on column public.sewing_assignments.material_dispatched_at is
  'Timestamp bahan Direct BOM diserahkan gudang ke penjahit. NULL = belum diserahkan. '
  'Diset otomatis oleh dispatch_sewing_materials(). '
  'Jika produk tidak punya BOM non-floor-stock, gate check ini dilewati otomatis.';

-- 2. Tambah kolom notes pada sewing_assignments (untuk log override + keterangan bebas)
alter table public.sewing_assignments
  add column if not exists notes text null;

comment on column public.sewing_assignments.notes is
  'Catatan bebas per penugasan. Diisi otomatis dengan log [PAKSA MULAI: <alasan>] '
  'saat Supervisor memakai force override sebelum bahan diserahkan.';

-- =========================================================================
-- 3. Patch dispatch_sewing_materials() — set material_dispatched_at
--    Menggantikan versi sebelumnya (migration 20261003150001).
--    Perbedaan: tambah UPDATE sewing_assignments.material_dispatched_at = now()
--    di akhir fungsi sebelum return.
-- =========================================================================
create or replace function public.dispatch_sewing_materials(
  p_sewing_assignment_id uuid,
  p_recorded_by          uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id    uuid := auth.uid();
  v_assignment record;
  v_mat        record;
  v_needed_qty numeric;
  v_dispatched jsonb := '[]'::jsonb;
  v_mov_id     uuid;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  -- 1. Ambil detail assignment
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
      m.name           as mat_name,
      pm.quantity      as bom_qty_per_pcs,
      coalesce(m.stock_qty, 0) as stock_qty,
      m.unit
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed_qty := v_assignment.assigned_qty * v_mat.bom_qty_per_pcs;
    if v_mat.stock_qty < v_needed_qty then
      raise exception
        'Stok tidak cukup untuk bahan "%": butuh % %, tersedia % %. Serah terima harus menunggu restock.',
        v_mat.mat_name, v_needed_qty, v_mat.unit, v_mat.stock_qty, v_mat.unit;
    end if;
  end loop;

  -- 3. Eksekusi pengeluaran bahan (insert stock_movements + kurangi stok)
  for v_mat in
    select
      pm.material_id,
      m.name           as mat_name,
      pm.quantity      as bom_qty_per_pcs,
      m.unit
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed_qty := v_assignment.assigned_qty * v_mat.bom_qty_per_pcs;

    insert into public.stock_movements (
      user_id, material_id, movement_type, source_type, source_id,
      sewing_assignment_id, qty, unit, status, confirmed_at,
      taken_by, recorded_by, notes
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

    update public.materials
    set stock_qty = stock_qty - v_needed_qty
    where id = v_mat.material_id;

    v_dispatched := v_dispatched || jsonb_build_object(
      'material_id',    v_mat.material_id,
      'material_name',  v_mat.mat_name,
      'qty_dispatched', v_needed_qty,
      'unit',           v_mat.unit,
      'movement_id',    v_mov_id
    );
  end loop;

  -- 4. Set material_dispatched_at — BARU di versi ini (patch gate check)
  update public.sewing_assignments
  set material_dispatched_at = now()
  where id = p_sewing_assignment_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'success',       true,
    'assignment_id', p_sewing_assignment_id,
    'dispatched',    v_dispatched
  );
end;
$$;

revoke execute on function public.dispatch_sewing_materials(uuid, uuid) from public, anon;
grant  execute on function public.dispatch_sewing_materials(uuid, uuid) to authenticated;

-- =========================================================================
-- 4. Replace start_sewing_assignment() — gate check + force override
-- =========================================================================
create or replace function public.start_sewing_assignment(
  p_assignment_id uuid,
  p_force         boolean default false,
  p_force_reason  text    default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id        uuid := auth.uid();
  v_assignment     record;
  v_bom_count      int;
  v_needs_dispatch boolean;
  v_is_forced      boolean := false;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select
    sa.id,
    sa.status,
    sa.material_dispatched_at,
    sa.notes,
    oi.product_id
  into v_assignment
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  where sa.id = p_assignment_id
    and sa.user_id = v_user_id;

  if not found then
    raise exception 'Penugasan jahit tidak ditemukan';
  end if;

  if v_assignment.status <> 'assigned' then
    raise exception
      'Penugasan tidak bisa dimulai — status saat ini: %. Hanya penugasan berstatus "assigned" yang bisa dimulai.',
      v_assignment.status;
  end if;

  -- Cek apakah produk punya BOM direct (non-floor-stock) yang perlu diserahkan gudang
  select count(*) into v_bom_count
  from public.product_materials pm
  join public.materials m on m.id = pm.material_id
  where pm.product_id = v_assignment.product_id
    and coalesce(m.is_floor_stock, false) = false;

  v_needs_dispatch := v_bom_count > 0;

  -- GATE CHECK: ada BOM direct + belum dispatch → blokir (kecuali force)
  if v_needs_dispatch and v_assignment.material_dispatched_at is null then

    if not p_force then
      raise exception
        'Bahan belum diserahkan gudang. '
        'Serahkan bahan di menu Gudang → Bahan Jahit terlebih dahulu, '
        'atau minta Supervisor untuk memaksa mulai dengan alasan.';
    end if;

    -- Force mode: alasan wajib diisi
    if p_force_reason is null or trim(p_force_reason) = '' then
      raise exception
        'Alasan override wajib diisi saat memaksa mulai sebelum bahan diserahkan gudang.';
    end if;

    -- Force override: set in_progress + catat alasan di notes
    update public.sewing_assignments
    set status = 'in_progress',
        notes  = case
          when notes is null or notes = '' then '[PAKSA MULAI: ' || trim(p_force_reason) || ']'
          else notes || ' | [PAKSA MULAI: ' || trim(p_force_reason) || ']'
        end
    where id = p_assignment_id
      and user_id = v_user_id;

    v_is_forced := true;

  else
    -- Normal: bahan sudah diserahkan ATAU produk tidak punya BOM direct
    update public.sewing_assignments
    set status = 'in_progress'
    where id = p_assignment_id
      and user_id = v_user_id;
  end if;

  return jsonb_build_object(
    'success',         true,
    'assignment_id',   p_assignment_id,
    'forced_override', v_is_forced
  );
end;
$$;

revoke execute on function public.start_sewing_assignment(uuid) from public, anon;
revoke execute on function public.start_sewing_assignment(uuid, boolean, text) from public, anon;
grant  execute on function public.start_sewing_assignment(uuid, boolean, text) to authenticated;

-- =========================================================================
-- 5. Replace start_all_sewing_assignments() — skip yang belum dispatch
-- =========================================================================
create or replace function public.start_all_sewing_assignments(
  p_staff_id uuid    default null,
  p_force    boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id   uuid := auth.uid();
  v_started   int  := 0;
  v_skipped   int  := 0;
  v_rec       record;
  v_bom_count int;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  for v_rec in
    select sa.id, sa.material_dispatched_at, oi.product_id
    from public.sewing_assignments sa
    join public.order_items oi on oi.id = sa.order_item_id
    where sa.user_id = v_user_id
      and sa.status  = 'assigned'
      and (p_staff_id is null or sa.staff_id = p_staff_id)
    order by sa.created_at asc
  loop
    -- Cek apakah produk punya BOM direct yang perlu diserahkan gudang
    select count(*) into v_bom_count
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_rec.product_id
      and coalesce(m.is_floor_stock, false) = false;

    -- Skip: ada BOM direct, belum dispatch, bukan force mode
    if v_bom_count > 0 and v_rec.material_dispatched_at is null and not p_force then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update public.sewing_assignments
    set status = 'in_progress'
    where id = v_rec.id
      and user_id = v_user_id;

    v_started := v_started + 1;
  end loop;

  return jsonb_build_object(
    'success',     true,
    'started',     v_started,
    'skipped',     v_skipped,
    'skip_reason', case
      when v_skipped > 0
      then v_skipped || ' penugasan dilewati karena bahan belum diserahkan gudang'
      else null
    end
  );
end;
$$;

revoke execute on function public.start_all_sewing_assignments(uuid) from public, anon;
revoke execute on function public.start_all_sewing_assignments(uuid, boolean) from public, anon;
grant  execute on function public.start_all_sewing_assignments(uuid, boolean) to authenticated;
