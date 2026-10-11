# Catatan Implementasi Backend Katalog Publik (serah-terima untuk agen)

- Dibuat: 2026-10-11
- Lokasi di repo: `docs/rancangan/CATATAN_IMPLEMENTASI_CATALOG.md`
- Dokumen rancangan acuan: `docs/rancangan/RANCANGAN_SIKON_CATALOG_BACKEND.md`
- Dokumen roadmap acuan: `docs/rancangan/Roadmap Integrasi sikon-catalog dan sikon-app-dashboard.md`
- Tujuan: Agen mana pun (akun, IDE, atau model LLM berbeda) harus dapat melanjutkan dan mengeksekusi pekerjaan backend/database katalog publik hanya dari file di repo ini, tanpa memerlukan riwayat obrolan (chat history).
- **Agen wajib memperbarui §8 (log progres) setiap kali menyelesaikan satu langkah.**

---

## 1. Urutan Baca (Wajib, sebelum menyentuh kode/database apa pun)

1. `AGENTS.md` (aturan arsitektur umum, larangan berasumsi UI tanpa verifikasi).
2. `docs/AGENT_INSTRUCTIONS.md` (aturan pembuatan migration, konvensi penamaan, idempotent SQL, larangan edit migration lama).
3. `docs/rancangan/Roadmap Integrasi sikon-catalog dan sikon-app-dashboard.md` (peta jalan menyeluruh integrasi antara dashboard dan katalog publik).
4. `docs/rancangan/RANCANGAN_SIKON_CATALOG_BACKEND.md` (sumber kebenaran spesifikasi teknis database, skema DDL, dan kontrak RPC publik).
5. File ini (`docs/rancangan/CATATAN_IMPLEMENTASI_CATALOG.md`).
6. `git status`, `git branch`, dan periksa riwayat migration aktif di repo.

> [!IMPORTANT]
> Jika isi file ini bertentangan dengan dokumen rancangan (`RANCANGAN_SIKON_CATALOG_BACKEND.md`), **dokumen rancangan yang menang**, kecuali jika terdapat koreksi eksplisit di bagian log progres atau persetujuan tertulis dari pemilik di obrolan.

---

## 2. Aturan Main Keras (Tidak Boleh Dilanggar)

1. **Fokus Saat Ini: DATABASE & BACKEND SAJA.** Jangan membuat kode frontend UI, jangan mengedit komponen dashboard atau aplikasi React sebelum skema database dan fungsi RPC publik selesai diuji secara menyeluruh.
2. **Jangan Menjalankan SQL Tulis ke Remote Tanpa Persetujuan Pemilik.** Jangan pernah menjalankan `supabase db push`, `db reset` terhadap database remote tanpa persetujuan eksplisit dari pemilik di chat. Pengujian dilakukan di database lokal (Supabase CLI lokal / Docker).
3. **Zero Direct Table Grants to `anon`.** Role `anon` (pengunjung web katalog publik) sama sekali tidak boleh diberi `GRANT SELECT, INSERT, UPDATE, DELETE` ke tabel mana pun. Seluruh komunikasi data katalog wajib melewati PostgreSQL Function bertanda `SECURITY DEFINER` dengan `SET search_path = public`.
4. **Satu Migration per Langkah.** Setiap penambahan tabel atau fungsi baru dikelompokkan ke dalam satu file migration yang terisolasi. Tampilkan draf SQL, lakukan uji coba di transaksi lokal, dan laporkan hasilnya sebelum melangkah ke migration berikutnya.
5. **Hindari PostgreSQL Overloading (`PGRST203`).** Ketika memperbarui fungsi RPC publik yang sudah ada dengan parameter baru atau tipe return berbeda, wajib mencantumkan `DROP FUNCTION IF EXISTS ...` dengan signature lama sebelum membuat fungsi baru.
6. **Penulisan File Migration yang Bersih.**
   - Gunakan format UTF-8 **tanpa BOM**.
   - Hindari tanda kutip ganda rusak (`''kata''`) akibat script here-string.
   - Semua fungsi `security definer` wajib mencantumkan `REVOKE ALL ON FUNCTION ... FROM public;` dan secara selektif memberikan `GRANT EXECUTE ON FUNCTION ... TO anon, authenticated;`.
7. **Bahasa Standar.** Bahasa Indonesia untuk komentar domain di SQL, pesan kesalahan bisnis, dan dokumentasi teknis.
8. **Bila Ragu, Berhenti dan Bertanya.** Jika menemukan ambiguitas aturan bisnis (seperti rumus diskon tier, format tracking code, atau kebijakan data ulasan), berhenti dan mintalah konfirmasi dari pemilik.

---

## 3. Ringkasan Keputusan Arsitektur

| # | Topik | Keputusan |
|---|---|---|
| 1 | Hak Akses Publik | Role `anon` hanya bisa memanggil fungsi `catalog_*` (security definer). Whitelist kolom ketat, nol eksposur data biaya, stok riil, dan margin. |
| 2 | Foto Produk | Tabel `product_images` dengan partial unique index untuk satu foto utama (`where is_primary = true`). |
| 3 | Kurasi Produk | Kolom `is_published`, `is_featured`, dan `sort_order` di tabel `products`. |
| 4 | Opsi Kain & Penyesuaian Harga | Tabel `product_fabric_options`. Mendukung penyesuaian harga (`price_adjustment`) dan default kain per produk. Informasi gramasi (`weight_gsm`) dan deskripsi publik (`catalog_description`) melekat pada tabel `materials`. |
| 5 | Metadata Sales | Kolom `photo_url`, `tagline`, `display_order`, `show_in_catalog`, `slug` unik, dan jam kerja pada tabel `sales`. |
| 6 | Sistem Ulasan | Ulasan hanya dapat dikirim lewat token acak yang disimpan dalam hash (`review_invitations`). Status ulasan default `pending` dan wajib moderasi pemilik sebelum tampil publik. |
| 7 | Angka Terjual (`sold_count`) | Dihitung dinamis dari akumulasi `order_items.qty` pada pesanan dengan status `production_status = 'completed'`. |
| 8 | Profil Perusahaan | Kolom kontak resmi di `company_settings` dan penanda rekening DP publik di `company_bank_accounts.show_in_catalog`. |
| 9 | Pelacakan Pesanan | Verifikasi dua faktor: kode unik acak 8 karakter (`tracking_code`) + 4 digit terakhir nomor telepon pemesan. Respons seragam jika data tidak cocok (proteksi brute-force). |
| 10 | Formulir Kontak & Leads | Form inquiry dengan proteksi honeypot; pencatatan lead klik WhatsApp tanpa data PII pengunjung. |

---

## 4. Keadaan Terakhir (Baseline Repositori)

### 4.1 Fakta Terverifikasi

- Repositori saat ini berada pada branch `feature/sikon-catalog`.
- Total terdapat **49 migration** di folder `supabase/migrations/`.
- File migration baseline untuk katalog publik: `supabase/migrations/20261006120000_catalog_public_read_rpc.sql` (migration urutan ke-35).
- File migration ke-36 hingga ke-49 mencakup modul akuntansi dasar hingga laporan keuangan yang baru saja selesai diuji dan lulus uji 100% pada database lokal.
- Fungsi RPC katalog yang didefinisikan di `20261006120000_catalog_public_read_rpc.sql` adalah:
  1. `catalog_list_categories()`
  2. `catalog_list_sales()`
  3. `catalog_list_products(p_search, p_category_id, p_sort, p_page, p_limit, p_short_id)`

### 4.2 Hal yang Perlu Dikonfirmasi Sebelum Mulai Menulis Migration Baru

- Apakah migration baseline katalog `20261006120000_catalog_public_read_rpc.sql` sudah terpasang dan dapat dieksekusi oleh role `anon` di lingkungan lokal Supabase?
- Bagaimana kebijakan Supabase Storage bucket `company-assets` untuk akses publik?

---

## 5. Rencana Tahapan Eksekusi Backend (Langkah demi Langkah)

Pengerjaan database dibagi menjadi langkah-langkah terstruktur berikut:

```
[Langkah 0: Read-Only Verification & Lingkungan Lokal]
       │
       ▼
[Langkah 1: Verifikasi & Smoke Test RPC Baseline Fase 0]
       │
       ▼
[Langkah 2: Migration 50 — Galeri Foto Produk & Kontrol Publikasi Produk]
       │
       ▼
[Langkah 3: Migration 51 — Opsi Kain, Penyesuaian Harga, & GSM Material]
       │
       ▼
[Langkah 4: Migration 52 — Pengayaan Metadata Sales & Slug Unik]
       │
       ▼
[Langkah 5: Migration 53 — Pembaruan RPC List Produk & Sales (Fase 1)]
       │
       ▼
[Langkah 6: Migration 54 — Sistem Ulasan Bertoken & Agregasi Rating]
       │
       ▼
[Langkah 7: Migration 55 — Info Perusahaan Publik, Rekening DP, & Sold Count]
       │
       ▼
[Langkah 8: Migration 56 — Pelacakan Pesanan Aman (Dual Verification)]
       │
       ▼
[Langkah 9: Migration 57 — Kotak Masuk Kontak & Logging Lead WhatsApp]
       │
       ▼
[Langkah 10: Pembuatan & Eksekusi Smoke Test Komprehensif (catalog_smoke.sql)]
```

---

### Rincian Tiap Langkah:

#### Langkah 0: Verifikasi Lingkungan Lokal (Read-Only)
- Pastikan Supabase CLI lokal aktif (`supabase status`).
- Periksa status migration lokal (`npx supabase migration list --local`).
- Pastikan branch git berada di `feature/sikon-catalog`.

#### Langkah 1: Verifikasi & Uji Role Anon pada RPC Baseline (Fase 0)
- Menjalankan uji kueri SQL dengan impersonasi role `anon`:
  ```sql
  set role anon;
  select * from public.catalog_list_categories();
  select * from public.catalog_list_sales();
  select * from public.catalog_list_products();
  reset role;
  ```
- Memastikan tidak ada error izin akses (`42501`) dan kolom yang dihasilkan bebas dari data sensitif internal.

#### Langkah 2: Migration 50 — Galeri Foto Produk & Kontrol Publikasi (`product_images` & `products`)
- Buat file migration: `supabase/migrations/20261012100000_catalog_product_images_and_publication.sql`.
- Buat tabel `product_images`:
  - Kolom: `id`, `user_id`, `product_id`, `image_url`, `is_primary`, `sort_order`, `created_at`.
  - Partial unique index: `create unique index on product_images(product_id) where is_primary = true`.
  - Kebijakan RLS: `auth.uid() = user_id`.
- Tambahkan kolom pada tabel `products`:
  - `is_published` (boolean default false), `is_featured` (boolean default false), `sort_order` (int default 0), `updated_at` (timestamptz default now).
  - Trigger otomatis `updated_at` saat baris produk diubah.
  - Backfill aman: update produk aktif eksisting menjadi `is_published = true`.
- Daftarkan `product_images` ke `supabase/clear.sql`.

#### Langkah 3: Migration 51 — Opsi Kain, Penyesuaian Harga, & GSM Material
- Buat file migration: `supabase/migrations/20261012110000_catalog_fabric_options_and_gsm.sql`.
- Tambahkan kolom pada `materials`:
  - `weight_gsm` (integer null).
  - `catalog_description` (text null).
- Buat tabel `product_fabric_options`:
  - Kolom: `id`, `user_id`, `product_id`, `material_id`, `price_adjustment`, `is_offered`, `is_default`, `sort_order`, `created_at`.
  - Constraint unik: `unique (product_id, material_id)`.
  - Partial unique index: `create unique index on product_fabric_options(product_id) where is_default = true`.
  - RLS: `auth.uid() = user_id`.
- Daftarkan `product_fabric_options` ke `supabase/clear.sql`.

#### Langkah 4: Migration 52 — Pengayaan Metadata Sales & Slug Unik
- Buat file migration: `supabase/migrations/20261012120000_catalog_sales_metadata_and_slug.sql`.
- Tambahkan kolom pada tabel `sales`:
  - `photo_url` (text null), `tagline` (text null), `display_order` (int default 0), `show_in_catalog` (bool default true), `slug` (varchar(50) null), `open_time` (time null), `close_time` (time null).
  - Unique index: `lower(trim(slug))` jika slug tidak null.
  - Backfill aman: generate slug dasar dari nama sales untuk data awal yang ada di dev/seed.

#### Langkah 5: Migration 53 — Pembaruan RPC List Produk & Sales (Fase 1)
- Buat file migration: `supabase/migrations/20261012130000_catalog_patch_list_rpc_v2.sql`.
- Jalankan `drop function if exists public.catalog_list_products(...)` dan `drop function if exists public.catalog_list_sales()`.
- Perbarui `catalog_list_sales()`:
  - Saring hanya `show_in_catalog = true and is_active = true and phone is not null`.
  - Sertakan `photo_url`, `tagline`, `slug`, `open_time`, `close_time`.
  - Urutkan berdasarkan `display_order asc, name asc`.
- Perbarui `catalog_list_products(...)`:
  - Saring `p.is_active = true and p.is_published = true`.
  - Dukung pengurutan `p_sort = 'featured'`.
  - Sertakan array `images` dari tabel `product_images`.
  - Sertakan array `fabrics` dari `product_fabric_options` (jika ada) atau fallback slot kain kategori dengan `price_adjustment = 0`, beserta `weight_gsm` dan `catalog_description`.
- Berikan hak akses eksplisit ke `anon, authenticated`.

#### Langkah 6: Migration 54 — Sistem Ulasan Bertoken & Agregasi Rating
- Buat file migration: `supabase/migrations/20261012140000_catalog_review_system.sql`.
- Buat tabel `review_invitations`:
  - Kolom: `id`, `user_id`, `order_id`, `token_hash`, `expires_at`, `used_at`, `created_at`.
  - RLS: `auth.uid() = user_id`.
- Buat tabel `product_reviews`:
  - Kolom: `id`, `user_id`, `product_id`, `order_id`, `reviewer_name`, `rating`, `comment`, `status`, `owner_reply`, `moderated_at`, `created_at`.
  - Constraint: `unique (order_id, product_id)`.
  - RLS: `auth.uid() = user_id`.
- Buat RPC:
  - `create_review_invitation(p_order_id uuid)` (Authenticated only di dashboard).
  - `catalog_get_review_form(p_token text)` (Anon & authenticated).
  - `catalog_submit_review(p_token text, p_product_id uuid, p_rating int, p_reviewer_name text, p_comment text)` (Anon & authenticated).
  - `catalog_list_reviews(p_product_id uuid, p_page int, p_limit int)` (Anon & authenticated; hanya status approved, masking nama peninjau).
- Daftarkan tabel ke `supabase/clear.sql`.

#### Langkah 7: Migration 55 — Info Perusahaan Publik, Rekening DP, & Sold Count
- Buat file migration: `supabase/migrations/20261012150000_catalog_company_info_and_sold_count.sql`.
- Tambahkan kolom pada `company_settings`: `email`, `whatsapp`, `instagram`, `operating_hours`, `maps_url`.
- Tambahkan kolom pada `company_bank_accounts`: `show_in_catalog` (bool default false).
- Buat RPC `catalog_get_company_info()` (Anon & authenticated; whitelist data publik dan rekening yang ditandai).
- Perbarui `catalog_list_products(...)`: tambahkan kalkulasi agregat `sold_count` (dari order completed), `rating`, dan `review_count`.

#### Langkah 8: Migration 56 — Pelacakan Pesanan Aman (Dual Verification)
- Buat file migration: `supabase/migrations/20261012160000_catalog_tracking_and_inquiries.sql`.
- Tambahkan kolom pada tabel `orders`: `tracking_code` (varchar(16) null, unique), `customer_phone` (varchar(30) null).
- Buat trigger generator otomatis `tracking_code` pada insert order baru.
- Buat RPC `catalog_track_order(p_tracking_code text, p_phone_last4 text)`:
  - Verifikasi kesesuaian kode acak dan 4 digit terakhir nomor telepon.
  - Return seragam jika data tidak cocok.
  - Whitelist: status produksi bahasa Indonesia, status lunas/belum lunas, dan timeline `order_stage_events`.

#### Langkah 9: Migration 57 — Kotak Masuk Kontak & Logging Lead WhatsApp
- Buat file migration: `supabase/migrations/20261012170000_catalog_inquiries_and_leads.sql`.
- Buat tabel `inquiries` (RLS `auth.uid() = user_id`).
- Buat RPC `catalog_submit_inquiry(p_name, p_email, p_topic, p_message, p_honeypot)`.
- Buat tabel `catalog_leads` (RLS `auth.uid() = user_id`).
- Buat RPC `catalog_log_lead(p_sales_id, p_product_id, p_material_id, p_color_name, p_estimated_qty, p_source)`.
- Daftarkan `inquiries` dan `catalog_leads` ke `supabase/clear.sql`.

#### Langkah 10: Rencana & Eksekusi Smoke Test Database (`supabase/tests/catalog_smoke.sql`)
- Buat suite pengujian lengkap yang memvalidasi seluruh RPC dan batasan keamanan dari sudut pandang role `anon` dan `authenticated`.

---

## 6. Rencana Pengujian Database (`supabase/tests/catalog_smoke.sql`)

Daftar skenario uji (Test 1 s.d. Test 15) yang wajib lulus di database lokal:

1. **Test 1: Proteksi Akses Tabel Langsung oleh Role `anon`**
   Memastikan `anon` gagal (`42501`) saat menjalankan `select * from products`, `select * from product_images`, `select * from orders`, dll.
2. **Test 2: Eksekusi RPC Read Baseline (`catalog_list_categories`)**
   Memastikan kategori yang memiliki minimal satu produk aktif dan terbit berhasil dikembalikan ke `anon`.
3. **Test 3: Whitelist & Pemfilteran Produk (`catalog_list_products`)**
   Produk dengan `is_published = false` atau `is_active = false` terbukti tidak pernah muncul di respons `anon`.
4. **Test 4: Galeri Multi-Foto & Partial Unique Index**
   Percobaan membuat dua foto utama (`is_primary = true`) pada produk yang sama ditolak oleh database.
5. **Test 5: Opsi Kain, Penyesuaian Harga, & Fallback**
   Produk dengan `product_fabric_options` hanya menampilkan kain yang `is_offered = true` beserta `price_adjustment`. Produk tanpa opsi kustom melakukan fallback aman ke kain kategori slot pertama dengan `price_adjustment = 0`.
6. **Test 6: Metadata Sales, Filter Katalog, & Slug Unik**
   Sales dengan `show_in_catalog = false` tidak muncul di RPC. Slug duplikat ditolak oleh constraint unik.
7. **Test 7: Generator Undangan Ulasan & Hash Token**
   Dashboard (`authenticated`) berhasil membuat token undangan untuk order `completed`. Token yang tersimpan di database dalam bentuk hash SHA-256.
8. **Test 8: Validasi Form Ulasan Publik (`catalog_get_review_form`)**
   Token valid mengembalikan daftar produk dalam order. Token kadaluarsa, salah, atau sudah digunakan ditolak dengan pesan kesalahan aman.
9. **Test 9: Pengiriman Ulasan Publik (`catalog_submit_review`)**
   Ulasan tersimpan dengan status awal `pending`. Token langsung ditandai `used_at`. Review kedua pada produk dan order yang sama ditolak.
10. **Test 10: Tampilan Ulasan Publik (`catalog_list_reviews`)**
    Ulasan berstatus `pending` atau `rejected` tidak muncul. Hanya ulasan `approved` yang tampil dengan nama yang disamarkan ("Budi S.").
11. **Test 11: Metrik `sold_count` & Agregasi Rating Produk**
    Hanya kuantitas dari order dengan `production_status = 'completed'` yang dihitung dalam `sold_count`. Nilai rating rata-rata cocok dengan rata-rata ulasan yang disetujui.
12. **Test 12: Profil Perusahaan Publik & Whitelist Rekening**
    RPC `catalog_get_company_info` hanya menampilkan data publik dan rekening bank yang memiliki `show_in_catalog = true`. Data saldo awal atau stempel internal tidak bocor.
13. **Test 13: Pelacakan Pesanan Publik & Proteksi Brute-Force (`catalog_track_order`)**
    Kombinasi `tracking_code` benar dan 4 digit HP benar mengembalikan status produksi dan timeline tahapan. Kombinasi salah mengembalikan respons error seragam tanpa membocorkan data pesanan.
14. **Test 14: Form Kontak & Proteksi Honeypot (`catalog_submit_inquiry`)**
    Input bot dengan honeypot terisi tidak mencemari database. Pesan valid masuk dengan status `new`.
15. **Test 15: Pencatatan Lead WhatsApp (`catalog_log_lead`)**
    Pencatatan klik WhatsApp tersimpan di `catalog_leads` tanpa menyimpan data pribadi yang dilarang.

---

## 7. Checklist Kelengkapan Sebelum Menyatakan Selesai

- [ ] Seluruh file migration baru dibuat di `supabase/migrations/` dengan urutan nomor waktu yang benar.
- [ ] Semua tabel baru (`product_images`, `product_fabric_options`, `review_invitations`, `product_reviews`, `inquiries`, `catalog_leads`) didaftarkan ke `supabase/clear.sql`.
- [ ] Seluruh fungsi publik menggunakan klausa `security definer set search_path = public`.
- [ ] Hak akses `revoke all from public` dan `grant execute to anon, authenticated` terpasang di semua RPC publik.
- [ ] Dokumen `supabase/DATABASE.md` diperbarui mencatat nomor migration baru dan ringkasan isinya.
- [ ] Seluruh pengujian di `supabase/tests/catalog_smoke.sql` dieksekusi di database lokal dan **lulus 100%**.

---

## 8. Log Progres (Wajib Diisi Agen Setiap Selesai 1 Langkah)

| Tanggal | Langkah | Hasil | Menunggu Persetujuan Pemilik? |
|---|---|---|---|
| 2026-10-11 | Dokumen Perencanaan & Catatan Implementasi Dibuat | Dokumen `RANCANGAN_SIKON_CATALOG_BACKEND.md` dan `CATATAN_IMPLEMENTASI_CATALOG.md` selesai disusun. Fokus penuh pada lapisan database dan backend. | Ya, menunggu persetujuan rancangan dan izin eksekusi Langkah 0 & 1 dari pemilik |
