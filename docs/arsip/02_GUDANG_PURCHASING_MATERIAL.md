# 02 — Gudang, Purchasing, Material

Rangkuman dari 12 dokumen: `DESAIN_FITUR_STAF_GUDANG_PURCHASING`, `DESAIN_MATERIAL_GUDANG_HPP_DAN_ORDER_STATUS`, `DESAIN_MULTI_UOM_PEMBELIAN_MATERIAL`, `RANCANGAN_PERBAIKAN_FLOW_GUDANG` (v1 dan v2), `RANCANGAN_FLOW_APPROVAL_SPJ_DIRECT_SUPPLIER`, `RANCANGAN_BULK_PENGAJUAN_RESTOCK_GUDANG`, `RANCANGAN_FIX_BULK_APPROVAL_SUPPLIER_DAN_NAMA_TOKO`, `RANCANGAN_GUDANG_BARANG_KELUAR_WORKLOG`, `RANCANGAN_GATE_CHECK_MATERIAL_SEBELUM_JAHIT`, `RANCANGAN_FIX_GATE_CHECK_POTONG...`, `RANCANGAN_FIX_QUERY_STOK_WARNA...`, `RANCANGAN_GUDANG_RETUR_DAN_BARANG_RUSAK`.

Di bawah ini selalu **versi terbaru** dari tiap topik. Versi lama yang sudah digantikan ditandai.

---

## 1. Gambaran satu halaman

```
Staf GUDANG ajukan restock ──► FINANCE approve ──► PURCHASING belanja ──► barang fisik tiba ──► GUDANG konfirmasi terima ──► STOK BERTAMBAH
 (stock_requests, pending)      (+ cairkan uang        (SPJ atau Direct         │
 pilih jalur beli di awal        muka / bayar supplier)   Supplier)             └─ stok HANYA naik di sini

Pemakaian stok:
  Kain      ──► Gudang serahkan ke TUKANG POTONG (per penugasan potong)  ──► baru boleh "Selesai Potong"
  Direct BOM ─► Gudang serahkan ke PENJAHIT (per bundel jahit)           ──► baru boleh "Mulai Jahit"
  Floor stock ► Gudang keluarkan per kemasan utuh, catat siapa yang minta (benang, jarum, kancing)
  Cacat      ─► Penjahit setor ke Gudang, dicatat susut, diganti kalau stok ada
```

---

## 2. Material

### 2.1 Konsep satuan (yang sudah jalan)
Tiga kolom di `materials`:

| Kolom | Arti | Contoh |
|---|---|---|
| `unit` | **Base unit**: satuan stok dan BOM. Sumber kebenaran saldo gudang. | pcs, meter, yard |
| `purchase_unit` | Satuan beli | pack, roll, cone, lusin |
| `conversion_rate` | Isi per satuan beli | 1 pack = 100 pcs |

```
stok bertambah (base unit) = qty beli × conversion_rate
harga pokok per base unit  = harga beli per satuan beli ÷ conversion_rate
```
Contoh: kancing 2 pack @ Rp30.000, isi 100 → +200 pcs @ Rp300/pcs.

Kolom lain: `brand`, `is_floor_stock`, `scrap_qty` (akumulasi barang rusak/afkir).

**Form harga dua arah:** kalau `conversion_rate > 1`, user bisa isi "harga kemasan grosir" **atau** "harga pokok per satuan stok", sistem menghitung pasangannya real-time. Tabel material menampilkan keduanya.

### 2.2 Varian warna berlaku untuk SEMUA material
`material_colors` bukan hanya untuk kain. Kancing, sleting, benang, rib juga punya varian warna. Form material baru bisa menambah varian **sebelum** simpan pertama. Spesifikasi tekstil (komposisi, perawatan) hanya muncul kalau kategorinya `is_fabric`.

> **Konsekuensi terbesar untuk programmer:** untuk material berwarna, `materials.stock_qty` bisa **0** sementara stok sebenarnya tersebar di `material_colors.stock_qty`. Lihat §3.

### 2.3 Floor stock
`materials.is_floor_stock = true` untuk benang, kancing, jarum (default ditandai berdasarkan nama mengandung "benang"/"kancing"/"jarum"). Bahan ini **tidak** ikut dialokasikan per order atau per penjahit.

### 2.4 Banyak satuan beli per material (sudah ada di migration)
*Migration `20261001100001` dan `20261001100002`. Yang saya verifikasi hanya SQL-nya; tampilan UI tidak bisa dicek dari migration.*

Implementasinya **bukan tabel baru**, melainkan kolom JSON:
- `materials.purchase_units jsonb` (wajib array). Tiap elemen: `{id, name, conversion_rate, is_variable, is_primary, is_active}`. Kolom lama `purchase_unit`/`conversion_rate` tetap ada dan dipakai sebagai fallback; data lama di-backfill jadi satu elemen `legacy-primary` (satuan bernama `roll` otomatis dianggap **variabel**).
- **Snapshot per transaksi:** kolom `conversion_rate` dan `is_variable_unit` ditambahkan ke `stock_requests`, `purchasing_report_items`, `supplier_purchase_items`; item pembelian juga punya `base_quantity`. Untuk satuan variabel, `conversion_rate = 0` dan `base_quantity` kosong sampai barang diterima.
- Trigger `capture_material_purchase_unit_snapshot` (BEFORE INSERT/UPDATE di tiga tabel itu) mengisi snapshot. Urutan: ambil dari `stock_requests` induk kalau item terhubung dan satuannya sama, lalu dari `purchase_units`, lalu `unit` dasar (1:1), lalu `purchase_unit` lama.
- `stock_movements.source_line_id` menautkan mutasi ke baris pembelian.
- **Saat penerimaan** RPC menerima jumlah aktual untuk satuan variabel:
  - `confirm_purchasing_report_receipt(p_report_id, p_received_by, p_base_quantities jsonb)`
  - `receive_supplier_purchase(p_purchase_id, p_recorded_by, p_base_quantities jsonb)`
  - Format `p_base_quantities`: `[{"item_id": "<uuid>", "base_quantity": 120}]`. Item variabel tanpa angka ditolak.
- Stok naik = `quantity × conversion_rate` (tetap) atau angka aktual (variabel), dan `materials.price` diperbarui menjadi `total_price / base_qty`.
- Batasan yang disepakati: sistem tidak melacak saldo per roll/kemasan.

### 2.5 HPP per pcs
```
HPP = Kain utama + Aksesoris langsung (BOM) + Taksiran consumables + Ongkos potong + Ongkos jahit + Bordir/Maklon
```
- Kain: pemakaian per pcs × harga per meter/yard.
- Aksesoris: qty pakai (base unit) × (harga per kemasan ÷ isi kemasan).
- **Consumables (benang, jarum, minyak) = taksiran flat per pcs** lewat `products.consumables_allowance` (mis. Rp1.500 kemeja, Rp2.500 jaket), **bukan** dihitung helai per helai.
- Fungsi `calculateHpp.ts` mendapat field `consumablesCost`.
- HPP disimpan sebagai snapshot di `order_items` (lihat 01 §4.3).

---

## 3. Stok dan pergerakan stok

### 3.1 `stock_movements`
| Kolom | Nilai |
|---|---|
| `movement_type` | `in`, `out`, `adjustment` |
| `status` | `pending` (belum ubah stok) → `confirmed` / `cancelled` |
| `source_type` | **Constraint saat ini** (migration `20260929000001`): `manual`, `purchase_receipt`, `purchasing_report`, `supplier_purchase`, `order_consumption`, `stock_request`, `floor_stock`. Nilai `initial`, `purchase`, `adjustment` dari baseline **sudah dihapus** dari constraint (lihat masalah di `00_BACA_DULU` §6) |
| `taken_by` | Staf yang **mengambil** barang (hanya `out`) |
| `recorded_by` | Staf Gudang yang **mencatat** |
| `sewing_assignment_id`, `cutting_assignment_id` | Menautkan pengeluaran ke penugasan |

Movement `pending` **tidak** mengubah `stock_qty`. Baru efektif lewat `confirm_stock_movement(id)` (validasi stok cukup untuk `out`). `cancel_stock_movement(id)` hanya untuk yang masih `pending`.

### 3.2 ATURAN WAJIB: hitung stok material berwarna
*Status: migration `20261003200001_fix_material_color_stock_queries` **sudah ada** dan memperbaiki `check_sewing_material_stock` dan `dispatch_sewing_materials`. Fungsi lain belum, lihat daftar di bawah.*

Bug yang ditemukan: `check_sewing_material_stock` dan `dispatch_sewing_materials` hanya membaca `materials.stock_qty`. Untuk sleting/kancing berwarna nilainya 0 padahal total di `material_colors` melimpah, sehingga tombol "Serahkan Bahan" terkunci "stok 0".

Rumus stok efektif yang benar:
```sql
coalesce(
  (select sum(mc.stock_qty) from material_colors mc
    where mc.material_id = m.id and mc.is_active = true
    having count(mc.id) > 0),   -- kalau ADA varian aktif: jumlah semua varian
  m.stock_qty,                  -- kalau tidak: stok master
  0
)
```
Saat **memotong** stok (dispatch):
- Material punya varian warna: cari varian yang cocok dengan warna kain order, kalau cukup potong dari situ. Kalau tidak ada yang cocok, potong dari varian dengan stok terbesar (bisa terbagi ke beberapa varian). Catat `stock_movements.material_color_id` yang sebenarnya dipotong.
- Material polos: potong `materials.stock_qty`, `material_color_id = null`.

> **Sebelum menulis RPC stok baru, selalu pakai pola ini.** Hasil pembacaan migration: `dispatch_cutting_materials` memakai `coalesce(mc.stock_qty, m.stock_qty, 0)`, jadi aman kalau `order_item_fabrics` menyimpan warna, tetapi item kain **tanpa** `material_color_id` untuk material yang punya varian akan terbaca dari stok induk. `process_defect_material_return` hanya membaca dan mengurangi `materials.stock_qty` sehingga **masih berisiko** untuk material berwarna (sleting/kancing).

---

## 4. Pengajuan restock (`stock_requests`)

### 4.1 Status dan kolom penting
`draft_auto` → `pending` → `approved` → `in_progress` → `fulfilled` (atau `rejected` / `cancelled`)

| Kolom | Catatan |
|---|---|
| `requested_by` | **Hanya staf role `Gudang`** (dijaga trigger `validate_stock_request_requester` + filter UI) |
| `fulfillment_type` | `spj` atau `supplier_purchase`. **Dipilih staf Gudang sejak pengajuan dibuat** (wajib). Finance boleh mengoreksi selama masih `pending`. |
| `estimated_price` | Estimasi harga pasar. Prefill dari harga master, boleh diedit. |
| `preferred_store` | Nama toko/supplier rekomendasi (opsional, hanya referensi untuk Purchasing). |
| `batch_id` | Menandai beberapa baris yang diajukan bersamaan. |
| `source_type` | `manual` atau `auto_order` (+ `source_order_id`, `source_order_item_id`) |
| `approved_by/at`, `rejected_reason`, `goods_received_at` | Jejak approval dan penerimaan |
| `unit` | Satuan pengajuan |

### 4.2 Pengajuan banyak item sekaligus (bulk)
*Status: disetujui.* Modal pengajuan diubah jadi multi-item: **header diisi sekali** (staf pemohon, jalur beli, catatan global) + **baris item dinamis** (material, warna kalau kain, qty, satuan, estimasi harga, catatan). RPC `create_bulk_stock_requests(p_items jsonb, p_requested_by, p_fulfillment_type, p_global_reason, p_batch_id)` menyisipkan semuanya **atomik** dengan status `pending`. Tambahan: pilih beberapa baris stok menipis di tab Stok Material lalu "Ajukan Restock" (modal terisi otomatis).

### 4.3 Edit pengajuan
RPC `update_pending_stock_request(...)`: edit material, warna, qty, jalur, alasan, estimasi harga. **Hanya boleh selama `pending`.** Setelah `approved`/`in_progress`, terkunci. Tombol Edit disembunyikan di UI.

### 4.4 Pengajuan otomatis dari order (khusus kain)
*Status: dirancang di v1, tidak diubah v2.*
- Saat order dibuat dan stok kain kurang (stok − reservasi `out` pending order lain), sistem membuat `stock_requests` berstatus **`draft_auto`** dengan qty = **selisih kekurangan**, bukan total kebutuhan.
- `draft_auto` **tidak langsung ke Purchasing**. Staf Gudang harus "Konfirmasi & Ajukan" (isi pemohon, boleh edit qty) → jadi `pending`, atau "Abaikan" (status `cancelled`, alasan wajib). Alasannya sistem tidak tahu konteks lapangan (stok retur, substitusi warna).
- Tahap ini baru mencakup **kain**, aksesoris belum.

### 4.5 Bulk approve dan bug supplier (sudah diperbaiki)
- `bulk_approve_stock_requests(p_request_ids uuid[], p_approved_by)` (migration `20260930000001`) mengubah `pending` menjadi `approved`. **Tidak memfilter `fulfillment_type`**: SPJ dan supplier sama-sama kena. Melempar error kalau tidak ada baris yang valid, mengembalikan jumlah baris.
- Bug lama: `approve_stock_request_supplier` hanya menerima `pending`/`draft_auto`, jadi request yang sudah di-bulk-approve tidak bisa lanjut. Diperbaiki di `20261003180001` dengan menambah `approved` ke whitelist.
- **Sisa masalah:** `approve_stock_request_spj` **tidak** ikut diperbaiki dan masih hanya menerima `pending`/`draft_auto`. Request SPJ yang sudah di-bulk-approve akan ditolak ("bukan berstatus pending"). Cek apakah UI menghindari bulk approve untuk jalur SPJ.

---

## 5. Dua jalur pembelian (versi final)

> Menggantikan alur di `DESAIN_FITUR_STAF_GUDANG_PURCHASING` yang menambah stok saat Finance approve. **Sekarang stok hanya naik saat Gudang konfirmasi terima.**

### 5.1 Jalur A — SPJ (belanja retail)

```
GUDANG ajukan (pending, jalur SPJ)
  └► FINANCE: approve + buat SPJ + cairkan uang muka (SATU AKSI)
        RPC approve_stock_request_spj(p_request_ids uuid[], p_purchasing_staff_id, p_advance_amount, p_notes)
        • cash_advances: outstanding + transaksi expense "Uang Muka Purchasing"
        • purchasing_reports: DISBURSED ("Sedang Belanja")
        • stock_requests: in_progress
  └► STAF PURCHASING belanja, isi item + foto nota, submit (submit_purchasing_report)
        • purchasing_reports: SUBMITTED
  └► FINANCE approve SPJ (approve_purchasing_report)
        • expense per kategori barang (aktual) + expense service_fee
        • income "Reversal Uang Muka", cash_advances: settled
        • stock_movements 'in' dibuat berstatus PENDING (stok BELUM naik)
        • purchasing_reports: FINANCIALLY_APPROVED
  └► STAF PURCHASING serahkan barang fisik ke Gudang
  └► GUDANG cek fisik, klik Konfirmasi Terima (confirm_purchasing_report_receipt)
        • movement pending → confirmed: stok naik + harga material terbaru ter-update
        • purchasing_reports: GOODS_RECEIVED, stock_requests: fulfilled
```

| Status `purchasing_reports` | Arti |
|---|---|
| `disbursed` | Uang muka cair, staf sedang belanja |
| `submitted` | Nota di-upload, menunggu verifikasi Finance |
| `financially_approved` | Nota disetujui, pembukuan selesai, menunggu barang diserahkan ke Gudang |
| `goods_received` | Gudang sudah terima dan cek fisik |
| `rejected` | Ditolak. Kalau uang sudah cair, uang muka **tetap `outstanding`** dan perlu tindak lanjut manual |

Tambahan: `reject_purchasing_report(report_id, reason)` (hanya dari `submitted`), `cancel_disbursed_report(report_id, reason)` (batal setelah uang cair sebelum submit; tidak otomatis mengembalikan uang).
Kolom baru: `purchasing_reports.received_by`, `received_at`.

### 5.2 Jalur B — Direct Supplier (supplier langganan)

```
GUDANG ajukan (pending, jalur Direct Supplier)
  └► FINANCE: approve + buat pembelian supplier + transfer lunas (SATU AKSI)
        RPC approve_stock_request_supplier(p_request_ids uuid[], p_requested_by, p_supplier_name, p_payment_date, p_items jsonb, p_notes)
        • supplier_purchases: ORDERED
        • transaksi expense per kategori (langsung, karena lunas di muka)
        • stock_requests: in_progress
  └► (opsional) Finance upload nota/bukti: upload_supplier_purchase_proof(...)
        — nota TIDAK menggerbang; kalau belum ada, Gudang tetap bisa terima, hanya muncul badge "Nota belum diupload"
  └► GUDANG terima barang fisik (receive_supplier_purchase)
        • stock_movements 'in' confirmed: stok naik + harga ter-update, supplier_purchases: RECEIVED, stock_requests: fulfilled
```
Kolom baru: `supplier_purchases.payment_proof_url`, `proof_uploaded_by`, `proof_uploaded_at`.

### 5.3 Perbandingan

| | SPJ | Direct Supplier |
|---|---|---|
| Uang keluar | Saat approve pengajuan (uang muka), dikoreksi saat nota diverifikasi | Saat approve pengajuan (lunas) |
| Tahap "sedang belanja" | Ada | Tidak ada |
| Siapa upload nota | Staf purchasing (wajib) | Finance (tidak wajib) |
| Stok naik | Konfirmasi Gudang setelah `financially_approved` | Konfirmasi Gudang saat barang tiba |
| Expense dicatat per | Kategori barang | Kategori barang |

**Kenapa dua jalur?** Sifat bisnisnya beda (retail: uang muka dulu, nota menyusul, jumlah tidak pasti; supplier: harga dan qty pasti, lunas dulu). Satu skema generik akan penuh kolom nullable.

### 5.4 Bulk di sisi Purchasing
Tab **"Pengajuan Gudang"**: daftar pengajuan dengan badge kategori, filter per kategori, aksi Approve/Reject (+alasan). Checkbox multi-select **hanya untuk satu kategori sekaligus** (centang pertama mengunci kategori lain). Tombol "Proses Terpilih sebagai 1 SPJ / 1 Pembelian Supplier" membuka modal dengan banyak baris terisi otomatis (`initialStockRequestIds: string[]`). Semua yang dicentang harus `approved`.

### 5.5 Detail implementasi yang berbeda dari rancangan
- `approve_stock_request_spj` menerima **banyak** `stock_request` sekaligus (array) dan membuat **satu** SPJ. Uang muka dan `cash_advances` hanya dibuat kalau `p_advance_amount > 0`; kalau 0, `cash_advance_id` kosong.
- Item SPJ dibuat sebagai placeholder (`unit_price = 0`, `total_price = 0`) dan diisi staf saat submit.
- `approved_by` pada `stock_requests` diisi dengan **id staf purchasing** yang ditunjuk, bukan orang Finance yang menekan tombol. Perhatikan kalau butuh audit "siapa yang approve".
- `approve_purchasing_report` hanya membuat movement `in` berstatus `pending` untuk item **bukan variabel**. Saat Gudang konfirmasi, semua movement `pending` laporan itu **dihapus lalu dibuat ulang** sebagai `confirmed` dengan jumlah aktual.
- Data lama dimigrasi: status SPJ `draft` menjadi `disbursed`, `approved` menjadi `goods_received`.
- Tersedia juga `update_stock_request_fulfillment_type(request, tipe)` untuk koreksi jalur beli selama `pending`/`draft_auto`.

---

## 6. Barang keluar dari gudang

*Diverifikasi terhadap `src/pages/WarehousePage.tsx` (route `/gudang`, judul "Gudang & Inventori"). Lima tab: **Stok Material, Barang Keluar, Permintaan Restock, Terima Barang, Riwayat Mutasi**. "Terima Barang" adalah tempat Gudang menjalankan `confirm_purchasing_report_receipt`/`receive_supplier_purchase` (lihat §5).*


### 6.1 Tiga jenis pengeluaran (sub-tab "Barang Keluar" di `/gudang`)

| Sub-tab | Untuk | Dasar | Aturan |
|---|---|---|---|
| **Kain Potong** | Tukang potong | Per penugasan potong (`cutting_assignments`) | Gudang serahkan → set `material_dispatched_at` → baru boleh "Tandai Selesai Potong". RPC `dispatch_cutting_materials`. |
| **Bahan Jahit (Worklog)** | Penjahit | Per bundel jahit (`sewing_assignments`): `assigned_qty × BOM per pcs` | Hanya **Direct BOM non-floor-stock**: sleting, furing, woven label, rib, tali kerut, velcro. RPC `dispatch_sewing_materials`. Set `material_dispatched_at`. |
| **Floor Stock** | Penjahit atau staf finishing | Form cepat, per kemasan utuh (1 cone, 1 pack) | Wajib isi `taken_by` dan `recorded_by`. Sisa benang tetap jadi stok meja kerja penjahit. |

### 6.2 Aturan keras
1. **Tidak ada serah parsial.** Kalau satu bahan Direct BOM kurang, seluruh serah terima diblokir dengan pesan "Stok bahan X tidak mencukupi. Ajukan restock terlebih dahulu." Tombol serah di-disable dan ada pintasan "Ajukan Restock Gudang". (Menggantikan `window.confirm("Tetap lanjutkan?")` yang dulu bisa menembus stok minus.)
2. **Kancing bukan bahan penjahit.** Pemasangan kancing dilakukan di Finishing, jadi kancing dan benang adalah floor stock.
3. **Order baru tidak lagi membuat `stock_movements` gelondongan** untuk aksesoris dan kancing. Pengeluaran aksesoris dibuat **per bundel jahit** saat penugasan dibagikan. Kain tetap tercatat sebagai kebutuhan order.
4. **Produk tanpa BOM direct non-floor-stock** melewati gate bahan (tidak perlu serah bahan).

### 6.3 Gate check (kolom `material_dispatched_at`)
- `sewing_assignments.material_dispatched_at` dan `cutting_assignments.material_dispatched_at` (+ `dispatch_notes`). `NULL` = bahan belum keluar.
- `start_sewing_assignment(id, p_force, p_force_reason)`: tolak kalau perlu bahan tapi belum diserahkan. **Supervisor override** dengan `p_force = true` + alasan wajib; alasan dicatat di `notes` sebagai `[PAKSA MULAI: ...]`.
- `start_all_sewing_assignments(p_staff_id, p_force)`: **melewati** yang belum dispatch dan mengembalikan jumlah `started`/`skipped`.
- `mark_cutting_item_done`: tolak kalau `material_dispatched_at` kosong dan item punya kain di `order_item_fabrics` (juga ada opsi paksa selesai oleh supervisor).
- Alasan memilih kolom gate + override (bukan hard block murni atau soft warning UI): hard block terlalu kaku saat gudang berhalangan, soft warning tidak melindungi di level DB.
- Detail UI badge dan tombol ada di 03 §3 dan §4.

### 6.4 Riwayat
`StockHistoryTab` menampilkan kolom "Diambil oleh" untuk movement `out`, berguna untuk audit selisih stok.

---

## 7. Retur material cacat

*Status: disetujui.*

Alur lapangan: penjahit menemukan aksesoris cacat (sleting macet, label cacat) → bawa ke loket Gudang → **staf Gudang** yang input.

- Modal "Terima Barang Rusak": penjahit, order terkait (opsional), material, jumlah, alasan wajib.
- RPC `process_defect_material_return(...)`:
  - **Stok pengganti ada:** catat `stock_movements` `out` (`order_consumption`, `taken_by` penjahit), kurangi `stock_qty`, tambah `scrap_qty`, `is_replaced = true`.
  - **Stok habis:** hanya tambah `scrap_qty`, lalu **otomatis buat `stock_requests` darurat** (`pending`, jalur SPJ) sebesar kekurangan, `is_replaced = false`.
- Barang cacat **langsung dianggap susut/afkir** (`disposition = 'scrap'`). Tidak ada penagihan balik ke supplier.
- Tabel `material_defect_returns`. **Wajib masuk `clear.sql`** (di antara `sewing_assignments` dan `qc_checks`).
- Catatan: RPC ini hanya memotong `materials.stock_qty` — lihat peringatan material berwarna di §3.2.

---

## 7a. Kode mati yang perlu dibersihkan
*Diverifikasi di source: `src/hooks/usePurchaseReceipts.ts` memanggil RPC `pay_purchase_receipt`, yang **sudah dihapus dari database** sejak reset baseline (lihat `DATABASE.md`, "Yang sengaja tidak dibawa"). Hook ini **tidak diimpor di mana pun** (dicek dengan `grep` ke seluruh `src/`), jadi tidak aktif dipakai — tapi kalau ada yang mengimpornya nanti, akan error di runtime karena function-nya tidak ada. Hapus file ini dan rapikan referensi `purchase_receipts`/`purchase_receipt_items` di `src/types` kalau masih ada.*

## 8. Daftar cepat: RPC di file ini

| RPC | Fungsi |
|---|---|
| `confirm_stock_movement` / `cancel_stock_movement` | Efektifkan / batalkan movement pending |
| `create_bulk_stock_requests` | Ajukan banyak item atomik |
| `bulk_approve_stock_requests` | Approve banyak pengajuan `pending` sekaligus (semua jalur) |
| `update_stock_request_fulfillment_type` | Koreksi jalur beli saat `pending`/`draft_auto` |
| `update_pending_stock_request` | Edit pengajuan (hanya `pending`) |
| `approve_stock_request` / `reject_stock_request` | Approve/reject (rancangan v1) |
| `approve_stock_request_spj` | Approve (banyak pengajuan) + buat 1 SPJ + cairkan uang muka. Hanya status `pending`/`draft_auto` |
| `submit_purchasing_report` | Staf purchasing submit SPJ |
| `approve_purchasing_report` | Finance verifikasi nota (**tanpa** menambah stok) |
| `reject_purchasing_report` / `cancel_disbursed_report` | Tolak / batal |
| `confirm_purchasing_report_receipt` | Gudang terima barang SPJ (stok naik). Parameter ke-3 `p_base_quantities` untuk satuan variabel |
| `approve_stock_request_supplier` | Approve (banyak pengajuan) + buat pembelian supplier (terima `pending`/`draft_auto`/`approved`) |
| `upload_supplier_purchase_proof` | Upload nota supplier (opsional) |
| `receive_supplier_purchase` | Gudang terima barang supplier (stok naik). Parameter ke-3 `p_base_quantities` untuk satuan variabel |
| `give_cash_advance` | Uang muka ke staf (+ expense) |
| `dispatch_cutting_materials` | Serah kain ke tukang potong |
| `dispatch_sewing_materials` | Serah bahan jahit per bundel |
| `check_sewing_material_stock` / `check_cutting_material_stock` | Preview kecukupan stok |
| `start_sewing_assignment` / `start_all_sewing_assignments` | Mulai jahit dengan gate |
| `process_defect_material_return` | Retur cacat + penggantian |

**Trigger:** `validate_stock_request_requester` (pemohon harus role Gudang).
**Komponen mati yang disebut untuk dibersihkan:** `ReceiveGoodsModal.tsx`, `UnpaidReceiptsTab.tsx` (sisa tabel `purchase_receipts` yang sudah dihapus); `PendingRequestsTab.tsx` didaur ulang jadi tab Barang Keluar.
