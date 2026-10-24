-- ============================================================================
-- Migration: 20261021120000_cleanup_legacy_po_artifacts.sql
-- Deskripsi:
-- 1. Drop fungsi deprecated po_week_info(date) yang sudah tidak dipakai.
-- 2. Drop kolom peninggalan seq_in_month dari tabel po_batches.
-- 3. Perbarui list_po_batches_summary dan get_po_monthly_report untuk
--    mengembalikan null::integer as seq_in_month demi kompatibilitas tipe return.
-- ============================================================================

-- 1. Drop fungsi deprecated po_week_info
drop function if exists public.po_week_info(date);

-- Drop varian tanpa argumen jika ada
drop function if exists public.list_po_batches_summary();

-- 2. Drop kolom seq_in_month dari po_batches
alter table public.po_batches drop column if exists seq_in_month cascade;

-- 3. Perbarui list_po_batches_summary (dengan signature asli 3 parameter default)
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
    null::integer as seq_in_month,
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

-- 4. Perbarui get_po_monthly_report
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

  -- 1. Daftar per PO dalam bulan laporan (period_year & period_month pilihan owner)
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

  -- 2. Upah Borongan tanpa order_id (tidak teralokasi ke PO)
  select coalesce(sum(pt.total_wage), 0)::numeric into v_unlinked_pw
  from public.piecework_tasks pt
  where pt.user_id = v_uid
    and pt.order_id is null
    and pt.status = 'approved'
    and extract(year from coalesce(pt.completed_at, pt.created_at)) = p_year
    and extract(month from coalesce(pt.completed_at, pt.created_at)) = p_month;

  -- 2b. Pembelian Bahan tanpa PO (tidak teralokasi ke PO pada bulan laporan)
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
