# Rancangan: Akuntansi Dasar (COA, Jurnal Umum, Buku Besar, Aset Tetap, Pengembalian Uang Pelanggan)

- Tanggal: 2026-10-06 (diperbarui 2026-10-07)
- Status: Disetujui (siap dikerjakan bertahap mulai Fase A; baris pajak ditunda sampai ada arahan konsultan pajak)
- Dokumen pendamping: `RANCANGAN_LAPORAN_KEUANGAN.md` (isi laporan keuangan; menggantikan definisi laporan di dokumen ini)
- Domain pemilik: **AKUNTANSI** (file domain baru `docs/AKUNTANSI.md`; wajib didaftarkan di `docs/README.md` dan `AGENT_INSTRUCTIONS.md` §2, lihat §10)
- Lokasi file saat disetujui: `docs/rancangan/RANCANGAN_AKUNTANSI_DASAR.md`

> **Dasar rancangan ini.** Dibaca dari `sikon-app-dev.zip`: `docs/AGENT_INSTRUCTIONS.md`, `ORDER_DAN_KEUANGAN.md`, `ARSITEKTUR_TEKNIS.md`, `supabase/DATABASE.md`, migration `20260101000002_core_financial_and_orders` (termasuk `delete_order_payment` dan view `orders_with_balance`), `...0003_staff_warehouse_purchasing`, `...0004_payroll`, `20260923000003_fix_record_order_payment` (versi terbaru `record_order_payment`, `recompute_order_status`), `20260926000003_flow_approval_spj_direct_supplier`, `20260929000001_...` (versi terbaru `pay_weekly_payroll`, `toggle_order_stage`), `20261001100002_...` (versi terbaru `approve_purchasing_report`), `20261003180001_...` (versi terbaru `approve_stock_request_supplier`), serta `FinancialPage.tsx`, `useTransactions.ts`, `useFinanceSummary.ts`, `useOrders.ts` (`deleteOrder`), `OrdersPage.tsx`, `Sidebar.tsx`, `App.tsx`.
> **Terverifikasi (2026-10-07):** Database live linked (`xdojtfhkflbfuwmcjpwe`, 35 migration sinkron 1:1 antara lokal dan remote); view `orders_with_balance` & `sales_performance` serta `delete_order_payment` hanya didefinisikan di baseline (tidak ada penimpaan di migration setelahnya); `p_payment_method` di `PaymentModal.tsx` bernilai `'transfer'`, `'cash'`, `'qris'`, `'lainnya'`; `/financial` menyembunyikan tombol aksi hapus/edit jika `order_id` terisi (menampilkan teks "Otomatis dari Order"); nama kategori transaksi di `seed.sql` persis cocok dengan pemetaan §4.4.

---

## 1. Masalah

Keuangan SIKon sekarang hanya **buku kas** (`transactions`: `income`/`expense`). Dari kode, ada enam keterbatasan:

1. **Tidak ada neraca.** Tidak ada aset, liabilitas, atau ekuitas. Saldo kas dihitung `company_settings.saldo_awal + Σ income − Σ expense`, tanpa pemisahan kas dan bank.
2. **Belanja bahan langsung jadi beban.** `approve_purchasing_report` dan `approve_stock_request_supplier` mencatat `expense` penuh saat bayar. Stok bahan (yang naik saat Gudang konfirmasi) tidak pernah tampil sebagai aset, jadi belanja besar membuat bulan itu tampak rugi.
3. **Uang muka dan reversalnya menggelembungkan arus kas.** `approve_stock_request_spj` mencatat uang muka sebagai `expense`, lalu `approve_purchasing_report` mencatat `Reversal Uang Muka` sebagai `income` (`category_id = null`). Total pemasukan dan pengeluaran di `/financial` jadi lebih besar dari kenyataan, walau saldo kas benar.
4. **Piutang hanya hitungan di layar.** `FinancialPage.tsx` menjumlah `orders_with_balance.remaining_amount`. Tidak ada pencatatan, dan DP pelanggan tercatat sebagai `income` padahal barang belum dikirim.
5. **Tidak ada jejak aset tetap dan penyusutan** (mesin jahit, obras, kendaraan), dan ada transaksi tanpa kategori (`Jasa Purchasing`, `Reversal Uang Muka`).
6. **Order bisa dihapus tanpa penjagaan, dan tidak ada pengembalian uang.** `deleteOrder` di `useOrders.ts` membatalkan stock movement pending lalu memanggil `.delete()` langsung dari klien (dua langkah, tidak atomik, tanpa pengecekan di database). `order_payments` ikut terhapus (cascade), tetapi `transactions.order_id` hanya di-set null, sehingga uang tetap tercatat masuk. Tidak ada status "Dibatalkan" maupun fitur refund. Di pembukuan, ini meninggalkan Uang Muka Pelanggan yang tidak bisa ditelusuri.

Yang terdampak: pemilik/Finance yang butuh laporan posisi keuangan dan laba rugi yang bisa dipertanggungjawabkan.

---

## 2. Keputusan

### 2.1 Pendekatan: jurnal berpasangan (double-entry) di atas `transactions`, bukan menggantikannya

`transactions` tetap jadi buku kas dan sumber kebenaran arus kas. Setiap baris `transactions` otomatis melahirkan **satu jurnal sisi-kas** lewat trigger. Peristiwa non-kas (pengakuan pendapatan, DP hangus, penyesuaian persediaan, penyusutan) diposting oleh RPC/trigger tersendiri.

**Kenapa trigger di `transactions`, bukan mengubah semua RPC?** Ada 7+ tempat yang meng-insert `transactions` (`record_order_payment`, `approve_stock_request_spj`, `approve_purchasing_report`, `approve_stock_request_supplier`, `pay_weekly_payroll`, `pay_salary` lama, CRUD manual dari frontend lewat `useTransactions.ts`), ditambah alur pengembalian uang yang baru. Satu trigger menjaga buku kas dan buku besar selalu sinkron, termasuk untuk fitur yang belum ditulis. Hanya 2 RPC pencatatan yang perlu diubah (§5.2).

**Alternatif yang ditolak:**
- *Memposting jurnal dari tiap RPC:* 7+ fungsi ditulis ulang, mudah ada yang terlewat (jebakan "insert langsung ke tabel yang butuh efek samping", `AGENT_INSTRUCTIONS.md` §8).
- *Mengganti `transactions` dengan tabel jurnal:* memutus `FinancialPage`, `orders`, `cash_advances`, `weekly_payrolls` yang semuanya FK ke `transactions`.

### 2.2 Dasar pengakuan

| Hal | Perlakuan | Alasan |
|---|---|---|
| **Pendapatan** | Diakui saat order **dikirim** (`orders.production_status` jadi `completed`) | Gate di `toggle_order_stage` sudah mewajibkan lunas sebelum `kirim`, jadi saat itu piutang praktis nol |
| **Ongkos kirim** | Pendapatan terpisah (`4-1100`) | Keputusan pemilik |
| **DP / pembayaran sebelum kirim** | Liabilitas `Uang Muka Pelanggan` | Barang belum diserahkan |
| **Pengembalian uang pelanggan** | Mengurangi `Uang Muka Pelanggan` (uang keluar) | Kewajiban kepada pelanggan gugur karena dibayar kembali |
| **DP hangus** | Memindahkan sisa `Uang Muka Pelanggan` ke `Pendapatan Lain-lain` (tanpa uang bergerak) | Perusahaan menahan DP, kewajiban gugur, jadi menjadi pendapatan |
| **Belanja bahan** (SPJ dan Direct Supplier) | Aset `Persediaan Bahan Baku` langsung saat dibayar | Keputusan pemilik; konsisten untuk kedua alur |
| **HPP bahan** | **Metode periodik**: saat tutup bulan, `Persediaan` disesuaikan ke nilai stok fisik, selisihnya jadi `HPP Bahan Baku` | Tidak perlu mengubah RPC stok yang rawan bug. Susut dan retur cacat otomatis ikut jadi HPP |
| **Upah** | Upah borongan (`piecework_amount`) jadi HPP, sisanya `Beban Gaji & Upah` | `payroll_items` sudah memisahkan `piecework_amount` |
| **Uang muka purchasing** | Aset `Uang Muka Karyawan (Purchasing)`, bukan beban | Uang masih milik perusahaan sampai SPJ disetujui |
| **Kategori "Investasi"** (pemasukan) | Setoran modal pemilik (ekuitas `Modal Disetor`) | Keputusan pemilik; bukan pendapatan |
| **HPP per order (`hpp_total_snapshot`)** | **Tidak diposting** | Itu harga pokok standar untuk analisis margin; kalau diposting, bahan dan upah terhitung dua kali |
| **Basis** | Akrual-ringan, tahun fiskal = tahun kalender | Cukup untuk neraca dan laba rugi dasar |

### 2.3 Fase implementasi

| Fase | Isi | Hasil yang bisa dipakai |
|---|---|---|
| **A. Fondasi** | COA, pengaturan akuntansi, inti jurnal, jurnal otomatis dari `transactions`, saldo awal, Jurnal Umum (daftar + manual + balik jurnal), Buku Besar, Neraca Saldo, **penjagaan hapus order + pengembalian uang + DP hangus** | Buku besar akurat dan cocok dengan saldo kas; order tidak lagi meninggalkan sisa uang yang tak bertuan |
| **B. Akrual dan laporan** | Pengakuan pendapatan saat kirim, split upah, tutup bulan + penyesuaian persediaan + kunci periode, laporan (lihat dokumen pendamping) | Neraca dan laba rugi bulanan |
| **C. Aset tetap** | Register aset, penyusutan garis lurus bulanan, pelepasan aset | Aset tetap dan beban penyusutan di laporan |

**Aktivasi:** `init_accounting` baru dijalankan setelah Fase A dan B lulus uji (§7). Tanggal mulai pembukuan yang diputuskan pemilik adalah **2026-11-01**. Kalau Fase A dan B belum siap pada waktunya, geser ke awal bulan berikutnya (`books_start_date` wajib tanggal 1), jangan mengaktifkan akuntansi setengah jadi.

### 2.4 Keputusan pemilik (2026-10-06)

| Topik | Keputusan |
|---|---|
| Pengakuan pendapatan | Saat order dikirim |
| Ongkos kirim | Pendapatan terpisah |
| Kategori "Investasi" | Setoran modal pemilik |
| Upah borongan | Masuk HPP |
| Pembelian Direct Supplier | Langsung ke Persediaan saat dibayar |
| Tanggal mulai pembukuan | 2026-11-01. Database saat ini masih data uji, tidak ada data produksi yang dipindahkan |
| Kas dan Bank | Dipisah (kolom opsional "Dibayar via", default Bank) |
| Order yang sudah dibayar dihapus | Diblokir; diganti alur pengembalian uang (cakupan minimal) |
| DP saat pelanggan batal | Ada aksi **DP hangus** (menjadi Pendapatan Lain-lain) |
| Tahun fiskal | Tahun kalender, tanpa jurnal penutup tahunan (laba tahun berjalan dihitung dinamis) |
| Dokumentasi | File domain baru `AKUNTANSI.md` |
| Keputusan laporan (arus kas, format unduhan, dll.) | Lihat `RANCANGAN_LAPORAN_KEUANGAN.md` §2.7 |

---

## 3. Aturan bisnis keras

1. **Setiap jurnal harus seimbang** (Σ debit = Σ kredit). Ditolak di RPC dan dijaga constraint trigger sebagai jaring pengaman.
2. **Jurnal tidak boleh di-insert/update/delete langsung dari frontend.** Hak tulis dicabut dari `authenticated`; semua lewat RPC `security definer`.
3. **Jurnal manual tidak bisa diedit atau dihapus**, hanya **dibalik** (`reverse_journal_entry`) dengan alasan wajib.
4. **Periode terkunci:** transaksi dan jurnal dengan tanggal ≤ `accounting_settings.locked_through` tidak bisa dibuat, diubah, atau dihapus. Pesan: *"Periode akuntansi sampai YYYY-MM-DD sudah ditutup. Buka kembali periode atau gunakan jurnal koreksi bertanggal setelahnya."*
5. **Tanggal sebelum `books_start_date` tidak dijurnal.** Pembukuan dimulai dari saldo awal, bukan dari seluruh sejarah.
6. **Akun sistem tidak bisa dihapus** (`is_system = true`), tidak bisa dinonaktifkan (`is_active = false`), dan atribut klasifikasinya (`report_group`, `is_cash`, `cash_flow_activity`) terkunci. Akun yang sudah dipakai jurnal hanya bisa dinonaktifkan dan tipenya tidak bisa diubah.
7. **Jurnal otomatis dari `transactions` mengikuti transaksinya:** ubah `amount/type/tanggal/kategori/akun` atau hapus transaksi, jurnalnya dibuat ulang/dihapus (selama periode terbuka).
8. **Kategori transaksi wajib punya akun.** Kategori tanpa akun, atau transaksi tanpa kategori, jatuh ke `9-9999 Penampung (Belum Diklasifikasi)` dan memunculkan peringatan merah. Trigger **tidak pernah menolak** transaksi hanya karena pemetaan akun kosong, supaya alur SPJ/payroll yang sudah jalan tidak rusak.
9. **Akuntansi baru aktif setelah pemilik menekan "Aktifkan"** (`init_accounting`). Sebelum itu, trigger tidak melakukan apa pun, jadi migration aman dijalankan lebih dulu.
10. **Logika multi-tabel di Postgres**, laporan dihitung di SQL (RPC), bukan di frontend (`AGENTS.md`, prinsip 1).
11. **Order tidak bisa dihapus selama masih memegang uang pelanggan**, yaitu bila `Σ order_payments > Σ order_deposit_releases` untuk order itu. Berlaku di database (trigger + RPC `delete_order`), bukan hanya di tombol. Order tanpa pembayaran, atau yang semua uangnya sudah dikembalikan/dihanguskan, tetap bisa dihapus. **Perubahan perilaku:** order yang sudah dikirim (pembayarannya sudah menjadi pendapatan) tidak bisa lagi dihapus.
12. **Pelepasan DP** (kembalikan atau hangus) hanya untuk order yang belum `completed`, dengan nominal ≤ sisa dana pelanggan (`Σ pembayaran − Σ pelepasan`), dan tidak di periode terkunci.
13. **Menghapus pembayaran (`delete_order_payment`) ditolak** bila membuat `Σ pembayaran < Σ pelepasan`. Pesan: *"Pembayaran ini sudah sebagian dikembalikan atau dihanguskan. Batalkan pelepasan DP terlebih dahulu."*
14. **Retur penjualan setelah barang dikirim tidak ditangani** (di luar cakupan, lihat §9).

---

## 4. Perubahan data

### 4.1 Tabel baru

Semua: `user_id` + RLS `auth.uid() = user_id`. Tabel jurnal dan `order_deposit_releases` hanya policy `select` (bukan `for all`) dan `revoke insert, update, delete from authenticated` secara eksplisit, karena `alter default privileges` di `ARSITEKTUR_TEKNIS.md` §2.2 otomatis memberi semua hak ke tabel baru.

**`accounts`** (Bagan Akun / COA)

| Kolom | Keterangan |
|---|---|
| `code` | `varchar`, contoh `1-1100`. `unique (user_id, code)` |
| `name` | Nama akun |
| `account_type` | `asset`, `liability`, `equity`, `revenue`, `expense` (check). Saldo normal diturunkan: asset/expense = debit, sisanya kredit |
| `report_group` | `current_asset`, `fixed_asset`, `contra_asset`, `current_liability`, `equity`, `revenue`, `cogs`, `opex`, `other`, `suspense`. Wajib dipilih saat membuat akun baru, sesuai `account_type` |
| `is_cash` | `true` untuk Kas dan Bank. Dipakai laporan arus kas |
| `cash_flow_activity` | `operating` (default), `investing` (akun aset tetap), `financing` (Modal Disetor, Prive, Hutang Lain-lain). Dipakai laporan arus kas |
| `is_system`, `is_active` | Lihat aturan keras 6 |

**`accounting_settings`** (satu baris per user, select-only dari klien, penulisan oleh RPC)

| Kolom | Keterangan |
|---|---|
| `enabled` | `false` sampai `init_accounting` |
| `books_start_date` | Tanggal mulai pembukuan (wajib tanggal 1). Usulan awal 2026-11-01 |
| `locked_through` | Tanggal terakhir yang terkunci (nullable) |
| `default_cash_account_id` | Default `Bank` untuk transaksi yang tidak menyebut kas/bank |

**`journal_entries`**

| Kolom | Keterangan |
|---|---|
| `entry_no` | `JU-YYYYMM-NNNN`, dihitung di dalam RPC dengan advisory lock |
| `entry_date`, `description` | |
| `source_type` | `manual`, `transaction`, `opening_balance`, `order_revenue`, `order_forfeit`, `payroll_split`, `inventory_adjustment`, `depreciation`, `asset_disposal`, `reversal` (check) |
| `source_id` | `uuid` tanpa FK (sumber bisa terhapus). Partial unique index `(source_type, source_id)` untuk `transaction`, `order_revenue`, `order_forfeit`, `payroll_split` |
| `reverses_entry_id` | FK ke jurnal yang dibalik |

**`journal_lines`**

| Kolom | Keterangan |
|---|---|
| `entry_id` | FK `on delete cascade` |
| `account_id` | FK ke `accounts` |
| `debit`, `credit` | `numeric >= 0`; check: salah satu nol dan salah satu positif |
| `memo`, `line_no` | |

Constraint trigger *deferred* memastikan Σ debit = Σ kredit per `entry_id` saat commit.

**`order_deposit_releases`** (pelepasan DP; Fase A)

| Kolom | Keterangan |
|---|---|
| `order_id` | FK ke `orders` `on delete cascade` |
| `kind` | `refund` (uang dikembalikan) atau `forfeit` (DP hangus) (check) |
| `amount` | `numeric > 0` |
| `release_date` | |
| `payment_method` | Wajib untuk `refund` (menentukan Kas/Bank) |
| `transaction_id` | FK ke `transactions` **`on delete restrict`**. Wajib terisi untuk `refund`, null untuk `forfeit` (check) |
| `notes`, `created_at` | |

**`inventory_valuations`** (Fase B): `period_end`, `total_value`, `detail jsonb` (per material/warna: qty, harga, nilai), `journal_entry_id`. Jejak audit nilai persediaan saat tutup bulan.

**`fixed_assets`** (Fase C): `name`, `asset_account_id`, `accumulated_account_id`, `expense_account_id`, `acquisition_date`, `cost`, `salvage_value`, `useful_life_months`, `status` (`active`/`disposed`), `disposed_at`, `transaction_id`, `notes`.

**`fixed_asset_depreciations`** (Fase C): `asset_id`, `period` (tanggal 1 bulan), `amount`, `journal_entry_id`. `unique (asset_id, period)` supaya posting ulang idempotent.

### 4.2 Kolom baru di tabel lama

| Tabel | Kolom | Fungsi |
|---|---|---|
| `transaction_categories` | `account_id uuid null references accounts(id) on delete restrict` | Pemetaan kategori → akun lawan |
| `transactions` | `cash_account_id uuid null references accounts(id) on delete restrict` | Kas atau Bank. Null = default di pengaturan |
| `transactions` | `counter_account_id uuid null references accounts(id) on delete restrict` | Menimpa akun dari kategori (dipakai Reversal Uang Muka, pembelian aset) |

### 4.3 Bagan Akun awal (33 akun, di-seed oleh `init_accounting`)

| Kode | Nama | Tipe / grup |
|---|---|---|
| 1-1100 | Kas | asset / current_asset (`is_cash`) |
| 1-1200 | Bank | asset / current_asset (`is_cash`) |
| 1-1300 | Piutang Usaha | asset / current_asset |
| 1-1400 | Uang Muka Karyawan (Purchasing) | asset / current_asset |
| 1-1500 | Persediaan Bahan Baku | asset / current_asset |
| 1-2100 / 1-2110 | Mesin & Peralatan / Akum. Penyusutan Mesin | asset / fixed_asset, contra_asset |
| 1-2200 / 1-2210 | Kendaraan / Akum. Penyusutan Kendaraan | idem |
| 1-2300 / 1-2310 | Inventaris & Perabot / Akum. Penyusutan Inventaris | idem |
| 1-2400 / 1-2410 | Bangunan / Akum. Penyusutan Bangunan | idem |
| 2-1100 | Hutang Usaha | liability / current_liability |
| 2-1200 | Uang Muka Pelanggan | liability / current_liability |
| 2-1300 | Hutang Lain-lain | liability / current_liability |
| 3-1000 | Modal Disetor | equity |
| 3-2000 | Laba Ditahan (penyeimbang saldo awal) | equity |
| 3-3000 | Prive | equity |
| 4-1000 | Penjualan | revenue |
| 4-1100 | Pendapatan Ongkos Kirim | revenue |
| 4-2000 | Pendapatan Jasa | revenue |
| 4-9000 | Pendapatan Lain-lain (termasuk DP hangus) | revenue / other |
| 5-1000 | HPP Bahan Baku | expense / cogs |
| 5-1100 | Upah Borongan Produksi | expense / cogs |
| 6-1000 | Beban Gaji & Upah | expense / opex |
| 6-2000 | Beban Operasional | expense / opex |
| 6-3000 | Beban Sewa | expense / opex |
| 6-4000 | Beban Pemasaran | expense / opex |
| 6-5000 | Beban Utilitas | expense / opex |
| 6-6000 | Beban Penyusutan | expense / opex |
| 6-9000 | Beban Lain-lain | expense / other |
| 9-9999 | Penampung (Belum Diklasifikasi) | asset / suspense |

Pemilik bisa menambah akun sendiri; akun di atas bertanda `is_system`. Akun pajak sengaja belum ada (menunggu konsultasi, §8).

### 4.4 Pemetaan kategori awal

`init_accounting` memetakan kategori yang ada **berdasarkan nama** (idempotent, hanya mengisi `account_id` yang masih null).

| Kategori transaksi | Akun |
|---|---|
| Pembayaran Order | *Khusus*, ditentukan trigger (lihat §5.1) |
| Penjualan | 4-1000 |
| Jasa / Konsultasi | 4-2000 |
| Pendapatan Lain | 4-9000 |
| **Investasi** | **3-1000 Modal Disetor** (keputusan pemilik) |
| Uang Muka Purchasing | 1-1400 |
| Pembelian Kain / Kancing / Benang | 1-1500 |
| Gaji Karyawan | 6-1000 (dipecah saat payroll dibayar, lihat §5.1) |
| Operasional, Lain-lain | 6-2000, 6-9000 |
| Sewa Tempat, Marketing, Utilitas | 6-3000, 6-4000, 6-5000 |
| Jasa Purchasing (kategori sistem baru, dibuat di §5.2) | 6-2000 |
| **Pengembalian Uang Pelanggan** (kategori sistem baru, dibuat oleh `release_order_deposit`) | **2-1200 Uang Muka Pelanggan** |
| Kategori buatan pengguna | Wajib pilih akun di `TransactionCategoryModal` |
| Tanpa kategori | 9-9999 |

Kategori sistem yang dibuat setelah `init_accounting` (mis. `Pengembalian Uang Pelanggan`) langsung diberi `account_id` oleh RPC pembuatnya, supaya tidak jatuh ke Penampung.

### 4.5 Aturan posting (peristiwa → jurnal)

| # | Peristiwa | Debit | Kredit | Pemicu |
|---|---|---|---|---|
| 1 | DP/pembayaran order **sebelum** kirim | Kas/Bank | 2-1200 Uang Muka Pelanggan | trigger `transactions` |
| 2 | Pembayaran order **setelah** kirim | Kas/Bank | 1-1300 Piutang Usaha | trigger `transactions` |
| 3 | Order dikirim (`completed`) | 2-1200 (sebesar `min(dibayar bersih, grand_total)`), 1-1300 (sisa, normalnya 0) | 4-1000 (`total_price`), 4-1100 (`ongkir`) | trigger `orders` |
| 4 | **Pengembalian uang pelanggan** | 2-1200 | Kas/Bank | trigger `transactions` (kategori `Pengembalian Uang Pelanggan`) |
| 5 | **DP hangus** | 2-1200 | 4-9000 Pendapatan Lain-lain | trigger `order_deposit_releases` |
| 6 | Uang muka purchasing cair | 1-1400 | Kas/Bank | trigger `transactions` |
| 7 | SPJ disetujui: belanja kategori Pembelian | 1-1500 | Kas/Bank | trigger `transactions` |
| 8 | SPJ disetujui: jasa purchasing | 6-2000 | Kas/Bank | trigger `transactions` (kategori diisi di §5.2) |
| 9 | SPJ disetujui: reversal uang muka | Kas/Bank | 1-1400 | trigger `transactions` + `counter_account_id` |
| 10 | Direct Supplier lunas di muka | 1-1500 | Kas/Bank | trigger `transactions` |
| 11 | Payroll dibayar | 5-1100 (`Σ piecework_amount`), 6-1000 (sisa) | Kas/Bank | trigger `weekly_payrolls` (mengganti jurnal dari trigger transaksi) |
| 12 | **Setoran modal** (kategori Investasi) | Kas/Bank | 3-1000 Modal Disetor | trigger `transactions` |
| 13 | Transaksi manual lain | sesuai kategori | sesuai kategori | trigger `transactions` |
| 14 | Tutup bulan: stok fisik < saldo Persediaan | 5-1000 HPP Bahan | 1-1500 | `close_accounting_period` |
| 15 | Tutup bulan: stok fisik > saldo Persediaan | 1-1500 | 5-1000 HPP Bahan | `close_accounting_period` |
| 16 | Penyusutan bulanan | 6-6000 | 1-x110 Akum. Penyusutan | `close_accounting_period` |
| 17 | Beli aset tetap | 1-2x00 | Kas/Bank | `register_fixed_asset` |
| 18 | Jurnal umum manual | bebas | bebas | `post_journal_entry` |

Untuk `income`: Debit Kas/Bank, Kredit akun lawan. Untuk `expense`: Debit akun lawan, Kredit Kas/Bank. "Dibayar bersih" = `Σ order_payments − Σ order_deposit_releases`.

Contoh alur SPJ lengkap (uang muka tidak lagi menggelembungkan laba): uang muka Rp 1.000.000 → Dr 1-1400 / Cr Kas. Nota Rp 900.000 disetujui → Dr 1-1500 900.000 / Cr Kas 900.000; reversal → Dr Kas 1.000.000 / Cr 1-1400 1.000.000. Hasil: 1-1400 = 0, Persediaan +900.000, kas turun 900.000.

Contoh pembatalan order: DP Rp 5.000.000 → Dr Bank / Cr 2-1200. Kembalikan Rp 3.000.000 → Dr 2-1200 / Cr Bank 3.000.000. DP hangus Rp 2.000.000 → Dr 2-1200 / Cr 4-9000 2.000.000. Hasil: 2-1200 untuk order itu = 0, kas turun 3.000.000 (kembali ke pelanggan), pendapatan lain 2.000.000. Order lalu boleh dihapus.

### 4.6 Saldo awal

Wizard `suggest_opening_balance(p_books_start_date)` menghitung usulan; pemilik mengoreksi dan memposting satu jurnal `opening_balance` bertanggal `books_start_date`:

| Akun | Usulan otomatis dari |
|---|---|
| Kas, Bank | `saldo_awal + Σ income − Σ expense` sebelum tanggal mulai (pemilik membagi ke Kas/Bank) |
| 1-1400 Uang Muka Karyawan | `Σ cash_advances.amount where status = 'outstanding'` |
| 1-1500 Persediaan | `Σ (stok efektif × materials.price)`; stok efektif memakai rumus `GUDANG_DAN_PURCHASING.md` §3.3 |
| 2-1200 Uang Muka Pelanggan | `Σ (pembayaran − pelepasan DP)` untuk order yang belum `completed` |
| Aset tetap, hutang, modal | Input manual |
| 3-2000 Laba Ditahan | **Penyeimbang otomatis** (aset − liabilitas − ekuitas lain) |

### 4.7 Aktivasi dan data uji

Database saat ini hanya berisi data uji, jadi **tidak ada data produksi yang perlu dibackfill**. Transaksi uji bertanggal sebelum 2026-11-01 tidak dijurnal. Saldo awal diisi dari kondisi nyata per 1 November. Fungsi backfill (menjurnal semua `transactions` bertanggal ≥ `books_start_date`, idempotent lewat unique index `source`) tetap disediakan di `init_accounting` untuk lingkungan dev yang diaktifkan dengan tanggal mulai lebih awal dari data yang ada.

---

## 5. Perubahan RPC / trigger

### 5.1 Trigger

| Nama | Tabel / kejadian | Perilaku |
|---|---|---|
| `trg_journal_balanced` | `journal_lines`, constraint trigger *deferred* | Tolak commit kalau jurnal tidak seimbang |
| `trg_journal_from_transaction` | `transactions` after insert / update of (`amount`, `type`, `transaction_date`, `category_id`, `order_id`, `cash_account_id`, `counter_account_id`) / delete | Buat, buat-ulang, atau hapus jurnal #1, 2, 4, 6–10, 12, 13. No-op kalau `enabled = false` atau tanggal < `books_start_date`. Tolak kalau tanggal lama/baru ≤ `locked_through`. **Validasi keamanan:** trigger wajib memastikan akun yang dipakai (`counter_account_id`, `cash_account_id`, dan `account_id` dari kategori) milik `user_id` yang sama. **Akun lawan:** `counter_account_id` → bila `type = 'income'` dan `order_id` terisi: `1-1300 Piutang` jika `orders.production_status = 'completed'`, kalau belum `2-1200 Uang Muka Pelanggan` → `transaction_categories.account_id` → `9-9999`. Aturan order hanya untuk income; pengembalian uang (expense) memakai pemetaan kategori |
| `trg_journal_order_revenue` | `orders` after update of `production_status`, `total_price`, `ongkir` | Menjadi `completed`: posting #3. Keluar dari `completed`: hapus jurnalnya (selama terbuka). Total/ongkir berubah saat `completed`: buat ulang |
| `trg_journal_order_forfeit` | `order_deposit_releases` after insert / delete, hanya `kind = 'forfeit'` | Posting/hapus jurnal #5 (`source_type = 'order_forfeit'`). Tolak bila periode terkunci |
| `trg_journal_payroll_split` | `weekly_payrolls` after update of `status`, `transaction_id` | Saat `paid`: ganti jurnal sisi-kas transaksi payroll dengan jurnal terpecah #11 |
| `trg_guard_order_delete` | `orders` before delete | Tolak bila `Σ order_payments > Σ order_deposit_releases` untuk order itu (aturan keras 11). Jaring pengaman untuk jalur hapus selain `delete_order`. `TRUNCATE` di `clear.sql` tidak terkena trigger baris |

Semua fungsi trigger: `security definer set search_path = public`, `revoke execute ... from public, anon, authenticated`.

**Kenapa payroll lewat trigger `weekly_payrolls`, bukan mengubah `pay_weekly_payroll`?** Fungsi itu meng-insert transaksi dulu, baru meng-update `weekly_payrolls.transaction_id`. Trigger di `weekly_payrolls` aktif tepat setelah kedua data tersedia, tanpa menyentuh fungsi yang sudah stabil.

### 5.2 RPC/objek lama yang diubah

Semua dengan `create or replace` dan signature yang sama (tidak perlu `drop function`, tidak ada risiko `PGRST203`). **Salin body versi terbaru** dari file yang disebut, bukan dari migration lama.

| Objek | Versi terbaru ada di | Perubahan |
|---|---|---|
| `approve_purchasing_report(uuid)` | `20261001100002_convert_purchase_receipts_to_base_units` | (a) insert `Reversal Uang Muka` diberi `counter_account_id` = akun 1-1400; (b) insert `Jasa Purchasing` diberi kategori `Jasa Purchasing` (dibuat otomatis seperti pola `Uang Muka Purchasing`, dipetakan ke 6-2000). Isi lainnya tidak diubah |
| `record_order_payment(uuid, numeric, text, date, text, uuid)` | `20260923000003_fix_record_order_payment` | Isi `transactions.cash_account_id` dari `p_payment_method` (cash → Kas, selain itu → Bank; **cek nilai persis di `PaymentModal.tsx`**) |
| `delete_order_payment(uuid)` | `20260101000002_core_financial_and_orders` (belum pernah didefinisikan ulang; cek `grep`) | Tambah penolakan aturan keras 13. Perilaku lain sama (hapus transaksi, hapus pembayaran, `recompute_order_status`) |
| `recompute_order_status(uuid)` | `20260923000003_fix_record_order_payment` | Hitung "dibayar" sebagai `Σ pembayaran − Σ pelepasan DP` (bersih) |
| View `orders_with_balance`, `sales_performance` | `20260101000002_core_financial_and_orders` (terverifikasi tidak ada migration penimpa) | `paid_amount` menjadi bersih (`coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)`). `create or replace view` mempertahankan daftar dan urutan kolom yang sama persis (tanpa menyisipkan kolom baru di tengah) agar tidak gagal di Postgres, tetap `security_invoker = true`. Akibat: order yang uangnya sudah dikembalikan kembali tampil "belum dibayar" sampai dihapus |

*Catatan frontend:* `useOrders.ts` membaca `orders_with_balance` dengan `select *` dan mengakses `order_type`. Penyesuaian view mempertahankan kolom yang ada tanpa mengubah urutan/tipe kolom.

### 5.3 RPC baru

Semua: `security definer`, cek `auth.uid()`, `revoke ... from public, anon`, `grant execute ... to authenticated`.

| RPC | Fase | Fungsi |
|---|---|---|
| `init_accounting(p_books_start_date date)` | A | Seed COA, petakan kategori, buat/aktifkan `accounting_settings`, backfill. Idempotent. Menolak tanggal yang bukan tanggal 1 |
| `post_journal_entry(p_date, p_description, p_lines jsonb)` | A | Jurnal manual. Validasi seimbang, akun aktif, minimal 2 baris, periode terbuka |
| `reverse_journal_entry(p_entry_id, p_reason)` | A | Jurnal pembalik bertanggal hari ini (atau setelah `locked_through`) |
| `suggest_opening_balance(p_books_start_date)` | A | Usulan angka §4.6 |
| `post_opening_balance(p_date, p_lines jsonb)` | A | Satu jurnal `opening_balance`; Laba Ditahan jadi penyeimbang |
| `get_trial_balance(p_from, p_to)` | A | Saldo awal, mutasi, saldo akhir per akun |
| `get_general_ledger(p_account_id, p_from, p_to)` | A | Mutasi + saldo berjalan satu akun |
| **`release_order_deposit(p_order_id uuid, p_kind text, p_amount numeric, p_date date default current_date, p_payment_method text default null, p_notes text default null)`** | A | Validasi aturan keras 12. `refund`: buat kategori `Pengembalian Uang Pelanggan` bila belum ada (dengan `account_id`), insert `transactions` (expense, `order_id`, `cash_account_id` dari metode), insert pelepasan. `forfeit`: insert pelepasan (trigger memposting jurnal). Lalu `recompute_order_status` |
| **`delete_order_deposit_release(p_release_id uuid)`** | A | Membatalkan pelepasan yang salah: hapus pelepasan dan transaksinya, `recompute_order_status`. Ditolak di periode terkunci |
| **`delete_order(p_order_id uuid)`** | A | **Atomik** (satu transaksi): cek kepemilikan, cek aturan keras 11, batalkan `stock_movements` pending milik order, batalkan `stock_requests` berstatus `draft_auto` milik order (permintaan yang sudah disetujui atau dicairkan dibiarkan dan FK `source_order_id` otomatis di-set null oleh DB), lalu hapus order. Menggantikan dua langkah `deleteOrder` di klien |
| `close_accounting_period(p_period_end date)`, `reopen_accounting_period(p_locked_through date)` | B | Lihat dokumen pendamping dan §2.2: snapshot nilai stok, penyesuaian persediaan #14/15, penyusutan, set kunci |
| Fungsi internal nilai stok fisik `acc_inventory_value(p_as_of)` | B | Σ (stok efektif × `materials.price`) per warna; dipakai tutup bulan dan estimasi laporan |
| `register_fixed_asset(...)`, `dispose_fixed_asset(p_asset_id, p_date, p_proceeds)` | C | Beli aset (insert transaksi + `counter_account_id` + jurnal #17); pelepasan (Dr Kas hasil, Dr Akumulasi, Cr Aset, selisih ke `4-9000`/`6-9000`) |
| Laporan: `get_income_statement`, `get_balance_sheet`, `get_cash_flow`, `get_equity_changes`, `get_report_notes`, `get_accounting_checks` | B/C | **Didefinisikan lengkap di `RANCANGAN_LAPORAN_KEUANGAN.md`.** Jangan didefinisikan ulang di sini |

---

## 6. Perubahan UI

Route baru **`/akuntansi`** (grup sidebar "Transaksi", di bawah Keuangan; ikon `BookOpen`/`Scale` dari lucide-react). Halaman `AccountingPage.tsx` memakai pola tab seperti `PayrollPage.tsx`. Komponen di `src/components/accounting/`, hook di `src/hooks/` (`useAccounts`, `useJournalEntries`, `useAccountingReports`, `useFixedAssets`). Tipe baru di `src/types.ts`; regenerasi `integrations/supabase/types.ts`.

| Tab | Fase | Isi |
|---|---|---|
| **Ringkasan** | A/B | Status aktif/belum, tanggal mulai, `locked_through`, panel Cek Konsistensi (badge hijau/merah), tombol "Aktifkan Akuntansi" (wizard tanggal + saldo awal) |
| **Jurnal Umum** | A | Tabel jurnal (filter tanggal, sumber, cari nomor/uraian), baris bisa dibuka melihat debit/kredit, badge sumber (Otomatis/Manual), tombol **Buat Jurnal** (form baris dinamis, total debit/kredit live, tombol simpan mati kalau tidak seimbang) dan **Balik Jurnal** |
| **Buku Besar** | A | Pilih akun + rentang tanggal → mutasi dan saldo berjalan; klik baris → buka jurnal sumber |
| **Neraca Saldo** | A | Tabel per akun; baris total debit = kredit |
| **Laporan** | B | Didefinisikan di `RANCANGAN_LAPORAN_KEUANGAN.md` |
| **Aset Tetap** | C | Register aset, nilai buku, tombol Tambah Aset / Lepas Aset, status penyusutan per bulan |
| **Akun** | A | Daftar COA, tambah/nonaktifkan akun (wajib pilih `report_group`), lihat saldo |
| **Tutup Buku** | B | Pilih akhir bulan → pratinjau nilai persediaan + penyusutan → konfirmasi; tombol Buka Kembali |

### 6.1 Perubahan di halaman lama

- `TransactionCategoryModal.tsx` + `TransactionCategoryList.tsx`: tambah select **Akun Akuntansi** (wajib untuk kategori baru, difilter sesuai tipe income/expense).
- `TransactionModal.tsx`: tambah select opsional **Dibayar via** (Kas/Bank).
- `FinancialPage.tsx`: logika tidak diubah; label dan tautan laporan diatur di dokumen pendamping §6.5.
- **`useOrders.ts` (`deleteOrder`) dan `OrdersPage.tsx`:** `deleteOrder` memanggil RPC `delete_order`, bukan dua langkah di klien. Pesan error dari database ditampilkan apa adanya. Teks konfirmasi hapus tidak lagi menyebut "pembayaran ikut terhapus". Ketika ditolak karena order masih memegang uang, tampilkan pesan *"Order ini masih memegang uang pelanggan Rp X. Kembalikan uang atau tandai DP hangus terlebih dahulu."* dengan tombol pintas membuka modal pelepasan DP.
- **Komponen baru `OrderDepositReleaseModal`** (di `src/components/orders/`): dibuka dari aksi order "Kembalikan Uang / DP Hangus" (tampil bila sisa dana pelanggan > 0 dan order belum `completed`). Pilihan jenis (Kembalikan uang | DP hangus), nominal (default sisa dana), tanggal, metode (hanya untuk kembalikan uang), catatan. Menampilkan sisa dana sebelum dan sesudah.
- **Detail order:** riwayat pelepasan DP (jenis, tanggal, nominal, catatan) dengan aksi **Batalkan** per baris (memanggil `delete_order_deposit_release`).
- **`/financial`:** transaksi `Pengembalian Uang Pelanggan` muncul sebagai pengeluaran biasa. **Cek saat implementasi** bagaimana tombol hapus transaksi menangani baris yang `order_id`-nya terisi; baris yang terhubung ke pelepasan DP ditolak database (`on delete restrict`), jadi pastikan pesan error terbaca dan mengarahkan ke halaman order.

**Pesan error penting:** periode terkunci (aturan keras 4); jurnal tidak seimbang (*"Total debit Rp X tidak sama dengan total kredit Rp Y"*); akun nonaktif; order masih memegang uang (aturan 11); pelepasan melebihi sisa dana (*"Nominal melebihi sisa dana pelanggan Rp X"*); order sudah dikirim (*"Order sudah dikirim, DP tidak dapat dikembalikan dari sini"*).

---

## 7. Kasus uji

**Sukses**
1. `init_accounting('2026-11-01')` pada DB hasil `clear.sql` + `seed.sql`: COA 33 akun terbentuk, kategori seed terpetakan (Investasi → 3-1000), dijalankan dua kali tidak menggandakan.
2. Transaksi bertanggal 2026-10-31 tidak dijurnal; transaksi bertanggal 2026-11-01 dijurnal.
3. Bayar DP Rp 500.000 untuk order belum kirim: jurnal Dr Bank / Cr 2-1200. Dengan metode `cash`: Dr Kas. Hapus lewat `delete_order_payment`: jurnal ikut hilang.
4. Kirim order bernilai Rp 2.000.000 + ongkir Rp 50.000, lunas: Dr 2-1200 2.050.000 / Cr 4-1000 2.000.000 + Cr 4-1100 50.000. Saldo 2-1200 untuk order itu menjadi 0.
5. Alur SPJ lengkap (§4.5): saldo 1-1400 kembali 0, Persediaan naik sebesar nota.
6. Direct Supplier lunas Rp 3.000.000: Dr 1-1500 / Cr Bank.
7. Payroll Rp 3.000.000 dengan `Σ piecework_amount` Rp 2.000.000: Dr 5-1100 2.000.000, Dr 6-1000 1.000.000, Cr Bank 3.000.000, hanya satu jurnal untuk transaksi itu.
8. Pemasukan kategori `Investasi` Rp 10.000.000: Dr Bank / Cr 3-1000; tidak muncul di Laba Rugi.
9. Tutup bulan: stok fisik Rp 8.000.000, saldo 1-1500 Rp 10.000.000 → Dr 5-1000 2.000.000 / Cr 1-1500; setelah itu 1-1500 = 8.000.000. Tutup ulang bulan yang sama tidak menggandakan.
10. Neraca: Total Aset = Total Liabilitas + Ekuitas pada tanggal mana pun.
11. Jurnal manual 2 baris seimbang tersimpan; Balik Jurnal membuat jurnal pembalik dan saldo akun kembali.

**Pengembalian uang dan hapus order**
12. DP Rp 5.000.000, `release_order_deposit` refund Rp 5.000.000: transaksi expense kategori `Pengembalian Uang Pelanggan`, jurnal Dr 2-1200 / Cr Bank, `paid_amount` order menjadi 0, `delete_order` berhasil.
13. DP Rp 5.000.000, refund Rp 3.000.000 + forfeit Rp 2.000.000: 2-1200 untuk order itu 0, `4-9000` +2.000.000, kas −3.000.000, `delete_order` berhasil. Setelah order terhapus, jurnal tetap ada dan Cek Konsistensi tetap hijau.
14. `delete_order` pada order dengan DP belum dilepas: ditolak, **stock movement pending tetap pending** (atomik).
15. `release_order_deposit` melebihi sisa dana, pada order `completed`, atau di periode terkunci: ditolak.
16. `delete_order_payment` yang membuat pembayaran lebih kecil dari pelepasan: ditolak.
17. `delete_order_deposit_release` (refund): transaksi dan pelepasan terhapus, 2-1200 kembali; (forfeit): jurnal `order_forfeit` hilang.
18. Hapus langsung baris `transactions` yang terhubung ke pelepasan DP: ditolak (`restrict`).
19. Hapus order lewat SQL langsung (`delete from orders`) pada order yang masih memegang uang: ditolak trigger.
20. Order yang sudah `completed` dan punya pembayaran: tidak bisa dihapus (aturan keras 11).

**Ditolak**
21. Jurnal manual debit ≠ kredit, 1 baris, akun nonaktif, tanggal ≤ `locked_through`.
22. `update`/`delete`/`insert` langsung ke `journal_entries`, `journal_lines`, `order_deposit_releases` dari klien: `42501`.
23. Ubah nominal transaksi bertanggal di periode terkunci; hapus pembayaran order di periode terkunci.
24. Hapus akun `is_system`; ubah tipe akun yang sudah punya jurnal; `init_accounting` dengan tanggal bukan tanggal 1.

**Batas**
25. Transaksi tanpa kategori: jatuh ke 9-9999, muncul di Cek Konsistensi sebagai peringatan, alur SPJ tetap jalan.
26. Order dibatalkan kirimnya (`completed` → `ready`): jurnal pendapatan terhapus, DP kembali terlihat sebagai uang muka.
27. Kelebihan bayar (dibayar > grand_total): selisih tetap di 2-1200, tidak hilang.
28. Akuntansi belum diaktifkan: seluruh alur lama berjalan seperti sekarang, **kecuali** penjagaan hapus order dan pelepasan DP yang aktif sejak migration (aturan 11-13 tidak bergantung pada akuntansi).
29. Order di-set `completed` lewat `updateProductionStatus` dengan pembayaran sebagian, lalu pelunasan susulan: saat completed, jurnal mengakui Dr `2-1200 Uang Muka Pelanggan` (sebesar nominal dibayar bersih) dan Dr `1-1300 Piutang Usaha` (sebesar sisa tagihan) / Cr `4-1000 Penjualan` dan Cr `4-1100 Ongkos Kirim`. Saat pelunasan susulan masuk, jurnal mencatat Dr `Kas/Bank` / Cr `1-1300 Piutang Usaha`. *Catatan:* jalur ini melewati syarat lunas di `toggle_order_stage`; perilaku bypass ini sudah ada sebelumnya pada `updateProductionStatus` dan tidak diubah oleh rancangan ini.

**Cek Konsistensi:** daftar cek dan kasus ujinya ada di `RANCANGAN_LAPORAN_KEUANGAN.md` §5.5 dan §7.

---

## 8. Yang masih terbuka dan hasil verifikasi

### 8.1 Terbuka (menunggu pemilik)

1. **Baris pajak di Laba Rugi.** Pemilik menyatakan perlu, dan akan dirancang setelah konsultasi dengan konsultan pajak. Tidak menghalangi Fase A dan B. Saat jawabannya ada, yang kemungkinan perlu ditambah: akun beban pajak, bagian di Laba Rugi, dan (bila relevan) aturan pencatatan. Sementara itu pemilik bisa menambah akun beban sendiri dan memakai jurnal manual.

### 8.2 Hasil verifikasi kode dan database live (2026-10-07)

- **Database live & migration:** Terhubung ke project `xdojtfhkflbfuwmcjpwe` (35 migration lokal cocok 1:1 dengan 35 migration di remote).
- **Definisi View & RPC baseline:** `orders_with_balance`, `sales_performance`, dan `delete_order_payment` hanya didefinisikan di baseline (`20260101000002_core_financial_and_orders`), belum pernah ditimpa oleh migration lain.
- **Metode pembayaran:** `PaymentModal.tsx` mengirim nilai `'transfer'`, `'cash'`, `'qris'`, `'lainnya'`.
- **Hapus transaksi terkait order:** `TransactionTable.tsx` menyembunyikan tombol hapus/edit jika `order_id` terisi (menampilkan teks "Otomatis dari Order").
- **Kategori transaksi:** Kategori di `seed.sql` cocok 100% dengan tabel pemetaan §4.4.
- **Tabel & Migration:** Saat ini 35 migration dan 36 tabel aktif di `clear.sql`. Setelah 8 tabel baru akuntansi ditambahkan, total tabel menjadi 44.

---

## 9. Keterbatasan yang disengaja (agar tidak jadi kejutan)

- **Persediaan dinilai pada harga beli terakhir** (`materials.price`, diperbarui saat penerimaan barang), bukan rata-rata tertimbang. Cukup untuk dasar, bisa memunculkan selisih saat harga bahan naik-turun.
- **Nilai stok diambil saat tutup bulan dijalankan** (bukan rekonstruksi historis), jadi tutup bulan sebaiknya dilakukan di hari pertama bulan berikutnya. Hasilnya disimpan di `inventory_valuations`.
- **Belanja Direct Supplier masuk Persediaan saat dibayar**, sebelum Gudang mengonfirmasi penerimaan. Barang yang masih dalam perjalanan di akhir bulan bisa membuat HPP bulan itu sedikit tinggi dan bulan berikutnya sedikit rendah.
- **Tidak ada Barang Dalam Proses (WIP).** Bahan yang sudah keluar gudang tapi barang belum terjual langsung terhitung HPP pada tutup bulan.
- **Tidak ada hutang usaha otomatis.** Semua pembelian yang ada sekarang dibayar di muka. Hutang bisa dicatat lewat jurnal manual ke 2-1100/2-1300.
- **Satu akun Bank.** Bila perusahaan memakai beberapa rekening, semuanya digabung di akun Bank.
- **Tidak ada retur penjualan setelah dikirim, dan tidak ada status order "Dibatalkan".** Pembatalan ditangani dengan melepas DP (kembalikan/hangus) lalu menghapus order. Order yang sudah dikirim tidak bisa dihapus.
- **Tidak ada pajak** (menunggu konsultasi) dan **tidak ada multi-mata uang.**

---

## 10. Rencana migration (urutan; nomor mengikuti aturan `AGENT_INSTRUCTIONS.md` §1, harus > `20261006120000`)

| # | Nama (usulan, timestamp diisi saat dibuat) | Fase | Isi |
|---|---|---|---|
| 1 | `..._accounting_chart_of_accounts` | A | `accounts` (termasuk `is_cash`, `cash_flow_activity`), `accounting_settings`, kolom `transaction_categories.account_id`, `transactions.cash_account_id`/`counter_account_id` |
| 2 | `..._accounting_journal_core` | A | `journal_entries`, `journal_lines`, trigger seimbang, `post_journal_entry`, `reverse_journal_entry`, revoke hak tulis |
| 3 | `..._accounting_patch_spj_and_payment_rpc` | A | Ubah `approve_purchasing_report`, `record_order_payment` (§5.2) |
| 4 | `..._accounting_auto_journal_transactions` | A | `trg_journal_from_transaction`, `init_accounting`, backfill |
| 5 | `..._accounting_opening_balance_and_ledger_reports` | A | `suggest/post_opening_balance`, `get_trial_balance`, `get_general_ledger` |
| 6 | `..._fix_orders_with_balance_missing_columns` | A | Definisi view `orders_with_balance` dengan daftar kolom eksplisit (tanpa `o.*`), mempertahankan 16 kolom lama dengan urutan dan ekspresi yang sama persis, ditambah `order_type` dan `is_order_type_manual_override` di akhir; mempertahankan `security_invoker = true` dan hak akses. |
| 7 | `..._order_deposit_releases` | A | Tabel, `release_order_deposit`, `delete_order_deposit_release`, `trg_journal_order_forfeit`, ubah `recompute_order_status`, `delete_order_payment`, ubah ekspresi `paid_amount` (`coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)`) dan `remaining_amount` pada `orders_with_balance` dan `sales_performance` |
| 8 | `..._order_delete_guard` | A | `delete_order`, `trg_guard_order_delete` |
| 9 | `..._accounting_order_revenue_recognition` | B | `trg_journal_order_revenue` |
| 10 | `..._accounting_payroll_split` | B | `trg_journal_payroll_split` |
| 11 | `..._accounting_period_close_inventory` | B | `acc_inventory_value`, `inventory_valuations`, `close/reopen_accounting_period` |
| 12 | `..._accounting_fixed_assets` | C | `fixed_assets`, `fixed_asset_depreciations`, `register/dispose_fixed_asset`, penyusutan di `close_accounting_period` |

Migration laporan (R1 sampai R3) ada di `RANCANGAN_LAPORAN_KEUANGAN.md` §10 dan dijalankan **setelah migration 11**.

**Dampak ke berkas lain (wajib saat implementasi, per checklist `AGENT_INSTRUCTIONS.md` §9):**
- `supabase/clear.sql`: tambah `accounts`, `accounting_settings`, `journal_entries`, `journal_lines`, `inventory_valuations`, `fixed_assets`, `fixed_asset_depreciations`, `order_deposit_releases` ke `TRUNCATE`.
- `supabase/seed.sql`: setelah `init_accounting('2026-11-01')`, tambah beberapa jurnal manual contoh, satu aset tetap, dan satu pelepasan DP contoh; **cek ulang nilai constraint** (jebakan seed). Seed tetap berhenti di status "siap diproses" (tutup bulan tidak dijalankan di seed).
- `supabase/DATABASE.md`: 12 baris migration baru, hitungan tabel dan view.
- `docs/ARSITEKTUR_TEKNIS.md`: §5 daftar tabel (kategori baru "Akuntansi"), §7 catatan temuan §1 poin 3, 4, dan 6.
- **`docs/AKUNTANSI.md` (baru):** keputusan §2, aturan posting §4.5, daftar tabel/RPC/trigger, aturan keras §3, keterbatasan §9. Menyalin keputusan, bukan seluruh SQL.
- **`docs/README.md`:** daftarkan `AKUNTANSI.md` di tabel dokumen domain, route `/akuntansi`, glosarium (COA, Jurnal, Buku Besar, Neraca Saldo, Uang Muka Pelanggan, Pelepasan DP, DP Hangus, Penyesuaian Persediaan).
- **`docs/AGENT_INSTRUCTIONS.md` §2:** tambahkan pemetaan "akuntansi/jurnal/laporan keuangan → `AKUNTANSI.md`".
- `docs/ORDER_DAN_KEUANGAN.md`: perbarui kalimat tentang hapus order (kini diblokir bila masih memegang uang, dan lewat `delete_order`), tambah bagian pelepasan DP, dan rujuk `AKUNTANSI.md` untuk pencatatan.
- `docs/PAYROLL.md`: rujukan soal split upah borongan ke HPP.
- `docs/GUDANG_DAN_PURCHASING.md`: rujukan soal belanja jadi Persediaan.
- `README.md` (root): daftar fitur setelah benar-benar jalan.

