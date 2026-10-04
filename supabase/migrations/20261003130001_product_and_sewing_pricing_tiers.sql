-- =========================================================================
-- SIKon — Product & Sewing Pricing Tiers (Satuan vs Prioritas)
-- =========================================================================

-- 1. ORDERS: Kategori Order (Satuan < 6 pcs vs Prioritas >= 6 pcs) & Manual Override Flag
alter table public.orders
  add column if not exists order_type varchar not null default 'prioritas'
    check (order_type in ('satuan', 'prioritas')),
  add column if not exists is_order_type_manual_override boolean not null default false;

comment on column public.orders.order_type is 'Kategori order: satuan (<6 pcs) atau prioritas (>=6 pcs)';
comment on column public.orders.is_order_type_manual_override is 'True jika admin sengaja mengubah kategori order secara manual';

-- Backfill order_type untuk order existing berdasarkan total qty
update public.orders o
set order_type = case
  when coalesce((select sum(qty) from public.order_items oi where oi.order_id = o.id), 0) < 6 then 'satuan'
  else 'prioritas'
end
where o.order_type = 'prioritas' and o.is_order_type_manual_override = false;

-- 2. PRODUCTS: Harga Jual Satuan & Prioritas
alter table public.products
  add column if not exists price_satuan numeric null check (price_satuan >= 0),
  add column if not exists price_prioritas numeric null check (price_prioritas >= 0);

comment on column public.products.price_satuan is 'Harga jual rekomendasi untuk order tipe satuan (<6 pcs)';
comment on column public.products.price_prioritas is 'Harga jual rekomendasi untuk order tipe prioritas (>=6 pcs)';

-- Backfill price_prioritas dari default_price jika ada
update public.products
set price_prioritas = default_price
where price_prioritas is null and default_price is not null;

-- 3. COMPANY_SETTINGS: Surcharge Upah Jahit Satuan (+Rp 10.000)
alter table public.company_settings
  add column if not exists sewing_satuan_surcharge numeric not null default 10000 check (sewing_satuan_surcharge >= 0);

comment on column public.company_settings.sewing_satuan_surcharge is 'Besaran tambahan upah jahit per pcs untuk order satuan (default Rp 10.000)';

-- 4. SEWING_ASSIGNMENTS: Snapshot Tarif Upah Jahit Aktual
alter table public.sewing_assignments
  add column if not exists applied_sewing_rate numeric null check (applied_sewing_rate >= 0);

comment on column public.sewing_assignments.applied_sewing_rate is 'Snapshot tarif upah jahit per pcs yang berlaku (termasuk surcharge satuan jika berlaku)';

-- 5. FUNCTION: calculate_order_type
create or replace function public.calculate_order_type(p_total_qty numeric)
returns varchar language plpgsql immutable as $$
begin
  if coalesce(p_total_qty, 0) < 6 then
    return 'satuan';
  else
    return 'prioritas';
  end if;
end;
$$;

-- 6. UPDATE DISTRIBUTE_SEWING_WORK: Hitung & Snapshot applied_sewing_rate
create or replace function public.distribute_sewing_work(
  p_order_item_ids uuid[] default null,  -- null = ambil semua yang ready & belum fully-assigned
  p_notes text default null
)
returns uuid  -- returns batch_id
language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_batch_id      uuid;
  v_pool_total    numeric := 0;
  v_n             integer;
  v_base_quota    numeric;
  v_remainder     numeric;

  -- cursor untuk pool order_items
  v_pool          record;
  -- array staff yang aktif (id, current_load, quota, remaining_quota)
  v_staff_ids     uuid[];
  v_staff_loads   numeric[];
  v_staff_quotas  numeric[];
  v_staff_remain  numeric[];
  v_staff_count   integer := 0;

  v_pool_item_remaining  numeric;  -- sisa qty dari 1 pool item yang belum di-assign ke staff
  v_s             integer;         -- staff index (1-based)
  v_assign_qty    numeric;
  v_applied_rate  numeric;
  v_surcharge     numeric := 10000;
  i               integer;
  j               integer;
  v_min_load      numeric;
  v_min_idx       integer;
  v_curr_load     numeric;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  -- Ambil setting surcharge jahit satuan
  select coalesce(sewing_satuan_surcharge, 10000)
  into v_surcharge
  from public.company_settings
  where user_id = v_user_id;

  if v_surcharge is null then
    v_surcharge := 10000;
  end if;

  -- ── Kumpulkan penjahit aktif: wage_type='piecework', role mengandung kata 'jahit'/'sewing'/'penjahit'
  select array_agg(s.id order by s.name), count(*)
  into v_staff_ids, v_n
  from public.staff s
  where s.user_id = v_user_id
    and s.wage_type = 'piecework'
    and s.is_active = true
    and (
      lower(s.role) like '%jahit%'
      or lower(s.role) like '%sewing%'
      or lower(s.role) like '%penjahit%'
    );

  if v_n is null or v_n = 0 then
    raise exception 'Tidak ada penjahit aktif ditemukan. Pastikan ada staf dengan role yang mengandung "Penjahit" dan wage_type="piecework" yang aktif.';
  end if;

  v_staff_count := v_n;

  -- Inisialisasi array dengan beban berjalan (assigned - qc_passed, untuk assignments belum completed)
  v_staff_loads  := array_fill(0::numeric, array[v_staff_count]);
  v_staff_quotas := array_fill(0::numeric, array[v_staff_count]);
  v_staff_remain := array_fill(0::numeric, array[v_staff_count]);

  for i in 1..v_staff_count loop
    select coalesce(sum(sa.assigned_qty - sa.qc_passed_qty), 0)
    into v_curr_load
    from public.sewing_assignments sa
    where sa.user_id = v_user_id
      and sa.staff_id = v_staff_ids[i]
      and sa.status <> 'completed';

    v_staff_loads[i] := v_curr_load;
  end loop;

  -- ── Hitung pool total ─────────────────────────────────────────────────────
  select coalesce(sum(
    oi.qty - coalesce((
      select sum(sa2.assigned_qty)
      from public.sewing_assignments sa2
      where sa2.order_item_id = oi.id and sa2.user_id = v_user_id
    ), 0)
  ), 0)
  into v_pool_total
  from public.order_items oi
  where oi.user_id = v_user_id
    and oi.ready_for_sewing_at is not null
    and (p_order_item_ids is null or oi.id = any(p_order_item_ids))
    and oi.qty > coalesce((
      select sum(sa3.assigned_qty)
      from public.sewing_assignments sa3
      where sa3.order_item_id = oi.id and sa3.user_id = v_user_id
    ), 0);

  if v_pool_total <= 0 then
    raise exception 'Tidak ada pcs yang siap di-assign. Pastikan order items sudah ditandai ready_for_sewing_at dan belum fully-assigned.';
  end if;

  -- ── Hitung kuota per penjahit ─────────────────────────────────────────────
  v_base_quota  := floor(v_pool_total / v_staff_count);
  v_remainder   := v_pool_total - (v_base_quota * v_staff_count);

  for i in 1..v_staff_count loop
    v_staff_quotas[i] := v_base_quota;
  end loop;

  for j in 1..v_remainder::integer loop
    v_min_load := v_staff_loads[1];
    v_min_idx  := 1;
    for i in 2..v_staff_count loop
      if v_staff_loads[i] < v_min_load then
        v_min_load := v_staff_loads[i];
        v_min_idx  := i;
      end if;
    end loop;
    v_staff_quotas[v_min_idx] := v_staff_quotas[v_min_idx] + 1;
    v_staff_loads[v_min_idx]  := v_staff_loads[v_min_idx] + 1;
  end loop;

  for i in 1..v_staff_count loop
    v_staff_remain[i] := v_staff_quotas[i];
  end loop;

  -- ── Buat batch ───────────────────────────────────────────────────────────
  insert into public.sewing_distribution_batches (user_id, pool_qty_total, staff_count, notes)
  values (v_user_id, v_pool_total, v_staff_count, p_notes)
  returning id into v_batch_id;

  -- ── Iterasi pool & assign ke penjahit ────────────────────────────────────
  v_s := 1;

  for v_pool in
    select
      oi.id            as order_item_id,
      oi.qty           as total_qty,
      oi.order_id      as order_id,
      oi.product_id    as product_id,
      coalesce(p.sewing_cost_per_pcs, 0) as base_sewing_cost,
      coalesce(o.order_type, 'prioritas') as order_type,
      coalesce((
        select sum(sa4.assigned_qty)
        from public.sewing_assignments sa4
        where sa4.order_item_id = oi.id and sa4.user_id = v_user_id
      ), 0)            as already_assigned
    from public.order_items oi
    left join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    where oi.user_id = v_user_id
      and oi.ready_for_sewing_at is not null
      and (p_order_item_ids is null or oi.id = any(p_order_item_ids))
      and oi.qty > coalesce((
        select sum(sa5.assigned_qty)
        from public.sewing_assignments sa5
        where sa5.order_item_id = oi.id and sa5.user_id = v_user_id
      ), 0)
    order by oi.ready_for_sewing_at asc, oi.created_at asc
  loop
    v_pool_item_remaining := v_pool.total_qty - v_pool.already_assigned;

    -- Hitung applied_sewing_rate (standar + surcharge jika satuan)
    v_applied_rate := v_pool.base_sewing_cost + case
      when v_pool.order_type = 'satuan' then v_surcharge
      else 0
    end;

    while v_pool_item_remaining > 0 loop
      while v_s <= v_staff_count and v_staff_remain[v_s] <= 0 loop
        v_s := v_s + 1;
      end loop;

      if v_s > v_staff_count then
        exit;
      end if;

      v_assign_qty := least(v_pool_item_remaining, v_staff_remain[v_s]);

      insert into public.sewing_assignments
        (user_id, order_item_id, staff_id, batch_id, assigned_qty, applied_sewing_rate, status)
      values
        (v_user_id, v_pool.order_item_id, v_staff_ids[v_s], v_batch_id,
         v_assign_qty, v_applied_rate, 'assigned');

      v_pool_item_remaining     := v_pool_item_remaining - v_assign_qty;
      v_staff_remain[v_s]       := v_staff_remain[v_s] - v_assign_qty;

      if v_staff_remain[v_s] <= 0 then
        v_s := v_s + 1;
      end if;
    end loop;

    exit when v_s > v_staff_count;
  end loop;

  return v_batch_id;
end;
$$;

revoke execute on function public.distribute_sewing_work(uuid[], text) from public, anon;
grant execute on function public.distribute_sewing_work(uuid[], text) to authenticated;

-- 7. UPDATE RECORD_QC_CHECK: Gunakan applied_sewing_rate saat insert piecework_tasks
create or replace function public.record_qc_check(
  p_assignment_id  uuid,
  p_passed_qty     numeric,
  p_rejected_qty   numeric,
  p_notes          text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_assignment   public.sewing_assignments%rowtype;
  v_order_item   record;
  v_rate         numeric;
  v_new_passed   numeric;
  v_new_rejected numeric;
  v_new_status   varchar;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  if coalesce(p_passed_qty, 0) + coalesce(p_rejected_qty, 0) <= 0 then
    raise exception 'passed_qty + rejected_qty harus lebih dari 0';
  end if;
  if coalesce(p_passed_qty, 0) < 0 or coalesce(p_rejected_qty, 0) < 0 then
    raise exception 'Qty tidak boleh negatif';
  end if;

  select * into v_assignment
  from public.sewing_assignments
  where id = p_assignment_id and user_id = v_user_id;

  if not found then raise exception 'Bundel jahit tidak ditemukan'; end if;

  -- Ambil product_id & sewing_cost_per_pcs via order_item → product
  select oi.product_id, p.sewing_cost_per_pcs
  into v_order_item
  from public.order_items oi
  left join public.products p on p.id = oi.product_id
  where oi.id = v_assignment.order_item_id;

  -- Gunakan applied_sewing_rate dari sewing_assignments jika tersedia, fallback ke products.sewing_cost_per_pcs
  v_rate := coalesce(v_assignment.applied_sewing_rate, v_order_item.sewing_cost_per_pcs, 0);

  -- Hitung kumulatif baru
  v_new_passed   := v_assignment.qc_passed_qty + coalesce(p_passed_qty, 0);
  v_new_rejected := v_assignment.qc_rejected_qty + coalesce(p_rejected_qty, 0);

  -- Tentukan status baru
  if v_new_passed >= v_assignment.assigned_qty then
    v_new_status := 'completed';
  else
    v_new_status := 'in_progress';
  end if;

  -- Simpan QC check record
  insert into public.qc_checks
    (user_id, sewing_assignment_id, passed_qty, rejected_qty, notes)
  values
    (v_user_id, p_assignment_id, coalesce(p_passed_qty, 0), coalesce(p_rejected_qty, 0), p_notes);

  -- Update kumulatif di sewing_assignments
  update public.sewing_assignments
  set
    qc_passed_qty   = v_new_passed,
    qc_rejected_qty = v_new_rejected,
    status          = v_new_status
  where id = p_assignment_id;

  -- Kalau ada qty yang lolos QC, insert piecework_task baru dengan rate aktual
  if coalesce(p_passed_qty, 0) > 0 then
    insert into public.piecework_tasks
      (user_id, staff_id, order_id, product_id, task_type, qty, rate_per_unit, total_wage, status,
       sewing_assignment_id, notes)
    select
      v_user_id,
      v_assignment.staff_id,
      oi.order_id,
      oi.product_id,
      'sewing',
      p_passed_qty,
      v_rate,
      p_passed_qty * v_rate,
      'completed',
      p_assignment_id,
      coalesce(p_notes, 'Dari QC check')
    from public.order_items oi
    where oi.id = v_assignment.order_item_id;
  end if;
end;
$$;

revoke execute on function public.record_qc_check(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.record_qc_check(uuid, numeric, numeric, text) to authenticated;
