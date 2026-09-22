-- =========================================================================
-- SIKon — Fix: Grant table privileges to `authenticated`
-- =========================================================================
-- Baseline sebelumnya membuat semua tabel + RLS policy, tapi tidak pernah
-- menjalankan GRANT di level tabel. Tanpa GRANT, PostgreSQL menolak akses
-- SEBELUM RLS sempat dievaluasi -> error 42501 "permission denied for
-- table ..." muncul di hampir semua entity, walau policy RLS-nya sendiri
-- sudah benar.
--
-- RLS (auth.uid() = user_id) tetap jadi lapisan isolasi data utama, jadi
-- aman memberi GRANT penuh (SELECT/INSERT/UPDATE/DELETE) ke role
-- `authenticated`. Role `anon` sengaja TIDAK diberi akses karena semua
-- data di app ini memang hanya untuk user yang sudah login.

grant select, insert, update, delete on
  public.product_categories,
  public.material_categories,
  public.materials,
  public.material_colors,
  public.products,
  public.product_materials,
  public.product_fabric_slots,
  public.categories,
  public.sales,
  public.orders,
  public.order_items,
  public.order_item_fabrics,
  public.order_payments,
  public.transactions,
  public.company_settings,
  public.company_bank_accounts,
  public.staff,
  public.stock_movements,
  public.stock_requests,
  public.cash_advances,
  public.purchasing_reports,
  public.purchasing_report_items,
  public.supplier_purchases,
  public.supplier_purchase_items,
  public.weekly_payrolls,
  public.payroll_items,
  public.piecework_tasks
to authenticated;

-- Jaga-jaga supaya tabel baru yang dibuat lewat migration berikutnya (oleh
-- role yang sama dengan yang menjalankan migration ini) otomatis dapat
-- GRANT yang sama, tanpa perlu diingat manual tiap kali.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
