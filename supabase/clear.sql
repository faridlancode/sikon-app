-- =========================================================================
-- SIKon — CLEAR (kosongkan semua data, TIDAK menyentuh auth.users/login)
-- =========================================================================
-- Struktur tabel, RLS, function, trigger, view — semuanya TETAP UTUH.
-- Cuma isi datanya yang dikosongkan. Akun login (auth.users) & company_settings
-- milik owner ikut kosong juga (company_settings itu "data", bukan "struktur")
-- — jalankan seed.sql lagi setelah ini kalau mau data contoh balik lagi.
--
-- TRUNCATE ... CASCADE dalam SATU statement otomatis menangani urutan FK,
-- tidak perlu DELETE manual per tabel berurutan.
-- =========================================================================

truncate table
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
cascade;
