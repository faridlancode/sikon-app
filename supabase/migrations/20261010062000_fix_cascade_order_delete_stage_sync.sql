-- ===========================================================================
-- Migration: 20261010062000_fix_cascade_order_delete_stage_sync.sql
-- Tujuan: Menambahkan penjaga pada trigger sync timeline stage (potong & jahit)
--         agar melewati upsert_order_stage_event jika order sedang dihapus (cascade delete).
-- ===========================================================================

-- 1. sync_potong_stage
create or replace function public.sync_potong_stage()
returns trigger
language plpgsql
security definer
set search_path to 'public' as $$
declare
  v_order_id   uuid;
  v_user_id    uuid;
  v_total      integer;
  v_done       integer;
  v_assigned   integer;
  v_new_status varchar;
  v_done_at    timestamptz;
begin
  if TG_OP = 'DELETE' then
    v_order_id := OLD.order_id;
    v_user_id  := OLD.user_id;
  else
    v_order_id := NEW.order_id;
    v_user_id  := NEW.user_id;
  end if;

  if v_order_id is null then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  -- Penjaga: jika order sedang dihapus (cascade delete dari orders), lewati sinkronisasi
  if not exists (select 1 from public.orders where id = v_order_id) then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  select
    count(*)::integer,
    count(cutting_completed_at)::integer
  into v_total, v_done
  from public.order_items
  where order_id = v_order_id;

  select count(*)::integer
  into v_assigned
  from public.cutting_assignments ca
  join public.order_items oi on oi.id = ca.order_item_id
  where oi.order_id = v_order_id;

  if v_total = 0 then
    v_new_status := 'pending';
    v_done_at    := null;
  elsif v_done >= v_total then
    v_new_status := 'done';
    v_done_at    := now();
  elsif v_done > 0 or v_assigned > 0 then
    v_new_status := 'in_progress';
    v_done_at    := null;
  else
    v_new_status := 'pending';
    v_done_at    := null;
  end if;

  perform public.upsert_order_stage_event(
    v_user_id, v_order_id, 'potong', v_new_status, v_done_at
  );

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

-- 2. sync_potong_stage_from_ca
create or replace function public.sync_potong_stage_from_ca()
returns trigger
language plpgsql
security definer
set search_path to 'public' as $$
declare
  v_order_item_id uuid;
  v_order_id      uuid;
  v_user_id       uuid;
  v_total         integer;
  v_done          integer;
  v_assigned      integer;
  v_new_status    varchar;
  v_done_at       timestamptz;
begin
  if TG_OP = 'DELETE' then
    v_order_item_id := OLD.order_item_id;
    v_user_id       := OLD.user_id;
  else
    v_order_item_id := NEW.order_item_id;
    v_user_id       := NEW.user_id;
  end if;

  select order_id into v_order_id
  from public.order_items where id = v_order_item_id;

  if v_order_id is null then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  -- Penjaga: jika order sedang dihapus (cascade delete dari orders), lewati sinkronisasi
  if not exists (select 1 from public.orders where id = v_order_id) then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  select
    count(*)::integer,
    count(cutting_completed_at)::integer
  into v_total, v_done
  from public.order_items
  where order_id = v_order_id;

  select count(*)::integer
  into v_assigned
  from public.cutting_assignments ca
  join public.order_items oi on oi.id = ca.order_item_id
  where oi.order_id = v_order_id;

  if v_total = 0 then
    v_new_status := 'pending';
    v_done_at    := null;
  elsif v_done >= v_total then
    v_new_status := 'done';
    v_done_at    := now();
  elsif v_done > 0 or v_assigned > 0 then
    v_new_status := 'in_progress';
    v_done_at    := null;
  else
    v_new_status := 'pending';
    v_done_at    := null;
  end if;

  perform public.upsert_order_stage_event(
    v_user_id, v_order_id, 'potong', v_new_status, v_done_at
  );

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

-- 3. sync_jahit_stage
create or replace function public.sync_jahit_stage()
returns trigger
language plpgsql
security definer
set search_path to 'public' as $$
declare
  v_order_id    uuid;
  v_user_id     uuid;
  v_total       integer;
  v_done        integer;
  v_active      integer;
  v_new_status  varchar;
  v_done_at     timestamptz;
begin
  if TG_OP = 'DELETE' then
    v_user_id := OLD.user_id;
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

  -- Penjaga: jika order sedang dihapus (cascade delete dari orders), lewati sinkronisasi
  if not exists (select 1 from public.orders where id = v_order_id) then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  select
    count(*)::integer,
    count(*) filter (where sa.status = 'completed')::integer,
    count(*) filter (where sa.status in ('assigned', 'in_progress'))::integer
  into v_total, v_done, v_active
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  where oi.order_id = v_order_id and sa.user_id = v_user_id;

  if v_total = 0 then
    v_new_status := 'pending';
    v_done_at    := null;
  elsif v_done >= v_total then
    v_new_status := 'done';
    v_done_at    := now();
  elsif v_done > 0 or v_active > 0 then
    v_new_status := 'in_progress';
    v_done_at    := null;
  else
    v_new_status := 'pending';
    v_done_at    := null;
  end if;

  perform public.upsert_order_stage_event(
    v_user_id, v_order_id, 'jahit', v_new_status, v_done_at
  );

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;
