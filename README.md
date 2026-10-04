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
- **Pesanan (Order)** — buat order dengan alur *Kategori Product → Product → Kain (per slot kebutuhan) → Warna*, biaya bordir opsional (mode flat atau per-titik), **dukungan 2 kategori pesanan (Satuan < 6 pcs & Prioritas ≥ 6 pcs)** yang dihitung otomatis dari total akumulasi item maupun opsi override manual, pengisian otomatis harga jual rekomendasi per tier (Satuan vs Prioritas) dengan tombol sinkronisasi cepat, serta penyesuaian otomatis tarif upah jahit borongan (+Rp 10.000/pcs untuk pesanan satuan). HPP per order dihitung otomatis & di-snapshot (nggak berubah walau harga bahan naik belakangan). Status pembayaran (belum lunas/lunas, dihitung otomatis dari total pembayaran) terhubung langsung dengan **Timeline 10-Stage Milestone** (*Quotation → Rekap → Potong → Bordir → Jahit → Finishing → QC → Packaging → Pelunasan → Kirim*) sebagai *single source of truth*. Status 'Siap Kirim' otomatis tercapai saat Packaging selesai, dan status 'Selesai' saat Pengiriman selesai. Dilengkapi **Strict Gate Check Pelunasan** (dilarang keras menandai selesai/terkirim jika tagihan belum lunas / `remaining_amount > 0`).
- **Keuangan (Financial)** — pencatatan transaksi income/expense manual + otomatis (dari pembayaran order, pembelian bahan, gaji, dll), kategori transaksi custom, kartu ringkasan (total pemasukan/pengeluaran, laba bersih, saldo bank, piutang), grafik tren, rekening bank perusahaan.
- **Penggajian (Payroll)** — 3 skema upah: harian (absensi), borongan (piecework, per tugas jahit/potong terhubung ke order & product dengan tarif snapshot termasuk surcharge satuan), dan sales (gaji harian + bonus per order yang cair kalau order sudah *lunas* & pengerjaan *selesai*). Ada pencegahan bikin payroll dobel untuk periode yang sama, kalender kerja 6 hari (Senin–Sabtu, Minggu libur).

### Produksi & Logistik
- **Worklog Produksi** — manajemen aliran kerja konveksi dari potong hingga jahit:
  - *Worklog Jahit (v2)*: pemisahan antrian cerdas antara **Order Prioritas (≥ 6 pcs)** dan **Order Satuan (< 6 pcs)**:
    - **Distribusi Order Prioritas**: diproses per order secara utuh dengan pembatasan **maksimal 3 orang penjahit** dan **batas minimal 5 pcs/orang** ($\text{Target Penjahit} = \min(3, \max(1, \lfloor \text{Order Qty}/5 \rfloor))$), mekanisme **Rotasi Adil (Fair Queue Round-Robin)** berbasis penjahit yang paling lama belum mendapat order prioritas (`last_priority_assigned_at ASC`) & beban berjalan terendah, pembagian multi-item campuran secara proporsional, serta dukungan penuh **Manual Override oleh Supervisor** (`ManualSewingAssignModal`) untuk memilih penjahit spesialis dan menyesuaikan kuota pcs secara fleksibel dengan validasi balance real-time.
    - **Distribusi Order Satuan**: dikumpulkan dalam pool satuan dan dibagikan merata ke **seluruh penjahit aktif** (minimal 1–2 pcs per orang) dengan penerapan **surcharge upah jahit (+Rp 10.000/pcs)** secara otomatis.
    - *Gate Check Material Gudang*: tombol **Mulai Jahit** otomatis dinonaktifkan jika bahan Direct BOM belum diserahkan gudang (`material_dispatched_at = null`); badge **⏳ Tunggu Bahan Gudang** / **✓ Bahan Diterima** muncul di setiap baris penugasan; Supervisor dapat **Paksa Mulai** dengan alasan wajib yang tercatat di log penugasan; RPC `start_sewing_assignment` dan `start_all_sewing_assignments` dilengkapi gate check + `p_force` override + return skip count.
    - *Fitur Jahit Lainnya*: tracking status pool dinamis (menunggu, sebagian, terdistribusi penuh), aksi memulai pengerjaan (`assigned` → `in_progress`), monitoring beban kerja per penjahit beserta kolom tarif aktual per pcs, pemeriksaan QC per bundel (lolos/reject), auto-generate upah borongan (`piecework_tasks`) untuk qty lolos QC dengan tarif snapshot terhitung, dan panel pembayaran susulan cash (`paid_manual`).
  - *Worklog Potong*: alur event-driven per-item (hanya order yang sudah menyelesaikan tahap "Rekap Order" yang masuk antrian potong), tabel antrian siap potong & tugas sedang berjalan, penugasan langsung ke tukang potong, **Gate Check Kain Gudang** (tombol selesai potong terkunci jika kain roll belum dikeluarkan oleh gudang, badge `⏳ Menunggu Kain Gudang` / `✓ Kain Diterima`, dukungan *Supervisor Force Override* dengan alasan wajib), konfirmasi selesai potong yang otomatis men-generate upah borongan potong dan menyinkronkan stage Potong pada Timeline Pesanan (`in_progress` saat ditugaskan, `done` saat semua selesai).
- **Kategori** — master data tiga jenis kategori: kategori product (Kemeja, Celana, dst), kategori material (Kain, Kancing, dst — kategori kain otomatis nunjukin field komposisi/instruksi perawatan), dan **kategori transaksi keuangan** (income/expense — lengkap dengan CRUD, filter Pemasukan/Pengeluaran, dan validasi duplikat).
- **Material** — master data bahan baku (kain & aksesoris konveksi) lengkap dengan merk/brand, **dukungan variasi warna untuk seluruh material** (kain, kancing, sleting, benang, dll) yang dapat ditambahkan langsung sejak pembuatan awal, serta dukungan **Multi-UOM (Kemasan Grosir)** dengan input harga 2-arah (Harga Pembelian Grosir vs Harga Pokok Satuan Stok), visualisasi swatch warna di tabel, dan rasio konversi otomatis (conversion_rate) ke base unit inventori.
- **Product** — resep/BOM tiap product: biaya jahit & potong per pcs, **tier harga ganda (Harga Jual Prioritas ≥ 6 pcs dan Harga Jual Satuan < 6 pcs)**, taksiran flat bahan pembantu/benang/operasional (`consumables_allowance`), kebutuhan bahan fix (aksesoris), dan slot kebutuhan kain (bisa lebih dari 1 slot, misal kain utama + furing) — kain aktual baru dipilih saat order, karena harga kain beda-beda per jenis.
- **Gudang (Warehouse)** — manajemen stok fisik terintegrasi:
  - **Pusat Pengeluaran Barang Keluar**: antarmuka terpadu 3 sub-tab:
    1. *Kain Potong*: penyerahan kain roll spesifik per penugasan tukang potong (`dispatch_cutting_materials`), membuka gate check potong secara otomatis.
    2. *Bahan Jahit (Worklog Penjahit)*: penyerahan bahan Direct BOM (sleting, furing, label) spesifik per penjahit dan alokasi pcs-nya (`dispatch_sewing_materials`), bukan gelondongan per order. **Dukungan Penuh Material Berwarna**: deteksi stok cerdas yang mengakumulasikan seluruh varian warna (`material_colors`) dan pemotongan stok otomatis per varian warna (`check_sewing_material_stock` & `dispatch_sewing_materials`).
    3. *Floor Stock & Mutasi Lainnya*: pengeluaran kemasan utuh (1 cone benang, 1 pack jarum, 1 pack kancing finishing) dengan pencatatan staf pengambil (`taken_by`).
  - **Hard-Block Validasi Stok Kurang**: jika stok di rak gudang kurang dari kebutuhan, tombol konfirmasi serah terima **dinonaktifkan (`disabled`)** dan menampilkan badge merah `⚠️ Stok Kurang` (tidak ada lagi serah terima semu).
  - **Fitur Gudang Lainnya**: monitoring stok per material & varian warna beserta batas minimum, **Bulk Pengajuan Restock** multi-item dalam 1-klik (`create_bulk_stock_requests`), deteksi otomatis kekurangan kain saat pesanan baru dibuat (`draft_auto`), **Edit Pengajuan Restock** (`update_pending_stock_request`), **Nama Toko Rekomendasi** saat pengajuan restock, **Retur Material Cacat** dari penjahit (`material_defect_returns` + `process_defect_material_return`), penerimaan fisik di tab **Terima Barang**, dan audit trail riwayat mutasi stok lengkap.
- **Purchasing** — alur pengadaan bahan baku terstruktur & bulk approval: panel **Pengajuan Gudang** untuk approval permohonan belanja dengan aksi 1-klik (`approve_stock_request_spj` & `approve_stock_request_supplier`) maupun **Bulk Approval** pengajuan pending (`bulk_approve_stock_requests`), kemampuan koreksi jalur oleh Finance sebelum approval, aksi belanja massal (**Bulk SPJ** dengan pencairan uang muka & **Bulk Supplier Purchase** berbasis kategori yang sama), jalur **SPJ Belanja Ritel** (uang muka dicairkan `disbursed` → staf belanja & upload nota `submitted` → verifikasi keuangan `financially_approved` dengan rekonsiliasi kasbon & pencatatan mutasi stok `pending` tanpa langsung menambah stok fisik → konfirmasi fisik barang di gudang `goods_received`), dan jalur **Supplier Purchase** (order lunas di muka `ordered` dengan opsi upload nota/surat jalan invoice → penerimaan fisik barang di gudang `received`).

### Sumber Daya
- **Pengguna & Sales** — master data sales (nama, kontak, status aktif), performa penjualan per sales.
- **Staf & Karyawan** — master data karyawan lintas peran (purchasing, gudang, penjahit, tukang potong, sales), terhubung ke data Sales untuk staf ber-role Sales (satu sumber kebenaran identitas).

### Pengaturan
- **Perusahaan** — profil perusahaan (nama, alamat, logo), **pengaturan surcharge upah jahit satuan** (`sewing_satuan_surcharge`), dokumen resmi (stempel & tanda tangan digital untuk surat-menyurat), rekening bank, ubah email login (tanpa perlu konfirmasi email) & password.

## Catatan

- Multi-satuan beli material (beberapa kemasan per material, konversi tetap/variabel, dan penerimaan ke satuan stok dasar) sudah disiapkan di kode, tetapi **belum aktif sampai migration `20261001100001` dan `20261001100002` diterapkan ke database**. Kemasan variabel seperti roll kain menambah stok berdasarkan panjang aktual saat penerimaan; jumlah roll tidak dilacak sebagai saldo.
- Keputusan fitur satuan beli grosir: `docs/DESAIN_MULTI_UOM_PEMBELIAN_MATERIAL.md`.
- Status order `quotation` dan `pending` sudah disiapkan di database tapi **belum ada alur UI-nya** â€” direncanakan untuk fitur mendatang (surat penawaran & input order mandiri oleh sales dengan approval finance).
- Dokumentasi lebih detail: `supabase/DATABASE.md` (struktur database, migration, seed/clear), `supabase/PRODUCT_BOM_ROADMAP.md` (keputusan desain HPP/BOM), `PAYROLL_IMPROVEMENTS.md` (keputusan desain payroll).
- **Mengembangkan project ini pakai AI agent?** Baca `AGENT_INSTRUCTIONS.md` dulu â€” ada aturan wajib soal update README, migration, dan seed data setiap ada perubahan.


