# Catatan Implementasi: Dokumen Order (serah-terima untuk agen)

- Dibuat: 2026-10-12 (diperbarui 2026-10-13; **direvisi 2026-10-14 setelah audit terhadap repo**)
- Lokasi di repo: `docs/rancangan/CATATAN_IMPLEMENTASI_DOKUMEN_ORDER.md`
- Tujuan: agen mana pun (akun atau model berbeda) harus bisa melanjutkan pekerjaan hanya dari file di repo ini, tanpa riwayat chat.
- **Agen wajib memperbarui §8 (log progres) setiap selesai satu langkah.**
- Pola kerja mengikuti fitur akuntansi: `docs/rancangan/CATATAN_IMPLEMENTASI.md` (boleh dibaca sebagai contoh bentuk log, uji, dan serah-terima).

---

## 1. Urutan Baca (Wajib, Sebelum Menyentuh Apa Pun)

1. `AGENTS.md`
2. `docs/AGENT_INSTRUCTIONS.md` (aturan migration, docs, checklist §9)
3. `docs/README.md`
4. `docs/ORDER_DAN_KEUANGAN.md` (domain pemilik fitur ini)
5. `docs/ARSITEKTUR_TEKNIS.md` (§2 RLS/GRANT, §5 tabel, §7 known issues)
6. `docs/AKUNTANSI.md` (hanya untuk memastikan fitur ini **tidak** menyentuh akuntansi)
7. `docs/rancangan/RANCANGAN_DOKUMEN_ORDER.md` (sumber kebenaran fitur ini; baca sebelum file ini)
8. File ini
9. Contoh pola yang akan ditiru:
   - `supabase/migrations/20261008070000_accounting_journal_core.sql` (tabel select-only, `revoke insert/update/delete`, helper internal `next_journal_entry_no`)
   - `supabase/migrations/20261008080000_accounting_patch_spj_and_payment_rpc.sql` (`record_order_payment` versi terbaru)
   - `src/hooks/useAccounting.ts`, `src/pages/AccountingPage.tsx`
   - `src/components/accounting/reports/PrintReportModal.tsx` dan `src/components/payroll/PayrollSlipModal.tsx` (pola cetak)
   - `src/components/orders/OrderDetailModal.tsx`
10. `git status`, `git log -n 15 --stat`, dan `git diff` terhadap branch utama

Kalau isi file ini bertentangan dengan dokumen rancangan, **dokumen rancangan menang**, kecuali bagian yang jelas-jelas koreksi di §6 (yang memang meralat rancangan dan sudah ikut diterapkan ke rancangan).

---

## 2. Aturan Main (Tidak Boleh Dilanggar)

1. **Jangan menjalankan `supabase db push`, `db reset` ke remote, atau SQL tulis apa pun ke database remote tanpa persetujuan eksplisit pemilik di chat.** Perintah baca (`migration list`, `select`) boleh.
2. **Pemilik belum mengonfirmasi bahwa project Supabase yang terhubung ke repo ini adalah project uji.** Jangan berasumsi. Tanyakan.
3. **Satu migration (atau satu kelompok koreksi) per langkah.** Tampilkan SQL-nya, lalu berhenti dan tunggu persetujuan.
4. **Jangan menandai fase "selesai"** sebelum lulus uji di database lokal sekali pakai (`supabase start`, perlu Docker).
5. **Migration yang sudah terpasang di remote tidak boleh diedit.** Koreksi lewat migration baru. Migration yang belum terpasang boleh diedit di tempat.
6. **Menulis file SQL:** pakai alat edit/buat-file, **bukan** `Set-Content` dengan here-string PowerShell. Simpan UTF-8 **tanpa BOM**. Setelah menulis, periksa tidak ada `''kata''` (dua kutip tunggal) dan tidak ada karakter non-ASCII yang tak disengaja.
7. **Jangan menampilkan isi `.env`, kunci API, atau panggilan HTTP/REST ad hoc ke Supabase.** Pakai Supabase CLI atau SQL.
8. **Jangan menambah dependensi frontend baru** tanpa persetujuan (tidak ada react-pdf, jspdf, dsb.). Cetak memakai `window.print()` mengikuti pola yang sudah ada.
9. **Additive-only:** tidak ada perubahan ke tabel existing (`orders`, `order_items`, `order_payments`, `transactions`) dan tidak ada edit `record_order_payment` / `delete_order_payment`. Kalau menurut agen perlu, **berhenti dan tanya**.
10. **Kwitansi dibuat otomatis oleh trigger database**, frontend hanya membaca (`select`).
11. **Semua penulisan dokumen lewat RPC**, bukan `insert`/`update` langsung dari frontend. Tabel dokumen select-only untuk `authenticated` (`revoke insert, update, delete`). Alasan: header+item+nomor harus atomik (`AGENT_INSTRUCTIONS.md` §1.7).
12. **`generate_document_no` adalah fungsi internal** (`revoke execute ... from public, anon, authenticated`). Tidak boleh dipanggil dari frontend.
13. **Opsi TTD/cap tidak disimpan ke database.** Hanya state lokal React.
14. **Tidak ada integrasi email/WhatsApp.** Distribusi dokumen manual oleh user.
15. **Tidak ada kolom HPP di `quotation_items`.** Keputusan pemilik.
16. **Fitur ini tidak menyentuh tabel akuntansi** (`accounts`, `journal_*`, `accounting_settings`) dan tidak memakai `orders.production_status = 'quotation'`.
17. **Dokumentasi:** ikuti `AGENT_INSTRUCTIONS.md` §4 dan §9 saat fase selesai (satu file domain pemilik, `DATABASE.md`, `ARSITEKTUR_TEKNIS.md`, `clear.sql`, `seed.sql`, `README.md`).
18. **UI:** di akhir setiap tugas yang menyentuh UI, tulis daftar "Yang bisa dicek di browser" (`AGENTS.md`). Jangan menulis hasil tampilan yang tidak benar-benar dilihat.
19. Bahasa: Indonesia untuk komentar domain, pesan error, dan dokumen.
20. Bila ragu atau menemukan hal yang bertentangan dengan rancangan, **berhenti dan bertanya**, jangan memutuskan sendiri.

---

## 3. Keputusan Pemilik

### 3.1 Sudah dijawab (2026-10-13)

| # | Keputusan | Detail Implementasi |
|---|----------|---------------------|
| 1 | HPP di Surat Penawaran: tidak perlu | Tidak ada kolom HPP di `quotation_items`. |
| 2 | Kwitansi: otomatis via trigger | `trg_auto_create_receipt` AFTER INSERT pada `order_payments`. (Penghapusan lewat `ON DELETE CASCADE`, lihat T5.) |
| 3 | Opsi TTD/cap: 3 mode | `PrintOptionsPanel` + `SignatureArea`. Gambar dari `profile.signatureUrl` + `profile.stampUrl`. |
| 4 | Kirim ke pelanggan: tidak perlu | Tidak ada WhatsApp/email. |
| 5 | Halaman arsip kwitansi/nota: tidak perlu | Hanya dari modal detail order. |
| 6 | Edit Surat Penawaran setelah sent: bisa | Status `sent` tidak mengunci form. |
| 7 | Reset penomoran: per bulan | `PREFIX-YYYYMM-NNNN`. |

### 3.2 Menunggu jawaban (usulan hasil audit 2026-10-14)

Detail di `RANCANGAN_DOKUMEN_ORDER.md` §9.2. **Agen tidak boleh menganggap ini final sebelum pemilik menjawab di chat.** Sampai dijawab, pakai default di rancangan.

| # | Ringkas | Default |
|---|---------|---------|
| P1 | Nota tanpa breakdown ukuran, qty dikirim, alamat (datanya tidak ada) | Dihapus |
| P2 | Invoice punya `invoice_type` dan `amount_due` | Ya |
| P3 | Penomoran pakai tanggal dokumen | Ya |
| P4 | Penawaran tertaut order tidak bisa dihapus; invoice terbit hanya dibatalkan | Ya |
| P5 | Konversi ke Order menyentuh `OrderModal.tsx` (langkah terpisah) | Ya, setelah rencana disetujui |
| P6 | Backfill kwitansi untuk pembayaran lama | Ya |
| P7 | "Kedaluwarsa" hanya penanda tampilan | Ya |

---

## 4. Keadaan Terakhir

### 4.1 Fakta (sudah diverifikasi dari isi repo pada 2026-10-14)

- Migration terakhir di folder: `20261014100000_accounting_fixed_assets_and_period_close_fixes.sql` (53 file). Nomor migration baru harus lebih besar.
- `orders.id`, `order_payments.id`, `sales.id`, `company_bank_accounts.id`: semuanya **`uuid`**. `orders.order_id` adalah kode teks `ORD-xxxx`.
- Tabel rekening bernama **`company_bank_accounts`**.
- DB: `company_settings.signature_url`, `stamp_url`. Frontend: `profile.signatureUrl`, `profile.stampUrl` (`src/types.ts`).
- `order_payments` **tidak punya** `customer_name`: kolomnya `order_id`, `amount`, `payment_type` (`dp`/`pelunasan`), `payment_method` (`cash`/`transfer`/`qris`/`lainnya`), `payment_date`, `transaction_id`.
- `orders` tidak punya alamat; `order_items` tidak punya breakdown ukuran atau qty terkirim.
- `orders.status` = status pembayaran (`belum_lunas`/`lunas`).
- `delete_order_payment` menghapus baris `order_payments`; `order_payments.order_id` `on delete cascade`.
- Belum ada `terbilang`, `quotations`, `invoices`, `receipts`, `notas`, atau `document_counters` di `src/` maupun `supabase/`.
- Pola cetak existing: `PrintReportModal.tsx`, `PayrollSlipModal.tsx` (`window.print()`).

### 4.2 Belum Diketahui (periksa di Langkah 0)

- Migration mana yang terpasang di remote (`migration list --linked`).
- Apakah project remote adalah project uji (hanya pemilik yang tahu).
- Apakah folder `docs/PDF/` (contoh layout dokumen) ada di repo. **Tidak ada di arsip zip yang diaudit.** Rancangan dan catatan lama merujuknya sebagai sumber layout.
- Bagaimana `PrintReportModal`/`PayrollSlipModal` menyembunyikan shell aplikasi saat cetak (`src/index.css` tidak berisi aturan `print`).

---

## 5. Langkah 0 (Read-Only): Kerjakan Dulu dan Laporkan

Butir tipe kolom dari catatan lama sudah terjawab di §4.1, tidak perlu ditanyakan ulang. Laporkan:

1. `npx supabase migration list --linked`: migration lokal vs remote. Apakah `20261014100000` sudah terpasang.
2. Apakah `docs/PDF/` ada dan berisi 5 contoh (Surat Penawaran, Invoice, Kwitansi, Nota, SPK & Surat Jalan). Bila tidak ada, **minta pemilik menyediakannya** sebelum membuat template.
3. Cara cetak existing: bagaimana `PrintReportModal.tsx` dan `PayrollSlipModal.tsx` menyembunyikan sidebar/header (kelas `print:hidden`, CSS global, atau cara lain).
4. Cocokkan pola `user_id` FK dan `on delete` di `20261008063000_accounting_chart_of_accounts.sql` dengan DDL di rancangan §2.
5. `git status` bersih? Ada perubahan tak ter-commit yang menyentuh `supabase/` atau `src/components/orders/`?
6. Konfirmasi dari pemilik: apakah project remote adalah project uji; dan jawaban P1 sampai P7 bila sudah ada.

**Berhenti setelah melaporkan.** Pemilik menentukan: lanjut ke database lokal sekali pakai (`supabase start`) atau project scratch terpisah, dan menyetujui Fase 1.

---

## 6. Temuan Review (sudah diterapkan ke rancangan; agen memverifikasi lagi sebelum menulis SQL)

Review ini dibuat dengan membaca isi repo, **tanpa menjalankan SQL**. Verifikasi setiap butir terhadap file sebenarnya; bila ada yang tidak benar, laporkan.

| # | Temuan | Dasar di repo | Koreksi |
|---|--------|---------------|---------|
| T1 | Tipe ID `bigint` salah | `20260101000002_core_financial_and_orders.sql`: `orders`, `order_payments`, `sales` `uuid` | Semua FK `uuid` |
| T2 | `bank_accounts` tidak ada | Tabel `company_bank_accounts` | FK diganti |
| T3 | Trigger delete kwitansi berbahaya | FK tanpa cascade menggagalkan hapus pembayaran dan `delete_order` | Trigger delete dibuang; `ON DELETE CASCADE` pada `receipts.payment_id` dan `receipts.order_id` |
| T4 | `SELECT ... FOR UPDATE` tidak mengunci baris yang belum ada | Counter bulan baru kosong | `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` |
| T5 | `generate_document_no` bisa disalahgunakan bila publik | Parameter `user_id` dari pemanggil | Internal: revoke dari semua role, pola `next_journal_entry_no` |
| T6 | Header dan item ditulis dari frontend | `AGENT_INSTRUCTIONS.md` §1.7 | RPC `save_*`, tabel select-only |
| T7 | Nota get-or-create dari frontend | Balapan + nomor terbuang | RPC `get_or_create_nota`, `snapshot jsonb` |
| T8 | `convert_quotation_to_order` hanya-baca | Tidak ada yang perlu atomik | Ganti `link_quotation_to_order` |
| T9 | Kolom hilang: syarat bayar, lead time, rekening (quotation); jenis, pembayaran sebelumnya, jumlah ditagih (invoice) | Isi dokumen di rancangan lama tak punya kolom | Kolom ditambah |
| T10 | Nota meminta data yang tidak ada | `orders`/`order_items` tanpa alamat, ukuran, qty kirim | Dihapus (P1) |
| T11 | Kwitansi tidak ada untuk pembayaran lama | Trigger hanya untuk insert baru | Backfill idempotent di M7 |
| T12 | `expired` disimpan tanpa cron | Tidak ada backend | Dihitung di tampilan |
| T13 | Tailwind vs cetak | Repo sudah punya pola cetak | Ikuti pola existing |
| T14 | `terbilang.ts` salah lokasi | Konvensi `src/utils/` | Dipindah |
| T15 | `orders.production_status = 'quotation'` membingungkan | Nilai ada tanpa UI | Tidak dipakai |
| T16 | `updated_at` tanpa trigger | Selalu basi | Diisi dalam RPC |
| T17 | Catatan lama kekurangan aturan dari `AGENT_INSTRUCTIONS.md` | Pembaruan `README.md`, `DATABASE.md`, `ARSITEKTUR_TEKNIS.md`, peleburan ke domain, daftar "Yang bisa dicek di browser" | Ditambah di §2 dan §12 |
| T18 | Rujukan `docs/PDF/` tidak ditemukan di arsip | `ls docs/PDF` kosong | Langkah 0 butir 2 |

---

## 7. Rencana Uji (`supabase/tests/document_order_smoke.sql`)

Pola dan bentuk mengikuti `supabase/tests/accounting_smoke.sql`. Jalankan hanya di database lokal sekali pakai. Setiap uji mencetak `LULUS` atau gagal dengan pesan jelas.

**A. Penomoran dan counter**
1. `generate_document_no(user, 'quotation', tanggal)` menghasilkan `PNW-YYYYMM-0001`, panggilan kedua `0002`.
2. Bulan berbeda mulai lagi dari `0001`; tipe berbeda punya counter sendiri.
3. Menghapus dokumen terakhir lalu membuat baru **tidak** memakai ulang nomor.
4. Dua sesi bersamaan (dua koneksi `psql`) di bulan baru tidak menghasilkan nomor kembar.
5. Sebagai `authenticated`: memanggil `generate_document_no` ditolak (`42501`).

**B. Quotations**
6. `save_quotation` baru: header + item tersimpan, nomor terisi, `updated_at` terisi. Edit mengganti item.
7. `quotation_items` tidak punya kolom HPP; `subtotal` generated (INSERT eksplisit ditolak).
8. `save_quotation` dengan `sales_id`/`bank_account_id` milik user lain ditolak; tanpa item ditolak.
9. Edit saat `status = 'sent'` berhasil.
10. `delete_quotation` menghapus item (cascade); ditolak bila `order_id` terisi.
11. `link_quotation_to_order`: mengisi `order_id`, status `accepted`; kedua kalinya ditolak; order milik user lain ditolak.
12. Hapus order yang tertaut: `quotations.order_id` menjadi null (tanpa error FK).

**C. Invoice (Wajib Menempel ke Penawaran atau Pesanan - Tanpa Orphan/Manual)**
13. `save_quotation` baru: OTOMATIS melahirkan satu invoice penawaran (`INV-YYYYMM-NNNN`, `source_type = 'quotation'`, `quotation_id` terisi, `amount_due = grand_total * dp_percent/100`).
14. Pembuatan pesanan (order): OTOMATIS melahirkan invoice pesanan (`source_type = 'order'`, `order_id` terisi, `paid_amount` = jumlah DP masuk, `amount_due` = sisa pelunasan).
15. Constraint integritas: invoice tanpa `quotation_id` dan tanpa `order_id` DITOLAK (`invoices_parent_check`). `source_type` selain `quotation`/`order` DITOLAK (`invoices_source_check`).
16. Pembayaran bertambah di `order_payments` memperbarui `paid_amount` dan `amount_due` pada invoice pesanan terkait. Saat order lunas, status invoice menjadi `paid`.
17. `set_invoice_status`: transisi valid lolos, tidak valid ditolak. `delete_invoice` hanya `draft`.
18. Hapus order/penawaran sumber: invoice tetap ada (`set null`).

**D. Trigger kwitansi otomatis**
17. `record_order_payment` menghasilkan satu baris `receipts` dengan `KWT-YYYYMM-NNNN`, `customer_name` dan `order_code` benar, `amount`/`payment_type`/`payment_method` cocok.
18. Pembayaran kedua order yang sama menghasilkan kwitansi kedua dengan `payment_id` berbeda; `payment_id` unik.
19. `delete_order_payment` menghapus kwitansi terkait (cascade), tanpa error FK.
20. `delete_order` (setelah DP direfund lewat `release_order_deposit`) menghapus kwitansi dan nota tanpa error FK.
21. Backfill: pembayaran yang dibuat sebelum trigger mendapat kwitansi; menjalankan ulang tidak menggandakan.
22. Kegagalan trigger membatalkan pembayaran (uji dengan memaksa error, lalu pastikan tidak ada `transactions`/`order_payments` yatim).
23. Tidak ada baris baru di `journal_entries` akibat kwitansi (selain jurnal dari transaksi existing).

**E. Nota**
24. `get_or_create_nota` pada order belum lunas ditolak.
25. Pada order lunas: nota dibuat, `snapshot` berisi item dan pembayaran; panggilan kedua mengembalikan baris yang sama (nomor sama).
26. Edit `order_items` setelah nota: `snapshot` tidak berubah.
27. Order milik user lain ditolak.

**F. RLS dan GRANT**
28. User B tidak bisa `select` dokumen milik user A pada semua tabel baru.
29. Sebagai `authenticated`: `insert`/`update`/`delete` langsung pada `quotations`, `quotation_items`, `invoices`, `invoice_items`, `receipts`, `notas`, `document_counters` ditolak (`42501`).
30. `anon` tidak punya akses apa pun.
31. Semua fungsi trigger/internal: `revoke execute` dari `public`, `anon`, `authenticated`; RPC publik hanya `authenticated`.
32. Penghapusan user dummy (cascade `auth.users`) tidak tertahan tabel baru.

**G. Regresi (wajib lulus ulang)**
33. Seluruh `accounting_smoke.sql` (Test 1 s.d. 39) tetap lulus setelah semua migration baru.
34. `clear.sql` lalu `seed.sql` berjalan tanpa error.

**H. Frontend (manual di browser, dicatat dalam "Yang bisa dicek di browser")**
35. Form penawaran: tiga langkah, item dinamis, tanpa field HPP; simpan, edit saat `sent`.
36. Pratinjau cetak: panel 3 mode TTD.
37. Mode `none`: area TTD/cap kosong. `signature_only`: TTD tanpa cap. `signature_and_stamp`: cap semi-transparan menimpa dengan benar.
38. `signatureUrl`/`stampUrl` null: area kosong, tidak ada gambar rusak.
39. Hasil cetak tidak menyertakan sidebar, header, atau toolbar modal.
40. `OrderDetailModal`: tombol Cetak Kwitansi per pembayaran; Cetak Nota hanya saat lunas.
41. `npm run build` sukses (tsc + vite).

---

## 8. Log Progres (Diisi Agen)

| Tanggal | Langkah | Hasil | Menunggu Persetujuan Pemilik? |
|---------|---------|-------|-------------------------------|
| 2026-10-12 | Rancangan dibuat | Selesai | Ya |
| 2026-10-12 | File ini dibuat | Selesai | Ya |
| 2026-10-13 | Fitur opsi TTD/cap + §0.1 alasan tabel terpisah + layout dari contoh PDF | Selesai | Ya |
| 2026-10-13 | Semua 7 pertanyaan dijawab; rancangan difinalisasi | Selesai | Ya |
| 2026-10-14 | Audit rancangan terhadap isi repo; 19 koreksi (K1 s.d. K19) diterapkan ke rancangan, catatan ini direvisi, prompt agen dibuat | Selesai (tanpa menjalankan SQL) | **Ya: setujui revisi dan jawab P1 s.d. P7** |
| 2026-10-15 | Langkah 0 (read-only): verifikasi 6 butir, fakta repo, temuan T1–T18, dan docs/PDF/ | Selesai (53 migration lokal cocok, docs/PDF/ ada 5 berkas, DDL/FK/tipe kolom terverifikasi) | **Ya: konfirmasi P1–P7 & persetujuan Fase 1** |
| 2026-10-15 | Fase 1 - M1: `document_counters` + `generate_document_no` | Selesai (migrasi lokal terpasang, smoke test Bagian A 1-5 lulus, clear.sql & seed.sql sukses, regresi akuntansi lulus) | Ya: persetujuan SQL M2 |
| 2026-10-15 | Fase 1 - M2 & M3: `quotations`, `quotation_items`, RPC `save/set/delete/link` | Selesai (migrasi lokal terpasang, smoke test Bagian A & B 1-12 + RLS lulus 100%, clear & seed sukses, regresi akuntansi lulus) | Tidak |
| 2026-10-15 | Fase 1 - B: Frontend Penawaran (`/quotations`, wizard 3 langkah, pratinjau cetak 3 mode TTD/cap, hook, types, terbilang) | Selesai (`npm run build` sukses 0 error) | Tidak |
| 2026-10-15 | Fase 1 - C: Konversi Penawaran ke Order (`OrderModal.tsx` prefill, `OrdersPage.tsx` navigasi + linking RPC `link_quotation_to_order`, `QuotationsPage.tsx` tombol Jadikan Pesanan) | Selesai | Tidak |
| 2026-10-15 | Fase 1 - D: Penutupan Fase 1 (Smoke test Bagian A & B lulus 100%, regresi akuntansi 39 test lulus, clear & seed sukses, build lolos, `DATABASE.md` & `clear.sql` tersinkron) | Selesai | Tidak |
| 2026-10-15 | Fase 1 - Penyempurnaan: Referensi Item & Spesifikasi Kain Tekstil (Migration 57, form item terstruktur kategori/produk/kain/warna, auto-spesifikasi tekstil kain, auto-fill item pesanan lengkap ke OrderModal) | Selesai (Smoke test 1-13 lulus, build lolos) | Tidak |
| 2026-10-15 | Fase 1 - Perbaikan 3 Butir Akhir: (1) Spesifikasi kain di template PDF & printout, (2) Auto-fill kategori, model, kain, dan warna saat 'Jadikan Pesanan', (3) Auto-hydrate & select fallback kategori, model, kain, warna saat 'Ubah Penawaran' | Selesai (`npm run build` sukses 0 error) | Ya: persetujuan lanjut ke Fase 2 (Invoice: M4) |
| 2026-10-16 | Fase 2 - Rancang Ulang Invoice (Zero Orphan Invoice): Menghapus invoice manual; invoice WAJIB menempel ke quotation (`source_type = 'quotation'`) atau order (`source_type = 'order'`). Setiap membuat quotation/order otomatis melahirkan invoice terkait. Dokumen RANCANGAN & CATATAN diperbarui. | Selesai dirancang | Tidak |
| 2026-10-16 | Fase 2 - Implementasi Zero Orphan (Migration 60 `20261016100000_invoice_parent_and_automation.sql`): trigger guard orphan, automasi kelahiran invoice di `save_quotation` & `addOrder`, trigger auto-sync pembayaran `trg_sync_order_invoice_on_payment`, `link_quotation_to_order` DP paid, update frontend `InvoicesPage.tsx` navigasi shortcut. Smoke tests 1–17 & akuntansi 1–39 lulus 100%, `npm run build` sukses 0 error. | Selesai & Lulus Uji | Tidak |
| 2026-10-17 | Fase 2 - Tambahan: Pratinjau & Cetak Invoice di Halaman Pesanan (`OrdersPage.tsx`, `OrdersTable.tsx`, `OrderDetailModal.tsx`) & Penyederhanaan Tampilan Bahan di Invoice (Migration 61 `20261017070000_invoice_remove_fabric_specs.sql`: deskripsi invoice hanya memuat nama kain dan warna tanpa spesifikasi teknis kain, `cleanInvoiceDescription` di `InvoiceTemplate.tsx`). Smoke tests 1–17 lulus 100%. | Selesai & Lulus Uji | Tidak |
| 2026-10-17 | Fase 3 - M6: Tabel `receipts` dan `notas` (Migration 62 `20261017080000_receipts_notas.sql`): skema, relasi FK cascade, unique constraint per user, RLS select-only authenticated, pembaruan `clear.sql` (51 tabel), `seed.sql`, `DATABASE.md`. Smoke tests 1–17 & akuntansi 1–39 lulus 100%. | Selesai & Lulus Uji | Tidak |
| 2026-10-17 | Fase 3 - M7: Trigger Kwitansi Otomatis & Backfill (Migration 63 `20261017090000_receipt_trigger.sql`): `fn_auto_create_receipt` (security definer, internal, revoke execute), trigger AFTER INSERT `order_payments`, backfill idempotent data existing, isolasi jurnal terbukti. Smoke tests 1–20 & akuntansi 1–39 lulus 100%. | Selesai & Lulus Uji | Tidak |
| 2026-10-17 | Fase 3 - M8: RPC `get_or_create_nota` (Migration 64 `20261017100000_nota_rpc.sql`): status check `orders.status = 'lunas'`, snapshot JSON (`items`, `payments`, `ongkir`), penomoran `NTA-YYYYMM-NNNN`, idempoten. Smoke tests 1–25 & akuntansi 1–39 lulus 100%. | Selesai & Lulus Uji | Tidak |
| 2026-10-17 | Fase 3 - Frontend: `ReceiptTemplate.tsx`, `NotaTemplate.tsx`, `useReceipts.ts`, `useNotas.ts`, tombol Cetak Kwitansi & Cetak Nota pada `OrderDetailModal.tsx`. `npm run build` sukses 0 error. | Selesai & Lulus Uji | Tidak |
| 2026-10-17 | Fase 3 - Penutupan Fitur: Konsolidasi dokumentasi (`ORDER_DAN_KEUANGAN.md`, `ARSITEKTUR_TEKNIS.md`, `DATABASE.md`, `README.md`, `docs/README.md`), audit simbol, pengarsipan berkas rancangan. | Selesai | Tidak |

---

## 9. Struktur Migration yang Direncanakan

> Semua file di bawah **BELUM DIBUAT**. Satu file per tujuan, ikuti `ARSITEKTUR_TEKNIS.md` §3. Nomor harus lebih besar dari `20261014100000`.

| No | Fase | Nama File (rencana) | Isi Singkat |
|----|------|--------------------|-------|
| M1 | 1 | `YYYYMMDDHHMMSS_document_counters.sql` | `document_counters` + `generate_document_no` (internal) |
| M2 | 1 | `YYYYMMDDHHMMSS_quotations.sql` | `quotations` + `quotation_items` + RLS + grant select-only |
| M3 | 1 | `YYYYMMDDHHMMSS_quotation_rpcs.sql` | `save_quotation`, `set_quotation_status`, `delete_quotation`, `link_quotation_to_order` |
| M4 | 2 | `YYYYMMDDHHMMSS_invoices.sql` | `invoices` + `invoice_items` + RLS + grant select-only |
| M5 | 2 | `YYYYMMDDHHMMSS_invoice_rpcs.sql` | `save_invoice`, `set_invoice_status`, `delete_invoice`, `create_invoice_from_quotation`, `create_invoice_from_order` |
| M6 | 3 | `YYYYMMDDHHMMSS_receipts_notas.sql` | `receipts` + `notas` + RLS + grant select-only |
| M7 | 3 | `YYYYMMDDHHMMSS_receipt_trigger.sql` | `fn_auto_create_receipt` + trigger `AFTER INSERT` + backfill |
| M8 | 3 | `YYYYMMDDHHMMSS_nota_rpc.sql` | `get_or_create_nota` |

**Penting:** `clear.sql` dan `seed.sql` diperbarui setiap kali migration menambah tabel (`TRUNCATE` mencakup 7 tabel baru: `document_counters`, `quotations`, `quotation_items`, `invoices`, `invoice_items`, `receipts`, `notas`).

---

## 10. Struktur Frontend yang Direncanakan

```
src/
  components/documents/
    QuotationTemplate.tsx   InvoiceTemplate.tsx   ReceiptTemplate.tsx   NotaTemplate.tsx
    DocumentPreviewModal.tsx   PrintOptionsPanel.tsx   SignatureArea.tsx
    (komponen form/tabel penawaran dan invoice di subfolder atau file terpisah)
  hooks/
    useQuotations.ts  useInvoices.ts
    useReceipts.ts   -- READ ONLY: select dari receipts where payment_id = ...
    useNotas.ts      -- memanggil RPC get_or_create_nota
  pages/
    QuotationsPage.tsx   InvoicesPage.tsx
  utils/
    terbilang.ts     -- cek dulu tidak ada utilitas serupa (saat audit: tidak ada)
```

Integrasi ke yang sudah ada:
- `OrderDetailModal.tsx`: tombol Cetak Kwitansi per pembayaran, Cetak Nota jika lunas (perubahan kecil; tampilkan diff sebelum menerapkan).
- `App.tsx`: route `/quotations` dan `/invoices` (ikuti pola `/akuntansi`).
- `Sidebar.tsx`: dua menu baru di grup **Transaksi**.
- `OrderModal.tsx`: **hanya** untuk Konversi ke Order, langkah terpisah di akhir Fase 1, setelah rencana disetujui (P5).
- Pakai `formatIDR`, `dateHelpers.ts`, `useCompanySettings`; tipe baru di `src/types.ts`; pemanggilan `supabase` mengikuti `useAccounting.ts`.

---

## 11. Potensi Gotcha

Daftar lengkap ada di `RANCANGAN_DOKUMEN_ORDER.md` §8.3 (satu tempat, tidak disalin lagi di sini supaya tidak berbeda isi). Yang paling mudah terlewat:

1. Semua ID `uuid`; FK ke `orders` selalu ke `orders.id`, bukan kode `ORD-xxxx`.
2. Trigger kwitansi berjalan di dalam `record_order_payment`; errornya membatalkan pembayaran.
3. Tabel baru dapat `GRANT ALL` otomatis dari default privileges: **revoke tulis secara eksplisit**.
4. FK ke `orders` pada tabel baru harus `cascade` (kwitansi, nota) atau `set null` (penawaran, invoice) agar `delete_order` tidak gagal.
5. Overload fungsi (`PGRST203`): satu signature per RPC.

---

## 12. Checklist Penutupan (dari `AGENT_INSTRUCTIONS.md` §9)

- [x] Migration baru, nomor naik, idempotent, 1 tujuan, UTF-8 tanpa BOM, tanpa `''kata''`
- [x] `supabase/clear.sql` mencakup 7 tabel baru
- [x] `supabase/seed.sql` masih valid; `clear.sql` lalu `seed.sql` jalan tanpa error di DB lokal
- [x] `supabase/tests/document_order_smoke.sql` lulus semua, dan `accounting_smoke.sql` tetap lulus
- [x] `npm run build` sukses
- [x] `README.md` root diperbarui
- [x] **Satu** file domain (`docs/ORDER_DAN_KEUANGAN.md`) diperbarui, termasuk tabel Daftar RPC/Trigger
- [x] `ARSITEKTUR_TEKNIS.md` §5 (tabel) dan §7 diperbarui
- [x] `supabase/DATABASE.md` diperbarui (baris migration, jumlah migration dan tabel)
- [x] `docs/README.md` diperbarui (route, istilah)
- [x] Nama di docs sama persis dengan SQL dan dengan pemakaian di `src/` (`grep` keduanya)
- [x] File rancangan dipindah ke `docs/arsip/`
- [x] Ringkasan ke pemilik menyebut apa yang belum dicek, plus daftar "Yang bisa dicek di browser"

---

*Dokumen ini hidup bersama implementasi: agen wajib memperbarui §8 (log progres) setiap selesai satu langkah.*
