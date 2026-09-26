# SIKon — Sistem Informasi Konveksi

Aplikasi web internal untuk mengelola operasional bisnis konveksi (garmen/pakaian jadi) dari ujung ke ujung: order customer, keuangan, HPP/BOM produk, stok bahan baku, pembelian, sampai penggajian karyawan. Single-tenant — dipakai oleh satu perusahaan/owner, tanpa multi-akun publik.

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Routing | React Router (`react-router-dom`) |
| Styling | Tailwind CSS (design token berbasis CSS variables, gaya shadcn) + `class-variance-authority` |
| Icon | Lucide |
| Chart | Recharts |
| Backend | Supabase (Postgres + Auth + Storage), diakses langsung dari frontend via `@supabase/supabase-js` — tidak ada server custom terpisah |
| Keamanan data | Row Level Security (RLS) Postgres — semua tabel terisolasi per `auth.uid()` |
| Package manager | Bun |

Tidak ada backend/API server terpisah — semua business logic yang butuh atomicity (misal "catat pembayaran sekaligus bikin transaksi") dikerjakan lewat **Postgres function (RPC)** yang dipanggil langsung dari frontend via `supabase.rpc(...)`, bukan lewat REST API custom.

## Cara Menjalankan

```bash
bun install
cp .env.example .env   # isi VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY project Supabase Anda
bun run dev
```

Login pakai akun yang dibuat lewat `supabase/seed.sql` (lihat `supabase/DATABASE.md` untuk detail setup database & seed data).

## Fitur yang Sudah Berjalan

### Ikhtisar
- **Dashboard** — ringkasan revenue, jumlah order, sisa tagihan, tren order (grafik), status order, performa sales, order terbaru.

### Transaksi
- **Pesanan (Order)** — buat order dengan alur *Kategori Product → Product → Kain (per slot kebutuhan) → Warna*, biaya bordir opsional (mode flat atau per-titik), harga jual auto-terisi dari harga default product (tetap bisa diedit manual). HPP per order dihitung otomatis & di-snapshot (nggak berubah walau harga bahan naik belakangan). Status pembayaran (belum lunas/lunas, dihitung otomatis dari total pembayaran) terpisah dari status pengerjaan (production/ready/completed).
- **Keuangan (Financial)** — pencatatan transaksi income/expense manual + otomatis (dari pembayaran order, pembelian bahan, gaji, dll), kategori transaksi custom, kartu ringkasan (total pemasukan/pengeluaran, laba bersih, saldo bank, piutang), grafik tren, rekening bank perusahaan.
- **Penggajian (Payroll)** — 3 skema upah: harian (absensi), borongan (piecework, per tugas jahit/potong terhubung ke order & product), dan sales (gaji harian + bonus per order yang cair kalau order sudah *lunas* & pengerjaan *selesai*). Ada pencegahan bikin payroll dobel untuk periode yang sama, kalender kerja 6 hari (Senin–Sabtu, Minggu libur).

### Produksi & Logistik
- **Worklog Produksi** — manajemen aliran kerja konveksi dari potong hingga jahit:
  - *Worklog Jahit*: antrian order siap jahit dengan tracking status pool dinamis (menunggu distribusi, sebagian, terdistribusi penuh), proteksi distribusi berulang, pembagian kerja otomatis merata per pcs ke penjahit aktif via Postgres RPC, aksi memulai pengerjaan jahit (`assigned` &rarr; `in_progress`), monitoring beban kerja per penjahit, pemeriksaan QC per bundel (lolos/reject), auto-generate upah borongan (`piecework_tasks`) untuk qty lolos QC, dan panel pembayaran susulan cash (`paid_manual`).
  - *Worklog Potong*: alur event-driven per-item (hanya order yang sudah menyelesaikan tahap "Rekap Order" yang masuk antrian potong), tabel antrian siap potong & tugas sedang berjalan, penugasan langsung ke tukang potong, konfirmasi selesai potong yang otomatis men-generate upah borongan potong dan menyinkronkan stage Potong pada Timeline Pesanan.
- **Kategori** — master data tiga jenis kategori: kategori product (Kemeja, Celana, dst), kategori material (Kain, Kancing, dst — kategori kain otomatis nunjukin field komposisi/instruksi perawatan), dan **kategori transaksi keuangan** (income/expense — lengkap dengan CRUD, filter Pemasukan/Pengeluaran, dan validasi duplikat).
- **Material** — master data bahan baku (kain & aksesoris) lengkap harga, satuan, dan warna (khusus kain, tracking stok per warna).
- **Product** — resep/BOM tiap product: biaya jahit & potong per pcs, kebutuhan bahan fix (aksesoris), dan slot kebutuhan kain (bisa lebih dari 1 slot, misal kain utama + furing) — kain aktual baru dipilih saat order, karena harga kain beda-beda per jenis.
- **Gudang (Warehouse)** — manajemen stok fisik terintegrasi: monitoring stok per material & varian warna beserta batas minimum, pengajuan restock manual khusus oleh staf dengan role Gudang dengan penentuan jalur pembelanjaan (SPJ Belanja Ritel vs Direct Supplier) sejak awal pengajuan, deteksi otomatis kekurangan kain saat pesanan baru dibuat (`draft_auto`) yang wajib diverifikasi fisik oleh staf gudang sekaligus menentukan jalur belanjanya sebelum diteruskan ke Purchasing, alur pencatatan **Barang Keluar** terstruktur (mencatat siapa yang mengambil: Tukang Potong untuk kain atau Penjahit untuk aksesoris/BOM, serta staf gudang yang menyerahkan), penerimaan fisik terpisah di tab **Terima Barang** dengan dua sub-tab (Dari SPJ Belanja Ritel & Dari Direct Supplier) yang menjadi satu-satunya titik bertambahnya stok gudang aktual (`stock_movements` status `confirmed`), verifikasi kelengkapan nota belanja ritel, dan audit trail riwayat mutasi stok lengkap.
- **Purchasing** — alur pengadaan bahan baku terstruktur & 1-klik approval: panel **Pengajuan Gudang** untuk approval permohonan belanja dengan aksi 1-klik (`approve_stock_request_spj` & `approve_stock_request_supplier`), kemampuan koreksi jalur oleh Finance sebelum approval, aksi belanja massal (**Bulk SPJ** dengan pencairan uang muka & **Bulk Supplier Purchase** berbasis kategori yang sama), jalur **SPJ Belanja Ritel** (uang muka dicairkan `disbursed` → staf belanja & upload nota `submitted` → verifikasi keuangan `financially_approved` dengan rekonsiliasi kasbon & pencatatan mutasi stok `pending` tanpa langsung menambah stok fisik → konfirmasi fisik barang di gudang `goods_received`), dan jalur **Supplier Purchase** (order lunas di muka `ordered` dengan opsi upload nota/surat jalan invoice → penerimaan fisik barang di gudang `received`).

### Sumber Daya
- **Pengguna & Sales** — master data sales (nama, kontak, status aktif), performa penjualan per sales.
- **Staf & Karyawan** — master data karyawan lintas peran (purchasing, gudang, penjahit, tukang potong, sales), terhubung ke data Sales untuk staf ber-role Sales (satu sumber kebenaran identitas).

### Pengaturan
- **Perusahaan** — profil perusahaan (nama, alamat, logo), dokumen resmi (stempel & tanda tangan digital untuk surat-menyurat), rekening bank, ubah email login (tanpa perlu konfirmasi email) & password.

## Catatan

- Status order `quotation` dan `pending` sudah disiapkan di database tapi **belum ada alur UI-nya** — direncanakan untuk fitur mendatang (surat penawaran & input order mandiri oleh sales dengan approval finance).
- Dokumentasi lebih detail: `supabase/DATABASE.md` (struktur database, migration, seed/clear), `supabase/PRODUCT_BOM_ROADMAP.md` (keputusan desain HPP/BOM), `PAYROLL_IMPROVEMENTS.md` (keputusan desain payroll).
- **Mengembangkan project ini pakai AI agent?** Baca `AGENT_INSTRUCTIONS.md` dulu — ada aturan wajib soal update README, migration, dan seed data setiap ada perubahan.
