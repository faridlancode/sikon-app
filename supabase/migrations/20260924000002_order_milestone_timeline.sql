-- =========================================================================
-- SIKon — Order Milestone Timeline
-- =========================================================================
-- Desain: docs/DESAIN_WORKLOG_JAHIT.md §8
-- Tabel baru:
--   - order_stage_events  : status & metadata tiap stage per order (sumber stepper)
--   - stage_work_logs     : log produktivitas harian (Finishing/QC/Packaging)
-- Trigger:
--   - trg_sync_potong_stage  : auto-update stage 'potong' dari cutting_completed_at
--   - trg_sync_jahit_stage   : auto-update stage 'jahit' dari sewing_assignments
-- RPC:
--   - toggle_order_stage     : toggle status stage manual
--   - log_stage_work         : catat log produktivitas
--   - get_order_stage_events : ambil semua stage events untuk satu order (upsert defaults)
-- =========================================================================

-- =========================================================================
-- 1. TABEL order_stage_events
-- =========================================================================

create table if not exists public.order_stage_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id),
  order_id     uuid not null references public.orders(id) on delete cascade,
  stage        varchar not null,
  status       varchar not null default 'pending',
  completed_at timestamptz null,
  staff_id     uuid null references public.staff(id) on delete set null,
  notes        text null,
  updated_at   timestamptz not null default now(),
  constraint order_stage_events_stage_check
    check (stage in ('quotation','rekap','potong','bordir','jahit','finishing','qc','packaging','pelunasan','kirim')),
  constraint order_stage_events_status_check
    check (status in ('pending','in_progress','done')),
  constraint order_stage_events_unique unique (order_id, stage)
);

alter table public.order_stage_events enable row level security;
create policy "Manage own order stage events" on public.order_stage_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_order_stage_events_order on public.order_stage_events(order_id);
create index if not exists idx_order_stage_events_stage on public.order_stage_events(stage);
create index if not exists idx_order_stage_events_user on public.order_stage_events(user_id);

comment on table public.order_stage_events
  is 'Status & metadata tiap stage per order. Stage potong & jahit disinkronkan otomatis via trigger; stage lain diupdate manual via toggle_order_stage().';
comment on column public.order_stage_events.stage
  is 'Tahap produksi: quotation|rekap|potong|bordir|jahit|finishing|qc|packaging|pelunasan|kirim';
comment on column public.order_stage_events.status
  is 'pending = belum mulai, in_progress = sebagian selesai (khusus potong & jahit), done = selesai';

-- =========================================================================
-- 2. TABEL stage_work_logs
-- =========================================================================

create table if not exists public.stage_work_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id),
  order_id       uuid not null references public.orders(id) on delete cascade,
  order_item_id  uuid null references public.order_items(id) on delete set null,
  stage          varchar not null,
  staff_id       uuid not null references public.staff(id) on delete cascade,
  qty            numeric not null,
  logged_at      timestamptz not null default now(),
  notes          text null,
  constraint stage_work_logs_stage_check
    check (stage in ('finishing','qc','packaging')),
  constraint stage_work_logs_qty_check
    check (qty > 0)
);

alter table public.stage_work_logs enable row level security;
create policy "Manage own stage work logs" on public.stage_work_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_stage_work_logs_order on public.stage_work_logs(order_id);
create index if not exists idx_stage_work_logs_staff on public.stage_work_logs(staff_id);
create index if not exists idx_stage_work_logs_stage on public.stage_work_logs(stage);
create index if not exists idx_stage_work_logs_user on public.stage_work_logs(user_id);

comment on table public.stage_work_logs
  is 'Log produktivitas harian untuk stage Finishing, QC, Packaging. Tidak otomatis menandai stage done — status stage tetap ditoggle manual.';

-- =========================================================================
-- 3. FUNGSI HELPER — upsert_order_stage_event
-- =========================================================================
-- Internal helper: upsert satu stage event (dipakai trigger & RPC lain)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_order_stage_event(
  p_user_id    uuid,
  p_order_id   uuid,
  p_stage      varchar,
  p_status     varchar,
  p_completed_at timestamptz default null,
  p_notes      text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.order_stage_events
    (user_id, order_id, stage, status, completed_at, notes, updated_at)
  values
    (p_user_id, p_order_id, p_stage, p_status, p_completed_at, p_notes, now())
  on conflict (order_id, stage) do update
    set status       = excluded.status,
        completed_at = excluded.completed_at,
        notes        = coalesce(excluded.notes, order_stage_events.notes),
        updated_at   = now();
end;
$$;

-- =========================================================================
-- 4. TRIGGER SINKRONISASI — stage 'potong'
-- =========================================================================
-- Dipicu setiap kali order_items.cutting_completed_at berubah.
-- Logic:
--   - Semua item order punya cutting_completed_at → status = 'done'
--   - Sebagian item punya cutting_completed_at → status = 'in_progress'
--   - Tidak ada → status = 'pending'
-- ---------------------------------------------------------------------------
create or replace function public.sync_potong_stage()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_order_id   uuid;
  v_user_id    uuid;
  v_total      integer;
  v_done       integer;
  v_new_status varchar;
  v_done_at    timestamptz;
begin
  -- Tangani INSERT, UPDATE (NEW), DELETE (pakai OLD)
  if TG_OP = 'DELETE' then
    v_order_id := OLD.order_id;
    v_user_id  := OLD.user_id;
  else
    v_order_id := NEW.order_id;
    v_user_id  := NEW.user_id;
  end if;

  -- Hitung total & done items untuk order ini
  select
    count(*)::integer,
    count(cutting_completed_at)::integer
  into v_total, v_done
  from public.order_items
  where order_id = v_order_id;

  -- Tentukan status stage
  if v_done = 0 then
    v_new_status := 'pending';
    v_done_at    := null;
  elsif v_done >= v_total then
    v_new_status := 'done';
    v_done_at    := now();
  else
    v_new_status := 'in_progress';
    v_done_at    := null;
  end if;

  -- Upsert ke order_stage_events
  perform public.upsert_order_stage_event(
    v_user_id, v_order_id, 'potong', v_new_status, v_done_at
  );

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

drop trigger if exists trg_sync_potong_stage on public.order_items;
create trigger trg_sync_potong_stage
  after insert or update of cutting_completed_at or delete
  on public.order_items
  for each row
  execute function public.sync_potong_stage();

-- =========================================================================
-- 5. TRIGGER SINKRONISASI — stage 'jahit'
-- =========================================================================
-- Dipicu setiap kali sewing_assignments berubah.
-- Logic:
--   - Semua assignment untuk order ini completed → status = 'done'
--   - Ada assignment tapi belum semua completed → 'in_progress'
--   - Tidak ada assignment → 'pending'
-- ---------------------------------------------------------------------------
create or replace function public.sync_jahit_stage()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_order_id   uuid;
  v_user_id    uuid;
  v_total      integer;
  v_done       integer;
  v_new_status varchar;
  v_done_at    timestamptz;
begin
  if TG_OP = 'DELETE' then
    v_user_id := OLD.user_id;
    -- Ambil order_id dari order_items
    select order_id into v_order_id
    from public.order_items where id = OLD.order_item_id;
  else
    v_user_id := NEW.user_id;
    select order_id into v_order_id
    from public.order_items where id = NEW.order_item_id;
  end if;

  if v_order_id is null then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  select
    count(*)::integer,
    count(*) filter (where sa.status = 'completed')::integer
  into v_total, v_done
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  where oi.order_id = v_order_id and sa.user_id = v_user_id;

  if v_total = 0 or v_done = 0 then
    v_new_status := 'pending';
    v_done_at    := null;
  elsif v_done >= v_total then
    v_new_status := 'done';
    v_done_at    := now();
  else
    v_new_status := 'in_progress';
    v_done_at    := null;
  end if;

  perform public.upsert_order_stage_event(
    v_user_id, v_order_id, 'jahit', v_new_status, v_done_at
  );

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

drop trigger if exists trg_sync_jahit_stage on public.sewing_assignments;
create trigger trg_sync_jahit_stage
  after insert or update of status or delete
  on public.sewing_assignments
  for each row
  execute function public.sync_jahit_stage();

-- =========================================================================
-- 6. RPC — toggle_order_stage
-- =========================================================================
-- Toggle status stage manual (true = done, false = pending).
-- Stage 'potong' & 'jahit' tidak bisa di-toggle manual (diatur trigger).
-- Saat stage 'bordir' ditandai done → otomatis set ready_for_sewing_at semua item.
-- ---------------------------------------------------------------------------
create or replace function public.toggle_order_stage(
  p_order_id uuid,
  p_stage    varchar,
  p_done     boolean,
  p_notes    text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id  uuid := auth.uid();
  v_order    public.orders;
  v_status   varchar;
  v_done_at  timestamptz;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  if p_stage in ('potong', 'jahit') then
    raise exception 'Stage % tidak bisa di-toggle manual — diatur otomatis dari sistem', p_stage;
  end if;
  if p_stage not in ('quotation','rekap','bordir','finishing','qc','packaging','pelunasan','kirim') then
    raise exception 'Stage tidak valid: %', p_stage;
  end if;

  select * into v_order from public.orders where id = p_order_id and user_id = v_user_id;
  if not found then raise exception 'Order tidak ditemukan'; end if;

  v_status  := case when p_done then 'done' else 'pending' end;
  v_done_at := case when p_done then now() else null end;

  perform public.upsert_order_stage_event(
    v_user_id, p_order_id, p_stage, v_status, v_done_at, p_notes
  );

  -- Efek samping: bordir selesai → set ready_for_sewing_at semua order_items
  if p_stage = 'bordir' and p_done then
    update public.order_items
    set ready_for_sewing_at = now()
    where order_id = p_order_id
      and user_id  = v_user_id
      and ready_for_sewing_at is null;
  end if;
end;
$$;

revoke execute on function public.toggle_order_stage(uuid, varchar, boolean, text) from public, anon;
grant execute on function public.toggle_order_stage(uuid, varchar, boolean, text) to authenticated;

-- =========================================================================
-- 7. RPC — log_stage_work
-- =========================================================================
create or replace function public.log_stage_work(
  p_order_id      uuid,
  p_stage         varchar,
  p_staff_id      uuid,
  p_qty           numeric,
  p_order_item_id uuid default null,
  p_notes         text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_log_id  uuid;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  if p_stage not in ('finishing','qc','packaging') then
    raise exception 'Log produktivitas hanya untuk stage finishing/qc/packaging';
  end if;
  if p_qty <= 0 then raise exception 'Qty harus lebih dari 0'; end if;

  insert into public.stage_work_logs
    (user_id, order_id, order_item_id, stage, staff_id, qty, notes)
  values
    (v_user_id, p_order_id, p_order_item_id, p_stage, p_staff_id, p_qty, p_notes)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke execute on function public.log_stage_work(uuid, varchar, uuid, numeric, uuid, text) from public, anon;
grant execute on function public.log_stage_work(uuid, varchar, uuid, numeric, uuid, text) to authenticated;

-- =========================================================================
-- 8. RPC — get_order_stage_events
-- =========================================================================
-- Ambil semua stage events untuk satu order.
-- Kalau stage belum ada di tabel, otomatis di-upsert dengan status 'pending'
-- (agar frontend selalu dapat 10 stage).
-- ---------------------------------------------------------------------------
create or replace function public.get_order_stage_events(p_order_id uuid)
returns setof public.order_stage_events language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_stage   varchar;
  v_order   public.orders;
  v_stages  varchar[] := array['quotation','rekap','potong','bordir','jahit','finishing','qc','packaging','pelunasan','kirim'];
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select * into v_order from public.orders where id = p_order_id and user_id = v_user_id;
  if not found then raise exception 'Order tidak ditemukan'; end if;

  -- Pastikan semua 10 stage ada di tabel (upsert dengan pending kalau belum ada)
  foreach v_stage in array v_stages loop
    insert into public.order_stage_events (user_id, order_id, stage, status)
    values (v_user_id, p_order_id, v_stage, 'pending')
    on conflict (order_id, stage) do nothing;
  end loop;

  return query
    select * from public.order_stage_events
    where order_id = p_order_id
    order by
      case stage
        when 'quotation'  then 1
        when 'rekap'      then 2
        when 'potong'     then 3
        when 'bordir'     then 4
        when 'jahit'      then 5
        when 'finishing'  then 6
        when 'qc'         then 7
        when 'packaging'  then 8
        when 'pelunasan'  then 9
        when 'kirim'      then 10
      end;
end;
$$;

revoke execute on function public.get_order_stage_events(uuid) from public, anon;
grant execute on function public.get_order_stage_events(uuid) to authenticated;
