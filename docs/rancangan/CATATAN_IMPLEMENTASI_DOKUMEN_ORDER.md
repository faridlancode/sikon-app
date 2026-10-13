# Catatan Implementasi: Dokumen Order (serah-terima untuk agen)

- Dibuat: 2026-10-12 (diperbarui 2026-10-13)
- Lokasi di repo: `docs/rancangan/CATATAN_IMPLEMENTASI_DOKUMEN_ORDER.md`
- Tujuan: agen mana pun (akun atau model berbeda) harus bisa melanjutkan pekerjaan hanya dari file di repo ini, tanpa riwayat chat.
- **Agen wajib memperbarui §8 (log progres) setiap selesai satu langkah.**

---

## 1. Urutan Baca (Wajib, Sebelum Menyentuh Apa Pun)

1. `AGENTS.md`
2. `docs/AGENT_INSTRUCTIONS.md`
3. `docs/ORDER_DAN_KEUANGAN.md`
4. `docs/ARSITEKTUR_TEKNIS.md`
5. `docs/rancangan/RANCANGAN_DOKUMEN_ORDER.md` (sumber kebenaran fitur ini; baca sebelum file ini)
6. File ini
7. `git status`, `git log -n 15 --stat`, dan `git diff` terhadap branch utama

Kalau isi file ini bertentangan dengan dokumen rancangan, **dokumen rancangan menang**, kecuali bagian yang jelas-jelas koreksi di §5.

---

## 2. Aturan Main (Tidak Boleh Dilanggar)

1. **Jangan menjalankan `supabase db push`, `db reset` ke remote, atau SQL tulis apa pun ke database tanpa persetujuan eksplisit pemilik di chat.** Perintah baca (`migration list`, `select`) boleh.
2. **Satu migration (atau satu kelompok koreksi) per langkah.** Tampilkan SQL-nya, lalu berhenti dan tunggu persetujuan.
3. **Jangan menandai fase "selesai"** sebelum lulus uji di database lokal sekali pakai.
4. **Migration yang sudah terpasang di remote tidak boleh diedit.** Koreksi lewat migration baru.
5. **Menulis file SQL:** pakai alat edit/buat-file, **bukan** `Set-Content` dengan here-string PowerShell. Simpan UTF-8 **tanpa BOM**. Setelah menulis, periksa tidak ada `''kata''` (dua kutip tunggal).
6. **Jangan menambah dependensi frontend baru** tanpa persetujuan pemilik. (Tidak ada react-pdf, jspdf, dsb.)
7. **Tidak ada perubahan ke tabel existing** (`orders`, `order_items`, `order_payments`, `transactions`). Additive-only.
8. **Kwitansi dibuat otomatis oleh trigger database**, bukan dari frontend. Frontend hanya fetch dan render.
9. **Konversi quotation ke order** tidak boleh insert langsung ke `orders`. Ia mengembalikan data prefill untuk form frontend.
10. **Opsi TTD/cap tidak disimpan ke database.** Hanya state lokal React saat preview cetak.
11. **Nota: cek dulu sebelum insert.** Karena `notas.order_id` UNIQUE, frontend SELECT dulu; insert hanya jika belum ada.
12. **Tidak ada integrasi email/WhatsApp.** Distribusi dokumen dilakukan user secara manual di luar sistem.
13. **Tidak ada kolom HPP di quotation_items.** Keputusan pemilik. Jangan tambahkan kembali.
14. Bahasa: Indonesia untuk komentar domain, pesan error, dan dokumen.
15. Bila ragu atau menemukan hal yang bertentangan dengan rancangan, **berhenti dan bertanya**, jangan memutuskan sendiri.

---

## 3. Keputusan Pemilik (Semua Sudah Terjawab -- 2026-10-13)

| # | Keputusan | Detail Implementasi |
|---|----------|---------------------|
| 1 | HPP di Surat Penawaran: tidak perlu | Tidak ada kolom HPP di `quotation_items`. Form tidak ada field HPP. |
| 2 | Kwitansi: otomatis via trigger | Trigger `trg_auto_create_receipt` AFTER INSERT pada `order_payments`; `trg_delete_receipt_on_payment` AFTER DELETE. |
| 3 | Opsi TTD/cap: 3 mode | `PrintOptionsPanel` + `SignatureArea` di frontend. Gambar dari `company_settings.signatureUrl` + `stampUrl`. |
| 4 | Kirim ke pelanggan: tidak perlu | Tidak ada integrasi WhatsApp/email dalam scope. |
| 5 | Halaman arsip kwitansi/nota: tidak perlu | Hanya dari modal detail order. |
| 6 | Edit Surat Penawaran setelah sent: bisa | Status `sent` tidak mengunci form. Tidak ada versioning. |
| 7 | Reset penomoran: per bulan | Format `PREFIX-YYYYMM-NNNN`, counter per `year_month`. |

---

## 4. Keadaan Terakhir

### 4.1 Fakta (Sudah Dikonfirmasi)

- Migration terakhir sebelum fitur ini dimulai: **belum diketahui** -- cek di Langkah 0.
- Tabel yang dibutuhkan (`orders`, `order_payments`, `bank_accounts`, `sales`) sudah ada.
- `company_settings` sudah punya `signatureUrl` dan `stampUrl` (konfirmasi nama kolom persis di Langkah 0 butir 6).
- Tidak ada kode frontend untuk generate dokumen saat ini.
- Contoh PDF sudah ada di `docs/PDF/` (5 file: Surat Penawaran, Invoice, Kwitansi, Nota, SPK & Surat Jalan).
- Rancangan diperbarui 2026-10-13 -- semua 7 pertanyaan pemilik sudah terjawab.

### 4.2 Belum Diketahui (Periksa di Langkah 0)

- Nomor migration terakhir yang terpasang di remote.
- Apakah project remote adalah project uji (hanya pemilik yang tahu).
- Nama kolom persis TTD dan cap di `company_settings` (camelCase atau snake_case?).
- Tipe kolom `bank_accounts.id` dan `order_payments.id`.

---

## 5. Langkah 0 (Read-Only) -- Kerjakan Dulu dan Laporkan

Sebelum menulis satu baris pun kode, laporkan:

1. `npx supabase migration list --linked` -- migration mana yang terpasang di remote vs lokal.
2. Nama dan timestamp migration terakhir di folder `supabase/migrations/`.
3. Tipe kolom `sales.id`: `select column_name, data_type from information_schema.columns where table_name = 'sales' and column_name = 'id'`.
4. Tipe kolom `bank_accounts.id`: idem untuk table_name = 'bank_accounts'.
5. Tipe kolom `order_payments.id`: idem untuk table_name = 'order_payments'.
6. Nama persis kolom TTD dan cap di interface `CompanyProfile` di `src/types.ts`. Cari kata kunci `signature` dan `stamp`.
7. Apakah `order_payments` punya kolom `customer_name` langsung, atau perlu JOIN ke `orders` untuk mendapatkannya? (Dibutuhkan oleh `fn_auto_create_receipt`.)

**Berhenti setelah melaporkan.** Pemilik menentukan: lanjut ke database lokal sekali pakai atau project scratch terpisah.

---

## 6. Temuan Review yang Harus Diperbaiki

> Bagian ini diisi oleh agen saat review kode.

*(Belum ada temuan -- belum ada kode yang ditulis.)*

---

## 7. Rencana Uji (`supabase/tests/document_order_smoke.sql`)

Jalankan hanya di database lokal sekali pakai. Uji minimal:

**A. Penomoran dan Counter**
1. `generate_document_no('quotation', user_id)` menghasilkan `PNW-YYYYMM-0001`; panggil ulang menghasilkan `PNW-YYYYMM-0002`.
2. Counter bulan berbeda menghasilkan urutan mulai dari 0001 lagi.
3. Dua panggilan bersamaan tidak menghasilkan nomor yang sama.

**B. Quotations**
4. Insert ke `quotations` tanpa `order_id` berhasil.
5. `quotation_items` tidak punya kolom HPP (verifikasi schema `\d quotation_items`).
6. Kolom `subtotal GENERATED ALWAYS AS` tidak bisa di-INSERT eksplisit.
7. Delete `quotations` menghapus `quotation_items` via cascade.
8. Update `quotations` saat status `sent` berhasil (tidak ada constraint yang menghalangi).

**C. Trigger Kwitansi Otomatis**
9. Insert ke `order_payments` --> baris baru di `receipts` otomatis muncul.
10. Nomor kwitansi format `KWT-YYYYMM-NNNN`.
11. `receipts.payment_id` UNIQUE -- payment kedua menghasilkan kwitansi baru dengan payment_id berbeda.
12. Delete `order_payments` --> baris di `receipts` ikut terhapus otomatis.
13. Trigger tidak error jika `signatureUrl` tidak relevan (guard null).

**D. Nota**
14. Insert `notas` dengan `order_id` baru berhasil.
15. Insert `notas` kedua kali untuk `order_id` yang sama gagal (UNIQUE constraint).
16. Insert `notas` tanpa `order_id` ditolak (NOT NULL).

**E. RLS dan GRANT**
17. User B tidak bisa SELECT data `quotations` milik user A.
18. User B tidak bisa INSERT ke `quotations` dengan `user_id` milik user A.
19. GRANT: user `authenticated` bisa INSERT ke `quotations`; user `anon` tidak bisa.
20. Trigger `fn_auto_create_receipt` berjalan SECURITY DEFINER agar bisa INSERT ke `receipts`.

**F. Frontend (manual di browser)**
21. Modal PrintOptionsPanel tampil dengan 3 pilihan mode TTD.
22. Mode `none`: area TTD/cap kosong saat preview dan saat dicetak.
23. Mode `signature_only`: gambar TTD muncul, tidak ada cap.
24. Mode `signature_and_stamp`: TTD + cap semi-transparan overlap dengan benar.
25. Hasil print tidak menyertakan elemen UI modal/toolbar.
26. `signatureUrl` atau `stampUrl` null: render area kosong, tidak broken image.

---

## 8. Log Progres (Diisi Agen)

| Tanggal | Langkah | Hasil | Menunggu Persetujuan Pemilik? |
|---------|---------|-------|-------------------------------|
| 2026-10-12 | Rancangan dibuat | Selesai | Ya |
| 2026-10-12 | File ini dibuat | Selesai | Ya |
| 2026-10-13 | Fitur opsi TTD/cap + §0.1 alasan tabel terpisah + layout dari contoh PDF | Selesai | Ya |
| 2026-10-13 | Semua 7 pertanyaan dijawab; rancangan difinalisasi | Selesai | Menunggu persetujuan fase implementasi |

---

## 9. Struktur Migration yang Direncanakan

> Semua file di bawah **BELUM DIBUAT**. Satu file per tujuan, ikuti `ARSITEKTUR_TEKNIS.md §3`.

| No | Fase | Nama File (rencana) | Isi Singkat |
|----|------|--------------------|-------|
| M1 | 1 | `YYYYMMDDHHMMSS_document_counters.sql` | Tabel `document_counters` + RPC `generate_document_no` (SELECT FOR UPDATE) + RLS + GRANT |
| M2 | 1 | `YYYYMMDDHHMMSS_quotations.sql` | Tabel `quotations` + `quotation_items` (tanpa kolom HPP) + RLS + GRANT |
| M3 | 1 | `YYYYMMDDHHMMSS_quotation_rpcs.sql` | RPC `convert_quotation_to_order` (prefill form, tidak insert) |
| M4 | 2 | `YYYYMMDDHHMMSS_invoices.sql` | Tabel `invoices` + `invoice_items` + RLS + GRANT |
| M5 | 2 | `YYYYMMDDHHMMSS_invoice_rpcs.sql` | RPC `create_invoice_from_quotation`, `create_invoice_from_order` |
| M6 | 3 | `YYYYMMDDHHMMSS_receipts_notas.sql` | Tabel `receipts` (UNIQUE payment_id) + `notas` (UNIQUE order_id) + RLS + GRANT |
| M7 | 3 | `YYYYMMDDHHMMSS_receipt_triggers.sql` | `fn_auto_create_receipt` + `fn_delete_receipt_on_payment` + trigger AFTER INSERT/DELETE pada `order_payments` |

**Penting:** `clear.sql` dan `seed.sql` harus diperbarui setiap kali migration baru menambah tabel.

---

## 10. Struktur Frontend yang Direncanakan

```
src/
  components/
    documents/
      QuotationTemplate.tsx     -- Template print surat penawaran
      InvoiceTemplate.tsx       -- Template print invoice
      ReceiptTemplate.tsx       -- Template print kwitansi
      NotaTemplate.tsx          -- Template print nota
      DocumentPreviewModal.tsx  -- Modal wrapper + PrintOptionsPanel + tombol cetak
      PrintOptionsPanel.tsx     -- Panel pilihan mode TTD/cap
      SignatureArea.tsx          -- Komponen area TTD: render berbeda tiap mode
      utils/
        terbilang.ts            -- Konversi angka ke huruf Indonesia
  hooks/
    useQuotations.ts            -- CRUD quotations + quotation_items
    useInvoices.ts              -- CRUD invoices + invoice_items
    useReceipts.ts              -- READ ONLY: fetch receipts (dibuat oleh trigger)
    useNotas.ts                 -- Get-or-create nota + fetch
  pages/
    QuotationsPage.tsx          -- Halaman /quotations
    InvoicesPage.tsx            -- Halaman /invoices
```

Catatan penting untuk `useReceipts.ts`: hook ini **READ ONLY**.
Frontend tidak pernah INSERT ke `receipts` -- itu tugas trigger.
Fungsi yang dibutuhkan:
```
fetchReceiptByPaymentId(paymentId) --> SELECT dari receipts WHERE payment_id = paymentId
```

Integrasi ke halaman yang sudah ada:
- `OrdersPage.tsx` / modal detail order: tombol Cetak Kwitansi (per payment) + Cetak Nota (jika lunas)
- `App.tsx`: tambah route `/quotations` dan `/invoices`
- `Sidebar.tsx`: tambah menu Penawaran dan Invoice di grup Order

---

## 11. Potensi Gotcha

| Gotcha | Penjelasan |
|--------|-----------|
| `quotations.order_id` nullable | FK tidak boleh NOT NULL. |
| `GENERATED ALWAYS AS ... STORED` | Kolom `subtotal` tidak bisa di-INSERT eksplisit. |
| Tidak ada kolom HPP di quotation_items | Keputusan pemilik. Jangan tambahkan kembali. |
| `window.print()` vs Tailwind | Template dokumen pakai inline style atau CSS module. |
| Terbilang angka besar | Cek dulu apakah ada utilitas serupa di `src/utils/` sebelum buat ulang. |
| Urutan `size_breakdown` JSONB | Iterasi `Object.entries` dan urutkan manual: S < M < L < XL < XXL. |
| `bank_account_id` di `invoices` | Tipe uuid atau bigint -- cek Langkah 0 butir 4. |
| `payment_id` di `receipts` | Tipe harus cocok dengan `order_payments.id`. Cek Langkah 0 butir 5. |
| Race condition penomoran | `generate_document_no` wajib `SELECT ... FOR UPDATE`. |
| Trigger receipt: butuh customer_name | `fn_auto_create_receipt` JOIN ke `orders` untuk dapat `customer_name`. |
| Trigger receipt vs delete_order_payment | Trigger AFTER DELETE. Lookup via `payment_id` (UNIQUE). |
| UNIQUE order_id di notas | Frontend SELECT dulu sebelum INSERT nota. Jika sudah ada, pakai yang lama. |
| stampUrl vs signatureUrl | Periksa nama kolom persis di `src/types.ts` (Langkah 0 butir 6). |
| Cap overlay di @media print | `position:absolute`, `opacity:0.75`, `mix-blend-mode:multiply`. Tes di print preview. |
| signatureUrl / stampUrl null | Guard null: render area kosong, bukan broken image. |
| `convert_quotation_to_order` | Tidak insert ke `orders`. Mengembalikan data prefill untuk form. |

---

*Dokumen ini hidup bersama implementasi -- agen wajib memperbarui §8 (log progres) setiap selesai satu langkah.*
