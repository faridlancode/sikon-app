-- =========================================================================
-- SIKon — Material Multi-UOM, Gudang Floor Stock, HPP Consumables,
--         Sinkronisasi Milestone Potong/Jahit, Strict Pelunasan Gate,
--         dan Perbaikan Relasi Payroll Categories
-- =========================================================================

-- 1. MATERIAL MULTI-UOM & SPESIFIKASI
alter table public.materials
  add column if not exists brand varchar null,
  add column if not exists purchase_unit varchar null,
  add column if not exists conversion_rate numeric not null default 1 check (conversion_rate > 0);

comment on column public.materials.brand is 'Merk material (contoh: YKK, Astra, Tulip)';
comment on column public.materials.purchase_unit is 'Satuan saat pembelian grosir (pack, roll, gross, cone, dll)';
comment on column public.materials.conversion_rate is 'Jumlah base unit per 1 purchase_unit (contoh: 1 pack = 100 pcs)';

-- 2. GUDANG: ESTIMATED MARKET PRICE PADA STOCK REQUESTS
alter table public.stock_requests
  add column if not exists estimated_price numeric null check (estimated_price >= 0);

comment on column public.stock_requests.estimated_price is 'Estimasi harga pasar satuan saat diajukan oleh staf gudang';

-- 3. PRODUK: TAKSIRAN BIAYA CONSUMABLES / BENANG PADA MASTER PRODUK (HPP)
alter table public.products
  add column if not exists consumables_allowance numeric not null default 0 check (consumables_allowance >= 0);

comment on column public.products.consumables_allowance is 'Taksiran biaya flat bahan pembantu/consumables (benang, jarum, plastik) per pcs baju untuk HPP';

-- 4. GUDANG: STOCK MOVEMENTS SOURCE TYPE ALLOW FLOOR STOCK
alter table public.stock_movements
  drop constraint if exists stock_movements_source_type_check;

alter table public.stock_movements
  add constraint stock_movements_source_type_check check (source_type in
    ('manual', 'purchase_receipt', 'purchasing_report', 'supplier_purchase', 'order_consumption', 'stock_request', 'floor_stock'));

-- 5. FIX PAYROLL RPC: PERBAIKI REFERENSI KE public.transaction_categories
create or replace function public.pay_weekly_payroll(p_payroll_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_payroll public.weekly_payrolls;
  v_cat_id uuid;
  v_trx_id uuid;
  v_item record;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_payroll from public.weekly_payrolls where id = p_payroll_id and user_id = v_user_id;
  if v_payroll is null then raise exception 'Data payroll tidak ditemukan atau bukan milik Anda'; end if;
  if v_payroll.status = 'paid' then raise exception 'Payroll ini sudah dibayarkan sebelumnya'; end if;

  select id into v_cat_id from public.transaction_categories
  where user_id = v_user_id and name = 'Gaji Karyawan' and type = 'expense' limit 1;
  if v_cat_id is null then
    insert into public.transaction_categories (user_id, name, type) values (v_user_id, 'Gaji Karyawan', 'expense')
    returning id into v_cat_id;
  end if;

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (
    v_user_id, v_cat_id,
    'Gaji Karyawan (' || to_char(v_payroll.period_start, 'DD/MM') || ' - ' || to_char(v_payroll.period_end, 'DD/MM/YYYY') || ')',
    v_payroll.total_amount, 'expense', v_payroll.payment_date,
    'Pembayaran payroll mingguan untuk karyawan (absensi, upah borongan, bonus sales)'
  )
  returning id into v_trx_id;

  for v_item in select staff_id from public.payroll_items where payroll_id = p_payroll_id and wage_type = 'piecework'
  loop
    update public.piecework_tasks
    set status = 'paid', payroll_id = p_payroll_id, paid_at = now()
    where user_id = v_user_id and staff_id = v_item.staff_id and status = 'completed';
  end loop;

  update public.weekly_payrolls set status = 'paid', transaction_id = v_trx_id where id = p_payroll_id;

  return jsonb_build_object('payroll_id', p_payroll_id, 'transaction_id', v_trx_id, 'status', 'paid');
end;
$$;

revoke execute on function public.pay_weekly_payroll(uuid) from public, anon;
grant execute on function public.pay_weekly_payroll(uuid) to authenticated;

-- 6. SINKRONISASI STAGE POTONG: MENDETEKSI IN_PROGRESS (ASSIGNMENT ATAU SEBAGIAN SELESAI)
create or replace function public.sync_potong_stage()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_sync_potong_stage on public.order_items;
create trigger trg_sync_potong_stage
  after insert or update of cutting_completed_at or delete
  on public.order_items
  for each row
  execute function public.sync_potong_stage();

-- Helper trigger saat cutting_assignments dibuat / diubah
create or replace function public.sync_potong_stage_from_ca()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_sync_potong_stage_ca on public.cutting_assignments;
create trigger trg_sync_potong_stage_ca
  after insert or update or delete
  on public.cutting_assignments
  for each row
  execute function public.sync_potong_stage_from_ca();

-- 7. SINKRONISASI STAGE JAHIT: MENDETEKSI IN_PROGRESS DENGAN BENAR
create or replace function public.sync_jahit_stage()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_sync_jahit_stage on public.sewing_assignments;
create trigger trg_sync_jahit_stage
  after insert or update of status or delete
  on public.sewing_assignments
  for each row
  execute function public.sync_jahit_stage();

-- 8. RPC TOGGLE_ORDER_STAGE DENGAN STRICT GATE PELUNASAN SEBELUM KIRIM
create or replace function public.toggle_order_stage(
  p_order_id uuid,
  p_stage    varchar,
  p_done     boolean,
  p_notes    text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id   uuid := auth.uid();
  v_order     public.orders;
  v_status    varchar;
  v_done_at   timestamptz;
  v_remaining numeric;
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

  -- STRICT GATE CHECK PELUNASAN:
  -- Dilarang menandai stage 'kirim' atau 'pelunasan' sebagai selesai jika masih ada sisa tagihan
  if p_stage in ('kirim', 'pelunasan') and p_done then
    select remaining_amount into v_remaining
    from public.orders_with_balance
    where id = p_order_id;

    if coalesce(v_remaining, 0) > 0 then
      raise exception 'Pesanan belum lunas (sisa tagihan: Rp %). Pelunasan wajib diselesaikan sebelum barang dapat ditandai selesai/dikirim.',
        to_char(v_remaining, 'FM999,999,999');
    end if;
  end if;

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

  -- Efek samping: packaging selesai → otomatis status pesanan menjadi 'ready' (Siap Kirim)
  if p_stage = 'packaging' then
    if p_done then
      update public.orders
      set production_status = 'ready'
      where id = p_order_id and user_id = v_user_id and production_status = 'production';
    else
      update public.orders
      set production_status = 'production'
      where id = p_order_id and user_id = v_user_id and production_status = 'ready';
    end if;
  end if;

  -- Efek samping: pengiriman selesai → otomatis status pesanan menjadi 'completed' (Selesai)
  if p_stage = 'kirim' then
    if p_done then
      update public.orders
      set production_status = 'completed'
      where id = p_order_id and user_id = v_user_id;
    else
      update public.orders
      set production_status = 'ready'
      where id = p_order_id and user_id = v_user_id and production_status = 'completed';
    end if;
  end if;
end;
$$;

revoke execute on function public.toggle_order_stage(uuid, varchar, boolean, text) from public, anon;
grant execute on function public.toggle_order_stage(uuid, varchar, boolean, text) to authenticated;
