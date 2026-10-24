# 💰 Order & Keuangan — SIKon App

Mencakup: Order, Item Order, Pembayaran, Transaksi Keuangan, Arus Kas, Piutang, dan Dashboard Keuangan.

---

## 1. Order (`/orders`)

### 1.1 Konsep Dasar Order

Order = pesanan satu pelanggan yang berisi satu atau lebih item (produk + qty).

Order punya **dua dimensi status yang berbeda**:

| Kolom | Arti | Nilai | Cara Berubah |
|-------|------|-------|-------------|
| `orders.status` | Status **pembayaran** | `belum_lunas`, `lunas` | **Otomatis** via trigger + RPC |
| `orders.production_status` | Status pengerjaan **ringkas** | `quotation`, `pending`, `production`, `ready`, `completed` | **Otomatis** dari timeline milestone |

> **Jangan edit kedua kolom ini secara manual dari frontend.** Mereka dikelola oleh trigger dan RPC.

### 1.2 Data yang Disimpan per Order

| Kolom | Keterangan |
|-------|-----------|
| `order_id` | Kode order otomatis: `ORD-0001`, `ORD-0002`, dst (unique per user) |
| `order_date` | Tanggal order dibuat |
| `customer_name` | Nama pelanggan |
| `sales_id` | FK ke tabel `sales` (opsional) |
| `total_price` | SUM semua item (dihitung otomatis oleh trigger, **jangan diedit manual**) |
| `ongkir` | Ongkos kirim (diisi manual) |
| `grand_total` | `total_price + ongkir` (computed di view) |
| `status` | Status pembayaran: `belum_lunas` / `lunas` |
| `production_status` | Status produksi ringkas |
| `order_type` | `satuan` (<6 pcs) atau `prioritas` (≥6 pcs) — diisi frontend |
| `is_order_type_manual_override` | `true` jika admin override kategori secara manual |
| `bonus_paid` | Flag bahwa bonus sales sudah dibayarkan ke payroll |

### 1.3 Order Item

Setiap order punya satu atau lebih item di tabel `order_items`:

| Kolom | Keterangan |
|-------|-----------|
| `product_id` | FK ke `products` |
| `name_item` | Nama item (snapshot dari `products.name`) |
| `qty` | Jumlah pcs |
| `price` | Harga jual per pcs (snapshot saat order dibuat) |
| `total_price` | `qty × price` (dihitung otomatis oleh trigger) |
| `hpp_per_unit_snapshot` | HPP per pcs saat order dibuat (tidak berubah) |
| `hpp_total_snapshot` | `qty × hpp_per_unit_snapshot` |
| `embroidery_cost_per_unit` | Biaya bordir per pcs |
| `embroidery_details` | Detail bordir: mode (none/flat/spots), lokasi, biaya |
| `ready_for_sewing_at` | Timestamp item masuk pool jahit (setelah bordir selesai) |
| `cutting_completed_at` | Timestamp item selesai dipotong |
| `cutting_qty` | Qty aktual yang berhasil dipotong (bisa beda dari `qty` jika ada kain rusak) |

**Kain per item** disimpan di `order_item_fabrics`:
- Material, warna, qty pakai, harga saat itu, biaya per baris
- Snapshot penuh — tidak berubah walau harga master diubah

### 1.4 Flow Order → Pembayaran → Transaksi

```
1. Order dibuat
   → trigger generate_order_code: buat kode ORD-000N
   → order_items ditambah
   → trigger calc_order_item_total: total_price = qty × price
   → trigger sync_order_total_price: orders.total_price = SUM(semua item)

2. Bayar (DP atau Pelunasan)
   → RPC record_order_payment(order_id, amount, 'dp'/'pelunasan', ...)
   → insert order_payments
   → insert transactions (type: income, "Pembayaran Order")
   → recompute_order_status → lunas jika total_dibayar ≥ total_price + ongkir

3. Salah input pembayaran?
   → RPC delete_order_payment(payment_id)
   → hapus order_payments + transactions terkait
   → recompute status pembayaran
```

### 1.5 Tipe Pembayaran

| Tipe | Keterangan |
|------|-----------|
| `dp` | Uang muka / Down Payment |
| `pelunasan` | Pembayaran akhir (melunasi sisa) |

### 1.6 Gate Check Pengiriman

**Order tidak bisa ditandai "Kirim" selesai jika masih ada sisa tagihan.**

Implementasi di database: `toggle_order_stage` menolak stage `pelunasan` dan `kirim` jika `orders_with_balance.remaining_amount > 0`. Pesan error: *"Pesanan belum lunas (sisa tagihan: Rp X)..."*

Di UI: tombol dikunci dengan peringatan merah.

### 1.7 UI Halaman Order

- Filter status: Semua, Belum Lunas, Lunas
- Pencarian: nomor order, nama pelanggan, nama sales
- Tombol **Lihat** → modal detail order + timeline produksi + riwayat pembayaran
- Tombol **Edit** → form edit order (nama pelanggan, ongkir, dll.)
- Tombol **Hapus** → menghapus order + semua item dan pembayarannya
- **Modal Pembayaran** → input DP/pelunasan, metode pembayaran, tanggal

### 1.8 Views Database

| View | Isi |
|------|-----|
| `orders_with_balance` | Order + `grand_total` + `paid_amount` + `remaining_amount` (piutang) |
| `sales_performance` | Agregat per sales: jumlah order, revenue, dibayar, piutang |

---

## 2. Timeline Produksi (Milestone) — ringkas

> **Pemilik bagian ini adalah `PRODUKSI_DAN_WORKLOG.md` §2.** Sepuluh tahap (Quotation → ... → Kirim), tabel `order_stage_events`, dan cara tiap tahap berubah ada di sana secara lengkap — baca di situ supaya tidak ada dua sumber yang bisa berbeda.

Yang relevan untuk domain keuangan di halaman ini:

- **Gate pelunasan/kirim:** tahap **Pelunasan** dan **Kirim** ditolak selama `orders_with_balance.remaining_amount > 0`. Pesan error: *"Pesanan belum lunas (sisa tagihan: Rp X)..."*. Di UI, tombol dikunci dengan peringatan merah.
- **Efek ke `production_status`:** Packaging selesai → `ready` ("Siap Kirim"); Kirim selesai → `completed`. Kedua kolom ini diturunkan otomatis dari timeline, jangan diedit manual dari frontend.

---

## 3. Keuangan (`/financial`)

### 3.1 Gambaran Umum

Halaman keuangan menampilkan **seluruh arus kas** perusahaan dalam satu tabel `transactions`:
- Pemasukan dari order (otomatis saat pembayaran dicatat)
- Pengeluaran dari SPJ (pembelian via staf purchasing)
- Pengeluaran dari Direct Supplier
- Pengeluaran gaji (saat payroll dibayar)
- Transaksi manual lain yang diinput admin

### 3.2 Struktur Transaksi

Tabel `transactions`:

| Kolom | Keterangan |
|-------|-----------|
| `title` | Judul/deskripsi transaksi |
| `amount` | Nominal |
| `type` | `income` atau `expense` |
| `transaction_date` | Tanggal transaksi |
| `description` | Keterangan tambahan |
| `category_id` | FK ke `transaction_categories` |
| `order_id` | FK ke `orders` (khusus transaksi pembayaran order) |

### 3.3 Saldo & Ringkasan

```
Saldo Berjalan = Saldo Awal + Total Income - Total Expense
Piutang        = SUM remaining_amount dari semua order berstatus 'belum_lunas'
```

- **Saldo Awal** diatur di profil perusahaan (`company_settings.saldo_awal` — bukan `initial_balance`, dikoreksi setelah dicek ke migration dan `useCompanySettings.ts`)
- Tombol **Edit Saldo Awal** tersedia di halaman keuangan

### 3.4 Visualisasi

- **Trend Chart** — grafik garis income vs expense per periode
- **Category Donut Chart** — komposisi pengeluaran per kategori
- **Summary Cards** — total income, total expense, saldo berjalan, piutang

### 3.5 Filter Transaksi

- Filter tipe: Semua, Pemasukan, Pengeluaran
- Filter tanggal: dari — sampai
- Pencarian teks: judul transaksi

### 3.6 CRUD Transaksi Manual

Admin bisa menambah, edit, dan hapus transaksi manual:
- Harus pilih kategori income/expense
- Input nominal, tanggal, judul, deskripsi

> **Perhatian:** Transaksi yang dibuat otomatis oleh sistem (pembayaran order, SPJ, payroll) sebaiknya tidak dihapus manual karena akan merusak konsistensi data.

---

## 4. Dashboard (`/dashboard`)

### 4.1 Kartu Ringkasan Order

- Total order bulan ini
- Total revenue bulan ini
- Order belum lunas (jumlah + nilai piutang)
- Order dalam proses produksi

### 4.2 Grafik

- **Order Trend Chart** — tren jumlah order per minggu/bulan
- **Order Status Chart** — distribusi status order (belum lunas / lunas / completed)
- **Sales Performance Card** — tabel performa per salesperson
- **Category Quantity Card** — qty terjual per kategori produk
- **Recent Orders Card** — daftar order terbaru

---

## 5. Daftar Trigger & RPC

| Nama | Jenis | Fungsi |
|------|-------|--------|
| `generate_order_code` | trigger | Buat kode `ORD-000N` otomatis |
| `calc_order_item_total` | trigger | `total_price = qty × price` per item |
| `sync_order_total_price` | trigger | `orders.total_price = SUM(items)` |
| `recompute_status_on_order_change` | trigger | Hitung ulang status bayar jika total berubah |
| `recompute_order_status` | internal fn | Set `lunas`/`belum_lunas` |
| `record_order_payment` | **RPC** | Catat bayar + income + update status |
| `delete_order_payment` | **RPC** | Batalkan pembayaran |
| `toggle_order_stage` | **RPC** | Toggle tahap milestone (dengan gate check) |
| `calculate_order_type` | function | Hitung satuan/prioritas dari total qty |
| `update_owner_email` | **RPC** | Ganti email login |
| `sync_potong_stage` | trigger | Sinkron status tahap Potong dari data aktual |
| `sync_jahit_stage` | trigger | Sinkron status tahap Jahit dari data aktual |
| `save_quotation` | **RPC** | Buat/perbarui Surat Penawaran + otomatis buat invoice DP penawaran |
| `set_quotation_status` | **RPC** | Transisi status penawaran (`draft`/`sent`/`rejected`) |
| `delete_quotation` | **RPC** | Hapus penawaran draft (cascade items & invoice penawaran) |
| `link_quotation_to_order` | **RPC** | Tautkan penawaran ke pesanan baru (`accepted`), tandai invoice DP paid |
| `save_invoice` | **RPC** | Perbarui rincian/catatan/ongkir invoice pesanan atau penawaran |
| `set_invoice_status` | **RPC** | Transisi status invoice (`draft`/`sent`/`paid`/`cancelled`) |
| `delete_invoice` | **RPC** | Hapus invoice draft (hanya bila induk masih draft) |
| `create_invoice_from_quotation` | **RPC** | Buat invoice DP penawaran (dipanggil otomatis saat simpan penawaran) |
| `create_invoice_from_order` | **RPC** | Buat/sinkronkan invoice pelunasan pesanan dari rincian order |
| `trg_sync_order_invoice_on_payment` | trigger | Sinkronkan `paid_amount` & `amount_due` invoice pesanan saat pembayaran dicatat/dihapus |
| `trg_auto_create_receipt` | trigger | Otomatis terbitkan `receipts` (`KWT-YYYYMM-NNNN`) saat `order_payments` di-insert |
| `get_or_create_nota` | **RPC** | Buat/ambil nota pesanan lunas (`NTA-YYYYMM-NNNN`) dengan snapshot terkunci |
| `create_po_batch` | **RPC** | Buat batch PO baru (nama bebas, tanggal & bulan laporan bebas, kuota opsional) |
| `update_po_batch` | **RPC** | Perbarui atribut batch PO (validasi tumpang tindih tanggal antar PO) |
| `delete_po_batch` | **RPC** | Hapus batch PO (tolak jika memiliki pesanan atau permohonan stok) |
| `close_po_batch` | **RPC** | Tutup batch PO, kunci snapshot, audit event, dan loop rekap massal pesanan |
| `reopen_po_batch` | **RPC** | Buka kembali batch PO closed oleh owner, reset snapshot, audit event |
| `list_po_batches_summary` | **RPC** | Daftar ringkasan PO untuk dashboard/tabel dengan order_count, total_qty, quota_used_pct |
| `get_po_daily_report` | **RPC** | Laporan PO harian (agregat order tanggal terpilih + kartu kumulatif per PO aktif) |
| `get_po_close_report` | **RPC** | Laporan evaluasi tutup PO (kuota vs aktual, omzet, upah borongan, pembelian, laba kotor) |
| `get_po_monthly_report` | **RPC** | Laporan performa PO bulanan, pembelian bahan baku per item via SR, dan rekonsiliasi dinamis |
| `release_order_early` | **RPC** | Lepas pesanan ke produksi lebih awal (bypass gerbang Rekap PO sebelum tutup) |
| `get_po_purchase_list` | **RPC** | Agregat kebutuhan belanja bahan baku per batch PO (kebutuhan vs terpenuhi) |
| `trg_orders_assign_po_batch` | trigger | Validasi PO atau fallback otomatis ke PO terbuka yang mencakup `order_date` |
| `trg_guard_order_closed_po` | trigger | Menolak penambahan/pemindahan order ke PO yang sudah berstatus `closed` |
| `trg_link_stock_request_to_po` | trigger | Otomatis mengisi `stock_requests.po_batch_id` dari `orders.po_batch_id` |

---

## 6. Dokumen Order (Penawaran, Invoice, Kwitansi, Nota)

Sistem dokumen order menyediakan siklus dokumen bisnis lengkap yang terintegrasi langsung dengan operasional produksi dan keuangan tanpa merusak isolasi akuntansi.

### 6.1 Ringkasan Dokumen

| Dokumen | Kode Dokumen | Tabel Database | Dibuat Oleh | Akses UI |
|---------|--------------|----------------|-------------|----------|
| **Surat Penawaran** | `PNW-YYYYMM-NNNN` | `quotations`, `quotation_items` | RPC `save_quotation` | Halaman `/quotations` (Wizard 3 Langkah) |
| **Invoice Penawaran** | `INV-YYYYMM-NNNN` | `invoices`, `invoice_items` | **Otomatis** saat penawaran dibuat | Halaman `/invoices` & Tombol di `/quotations` |
| **Invoice Pesanan** | `INV-YYYYMM-NNNN` | `invoices`, `invoice_items` | **Otomatis** saat order dibuat / bayar | Halaman `/invoices` & Modal Detail Order (`/orders`) |
| **Kwitansi** | `KWT-YYYYMM-NNNN` | `receipts` | **Trigger otomatis** `AFTER INSERT ON order_payments` | Modal Detail Order (tiap baris pembayaran) |
| **Nota Pesanan Lunas** | `NTA-YYYYMM-NNNN` | `notas` (+ `snapshot` JSON) | RPC `get_or_create_nota` | Modal Detail Order (hanya jika order `lunas`) |

### 6.2 Aturan Bisnis & Integritas Dokumen

1. **Penomoran Dokumen (`document_counters`):**
   - Format: `PREFIX-YYYYMM-NNNN` (`PNW`, `INV`, `KWT`, `NTA`).
   - Counter sequence bersifat unik dan reset setiap pergantian bulan kalender per pemilik (`user_id`).
   - Nomor tidak di-recycle: penghapusan dokumen terakhir tidak menggunakan ulang nomor urut yang sama.
2. **Zero Orphan Invoice:**
   - Tidak ada pembuatan invoice manual yang berdiri sendiri tanpa relasi.
   - Setiap invoice wajib menginduk ke Surat Penawaran (`source_type = 'quotation'`) atau Pesanan (`source_type = 'order'`).
   - Invoice penawaran menagihkan komitmen DP. Invoice pesanan menagihkan sisa pelunasan pesanan dan otomatis terbarui bila ada pembayaran masuk.
3. **Kwitansi Otomatis (Tanpa Trigger Hapus):**
   - Dibuat secara otomatis di latar belakang oleh trigger `fn_auto_create_receipt` saat pembayaran masuk dicatat ke `order_payments`.
   - Frontend bersikap **READ ONLY** terhadap tabel `receipts`.
   - Pembatalan/penghapusan pembayaran menggunakan `ON DELETE CASCADE` langsung pada database tanpa trigger delete terpisah.
4. **Nota Pesanan Lunas Idempoten Ber-Snapshot:**
   - Nota hanya dapat diterbitkan untuk pesanan yang telah berstatus `lunas`. Pemanggilan pada pesanan belum lunas akan ditolak oleh RPC.
   - Saat pertama kali diterbitkan, RPC mengunci `snapshot` data item, pembayaran, dan ongkir ke dalam kolom `jsonb`. Perubahan data item pesanan di masa mendatang tidak akan mengubah cetakan nota fisik.
5. **Isolasi Akuntansi:**
   - Dokumen penawaran, invoice, kwitansi, dan nota tidak membuat mutasi jurnal pada `journal_entries`.
   - Pencatatan jurnal murni bersumber dari transaksi pembayaran riil (`record_order_payment` / `order_payments`).
6. **Opsi Cetak & Tanda Tangan:**
   - Semua dokumen mendukung 3 mode cetak: `none` (tanpa TTD/cap), `signature_only` (tanda tangan digital), dan `signature_and_stamp` (tanda tangan + cap perusahaan).
   - Pratinjau A4 memakai kontrol bersama untuk unduh PDF dan cetak melalui dokumen terisolasi, bukan tata letak aplikasi. PDF membagi baris dan area tanda tangan berdasarkan tinggi aktual, dengan footer waktu WIB dan nomor halaman fisik. Status LUNAS ditampilkan sebagai cap lurus di bagian atas agar tidak menimpa isi.

---

## 7. Batch PO (`/po`)

Batch PO adalah wadah pengelompokan pesanan pelanggan yang fleksibel untuk manajemen kapasitas produksi konveksi, penjadwalan pemotongan/penjahitan, pengadaan bahan terfokus, serta evaluasi laba kotor per batch kerja.

### 7.1 Karakteristik PO Fleksibel

1. **Pembuatan Bebas oleh Owner:**
   - Dibuat manual oleh owner melalui RPC `create_po_batch` di halaman `/po`.
   - **Nama Bebas:** Pemilik bebas memberi nama batch (misal: "PO Jan W1", "PO Seragam Dishub", "PO Lebaran Kloter 2"). Nama bersifat unik per user (`unique(user_id, lower(name))`).
   - **Rentang Tanggal Bebas:** Tanggal mulai (`start_date`) dan tanggal selesai (`end_date`) fleksibel sesuai jadwal nyata konveksi, dengan syarat `end_date >= start_date`. Rentang tanggal antar-PO tidak boleh bertabrakan (tumpang tindih) agar penentuan tanggal tidak ambigu.
   - **Bulan Laporan Bebas:** Owner menentukan tahun (`period_year`) dan bulan (`period_month`) kalender pelaporan saat membuat PO, independen dari tanggal mulai/selesai.
2. **Kuota Kapasitas Pcs (Soft Warning):**
   - Kolom `quota_qty` bersifat opsional sebagai target kapasitas potong/jahit workshop.
   - Berfungsi sebagai **peringatan lunak (soft warning)**: progress bar di UI berubah kuning saat terisi ≥90% dan merah saat ≥100%. Sistem **tidak memblokir** input pesanan jika kuota terlampaui.

### 7.2 Hubungan Order dengan PO

1. **Penempelan Order:**
   - Setiap pesanan wajib memiliki tautan `orders.po_batch_id` ke tabel `po_batches`.
   - Pada form pesanan (`OrderModal`), sistem secara otomatis menyarankan (*auto-suggest*) PO berstatus `open` yang rentang tanggalnya mencakup tanggal pesanan (`order_date`).
   - Staf dapat memilih PO terbuka lain melalui dropdown bila diperlukan.
2. **Fallback Server Database:**
   - Jika frontend tidak mengirimkan `po_batch_id` secara eksplisit, trigger `trg_orders_assign_po_batch` di database mencari PO berstatus `open` yang rentang tanggalnya mencakup `order_date`.
   - **Tolak Jika Tidak Ada PO Terbuka:** Jika tidak ada PO terbuka yang cocok, pembuatan order ditolak oleh database dengan pesan: *"Tidak ada Batch PO berstatus open yang mencakup tanggal YYYY-MM-DD. Silakan buat atau buka PO terlebih dahulu di menu /po."*
3. **Guard PO Closed:**
   - Trigger `trg_guard_order_closed_po` mencegah penambahan order baru atau pemindahan order yang sudah ada ke dalam PO yang statusnya sudah `closed`.

### 7.3 Penutupan, Snapshot, dan Pembukaan Kembali PO

1. **Tutup PO (`close_po_batch`):**
   - Mengubah status PO dari `open` menjadi `closed`, mencatat waktu penutupan (`closed_at`), dan menyimpan jejak audit event `closed` pada tabel `po_batch_events`.
   - **Alasan Tutup Lebih Awal:** Jika PO ditutup sebelum tanggal selesai (`today < end_date`), staf/owner wajib mengisi alasan penutupan lebih awal (`close_early_reason`).
   - **Snapshot Terkunci (`close_snapshot`):** Saat ditutup, database menghitung dan mengunci ringkasan kinerja ke kolom `jsonb`: jumlah order, total pcs, omzet, rincian biaya HPP & upah borongan, pembelian bahan, serta estimasi laba kotor. Laporan tutup PO untuk batch closed selalu membaca snapshot ini agar angka historis tidak berubah.
2. **Buka Kembali PO (`reopen_po_batch`):**
   - PO closed dapat dibuka kembali menjadi `open` oleh owner dengan memasukkan catatan pembukaan kembali (`reopen_note`).
   - Kolom `close_snapshot` direset menjadi `null`, kolom `reopen_count` bertambah, dan audit event `reopened` dicatat.

### 7.4 Gerbang Produksi Hibrida & Pelepasan Lebih Awal

1. **Saklar Pengaturan Perusahaan (`po_gate_production`):**
   - Diatur melalui menu `/perusahaan` (default: nonaktif).
   - Saat saklar **aktif**: tahap **Rekap** pesanan pada timeline milestone dikunci dan hanya dapat diselesaikan setelah batch PO pesanan tersebut berstatus `closed`.
   - Saat saklar **mati**: sistem berjalan seperti biasa tanpa hambatan penutupan PO pada tahap Rekap.
2. **Pelepasan ke Produksi Lebih Awal (`release_order_early`):**
   - Jika ada pesanan darurat/prioritas yang harus segera dikerjakan sebelum PO ditutup, owner/supervisor dapat mengeksekusi RPC `release_order_early(order_id, reason)`.
   - Syarat: PO berstatus `open` dan tahap Rekap belum `done`. Alasan pelepasan wajib diisi.
   - Kolom `orders.released_early_at` diisi timestamp saat itu dan audit event `rekap_early` dicatat.
   - Order yang telah dilepas lebih awal menampilkan badge kuning **"Lebih Awal"** di tabel pesanan, timeline, dan antrian worklog, serta dapat langsung diproses tahap Rekap tanpa menunggu PO ditutup.
3. **Rekap Massal Otomatis Saat Tutup PO:**
   - Saat RPC `close_po_batch` dieksekusi, database menjalankan loop untuk memajukan tahap Rekap menjadi `done` untuk seluruh pesanan dalam PO yang belum direkap (melewati pesanan yang sudah berstatus `released_early_at`).
4. **Integrasi Worklog & Purchasing:**
   - **Worklog (`/worklog`):** Antrian potong dan jahit diurutkan berdasarkan `po_batches.start_date ASC` lalu `order_date ASC`, dilengkapi dropdown Filter PO, badge nama PO, dan banner informasi bila ada pesanan yang tertahan oleh gerbang PO terbuka.
   - **Gudang & Purchasing (`/gudang`, `/purchasing`):** Permohonan stok otomatis memiliki `stock_requests.po_batch_id` dari order induk. Tersedia filter PO, badge nama PO, serta dialog konfirmasi 1-kali bila staf mengajukan kebutuhan dari PO yang masih berjalan. Panel **Daftar Belanja PO** (`get_po_purchase_list`) di halaman detail PO merangkum total kebutuhan bahan vs realisasi belanja.

### 7.5 Tiga Laporan Manajerial Batch PO

1. **Laporan Harian (`get_po_daily_report`):**
   - Menampilkan total pesanan dan pcs pada tanggal kalender yang dipilih, disertai kartu-kartu kumulatif untuk masing-masing PO aktif yang mencakup tanggal tersebut (array `pos`).
   - Tabel pesanan harian mencantumkan kolom/badge Batch PO.
2. **Laporan Tutup PO (`get_po_close_report`):**
   - Evaluasi komprehensif satu batch PO (saat berjalan maupun setelah closed).
   - Menyajikan pemenuhan kuota vs aktual pcs, total omzet, rincian biaya (upah potong, jahit, QC, dan HPP bahan baku), estimasi laba kotor, margin %, serta daftar pesanan.
   - Membaca data dinamis saat PO `open`, dan membaca `close_snapshot` terkunci saat PO `closed`.
3. **Laporan Bulanan (`get_po_monthly_report`):**
   - Agregasi seluruh PO yang terdaftar pada bulan laporan (`period_year` dan `period_month`).
   - Tabel performa menyajikan perbandingan antar-PO: Kuota, Realisasi Pcs, Omzet, Upah Potong, Upah Jahit, Upah QC/Finishing, Pembelian Bahan Baku, Total Biaya, Laba Kotor, dan Margin %.
   - **Atribusi Pembelian Bahan Baku Per Item:** Dihitung langsung dari item pembelian fisik (`purchasing_report_items` & `supplier_purchase_items` melalui `stock_requests.po_batch_id`).
   - **Pemisahan Biaya Tanpa PO:** Pembelian bahan baku tanpa PO ditampilkan terpisah dalam kartu *"Pembelian Bahan Baku (Tidak Terkait PO)"* (`unlinked_material_purchases`), dan upah borongan tanpa order ID ditampilkan dalam kartu *"Upah Borongan (Tidak Terkait PO)"* (`unlinked_piecework_wages`).
   - **Cetak Laporan A4:** Seluruh laporan dilengkapi tombol cetak dokumen A4 terstandar dengan paginasi fisik, header resmi, dan tanda tangan penanggung jawab.

### 7.6 Margin Estimasi vs Akuntansi Formal

- **Instrumen Manajerial Operasional:** Batch PO adalah alat ukur internal lantai produksi dan profitabilitas kasar per kloter pesanan. Angka laba kotor di laporan PO dihitung dari omzet pesanan dikurangi upah borongan dan pembelian bahan/HPP estimasi.
- **PO Bukan Periode Akuntansi:** Batch PO tidak membagi bagan akun (COA), tidak memotong buku besar, dan tidak memiliki saldo kas tersendiri. Periode akuntansi resmi tetap mengikuti bulan kalender melalui prosedur tutup buku (`close_accounting_period`).
- **Filter PO di Halaman Keuangan (`/financial`):**
  - Dropdown filter PO di `/financial` menyaring transaksi pembayaran pesanan (yang memiliki `order_id`) melalui join `transactions -> orders.po_batch_id`.
  - Transaksi non-order (beban operasional, gaji bulanan, kas kecil) tidak terikat pada PO dan otomatis disembunyikan saat filter PO aktif.
  - Filter ini bersifat analitis di antarmuka dan **tidak mengubah jurnal umum, buku besar, neraca, maupun mutasi kas riil**.

