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
- Migration `20261008*` (termasuk Migration 1 `20261008063000_accounting_chart_of_accounts.sql`) **belum terpasang di remote** (terverifikasi dari hasil Langkah 0 `npx supabase migration list`).
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

Jalankan hanya di database lokal sekali pakai atau project scratch yang ditunjuk pemilik. Uji minimal (Test 1 s.d. 29):

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
11. Isolasi multi-tenant: user C tidak bisa membaca jurnal atau akun user A.
12. Cascade delete auth.users menghapus data akuntansi user tanpa error foreign key (pada user tanpa order/transaksi NO ACTION).
13. Alur SPJ Belanja Bahan (`approve_purchasing_report`) & pencairan uang muka kasir (Dr 1-1500, Dr 6-2000, Cr 1-1400, Cr 1-1200).
14. Atomisitas `delete_order`: pembatalan `stock_movements` dan `stock_requests` saat order dibatalkan setelah refund.
15. View `orders_with_balance` dan `sales_performance` pada user authenticated.
16. Pembayaran order non-tunai (Transfer Bank) masuk ke akun Bank `1-1200`.
17. Cascade delete order dengan rincian cutting, sewing, dan timeline events (bebas siklus FK).
18. Saldo awal pada `get_trial_balance` dan `get_general_ledger` (jurnal opening balance tidak masuk mutasi periode berjalan).
19. B1: Pengakuan pendapatan saat order dikirim (`completed`) dengan pelunasan tunai (Dr 2-1200, Cr 4-1000, Cr 4-1100).
20. B1: Pengakuan pendapatan saat order dikirim belum lunas (Dr 2-1200, Dr 1-1300, Cr 4-1000, Cr 4-1100).
21. B1: Batal kirim order (status keluar dari `completed`) menghapus jurnal pendapatan.
22. B1: Guard modifikasi order completed di periode terkunci.
23. B1: Modifikasi nilai order (ongkir/total) selagi completed memperbarui nilai jurnal tanpa mengubah entry_date.
24. B1: Transaksi keuangan sebelum tanggal mulai pembukuan (`books_start_date`) tidak menghasilkan jurnal.
25. B1: DP order sebelum tanggal mulai pembukuan tidak menghasilkan jurnal uang muka.
26. B1: Re-generate suggest_opening_balance setelah transaksi dan order.
27. B2: Reklasifikasi upah borongan (`trg_journal_payroll_split`): Dr 5-1100, Cr 6-1000 saat status `paid`.
28. B3: Penutupan periode akuntansi (`close_accounting_period`), snapshot persediaan fisik (`inventory_valuations`), penyesuaian HPP (5-1000 vs 1-1500), kunci periode, dan pembukaan kembali (`reopen_accounting_period`).
29. B4: Laporan Laba Rugi (`get_income_statement`), Neraca (`get_balance_sheet`), estimasi HPP sementara, dan 13 cek integritas (`get_accounting_checks`).

---

## 8. Log progres (diisi agen)

| Tanggal | Langkah | Hasil | Menunggu persetujuan pemilik? |
|---|---|---|---|
| 2026-10-08 | Dokumen ini dibuat | – | Ya, Langkah 0 |
| 2026-10-08 | Langkah 0 (read-only) | Selesai. migration list: migration 20261008* belum tercatat di remote; db push --include-all belum dieksekusi; ditemukan pola '' pada mig 2 & 3; mig 4, 5, 6, 8 memiliki UTF-8 BOM; tipe parameter asli record_order_payment di 20260923000003 adalah text. | Menunggu arahan pemilik |
| 2026-10-08 | Koreksi Migration 1 (Hardening) | File `20261008064500_accounting_coa_hardening.sql` dibuat: FK menjadi NO ACTION, guard trigger (is_system false->true ditolak, cascade auth.users diizinkan), check books_start_date & locked_through, revoke anon. UTF-8 tanpa BOM. | Selesai |
| 2026-10-08 | Migration 2 (accounting_journal_core) | Tulis ulang bersih: perbaikan seluruh kutip ganda rusak (''), penggantian karakter non-ASCII CP1252 (0x97 em-dash) dengan dash biasa (-), format UTF-8 tanpa BOM. Berhasil disimpan ke file. | Selesai |
| 2026-10-08 | Migration 3 (accounting_patch_spj_and_payment_rpc) | Tulis ulang bersih: perbaikan seluruh kutip ganda (''), parameter sama persis dengan aslinya (text, date, dll.), diff body fungsi diverifikasi. UTF-8 tanpa BOM. Berhasil disimpan ke file. | Selesai |
| 2026-10-08 | Migration 4 (accounting_auto_journal_transactions) | Logika posting dipisah ke fungsi `post_transaction_journal(p_txn_id uuid)` (dipakai trigger dan backfill); trigger tanpa kurung & tanpa `order_id`; guard periode terkunci pada DELETE/UPDATE; tanggal baru < books_start_date tetap hapus jurnal lama; akun 4-2000 report_group `revenue`; `init_accounting` tolak ubah books_start_date bila sudah ada jurnal; validasi kepemilikan akun kategori; UTF-8 tanpa BOM. Berhasil disimpan ke file. | Selesai |
| 2026-10-08 | Migration 5 (accounting_opening_balance_and_ledger_reports) | `get_trial_balance` tidak menyaring `is_active` (akun nonaktif bermutasi tetap tampil agar seimbang); `suggest_opening_balance` menggunakan rumus stok efektif resmi (GUDANG_DAN_PURCHASING.md §3.3) dan mengurangi pelepasan DP; UTF-8 tanpa BOM. Berhasil disimpan ke file. | Selesai |
| 2026-10-08 | Migration 6 (fix_orders_with_balance_missing_columns) | 16 kolom lama view `orders_with_balance` dipertahankan persis tanpa bergeser; `order_type` dan `is_order_type_manual_override` diletakkan di akhir (setelah `remaining_amount`); tanpa grant ke anon (hanya authenticated); definisi `sales_performance` cocok dengan baseline; UTF-8 tanpa BOM. Berhasil disimpan ke file. | Selesai |
| 2026-10-08 | Migration 7 (order_deposit_releases) | Trigger `trg_journal_order_forfeit` hanya after insert; `delete_order_deposit_release` menghapus jurnal forfeit eksplisit -> hapus baris pelepasan -> hapus transaksi (urutan aman FK); `journal_order_forfeit` memakai variabel teks; urutan kolom `orders_with_balance` dan `sales_performance` bersih dari grant anon; UTF-8 tanpa BOM. | Selesai |
| 2026-10-08 | Migration 8 (order_delete_guard) | Trigger `guard_order_delete` (before delete on orders: tolak jika uang pelanggan belum rilis atau target jahit; izinkan jika user dihapus auth.users); RPC `delete_order` atomik membatalkan stock_movements pending & stock_requests draft_auto lalu delete order; revoke public/anon; UTF-8 tanpa BOM. | Selesai |
| 2026-10-08 | Sinkronisasi Dokumen & Rencana Uji | `supabase/DATABASE.md` (44 migration, urutan lengkap), `docs/AKUNTANSI.md` (trigger forfeit after insert), `docs/rancangan/RANCANGAN_AKUNTANSI_DASAR.md` (post_transaction_journal, no order_id in trigger, forfeit after insert, hardening migration 1b), dan `supabase/tests/accounting_smoke.sql` selesai disinkronkan & dibuat. | Selesai |
| 2026-10-08 | Pengujian Lokal & Smoke Test | `supabase start` berhasil: seluruh 44 migration terpasang mulus. Perbaikan bug pre-existing pada `supabase/seed.sql` (hapus `returning id into` pada insert multi-baris & lengkapi nilai `source_type` pada `stock_requests`). | Selesai |
| 2026-10-09 | Pemulihan Test 12 Versi Asli & Evaluasi Smoke Test | Sesuai instruksi pemilik, Test 12 versi asli dipulihkan dan dieksekusi apa adanya tanpa melonggarkan asersi. Hasil eksekusi menghasilkan error asli: `ERROR: update or delete on table "users" violates foreign key constraint "orders_user_id_fkey" on table "orders"` (detail: `Key (id)=(...) is still referenced from table "orders"`). Hal ini terjadi karena FK `orders_user_id_fkey` dan `order_payments_user_id_fkey` pada skema baseline berstatus `NO ACTION` (bukan cascade). | Selesai |
| 2026-10-09 | Perubahan Test 12, Penambahan Test 13 & 14, dan Verifikasi Lengkap | 1. **Test 12 disesuaikan**: Uji cascade penghapusan user difokuskan pada user B (memiliki data akuntansi tanpa order & tanpa transaksi). Bagian hapus user A yang ber-order dihapus. Keterbatasan dicatat di komentar tes & `docs/AKUNTANSI.md` §7. Status `pg_constraint` diverifikasi: `orders_user_id_fkey` (`confdeltype = 'a'`), `order_payments_user_id_fkey` (`confdeltype = 'a'`), `transactions_user_id_fkey` (`confdeltype = 'c'`).<br>2. **Test 13 ditambahkan**: Menguji alur `approve_purchasing_report` dari SPJ belanja kain dan pencairan uang muka. Seluruh asersi saldo terpenuhi (`1-1500 = 900.000`, `6-2000 = 25.000`, `1-1400 = 0`, `1-1200 = -925.000`, `9-9999 = 0`), status SPJ `financially_approved`, status uang muka `settled`, re-approve ditolak, dan `get_trial_balance` seimbang.<br>3. **Test 14 ditambahkan**: Menguji atomisitas `delete_order`. Order ber-DP ditolak saat dihapus (`memegang uang`), status `stock_movements` tetap `pending` dan `stock_requests` tetap `draft_auto`. Setelah refund penuh via `release_order_deposit`, penghapusan order berhasil dan mengubah status `stock_movements` menjadi `cancelled` serta `stock_requests` menjadi `cancelled` dengan `source_order_id` kosong.<br>4. **Hasil Eksekusi**: Seluruh Test 1 s.d. Test 14 dieksekusi di database lokal Supabase via Docker psql dan **SEMUA LULUS** tanpa kesalahan. | Selesai |
| 2026-10-09 | Penambahan Test 15 & Cetak Notice Test 13 | 1. **Test 13 diperbarui**: Menambahkan cetak nilai `closing_debit` (2.925.000), `closing_credit` (2.925.000), dan rentang tanggal (`2026-11-01` s.d. `2026-11-30`) pada output NOTICE.<br>2. **Test 15 ditambahkan**: Menguji view `orders_with_balance` dan `sales_performance` di bawah konteks `authenticated` (user biasa). Order Rp 1.000.000 dengan sales dan DP Rp 500.000 terverifikasi menghasilkan `paid_amount = 500.000`, `remaining_amount = 500.000`, `status = belum_lunas`, serta metrik `sales_performance` (total_orders = 1, total_revenue = 1.000.000, total_paid = 500.000, total_outstanding = 500.000). Setelah `release_order_deposit` jenis refund Rp 500.000: `paid_amount = 0`, `remaining_amount = 1.000.000`, dan `sales_performance` (total_paid = 0, total_outstanding = 1.000.000). Seluruh asersi ketat lulus.<br>3. **Hasil Eksekusi**: Test 1 s.d. Test 15 **LULUS 100%**. | Selesai / Siap lanjut ke UI |
| 2026-10-09 | Frontend Fase A (Tahap 1 & 2) | 1. **Koneksi Supabase Lokal**: File `.env.local` dibuat dengan URL `http://127.0.0.1:54321` dan anon key lokal; dieksklusikan di `.gitignore`. Kredensial login seed `owner@sikon.com` / `password123` terverifikasi dapat autentikasi.<br>2. **Atomisitas `deleteOrder`**: [src/hooks/useOrders.ts](file:///d:/FARIDLAN/Dev/react/sikon-app/src/hooks/useOrders.ts) diperbarui memanggil RPC `delete_order` atomik. Di [src/pages/OrdersPage.tsx](file:///d:/FARIDLAN/Dev/react/sikon-app/src/pages/OrdersPage.tsx), pesan penolakan dari database ("tidak dapat dihapus karena masih memegang uang pelanggan...") ditampilkan apa adanya ke user.<br>3. **Route Akuntansi `/akuntansi`**: Menu "Akuntansi" ditambahkan ke Sidebar grup Transaksi ([src/components/layout/Sidebar.tsx](file:///d:/FARIDLAN/Dev/react/sikon-app/src/components/layout/Sidebar.tsx)), route terdaftar di [src/App.tsx](file:///d:/FARIDLAN/Dev/react/sikon-app/src/App.tsx). Halaman [src/pages/AccountingPage.tsx](file:///d:/FARIDLAN/Dev/react/sikon-app/src/pages/AccountingPage.tsx) mengimplementasikan 2 tab (mengikuti pola `PayrollPage.tsx` tanpa dependensi baru):<br>- **Tab Ringkasan**: Menampilkan status aktif/belum aktif, tombol aktivasi dengan modal input tanggal mulai (default tgl 1) dan saldo awal live dari `suggest_opening_balance`.<br>- **Tab Jurnal Umum**: Daftar jurnal dengan rincian baris debit/kredit, filter rentang tanggal, modal input jurnal manual seimbang live (tombol simpan terkunci jika tidak seimbang), dan tombol "Balik Jurnal" (`reverse_journal_entry`).<br>4. **Verifikasi Build**: Menjalankan `npm run build` (`tsc --noEmit && vite build`), build sukses 100% tanpa error TypeScript maupun bundling. | Selesai |
| 2026-10-10 | Perbaikan Bug Cascade Order Delete & Test 17 | 1. **Investigasi & Akar Masalah**: Penghapusan order gagal karena trigger `trg_sync_potong_stage` (`sync_potong_stage`), `trg_sync_potong_stage_ca` (`sync_potong_stage_from_ca`), dan `trg_sync_jahit_stage` (`sync_jahit_stage`) berjalan AFTER DELETE pada tabel anak (`order_items`, `cutting_assignments`, `sewing_assignments`) saat cascade delete order berlangsung, lalu memanggil `upsert_order_stage_event` yang melanggar FK `order_stage_events_order_id_fkey` karena induk di `orders` sedang/sudah dihapus.<br>2. **Migration Baru**: `20261010062000_fix_cascade_order_delete_stage_sync.sql` mendefinisikan ulang ketiga fungsi trigger dengan guard: jika `v_order_id` tidak lagi ada di tabel `orders`, trigger keluar dini tanpa memanggil `upsert_order_stage_event`.<br>3. **Test 17 ditambahkan**: Menguji skenario order dengan `order_items`, `cutting_assignments`, `sewing_assignments`, dan `order_stage_events`. Uji penolakan `delete_order` saat memegang DP Rp 200.000, pengembalian uang via `release_order_deposit`, dan keberhasilan `delete_order` tanpa error FK serta bersih menghapus seluruh relasi cascade.<br>4. **Hasil Eksekusi**: `supabase db reset` sukses menerapkan 45 migration. Seluruh smoke test (Test 1 s.d. Test 17) dieksekusi di database lokal dan **LULUS 100%**. `npm run build` sukses 100%. | Selesai |
| 2026-10-10 | Frontend Fase A (Tahap 1, 2, 3, & 4 Lengkap) | 1. **Tahap 0 (Bukti Kegagalan & Reset Penuh)**: Diverifikasi bahwa tanpa migration `20261010062000`, Test 17 gagal persis pada `delete_order` dengan pelanggaran FK `order_stage_events_order_id_fkey`. Setelah db reset penuh, seluruh Test 1 s.d. Test 17 lulus 100%. Diff 3 fungsi trigger timeline membuktikan hanya blok guard order delete yang ditambahkan.<br>2. **Tahap 1 (Neraca Saldo)**: Tab Neraca Saldo (`TrialBalanceTab.tsx`) memanggil `get_trial_balance(p_from, p_to)` dengan default rentang tanggal mulai pembukuan s.d. akhir bulan berjalan. Menampilkan saldo awal, mutasi periode, saldo akhir per akun, baris total, filter tanggal, dan lencana Seimbang / Tidak Seimbang.<br>3. **Tahap 2 (Buku Besar)**: Tab Buku Besar (`GeneralLedgerTab.tsx`) memanggil `get_general_ledger` dan `get_trial_balance` untuk menyajikan saldo awal periode dan mutasi berjalan dengan akhiran D/K (debit/kredit). Klik baris membuka modal rincian jurnal sumber (`JournalDetailModal.tsx`).<br>4. **Tahap 3 (Bagan Akun / COA)**: Tab Akun (`ChartOfAccountsTab.tsx` & `AccountModal.tsx`) menyajikan daftar akun dikelompokkan per tipe dengan penanda akun sistem (kunci), saldo live s.d. hari ini, modal tambah akun baru (report_group dinamis tanpa suspense, is_cash hanya asset), ubah nama, aktif/nonaktifkan non-sistem, dan hapus akun non-sistem dengan pesan error database apa adanya.<br>5. **Tahap 4 (Kategori & Transaksi Keuangan)**: Di `TransactionCategoryModal` & `TransactionCategoryList`, ditambahkan pilihan Akun Akuntansi (wajib untuk kategori baru jika akuntansi aktif, difilter per income/expense). Di `TransactionModal`, ditambahkan pilihan opsional "Dibayar via (Kas/Bank)" dengan default Bank untuk mengisi `cash_account_id`.<br>6. **Verifikasi Build**: `npm run build` sukses 100% tanpa error TypeScript maupun bundling (exit code 0). | Selesai |
| 2026-10-10 | Perbaikan Saldo Awal, Test 18, Helper Tanggal Lokal, & UI Net-Side | 1. **get_trial_balance & get_general_ledger**: Jurnal `opening_balance` bertanggal <= p_from dihitung sebagai saldo awal (`opening`), bukan mutasi (`period`).<br>2. **Test 18**: Ditambahkan ke `supabase/tests/accounting_smoke.sql` memverifikasi kolom opening memuat saldo awal, period = 0, seimbang, dan lines buku besar mutasi tidak memuat baris jurnal opening_balance.<br>3. **Helper Tanggal Lokal**: Membuat `dateHelpers.ts` (`formatLocalDateISO`, `todayISO`, `startOfMonthISO`, `endOfMonthISO`) mengatasi pergeseran UTC (30 vs 31 Oktober) dan memperbarui seluruh berkas di `src/` yang menggunakan pola `toISOString().split('T')[0]`.<br>4. **TrialBalanceTab Bersih Satu Sisi**: Saldo awal dan saldo akhir per akun ditampilkan bersih satu sisi, baris total dan lencana Seimbang dihitung dari nilai bersih.<br>5. **Buku Besar & COA Terjemahan**: Label akun/kelompok diterjemahkan penuh ke Bahasa Indonesia, Buku Besar otomatis memilih akun pertama yang memiliki mutasi (atau Bank). | Selesai |
| 2026-10-10 | Fase B1: Pengakuan Pendapatan Order (`20261010070000`) | 1. **Trigger `trg_journal_order_revenue`**: after update of `production_status`, `total_price`, `ongkir` pada `orders`.<br>2. **Posting saat Completed**: Mengakui Pendapatan Penjualan (4-1000) dan Ongkir (4-1100); mendebit Uang Muka Pelanggan (2-1200) sebesar `least(dibayar bersih, grand_total)` dan mendebit Piutang Usaha (1-1300) untuk sisanya jika belum lunas.<br>3. **Batal Kirim & Penyesuaian**: Menghapus jurnal saat status keluar dari `completed` (selama periode terbuka); memperbarui nilai tanpa mengubah `entry_date` jika nilai berubah selagi `completed`.<br>4. **Test 19 s.d. 26**: Pengujian lengkap order lunas, piutang, batal kirim, guard order completed, transaksi pra-mulai, dan DP pra-mulai. Lulus 100%. | Selesai |
| 2026-10-10 | Fase B2: Pembagian Upah Borongan (`20261010080000`) | 1. **Trigger `trg_journal_payroll_split`**: after update of `status`, `transaction_id` or delete pada `weekly_payrolls`.<br>2. **Reklasifikasi Terpisah**: Saat status `paid` dan `transaction_id` terisi, membuat jurnal `payroll_split` (Debit 5-1100, Kredit 6-1000) sebesar `least(Σ piecework_amount, amount transaksi)`. Jurnal transaksi kas gaji (Debit 6-1000, Kredit Bank/Kas) tetap utuh.<br>3. **Reversal & Proteksi Kunci**: Status keluar dari `paid` atau baris dihapus otomatis menghapus jurnal reklasifikasi; ditolak bila periode terkunci.<br>4. **Pembaruan `pay_weekly_payroll`**: Otomatis memetakan kategori `Gaji Karyawan` ke akun `6-1000` bila akuntansi aktif.<br>5. **Test 27**: Gaji Rp 3.000.000 dengan borongan Rp 2.000.000 terverifikasi Dr 5-1100 Rp 2.000.000, Dr 6-1000 Rp 1.000.000, Cr Bank Rp 3.000.000, 9-9999 = 0, tepat satu jurnal reklasifikasi & satu jurnal transaksi. Lulus 100%. | Selesai |
| 2026-10-10 | Fase B3: Tutup Bulan & Penyesuaian Persediaan (`20261010090000`) | 1. **Fungsi internal `acc_inventory_value`**: Menghitung $\Sigma (\text{stok efektif} \times \text{materials.price})$ per warna / non-warna mengikuti rumus resmi `GUDANG_DAN_PURCHASING.md §3.3`. Diterapkan juga pada `suggest_opening_balance` di migration 5.<br>2. **Tabel `inventory_valuations`**: Snapshot periodik nilai stok dan detail JSONB, RLS select-only bagi authenticated.<br>3. **RPC `close_accounting_period`**: Validasi akhir bulan, $\le \text{current\_date}$, berurutan. Menghitung selisih persediaan fisik $V$ vs buku $B$; memposting jurnal penyesuaian (Dr 5-1000 / Cr 1-1500 atau sebaliknya); memasang `locked_through`.<br>4. **RPC `reopen_accounting_period` & `get_close_preview`**: Buka kembali kunci periode dan hapus valuasi/jurnal penyesuaian terkait; preview perbandingan saldo buku vs nilai fisik.<br>5. **Test 28**: Stok fisik Rp 12.000.000, saldo buku Rp 16.000.000, tutup bulan menghasilkan Dr 5-1000 Rp 4.000.000 dan saldo 1-1500 menjadi Rp 12.000.000; kunci terpasang; transaksi periode terkunci ditolak; reopen dan tutup ulang idempotent. Lulus 100%. | Selesai |
| 2026-10-11 | Fase B4: Laporan Keuangan (`20261010100000`) | 1. **RPC `get_income_statement`**: Laba Rugi akrual berjenjang multi-level (Pendapatan, HPP, Laba Kotor, Opex, Laba Usaha, Lain-lain, Laba Bersih), kolom komparatif, toggle estimasi HPP sementara.<br>2. **RPC `get_balance_sheet`**: Neraca seimbang format skontro/stafel, komparatif, dan Laba Tahun Berjalan yang cocok persis dengan Laba Bersih Laba Rugi dari 1 Jan s.d. tanggal neraca.<br>3. **RPC `get_accounting_checks`**: 13 cek konsistensi otomatis. Rumus `CASH_MATCH` diperbarui: nilai harapan = saldo Kas+Bank jurnal `opening_balance` + $\Sigma(\text{income} - \text{expense})$ transaksi bertanggal $\ge \text{books\_start\_date}$ s.d. tanggal cek.<br>4. **Test 29**: Skenario akseptansi §7.1 cocok persis (Pendapatan 9.100.000, HPP 6.000.000, Laba Kotor 3.100.000, Beban Operasional 1.500.000, Laba Bersih 1.600.000; Neraca: Aset 31.600.000, Liabilitas 0, Ekuitas 31.600.000, balanced = true); perbandingan estimasi HPP aktif vs nonaktif; seluruh 13 cek konsistensi lulus (ok) dan 3 tes gagal paksa (CASH_MATCH, SUSPENSE_ZERO, CUSTOMER_ADV_MATCH) teruji; isolasi RLS antar user terverifikasi aman. Lulus 100%. | Selesai |
| 2026-10-11 | Verifikasi Lengkap Smoke Test (Test 1 s.d. 29) | `supabase start` bersih (49 migration terpasang). Seluruh Test 1 s.d. Test 29 di `supabase/tests/accounting_smoke.sql` dieksekusi di database lokal Supabase via Docker psql dan **SEMUA LULUS 100%**. Dokumentasi disinkronkan (`DATABASE.md`, `clear.sql`, `AKUNTANSI.md`, `RANCANGAN_AKUNTANSI_DASAR.md`, `RANCANGAN_LAPORAN_KEUANGAN.md`, `CATATAN_IMPLEMENTASI.md`). | Selesai |
| 2026-10-11 | Frontend Fase B: Tampilan Lengkap (Tahap A s.d. E) | 1. **Tab Laporan (`FinancialReportsTab.tsx`)**: Sub-tab Laba Rugi (`IncomeStatementView.tsx`) dan Neraca (`BalanceSheetView.tsx`). Bilah kontrol (`ReportControlBar.tsx`) dengan 6 preset periode, pilihan pembanding setara/tahun lalu/kustom, toggle estimasi HPP, spanduk status §6.2 (`ReportStatusBanner.tsx`), 3 kartu Laba Rugi dengan margin %, seksi lipat, baris estimasi miring, dua kolom Neraca skontro/stafel, kartu Modal Kerja & Rasio Lancar, klik baris membuka Buku Besar.<br>2. **Tab Tutup Buku (`ClosingPeriodTab.tsx`)**: Menampilkan batas terkunci, periode berikutnya yang akan ditutup, pratinjau `get_close_preview()` (saldo buku vs nilai stok fisik & rencana jurnal), konfirmasi kotak centang, eksekusi `close_accounting_period`, modal konfirmasi `reopen_accounting_period`, pesan error database apa adanya.<br>3. **Panel Cek Konsistensi & Jurnal 0 Baris**: Panel 13 aturan audit dari `get_accounting_checks` di Ringkasan; `GeneralJournalTab.tsx` & `JournalDetailModal.tsx` menangani jurnal tanpa baris secara informatif dan aman tanpa blank.<br>4. **Penyesuaian Halaman Keuangan**: Kartu "Selisih Kas" (hint pemasukan minus pengeluaran kas, bukan laba akuntansi), kartu "Total Kas & Bank", tautan "Lihat Laporan Laba Rugi" bila akuntansi aktif, peringatan saldo awal pembukuan tidak berubah di `EditBalanceModal.tsx`.<br>5. **Cetak & Unduh CSV**: Tombol unduh CSV (; sebagai pemisah, UTF-8 dengan BOM `\uFEFF`, angka mentah); modal cetak layar penuh (`PrintReportModal.tsx`) dengan logo, kop, dan blok tanda tangan dari `company_settings`.<br>6. **Verifikasi Build**: `npm run build` sukses 100% tanpa error TypeScript maupun bundling (exit code 0); smoke test Test 1 s.d. 29 tetap 100% LULUS. | Selesai |
| 2026-10-11 | Penyempurnaan Tampilan & Penyesuaian get_close_preview | 1. **get_close_preview**: Mengganti to_char(v_expected, 'Month YYYY') dengan format to_char(v_expected, 'MM/YYYY') agar tidak menghasilkan nama bulan bahasa Inggris; sinkronisasi batas `v_expected >= current_date`.<br>2. **ReportStatusBanner**: Mengubah teks spanduk sementara menjadi "HPP bahan baku diperkirakan dari selisih saldo buku persediaan dan nilai stok fisik saat ini (Rp X)".<br>3. **BalanceSheetView**: Menghapus label kualitatif pada kartu Rasio Lancar ("Likuiditas Sangat Baik" / "Perlu Pantauan"); hanya menampilkan rasio dan rumus `Aset Lancar / Liabilitas Lancar`.<br>4. **Dokumentasi Prosedur Uji**: Menambahkan panduan aman menyiapkan database lokal untuk uji tab Tutup Buku di layar tanpa menyentuh data pemilik. | Selesai |
| 2026-10-14 | Fase C: Aset Tetap, Penyusutan, & Antarmuka (`20261012080000` s.d. `20261014100000`) | 1. **Database Aset Tetap & Penyusutan**: Skema tabel `fixed_assets` & `fixed_asset_depreciations`, RPC `register_fixed_asset`, `dispose_fixed_asset`, `undo_dispose_fixed_asset`, `delete_fixed_asset`, `update_fixed_asset_info`, `get_fixed_asset_register`, `acc_depreciation_due`, integrasi penyusutan ke `close_accounting_period` & `reopen_accounting_period`.<br>2. **Perbaikan Integritas**: Penyusutan tuntas tepat menghabiskan nilai di bulan terakhir masa manfaat tanpa sisa & tanpa penyusutan sesudah nilai habis; `delete_fixed_asset` menolak aset disposed dengan pesan spesifik; `close_accounting_period` tanpa jurnal penyesuaian bila selisih persediaan nol; kategori 'Pembelian Aset Tetap' terkunci ke akun 1-2100; RPC `update_fixed_asset_info` hanya mengubah nama & catatan tanpa field angka.<br>3. **Cek Integritas**: Menambahkan aturan audit ke-14 `FIXED_ASSET_MATCH` dan ke-15 `DEPRECIATION_DUE` pada `get_accounting_checks`.<br>4. **Antarmuka (UI)**: Tab Aset Tetap (`FixedAssetsTab.tsx`) dengan 4 metrik, filter kelas & status, tabel register, modal pendaftaran (`FixedAssetModal.tsx`), modal pelepasan (`DisposeAssetModal.tsx`), modal detail riwayat (`AssetDetailModal.tsx`), dan modal ubah nama/catatan (`EditAssetInfoModal.tsx`); kode akun Kas 1-1100 dan Bank 1-1200 terhubung dinamis.<br>5. **Pengujian & Build**: Seluruh smoke test (Test 1 s.d. Test 39) LULUS 100% (40 baris LULUS mentah), `npm run build` sukses 100%. | Selesai |

---

## 9. Fase C: Aset Tetap, Penyusutan, dan Panduan Pengujian

### 9.1 Ringkasan Implementasi Database & Integritas
Tahap database Fase C menambahkan pencatatan aset tetap, penyusutan garis lurus bulanan, dan perbaikan integritas:
1. **Migration C1 (`20261012080000_accounting_fixed_assets_schema.sql`)**:
   - Skema tabel `public.fixed_assets` dan `public.fixed_asset_depreciations`.
   - Update enum check constraint `journal_entries_source_type_check` dan indeks parsial unik `idx_journal_entries_source_unique` untuk menyertakan `asset_opening`, `asset_disposal`, dan `depreciation`.
   - RPC `register_fixed_asset` (aset baru dengan transaksi kas pengeluaran, atau aset lama pra-pembukuan dengan jurnal pembuka seimbang ke `3-2000 Laba Ditahan`).
   - RPC `delete_fixed_asset` (hanya sebelum aset disusutkan).
   - Hak SELECT diberikan kepada `authenticated`; hak INSERT/UPDATE/DELETE dicabut (42501); proteksi isolasi data per user via RLS.
2. **Migration C2 (`20261012090000_accounting_depreciation_and_disposal.sql`)**:
   - Redefinisi `close_accounting_period`: menghitung penyusutan garis lurus bulanan tanpa prorata harian untuk seluruh aset aktif (`v_monthly_rate = round(dep_base / useful_life_months)`), pembulatan bulat, dan sisa nilai buku pada bulan terakhir masa manfaat tepat menghabiskan sisa perolehan tanpa melebihi batas; membuat satu jurnal bersama Dr `6-6000` / Cr akun akumulasi per kelas aset (`1-2110`, `1-2210`, `1-2310`, `1-2410`). Aset baru mulai disusutkan pada bulan kalender setelah perolehan; aset lama pra-pembukuan mulai disusutkan sejak bulan pertama pembukuan dibuka.
   - Redefinisi `reopen_accounting_period`: menghapus baris di `fixed_asset_depreciations` dan jurnal penyusutan sesudah tanggal kunci baru; penutupan ulang bersifat idempotent; ditolak bila terdapat aset yang dilepas sesudah tanggal kunci baru.
   - RPC `dispose_fixed_asset`: pelepasan aset tetap dengan jurnal seimbang (eliminasi harga perolehan & akumulasi, pencatatan kas/bank jika ada hasil penjualan, dan untung ke `4-9000` atau rugi ke `6-9000`).
   - RPC `undo_dispose_fixed_asset`: membatalkan pelepasan aset, memulihkan status ke `active`, dan membersihkan transaksi & jurnal pelepasan.
   - Redefinisi `get_accounting_checks`: menambah aturan ke-14 `FIXED_ASSET_MATCH` (mencocokkan saldo buku akun aset dan akumulasi per kelas dengan register aset) dan ke-15 `DEPRECIATION_DUE` (memastikan seluruh aset aktif telah memiliki riwayat penyusutan pada seluruh periode yang terkunci).
3. **Migration C3 (`20261012100000_accounting_fixed_assets_views_and_preview.sql`)**:
   - Fungsi internal `acc_depreciation_due(uuid, date)` untuk menghitung aset yang jatuh tempo disusutkan.
   - Redefinisi `close_accounting_period`: menggunakan `acc_depreciation_due` langsung tanpa tabel sementara.
   - Redefinisi `get_close_preview`: mengembalikan objek `depreciation` dan rincian `depreciation_by_class`.
   - RPC `get_fixed_asset_register(p_as_of)`: register aset lengkap dengan akumulasi, nilai buku (NBV), beban bulanan, status aktif/lunas susut/dilepas.
4. **Migration C4 (`20261014100000_accounting_fixed_assets_and_period_close_fixes.sql`)**:
   - Redefinisi `delete_fixed_asset`: menolak aset berstatus disposed dengan pesan spesifik *"Batalkan pelepasan aset terlebih dahulu"*.
   - Redefinisi `acc_depreciation_due`: menyusutkan persis habis pada bulan terakhir masa manfaat / sisa $\le$ tarif bulanan, menghitung posisi bulan untuk aset lama dari `accumulated_at_start / tarif`, dan mencegah baris penyusutan tambahan sesudah nilai habis.
   - Redefinisi `close_accounting_period`: tidak membuat jurnal penyesuaian bila selisih persediaan nol (tanpa baris bernilai nol); snapshot `inventory_valuations` tetap tersimpan dengan `journal_entry_id = null`.
   - Redefinisi `register_fixed_asset`: mengunci `account_id` kategori 'Pembelian Aset Tetap' ke akun `1-2100` saat pertama dibuat dan tidak diubah saat aset kelas lain didaftarkan; `counter_account_id` pada transaksi tetap menentukan akun aset debit yang tepat.
   - RPC baru `update_fixed_asset_info(p_asset_id, p_name, p_notes)`: hanya mengubah nama dan catatan aset, terproteksi auth/RLS, tanpa menyentuh angka.

### 9.2 Ringkasan Antarmuka Pengguna (UI) Aset Tetap
1. **Komponen Tab Aset Tetap (`FixedAssetsTab.tsx`)**:
   - 4 kartu ringkasan metrik: Biaya Perolehan, Akumulasi Susut, Nilai Buku Bersih, dan Beban Susut Bulanan.
   - Toolbar pencarian dan filter status (Semua, Aktif, Habis Susut, Dilepas) serta filter kelas aset.
   - Tabel register aset tetap dengan indikator status, nilai perolehan, akumulasi, nilai buku, dan penyusutan bulanan.
   - Tombol aksi per baris: **Lihat Detail** (`AssetDetailModal.tsx`), **Ubah Nama / Catatan** (`EditAssetInfoModal.tsx`), **Lepas Aset** (`DisposeAssetModal.tsx`), **Batalkan Pelepasan** (`undoDisposeFixedAsset`), dan **Hapus Aset** (`deleteFixedAsset`).
2. **Modal Pendaftaran Aset (`FixedAssetModal.tsx`)**:
   - Pilihan kelas aset dengan akun default (Mesin `1-2100`, Kendaraan `1-2200`, Perabot `1-2300`, Bangunan `1-2400`).
   - Pilihan metode pembayaran terhubung ke akun Kas (`1-1100`) dan Bank (`1-1200`).
   - Penanganan aset lama pra-pembukuan dengan akumulasi awal.
3. **Modal Ubah Nama / Catatan (`EditAssetInfoModal.tsx`)**:
   - Modal kecil tanpa field angka, hanya mengubah nama dan catatan fisik/lokasi aset.
4. **Modal Pelepasan Aset (`DisposeAssetModal.tsx`)**:
   - Menghitung laba/rugi pelepasan secara langsung dan pilihan akun penerimaan hasil pelepasan Kas (`1-1100`) / Bank (`1-1200`).
5. **Modal Detail & Riwayat (`AssetDetailModal.tsx`)**:
   - Rincian aset dan tabel riwayat pembebanan penyusutan bulanan dari `fixed_asset_depreciations` beserta tautan ke jurnal terkait.
6. **Integrasi Tab Tutup Buku & Ringkasan**:
   - Tab Tutup Buku (`ClosingPeriodTab.tsx`) menampilkan pratinjau penyusutan bulanan per kelas aset.
   - Tab Ringkasan (`AccountingSummaryTab.tsx`) memuat 15 aturan cek konsistensi integritas akuntansi.

### 9.3 Hasil Uji Smoke Test
- Seluruh 39 skenario smoke test akuntansi (`Test 1` s.d. `Test 39`) **LULUS 100%** (total 40 baris keluaran mentah "LULUS").
- Pengujian Fase C mencakup:
  - `Test 30`: Pembelian mesin tunai Rp 12.000.000, satu transaksi, susut mulai bulan kedua Rp 200.000, Neraca seimbang.
  - `Test 31`: Aset lama Rp 12.000.000 akumulasi Rp 2.400.000, jurnal pembuka seimbang ke 3-2000 Rp 9.600.000, susut sejak penutupan pertama.
  - `Test 32`: Kasus pembulatan Rp 10.000.000 umur 7 bulan, habis tanpa sisa.
  - `Test 33`: Pelepasan untung, rugi, hasil nol seimbang, pemulihan via undo_dispose.
  - `Test 34`: Reopen menghapus baris penyusutan pasca-kunci baru, penutupan ulang idempotent, guard pelepasan.
  - `Test 35`: delete_fixed_asset hanya diizinkan sebelum aset disusutkan.
  - `Test 36`: Hak akses 42501 untuk authenticated, proteksi isolasi data per user, kas 1-1100 vs transfer 1-1200.
  - `Test 37`: Aturan audit FIXED_ASSET_MATCH dan DEPRECIATION_DUE valid pada kondisi normal dan terbukti mendeteksi anomali saat dipaksa gagal.
  - `Test 38`: Pratinjau get_close_preview cocok persis dengan eksekusi penutupan, nilai register konsisten sebelum/sesudah tutup dan lepas.
  - `Test 39`: Penyusutan tuntas tepat Rp 10.000.000 tanpa sisa pada penutupan ke-7 untuk aset baru dan lama, penutupan ke-8 tidak menyusutkan, penolakan hapus aset disposed dengan pesan spesifik, tutup bulan selisih nol tanpa jurnal, kategori terkunci ke 1-2100, dan update_fixed_asset_info aman.

### 9.4 Panduan Menyiapkan Database Lokal untuk Pengujian Tab Tutup Buku (Manual di Layar)

> [!IMPORTANT]
> **PERINGATAN KERAS BAGI AGEN**:
> Prosedur SQL di bawah ini **HANYA** boleh dijalankan di database lokal Supabase (atau user uji lokal terpisah).
> **JANGAN PERNAH** menjalankan query pengubahan `books_start_date` atau manipulasi data di database/akun yang sedang aktif dipakai oleh pemilik tanpa izin eksplisit di chat.

Secara desain akuntansi yang ketat, RPC `close_accounting_period` dan `get_close_preview` menolak penutupan periode untuk bulan berjalan atau bulan masa depan (`period_end >= current_date`). Penutupan buku hanya diizinkan untuk bulan yang kalendernya sudah berakhir penuh.

Bila database lokal baru diaktifkan dengan `books_start_date` pada bulan ini (atau bulan depan seperti `2026-11-01`), tab Tutup Buku di browser akan menampilkan status bahwa bulan belum berakhir (`can_close = false`).

#### Langkah Menyiapkan Pengujian di Layar:
1. **Gunakan User Uji Lokal Khusus (Rekomendasi)**
   Jalankan psql di database lokal (Docker) untuk mengaktifkan user uji dengan tanggal mulai di bulan lalu:
   ```sql
   select public.init_accounting(
     p_books_start_date := (date_trunc('month', current_date) - interval '1 month')::date
   );
   ```
2. **Atau Sesuaikan `books_start_date` Akun Uji Lokal (Bila Belum Ada Jurnal)**:
   ```sql
   update public.accounting_settings
      set books_start_date = (date_trunc('month', current_date) - interval '1 month')::date,
          locked_through = null
    where user_id = '<USER_ID_LOKAL>';
   ```
3. **Pastikan Ada Saldo Buku dan Nilai Fisik Persediaan**:
   - Catat stok material atau modal awal persediaan di bulan lalu.
   - Atau pastikan akun `1-1500 Persediaan Bahan Baku` memiliki saldo buku via jurnal saldo awal / pembelian bahan.
4. **Pengujian di Browser**:
   - Buka `/akuntansi`, klik tab **Tutup Buku**.
   - Periksa Pratinjau: batas terkunci, periode berikutnya, selisih persediaan fisik vs buku, dan pratinjau penyusutan aset.
   - Centang kotak konfirmasi lalu klik tombol **Tutup Periode**.
   - Periksa perubahan indikator terkunci, jurnal penyesuaian di tab Jurnal Umum, dan laporan final.
   - Uji buka kembali via tombol **Buka Kembali Periode**.


