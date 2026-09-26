-- =========================================================================
-- SIKon — Migration: Warehouse & Purchasing Flow Improvements
-- =========================================================================
-- 1. stock_requests:
--    - Kolom approval: approved_by, approved_at, rejected_reason, goods_received_at
--    - Kolom sumber otomatis: source_type ('manual', 'auto_order'), source_order_id, source_order_item_id
--    - Status check diperbarui: 'draft_auto', 'pending', 'approved', 'rejected', 'in_progress', 'fulfilled', 'cancelled'
--    - Trigger validasi pemohon hanya role 'Gudang'
-- 2. stock_movements:
--    - Kolom taken_by (siapa yang mengambil barang keluar) & recorded_by (staf gudang yang mencatat)
-- 3. RPC baru:
--    - approve_stock_request
--    - reject_stock_request
--    - confirm_stock_movement (diperbarui menerima p_taken_by & p_recorded_by)
-- =========================================================================

-- 1. stock_requests: kolom baru & constraint status
alter table public.stock_requests
  drop constraint if exists stock_requests_status_check;

alter table public.stock_requests
  add column if not exists approved_by uuid references public.staff(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists goods_received_at timestamptz,
  add column if not exists source_type varchar not null default 'manual',
  add column if not exists source_order_id uuid references public.orders(id) on delete set null,
  add column if not exists source_order_item_id uuid references public.order_items(id) on delete set null;

alter table public.stock_requests
  drop constraint if exists stock_requests_source_type_check;

alter table public.stock_requests
  add constraint stock_requests_source_type_check
    check (source_type in ('manual', 'auto_order'));

alter table public.stock_requests
  add constraint stock_requests_status_check
    check (status in ('draft_auto', 'pending', 'approved', 'rejected', 'in_progress', 'fulfilled', 'cancelled'));

create index if not exists idx_stock_requests_source_order on public.stock_requests(source_order_id);
create index if not exists idx_stock_requests_approved_by on public.stock_requests(approved_by);

-- Trigger validasi pemohon: hanya staf dengan role 'Gudang' yang boleh jadi pemohon (requested_by)
create or replace function public.validate_stock_request_requester()
returns trigger language plpgsql as $$
begin
  if new.requested_by is not null then
    if not exists (
      select 1 from public.staff
      where id = new.requested_by and role = 'Gudang'
    ) then
      raise exception 'Pemohon restock harus staf dengan role Gudang';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_stock_request_requester on public.stock_requests;
create trigger trg_validate_stock_request_requester
  before insert or update of requested_by on public.stock_requests
  for each row execute function public.validate_stock_request_requester();

-- 2. stock_movements: kolom taken_by & recorded_by
alter table public.stock_movements
  add column if not exists taken_by uuid references public.staff(id) on delete set null,
  add column if not exists recorded_by uuid references public.staff(id) on delete set null;

create index if not exists idx_stock_movements_taken_by on public.stock_movements(taken_by);
create index if not exists idx_stock_movements_recorded_by on public.stock_movements(recorded_by);

comment on column public.stock_movements.taken_by
  is 'Staf yang mengambil barang keluar (Tukang Potong utk kain, Penjahit utk aksesoris/benang). Hanya relevan utk movement_type = out.';
comment on column public.stock_movements.recorded_by
  is 'Staf Gudang yang mengonfirmasi/mencatat pengeluaran barang ini.';

-- 3. RPC approve_stock_request
create or replace function public.approve_stock_request(
  p_request_id uuid,
  p_approved_by uuid default null
)
returns public.stock_requests language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.stock_requests;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  update public.stock_requests
  set status = 'approved',
      approved_by = p_approved_by,
      approved_at = now()
  where id = p_request_id and user_id = v_user_id and status = 'pending'
  returning * into v_result;

  if not found then
    raise exception 'Pengajuan tidak ditemukan atau bukan berstatus pending';
  end if;
  return v_result;
end;
$$;

-- 4. RPC reject_stock_request
create or replace function public.reject_stock_request(
  p_request_id uuid,
  p_reason text
)
returns public.stock_requests language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.stock_requests;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  update public.stock_requests
  set status = 'rejected',
      rejected_reason = p_reason
  where id = p_request_id and user_id = v_user_id and status = 'pending'
  returning * into v_result;

  if not found then
    raise exception 'Pengajuan tidak ditemukan atau bukan berstatus pending';
  end if;
  return v_result;
end;
$$;

-- 5. RPC confirm_stock_movement (update dengan taken_by & recorded_by)
create or replace function public.confirm_stock_movement(
  p_movement_id uuid,
  p_taken_by uuid default null,
  p_recorded_by uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_movement public.stock_movements%rowtype;
  v_current_stock numeric;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_movement from public.stock_movements where id = p_movement_id and user_id = v_user_id;
  if not found then raise exception 'Stock movement tidak ditemukan'; end if;
  if v_movement.status != 'pending' then raise exception 'Hanya movement berstatus pending yang bisa dikonfirmasi'; end if;

  if v_movement.material_color_id is not null then
    select stock_qty into v_current_stock from public.material_colors where id = v_movement.material_color_id;
  else
    select stock_qty into v_current_stock from public.materials where id = v_movement.material_id;
  end if;

  if v_movement.movement_type = 'out' and v_current_stock < v_movement.qty then
    raise exception 'Stok tidak mencukupi. Stok tersedia: %, dibutuhkan: %', v_current_stock, v_movement.qty;
  end if;

  if v_movement.material_color_id is not null then
    update public.material_colors set stock_qty = case
      when v_movement.movement_type = 'in' then stock_qty + v_movement.qty
      when v_movement.movement_type = 'out' then stock_qty - v_movement.qty
      when v_movement.movement_type = 'adjustment' then v_movement.qty
    end where id = v_movement.material_color_id;
  else
    update public.materials set stock_qty = case
      when v_movement.movement_type = 'in' then stock_qty + v_movement.qty
      when v_movement.movement_type = 'out' then stock_qty - v_movement.qty
      when v_movement.movement_type = 'adjustment' then v_movement.qty
    end where id = v_movement.material_id;
  end if;

  update public.stock_movements
  set status = 'confirmed',
      confirmed_at = now(),
      taken_by = coalesce(p_taken_by, taken_by),
      recorded_by = coalesce(p_recorded_by, recorded_by)
  where id = p_movement_id;
end;
$$;

-- 6. Permissions
revoke execute on function public.approve_stock_request(uuid, uuid) from public, anon;
grant execute on function public.approve_stock_request(uuid, uuid) to authenticated;

revoke execute on function public.reject_stock_request(uuid, text) from public, anon;
grant execute on function public.reject_stock_request(uuid, text) to authenticated;

revoke execute on function public.confirm_stock_movement(uuid, uuid, uuid) from public, anon;
grant execute on function public.confirm_stock_movement(uuid, uuid, uuid) to authenticated;
