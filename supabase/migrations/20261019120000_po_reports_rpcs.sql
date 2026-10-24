-- ===========================================================================
-- Migration: 20261019120000_po_reports_rpcs.sql
-- Fase 2: RPC Pelaporan Batch PO
-- 1. get_po_daily_report(p_date)
-- 2. get_po_close_report(p_batch_id)
-- 3. get_po_monthly_report(p_year, p_month)
-- ===========================================================================

-- 1. RPC get_po_daily_report
--    Mengembalikan rekap harian pesanan, pembayaran masuk, breakdown sales & produk,
--    serta akumulasi kumulatif sejak hari Senin dalam PO berjalan.
create or replace function public.get_po_daily_report(
  p_date date default (now() at time zone 'Asia/Jakarta')::date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public' as $$
declare
  v_uid            uuid := auth.uid();
  v_date           date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_info           record;
  v_batch          public.po_batches;
  v_today_orders   integer := 0;
  v_today_pcs      numeric := 0;
  v_today_price    numeric := 0;
  v_today_ongkir   numeric := 0;
  v_today_paid     numeric := 0;
  v_by_sales       jsonb := '[]'::jsonb;
  v_by_category    jsonb := '[]'::jsonb;
  v_orders_list    jsonb := '[]'::jsonb;
  v_cum_orders     integer := 0;
  v_cum_pcs        numeric := 0;
  v_cum_price      numeric := 0;
  v_cum_ongkir     numeric := 0;
  v_cum_paid       numeric := 0;
  v_po_total_orders integer := 0;
  v_po_total_pcs   numeric := 0;
  v_po_total_price numeric := 0;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  -- 1. Dapatkan info minggu dan PO
  select * into v_info from public.po_week_info(v_date);

  select * into v_batch
  from public.po_batches
  where user_id = v_uid
    and start_date = v_info.start_date;

  -- 2. Ringkasan Hari Ini (p_date)
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

  -- Pembayaran masuk pada p_date (seluruh pembayaran yang tercatat pada tanggal tersebut)
  select coalesce(sum(op.amount), 0)::numeric
  into v_today_paid
  from public.order_payments op
  join public.orders o on o.id = op.order_id
  where op.user_id = v_uid and op.payment_date = v_date;

  -- Rincian per Sales hari ini
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
    where o.user_id = v_uid and o.order_date = v_date
    group by coalesce(owb.sales_name, 'Tanpa Sales')
    order by total_price desc
  ) sub;

  -- Rincian per Kategori Produk hari ini
  select coalesce(jsonb_agg(sub), '[]'::jsonb)
  into v_by_category
  from (
    select
      coalesce(pc.name, 'Tanpa Kategori') as category_name,
      sum(oi.qty)::numeric as total_qty,
      sum(oi.total_price)::numeric as total_price
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.product_categories pc on pc.id = oi.category_id
    where o.user_id = v_uid and o.order_date = v_date
    group by coalesce(pc.name, 'Tanpa Kategori')
    order by total_qty desc
  ) sub;

  -- Daftar Order hari ini
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
      o.ongkir,
      coalesce(owb.paid_amount, 0)::numeric as paid_amount,
      coalesce(owb.remaining_amount, 0)::numeric as remaining_amount,
      o.production_status,
      coalesce(owb.sales_name, '-') as sales_name
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    left join public.orders_with_balance owb on owb.id = o.id
    where o.user_id = v_uid and o.order_date = v_date
    group by o.id, o.order_id, o.order_date, o.customer_name, o.order_type, o.total_price, o.ongkir, owb.paid_amount, owb.remaining_amount, o.production_status, owb.sales_name
    order by o.created_at asc
  ) sub;

  -- 3. Kumulatif PO Sejak Senin (start_date s.d. p_date)
  select
    coalesce(count(*), 0)::integer,
    coalesce(sum(sub.pcs), 0)::numeric,
    coalesce(sum(sub.total_price), 0)::numeric,
    coalesce(sum(sub.ongkir), 0)::numeric
  into
    v_cum_orders,
    v_cum_pcs,
    v_cum_price,
    v_cum_ongkir
  from (
    select
      o.id,
      o.total_price,
      o.ongkir,
      coalesce(sum(oi.qty), 0)::numeric as pcs
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    where o.user_id = v_uid
      and o.order_date >= v_info.start_date
      and o.order_date <= v_date
    group by o.id, o.total_price, o.ongkir
  ) sub;

  select coalesce(sum(op.amount), 0)::numeric
  into v_cum_paid
  from public.order_payments op
  join public.orders o on o.id = op.order_id
  where op.user_id = v_uid
    and op.payment_date >= v_info.start_date
    and op.payment_date <= v_date;

  -- 4. Total PO Penuh (Senin s.d. Minggu)
  select
    coalesce(count(*), 0)::integer,
    coalesce(sum(sub.pcs), 0)::numeric,
    coalesce(sum(sub.total_price), 0)::numeric
  into
    v_po_total_orders,
    v_po_total_pcs,
    v_po_total_price
  from (
    select
      o.id,
      o.total_price,
      coalesce(sum(oi.qty), 0)::numeric as pcs
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    where o.user_id = v_uid
      and o.order_date >= v_info.start_date
      and o.order_date <= v_info.end_date
    group by o.id, o.total_price
  ) sub;

  return jsonb_build_object(
    'date', v_date,
    'po_info', jsonb_build_object(
      'code', v_info.code,
      'period_year', v_info.period_year,
      'period_month', v_info.period_month,
      'seq_in_month', v_info.seq_in_month,
      'start_date', v_info.start_date,
      'end_date', v_info.end_date,
      'batch_id', v_batch.id,
      'status', coalesce(v_batch.status, 'open')
    ),
    'today_summary', jsonb_build_object(
      'total_orders', v_today_orders,
      'total_pcs', v_today_pcs,
      'total_price', v_today_price,
      'total_ongkir', v_today_ongkir,
      'total_paid', v_today_paid
    ),
    'cumulative_since_monday', jsonb_build_object(
      'total_orders', v_cum_orders,
      'total_pcs', v_cum_pcs,
      'total_price', v_cum_price,
      'total_ongkir', v_cum_ongkir,
      'total_paid', v_cum_paid
    ),
    'po_full_week_summary', jsonb_build_object(
      'total_orders', v_po_total_orders,
      'total_pcs', v_po_total_pcs,
      'total_price', v_po_total_price
    ),
    'by_sales', v_by_sales,
    'by_category', v_by_category,
    'orders', v_orders_list
  );
end;
$$;

revoke execute on function public.get_po_daily_report(date) from public, anon;
grant  execute on function public.get_po_daily_report(date) to authenticated;


-- 2. RPC get_po_close_report
--    Mengembalikan snapshot resmi saat PO ditutup, ditambah dengan metrik
--    live (status pembayaran & progres fisik produksi saat ini berlabel "per sekarang").
create or replace function public.get_po_close_report(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public' as $$
declare
  v_uid               uuid := auth.uid();
  v_batch             public.po_batches;
  v_snapshot          jsonb;
  v_live_paid         numeric := 0;
  v_live_remaining    numeric := 0;
  v_live_paid_orders  integer := 0;
  v_total_orders      integer := 0;
  v_total_pcs         numeric := 0;
  v_cutting_done_pcs  numeric := 0;
  v_sewn_pcs          numeric := 0;
  v_qc_passed_pcs     numeric := 0;
  v_live_orders       jsonb := '[]'::jsonb;
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

  -- Ambil snapshot yang tersimpan saat close
  v_snapshot := v_batch.close_snapshot;

  -- Jika belum ada snapshot (misal legacy PO atau batch yang belum diclose), bangun data snapshot dasar
  if v_snapshot is null then
    v_snapshot := jsonb_build_object(
      'schema_version', 1,
      'batch_id', v_batch.id,
      'code', v_batch.code,
      'period_year', v_batch.period_year,
      'period_month', v_batch.period_month,
      'seq_in_month', v_batch.seq_in_month,
      'start_date', v_batch.start_date,
      'end_date', v_batch.end_date,
      'closed_at', v_batch.closed_at,
      'closed_by', v_batch.closed_by,
      'is_early_close', false,
      'close_early_reason', v_batch.close_early_reason,
      'close_note', v_batch.close_note,
      'summary', jsonb_build_object(
        'total_orders', 0,
        'total_pcs', 0,
        'satuan_pcs', 0,
        'prioritas_pcs', 0,
        'total_price', 0,
        'total_shipping_cost', 0,
        'total_paid', 0,
        'total_remaining', 0,
        'total_hpp', 0,
        'estimated_margin', 0
      ),
      'by_sales', '[]'::jsonb,
      'by_product', '[]'::jsonb,
      'fabric_requirements', '[]'::jsonb,
      'orders', '[]'::jsonb
    );
  end if;

  -- Hitung data LIVE ("per sekarang")
  -- A. Keuangan Live
  select
    coalesce(sum(owb.paid_amount), 0)::numeric,
    coalesce(sum(owb.remaining_amount), 0)::numeric,
    coalesce(count(case when owb.remaining_amount <= 0 or o.status = 'lunas' then 1 end), 0)::integer,
    coalesce(count(*), 0)::integer
  into
    v_live_paid,
    v_live_remaining,
    v_live_paid_orders,
    v_total_orders
  from public.orders o
  left join public.orders_with_balance owb on owb.id = o.id
  where o.po_batch_id = p_batch_id and o.user_id = v_uid;

  -- B. Progres Produksi Live (potong, jahit, qc)
  select coalesce(sum(oi.qty), 0)::numeric
  into v_total_pcs
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.po_batch_id = p_batch_id and o.user_id = v_uid;

  -- Pcs selesai potong
  select coalesce(sum(coalesce(oi.cutting_qty, oi.qty)), 0)::numeric
  into v_cutting_done_pcs
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.po_batch_id = p_batch_id
    and o.user_id = v_uid
    and oi.cutting_completed_at is not null;

  -- Pcs selesai jahit & qc lolos dari sewing_assignments
  select
    coalesce(sum(sa.sewn_qty), 0)::numeric,
    coalesce(sum(sa.qc_passed_qty), 0)::numeric
  into
    v_sewn_pcs,
    v_qc_passed_pcs
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  join public.orders o on o.id = oi.order_id
  where o.po_batch_id = p_batch_id and o.user_id = v_uid;

  -- Rincian status order terkini
  select coalesce(jsonb_agg(sub), '[]'::jsonb)
  into v_live_orders
  from (
    select
      o.id,
      o.order_id as order_code,
      o.customer_name,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      o.total_price,
      coalesce(owb.paid_amount, 0)::numeric as paid_amount,
      coalesce(owb.remaining_amount, 0)::numeric as remaining_amount,
      o.production_status,
      (
        select jsonb_object_agg(ose.stage, ose.status)
        from public.order_stage_events ose
        where ose.order_id = o.id
      ) as stages
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    left join public.orders_with_balance owb on owb.id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by o.id, o.order_id, o.customer_name, o.total_price, owb.paid_amount, owb.remaining_amount, o.production_status
    order by o.order_date asc, o.order_id asc
  ) sub;

  return jsonb_build_object(
    'batch', row_to_json(v_batch),
    'snapshot', v_snapshot,
    'live_as_of_now', jsonb_build_object(
      'label', 'Kondisi Terkini (Per Sekarang)',
      'timestamp', now(),
      'payment_summary', jsonb_build_object(
        'total_orders', v_total_orders,
        'fully_paid_orders', v_live_paid_orders,
        'unpaid_or_partial_orders', (v_total_orders - v_live_paid_orders),
        'paid_amount', v_live_paid,
        'remaining_receivable', v_live_remaining
      ),
      'production_progress', jsonb_build_object(
        'total_order_pcs', v_total_pcs,
        'cutting_done_pcs', v_cutting_done_pcs,
        'cutting_percent', case when v_total_pcs > 0 then round((v_cutting_done_pcs / v_total_pcs) * 100, 1) else 0 end,
        'sewing_done_pcs', v_sewn_pcs,
        'sewing_percent', case when v_total_pcs > 0 then round((v_sewn_pcs / v_total_pcs) * 100, 1) else 0 end,
        'qc_passed_pcs', v_qc_passed_pcs,
        'qc_passed_percent', case when v_total_pcs > 0 then round((v_qc_passed_pcs / v_total_pcs) * 100, 1) else 0 end
      ),
      'orders', v_live_orders
    )
  );
end;
$$;

revoke execute on function public.get_po_close_report(uuid) from public, anon;
grant  execute on function public.get_po_close_report(uuid) to authenticated;


-- 3. RPC get_po_monthly_report
--    Mengembalikan rekap per PO dalam satu bulan PO, komparasi bulan lalu,
--    rincian HPP snapshot, borongan aktual, pembelian bahan per item,
--    serta blok rekonsiliasi pengakuan pendapatan jurnal kalender.
create or replace function public.get_po_monthly_report(
  p_year  integer,
  p_month integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public' as $$
declare
  v_uid                 uuid := auth.uid();
  v_year                integer := coalesce(p_year, extract(year from (now() at time zone 'Asia/Jakarta'))::integer);
  v_month               integer := coalesce(p_month, extract(month from (now() at time zone 'Asia/Jakarta'))::integer);
  v_prev_year           integer;
  v_prev_month          integer;
  v_batches             jsonb := '[]'::jsonb;
  v_unlinked_piecework  numeric := 0;
  v_totals              jsonb;
  v_prev_totals         jsonb;
  v_diffs               jsonb;
  -- Rekonsiliasi Jurnal Akuntansi
  v_start_cal           date;
  v_end_cal             date;
  v_acct_enabled        boolean := false;
  v_books_start_date    date;
  v_journal_rev_4100    numeric := 0;
  v_journal_rev_4110    numeric := 0;
  v_journal_total_rev   numeric := 0;
  v_recon_note          text;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  -- Hitung bulan sebelumnya
  if v_month = 1 then
    v_prev_year := v_year - 1;
    v_prev_month := 12;
  else
    v_prev_year := v_year;
    v_prev_month := v_month - 1;
  end if;

  -- 1. Rekap Per Baris PO untuk Bulan Ini
  select coalesce(jsonb_agg(sub), '[]'::jsonb)
  into v_batches
  from (
    select
      pb.id as batch_id,
      pb.code,
      pb.period_year,
      pb.period_month,
      pb.seq_in_month,
      pb.start_date,
      pb.end_date,
      pb.status,
      pb.is_legacy,
      coalesce(ord_sub.order_count, 0)::integer as order_count,
      coalesce(ord_sub.total_qty, 0)::numeric as total_qty,
      coalesce(ord_sub.booking_value, 0)::numeric as booking_value,
      coalesce(ord_sub.total_paid, 0)::numeric as total_paid,
      coalesce(ord_sub.remaining_receivable, 0)::numeric as remaining_receivable,
      coalesce(ord_sub.delivered_orders_count, 0)::integer as delivered_orders_count,
      coalesce(ord_sub.delivered_orders_value, 0)::numeric as delivered_orders_value,
      coalesce(ord_sub.hpp_snapshot, 0)::numeric as hpp_snapshot,
      coalesce(ord_sub.booking_value - ord_sub.hpp_snapshot, 0)::numeric as estimated_margin,
      -- Borongan aktual via order_id
      coalesce((
        select sum(pt.total_wage)
        from public.piecework_tasks pt
        join public.orders o on o.id = pt.order_id
        where o.po_batch_id = pb.id and pt.user_id = v_uid
      ), 0)::numeric as actual_piecework_wage,
      -- Pembelian bahan via stock_request_id di item SPJ & item supplier
      coalesce((
        select sum(pri.total_price)
        from public.purchasing_report_items pri
        join public.purchasing_reports pr on pr.id = pri.report_id
        join public.stock_requests sr on sr.id = pri.stock_request_id
        join public.orders o on o.id = sr.source_order_id
        where o.po_batch_id = pb.id
          and pr.status in ('financially_approved', 'goods_received')
          and pri.user_id = v_uid
      ), 0)::numeric +
      coalesce((
        select sum(spi.total_price)
        from public.supplier_purchase_items spi
        join public.supplier_purchases sp on sp.id = spi.purchase_id
        join public.stock_requests sr on sr.id = spi.stock_request_id
        join public.orders o on o.id = sr.source_order_id
        where o.po_batch_id = pb.id
          and sp.status in ('ordered', 'received')
          and spi.user_id = v_uid
      ), 0)::numeric as material_purchases
    from public.po_batches pb
    left join lateral (
      select
        count(distinct o.id) as order_count,
        sum(oi.qty) as total_qty,
        sum(o.total_price) as booking_value,
        sum(owb.paid_amount) as total_paid,
        sum(owb.remaining_amount) as remaining_receivable,
        count(distinct case when o.production_status = 'completed' then o.id end) as delivered_orders_count,
        sum(case when o.production_status = 'completed' then o.total_price else 0 end) as delivered_orders_value,
        sum(oi.hpp_total_snapshot) as hpp_snapshot
      from public.orders o
      left join public.order_items oi on oi.order_id = o.id
      left join public.orders_with_balance owb on owb.id = o.id
      where o.po_batch_id = pb.id and o.user_id = v_uid
    ) ord_sub on true
    where pb.user_id = v_uid
      and pb.period_year = v_year
      and pb.period_month = v_month
    order by pb.start_date asc
  ) sub;

  -- 2. Borongan tanpa order_id pada rentang bulan kalender
  select coalesce(sum(pt.total_wage), 0)::numeric
  into v_unlinked_piecework
  from public.piecework_tasks pt
  where pt.user_id = v_uid
    and pt.order_id is null
    and extract(year from pt.completed_at) = v_year
    and extract(month from pt.completed_at) = v_month;

  -- 3. Agregat Total Bulan Ini
  select jsonb_build_object(
    'total_batches', coalesce(count(*), 0),
    'order_count', coalesce(sum((b->>'order_count')::int), 0),
    'total_qty', coalesce(sum((b->>'total_qty')::numeric), 0),
    'booking_value', coalesce(sum((b->>'booking_value')::numeric), 0),
    'total_paid', coalesce(sum((b->>'total_paid')::numeric), 0),
    'remaining_receivable', coalesce(sum((b->>'remaining_receivable')::numeric), 0),
    'delivered_orders_count', coalesce(sum((b->>'delivered_orders_count')::int), 0),
    'delivered_orders_value', coalesce(sum((b->>'delivered_orders_value')::numeric), 0),
    'hpp_snapshot', coalesce(sum((b->>'hpp_snapshot')::numeric), 0),
    'estimated_margin', coalesce(sum((b->>'estimated_margin')::numeric), 0),
    'actual_piecework_wage', coalesce(sum((b->>'actual_piecework_wage')::numeric), 0),
    'material_purchases', coalesce(sum((b->>'material_purchases')::numeric), 0),
    'unlinked_piecework_wage', v_unlinked_piecework
  )
  into v_totals
  from jsonb_array_elements(v_batches) as b;

  -- 4. Agregat Bulan Lalu (Pembanding)
  select jsonb_build_object(
    'order_count', coalesce(sum(ord_sub.order_count), 0)::int,
    'total_qty', coalesce(sum(ord_sub.total_qty), 0)::numeric,
    'booking_value', coalesce(sum(ord_sub.booking_value), 0)::numeric,
    'total_paid', coalesce(sum(ord_sub.total_paid), 0)::numeric,
    'remaining_receivable', coalesce(sum(ord_sub.remaining_receivable), 0)::numeric,
    'delivered_orders_count', coalesce(sum(ord_sub.delivered_orders_count), 0)::int,
    'delivered_orders_value', coalesce(sum(ord_sub.delivered_orders_value), 0)::numeric,
    'hpp_snapshot', coalesce(sum(ord_sub.hpp_snapshot), 0)::numeric,
    'estimated_margin', coalesce(sum(ord_sub.booking_value - ord_sub.hpp_snapshot), 0)::numeric
  )
  into v_prev_totals
  from public.po_batches pb
  left join lateral (
    select
      count(distinct o.id) as order_count,
      sum(oi.qty) as total_qty,
      sum(o.total_price) as booking_value,
      sum(owb.paid_amount) as total_paid,
      sum(owb.remaining_amount) as remaining_receivable,
      count(distinct case when o.production_status = 'completed' then o.id end) as delivered_orders_count,
      sum(case when o.production_status = 'completed' then o.total_price else 0 end) as delivered_orders_value,
      sum(oi.hpp_total_snapshot) as hpp_snapshot
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    left join public.orders_with_balance owb on owb.id = o.id
    where o.po_batch_id = pb.id and o.user_id = v_uid
  ) ord_sub on true
  where pb.user_id = v_uid
    and pb.period_year = v_prev_year
    and pb.period_month = v_prev_month;

  -- Hitung Selisih (Differences)
  v_diffs := jsonb_build_object(
    'order_count_diff', ((v_totals->>'order_count')::int - (v_prev_totals->>'order_count')::int),
    'total_qty_diff', ((v_totals->>'total_qty')::numeric - (v_prev_totals->>'total_qty')::numeric),
    'booking_value_diff', ((v_totals->>'booking_value')::numeric - (v_prev_totals->>'booking_value')::numeric),
    'total_paid_diff', ((v_totals->>'total_paid')::numeric - (v_prev_totals->>'total_paid')::numeric),
    'estimated_margin_diff', ((v_totals->>'estimated_margin')::numeric - (v_prev_totals->>'estimated_margin')::numeric)
  );

  -- 5. Blok Rekonsiliasi Jurnal Akuntansi Kalender
  v_start_cal := make_date(v_year, v_month, 1);
  v_end_cal   := (v_start_cal + interval '1 month - 1 day')::date;

  select enabled, books_start_date
  into v_acct_enabled, v_books_start_date
  from public.accounting_settings
  where user_id = v_uid;

  select
    coalesce(sum(case when a.code = '4-1000' then (jl.credit - jl.debit) else 0 end), 0)::numeric,
    coalesce(sum(case when a.code = '4-1100' then (jl.credit - jl.debit) else 0 end), 0)::numeric
  into
    v_journal_rev_4100,
    v_journal_rev_4110
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id
  join public.accounts a on a.id = jl.account_id
  where je.user_id = v_uid
    and je.entry_date >= v_start_cal
    and je.entry_date <= v_end_cal
    and a.code in ('4-1000', '4-1100');

  v_journal_total_rev := v_journal_rev_4100 + v_journal_rev_4110;

  -- Keterangan rekonsiliasi
  v_recon_note := 'Pendapatan diakui di jurnal akuntansi secara akrual saat pesanan selesai/dikirim (Completed) pada bulan kalender berjalan, sedangkan nilai booking PO mencakup seluruh pesanan yang masuk pada siklus PO mingguan.';
  if v_year = 2026 and v_month = 10 then
    v_recon_note := v_recon_note || ' Catatan khusus: PO 4 Oktober 2026 berakhir pada 1 November 2026 dan melintasi tanggal mulai pembukuan akuntansi (books_start_date 2026-11-01), sehingga jurnal pengakuan pendapatan untuk order tersebut dicatat mulai bulan berikutnya.';
  end if;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'year', v_year,
      'month', v_month,
      'month_name', to_char(v_start_cal, 'TMMonth')
    ),
    'batches', v_batches,
    'current_month_totals', v_totals,
    'previous_month_totals', v_prev_totals,
    'differences', v_diffs,
    'accounting_reconciliation', jsonb_build_object(
      'accounting_enabled', coalesce(v_acct_enabled, false),
      'books_start_date', v_books_start_date,
      'calendar_period_start', v_start_cal,
      'calendar_period_end', v_end_cal,
      'booking_value_po', (v_totals->>'booking_value')::numeric,
      'recognized_sales_revenue_4100', v_journal_rev_4100,
      'recognized_shipping_revenue_4110', v_journal_rev_4110,
      'total_recognized_revenue', v_journal_total_rev,
      'difference_booking_vs_recognized', ((v_totals->>'booking_value')::numeric - v_journal_total_rev),
      'explanation', v_recon_note
    )
  );
end;
$$;

revoke execute on function public.get_po_monthly_report(integer, integer) from public, anon;
grant  execute on function public.get_po_monthly_report(integer, integer) to authenticated;
