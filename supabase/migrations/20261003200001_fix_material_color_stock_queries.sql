-- =========================================================================
-- SIKon — Migration: Perbaikan Deteksi Stok Material Berwarna (Material Colors)
-- =========================================================================
-- 1. Perbarui check_sewing_material_stock: Deteksi total stok dari material_colors
-- 2. Perbarui dispatch_sewing_materials: Validasi & pemotongan stok pada material_colors
-- =========================================================================

-- 1. Helper RPC: check_sewing_material_stock (Mendukung Material Colors)
create or replace function public.check_sewing_material_stock(
  p_sewing_assignment_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_assignment    record;
  v_mat           record;
  v_needed        numeric;
  v_curr_stock    numeric;
  v_result        jsonb := '[]'::jsonb;
  v_all_ok        boolean := true;
  v_colors_info   jsonb;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select sa.assigned_qty, oi.product_id, oi.id as order_item_id
  into v_assignment
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  where sa.id = p_sewing_assignment_id and sa.user_id = v_user_id;

  if not found then raise exception 'Penugasan jahit tidak ditemukan'; end if;

  for v_mat in
    select
      pm.material_id,
      m.name as mat_name,
      pm.quantity as bom_qty_per_pcs,
      m.unit,
      case
        when exists(select 1 from public.material_colors mc where mc.material_id = m.id and mc.is_active = true)
        then coalesce((select sum(mc.stock_qty) from public.material_colors mc where mc.material_id = m.id and mc.is_active = true), 0)
        else coalesce(m.stock_qty, 0)
      end as effective_stock,
      exists(select 1 from public.material_colors mc where mc.material_id = m.id and mc.is_active = true) as has_colors
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed := v_assignment.assigned_qty * v_mat.bom_qty_per_pcs;
    v_curr_stock := v_mat.effective_stock;

    if v_curr_stock < v_needed then
      v_all_ok := false;
    end if;

    -- Ringkasan variasi warna jika ada
    select jsonb_agg(jsonb_build_object('color_name', color_name, 'stock_qty', stock_qty))
    into v_colors_info
    from public.material_colors
    where material_id = v_mat.material_id and is_active = true;

    v_result := v_result || jsonb_build_object(
      'material_id',     v_mat.material_id,
      'material_name',   v_mat.mat_name,
      'needed_qty',      v_needed,
      'stock_qty',       v_curr_stock,
      'unit',            v_mat.unit,
      'has_colors',      v_mat.has_colors,
      'color_breakdown', coalesce(v_colors_info, '[]'::jsonb),
      'is_sufficient',   (v_curr_stock >= v_needed)
    );
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

-- 2. RPC: dispatch_sewing_materials (Mendukung Pemotongan Stok dari material_colors)
create or replace function public.dispatch_sewing_materials(
  p_sewing_assignment_id uuid,
  p_recorded_by          uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_assignment    record;
  v_mat           record;
  v_needed_qty    numeric;
  v_dispatched    jsonb := '[]'::jsonb;
  v_mov_id        uuid;
  v_rem_qty       numeric;
  v_col_rec       record;
  v_deduct        numeric;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select
    sa.*,
    oi.product_id,
    st.name as staff_name,
    o.order_id as order_code
  into v_assignment
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  join public.orders o on o.id = oi.order_id
  join public.staff st on st.id = sa.staff_id
  where sa.id = p_sewing_assignment_id and sa.user_id = v_user_id;

  if not found then raise exception 'Penugasan jahit tidak ditemukan'; end if;

  if v_assignment.material_dispatched_at is not null then
    return jsonb_build_object('success', true, 'assignment_id', p_sewing_assignment_id, 'already_dispatched', true);
  end if;

  -- 1. Validasi ketersediaan stok seluruh bahan (Wajib lengkap semua)
  for v_mat in
    select
      pm.material_id,
      m.name as mat_name,
      pm.quantity as bom_qty_per_pcs,
      m.unit,
      case
        when exists(select 1 from public.material_colors mc where mc.material_id = m.id and mc.is_active = true)
        then coalesce((select sum(mc.stock_qty) from public.material_colors mc where mc.material_id = m.id and mc.is_active = true), 0)
        else coalesce(m.stock_qty, 0)
      end as effective_stock
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed_qty := v_assignment.assigned_qty * v_mat.bom_qty_per_pcs;
    if v_mat.effective_stock < v_needed_qty then
      raise exception
        'Stok tidak cukup untuk bahan "%": butuh % %, tersedia % %. Serah terima harus menunggu restock.',
        v_mat.mat_name, v_needed_qty, v_mat.unit, v_mat.effective_stock, v_mat.unit;
    end if;
  end loop;

  -- 2. Eksekusi pengeluaran bahan & pengurangan stok
  for v_mat in
    select
      pm.material_id,
      m.name as mat_name,
      pm.quantity as bom_qty_per_pcs,
      m.unit,
      exists(select 1 from public.material_colors mc where mc.material_id = m.id and mc.is_active = true) as has_colors
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed_qty := v_assignment.assigned_qty * v_mat.bom_qty_per_pcs;

    if v_mat.has_colors then
      -- Potong bertahap dari varian warna yang memiliki stok > 0
      v_rem_qty := v_needed_qty;
      for v_col_rec in
        select id, color_name, stock_qty
        from public.material_colors
        where material_id = v_mat.material_id and is_active = true and stock_qty > 0
        order by stock_qty desc
      loop
        if v_rem_qty <= 0 then exit; end if;

        v_deduct := least(v_rem_qty, v_col_rec.stock_qty);

        update public.material_colors
        set stock_qty = stock_qty - v_deduct
        where id = v_col_rec.id;

        insert into public.stock_movements (
          user_id, material_id, material_color_id, movement_type, source_type, source_id,
          sewing_assignment_id, qty, unit, status, confirmed_at, taken_by, recorded_by, notes
        ) values (
          v_user_id, v_mat.material_id, v_col_rec.id, 'out', 'order_consumption',
          v_assignment.order_item_id, p_sewing_assignment_id, v_deduct, v_mat.unit,
          'confirmed', now(), v_assignment.staff_id, p_recorded_by,
          'Serah bahan jahit SPK ' || v_assignment.order_code || ' → ' || v_assignment.staff_name || ' (' || v_col_rec.color_name || ')'
        ) returning id into v_mov_id;

        v_rem_qty := v_rem_qty - v_deduct;
      end loop;
    else
      -- Potong langsung dari stok master material
      insert into public.stock_movements (
        user_id, material_id, movement_type, source_type, source_id,
        sewing_assignment_id, qty, unit, status, confirmed_at, taken_by, recorded_by, notes
      ) values (
        v_user_id, v_mat.material_id, 'out', 'order_consumption',
        v_assignment.order_item_id, p_sewing_assignment_id, v_needed_qty, v_mat.unit,
        'confirmed', now(), v_assignment.staff_id, p_recorded_by,
        'Serah bahan jahit SPK ' || v_assignment.order_code || ' → ' || v_assignment.staff_name
      ) returning id into v_mov_id;

      update public.materials
      set stock_qty = stock_qty - v_needed_qty
      where id = v_mat.material_id;
    end if;

    v_dispatched := v_dispatched || jsonb_build_object(
      'material_id',    v_mat.material_id,
      'material_name',  v_mat.mat_name,
      'qty_dispatched', v_needed_qty,
      'unit',           v_mat.unit
    );
  end loop;

  -- 3. Buka Gate Check Jahit
  update public.sewing_assignments
  set material_dispatched_at = now()
  where id = p_sewing_assignment_id and user_id = v_user_id;

  return jsonb_build_object(
    'success',       true,
    'assignment_id', p_sewing_assignment_id,
    'dispatched',    v_dispatched
  );
end;
$$;

revoke execute on function public.dispatch_sewing_materials(uuid, uuid) from public, anon;
grant  execute on function public.dispatch_sewing_materials(uuid, uuid) to authenticated;
