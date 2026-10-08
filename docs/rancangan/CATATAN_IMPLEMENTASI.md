# Catatan Implementasi Akuntansi (serah-terima untuk agen)

- Dibuat: 2026-10-08
- Lokasi di repo: `docs/rancangan/CATATAN_IMPLEMENTASI.md`
- Tujuan: agen mana pun (akun atau model berbeda) harus bisa melanjutkan pekerjaan hanya dari file di repo ini, tanpa riwayat chat.
- **Agen wajib memperbarui §8 (log progres) setiap selesai satu langkah.**

---

## 1. Urutan baca (wajib, sebelum menyentuh apa pun)

1. `AGENTS.md`
2. `docs/AGENT_INSTRUCTIONS.md`
3. `docs/AKUNTANSI.md`
4. `docs/rancangan/RANCANGAN_AKUNTANSI_DASAR.md` (sumber kebenaran fitur akuntansi, pengakuan pendapatan, pelepasan DP, daftar migration §10)
5. `docs/rancangan/RANCANGAN_LAPORAN_KEUANGAN.md`
6. File ini
7. `git status`, `git log -n 15 --stat`, dan `git diff` terhadap branch utama, untuk melihat apa yang sudah ada

Kalau isi file ini bertentangan dengan dokumen rancangan, **dokumen rancangan menang**, kecuali bagian yang jelas-jelas koreksi di §5 (yang memang meralat rancangan, dan harus ikut mengubah rancangan).

---

## 2. Aturan main (tidak boleh dilanggar)

1. **Jangan menjalankan `supabase db push`, `db reset` ke remote, atau SQL tulis apa pun ke database tanpa persetujuan eksplisit pemilik di chat.** Perintah baca (`migration list`, `select`) boleh.
2. **Pemilik belum mengonfirmasi bahwa project Supabase yang terhubung ke repo ini adalah project uji.** Jangan berasumsi. Tanyakan.
3. **Satu migration (atau satu kelompok koreksi) per langkah.** Tampilkan SQL-nya, lalu berhenti dan tunggu persetujuan.
4. **Jangan menandai fase "selesai"** sebelum lulus uji di database sekali pakai.
5. **Migration yang sudah terpasang di remote tidak boleh diedit.** Koreksi lewat migration baru. Migration yang belum terpasang boleh diedit di tempat.
6. **Menulis file SQL:** pakai alat edit/buat-file, **bukan** `Set-Content` dengan here-string PowerShell yang menggandakan tanda kutip. Simpan UTF-8 **tanpa BOM**. Setelah menulis, periksa tidak ada `''kata''` (dua kutip tunggal) dan tidak ada karakter non-ASCII yang tak disengaja.
7. **Jangan menampilkan isi `.env`, kunci API, atau panggilan HTTP/REST ad hoc ke Supabase.** Pakai Supabase CLI atau SQL.
8. **Jangan menambah dependensi frontend** tanpa persetujuan.
9. Bahasa: Indonesia untuk komentar domain, pesan error, dan dokumen.
10. Bila ragu atau menemukan hal yang bertentangan dengan rancangan, **berhenti dan bertanya**, jangan memutuskan sendiri.

---

## 3. Keputusan pemilik (ringkas; rincian di rancangan §2.4)

Pendapatan diakui saat order dikirim; ongkir pendapatan terpisah; DP sebelum kirim = liabilitas `Uang Muka Pelanggan`; "Investasi" = setoran modal; upah borongan masuk HPP; Direct Supplier langsung ke Persediaan saat dibayar; pembukuan mulai **2026-11-01** (dipilih saat aktivasi); Kas dan Bank dipisah; order yang memegang uang pelanggan tidak bisa dihapus (alur pengembalian uang minimal); **DP hangus** menjadi Pendapatan Lain-lain; tahun fiskal = tahun kalender; dokumentasi di `docs/AKUNTANSI.md`; arus kas metode langsung; laporan internal; satu kolom pembanding; unduhan CSV + cetak lewat modal; baris pajak **ditunda** menunggu konsultasi pajak.

---

## 4. Keadaan terakhir

### 4.1 Fakta (sudah dikonfirmasi)

- Migration terakhir sebelum fitur akuntansi: `20261006120000_catalog_public_read_rpc` (35 migration, 36 tabel).
- Migration 1 `20261008063000_accounting_chart_of_accounts.sql` **sudah terpasang di remote** (versi pertama; versi perbaikan tidak ikut terpasang, lihat §5.A).
- Agen sebelumnya menulis migration `20261008070000` sampai `20261008130000` (7 file, nomor 2 sampai 8 di rancangan §10), memperbarui `clear.sql`, `DATABASE.md`, `AKUNTANSI.md`, `AGENT_INSTRUCTIONS.md`, `docs/README.md`.
- Agen sebelumnya menjalankan `db push --include-all`; **hasilnya tidak dilaporkan**.

### 4.2 Belum diketahui (periksa di Langkah 0)

- Apakah migration `20261008070000` sampai `20261008130000` terpasang di remote.
- Apakah project remote `xdojtfhkflbfuwmcjpwe` adalah project uji (hanya pemilik yang tahu).

---

## 5. Langkah 0 (read-only), kerjakan dulu dan laporkan

1. `npx supabase migration list --linked`: laporkan migration mana yang terpasang di remote.
2. Apakah `db push --include-all` sempat dieksekusi dan apa hasilnya.
3. `Select-String -Pattern "''[a-z_]+''"` pada migration `20261008070000` dan `20261008080000` (indikasi kutip ganda rusak).
4. Encoding dan byte pertama semua file migration `20261008*` (BOM atau tidak, ada karakter non-ASCII atau tidak).
5. Tipe parameter asli `record_order_payment` (varchar atau text) di `20260923000003_fix_record_order_payment.sql`.
6. Konfirmasi dari pemilik: apakah project remote adalah project uji.

**Berhenti setelah melaporkan.** Pemilik menentukan: lanjut ke database lokal sekali pakai (`supabase start` dan `db reset`, perlu Docker) atau project scratch terpisah. Semua perbaikan di bawah diuji di sana, bukan di remote.

---

## 6. Temuan review yang harus diperbaiki

Review ini dibuat tanpa menjalankan SQL. **Verifikasi setiap butir terhadap file sebenarnya sebelum memperbaiki**; bila ada yang tidak benar, laporkan.

### A. Migration 1 (sudah terpasang, koreksi lewat migration baru `..._accounting_coa_hardening`)

1. Ganti FK `transaction_categories.account_id`, `transactions.cash_account_id`, `transactions.counter_account_id` menjadi `no action` (hapus klausa `on delete`). Alasan: `RESTRICT` dicek langsung dan bisa menggagalkan cascade dari `auth.users`.
2. Trigger `guard_accounts_change`: tolak `is_system` false menjadi true pada UPDATE; izinkan DELETE akun sistem bila pemilik (`old.user_id`) sudah tidak ada di `auth.users`; uji dengan user dummy di database sekali pakai.
3. `accounting_settings`: `check (books_start_date is null or extract(day from books_start_date) = 1)` dan `check (locked_through is null or locked_through = (date_trunc('month', locked_through) + interval '1 month' - interval '1 day')::date)`.
4. `revoke all ... from anon` pada `accounts` dan `accounting_settings`.
5. Pastikan versi migration 1 di remote sudah memuat: policy `insert` hanya `is_system = false`, `accounting_settings` select-only, `check` pasangan tipe-kelompok, `to_regclass` untuk `journal_lines`, tanpa kolom `updated_at`. Bila belum, tambahkan ke migration koreksi ini.

### B. Migration 2 sampai 8 (belum terpasang bila Langkah 0 membuktikannya; edit di tempat)

**Migration 2 dan 3**
6. Kutip ganda rusak (`''manual''`, dst.) karena ditulis lewat here-string. Tulis ulang dengan benar, UTF-8 tanpa BOM.
7. Migration 3: tipe parameter `record_order_payment` harus sama persis dengan fungsi asli (varchar atau text). Bila beda, `create or replace` membuat fungsi kembar (PGRST203). Tampilkan **diff body** `approve_purchasing_report` dan `record_order_payment` terhadap versi asli; hanya perubahan yang disengaja yang boleh ada (counter_account_id reversal, kategori Jasa Purchasing, cash_account_id).

**Migration 4**
8. Sintaks trigger: `after insert or update of amount, type, transaction_date, category_id, cash_account_id, counter_account_id or delete` **tanpa kurung**.
9. **Jangan** masukkan `order_id` ke daftar `update of`: menghapus order men-set null `transactions.order_id` dan akan memicu pembuatan ulang jurnal ke `9-9999` (jurnal DP yang benar rusak).
10. Backfill: `update ... set description = description` tidak memicu trigger yang daftar kolomnya tidak memuat `description`. Pindahkan logika posting ke fungsi `post_transaction_journal(p_txn_id uuid)` yang dipanggil trigger **dan** backfill.
11. Periode terkunci harus ditolak juga untuk DELETE (aturan keras 4). Bila tanggal transaksi dipindah ke sebelum `books_start_date`, jurnal lama tetap harus dihapus.
12. Akun `4-2000 Pendapatan Jasa`: `report_group` harus `revenue`, bukan `other` (rancangan §4.3). Koreksi sebelum `init_accounting` pernah dijalankan, karena sesudahnya kelompok akun sistem terkunci.
13. `init_accounting`: tolak mengubah `books_start_date` bila sudah ada jurnal; validasi kepemilikan juga untuk `account_id` kategori.

**Migration 5**
14. `get_trial_balance` jangan menyaring `is_active = true` (akun nonaktif yang punya mutasi hilang, total tidak seimbang). Saring berdasarkan ada tidaknya mutasi.
15. `suggest_opening_balance`: persediaan harus memakai rumus stok efektif (`docs/GUDANG_DAN_PURCHASING.md` §3.3), bukan `stock_qty` mentah; uang muka pelanggan harus dikurangi `order_deposit_releases` (tabel itu ada di migration 7).

**Migration 6 dan 7**
16. Urutan kolom view `orders_with_balance`: 16 kolom lama (12 kolom `orders`, lalu `sales_name`, `grand_total`, `paid_amount`, `remaining_amount`) **tidak boleh bergeser**; `order_type` dan `is_order_type_manual_override` ditambahkan **di akhir**, setelah `remaining_amount`. Versi sekarang menyisipkannya sebelum `sales_name`, dan Postgres akan menolak (`cannot change name of view column`).
17. Jangan menambah `grant ... to anon` baru pada view yang sebelumnya tidak punya; samakan dengan hak akses asli. Bandingkan definisi `sales_performance` dengan baseline.
18. `trg_journal_order_forfeit` hanya `after insert`. Bila ikut `delete`, `on delete cascade` dari order menghapus baris pelepasan dan jurnal DP hangus ikut hilang (bertentangan dengan rancangan §7 kasus 13).
19. `delete_order_deposit_release`: urutan **hapus jurnal `order_forfeit` (bila forfeit), lalu hapus baris pelepasan, lalu hapus transaksi**. Versi sekarang menghapus transaksi dulu padahal pelepasan masih menunjuk ke sana (`NO ACTION`).
20. Di `journal_order_forfeit`, `select ... into v_order.order_id` pada variabel `record` yang belum terisi akan error. Pakai variabel teks biasa.

**Migration 8**
21. Verifikasi nilai status yang valid (`check`) di `stock_movements` dan `stock_requests` sebelum memakai `'cancelled'`.
22. `delete_order`: periksa `sewing_distribution_batches.target_order_id` (FK `NO ACTION`) dan beri pesan jelas *"Order ini sudah dipakai pada distribusi jahit dan tidak dapat dihapus"*, bukan error foreign key mentah.
23. `trg_guard_order_delete`: izinkan bila pemilik order sudah tidak ada di `auth.users` (cascade penghapusan user).

### C. Dokumen

24. Setelah koreksi: perbarui `RANCANGAN_AKUNTANSI_DASAR.md` (trigger forfeit hanya insert; `order_id` tidak di daftar `update of`; `4-2000` revenue; fungsi `post_transaction_journal`), `docs/AKUNTANSI.md`, dan `supabase/DATABASE.md` (jumlah migration dan tabel harus cocok dengan kenyataan: `clear.sql` mencantumkan semua tabel baru).

---

## 7. Rencana uji (`supabase/tests/accounting_smoke.sql`, di luar `migrations/`)

Jalankan hanya di database lokal sekali pakai atau project scratch yang ditunjuk pemilik. Uji minimal:

1. `init_accounting` membuat 33 akun; kedua kalinya tidak menggandakan; tanggal bukan tanggal 1 ditolak.
2. DP lalu refund lalu hapus order: jurnal `2-1200` tetap benar dan tidak ada yang jatuh ke `9-9999`.
3. DP lalu hangus lalu hapus order: jurnal `order_forfeit` tetap ada.
4. `delete_order` pada order yang masih memegang uang: ditolak, stok pending tetap pending.
5. `delete_order_deposit_release` untuk refund dan untuk forfeit.
6. Insert, update, delete transaksi di periode terkunci: ditolak.
7. Backfill menghasilkan jurnal untuk transaksi bertanggal ≥ `books_start_date`.
8. Neraca Saldo seimbang, termasuk dengan akun nonaktif yang punya mutasi.
9. Sebagai user biasa: tulis langsung ke `journal_entries`, `journal_lines`, `order_deposit_releases`, `accounting_settings` ditolak (`42501`).
10. Penghapusan user dummy (cascade) tidak tertahan trigger penjaga.

---

## 8. Log progres (diisi agen)

| Tanggal | Langkah | Hasil | Menunggu persetujuan pemilik? |
|---|---|---|---|
| 2026-10-08 | Dokumen ini dibuat | – | Ya, Langkah 0 |
| 2026-10-08 | Langkah 0 (read-only) | Selesai. migration list: migration 20261008* belum tercatat di remote; db push --include-all belum dieksekusi; ditemukan pola '' pada mig 2 & 3; mig 4, 5, 6, 8 memiliki UTF-8 BOM; tipe parameter asli record_order_payment di 20260923000003 adalah text. | Ya, menunggu arahan & persetujuan pemilik sebelum membuat/mengedit migration |
| 2026-10-08 | Koreksi Migration 1 (Hardening) | File `20261008064500_accounting_coa_hardening.sql` dibuat: FK menjadi NO ACTION, guard trigger (is_system false->true ditolak, cascade auth.users diizinkan), check books_start_date & locked_through, revoke anon. UTF-8 tanpa BOM. | Disetujui pemilik |
| 2026-10-08 | Migration 2 (accounting_journal_core) | Tulis ulang bersih: perbaikan seluruh kutip ganda rusak (''), penggantian karakter non-ASCII CP1252 (0x97 em-dash) dengan dash biasa (-), format UTF-8 tanpa BOM. Berhasil disimpan ke file. | Selesai / Disetujui |
| 2026-10-08 | Migration 3 (accounting_patch_spj_and_payment_rpc) | Tulis ulang bersih: perbaikan seluruh kutip ganda (''), parameter sama persis dengan aslinya (text, date, dll.), diff body fungsi diverifikasi. UTF-8 tanpa BOM. Berhasil disimpan ke file. | Selesai / Disetujui |
| 2026-10-08 | Migration 4 (accounting_auto_journal_transactions) | Logika posting dipisah ke fungsi `post_transaction_journal(p_txn_id uuid)` (dipakai trigger dan backfill); trigger tanpa kurung & tanpa `order_id`; guard periode terkunci pada DELETE/UPDATE; tanggal baru < books_start_date tetap hapus jurnal lama; akun 4-2000 report_group `revenue`; `init_accounting` tolak ubah books_start_date bila sudah ada jurnal; validasi kepemilikan akun kategori; UTF-8 tanpa BOM. Berhasil disimpan ke file. | Selesai / Disetujui |
| 2026-10-08 | Migration 5 (accounting_opening_balance_and_ledger_reports) | `get_trial_balance` tidak menyaring `is_active` (akun nonaktif bermutasi tetap tampil agar seimbang); `suggest_opening_balance` menggunakan rumus stok efektif resmi (GUDANG_DAN_PURCHASING.md §3.3) dan mengurangi pelepasan DP; UTF-8 tanpa BOM. Berhasil disimpan ke file. | Selesai / Disetujui |
| 2026-10-08 | Migration 6 (fix_orders_with_balance_missing_columns) | 16 kolom lama view `orders_with_balance` dipertahankan persis tanpa bergeser; `order_type` dan `is_order_type_manual_override` diletakkan di akhir (setelah `remaining_amount`); tanpa grant ke anon (hanya authenticated); definisi `sales_performance` cocok dengan baseline; UTF-8 tanpa BOM. Berhasil disimpan ke file. | Selesai / Disetujui |
| 2026-10-08 | Migration 7 (order_deposit_releases) | Trigger `trg_journal_order_forfeit` hanya after insert; `delete_order_deposit_release` menghapus jurnal forfeit eksplisit -> hapus baris pelepasan -> hapus transaksi (urutan aman FK); `journal_order_forfeit` memakai variabel teks; urutan kolom `orders_with_balance` dan `sales_performance` bersih dari grant anon; UTF-8 tanpa BOM. | Selesai / Disetujui |
| 2026-10-08 | Migration 8 (order_delete_guard) | Trigger `guard_order_delete` (before delete on orders: tolak jika uang pelanggan belum rilis atau target jahit; izinkan jika user dihapus auth.users); RPC `delete_order` atomik membatalkan stock_movements pending & stock_requests draft_auto lalu delete order; revoke public/anon; UTF-8 tanpa BOM. | Selesai / Disetujui |
| 2026-10-08 | Sinkronisasi Dokumen & Rencana Uji | `supabase/DATABASE.md` (44 migration, urutan lengkap), `docs/AKUNTANSI.md` (trigger forfeit after insert), `docs/rancangan/RANCANGAN_AKUNTANSI_DASAR.md` (post_transaction_journal, no order_id in trigger, forfeit after insert, hardening migration 1b), dan `supabase/tests/accounting_smoke.sql` (10 skenario smoke test) selesai disinkronkan & dibuat. | Selesai / Menunggu instruksi lingkungan pengujian lokal |
