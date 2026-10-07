# 🗃️ Master Data — SIKon App

Halaman ini mencakup semua fitur **master data** yang menjadi fondasi sistem: Produk, Material, Staf, Sales, Perusahaan, dan Kategori Transaksi.

---

## 1. Produk (`/products`)

### 1.1 Apa itu Produk?
Produk adalah **template/resep** untuk satu jenis pakaian konveksi (misal: Kemeja Flannel, Jaket Bomber). Produk berisi:
- Informasi harga jual (dua tier: satuan vs prioritas)
- Biaya produksi per pcs (potong & jahit)
- **BOM** (Bill of Materials): daftar material aksesori yang dibutuhkan + slot kain

> **Penting:** Produk bukan stok barang jadi. Produk adalah *definisi* dari apa yang diproduksi.

### 1.2 Data yang Disimpan per Produk

| Kolom | Keterangan |
|-------|-----------|
| `name` | Nama produk (misal: "Kemeja Flannel Pria") |
| `category_id` | Kategori produk (dari `product_categories`) |
| `description` | Deskripsi opsional |
| `price_satuan` | Harga jual untuk order < 6 pcs (satuan). Jika kosong/0, fallback ke `price_prioritas` |
| `price_prioritas` | Harga jual standar untuk order ≥ 6 pcs (prioritas) |
| `default_price` | Harga default legacy (tetap disimpan, dipakai sebagai fallback terakhir) |
| `sewing_cost_per_pcs` | Tarif upah jahit borongan per pcs |
| `cutting_cost_per_pcs` | Tarif upah potong borongan per pcs |
| `consumables_allowance` | Taksiran flat biaya consumables (benang, jarum, minyak) per pcs — masuk HPP |
| `sales_bonus_per_pcs` | Bonus sales per pcs terjual (opsional) |
| `is_active` | Produk tidak aktif tidak bisa dipilih di order baru |

### 1.3 BOM — Dua Jenis Material dalam Produk

**a. Material Aksesori (Fixed BOM)**
- Material non-kain yang pasti dipakai (sleting, furing, label, rib, kancing, dll.)
- Disimpan di tabel `product_materials`
- Format: `material_id` + `quantity` (dalam base unit)
- Dipakai untuk kalkulasi HPP dan gate check serah bahan jahit

**b. Slot Kain (Fabric Slots)**
- Kain bisa bervariasi per order (pelanggan pilih warna sendiri)
- Disimpan di tabel `product_fabric_slots`
- Format: `fabric_category_id`, `label`, `usage_qty`, `unit`
- Saat order dibuat, admin pilih kain konkret + warna untuk setiap slot → tersimpan di `order_item_fabrics`

### 1.4 Kalkulasi HPP (Harga Pokok Produksi)

```
HPP per pcs = Kain + Aksesori langsung (BOM) + Consumables + Ongkos Potong + Ongkos Jahit + Bordir
```

- **Kain:** usage_qty × harga per meter/yard
- **Aksesori:** qty pakai (base unit) × (harga per kemasan ÷ isi kemasan)
- **Consumables:** taksiran flat dari `products.consumables_allowance`
- HPP di-**snapshot** ke `order_items.hpp_per_unit_snapshot` saat order dibuat — tidak berubah walau harga master diubah

### 1.5 Aturan Harga: Satuan vs Prioritas

- **Total qty order < 6 pcs** → kategori `satuan`, pakai `price_satuan`
- **Total qty order ≥ 6 pcs** → kategori `prioritas`, pakai `price_prioritas`
- Surcharge satuan untuk upah jahit: tarif jahit + `sewing_satuan_surcharge` (default Rp10.000, diatur di profil perusahaan)
- Admin bisa **override** kategori secara manual lewat `is_order_type_manual_override`

### 1.6 UI Halaman Produk

- Tab filter berdasarkan kategori produk
- Pencarian teks (nama, deskripsi, kategori)
- Tombol **Lihat Detail** → modal detail BOM lengkap
- Tombol **Edit** → modal form produk + BOM editor
- Tombol **Hapus** → soft-safe (produk yang sudah pernah dipakai di order tetap ada historinya)

### 1.7 Tabel Database Terkait

| Tabel | Isi |
|-------|-----|
| `products` | Data master produk |
| `product_categories` | Kategori produk (cth: Kemeja, Jaket, Celana) |
| `product_materials` | BOM aksesori per produk |
| `product_fabric_slots` | Definisi slot kain per produk |

---

## 2. Material (`/materials`)

### 2.1 Apa itu Material?
Material adalah **bahan baku** yang disimpan di gudang: kain, kancing, sleting, benang, jarum, furing, label, dll.

### 2.2 Data yang Disimpan per Material

| Kolom | Keterangan |
|-------|-----------|
| `name` | Nama material |
| `category_id` | Kategori material (dari `material_categories`, dengan flag `is_fabric`) |
| `brand` | Merek (opsional) |
| `unit` | **Base unit** — satuan stok terkecil (pcs, meter, yard, lembar, dll.) |
| `purchase_unit` | Satuan beli legacy (pack, roll, cone, lusin) |
| `conversion_rate` | Isi per satuan beli (1 pack = 100 pcs) |
| `purchase_units` | **JSON array** satuan beli lebih dari satu (fitur multi-UOM) |
| `price` | Harga per base unit (diupdate otomatis saat barang diterima) |
| `stock_qty` | Stok total di base unit (**perhatikan:** material berwarna, stok aktual ada di `material_colors.stock_qty`) |
| `minimum_stock` | Ambang stok minimum (untuk alert restock) |
| `is_floor_stock` | `true` untuk benang, jarum, kancing — tidak dialokasikan per order |
| `scrap_qty` | Akumulasi barang rusak/afkir |
| `composition` | Komposisi tekstil (hanya untuk `is_fabric = true`) |
| `care_instruction` | Instruksi perawatan kain |
| `is_active` | Material tidak aktif tidak bisa dipakai di order/restock baru |

### 2.3 Varian Warna (Material Colors)

Semua jenis material bisa punya varian warna — tidak hanya kain:
- Kancing warna biru, hitam, putih
- Sleting warna khusus
- Benang berbagai warna

Data di tabel `material_colors`:
- `color_name`, `color_code` (hex opsional)
- `stock_qty` — **ATURAN KRITIS:** untuk material berwarna, stok aktual ada di sini, bukan di `materials.stock_qty`
- `minimum_stock`, `is_active`

**Rumus stok efektif yang benar:**
```sql
COALESCE(
  (SELECT SUM(mc.stock_qty) FROM material_colors mc
    WHERE mc.material_id = m.id AND mc.is_active = true
    HAVING COUNT(mc.id) > 0),   -- kalau ADA varian aktif: jumlah semua varian
  m.stock_qty,                  -- kalau tidak ada varian: stok master
  0
)
```

### 2.4 Multi-UOM (Banyak Satuan Beli)

Material bisa punya beberapa satuan beli sekaligus:
```json
[
  { "id": "uuid-1", "name": "roll", "conversion_rate": 50, "is_primary": true, "is_variable": false, "is_active": true },
  { "id": "uuid-2", "name": "meter", "conversion_rate": 1, "is_primary": false, "is_variable": false, "is_active": true }
]
```

- **Satuan tetap:** `conversion_rate` diketahui saat beli (1 pack = 100 pcs)
- **Satuan variabel:** `conversion_rate = 0`, base quantity diisi saat barang diterima (misalnya roll kain dengan panjang tidak pasti)
- Snapshot konversi disimpan per baris pembelian

### 2.5 HPP: Harga Dua Arah

Di form material: jika `conversion_rate > 1`, user bisa isi **harga per kemasan** atau **harga per base unit**, sistem menghitung yang lain secara real-time.

### 2.6 UI Halaman Material

- Tab filter berdasarkan kategori material
- Pencarian teks (nama, merek, warna, komposisi)
- Form material + tambah varian warna langsung sebelum save pertama
- Kolom stok menampilkan total dari semua varian aktif

### 2.7 Tabel Database Terkait

| Tabel | Isi |
|-------|-----|
| `materials` | Data master material |
| `material_categories` | Kategori material (flag `is_fabric` membedakan kain vs aksesoris) |
| `material_colors` | Varian warna per material + stok per varian |

---

## 3. Staf (`/staff`)

### 3.1 Apa itu Staf?
Tabel `staff` adalah master semua karyawan internal. Role staf **bukan enum** — diisi teks bebas, tetapi beberapa logika sistem bergantung pada nilai teksnya.

### 3.2 Data yang Disimpan per Staf

| Kolom | Keterangan |
|-------|-----------|
| `name` | Nama lengkap |
| `phone` | Nomor HP (opsional, dipakai untuk kontak) |
| `role` | Role dalam operasional (teks bebas — **hati-hati ejaan**) |
| `wage_type` | Skema upah: `attendance`, `piecework`, atau `sales` |
| `daily_rate` | Upah harian (untuk `attendance` dan `sales`) |
| `sales_id` | FK ke tabel `sales` — **wajib** untuk staf berole `Sales` |
| `is_active` | Staf tidak aktif tidak ikut distribusi jahit atau pilihan payroll |
| `last_priority_assigned_at` | Timestamp terakhir dapat order prioritas (untuk rotasi adil) |
| `priority_orders_count` | Jumlah order prioritas yang sudah dikerjakan (untuk rotasi adil) |

### 3.3 Skema Upah

| `wage_type` | Cara hitung | Peran tipikal |
|-------------|-------------|---------------|
| `attendance` | Upah harian × hari hadir | Admin, staf tetap |
| `piecework` | Borongan per tugas dari `piecework_tasks` | Penjahit lepas, tukang potong |
| `sales` | Upah harian + bonus per order | Sales |

### 3.4 Role yang Punya Logika Khusus

| Role | Efek |
|------|------|
| `Gudang` | Satu-satunya yang bisa jadi pemohon restock (`requested_by`) — dijaga trigger |
| `Penjahit` / mengandung "jahit"/"sewing" | Ikut distribusi kerja jahit (hanya yang `piecework` + `is_active`) |
| `Tukang Potong` | Penerima tugas potong |
| `Sales` | Wajib punya `sales_id` (constraint di DB) |

### 3.5 Filter di UI

Filter tab: Semua, Purchasing, Gudang, Penjahit, Tukang Potong, Sales, Produksi, Driver, Umum
Pencarian: nama atau nomor HP

---

## 4. Sales (`/sales`)

### 4.1 Apa itu Sales?
`Sales` adalah data **identitas salesperson** yang terhubung ke order. Ini **beda dengan staf** — seorang staf sales harus terhubung ke baris `sales` sebagai sumber kebenaran identitas penjualan.

### 4.2 Data yang Disimpan

| Kolom | Keterangan |
|-------|-----------|
| `name` | Nama salesperson |
| `phone` | Nomor HP |
| `is_active` | Aktif/nonaktif — hanya sales aktif yang bisa dipilih di order baru |

### 4.3 View Database

- `sales_performance`: agregat per sales (jumlah order, revenue, dibayar, piutang)

### 4.4 Di Dashboard

Kartu **Performa Sales** menampilkan:
- Total order per sales
- Total revenue
- Revenue terbayar vs piutang
- Grafik qty terjual per sales

---

## 5. Informasi Perusahaan (`/perusahaan`)

### 5.1 Data Profil

Disimpan di tabel `company_settings` (satu baris per akun user):

| Kolom | Keterangan |
|-------|-----------|
| `company_name` | Nama perusahaan |
| `address` | Alamat |
| `phone` | Nomor telepon |
| `logo_url` | URL logo di Supabase Storage (`company-assets` bucket) |
| `stamp_url` | URL stempel perusahaan |
| `signature_url` | URL tanda tangan pimpinan |
| `saldo_awal` | Saldo awal kas (dipakai untuk hitung saldo berjalan di keuangan). **Catatan:** nama kolom aslinya `saldo_awal`, bukan `initial_balance` — dicek langsung ke migration (`20260101000002`) dan ke `useCompanySettings.ts`, keduanya konsisten memakai `saldo_awal` |
| `sewing_satuan_surcharge` | Surcharge upah jahit untuk order satuan (default Rp10.000/pcs) |

### 5.2 Upload Dokumen

Bucket storage: `company-assets` (public read)
- Upload logo, stempel, tanda tangan
- Dipakai untuk cetak dokumen (SPJ, dll.)

### 5.3 Rekening Bank

Tabel `company_bank_accounts` — bisa lebih dari satu rekening:
- `bank_name`, `account_number`, `account_holder_name`
- `is_primary` — rekening utama yang ditampilkan di dokumen

### 5.4 Keamanan Akun

- Ganti email login melalui RPC `update_owner_email(p_new_email)` — tanpa konfirmasi email (sengaja, karena internal tool)

---

## 6. Kategori Transaksi (`/kategori`)

### 6.1 Apa itu Kategori Transaksi?
Kategori dipakai untuk mengelompokkan transaksi keuangan di halaman `/financial`:
- **Income**: Pembayaran Order, Pendapatan Lain-lain
- **Expense**: Pembelian Bahan, Gaji Karyawan, Uang Muka Purchasing, dll.

### 6.2 Data

Tabel `transaction_categories`:
- `name` — nama kategori
- `type` — `income` atau `expense`

> **Catatan sejarah:** Tabel ini dulu bernama `categories`. Sudah di-rename ke `transaction_categories` sejak migration `20260923000001`. Jangan pakai nama lama.

### 6.3 Kategori Otomatis

Beberapa kategori dibuat otomatis oleh sistem saat dibutuhkan:
- `pay_weekly_payroll` membuat/mencari kategori "Gaji Karyawan" (expense)
- `record_order_payment` membuat/mencari kategori "Pembayaran Order" (income)
- SPJ/Supplier membuat transaksi expense per kategori barang

---

## 7. Kategori Produk

Dikelola di halaman `/products` (sebagai tab filter) dan disimpan di `product_categories`. Ini **beda** dengan kategori transaksi.

Contoh kategori produk: Kemeja, Jaket, Celana, Kaos, Dress, dll.

---

## 8. Kategori Material

Dikelola di halaman `/materials` (sebagai tab filter) dan disimpan di `material_categories`.

| Kolom | Keterangan |
|-------|-----------|
| `name` | Nama kategori (Kain, Sleting, Kancing, Benang, dll.) |
| `is_fabric` | `true` = kain (menampilkan field komposisi & perawatan) |

---

## 9. Katalog Publik (`sikon-catalog`)

*Migration: `20261006120000_catalog_public_read_rpc.sql`. Status: Ada di migration, diuji lewat transaksi rollback sebagai role `anon` di `sikon-app-dev`; **belum diterapkan ke DB live** saat dokumen ini ditulis. Pemakaian dari `sikon-catalog` ada di repo itu, bukan di `src/` dashboard.*

**Tujuan** — situs katalog publik (tanpa login) membaca produk, kategori, kain + warna, dan sales dari database yang sama dengan dashboard.

**Kenapa RPC, bukan buka tabel** — semua tabel ber-RLS `auth.uid() = user_id` dan `anon` tidak punya `GRANT`. Membuka tabel ke `anon` berarti membuka HPP, tarif upah, dan stok. Tiga RPC `security definer` read-only mengembalikan whitelist kolom saja.

| RPC | Mengembalikan | Aturan |
|---|---|---|
| `catalog_list_categories()` | `id`, `name` | Hanya kategori yang punya minimal 1 produk `is_active` |
| `catalog_list_sales()` | `id`, `name`, `phone` | Hanya `is_active` dan `phone` terisi |
| `catalog_list_products(p_search, p_category_id, p_sort, p_page, p_limit, p_short_id)` | `{data, meta}` produk + kain + warna | Hanya produk `is_active`; `p_limit` maks 50; `p_sort` = `price:asc` / `price:desc` / lainnya terbaru |

**Aturan keras**
- Yang **tidak boleh** muncul di respons: `sewing_cost_per_pcs`, `cutting_cost_per_pcs`, `consumables_allowance`, `sales_bonus_per_pcs`, `materials.price`, semua `stock_qty`/`minimum_stock`, BOM aksesori, order, keuangan, staf. Menambah kolom ke respons = keputusan publikasi data, bukan sekadar menambah field.
- `base_price` = `price_prioritas` → `price_satuan` → `default_price`. `price_satuan` dan `price_prioritas` ikut dikirim apa adanya.
- Kain produk = semua material `is_active` di kategori kain milik **slot kain pertama** (`product_fabric_slots`, urut `created_at`), lengkap dengan warna `is_active`. Produk dengan beberapa slot kain baru menampilkan slot pertama.
- Slug dihitung di SQL: `<nama-produk>-<8 karakter pertama UUID>`. Halaman detail mencari lewat 8 karakter terakhir itu (`p_short_id`), jadi mengganti nama produk tidak mematikan link lama.

**Data** — tidak ada tabel baru, jadi `clear.sql`/`seed.sql` tidak berubah. Foto produk, rating, ulasan, jumlah terjual, dan GSM belum ada di skema; katalog memakai gambar default dan menyembunyikan rating/terjual.

**Jebakan**
- Ini pengecualian sadar dari pola "RPC frontend: `revoke ... from anon`" di `ARSITEKTUR_TEKNIS.md` §2.3.
- Mengubah signature `catalog_list_products` → `drop function` versi lama dulu (`PGRST203`).
- Satu akun owner (single-tenant): fungsi tidak memfilter `user_id`. Kalau suatu saat multi-tenant, wajib ditambah filter.

**Belum diputuskan (tanya pemilik)** — apakah harga kartu produk memakai harga prioritas atau satuan; apakah selisih harga antar kain perlu masuk harga jual; apakah stok warna 0 berarti "tidak tersedia" di katalog.
