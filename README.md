# SIKon â€” Sistem Informasi Konveksi

Aplikasi web internal untuk mengelola operasional bisnis konveksi (garmen/pakaian jadi) dari ujung ke ujung: order customer, keuangan, HPP/BOM produk, stok bahan baku, pembelian, sampai penggajian karyawan. Single-tenant â€” dipakai oleh satu perusahaan/owner, tanpa multi-akun publik.

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Routing | React Router (`react-router-dom`) |
| Styling | Tailwind CSS (design token berbasis CSS variables, gaya shadcn) + `class-variance-authority` |
| Icon | Lucide |
| Chart | Recharts |
| Backend | Supabase (Postgres + Auth + Storage), diakses langsung dari frontend via `@supabase/supabase-js` â€” tidak ada server custom terpisah |
| Keamanan data | Row Level Security (RLS) Postgres â€” semua tabel terisolasi per `auth.uid()` |
| Package manager | Bun |

Tidak ada backend/API server terpisah â€” semua business logic yang butuh atomicity (misal "catat pembayaran sekaligus bikin transaksi") dikerjakan lewat **Postgres function (RPC)** yang dipanggil langsung dari frontend via `supabase.rpc(...)`, bukan lewat REST API custom.

## Cara Menjalankan

```bash
bun install
cp .env.example .env   # isi VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY project Supabase Anda
bun run dev
```

Login pakai akun yang dibuat lewat `supabase/seed.sql` (lihat `supabase/DATABASE.md` untuk detail setup database & seed data).

## Fitur yang Sudah Berjalan

### Ikhtisar
- **Dashboard** â€” ringkasan revenue, jumlah order, sisa tagihan, tren order (grafik), status order, performa sales, order terbaru.

### Transaksi
- **Pesanan (Order)** â€” buat order dengan alur *Kategori Product â†’ Product â†’ Kain (per slot kebutuhan) â†’ Warna*, biaya bordir opsional (mode flat atau per-titik), harga jual auto-terisi dari harga default product (tetap bisa diedit manual). HPP per order dihitung otomatis & di-snapshot (nggak berubah walau harga bahan naik belakangan). Status pembayaran (belum lunas/lunas, dihitung otomatis dari total pembayaran) terhubung langsung dengan **Timeline 10-Stage Milestone** (*Quotation â†’ Rekap â†’ Potong â†’ Bordir â†’ Jahit â†’ Finishing â†’ QC â†’ Packaging â†’ Pelunasan â†’ Kirim*) sebagai *single source of truth*. Status 'Siap Kirim' otomatis tercapai saat Packaging selesai, dan status 'Selesai' saat Pengiriman selesai. Dilengkapi **Strict Gate Check Pelunasan** (dilarang keras menandai selesai/terkirim jika tagihan belum lunas / `remaining_amount > 0`).
- **Keuangan (Financial)** â€” pencatatan transaksi income/expense manual + otomatis (dari pembayaran order, pembelian bahan, gaji, dll), kategori transaksi custom, kartu ringkasan (total pemasukan/pengeluaran, laba bersih, saldo bank, piutang), grafik tren, rekening bank perusahaan.
- **Penggajian (Payroll)** â€” 3 skema upah: harian (absensi), borongan (piecework, per tugas jahit/potong terhubung ke order & product), dan sales (gaji harian + bonus per order yang cair kalau order sudah *lunas* & pengerjaan *selesai*). Ada pencegahan bikin payroll dobel untuk periode yang sama, kalender kerja 6 hari (Seninâ€“Sabtu, Minggu libur).

### Produksi & Logistik
- **Worklog Produksi** â€” manajemen aliran kerja konveksi dari potong hingga jahit:
  - *Worklog Jahit*: antrian order siap jahit dengan tracking status pool dinamis (menunggu distribusi, sebagian, terdistribusi penuh), proteksi distribusi berulang, pembagian kerja otomatis merata per pcs ke penjahit aktif via Postgres RPC, aksi memulai pengerjaan jahit (`assigned` &rarr; `in_progress`), monitoring beban kerja per penjahit, pemeriksaan QC per bundel (lolos/reject), auto-generate upah borongan (`piecework_tasks`) untuk qty lolos QC, dan panel pembayaran susulan cash (`paid_manual`).
  - *Worklog Potong*: alur event-driven per-item (hanya order yang sudah menyelesaikan tahap "Rekap Order" yang masuk antrian potong), tabel antrian siap potong & tugas sedang berjalan, penugasan langsung ke tukang potong, konfirmasi selesai potong yang otomatis men-generate upah borongan potong dan menyinkronkan stage Potong pada Timeline Pesanan (`in_progress` saat ditugaskan, `done` saat semua selesai).
- **Kategori** â€” master data tiga jenis kategori: kategori product (Kemeja, Celana, dst), kategori material (Kain, Kancing, dst â€” kategori kain otomatis nunjukin field komposisi/instruksi perawatan), dan **kategori transaksi keuangan** (income/expense â€” lengkap dengan CRUD, filter Pemasukan/Pengeluaran, dan validasi duplikat).
- **Material** — master data bahan baku (kain & aksesoris konveksi) lengkap dengan merk/brand, **dukungan variasi warna untuk seluruh material** (kain, kancing, sleting, benang, dll) yang dapat ditambahkan langsung sejak pembuatan awal, serta dukungan **Multi-UOM (Kemasan Grosir)** dengan input harga 2-arah (Harga Pembelian Grosir vs Harga Pokok Satuan Stok), visualisasi swatch warna di tabel, dan rasio konversi otomatis (conversion_rate) ke base unit inventori.
- **Product** â€” resep/BOM tiap product: biaya jahit & potong per pcs, taksiran flat bahan pembantu/benang/operasional (`consumables_allowance`), kebutuhan bahan fix (aksesoris), dan slot kebutuhan kain (bisa lebih dari 1 slot, misal kain utama + furing) â€” kain aktual baru dipilih saat order, karena harga kain beda-beda per jenis.
- **Gudang (Warehouse)** — manajemen stok fisik terintegrasi: monitoring stok per material & varian warna beserta batas minimum, **Bulk Pengajuan Restock** multi-item dalam 1-klik (`create_bulk_stock_requests` dengan pengelompokan `batch_id`) maupun pengajuan satuan oleh staf Gudang dengan field **estimasi harga pasar** (`estimated_price`) terkini dan penentuan jalur pembelanjaan (SPJ Belanja Ritel vs Direct Supplier), deteksi otomatis kekurangan kain saat pesanan baru dibuat (`draft_auto`), pemisahan alur pengeluaran barang antara **Order-Based** (kain/aksesoris pesanan) dan **Floor Stock / Operasional Meja Jahit** (benang/jarum/kancing yang dikeluarkan utuh per kemasan grosir ke penjahit/staf dan otomatis memotong base unit), penerimaan fisik terpisah di tab **Terima Barang** (Dari SPJ Belanja Ritel & Dari Direct Supplier) sebagai titik tunggal penambahan stok gudang aktual, verifikasi kelengkapan nota belanja ritel, dan audit trail riwayat mutasi stok lengkap.
- **Purchasing** — alur pengadaan bahan baku terstruktur & bulk approval: panel **Pengajuan Gudang** untuk approval permohonan belanja dengan aksi 1-klik (`approve_stock_request_spj` & `approve_stock_request_supplier`) maupun **Bulk Approval** pengajuan pending (`bulk_approve_stock_requests`), kemampuan koreksi jalur oleh Finance sebelum approval, aksi belanja massal (**Bulk SPJ** dengan pencairan uang muka & **Bulk Supplier Purchase** berbasis kategori yang sama), jalur **SPJ Belanja Ritel** (uang muka dicairkan `disbursed` → staf belanja & upload nota `submitted` → verifikasi keuangan `financially_approved` dengan rekonsiliasi kasbon & pencatatan mutasi stok `pending` tanpa langsung menambah stok fisik → konfirmasi fisik barang di gudang `goods_received`), dan jalur **Supplier Purchase** (order lunas di muka `ordered` dengan opsi upload nota/surat jalan invoice → penerimaan fisik barang di gudang `received`).

### Sumber Daya
- **Pengguna & Sales** â€” master data sales (nama, kontak, status aktif), performa penjualan per sales.
- **Staf & Karyawan** â€” master data karyawan lintas peran (purchasing, gudang, penjahit, tukang potong, sales), terhubung ke data Sales untuk staf ber-role Sales (satu sumber kebenaran identitas).

### Pengaturan
- **Perusahaan** â€” profil perusahaan (nama, alamat, logo), dokumen resmi (stempel & tanda tangan digital untuk surat-menyurat), rekening bank, ubah email login (tanpa perlu konfirmasi email) & password.

## Catatan

- Multi-satuan beli material (beberapa kemasan per material, konversi tetap/variabel, dan penerimaan ke satuan stok dasar) sudah disiapkan di kode, tetapi **belum aktif sampai migration `20261001100001` dan `20261001100002` diterapkan ke database**. Kemasan variabel seperti roll kain menambah stok berdasarkan panjang aktual saat penerimaan; jumlah roll tidak dilacak sebagai saldo.
- Keputusan fitur satuan beli grosir: `docs/DESAIN_MULTI_UOM_PEMBELIAN_MATERIAL.md`.
- Status order `quotation` dan `pending` sudah disiapkan di database tapi **belum ada alur UI-nya** â€” direncanakan untuk fitur mendatang (surat penawaran & input order mandiri oleh sales dengan approval finance).
- Dokumentasi lebih detail: `supabase/DATABASE.md` (struktur database, migration, seed/clear), `supabase/PRODUCT_BOM_ROADMAP.md` (keputusan desain HPP/BOM), `PAYROLL_IMPROVEMENTS.md` (keputusan desain payroll).
- **Mengembangkan project ini pakai AI agent?** Baca `AGENT_INSTRUCTIONS.md` dulu â€” ada aturan wajib soal update README, migration, dan seed data setiap ada perubahan.


