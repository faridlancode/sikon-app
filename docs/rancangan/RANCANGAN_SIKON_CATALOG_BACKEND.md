# Rancangan: Backend & Database Katalog Publik (sikon-catalog)

- Tanggal: 2026-10-11
- Status: Menunggu persetujuan
- Domain pemilik: **MASTER_DATA** & **CATALOG_PUBLIC** (dengan integrasi ke **ORDER_DAN_KEUANGAN**)
- Lokasi file: `docs/rancangan/RANCANGAN_SIKON_CATALOG_BACKEND.md`
- Dokumen pendamping: `docs/rancangan/CATATAN_IMPLEMENTASI_CATALOG.md` (panduan serah-terima pengerjaan agen)
- Sumber acuan: `docs/rancangan/Roadmap Integrasi sikon-catalog dan sikon-app-dashboard.md`, `supabase/DATABASE.md`, `docs/AGENT_INSTRUCTIONS.md`, `AGENTS.md`

---

## 1. Masalah & Konteks Arsitektur

Aplikasi web publik `sikon-catalog` dirancang sebagai katalog digital etalase produk konveksi yang dapat diakses oleh calon pembeli secara terbuka **tanpa autentikasi/login** (menggunakan role `anon` Supabase). Di sisi lain, `sikon-app-dashboard` adalah aplikasi internal operasional yang menjadi sumber kebenaran data (*single source of truth*). Keduanya berbagi project Supabase yang sama (`sikon-app-dev` / `xdojtfhkflbfuwmcjpwe`).

### Keterbatasan & Tantangan Keamanan di Database Saat Ini

1. **Kebijakan RLS Ketat Tanpa Hak Akses Anon**: Seluruh tabel di SIKon menerapkan Row Level Security (RLS) `auth.uid() = user_id`. Pengguna anonim (`anon`) tidak memiliki izin `GRANT SELECT/INSERT/UPDATE/DELETE` ke tabel manapun.
2. **Kebutuhan Proteksi Data Sensitif (Zero Leakage)**: Data operasional di tabel master dan transaksi memuat informasi bisnis rahasia: HPP produk, upah jahit dan potong, bonus komisi sales, harga beli material di supplier, stok fisik riil, riwayat order orang lain, data keuangan, serta rekening pribadi. Data ini **tidak boleh bocor sedikit pun** ke publik.
3. **Ketiadaan Backend Server Khusus (Custom Serverless / Express)**: Karena aplikasi tidak memiliki middleware backend server terpisah, seluruh aturan validasi, penegakan integritas data, sanitasi, dan mitigasi brute-force/enumerasi harus dieksekusi secara atomik di lapisan database PostgreSQL.
4. **Pemisahan Konten Publik vs Internal yang Belum Lengkap**:
   - Produk belum memiliki status publikasi (`is_published`), kurasi unggulan (`is_featured`), atau dukungan multi-foto (`product_images`).
   - Kain belum mendukung penyesuaian harga per produk (`price_adjustment`), gramasi (`weight_gsm`), atau deskripsi bahasa katalog (`catalog_description`).
   - Sales belum memiliki penanda tampil publik (`show_in_catalog`), slug URL ramah publik, foto avatar, atau jam operasional.
   - Belum ada mekanisme pengumpulan ulasan yang aman dari spam/palsu (memerlukan token verifikasi pesanan selesai).
   - Fitur pelacakan pesanan publik (`track-order`) rentan terhadap tebakan ID jika hanya memakai nomor urut (`ORD-XXXX`).

---

## 2. Prinsip Desain & Aturan Keamanan Database

Sesuai aturan arsitektur sistem (`AGENTS.md` & `AGENT_INSTRUCTIONS.md`), ditetapkan aturan keras berikut:

### 2.1 Enam Prinsip Keamanan Keras

1. **Zero Table Access to `anon`**: Dilarang keras memberikan hak akses `GRANT` ke tabel manapun kepada role `anon` maupun `public`. Seluruh akses katalog publik wajib melewati fungsi PostgreSQL bertanda `SECURITY DEFINER` dengan skema `SET search_path = public`.
2. **Whitelist Kolom Eksplisit**: Dilarang menggunakan `SELECT *` dalam RPC publik. Setiap respons JSONB/Table wajib menyebutkan kolom-kolom yang secara eksplisit diizinkan untuk dikonsumsi publik.
3. **Pemisahan Keputusan Publikasi**: Menambahkan kolom ke RPC publik adalah keputusan rilis data. Kolom biaya (HPP, upah borongan, bonus), margin keuntungan, harga beli supplier, volume stok gudang riil, dan catatan internal staf tidak boleh dimasukkan ke respons.
4. **Validasi & Tokenisasi pada Operasi Tulis (Write)**: Role `anon` tidak boleh melakukan `INSERT` langsung ke tabel mana pun. Operasi tulis publik hanya diizinkan lewat RPC khusus:
   - *Ulasan*: Hanya lewat token acak 128-bit sekali pakai yang dibuat saat pesanan selesai.
   - *Inquiry Kontak*: Validasi ketat panjang karakter, format email, dan field honeypot anti-bot.
   - *Lead WhatsApp*: Hanya mencatat konteks klik (produk/kain/sales) tanpa mengumpulkan data pribadi invasif.
5. **Anti-Enumeration pada Pelacakan Pesanan**: Pelacakan pesanan publik dilarang hanya mengandalkan nomor urut pesanan. Pelacakan wajib memverifikasi kombinasi `tracking_code` acak (8 karakter alfanumerik) dan verifikasi verifikator sekunder (4 digit terakhir nomor telepon pemesan). Respons kesalahan dibuat seragam ("Pesanan tidak ditemukan atau data verifikasi tidak cocok") untuk mencegah enumerasi nomor HP maupun nomor order.
6. **Pencegahan Postgres Overloading (`PGRST203`)**: Bila mengubah signature RPC yang sudah ada, wajib menjalankan `DROP FUNCTION` versi lama terlebih dahulu sebelum membuat signature baru.

---

## 3. Peta Fase Implementasi Backend

Implementasi backend katalog dibagi menjadi 4 fase berurutan:

```
[Fase 0: Persiapan RPC Baseline & Konfigurasi]
       │
       ▼
[Fase 1: Konten Katalog Inti (Foto, Produk, Opsi Kain, Metadata Sales)]
       │
       ▼
[Fase 2: Social Proof & Profil Perusahaan (Review Bertoken, Sold Count, Profil)]
       │
       ▼
[Fase 3: Pelacakan Pesanan & Interaksi Publik (Track Order, Kotak Masuk, Leads)]
```

---

## 4. Rincian Teknis per Fase

### 4.1 Fase 0 — Persiapan RPC Baseline & Konfigurasi

#### A. Penerapan & Verifikasi Migration Baseline
- Migration baseline yang sudah disiapkan: `20261006120000_catalog_public_read_rpc.sql`.
- Menyediakan 3 fungsi RPC awal:
  1. `catalog_list_categories()`: Daftar kategori produk aktif.
  2. `catalog_list_sales()`: Daftar sales aktif yang memiliki nomor kontak WhatsApp.
  3. `catalog_list_products(p_search, p_category_id, p_sort, p_page, p_limit, p_short_id)`: Daftar produk beserta kategori, harga tier, slot kain pertama, dan varian warna.
- Hak akses: Dicabut dari `public`, diberikan secara selektif kepada `anon, authenticated`.

#### B. Audit Storage Bucket `company-assets`
- Bucket Supabase Storage `company-assets` sudah berstatus publik.
- Kebijakan RLS Storage wajib dipastikan:
  - `anon`: Izin `SELECT` (baca publik) pada objek di path `/products/*`, `/sales/*`, dan `/company/*`.
  - `authenticated`: Izin `INSERT`, `UPDATE`, `DELETE` untuk mengelola aset.
- Konvensi path penyimpanan:
  - Foto produk: `products/{product_id}/{image_uuid}.webp`
  - Avatar sales: `sales/{sales_id}/{image_uuid}.webp`
  - Aset perusahaan: `company/{asset_name}.webp`

---

### 4.2 Fase 1 — Konten Katalog Inti

Fase ini melengkapi kapabilitas penyajian produk komprehensif, multi-foto, variasi kain dengan penyesuaian harga, serta metadata profil sales.

#### A. Foto Produk (`product_images`)
Mendukung galeri multi-foto per produk dengan perlindungan integritas foto utama:

```sql
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Aturan ketat: Hanya boleh ada maksimal 1 foto utama (is_primary = true) per produk
create unique index if not exists uq_product_images_primary_per_product
  on public.product_images(product_id)
  where is_primary = true;

create index if not exists idx_product_images_product_sort
  on public.product_images(product_id, sort_order, created_at);

alter table public.product_images enable row level security;

create policy "product_images_owner_manage"
  on public.product_images for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

#### B. Publikasi & Urutan Produk (`products`)
Menambahkan kontrol kurasi produk pada tabel `public.products`:

```sql
alter table public.products
  add column if not exists is_published boolean not null default false,
  add column if not exists is_featured boolean not null default false,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

-- Trigger update otomatis kolom updated_at pada tabel products
create or replace function public.trg_touch_products_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.trg_touch_products_updated_at();

-- Backfill data eksisting agar produk aktif yang sudah ada langsung tayang di dev
update public.products
   set is_published = true
 where is_active = true and is_published = false;
```

#### C. Opsi Kain, Penyesuaian Harga, dan GSM Material
Keputusan desain bisnis: Satu produk dapat ditawarkan dengan berbagai pilihan kain yang memiliki penyesuaian harga berbeda (`price_adjustment`).

1. **Atribut Publik Material (`materials`)**:
   ```sql
   alter table public.materials
     add column if not exists weight_gsm integer null,
     add column if not exists catalog_description text null;
   ```

2. **Tabel Opsi Kain Produk (`product_fabric_options`)**:
   ```sql
   create table if not exists public.product_fabric_options (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references auth.users(id) on delete cascade,
     product_id uuid not null references public.products(id) on delete cascade,
     material_id uuid not null references public.materials(id) on delete cascade,
     price_adjustment numeric(12,2) not null default 0,
     is_offered boolean not null default true,
     is_default boolean not null default false,
     sort_order integer not null default 0,
     created_at timestamptz not null default now(),
     constraint uq_product_fabric_option unique (product_id, material_id)
   );

   -- Hanya satu kain default per produk
   create unique index if not exists uq_product_fabric_default
     on public.product_fabric_options(product_id)
     where is_default = true;

   alter table public.product_fabric_options enable row level security;

   create policy "product_fabric_options_owner_manage"
     on public.product_fabric_options for all
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);
   ```

3. **Logika Fallback Opsi Kain**:
   - Jika suatu produk memiliki baris di `product_fabric_options`: kembalikan hanya kain yang `is_offered = true` beserta `price_adjustment`.
   - Jika suatu produk belum memiliki baris di `product_fabric_options`: kembalikan kain dari kategori kain di slot pertama produk (`product_fabric_slots`) dengan `price_adjustment = 0` (kompatibilitas mundur dengan baseline).

#### D. Pengayaan Metadata Sales (`sales`)
Mendukung landing page `/cs` dan tautan WhatsApp representatif `/link/:repSlug`:

```sql
alter table public.sales
  add column if not exists photo_url text null,
  add column if not exists tagline text null,
  add column if not exists display_order integer not null default 0,
  add column if not exists show_in_catalog boolean not null default true,
  add column if not exists slug varchar(50) null,
  add column if not exists open_time time null,
  add column if not exists close_time time null;

-- Unik untuk slug sales (hanya untuk karakter valid)
create unique index if not exists uq_sales_slug
  on public.sales(lower(trim(slug)))
  where slug is not null and trim(slug) <> '';
```

#### E. Pembaruan RPC `catalog_list_products` (Fase 1)
- Hanya menampilkan produk yang `p.is_active = true and p.is_published = true`.
- Mendukung pengurutan `p_sort = 'featured'` (`is_featured desc, sort_order asc, created_at desc`).
- Mengembalikan daftar foto dari `product_images` (tersortir, foto utama pertama).
- Mengembalikan array `fabrics` dengan `price_adjustment`, `is_default`, `weight_gsm`, `catalog_description`, dan variasi warna.

#### F. Pembaruan RPC `catalog_list_sales` (Fase 1)
- Hanya menampilkan sales dengan `is_active = true and show_in_catalog = true and nullif(trim(phone), '') is not null`.
- Menambahkan kolom `photo_url`, `tagline`, `slug`, `open_time`, `close_time`, dan diurutkan berdasarkan `display_order asc, name asc`.

---

### 4.3 Fase 2 — Social Proof & Identitas Perusahaan

Fase ini menambahkan sistem ulasan terverifikasi (hanya pembeli dengan order selesai yang dapat memberi ulasan), angka `sold_count`, dan profil publik perusahaan.

#### A. Sistem Ulasan Bertoken

1. **Tabel Undangan Ulasan (`review_invitations`)**:
   Menyimpan token verifikasi kriptografis (disimpan dalam bentuk hash SHA-256):
   ```sql
   create table if not exists public.review_invitations (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references auth.users(id) on delete cascade,
     order_id uuid not null references public.orders(id) on delete cascade,
     token_hash text not null unique,
     expires_at timestamptz not null,
     used_at timestamptz null,
     created_at timestamptz not null default now()
   );

   create index if not exists idx_review_invitations_token
     on public.review_invitations(token_hash);

   alter table public.review_invitations enable row level security;

   create policy "review_invitations_owner_manage"
     on public.review_invitations for all
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);
   ```

2. **Tabel Ulasan Produk (`product_reviews`)**:
   ```sql
   create table if not exists public.product_reviews (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references auth.users(id) on delete cascade,
     product_id uuid not null references public.products(id) on delete cascade,
     order_id uuid not null references public.orders(id) on delete cascade,
     reviewer_name varchar(100) not null,
     rating smallint not null check (rating between 1 and 5),
     comment text null,
     status varchar(20) not null default 'pending'
       check (status in ('pending', 'approved', 'rejected')),
     owner_reply text null,
     moderated_at timestamptz null,
     created_at timestamptz not null default now(),
     constraint uq_product_reviews_order_product unique (order_id, product_id)
   );

   create index if not exists idx_product_reviews_product_status
     on public.product_reviews(product_id, status)
     where status = 'approved';

   alter table public.product_reviews enable row level security;

   create policy "product_reviews_owner_manage"
     on public.product_reviews for all
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);
   ```

3. **RPC Ulasan Publik**:
   - `catalog_get_review_form(p_token text)`:
     - Menerima raw token, menghitung `sha256(p_token)`.
     - Memvalidasi keberadaan token, belum kadaluarsa (`now() < expires_at`), dan belum digunakan (`used_at is null`).
     - Mengembalikan daftar item produk di dalam pesanan tersebut: `product_id`, `product_name`, dan status apakah produk sudah diulas.
     - **Keamanan**: Tidak mengembalikan nomor order, nama pelanggan, harga order, maupun data sensitif lainnya.
   - `catalog_submit_review(p_token text, p_product_id uuid, p_rating int, p_reviewer_name text, p_comment text)`:
     - Memvalidasi token via hash.
     - Memverifikasi bahwa `p_product_id` benar-benar ada di pesanan terkait (`order_items`).
     - Menyimpan ulasan ke `product_reviews` dengan status default `pending`.
     - Menandai `used_at = now()` pada `review_invitations`.
   - `catalog_list_reviews(p_product_id uuid, p_page int, p_limit int)`:
     - Mengembalikan ulasan berstatus `approved` dengan pagination.
     - Melakukan masking nama peninjau (contoh: "Budi Santoso" menjadi "Budi S.").
     - Menyertakan rating, komentar yang sudah disanitasi, tanggal ulasan, dan `owner_reply`.

#### B. Perhitungan Metrik `sold_count` & Agregasi Rating
- **Definisi `sold_count`**: Total akumulasi kuantitas produk (`order_items.qty`) yang diproduksi pada pesanan dengan status produksi selesai (`orders.production_status = 'completed'`).
- Item custom tanpa `product_id` diabaikan.
- Perhitungan dilakukan secara agregat di dalam RPC `catalog_list_products`:
  ```sql
  coalesce((
    select sum(oi.qty)::integer
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id = p.id
      and o.production_status = 'completed'
  ), 0) as sold_count
  ```
- Agregasi ulasan:
  ```sql
  coalesce((
    select round(avg(pr.rating)::numeric, 1)
    from public.product_reviews pr
    where pr.product_id = p.id and pr.status = 'approved'
  ), 0.0) as rating,
  coalesce((
    select count(*)::integer
    from public.product_reviews pr
    where pr.product_id = p.id and pr.status = 'approved'
  ), 0) as review_count
  ```

#### C. Informasi Perusahaan Publik
1. **Pengayaan Kolom `company_settings`**:
   ```sql
   alter table public.company_settings
     add column if not exists email varchar(150) null,
     add column if not exists whatsapp varchar(30) null,
     add column if not exists instagram varchar(100) null,
     add column if not exists operating_hours text null,
     add column if not exists maps_url text null;
   ```

2. **Penanda Rekening Bank Publik `company_bank_accounts`**:
   ```sql
   alter table public.company_bank_accounts
     add column if not exists show_in_catalog boolean not null default false;
   ```

3. **RPC `catalog_get_company_info()`**:
   Mengembalikan profil perusahaan publik: nama perusahaan, alamat, kontak WhatsApp, email, Instagram, jam operasional, tautan Google Maps, logo, serta daftar rekening bank yang ditandai `show_in_catalog = true` untuk keperluan petunjuk pembayaran DP.

---

### 4.4 Fase 3 — Pelacakan Pesanan & Interaksi Publik

Fase ini menyediakan pelacakan status produksi pesanan tanpa risiko kebocoran data, form inquiry kontak dengan proteksi spam, dan logging prospek lead WhatsApp.

#### A. Pelacakan Pesanan Aman (`catalog_track_order`)
1. **Pengayaan Kolom `orders`**:
   ```sql
   alter table public.orders
     add column if not exists tracking_code varchar(16) null,
     add column if not exists customer_phone varchar(30) null;

   create unique index if not exists uq_orders_tracking_code
     on public.orders(lower(tracking_code))
     where tracking_code is not null;
   ```

2. **Trigger Pembuatan Otomatis `tracking_code`**:
   Setiap order baru dibuat otomatis mendapatkan kode acak 8 karakter alfanumerik bebas karakter ambigu (misal tanpa huruf `O`/angka `0`, huruf `I`/angka `1`).

3. **Mekanisme RPC `catalog_track_order(p_tracking_code text, p_phone_last4 text)`**:
   - Menerima `p_tracking_code` dan `p_phone_last4` (4 digit terakhir nomor HP pelanggan).
   - Memvalidasi: `lower(o.tracking_code) = lower(p_tracking_code)` AND `right(regexp_replace(o.customer_phone, '\D', '', 'g'), 4) = p_phone_last4`.
   - **Pencegahan Enumerasi**: Jika salah satu parameter tidak cocok, respons JSON seragam:
     `{"found": false, "message": "Pesanan tidak ditemukan atau data verifikasi tidak cocok"}`.
   - **Whitelist Respons**: Hanya mengembalikan:
     - `tracking_code`
     - `production_status` (label bahasa Indonesia: `Penawaran`, `Menunggu Antrean`, `Sedang Diproduksi`, `Siap Diambil/Dikirim`, `Selesai`)
     - `is_fully_paid` (boolean status pelunasan)
     - `stages`: Timeline riwayat tahapan dari `order_stage_events` (`stage_name`, `status`, `completed_at`)
   - **DILARANG DIKEMBALIKAN**: Nama pelanggan, nomor pesanan internal (`ORD-XXXX`), rincian nominal rupiah, item desain rahasia, alamat pengiriman.

#### B. Form Pesan Kontak Publik (`inquiries`)
1. **Tabel `inquiries`**:
   ```sql
   create table if not exists public.inquiries (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references auth.users(id) on delete cascade,
     name varchar(100) not null,
     email varchar(150) not null,
     topic varchar(100) null,
     message text not null,
     status varchar(20) not null default 'new'
       check (status in ('new', 'read', 'done')),
     created_at timestamptz not null default now()
   );

   alter table public.inquiries enable row level security;

   create policy "inquiries_owner_manage"
     on public.inquiries for all
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);
   ```

2. **RPC `catalog_submit_inquiry(p_name, p_email, p_topic, p_message, p_honeypot)`**:
   - Jika `p_honeypot` terisi (diisi oleh bot), return sukses palsu tanpa menyimpan ke database.
   - Validasi format email, batas panjang pesan (maksimal 2000 karakter).
   - Sanitasi string untuk mencegah payload berbahaya.

#### C. Pencatatan Lead WhatsApp (`catalog_leads`)
1. **Tabel `catalog_leads`**:
   ```sql
   create table if not exists public.catalog_leads (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references auth.users(id) on delete cascade,
     sales_id uuid null references public.sales(id) on delete set null,
     product_id uuid null references public.products(id) on delete set null,
     material_id uuid null references public.materials(id) on delete set null,
     color_name varchar(50) null,
     estimated_qty integer null,
     source varchar(50) not null default 'whatsapp_button',
     created_at timestamptz not null default now()
   );

   alter table public.catalog_leads enable row level security;

   create policy "catalog_leads_owner_manage"
     on public.catalog_leads for all
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);
   ```

2. **RPC `catalog_log_lead(...)`**:
   Mencatat klik calon pembeli yang diarahkan ke WhatsApp sales tertentu untuk evaluasi konversi produk dan efektivitas representatif.

---

## 5. Inventaris Lengkap RPC Publik (Security Definer)

Berikut adalah ringkasan seluruh fungsi RPC yang akan diekspos ke katalog publik:

| Nama RPC | Fase | Tipe Operasi | Parameter | Akses Role | Keterangan & Batasan |
|---|---|---|---|---|---|
| `catalog_list_categories()` | 0 | Read | - | `anon, authenticated` | Hanya kategori dengan $\ge 1$ produk aktif dan terbit |
| `catalog_list_sales()` | 0 & 1 | Read | - | `anon, authenticated` | Sales aktif, punya HP, `show_in_catalog = true` |
| `catalog_list_products(...)` | 0, 1, 2 | Read | `p_search`, `p_category_id`, `p_sort`, `p_page`, `p_limit`, `p_short_id` | `anon, authenticated` | Whitelist kolom produk, multi-foto, opsi kain, rating, review_count, sold_count |
| `catalog_get_company_info()` | 2 | Read | - | `anon, authenticated` | Info perusahaan publik & rekening DP terpilih |
| `catalog_get_review_form(p_token)` | 2 | Read | `p_token text` | `anon, authenticated` | Validasi token via SHA-256; daftar produk order |
| `catalog_submit_review(...)` | 2 | Write | `p_token`, `p_product_id`, `p_rating`, `p_reviewer_name`, `p_comment` | `anon, authenticated` | Token sekali pakai, status ulasan `pending` |
| `catalog_list_reviews(...)` | 2 | Read | `p_product_id`, `p_page`, `p_limit` | `anon, authenticated` | Hanya ulasan `approved`, nama reviewer dimasking |
| `catalog_track_order(...)` | 3 | Read | `p_tracking_code text`, `p_phone_last4 text` | `anon, authenticated` | Dual-key check; status produksi & timeline saja |
| `catalog_submit_inquiry(...)` | 3 | Write | `p_name`, `p_email`, `p_topic`, `p_message`, `p_honeypot` | `anon, authenticated` | Proteksi bot honeypot, sanitasi teks |
| `catalog_log_lead(...)` | 3 | Write | `p_sales_id`, `p_product_id`, `p_material_id`, `p_color_name`, `p_estimated_qty`, `p_source` | `anon, authenticated` | Logging klik WhatsApp tanpa data PII |

---

## 6. Rencana Pembagian Migration File

Setiap tahapan dipisahkan menjadi migration spesifik dan independen untuk menjamin kemudahan rollback dan audit:

1. `20261012100000_catalog_storage_policies.sql`: Kebijakan RLS Supabase Storage untuk bucket `company-assets`.
2. `20261012110000_catalog_product_images_and_publication.sql`: Tabel `product_images`, kolom publikasi `products` (`is_published`, `is_featured`, `sort_order`, `updated_at`).
3. `20261012120000_catalog_fabric_options_and_gsm.sql`: Tabel `product_fabric_options`, kolom `materials.weight_gsm` dan `catalog_description`.
4. `20261012130000_catalog_sales_metadata_and_slug.sql`: Kolom `sales` (`photo_url`, `tagline`, `display_order`, `show_in_catalog`, `slug`, `open_time`, `close_time`).
5. `20261012140000_catalog_patch_list_rpc_v2.sql`: Pembaruan RPC `catalog_list_products` dan `catalog_list_sales` mengintegrasikan foto, kain, GSM, dan sales slug.
6. `20261012150000_catalog_review_system.sql`: Tabel `review_invitations`, `product_reviews`, RPC review bertoken, helper RPC pembuatan token dari dashboard.
7. `20261012160000_catalog_company_info_and_sold_count.sql`: Kolom `company_settings`, `company_bank_accounts.show_in_catalog`, RPC `catalog_get_company_info`, penyertaan `sold_count` dan rating di `catalog_list_products`.
8. `20261012170000_catalog_tracking_and_inquiries.sql`: Kolom `orders.tracking_code` & `customer_phone`, trigger tracking code, tabel `inquiries`, `catalog_leads`, RPC `catalog_track_order`, `catalog_submit_inquiry`, `catalog_log_lead`.

---

## 7. Rencana Pengujian Backend (Smoke Test)

Pengujian dilakukan lewat file uji khusus `supabase/tests/catalog_smoke.sql` di database lokal (Docker/local Supabase):
- Uji isolasi hak akses: Role `anon` dipastikan ditolak (`42501`) saat mencoba `SELECT/INSERT/UPDATE/DELETE` langsung ke semua tabel.
- Uji eksekusi RPC publik: Role `anon` berhasil memanggil RPC `catalog_*`.
- Uji partial unique index: Menolak lebih dari satu foto utama (`is_primary`) dan lebih dari satu kain default (`is_default`).
- Uji integritas token ulasan: Token acak hanya bisa dipakai sekali; ulasan baru otomatis berstatus `pending` dan tidak tampil di `catalog_list_reviews` sebelum di-approve.
- Uji anti-enumerasi tracking: Kode tracking salah atau 4 digit HP salah menghasilkan respons identik yang tidak membocorkan keberadaan order.
- Uji honeypot inquiry: Pengisian input bot honeypot tidak mencemari database.
