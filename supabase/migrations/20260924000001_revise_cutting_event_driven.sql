-- =========================================================================
-- SIKon — Revisi Worklog Potong: dari setoran-mingguan ke event-driven per-item
-- =========================================================================
-- Desain: docs/DESAIN_WORKLOG_JAHIT.md §7 (REVISI)
-- Perubahan utama:
--   1. cutting_assignments: dari per-order → per-order_item
--   2. order_items: tambah cutting_completed_at, cutting_qty
--   3. piecework_tasks: tambah order_item_id (referensi langsung per-item)
--   4. RPC baru: assign_cutting_item, mark_cutting_item_done
--      (menggantikan assign_cutting_order & submit_cutting_report)
--
-- CATATAN: Tabel cutting_weekly_reports & cutting_report_lines TIDAK di-drop
-- (dibiarkan deprecated) untuk menjaga keamanan data jika ada row lama.
-- =========================================================================

-- =========================================================================
-- 1. KOLOM BARU DI order_items
-- =========================================================================

alter table public.order_items
  add column if not exists cutting_completed_at timestamptz null,
  add column if not exists cutting_qty           numeric null;

comment on column public.order_items.cutting_completed_at
  is 'Diisi saat item ditandai selesai dipotong (event-driven). NULL = belum dipotong.';
comment on column public.order_items.cutting_qty
  is 'Qty aktual yang dipotong (default = qty, editable kalau ada kain rusak/reject).';

-- =========================================================================
-- 2. KOLOM BARU DI piecework_tasks
-- =========================================================================

alter table public.piecework_tasks
  add column if not exists order_item_id uuid null;

-- Tambah FK via DO block (kompatibel semua versi Postgres yang tidak support IF NOT EXISTS untuk FK)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'piecework_tasks'
      and constraint_name = 'piecework_tasks_order_item_id_fkey'
  ) then
    alter table public.piecework_tasks
      add constraint piecework_tasks_order_item_id_fkey
        foreign key (order_item_id) references public.order_items(id) on delete set null;
  end if;
end $$;

create index if not exists idx_piecework_tasks_order_item on public.piecework_tasks(order_item_id);

comment on column public.piecework_tasks.order_item_id
  is 'Referensi ke order_item yang menghasilkan task ini (untuk cutting event-driven & sewing QC).';

-- =========================================================================
-- 3. RENOVASI cutting_assignments: dari per-order ke per-order_item
-- =========================================================================

-- Drop constraint lama (idempotent)
alter table public.cutting_assignments
  drop constraint if exists cutting_assignments_order_unique;

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'cutting_assignments'
      and constraint_name = 'cutting_assignments_order_id_fkey'
  ) then
    alter table public.cutting_assignments
      drop constraint cutting_assignments_order_id_fkey;
  end if;
end $$;

alter table public.cutting_assignments
  drop constraint if exists cutting_assignments_status_check;

-- Tambah kolom order_item_id (kalau belum ada)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cutting_assignments' and column_name = 'order_item_id'
  ) then
    alter table public.cutting_assignments
      add column order_item_id uuid null;
  end if;
end $$;

-- Tambah FK untuk order_item_id (via DO block)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'cutting_assignments'
      and constraint_name = 'cutting_assignments_order_item_id_fkey'
  ) then
    alter table public.cutting_assignments
      add constraint cutting_assignments_order_item_id_fkey
        foreign key (order_item_id) references public.order_items(id) on delete cascade;
  end if;
end $$;

-- Isi order_item_id dari data lama jika ada (best-effort, ambil item pertama dari order)
update public.cutting_assignments ca
set order_item_id = (
  select oi.id from public.order_items oi
  where oi.order_id = ca.order_id and oi.user_id = ca.user_id
  order by oi.created_at asc
  limit 1
)
where ca.order_item_id is null and ca.order_id is not null;

-- Set NOT NULL hanya kalau semua baris sudah punya order_item_id
do $$
begin
  if not exists (
    select 1 from public.cutting_assignments where order_item_id is null
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cutting_assignments'
      and column_name = 'order_item_id' and is_nullable = 'YES'
  ) then
    alter table public.cutting_assignments alter column order_item_id set not null;
  end if;
end $$;

-- Update status lama yang bukan 'assigned' / 'done' (misal: 'reported' dari sistem mingguan lama)
update public.cutting_assignments
set status = 'done'
where status not in ('assigned', 'done');

-- Tambah constraint status baru (assigned | done)
alter table public.cutting_assignments
  add constraint cutting_assignments_status_check
    check (status in ('assigned', 'done'));

-- Unique per order_item (1 item = 1 assignment aktif sekaligus)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'cutting_assignments'
      and constraint_name = 'cutting_assignments_item_unique'
  ) then
    alter table public.cutting_assignments
      add constraint cutting_assignments_item_unique unique (order_item_id);
  end if;
end $$;

create index if not exists idx_cutting_assignments_order_item
  on public.cutting_assignments(order_item_id);

comment on table public.cutting_assignments
  is 'Assignment per order_item ke tukang potong. 1 item = 1 assignment aktif. Status: assigned → done.';
comment on column public.cutting_assignments.order_item_id
  is 'Referensi ke order_item yang dikerjakan (granular per-item, bukan per-order).';

-- =========================================================================
-- 4. RPC BARU — assign_cutting_item
-- =========================================================================
create or replace function public.assign_cutting_item(
  p_order_item_id uuid,
  p_staff_id      uuid,
  p_notes         text default null
)
returns public.cutting_assignments language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_result  public.cutting_assignments;
  v_item    public.order_items;
  v_staff   public.staff;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select * into v_item from public.order_items where id = p_order_item_id and user_id = v_user_id;
  if not found then raise exception 'Order item tidak ditemukan'; end if;
  if v_item.cutting_completed_at is not null then
    raise exception 'Item ini sudah selesai dipotong — tidak bisa di-assign ulang';
  end if;

  select * into v_staff from public.staff where id = p_staff_id and user_id = v_user_id;
  if not found then raise exception 'Staff tidak ditemukan'; end if;

  insert into public.cutting_assignments (user_id, order_item_id, staff_id, notes, status)
  values (v_user_id, p_order_item_id, p_staff_id, p_notes, 'assigned')
  on conflict (order_item_id) do update
    set staff_id    = excluded.staff_id,
        notes       = excluded.notes,
        status      = 'assigned',
        assigned_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.assign_cutting_item(uuid, uuid, text) from public, anon;
grant execute on function public.assign_cutting_item(uuid, uuid, text) to authenticated;

-- =========================================================================
-- 5. RPC BARU — mark_cutting_item_done
-- =========================================================================
create or replace function public.mark_cutting_item_done(
  p_order_item_id uuid,
  p_cutting_qty   numeric default null,
  p_notes         text    default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_item    record;
  v_assign  record;
  v_qty     numeric;
  v_rate    numeric;
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
  where order_item_id = p_order_item_id;

  if not found then
    raise exception 'Item belum di-assign ke tukang potong. Assign dulu sebelum menandai selesai.';
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

revoke execute on function public.mark_cutting_item_done(uuid, numeric, text) from public, anon;
grant execute on function public.mark_cutting_item_done(uuid, numeric, text) to authenticated;
