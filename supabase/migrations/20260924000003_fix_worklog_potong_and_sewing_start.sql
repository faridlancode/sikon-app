-- =========================================================================
-- SIKon — Fix Worklog Potong & Sewing Start Actions
-- =========================================================================
-- 1. cutting_assignments: drop not-null pada order_id agar fleksibel & isi order_id dari item
-- 2. assign_cutting_item: validasi stage 'rekap' selesai & simpan order_id
-- 3. start_sewing_assignment & start_all_sewing_assignments: aksi ubah status jahit ke in_progress
-- =========================================================================

-- 1. Drop NOT NULL pada order_id di cutting_assignments (jika ada)
alter table public.cutting_assignments
  alter column order_id drop not null;

-- 2. Perbarui RPC assign_cutting_item
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

  -- Validasi apakah order sudah siap potong (stage 'rekap' harus sudah 'done')
  if not exists (
    select 1 from public.order_stage_events
    where order_id = v_item.order_id
      and stage = 'rekap'
      and status = 'done'
  ) then
    raise exception 'Order belum siap potong. Pastikan tahap rekap order sudah selesai terlebih dahulu.';
  end if;

  select * into v_staff from public.staff where id = p_staff_id and user_id = v_user_id;
  if not found then raise exception 'Staff tidak ditemukan'; end if;

  insert into public.cutting_assignments (user_id, order_id, order_item_id, staff_id, notes, status)
  values (v_user_id, v_item.order_id, p_order_item_id, p_staff_id, p_notes, 'assigned')
  on conflict (order_item_id) do update
    set order_id    = excluded.order_id,
        staff_id    = excluded.staff_id,
        notes       = excluded.notes,
        status      = 'assigned',
        assigned_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.assign_cutting_item(uuid, uuid, text) from public, anon;
grant execute on function public.assign_cutting_item(uuid, uuid, text) to authenticated;

-- 3. RPC untuk mulai penugasan jahit individual (assigned -> in_progress)
create or replace function public.start_sewing_assignment(
  p_assignment_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  update public.sewing_assignments
  set status = 'in_progress'
  where id = p_assignment_id
    and user_id = v_user_id
    and status = 'assigned';

  if not found then
    raise exception 'Penugasan jahit tidak ditemukan atau sudah dimulai/selesai';
  end if;
end;
$$;

revoke execute on function public.start_sewing_assignment(uuid) from public, anon;
grant execute on function public.start_sewing_assignment(uuid) to authenticated;

-- 4. RPC untuk mulai semua penugasan jahit (opsional per-staff)
create or replace function public.start_all_sewing_assignments(
  p_staff_id uuid default null
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  update public.sewing_assignments
  set status = 'in_progress'
  where user_id = v_user_id
    and status = 'assigned'
    and (p_staff_id is null or staff_id = p_staff_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.start_all_sewing_assignments(uuid) from public, anon;
grant execute on function public.start_all_sewing_assignments(uuid) to authenticated;
