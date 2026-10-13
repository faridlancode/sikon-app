# Rancangan: Dokumen Order (Surat Penawaran, Invoice, Kwitansi, Nota)

- Tanggal: 2026-10-12 (diperbarui 2026-10-13)
- Status: **Draft - belum disetujui, jangan kerjakan implementasi**
- Domain pemilik: **ORDER** (baca bersama `docs/ORDER_DAN_KEUANGAN.md`)
- File ini hanya berisi rancangan dan catatan implementasi. Tidak ada kode yang boleh ditulis sebelum pemilik menyetujui setiap fase.

---

## 0. Konteks Bisnis

Alur lengkap dari awal hingga kirim:

```
[Negosiasi]
  Surat Penawaran   --> belum jadi order
  (pelanggan setuju)
  Invoice Proforma  --> belum jadi order
  (pelanggan bayar DP)
  ORDER MASUK       --> DP tercatat, production_status = pending
                    --> Kwitansi DP otomatis dibuat (trigger)
  (produksi berjalan, milestone selesai)
  (pelunasan)
  Invoice Pelunasan --> Kwitansi Pelunasan (otomatis, trigger) --> Nota
  (kirim)
  Order selesai     --> production_status = completed
```

**Poin kunci dari pemilik:**
- Surat Penawaran dan Invoice pra-DP **tidak terikat ke order** (order belum ada).
- Order baru dibuat setelah DP masuk.
- Kwitansi dibuat **otomatis via trigger** setiap kali pembayaran dicatat.
- Nota adalah ringkasan transaksi akhir setelah lunas.

---

## 0.1 Kenapa Perlu Tabel Terpisah? (Bukan Hanya Mengacu ke orders + order_items)

Pertanyaan yang valid. Jawabannya ada tiga alasan mendasar:

**Alasan 1: Surat Penawaran Belum Punya Order**

Quotation dibuat sebelum order ada. Tidak ada `order_id` yang bisa dirujuk. Kalau tidak ada
tabel `quotations` sendiri, data penawaran ini tidak ada tempat tinggalnya di database.

**Alasan 2: Snapshot Legal (Immutable Audit Trail)**

Data di `orders` bersifat dinamis -- bisa diedit sebelum produksi final. Dokumen komersial
yang sudah diterbitkan ke pelanggan memiliki nilai legal. Contoh nyata:

```
Senin: Invoice dicetak --> harga Kemeja Rp 85.000, qty 100 --> Total Rp 8.500.000
Rabu:  Sales edit order --> harga Kemeja diubah Rp 90.000 (harga bahan naik)
Kamis: Pelanggan complain "di invoice saya Rp 8.500.000 tapi ditagih Rp 9.000.000?"
```

Kalau invoice hanya generate on-the-fly dari `order_items`, angkanya berubah setiap dibuka.
Tabel `invoices` menyimpan snapshot pada saat dokumen diterbitkan -- tidak berubah walau
order diubah kemudian.

**Alasan 3: Satu Order Bisa Punya Banyak Dokumen dengan Status Independen**

```
Order ORD-0044
  |- Invoice INV-202610-0001  (status: sent, tagihan DP)
  |- Invoice INV-202610-0008  (status: paid, tagihan pelunasan)
  |- Kwitansi KWT-202610-0003  (bukti DP 50% -- dibuat otomatis)
  |- Kwitansi KWT-202610-0011  (bukti pelunasan -- dibuat otomatis)
  |- Nota NTA-202610-0002      (ringkasan akhir)
```

Tidak mungkin merepresentasikan state berbeda di waktu berbeda, atau nomor dokumen unik
per kejadian, kalau semua hanya mengacu live ke `order_items`.

---

## 0.2 Keputusan Pemilik (Semua Terjawab)

| # | Pertanyaan | Jawaban | Implikasi Desain |
|---|-----------|---------|------------------|
| 1 | HPP di Surat Penawaran? | **Cukup harga jual saja** | Tidak ada kolom HPP di `quotation_items`. Form tidak ada field HPP. |
| 2 | Kwitansi: otomatis atau on-demand? | **Otomatis** via trigger | Trigger `trg_auto_create_receipt` AFTER INSERT pada `order_payments`. Trigger `trg_delete_receipt_on_payment` AFTER DELETE. |
| 3 | Opsi TTD/cap saat cetak? | **3 mode:** kosong / TTD saja / TTD+cap | PrintOptionsPanel di frontend. Tidak ada perubahan database. Gambar dari `company_settings`. |
| 4 | Kirim dokumen ke pelanggan? | **Cukup cetak/unduh PDF** | Tidak perlu integrasi WhatsApp/email. |
| 5 | Halaman arsip /receipts dan /notas? | **Cukup dari modal detail order** | Tidak buat halaman tersendiri. |
| 6 | Edit Surat Penawaran setelah sent? | **Bisa diedit** (tanpa versioning) | Status `sent` tidak mengunci form edit. |
| 7 | Reset penomoran? | **Per bulan** | Format `PREFIX-YYYYMM-NNNN`, counter reset tiap `year_month` baru. |

---

## 1. Empat Jenis Dokumen

### 1.1 Surat Penawaran (Quotation)

**Kapan:** Sebelum DP, bahkan sebelum order dibuat. Sales butuh ini untuk negosiasi.

**Isi (berdasarkan contoh di docs/PDF):**

| Bagian | Detail |
|--------|--------|
| Header | Logo perusahaan, nama perusahaan, alamat, no. telepon |
| Nomor Dokumen | PNW-YYYYMM-NNNN (otomatis, per bulan) |
| Tanggal | Tanggal penawaran |
| Berlaku Hingga | Tanggal kedaluwarsa penawaran (default: +14 hari) |
| Kepada | Nama pelanggan, nama perusahaan pelanggan (opsional), alamat (opsional) |
| Dari | Nama sales |
| Tabel Item | Nama produk, spesifikasi detail (lihat 1.1.1), qty, harga satuan, subtotal |
| Syarat Pembayaran | DP %, tempo, rekening bank tujuan |
| Estimasi Waktu | Lead time produksi |
| Catatan | Catatan bebas |
| Area TTD | Kolom TTD + cap perusahaan (kanan), kolom persetujuan pelanggan (kiri) |

**1.1.1 Kolom Spesifikasi pada Baris Item Penawaran:**

Setiap baris item bisa punya:
- **Nama Produk** - misal: Kemeja, Seragam Batik, Jaket
- **Jenis Kain / Bahan** - misal: Katun Combed 30s, Polyester, Drill
- **Warna Kain** - bisa multi-warna jika ada pilihan
- **Detail Jahitan** - misal: Jahit satu jarum, Jahit obras, Jahit kelim
- **Detail Bordir** - ada/tidak, lokasi (dada kiri, punggung, lengan), estimasi biaya
- **Sablon/Print** - ada/tidak, jenis (DTF, Screen, Sublim)
- **Ukuran / Breakdown Ukuran** - misal: S:10, M:20, L:15, XL:5
- **Catatan Item** - catatan tambahan per baris

> Keputusan pemilik: **tidak perlu kolom HPP** di surat penawaran. Cukup harga jual.
> Kolom spesifikasi ini terpisah dari `order_items` dan `order_item_fabrics`.
> Data penawaran adalah draft negosiasi dan tidak selalu sama persis dengan apa yang akhirnya dipesan.

**1.1.2 Aturan Edit Surat Penawaran:**

Surat penawaran **bisa diedit kapan saja** termasuk setelah dikirim (`status = sent`).
Tidak ada sistem versioning/revisi. Jika ada perubahan besar setelah pelanggan sudah
pegang salinan, sales harus kirim ulang secara manual (cetak/PDF lagi).

### 1.2 Invoice (Proforma / Invoice DP)

**Kapan:** Setelah penawaran disetujui pelanggan, sebelum DP dibayar.
Bisa juga dibuat dari order yang sudah ada (jika order dibuat manual tanpa penawaran).

**Dua sumber data Invoice:**
1. Dari Quotation - clone isi penawaran, tambahkan kolom tagihan.
2. Dari Order yang sudah ada - snapshot dari `order_items`.

**Isi (berdasarkan contoh di docs/PDF):**

| Bagian | Detail |
|--------|--------|
| Header | Logo, nama, alamat perusahaan |
| Nomor Dokumen | INV-YYYYMM-NNNN (otomatis) |
| Tanggal | Tanggal invoice |
| Jatuh Tempo | Tanggal jatuh tempo pembayaran |
| Kepada | Nama dan alamat pelanggan |
| Tabel Item | Nama produk, deskripsi pekerjaan, qty, harga satuan, subtotal |
| Subtotal | Jumlah sebelum ongkir |
| Ongkos Kirim | Jika ada |
| Total Tagihan | Grand total |
| Riwayat DP | DP yang sudah masuk (jika invoice pelunasan) dan sisa kurang bayar |
| Metode Pembayaran | Rekening tujuan (dari `bank_accounts`) |
| Catatan | Catatan bebas |
| Area TTD | Kolom TTD + cap perusahaan |

### 1.3 Kwitansi (Receipt) -- OTOMATIS via Trigger

**Kapan:** **Otomatis dibuat** setiap kali `order_payments` diinsert (via trigger database).
Tidak perlu user klik tombol generate -- kwitansi langsung ada saat pembayaran dicatat.
User hanya perlu klik "Cetak Kwitansi" untuk mencetak yang sudah ada.

**Implikasi trigger otomatis:**
- Saat `record_order_payment` RPC berhasil --> trigger `trg_auto_create_receipt` jalan
- Trigger memanggil `generate_document_no('receipt', user_id)` untuk nomor kwitansi
- INSERT satu baris ke `receipts` sebagai snapshot pembayaran tersebut
- Saat `delete_order_payment` dipanggil --> trigger `trg_delete_receipt_on_payment` menghapus kwitansi terkait

**Isi (berdasarkan contoh di docs/PDF):**

| Bagian | Detail |
|--------|--------|
| Header | Logo, nama perusahaan |
| Nomor Dokumen | KWT-YYYYMM-NNNN (otomatis, saat payment dicatat) |
| Tanggal Pembayaran | order_payments.payment_date |
| Diterima dari | Nama pelanggan |
| Jumlah | Nominal yang dibayar (dalam kotak angka) |
| Terbilang | Jumlah dalam huruf (bahasa Indonesia) |
| Untuk Pembayaran | Referensi ke nomor order / deskripsi (misal: DP 50% order ORD-0044) |
| Tipe Pembayaran | DP / Pelunasan |
| Metode | Tunai / Transfer / QRIS / Lainnya |
| Area TTD | Kolom TTD penerima + ruang khusus stempel/cap perusahaan |

### 1.4 Nota

**Kapan:** Setelah order lunas, sebagai ringkasan transaksi lengkap.
Diakses dari modal detail order (tidak ada halaman arsip tersendiri).

**Isi (berdasarkan contoh di docs/PDF):**

| Bagian | Detail |
|--------|--------|
| Header | Logo, nama perusahaan |
| Nomor Dokumen | NTA-YYYYMM-NNNN (otomatis, per order) |
| Tanggal | Tanggal nota dibuat |
| Kepada | Nama pelanggan + alamat pengiriman |
| Nomor Order | ORD-XXXX |
| Tabel Item | Semua item: nama barang, ukuran breakdown, qty dipesan, qty dikirim |
| Riwayat Bayar | Daftar semua payment: tanggal, tipe, nominal |
| Total | Grand total, total dibayar, sisa (0 jika lunas) |
| Catatan Retur | Syarat dan ketentuan pengecekan barang saat diterima |
| Area TTD | Kolom TTD penerima barang + TTD bagian pengiriman/gudang |

---

## 2. Model Data Baru

### 2.1 Tabel quotations (Surat Penawaran)

```sql
-- Belum terikat ke orders (order_id nullable)
CREATE TABLE quotations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  quotation_no     text NOT NULL,           -- PNW-202610-0001
  quotation_date   date NOT NULL DEFAULT CURRENT_DATE,
  valid_until      date,
  customer_name    text NOT NULL,
  customer_company text,
  customer_address text,
  sales_id         bigint REFERENCES sales(id),
  notes            text,
  status           text NOT NULL DEFAULT 'draft',
  -- draft | sent | accepted | rejected | expired
  -- Catatan: status sent TIDAK mengunci edit (keputusan pemilik)
  order_id         bigint REFERENCES orders(id),
  -- diisi ketika penawaran dikonversi ke order
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
```

### 2.2 Tabel quotation_items (Baris Item Penawaran)

```sql
CREATE TABLE quotation_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id     uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  sort_order       int NOT NULL DEFAULT 0,
  product_name     text NOT NULL,
  -- Spesifikasi kain / bahan
  fabric_type      text,          -- Katun Combed 30s
  fabric_color     text,          -- Navy Blue
  -- Detail jahitan dan bordir
  sewing_notes     text,          -- Jahit satu jarum + obras
  embroidery_notes text,          -- Bordir dada kiri logo 5x5cm
  print_notes      text,          -- Sablon DTF punggung
  -- Breakdown ukuran (JSONB)
  size_breakdown   jsonb,         -- contoh: {"S":10,"M":20,"L":15,"XL":5}
  -- Harga dan qty
  -- Tidak ada kolom HPP (keputusan pemilik: cukup harga jual)
  qty              int NOT NULL DEFAULT 0,
  unit             text NOT NULL DEFAULT 'pcs',
  unit_price       numeric(15,2) NOT NULL DEFAULT 0,
  subtotal         numeric(15,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  item_notes       text
);
```

### 2.3 Tabel invoices (Invoice)

```sql
CREATE TABLE invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  invoice_no       text NOT NULL,           -- INV-202610-0001
  invoice_date     date NOT NULL DEFAULT CURRENT_DATE,
  due_date         date,
  customer_name    text NOT NULL,
  customer_address text,
  source_type      text NOT NULL,           -- quotation | order | manual
  quotation_id     uuid REFERENCES quotations(id),
  order_id         bigint REFERENCES orders(id),
  subtotal         numeric(15,2) NOT NULL DEFAULT 0,
  shipping_cost    numeric(15,2) NOT NULL DEFAULT 0,
  grand_total      numeric(15,2) GENERATED ALWAYS AS (subtotal + shipping_cost) STORED,
  bank_account_id  uuid,                   -- FK ke bank_accounts (opsional)
  notes            text,
  status           text NOT NULL DEFAULT 'draft',
  -- draft | sent | paid | cancelled
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
```

### 2.4 Tabel invoice_items (Baris Item Invoice)

```sql
CREATE TABLE invoice_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  sort_order    int NOT NULL DEFAULT 0,
  product_name  text NOT NULL,
  description   text,
  qty           int NOT NULL DEFAULT 0,
  unit          text NOT NULL DEFAULT 'pcs',
  unit_price    numeric(15,2) NOT NULL DEFAULT 0,
  subtotal      numeric(15,2) GENERATED ALWAYS AS (qty * unit_price) STORED
);
```

### 2.5 Tabel receipts (Kwitansi -- dibuat otomatis via trigger)

```sql
-- Dibuat otomatis oleh trigger trg_auto_create_receipt
-- saat insert ke order_payments. Tidak dibuat manual dari frontend.
CREATE TABLE receipts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  receipt_no      text NOT NULL,            -- KWT-202610-0001
  receipt_date    date NOT NULL,            -- sama dengan payment_date
  order_id        bigint REFERENCES orders(id),
  payment_id      bigint UNIQUE REFERENCES order_payments(id),
  -- UNIQUE: satu payment tepat satu kwitansi
  customer_name   text NOT NULL,            -- snapshot dari orders.customer_name
  amount          numeric(15,2) NOT NULL,   -- snapshot dari order_payments.amount
  payment_type    text,                     -- dp | pelunasan
  payment_method  text,                     -- cash | transfer | qris | lainnya
  description     text,
  created_at      timestamptz DEFAULT now()
);
```

**Trigger otomatis untuk kwitansi:**

```sql
-- Trigger INSERT: buat kwitansi saat payment baru dicatat
CREATE TRIGGER trg_auto_create_receipt
  AFTER INSERT ON order_payments
  FOR EACH ROW EXECUTE FUNCTION fn_auto_create_receipt();

-- Trigger DELETE: hapus kwitansi saat payment dihapus
CREATE TRIGGER trg_delete_receipt_on_payment
  AFTER DELETE ON order_payments
  FOR EACH ROW EXECUTE FUNCTION fn_delete_receipt_on_payment();
```

`fn_auto_create_receipt` melakukan:
1. JOIN ke `orders` untuk mendapatkan `customer_name`
2. Panggil `generate_document_no('receipt', NEW.user_id)` untuk nomor kwitansi
3. INSERT ke `receipts` dengan snapshot data payment saat itu

`fn_delete_receipt_on_payment` melakukan:
1. DELETE FROM receipts WHERE payment_id = OLD.id

### 2.6 Tabel notas (Nota)

```sql
-- Nota dibuat on-demand saat user klik Cetak Nota di modal order
-- Satu nota per order (UNIQUE order_id)
CREATE TABLE notas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  nota_no       text NOT NULL,              -- NTA-202610-0001
  nota_date     date NOT NULL DEFAULT CURRENT_DATE,
  order_id      bigint NOT NULL UNIQUE REFERENCES orders(id),
  -- UNIQUE: satu order satu nota. Reprint = fetch yang sudah ada.
  customer_name text NOT NULL,
  grand_total   numeric(15,2) NOT NULL,
  paid_amount   numeric(15,2) NOT NULL,
  notes         text,
  created_at    timestamptz DEFAULT now()
);
```

> Nota bisa di-reprint tanpa membuat baris baru. Karena UNIQUE order_id,
> jika sudah ada nota untuk order tersebut, frontend cukup fetch dan tampilkan.
> Logika di frontend: SELECT dulu, jika tidak ada baru INSERT.

### 2.7 Penomoran Otomatis (Document Counter)

Semua nomor dokumen menggunakan format `PREFIX-YYYYMM-NNNN`.
Counter direset setiap bulan (keputusan pemilik), per `user_id`.

```sql
CREATE TABLE document_counters (
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  doc_type    text NOT NULL,    -- quotation | invoice | receipt | nota
  year_month  text NOT NULL,    -- YYYYMM (reset per bulan)
  last_seq    int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, doc_type, year_month)
);
-- RPC generate_document_no menggunakan SELECT ... FOR UPDATE
-- untuk mencegah race condition jika dua generate terjadi bersamaan.
```

| Tipe Dokumen | Prefix | Contoh |
|-------------|--------|--------|
| quotation | PNW | PNW-202610-0001 |
| invoice | INV | INV-202610-0001 |
| receipt | KWT | KWT-202610-0001 |
| nota | NTA | NTA-202610-0001 |

---

## 3. Keterkaitan dengan Data Existing

| Dokumen | Sumber Data | Waktu Dibuat | Akses UI |
|---------|------------|-------------|---------|
| Surat Penawaran | quotations + quotation_items (baru) | Manual, kapan saja | Halaman /quotations |
| Invoice | invoices + invoice_items (baru) | Manual, dari quotation/order | Halaman /invoices |
| Kwitansi | receipts (baru) -- **otomatis** via trigger | Saat payment diinsert | Modal detail order |
| Nota | notas (baru) -- get-or-create, satu per order | Saat user klik Cetak Nota | Modal detail order |

**Relasi Konversi:**

```
quotation --> (disetujui) --> order dibuat, order_id diisi di quotations.order_id
quotation --> (clone)     --> invoice (source_type = quotation)
order     --> (snapshot)  --> invoice (source_type = order)
order_payment (INSERT)   --> trigger --> receipt otomatis
order_payment (DELETE)   --> trigger --> receipt ikut terhapus
order (lunas, klik cetak) --> get-or-create --> nota
```

---

## 4. Fitur Generate Dokumen (Cetak / PDF)

### 4.1 Pendekatan Render

**Direkomendasikan: Print via browser (window.print()) dengan CSS @media print.**
- Tidak perlu dependensi baru
- Tidak perlu backend server (lihat ARSITEKTUR_TEKNIS.md bagian 1)
- Tidak perlu integrasi email/WhatsApp (keputusan pemilik: cukup cetak/unduh PDF)

### 4.2 Opsi Tanda Tangan dan Cap Saat Cetak

Sebelum cetak, user memilih mode TTD di panel **Print Options**:

| Mode | Tampilan di Dokumen | Kapan Dipakai |
|------|---------------------|---------------|
| `none` | Area TTD kosong (garis/kotak) | Akan ditandatangani dan dicap fisik setelah dicetak |
| `signature_only` | Gambar TTD digital saja | Dokumen digital dikirim via WhatsApp/email manual |
| `signature_and_stamp` | TTD digital + cap perusahaan (PNG semi-transparan) | Dokumen digital resmi, tidak perlu cap fisik |

> Gambar TTD dan cap diambil dari `company_settings.signatureUrl` dan `company_settings.stampUrl`.
> Tidak perlu kolom baru di database. Murni frontend state lokal.

**Komponen hierarchy:**

```
DocumentPreviewModal
  |- PrintOptionsPanel   (pilihan mode TTD + cap, default: none)
  |- [QuotationTemplate | InvoiceTemplate | ReceiptTemplate | NotaTemplate]
       |- SignatureArea  (prop: mode, signatureUrl, stampUrl)
```

Render `SignatureArea` per mode:
- `none`: kotak kosong bertuliskan "Tanda Tangan & Cap"
- `signature_only`: `<img src={signatureUrl} />` di atas garis nama
- `signature_and_stamp`: TTD + cap `position:absolute`, `opacity:0.75`, `mix-blend-mode:multiply`

### 4.3 Komponen Template Dokumen

```
src/components/documents/
  QuotationTemplate.tsx       -- Template surat penawaran
  InvoiceTemplate.tsx         -- Template invoice
  ReceiptTemplate.tsx         -- Template kwitansi
  NotaTemplate.tsx            -- Template nota
  DocumentPreviewModal.tsx    -- Modal: render template + Print Options + tombol cetak
  PrintOptionsPanel.tsx       -- Panel pilihan mode TTD/cap
  SignatureArea.tsx            -- Komponen area TTD: render berbeda tiap mode
  utils/
    terbilang.ts              -- Konversi angka ke huruf Indonesia
```

### 4.4 Titik Masuk UI

| Halaman / Konteks | Dokumen yang Tersedia |
|-------------------|----------------------|
| /quotations - baris penawaran | Surat Penawaran |
| /invoices - baris invoice | Invoice |
| Modal Detail Order - riwayat bayar | Kwitansi per payment (tombol Cetak Kwitansi) |
| Modal Detail Order - bagian bawah | Nota (tombol Cetak Nota, muncul jika lunas) |

---

## 5. Halaman dan UI Baru

### 5.1 Halaman Surat Penawaran (/quotations)

- Tabel daftar penawaran: nomor, tanggal, pelanggan, sales, status, aksi
- Filter: status, tanggal, sales
- Tombol Buat Penawaran Baru, form multi-step:
  - Step 1: Info header (pelanggan, sales, tanggal, berlaku hingga, syarat bayar, lead time)
  - Step 2: Tabel item dengan spesifikasi per baris (dynamic rows, tanpa field HPP)
  - Step 3: Catatan dan preview
- Tombol Edit: bisa diedit kapan saja termasuk setelah status sent
- Tombol Cetak / PDF: buka DocumentPreviewModal dengan PrintOptionsPanel
- Tombol Buat Invoice dari Penawaran: clone ke invoices
- Tombol Konversi ke Order: prefill form order dari data penawaran, user review dulu

### 5.2 Halaman Invoice (/invoices)

- Tabel daftar invoice: nomor, tanggal, jatuh tempo, pelanggan, total, status
- Tombol Buat Invoice Baru: pilih sumber (dari penawaran, dari order, atau manual)
- Tombol Cetak / PDF: buka DocumentPreviewModal dengan PrintOptionsPanel

### 5.3 Kwitansi dan Nota (dari Modal Detail Order)

Tidak ada halaman tersendiri (keputusan pemilik). Diakses dari modal detail order:

**Kwitansi:**
- Per baris payment di riwayat bayar: tombol **Cetak Kwitansi**
- Kwitansi sudah ada di database (dibuat otomatis saat payment dicatat)
- Tombol hanya fetch dari `receipts` dan buka DocumentPreviewModal

**Nota:**
- Tombol **Cetak Nota** muncul di bagian bawah modal jika `orders.status = lunas`
- Jika nota belum ada, sistem generate nomor NTA baru dan insert ke `notas`
- Jika nota sudah ada (reprint), fetch dari `notas` dan tampilkan langsung
- Semua buka DocumentPreviewModal dengan PrintOptionsPanel

---

## 6. Aturan Bisnis Penting

1. **Surat Penawaran tidak mengunci stok.** Ini hanya dokumen komersial.
2. **Invoice pra-DP tidak otomatis membuat order.** User harus klik Konversi ke Order secara eksplisit.
3. **Kwitansi dibuat dan dihapus otomatis oleh trigger.** Frontend hanya fetch dan cetak; tidak bisa buat kwitansi manual.
4. **Nota hanya bisa dicetak setelah order lunas** (orders.status = lunas). Satu order satu nota (UNIQUE).
5. **Penomoran tidak di-recycle.** Nomor yang sudah diterbitkan tidak bisa dipakai ulang.
6. **Spesifikasi Surat Penawaran tidak sama dengan order_items final.** Penawaran adalah negosiasi.
7. **Konversi quotation ke order** mengisi form order dari data penawaran sebagai nilai awal.
8. **Surat Penawaran bisa diedit kapan saja**, termasuk setelah status `sent`. Tidak ada versioning.
9. **Opsi TTD/cap sepenuhnya di frontend.** Tidak ada data TTD/cap yang disimpan ke database saat cetak.
10. **Tidak ada integrasi kirim ke pelanggan** dari dalam app. Distribusi dokumen dilakukan user secara manual.

---

## 7. Fase Implementasi

### Fase 1 - Surat Penawaran (prioritas pertama)

Berdiri sendiri, tidak tergantung fitur lain.

Yang dikerjakan:
- Migration M1: document_counters + RPC generate_document_no
- Migration M2: quotations + quotation_items (tanpa kolom HPP) + RLS + GRANT
- Migration M3: RPC convert_quotation_to_order (prefill form, tidak insert langsung)
- Frontend: Halaman /quotations (daftar + form multi-step)
- Frontend: QuotationTemplate.tsx + DocumentPreviewModal.tsx + PrintOptionsPanel.tsx + SignatureArea.tsx
- Frontend: utils/terbilang.ts

### Fase 2 - Invoice

Prasyarat: Fase 1 selesai.

Yang dikerjakan:
- Migration M4: invoices + invoice_items + RLS + GRANT
- Migration M5: RPC create_invoice_from_quotation, create_invoice_from_order
- Frontend: Halaman /invoices (daftar + form)
- Frontend: InvoiceTemplate.tsx

### Fase 3 - Kwitansi Otomatis dan Nota

Prasyarat: order_payments sudah ada (sudah ada di sistem), Fase 1 dan 2 selesai.

Yang dikerjakan:
- Migration M6: tabel receipts (UNIQUE payment_id) + notas (UNIQUE order_id) + RLS + GRANT
- Migration M7: fn_auto_create_receipt + fn_delete_receipt_on_payment + trigger AFTER INSERT/DELETE pada order_payments
- Frontend: ReceiptTemplate.tsx, NotaTemplate.tsx
- Frontend: Tombol Cetak Kwitansi dan Cetak Nota di modal detail order
- Frontend: Logika get-or-create nota saat Cetak Nota diklik

---

## 8. Catatan Teknis untuk Agen

### 8.1 Urutan Baca (Wajib Sebelum Mulai)

1. AGENTS.md
2. docs/AGENT_INSTRUCTIONS.md
3. docs/ORDER_DAN_KEUANGAN.md
4. docs/ARSITEKTUR_TEKNIS.md
5. File ini (RANCANGAN_DOKUMEN_ORDER.md)
6. git status dan git log -n 10 --stat -- cek migration terakhir

### 8.2 Aturan Wajib

1. Jangan push migration ke remote tanpa persetujuan eksplisit pemilik di chat.
2. Satu migration per tujuan, satu file per perubahan (ikuti ARSITEKTUR_TEKNIS.md bagian 3).
3. Jangan ubah tabel yang sudah ada (orders, order_items, order_payments, transactions). Additive-only.
4. Kwitansi dibuat otomatis oleh trigger, bukan dari frontend. Frontend hanya fetch dan render.
5. Konversi quotation ke order tidak boleh insert langsung ke orders. Prefill form di frontend dulu.
6. generate_document_no harus atomic -- gunakan SELECT ... FOR UPDATE.
7. Opsi TTD/cap tidak disimpan ke database. Hanya state lokal React.
8. Nota: cek dulu di notas (UNIQUE order_id) sebelum insert baru.
9. Bahasa komentar, pesan error, dan dokumen: Indonesia.
10. Bila ragu atau ada yang bertentangan, berhenti dan tanya pemilik.

### 8.3 Potensi Gotcha

| Gotcha | Penjelasan |
|--------|-----------|
| quotations.order_id nullable | FK tidak boleh NOT NULL. Penawaran yang belum jadi order tetap valid. |
| GENERATED ALWAYS AS STORED | Postgres >= 12. Kolom subtotal tidak bisa di-INSERT eksplisit. |
| Tidak ada kolom HPP di quotation_items | Keputusan pemilik. Jangan tambahkan kembali tanpa persetujuan. |
| window.print() vs Tailwind | Template dokumen pakai inline style atau CSS module, bukan class Tailwind. |
| Terbilang angka besar | Cek dulu apakah sudah ada utilitas di src/utils/ sebelum buat ulang. |
| Urutan size_breakdown JSONB | Iterasi Object.entries dan urutkan manual (S < M < L < XL < XXL). |
| bank_account_id di invoices | Cek tipe uuid/bigint dari bank_accounts.id sebelum tulis DDL (Langkah 0 butir 4). |
| payment_id di receipts | Tipe harus cocok dengan order_payments.id. Cek di Langkah 0 butir 5. |
| Race condition penomoran | generate_document_no wajib SELECT ... FOR UPDATE. |
| Trigger receipt: butuh customer_name | fn_auto_create_receipt perlu JOIN ke orders untuk mendapat customer_name. |
| Trigger receipt vs delete_order_payment | Trigger AFTER DELETE pada order_payments. Urutan hapus: trigger jalan setelah payment dihapus, lookup via payment_id (UNIQUE). |
| UNIQUE order_id di notas | Frontend harus SELECT dulu sebelum INSERT nota. Jika sudah ada, skip insert dan pakai yang lama. |
| stampUrl vs signatureUrl | Periksa nama kolom persisnya di src/types.ts interface CompanyProfile sebelum dipakai (Langkah 0 butir 6). |
| Cap overlay di @media print | CSS position:absolute, opacity:0.75, mix-blend-mode:multiply. Tes di print preview browser. |
| signatureUrl / stampUrl null | Guard null: jika URL kosong, render area kosong saja, bukan broken image. |
| convert_quotation_to_order | Fungsi ini tidak insert ke orders. Mengembalikan data prefill untuk form frontend saja. |

### 8.4 Koneksi ke Akuntansi (jika fitur akuntansi sudah aktif)

- Invoice yang berstatus paid tidak otomatis mencatat transaksi akuntansi. Yang mencatat tetap record_order_payment.
- Kwitansi adalah bukti fisik bahwa order_payment sudah dicatat. Tidak ada entri akuntansi baru dari kwitansi.
- Nota adalah ringkasan, bukan dokumen akuntansi.
- Trigger auto-receipt tidak boleh menyentuh tabel akuntansi sama sekali.

---

## 9. Pertanyaan Pemilik (Semua Sudah Terjawab -- 2026-10-13)

| # | Pertanyaan | Jawaban |
|---|-----------|---------|
| 1 | HPP di Surat Penawaran? | Cukup harga jual saja |
| 2 | Kwitansi: otomatis atau on-demand? | Otomatis via trigger |
| 3 | Opsi TTD/cap? | 3 mode: kosong / TTD / TTD+cap, pilih saat cetak |
| 4 | Kirim ke pelanggan dari app? | Tidak perlu, cukup cetak/unduh PDF |
| 5 | Halaman arsip /receipts, /notas? | Tidak perlu, cukup dari modal order |
| 6 | Edit Surat Penawaran setelah sent? | Bisa diedit (tanpa versioning) |
| 7 | Reset penomoran? | Per bulan (YYYYMM) |

Semua pertanyaan sudah terjawab. Rancangan ini siap untuk direview dan disetujui pemilik sebelum implementasi dimulai.

---

## 10. Daftar Migration yang Direncanakan

> Semua file di bawah BELUM DIBUAT. Ini hanya perencanaan.

| No | Fase | Nama File (rencana) | Isi |
|----|------|--------------------|----|
| M1 | 1 | YYYYMMDDHHMMSS_document_counters.sql | Tabel document_counters + RPC generate_document_no (SELECT FOR UPDATE) |
| M2 | 1 | YYYYMMDDHHMMSS_quotations.sql | Tabel quotations + quotation_items (tanpa kolom HPP) + RLS + GRANT |
| M3 | 1 | YYYYMMDDHHMMSS_quotation_rpcs.sql | RPC convert_quotation_to_order |
| M4 | 2 | YYYYMMDDHHMMSS_invoices.sql | Tabel invoices + invoice_items + RLS + GRANT |
| M5 | 2 | YYYYMMDDHHMMSS_invoice_rpcs.sql | RPC create_invoice_from_quotation, create_invoice_from_order |
| M6 | 3 | YYYYMMDDHHMMSS_receipts_notas.sql | Tabel receipts (UNIQUE payment_id) + notas (UNIQUE order_id) + RLS + GRANT |
| M7 | 3 | YYYYMMDDHHMMSS_receipt_triggers.sql | fn_auto_create_receipt + fn_delete_receipt_on_payment + dua trigger pada order_payments |

---

Dokumen ini adalah rancangan. Implementasi dimulai hanya setelah pemilik menyetujui setiap fase secara eksplisit di chat.
