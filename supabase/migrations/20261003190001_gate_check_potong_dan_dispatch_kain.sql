-- =========================================================================
-- SIKon — Migration: Gate Check Potong, Dispatch Kain, & Validasi Stok
-- =========================================================================
-- 1. Tambah kolom material_dispatched_at, dispatch_notes, force_started, force_reason ke cutting_assignments
-- 2. Tambah kolom cutting_assignment_id ke stock_movements
-- 3. RPC check_cutting_material_stock (preview ketersediaan kain)
-- 4. RPC dispatch_cutting_materials (atomic dispatch kain ke tukang potong)
-- 5. Patch RPC mark_cutting_item_done (gate check kain dengan supervisor force override)
-- =========================================================================

-- 1. Kolom baru di cutting_assignments
alter table public.cutting_assignments
  add column if not exists material_dispatched_at timestamptz null,
  add column if not exists dispatch_notes text null,
  add column if not exists force_started boolean not null default false,
  add column if not exists force_reason text null;

comment on column public.cutting_assignments.material_dispatched_at is
  'Waktu kain diserahkan gudang ke tukang potong. NULL = kain belum keluar gudang.';
comment on column public.cutting_assignments.force_started is
  'True jika pengerjaan/penyelesaian potong dipaksa mulai oleh Supervisor meski kain belum keluar.';
comment on column public.cutting_assignments.force_reason is
  'Alasan override Supervisor saat force start pemotongan.';

-- 2. Kolom cutting_assignment_id di stock_movements
alter table public.stock_movements
  add column if not exists cutting_assignment_id uuid null references public.cutting_assignments(id) on delete set null;

create index if not exists idx_stock_movements_cutting_assignment
  on public.stock_movements(cutting_assignment_id);

-- 3. RPC check_cutting_material_stock (preview sebelum serahkan kain)
create or replace function public.check_cutting_material_stock(
  p_cutting_assignment_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_assign        record;
  v_fab           record;
  v_needed        numeric;
  v_curr_stock    numeric;
  v_all_suff      boolean := true;
  v_fabrics_json  jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select ca.*, oi.name_item, oi.qty as item_qty
  into v_assign
  from public.cutting_assignments ca
  join public.order_items oi on oi.id = ca.order_item_id
  where ca.id = p_cutting_assignment_id and ca.user_id = v_user_id;

  if not found then raise exception 'Penugasan potong tidak ditemukan'; end if;

  for v_fab in
    select
      oif.material_id,
      oif.material_color_id,
      oif.usage_qty_snapshot,
      m.name as mat_name,
      mc.color_name,
      coalesce(mc.stock_qty, m.stock_qty, 0) as current_stock,
      m.unit
    from public.order_item_fabrics oif
    join public.materials m on m.id = oif.material_id
    left join public.material_colors mc on mc.id = oif.material_color_id
    where oif.order_item_id = v_assign.order_item_id
  loop
    v_needed := v_assign.item_qty * coalesce(v_fab.usage_qty_snapshot, 0);
    v_curr_stock := v_fab.current_stock;

    if v_curr_stock < v_needed then
      v_all_suff := false;
    end if;

    v_fabrics_json := v_fabrics_json || jsonb_build_object(
      'material_id',       v_fab.material_id,
      'material_color_id', v_fab.material_color_id,
      'material_name',     v_fab.mat_name,
      'color_name',        v_fab.color_name,
      'needed_qty',        v_needed,
      'stock_qty',         v_curr_stock,
      'unit',              v_fab.unit,
      'is_sufficient',     (v_curr_stock >= v_needed)
    );
  end loop;

  return jsonb_build_object(
    'all_sufficient', v_all_suff,
    'item_qty',       v_assign.item_qty,
    'fabrics',        v_fabrics_json
  );
end;
$$;

revoke execute on function public.check_cutting_material_stock(uuid) from public, anon;
grant  execute on function public.check_cutting_material_stock(uuid) to authenticated;

-- 4. RPC dispatch_cutting_materials (serah terima kain potong)
create or replace function public.dispatch_cutting_materials(
  p_cutting_assignment_id uuid,
  p_recorded_by           uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_assign        record;
  v_fab           record;
  v_needed        numeric;
  v_curr_stock    numeric;
  v_dispatched    jsonb := '[]'::jsonb;
  v_mov_id        uuid;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select ca.*, oi.order_id, oi.name_item, oi.qty as item_qty,
         st.name as staff_name, o.order_id as order_code
  into v_assign
  from public.cutting_assignments ca
  join public.order_items oi on oi.id = ca.order_item_id
  join public.orders o on o.id = oi.order_id
  join public.staff st on st.id = ca.staff_id
  where ca.id = p_cutting_assignment_id and ca.user_id = v_user_id;

  if not found then raise exception 'Penugasan potong tidak ditemukan'; end if;

  if v_assign.material_dispatched_at is not null then
    return jsonb_build_object(
      'success', true,
      'assignment_id', p_cutting_assignment_id,
      'already_dispatched', true
    );
  end if;

  -- 1. Validasi ketersediaan stok seluruh kain (Wajib cukup semua)
  for v_fab in
    select
      oif.material_id,
      oif.material_color_id,
      oif.usage_qty_snapshot,
      m.name as mat_name,
      mc.color_name,
      coalesce(mc.stock_qty, m.stock_qty, 0) as current_stock,
      m.unit
    from public.order_item_fabrics oif
    join public.materials m on m.id = oif.material_id
    left join public.material_colors mc on mc.id = oif.material_color_id
    where oif.order_item_id = v_assign.order_item_id
  loop
    v_needed := v_assign.item_qty * coalesce(v_fab.usage_qty_snapshot, 0);
    v_curr_stock := v_fab.current_stock;

    if v_curr_stock < v_needed then
      raise exception
        'Stok tidak cukup untuk kain "%" (Warna: %): butuh % %, tersedia % %. Serah terima harus menunggu restock.',
        v_fab.mat_name, coalesce(v_fab.color_name, '-'), v_needed, v_fab.unit, v_curr_stock, v_fab.unit;
    end if;
  end loop;

  -- 2. Eksekusi pengeluaran kain (insert stock_movements + kurangi stok)
  for v_fab in
    select
      oif.material_id,
      oif.material_color_id,
      oif.usage_qty_snapshot,
      m.name as mat_name,
      mc.color_name,
      m.unit
    from public.order_item_fabrics oif
    join public.materials m on m.id = oif.material_id
    left join public.material_colors mc on mc.id = oif.material_color_id
    where oif.order_item_id = v_assign.order_item_id
  loop
    v_needed := v_assign.item_qty * coalesce(v_fab.usage_qty_snapshot, 0);

    insert into public.stock_movements (
      user_id, material_id, material_color_id, movement_type, source_type,
      source_id, cutting_assignment_id, qty, unit, status, confirmed_at,
      taken_by, recorded_by, notes
    ) values (
      v_user_id,
      v_fab.material_id,
      v_fab.material_color_id,
      'out',
      'order_consumption',
      v_assign.order_id,
      p_cutting_assignment_id,
      v_needed,
      v_fab.unit,
      'confirmed',
      now(),
      v_assign.staff_id,
      p_recorded_by,
      'Serah kain potong SPK ' || v_assign.order_code
        || ' → Tukang Potong ' || v_assign.staff_name
        || ' (' || v_assign.item_qty || ' pcs)'
    ) returning id into v_mov_id;

    if v_fab.material_color_id is not null then
      update public.material_colors
      set stock_qty = stock_qty - v_needed
      where id = v_fab.material_color_id;
    else
      update public.materials
      set stock_qty = stock_qty - v_needed
      where id = v_fab.material_id;
    end if;

    v_dispatched := v_dispatched || jsonb_build_object(
      'material_id',        v_fab.material_id,
      'material_color_id',  v_fab.material_color_id,
      'material_name',      v_fab.mat_name,
      'color_name',         v_fab.color_name,
      'qty_dispatched',     v_needed,
      'unit',               v_fab.unit,
      'movement_id',        v_mov_id
    );
  end loop;

  -- 3. Update status serah pada cutting_assignments
  update public.cutting_assignments
  set material_dispatched_at = now()
  where id = p_cutting_assignment_id;

  return jsonb_build_object(
    'success',       true,
    'assignment_id', p_cutting_assignment_id,
    'dispatched',    v_dispatched
  );
end;
$$;

revoke execute on function public.dispatch_cutting_materials(uuid, uuid) from public, anon;
grant  execute on function public.dispatch_cutting_materials(uuid, uuid) to authenticated;

-- 5. Patch RPC mark_cutting_item_done (dengan Gate Check Kain)
create or replace function public.mark_cutting_item_done(
  p_order_item_id uuid,
  p_cutting_qty   numeric default null,
  p_notes         text    default null,
  p_force         boolean default false,
  p_force_reason  text    default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_item         record;
  v_assign       record;
  v_qty          numeric;
  v_rate         numeric;
  v_needs_fabric boolean := false;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select
    oi.id, oi.order_id, oi.product_id, oi.qty, oi.cutting_completed_at,
    p.cutting_cost_per_pcs
  into v_item
  from public.order_items oi
  left join public.products p on p.id = oi.product_id
  where oi.id = p_order_item_id and oi.user_id = v_user_id;

  if not found then raise exception 'Order item tidak ditemukan'; end if;
  if v_item.cutting_completed_at is not null then
    raise exception 'Item ini sudah pernah ditandai selesai dipotong';
  end if;

  select * into v_assign
  from public.cutting_assignments
  where order_item_id = p_order_item_id and user_id = v_user_id;

  if not found then
    raise exception 'Item belum di-assign ke tukang potong. Assign dulu sebelum menandai selesai.';
  end if;

  -- Cek apakah item membutuhkan kain gudang
  select exists (
    select 1 from public.order_item_fabrics where order_item_id = p_order_item_id
  ) into v_needs_fabric;

  -- GATE CHECK: jika butuh kain dan belum diserahkan (material_dispatched_at IS NULL)
  if v_needs_fabric and v_assign.material_dispatched_at is null then
    if not coalesce(p_force, false) then
      raise exception
        'Kain belum diserahkan oleh gudang untuk item ini (material_dispatched_at masih kosong). '
        'Konfirmasi pengeluaran kain di Gudang terlebih dahulu, atau gunakan otorisasi Supervisor (p_force=true).';
    end if;

    if p_force_reason is null or trim(p_force_reason) = '' then
      raise exception 'Alasan Supervisor wajib diisi jika memulai/menyelesaikan pemotongan tanpa kain dari gudang.';
    end if;

    update public.cutting_assignments
    set
      force_started = true,
      force_reason  = p_force_reason
    where id = v_assign.id;
  end if;

  v_qty  := coalesce(p_cutting_qty, v_item.qty);
  v_rate := coalesce(v_item.cutting_cost_per_pcs, 0);

  if v_qty <= 0 then raise exception 'Cutting qty harus lebih dari 0'; end if;

  -- Update order_items
  update public.order_items
  set
    cutting_completed_at = now(),
    cutting_qty          = v_qty
  where id = p_order_item_id;

  -- Update cutting_assignment
  update public.cutting_assignments
  set status = 'done'
  where order_item_id = p_order_item_id;

  -- Generate piecework_task otomatis
  insert into public.piecework_tasks
    (user_id, staff_id, order_id, product_id, order_item_id, task_type,
     qty, rate_per_unit, total_wage, status, notes)
  values
    (v_user_id, v_assign.staff_id, v_item.order_id, v_item.product_id, p_order_item_id,
     'cutting', v_qty::integer, v_rate, v_qty * v_rate, 'completed',
     coalesce(p_notes, 'Dari penandaan item selesai dipotong'));
end;
$$;

revoke execute on function public.mark_cutting_item_done(uuid, numeric, text, boolean, text) from public, anon;
grant  execute on function public.mark_cutting_item_done(uuid, numeric, text, boolean, text) to authenticated;
