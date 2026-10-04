# 🏭 Gudang & Purchasing — SIKon App

Mencakup: Manajemen Stok, Permintaan Restock, Jalur Pembelian SPJ & Direct Supplier, Barang Keluar, dan Retur Material Cacat.

---

## 1. Gambaran Alur

```
Staf GUDANG ajukan restock
  → FINANCE approve → cairkan uang muka / bayar supplier
    → PURCHASING belanja (SPJ) atau Supplier kirim (Direct)
      → Barang fisik tiba
        → GUDANG konfirmasi terima → STOK BERTAMBAH ← satu-satunya titik stok naik

Pemakaian stok:
  Kain       → Gudang serahkan ke TUKANG POTONG per penugasan → gate: wajib sebelum "Selesai Potong"
  Direct BOM → Gudang serahkan ke PENJAHIT per bundel jahit   → gate: wajib sebelum "Mulai Jahit"
  Floor Stock → Gudang keluarkan per kemasan utuh (benang, jarum, kancing)
  Cacat       → Penjahit setor ke Gudang → dicatat susut, diganti jika stok ada
```

---

## 2. Halaman Gudang (`/gudang`)

Lima tab utama:

| Tab | Fungsi |
|-----|--------|
| **Stok Material** | Lihat stok semua material, highlight stok di bawah minimum |
| **Barang Keluar** | Catat pengeluaran kain ke tukang potong, bahan jahit ke penjahit, floor stock |
| **Permintaan Restock** | Buat, lihat, dan kelola pengajuan restock dari gudang |
| **Terima Barang** | Konfirmasi penerimaan barang dari SPJ atau Direct Supplier |
| **Riwayat Mutasi** | Log semua pergerakan stok (masuk/keluar/adjustment) |

---

## 3. Pergerakan Stok (`stock_movements`)

### 3.1 Struktur

| Kolom | Nilai |
|-------|-------|
| `movement_type` | `in`, `out`, `adjustment` |
| `status` | `pending` → `confirmed` / `cancelled` |
| `source_type` | `manual`, `purchase_receipt`, `purchasing_report`, `supplier_purchase`, `order_consumption`, `stock_request`, `floor_stock` |
| `taken_by` | Staf yang **mengambil** barang (hanya untuk `out`) |
| `recorded_by` | Staf Gudang yang **mencatat** |
| `sewing_assignment_id` | Menautkan ke bundel jahit |
| `cutting_assignment_id` | Menautkan ke penugasan potong |

### 3.2 Cara Kerja

- Movement `pending` **tidak** mengubah stok
- Efektif setelah `confirm_stock_movement(id, taken_by, recorded_by)` — validasi stok cukup untuk `out`; dua parameter staf opsional
- `cancel_stock_movement(id)` hanya untuk yang masih `pending`
- Overload lama satu parameter dihapus oleh migration `20261004223400_drop_legacy_confirm_stock_movement_overload.sql`; jika kedua signature ada, PostgREST gagal memilih RPC.

### 3.3 Aturan Penting: Material Berwarna

> ⚠️ **Jangan hanya baca `materials.stock_qty` untuk material berwarna!**

Untuk material yang punya varian warna, stok aktual ada di `material_colors.stock_qty`. Rumus yang benar:

```sql
COALESCE(
  (SELECT SUM(mc.stock_qty) FROM material_colors mc
    WHERE mc.material_id = m.id AND mc.is_active = true
    HAVING COUNT(mc.id) > 0),
  m.stock_qty,
  0
) AS effective_stock
```

Saat memotong stok untuk material berwarna:
1. Cari varian yang cocok dengan warna yang dibutuhkan
2. Jika cukup, potong dari varian tersebut
3. Jika tidak ada yang cocok, potong dari varian dengan stok terbesar
4. Catat `material_color_id` yang benar-benar dipotong

---

## 4. Permintaan Restock (`stock_requests`)

### 4.1 Status Flow

```
draft_auto → pending → approved → in_progress → fulfilled
                   ↘ rejected
                   ↘ cancelled
```

### 4.2 Kolom Penting

| Kolom | Keterangan |
|-------|-----------|
| `requested_by` | **Hanya staf role `Gudang`** — dijaga trigger `validate_stock_request_requester` |
| `fulfillment_type` | `spj` atau `supplier_purchase` — dipilih saat pengajuan |
| `estimated_price` | Estimasi harga (prefill dari harga master, bisa diedit) |
| `preferred_store` | Nama toko/supplier rekomendasi (referensi untuk Purchasing) |
| `batch_id` | Menandai beberapa baris yang diajukan bersamaan |
| `source_type` | `manual` (input staf) atau `auto_order` (dari order yang kurang stok) |
| `approved_by` | ID staf purchasing yang ditunjuk (bukan orang Finance yang approve) |

### 4.3 Pengajuan Massal (Bulk)

Modal pengajuan mendukung banyak item sekaligus:
- **Header:** staf pemohon, jalur beli, catatan global
- **Baris item:** material, warna (untuk kain), qty, satuan, estimasi harga, catatan
- **RPC:** `create_bulk_stock_requests(p_items, p_requested_by, p_fulfillment_type, p_global_reason, p_batch_id)` — atomik

Di tab Stok Material: pilih beberapa baris stok menipis → "Ajukan Restock" → modal terisi otomatis.

### 4.4 Edit Pengajuan

- Hanya bisa diedit saat status `pending`
- **RPC:** `update_pending_stock_request(...)` — edit material, warna, qty, jalur, estimasi harga
- Setelah `approved`/`in_progress`, terkunci (tombol Edit disembunyikan)

### 4.5 Pengajuan Otomatis dari Order (Kain)

Saat order dibuat dan stok kain tidak cukup:
- Sistem membuat `stock_requests` berstatus `draft_auto` secara otomatis
- `draft_auto` tidak langsung ke Purchasing — staf Gudang harus "Konfirmasi & Ajukan" (menjadi `pending`) atau "Abaikan" (menjadi `cancelled`)
- Qty yang diajukan = **selisih kekurangan**, bukan total kebutuhan

### 4.6 Bulk Approve

- **RPC:** `bulk_approve_stock_requests(p_request_ids, p_approved_by)`
- Mengubah `pending` → `approved` untuk semua request yang dipilih
- Tidak memfilter `fulfillment_type` — SPJ dan supplier sama-sama bisa di-bulk-approve

> ⚠️ **Bug yang belum diperbaiki:** `approve_stock_request_spj` hanya menerima `pending`/`draft_auto`, bukan `approved`. Jadi request SPJ yang sudah di-bulk-approve tidak bisa dilanjutkan via RPC SPJ. Cek apakah UI menghindari bulk approve untuk jalur SPJ.

---

## 5. Dua Jalur Pembelian

### 5.1 Jalur A — SPJ (Belanja Retail)

**Untuk:** pembelian di toko retail (Tokopedia, pasar, toko lokal) dengan uang muka.

```
1. Gudang ajukan restock (status: pending, jalur: spj)
   ↓
2. Finance: approve + buat SPJ + cairkan uang muka (SATU AKSI)
   RPC: approve_stock_request_spj(p_request_ids[], p_purchasing_staff_id, p_advance_amount, p_notes)
   → cash_advances: outstanding + expense "Uang Muka Purchasing"
   → purchasing_reports: disbursed ("Sedang Belanja")
   → stock_requests: in_progress
   ↓
3. Staf Purchasing belanja, isi item + foto nota, submit
   RPC: submit_purchasing_report(...)
   → purchasing_reports: submitted
   ↓
4. Finance verifikasi nota
   RPC: approve_purchasing_report(...)
   → expense per kategori barang + expense service_fee
   → income "Reversal Uang Muka" + cash_advances: settled
   → stock_movements 'in' dibuat PENDING (stok belum naik!)
   → purchasing_reports: financially_approved
   ↓
5. Staf Purchasing serahkan barang fisik ke Gudang
   ↓
6. Gudang cek fisik, konfirmasi terima
   RPC: confirm_purchasing_report_receipt(p_report_id, p_received_by, p_base_quantities)
   → movement pending → confirmed: STOK NAIK + harga material update
   → purchasing_reports: goods_received, stock_requests: fulfilled
```

**Status SPJ (`purchasing_reports.status`):**

| Status | Arti |
|--------|------|
| `disbursed` | Uang muka cair, staf sedang belanja |
| `submitted` | Nota di-upload, menunggu verifikasi Finance |
| `financially_approved` | Nota disetujui, menunggu barang diserahkan ke Gudang |
| `goods_received` | Gudang sudah terima dan cek fisik |
| `rejected` | Ditolak (uang muka tetap outstanding jika sudah cair) |

**Aksi tambahan:**
- `reject_purchasing_report(report_id, reason)` — hanya dari status `submitted`
- `cancel_disbursed_report(report_id, reason)` — batal setelah uang cair sebelum submit

### 5.2 Jalur B — Direct Supplier (Supplier Langganan)

**Untuk:** pembelian ke supplier tetap dengan pembayaran penuh di muka.

```
1. Gudang ajukan restock (status: pending, jalur: supplier_purchase)
   ↓
2. Finance: approve + buat pembelian supplier + transfer lunas (SATU AKSI)
   RPC: approve_stock_request_supplier(p_request_ids[], p_supplier_name, p_payment_date, p_items, p_notes)
   → supplier_purchases: ordered
   → transaksi expense per kategori (langsung karena lunas di muka)
   → stock_requests: in_progress
   ↓
3. Finance upload nota/bukti (OPSIONAL)
   RPC: upload_supplier_purchase_proof(...)
   Catatan: nota tidak menggerbang — Gudang tetap bisa terima walau belum ada nota
   ↓
4. Gudang terima barang fisik
   RPC: receive_supplier_purchase(p_purchase_id, p_recorded_by, p_base_quantities)
   → stock_movements 'in' confirmed: STOK NAIK + harga update
   → supplier_purchases: received, stock_requests: fulfilled
```

### 5.3 Perbandingan SPJ vs Direct Supplier

| Aspek | SPJ | Direct Supplier |
|-------|-----|----------------|
| Uang keluar | Saat approve (uang muka), dikoreksi saat nota diverifikasi | Saat approve (lunas) |
| Tahap "sedang belanja" | Ada | Tidak ada |
| Siapa upload nota | Staf purchasing (wajib) | Finance (tidak wajib) |
| Stok naik | Gudang konfirmasi setelah `financially_approved` | Gudang konfirmasi saat barang tiba |
| Expense dicatat | Per kategori barang | Per kategori barang |

### 5.4 Multi-UOM: Satuan Variabel

Untuk material dengan satuan variabel (contoh: roll kain dengan panjang tidak pasti):
- `conversion_rate = 0` saat pengajuan
- Saat konfirmasi penerimaan, staf Gudang input qty aktual (base unit)
- Format `p_base_quantities`: `[{"item_id": "<uuid>", "base_quantity": 120}]`
- Item variabel tanpa angka aktual akan **ditolak**

### 5.5 Bulk di Sisi Purchasing

Tab **"Pengajuan Gudang"** di halaman Purchasing:
- Daftar pengajuan dengan badge kategori
- Filter per kategori
- Checkbox multi-select (satu kategori sekaligus)
- Tombol "Proses Terpilih sebagai 1 SPJ / 1 Pembelian Supplier"

---

## 6. Barang Keluar dari Gudang

### 6.1 Tiga Jenis Pengeluaran

Sub-tab **Barang Keluar** di halaman Gudang:

| Sub-tab | Untuk | Berdasarkan | Gate |
|---------|-------|-------------|------|
| **Kain Potong** | Tukang potong | Per penugasan potong (`cutting_assignments`) | `material_dispatched_at` wajib terisi sebelum "Selesai Potong" |
| **Bahan Jahit** | Penjahit | Per bundel jahit (`sewing_assignments`): `assigned_qty × BOM per pcs` | `material_dispatched_at` wajib terisi sebelum "Mulai Jahit" |
| **Floor Stock** | Penjahit / staf finishing | Form cepat, per kemasan utuh | — |

**Hanya Direct BOM non-floor-stock yang masuk Bahan Jahit:** sleting, furing, woven label, rib, tali kerut, velcro.
Benang, kancing, jarum = floor stock (tidak dialokasikan per bundel).

### 6.2 Aturan Keras

1. **Tidak ada serah parsial.** Jika satu bahan kurang stok → seluruh serah terima diblokir. Pesan error: *"Stok bahan X tidak mencukupi. Ajukan restock terlebih dahulu."*
2. **Produk tanpa BOM direct non-floor-stock** melewati gate bahan (tidak perlu serah bahan ke penjahit).
3. **Floor stock** (benang, kancing, jarum): keluarkan per kemasan utuh, wajib isi siapa yang minta dan siapa yang catat.

### 6.3 Gate Check: `material_dispatched_at`

| Kolom Gate | Berlaku untuk |
|-----------|--------------|
| `cutting_assignments.material_dispatched_at` | Gate sebelum "Tandai Selesai Potong" |
| `sewing_assignments.material_dispatched_at` | Gate sebelum "Mulai Jahit" |

**Override supervisor:**
- `start_sewing_assignment(id, p_force=true, p_force_reason)` — alasan wajib, dicatat di `notes` sebagai `[PAKSA MULAI: ...]`
- `mark_cutting_item_done(id, p_force=true, p_force_reason)` — sama

### 6.4 Badge di UI

| Badge | Warna | Arti |
|-------|-------|------|
| `⏳ Menunggu Kain dari Gudang` | Amber | Kain belum diserahkan ke tukang potong |
| `✓ Kain Diterima (Siap Potong)` | Hijau | Gate terpenuhi |
| `⏳ Menunggu Bahan Gudang` | Amber | Bahan jahit belum diserahkan ke penjahit |
| `✓ Bahan Diterima • tgl jam` | Hijau | Gate terpenuhi |
| `⚠ Override Supervisor` | Merah | Ada paksa mulai oleh supervisor |

### 6.5 Riwayat Mutasi

Tab **Riwayat Mutasi** (`StockHistoryTab`) menampilkan kolom "Diambil oleh" untuk movement `out` — berguna untuk audit selisih stok.

---

## 7. Retur Material Cacat

### 7.1 Alur

Penjahit menemukan material cacat (sleting macet, label cacat, dll.):
1. Penjahit bawa ke loket Gudang
2. **Staf Gudang** yang input — bukan penjahit sendiri
3. Modal "Terima Barang Rusak": penjahit, order terkait (opsional), material, jumlah, alasan

### 7.2 RPC `process_defect_material_return`

**Jika stok pengganti ada:**
- Catat `stock_movements` `out` (`order_consumption`, `taken_by` = penjahit)
- Kurangi stok, tambah `scrap_qty`
- `is_replaced = true`

**Jika stok habis:**
- Hanya tambah `scrap_qty`
- Otomatis buat `stock_requests` darurat (`pending`, jalur SPJ)
- `is_replaced = false`

> ⚠️ **Bug yang diketahui:** RPC ini hanya memotong `materials.stock_qty`, bukan `material_colors.stock_qty`. Untuk material berwarna (sleting/kancing), bisa salah baca stok.

Barang cacat **langsung dianggap susut/afkir** (`disposition = 'scrap'`). Tidak ada penagihan balik ke supplier.

---

## 8. Daftar RPC

| RPC | Fungsi |
|-----|--------|
| `confirm_stock_movement(id, taken_by, recorded_by)` | Efektifkan movement pending → stok berubah; parameter staf opsional |
| `cancel_stock_movement(id)` | Batalkan movement pending |
| `create_bulk_stock_requests(...)` | Ajukan banyak item restock atomik |
| `bulk_approve_stock_requests(...)` | Approve banyak pengajuan `pending` sekaligus |
| `update_stock_request_fulfillment_type(...)` | Koreksi jalur beli saat `pending`/`draft_auto` |
| `update_pending_stock_request(...)` | Edit pengajuan (hanya `pending`) |
| `approve_stock_request_spj(...)` | Approve + buat 1 SPJ + cairkan uang muka |
| `submit_purchasing_report(...)` | Staf purchasing submit SPJ |
| `approve_purchasing_report(...)` | Finance verifikasi nota SPJ |
| `reject_purchasing_report(...)` | Tolak SPJ (dari `submitted`) |
| `cancel_disbursed_report(...)` | Batal SPJ setelah uang cair |
| `confirm_purchasing_report_receipt(...)` | Gudang terima barang SPJ → stok naik |
| `approve_stock_request_supplier(...)` | Approve + buat pembelian supplier |
| `upload_supplier_purchase_proof(...)` | Upload nota supplier (opsional) |
| `receive_supplier_purchase(...)` | Gudang terima barang supplier → stok naik |
| `give_cash_advance(...)` | Cairkan uang muka ke staf + expense |
| `dispatch_cutting_materials(...)` | Serah kain ke tukang potong |
| `dispatch_sewing_materials(...)` | Serah bahan jahit per bundel |
| `check_sewing_material_stock(...)` | Preview kecukupan stok untuk bundel jahit |
| `check_cutting_material_stock(...)` | Preview kecukupan stok untuk penugasan potong |
| `start_sewing_assignment(...)` | Mulai jahit (dengan gate check bahan) |
| `start_all_sewing_assignments(...)` | Mulai semua bundel satu penjahit |
| `process_defect_material_return(...)` | Retur cacat + penggantian stok |

**Trigger:**
- `validate_stock_request_requester` — pemohon restock harus role `Gudang`
- `capture_material_purchase_unit_snapshot` — isi snapshot satuan beli per baris pembelian
