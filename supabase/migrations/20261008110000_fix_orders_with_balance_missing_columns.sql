-- =========================================================================
-- Migration: Fix orders_with_balance - tambah kolom order_type (Fase A - Langkah 6)
-- =========================================================================
-- Masalah: orders_with_balance pada baseline menggunakan "o.*" yang dibekukan saat view dibuat
-- (sebelum kolom order_type dan is_order_type_manual_override ditambahkan).
-- Solusi: create or replace view dengan daftar kolom eksplisit:
-- 16 kolom lama tetap di posisinya (12 kolom orders, sales_name, grand_total, paid_amount, remaining_amount),
-- lalu order_type dan is_order_type_manual_override ditambahkan di akhir (posisi 17 & 18).
-- Hak akses disamakan dengan baseline (hanya authenticated, tanpa anon).
-- =========================================================================

create or replace view public.orders_with_balance
with (security_invoker = true) as
select
  -- 12 kolom dari orders (posisi 1 s/d 12 sama persis dengan baseline)
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
  -- 4 kolom kalkulasi view lama (posisi 13 s/d 16 sama persis dengan baseline)
  s.name as sales_name,
  (o.total_price + o.ongkir) as grand_total,
  coalesce(p.paid_amount, 0) as paid_amount,
  (o.total_price + o.ongkir) - coalesce(p.paid_amount, 0) as remaining_amount,
  -- Kolom baru di akhir agar tidak mengubah nama kolom yang sudah ada (posisi 17 & 18)
  o.order_type,
  o.is_order_type_manual_override
from public.orders o
left join public.sales s on s.id = o.sales_id
left join (
  select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
) p on p.order_id = o.id;

-- Hak akses sama persis dengan baseline
grant select on public.orders_with_balance to authenticated;

-- sales_performance: definisi sama persis dengan baseline
create or replace view public.sales_performance
with (security_invoker = true) as
select
  s.id as sales_id, s.user_id, s.name as sales_name, s.is_active,
  count(o.id) as total_orders,
  coalesce(sum(o.total_price + o.ongkir), 0) as total_revenue,
  coalesce(sum(coalesce(p.paid_amount, 0)), 0) as total_paid,
  coalesce(sum((o.total_price + o.ongkir) - coalesce(p.paid_amount, 0)) filter (where o.status = 'belum_lunas'), 0) as total_outstanding
from public.sales s
left join public.orders o on o.sales_id = s.id
left join (
  select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
) p on p.order_id = o.id
group by s.id, s.user_id, s.name, s.is_active;

-- Hak akses sama persis dengan baseline
grant select on public.sales_performance to authenticated;
