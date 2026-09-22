# Database — Clean Baseline

Per **20260101** (tanggal penomoran migration, bukan tanggal kalender asli), seluruh riwayat migration SIKon direset dan disusun ulang jadi 6 file bersih. Ini menggantikan ~20 file migration lama yang menumpuk dari iterasi awal (categories → BOM → warehouse → purchasing → payroll), termasuk beberapa migration lama yang isinya tidak sesuai nama filenya.

> **Update (`20260101000006`):** ke-5 file baseline awal (`...0001`–`...0005`) ternyata tidak pernah menjalankan `GRANT` di level tabel ke role `authenticated` — cuma bikin tabel + RLS policy. Akibatnya semua request dari FE kena `42501 permission denied` di hampir semua tabel (RLS policy-nya sendiri sudah benar, tapi Postgres cek table-level grant duluan sebelum RLS dievaluasi). File `20260101000006_grant_table_privileges.sql` menambal ini dengan `GRANT SELECT, INSERT, UPDATE, DELETE` ke `authenticated` untuk ke-27 tabel, plus `ALTER DEFAULT PRIVILEGES` supaya tabel baru ke depannya otomatis kebagian grant yang sama.

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
| `20260101000006_grant_table_privileges.sql` | `GRANT SELECT, INSERT, UPDATE, DELETE` ke role `authenticated` untuk ke-27 tabel dasar + `ALTER DEFAULT PRIVILEGES` (baseline `...0001`–`...0005` lupa melakukan ini, hanya RLS policy yang dibuat) |
| `seed.sql` | **Isi SEMUA 27 tabel** dengan data contoh yang saling terhubung (owner, kategori, material+warna, product+BOM, sales+staff, 2 order lengkap dengan item/kain/pembayaran, stok awal, 1 SPJ (submitted), 1 supplier purchase (ordered), 1 payroll (draft) — lihat detail di bawah. |
| `clear.sql` | Kosongkan SEMUA data (`TRUNCATE ... CASCADE`), **tanpa** menghapus akun login (`auth.users`). Struktur/RLS/function/trigger/view tetap utuh. |

## Pola seed / clear (mirip `db:seed` + `db:seed --clear` di framework API)

```bash
# Reset data buat testing ulang dari nol (data doang, bukan struktur & bukan akun login):
jalankan clear.sql
jalankan seed.sql

# Kalau baru setup project/branch baru dari nol (struktur belum ada sama sekali):
jalankan ke-6 file migration berurutan
jalankan seed.sql
```

`clear.sql` sengaja **tidak** menyentuh `auth.users` — supaya siklus clear→seed bisa diulang berkali-kali buat testing tanpa perlu login ulang/reconnect tiap kali. Kalau butuh reset total termasuk akun & struktur (bukan cuma data), itu beda operasi (drop+recreate schema), bukan yang dilakukan `clear.sql` ini.

## Isi `seed.sql` secara detail

Semua data di bawah milik 1 akun owner, saling terhubung (bukan data acak lepas-lepas):

- **Kategori & material**: 3 kategori product (Kemeja/Celana/Rompi), 4 kategori material (Kain=fabric, Kancing, Resleting, Benang), 2 kain (Nagata Drill, American Drill — lengkap komposisi/perawatan) dengan 3 varian warna, 3 aksesoris (kancing, resleting, benang)
- **Product/BOM**: 2 product (Kemeja Series 1, Celana Series 1) lengkap dengan biaya jahit/potong, harga jual default, bonus sales, BOM aksesoris, dan slot kebutuhan kain
- **Sales & Staff**: 2 sales (1 di antaranya sekaligus staf payroll role Sales, mendemonstrasikan link `staff.sales_id`), 4 staf lain (Purchasing, Gudang, Penjahit, Tukang Potong)
- **Order**: 2 order lengkap dari kategori→product→kain→warna, dengan snapshot HPP terhitung, plus pembayaran DP masing-masing (otomatis kebentuk transaksi income terkait)
- **Warehouse**: stok awal masuk (confirmed) untuk semua material, 1 stock request berstatus `pending` (siap di-assign ke SPJ/Supplier Purchase lewat UI)
- **Purchasing**: 1 uang muka (`outstanding`) + 1 SPJ berstatus `submitted` (siap di-klik "Approve" lewat UI buat lihat efeknya), 1 supplier purchase berstatus `ordered` (siap di-klik "Tandai Diterima")
- **Payroll**: 2 piecework task `completed` (siap masuk hitungan payroll), 1 weekly payroll berstatus `draft` (siap di-klik "Bayar")

Status-status di atas sengaja dibiarkan di tahap "siap diproses" (bukan langsung selesai semua) — supaya begitu login, kamu bisa langsung coba tombol approve/terima/bayar di UI dan lihat efeknya, bukan cuma lihat data statis.

## Cara pakai di project/branch baru

1. Jalankan ke-6 file migration di atas **berurutan** (nomornya sudah menjamin urutan dependency FK benar).
2. Jalankan `seed.sql`.
3. Selesai — semua tabel, RLS, function, trigger, view, storage sudah lengkap dan konsisten dengan yang live di project dev (`xdojtfhkflbfuwmcjpwe`) saat ini.

## Yang SENGAJA tidak dibawa dari riwayat lama

- **`purchase_receipts` / `purchase_receipt_items` / function `pay_purchase_receipt`** — iterasi awal alur pembelian, sudah digantikan total oleh SPJ (`purchasing_reports`) dan Supplier Purchase (`supplier_purchases`). Dikonfirmasi belum pernah dipakai di lapangan sebelum dihapus.

## Catatan

- `seed.sql` dan `clear.sql` **tidak terpengaruh** oleh perbaikan grant di `20260101000006` — keduanya dijalankan lewat SQL Editor/CLI dengan role `postgres` yang dari sananya sudah punya semua privilege ke semua tabel, terlepas dari `GRANT` ke `authenticated`. Isinya tidak berubah.
- Semua tabel pakai pola RLS yang sama: `auth.uid() = user_id`, single-tenant per user.
- Semua RPC yang di-expose ke `authenticated` (bukan fungsi trigger internal) tetap validasi kepemilikan data di dalam function body sendiri, meski jalan sebagai `SECURITY DEFINER`.
- File migration lama (~20 file, mulai dari `202609150001_...` sampai `20260918233000_...`) sudah tidak ada lagi di folder ini. Kalau butuh referensi historis, cek riwayat git sebelum commit reset ini.
