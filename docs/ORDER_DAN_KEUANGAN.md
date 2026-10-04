# 💰 Order & Keuangan — SIKon App

Mencakup: Order, Item Order, Pembayaran, Transaksi Keuangan, Arus Kas, Piutang, dan Dashboard Keuangan.

---

## 1. Order (`/orders`)

### 1.1 Konsep Dasar Order

Order = pesanan satu pelanggan yang berisi satu atau lebih item (produk + qty).

Order punya **dua dimensi status yang berbeda**:

| Kolom | Arti | Nilai | Cara Berubah |
|-------|------|-------|-------------|
| `orders.status` | Status **pembayaran** | `belum_lunas`, `lunas` | **Otomatis** via trigger + RPC |
| `orders.production_status` | Status pengerjaan **ringkas** | `quotation`, `pending`, `production`, `ready`, `completed` | **Otomatis** dari timeline milestone |

> **Jangan edit kedua kolom ini secara manual dari frontend.** Mereka dikelola oleh trigger dan RPC.

### 1.2 Data yang Disimpan per Order

| Kolom | Keterangan |
|-------|-----------|
| `order_id` | Kode order otomatis: `ORD-0001`, `ORD-0002`, dst (unique per user) |
| `order_date` | Tanggal order dibuat |
| `customer_name` | Nama pelanggan |
| `sales_id` | FK ke tabel `sales` (opsional) |
| `total_price` | SUM semua item (dihitung otomatis oleh trigger, **jangan diedit manual**) |
| `ongkir` | Ongkos kirim (diisi manual) |
| `grand_total` | `total_price + ongkir` (computed di view) |
| `status` | Status pembayaran: `belum_lunas` / `lunas` |
| `production_status` | Status produksi ringkas |
| `order_type` | `satuan` (<6 pcs) atau `prioritas` (≥6 pcs) — diisi frontend |
| `is_order_type_manual_override` | `true` jika admin override kategori secara manual |
| `bonus_paid` | Flag bahwa bonus sales sudah dibayarkan ke payroll |

### 1.3 Order Item

Setiap order punya satu atau lebih item di tabel `order_items`:

| Kolom | Keterangan |
|-------|-----------|
| `product_id` | FK ke `products` |
| `name_item` | Nama item (snapshot dari `products.name`) |
| `qty` | Jumlah pcs |
| `price` | Harga jual per pcs (snapshot saat order dibuat) |
| `total_price` | `qty × price` (dihitung otomatis oleh trigger) |
| `hpp_per_unit_snapshot` | HPP per pcs saat order dibuat (tidak berubah) |
| `hpp_total_snapshot` | `qty × hpp_per_unit_snapshot` |
| `embroidery_cost_per_unit` | Biaya bordir per pcs |
| `embroidery_details` | Detail bordir: mode (none/flat/spots), lokasi, biaya |
| `ready_for_sewing_at` | Timestamp item masuk pool jahit (setelah bordir selesai) |
| `cutting_completed_at` | Timestamp item selesai dipotong |
| `cutting_qty` | Qty aktual yang berhasil dipotong (bisa beda dari `qty` jika ada kain rusak) |

**Kain per item** disimpan di `order_item_fabrics`:
- Material, warna, qty pakai, harga saat itu, biaya per baris
- Snapshot penuh — tidak berubah walau harga master diubah

### 1.4 Flow Order → Pembayaran → Transaksi

```
1. Order dibuat
   → trigger generate_order_code: buat kode ORD-000N
   → order_items ditambah
   → trigger calc_order_item_total: total_price = qty × price
   → trigger sync_order_total_price: orders.total_price = SUM(semua item)

2. Bayar (DP atau Pelunasan)
   → RPC record_order_payment(order_id, amount, 'dp'/'pelunasan', ...)
   → insert order_payments
   → insert transactions (type: income, "Pembayaran Order")
   → recompute_order_status → lunas jika total_dibayar ≥ total_price + ongkir

3. Salah input pembayaran?
   → RPC delete_order_payment(payment_id)
   → hapus order_payments + transactions terkait
   → recompute status pembayaran
```

### 1.5 Tipe Pembayaran

| Tipe | Keterangan |
|------|-----------|
| `dp` | Uang muka / Down Payment |
| `pelunasan` | Pembayaran akhir (melunasi sisa) |

### 1.6 Gate Check Pengiriman

**Order tidak bisa ditandai "Kirim" selesai jika masih ada sisa tagihan.**

Implementasi di database: `toggle_order_stage` menolak stage `pelunasan` dan `kirim` jika `orders_with_balance.remaining_amount > 0`. Pesan error: *"Pesanan belum lunas (sisa tagihan: Rp X)..."*

Di UI: tombol dikunci dengan peringatan merah.

### 1.7 UI Halaman Order

- Filter status: Semua, Belum Lunas, Lunas
- Pencarian: nomor order, nama pelanggan, nama sales
- Tombol **Lihat** → modal detail order + timeline produksi + riwayat pembayaran
- Tombol **Edit** → form edit order (nama pelanggan, ongkir, dll.)
- Tombol **Hapus** → menghapus order + semua item dan pembayarannya
- **Modal Pembayaran** → input DP/pelunasan, metode pembayaran, tanggal

### 1.8 Views Database

| View | Isi |
|------|-----|
| `orders_with_balance` | Order + `grand_total` + `paid_amount` + `remaining_amount` (piutang) |
| `sales_performance` | Agregat per sales: jumlah order, revenue, dibayar, piutang |

---

## 2. Timeline Produksi (Milestone) — ringkas

> **Pemilik bagian ini adalah `PRODUKSI_DAN_WORKLOG.md` §2.** Sepuluh tahap (Quotation → ... → Kirim), tabel `order_stage_events`, dan cara tiap tahap berubah ada di sana secara lengkap — baca di situ supaya tidak ada dua sumber yang bisa berbeda.

Yang relevan untuk domain keuangan di halaman ini:

- **Gate pelunasan/kirim:** tahap **Pelunasan** dan **Kirim** ditolak selama `orders_with_balance.remaining_amount > 0`. Pesan error: *"Pesanan belum lunas (sisa tagihan: Rp X)..."*. Di UI, tombol dikunci dengan peringatan merah.
- **Efek ke `production_status`:** Packaging selesai → `ready` ("Siap Kirim"); Kirim selesai → `completed`. Kedua kolom ini diturunkan otomatis dari timeline, jangan diedit manual dari frontend.

---

## 3. Keuangan (`/financial`)

### 3.1 Gambaran Umum

Halaman keuangan menampilkan **seluruh arus kas** perusahaan dalam satu tabel `transactions`:
- Pemasukan dari order (otomatis saat pembayaran dicatat)
- Pengeluaran dari SPJ (pembelian via staf purchasing)
- Pengeluaran dari Direct Supplier
- Pengeluaran gaji (saat payroll dibayar)
- Transaksi manual lain yang diinput admin

### 3.2 Struktur Transaksi

Tabel `transactions`:

| Kolom | Keterangan |
|-------|-----------|
| `title` | Judul/deskripsi transaksi |
| `amount` | Nominal |
| `type` | `income` atau `expense` |
| `transaction_date` | Tanggal transaksi |
| `description` | Keterangan tambahan |
| `category_id` | FK ke `transaction_categories` |
| `order_id` | FK ke `orders` (khusus transaksi pembayaran order) |

### 3.3 Saldo & Ringkasan

```
Saldo Berjalan = Saldo Awal + Total Income - Total Expense
Piutang        = SUM remaining_amount dari semua order berstatus 'belum_lunas'
```

- **Saldo Awal** diatur di profil perusahaan (`company_settings.saldo_awal` — bukan `initial_balance`, dikoreksi setelah dicek ke migration dan `useCompanySettings.ts`)
- Tombol **Edit Saldo Awal** tersedia di halaman keuangan

### 3.4 Visualisasi

- **Trend Chart** — grafik garis income vs expense per periode
- **Category Donut Chart** — komposisi pengeluaran per kategori
- **Summary Cards** — total income, total expense, saldo berjalan, piutang

### 3.5 Filter Transaksi

- Filter tipe: Semua, Pemasukan, Pengeluaran
- Filter tanggal: dari — sampai
- Pencarian teks: judul transaksi

### 3.6 CRUD Transaksi Manual

Admin bisa menambah, edit, dan hapus transaksi manual:
- Harus pilih kategori income/expense
- Input nominal, tanggal, judul, deskripsi

> **Perhatian:** Transaksi yang dibuat otomatis oleh sistem (pembayaran order, SPJ, payroll) sebaiknya tidak dihapus manual karena akan merusak konsistensi data.

---

## 4. Dashboard (`/dashboard`)

### 4.1 Kartu Ringkasan Order

- Total order bulan ini
- Total revenue bulan ini
- Order belum lunas (jumlah + nilai piutang)
- Order dalam proses produksi

### 4.2 Grafik

- **Order Trend Chart** — tren jumlah order per minggu/bulan
- **Order Status Chart** — distribusi status order (belum lunas / lunas / completed)
- **Sales Performance Card** — tabel performa per salesperson
- **Category Quantity Card** — qty terjual per kategori produk
- **Recent Orders Card** — daftar order terbaru

---

## 5. Daftar Trigger & RPC

| Nama | Jenis | Fungsi |
|------|-------|--------|
| `generate_order_code` | trigger | Buat kode `ORD-000N` otomatis |
| `calc_order_item_total` | trigger | `total_price = qty × price` per item |
| `sync_order_total_price` | trigger | `orders.total_price = SUM(items)` |
| `recompute_status_on_order_change` | trigger | Hitung ulang status bayar jika total berubah |
| `recompute_order_status` | internal fn | Set `lunas`/`belum_lunas` |
| `record_order_payment` | **RPC** | Catat bayar + income + update status |
| `delete_order_payment` | **RPC** | Batalkan pembayaran |
| `toggle_order_stage` | **RPC** | Toggle tahap milestone (dengan gate check) |
| `calculate_order_type` | function | Hitung satuan/prioritas dari total qty |
| `update_owner_email` | **RPC** | Ganti email login |
| `sync_potong_stage` | trigger | Sinkron status tahap Potong dari data aktual |
| `sync_jahit_stage` | trigger | Sinkron status tahap Jahit dari data aktual |
