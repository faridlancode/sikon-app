-- =========================================================================
-- SIKon — Pembagian Worklog Jahit Prioritas & Fair Queue (v2)
-- =========================================================================

-- 1. Kolom pelacak rotasi giliran prioritas di tabel staff
alter table public.staff
  add column if not exists last_priority_assigned_at timestamptz null,
  add column if not exists priority_orders_count integer not null default 0;

comment on column public.staff.last_priority_assigned_at is 'Waktu terakhir staf ditugaskan pada order prioritas (untuk fair queue round-robin)';
comment on column public.staff.priority_orders_count is 'Jumlah order prioritas yang pernah ditugaskan kepada staf ini';

-- 2. Tipe distribusi pada batch pembagian jahit
alter table public.sewing_distribution_batches
  add column if not exists distribution_mode varchar not null default 'auto'
    check (distribution_mode in ('auto', 'manual')),
  add column if not exists target_order_type varchar not null default 'all'
    check (target_order_type in ('all', 'satuan', 'prioritas')),
  add column if not exists target_order_id uuid null references public.orders(id);

comment on column public.sewing_distribution_batches.distribution_mode is 'Mode distribusi: auto (otomatis sistem) atau manual (override supervisor)';
comment on column public.sewing_distribution_batches.target_order_type is 'Sasaran jenis order: all, satuan, atau prioritas';
comment on column public.sewing_distribution_batches.target_order_id is 'ID order jika distribusi ditujukan khusus untuk 1 order prioritas';

-- 3. RPC Pembagian Order Prioritas: distribute_priority_sewing_order
create or replace function public.distribute_priority_sewing_order(
  p_order_id uuid,
  p_manual_staff_ids uuid[] default null,     -- Jika null, sistem otomatis memilih fair queue
  p_manual_quotas numeric[] default null,      -- Jika null, sistem otomatis membagi rata
  p_notes text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_order         public.orders%rowtype;
  v_batch_id      uuid;
  v_total_qty     numeric := 0;
  v_num_tailors   integer;
  v_selected_ids  uuid[];
  v_quotas        numeric[];
  v_base_quota    numeric;
  v_remainder     numeric;
  v_item          record;
  v_item_remain   numeric;
  v_assign_qty    numeric;
  v_s             integer;
  v_staff_remain  numeric[];
  v_applied_rate  numeric;
  v_manual_sum    numeric := 0;
  i               integer;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select * into v_order from public.orders where id = p_order_id and user_id = v_user_id;
  if not found then raise exception 'Order tidak ditemukan'; end if;

  -- 1. Hitung total sisa item yang siap jahit di order ini
  select coalesce(sum(
    oi.qty - coalesce((
      select sum(sa.assigned_qty) from public.sewing_assignments sa
      where sa.order_item_id = oi.id and sa.user_id = v_user_id
    ), 0)
  ), 0)
  into v_total_qty
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.user_id = v_user_id
    and oi.ready_for_sewing_at is not null;

  if v_total_qty <= 0 then
    raise exception 'Tidak ada item siap jahit yang tersisa pada order ini';
  end if;

  -- 2. Tentukan penjahit & kuota (Manual vs Otomatis)
  if p_manual_staff_ids is not null and array_length(p_manual_staff_ids, 1) > 0 then
    -- Jalur Manual Override Supervisor
    v_selected_ids := p_manual_staff_ids;
    v_quotas       := p_manual_quotas;
    v_num_tailors  := array_length(v_selected_ids, 1);

    if v_quotas is null or array_length(v_quotas, 1) <> v_num_tailors then
      raise exception 'Jumlah kuota manual harus sama dengan jumlah penjahit yang dipilih';
    end if;

    for i in 1..v_num_tailors loop
      if v_quotas[i] <= 0 then
        raise exception 'Kuota untuk setiap penjahit harus lebih dari 0 pcs';
      end if;
      v_manual_sum := v_manual_sum + v_quotas[i];
    end loop;

    if v_manual_sum <> v_total_qty then
      raise exception 'Total kuota manual (% pcs) tidak sesuai dengan total sisa antrian order (% pcs)', v_manual_sum, v_total_qty;
    end if;
  else
    -- Jalur Otomatis: Batas minimal 5 pcs/orang, maks 3 penjahit
    v_num_tailors := least(3, greatest(1, floor(v_total_qty / 5)::integer));

    -- Ambil penjahit aktif dengan giliran prioritas paling lama & beban berjalan terendah
    select array_agg(s.id)
    into v_selected_ids
    from (
      select s.id
      from public.staff s
      left join (
        select sa.staff_id, sum(sa.assigned_qty - sa.qc_passed_qty) as current_load
        from public.sewing_assignments sa
        where sa.user_id = v_user_id and sa.status <> 'completed'
        group by sa.staff_id
      ) loads on loads.staff_id = s.id
      where s.user_id = v_user_id
        and s.wage_type = 'piecework'
        and s.is_active = true
        and (lower(s.role) like '%jahit%' or lower(s.role) like '%sewing%' or lower(s.role) like '%penjahit%')
      order by s.last_priority_assigned_at asc nulls first, coalesce(loads.current_load, 0) asc, s.name asc
      limit v_num_tailors
    ) s;

    if v_selected_ids is null or array_length(v_selected_ids, 1) = 0 then
      raise exception 'Tidak ada penjahit aktif yang tersedia';
    end if;

    v_num_tailors := array_length(v_selected_ids, 1);
    v_base_quota  := floor(v_total_qty / v_num_tailors);
    v_remainder   := v_total_qty - (v_base_quota * v_num_tailors);

    v_quotas := array_fill(v_base_quota, array[v_num_tailors]);
    for i in 1..v_remainder::integer loop
      v_quotas[i] := v_quotas[i] + 1;
    end loop;
  end if;

  v_staff_remain := v_quotas;

  -- 3. Buat Batch
  insert into public.sewing_distribution_batches
    (user_id, pool_qty_total, staff_count, notes, distribution_mode, target_order_type, target_order_id)
  values
    (v_user_id, v_total_qty, v_num_tailors, p_notes,
     case when p_manual_staff_ids is not null then 'manual' else 'auto' end,
     'prioritas', p_order_id)
  returning id into v_batch_id;

  -- 4. Distribusikan item campuran ke penjahit terpilih
  v_s := 1;
  for v_item in
    select
      oi.id,
      oi.product_id,
      (oi.qty - coalesce((
        select sum(sa.assigned_qty)
        from public.sewing_assignments sa
        where sa.order_item_id = oi.id and sa.user_id = v_user_id
      ), 0)) as remain_qty
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.user_id = v_user_id
      and oi.ready_for_sewing_at is not null
    order by oi.created_at asc
  loop
    if v_item.remain_qty > 0 then
      v_item_remain := v_item.remain_qty;

      -- Ambil tarif jahit produk (order prioritas menggunakan tarif standar tanpa surcharge)
      select coalesce(p.sewing_cost_per_pcs, 0) into v_applied_rate
      from public.products p where p.id = v_item.product_id;

      while v_item_remain > 0 loop
        while v_s <= v_num_tailors and v_staff_remain[v_s] <= 0 loop
          v_s := v_s + 1;
        end loop;

        if v_s > v_num_tailors then exit; end if;

        v_assign_qty := least(v_item_remain, v_staff_remain[v_s]);

        insert into public.sewing_assignments (
          user_id, order_item_id, staff_id, batch_id, assigned_qty, applied_sewing_rate, status
        ) values (
          v_user_id, v_item.id, v_selected_ids[v_s], v_batch_id, v_assign_qty, v_applied_rate, 'assigned'
        );

        v_item_remain       := v_item_remain - v_assign_qty;
        v_staff_remain[v_s] := v_staff_remain[v_s] - v_assign_qty;
      end loop;
    end if;
  end loop;

  -- 5. Update tracking rotasi prioritas pada penjahit yang terpilih
  update public.staff
  set last_priority_assigned_at = now(),
      priority_orders_count     = priority_orders_count + 1
  where id = any(v_selected_ids);

  return v_batch_id;
end;
$$;

revoke execute on function public.distribute_priority_sewing_order(uuid, uuid[], numeric[], text) from public, anon;
grant execute on function public.distribute_priority_sewing_order(uuid, uuid[], numeric[], text) to authenticated;

-- 4. UPDATE distribute_sewing_work: Dukung target_order_type (misal khusus 'satuan' atau 'all')
create or replace function public.distribute_sewing_work(
  p_order_item_ids uuid[] default null,  -- null = ambil semua yang ready & belum fully-assigned
  p_notes text default null,
  p_target_order_type varchar default null -- 'satuan', 'prioritas', atau null / 'all'
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
  left join public.orders o on o.id = oi.order_id
  where oi.user_id = v_user_id
    and oi.ready_for_sewing_at is not null
    and (p_order_item_ids is null or oi.id = any(p_order_item_ids))
    and (p_target_order_type is null or p_target_order_type = 'all' or o.order_type = p_target_order_type)
    and oi.qty > coalesce((
      select sum(sa3.assigned_qty)
      from public.sewing_assignments sa3
      where sa3.order_item_id = oi.id and sa3.user_id = v_user_id
    ), 0);

  if v_pool_total <= 0 then
    raise exception 'Tidak ada pcs yang siap di-assign pada pool ini.';
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
  insert into public.sewing_distribution_batches
    (user_id, pool_qty_total, staff_count, notes, distribution_mode, target_order_type)
  values
    (v_user_id, v_pool_total, v_staff_count, p_notes, 'auto', coalesce(p_target_order_type, 'all'))
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
      and (p_target_order_type is null or p_target_order_type = 'all' or o.order_type = p_target_order_type)
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

revoke execute on function public.distribute_sewing_work(uuid[], text, varchar) from public, anon;
grant execute on function public.distribute_sewing_work(uuid[], text, varchar) to authenticated;
