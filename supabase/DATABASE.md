# Database — Clean Baseline

Per **20260101** (tanggal penomoran migration, bukan tanggal kalender asli), seluruh riwayat migration SIKon direset dan disusun ulang jadi 5 file bersih. Ini menggantikan ~20 file migration lama yang menumpuk dari iterasi awal (categories → BOM → warehouse → purchasing → payroll), termasuk beberapa migration lama yang isinya tidak sesuai nama filenya.

## Kenapa direset

- Riwayat lama sulit ditelusuri (ada migration bernama sesuai fitur X tapi isinya ternyata fix bug fitur Y).
- Beberapa tabel usang (`purchase_receipts`, `purchase_receipt_items`) masih nyangkut walau sudah tidak dipakai (digantikan alur SPJ & Supplier Purchase) — dibersihkan di baseline ini.
- Ada 2 bug kecil yang baru ketahuan pas proses konsolidasi:
  - View `orders_with_balance` ketinggalan kolom `production_status`/`bonus_paid` (lupa di-update saat kolom itu ditambahkan ke tabel `orders`) — sudah diperbaiki.
  - Function trigger `check_payroll_period_overlap` masih punya EXECUTE grant ke `anon`/`authenticated` (seharusnya cuma dipanggil internal oleh trigger) — sudah di-revoke.

## Struktur file

| File | Isi |
|---|---|
| `20260101000001_product_and_material_master_data.sql` | Kategori product, kategori material, materials, warna material, products, BOM (product_materials, product_fabric_slots) |
| `20260101000002_core_financial_and_orders.sql` | Kategori transaksi, sales, orders, order_items, order_item_fabrics, order_payments, transactions, company settings + rekening bank, semua function/trigger/view inti |
| `20260101000003_staff_warehouse_purchasing.sql` | Staff, stock_movements, stock_requests, cash_advances, SPJ (purchasing_reports), Supplier Purchase |
| `20260101000004_payroll.sql` | Weekly payroll, payroll items, piecework tasks |
| `20260101000005_storage.sql` | Storage bucket `company-assets` & `purchasing-receipts` + policy |
| `seed.sql` | **Jalankan terakhir**, setelah ke-5 file di atas. Bikin akun owner (`owner@sikon.com` / `password123`) + kategori transaksi default. |

## Cara pakai di project/branch baru

1. Jalankan ke-5 file migration di atas **berurutan** (nomornya sudah menjamin urutan dependency FK benar).
2. Jalankan `seed.sql`.
3. Selesai — semua tabel, RLS, function, trigger, view, storage sudah lengkap dan konsisten dengan yang live di project dev (`xdojtfhkflbfuwmcjpwe`) saat ini.

## Yang SENGAJA tidak dibawa dari riwayat lama

- **`purchase_receipts` / `purchase_receipt_items` / function `pay_purchase_receipt`** — iterasi awal alur pembelian, sudah digantikan total oleh SPJ (`purchasing_reports`) dan Supplier Purchase (`supplier_purchases`). Dikonfirmasi belum pernah dipakai di lapangan sebelum dihapus.

## Catatan

- Semua tabel pakai pola RLS yang sama: `auth.uid() = user_id`, single-tenant per user.
- Semua RPC yang di-expose ke `authenticated` (bukan fungsi trigger internal) tetap validasi kepemilikan data di dalam function body sendiri, meski jalan sebagai `SECURITY DEFINER`.
- File migration lama (~20 file, mulai dari `202609150001_...` sampai `20260918233000_...`) sudah tidak ada lagi di folder ini. Kalau butuh referensi historis, cek riwayat git sebelum commit reset ini.
