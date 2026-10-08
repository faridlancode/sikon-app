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
| 14–16 | Tutup bulan (persediaan, penyusutan) | — | — | `close_accounting_period` (Fase B) |

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
| `close_accounting_period(p_period_end)` | B | Snapshot stok, penyesuaian persediaan, penyusutan, kunci periode |

---

## 6. Trigger

| Nama | Tabel | Peristiwa | Fungsi |
|---|---|---|---|
| `trg_journal_balanced` | `journal_lines` | After insert/update/delete, deferred | Pastikan Σ debit = Σ kredit per commit |
| `trg_journal_from_transaction` | `transactions` | After insert/update/delete | Auto-jurnal transaksi kas |
| `trg_journal_order_revenue` | `orders` | After update production_status | Posting/hapus jurnal pengakuan pendapatan (Fase B) |
| `trg_journal_order_forfeit` | `order_deposit_releases` | After insert | Posting jurnal DP hangus |
| `trg_journal_payroll_split` | `weekly_payrolls` | After update status | Split jurnal payroll HPP vs Beban Gaji (Fase B) |
| `trg_guard_order_delete` | `orders` | Before delete | Tolak hapus order yang masih memegang uang |
| `trg_guard_accounts_change` | `accounts` | Before update/delete | Proteksi akun sistem dan akun bermutasi |

---

## 7. Keterbatasan yang disengaja

- Persediaan dinilai harga beli terakhir (`materials.price`), bukan rata-rata tertimbang.
- Nilai stok diambil saat tutup bulan dijalankan, bukan rekonstruksi historis.
- Belanja Direct Supplier masuk Persediaan saat dibayar (sebelum konfirmasi gudang).
- Tidak ada WIP (Barang Dalam Proses).
- Tidak ada hutang usaha otomatis (semua pembelian dibayar di muka).
- Satu akun Bank (jika ada beberapa rekening, digabung).
- Tidak ada retur penjualan setelah dikirim, tidak ada status "Dibatalkan".
- Tidak ada pajak (menunggu konsultasi) dan tidak ada multi-mata uang.

---

## 8. Fase implementasi

| Fase | Status | Isi |
|---|---|---|
| **A. Fondasi** | ✅ Migration dibuat (belum di-push) | COA, jurnal, guard hapus order, pelepasan DP |
| **B. Akrual dan laporan** | 🔲 Belum | Pengakuan pendapatan, split payroll, tutup bulan, laporan |
| **C. Aset tetap** | 🔲 Belum | Register aset, penyusutan |
