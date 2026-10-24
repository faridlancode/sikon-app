-- ===========================================================================
-- Migration: 20261019110000_po_batch_close_reopen.sql
-- Fase 1c: Penjaga item order PO tertutup, saklar po_gate_production,
--          RPC close_po_batch, reopen_po_batch, get_current_po,
--          list_po_batches, serta revisi delete_order audit event.
-- ===========================================================================

-- 1. Tambah saklar Mode A/B po_gate_production pada company_settings
alter table public.company_settings
  add column if not exists po_gate_production boolean not null default false;

-- 2. Trigger guard order_items untuk PO berstatus closed
--    Aturan:
--    - Lewati jika order induk sedang dihapus (cascade delete dari orders)
--    - Lewati jika PO berstatus open atau merupakan is_legacy = true
--    - Blokir INSERT item baru pada order dengan PO closed
--    - Blokir DELETE item pada order dengan PO closed
--    - Blokir UPDATE jika mengubah kolom komersial: product_id, qty, price
--    - Izinkan UPDATE kolom produksi/timestamp (cutting_completed_at, ready_for_sewing_at, cutting_qty, dsb)
create or replace function public.guard_order_items_closed_po()
returns trigger
language plpgsql
security definer
set search_path to 'public' as $$
declare
  v_order_id    uuid;
  v_po_batch_id uuid;
  v_po_status   text;
  v_is_legacy   boolean;
  v_po_code     text;
begin
  if TG_OP = 'DELETE' then
    v_order_id := OLD.order_id;
  else
    v_order_id := NEW.order_id;
  end if;

  if v_order_id is null then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  -- 1. Penjaga cascade delete: jika order sedang dihapus dari orders, lewati guard
  if not exists (select 1 from public.orders where id = v_order_id) then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  -- 2. Ambil informasi PO dari order induk
  select o.po_batch_id, pb.status, pb.is_legacy, pb.code
  into v_po_batch_id, v_po_status, v_is_legacy, v_po_code
  from public.orders o
  left join public.po_batches pb on pb.id = o.po_batch_id
  where o.id = v_order_id;

  -- Jika order belum memiliki PO atau PO bukan closed atau merupakan legacy, lewati
  if v_po_batch_id is null or v_po_status is distinct from 'closed' or v_is_legacy is true then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  -- 3. PO berstatus closed dan bukan legacy:
  if TG_OP = 'INSERT' then
    raise exception 'PO % sudah ditutup. Tidak dapat menambah item baru pada order ini', v_po_code
      using errcode = 'P0001';
  elsif TG_OP = 'DELETE' then
    raise exception 'PO % sudah ditutup. Tidak dapat menghapus item pada order ini', v_po_code
      using errcode = 'P0001';
  elsif TG_OP = 'UPDATE' then
    -- Hanya blokir kolom komersial (product_id, qty, price)
    if (OLD.product_id is distinct from NEW.product_id or
        OLD.qty is distinct from NEW.qty or
        OLD.price is distinct from NEW.price) then
      raise exception 'PO % sudah ditutup. Tidak dapat mengubah produk, kuantitas, atau harga item', v_po_code
        using errcode = 'P0001';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_order_items_guard_closed_po on public.order_items;
create trigger trg_order_items_guard_closed_po
  before insert or update or delete on public.order_items
  for each row execute function public.guard_order_items_closed_po();


-- 3. RPC close_po_batch
--    Idempoten: jika PO sudah closed, kembalikan close_snapshot yang sudah ada
--    Validasi hari: jika ditutup sebelum hari Minggu WIB, wajib menyertakan p_early_reason
--    Jika p_mark_rekap = true, panggil toggle_order_stage untuk stage rekap pada seluruh order
--    Bangun snapshot versi 1 dan simpan ke po_batches.close_snapshot
--    Catat event ke po_batch_events
create or replace function public.close_po_batch(
  p_batch_id     uuid,
  p_early_reason text default null,
  p_mark_rekap   boolean default true,
  p_note         text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public' as $$
declare
  v_uid          uuid := auth.uid();
  v_batch        public.po_batches;
  v_today_wib    date := (now() at time zone 'Asia/Jakarta')::date;
  v_dow_wib      integer := extract(isodow from now() at time zone 'Asia/Jakarta')::integer;
  v_is_early     boolean := false;
  v_order_rec    record;
  v_total_orders integer := 0;
  v_total_pcs    numeric := 0;
  v_satuan_pcs   numeric := 0;
  v_prioritas_pcs numeric := 0;
  v_total_price  numeric := 0;
  v_total_shipping numeric := 0;
  v_total_paid   numeric := 0;
  v_total_remaining numeric := 0;
  v_total_hpp    numeric := 0;
  v_by_sales     jsonb := '[]'::jsonb;
  v_by_product   jsonb := '[]'::jsonb;
  v_fabrics      jsonb := '[]'::jsonb;
  v_orders_list  jsonb := '[]'::jsonb;
  v_snapshot     jsonb;
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

  -- 2. Validasi penutupan lebih awal (sebelum Minggu WIB)
  if v_dow_wib < 7 and v_today_wib <= v_batch.end_date then
    v_is_early := true;
    if p_early_reason is null or trim(p_early_reason) = '' then
      raise exception 'Penutupan PO sebelum hari Minggu memerlukan alasan penutupan lebih awal'
        using errcode = 'P0001';
    end if;
  end if;

  -- 3. Agregasi data snapshot untuk order dalam PO ini
  select
    coalesce(count(*), 0)::integer,
    coalesce(sum(sub.total_pcs), 0)::numeric,
    coalesce(sum(case when sub.order_type = 'satuan' then sub.total_pcs else 0 end), 0)::numeric,
    coalesce(sum(case when sub.order_type = 'prioritas' then sub.total_pcs else 0 end), 0)::numeric,
    coalesce(sum(sub.total_price), 0)::numeric,
    coalesce(sum(sub.ongkir), 0)::numeric,
    coalesce(sum(sub.paid_amount), 0)::numeric,
    coalesce(sum(sub.remaining_amount), 0)::numeric
  into
    v_total_orders,
    v_total_pcs,
    v_satuan_pcs,
    v_prioritas_pcs,
    v_total_price,
    v_total_shipping,
    v_total_paid,
    v_total_remaining
  from (
    select
      o.id,
      o.order_type,
      o.total_price,
      o.ongkir,
      owb.paid_amount,
      owb.remaining_amount,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    left join public.orders_with_balance owb on owb.id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by o.id, o.order_type, o.total_price, o.ongkir, owb.paid_amount, owb.remaining_amount
  ) sub;

  -- Total estimasi HPP
  select coalesce(sum(oi.hpp_total_snapshot), 0)::numeric
  into v_total_hpp
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.po_batch_id = p_batch_id and o.user_id = v_uid;

  -- Rincian per sales
  select coalesce(jsonb_agg(sub), '[]'::jsonb)
  into v_by_sales
  from (
    select
      coalesce(owb.sales_name, 'Tanpa Sales') as sales_name,
      count(distinct o.id)::integer as order_count,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(o.total_price), 0)::numeric as total_price
    from public.orders o
    left join public.orders_with_balance owb on owb.id = o.id
    left join public.order_items oi on oi.order_id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by coalesce(owb.sales_name, 'Tanpa Sales')
    order by total_price desc
  ) sub;

  -- Rincian per produk
  select coalesce(jsonb_agg(sub), '[]'::jsonb)
  into v_by_product
  from (
    select
      coalesce(p.name, oi.name_item) as product_name,
      coalesce(pc.name, 'Tanpa Kategori') as category_name,
      sum(oi.qty)::numeric as total_qty,
      sum(oi.total_price)::numeric as total_price
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    left join public.product_categories pc on pc.id = oi.category_id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by coalesce(p.name, oi.name_item), coalesce(pc.name, 'Tanpa Kategori')
    order by total_qty desc
  ) sub;

  -- Rekap kebutuhan kain vs stok saat close
  select coalesce(jsonb_agg(sub), '[]'::jsonb)
  into v_fabrics
  from (
    select
      m.id as material_id,
      m.name as material_name,
      mc.id as material_color_id,
      mc.color_name,
      m.unit,
      sum(oi.qty * coalesce(oif.usage_qty_snapshot, 0))::numeric as needed_qty,
      coalesce(mc.stock_qty, m.stock_qty, 0)::numeric as stock_at_close,
      greatest(0, sum(oi.qty * coalesce(oif.usage_qty_snapshot, 0)) - coalesce(mc.stock_qty, m.stock_qty, 0))::numeric as shortage_qty
    from public.order_item_fabrics oif
    join public.order_items oi on oi.id = oif.order_item_id
    join public.orders o on o.id = oi.order_id
    join public.materials m on m.id = oif.material_id
    left join public.material_colors mc on mc.id = oif.material_color_id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by m.id, m.name, mc.id, mc.color_name, m.unit, coalesce(mc.stock_qty, m.stock_qty, 0)
    order by m.name asc, mc.color_name asc
  ) sub;

  -- Daftar order dalam PO
  select coalesce(jsonb_agg(sub), '[]'::jsonb)
  into v_orders_list
  from (
    select
      o.id,
      o.order_id as order_code,
      o.order_date,
      o.customer_name,
      o.order_type,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      o.total_price,
      o.ongkir as shipping_cost,
      coalesce(owb.paid_amount, 0)::numeric as total_paid,
      coalesce(owb.remaining_amount, 0)::numeric as remaining_amount,
      o.production_status,
      coalesce(owb.sales_name, '') as sales_name
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    left join public.orders_with_balance owb on owb.id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by o.id, o.order_id, o.order_date, o.customer_name, o.order_type, o.total_price, o.ongkir, owb.paid_amount, owb.remaining_amount, o.production_status, owb.sales_name
    order by o.order_date asc, o.order_id asc
  ) sub;

  -- Bangun snapshot dokumen versi 1
  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'batch_id', v_batch.id,
    'code', v_batch.code,
    'period_year', v_batch.period_year,
    'period_month', v_batch.period_month,
    'seq_in_month', v_batch.seq_in_month,
    'start_date', v_batch.start_date,
    'end_date', v_batch.end_date,
    'closed_at', now(),
    'closed_by', v_uid,
    'is_early_close', v_is_early,
    'close_early_reason', p_early_reason,
    'close_note', p_note,
    'summary', jsonb_build_object(
      'total_orders', v_total_orders,
      'total_pcs', v_total_pcs,
      'satuan_pcs', v_satuan_pcs,
      'prioritas_pcs', v_prioritas_pcs,
      'total_price', v_total_price,
      'total_shipping_cost', v_total_shipping,
      'total_paid', v_total_paid,
      'total_remaining', v_total_remaining,
      'total_hpp', v_total_hpp,
      'estimated_margin', (v_total_price - v_total_hpp)
    ),
    'by_sales', v_by_sales,
    'by_product', v_by_product,
    'fabric_requirements', v_fabrics,
    'orders', v_orders_list
  );

  -- 4. Opsi tandai Rekap massal untuk seluruh order
  if p_mark_rekap and v_total_orders > 0 then
    for v_order_rec in (
      select id from public.orders
      where po_batch_id = p_batch_id and user_id = v_uid
    ) loop
      begin
        perform public.toggle_order_stage(v_order_rec.id, 'rekap', true, 'Ditandai selesai otomatis saat tutup PO');
      exception when others then
        -- Jangan gagalkan penutupan bila toggle stage mengalami hambatan
        null;
      end;
    end loop;

    insert into public.po_batch_events (user_id, po_batch_id, event, reason, payload)
    values (
      v_uid,
      p_batch_id,
      'rekap_bulk',
      'Tandai Rekap selesai untuk semua order saat tutup PO',
      jsonb_build_object('order_count', v_total_orders)
    );
  end if;

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
    coalesce(p_early_reason, p_note, 'Tutup PO mingguan'),
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


-- 4. RPC reopen_po_batch
--    Aturan penolakan ketat:
--    - Ditolak jika p_reason kosong
--    - Ditolak jika PO legacy (is_legacy = true)
--    - Ditolak jika ada cutting_assignments aktif atau selesai (status in ('assigned','in_progress','done'))
--    - Ditolak jika ada stock_requests in_progress / fulfilled yang bersumber dari order PO ini
--    Pada sukses:
--    - Pindahkan snapshot lama ke po_batch_events.payload
--    - Reset status ke 'open', kosongkan closed_at, closed_by, close_snapshot
--    - Tambahkan reopen_count
create or replace function public.reopen_po_batch(
  p_batch_id uuid,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  v_batch public.po_batches;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Alasan pembukaan kembali PO wajib diisi' using errcode = 'P0001';
  end if;

  select * into v_batch
  from public.po_batches
  where id = p_batch_id and user_id = v_uid;

  if not found then
    raise exception 'Batch PO tidak ditemukan' using errcode = 'P0001';
  end if;

  if v_batch.status = 'open' then
    raise exception 'Batch PO sudah dalam status terbuka' using errcode = 'P0001';
  end if;

  if v_batch.is_legacy then
    raise exception 'Batch PO legacy tidak dapat dibuka kembali' using errcode = 'P0001';
  end if;

  -- Cek apakah ada penugasan potong aktif/selesai
  if exists (
    select 1
    from public.cutting_assignments ca
    join public.order_items oi on oi.id = ca.order_item_id
    join public.orders o on o.id = oi.order_id
    where o.po_batch_id = p_batch_id
      and ca.status in ('assigned', 'in_progress', 'done')
  ) then
    raise exception 'PO % tidak dapat dibuka kembali karena sudah ada penugasan potong yang berjalan atau selesai', v_batch.code
      using errcode = 'P0001';
  end if;

  -- Cek apakah ada stock_requests in_progress/fulfilled untuk order di PO ini
  if exists (
    select 1
    from public.stock_requests sr
    join public.orders o on o.id = sr.source_order_id
    where o.po_batch_id = p_batch_id
      and sr.status in ('in_progress', 'fulfilled')
  ) then
    raise exception 'PO % tidak dapat dibuka kembali karena sudah ada pengajuan belanja bahan yang sedang diproses atau sudah terpenuhi', v_batch.code
      using errcode = 'P0001';
  end if;

  -- Catat event audit pembukaan kembali dengan menyimpan snapshot sebelumnya
  insert into public.po_batch_events (user_id, po_batch_id, event, reason, payload)
  values (
    v_uid,
    p_batch_id,
    'reopened',
    trim(p_reason),
    jsonb_build_object('archived_snapshot', v_batch.close_snapshot)
  );

  -- Kembalikan status PO menjadi open
  update public.po_batches
  set
    status = 'open',
    closed_at = null,
    closed_by = null,
    close_snapshot = null,
    reopen_count = reopen_count + 1
  where id = p_batch_id and user_id = v_uid;
end;
$$;

revoke execute on function public.reopen_po_batch(uuid, text) from public, anon;
grant  execute on function public.reopen_po_batch(uuid, text) to authenticated;


-- 5. RPC get_current_po
--    Mengembalikan PO minggu berjalan (membuatnya jika belum ada),
--    sisa waktu hitung mundur ke Minggu 23:59:59 WIB, ringkasan cepat,
--    serta indikator peringatan apakah ada PO lama yang masih open.
create or replace function public.get_current_po()
returns jsonb
language plpgsql
security definer
set search_path to 'public' as $$
declare
  v_uid          uuid := auth.uid();
  v_today_wib    date := (now() at time zone 'Asia/Jakarta')::date;
  v_batch        public.po_batches;
  v_end_ts       timestamptz;
  v_sec_left     bigint;
  v_order_count  integer := 0;
  v_total_qty    numeric := 0;
  v_total_price  numeric := 0;
  v_has_past_open boolean := false;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  -- Pastikan PO minggu berjalan sudah dibuat dan ambil datanya
  v_batch := public.ensure_po_batch(v_today_wib);

  -- Hitung sisa detik ke akhir hari Minggu 23:59:59 WIB
  v_end_ts := (v_batch.end_date::text || ' 23:59:59+07')::timestamptz;
  v_sec_left := greatest(0, extract(epoch from (v_end_ts - now()))::bigint);

  -- Ringkasan order berjalan
  select
    coalesce(count(distinct o.id), 0)::integer,
    coalesce(sum(oi.qty), 0)::numeric,
    coalesce(sum(o.total_price), 0)::numeric
  into v_order_count, v_total_qty, v_total_price
  from public.orders o
  left join public.order_items oi on oi.order_id = o.id
  where o.po_batch_id = v_batch.id and o.user_id = v_uid;

  -- Periksa apakah ada PO terdahulu yang masih berstatus open (lewat hari Minggu)
  select exists (
    select 1 from public.po_batches
    where user_id = v_uid
      and status = 'open'
      and end_date < v_today_wib
  ) into v_has_past_open;

  return jsonb_build_object(
    'batch', row_to_json(v_batch),
    'seconds_remaining', v_sec_left,
    'end_timestamp', v_end_ts,
    'order_count', v_order_count,
    'total_qty', v_total_qty,
    'total_price', v_total_price,
    'has_past_open_batches', v_has_past_open
  );
end;
$$;

revoke execute on function public.get_current_po() from public, anon;
grant  execute on function public.get_current_po() to authenticated;


-- 6. RPC list_po_batches
--    Membaca daftar PO berdasarkan tahun dan bulan periode PO,
--    atau seluruhnya jika filter dikosongkan.
create or replace function public.list_po_batches(
  p_year  integer default null,
  p_month integer default null
)
returns setof public.po_batches
language plpgsql
security definer
set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_year is not null and p_month is not null then
    return query
    select * from public.po_batches
    where user_id = v_uid
      and period_year = p_year
      and period_month = p_month
    order by start_date desc;
  else
    return query
    select * from public.po_batches
    where user_id = v_uid
    order by start_date desc;
  end if;
end;
$$;

revoke execute on function public.list_po_batches(integer, integer) from public, anon;
grant  execute on function public.list_po_batches(integer, integer) to authenticated;


-- 7. Revisi delete_order: catat event audit jika order dihapus pada PO berstatus closed
create or replace function public.delete_order(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_order     record;
  v_po_status text;
  v_po_code   text;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi' using errcode = '42501'; end if;

  -- Ambil order, pastikan milik user
  select * into v_order from public.orders where id = p_order_id and user_id = v_uid;
  if not found then
    raise exception 'Order tidak ditemukan atau bukan milik Anda' using errcode = 'P0001';
  end if;

  -- Pemeriksaan batch jahit
  if exists (
    select 1 from public.sewing_distribution_batches
     where target_order_id = p_order_id
  ) then
    raise exception 'Order ini sudah dipakai pada distribusi jahit dan tidak dapat dihapus'
      using errcode = 'P0001';
  end if;

  -- Batalkan stock_movements pending milik order
  update public.stock_movements
  set status = 'cancelled'
  where source_id = p_order_id
    and status = 'pending'
    and user_id = v_uid;

  -- Batalkan stock_requests draft_auto milik order
  update public.stock_requests
  set status = 'cancelled'
  where source_order_id = p_order_id
    and status = 'draft_auto'
    and user_id = v_uid;

  -- Catat audit event jika order berada pada PO yang sudah ditutup
  if v_order.po_batch_id is not null then
    select status, code into v_po_status, v_po_code
    from public.po_batches
    where id = v_order.po_batch_id and user_id = v_uid;

    if v_po_status = 'closed' then
      insert into public.po_batch_events (
        user_id,
        po_batch_id,
        event,
        reason,
        payload
      ) values (
        v_uid,
        v_order.po_batch_id,
        'order_deleted_after_close',
        'Order dihapus setelah PO ditutup',
        jsonb_build_object(
          'order_id', v_order.id,
          'order_code', v_order.order_id,
          'customer_name', v_order.customer_name,
          'total_price', v_order.total_price
        )
      );
    end if;
  end if;

  -- Hapus order (trigger trg_order_items_guard_closed_po akan membiarkan cascade delete lewat penjaga)
  delete from public.orders where id = p_order_id and user_id = v_uid;
end;
$$;

revoke execute on function public.delete_order(uuid) from public, anon;
grant  execute on function public.delete_order(uuid) to authenticated;
