-- ============================================================================
-- Migration: 20261022090000_po_reports_matrix_and_progress.sql
-- Deskripsi:
-- 1. get_po_daily_report:
--    - Menambahkan matriks per sales x per kategori (sales_category_matrix)
--    - Menambahkan sisa pelunasan dari PO sebelum-sebelumnya (past_unpaid_pos)
-- 2. get_po_close_report & close_po_batch:
--    - Menambahkan matriks per sales x per kategori (sales_category_matrix)
--    - Menambahkan rincian progres produksi diurutkan dari pcs terbanyak (production_progress_orders)
--    - Memperbarui close_snapshot untuk menyimpan matriks & progres produksi
-- 3. get_po_monthly_report:
--    - Menambahkan matriks per sales x per kategori (sales_category_matrix)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. get_po_daily_report
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

  -- 3b. Matriks Sales x Kategori Produk pada tanggal tersebut
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
    left join public.product_categories pc on pc.id = oi.category_id
    where o.user_id = v_uid and o.order_date = v_date
    group by s.id, s.name, pc.name
    order by s.name asc, pc.name asc
  ) sub;

  -- 3c. Sisa Pelunasan dari PO Sebelum-sebelumnya yang belum lunas
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_past_unpaid
  from (
    select
      pb.id::text as batch_id,
      pb.name,
      pb.code,
      pb.status,
      pb.start_date::text as start_date,
      pb.end_date::text as end_date,
      count(distinct o.id)::integer as total_orders,
      count(distinct case when (o.total_price + o.ongkir) > (coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)) then o.id else null end)::integer as unpaid_orders_count,
      coalesce(sum(o.total_price + o.ongkir), 0)::numeric as total_booking_and_ongkir,
      coalesce(sum(coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)), 0)::numeric as total_paid,
      coalesce(sum(greatest(0, (o.total_price + o.ongkir) - (coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)))), 0)::numeric as remaining_amount
    from public.po_batches pb
    join public.orders o on o.po_batch_id = pb.id
    left join (
      select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
    ) p on p.order_id = o.id
    left join (
      select order_id, sum(amount) as released_amount from public.order_deposit_releases group by order_id
    ) r on r.order_id = o.id
    where pb.user_id = v_uid
      and o.user_id = v_uid
      and pb.start_date <= v_date
    group by pb.id, pb.name, pb.code, pb.status, pb.start_date, pb.end_date
    having coalesce(sum(greatest(0, (o.total_price + o.ongkir) - (coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)))), 0) > 0
    order by pb.start_date desc
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
      t_ord.today_orders,
      t_ord.today_pcs,
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
    'summary', jsonb_build_object(
      'order_count', v_today_orders,
      'total_pcs', v_today_pcs,
      'total_price', v_today_price,
      'total_ongkir', v_today_ongkir,
      'payment_received', v_today_paid
    ),
    'sales_breakdown', v_by_sales,
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
-- 2. close_po_batch & get_po_close_report
-- ----------------------------------------------------------------------------

create or replace function public.close_po_batch(
  p_batch_id           uuid,
  p_close_note         text default null,
  p_close_early_reason text default null
)
returns public.po_batches
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid              uuid := auth.uid();
  v_batch            public.po_batches;
  v_updated          public.po_batches;
  v_now              timestamptz := now();
  v_today            date := (v_now at time zone 'Asia/Jakarta')::date;
  v_is_early         boolean := false;
  v_total_orders     integer := 0;
  v_total_pcs        numeric := 0;
  v_unit_orders      integer := 0;
  v_unit_pcs         numeric := 0;
  v_priority_orders  integer := 0;
  v_priority_pcs     numeric := 0;
  v_total_price      numeric := 0;
  v_total_ongkir     numeric := 0;
  v_total_paid       numeric := 0;
  v_total_remaining  numeric := 0;
  v_quota_used_pct   numeric := null;
  v_total_hpp        numeric := 0;
  v_by_sales         jsonb := '[]'::jsonb;
  v_by_category      jsonb := '[]'::jsonb;
  v_by_product       jsonb := '[]'::jsonb;
  v_sales_cat_mat    jsonb := '[]'::jsonb;
  v_prod_progress    jsonb := '[]'::jsonb;
  v_fabrics          jsonb := '[]'::jsonb;
  v_snapshot         jsonb;
  v_order_rec        record;
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
    raise exception 'Batch PO sudah dalam status closed' using errcode = 'P0001';
  end if;

  if v_today < v_batch.end_date then
    v_is_early := true;
    if p_close_early_reason is null or trim(p_close_early_reason) = '' then
      raise exception 'Penutupan PO sebelum tanggal selesai (%) memerlukan alasan penutupan lebih awal',
        v_batch.end_date
        using errcode = 'P0001';
    end if;
  end if;

  -- 1. Hitung Ringkasan Order & Keuangan saat close
  select
    count(*)::integer,
    coalesce(sum(sub.total_pcs), 0)::numeric,
    count(*) filter (where sub.order_type = 'satuan')::integer,
    coalesce(sum(sub.total_pcs) filter (where sub.order_type = 'satuan'), 0)::numeric,
    count(*) filter (where sub.order_type = 'prioritas')::integer,
    coalesce(sum(sub.total_pcs) filter (where sub.order_type = 'prioritas'), 0)::numeric,
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

  -- 4. Breakdown per kategori produk
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

  -- 4b. Matriks Sales x Kategori Produk PO ini
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
    left join public.product_categories pc on pc.id = oi.category_id
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
      coalesce(sum(case when oi.cutting_completed_at is not null then oi.qty else 0 end), 0)::numeric as cutting_completed_pcs,
      case
        when count(oi.id) = 0 then 'pending'
        when count(case when oi.cutting_completed_at is not null then 1 else null end) = count(oi.id) then 'done'
        when count(case when oi.cutting_completed_at is not null then 1 else null end) > 0 then 'in_progress'
        else 'pending'
      end as cutting_status,
      coalesce(sum(sa_agg.sewn_qty), 0)::numeric as sewing_completed_pcs,
      case
        when coalesce(sum(oi.qty), 0) = 0 then 'pending'
        when coalesce(sum(sa_agg.sewn_qty), 0) >= coalesce(sum(oi.qty), 0) then 'done'
        when coalesce(sum(sa_agg.sewn_qty), 0) > 0 then 'in_progress'
        else 'pending'
      end as sewing_status,
      coalesce(sum(sa_agg.qc_passed_qty), 0)::numeric as qc_passed_pcs,
      case
        when coalesce(sum(oi.qty), 0) = 0 then 'pending'
        when coalesce(sum(sa_agg.qc_passed_qty), 0) >= coalesce(sum(oi.qty), 0) then 'done'
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
      completed_at = v_now,
      notes = coalesce(notes, '') || ' (Otomatis saat PO ditutup)'
    where order_id = v_order_rec.id and stage = 'rekap';
  end loop;

  -- 9. Catat event 'closed'
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
    'closed',
    case when v_is_early then p_close_early_reason else 'PO ditutup normal' end,
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


-- ----------------------------------------------------------------------------
-- 3. get_po_close_report
-- ----------------------------------------------------------------------------
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

  -- Hitung Matriks Sales x Kategori untuk PO ini
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
    left join public.product_categories pc on pc.id = oi.category_id
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
      coalesce(sum(case when oi.cutting_completed_at is not null then oi.qty else 0 end), 0)::numeric as cutting_completed_pcs,
      case
        when count(oi.id) = 0 then 'pending'
        when count(case when oi.cutting_completed_at is not null then 1 else null end) = count(oi.id) then 'done'
        when count(case when oi.cutting_completed_at is not null then 1 else null end) > 0 then 'in_progress'
        else 'pending'
      end as cutting_status,
      coalesce(sum(sa_agg.sewn_qty), 0)::numeric as sewing_completed_pcs,
      case
        when coalesce(sum(oi.qty), 0) = 0 then 'pending'
        when coalesce(sum(sa_agg.sewn_qty), 0) >= coalesce(sum(oi.qty), 0) then 'done'
        when coalesce(sum(sa_agg.sewn_qty), 0) > 0 then 'in_progress'
        else 'pending'
      end as sewing_status,
      coalesce(sum(sa_agg.qc_passed_qty), 0)::numeric as qc_passed_pcs,
      case
        when coalesce(sum(oi.qty), 0) = 0 then 'pending'
        when coalesce(sum(sa_agg.qc_passed_qty), 0) >= coalesce(sum(oi.qty), 0) then 'done'
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
-- 4. get_po_monthly_report
-- ----------------------------------------------------------------------------
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
  v_sales_cat_mat  jsonb := '[]'::jsonb;
  v_unlinked_pw    numeric := 0;
  v_unlinked_mat   numeric := 0;
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
  v_crossing_pos   text;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_month not between 1 and 12 then
    raise exception 'Bulan tidak valid (1-12)' using errcode = 'P0001';
  end if;

  v_month_name := v_month_names[p_month];

  -- 1. Daftar per PO dalam bulan laporan
  select coalesce(jsonb_agg(po_row), '[]'::jsonb) into v_po_batches
  from (
    select
      pb.id::text as batch_id,
      pb.code,
      pb.name,
      null::integer as seq_in_month,
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
        sr.po_batch_id,
        coalesce(sum(sub_m.item_cost), 0)::numeric as total_material_cost
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
      where sr.user_id = v_uid and sr.po_batch_id is not null
      group by sr.po_batch_id
    ) mat on mat.po_batch_id = pb.id
    where pb.user_id = v_uid
      and pb.period_year = p_year
      and pb.period_month = p_month
    order by pb.start_date asc
  ) po_row;

  -- 1b. Matriks Sales x Kategori Produk untuk Bulan ini
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_sales_cat_mat
  from (
    select
      s.id::text as sales_id,
      coalesce(s.name, 'Tanpa Sales') as sales_name,
      coalesce(pc.name, 'Tanpa Kategori') as category_name,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(oi.qty * oi.price), 0)::numeric as total_price
    from public.orders o
    join public.po_batches pb on pb.id = o.po_batch_id
    left join public.sales s on s.id = o.sales_id
    join public.order_items oi on oi.order_id = o.id
    left join public.product_categories pc on pc.id = oi.category_id
    where o.user_id = v_uid
      and pb.period_year = p_year
      and pb.period_month = p_month
    group by s.id, s.name, pc.name
    order by s.name asc, pc.name asc
  ) sub;

  -- 2. Upah Borongan tanpa order_id
  select coalesce(sum(pt.total_wage), 0)::numeric into v_unlinked_pw
  from public.piecework_tasks pt
  where pt.user_id = v_uid
    and pt.order_id is null
    and pt.status = 'approved'
    and extract(year from coalesce(pt.completed_at, pt.created_at)) = p_year
    and extract(month from coalesce(pt.completed_at, pt.created_at)) = p_month;

  -- 2b. Pembelian Bahan tanpa PO
  select coalesce(sum(sub_unlinked.item_cost), 0)::numeric into v_unlinked_mat
  from (
    select pri.quantity * pri.unit_price as item_cost
    from public.purchasing_report_items pri
    join public.purchasing_reports pr on pr.id = pri.report_id
    left join public.stock_requests sr on sr.id = pri.stock_request_id
    where pr.user_id = v_uid
      and pr.status not in ('rejected', 'cancelled')
      and extract(year from pr.report_date) = p_year
      and extract(month from pr.report_date) = p_month
      and (pri.stock_request_id is null or sr.po_batch_id is null)
    union all
    select spi.quantity * spi.unit_price as item_cost
    from public.supplier_purchase_items spi
    join public.supplier_purchases sp on sp.id = spi.purchase_id
    left join public.stock_requests sr on sr.id = spi.stock_request_id
    where sp.user_id = v_uid
      and extract(year from sp.payment_date) = p_year
      and extract(month from sp.payment_date) = p_month
      and (spi.stock_request_id is null or sr.po_batch_id is null)
  ) sub_unlinked;

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

  -- Periksa seluruh PO pada bulan ini yang melintasi books_start_date (2026-11-01)
  select string_agg(pb.name, ', ') into v_crossing_pos
  from public.po_batches pb
  where pb.user_id = v_uid
    and pb.period_year = p_year
    and pb.period_month = p_month
    and pb.start_date < '2026-11-01'::date
    and pb.end_date >= '2026-11-01'::date;

  if v_crossing_pos is not null then
    v_recon_notes := v_recon_notes || ' Catatan: Batch PO (' || v_crossing_pos || ') melintasi books_start_date (2026-11-01) sehingga jurnal pengakuan pendapatan untuk PO tersebut hanya tercatat sebagian.';
  end if;

  return jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'month_name', v_month_name,
    'po_batches', v_po_batches,
    'sales_category_matrix', v_sales_cat_mat,
    'unlinked_piecework_wage', v_unlinked_pw,
    'unlinked_material_purchases', v_unlinked_mat,
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
