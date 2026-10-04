# ⚙️ Arsitektur Teknis — SIKon App

Mencakup: Stack Teknologi, Database, RLS, Trigger, RPC, Storage, Konvensi Kode, dan Known Issues.

---

## 1. Stack Teknologi

| Layer | Teknologi |
|-------|-----------|
| Frontend | React + TypeScript + Vite |
| Styling | TailwindCSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Hosting | Cloudflare Pages (via `wrangler.jsonc`) |

**Tidak ada backend server terpisah.** Semua logika bisnis ada di Postgres (trigger + RPC) dan dipanggil langsung dari frontend via Supabase client.

---

## 2. Pola Umum Database

### 2.1 Single-Tenant

- Semua tabel punya kolom `user_id`
- RLS policy: `auth.uid() = user_id` dengan policy `FOR ALL`
- Aplikasi ini **single-tenant** — satu perusahaan, satu akun owner

### 2.2 GRANT ke `authenticated`

> ⚠️ **Jebakan klasik!** Postgres mengecek GRANT tabel **dulu**, baru RLS.

Tanpa `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ... TO authenticated`, akan muncul error `42501 permission denied` walau RLS sudah benar.

- Migration `...0006_grant_table_privileges` memberi grant untuk 27 tabel dasar
- `ALTER DEFAULT PRIVILEGES ... GRANT ... ON TABLES TO authenticated` untuk tabel baru otomatis dapat grant
- Jika masih kena `42501` di tabel baru, cek apakah tabel dibuat oleh role yang sama

### 2.3 Fungsi Internal vs RPC Publik

| Tipe | GRANT | Dipakai oleh |
|------|-------|-------------|
| Fungsi trigger | `REVOKE EXECUTE FROM ALL` | Hanya trigger |
| RPC untuk frontend | `GRANT EXECUTE TO authenticated`, `REVOKE FROM public, anon` + `SECURITY DEFINER SET search_path = public` + cek `auth.uid()` | Frontend via `supabase.rpc(...)` |

### 2.4 Prinsip Snapshot

**Harga, tarif, dan konversi satuan disalin ke baris transaksi saat kejadian berlangsung.** Data historis tidak berubah walau master diubah belakangan.

Contoh snapshot:
- `order_items.hpp_per_unit_snapshot` — HPP saat order dibuat
- `order_item_fabrics.price` — harga kain saat order dibuat
- `sewing_assignments.applied_sewing_rate` — tarif jahit saat bundel dibuat
- `piecework_tasks.rate_per_unit` — tarif saat task dibuat
- `payroll_items.daily_rate` — tarif harian saat payroll dibuat

---

## 3. Konvensi Migrasi

### 3.1 Aturan Wajib

1. **Setiap perubahan skema** (tabel, kolom, function, constraint, RLS) = file baru di `supabase/migrations/`
2. **Format nama:** `<YYYYMMDDHHMMSS>_<deskripsi_snake_case>.sql`
3. **Jangan pernah edit migration lama.** Buat file baru walau cuma 1 kolom.
4. **Buat idempotent:** `IF NOT EXISTS`, `DROP POLICY IF EXISTS`
5. **1 migration = 1 tujuan.** Dua perubahan berbeda = dua file
6. Perhatikan **urutan FK** saat membuat tabel baru

### 3.2 Update seed.sql & clear.sql

Setiap migration baru yang menambah tabel wajib update:
- **`clear.sql`:** tambah tabel baru ke daftar `TRUNCATE`
- **`seed.sql`:** tambah data contoh yang berhenti di status "siap diproses" (draft/pending/ordered)

Setelah update: **wajib dites** dengan jalankan `clear.sql` lalu `seed.sql` di DB dev.

---

## 4. Storage (Upload File)

| Bucket | Dipakai oleh | Isi |
|--------|-------------|-----|
| `company-assets` | Halaman `/perusahaan` | Logo, stempel, tanda tangan |
| `purchasing-receipts` | Halaman `/purchasing` | Foto nota belanja SPJ |

**Aturan:**
- Kedua bucket **public read** (supaya tampil di dokumen cetak tanpa signed URL)
- **Path wajib:** `{auth.uid()}/nama-file`
- Policy tulis/ubah/hapus hanya untuk pemilik folder

---

## 5. Daftar Tabel Database

### 5.1 Master Data

| Tabel | Isi |
|-------|-----|
| `company_settings` | Profil perusahaan, saldo awal, URL aset |
| `company_bank_accounts` | Rekening bank perusahaan |
| `staff` | Data karyawan |
| `sales` | Data salesperson |
| `product_categories` | Kategori produk |
| `products` | Master produk |
| `product_materials` | BOM aksesori per produk |
| `product_fabric_slots` | Slot kain per produk |
| `material_categories` | Kategori material |
| `materials` | Master bahan baku |
| `material_colors` | Varian warna per material |

### 5.2 Order & Keuangan

| Tabel | Isi |
|-------|-----|
| `orders` | Header order |
| `order_items` | Item per order |
| `order_item_fabrics` | Snapshot kain per item |
| `order_payments` | Pembayaran DP/pelunasan |
| `transactions` | Semua transaksi keuangan |
| `transaction_categories` | Kategori income/expense |
| `order_stage_events` | Timeline milestone per order |
| `stage_work_logs` | Log produktivitas Finishing/QC/Packaging |

### 5.3 Gudang & Purchasing

| Tabel | Isi |
|-------|-----|
| `stock_movements` | Semua pergerakan stok |
| `stock_requests` | Pengajuan restock dari Gudang |
| `cash_advances` | Uang muka staf purchasing |
| `purchasing_reports` | Laporan SPJ |
| `purchasing_report_items` | Baris item per SPJ |
| `supplier_purchases` | Pembelian Direct Supplier |
| `supplier_purchase_items` | Baris item per supplier purchase |
| `material_defect_returns` | Retur material cacat |

### 5.4 Produksi

| Tabel | Isi |
|-------|-----|
| `cutting_assignments` | Penugasan potong per item |
| `sewing_distribution_batches` | Jejak audit setiap "Bagikan Kerja" |
| `sewing_assignments` | Bundel jahit per penjahit per item |
| `qc_checks` | Log pemeriksaan QC per bundel |

### 5.5 Payroll

| Tabel | Isi |
|-------|-----|
| `piecework_tasks` | Tugas borongan (cutting/sewing) |
| `weekly_payrolls` | Header payroll mingguan |
| `payroll_items` | Detail gaji per staf per payroll |

### 5.6 Legacy (Jangan Dipakai untuk Fitur Baru)

| Tabel | Status |
|-------|--------|
| `cutting_weekly_reports` | Desain potong lama, sudah digantikan event-driven |
| `cutting_report_lines` | Sama seperti di atas |

---

## 6. Views Database

| View | Isi |
|------|-----|
| `orders_with_balance` | Order + grand_total + paid_amount + remaining_amount |
| `sales_performance` | Agregat per sales: order, revenue, piutang |

> ⚠️ **Jika menambah kolom ke `orders`:** cek apakah `orders_with_balance` perlu diupdate. Pernah ketinggalan kolom `production_status` dan `bonus_paid`.

---

## 6a. Status Verifikasi terhadap Database Live

*Pengecekan sebelumnya dilakukan lewat Supabase connector ke project `sikon-app-dev` (`xdojtfhkflbfuwmcjpwe`), bukan cuma baca file migration lokal. Untuk perubahan 2026-10-04, koneksi connector tidak tersedia dan Supabase CLI tidak terpasang, jadi status migration remote belum diverifikasi.*

- **Pengecekan sebelumnya menemukan 33 migration di database live cocok persis** dengan file lokal pada saat itu. Migration tambahan setelah pengecekan tersebut belum diverifikasi di database live. Daftar lengkap tiap migration (nama, isi, urutan) ada di `supabase/DATABASE.md`, dijaga sebagai satu-satunya daftar; jangan duplikasi daftar itu di sini.
- **Data di database dev bukan hasil `seed.sql`.** Jumlah baris tidak cocok dengan isi seed (lebih banyak staf, dll.), dan `stock_movements` live tidak punya baris `source_type = 'initial'`/`'purchasing'` yang ada di `seed.sql` lama — konsisten dengan dugaan seed belum pernah berhasil jalan di project ini. `supabase/seed.sql` **sudah diperbaiki** (6 baris `source_type` diganti ke nilai yang valid) tapi **belum diuji benar-benar jalan** end-to-end.
- Dokumen non-developer yang juga ada di `docs/` tapi beda audiens, tidak perlu dilebur ke sini: `PANDUAN_PENGGUNA.md` + `.docx` (manual pengguna PT Mad Ali Indonesia) dan `docs/screenshots/`.

---

## 7. Known Issues & Hal yang Perlu Diperhatikan

### 7.1 Bug Aktif

| # | Masalah | Dampak |
|---|---------|--------|
| 1 | ~~`seed.sql` kemungkinan gagal karena `stock_movements_source_type_check` tidak menerima nilai `initial`/`purchasing`~~ — **sudah diperbaiki** di `supabase/seed.sql` (`initial`→`manual`, `purchasing`→`purchasing_report`), belum diuji jalan | Rendah kalau fix sudah dipasang; cek dulu kalau masih error saat `seed.sql` dijalankan |
| 2 | `approve_stock_request_spj` tidak menerima status `approved` | Request SPJ yang di-bulk-approve tidak bisa dilanjutkan |
| 3 | `process_defect_material_return` hanya baca `materials.stock_qty` | Retur material berwarna (sleting/kancing) bisa salah baca stok |
| 4 | `orders_with_balance` mungkin ketinggalan kolom baru dari `orders` | View bisa return data tidak lengkap |
| 5 | Error yang dilaporkan saat `confirm_stock_movement` memiliki overload satu parameter dan overload tiga parameter dengan default | PostgREST gagal memilih RPC (`PGRST203`); migration `20261004223400_drop_legacy_confirm_stock_movement_overload.sql` menghapus overload lama, tetapi penerapan ke database live belum diverifikasi |

### 7.2 Kode yang Perlu Dibersihkan

| File | Masalah |
|------|---------|
| `src/hooks/usePurchaseReceipts.ts` | Memanggil RPC `pay_purchase_receipt` yang sudah tidak ada di DB. Tidak diimpor di mana pun, tapi berisiko jika digunakan kembali |

### 7.3 Hal yang Perlu Diketahui (Bukan Bug)

1. `approved_by` di `stock_requests` diisi **ID staf purchasing** yang ditunjuk, bukan orang Finance yang menyetujui
2. `pay_weekly_payroll` menandai **semua** task `completed` tanpa filter periode (disengaja)
3. `orders.order_type` tidak diisi trigger — frontend yang harus mengisinya
4. `GRANT` eksplisit hanya untuk 27 tabel baseline; tabel baru bergantung pada `ALTER DEFAULT PRIVILEGES`
5. RPC `pay_salary` (lama) masih ada di DB berdampingan dengan `pay_weekly_payroll`. Jangan gunakan yang lama.

---

## 8. Aturan Kerja untuk Developer / AI Agent

1. **Update `README.md`** jika menambah fitur atau mengubah logika bisnis
2. **Update dokumentasi** di folder `docs/` yang relevan
3. **Setiap perubahan skema = migration baru**, jangan edit yang lama
4. **Ragu soal keputusan bisnis?** Berhenti dan tanya pemilik — jangan assume
5. **Sebelum menulis RPC stok baru,** selalu gunakan rumus stok efektif untuk material berwarna (lihat `GUDANG_DAN_PURCHASING.md §3.3`)
6. **Tidak ada backend server** — semua logika multi-tabel harus atomik di Postgres (RPC)
7. **Periksa `orders_with_balance`** setiap kali menambah kolom ke tabel `orders`
8. **Dokumen arsip** (`docs/arsip/`) adalah referensi SQL lengkap — tidak perlu dibaca rutin, tapi berguna saat debugging
