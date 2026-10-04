# Desain Solusi: Material Multi-UOM, Alur Gudang (Floor Stock), Konsep HPP, dan Penyatuan Milestone Order

Dokumen ini merangkum rancangan teknis dan operasional untuk 4 area yang saling berkorelasi:
1. **Material**: Varian (Merk, Warna) & Konversi Satuan Kemasan (Multi-UOM: Pack/Roll/Cone ke Pcs/Meter/Yard).
2. **Gudang**: Input Harga Pasar pada Pengajuan & Pemisahan Alur Pengeluaran Barang (Order-based vs Floor Stock/Consumables).
3. **HPP**: Formula HPP Garmen dengan Konversi Satuan Bahan Baku & Taksiran Flat Bahan Pembantu (Benang/Jarum).
4. **Order Status & Milestone**: Sinkronisasi status Potong/Jahit ("Sedang Dikerjakan"), Eliminasi Redundansi Status Order ("Tandai Siap Kirim"), dan Validasi Ketat Pelunasan (Gate Check sisa tagihan).
*(Serta catatan penyelesaian error payroll kategori pada Poin 5).*

---

## 1. Material: Multi-UOM & Varian Spesifikasi

### 1.1 Masalah Saat Ini
* Beberapa material memiliki variasi merk, warna/kode warna, dan jenis kemasan beli.
* Pembelian material seringkali dalam satuan grosir/kemasan besar (*Pack, Roll, Gross, Cone Besar, Cone Kecil*), sedangkan penggunaannya di meja produksi dan perhitungan HPP berbasis satuan kecil (*Pcs, Meter, Yard*).
* Contoh:
  * **Kancing**: Dibeli 1 Pack / Gross (isi 144 pcs). Dipakai 5 pcs per kemeja.
  * **Sleting**: Dibeli 1 Lusin / Pack (isi 12 atau 50 pcs). Dipakai 1 pcs per jaket/celana.
  * **Benang**: Dibeli Cone Besar (5.000 yard) atau Cone Kecil (500 yard).

### 1.2 Konsep Solusi: Base Unit & Konversi Beli
Sistem menerapkan prinsip **Multi-Unit of Measure (UOM) dengan Rasio Konversi Tetap per Material**:
1. **`unit` (Base / Stock Unit)**: Satuan terkecil yang disimpan di inventori gudang dan dihitung di BOM (misal: `pcs`, `meter`, `yard`, `kg`).
2. **`purchase_unit` (Satuan Beli)**: Satuan saat bertransaksi dengan supplier/toko (misal: `pack`, `roll`, `gross`, `cone_besar`, `cone_kecil`, `lusin`).
3. **`conversion_rate` (Isi per Satuan Beli)**: Pengali untuk mengubah Satuan Beli menjadi Base Unit.
   $$\text{Stok Bertambah (Base Unit)} = \text{Qty Beli (Purchase Unit)} \times \text{Conversion Rate}$$
   $$\text{Harga Pokok per Base Unit} = \frac{\text{Harga Pembelian per Satuan Beli}}{\text{Conversion Rate}}$$

### 1.3 Contoh Penerapan:
| Nama Material | Merk | Warna | Satuan Beli (`purchase_unit`) | Rasio Konversi (`conversion_rate`) | Satuan Stok / BOM (`unit`) | Contoh Pembelian | Masuk ke Stok Gudang |
|---|---|---|---|---|---|---|---|
| Kancing Kemeja 18L | Tulip | Putih #01 | `pack` | 100 | `pcs` | Beli 2 pack @ Rp 30.000 | +200 pcs @ Rp 300/pcs |
| Sleting Besi No. 5 | YKK | Hitam | `lusin` | 12 | `pcs` | Beli 5 lusin @ Rp 60.000 | +60 pcs @ Rp 5.000/pcs |
| Benang Jahit 40/2 | Astra | Navy 224 | `cone_besar` | 5000 | `yard` | Beli 4 cone @ Rp 25.000 | +20.000 yard @ Rp 5/yard |

### 1.4 Perubahan Skema Tabel `materials`
```sql
alter table public.materials
  add column if not exists brand varchar null,
  add column if not exists purchase_unit varchar null,
  add column if not exists conversion_rate numeric not null default 1 check (conversion_rate > 0);

comment on column public.materials.brand is 'Merk material (contoh: YKK, Astra, Tulip)';
comment on column public.materials.purchase_unit is 'Satuan saat pembelian (pack, roll, gross, cone, dll)';
comment on column public.materials.conversion_rate is 'Jumlah base unit per 1 purchase_unit (contoh: 1 pack = 100 pcs)';
```

### 1.5 Varian Warna untuk SEMUA Kategori Material (Kain & Non-Kain)
* **Klarifikasi Domain**: Varian warna (`material_colors`) bukan hanya milik kain, tetapi juga milik material non-kain yang memiliki variasi warna di toko/supplier (seperti **Kancing** Putih/Hitam/Emas, **Sleting** YKK Hitam/Navy/Cream, **Benang Jahit** Putih/Navy 224/Hitam, **Rib Leher**, **Tali Kerut**, dll).
* **Alur Input Form Baru**:
  * Form pembuatan material baru (`MaterialModal.tsx`) dapat langsung menambahkan daftar varian warna sebelum data pertama kali disimpan (tidak perlu simpan dulu baru edit).
  * Spesifikasi tekstil (*komposisi*, *instruksi perawatan*) tetap eksklusif muncul hanya saat kategori material bertipe kain (`is_fabric === true`).
* **Visualisasi Tabel Material (`MaterialsTable.tsx`)**:
  * Menampilkan badge/chips varian warna aktif di bawah nama material agar langsung terlihat oleh staf.

### 1.6 Two-Way Sync Input Harga: Harga Beli Grosir vs Harga Pokok Stok
* **Latar Belakang UX**: Pembelian di toko grosir menggunakan harga per kemasan beli (`purchase_unit`), misal Rp 30.000 / pack (isi 100 pcs). Pengguna tidak perlu menghitung manual `30.000 / 100 = Rp 300 / pcs` di luar aplikasi.
* **Mekanisme Sinkronisasi Interaktif**:
  * Saat `purchase_unit` dipilih dan `conversion_rate > 1`:
    * Form menyediakan input **"Harga Pembelian Kemasan Grosir"** (misal `Rp 30.000 / pack`).
    * Sistem otomatis menghitung dan menampilkan **"Harga Pokok per Satuan Stok"** (`Rp 300 / pcs`).
    * Pengguna dapat mengedit salah satu field, dan sistem akan mengalkulasi pasangannya secara real-time.
  * Pada `MaterialsTable.tsx`, kolom harga menampilkan kedua informasi tersebut: Harga Grosir (`Rp 30.000/pack`) dan Harga Satuan Pokok (`Rp 300/pcs`).

---

## 2. Gudang & Alur Pengeluaran Barang

### 2.1 Input Harga Pasar pada Pengajuan Gudang
* **Latar Belakang**: Harga default di master data hanya menjadi patokan referensi. Realita di lapangan, harga pasar berubah tergantung toko grosir, lokasi, atau fluktuasi harga supplier.
* **Solusi**:
  * Tambahkan kolom `estimated_price` di tabel `stock_requests`.
  * Saat staf gudang membuat pengajuan restock via `StockRequestModal`, sistem otomatis mem-prefill harga dengan `material.price` default, namun staf gudang **dapat mengedit harga tersebut** sesuai estimasi harga pasar terkini yang mereka ketahui.

```sql
alter table public.stock_requests
  add column if not exists estimated_price numeric null check (estimated_price >= 0);

comment on column public.stock_requests.estimated_price is 'Estimasi harga pasar satuan saat diajukan oleh staf gudang';
```

---

### 2.2 Pemisahan Alur Barang Keluar: Order-based vs Floor Stock

```
                              GUDANG UTAMA
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
 [Kategori 1: Order-Based]                        [Kategori 2: Floor Stock]
 - Kain Utama, Furing                             - Benang, Jarum, Catrek,
 - Sleting Khusus (SPK tertentu)                    Kapur, Minyak, Kancing umum
         │                                                   │
         ▼                                                   ▼
 Otomatis terpotong saat SPK                      Dikeluarkan manual dalam jumlah
 Potong / alokasi Order berjalan                   utuh (misal: 1 Cone, 1 Pack jarum)
         │                                                   │
         ▼                                                   ▼
 Langsung masuk HPP Aktual Order                   Diserahkan ke Staf/Line Jahit
                                                   (Sebagai Inventori Kerja Meja Jahit)
```

#### A. Kategori 1: Direct Material (Order-Based)
* Berlaku untuk **Kain** dan aksesoris yang sifatnya spesifik per order.
* Dikeluarkan otomatis saat pemotongan kain (Cutting SPK) atau alokasi bahan order.
* Tercatat di `stock_movements` dengan referensi `order_id`.

#### B. Kategori 2: Floor Stock / Consumables (Non-Order Based)
* Berlaku untuk **Benang, Jarum, Kancing Standar, Gunting Catrek, Minyak Mesin**.
* **Alur Operasional**:
  1. Penjahit A membutuhkan benang warna biru navy.
  2. Gudang mengeluarkan **1 Cone utuh** (misal 5.000 yard).
  3. Staf gudang mencatat mutasi pengeluaran manual:
     * **Tipe**: `floor_stock_out` (Pengeluaran Operasional / Meja Kerja).
     * **Diterima Oleh**: Penjahit A (Staff ID).
     * **Jumlah**: 1 Cone (otomatis mengonversi stok berkurang sesuai Base Unit).
     * **Catatan**: Pemakaian jahit lini produksi.
  4. Sisa benang tidak dikembalikan ke gudang setiap sore, melainkan tetap menjadi stok meja kerja penjahit A sampai habis.
  5. Penjahit B yang membutuhkan benang yang sama bisa memakai sisa di penjahit A, atau meminta cone baru ke gudang jika stok meja habis.

---

## 3. Konsep HPP (Harga Pokok Produksi)

### 3.1 Formula HPP Konveksi
$$\text{HPP per Pcs} = \text{Bahan Baku Utama (Kain)} + \text{Aksesoris Langsung (BOM)} + \text{Taksiran Consumables} + \text{Ongkos CMT} + \text{Maklon}$$

Rincian komponen per pcs produk:
1. **Kain Utama**: `Pemakaian per pcs (meter/yard) × Harga Bahan per meter/yard`.
2. **Aksesoris Langsung (Direct BOM)**:
   * Sleting, kancing spesifik, label rajut, hangtag, badge.
   * Dihitung berdasarkan Base Unit yang dikonversi dari kemasan beli:
     $$\text{Biaya Kancing} = \text{Qty Pakai (pcs)} \times \left(\frac{\text{Harga 1 Pack}}{\text{Isi Pack}}\right)$$
3. **Taksiran Bahan Pembantu (Consumables / Benang) — *Flat Allowance***:
   * Sesuai kesepakatan diskusi, konsumsi benang, jarum, dan minyak tidak dihitung helai per helai per baju karena tidak efisien dan rentan bias.
   * Diterapkan field **`consumables_allowance` (Taksiran Benang & Operasional)** pada master produk (contoh: Rp 1.500 / pcs untuk kemeja, Rp 2.500 / pcs untuk jaket).
4. **Ongkos CMT & Jasa Luar**:
   * Ongkos Potong per pcs (`cutting_cost_per_pcs`).
   * Ongkos Jahit per pcs (`sewing_cost_per_pcs`).
   * Ongkos Bordir / Sablon per pcs (`embroidery_cost`).

### 3.2 Modifikasi Fungsi Kalkulasi HPP (`src/utils/calculateHpp.ts`)
```typescript
export interface HppBreakdown {
  sewingCost: number;
  cuttingCost: number;
  embroideryCost: number;
  fabricCost: number;
  fixedMaterialsCost: number;
  consumablesCost: number;       // <-- Field baru: taksiran benang & consumables
  hppPerUnit: number;
  fabricLines: FabricCostLine[];
}
```

---

## 4. Order Status & Milestone Produksi

### 4.1 Sinkronisasi Status Worklog Potong & Jahit ke Milestone
#### Penyebab Masalah Saat Ini:
* Trigger `sync_potong_stage` hanya memeriksa kolom `cutting_completed_at`. Jika belum ada item yang selesai (`v_done = 0`), status stage potong dipaksa menjadi `'pending'` ("Belum Dimulai"), walaupun tugas potong sudah dibagikan dan sedang dikerjakan (`in_progress`).
* Trigger `sync_jahit_stage` memiliki aturan `if v_total = 0 or v_done = 0 then v_new_status := 'pending'`. Akibatnya, saat penjahit sudah mulai bekerja tapi belum ada pakaian yang disetor (`v_done = 0`), milestone jahit tetap berstatus "Belum Dimulai".

#### Solusi Sinkronisasi:
* **Stage Potong**:
  * `in_progress` ("Sedang Dikerjakan") jika: Ada assignment potong dengan status `'in_progress'` / `'assigned'` ATAU sebagian item sudah selesai dipotong.
  * `done` ("Selesai") jika: Seluruh item order telah selesai dipotong (`cutting_completed_at is not null`).
  * `pending` ("Belum Dimulai") jika: Belum ada satupun penugasan potong dibuat.
* **Stage Jahit**:
  * `in_progress` ("Sedang Dikerjakan") jika: Ada sewing assignment yang berstatus `'assigned'` / `'in_progress'`.
  * `done` ("Selesai") jika: Seluruh sewing assignment berstatus `'completed'`.
  * `pending` ("Belum Dimulai") jika: Belum ada sewing assignment yang ditugaskan.

---

### 4.2 Eliminasi Redundansi Status Order: Single Source of Truth
* **Kondisi Lama**:
  * Ada status `orders.production_status` (`production`, `ready`, `completed`) dengan tombol manual *"Tandai Siap Kirim"*.
  * Ada status `order_stage_events` dengan 10 tahap milestone (*Quotation -> Rekap -> Potong -> Bordir -> Jahit -> Finishing -> QC -> Packaging -> Pelunasan -> Kirim*).
* **Solusi**:
  * **Hapus** tombol manual "Tandai Siap Kirim" dari header order.
  * Milestone Stepper menjadi **satu-satunya acuan status pengerjaan pesanan**.
  * Status "Siap Kirim" tercapai secara otomatis ketika tahap **Packaging** telah selesai (done).

---

### 4.3 Gate-Check Ketat Pelunasan Tagihan (Strict Gate)
* **Aturan Bisnis**: Pesanan **dilarang keras** berpindah ke tahap **Kirim** apabila tagihan belum lunas (`remaining_amount > 0`).
* **Mekanisme Sistem**:
  1. Pada stepper / modal milestone, transisi dari **Packaging** menuju **Kirim**:
     * Sistem memvalidasi `remaining_amount` pesanan dari view `orders_with_balance`.
     * Jika `remaining_amount > 0`:
       * Tombol transisi ke tahap **Kirim** di-disable / dikunci.
       * Muncul badge/peringatan merah: *"Pesanan belum lunas. Sisa tagihan Rp X. Selesaikan pembayaran di tab Pembayaran sebelum barang dapat dikirim."*
     * Hanya ketika `remaining_amount <= 0`, stage **Pelunasan** otomatis valid dan tombol **Tandai Terkirim** aktif.

---

## 5. Catatan Perbaikan Error Penggajian (Poin 5)

* **Gejala**: Saat klik tombol "Bayar Payroll", muncul error PostgreSQL: `relation "public.categories" does not exist`.
* **Akar Masalah**: Pada migrasi `20260923000001_rename_categories_to_transaction_categories.sql`, tabel `categories` telah diubah namanya menjadi `transaction_categories`. Fungsi atau query yang mencatat pengeluaran kasbon/payroll masih merujuk ke nama tabel lama `categories`.
* **Tindakan**: Mengarahkan rujukan query/insert foreign key di fungsi payroll ke `transaction_categories`.

---

## 6. Rencana Langkah Implementasi

1. **Database Migration**:
   - Tambah kolom `brand`, `purchase_unit`, `conversion_rate` pada tabel `materials`.
   - Tambah kolom `estimated_price` pada tabel `stock_requests`.
   - Tambah kolom `consumables_allowance` pada tabel `products`.
   - Perbarui Trigger `sync_potong_stage` dan `sync_jahit_stage` agar mendeteksi status `in_progress`.
   - Update relasi payroll ke tabel `transaction_categories`.
2. **Frontend Material & Purchasing**:
   - Update form Material (`MaterialModal.tsx` & `MaterialsTable.tsx`):
     - Membuka dukungan variasi warna (`MaterialColorsSection`) untuk seluruh material (kain & non-kain seperti kancing, sleting, benang).
     - Memungkinkan penambahan varian warna langsung saat pembuatan material baru (local staging sebelum submit).
     - Input harga grosir vs harga pokok base unit dengan two-way auto calculation.
     - Tampilkan swatch warna dan harga grosir di tabel master material.
   - Update `StockRequestModal.tsx` untuk menampilkan estimasi harga pasar dan pemilihan warna untuk semua material yang memiliki variasi warna.
3. **Frontend Gudang (Floor Stock)**:
   - Tambahkan opsi pengeluaran bahan "Floor Stock / Operasional Meja Jahit" pada mutasi stok keluar gudang.
4. **Perhitungan HPP**:
   - Update `calculateHpp.ts` untuk mengikutsertakan rasio konversi unit material dan taksiran consumables.
5. **Frontend Order & Milestone**:
   - Hapus tombol "Tandai Siap Kirim" lama.
   - Perbaiki stepper timeline agar mencerminkan status "Sedang Dikerjakan" secara realtime.
   - Pasang validasi ketat (strict gate check) pada stage Pelunasan & Kirim jika sisa tagihan > 0.
