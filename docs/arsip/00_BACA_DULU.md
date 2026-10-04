# ⚠️ File Ini Sudah Dipindahkan

> Dokumentasi ini sudah **diperbarui dan dipindahkan** ke struktur baru yang lebih rapi.
>
> **➡️ Mulai dari sini: [README.md](./README.md)**

---

Dokumen baru tersedia di:

| File | Isi |
|------|-----|
| [README.md](./README.md) | Peta, alur besar, glosarium — **baca pertama** |
| [MASTER_DATA.md](./MASTER_DATA.md) | Produk, Material, Staf, Perusahaan, Sales, Kategori |
| [ORDER_DAN_KEUANGAN.md](./ORDER_DAN_KEUANGAN.md) | Order, Pembayaran, Keuangan, Dashboard |
| [GUDANG_DAN_PURCHASING.md](./GUDANG_DAN_PURCHASING.md) | Stok, Restock, SPJ, Supplier, Barang Keluar, Retur |
| [PRODUKSI_DAN_WORKLOG.md](./PRODUKSI_DAN_WORKLOG.md) | Potong, Jahit, QC, Timeline Order |
| [PAYROLL.md](./PAYROLL.md) | Penggajian, Borongan, Bonus Sales, Susulan Cash |
| [ARSITEKTUR_TEKNIS.md](./ARSITEKTUR_TEKNIS.md) | DB, RLS, Trigger, RPC, Storage, Known Issues |

---

*File ini dipertahankan sebagai arsip. Isi lengkap lama ada di bawah ini.*

---

# 00 — Baca Dulu (Peta Dokumentasi SIKon) [ARSIP]

Folder ini adalah **rangkuman** dari 21 dokumen desain lama. Isinya sudah digabung per domain supaya developer baru tidak perlu membuka belasan file untuk memahami satu fitur.

> **Catatan penting:** rangkuman ini disusun dari dokumen desain, dicek ke migration, lalu **dicek ke source code frontend (`src/`) dan database Supabase project `xdojtfhkflbfuwmcjpwe` yang sebenarnya** lewat connector. Kalau ada beda antara dokumen ini dan kode/migration/DB live, **DB live dan source code yang benar**. Temuan selisih ada di bagian 6. Cara menambah atau mengubah dokumen ada di `AGENT_INSTRUCTIONS.md`.
>
> **Status verifikasi Supabase (project `xdojtfhkflbfuwmcjpwe`):** 33 migration di database **persis sama** dengan file di `supabase/migrations/`, jadi seluruh analisis di `DATABASE.md` dan file 01–03 terhadap migration sudah akurat. Data live (11 staf, 2 order, dll.) **bukan** hasil `seed.sql` — jumlah baris tidak cocok dengan isi seed, dan `stock_movements` di DB live tidak punya nilai `source_type` `'initial'`/`'purchasing'` yang ada di `seed.sql`. Kemungkinan besar `seed.sql` belum pernah berhasil dijalankan di project ini; datanya hasil pemakaian manual lewat UI.
>
> **Dokumen lain yang ditemukan di project** (belum masuk rangkuman ini, audiensnya beda): `docs/PANDUAN_PENGGUNA.md` + `PANDUAN_PENGGUNA_SIKON_ERP.docx` — manual pengguna non-teknis (PT Mad Ali Indonesia), dan `docs/screenshots/`. Ini untuk end-user, bukan developer; tidak perlu dilebur ke file 01–03.

---

## 1. Urutan baca (untuk developer baru)

| Urutan | File | Isi | Baca kalau... |
|---|---|---|---|
| 1 | `00_BACA_DULU.md` (ini) | Peta, alur besar, glosarium | Selalu, pertama |
| 2 | `01_FONDASI_ORDER_KEUANGAN_PAYROLL.md` | Aturan kerja, infrastruktur DB, order, pembayaran, keuangan, staf, payroll | Mau menyentuh order, uang, atau gaji |
| 3 | `02_GUDANG_PURCHASING_MATERIAL.md` | Material, stok, restock, SPJ, supplier, barang keluar, retur | Mau menyentuh gudang atau pembelian |
| 4 | `03_PRODUKSI_WORKLOG_MILESTONE.md` | Potong, jahit, QC, timeline order, pembagian kerja | Mau menyentuh `/worklog` atau status order |
| 5 | `DATABASE.md` | Daftar 33 migration, cakupan seed/clear, masalah DB yang diketahui | Setup DB baru, atau menambah migration |
| — | `AGENT_INSTRUCTIONS.md` | Aturan kode + **cara menambah/mengubah dokumentasi** | Sebelum mengubah fitur apa pun |

---

## 2. Alur besar sistem (satu halaman)

```
ORDER MASUK ──► Rekap ──► Potong ──► Bordir ──► Jahit ──► Finishing ──► QC ──► Packaging ──► Pelunasan ──► Kirim
   │              │          ▲          │          ▲                      │
   │              │          │          │          │                      │
   │       (gate: rekap      │     "Bordir selesai"│                 qty lolos QC
   │        harus done)      │     = item masuk    │                 = dasar upah jahit
   │                         │     pool jahit      │
   ▼                         │                     │
PEMBAYARAN (DP/pelunasan) ───┼─────────────────────┼──► gate: Kirim terkunci kalau masih ada sisa tagihan
   │                         │                     │
   ▼                         │                     │
KEUANGAN (transactions) ◄────┴── GUDANG ───────────┘
   ▲                              ▲  Kain keluar ke tukang potong, bahan jahit keluar ke penjahit
   │                              │  (gate: tidak bisa mulai kerja sebelum bahan diserahkan)
   │                              │
   └──── PURCHASING (SPJ / Direct Supplier) ◄── Pengajuan restock dari staf Gudang
                                                     (stok bertambah HANYA saat Gudang konfirmasi terima)

PAYROLL MINGGUAN (Sabtu) ◄── piecework_tasks (potong & jahit lolos QC) + absensi harian + bonus sales
```

**Tiga prinsip yang berulang di seluruh sistem:**

1. **Logika bisnis ada di Postgres (trigger + RPC), bukan di frontend.** Tidak ada backend server terpisah, jadi aksi yang menyentuh banyak tabel harus atomik di database.
2. **Snapshot, bukan hitung ulang.** Harga, HPP, tarif upah, dan konversi satuan disalin ke baris transaksi saat kejadian, supaya data historis tidak berubah kalau master berubah.
3. **Gate check.** Tahap berikutnya dikunci sampai syarat tahap sebelumnya terpenuhi (rekap → potong, kain keluar → potong selesai, bahan keluar → mulai jahit, lunas → kirim). Supervisor boleh override dengan alasan wajib untuk kasus tertentu.

---

## 3. Glosarium

| Istilah | Arti |
|---|---|
| **SPJ** | Surat Pertanggungjawaban. Jalur belanja retail: staf purchasing dikasih uang muka, belanja, lapor dengan foto nota. |
| **Direct Supplier** | Jalur belanja ke supplier langganan. Dibayar lunas di muka, barang menyusul. |
| **BOM** | Bill of Materials, daftar bahan per produk (`product_materials`). |
| **HPP** | Harga Pokok Produksi per pcs. |
| **UOM** | Unit of Measure (satuan). *Base unit* = satuan stok terkecil (pcs/meter/yard). *Purchase unit* = satuan beli (pack/roll/cone). |
| **Floor stock** | Bahan habis-pakai (benang, jarum, kancing) yang dikeluarkan per kemasan utuh ke meja kerja, bukan per order. |
| **Direct BOM** | Bahan yang dijahit langsung ke pakaian (sleting, furing, label, rib). Diserahkan ke penjahit per penugasan. |
| **Worklog** | Pembagian kerja potong/jahit ke staf borongan. Halaman `/worklog`. |
| **Bundel** | Satu baris `sewing_assignments`: sepotong qty dari satu order item untuk satu penjahit. |
| **Borongan (piecework)** | Upah per pcs. Dicatat di `piecework_tasks`. |
| **Susulan cash** | Upah yang baru lolos QC setelah payroll ditutup, dibayar tunai di luar payroll (`paid_manual`). |
| **Satuan / Prioritas** | Kategori order: total qty < 6 pcs = satuan, ≥ 6 pcs = prioritas. |
| **RPC** | Function Postgres yang dipanggil frontend via `supabase.rpc(...)`. |
| **RLS** | Row Level Security. Isolasi data per akun lewat `auth.uid() = user_id`. |

---

## 4. Status tiap fitur (diverifikasi terhadap 33 migration)

Status di bawah dicek dengan membaca file migration (`supabase/migrations`), **bukan** dengan menjalankan aplikasi atau melihat database live. "Ada di migration" berarti SQL-nya ada; belum tentu sudah dijalankan di semua environment dan belum tentu UI-nya selesai.

| Fitur | Migration | Status | Docs |
|---|---|---|---|
| Baseline: order, pembayaran, keuangan, sales, staf, gudang dasar, SPJ, supplier, payroll, storage, grant | `20260101000001`–`06` | Ada | 01, 02 |
| Worklog jahit & potong, QC, susulan cash | `20260922000001` | Ada | 03 |
| Rename `categories` → `transaction_categories` + fix overloading + fix `record_order_payment` | `20260923000001`–`03` | Ada | 01 |
| Potong event-driven per item, timeline order 10 stage, fix mulai jahit | `20260924000001`–`05` | Ada | 03 |
| Approval restock, kolom `taken_by`/`recorded_by`, `fulfillment_type`, flow SPJ & Direct Supplier (stok naik saat Gudang terima) | `20260926000001`–`03` | Ada | 02 |
| Multi-UOM material, floor stock, `consumables_allowance`, gate pelunasan, `production_status` otomatis | `20260929000001` | Ada | 01, 02, 03 |
| Bulk approve & bulk create restock | `20260930000001`–`02` | Ada | 02 |
| Banyak satuan beli (`purchase_units` JSON) + snapshot konversi + penerimaan base unit | `20261001100001`–`02` | **Ada** (docs lama bilang belum) | 02 §2.4 |
| Harga satuan vs prioritas, surcharge jahit, `applied_sewing_rate` | `20261003130001` | Ada | 01 §5, 03 §4.4 |
| Pembagian jahit prioritas v2 (fair queue) | `20261003140001` | Ada | 03 §4.3 |
| Serah bahan jahit (`dispatch_sewing_materials`) | `20261003150001` | Ada | 02 §6 |
| Retur material cacat + edit pengajuan pending | `20261003160001` | Ada | 02 §7 |
| Gate check bahan sebelum jahit | `20261003170001` | Ada | 02 §6.3, 03 §4.5 |
| Fix supplier terima `approved`, `preferred_store`, patch bulk create | `20261003180001`–`03` | Ada | 02 §4 |
| Gate check kain sebelum potong selesai + `dispatch_cutting_materials` | `20261003190001` | Ada (docs lama bilang menunggu approval) | 02 §6, 03 §3 |
| Fix stok material berwarna (sewing) | `20261003200001` | Ada, **hanya untuk jahit** | 02 §3.2 |

Belum terlihat di migration manapun: laporan produktivitas dari `stage_work_logs`, antrian bordir, alur quotation/order mandiri sales, dan notifikasi penjahit.

---

## 5. Peta: dokumen lama → file baru

Dokumen lama sebaiknya **dipindah ke `docs/arsip/`**, jangan dihapus. Tubuh SQL lengkap (RPC) hanya ada di sana. Rangkuman ini sengaja tidak menyalin semua kode.

| Dokumen lama | Masuk ke |
|---|---|
| `AGENT_INSTRUCTIONS.md` | 01 §1 |
| `DESAIN_FITUR_GRANT_PRIVILEGES.md` | 01 §2 |
| `DESAIN_FITUR_STORAGE.md` | 01 §2 |
| `DESAIN_FITUR_ORDER_DAN_KEUANGAN.md` | 01 §4 |
| `DESAIN_FITUR_PENGGAJIAN.md` | 01 §6 |
| `RANCANGAN_HARGA_PRODUK_DAN_JAHIT.md` | 01 §5 dan 03 §4.4 |
| `DESAIN_FITUR_STAF_GUDANG_PURCHASING.md` | 01 §3 dan 02 §3–§5 (alur stok masuk sudah direvisi) |
| `DESAIN_MATERIAL_GUDANG_HPP_DAN_ORDER_STATUS.md` | 02 §2, 02 §6, 03 §2 |
| `DESAIN_MULTI_UOM_PEMBELIAN_MATERIAL.md` | 02 §2.4 |
| `RANCANGAN_PERBAIKAN_FLOW_GUDANG.md` (v1) | 02 §4 dan §6 (sebagian digantikan v2 dan flow approval) |
| `RANCANGAN_PERBAIKAN_FLOW_GUDANG_v2.md` | 02 §4 |
| `RANCANGAN_FLOW_APPROVAL_SPJ_DIRECT_SUPPLIER.md` | 02 §5 (versi final) |
| `RANCANGAN_BULK_PENGAJUAN_RESTOCK_GUDANG.md` | 02 §4 |
| `RANCANGAN_FIX_BULK_APPROVAL_SUPPLIER_DAN_NAMA_TOKO.md` | 02 §4 dan §5 |
| `RANCANGAN_GUDANG_BARANG_KELUAR_WORKLOG.md` | 02 §6 |
| `RANCANGAN_GATE_CHECK_MATERIAL_SEBELUM_JAHIT.md` | 02 §6 dan 03 §4 |
| `RANCANGAN_FIX_GATE_CHECK_POTONG_DAN_BARANG_KELUAR_PER_PENJAHIT.md` | 02 §6 dan 03 §3 |
| `RANCANGAN_FIX_QUERY_STOK_WARNA_MATERIAL_GUDANG.md` | 02 §3 |
| `RANCANGAN_GUDANG_RETUR_DAN_BARANG_RUSAK.md` | 02 §7 |
| `DESAIN_WORKLOG_JAHIT.md` | 03 §1–§4 |
| `RANCANGAN_PEMBAGIAN_WORKLOG_v2.md` | 03 §4 |

---

## 6. Temuan dari pembacaan migration, seed, dan clear

Bagian ini menggantikan daftar "perlu diverifikasi" versi sebelumnya. Urut dari yang paling berisiko.

### Perlu tindakan

1. **`seed.sql` kemungkinan gagal di `stock_movements`.** Constraint `stock_movements_source_type_check` hanya mengizinkan `manual, purchase_receipt, purchasing_report, supplier_purchase, order_consumption, stock_request, floor_stock`. Seed memakai `'initial'` dan `'purchasing'`. **Dikonfirmasi lewat Supabase live:** `stock_movements` project ini tidak punya baris dengan dua nilai itu, konsisten dengan dugaan seed belum pernah sukses jalan di project ini. Belum saya coba jalankan ulang (butuh branch terpisah supaya tidak mengubah data dev yang sudah dipakai manual). Perbaikan minimal: `'initial'` → `'manual'`, `'purchasing'` → `'purchasing_report'`.
2. **`approve_stock_request_spj` tidak menerima status `approved`.** Hanya `pending`/`draft_auto`, sedangkan `bulk_approve_stock_requests` mengubah semua jalur ke `approved`. Supplier sudah ditambal (`20261003180001`), SPJ belum.
3. **`process_defect_material_return` masih hanya memakai `materials.stock_qty`.** Untuk sleting/kancing berwarna, retur akan terbaca "stok kosong" dan membuat pengajuan darurat yang tidak perlu.
4. **`DATABASE.md` lama (di dalam `docs/` project) sudah usang**, menyebut 27 tabel dan 6 migration saja. Versi terbaru ada di luar `docs/` project (lihat berkas yang saya kirim).
5. **Kode mati: `src/hooks/usePurchaseReceipts.ts`** memanggil RPC `pay_purchase_receipt` yang sudah tidak ada di database. Dicek dengan `grep`, hook ini tidak diimpor di mana pun — aman untuk saat ini, tapi berisiko error runtime kalau ada yang memakainya lagi. Lihat `02` §7a.

### Perlu diketahui (bukan bug)

5. `approved_by` di `stock_requests` diisi **id staf purchasing** yang ditunjuk pada `approve_stock_request_spj`, bukan orang Finance yang menyetujui.
6. `pay_weekly_payroll` menandai **semua** `piecework_tasks` `completed` milik staf piecework menjadi `paid`, tanpa filter periode.
7. `orders.order_type` tidak diisi trigger; hanya ada function `calculate_order_type`. Frontend yang harus mengisinya.
8. Tabel dan fungsi legacy potong mingguan (`cutting_weekly_reports`, `cutting_report_lines`, `assign_cutting_order`, `submit_cutting_report`) sengaja dibiarkan. Fungsi `pay_salary` juga masih ada (dibuat di `20260923000001`) berdampingan dengan `pay_weekly_payroll`.
9. `GRANT` eksplisit hanya untuk 27 tabel baseline; tabel baru mengandalkan `alter default privileges`. Kalau muncul `42501` di tabel baru, cek itu dulu.
10. `clear.sql` sudah sinkron dengan migration: 36 tabel, dan tabel lama `categories` memang sudah di-rename jadi `transaction_categories`.

### Sudah terjawab dari versi sebelumnya
- Nama tabel profil perusahaan: **`company_settings`** (bukan `company_profiles`).
- Nama tabel kategori transaksi: **`transaction_categories`**.
- `bulk_approve_stock_requests`, `consumables_allowance`, multi-UOM, fix stok warna, gate check potong: semuanya **ada** di migration.
- Constraint status `purchasing_reports`: `disbursed, submitted, financially_approved, goods_received, rejected`.

### Masih tidak bisa dijawab dari folder ini
Dokumen `DESAIN_FITUR_PRODUK_DAN_COGS.md`, `supabase/PRODUCT_BOM_ROADMAP.md`, dan `PAYROLL_IMPROVEMENTS.md` tidak disertakan, dan kode frontend tidak ada. Jadi kondisi UI tiap fitur belum bisa saya konfirmasi.
