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
- **Kategori** — kategori product (Kemeja, Celana, dst) dan kategori material (Kain, Kancing, dst — kategori kain otomatis nunjukin field komposisi/instruksi perawatan).
- **Material** — master data bahan baku (kain & aksesoris) lengkap harga, satuan, dan warna (khusus kain, tracking stok per warna).
- **Product** — resep/BOM tiap product: biaya jahit & potong per pcs, kebutuhan bahan fix (aksesoris), dan slot kebutuhan kain (bisa lebih dari 1 slot, misal kain utama + furing) — kain aktual baru dipilih saat order, karena harga kain beda-beda per jenis.
- **Gudang (Warehouse)** — pencatatan pergerakan stok masuk/keluar/penyesuaian, permintaan restock dari staf gudang, stok minimum per material/warna.
- **Purchasing** — dua jalur pembelian bahan: **SPJ** (uang muka ke staf purchasing → belanja ritel → laporan dengan bukti → approval, otomatis rekonsiliasi uang muka & catat expense per kategori) dan **Supplier Purchase** (order langsung ke supplier tetap, selalu lunas di muka, barang menyusul terpisah waktu).

### Sumber Daya
- **Pengguna & Sales** — master data sales (nama, kontak, status aktif), performa penjualan per sales.
- **Staf & Karyawan** — master data karyawan lintas peran (purchasing, gudang, penjahit, tukang potong, sales), terhubung ke data Sales untuk staf ber-role Sales (satu sumber kebenaran identitas).

### Pengaturan
- **Perusahaan** — profil perusahaan (nama, alamat, logo), dokumen resmi (stempel & tanda tangan digital untuk surat-menyurat), rekening bank, ubah email login (tanpa perlu konfirmasi email) & password.

## Catatan

- Status order `quotation` dan `pending` sudah disiapkan di database tapi **belum ada alur UI-nya** — direncanakan untuk fitur mendatang (surat penawaran & input order mandiri oleh sales dengan approval finance).
- Dokumentasi lebih detail: `supabase/DATABASE.md` (struktur database, migration, seed/clear), `supabase/PRODUCT_BOM_ROADMAP.md` (keputusan desain HPP/BOM), `PAYROLL_IMPROVEMENTS.md` (keputusan desain payroll).
