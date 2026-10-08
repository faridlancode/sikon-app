# 📚 Dokumentasi SIKon App

**SIKon** adalah sistem ERP konveksi berbasis web (React + Supabase) milik **PT Mad Ali Indonesia**.
Sistem ini mengelola seluruh rantai operasional: dari order masuk, produksi, gudang, pembelian bahan, hingga penggajian.

---

## 🗂️ Struktur Dokumen

Baca dokumen secara berurutan sesuai domain yang ingin dipahami:

| # | File | Domain | Baca kalau... |
|---|------|---------|---------------|
| 1 | [README.md](./README.md) *(ini)* | Overview & navigasi | Pertama kali masuk |
| 2 | [MASTER_DATA.md](./MASTER_DATA.md) | Produk, Material, Staf, Perusahaan, Sales, Kategori | Mau menyentuh master data |
| 3 | [ORDER_DAN_KEUANGAN.md](./ORDER_DAN_KEUANGAN.md) | Order, pembayaran, transaksi, arus kas | Mau menyentuh order atau keuangan |
| 4 | [GUDANG_DAN_PURCHASING.md](./GUDANG_DAN_PURCHASING.md) | Stok, restock, SPJ, supplier, barang keluar, retur | Mau menyentuh gudang atau pembelian |
| 5 | [PRODUKSI_DAN_WORKLOG.md](./PRODUKSI_DAN_WORKLOG.md) | Potong, jahit, QC, timeline order | Mau menyentuh produksi |
| 6 | [PAYROLL.md](./PAYROLL.md) | Penggajian mingguan, borongan, bonus sales | Mau menyentuh payroll |
| 7 | [ARSITEKTUR_TEKNIS.md](./ARSITEKTUR_TEKNIS.md) | DB, RLS, trigger, RPC, storage, konvensi kode | Mau setup DB baru atau tambah fitur |
| 8 | [AKUNTANSI.md](./AKUNTANSI.md) | COA, jurnal, buku besar, pelepasan DP, guard hapus order | Mau menyentuh akuntansi, jurnal, atau laporan keuangan |

> 📁 **Arsip dokumen desain lama** ada di [`docs/arsip/`](./arsip/) — tidak perlu dibaca rutin, tapi berguna kalau butuh SQL lengkap atau konteks keputusan desain awal.

---

## 🔁 Alur Besar Sistem (Satu Halaman)

```
ORDER MASUK ──► Rekap ──► Potong ──► Bordir ──► Jahit ──► Finishing ──► QC ──► Packaging ──► Pelunasan ──► Kirim
   │                        ▲                     ▲                      │
   │                        │                     │                      │
   │                  (gate: kain           (gate: bahan             qty lolos QC
   │                   harus keluar          harus keluar             = dasar upah jahit
   │                   gudang dulu)          gudang dulu)
   ▼
PEMBAYARAN (DP/Pelunasan) ─────────────────────────────────────────────────► gate: Kirim terkunci kalau masih ada sisa tagihan
   │
   ▼
KEUANGAN (transactions) ◄────── GUDANG ──────────────────────────────────────
   ▲                              ▲   Kain keluar ke tukang potong
   │                              │   Bahan jahit keluar ke penjahit
   │                              │
   └──── PURCHASING (SPJ / Direct Supplier) ◄── Pengajuan restock dari staf Gudang
                                                  (stok HANYA naik saat Gudang konfirmasi terima)

PAYROLL MINGGUAN (Sabtu) ◄── piecework_tasks (potong & jahit lolos QC) + absensi harian + bonus sales
```

---

## 🧭 Peta Halaman Aplikasi

| Route | Halaman | Fungsi Utama |
|-------|---------|--------------|
| `/dashboard` | Dashboard | Ringkasan order, tren omzet, performa sales |
| `/orders` | Pesanan | CRUD order, pembayaran, detail & timeline produksi |
| `/financial` | Keuangan | Transaksi income/expense, grafik arus kas, piutang |
| `/akuntansi` | Akuntansi | COA, Jurnal Umum, Buku Besar, Neraca Saldo, laporan, pelepasan DP |
| `/sales` | Sales | Master data salesperson |
| `/materials` | Material | Master bahan baku + varian warna |
| `/products` | Produk | Master produk + BOM (resep biaya & material) |
| `/gudang` | Gudang & Inventori | Stok, barang keluar, restock, terima barang |
| `/purchasing` | Purchasing | SPJ, Direct Supplier, uang muka, approval |
| `/staff` | Staf & Karyawan | Master karyawan + skema upah |
| `/payroll` | Penggajian | Payroll mingguan, tugas borongan, riwayat gaji |
| `/worklog` | Worklog Produksi | Antrian jahit, potong, QC, susulan cash |
| `/perusahaan` | Informasi Perusahaan | Profil, logo, rekening bank, keamanan akun |
| `/kategori` | Kategori | Kategori transaksi keuangan (income/expense) |

---

## 🔑 Tiga Prinsip Utama Sistem

1. **Logika bisnis ada di Postgres (trigger + RPC), bukan di frontend.**
   Tidak ada backend server terpisah. Aksi yang menyentuh banyak tabel harus atomik di database.

2. **Snapshot, bukan hitung ulang.**
   Harga, HPP, tarif upah, dan konversi satuan disalin ke baris transaksi saat kejadian. Data historis tidak berubah kalau master berubah.

3. **Gate check.**
   Tahap berikutnya dikunci sampai syarat tahap sebelumnya terpenuhi. Supervisor boleh override dengan alasan wajib.

---

## 📖 Glosarium Cepat

| Istilah | Arti |
|---------|------|
| **SPJ** | Surat Pertanggungjawaban. Jalur belanja retail: staf purchasing diberi uang muka, belanja, lapor dengan foto nota. |
| **Direct Supplier** | Jalur belanja ke supplier langganan. Dibayar lunas di muka, barang menyusul. |
| **BOM** | Bill of Materials. Daftar bahan per produk (`product_materials`). |
| **Katalog publik** | Situs `sikon-catalog` (tanpa login) yang membaca produk, kain, dan sales lewat RPC `catalog_*`. Lihat `MASTER_DATA.md` §9. |
| **HPP** | Harga Pokok Produksi per pcs. |
| **UOM** | Unit of Measure (satuan). *Base unit* = satuan stok terkecil. *Purchase unit* = satuan beli. |
| **Floor stock** | Bahan habis-pakai (benang, jarum, kancing) dikeluarkan per kemasan utuh, bukan per order. |
| **Direct BOM** | Bahan yang dijahit langsung ke pakaian (sleting, furing, label, rib). Diserahkan ke penjahit per penugasan. |
| **Worklog** | Pembagian kerja potong/jahit ke staf borongan. Halaman `/worklog`. |
| **Bundel** | Satu baris `sewing_assignments`: sepotong qty dari satu order item untuk satu penjahit. |
| **Borongan** | Upah per pcs. Dicatat di `piecework_tasks`. |
| **Susulan Cash** | Upah yang baru lolos QC setelah payroll ditutup, dibayar tunai di luar payroll. |
| **Satuan / Prioritas** | Kategori order: total qty < 6 pcs = satuan, ≥ 6 pcs = prioritas. |
| **RPC** | Function Postgres yang dipanggil frontend via `supabase.rpc(...)`. |
| **RLS** | Row Level Security. Isolasi data per akun lewat `auth.uid() = user_id`. |
| **COA** | Chart of Accounts / Bagan Akun. Daftar semua akun double-entry (`accounts`). |
| **Jurnal** | Entri double-entry: minimal 2 baris, Σ debit = Σ kredit (`journal_entries`, `journal_lines`). |
| **Buku Besar** | Riwayat mutasi + saldo berjalan satu akun (`get_general_ledger`). |
| **Neraca Saldo** | Ringkasan saldo semua akun per periode (`get_trial_balance`). |
| **Uang Muka Pelanggan** | DP yang sudah diterima tapi barang belum dikirim; jadi liabilitas akun 2-1200. |
| **Pelepasan DP** | Melepas dana pelanggan: dikembalikan (`refund`) atau dihanguskan (`forfeit`). Tabel `order_deposit_releases`. |
| **DP Hangus** | DP yang tidak dikembalikan karena order dibatalkan; jadi Pendapatan Lain-lain (4-9000). |
| **Penyesuaian Persediaan** | Saat tutup bulan: selisih stok fisik vs saldo akun Persediaan diposting ke HPP Bahan Baku. |
