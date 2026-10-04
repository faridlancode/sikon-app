# Rancangan Flow Approval SPJ & Direct Supplier

Dokumen ini merinci ulang alur **SPJ Belanja** dan **Direct Supplier** dari sisi pencairan uang, approval finance, sampai penerimaan barang. Perubahan paling penting: **stok HANYA bertambah saat staf Gudang menerima barang secara fisik**, tidak lagi ikut bertambah otomatis saat Finance approve laporan/pembelian. Dokumen ini melengkapi (bukan menggantikan) `RANCANGAN_PERBAIKAN_FLOW_GUDANG_v2.md` — kategori pembelian (`fulfillment_type`) tetap dipilih staf Gudang saat pengajuan.

---

## 1. Flow SPJ — Tahapan Lengkap

```
STAF GUDANG        FINANCE                         STAF PURCHASING           STAF GUDANG
─────────────      ────────────────────────────    ──────────────────────    ──────────────
1. Ajukan restock
   kategori: SPJ
   status: pending
                 →  2. Approve pengajuan
                       = "Buat SPJ" dalam 1 aksi:
                       - tentukan staf purchasing
                         yg akan belanja
                       - tentukan nominal uang muka
                       - cair ke staf (transaksi
                         pengeluaran "Uang Muka
                         Purchasing")
                       → cash_advances: outstanding
                       → purchasing_reports: DISBURSED
                         ("Sedang Belanja")
                       → stock_requests: in_progress
                                                →   3. Belanja di lapangan,
                                                       kembali bawa nota
                                                →   4. Isi rincian barang +
                                                       upload foto nota,
                                                       lalu Submit
                                                       → purchasing_reports:
                                                         SUBMITTED
                 →  5. Approve SPJ + verifikasi nota
                       - catat expense per kategori
                         (belanja aktual)
                       - catat expense service fee
                       - reversal uang muka (income,
                         settle cash_advance)
                       - TIDAK menambah stok di sini
                       → purchasing_reports:
                         FINANCIALLY_APPROVED
                       → stock_movements (in): dibuat
                         berstatus PENDING, menunggu
                         diserahkan ke Gudang
                                                →   6. Serahkan barang
                                                       fisik ke Gudang
                                                                              7. Terima & cek fisik
                                                                                 barang, klik Konfirmasi
                                                                                 → stock_movements:
                                                                                   confirmed (stok +)
                                                                                 → purchasing_reports:
                                                                                   GOODS_RECEIVED
                                                                                 → stock_requests: fulfilled
```

### Status `purchasing_reports` (revisi)

| Status | Arti | Dipicu oleh | Efek keuangan | Efek stok |
|---|---|---|---|---|
| `disbursed` | Uang muka sudah cair, staf sedang belanja (dulu disebut "draft") | Finance approve pengajuan Gudang | Expense "Uang Muka Purchasing" (nominal penuh) | – |
| `submitted` | Staf sudah belanja, nota di-upload, menunggu verifikasi Finance | Staf purchasing submit laporan | – | – |
| `financially_approved` | Finance sudah cek & setujui nota; pembukuan closed | Finance approve SPJ | Expense per kategori (aktual) + service fee + reversal uang muka (income) | Movement `in` dibuat **pending** |
| `goods_received` | Barang sudah diterima & dicek fisik oleh Gudang | Staf Gudang konfirmasi terima | – | Stok bertambah (movement `in` → confirmed) |
| `rejected` | Pengajuan ditolak Finance sebelum uang cair, ATAU nota ditolak setelah submit | Finance | Kalau ditolak setelah uang sudah cair: uang muka **tetap outstanding**, perlu tindak lanjut manual (staf kembalikan uang / ganti dengan SPJ baru) | – |

### Perubahan Skema

```sql
alter table public.purchasing_reports
  drop constraint if exists purchasing_reports_status_check;
alter table public.purchasing_reports
  add constraint purchasing_reports_status_check
    check (status in ('disbursed', 'submitted', 'financially_approved', 'goods_received', 'rejected'));

alter table public.purchasing_reports
  add column if not exists received_by uuid references public.staff(id), -- staf Gudang yg konfirmasi terima
  add column if not exists received_at timestamptz;

alter table public.stock_requests
  add column if not exists purchasing_report_id uuid references public.purchasing_reports(id); -- kalau belum ada
```

> `purchasing_reports.status` lama (`draft/submitted/approved/rejected`) diganti penamaan agar mencerminkan tahap sesungguhnya. Kalau ingin migrasi bertahap tanpa breaking existing data: `draft→disbursed`, `approved→financially_approved` (lalu tambah `goods_received` sebagai status baru setelahnya).

### RPC (revisi & baru)

**`approve_stock_request_spj(p_request_id, p_purchasing_staff_id, p_advance_amount)`** — gabungan "Finance approve pengajuan" + "Buat SPJ" + "cairkan uang muka" dalam **satu aksi**:
1. Validasi `stock_requests` berstatus `pending` & `fulfillment_type = 'spj'`.
2. Insert `cash_advances` (staff_id = staf purchasing, amount = nominal, status `outstanding`) + `transactions` (expense, "Uang Muka Purchasing").
3. Insert `purchasing_reports` (status `disbursed`, `cash_advance_id`, `staff_id`).
4. Update `stock_requests`: `status = 'in_progress'`, `approved_by`, `approved_at`, `purchasing_report_id = <baru>`.

**`submit_purchasing_report(report_id, items[])`** (staf purchasing) — tetap seperti sekarang, isi `purchasing_report_items` (dengan `receipt_photo_url`) → status `submitted`.

**`approve_purchasing_report(report_id)`** (Finance) — **direvisi**, hapus bagian tambah stok:
1. Hitung `total_amount` dari SUM item.
2. Insert `transactions` expense per kategori (belanja aktual) + expense `service_fee` (kalau ada).
3. Insert `transactions` income "Reversal Uang Muka" + set `cash_advances.status = 'settled'`.
4. Insert `stock_movements` (`in`, `source_type = 'purchasing_report'`, **`status = 'pending'`** — bukan `confirmed`) untuk tiap item.
5. Update `purchasing_reports.status = 'financially_approved'`.
6. **Tidak lagi** memanggil update `stock_qty`/harga material di sini.

**`confirm_purchasing_report_receipt(report_id, p_received_by)`** (baru, dipanggil staf Gudang):
1. Validasi `purchasing_reports.status = 'financially_approved'`.
2. Untuk tiap `stock_movements` pending yang tertaut (`source_type='purchasing_report'`, `source_id=report_id`): jalankan logika `confirm_stock_movement` (update `stock_qty`, update harga terbaru material).
3. Update `purchasing_reports.status = 'goods_received'`, `received_by`, `received_at = now()`.
4. Update `stock_requests.status = 'fulfilled'`, `goods_received_at = now()`.

**`reject_purchasing_report(report_id, reason)`** — tetap seperti sekarang (hanya bisa dari `submitted`). Kalau butuh membatalkan SETELAH uang sudah cair tapi SEBELUM staf sempat submit (mis. staf batal pergi belanja), sediakan RPC tambahan `cancel_disbursed_report(report_id, reason)` yang: set `purchasing_reports.status='rejected'`, catat alasan, dan **tidak otomatis** mengembalikan uang muka (perlu proses manual/pengembalian tunai dicatat lewat transaksi income terpisah oleh Finance).

### Perubahan UI

- **Purchasing → tab "Pengajuan Gudang"**, baris kategori SPJ: tombol **Approve** membuka modal baru **"Buat SPJ — Cairkan Uang Muka"** berisi: pilih staf purchasing, nominal uang muka, tombol "Cairkan" → memanggil `approve_stock_request_spj`.
- **Purchasing → tab SPJ**, filter status baru: `Sedang Belanja` (disbursed), `Menunggu Verifikasi` (submitted), `Sudah Disetujui — Menunggu Diserahkan ke Gudang` (financially_approved), `Barang Diterima` (goods_received).
- **Warehouse → tab "Terima Barang"**, sub-bagian baru **"Dari SPJ"**: daftar `purchasing_reports` berstatus `financially_approved`, tombol **Konfirmasi Terima** (pilih siapa staf Gudang yang menerima) → `confirm_purchasing_report_receipt`.

---

## 2. Flow Direct Supplier — Tahapan Lengkap

```
STAF GUDANG              FINANCE                         STAF GUDANG
─────────────             ───────────────────────────    ──────────────────
1. Ajukan restock
   kategori: Direct
   Supplier
   status: pending
                      →   2. Approve pengajuan
                            = "Buat Pembelian Supplier"
                            dalam 1 aksi:
                            - isi nama supplier,
                              rincian barang & harga
                            - transfer langsung ke
                              supplier (transaksi
                              pengeluaran, LUNAS)
                            → supplier_purchases:
                              ORDERED
                            → stock_requests: in_progress
                                                     →    3. Kabari supplier
                                                            (order sudah
                                                            dibayar, minta
                                                            kirim barang)
                                                            [langkah operasional,
                                                            opsional dicatat]
                      →   4. Terima nota/bukti
                            pengiriman dari supplier,
                            upload ke sistem
                            → supplier_purchases:
                              payment_proof_url terisi
                                                     →    5. Terima barang fisik,
                                                            klik Konfirmasi
                                                            → stock_movements: confirmed
                                                              (stok +)
                                                            → supplier_purchases: RECEIVED
                                                            → stock_requests: fulfilled
```

### Status `supplier_purchases` (revisi — tambah 1 kolom, status tetap 2 nilai)

Tidak perlu status baru karena alur `ordered → received` yang sudah ada **sudah pas** dengan kebutuhan ini (bayar lunas di muka saat `ordered`, stok baru bertambah saat `received` oleh Gudang — ini **tidak berubah** dari desain lama). Yang ditambahkan hanya bukti dokumen:

```sql
alter table public.supplier_purchases
  add column if not exists payment_proof_url text,   -- nota/bukti transfer & pengiriman dari supplier
  add column if not exists proof_uploaded_by uuid references public.staff(id),
  add column if not exists proof_uploaded_at timestamptz;
```

> Nota **tidak** menggerbang (tidak wajib ada dulu sebelum barang boleh diterima) — kalau nota belum sempat diupload tapi barang sudah datang, staf Gudang tetap bisa klik "Terima Barang" seperti biasa. Sistem hanya menampilkan badge peringatan "Nota belum diupload" di baris terkait supaya Finance ingat melengkapi dokumen menyusul. Ini supaya operasional gudang tidak terhambat administrasi.

### RPC (revisi & baru)

**`approve_stock_request_supplier(p_request_id, p_supplier_name, p_payment_date, p_items[])`** — gabungan "Finance approve pengajuan" + "Buat Pembelian Supplier" + "transfer langsung":
1. Validasi `stock_requests` berstatus `pending` & `fulfillment_type = 'supplier_purchase'`.
2. Insert `supplier_purchases` (status `ordered`) + `supplier_purchase_items` + `transactions` expense per kategori (sama seperti `create_supplier_purchase` sekarang).
3. Update `stock_requests`: `status = 'in_progress'`, `approved_by`, `approved_at`, `supplier_purchase_id = <baru>`.

**`upload_supplier_purchase_proof(purchase_id, proof_url, uploaded_by)`** (baru) — sekadar update 3 kolom baru di atas, dipanggil Finance kapan saja setelah nota diterima.

**`receive_supplier_purchase(purchase_id)`** — **tidak berubah** dari desain lama: insert `stock_movements` (`in`, `confirmed`) langsung, update `stock_qty` & harga, fulfill `stock_request`, set status `received`. Karena di alur ini memang sudah tidak ada tahap "menunggu verifikasi Finance" di antara pengiriman barang dan penerimaan Gudang — begitu barang difisik-cek Gudang, langsung selesai.

### Perubahan UI

- **Purchasing → tab "Pengajuan Gudang"**, baris kategori Direct Supplier: tombol **Approve** membuka modal **"Buat Pembelian Direct Supplier"** (form sama seperti `SupplierPurchaseModal` sekarang, hanya sumbernya dari approve pengajuan, bukan tombol "+ Baru" bebas).
- **Purchasing → tab Supplier Purchase**: tambah tombol kecil **"Upload Nota"** per baris `ordered` yang belum ada `payment_proof_url`.
- **Warehouse → tab "Terima Barang"** (bagian "Dari Supplier", sudah ada): tampilkan badge "Nota belum diupload" kalau `payment_proof_url` kosong, tapi tombol Terima tetap aktif.

---

## 3. Perbandingan Singkat SPJ vs Direct Supplier

| | SPJ | Direct Supplier |
|---|---|---|
| Uang keluar kapan | Saat Finance approve pengajuan (uang muka), lalu disesuaikan (reversal) saat nota diverifikasi | Saat Finance approve pengajuan (langsung transfer lunas ke supplier) |
| Ada tahap "sedang belanja" | Ya — staf purchasing pegang uang & pergi belanja dulu | Tidak — barang otomatis dipesan begitu dibayar |
| Siapa yang upload nota | Staf purchasing (saat submit laporan), diverifikasi Finance | Finance (saat nota dari supplier diterima), tidak menggerbang |
| Titik penambahan stok | **Konfirmasi Gudang** setelah Finance selesai verifikasi nota (`financially_approved → goods_received`) | **Konfirmasi Gudang** langsung saat barang fisik tiba (`ordered → received`), tidak menunggu apapun dari Finance |
| RPC approval utama | `approve_stock_request_spj` → `submit_purchasing_report` → `approve_purchasing_report` → `confirm_purchasing_report_receipt` | `approve_stock_request_supplier` → (opsional `upload_supplier_purchase_proof`) → `receive_supplier_purchase` |

---

## 4. Ringkasan Perubahan dari Dokumen Sebelumnya

- **Stok tidak lagi bertambah otomatis saat `approve_purchasing_report`** — dipisah ke RPC baru `confirm_purchasing_report_receipt` yang dijalankan staf Gudang. Ini mengganti catatan "opsional, perlu dikonfirmasi ke pemilik bisnis" di dokumen v1 — sekarang **dipastikan** dipisah sesuai arahan.
- **Aksi "Finance approve pengajuan Gudang" digabung dengan "membuat SPJ/Pembelian Supplier"** menjadi satu klik (`approve_stock_request_spj` / `approve_stock_request_supplier`), bukan dua aksi terpisah seperti dirancang sebelumnya (approve dulu, baru buka modal SPJ/Supplier secara manual).
- **Tahap "sedang belanja" (`disbursed`)** ditambahkan secara eksplisit di status `purchasing_reports`, mewakili jeda waktu antara uang dicairkan dan staf kembali dengan nota.
- **Direct Supplier tidak berubah dari segi titik penambahan stok** (sudah benar sejak awal — staf Gudang yang menerima), hanya ditambah kolom bukti nota administratif yang tidak menggerbang proses.
