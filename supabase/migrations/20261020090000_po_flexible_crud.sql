-- ============================================================================
-- Migration: 20261020090000_po_flexible_crud.sql
-- REVISI 1 (R1): Batch PO Fleksibel (CRUD oleh Owner), Kuota, & Alur Order
-- Dokumen sumber: docs/rancangan/REVISI_1_BATCH_PO_FLEKSIBEL.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PERUBAHAN TABEL po_batches & po_batch_events
-- ----------------------------------------------------------------------------

-- 1.1 Tambah kolom baru pada po_batches
alter table public.po_batches
  add column if not exists name text,
  add column if not exists quota_qty numeric check (quota_qty is null or quota_qty >= 0),
  add column if not exists note text;

-- 1.2 Backfill nama untuk baris lama jika name masih null
update public.po_batches
set name = 'PO ' || coalesce(seq_in_month::text, '1') || ' ' || (
  case period_month
    when 1 then 'Januari'
    when 2 then 'Februari'
    when 3 then 'Maret'
    when 4 then 'April'
    when 5 then 'Mei'
    when 6 then 'Juni'
    when 7 then 'Juli'
    when 8 then 'Agustus'
    when 9 then 'September'
    when 10 then 'Oktober'
    when 11 then 'November'
    when 12 then 'Desember'
    else 'Bulan ' || period_month::text
  end
) || ' ' || period_year::text
where name is null;

-- Bila ada duplikasi nama lama untuk user yang sama, beri postfix pembeda agar unique index berhasil
do $$
declare
  v_dup record;
  v_i   integer;
begin
  for v_dup in (
    select user_id, lower(name) as lname
    from public.po_batches
    group by user_id, lower(name)
    having count(*) > 1
  ) loop
    v_i := 1;
    for v_dup in (
      select id from public.po_batches
      where user_id = v_dup.user_id and lower(name) = v_dup.lname
      order by created_at asc
    ) loop
      if v_i > 1 then
        update public.po_batches set name = name || ' (' || v_i::text || ')' where id = v_dup.id;
      end if;
      v_i := v_i + 1;
    end loop;
  end loop;
end;
$$;

-- Kolom name sekarang wajib diisi (not null)
alter table public.po_batches
  alter column name set not null;

-- 1.3 Drop batasan hari Senin, Minggu, dan aturan seq_in_month lama
alter table public.po_batches drop constraint if exists po_batches_start_monday_ck;
alter table public.po_batches drop constraint if exists po_batches_end_sunday_ck;
alter table public.po_batches drop constraint if exists po_batches_user_start_uniq;
alter table public.po_batches drop constraint if exists po_batches_user_seq_uniq;
alter table public.po_batches drop constraint if exists po_batches_seq_in_month_check;

-- seq_in_month dijadikan nullable
alter table public.po_batches
  alter column seq_in_month drop not null;

-- Tambah check end_date >= start_date
alter table public.po_batches drop constraint if exists po_batches_date_range_ck;
alter table public.po_batches
  add constraint po_batches_date_range_ck check (end_date >= start_date);

-- Tambah unique index (user_id, lower(name))
create unique index if not exists idx_po_batches_user_name_lower_uniq
  on public.po_batches (user_id, lower(name));

-- 1.4 Sequence untuk kode PO baru 'PO-0001', 'PO-0002', dst.
create sequence if not exists public.po_batch_code_seq start with 1 increment by 1;

-- 1.5 Update check constraint event pada po_batch_events untuk mendukung 'updated'
alter table public.po_batch_events drop constraint if exists po_batch_events_event_check;
alter table public.po_batch_events
  add constraint po_batch_events_event_check
  check (event in ('opened', 'closed', 'reopened', 'order_deleted_after_close', 'rekap_bulk', 'updated'));


-- ----------------------------------------------------------------------------
-- 2. TRIGGER ORDERS: fn_orders_assign_po_batch & trg_orders_assign_po_batch
-- ----------------------------------------------------------------------------

-- Hapus trigger lama pada order_date
drop trigger if exists trg_orders_assign_po_batch on public.orders;

create or replace function public.fn_orders_assign_po_batch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_target_batch public.po_batches;
  v_origin_batch public.po_batches;
begin
  -- Pastikan default order_date WIB jika null
  if NEW.order_date is null then
    NEW.order_date := (now() at time zone 'Asia/Jakarta')::date;
  end if;

  -- KASUS A: po_batch_id TIDAK DIKIRIM (NULL) saat INSERT / UPDATE
  -- Jalankan fallback otomatis: cari PO open milik user yang rentang tanggalnya memuat order_date.
  -- Bila ada lebih dari satu, pilih yang start_date-nya paling akhir (terbaru).
  if NEW.po_batch_id is null then
    select * into v_target_batch
    from public.po_batches
    where user_id = NEW.user_id
      and status = 'open'
      and NEW.order_date between start_date and end_date
    order by start_date desc, created_at desc
    limit 1;

    if not found then
      raise exception 'Belum ada PO terbuka untuk tanggal %. Buat PO di menu Batch PO terlebih dahulu.',
        to_char(NEW.order_date, 'YYYY-MM-DD')
        using errcode = 'P0001';
    end if;

    NEW.po_batch_id := v_target_batch.id;
    return NEW;
  end if;

  -- KASUS B: po_batch_id SUDAH DIISI
  select * into v_target_batch
  from public.po_batches
  where id = NEW.po_batch_id and user_id = NEW.user_id;

  if not found then
    raise exception 'Batch PO yang dipilih tidak ditemukan atau bukan milik Anda'
      using errcode = 'P0001';
  end if;

  -- B.1 Pada INSERT: PO tujuan tidak boleh closed
  if TG_OP = 'INSERT' then
    if v_target_batch.status = 'closed' then
      raise exception 'PO % sudah ditutup. Pilih PO yang masih terbuka atau buka kembali PO tersebut.',
        v_target_batch.name
        using errcode = 'P0001';
    end if;
  end if;

  -- B.2 Pada UPDATE (perpindahan PO jika po_batch_id berubah)
  if TG_OP = 'UPDATE' and OLD.po_batch_id is distinct from NEW.po_batch_id then
    -- PO tujuan harus open
    if v_target_batch.status = 'closed' then
      raise exception 'PO % sudah ditutup. Pilih PO yang masih terbuka atau buka kembali PO tersebut.',
        v_target_batch.name
        using errcode = 'P0001';
    end if;

    -- PO asal tidak boleh closed non-legacy
    if OLD.po_batch_id is not null then
      select * into v_origin_batch
      from public.po_batches
      where id = OLD.po_batch_id;

      if found and v_origin_batch.status = 'closed' and coalesce(v_origin_batch.is_legacy, false) = false then
        raise exception 'Tidak dapat memindahkan order dari PO % yang sudah ditutup.',
          v_origin_batch.name
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

-- Pasang trigger pada before insert or update of po_batch_id
create trigger trg_orders_assign_po_batch
  before insert or update of po_batch_id
  on public.orders
  for each row
  execute function public.fn_orders_assign_po_batch();


-- ----------------------------------------------------------------------------
-- 3. RPC BARU: CRUD BATCH PO & LIST SUMMARY
-- ----------------------------------------------------------------------------

-- 3.1 create_po_batch
create or replace function public.create_po_batch(
  p_name         text,
  p_start_date   date,
  p_end_date     date,
  p_period_year  integer,
  p_period_month integer,
  p_quota_qty    numeric default null,
  p_note         text default null
)
returns public.po_batches
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text;
  v_batch public.po_batches;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'Nama PO wajib diisi' using errcode = 'P0001';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Tanggal mulai dan selesai PO wajib diisi' using errcode = 'P0001';
  end if;

  if p_end_date < p_start_date then
    raise exception 'Tanggal selesai tidak boleh sebelum tanggal mulai' using errcode = 'P0001';
  end if;

  if p_period_month is null or p_period_month not between 1 and 12 then
    raise exception 'Bulan periode tidak valid (1-12)' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.po_batches
    where user_id = v_uid and lower(name) = lower(trim(p_name))
  ) then
    raise exception 'Nama PO "%" sudah digunakan.', trim(p_name) using errcode = 'P0001';
  end if;

  -- Buat kode berurutan PO-0001, PO-0002, dst.
  v_code := 'PO-' || lpad(nextval('public.po_batch_code_seq')::text, 4, '0');

  insert into public.po_batches (
    user_id,
    code,
    name,
    period_year,
    period_month,
    start_date,
    end_date,
    quota_qty,
    note,
    status
  )
  values (
    v_uid,
    v_code,
    trim(p_name),
    p_period_year,
    p_period_month,
    p_start_date,
    p_end_date,
    p_quota_qty,
    p_note,
    'open'
  )
  returning * into v_batch;

  -- Catat audit event 'opened'
  insert into public.po_batch_events (
    user_id,
    po_batch_id,
    event,
    reason,
    payload
  )
  values (
    v_uid,
    v_batch.id,
    'opened',
    'PO dibuat oleh pengguna',
    jsonb_build_object(
      'name', v_batch.name,
      'code', v_batch.code,
      'start_date', v_batch.start_date,
      'end_date', v_batch.end_date,
      'period_year', v_batch.period_year,
      'period_month', v_batch.period_month,
      'quota_qty', v_batch.quota_qty,
      'note', v_batch.note
    )
  );

  return v_batch;
end;
$$;

revoke execute on function public.create_po_batch(text, date, date, integer, integer, numeric, text) from public, anon;
grant  execute on function public.create_po_batch(text, date, date, integer, integer, numeric, text) to authenticated;


-- 3.2 update_po_batch
create or replace function public.update_po_batch(
  p_batch_id     uuid,
  p_name         text,
  p_start_date   date,
  p_end_date     date,
  p_period_year  integer,
  p_period_month integer,
  p_quota_qty    numeric default null,
  p_note         text default null
)
returns public.po_batches
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_old      public.po_batches;
  v_updated  public.po_batches;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_old
  from public.po_batches
  where id = p_batch_id and user_id = v_uid;

  if not found then
    raise exception 'Batch PO tidak ditemukan' using errcode = 'P0001';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'Nama PO tidak boleh kosong' using errcode = 'P0001';
  end if;

  if p_end_date < p_start_date then
    raise exception 'Tanggal selesai tidak boleh sebelum tanggal mulai' using errcode = 'P0001';
  end if;

  -- Bila PO sudah closed: tanggal dikunci, hanya nama, bulan periode, kuota, dan catatan yang boleh diubah
  if v_old.status = 'closed' then
    if p_start_date is distinct from v_old.start_date or p_end_date is distinct from v_old.end_date then
      raise exception 'Tanggal PO yang sudah ditutup tidak dapat diubah' using errcode = 'P0001';
    end if;
  end if;

  -- Cek keunikan nama terhadap PO lain milik user
  if lower(trim(p_name)) is distinct from lower(v_old.name) then
    if exists (
      select 1 from public.po_batches
      where user_id = v_uid and id <> p_batch_id and lower(name) = lower(trim(p_name))
    ) then
      raise exception 'Nama PO "%" sudah digunakan.', trim(p_name) using errcode = 'P0001';
    end if;
  end if;

  update public.po_batches
  set
    name = trim(p_name),
    period_year = p_period_year,
    period_month = p_period_month,
    start_date = case when v_old.status = 'open' then p_start_date else start_date end,
    end_date = case when v_old.status = 'open' then p_end_date else end_date end,
    quota_qty = p_quota_qty,
    note = p_note
  where id = p_batch_id and user_id = v_uid
  returning * into v_updated;

  -- Catat audit event 'updated' dengan nilai lama & baru di payload
  insert into public.po_batch_events (
    user_id,
    po_batch_id,
    event,
    reason,
    payload
  )
  values (
    v_uid,
    p_batch_id,
    'updated',
    'PO diperbarui oleh pengguna',
    jsonb_build_object(
      'old', jsonb_build_object(
        'name', v_old.name,
        'start_date', v_old.start_date,
        'end_date', v_old.end_date,
        'period_year', v_old.period_year,
        'period_month', v_old.period_month,
        'quota_qty', v_old.quota_qty,
        'note', v_old.note
      ),
      'new', jsonb_build_object(
        'name', v_updated.name,
        'start_date', v_updated.start_date,
        'end_date', v_updated.end_date,
        'period_year', v_updated.period_year,
        'period_month', v_updated.period_month,
        'quota_qty', v_updated.quota_qty,
        'note', v_updated.note
      )
    )
  );

  return v_updated;
end;
$$;

revoke execute on function public.update_po_batch(uuid, text, date, date, integer, integer, numeric, text) from public, anon;
grant  execute on function public.update_po_batch(uuid, text, date, date, integer, integer, numeric, text) to authenticated;


-- 3.3 delete_po_batch
create or replace function public.delete_po_batch(
  p_batch_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_batch public.po_batches;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_batch
  from public.po_batches
  where id = p_batch_id and user_id = v_uid;

  if not found then
    raise exception 'Batch PO tidak ditemukan' using errcode = 'P0001';
  end if;

  if coalesce(v_batch.is_legacy, false) = true then
    raise exception 'Batch PO legacy tidak dapat dihapus' using errcode = 'P0001';
  end if;

  if v_batch.status = 'closed' then
    raise exception 'Batch PO yang sudah ditutup tidak dapat dihapus' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.orders
    where po_batch_id = p_batch_id and user_id = v_uid
  ) then
    raise exception 'Tidak dapat menghapus PO yang sudah memiliki pesanan' using errcode = 'P0001';
  end if;

  delete from public.po_batches
  where id = p_batch_id and user_id = v_uid;

  return true;
end;
$$;

revoke execute on function public.delete_po_batch(uuid) from public, anon;
grant  execute on function public.delete_po_batch(uuid) to authenticated;


-- 3.4 list_po_batches_summary
create or replace function public.list_po_batches_summary(
  p_status text default null,
  p_year   integer default null,
  p_month  integer default null
)
returns table (
  id                 uuid,
  user_id            uuid,
  code               varchar,
  name               text,
  period_year        integer,
  period_month       integer,
  seq_in_month       integer,
  start_date         date,
  end_date           date,
  status             varchar,
  quota_qty          numeric,
  note               text,
  closed_at          timestamptz,
  closed_by          uuid,
  close_early_reason text,
  close_note         text,
  close_snapshot     jsonb,
  is_legacy          boolean,
  reopen_count       integer,
  created_at         timestamptz,
  order_count        integer,
  total_qty          numeric,
  total_price        numeric,
  quota_used_pct     numeric
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  return query
  select
    pb.id,
    pb.user_id,
    pb.code,
    pb.name,
    pb.period_year,
    pb.period_month,
    pb.seq_in_month,
    pb.start_date,
    pb.end_date,
    pb.status,
    pb.quota_qty,
    pb.note,
    pb.closed_at,
    pb.closed_by,
    pb.close_early_reason,
    pb.close_note,
    pb.close_snapshot,
    pb.is_legacy,
    pb.reopen_count,
    pb.created_at,
    coalesce(agg.order_count, 0)::integer as order_count,
    coalesce(agg.total_qty, 0)::numeric as total_qty,
    coalesce(agg.total_price, 0)::numeric as total_price,
    case
      when pb.quota_qty is not null and pb.quota_qty > 0 then
        round((coalesce(agg.total_qty, 0)::numeric / pb.quota_qty) * 100, 2)
      else null
    end as quota_used_pct
  from public.po_batches pb
  left join (
    select
      o.po_batch_id,
      count(distinct o.id)::integer as order_count,
      coalesce(sum(oi.qty), 0)::numeric as total_qty,
      coalesce(sum(o.total_price), 0)::numeric as total_price
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    where o.user_id = v_uid
    group by o.po_batch_id
  ) agg on agg.po_batch_id = pb.id
  where pb.user_id = v_uid
    and (p_status is null or pb.status = p_status)
    and (p_year is null or pb.period_year = p_year)
    and (p_month is null or pb.period_month = p_month)
  order by pb.start_date desc, pb.created_at desc;
end;
$$;

revoke execute on function public.list_po_batches_summary(text, integer, integer) from public, anon;
grant  execute on function public.list_po_batches_summary(text, integer, integer) to authenticated;


-- ----------------------------------------------------------------------------
-- 4. REVISI close_po_batch (Aturan today_wib < end_date, Kuota, Audit Gagal Rekap)
-- ----------------------------------------------------------------------------

create or replace function public.close_po_batch(
  p_batch_id     uuid,
  p_early_reason text default null,
  p_mark_rekap   boolean default true,
  p_note         text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid            uuid := auth.uid();
  v_today_wib      date := (now() at time zone 'Asia/Jakarta')::date;
  v_batch          public.po_batches;
  v_is_early       boolean := false;
  v_total_orders   integer := 0;
  v_total_pcs      numeric := 0;
  v_unit_orders    integer := 0;
  v_unit_pcs       numeric := 0;
  v_priority_orders integer := 0;
  v_priority_pcs   numeric := 0;
  v_total_price    numeric := 0;
  v_total_ongkir   numeric := 0;
  v_total_paid     numeric := 0;
  v_total_remaining numeric := 0;
  v_quota_used_pct numeric := null;
  v_total_hpp      numeric := 0;
  v_by_sales       jsonb := '[]'::jsonb;
  v_by_category    jsonb := '[]'::jsonb;
  v_by_product     jsonb := '[]'::jsonb;
  v_fabrics        jsonb := '[]'::jsonb;
  v_orders_list    jsonb := '[]'::jsonb;
  v_order_rec      record;
  v_failed_rekap_ids jsonb := '[]'::jsonb;
  v_failed_rekap_cnt integer := 0;
  v_snapshot       jsonb;
  v_closer_name    text;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_batch
  from public.po_batches
  where id = p_batch_id and user_id = v_uid;

  if not found then
    raise exception 'Batch PO tidak ditemukan' using errcode = 'P0001';
  end if;

  -- 1. Idempoten: bila sudah closed, kembalikan snapshot yang ada
  if v_batch.status = 'closed' then
    return v_batch.close_snapshot;
  end if;

  -- 2. Aturan D6 Baru: Ditutup lebih awal bila tanggal hari ini WIB < tanggal selesai (end_date)
  if v_today_wib < v_batch.end_date then
    v_is_early := true;
    if p_early_reason is null or trim(p_early_reason) = '' then
      raise exception 'Penutupan PO sebelum tanggal selesai (%) memerlukan alasan penutupan lebih awal',
        to_char(v_batch.end_date, 'YYYY-MM-DD')
        using errcode = 'P0001';
    end if;
  end if;

  -- 3. Agregasi data snapshot untuk order dalam PO ini
  select
    coalesce(count(*), 0)::integer,
    coalesce(sum(sub.total_pcs), 0)::numeric,
    coalesce(count(*) filter (where sub.order_type = 'satuan'), 0)::integer,
    coalesce(sum(case when sub.order_type = 'satuan' then sub.total_pcs else 0 end), 0)::numeric,
    coalesce(count(*) filter (where sub.order_type = 'prioritas'), 0)::integer,
    coalesce(sum(case when sub.order_type = 'prioritas' then sub.total_pcs else 0 end), 0)::numeric,
    coalesce(sum(sub.total_price), 0)::numeric,
    coalesce(sum(sub.ongkir), 0)::numeric,
    coalesce(sum(sub.paid_amount), 0)::numeric,
    coalesce(sum(sub.remaining_amount), 0)::numeric
  into
    v_total_orders,
    v_total_pcs,
    v_unit_orders,
    v_unit_pcs,
    v_priority_orders,
    v_priority_pcs,
    v_total_price,
    v_total_ongkir,
    v_total_paid,
    v_total_remaining
  from (
    select
      o.id,
      coalesce(o.order_type, 'satuan') as order_type,
      o.total_price,
      o.ongkir,
      coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0) as paid_amount,
      (o.total_price + o.ongkir) - (coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)) as remaining_amount,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    left join (
      select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
    ) p on p.order_id = o.id
    left join (
      select order_id, sum(amount) as released_amount from public.order_deposit_releases group by order_id
    ) r on r.order_id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by o.id, o.order_type, o.total_price, o.ongkir, p.paid_amount, r.released_amount
  ) sub;

  if v_batch.quota_qty is not null and v_batch.quota_qty > 0 then
    v_quota_used_pct := round((v_total_pcs / v_batch.quota_qty) * 100, 2);
  end if;

  -- 3.1 Total HPP snapshot dari order_items
  select coalesce(sum(coalesce(oi.hpp_total_snapshot, (oi.qty * coalesce(oi.hpp_per_unit_snapshot, 0)))), 0)::numeric
  into v_total_hpp
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.po_batch_id = p_batch_id and o.user_id = v_uid;

  -- 3.2 Breakdown per sales
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_sales
  from (
    select
      s.id::text as sales_id,
      coalesce(s.name, 'Tanpa Sales') as sales_name,
      count(distinct o.id)::integer as order_count,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(o.total_price), 0)::numeric as total_price
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    left join public.order_items oi on oi.order_id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by s.id, s.name
    order by total_price desc
  ) sub;

  -- 3.3 Breakdown per kategori produk
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_category
  from (
    select
      coalesce(pc.name, 'Tanpa Kategori') as category,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(oi.qty * oi.price), 0)::numeric as total_price
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.product_categories pc on pc.id = oi.category_id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by pc.name
    order by total_pcs desc
  ) sub;

  -- 3.4 Breakdown per produk
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_product
  from (
    select
      oi.product_id::text as product_id,
      oi.name_item as product_name,
      coalesce(pc.name, 'Tanpa Kategori') as category,
      sum(oi.qty)::numeric as total_pcs,
      sum(oi.qty * oi.price)::numeric as total_price
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.product_categories pc on pc.id = oi.category_id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by oi.product_id, oi.name_item, pc.name
    order by total_pcs desc
  ) sub;

  -- 3.5 Rekap kebutuhan kain (BOM material & warna) vs stok terkini saat close
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_fabrics
  from (
    select
      m.id::text as material_id,
      m.name as material_name,
      mc.id::text as color_id,
      coalesce(mc.color_name, 'Polos') as color_name,
      round(sum(oi.qty * coalesce(oif.usage_qty_snapshot, 0)), 2)::numeric as required_meters,
      coalesce(mc.stock_qty, m.stock_qty, 0)::numeric as stock_meters_at_close,
      greatest(0, round(sum(oi.qty * coalesce(oif.usage_qty_snapshot, 0)), 2) - coalesce(mc.stock_qty, m.stock_qty, 0))::numeric as shortage_meters
    from public.order_item_fabrics oif
    join public.order_items oi on oi.id = oif.order_item_id
    join public.orders o on o.id = oi.order_id
    join public.materials m on m.id = oif.material_id
    left join public.material_colors mc on mc.id = oif.material_color_id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by m.id, m.name, mc.id, mc.color_name, coalesce(mc.stock_qty, m.stock_qty, 0)
    order by m.name asc, mc.color_name asc
  ) sub;

  -- 3.6 Daftar order saat close
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_orders_list
  from (
    select
      o.id::text as id,
      o.order_id,
      o.order_date::text as order_date,
      coalesce(o.order_type, 'satuan') as order_type,
      o.customer_name,
      s.name as sales_name,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      o.total_price,
      o.ongkir,
      o.status as payment_status,
      o.production_status
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    left join public.order_items oi on oi.order_id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by o.id, o.order_id, o.order_date, o.order_type, o.customer_name, s.name, o.total_price, o.ongkir, o.status, o.production_status
    order by o.created_at asc
  ) sub;

  -- Ambil nama penutup dari company_settings / auth
  select coalesce(company_name, 'Admin') into v_closer_name
  from public.company_settings where user_id = v_uid limit 1;

  -- 4. Opsi tandai Rekap massal untuk seluruh order
  -- REVISI: Catat kegagalan toggle_order_stage pada order tertentu, jangan ditelan diam-diam
  if p_mark_rekap and v_total_orders > 0 then
    for v_order_rec in (
      select id from public.orders
      where po_batch_id = p_batch_id and user_id = v_uid
    ) loop
      begin
        perform public.toggle_order_stage(v_order_rec.id, 'rekap', true, 'Ditandai selesai otomatis saat tutup PO');
      exception when others then
        v_failed_rekap_cnt := v_failed_rekap_cnt + 1;
        v_failed_rekap_ids := v_failed_rekap_ids || to_jsonb(v_order_rec.id::text);
      end;
    end loop;

    insert into public.po_batch_events (user_id, po_batch_id, event, reason, payload)
    values (
      v_uid,
      p_batch_id,
      'rekap_bulk',
      'Tandai Rekap selesai untuk semua order saat tutup PO',
      jsonb_build_object(
        'total_orders', v_total_orders,
        'failed_count', v_failed_rekap_cnt,
        'failed_order_ids', v_failed_rekap_ids
      )
    );
  end if;

  -- Susun snapshot versi 1 dengan penambahan batch.name, quota_qty, dan quota_used_pct
  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'closed_at', now(),
    'closed_by', v_uid,
    'closed_by_name', coalesce(v_closer_name, 'Admin'),
    'is_early', v_is_early,
    'close_early_reason', p_early_reason,
    'close_note', p_note,
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'code', v_batch.code,
      'name', v_batch.name,
      'start_date', v_batch.start_date,
      'end_date', v_batch.end_date,
      'period_year', v_batch.period_year,
      'period_month', v_batch.period_month,
      'quota_qty', v_batch.quota_qty
    ),
    'summary', jsonb_build_object(
      'total_orders', v_total_orders,
      'total_pcs', v_total_pcs,
      'unit_orders', v_unit_orders,
      'unit_pcs', v_unit_pcs,
      'priority_orders', v_priority_orders,
      'priority_pcs', v_priority_pcs,
      'total_price', v_total_price,
      'total_ongkir', v_total_ongkir,
      'total_paid', v_total_paid,
      'total_remaining', v_total_remaining,
      'quota_qty', v_batch.quota_qty,
      'quota_used_pct', v_quota_used_pct,
      'total_hpp_estimate', v_total_hpp,
      'estimated_margin', (v_total_price - v_total_hpp)
    ),
    'sales_breakdown', v_by_sales,
    'category_breakdown', v_by_category,
    'product_breakdown', v_by_product,
    'fabric_requirements', v_fabrics,
    'orders', v_orders_list,
    'rekap_bulk_result', jsonb_build_object(
      'marked', p_mark_rekap,
      'failed_count', v_failed_rekap_cnt,
      'failed_order_ids', v_failed_rekap_ids
    )
  );

  -- 5. Perbarui status PO menjadi closed beserta snapshot
  update public.po_batches
  set
    status = 'closed',
    closed_at = now(),
    closed_by = v_uid,
    close_early_reason = p_early_reason,
    close_note = p_note,
    close_snapshot = v_snapshot
  where id = p_batch_id and user_id = v_uid;

  -- 6. Catat audit event penutupan PO
  insert into public.po_batch_events (user_id, po_batch_id, event, reason, payload)
  values (
    v_uid,
    p_batch_id,
    'closed',
    coalesce(p_early_reason, p_note, 'Tutup PO'),
    jsonb_build_object(
      'is_early_close', v_is_early,
      'early_reason', p_early_reason,
      'note', p_note,
      'snapshot_summary', v_snapshot->'summary'
    )
  );

  return v_snapshot;
end;
$$;

revoke execute on function public.close_po_batch(uuid, text, boolean, text) from public, anon;
grant  execute on function public.close_po_batch(uuid, text, boolean, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 5. DROP FUNCTION LAMA YANG DICABUT
-- ----------------------------------------------------------------------------

drop function if exists public.get_current_po();
drop function if exists public.ensure_po_batch(date);

-- Tandai po_week_info deprecated
comment on function public.po_week_info(date) is 'DEPRECATED: tidak dipakai kode baru';


-- ----------------------------------------------------------------------------
-- 6. UPDATE VIEW orders_with_balance (Tambah po_name di AKHIR)
-- ----------------------------------------------------------------------------

create or replace view public.orders_with_balance
with (security_invoker = true) as
select
  -- 12 kolom orders
  o.id,
  o.user_id,
  o.order_id,
  o.sales_id,
  o.customer_name,
  o.total_price,
  o.ongkir,
  o.status,
  o.production_status,
  o.bonus_paid,
  o.order_date,
  o.created_at,
  -- 4 kolom kalkulasi
  s.name as sales_name,
  (o.total_price + o.ongkir) as grand_total,
  coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0) as paid_amount,
  (o.total_price + o.ongkir) - (coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)) as remaining_amount,
  -- 2 kolom order_type
  o.order_type,
  o.is_order_type_manual_override,
  -- 4 kolom Batch PO di akhir (po_name paling akhir)
  o.po_batch_id,
  pb.code as po_code,
  pb.status as po_status,
  pb.name as po_name
from public.orders o
left join public.sales s on s.id = o.sales_id
left join (
  select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
) p on p.order_id = o.id
left join (
  select order_id, sum(amount) as released_amount from public.order_deposit_releases group by order_id
) r on r.order_id = o.id
left join public.po_batches pb on pb.id = o.po_batch_id;

grant select on public.orders_with_balance to authenticated;


-- ----------------------------------------------------------------------------
-- 7. REVISI TIGA RPC PELAPORAN
-- ----------------------------------------------------------------------------

-- 7.1 get_po_daily_report(p_date)
--     Menyaring order berdasarkan order_date = p_date.
--     Menghasilkan array 'pos' per PO yang disentuh pada tanggal tersebut beserta
--     akumulasi kumulatif order_date <= p_date.
create or replace function public.get_po_daily_report(
  p_date date default (now() at time zone 'Asia/Jakarta')::date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid            uuid := auth.uid();
  v_date           date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_today_orders   integer := 0;
  v_today_pcs      numeric := 0;
  v_today_price    numeric := 0;
  v_today_ongkir   numeric := 0;
  v_today_paid     numeric := 0;
  v_by_sales       jsonb := '[]'::jsonb;
  v_by_category    jsonb := '[]'::jsonb;
  v_orders_list    jsonb := '[]'::jsonb;
  v_pos_array      jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  -- 1. Ringkasan Hari Ini (order_date = v_date)
  select
    coalesce(count(*), 0)::integer,
    coalesce(sum(sub.pcs), 0)::numeric,
    coalesce(sum(sub.total_price), 0)::numeric,
    coalesce(sum(sub.ongkir), 0)::numeric
  into
    v_today_orders,
    v_today_pcs,
    v_today_price,
    v_today_ongkir
  from (
    select
      o.id,
      o.total_price,
      o.ongkir,
      coalesce(sum(oi.qty), 0)::numeric as pcs
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    where o.user_id = v_uid and o.order_date = v_date
    group by o.id, o.total_price, o.ongkir
  ) sub;

  -- Pembayaran kas yang diterima pada tanggal tersebut
  select coalesce(sum(amount), 0)::numeric into v_today_paid
  from public.order_payments
  where user_id = v_uid and payment_date = v_date;

  -- 2. Breakdown per sales pada tanggal tersebut
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_sales
  from (
    select
      s.id::text as sales_id,
      coalesce(s.name, 'Tanpa Sales') as sales_name,
      count(distinct o.id)::integer as order_count,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(o.total_price), 0)::numeric as total_price
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    left join public.order_items oi on oi.order_id = o.id
    where o.user_id = v_uid and o.order_date = v_date
    group by s.id, s.name
    order by total_price desc
  ) sub;

  -- 3. Breakdown per kategori produk pada tanggal tersebut
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_category
  from (
    select
      coalesce(pc.name, 'Tanpa Kategori') as category,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(oi.qty * oi.price), 0)::numeric as total_price
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.product_categories pc on pc.id = oi.category_id
    where o.user_id = v_uid and o.order_date = v_date
    group by pc.name
    order by total_pcs desc
  ) sub;

  -- 4. Daftar pesanan pada tanggal tersebut (membawa po_name)
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_orders_list
  from (
    select
      o.id::text as id,
      o.order_id,
      o.order_date::text as order_date,
      o.customer_name,
      s.name as sales_name,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      o.total_price,
      o.ongkir,
      o.status as payment_status,
      o.production_status,
      pb.id::text as po_batch_id,
      pb.code as po_code,
      pb.name as po_name
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    left join public.order_items oi on oi.order_id = o.id
    left join public.po_batches pb on pb.id = o.po_batch_id
    where o.user_id = v_uid and o.order_date = v_date
    group by o.id, o.order_id, o.order_date, o.customer_name, s.name, o.total_price, o.ongkir, o.status, o.production_status, pb.id, pb.code, pb.name
    order by o.created_at asc
  ) sub;

  -- 5. Array 'pos': tiap PO yang disentuh order pada tanggal tersebut
  --    plus akumulasi order_date <= v_date
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_pos_array
  from (
    select
      pb.id::text as batch_id,
      pb.name,
      pb.code,
      pb.status,
      pb.start_date::text as start_date,
      pb.end_date::text as end_date,
      pb.period_year,
      pb.period_month,
      pb.quota_qty,
      -- Order hari ini di PO ini
      t_ord.today_orders,
      t_ord.today_pcs,
      -- Kumulatif order PO ini s/d tanggal p_date
      c_ord.cum_orders,
      c_ord.cum_pcs,
      c_ord.cum_price,
      c_ord.cum_paid,
      case
        when pb.quota_qty is not null and pb.quota_qty > 0 then
          round((c_ord.cum_pcs / pb.quota_qty) * 100, 2)
        else null
      end as quota_used_pct
    from public.po_batches pb
    join (
      select
        o.po_batch_id,
        count(distinct o.id)::integer as today_orders,
        coalesce(sum(oi.qty), 0)::numeric as today_pcs
      from public.orders o
      left join public.order_items oi on oi.order_id = o.id
      where o.user_id = v_uid and o.order_date = v_date
      group by o.po_batch_id
    ) t_ord on t_ord.po_batch_id = pb.id
    join (
      select
        o.po_batch_id,
        count(distinct o.id)::integer as cum_orders,
        coalesce(sum(oi.qty), 0)::numeric as cum_pcs,
        coalesce(sum(o.total_price), 0)::numeric as cum_price,
        coalesce(sum(p.paid_amount), 0)::numeric as cum_paid
      from public.orders o
      left join public.order_items oi on oi.order_id = o.id
      left join (
        select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
      ) p on p.order_id = o.id
      where o.user_id = v_uid and o.order_date <= v_date
      group by o.po_batch_id
    ) c_ord on c_ord.po_batch_id = pb.id
    where pb.user_id = v_uid
    order by pb.start_date asc
  ) sub;

  return jsonb_build_object(
    'date', v_date::text,
    'today_summary', jsonb_build_object(
      'order_count', v_today_orders,
      'total_pcs', v_today_pcs,
      'total_price', v_today_price,
      'total_ongkir', v_today_ongkir,
      'payment_received', v_today_paid
    ),
    -- Alias kompatibilitas ke frontend
    'summary', jsonb_build_object(
      'order_count', v_today_orders,
      'total_pcs', v_today_pcs,
      'total_price', v_today_price,
      'total_ongkir', v_today_ongkir,
      'payment_received', v_today_paid
    ),
    'by_sales', v_by_sales,
    'sales_breakdown', v_by_sales,
    'by_category', v_by_category,
    'product_category_breakdown', v_by_category,
    'orders', v_orders_list,
    'pos', v_pos_array
  );
end;
$$;

revoke execute on function public.get_po_daily_report(date) from public, anon;
grant  execute on function public.get_po_daily_report(date) to authenticated;


-- 7.2 get_po_close_report(p_batch_id)
--     Snapshot memuat batch.name, quota_qty, quota_used_pct.
--     Snapshot lama tanpa kolom baru tetap terbaca aman.
create or replace function public.get_po_close_report(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid         uuid := auth.uid();
  v_batch       public.po_batches;
  v_paid_live   numeric := 0;
  v_rec_live    numeric := 0;
  v_lunas_count integer := 0;
  v_tot_order_pcs numeric := 0;
  v_cut_pcs     numeric := 0;
  v_sew_pcs     numeric := 0;
  v_qc_pcs      numeric := 0;
  v_closer_name text;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_batch
  from public.po_batches
  where id = p_batch_id and user_id = v_uid;

  if not found then
    raise exception 'Batch PO tidak ditemukan' using errcode = 'P0001';
  end if;

  -- Jika belum closed, kembalikan status dasar
  if v_batch.status <> 'closed' or v_batch.close_snapshot is null then
    return jsonb_build_object(
      'batch', jsonb_build_object(
        'id', v_batch.id,
        'code', v_batch.code,
        'name', v_batch.name,
        'start_date', v_batch.start_date,
        'end_date', v_batch.end_date,
        'status', v_batch.status,
        'quota_qty', v_batch.quota_qty,
        'closed_at', null,
        'closed_by_name', null,
        'close_early_reason', null,
        'close_note', null,
        'is_legacy', v_batch.is_legacy
      ),
      'is_closed', false,
      'close_snapshot', null,
      'live_status', null
    );
  end if;

  -- Data LIVE: Status Pelunasan Pembayaran Sekarang
  select
    coalesce(sum(paid), 0)::numeric,
    coalesce(sum(greatest(0, grand_total - paid)), 0)::numeric,
    coalesce(count(*) filter (where paid >= grand_total and grand_total > 0), 0)::integer
  into
    v_paid_live,
    v_rec_live,
    v_lunas_count
  from (
    select
      o.id,
      (o.total_price + o.ongkir) as grand_total,
      (coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)) as paid
    from public.orders o
    left join (
      select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
    ) p on p.order_id = o.id
    left join (
      select order_id, sum(amount) as released_amount from public.order_deposit_releases group by order_id
    ) r on r.order_id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
  ) sub;

  -- Data LIVE: Progres Fisik Produksi Terkini
  select
    coalesce(sum(oi.qty), 0)::numeric,
    coalesce(sum(case when oi.cutting_completed_at is not null then oi.qty else 0 end), 0)::numeric,
    coalesce(sum(sa.sewn_qty), 0)::numeric,
    coalesce(sum(sa.qc_passed_qty), 0)::numeric
  into
    v_tot_order_pcs,
    v_cut_pcs,
    v_sew_pcs,
    v_qc_pcs
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join (
    select order_item_id, sum(sewn_qty) as sewn_qty, sum(qc_passed_qty) as qc_passed_qty
    from public.sewing_assignments
    group by order_item_id
  ) sa on sa.order_item_id = oi.id
  where o.po_batch_id = p_batch_id and o.user_id = v_uid;

  select coalesce(company_name, 'Admin') into v_closer_name
  from public.company_settings where user_id = v_uid limit 1;

  return jsonb_build_object(
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'code', v_batch.code,
      'name', v_batch.name,
      'start_date', v_batch.start_date,
      'end_date', v_batch.end_date,
      'status', v_batch.status,
      'quota_qty', v_batch.quota_qty,
      'closed_at', v_batch.closed_at,
      'closed_by_name', coalesce(v_closer_name, 'Admin'),
      'close_early_reason', v_batch.close_early_reason,
      'close_note', v_batch.close_note,
      'is_legacy', v_batch.is_legacy
    ),
    'is_closed', true,
    'close_snapshot', v_batch.close_snapshot,
    'live_status', jsonb_build_object(
      'payment', jsonb_build_object(
        'paid_amount', v_paid_live,
        'remaining_receivable', v_rec_live,
        'fully_paid_orders', v_lunas_count
      ),
      'production', jsonb_build_object(
        'total_order_pcs', v_tot_order_pcs,
        'cutting_completed_pcs', v_cut_pcs,
        'cutting_pct', case when v_tot_order_pcs > 0 then round((v_cut_pcs / v_tot_order_pcs) * 100, 1) else 0 end,
        'sewing_completed_pcs', v_sew_pcs,
        'sewing_pct', case when v_tot_order_pcs > 0 then round((v_sew_pcs / v_tot_order_pcs) * 100, 1) else 0 end,
        'qc_passed_pcs', v_qc_pcs,
        'qc_pct', case when v_tot_order_pcs > 0 then round((v_qc_pcs / v_tot_order_pcs) * 100, 1) else 0 end
      )
    )
  );
end;
$$;

revoke execute on function public.get_po_close_report(uuid) from public, anon;
grant  execute on function public.get_po_close_report(uuid) to authenticated;


-- 7.3 get_po_monthly_report(p_year, p_month)
--     Mengelompokkan PO berdasarkan period_year dan period_month pilihan owner.
--     Tiap baris PO memuat name, quota_qty, quota_used_pct.
create or replace function public.get_po_monthly_report(
  p_year  integer,
  p_month integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid            uuid := auth.uid();
  v_month_names    text[] := array['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  v_month_name     text;
  v_po_batches     jsonb := '[]'::jsonb;
  v_unlinked_pw    numeric := 0;
  v_total_pos      integer := 0;
  v_total_orders   integer := 0;
  v_total_pcs      numeric := 0;
  v_total_booking  numeric := 0;
  v_total_ongkir   numeric := 0;
  v_total_paid     numeric := 0;
  v_total_rec      numeric := 0;
  v_total_ship_cnt integer := 0;
  v_total_ship_val numeric := 0;
  v_total_hpp_est  numeric := 0;
  v_total_margin   numeric := 0;
  v_total_pw       numeric := 0;
  v_total_mat      numeric := 0;
  v_total_quota    numeric := 0;
  v_total_quota_realized numeric := 0;
  v_prev_year      integer;
  v_prev_month     integer;
  v_prev_orders    integer := 0;
  v_prev_pcs       numeric := 0;
  v_prev_booking   numeric := 0;
  v_prev_margin    numeric := 0;
  v_month_start    date;
  v_month_end      date;
  v_rec_4_1000     numeric := 0;
  v_rec_4_1100     numeric := 0;
  v_total_rec_rev  numeric := 0;
  v_recon_notes    text;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_month not between 1 and 12 then
    raise exception 'Bulan tidak valid (1-12)' using errcode = 'P0001';
  end if;

  v_month_name := v_month_names[p_month];

  -- 1. Daftar per PO dalam bulan laporan (period_year & period_month pilihan owner)
  select coalesce(jsonb_agg(po_row), '[]'::jsonb) into v_po_batches
  from (
    select
      pb.id::text as batch_id,
      pb.code,
      pb.name,
      pb.seq_in_month,
      pb.start_date::text as start_date,
      pb.end_date::text as end_date,
      pb.status,
      pb.quota_qty,
      coalesce(o_agg.order_count, 0)::integer as order_count,
      coalesce(o_agg.total_pcs, 0)::numeric as total_pcs,
      coalesce(o_agg.booking_value, 0)::numeric as booking_value,
      coalesce(o_agg.total_ongkir, 0)::numeric as total_ongkir,
      coalesce(o_agg.paid_amount, 0)::numeric as paid_amount,
      coalesce(o_agg.receivable_amount, 0)::numeric as receivable_amount,
      coalesce(o_agg.shipped_order_count, 0)::integer as shipped_order_count,
      coalesce(o_agg.shipped_order_value, 0)::numeric as shipped_order_value,
      coalesce(o_agg.hpp_total_estimate, 0)::numeric as hpp_total_estimate,
      (coalesce(o_agg.booking_value, 0) - coalesce(o_agg.hpp_total_estimate, 0))::numeric as estimated_margin,
      coalesce(pw.total_wage, 0)::numeric as actual_piecework_wage,
      coalesce(mat.total_material_cost, 0)::numeric as material_purchases,
      case
        when pb.quota_qty is not null and pb.quota_qty > 0 then
          round((coalesce(o_agg.total_pcs, 0)::numeric / pb.quota_qty) * 100, 2)
        else null
      end as quota_used_pct
    from public.po_batches pb
    left join (
      select
        o.po_batch_id,
        count(distinct o.id)::integer as order_count,
        coalesce(sum(oi.qty), 0)::numeric as total_pcs,
        coalesce(sum(o.total_price), 0)::numeric as booking_value,
        coalesce(sum(o.ongkir), 0)::numeric as total_ongkir,
        coalesce(sum(p.paid_amount), 0)::numeric - coalesce(sum(r.released_amount), 0)::numeric as paid_amount,
        coalesce(sum(o.total_price + o.ongkir), 0)::numeric - (coalesce(sum(p.paid_amount), 0)::numeric - coalesce(sum(r.released_amount), 0)::numeric) as receivable_amount,
        count(distinct case when o.production_status = 'shipped' then o.id else null end)::integer as shipped_order_count,
        coalesce(sum(case when o.production_status = 'shipped' then o.total_price else 0 end), 0)::numeric as shipped_order_value,
        coalesce(sum(coalesce(oi.hpp_total_snapshot, (oi.qty * coalesce(oi.hpp_per_unit_snapshot, 0)))), 0)::numeric as hpp_total_estimate
      from public.orders o
      left join public.order_items oi on oi.order_id = o.id
      left join (
        select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
      ) p on p.order_id = o.id
      left join (
        select order_id, sum(amount) as released_amount from public.order_deposit_releases group by order_id
      ) r on r.order_id = o.id
      where o.user_id = v_uid
      group by o.po_batch_id
    ) o_agg on o_agg.po_batch_id = pb.id
    left join (
      select
        o.po_batch_id,
        coalesce(sum(pt.total_wage), 0)::numeric as total_wage
      from public.piecework_tasks pt
      join public.orders o on o.id = pt.order_id
      where pt.user_id = v_uid and pt.status = 'approved'
      group by o.po_batch_id
    ) pw on pw.po_batch_id = pb.id
    left join (
      select
        o.po_batch_id,
        coalesce(sum(sub_m.item_cost), 0)::numeric as total_material_cost
      from public.stock_requests sr
      join public.orders o on o.id = sr.source_order_id
      join (
        select stock_request_id, sum(quantity * unit_price) as item_cost
        from public.purchasing_report_items
        where stock_request_id is not null
        group by stock_request_id
        union all
        select stock_request_id, sum(quantity * unit_price) as item_cost
        from public.supplier_purchase_items
        where stock_request_id is not null
        group by stock_request_id
      ) sub_m on sub_m.stock_request_id = sr.id
      where sr.user_id = v_uid and o.po_batch_id is not null
      group by o.po_batch_id
    ) mat on mat.po_batch_id = pb.id
    where pb.user_id = v_uid
      and pb.period_year = p_year
      and pb.period_month = p_month
    order by pb.start_date asc
  ) po_row;

  -- 2. Upah Borongan tanpa order_id (tidak teralokasi ke PO)
  select coalesce(sum(pt.total_wage), 0)::numeric into v_unlinked_pw
  from public.piecework_tasks pt
  where pt.user_id = v_uid
    and pt.order_id is null
    and pt.status = 'approved'
    and extract(year from coalesce(pt.completed_at, pt.created_at)) = p_year
    and extract(month from coalesce(pt.completed_at, pt.created_at)) = p_month;

  -- 3. Akumulasi Total Bulan Ini
  select
    coalesce(count(*), 0)::integer,
    coalesce(sum((elem->>'order_count')::integer), 0)::integer,
    coalesce(sum((elem->>'total_pcs')::numeric), 0)::numeric,
    coalesce(sum((elem->>'booking_value')::numeric), 0)::numeric,
    coalesce(sum((elem->>'total_ongkir')::numeric), 0)::numeric,
    coalesce(sum((elem->>'paid_amount')::numeric), 0)::numeric,
    coalesce(sum((elem->>'receivable_amount')::numeric), 0)::numeric,
    coalesce(sum((elem->>'shipped_order_count')::integer), 0)::integer,
    coalesce(sum((elem->>'shipped_order_value')::numeric), 0)::numeric,
    coalesce(sum((elem->>'hpp_total_estimate')::numeric), 0)::numeric,
    coalesce(sum((elem->>'estimated_margin')::numeric), 0)::numeric,
    coalesce(sum((elem->>'actual_piecework_wage')::numeric), 0)::numeric,
    coalesce(sum((elem->>'material_purchases')::numeric), 0)::numeric,
    coalesce(sum(case when (elem->>'quota_qty') is not null then (elem->>'quota_qty')::numeric else 0 end), 0)::numeric,
    coalesce(sum(case when (elem->>'quota_qty') is not null then (elem->>'total_pcs')::numeric else 0 end), 0)::numeric
  into
    v_total_pos,
    v_total_orders,
    v_total_pcs,
    v_total_booking,
    v_total_ongkir,
    v_total_paid,
    v_total_rec,
    v_total_ship_cnt,
    v_total_ship_val,
    v_total_hpp_est,
    v_total_margin,
    v_total_pw,
    v_total_mat,
    v_total_quota,
    v_total_quota_realized
  from jsonb_array_elements(v_po_batches) elem;

  -- 4. Pembanding Bulan Lalu
  if p_month = 1 then
    v_prev_year := p_year - 1;
    v_prev_month := 12;
  else
    v_prev_year := p_year;
    v_prev_month := p_month - 1;
  end if;

  select
    coalesce(count(distinct o.id), 0)::integer,
    coalesce(sum(oi.qty), 0)::numeric,
    coalesce(sum(o.total_price), 0)::numeric,
    coalesce(sum(o.total_price), 0)::numeric - coalesce(sum(coalesce(oi.hpp_total_snapshot, (oi.qty * coalesce(oi.hpp_per_unit_snapshot, 0)))), 0)::numeric
  into
    v_prev_orders,
    v_prev_pcs,
    v_prev_booking,
    v_prev_margin
  from public.orders o
  join public.po_batches pb on pb.id = o.po_batch_id
  left join public.order_items oi on oi.order_id = o.id
  where o.user_id = v_uid
    and pb.period_year = v_prev_year
    and pb.period_month = v_prev_month;

  -- 5. Blok Rekonsiliasi Jurnal Akuntansi (Bulan Kalender)
  v_month_start := make_date(p_year, p_month, 1);
  v_month_end   := (v_month_start + interval '1 month - 1 day')::date;

  select
    coalesce(sum(case when a.code = '4-1000' then jl.credit - jl.debit else 0 end), 0)::numeric,
    coalesce(sum(case when a.code = '4-1100' then jl.credit - jl.debit else 0 end), 0)::numeric
  into
    v_rec_4_1000,
    v_rec_4_1100
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id
  join public.accounts a on a.id = jl.account_id
  where je.user_id = v_uid
    and je.entry_date between v_month_start and v_month_end
    and a.code in ('4-1000', '4-1100');

  v_total_rec_rev := v_rec_4_1000 + v_rec_4_1100;

  v_recon_notes := 'Pendapatan di jurnal diakui berdasarkan waktu pengiriman pesanan (accrual), sedangkan nilai PO adalah total pesanan masuk pada periode PO.';

  if p_year = 2026 and p_month = 10 then
    v_recon_notes := v_recon_notes || ' Catatan: PO 4 Oktober melewati books_start_date 2026-11-01 sehingga jurnal pengakuan pendapatan untuk PO tersebut hanya tercatat sebagian.';
  end if;

  return jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'month_name', v_month_name,
    'po_batches', v_po_batches,
    'unlinked_piecework_wage', v_unlinked_pw,
    'totals', jsonb_build_object(
      'po_count', v_total_pos,
      'order_count', v_total_orders,
      'total_pcs', v_total_pcs,
      'booking_value', v_total_booking,
      'total_ongkir', v_total_ongkir,
      'paid_amount', v_total_paid,
      'receivable_amount', v_total_rec,
      'shipped_order_count', v_total_ship_cnt,
      'shipped_order_value', v_total_ship_val,
      'hpp_total_estimate', v_total_hpp_est,
      'estimated_margin', v_total_margin,
      'actual_piecework_wage', v_total_pw,
      'material_purchases', v_total_mat,
      'total_quota_qty', v_total_quota,
      'quota_used_pct', case when v_total_quota > 0 then round((v_total_quota_realized / v_total_quota) * 100, 2) else null end
    ),
    'previous_month_comparison', jsonb_build_object(
      'previous_year', v_prev_year,
      'previous_month', v_prev_month,
      'totals', jsonb_build_object(
        'order_count', v_prev_orders,
        'total_pcs', v_prev_pcs,
        'booking_value', v_prev_booking,
        'estimated_margin', v_prev_margin
      ),
      'diff', jsonb_build_object(
        'order_count_diff', v_total_orders - v_prev_orders,
        'total_pcs_diff', v_total_pcs - v_prev_pcs,
        'booking_value_diff', v_total_booking - v_prev_booking,
        'estimated_margin_diff', v_total_margin - v_prev_margin
      )
    ),
    'reconciliation', jsonb_build_object(
      'recognized_revenue_4_1000', v_rec_4_1000,
      'recognized_revenue_4_1100', v_rec_4_1100,
      'total_recognized_revenue', v_total_rec_rev,
      'booking_value_difference', v_total_booking - v_total_rec_rev,
      'notes', v_recon_notes
    )
  );
end;
$$;

revoke execute on function public.get_po_monthly_report(integer, integer) from public, anon;
grant  execute on function public.get_po_monthly_report(integer, integer) to authenticated;
