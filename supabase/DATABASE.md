# Database — Referensi Migration, Seed, dan Clear

Dokumen ini merangkum 35 file migration, `seed.sql`, dan `clear.sql`. Penjelasan fitur ada di `01`–`03`; aturan memperbarui dokumen ada di `AGENT_INSTRUCTIONS.md`.

**Ringkasan:** 78 migration, 53 tabel (semua RLS `auth.uid() = user_id`, single-tenant), 2 view, banyak RPC dan trigger.

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
| 37 | `20261008064500_accounting_coa_hardening` | Hardening COA: FK NO ACTION, trigger guard izinkan cascade auth.users, check books_start_date & locked_through, revoke anon |
| 38 | `20261008070000_accounting_journal_core` | Tabel `journal_entries`, `journal_lines`, constraint trigger `trg_journal_balanced` (deferred), helper `next_journal_entry_no`, RPC `post_journal_entry`, `reverse_journal_entry` |
| 39 | `20261008080000_accounting_patch_spj_and_payment_rpc` | Patch `approve_purchasing_report` (Reversal Uang Muka + `counter_account_id`, Jasa Purchasing + `category_id`), patch `record_order_payment` (`cash_account_id` dari metode) |
| 40 | `20261008090000_accounting_auto_journal_transactions` | Fungsi internal `post_transaction_journal(p_txn_id)`, trigger `trg_journal_from_transaction`, RPC `init_accounting` (seed COA 33 akun, petakan kategori, aktifkan, backfill) |
| 41 | `20261008100000_accounting_opening_balance_and_ledger_reports` | RPC `suggest_opening_balance`, `post_opening_balance`, `get_trial_balance`, `get_general_ledger` |
| 42 | `20261008110000_fix_orders_with_balance_missing_columns` | View `orders_with_balance` dan `sales_performance` dengan daftar kolom eksplisit, tambah `order_type` + `is_order_type_manual_override` di posisi akhir |
| 43 | `20261008120000_order_deposit_releases` | Tabel `order_deposit_releases`, trigger `trg_journal_order_forfeit` (after insert), update `recompute_order_status` (paid bersih), update `delete_order_payment` (aturan keras 13), RPC `release_order_deposit`, `delete_order_deposit_release`, view `paid_amount` jadi bersih |
| 44 | `20261008130000_order_delete_guard` | Trigger `trg_guard_order_delete` (aturan keras 11), RPC `delete_order` (atomik: cek + batalkan stok pending/permintaan auto + hapus) |
| 45 | `20261010062000_fix_cascade_order_delete_stage_sync` | Penjaga cascade delete orders pada trigger timeline stage: `sync_potong_stage`, `sync_potong_stage_from_ca`, dan `sync_jahit_stage` lewati upsert `order_stage_events` jika order induk sudah tidak ada |
| 46 | `20261010070000_accounting_order_revenue_recognition` | Trigger `trg_journal_order_revenue` (pengakuan pendapatan order completed, debit 2-1200 & 1-1300, kredit 4-1000 & 4-1100) |
| 47 | `20261010080000_accounting_payroll_split` | Trigger `trg_journal_payroll_split` (reklasifikasi upah borongan payroll paid, debit 5-1100, kredit 6-1000) |
| 48 | `20261010090000_accounting_period_close_inventory` | Tabel `inventory_valuations`, fungsi `acc_inventory_value`, RPC `close_accounting_period`, `reopen_accounting_period`, `get_close_preview` |
| 49 | `20261010100000_accounting_financial_reports` | Index performa jurnal, RPC `get_income_statement`, `get_balance_sheet`, `get_accounting_checks` |
| 50 | `20261012080000_accounting_fixed_assets_schema` | Fase C1: Tabel `fixed_assets`, `fixed_asset_depreciations`, constraint `asset_opening`, RPC `register_fixed_asset`, `delete_fixed_asset` |
| 51 | `20261012090000_accounting_depreciation_and_disposal` | Fase C2: Redefinisi `close_accounting_period` (penyusutan bulanan), `reopen_accounting_period`, RPC `dispose_fixed_asset`, `undo_dispose_fixed_asset`, `get_accounting_checks` (tambah FIXED_ASSET_MATCH & DEPRECIATION_DUE) |
| 52 | `20261012100000_accounting_fixed_assets_views_and_preview` | Fase C UI & Helper: Fungsi internal `acc_depreciation_due`, update `close_accounting_period`, update `get_close_preview` (preview penyusutan), RPC `get_fixed_asset_register` |
| 53 | `20261014100000_accounting_fixed_assets_and_period_close_fixes` | Perbaikan integritas Fase C: penyusutan tuntas tanpa sisa di bulan terakhir masa manfaat tanpa melampaui dasar susut, `delete_fixed_asset` menolak aset disposed dengan pesan spesifik, `close_accounting_period` tanpa jurnal penyesuaian bila selisih persediaan nol, kategori 'Pembelian Aset Tetap' terkunci ke akun 1-2100, RPC baru `update_fixed_asset_info` (hanya ubah nama & catatan tanpa angka) |
| 54 | `20261015090000_document_counters` | Tabel `document_counters` (penghitung nomor per user, jenis dokumen, dan periode YYYYMM), fungsi internal `generate_document_no` (format `PREFIX-YYYYMM-NNNN` atomik) |
| 55 | `20261015100000_quotations` | Tabel `quotations` (Surat Penawaran) & `quotation_items` (rincian item tanpa kolom HPP, `subtotal` computed stored), RLS select-only |
| 56 | `20261015110000_quotation_rpcs` | RPC `save_quotation` (atomik header & items), `set_quotation_status`, `delete_quotation` (guard penawaran ber-order), `link_quotation_to_order` |
| 57 | `20261015120000_quotation_item_references` | Kolom referensi terstruktur pada `quotation_items` (`category_id`, `product_id`, `material_id`, `material_color_id`, `fabric_specs`) dan pembaruan RPC `save_quotation` |
| 58 | `20261016080000_invoices` | Tabel `invoices` (Invoice: DP, Pelunasan, Penuh) & `invoice_items` (`subtotal` & `grand_total` computed stored), RLS select-only |
| 59 | `20261016090000_invoice_rpcs` | RPC `save_invoice`, `set_invoice_status`, `delete_invoice` (khusus draft), `create_invoice_from_quotation`, `create_invoice_from_order` (snapshot mandiri) |
| 60 | `20261016100000_invoice_parent_and_automation` | Otomasi Invoice Zero-Orphan: invoice wajib menempel ke penawaran atau pesanan, automasi kelahiran invoice di `save_quotation` & pembuatan order, trigger auto-sinkron pembayaran `trg_sync_order_invoice_on_payment`, auto-mark DP paid saat linking |
| 61 | `20261017070000_invoice_remove_fabric_specs` | Penyederhanaan deskripsi item invoice: hanya menampilkan nama kain dan warna tanpa spesifikasi teknis kain |
| 62 | `20261017080000_receipts_notas` | Tabel `receipts` (Kwitansi) dan `notas` (Nota Pesanan Lunas), constraint cascade, unique constraint per user, dan RLS select-only authenticated |
| 63 | `20261017090000_receipt_trigger` | Trigger otomatis kwitansi `fn_auto_create_receipt` (security definer, internal) `AFTER INSERT ON order_payments` + backfill data pembayaran existing |
| 64 | `20261017100000_nota_rpc` | RPC `get_or_create_nota` (atomik, validasi status lunas, penguncian snapshot items, payments, dan ongkir ke JSON) |
| 65 | `20261018080000_accounting_r2_reports` | Fase R2 (Laporan Keuangan Lanjutan): RPC `get_cash_flow` (metode langsung dari jurnal akun kas/bank, eliminasi mutasi kas-bank net nol, klasifikasi operasi/investasi/pendanaan), `get_equity_changes` (ekuitas awal, laba bersih, setoran modal, prive, koreksi laba ditahan, rekonsiliasi total_equity neraca), `get_report_notes` (catatan atas laporan keuangan: kas & bank, persediaan fisik & buku, uang muka pelanggan/staf, jadwal penyusutan aset tetap, dan hutang) |
| 66 | `20261019090000_po_batches_core` | Fase 1a: Tabel `po_batches` dan `po_batch_events`, constraint status & period, RLS |
| 67 | `20261019100000_orders_po_batch_link` | Fase 1b: Foreign key `orders.po_batch_id`, backfill order lama, trigger penugasan PO, update `orders_with_balance` |
| 68 | `20261019110000_po_batch_close_reopen` | Fase 1c: Trigger proteksi item closed PO, RPC `close_po_batch`, `reopen_po_batch`, `list_po_batches`, kolom `company_settings.po_gate_production`, revisi `delete_order` |
| 69 | `20261019120000_po_reports_rpcs` | Fase 2: RPC `get_po_daily_report`, `get_po_close_report`, `get_po_monthly_report` |
| 70 | `20261020090000_po_flexible_crud` | REVISI 1 (R1): Batch PO Fleksibel — kolom `name`, `quota_qty`, `note`; sequence `po_batch_code_seq`; RPC `create_po_batch`, `update_po_batch`, `delete_po_batch`, `list_po_batches_summary`; cabut `get_current_po` & `ensure_po_batch`; fallback order trigger tolak bila tidak ada PO terbuka; pembaruan `close_po_batch` (syarat early close `< end_date`), `orders_with_balance` (`po_name` di akhir), `get_po_daily_report` (array `pos`), dan `get_po_monthly_report` |
| 71 | `20261021090000_po_gate_purchasing_link` | Fase 3a: Gate Produksi Hibrida & Stock Requests Link — kolom `orders.released_early_at` (`orders_with_balance` di akhir); `stock_requests.po_batch_id` + trigger otomatis dari order + backfill; event `rekap_early`; gerbang lunak di `toggle_order_stage`; RPC `release_order_early`; revisi `close_po_batch` (bypass lokal & skip order early); revisi `delete_po_batch` (tolak jika punya `stock_requests`); RPC `get_po_purchase_list` |
| 72 | `20261021110000_po_monthly_report_purchasing_link` | Fase 4: Atribusi Pembelian Bahan Baku di Laporan Bulanan (per item via `stock_requests.po_batch_id`), pemisahan `unlinked_material_purchases` & `unlinked_piecework_wages`, dan blok rekonsiliasi dinamis buku akuntansi |
| 73 | `20261021120000_cleanup_legacy_po_artifacts` | Pembersihan Sisa Batch PO: drop fungsi deprecated `po_week_info(date)` dan drop kolom `seq_in_month` dari `po_batches` |
| 74 | `20261022090000_po_reports_matrix_and_progress` | Matriks rekap PO bulanan dan progress batch PO |
| 75 | `20261022100000_fix_po_reports_category_and_unpaid_details` | Perbaikan pemetaan kategori dan rincian unpaid PO |
| 76 | `20261024100000_financial_cashflow_cleanup_and_purchase_details` | Pembersihan arus kas buku kas (pengecualian reversal uang muka dan netting kasbon selesai) + kolom `purchasing_report_id`, `supplier_purchase_id`, `items_summary` pada `transactions`, patch RPC `approve_purchasing_report` & `approve_stock_request_supplier`, serta RPC `get_transaction_purchase_items` (Opsi 3 rincian belanja gabungan) |
| 77 | `20261024113000_fix_approve_stock_request_supplier_signature` | Perbaikan nama parameter `p_payment_date` pada RPC `approve_stock_request_supplier` agar cocok dengan PostgREST dan frontend (mengatasi 404), serta perbaikan pembacaan kolom `sp.payment_date` pada `get_transaction_purchase_items` |
| 78 | `20261026231500_guard_sewing_qc_check_quantity` | Validasi ketat kuota pemeriksaan QC jahit (lolos dan reject tidak boleh melebihi sisa bundel jahit yang belum diperiksa) pada RPC `record_qc_check` |

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

`TRUNCATE ... CASCADE` untuk **51 tabel** dalam satu statement (urutan FK ditangani otomatis). Sudah sinkron dengan migration, termasuk tabel akuntansi dan dokumen order baru (`accounts`, `accounting_settings`, `journal_entries`, `journal_lines`, `order_deposit_releases`, `inventory_valuations`, `fixed_assets`, `fixed_asset_depreciations`, `document_counters`, `quotations`, `quotation_items`, `invoices`, `invoice_items`, `receipts`, `notas`).

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

---

## Skema Tabel Akhir Batch PO

### `po_batches`
- `id` uuid primary key default gen_random_uuid()
- `user_id` uuid not null references auth.users(id) on delete cascade
- `code` text not null (format `PO-YYYY-NNNN` dari sequence `po_batch_code_seq`, unik per user)
- `name` text not null (nama bebas batch, unik per user case-insensitive via index `unique(user_id, lower(name))`)
- `start_date` date not null, `end_date` date not null (check `end_date >= start_date`, overlap dicegah via trigger/RPC)
- `period_year` integer not null (check 2020–2099)
- `period_month` integer not null (check 1–12)
- `quota_qty` integer null (target kuota pcs, soft warning)
- `note` text null
- `status` text not null default 'open' (check: 'open', 'closed')
- `closed_at` timestamptz null, `closed_by` uuid null references auth.users(id)
- `close_note` text null, `close_early_reason` text null
- `close_snapshot` jsonb null (ringkasan kinerja terkunci saat tutup)
- `reopen_count` integer not null default 0
- `is_legacy` boolean not null default false
- `created_at` timestamptz not null default now()

### `po_batch_events`
- `id` uuid primary key default gen_random_uuid()
- `po_batch_id` uuid not null references po_batches(id) on delete cascade
- `user_id` uuid not null references auth.users(id) on delete cascade
- `event` text not null (check: 'created', 'updated', 'closed', 'reopened', 'rekap_early', 'order_added', 'order_removed')
- `actor_id` uuid null references auth.users(id)
- `payload` jsonb not null default '{}'::jsonb
- `created_at` timestamptz not null default now()

### Kolom Tautan di Tabel Terkait
- `orders.po_batch_id` uuid not null references po_batches(id) on delete restrict (dengan index)
- `orders.released_early_at` timestamptz null (penanda pesanan dilepas lebih awal dari gerbang PO)
- `stock_requests.po_batch_id` uuid null references po_batches(id) on delete set null (otomatis terisi dari `orders.po_batch_id` saat dibuat dari order)
- `company_settings.po_gate_production` boolean not null default false (saklar gerbang produksi hibrida)

