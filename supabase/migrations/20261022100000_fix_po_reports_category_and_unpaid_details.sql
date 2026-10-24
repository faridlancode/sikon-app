-- ============================================================================
-- Migration: 20261022100000_fix_po_reports_category_and_unpaid_details.sql
-- Deskripsi:
-- 1. Backfill order_items.category_id dari products.category_id untuk order yang sudah ada.
-- 2. get_po_daily_report:
--    - Perbaikan join kategori produk via coalesce(oi.category_id, p.category_id)
--    - Penambahan rincian order belum lunas (unpaid_orders) pada past_unpaid_pos:
--      order_id, customer_name, sales_name, total_pcs, grand_total, paid_amount, remaining_amount
-- 3. close_po_batch & get_po_close_report:
--    - Perbaikan join kategori produk via coalesce(oi.category_id, p.category_id)
--    - Fallback otomatis inject sales_category_matrix & production_progress_orders
--      ke close_snapshot jika snapshot lama belum memilikinya
-- 4. get_po_monthly_report:
--    - Perbaikan join kategori produk via coalesce(oi.category_id, p.category_id)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Backfill category_id pada order_items yang masih null
-- ----------------------------------------------------------------------------
update public.order_items oi
set category_id = p.category_id
from public.products p
where oi.product_id = p.id
  and oi.category_id is null
  and p.category_id is not null;

-- ----------------------------------------------------------------------------
-- 1. get_po_daily_report (Perbaikan Kategori + Rincian Order Belum Lunas)
-- ----------------------------------------------------------------------------
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
  v_sales_cat_mat  jsonb := '[]'::jsonb;
  v_past_unpaid    jsonb := '[]'::jsonb;
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

  -- 3. Breakdown per kategori produk pada tanggal tersebut (dengan fallback p.category_id)
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_category
  from (
    select
      coalesce(pc.name, 'Tanpa Kategori') as category,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(oi.qty * oi.price), 0)::numeric as total_price
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    left join public.product_categories pc on pc.id = coalesce(oi.category_id, p.category_id)
    where o.user_id = v_uid and o.order_date = v_date
    group by pc.name
    order by total_pcs desc
  ) sub;

  -- 3b. Matriks Sales x Kategori Produk (dengan fallback p.category_id)
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_sales_cat_mat
  from (
    select
      s.id::text as sales_id,
      coalesce(s.name, 'Tanpa Sales') as sales_name,
      coalesce(pc.name, 'Tanpa Kategori') as category_name,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(oi.qty * oi.price), 0)::numeric as total_price
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    join public.order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id
    left join public.product_categories pc on pc.id = coalesce(oi.category_id, p.category_id)
    where o.user_id = v_uid and o.order_date = v_date
    group by s.id, s.name, pc.name
    order by s.name asc, pc.name asc
  ) sub;

  -- 4. Sisa Pelunasan PO Terdahulu (lengkap dengan rincian per order: customer, sales, qty, sisa)
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_past_unpaid
  from (
    select
      pb.id::text as batch_id,
      pb.name,
      pb.code,
      pb.status,
      pb.start_date::text,
      pb.end_date::text,
      count(distinct o.id)::integer as total_orders,
      count(distinct o.id) filter (where (coalesce(pmt.paid, 0) < (o.total_price + o.ongkir)))::integer as unpaid_orders_count,
      coalesce(sum(o.total_price + o.ongkir), 0)::numeric as total_booking_and_ongkir,
      coalesce(sum(coalesce(pmt.paid, 0)), 0)::numeric as total_paid,
      coalesce(sum(greatest(0, (o.total_price + o.ongkir) - coalesce(pmt.paid, 0))), 0)::numeric as remaining_amount,
      -- Rincian per pesanan yang belum lunas
      coalesce(
        (
          select jsonb_agg(ord_sub)
          from (
            select
              o2.id::text as id,
              o2.order_id,
              o2.customer_name,
              coalesce(s2.name, 'Tanpa Sales') as sales_name,
              o2.order_date::text as order_date,
              coalesce(sum(oi2.qty), 0)::numeric as total_pcs,
              (o2.total_price + o2.ongkir)::numeric as grand_total,
              coalesce(pmt2.paid, 0)::numeric as paid_amount,
              greatest(0, (o2.total_price + o2.ongkir) - coalesce(pmt2.paid, 0))::numeric as remaining_amount
            from public.orders o2
            left join public.sales s2 on s2.id = o2.sales_id
            left join public.order_items oi2 on oi2.order_id = o2.id
            left join (
              select order_id, (coalesce(sum(amount), 0) - coalesce(max(dep.rel), 0)) as paid
              from public.order_payments op
              left join (
                select order_id as dep_order_id, sum(amount) as rel
                from public.order_deposit_releases group by order_id
              ) dep on dep.dep_order_id = op.order_id
              group by order_id
            ) pmt2 on pmt2.order_id = o2.id
            where o2.po_batch_id = pb.id
              and o2.user_id = v_uid
              and (coalesce(pmt2.paid, 0) < (o2.total_price + o2.ongkir))
            group by o2.id, o2.order_id, o2.customer_name, s2.name, o2.order_date, o2.total_price, o2.ongkir, pmt2.paid
            order by remaining_amount desc
          ) ord_sub
        ),
        '[]'::jsonb
      ) as unpaid_orders
    from public.po_batches pb
    join public.orders o on o.po_batch_id = pb.id
    left join (
      select order_id, (coalesce(sum(amount), 0) - coalesce(max(dep.rel), 0)) as paid
      from public.order_payments op
      left join (
        select order_id as dep_order_id, sum(amount) as rel
        from public.order_deposit_releases group by order_id
      ) dep on dep.dep_order_id = op.order_id
      group by order_id
    ) pmt on pmt.order_id = o.id
    where pb.user_id = v_uid
      and (pb.status = 'closed' or pb.end_date < v_date)
    group by pb.id, pb.name, pb.code, pb.status, pb.start_date, pb.end_date
    having coalesce(sum(greatest(0, (o.total_price + o.ongkir) - coalesce(pmt.paid, 0))), 0) > 0
    order by pb.start_date desc
  ) sub;

  -- 5. Daftar Pesanan Hari Ini
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_orders_list
  from (
    select
      o.id::text as id,
      o.order_id,
      o.order_date::text as order_date,
      o.customer_name,
      coalesce(s.name, 'Tanpa Sales') as sales_name,
      pb.name as po_name,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      o.total_price,
      o.ongkir,
      case
        when (coalesce(pmt.paid, 0) >= (o.total_price + o.ongkir)) and (o.total_price + o.ongkir) > 0 then 'paid'
        when coalesce(pmt.paid, 0) > 0 then 'partial'
        else 'unpaid'
      end as payment_status,
      o.production_status
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    left join public.po_batches pb on pb.id = o.po_batch_id
    left join public.order_items oi on oi.order_id = o.id
    left join (
      select order_id, (coalesce(sum(amount), 0) - coalesce(max(dep.rel), 0)) as paid
      from public.order_payments op
      left join (
        select order_id as dep_order_id, sum(amount) as rel
        from public.order_deposit_releases group by order_id
      ) dep on dep.dep_order_id = op.order_id
      group by order_id
    ) pmt on pmt.order_id = o.id
    where o.user_id = v_uid and o.order_date = v_date
    group by o.id, o.order_id, o.order_date, o.customer_name, s.name, pb.name, o.total_price, o.ongkir, pmt.paid, o.production_status
    order by o.created_at asc
  ) sub;

  -- 6. Kumulatif per PO yang disentuh pada tanggal tersebut
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_pos_array
  from (
    select
      pb.id::text as batch_id,
      pb.name,
      pb.code,
      pb.status,
      pb.start_date::text,
      pb.end_date::text,
      pb.period_year,
      pb.period_month,
      pb.quota_qty,
      coalesce(count(distinct o.id) filter (where o.order_date = v_date), 0)::integer as today_orders,
      coalesce(sum(oi.qty) filter (where o.order_date = v_date), 0)::numeric as today_pcs,
      coalesce(count(distinct o.id), 0)::integer as cum_orders,
      coalesce(sum(oi.qty), 0)::numeric as cum_pcs,
      coalesce(sum(distinct (o.total_price + o.ongkir)), 0)::numeric as cum_price,
      coalesce(max(pmt.cum_paid), 0)::numeric as cum_paid,
      case
        when pb.quota_qty is not null and pb.quota_qty > 0 then
          round((coalesce(sum(oi.qty), 0)::numeric / pb.quota_qty::numeric) * 100, 1)
        else null
      end as quota_used_pct
    from public.po_batches pb
    join public.orders o on o.po_batch_id = pb.id and o.order_date <= v_date
    left join public.order_items oi on oi.order_id = o.id
    left join (
      select
        o2.po_batch_id,
        coalesce(sum(op.amount), 0) as cum_paid
      from public.order_payments op
      join public.orders o2 on o2.id = op.order_id
      where op.payment_date <= v_date
      group by o2.po_batch_id
    ) pmt on pmt.po_batch_id = pb.id
    where pb.user_id = v_uid
      and exists (
        select 1 from public.orders o_check
        where o_check.po_batch_id = pb.id and o_check.order_date = v_date
      )
    group by pb.id, pb.name, pb.code, pb.status, pb.start_date, pb.end_date, pb.period_year, pb.period_month, pb.quota_qty
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
    'sales_category_matrix', v_sales_cat_mat,
    'past_unpaid_pos', v_past_unpaid,
    'orders', v_orders_list,
    'pos', v_pos_array
  );
end;
$$;

revoke execute on function public.get_po_daily_report(date) from public, anon;
grant  execute on function public.get_po_daily_report(date) to authenticated;


-- ----------------------------------------------------------------------------
-- 2. close_po_batch & get_po_close_report (Perbaikan Kategori & Injeksi Snapshot)
-- ----------------------------------------------------------------------------
create or replace function public.close_po_batch(
  p_batch_id uuid,
  p_close_note text default null,
  p_close_early_reason text default null
)
returns public.po_batches
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid                  uuid := auth.uid();
  v_batch                public.po_batches;
  v_now                  timestamptz := now();
  v_today_wib            date := (v_now at time zone 'Asia/Jakarta')::date;
  v_is_early             boolean := false;
  v_snapshot             jsonb;
  v_total_orders         integer := 0;
  v_total_pcs            numeric := 0;
  v_unit_orders          integer := 0;
  v_unit_pcs             numeric := 0;
  v_priority_orders      integer := 0;
  v_priority_pcs         numeric := 0;
  v_total_price          numeric := 0;
  v_total_ongkir         numeric := 0;
  v_total_paid           numeric := 0;
  v_total_remaining      numeric := 0;
  v_total_hpp            numeric := 0;
  v_quota_used_pct       numeric := null;
  v_by_sales             jsonb := '[]'::jsonb;
  v_by_category          jsonb := '[]'::jsonb;
  v_sales_cat_mat        jsonb := '[]'::jsonb;
  v_prod_progress        jsonb := '[]'::jsonb;
  v_order_rec            record;
  v_failed_rekap_count   integer := 0;
  v_updated              public.po_batches;
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

  if v_batch.status = 'closed' then
    raise exception 'Batch PO % sudah berstatus ditutup', v_batch.code using errcode = 'P0002';
  end if;

  v_is_early := (v_today_wib < v_batch.end_date);
  if v_is_early and (p_close_early_reason is null or trim(p_close_early_reason) = '') then
    raise exception 'Penutupan sebelum tanggal selesai (%) wajib menyertakan alasan', v_batch.end_date
      using errcode = 'P0003';
  end if;

  -- 1. Agregasi Order
  select
    coalesce(count(*), 0)::integer,
    coalesce(sum(sub.pcs), 0)::numeric,
    coalesce(count(*) filter (where sub.order_type = 'unit'), 0)::integer,
    coalesce(sum(sub.pcs) filter (where sub.order_type = 'unit'), 0)::numeric,
    coalesce(count(*) filter (where sub.order_type = 'prioritas'), 0)::integer,
    coalesce(sum(sub.pcs) filter (where sub.order_type = 'prioritas'), 0)::numeric,
    coalesce(sum(sub.total_price), 0)::numeric,
    coalesce(sum(sub.ongkir), 0)::numeric,
    coalesce(sum(sub.paid), 0)::numeric,
    coalesce(sum(greatest(0, (sub.total_price + sub.ongkir) - sub.paid)), 0)::numeric
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
      coalesce(o.order_type, 'unit') as order_type,
      o.total_price,
      o.ongkir,
      coalesce(sum(oi.qty), 0)::numeric as pcs,
      coalesce(max(pmt.paid), 0)::numeric as paid
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    left join (
      select order_id, (coalesce(sum(amount), 0) - coalesce(max(dep.rel), 0)) as paid
      from public.order_payments op
      left join (
        select order_id as dep_order_id, sum(amount) as rel
        from public.order_deposit_releases group by order_id
      ) dep on dep.dep_order_id = op.order_id
      group by order_id
    ) pmt on pmt.order_id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by o.id, o.order_type, o.total_price, o.ongkir
  ) sub;

  if v_batch.quota_qty is not null and v_batch.quota_qty > 0 then
    v_quota_used_pct := round((v_total_pcs / v_batch.quota_qty::numeric) * 100, 1);
  end if;

  -- 2. Total HPP snapshot
  select coalesce(sum(coalesce(oi.hpp_total_snapshot, (oi.qty * coalesce(oi.hpp_per_unit_snapshot, 0)))), 0)::numeric
  into v_total_hpp
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.po_batch_id = p_batch_id and o.user_id = v_uid;

  -- 3. Breakdown per sales
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

  -- 4. Breakdown per kategori produk (dengan fallback p.category_id)
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_category
  from (
    select
      coalesce(pc.name, 'Tanpa Kategori') as category,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(oi.qty * oi.price), 0)::numeric as total_price
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    left join public.product_categories pc on pc.id = coalesce(oi.category_id, p.category_id)
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by pc.name
    order by total_pcs desc
  ) sub;

  -- 4b. Matriks Sales x Kategori Produk PO ini (dengan fallback p.category_id)
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_sales_cat_mat
  from (
    select
      s.id::text as sales_id,
      coalesce(s.name, 'Tanpa Sales') as sales_name,
      coalesce(pc.name, 'Tanpa Kategori') as category_name,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(oi.qty * oi.price), 0)::numeric as total_price
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    join public.order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id
    left join public.product_categories pc on pc.id = coalesce(oi.category_id, p.category_id)
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by s.id, s.name, pc.name
    order by s.name asc, pc.name asc
  ) sub;

  -- 5. Rincian Progres Produksi Per Order (Diurutkan dari Pcs Terbanyak)
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_prod_progress
  from (
    select
      o.id::text as id,
      o.order_id,
      o.customer_name,
      coalesce(s.name, 'Tanpa Sales') as sales_name,
      o.order_date::text as order_date,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      o.total_price,
      o.production_status,
      (
        select string_agg(oi_sub.qty::text || ' ' || oi_sub.name_item, ', ')
        from public.order_items oi_sub
        where oi_sub.order_id = o.id
      ) as items_summary,
      coalesce(sum(oi.cutting_qty), 0)::numeric as cutting_completed_pcs,
      case
        when coalesce(sum(oi.cutting_qty), 0) >= coalesce(sum(oi.qty), 0) and coalesce(sum(oi.qty), 0) > 0 then 'done'
        when coalesce(sum(oi.cutting_qty), 0) > 0 then 'in_progress'
        else 'pending'
      end as cutting_status,
      coalesce(sum(sa_agg.sewn_qty), 0)::numeric as sewing_completed_pcs,
      case
        when coalesce(sum(sa_agg.sewn_qty), 0) >= coalesce(sum(oi.qty), 0) and coalesce(sum(oi.qty), 0) > 0 then 'done'
        when coalesce(sum(sa_agg.sewn_qty), 0) > 0 then 'in_progress'
        else 'pending'
      end as sewing_status,
      coalesce(sum(sa_agg.qc_passed_qty), 0)::numeric as qc_passed_pcs,
      case
        when coalesce(sum(sa_agg.qc_passed_qty), 0) >= coalesce(sum(oi.qty), 0) and coalesce(sum(oi.qty), 0) > 0 then 'done'
        when coalesce(sum(sa_agg.qc_passed_qty), 0) > 0 then 'in_progress'
        else 'pending'
      end as qc_status
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    left join public.order_items oi on oi.order_id = o.id
    left join (
      select order_item_id, sum(sewn_qty) as sewn_qty, sum(qc_passed_qty) as qc_passed_qty
      from public.sewing_assignments
      group by order_item_id
    ) sa_agg on sa_agg.order_item_id = oi.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by o.id, o.order_id, o.customer_name, s.name, o.order_date, o.total_price, o.production_status, o.created_at
    order by total_pcs desc, o.created_at asc
  ) sub;

  -- 6. Susun objek snapshot
  v_snapshot := jsonb_build_object(
    'closed_at', v_now,
    'is_early', v_is_early,
    'close_early_reason', case when v_is_early then p_close_early_reason else null end,
    'close_note', p_close_note,
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'code', v_batch.code,
      'name', v_batch.name,
      'period_year', v_batch.period_year,
      'period_month', v_batch.period_month,
      'start_date', v_batch.start_date,
      'end_date', v_batch.end_date,
      'quota_qty', v_batch.quota_qty,
      'quota_used_pct', v_quota_used_pct
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
      'hpp_total_estimate', v_total_hpp,
      'estimated_margin', v_total_price - v_total_hpp
    ),
    'sales_breakdown', v_by_sales,
    'category_breakdown', v_by_category,
    'sales_category_matrix', v_sales_cat_mat,
    'production_progress_orders', v_prod_progress
  );

  -- 7. Update status PO jadi closed
  update public.po_batches
  set
    status = 'closed',
    closed_at = v_now,
    closed_by = v_uid,
    close_note = p_close_note,
    close_early_reason = case when v_is_early then p_close_early_reason else null end,
    close_snapshot = v_snapshot
  where id = p_batch_id and user_id = v_uid
  returning * into v_updated;

  -- 8. Loop Rekap Massal Pesanan yang belum direkap
  for v_order_rec in
    select o.id
    from public.orders o
    join public.order_stage_events ose on ose.order_id = o.id and ose.stage = 'rekap'
    where o.po_batch_id = p_batch_id
      and o.user_id = v_uid
      and ose.status <> 'done'
      and o.released_early_at is null
  loop
    update public.order_stage_events
    set
      status = 'done',
      event_timestamp = v_now,
      actor_id = v_uid,
      notes = coalesce(notes, '') || case when notes is not null and notes <> '' then ' | ' else '' end || 'Otomatis saat tutup PO ' || v_batch.code
    where order_id = v_order_rec.id and stage = 'rekap';
  end loop;

  -- 9. Audit event
  insert into public.po_batch_events (
    user_id,
    batch_id,
    event,
    actor_id,
    metadata
  ) values (
    v_uid,
    p_batch_id,
    'closed',
    v_uid,
    jsonb_build_object(
      'closed_at', v_now,
      'is_early', v_is_early,
      'close_note', p_close_note,
      'close_early_reason', p_close_early_reason,
      'total_orders', v_total_orders,
      'total_pcs', v_total_pcs,
      'total_price', v_total_price
    )
  );

  return v_updated;
end;
$$;

revoke execute on function public.close_po_batch(uuid, text, text) from public, anon;
grant  execute on function public.close_po_batch(uuid, text, text) to authenticated;


create or replace function public.get_po_close_report(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid            uuid := auth.uid();
  v_batch          public.po_batches;
  v_paid_live      numeric := 0;
  v_rec_live       numeric := 0;
  v_lunas_count    integer := 0;
  v_tot_order_pcs  numeric := 0;
  v_cut_pcs        numeric := 0;
  v_sew_pcs        numeric := 0;
  v_qc_pcs         numeric := 0;
  v_closer_name    text;
  v_sales_cat_mat  jsonb := '[]'::jsonb;
  v_prod_progress  jsonb := '[]'::jsonb;
  v_snapshot_out   jsonb;
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

  -- Hitung Matriks Sales x Kategori untuk PO ini (dengan fallback p.category_id)
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_sales_cat_mat
  from (
    select
      s.id::text as sales_id,
      coalesce(s.name, 'Tanpa Sales') as sales_name,
      coalesce(pc.name, 'Tanpa Kategori') as category_name,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(oi.qty * oi.price), 0)::numeric as total_price
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    join public.order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id
    left join public.product_categories pc on pc.id = coalesce(oi.category_id, p.category_id)
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by s.id, s.name, pc.name
    order by s.name asc, pc.name asc
  ) sub;

  -- Hitung Rincian Progres Produksi Per Order (Diurutkan dari Pcs Terbanyak)
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_prod_progress
  from (
    select
      o.id::text as id,
      o.order_id,
      o.customer_name,
      coalesce(s.name, 'Tanpa Sales') as sales_name,
      o.order_date::text as order_date,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      o.total_price,
      o.production_status,
      (
        select string_agg(oi_sub.qty::text || ' ' || oi_sub.name_item, ', ')
        from public.order_items oi_sub
        where oi_sub.order_id = o.id
      ) as items_summary,
      coalesce(sum(oi.cutting_qty), 0)::numeric as cutting_completed_pcs,
      case
        when coalesce(sum(oi.cutting_qty), 0) >= coalesce(sum(oi.qty), 0) and coalesce(sum(oi.qty), 0) > 0 then 'done'
        when coalesce(sum(oi.cutting_qty), 0) > 0 then 'in_progress'
        else 'pending'
      end as cutting_status,
      coalesce(sum(sa_agg.sewn_qty), 0)::numeric as sewing_completed_pcs,
      case
        when coalesce(sum(sa_agg.sewn_qty), 0) >= coalesce(sum(oi.qty), 0) and coalesce(sum(oi.qty), 0) > 0 then 'done'
        when coalesce(sum(sa_agg.sewn_qty), 0) > 0 then 'in_progress'
        else 'pending'
      end as sewing_status,
      coalesce(sum(sa_agg.qc_passed_qty), 0)::numeric as qc_passed_pcs,
      case
        when coalesce(sum(sa_agg.qc_passed_qty), 0) >= coalesce(sum(oi.qty), 0) and coalesce(sum(oi.qty), 0) > 0 then 'done'
        when coalesce(sum(sa_agg.qc_passed_qty), 0) > 0 then 'in_progress'
        else 'pending'
      end as qc_status
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    left join public.order_items oi on oi.order_id = o.id
    left join (
      select order_item_id, sum(sewn_qty) as sewn_qty, sum(qc_passed_qty) as qc_passed_qty
      from public.sewing_assignments
      group by order_item_id
    ) sa_agg on sa_agg.order_item_id = oi.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by o.id, o.order_id, o.customer_name, s.name, o.order_date, o.total_price, o.production_status, o.created_at
    order by total_pcs desc, o.created_at asc
  ) sub;

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
      'sales_category_matrix', v_sales_cat_mat,
      'production_progress_orders', v_prod_progress,
      'live_status', null
    );
  end if;

  -- Siapkan snapshot: jika snapshot lama belum ada sales_category_matrix atau production_progress_orders, injeksikan
  v_snapshot_out := v_batch.close_snapshot;
  if not (v_snapshot_out ? 'sales_category_matrix') or jsonb_array_length(coalesce(v_snapshot_out->'sales_category_matrix', '[]'::jsonb)) = 0 then
    v_snapshot_out := jsonb_set(v_snapshot_out, '{sales_category_matrix}', v_sales_cat_mat);
  end if;
  if not (v_snapshot_out ? 'production_progress_orders') or jsonb_array_length(coalesce(v_snapshot_out->'production_progress_orders', '[]'::jsonb)) = 0 then
    v_snapshot_out := jsonb_set(v_snapshot_out, '{production_progress_orders}', v_prod_progress);
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
  ) s;

  -- Data LIVE: Status Produksi Sekarang
  select
    coalesce(sum(oi.qty), 0)::numeric,
    coalesce(sum(oi.cutting_qty), 0)::numeric,
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
    'close_snapshot', v_snapshot_out,
    'sales_category_matrix', v_sales_cat_mat,
    'production_progress_orders', v_prod_progress,
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


-- ----------------------------------------------------------------------------
-- 3. get_po_monthly_report (Perbaikan Kategori pada Matriks Bulanan)
-- ----------------------------------------------------------------------------
create or replace function public.get_po_monthly_report(
  p_year integer default extract(year from (now() at time zone 'Asia/Jakarta'))::integer,
  p_month integer default extract(month from (now() at time zone 'Asia/Jakarta'))::integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid                  uuid := auth.uid();
  v_year                 integer := coalesce(p_year, extract(year from (now() at time zone 'Asia/Jakarta'))::integer);
  v_month                integer := coalesce(p_month, extract(month from (now() at time zone 'Asia/Jakarta'))::integer);
  v_start_month          date := make_date(v_year, v_month, 1);
  v_end_month            date := (v_start_month + interval '1 month - 1 day')::date;
  v_month_name           text;
  v_po_batches           jsonb := '[]'::jsonb;
  v_sales_cat_mat        jsonb := '[]'::jsonb;
  v_tot_po_count         integer := 0;
  v_tot_order_count      integer := 0;
  v_tot_pcs              numeric := 0;
  v_tot_booking_val      numeric := 0;
  v_tot_ongkir           numeric := 0;
  v_tot_paid             numeric := 0;
  v_tot_receivable       numeric := 0;
  v_tot_shipped_count    integer := 0;
  v_tot_shipped_val      numeric := 0;
  v_tot_hpp_est          numeric := 0;
  v_tot_est_margin       numeric := 0;
  v_tot_wage             numeric := 0;
  v_tot_materials        numeric := 0;
  v_tot_quota_qty        numeric := 0;
  v_tot_quota_used_pct   numeric := null;
  v_unlinked_wage        numeric := 0;
  v_unlinked_materials   numeric := 0;
  v_prev_year            integer;
  v_prev_month           integer;
  v_prev_orders          integer := 0;
  v_prev_pcs             numeric := 0;
  v_prev_booking         numeric := 0;
  v_prev_margin          numeric := 0;
  v_journal_rev_4_1000   numeric := 0;
  v_journal_rev_4_1100   numeric := 0;
  v_tot_journal_rev      numeric := 0;
  v_rev_diff             numeric := 0;
  v_recon_notes          text;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  v_month_name := case v_month
    when 1 then 'Januari' when 2 then 'Februari' when 3 then 'Maret'
    when 4 then 'April' when 5 then 'Mei' when 6 then 'Juni'
    when 7 then 'Juli' when 8 then 'Agustus' when 9 then 'September'
    when 10 then 'Oktober' when 11 then 'November' when 12 then 'Desember'
    else 'Bulan ' || v_month
  end;

  -- 1. Matriks Penjualan per Sales x Kategori pada Bulan ini (dengan fallback p.category_id)
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_sales_cat_mat
  from (
    select
      s.id::text as sales_id,
      coalesce(s.name, 'Tanpa Sales') as sales_name,
      coalesce(pc.name, 'Tanpa Kategori') as category_name,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(oi.qty * oi.price), 0)::numeric as total_price
    from public.po_batches pb
    join public.orders o on o.po_batch_id = pb.id
    left join public.sales s on s.id = o.sales_id
    join public.order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id
    left join public.product_categories pc on pc.id = coalesce(oi.category_id, p.category_id)
    where pb.user_id = v_uid
      and pb.period_year = v_year
      and pb.period_month = v_month
    group by s.id, s.name, pc.name
    order by s.name asc, pc.name asc
  ) sub;

  -- 2. Daftar Kinerja per Batch PO pada Bulan Ini
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_po_batches
  from (
    select
      pb.id::text as batch_id,
      pb.code,
      pb.name,
      pb.start_date::text,
      pb.end_date::text,
      pb.status,
      pb.quota_qty,
      case
        when pb.quota_qty is not null and pb.quota_qty > 0 then
          round((coalesce(sum(oi.qty), 0)::numeric / pb.quota_qty::numeric) * 100, 1)
        else null
      end as quota_used_pct,
      coalesce(count(distinct o.id), 0)::integer as order_count,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(distinct (o.total_price + o.ongkir)), 0)::numeric as booking_value,
      coalesce(sum(distinct o.ongkir), 0)::numeric as total_ongkir,
      coalesce(max(pmt.paid), 0)::numeric as paid_amount,
      greatest(0, coalesce(sum(distinct (o.total_price + o.ongkir)), 0) - coalesce(max(pmt.paid), 0))::numeric as receivable_amount,
      coalesce(count(distinct o.id) filter (where ose.status = 'done'), 0)::integer as shipped_order_count,
      coalesce(sum(distinct (o.total_price + o.ongkir)) filter (where ose.status = 'done'), 0)::numeric as shipped_order_value,
      coalesce(sum(coalesce(oi.hpp_total_snapshot, (oi.qty * coalesce(oi.hpp_per_unit_snapshot, 0)))), 0)::numeric as hpp_total_estimate,
      (coalesce(sum(distinct (o.total_price + o.ongkir)), 0) - coalesce(sum(coalesce(oi.hpp_total_snapshot, (oi.qty * coalesce(oi.hpp_per_unit_snapshot, 0)))), 0))::numeric as estimated_margin,
      coalesce(max(w.wage), 0)::numeric as actual_piecework_wage,
      coalesce(max(mat.purchases), 0)::numeric as material_purchases
    from public.po_batches pb
    left join public.orders o on o.po_batch_id = pb.id
    left join public.order_items oi on oi.order_id = o.id
    left join public.order_stage_events ose on ose.order_id = o.id and ose.stage = 'kirim'
    left join (
      select
        o2.po_batch_id,
        (coalesce(sum(op.amount), 0) - coalesce(max(dep.rel), 0)) as paid
      from public.order_payments op
      join public.orders o2 on o2.id = op.order_id
      left join (
        select order_id as dep_order_id, sum(amount) as rel
        from public.order_deposit_releases group by order_id
      ) dep on dep.dep_order_id = op.order_id
      group by o2.po_batch_id
    ) pmt on pmt.po_batch_id = pb.id
    left join (
      select
        o3.po_batch_id,
        coalesce(sum(pt.total_wage), 0) as wage
      from public.piecework_tasks pt
      join public.orders o3 on o3.id = pt.order_id
      where pt.user_id = v_uid and pt.status in ('completed', 'paid')
      group by o3.po_batch_id
    ) w on w.po_batch_id = pb.id
    left join (
      select
        sr.po_batch_id,
        coalesce(sum(sub_m.item_cost), 0) as purchases
      from public.stock_requests sr
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
      where sr.po_batch_id is not null
      group by sr.po_batch_id
    ) mat on mat.po_batch_id = pb.id
    where pb.user_id = v_uid
      and pb.period_year = v_year
      and pb.period_month = v_month
    group by pb.id, pb.code, pb.name, pb.start_date, pb.end_date, pb.status, pb.quota_qty
    order by pb.start_date asc
  ) sub;

  -- 3. Akumulasi Total Bulan Ini
  select
    coalesce(count(*), 0)::integer,
    coalesce(sum((b->>'order_count')::integer), 0)::integer,
    coalesce(sum((b->>'total_pcs')::numeric), 0)::numeric,
    coalesce(sum((b->>'booking_value')::numeric), 0)::numeric,
    coalesce(sum((b->>'total_ongkir')::numeric), 0)::numeric,
    coalesce(sum((b->>'paid_amount')::numeric), 0)::numeric,
    coalesce(sum((b->>'receivable_amount')::numeric), 0)::numeric,
    coalesce(sum((b->>'shipped_order_count')::integer), 0)::integer,
    coalesce(sum((b->>'shipped_order_value')::numeric), 0)::numeric,
    coalesce(sum((b->>'hpp_total_estimate')::numeric), 0)::numeric,
    coalesce(sum((b->>'estimated_margin')::numeric), 0)::numeric,
    coalesce(sum((b->>'actual_piecework_wage')::numeric), 0)::numeric,
    coalesce(sum((b->>'material_purchases')::numeric), 0)::numeric,
    coalesce(sum((b->>'quota_qty')::numeric) filter (where (b->>'quota_qty') is not null), 0)::numeric
  into
    v_tot_po_count,
    v_tot_order_count,
    v_tot_pcs,
    v_tot_booking_val,
    v_tot_ongkir,
    v_tot_paid,
    v_tot_receivable,
    v_tot_shipped_count,
    v_tot_shipped_val,
    v_tot_hpp_est,
    v_tot_est_margin,
    v_tot_wage,
    v_tot_materials,
    v_tot_quota_qty
  from jsonb_array_elements(v_po_batches) b;

  if v_tot_quota_qty > 0 then
    v_tot_quota_used_pct := round((v_tot_pcs / v_tot_quota_qty) * 100, 1);
  end if;

  -- 4. Biaya tidak terkait PO
  select coalesce(sum(pt.total_wage), 0)::numeric into v_unlinked_wage
  from public.piecework_tasks pt
  where pt.user_id = v_uid
    and pt.order_id is null
    and pt.status in ('completed', 'paid')
    and pt.completed_at::date >= v_start_month
    and pt.completed_at::date <= v_end_month;

  select coalesce(sum(sub_unlinked.item_cost), 0)::numeric into v_unlinked_materials
  from (
    select sum(pri.quantity * pri.unit_price) as item_cost
    from public.purchasing_report_items pri
    join public.purchasing_reports pr on pr.id = pri.report_id
    join public.stock_requests sr on sr.id = pri.stock_request_id
    where pr.user_id = v_uid
      and sr.po_batch_id is null
      and pr.report_date >= v_start_month
      and pr.report_date <= v_end_month
    union all
    select sum(spi.quantity * spi.unit_price) as item_cost
    from public.supplier_purchase_items spi
    join public.supplier_purchases sp on sp.id = spi.purchase_id
    join public.stock_requests sr on sr.id = spi.stock_request_id
    where sp.user_id = v_uid
      and sr.po_batch_id is null
      and sp.payment_date >= v_start_month
      and sp.payment_date <= v_end_month
  ) sub_unlinked;

  -- 5. Perbandingan Bulan Lalu
  if v_month = 1 then
    v_prev_year := v_year - 1;
    v_prev_month := 12;
  else
    v_prev_year := v_year;
    v_prev_month := v_month - 1;
  end if;

  select
    coalesce(count(distinct o.id), 0)::integer,
    coalesce(sum(oi.qty), 0)::numeric,
    coalesce(sum(distinct (o.total_price + o.ongkir)), 0)::numeric,
    coalesce(sum(distinct (o.total_price + o.ongkir)) - sum(coalesce(oi.hpp_total_snapshot, (oi.qty * coalesce(oi.hpp_per_unit_snapshot, 0)))), 0)::numeric
  into
    v_prev_orders,
    v_prev_pcs,
    v_prev_booking,
    v_prev_margin
  from public.po_batches pb
  left join public.orders o on o.po_batch_id = pb.id
  left join public.order_items oi on oi.order_id = o.id
  where pb.user_id = v_uid
    and pb.period_year = v_prev_year
    and pb.period_month = v_prev_month;

  -- 6. Rekonsiliasi Jurnal Akuntansi
  select
    coalesce(sum(case when a.code = '4-1000' then jl.credit - jl.debit else 0 end), 0)::numeric,
    coalesce(sum(case when a.code = '4-1100' then jl.credit - jl.debit else 0 end), 0)::numeric
  into
    v_journal_rev_4_1000,
    v_journal_rev_4_1100
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id
  join public.accounts a on a.id = jl.account_id
  where je.user_id = v_uid
    and je.entry_date between v_start_month and v_end_month
    and a.code in ('4-1000', '4-1100');

  v_tot_journal_rev := v_journal_rev_4_1000 + v_journal_rev_4_1100;
  v_rev_diff := v_tot_booking_val - v_tot_journal_rev;

  v_recon_notes := 'Selisih wajar timbul karena pendapatan jurnal diakui saat pesanan berstatus Selesai/Kirim (accrual) atau saat kas diterima (kas masuk DP/pelunasan), sedangkan Nilai Booking Batch PO mencatat seluruh pesanan yang masuk pada PO.';

  return jsonb_build_object(
    'year', v_year,
    'month', v_month,
    'month_name', v_month_name,
    'po_batches', v_po_batches,
    'sales_category_matrix', v_sales_cat_mat,
    'unlinked_piecework_wage', v_unlinked_wage,
    'unlinked_material_purchases', v_unlinked_materials,
    'totals', jsonb_build_object(
      'po_count', v_tot_po_count,
      'order_count', v_tot_order_count,
      'total_pcs', v_tot_pcs,
      'booking_value', v_tot_booking_val,
      'total_ongkir', v_tot_ongkir,
      'paid_amount', v_tot_paid,
      'receivable_amount', v_tot_receivable,
      'shipped_order_count', v_tot_shipped_count,
      'shipped_order_value', v_tot_shipped_val,
      'hpp_total_estimate', v_tot_hpp_est,
      'estimated_margin', v_tot_est_margin,
      'actual_piecework_wage', v_tot_wage,
      'material_purchases', v_tot_materials,
      'total_quota_qty', v_tot_quota_qty,
      'quota_used_pct', v_tot_quota_used_pct
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
        'order_count_diff', v_tot_order_count - v_prev_orders,
        'total_pcs_diff', v_tot_pcs - v_prev_pcs,
        'booking_value_diff', v_tot_booking_val - v_prev_booking,
        'estimated_margin_diff', v_tot_est_margin - v_prev_margin
      )
    ),
    'reconciliation', jsonb_build_object(
      'recognized_revenue_4_1000', v_journal_rev_4_1000,
      'recognized_revenue_4_1100', v_journal_rev_4_1100,
      'total_recognized_revenue', v_tot_journal_rev,
      'booking_value_difference', v_rev_diff,
      'notes', v_recon_notes
    )
  );
end;
$$;

revoke execute on function public.get_po_monthly_report(integer, integer) from public, anon;
grant  execute on function public.get_po_monthly_report(integer, integer) to authenticated;
