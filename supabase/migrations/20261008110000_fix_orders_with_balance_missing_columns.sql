-- =========================================================================
-- Migration: Fix orders_with_balance - tambah kolom order_type (Fase A - Langkah 6)
-- =========================================================================
-- Masalah: orders_with_balance menggunakan "o.*" yang dibekukan saat view dibuat
-- (sebelum kolom order_type dan is_order_type_manual_override ditambahkan).
-- Solusi: create or replace view dengan daftar kolom eksplisit, termasuk
-- order_type dan is_order_type_manual_override di akhir.
-- Kolom lama dipertahankan dengan urutan dan ekspresi yang sama persis.
-- =========================================================================

create or replace view public.orders_with_balance
with (security_invoker = true) as
select
  -- Kolom dari orders (eksplisit, urutan sama dengan baseline)
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
  -- Kolom yang ditambahkan migration 20261003130001
  o.order_type,
  o.is_order_type_manual_override,
  -- Kolom kalkulasi view (tidak berubah)
  s.name as sales_name,
  (o.total_price + o.ongkir) as grand_total,
  coalesce(p.paid_amount, 0) as paid_amount,
  (o.total_price + o.ongkir) - coalesce(p.paid_amount, 0) as remaining_amount
from public.orders o
left join public.sales s on s.id = o.sales_id
left join (
  select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
) p on p.order_id = o.id;

-- Pertahankan hak akses
grant select on public.orders_with_balance to authenticated;
grant select on public.orders_with_balance to anon;

-- sales_performance: tidak berubah, tapi perlu create or replace jika ada perubahan dependensi
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

grant select on public.sales_performance to authenticated;
grant select on public.sales_performance to anon;
