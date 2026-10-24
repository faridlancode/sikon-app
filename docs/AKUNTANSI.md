# AKUNTANSI.md — Domain Akuntansi SIKon

Dokumen ini adalah sumber kebenaran untuk domain **akuntansi** di SIKon.  
Untuk rancangan lengkap dan kasus uji, lihat `docs/rancangan/RANCANGAN_AKUNTANSI_DASAR.md`.  
Untuk rancangan laporan keuangan, lihat `docs/rancangan/RANCANGAN_LAPORAN_KEUANGAN.md`.

---

## 1. Keputusan desain utama (2026-10-06)

| Topik | Keputusan |
|---|---|
| Pendekatan | Double-entry di atas `transactions`; `transactions` tetap jadi buku kas |
| Pengakuan pendapatan | Saat order dikirim (`production_status = completed`) |
| Ongkos kirim | Pendapatan terpisah (akun 4-1100) |
| DP / pembayaran sebelum kirim | Liabilitas `Uang Muka Pelanggan` (2-1200) |
| Belanja bahan (SPJ & Direct Supplier) | Aset `Persediaan Bahan Baku` (1-1500) langsung saat dibayar |
| HPP bahan | Metode periodik: disesuaikan saat tutup bulan |
| Upah borongan | HPP (5-1100); sisanya Beban Gaji (6-1000) |
| Uang muka purchasing | Aset `Uang Muka Karyawan` (1-1400) |
| Kategori "Investasi" | Setoran modal pemilik → 3-1000 Modal Disetor |
| Tanggal mulai pembukuan | 2026-11-01 (dipilih saat `init_accounting`) |
| Kas dan Bank | Dipisah; default Bank, bisa pilih Kas per transaksi |
| Order sudah bayar lalu dihapus | Diblokir; lewat alur pengembalian uang (`release_order_deposit`) |
| DP pelanggan batal | Aksi **DP hangus** → Pendapatan Lain-lain (4-9000) |
| Basis akrual | Akrual-ringan, tahun fiskal = tahun kalender |
| Batch PO vs Akuntansi | **Batch PO bukan periode akuntansi.** PO adalah wadah manajerial produksi. Periode akuntansi tetap bulan kalender (`close_accounting_period`), dan filter PO di `/financial` hanya menyaring transaksi pembayaran order tanpa mengubah jurnal (lihat `ORDER_DAN_KEUANGAN.md §7.6`) |
| Pajak | Ditunda sampai ada arahan konsultan |

---

## 2. Tabel akuntansi

| Tabel | Fase | Fungsi |
|---|---|---|
| `accounts` | A | Bagan Akun (COA); `is_system = true` untuk 33 akun standar |
| `accounting_settings` | A | Satu baris per user; select-only dari klien, tulis lewat RPC |
| `journal_entries` | A | Jurnal Umum; satu baris per entri; `entry_no` = JU-YYYYMM-NNNN |
| `journal_lines` | A | Baris debit/kredit; constraint deferred pastikan Σ debit = Σ kredit |
| `order_deposit_releases` | A | Pelepasan DP: `refund` (uang kembali) atau `forfeit` (DP hangus) |
| `inventory_valuations` | B | Snapshot nilai persediaan per tutup bulan |
| `fixed_assets` | C | Register aset tetap |
| `fixed_asset_depreciations` | C | Penyusutan bulanan per aset |

**Kolom baru di tabel lama:**

| Tabel | Kolom | Fungsi |
|---|---|---|
| `transaction_categories` | `account_id` | Pemetaan kategori → akun COA lawan |
| `transactions` | `cash_account_id` | Akun Kas/Bank spesifik (null = default Bank) |
| `transactions` | `counter_account_id` | Override akun lawan (Reversal Uang Muka, dll.) |

---

## 3. Aturan posting (peristiwa → jurnal)

| # | Peristiwa | Debit | Kredit | Pemicu |
|---|---|---|---|---|
| 1 | DP/pembayaran order **sebelum** kirim | Kas/Bank | 2-1200 Uang Muka Pelanggan | trigger `transactions` |
| 2 | Pembayaran order **setelah** kirim | Kas/Bank | 1-1300 Piutang Usaha | trigger `transactions` |
| 3 | Order dikirim (`completed`) | 2-1200 + 1-1300 | 4-1000 + 4-1100 | trigger `orders` (Fase B) |
| 4 | Pengembalian uang pelanggan | 2-1200 | Kas/Bank | trigger `transactions` (kategori Pengembalian) |
| 5 | DP hangus | 2-1200 | 4-9000 Pendapatan Lain-lain | trigger `order_deposit_releases` |
| 6 | Uang muka purchasing cair | 1-1400 | Kas/Bank | trigger `transactions` |
| 7 | SPJ disetujui: belanja bahan | 1-1500 | Kas/Bank | trigger `transactions` |
| 8 | SPJ disetujui: jasa purchasing | 6-2000 | Kas/Bank | trigger `transactions` |
| 9 | SPJ disetujui: reversal uang muka | Kas/Bank | 1-1400 | trigger `transactions` + `counter_account_id` |
| 10 | Direct Supplier lunas | 1-1500 | Kas/Bank | trigger `transactions` |
| 11 | Payroll dibayar | 5-1100 + 6-1000 | Kas/Bank | trigger `weekly_payrolls` (Fase B) |
| 12 | Setoran modal (kategori Investasi) | Kas/Bank | 3-1000 Modal Disetor | trigger `transactions` |
| 13 | Transaksi manual lain | sesuai kategori | sesuai kategori | trigger `transactions` |
| 14 | Tutup bulan: persediaan | 5-1000 / 1-1500 | 1-1500 / 5-1000 | `close_accounting_period` |
| 15 | Tutup bulan: penyusutan aset tetap | 6-6000 | 1-2x10 (Akumulasi kelas aset) | `close_accounting_period` (Fase C) |
| 16 | Aset tetap baru dibeli | 1-2x00 | Kas/Bank | `register_fixed_asset` + transaksi pengeluaran (Fase C) |
| 17 | Aset tetap lama didaftarkan | 1-2x00 | 1-2x10 + 3-2000 (penyeimbang) | `register_fixed_asset` (jurnal `asset_opening`, Fase C) |
| 18 | Pelepasan aset tetap | Kas/Bank + 1-2x10 (+ 6-9000 jika rugi) | 1-2x00 (+ 4-9000 jika untung) | `dispose_fixed_asset` (jurnal `asset_disposal`, Fase C) |

---

## 4. Aturan keras

1. Setiap jurnal harus seimbang (Σ debit = Σ kredit); ditolak di constraint trigger deferred.
2. Jurnal tidak bisa ditulis/diubah/dihapus langsung dari frontend (`authenticated`).
3. Jurnal manual hanya bisa **dibalik** (`reverse_journal_entry`), tidak bisa diedit/dihapus.
4. Transaksi/jurnal di periode terkunci (`locked_through`) tidak bisa dibuat/diubah/dihapus.
5. Tanggal sebelum `books_start_date` tidak dijurnal.
6. Akun sistem tidak bisa dihapus, dinonaktifkan, atau diubah atribut klasifikasinya.
7. Jurnal otomatis dari `transactions` mengikuti sumbernya (ubah/hapus transaksi → jurnal ikut berubah/terhapus).
8. Transaksi tanpa kategori atau kategori tanpa akun jatuh ke 9-9999 (peringatan, tidak menolak alur).
9. Akuntansi aktif hanya setelah `init_accounting` dipanggil; sebelumnya semua trigger no-op.
10. **Order tidak bisa dihapus** selama memegang uang pelanggan (Σ bayar > Σ pelepasan); berlaku di trigger DB.
11. Pelepasan DP hanya untuk order yang belum `completed`, nominal ≤ sisa dana, tidak di periode terkunci.
12. `delete_order_payment` ditolak bila membuat Σ bayar < Σ pelepasan.
13. Tabel `fixed_assets` dan `fixed_asset_depreciations` dilindungi RLS: SELECT only untuk pengguna bersangkutan, hak INSERT/UPDATE/DELETE dicabut langsung dari peranan `authenticated` dan hanya dapat dimanipulasi melalui RPC bersertifikat SECURITY DEFINER.
14. Aset yang sudah disusutkan tidak dapat dihapus (`delete_fixed_asset` menolak); pembatalan penutupan buku (`reopen_accounting_period`) ditolak jika ada aset yang dilepas sesudah tanggal kunci baru hingga pelepasan dibatalkan lebih dulu (`undo_dispose_fixed_asset`).

---

## 5. RPC utama

| RPC | Fase | Fungsi |
|---|---|---|
| `init_accounting(p_books_start_date)` | A | Seed COA, petakan kategori, aktifkan, backfill |
| `post_journal_entry(p_date, p_description, p_lines)` | A | Jurnal manual |
| `reverse_journal_entry(p_entry_id, p_reason)` | A | Balik jurnal manual |
| `suggest_opening_balance(p_books_start_date)` | A | Usulan saldo awal |
| `post_opening_balance(p_date, p_lines)` | A | Posting saldo awal |
| `get_trial_balance(p_from, p_to)` | A | Neraca Saldo |
| `get_general_ledger(p_account_id, p_from, p_to)` | A | Buku Besar |
| `release_order_deposit(p_order_id, p_kind, p_amount, ...)` | A | Kembalikan uang / DP hangus |
| `delete_order_deposit_release(p_release_id)` | A | Batalkan pelepasan |
| `delete_order(p_order_id)` | A | Hapus order (atomik + guard) |
| `close_accounting_period(p_period_end)` | B, C | Snapshot stok (`acc_inventory_value`), tolak `p_period_end >= current_date`, penyesuaian persediaan 1-1500 & 5-1000 (deskripsi `MM/YYYY`), hitung penyusutan bulanan garis lurus seluruh aset aktif (Fase C), kunci periode |
| `reopen_accounting_period(p_new_locked_through)` | B, C | Buka kembali periode tutup buku, hapus valuasi dan jurnal penyesuaian serta jurnal penyusutan setelah tanggal kunci baru; tolak bila ada pelepasan aset sesudah kunci baru |
| `get_close_preview()` | B | Preview status tutup bulan, perbandingan saldo buku vs fisik, usulan penyesuaian |
| `get_income_statement(p_from, p_to, ...)` | B | Laporan Laba Rugi akrual multi-level dengan komparatif & estimasi HPP sementara (hanya bila $p\_to \ge$ tgl 1 bulan berjalan & setelah locked_through; simetris; bulan lalu belum ditutup status open_no_estimate) |
| `get_balance_sheet(p_as_of, ...)` | B | Laporan Neraca format skontro/stafel dengan komparatif lengkap (termasuk Laba Ditahan & Laba Tahun Berjalan tanpa estimasi) & validasi balance |
| `get_accounting_checks(p_as_of)` | B, C | 15 Cek konsistensi integritas akuntansi otomatis (termasuk FIXED_ASSET_MATCH per kelas aset dan DEPRECIATION_DUE pada periode terkunci) |
| `register_fixed_asset(...)` | C | Daftarkan aset tetap baru (dengan transaksi kas/bank pengeluaran) atau aset lama (dengan jurnal `asset_opening` seimbang ke Laba Ditahan 3-2000). Kategori 'Pembelian Aset Tetap' terkunci ke akun 1-2100 |
| `update_fixed_asset_info(p_asset_id, p_name, p_notes)` | C | Ubah nama dan catatan aset tetap tanpa memengaruhi angka pembukuan |
| `delete_fixed_asset(p_asset_id)` | C | Hapus pendaftaran aset tetap (hanya sebelum disusutkan; tolak aset disposed dengan pesan 'Batalkan pelepasan aset terlebih dahulu') |
| `dispose_fixed_asset(...)` | C | Pelepasan aset tetap dengan jurnal `asset_disposal` seimbang: eliminasi harga perolehan & akumulasi penyusutan, pencatatan kas/bank jika ada hasil, dan untung (4-9000) atau rugi (6-9000) pelepasan |
| `undo_dispose_fixed_asset(p_asset_id)` | C | Batalkan pelepasan aset tetap, pulihkan status ke `active`, dan bersihkan jurnal `asset_disposal` |
| `get_fixed_asset_register(p_as_of)` | C | Register daftar aset tetap lengkap: perolehan, akumulasi per tanggal, nilai buku bersih, beban bulanan, status aktif/lunas susut/dilepas |
| `get_cash_flow(p_from, p_to, p_compare_from, p_compare_to)` | R2 | Laporan Arus Kas metode langsung dari jurnal akun kas/bank, eliminasi mutasi kas-bank net nol, klasifikasi operasi/investasi/pendanaan & rekonsiliasi kas akhir |
| `get_equity_changes(p_from, p_to, p_include_provisional)` | R2 | Laporan Perubahan Ekuitas: ekuitas awal, laba bersih, setoran modal, prive, koreksi laba ditahan, dan rekonsiliasi dengan Total Ekuitas Neraca |
| `get_report_notes(p_as_of)` | R2 | Catatan Atas Laporan Keuangan: rincian kas & bank, persediaan fisik & buku, uang muka pelanggan/staf, jadwal penyusutan aset tetap, dan hutang |

---

## 6. Trigger

| Nama | Tabel | Peristiwa | Fungsi |
|---|---|---|---|
| `trg_journal_balanced` | `journal_lines` | After insert/update/delete, deferred | Pastikan Σ debit = Σ kredit per commit |
| `trg_journal_from_transaction` | `transactions` | After insert/update/delete | Auto-jurnal transaksi kas |
| `trg_journal_order_revenue` | `orders` | After update of production_status, total_price, ongkir | Posting/hapus/sesuaikan jurnal pengakuan pendapatan (Fase B1) |
| `trg_journal_order_forfeit` | `order_deposit_releases` | After insert | Posting jurnal DP hangus |
| `trg_journal_payroll_split` | `weekly_payrolls` | After update of status, transaction_id or delete | Reklasifikasi upah borongan 5-1100 vs 6-1000 saat status paid; hapus reklasifikasi saat baris dihapus/status keluar dari paid (Fase B2) |
| `trg_guard_order_delete` | `orders` | Before delete | Tolak hapus order yang masih memegang uang atau sudah completed dengan pendapatan |
| `trg_guard_accounts_change` | `accounts` | Before update/delete | Proteksi akun sistem dan akun bermutasi |

---

## 7. Keterbatasan yang disengaja

- Persediaan dinilai harga beli terakhir (`materials.price`), bukan rata-rata tertimbang.
- Nilai stok diambil saat tutup bulan dijalankan, bukan rekonstruksi historis (`acc_inventory_value()`).
- Belanja Direct Supplier masuk Persediaan saat dibayar (sebelum konfirmasi gudang).
- Tidak ada WIP (Barang Dalam Proses).
- Tidak ada hutang usaha otomatis (semua pembelian dibayar di muka).
- Satu akun Bank (jika ada beberapa rekening, digabung).
- Tidak ada retur penjualan setelah dikirim, tidak ada status "Dibatalkan".
- Tidak ada pajak (menunggu konsultasi) dan tidak ada multi-mata uang.
- Menghapus pengguna (`auth.users`) yang sudah memiliki riwayat order tidak didukung oleh skema baseline karena foreign key `orders.user_id` dan `order_payments.user_id` berstatus `NO ACTION` (tanpa cascade). Penghapusan akun pengguna hanya berlaku bagi pengguna tanpa order/pembayaran.
- Cek `CASH_MATCH`: nilai harapan = saldo Kas+Bank pada jurnal `opening_balance` + $\Sigma(\text{income} - \text{expense})$ transaksi bertanggal $\ge \text{books\_start\_date}$ s.d. tanggal cek (bukan berdasarkan `company_settings.saldo_awal`).
- Cek `ORDER_REVENUE`: tanggal penyelesaian bersumber dari `order_stage_events` tahap `kirim` berstatus `done` (`coalesce(completed_at::date, updated_at::date)`). Order dengan tanggal penyelesaian sebelum `books_start_date` atau tanggal tidak diketahui tidak ditandai error.
- Cek `INV_MATCH`: membandingkan saldo buku akun `1-1500` per `period_end` snapshot terakhir, bukan per `p_as_of` cek (sehingga mutasi belanja setelah tutup bulan tidak memicu peringatan).
- Estimasi HPP sementara: hanya aktif bila $p\_to \ge$ tanggal 1 bulan berjalan dan setelah `locked_through`. Periode bulan lampau yang belum ditutup berstatus `open_no_estimate` tanpa estimasi. Estimasi bersifat simetris: selisih negatif (stok fisik > saldo buku) mengurangi HPP dan menaikkan saldo persediaan serta ekuitas di Neraca secara seimbang.
- Neraca Pembanding: baris Laba Ditahan dan Laba Tahun Berjalan dihitung lengkap pada `p_compare_as_of` tanpa estimasi sehingga Total Aset Pembanding selalu sama dengan Total Liabilitas + Ekuitas Pembanding.
- Metode penyusutan: garis lurus bulanan tanpa prorata harian (`useful_life_months`), pembulatan bulat (`round`), sisa nilai buku pada bulan terakhir masa manfaat tepat menghabiskan sisa perolehan tanpa melebihi batas. Aset baru mulai disusutkan pada bulan kalender berikutnya setelah tanggal perolehan; aset lama pra-pembukuan mulai disusutkan sejak bulan pertama pembukuan dibuka.
- 4 kelas aset tetap standar: `equipment` (Mesin & Peralatan, 1-2100 / 1-2110), `vehicle` (Kendaraan, 1-2200 / 1-2210), `furniture` (Perabot & Perlengkapan, 1-2300 / 1-2310), `building` (Bangunan, 1-2400 / 1-2410). Beban akumulasi penyusutan dialokasikan ke 6-6000 Beban Penyusutan.

---

## 8. Fase implementasi

| Fase | Status | Isi |
|---|---|---|
| **A. Fondasi** | ✅ Migration dibuat (lokal) | COA, jurnal, guard hapus order, pelepasan DP |
| **B. Akrual dan laporan (Database)** | ✅ Selesai (lokal) | Pengakuan pendapatan (B1), split payroll (B2), tutup bulan & valuasi stok (B3), laporan Laba Rugi, Neraca, Cek Konsistensi (B4) |
| **B. Antarmuka / UI** | ✅ Selesai | Tab Laporan (Laba Rugi & Neraca, komparatif, estimasi HPP, unduh CSV, cetak PDF), Tab Tutup Buku (pratinjau & buka kembali), Panel Cek Konsistensi (13 aturan), penyesuaian label Halaman Keuangan |
| **C. Aset tetap (Database)** | ✅ Selesai (lokal) | Skema `fixed_assets` & `fixed_asset_depreciations` (C1), RPC pendaftaran, penyusutan bulanan garis lurus di tutup bulan, pelepasan untung/rugi/nol, proteksi RLS, cek FIXED_ASSET_MATCH & DEPRECIATION_DUE (C2, C3), perbaikan penyusutan tuntas, delete disposed ditolak, tutup bulan selisih nol tanpa jurnal, kategori terkunci 1-2100, RPC update_fixed_asset_info (C4) |
| **C. Antarmuka / UI** | ✅ Selesai | Tab Aset Tetap di /akuntansi (4 kartu ringkasan, toolbar filter/cari, tabel register, modal daftar/lepas/detail riwayat/batal lepas/hapus/ubah nama & catatan), integrasi pratinjau penyusutan di Tab Tutup Buku, akun Kas 1-1100 dan Bank 1-1200 dinamis, dan badge jumlah aturan dinamis di Ringkasan |
| **R2. Laporan Keuangan (Database)** | ✅ Selesai (lokal) | RPC `get_cash_flow` (arus kas metode langsung), `get_equity_changes` (perubahan ekuitas & rekonsiliasi), `get_report_notes` (catatan laporan & rekonsiliasi 5 pos), smoke tests 40–42 lulus (migration `20261018080000_accounting_r2_reports.sql`) |
| **R2. Antarmuka / UI & Cetak PDF** | ✅ Selesai | Sub-tab Arus Kas, Perubahan Ekuitas, Catatan (CALK), lencana Cocok dengan Neraca, unduh CSV 5 laporan, pratinjau cetak bersama, route /akuntansi/cetak (A4, cap status SEMENTARA yang tidak menimpa isi, sampul ringkas, ringkasan, 4 laporan utama, CALK, glosarium, pengesahan), Download PDF dengan pembagian halaman berdasarkan baris aktual dan footer bernomor per halaman fisik; tanpa tinggi minimum sampul yang menyebabkan halaman kosong. Cetak browser melalui dokumen terisolasi. |

