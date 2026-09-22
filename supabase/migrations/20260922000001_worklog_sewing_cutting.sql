-- =========================================================================
-- SIKon — Worklog Jahit & Potong
-- =========================================================================
-- Desain lengkap: docs/DESAIN_WORKLOG_JAHIT.md
-- Tujuan: Pembagian kerja jahit (pool → distribusi rata pcs → QC-validated payment)
--         dan worklog potong (assignment order → setoran mingguan → auto piecework_tasks)

-- =========================================================================
-- 1. PERUBAHAN TABEL EXISTING
-- =========================================================================

-- order_items: tandai kapan bordir selesai & item masuk pool jahit
alter table public.order_items
  add column if not exists ready_for_sewing_at timestamptz null;

comment on column public.order_items.ready_for_sewing_at
  is 'Diisi saat bordir selesai — item masuk pool jahit. NULL = belum siap jahit.';

-- piecework_tasks: perluas status CHECK untuk mendukung paid_manual (susulan cash)
-- HARUS drop constraint lama dulu, karena constraint CHECK tidak bisa di-alter in-place.
alter table public.piecework_tasks
  drop constraint if exists piecework_tasks_status_check;

alter table public.piecework_tasks
  add constraint piecework_tasks_status_check
    check (status in ('pending', 'completed', 'paid', 'paid_manual'));

-- piecework_tasks: kolom penghubung ke worklog system
alter table public.piecework_tasks
  add column if not exists sewing_assignment_id uuid null,
  add column if not exists cutting_report_line_id uuid null,
  add column if not exists manual_paid_at timestamptz null,
  add column if not exists manual_paid_note text null;

-- =========================================================================
-- 2. TABEL BARU — JAHIT
-- =========================================================================

-- Jejak audit tiap kali "Bagikan Kerja" ditekan
create table if not exists public.sewing_distribution_batches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id),
  distributed_at  timestamptz not null default now(),
  pool_qty_total  numeric not null,
  staff_count     integer not null,
  notes           text,
  created_at      timestamptz not null default now(),
  constraint sewing_distribution_batches_pool_qty_check check (pool_qty_total > 0),
  constraint sewing_distribution_batches_staff_count_check check (staff_count > 0)
);
alter table public.sewing_distribution_batches enable row level security;
create policy "Manage own sewing distribution batches" on public.sewing_distribution_batches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_sewing_dist_batches_user on public.sewing_distribution_batches(user_id);
create index if not exists idx_sewing_dist_batches_distributed_at on public.sewing_distribution_batches(distributed_at desc);

-- Bundel jatah kerja: 1 potongan qty dari 1 order_item untuk 1 penjahit
create table if not exists public.sewing_assignments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id),
  order_item_id    uuid not null references public.order_items(id) on delete cascade,
  staff_id         uuid not null references public.staff(id) on delete cascade,
  batch_id         uuid references public.sewing_distribution_batches(id) on delete set null,
  assigned_qty     numeric not null,       -- target pcs bundel ini (tetap, tidak berkurang oleh reject)
  sewn_qty         numeric not null default 0,    -- progres dijahit (opsional, untuk monitoring)
  qc_passed_qty    numeric not null default 0,    -- kumulatif lolos QC → dasar pembayaran
  qc_rejected_qty  numeric not null default 0,    -- kumulatif reject, menunggu rework
  status           varchar not null default 'assigned',
  created_at       timestamptz not null default now(),
  constraint sewing_assignments_assigned_qty_check check (assigned_qty > 0),
  constraint sewing_assignments_sewn_qty_check check (sewn_qty >= 0),
  constraint sewing_assignments_qc_passed_qty_check check (qc_passed_qty >= 0),
  constraint sewing_assignments_qc_rejected_qty_check check (qc_rejected_qty >= 0),
  constraint sewing_assignments_status_check check (status in ('assigned', 'in_progress', 'completed'))
);
alter table public.sewing_assignments enable row level security;
create policy "Manage own sewing assignments" on public.sewing_assignments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_sewing_assignments_user on public.sewing_assignments(user_id);
create index if not exists idx_sewing_assignments_order_item on public.sewing_assignments(order_item_id);
create index if not exists idx_sewing_assignments_staff on public.sewing_assignments(staff_id);
create index if not exists idx_sewing_assignments_status on public.sewing_assignments(status);
create index if not exists idx_sewing_assignments_batch on public.sewing_assignments(batch_id);

comment on column public.sewing_assignments.assigned_qty
  is 'Target pcs bundel ini. Tetap, tidak berkurang oleh QC reject.';
comment on column public.sewing_assignments.qc_passed_qty
  is 'Kumulatif lolos QC. Menjadi dasar pembayaran.';

-- Riwayat setiap kali QC memeriksa satu bundel (bisa berkali-kali kalau ada rework)
create table if not exists public.qc_checks (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id),
  sewing_assignment_id  uuid not null references public.sewing_assignments(id) on delete cascade,
  checked_at            timestamptz not null default now(),
  passed_qty            numeric not null default 0,
  rejected_qty          numeric not null default 0,
  notes                 text,
  constraint qc_checks_passed_qty_check check (passed_qty >= 0),
  constraint qc_checks_rejected_qty_check check (rejected_qty >= 0),
  constraint qc_checks_at_least_one_check check (passed_qty + rejected_qty > 0)
);
alter table public.qc_checks enable row level security;
create policy "Manage own qc checks" on public.qc_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_qc_checks_assignment on public.qc_checks(sewing_assignment_id);
create index if not exists idx_qc_checks_user on public.qc_checks(user_id);

-- =========================================================================
-- 3. TABEL BARU — POTONG
-- =========================================================================

-- Assignment order → tukang potong (1 order = 1 penanggung jawab)
create table if not exists public.cutting_assignments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id),
  order_id     uuid not null references public.orders(id) on delete cascade,
  staff_id     uuid not null references public.staff(id) on delete cascade,
  assigned_at  timestamptz not null default now(),
  status       varchar not null default 'assigned',
  notes        text,
  constraint cutting_assignments_status_check check (status in ('assigned', 'reported', 'paid')),
  -- 1 order hanya boleh punya 1 assignment aktif (per user)
  constraint cutting_assignments_order_unique unique (user_id, order_id)
);
alter table public.cutting_assignments enable row level security;
create policy "Manage own cutting assignments" on public.cutting_assignments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_cutting_assignments_user on public.cutting_assignments(user_id);
create index if not exists idx_cutting_assignments_order on public.cutting_assignments(order_id);
create index if not exists idx_cutting_assignments_staff on public.cutting_assignments(staff_id);
create index if not exists idx_cutting_assignments_status on public.cutting_assignments(status);

-- Sesi setoran mingguan seorang tukang potong
create table if not exists public.cutting_weekly_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  staff_id      uuid not null references public.staff(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  report_date   date not null default current_date,
  total_qty     numeric not null default 0,
  status        varchar not null default 'draft',
  notes         text,
  created_at    timestamptz not null default now(),
  constraint cutting_weekly_reports_status_check check (status in ('draft', 'confirmed')),
  constraint cutting_weekly_reports_total_qty_check check (total_qty >= 0),
  constraint cutting_weekly_reports_period_check check (period_end >= period_start)
);
alter table public.cutting_weekly_reports enable row level security;
create policy "Manage own cutting weekly reports" on public.cutting_weekly_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_cutting_weekly_reports_user on public.cutting_weekly_reports(user_id);
create index if not exists idx_cutting_weekly_reports_staff on public.cutting_weekly_reports(staff_id);
create index if not exists idx_cutting_weekly_reports_status on public.cutting_weekly_reports(status);

-- Rincian per order dalam satu laporan potong
create table if not exists public.cutting_report_lines (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  report_id     uuid not null references public.cutting_weekly_reports(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  reported_qty  numeric not null,    -- diisi personalia sesuai laporan fisik tukang potong
  expected_qty  numeric not null,    -- snapshot qty order (dari cutting_assignments), buat pembanding
  notes         text,
  constraint cutting_report_lines_reported_qty_check check (reported_qty >= 0),
  constraint cutting_report_lines_expected_qty_check check (expected_qty >= 0)
);
alter table public.cutting_report_lines enable row level security;
create policy "Manage own cutting report lines" on public.cutting_report_lines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_cutting_report_lines_report on public.cutting_report_lines(report_id);
create index if not exists idx_cutting_report_lines_order on public.cutting_report_lines(order_id);

-- =========================================================================
-- 4. FK BELAKANGAN (circular dependency piecework_tasks ↔ sewing_assignments)
-- =========================================================================

alter table public.piecework_tasks
  add constraint piecework_tasks_sewing_assignment_id_fkey
    foreign key (sewing_assignment_id) references public.sewing_assignments(id) on delete set null;

alter table public.piecework_tasks
  add constraint piecework_tasks_cutting_report_line_id_fkey
    foreign key (cutting_report_line_id) references public.cutting_report_lines(id) on delete set null;

-- Index untuk kolom baru di piecework_tasks
create index if not exists idx_piecework_tasks_sewing_assignment on public.piecework_tasks(sewing_assignment_id);
create index if not exists idx_piecework_tasks_cutting_report_line on public.piecework_tasks(cutting_report_line_id);

-- =========================================================================
-- 5. RPC FUNCTIONS
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 5.1 mark_ready_for_sewing — tandai order_items siap masuk pool jahit
-- ---------------------------------------------------------------------------
create or replace function public.mark_ready_for_sewing(p_order_item_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  if p_order_item_ids is null or array_length(p_order_item_ids, 1) = 0 then
    raise exception 'Minimal 1 order item harus dipilih';
  end if;

  update public.order_items
  set ready_for_sewing_at = now()
  where id = any(p_order_item_ids)
    and user_id = v_user_id
    and ready_for_sewing_at is null;  -- idempotent: skip yang sudah ditandai
end;
$$;

-- ---------------------------------------------------------------------------
-- 5.2 distribute_sewing_work — algoritma distribusi rata pcs ke penjahit aktif
-- ---------------------------------------------------------------------------
-- Algoritma:
--   1. Hitung beban berjalan tiap penjahit aktif (wage_type='piecework', is_active=true)
--      = Σ(assigned_qty - qc_passed_qty) dari assignments yang belum 'completed'
--   2. base = floor(pool_qty_total / n); sisa mod n → ke penjahit beban terkecil dulu
--   3. Iterasi pool (urut ready_for_sewing_at ASC → order lama duluan), isi kuota tiap penjahit;
--      kalau kuota habis di tengah 1 order_item, pecah jadi 2 baris sewing_assignments
-- ---------------------------------------------------------------------------
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

  -- ── Kumpulkan penjahit aktif beserta beban berjalan ──────────────────────
  select array_agg(s.id order by s.name), count(*)
  into v_staff_ids, v_n
  from public.staff s
  where s.user_id = v_user_id
    and s.wage_type = 'piecework'
    and s.is_active = true;

  if v_n is null or v_n = 0 then
    raise exception 'Tidak ada penjahit aktif (wage_type=piecework) yang terdaftar';
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

  -- ── Buat batch ────────────────────────────────────────────────────────────
  insert into public.sewing_distribution_batches (user_id, pool_qty_total, staff_count, notes)
  values (v_user_id, v_pool_total, v_staff_count, p_notes)
  returning id into v_batch_id;

  -- ── Iterasi pool & assign ke penjahit ─────────────────────────────────────
  v_s := 1;  -- mulai dari staff pertama

  for v_pool in
    select
      oi.id as order_item_id,
      oi.qty - coalesce((
        select sum(sa4.assigned_qty)
        from public.sewing_assignments sa4
        where sa4.order_item_id = oi.id and sa4.user_id = v_user_id
      ), 0) as remaining_qty
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
    v_pool_item_remaining := v_pool.remaining_qty;

    while v_pool_item_remaining > 0 loop
      -- Lompat ke staff berikutnya kalau quota habis
      while v_staff_remain[v_s] <= 0 and v_s <= v_staff_count loop
        v_s := v_s + 1;
      end loop;
      exit when v_s > v_staff_count;

      -- Berapa pcs yang bisa diberikan ke staff ini dari item ini?
      v_assign_qty := least(v_pool_item_remaining, v_staff_remain[v_s]);

      insert into public.sewing_assignments
        (user_id, order_item_id, staff_id, batch_id, assigned_qty)
      values
        (v_user_id, v_pool.order_item_id, v_staff_ids[v_s], v_batch_id, v_assign_qty);

      v_pool_item_remaining    := v_pool_item_remaining - v_assign_qty;
      v_staff_remain[v_s] := v_staff_remain[v_s] - v_assign_qty;

      -- Kalau quota staff ini sudah habis, pindah ke staff berikutnya
      if v_staff_remain[v_s] <= 0 then
        v_s := v_s + 1;
      end if;
    end loop;

    exit when v_s > v_staff_count;
  end loop;

  return v_batch_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5.3 record_qc_check — simpan hasil QC, update kumulatif, insert piecework_task
-- ---------------------------------------------------------------------------
create or replace function public.record_qc_check(
  p_assignment_id  uuid,
  p_passed_qty     numeric,
  p_rejected_qty   numeric,
  p_notes          text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id    uuid := auth.uid();
  v_assignment public.sewing_assignments%rowtype;
  v_order_item record;
  v_product    record;
  v_rate       numeric;
  v_new_passed numeric;
  v_new_rejected numeric;
  v_new_status varchar;
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

  v_rate := coalesce(v_order_item.sewing_cost_per_pcs, 0);

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

  -- Kalau ada qty yang lolos QC, insert piecework_task baru
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

-- ---------------------------------------------------------------------------
-- 5.4 mark_sewing_manual_paid — tandai piecework_tasks sebagai paid_manual (susulan cash)
-- ---------------------------------------------------------------------------
create or replace function public.mark_sewing_manual_paid(
  p_piecework_task_ids uuid[],
  p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  if p_piecework_task_ids is null or array_length(p_piecework_task_ids, 1) = 0 then
    raise exception 'Pilih minimal 1 task untuk ditandai';
  end if;

  update public.piecework_tasks
  set
    status           = 'paid_manual',
    manual_paid_at   = now(),
    manual_paid_note = p_note
  where id = any(p_piecework_task_ids)
    and user_id = v_user_id
    and status = 'completed';  -- hanya yang belum dibayar sama sekali

  if not found then
    raise exception 'Tidak ada task yang memenuhi syarat (status=completed) untuk ditandai';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5.5 assign_cutting_order — assign order ke tukang potong
-- ---------------------------------------------------------------------------
create or replace function public.assign_cutting_order(
  p_order_id uuid,
  p_staff_id uuid,
  p_notes    text default null
)
returns public.cutting_assignments language plpgsql security definer set search_path = public as $$
declare
  v_user_id   uuid := auth.uid();
  v_result    public.cutting_assignments;
  v_order     public.orders;
  v_staff     public.staff;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select * into v_order from public.orders where id = p_order_id and user_id = v_user_id;
  if not found then raise exception 'Order tidak ditemukan'; end if;

  select * into v_staff from public.staff where id = p_staff_id and user_id = v_user_id;
  if not found then raise exception 'Staff tidak ditemukan'; end if;

  insert into public.cutting_assignments (user_id, order_id, staff_id, notes)
  values (v_user_id, p_order_id, p_staff_id, p_notes)
  on conflict (user_id, order_id) do update
    set staff_id = excluded.staff_id,
        notes    = excluded.notes,
        status   = 'assigned',
        assigned_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5.6 submit_cutting_report — buat laporan potong mingguan & generate piecework_tasks
-- ---------------------------------------------------------------------------
-- p_lines = jsonb array of { order_id, reported_qty, notes? }
-- Fungsi ini:
--   1. Buat cutting_weekly_report + cutting_report_lines
--   2. Hitung rate upah potong (proporsional ke item kalau multi-produk)
--   3. Insert piecework_tasks per baris laporan (task_type='cutting')
--   4. Update cutting_assignments → status='reported'
--   5. Return jsonb berisi report_id + warnings
-- ---------------------------------------------------------------------------
create or replace function public.submit_cutting_report(
  p_staff_id     uuid,
  p_period_start date,
  p_period_end   date,
  p_lines        jsonb,   -- [{order_id, reported_qty, notes?}]
  p_notes        text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id    uuid := auth.uid();
  v_report_id  uuid;
  v_line       jsonb;
  v_order_id   uuid;
  v_rep_qty    numeric;
  v_line_note  text;
  v_line_id    uuid;
  v_exp_qty    numeric;
  v_total_qty  numeric := 0;
  v_warnings   jsonb := '[]'::jsonb;

  -- Untuk kalkulasi rate potong
  v_order_total_qty  numeric;
  v_item             record;
  v_item_rate        numeric;
  v_item_wage        numeric;

  v_assignment_id uuid;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Minimal 1 baris laporan diperlukan';
  end if;
  if p_period_end < p_period_start then
    raise exception 'Tanggal akhir periode harus >= tanggal mulai';
  end if;

  -- Buat header laporan
  insert into public.cutting_weekly_reports
    (user_id, staff_id, period_start, period_end, report_date, status, notes)
  values
    (v_user_id, p_staff_id, p_period_start, p_period_end, current_date, 'confirmed', p_notes)
  returning id into v_report_id;

  -- Proses tiap baris
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_order_id  := (v_line->>'order_id')::uuid;
    v_rep_qty   := (v_line->>'reported_qty')::numeric;
    v_line_note := v_line->>'notes';

    if v_rep_qty < 0 then
      raise exception 'reported_qty tidak boleh negatif untuk order %', v_order_id;
    end if;

    -- Cari expected_qty dari cutting_assignment
    select ca.id, coalesce(sum(oi.qty), 0)
    into v_assignment_id, v_exp_qty
    from public.cutting_assignments ca
    join public.order_items oi on oi.order_id = ca.order_id and oi.user_id = ca.user_id
    where ca.order_id = v_order_id
      and ca.user_id = v_user_id
    group by ca.id;

    -- Kalau tidak ada assignment, pakai qty dari order sebagai expected
    if v_assignment_id is null then
      select coalesce(sum(oi2.qty), 0) into v_exp_qty
      from public.order_items oi2
      where oi2.order_id = v_order_id and oi2.user_id = v_user_id;

      -- Warning: order ini tidak ter-assign
      v_warnings := v_warnings || jsonb_build_object(
        'type', 'no_assignment',
        'order_id', v_order_id,
        'message', 'Order ini belum ter-assign ke tukang potong di sistem. Assignment otomatis dibuat.'
      );

      -- Auto-assign
      insert into public.cutting_assignments (user_id, order_id, staff_id, notes)
      values (v_user_id, v_order_id, p_staff_id, 'Auto-assign saat setoran')
      on conflict (user_id, order_id) do update set staff_id = excluded.staff_id
      returning id into v_assignment_id;
    end if;

    -- Warning: selisih signifikan (> 20%)
    if v_exp_qty > 0 and abs(v_rep_qty - v_exp_qty) / v_exp_qty > 0.2 then
      v_warnings := v_warnings || jsonb_build_object(
        'type', 'qty_mismatch',
        'order_id', v_order_id,
        'reported_qty', v_rep_qty,
        'expected_qty', v_exp_qty,
        'message', format('Selisih qty signifikan: dilaporkan %s, ekspektasi %s', v_rep_qty, v_exp_qty)
      );
    end if;

    -- Simpan baris laporan
    insert into public.cutting_report_lines
      (user_id, report_id, order_id, reported_qty, expected_qty, notes)
    values
      (v_user_id, v_report_id, v_order_id, v_rep_qty, coalesce(v_exp_qty, 0), v_line_note)
    returning id into v_line_id;

    v_total_qty := v_total_qty + v_rep_qty;

    -- Hitung & insert piecework_tasks per order_item (proporsional kalau multi-produk)
    select coalesce(sum(oi3.qty), 0) into v_order_total_qty
    from public.order_items oi3
    where oi3.order_id = v_order_id and oi3.user_id = v_user_id;

    for v_item in
      select
        oi4.id as order_item_id,
        oi4.qty,
        oi4.product_id,
        coalesce(p2.cutting_cost_per_pcs, 0) as rate
      from public.order_items oi4
      left join public.products p2 on p2.id = oi4.product_id
      where oi4.order_id = v_order_id and oi4.user_id = v_user_id
    loop
      -- Kalau multi-produk: proporsi qty item thd total order untuk split reported_qty
      if v_order_total_qty > 0 then
        v_item_rate := v_item.rate;
        v_item_wage := (v_rep_qty * (v_item.qty / v_order_total_qty)) * v_item_rate;

        -- Hanya insert kalau ada qty & ada rate
        if v_rep_qty * (v_item.qty / v_order_total_qty) > 0 then
          insert into public.piecework_tasks
            (user_id, staff_id, order_id, product_id, task_type, qty, rate_per_unit, total_wage,
             status, cutting_report_line_id, notes)
          values
            (v_user_id, p_staff_id, v_order_id, v_item.product_id, 'cutting',
             round(v_rep_qty * (v_item.qty / v_order_total_qty)),
             v_item_rate,
             round(v_item_wage),
             'completed',
             v_line_id,
             coalesce(v_line_note, 'Dari laporan potong mingguan'));
        end if;
      end if;
    end loop;

    -- Update cutting_assignment → reported
    update public.cutting_assignments
    set status = 'reported'
    where id = v_assignment_id and user_id = v_user_id;
  end loop;

  -- Update total_qty di header laporan
  update public.cutting_weekly_reports
  set total_qty = v_total_qty
  where id = v_report_id;

  return jsonb_build_object(
    'report_id', v_report_id,
    'total_qty', v_total_qty,
    'warnings', v_warnings
  );
end;
$$;

-- =========================================================================
-- 6. GRANTS
-- =========================================================================

revoke execute on function public.mark_ready_for_sewing(uuid[]) from public, anon;
grant execute on function public.mark_ready_for_sewing(uuid[]) to authenticated;

revoke execute on function public.distribute_sewing_work(uuid[], text) from public, anon;
grant execute on function public.distribute_sewing_work(uuid[], text) to authenticated;

revoke execute on function public.record_qc_check(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.record_qc_check(uuid, numeric, numeric, text) to authenticated;

revoke execute on function public.mark_sewing_manual_paid(uuid[], text) from public, anon;
grant execute on function public.mark_sewing_manual_paid(uuid[], text) to authenticated;

revoke execute on function public.assign_cutting_order(uuid, uuid, text) from public, anon;
grant execute on function public.assign_cutting_order(uuid, uuid, text) to authenticated;

revoke execute on function public.submit_cutting_report(uuid, date, date, jsonb, text) from public, anon;
grant execute on function public.submit_cutting_report(uuid, date, date, jsonb, text) to authenticated;
