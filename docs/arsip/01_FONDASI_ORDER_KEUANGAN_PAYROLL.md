# 01 — Fondasi, Order, Keuangan, Staf, Payroll

Rangkuman dari: `AGENT_INSTRUCTIONS`, `DESAIN_FITUR_GRANT_PRIVILEGES`, `DESAIN_FITUR_STORAGE`, `DESAIN_FITUR_ORDER_DAN_KEUANGAN`, `DESAIN_FITUR_PENGGAJIAN`, `RANCANGAN_HARGA_PRODUK_DAN_JAHIT` (bagian harga order), dan bagian staf dari `DESAIN_FITUR_STAF_GUDANG_PURCHASING`.

---

## 1. Aturan kerja (wajib untuk siapa pun yang coding, manusia atau AI)

1. **Update `README.md`** kalau menambah fitur atau mengubah logika bisnis. Isi README = fitur yang *benar-benar jalan*. Persiapan struktur yang belum ada UI-nya masuk ke bagian "Catatan", bukan daftar fitur.
2. **Migration:**
   - Setiap perubahan skema (tabel, kolom, function, constraint, RLS) = file baru di `supabase/migrations/`.
   - Format nama: `<YYYYMMDDHHMMSS>_<deskripsi_snake_case>.sql`.
   - **Jangan pernah edit migration lama.** Buat file baru walau cuma 1 kolom.
   - Buat idempotent (`if not exists`, `drop policy if exists`).
   - 1 migration = 1 tujuan, nama file harus sesuai isi. Dua perubahan berbeda = dua file.
   - Perhatikan urutan FK.
3. **`seed.sql` dan `clear.sql` ikut diupdate** kalau skema berubah (tabel baru masuk `TRUNCATE` di `clear.sql` dan diberi data contoh di `seed.sql`). Setelah itu **wajib dites**: jalankan `clear.sql` lalu `seed.sql` di DB dev. Data contoh alur kerja sebaiknya berhenti di status "siap diproses" (draft/pending/ordered), supaya tombol aksi bisa langsung dicoba.
4. **Keputusan desain besar** ditulis sebagai file `.md` snapshot (bukan living document).
5. **Ragu soal keputusan bisnis? Berhenti dan tanya pemilik.** Sudah beberapa kali terjadi (kapan bonus sales dihitung, SPJ vs supplier) dan selalu lebih baik dikonfirmasi dulu.

---

## 2. Infrastruktur database

### 2.1 Pola umum
- Semua tabel punya `user_id` dan RLS `auth.uid() = user_id` dengan policy `for all`. Aplikasi ini **single-tenant** (satu perusahaan, satu akun owner).
- Role `anon` sengaja tidak diberi akses sama sekali. Semua data hanya untuk user yang login.

### 2.2 GRANT ke `authenticated` (jebakan klasik)
Postgres mengecek **GRANT tabel dulu, baru RLS**. Tanpa `GRANT select, insert, update, delete ... to authenticated`, muncul error `42501 permission denied` walau RLS sudah benar.
- Migration `...0006_grant_table_privileges` memberi grant untuk 27 tabel dasar dan menambah `alter default privileges ... grant ... on tables to authenticated` supaya tabel baru otomatis dapat grant.
- Kalau tetap kena `42501` di tabel baru, cek apakah tabel dibuat oleh role yang sama dengan yang menjalankan migration itu.
- Grant eksplisit hanya mencakup 27 tabel baseline. Tabel dari migration sesudahnya (`sewing_*`, `qc_checks`, `cutting_*`, `order_stage_events`, `stage_work_logs`, `material_defect_returns`) bergantung pada `alter default privileges`. Itu belum saya uji di database.

### 2.3 Fungsi internal vs RPC
- **Fungsi trigger** (mis. `calc_order_item_total`, `check_payroll_period_overlap`) di-`revoke execute` dari semua role. Hanya boleh jalan via trigger.
- **RPC untuk frontend** diberi `grant execute ... to authenticated`, `revoke ... from public, anon`, dan umumnya `security definer set search_path = public` dengan cek `auth.uid()` di awal.

### 2.4 Storage (upload file)
| Bucket | Dipakai | Isi |
|---|---|---|
| `company-assets` | Pengaturan Perusahaan | Logo, stempel, tanda tangan |
| `purchasing-receipts` | SPJ | Foto nota belanja |

- Kedua bucket **public read** (supaya tampil di dokumen cetak tanpa signed URL).
- **Path wajib** `{auth.uid()}/nama-file`. Policy tulis/ubah/hapus hanya untuk pemilik folder.

---

## 3. Staf

Tabel `staff` = master karyawan lintas peran. Kolom `role` adalah teks bebas, **bukan enum**, dan beberapa logika bergantung pada nilai teksnya (hati-hati ejaan).

| `wage_type` | Skema upah | Contoh peran |
|---|---|---|
| `attendance` | Harian × hari hadir | Admin, penjahit tetap |
| `piecework` | Borongan per tugas (`piecework_tasks`) | Penjahit lepas, tukang potong |
| `sales` | Gaji harian + bonus per order | Sales |

Role yang dipakai oleh logika sistem:
- `Gudang`: satu-satunya yang boleh jadi pemohon restock (`requested_by`).
- `Penjahit` / mengandung "jahit" atau "sewing": ikut pembagian kerja jahit (hanya yang `piecework` dan `is_active`).
- `Tukang Potong`: penerima tugas potong (tidak ikut distribusi jahit).
- `Sales`: **wajib** punya `sales_id` (constraint `staff_sales_role_requires_sales_id`). Tabel `sales` tetap jadi sumber kebenaran identitas sales.

Kolom tambahan untuk rotasi adil jahit prioritas: `last_priority_assigned_at`, `priority_orders_count` (lihat 03 §4).

---

## 4. Order, Pembayaran, Keuangan

### 4.1 Dua status order yang **berbeda dimensi**

| Kolom | Arti | Nilai | Cara berubah |
|---|---|---|---|
| `orders.status` | Status **pembayaran** | `belum_lunas`, `lunas` | **Otomatis** (trigger + RPC) |
| `orders.production_status` | Status pengerjaan **ringkas** | `quotation`, `pending`, `production`, `ready`, `completed` | **Otomatis dari timeline** (lihat bawah) |

`production_status` bukan lagi diubah manual. RPC `toggle_order_stage` (migration `20260929000001`) yang menurunkannya:
- **Packaging selesai** → `production` menjadi `ready` (Siap Kirim). Dibatalkan → kembali ke `production`.
- **Kirim selesai** → menjadi `completed`. Dibatalkan → kembali ke `ready`.
- Stage `potong` dan `jahit` **tidak bisa** di-toggle manual (RPC melempar error); keduanya diisi trigger dari data potong/jahit.
- **Gate pelunasan di database:** stage `pelunasan` **dan** `kirim` ditolak kalau `orders_with_balance.remaining_amount > 0`.

Nilai `quotation`/`pending` masih belum punya alur UI (rencana: surat penawaran dan order mandiri sales dengan approval finance). Jangan ditulis seolah sudah jalan.

`bonus_paid`: flag untuk payroll skema sales. Bonus layak cair kalau order `lunas` **dan** pengerjaannya selesai.

### 4.2 Alur order → pembayaran → transaksi

```
Order dibuat ─ trigger generate_order_code ─► order_id "ORD-0001", dst (per user)
     │
order_items ditambah
     ├─ trigger calc_order_item_total  : total_price = qty × price
     └─ trigger sync_order_total_price : orders.total_price = SUM(item)   ← jangan diedit manual
     │
Bayar ─► RPC record_order_payment(order_id, amount, 'dp'|'pelunasan', ...)
     ├─ insert order_payments
     ├─ insert transactions (income, "Pembayaran Order", terhubung ke order_id)
     └─ recompute_order_status → 'lunas' kalau total dibayar ≥ total_price + ongkir
     │
Salah input? ─► RPC delete_order_payment(payment_id)
     └─ hapus order_payments + transactions terkait + recompute status
```

Kenapa RPC, bukan insert langsung? Satu aksi menyentuh `order_payments` **dan** `transactions` plus efek samping. Tanpa backend server, atomicity harus dijaga di Postgres.

### 4.3 Tabel inti

| Tabel | Catatan |
|---|---|
| `orders` | `unique(user_id, order_id)`. Grand total = `total_price + ongkir`. |
| `order_items` | Menyimpan snapshot HPP (`hpp_per_unit_snapshot`, `hpp_total_snapshot`) dan detail bordir. Kolom `bahan` (teks lama) sudah tidak dipakai, dibiarkan nullable. |
| `order_item_fabrics` | Snapshot kain per item: material, warna, qty pakai, harga saat itu, biaya baris. |
| `order_payments` | Tipe `dp`/`pelunasan`, menyimpan `transaction_id` untuk pembatalan. |
| `transactions` | Satu tabel semua pemasukan/pengeluaran, manual maupun otomatis (pembayaran order, SPJ, supplier, payroll). |
| `transaction_categories` | Kategori income/expense. Dulu bernama `categories` (lihat 00 §6 no. 1). |
| `sales` | Master sales, `unique(user_id, name)`. `orders.sales_id` nullable. |
| `company_settings` | Satu baris per user: saldo awal, profil, URL aset. |
| `company_bank_accounts` | Banyak rekening, `is_primary`. |

### 4.4 Views
- `orders_with_balance`: order + nama sales + `grand_total` + `paid_amount` + `remaining_amount` (piutang). **Kalau menambah kolom ke `orders`, cek apakah view ini perlu ikut diupdate** (pernah ketinggalan `production_status`/`bonus_paid`).
- `sales_performance`: agregat per sales (jumlah order, revenue, dibayar, piutang).

### 4.5 Lain-lain
- `update_owner_email(p_new_email)`: ganti email login tanpa konfirmasi email (sengaja, karena internal tool).
- Trigger `recompute_status_on_order_change`: kalau `total_price`/`ongkir` berubah setelah DP masuk, status pembayaran dihitung ulang.

---

## 5. Kategori order dan harga jual (satuan vs prioritas)

*Status: disetujui, checklist implementasi belum dicentang di dokumen sumber.*

- **Kategori dihitung dari total qty semua item** dalam order: `< 6` = `satuan`, `≥ 6` = `prioritas`. Disimpan di `orders.order_type`.
- Otomatis, tapi admin bisa override (`is_order_type_manual_override`). Kalau order diedit dan total qty melewati ambang 6, harga dan tarif dihitung ulang.
- **Di database hanya ada function helper `calculate_order_type(qty)`; tidak ada trigger yang mengisi `orders.order_type`.** Nilainya harus diisi frontend. Migration juga mem-backfill order lama dan mengisi `price_prioritas` dari `default_price`.
- Surcharge satuan disimpan di **`company_settings.sewing_satuan_surcharge`** (default 10000).
- Harga jual produk: `price_prioritas` (harga standar partai) dan `price_satuan` (harga khusus < 6 pcs). Kalau `price_satuan` kosong/0, **fallback ke `price_prioritas`**, lalu ke `default_price`.
- Efek ke upah jahit (surcharge satuan) ada di 03 §5.

---

## 6. Payroll mingguan

### 6.1 Perhitungan per `wage_type`
- **attendance**: `attendance_days × daily_rate`. Kalender kerja **6 hari (Senin–Sabtu)**, aturan ini ada di frontend, bukan constraint DB.
- **piecework**: SUM `piecework_tasks.total_wage` yang `status = 'completed'`. **Diverifikasi di `src/hooks/usePayroll.ts`:** query pembuatan draft payroll mengambil **semua** task `completed` tanpa filter tanggal/periode sama sekali (bukan cuma saat dibayar). Ini **sengaja**, bukan bug: `piecework_tasks` memang tidak punya kolom periode — tugas menumpuk sampai diklaim payroll berikutnya, selaras dengan model susulan cash. Konsekuensinya: kalau ada task `completed` lama yang entah kenapa belum pernah dibayar, dia otomatis ikut masuk ke draft payroll berikutnya kapan pun payroll itu dibuat.
- **sales**: `daily_rate` + bonus per order yang layak cair. Ada `sales_target_qty` per periode dan skema `sales_below_target_scheme` (`none` atau `half` = bonus dipotong setengah kalau di bawah target).

### 6.2 Struktur
```
weekly_payrolls (1 periode = 1 baris, status draft → paid)
   └─ payroll_items (1 baris per staf, snapshot wage_type + semua komponen + take_home_pay)

piecework_tasks (dicatat berkelanjutan, real-time)
   status: pending → completed → paid  |  completed → paid_manual (susulan cash)
```
`piecework_tasks` dibuat saat tugas selesai (potong selesai, jahit lolos QC), **bukan** saat payroll. Saat payroll dibayar, barisnya "diklaim" (link ke `payroll_id`, status `paid`) supaya tidak terhitung dobel.

### 6.3 RPC `pay_weekly_payroll(payroll_id)` — satu klik "Bayar"
1. Tolak kalau sudah `paid`.
2. Cari/buat kategori transaksi "Gaji Karyawan" (expense).
3. Insert **satu** `transactions` untuk total gabungan (bukan per staf, karena kas keluar sekali; rincian per staf ada di `payroll_items`).
4. Tandai `piecework_tasks` milik staf piecework yang masih `completed` jadi `paid`.
5. Set `weekly_payrolls.status = 'paid'` dan simpan `transaction_id`.

### 6.4 Pencegahan payroll dobel
Trigger `check_payroll_period_overlap` menolak periode yang tumpang tindih dengan payroll lain milik user yang sama (mencegah double-klik "Buat Payroll Baru"). Fungsi trigger ini sengaja di-revoke dari role selain trigger.

### 6.5 Bug yang pernah terjadi
Klik "Bayar Payroll" error `relation "public.categories" does not exist`. Penyebab: tabel di-rename jadi `transaction_categories` tapi function payroll masih merujuk nama lama. Perbaikan: arahkan ke `transaction_categories`.

---

## 7. Daftar cepat: trigger & RPC di file ini

| Nama | Jenis | Fungsi |
|---|---|---|
| `calc_order_item_total` | trigger | `total_price = qty × price` |
| `sync_order_total_price` | trigger | `orders.total_price = SUM(items)` |
| `generate_order_code` | trigger | Buat kode `ORD-000N` |
| `recompute_status_on_order_change` | trigger | Hitung ulang status bayar |
| `recompute_order_status` | internal | Set lunas/belum |
| `record_order_payment` | RPC | Catat bayar + income + status |
| `delete_order_payment` | RPC | Batalkan bayar |
| `update_owner_email` | RPC | Ganti email login |
| `pay_weekly_payroll` | RPC | Bayar payroll (atomik) |
| `check_payroll_period_overlap` | trigger | Tolak periode tumpang tindih |
| `calculate_order_type` | function | `< 6` satuan, `≥ 6` prioritas |
