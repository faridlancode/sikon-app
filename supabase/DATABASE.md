# Database — Referensi Migration, Seed, dan Clear

Dokumen ini merangkum 35 file migration, `seed.sql`, dan `clear.sql`. Penjelasan fitur ada di `01`–`03`; aturan memperbarui dokumen ada di `AGENT_INSTRUCTIONS.md`.

**Ringkasan:** 43 migration, 41 tabel (semua RLS `auth.uid() = user_id`, single-tenant), 2 view, banyak RPC dan trigger.

## Riwayat singkat

Per **20260101** (angka penomoran, bukan tanggal kalender asli) riwayat migration lama direset jadi 6 file baseline. Alasannya: migration lama sulit ditelusuri (nama file tidak sesuai isi), ada tabel usang `purchase_receipts`/`purchase_receipt_items` yang sudah digantikan SPJ dan Supplier Purchase, dan ada dua bug kecil (view `orders_with_balance` ketinggalan kolom, grant `check_payroll_period_overlap` terlalu longgar). Setelah itu migration bertambah per fitur. Migration lama sebelum reset hanya ada di riwayat git.

`20260101000006` ada karena baseline awal lupa `GRANT` ke `authenticated`, sehingga semua request kena `42501`.

## Daftar migration (urut jalan)

| # | File | Isi |
|---|---|---|
| 1 | `20260101000001_product_and_material_master_data` | Kategori product/material, materials, material_colors, products, BOM (`product_materials`, `product_fabric_slots`) |
| 2 | `20260101000002_core_financial_and_orders` | Kategori transaksi (saat itu `categories`), sales, orders, order_items, order_item_fabrics, order_payments, transactions, company_settings, rekening bank, trigger/RPC/view inti |
| 3 | `20260101000003_staff_warehouse_purchasing` | staff, stock_movements, stock_requests, cash_advances, SPJ, supplier purchase |
| 4 | `20260101000004_payroll` | weekly_payrolls, payroll_items, piecework_tasks, `pay_weekly_payroll` |
| 5 | `20260101000005_storage` | Bucket `company-assets`, `purchasing-receipts` + policy |
| 6 | `20260101000006_grant_table_privileges` | `GRANT` 27 tabel + `alter default privileges` |
| 7 | `20260922000001_worklog_sewing_cutting` | Distribusi jahit, assignment, QC, potong (versi mingguan, kini legacy) |
| 8 | `20260923000001_rename_categories_to_transaction_categories` | Rename tabel + update 5 RPC |
| 9 | `20260923000002_fix_function_overloading_and_categories_deps` | Hapus overload `create_supplier_purchase` (`PGRST203`), standardisasi `record_order_payment` |
| 10 | `20260923000003_fix_record_order_payment` | Hapus update kolom `paid_amount` yang tidak ada |
| 11 | `20260924000001_revise_cutting_event_driven` | Potong per item event-driven, `assign_cutting_item`, `mark_cutting_item_done` |
| 12 | `20260924000002_order_milestone_timeline` | `order_stage_events`, `stage_work_logs`, sync stage potong/jahit, `toggle_order_stage` |
| 13 | `20260924000003_fix_worklog_potong_and_sewing_start` | Syarat rekap sebelum potong, `start_sewing_assignment` |
| 14 | `20260924000004_fix_distribute_sewing_work_role_filter` | Fix filter role penjahit |
| 15 | `20260924000005_fix_distribute_sewing_column_names` | Fix nama kolom di `distribute_sewing_work` |
| 16 | `20260926000001_warehouse_and_purchasing_flow_improvements` | Kolom approval/sumber di `stock_requests`, `taken_by`/`recorded_by`, `approve/reject_stock_request` |
| 17 | `20260926000002_stock_requests_fulfillment_type_v2` | `fulfillment_type` wajib (`spj`/`supplier_purchase`) |
| 18 | `20260926000003_flow_approval_spj_direct_supplier` | Status SPJ baru, `approve_stock_request_spj/supplier`, konfirmasi terima Gudang |
| 19 | `20260929000001_material_uom_floor_stock_hpp_and_order_milestone` | `brand`/`purchase_unit`/`conversion_rate`, `estimated_price`, `consumables_allowance`, source_type `floor_stock`, fix payroll, gate pelunasan, `production_status` otomatis |
| 20 | `20260930000001_bulk_approve_stock_requests` | `bulk_approve_stock_requests` |
| 21 | `20260930000002_bulk_create_stock_requests` | `batch_id`, `create_bulk_stock_requests` |
| 22 | `20261001100001_material_purchase_uom_snapshots` | `materials.purchase_units` (JSON), snapshot konversi di 3 tabel, `source_line_id` |
| 23 | `20261001100002_convert_purchase_receipts_to_base_units` | Trigger snapshot, penerimaan dalam base unit (`p_base_quantities`) |
| 24 | `20261003130001_product_and_sewing_pricing_tiers` | `order_type`, `price_satuan/prioritas`, `sewing_satuan_surcharge`, `applied_sewing_rate` |
| 25 | `20261003140001_worklog_sewing_prioritas_v2` | `distribute_priority_sewing_order`, fair queue di `staff` |
| 26 | `20261003150001_gudang_dispatch_sewing_materials` | `dispatch_sewing_materials`, `check_sewing_material_stock` |
| 27 | `20261003160001_gudang_retur_material_cacat` | `material_defect_returns`, `process_defect_material_return`, `update_pending_stock_request` |
| 28 | `20261003170001_gate_check_material_sebelum_jahit` | `material_dispatched_at` di jahit, gate di `start_sewing_assignment` |
| 29 | `20261003180001_fix_approve_supplier_accept_approved_status` | Supplier menerima status `approved` |
| 30 | `20261003180002_stock_requests_add_preferred_store` | Kolom `preferred_store` |
| 31 | `20261003180003_patch_bulk_create_add_preferred_store` | Bulk create ikut `preferred_store` |
| 32 | `20261003190001_gate_check_potong_dan_dispatch_kain` | `check/dispatch_cutting_materials`, gate di `mark_cutting_item_done` |
| 33 | `20261003200001_fix_material_color_stock_queries` | Stok efektif material berwarna (hanya jalur jahit) |
| 34 | `20261004223400_drop_legacy_confirm_stock_movement_overload` | Hapus overload satu parameter `confirm_stock_movement` agar PostgREST memilih signature tiga parameter dengan default secara konsisten |
| 35 | `20261006120000_catalog_public_read_rpc` | RPC read-only untuk `anon`: `catalog_list_categories`, `catalog_list_sales`, `catalog_list_products` (dipakai `sikon-catalog`) |
| 36 | `20261008063000_accounting_chart_of_accounts` | Tabel `accounts` (COA + is_cash + cash_flow_activity), `accounting_settings`, kolom `transaction_categories.account_id`, `transactions.cash_account_id`/`counter_account_id`, trigger `guard_accounts_change` |
| 37 | `20261008070000_accounting_journal_core` | Tabel `journal_entries`, `journal_lines`, constraint trigger `trg_journal_balanced` (deferred), helper `next_journal_entry_no`, RPC `post_journal_entry`, `reverse_journal_entry` |
| 38 | `20261008080000_accounting_patch_spj_and_payment_rpc` | Patch `approve_purchasing_report` (Reversal Uang Muka + `counter_account_id`, Jasa Purchasing + `category_id`), patch `record_order_payment` (`cash_account_id` dari metode) |
| 39 | `20261008090000_accounting_auto_journal_transactions` | Trigger `trg_journal_from_transaction` (auto-jurnal dari transaksi), RPC `init_accounting` (seed COA 33 akun, petakan kategori, aktifkan, backfill) |
| 40 | `20261008100000_accounting_opening_balance_and_ledger_reports` | RPC `suggest_opening_balance`, `post_opening_balance`, `get_trial_balance`, `get_general_ledger` |
| 41 | `20261008110000_fix_orders_with_balance_missing_columns` | View `orders_with_balance` dan `sales_performance` dengan daftar kolom eksplisit, tambah `order_type` + `is_order_type_manual_override` |
| 42 | `20261008120000_order_deposit_releases` | Tabel `order_deposit_releases`, trigger `trg_journal_order_forfeit`, update `recompute_order_status` (paid bersih), update `delete_order_payment` (aturan keras 13), RPC `release_order_deposit`, `delete_order_deposit_release`, view `paid_amount` jadi bersih |
| 43 | `20261008130000_order_delete_guard` | Trigger `trg_guard_order_delete` (aturan keras 11), RPC `delete_order` (atomik: cek + batalkan stok/permintaan + hapus) |

## Cara menjalankan

```bash
# Reset data untuk testing ulang (data saja, bukan struktur, bukan akun login):
jalankan clear.sql
jalankan seed.sql

# Project/branch baru dari nol:
jalankan SEMUA file migration berurutan nama file
jalankan seed.sql
```

`clear.sql` sengaja **tidak** menyentuh `auth.users`, supaya siklus clear → seed bisa diulang tanpa login ulang. Reset total (akun + struktur) adalah operasi lain (drop + recreate schema).

`clear.sql` dan `seed.sql` dijalankan lewat SQL Editor/CLI dengan role `postgres`, jadi tidak terpengaruh `GRANT` ke `authenticated`.

## `clear.sql`

`TRUNCATE ... CASCADE` untuk **41 tabel** dalam satu statement (urutan FK ditangani otomatis). Sudah sinkron dengan migration, termasuk tabel akuntansi baru (`accounts`, `accounting_settings`, `journal_entries`, `journal_lines`, `order_deposit_releases`).

## `seed.sql`: cakupan sebenarnya

Satu akun owner, data saling terhubung. Mengisi **30 dari 36 tabel**:

- Master: kategori & material (kain, kancing, resleting, benang) dengan varian warna dan `purchase_units`, produk + BOM + slot kain, `company_settings`, rekening bank.
- Sales & staf: 2 sales (1 juga staf role Sales), staf Purchasing, Gudang, Penjahit, Tukang Potong.
- Order: 2 order dengan item, kain, snapshot HPP, DP, `order_type`.
- Gudang: stok awal, pengajuan `pending` dan `approved`, movement `out` pending.
- Purchasing: SPJ di tiga tahap (`disbursed`, `submitted`, `financially_approved`), 2 supplier purchase `ordered`, uang muka.
- Produksi: `cutting_assignments`, `order_stage_events`, `stage_work_logs`.
- Payroll: piecework `completed`, 1 payroll `draft`.

**Tidak diisi:** `sewing_distribution_batches`, `sewing_assignments`, `qc_checks`, `material_defect_returns`, `cutting_weekly_reports`, `cutting_report_lines`. Artinya halaman `/worklog` tab Beban Penjahit/QC mulai kosong; harus klik "Bagikan Kerja" dulu.

Status sengaja dibiarkan di tahap "siap diproses" supaya tombol approve/terima/bayar bisa langsung dicoba.

## Masalah yang diketahui

1. **Seed kemungkinan gagal di `stock_movements`.** Constraint `source_type` (migration 19) hanya mengizinkan `manual, purchase_receipt, purchasing_report, supplier_purchase, order_consumption, stock_request, floor_stock`. Seed memakai `'initial'` dan `'purchasing'`. Belum dijalankan di Postgres (tidak tersedia di lingkungan saya), jadi ini hasil membaca SQL. Perbaikan minimal: `'initial'` → `'manual'`, `'purchasing'` → `'purchasing_report'`.
2. Tabel baru sesudah migration 6 tidak masuk daftar `GRANT` eksplisit; mereka bergantung pada `alter default privileges`.
3. Ada tabel/fungsi legacy yang sengaja tidak di-drop: `cutting_weekly_reports`, `cutting_report_lines`, `assign_cutting_order`, `submit_cutting_report`, `pay_salary`.

Temuan lain yang menyangkut logika bisnis ada di `00_BACA_DULU.md` §6.

## Yang sengaja tidak dibawa dari riwayat lama

`purchase_receipts`, `purchase_receipt_items`, dan function `pay_purchase_receipt`: iterasi awal alur pembelian, digantikan SPJ dan Supplier Purchase, dan dikonfirmasi belum dipakai di lapangan.
