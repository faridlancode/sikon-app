-- =========================================================================
-- SIKon — Fix distribute_sewing_work: column names & assignment insert
-- =========================================================================
-- 1. Fix column name in sewing_distribution_batches: pool_qty_total (bukan total_qty)
-- 2. Hapus kolom 'notes' dari insert sewing_assignments karena tabel
--    sewing_assignments tidak memiliki kolom 'notes' (hanya ada di batches).
-- =========================================================================

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
  i               integer;
  j               integer;
  v_min_load      numeric;
  v_min_idx       integer;
  v_curr_load     numeric;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  -- ── Kumpulkan penjahit aktif: wage_type='piecework', role mengandung kata 'jahit'/'sewing'/'penjahit'
  -- Filter ketat berdasarkan role agar tukang potong (piecework juga) tidak ikut terdistribusi.
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

  -- Jika tidak ada penjahit aktif sama sekali, error dengan pesan yang informatif
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
  -- Pool = order_items yang ready_for_sewing_at IS NOT NULL & masih ada sisa belum di-assign
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

  -- Semua dapat base quota dulu
  for i in 1..v_staff_count loop
    v_staff_quotas[i] := v_base_quota;
  end loop;

  -- Sisa (mod) diberikan ke penjahit dengan beban berjalan paling kecil
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
    -- Naikkan beban virtual supaya loop berikutnya distribusi ke orang berbeda
    v_staff_loads[v_min_idx] := v_staff_loads[v_min_idx] + 1;
  end loop;

  -- Inisialisasi remaining quota = total quota
  for i in 1..v_staff_count loop
    v_staff_remain[i] := v_staff_quotas[i];
  end loop;

  -- ── Buat batch ───────────────────────────────────────────────────────────
  insert into public.sewing_distribution_batches (user_id, pool_qty_total, staff_count, notes)
  values (v_user_id, v_pool_total, v_staff_count, p_notes)
  returning id into v_batch_id;

  -- ── Iterasi pool & assign ke penjahit ────────────────────────────────────
  v_s := 1;  -- mulai dari penjahit pertama

  for v_pool in
    select
      oi.id            as order_item_id,
      oi.qty           as total_qty,
      coalesce((
        select sum(sa4.assigned_qty)
        from public.sewing_assignments sa4
        where sa4.order_item_id = oi.id and sa4.user_id = v_user_id
      ), 0)            as already_assigned
    from public.order_items oi
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

    while v_pool_item_remaining > 0 loop
      -- Skip penjahit yang sudah habis kuotanya
      while v_s <= v_staff_count and v_staff_remain[v_s] <= 0 loop
        v_s := v_s + 1;
      end loop;

      -- Kalau semua staff sudah habis kuota, berhenti
      if v_s > v_staff_count then
        exit;
      end if;

      -- Berikan min(sisa item, remaining quota staff ini)
      v_assign_qty := least(v_pool_item_remaining, v_staff_remain[v_s]);

      insert into public.sewing_assignments
        (user_id, order_item_id, staff_id, batch_id, assigned_qty, status)
      values
        (v_user_id, v_pool.order_item_id, v_staff_ids[v_s], v_batch_id,
         v_assign_qty, 'assigned');

      v_pool_item_remaining     := v_pool_item_remaining - v_assign_qty;
      v_staff_remain[v_s]       := v_staff_remain[v_s] - v_assign_qty;

      -- Kalau kuota penjahit ini habis, maju ke penjahit berikutnya
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
