# Rancangan Perbaikan Flow Gudang & Purchasing (v2)

Versi ini merevisi bagian **Flow 1 (Approval Pembelanjaan)** dan **Bulk SPJ** dari dokumen sebelumnya. Perubahan inti: **kategori pembelian (SPJ / Direct Supplier) dipilih staf Gudang di saat pengajuan dibuat**, bukan ditentukan belakangan oleh Purchasing. Finance tinggal me-review lalu klik Approve, yang otomatis mengarahkan ke modal yang sesuai. Flow 2 (pengajuan otomatis dari order) dan Flow 3 (barang keluar) tidak berubah — tetap seperti dokumen sebelumnya.

---

## 1. Alur Target

```
STAF GUDANG                        FINANCE / PURCHASING
─────────────                      ──────────────────────
1. Ajukan restock
   - pilih material/warna/qty
   - PILIH KATEGORI PEMBELIAN:
       ○ SPJ Belanja (staf belanja retail)
       ○ Direct Supplier (supplier langganan)
   → status: pending
                              →    2. Review pengajuan (list difilter per kategori)
                                      - Approve → buka modal sesuai kategori:
                                          • SPJ           → "Buat Laporan SPJ Belanja"
                                          • Direct Supplier → "Buat Pembelian Direct Supplier"
                                      - Reject (+alasan) → selesai, tidak lanjut

3. Barang datang secara fisik → staf Gudang konfirmasi terima (lihat dokumen v1 §2 untuk detail
   penerimaan per kategori — bagian ini tidak berubah).
```

Poin kunci: **kategori pembelian sudah terkunci sejak pengajuan**, jadi Finance tidak perlu memutuskan "mau dibeli lewat mana" — dia tinggal menilai apakah pengajuannya wajar (Approve/Reject), lalu sistem langsung menyodorkan modal yang tepat.

---

## 2. Perubahan Skema `stock_requests`

```sql
alter table public.stock_requests
  add column if not exists fulfillment_type varchar not null default 'spj'
    check (fulfillment_type in ('spj', 'supplier_purchase'));

comment on column public.stock_requests.fulfillment_type
  is 'Kategori pembelian yang DIPILIH STAF GUDANG saat pengajuan dibuat: spj (belanja retail via staf) atau supplier_purchase (supplier langganan). Menentukan modal apa yang dibuka Purchasing saat approve.';

alter table public.stock_requests
  drop constraint if exists stock_requests_status_check;
alter table public.stock_requests
  add constraint stock_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'in_progress', 'fulfilled', 'cancelled'));

alter table public.stock_requests
  add column if not exists approved_by     uuid references public.staff(id),
  add column if not exists approved_at     timestamptz,
  add column if not exists rejected_reason text;
```

> Catatan: kolom `fulfillment_type` sebelumnya di desain lama diisi **belakangan** (saat request "diambil" masuk SPJ/Supplier Purchase). Sekarang kolom ini wajib diisi **sejak insert pertama** oleh staf Gudang, jadi tidak lagi nullable dan tidak lagi diubah di tahap approval.

---

## 3. Perubahan UI — Sisi Gudang (`StockRequestModal.tsx`)

Tambahkan field wajib di form pengajuan:

- **"Kategori Pembelian"** — pilihan radio/segmented, wajib dipilih sebelum submit:
  - `SPJ Belanja` — dipakai kalau butuh dibeli retail/dadakan oleh staf purchasing (toko/pasar), nota menyusul.
  - `Direct Supplier` — dipakai kalau ke supplier langganan tetap (harga & qty sudah pasti, lunas di muka).
- Beri deskripsi singkat di bawah tiap opsi supaya staf Gudang yang bukan orang keuangan tetap paham bedanya (misal: "Pilih ini kalau belanja dadakan di toko/pasar" vs "Pilih ini kalau ke supplier langganan kita").
- Field ini **tidak bisa diubah lagi** setelah pengajuan dibuat kecuali oleh Finance saat masih status `pending` (lihat §4), untuk mengantisipasi salah pilih.

---

## 4. Perubahan UI — Sisi Finance/Purchasing (tab baru "Pengajuan Gudang")

- Daftar pengajuan `pending` ditampilkan dengan **badge kategori** (SPJ / Direct Supplier), dan bisa difilter per kategori.
- Finance boleh **mengoreksi kategori** sebelum approve kalau ternyata staf Gudang salah pilih (edit `fulfillment_type` selama status masih `pending`).
- Tombol aksi per baris:
  - **Approve** → langsung membuka modal sesuai `fulfillment_type`:
    - `spj` → `PurchasingReportModal` ("Buat Laporan SPJ Belanja"), prefill 1 baris dari data pengajuan.
    - `supplier_purchase` → `SupplierPurchaseModal` ("Buat Pembelian Direct Supplier"), prefill 1 baris dari data pengajuan.
  - **Reject** (+alasan wajib) → status `rejected`, selesai.
- RPC `approve_stock_request(request_id, approved_by)` tetap seperti desain v1 (set status `approved`), dipanggil **saat modal dibuka**, bukan setelah laporan/pembelian selesai disimpan — supaya begitu Finance klik Approve, status pengajuan langsung berubah walau dia belum menyelesaikan pengisian modal.

---

## 5. Bulk — Hanya Dalam Kategori yang Sama

Karena kategori sudah terkunci sejak pengajuan, aturan bulk jadi sederhana:

- Checkbox multi-select **hanya bisa mencentang pengajuan dengan `fulfillment_type` yang sama**. Kalau staf mencoba mencentang campuran SPJ + Direct Supplier, checkbox kategori lain otomatis di-disable begitu centang pertama dipilih (atau tampilkan pesan "Hanya bisa memproses satu kategori pembelian sekaligus").
- Tombol aksi menyesuaikan kategori yang sedang dicentang:
  - Semua tercentang `spj` → tombol **"Proses Terpilih sebagai 1 Laporan SPJ"** → buka `PurchasingReportModal` dengan banyak baris sekaligus (`initialStockRequestIds: string[]`).
  - Semua tercentang `supplier_purchase` → tombol **"Proses Terpilih sebagai 1 Pembelian Supplier"** → buka `SupplierPurchaseModal` dengan banyak baris sekaligus.
- Semua pengajuan yang dicentang bersama wajib berstatus `approved` sebelum diproses bulk (approve dulu satu-satu atau sediakan tombol "Approve Semua yang Dicentang" sebagai shortcut, baru muncul tombol proses bulk).

---

## 6. Ringkasan Perubahan (vs dokumen v1)

| Hal | v1 (lama) | v2 (revisi ini) |
|---|---|---|
| Kapan `fulfillment_type` diisi | Belakangan, saat request "diambil" masuk SPJ/Supplier Purchase | **Di awal**, wajib dipilih staf Gudang saat submit pengajuan |
| Siapa yang tentukan jalur beli | Purchasing (implisit, lewat modal mana yang dibuka) | **Staf Gudang** — Purchasing tinggal approve & eksekusi |
| Modal yang dibuka Finance | Manual pilih SPJ atau Supplier Purchase | **Otomatis** sesuai `fulfillment_type` begitu klik Approve |
| Aturan bulk | Bebas campur, asal semua `approved` | Bebas campur **tapi dalam satu kategori** — SPJ tidak boleh digabung dengan Direct Supplier dalam satu aksi bulk |

Bagian lain (Flow 2: pengajuan otomatis dari order kain, Flow 3: barang keluar & pencatatan pengambil, pembatasan pemohon hanya role Gudang) **tidak berubah** dari dokumen sebelumnya.
