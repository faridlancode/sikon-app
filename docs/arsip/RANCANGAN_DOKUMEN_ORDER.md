# Rancangan: Dokumen Order (Surat Penawaran, Invoice, Kwitansi, Nota)

- Tanggal: 2026-10-12 (diperbarui 2026-10-13; **direvisi 2026-10-14 setelah audit terhadap kode repo**)
- Status: **Menunggu persetujuan revisi 2026-10-14.** Jangan kerjakan implementasi (kecuali Langkah 0 read-only di `CATATAN_IMPLEMENTASI_DOKUMEN_ORDER.md`) sebelum pemilik menyetujui.
- Domain pemilik: **ORDER_DAN_KEUANGAN** (baca bersama `docs/ORDER_DAN_KEUANGAN.md`). Setelah selesai, rancangan ini dilebur ke file itu (lihat `docs/AGENT_INSTRUCTIONS.md` §5).
- File ini hanya berisi rancangan. Tidak ada kode yang boleh ditulis sebelum pemilik menyetujui setiap fase.

---

## 0. Konteks Bisnis

Alur lengkap dari awal hingga kirim:

```
[Negosiasi]
  Surat Penawaran   --> OTOMATIS menerbitkan Invoice DP/Proforma (menempel ke quotation)
  (pelanggan setuju & bayar DP)
  ORDER MASUK       --> dibuat dari penawaran atau input pesanan baru
                    --> OTOMATIS menerbitkan Invoice Pesanan (menempel ke order)
                    --> DP tercatat lewat record_order_payment
                    --> Kwitansi DP otomatis dibuat (trigger)
  (produksi berjalan, milestone selesai)
  (pelunasan)
  Invoice Pesanan lunas --> Kwitansi Pelunasan (otomatis, trigger) --> Nota
  (kirim)
  Order selesai     --> production_status = completed
```

**Poin kunci dari pemilik (Revisi 2026-10-16):**
- **Invoice PASTI langsung menempel dengan Order atau Quotation.** Tidak ada invoice yang berdiri sendiri/manual lepas (`source_type = 'manual'` DIHAPUS).
- **Setiap membuat quotation**, otomatis lahir Invoice DP/Proforma yang menempel ke penawaran tersebut.
- **Setiap membuat order**, otomatis lahir Invoice Pesanan yang menempel ke order tersebut.
- Data 100% konsisten: setiap invoice di sistem jelas identitasnya (apakah untuk Penawaran PNW-xxxx atau Pesanan ORD-xxxx).
- Kwitansi dibuat **otomatis via trigger** setiap kali pembayaran dicatat.
- Nota adalah ringkasan transaksi akhir setelah order lunas.

---

## 0.1 Kenapa Perlu Tabel Terpisah? (Bukan Hanya Mengacu ke orders + order_items)

**Alasan 1: Surat Penawaran belum punya order.** Quotation dibuat sebelum order ada, jadi tidak ada `orders.id` yang bisa dirujuk. Data penawaran butuh tempat tinggal sendiri.

**Alasan 2: Snapshot legal.** Data `orders` dinamis. Dokumen yang sudah diterbitkan ke pelanggan bernilai legal.

```
Senin: Invoice dicetak --> Kemeja Rp 85.000 x 100 --> Total Rp 8.500.000
Rabu:  Sales edit order --> harga Kemeja jadi Rp 90.000
Kamis: Pelanggan complain "di invoice saya Rp 8.500.000 tapi ditagih Rp 9.000.000?"
```

Kalau invoice hanya dibuat on-the-fly dari `order_items`, angkanya berubah setiap dibuka. Ini sejalan dengan prinsip snapshot di `ARSITEKTUR_TEKNIS.md` §2.4. **Berlaku juga untuk Nota** (lihat §2.6: Nota menyimpan snapshot item dan pembayaran, bukan hanya total).

**Alasan 3: Satu order bisa punya banyak dokumen dengan status independen.**

```
Order ORD-0044
  |- Invoice INV-202610-0001  (status: sent, tagihan DP)
  |- Invoice INV-202610-0008  (status: paid, tagihan pelunasan)
  |- Kwitansi KWT-202610-0003  (bukti DP -- dibuat otomatis)
  |- Kwitansi KWT-202610-0011  (bukti pelunasan -- dibuat otomatis)
  |- Nota NTA-202610-0002      (ringkasan akhir)
```

---

## 0.2 Keputusan Pemilik (Semua Terjawab, 2026-10-13)

| # | Pertanyaan | Jawaban | Implikasi Desain |
|---|-----------|---------|------------------|
| 1 | HPP di Surat Penawaran? | **Cukup harga jual saja** | Tidak ada kolom HPP di `quotation_items`. |
| 2 | Kwitansi: otomatis atau on-demand? | **Otomatis** via trigger | `trg_auto_create_receipt` AFTER INSERT pada `order_payments`. |
| 3 | Opsi TTD/cap saat cetak? | **3 mode:** kosong / TTD saja / TTD+cap | `PrintOptionsPanel` di frontend. Tidak ada perubahan database. |
| 4 | Kirim dokumen ke pelanggan? | **Cukup cetak/unduh PDF** | Tidak ada integrasi WhatsApp/email. |
| 5 | Halaman arsip /receipts dan /notas? | **Cukup dari modal detail order** | Tidak ada halaman tersendiri. |
| 6 | Edit Surat Penawaran setelah sent? | **Bisa diedit** (tanpa versioning) | Status `sent` tidak mengunci form. |
| 7 | Reset penomoran? | **Per bulan** | `PREFIX-YYYYMM-NNNN`, counter per `year_month`. |

## 0.3 Hasil Audit 2026-10-14 (Koreksi terhadap Draft 2026-10-13)

Draft sebelumnya ditulis tanpa membandingkan dengan skema nyata. Koreksi di bawah sudah diterapkan ke seluruh isi file ini. Detail verifikasi ada di `CATATAN_IMPLEMENTASI_DOKUMEN_ORDER.md` §6.

| # | Draft lama | Fakta di repo | Dampak koreksi |
|---|-----------|---------------|----------------|
| K1 | `orders.id`, `order_payments.id`, `sales.id` bertipe `bigint` | Semuanya **`uuid`** (`20260101000002_core_financial_and_orders.sql`) | Semua FK baru bertipe `uuid`. Jawaban Langkah 0 butir 3 s.d. 5 sudah diketahui. |
| K2 | Tabel rekening bernama `bank_accounts` | Nama aslinya **`company_bank_accounts`** (id `uuid`) | FK `bank_account_id` ke `company_bank_accounts(id)`. |
| K3 | Kolom TTD/cap belum pasti | DB: `company_settings.signature_url` dan `stamp_url`. Frontend: `profile.signatureUrl` dan `profile.stampUrl` (`src/types.ts`, hook `useCompanySettings`) | Gunakan hook yang ada, jangan query ulang. |
| K4 | `order_payments` mungkin punya `customer_name` | Tidak punya. Hanya `order_id`, `amount`, `payment_type` (`dp`/`pelunasan`), `payment_method`, `payment_date`, `transaction_id` | Trigger wajib JOIN ke `orders`. |
| K5 | Trigger `AFTER DELETE` untuk menghapus kwitansi | `receipts.payment_id` yang tidak punya `ON DELETE CASCADE` akan **menggagalkan** penghapusan pembayaran (FK `NO ACTION`), dan `receipts.order_id` tanpa cascade menggagalkan `delete_order` | Hapus trigger delete. Pakai `ON DELETE CASCADE` pada FK `receipts.payment_id` dan `receipts.order_id`. Lebih sederhana dan aman terhadap cascade dari `orders`. |
| K6 | `generate_document_no` dengan `SELECT ... FOR UPDATE` | `FOR UPDATE` tidak mengunci baris yang **belum ada** (nomor pertama tiap bulan tetap bisa balapan). Fungsi yang menerima `user_id` dan bisa dipanggil frontend memungkinkan memakai `user_id` orang lain | Pakai `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` (atomik). Fungsi **internal**: `REVOKE ... FROM public, anon, authenticated`, persis pola `next_journal_entry_no` di akuntansi. |
| K7 | Frontend: ambil nomor, lalu insert header, lalu insert item | Dua tabel ditulis dari frontend = tidak atomik; nomor bisa terbuang. Melanggar `AGENT_INSTRUCTIONS.md` §1.7 | Penulisan lewat **RPC** (`save_quotation`, `save_invoice`, dst.). Tabel dokumen select-only untuk `authenticated`, seperti `journal_entries`. |
| K8 | Nota: frontend `SELECT` dulu lalu `INSERT` | Balapan (dua klik) dan nomor terbuang. Melanggar aturan yang sama | RPC `get_or_create_nota(p_order_id)` atomik. |
| K9 | RPC `convert_quotation_to_order` yang "mengembalikan data prefill" | RPC yang hanya membaca tidak menambah apa pun; frontend bisa membaca penawaran langsung. Yang sebenarnya butuh atomik adalah **menautkan** penawaran ke order | Ganti dengan `link_quotation_to_order`. Prefill dilakukan frontend. |
| K10 | Nota berisi "ukuran breakdown", "qty dikirim", "alamat pengiriman" | `orders` dan `order_items` **tidak punya** alamat, breakdown ukuran, maupun qty terkirim | Dihapus dari Nota (default). Butuh keputusan pemilik bila diinginkan (Pertanyaan P1). |
| K11 | Quotation: "Syarat Pembayaran (DP %, tempo, rekening)" dan "Estimasi Waktu" ada di isi dokumen, tetapi tidak ada kolomnya | DDL lama tidak memuatnya | Tambah `dp_percent`, `payment_terms`, `lead_time`, `bank_account_id` ke `quotations`. |
| K12 | Invoice DP/pelunasan, "Riwayat DP" dan "sisa kurang bayar", tetapi hanya `subtotal` dan `shipping_cost` | Tidak ada tempat untuk jenis invoice, pembayaran sebelumnya, atau jumlah yang ditagih | Tambah `invoice_type`, `paid_amount` (snapshot), `amount_due`. |
| K13 | `updated_at` tanpa trigger | Akan basi karena tidak pernah diperbarui | Diisi di dalam RPC simpan. |
| K14 | Kwitansi hanya muncul untuk pembayaran **baru** | Pembayaran yang sudah ada tidak punya kwitansi, tombol Cetak akan kosong | Migration trigger juga **backfill** kwitansi untuk pembayaran lama (idempotent). |
| K15 | Status `expired` disimpan | Tidak ada cron/job di arsitektur tanpa backend | `expired` dihitung di tampilan dari `valid_until`; tidak disimpan. |
| K16 | Template: "pakai inline style atau CSS module, bukan Tailwind" | Repo sudah punya pola cetak yang jalan: `PrintReportModal.tsx` dan `PayrollSlipModal.tsx` memakai `window.print()` + varian Tailwind `print:` | Ikuti pola yang ada (tidak ada dependensi baru). Agen wajib membaca keduanya dan memeriksa cara keduanya menyembunyikan shell aplikasi saat cetak. |
| K17 | `terbilang.ts` di `components/documents/utils/` | Konvensi repo: utilitas di `src/utils/`. Tidak ada utilitas terbilang sama sekali | Letakkan di `src/utils/terbilang.ts`. |
| K18 | `orders.production_status` punya nilai `quotation` dan `pending` | Nilai itu disiapkan di baseline tetapi **tidak ada UI/alurnya**; di timeline, `quotation` hanyalah nama tahap milestone | Fitur ini **tidak memakai** `production_status = 'quotation'`. Penawaran hidup di tabel `quotations`. |
| K19 | `qty int` dan `numeric(15,2)` | Tabel existing memakai `numeric` tanpa presisi, `order_items.qty numeric` | Pakai `numeric` agar konsisten dan agar prefill ke order tidak kehilangan pecahan. |

---

## 1. Empat Jenis Dokumen

### 1.1 Surat Penawaran (Quotation)

**Kapan:** Sebelum DP, bahkan sebelum order dibuat. Sales butuh ini untuk negosiasi.

**Isi (berdasarkan contoh di `docs/PDF/`):**

| Bagian | Detail |
|--------|--------|
| Header | Logo, nama, alamat, telepon perusahaan (dari `company_settings`) |
| Nomor Dokumen | `PNW-YYYYMM-NNNN` (otomatis) |
| Tanggal | Tanggal penawaran |
| Berlaku Hingga | Default +14 hari |
| Kepada | Nama pelanggan, perusahaan pelanggan (opsional), alamat (opsional) |
| Dari | Nama sales |
| Tabel Item | Nama produk, spesifikasi (1.1.1), qty, harga satuan, subtotal |
| Syarat Pembayaran | `dp_percent`, `payment_terms` (teks bebas), rekening tujuan (`bank_account_id`) |
| Estimasi Waktu | `lead_time` (teks bebas, misal "21 hari kerja setelah DP") |
| Catatan | `notes` |
| Area TTD | TTD + cap perusahaan (kanan), persetujuan pelanggan (kiri) |

**1.1.1 Spesifikasi per baris item:** nama produk; jenis kain; warna kain; detail jahitan; detail bordir (lokasi, ukuran, estimasi biaya dalam teks); sablon/print (jenis, lokasi); breakdown ukuran (`{"S":10,"M":20}`); catatan item. Semua teks bebas kecuali breakdown. Tidak ada kolom HPP (keputusan pemilik #1).

> Kolom spesifikasi terpisah dari `order_items` dan `order_item_fabrics`. Penawaran adalah draft negosiasi dan tidak selalu sama dengan yang akhirnya dipesan.

**1.1.2 Aturan edit:** bisa diedit kapan saja, termasuk `status = sent`. Tidak ada versioning.

**1.1.3 Status:** `draft | sent | accepted | rejected` (disimpan). "Kedaluwarsa" **tidak disimpan**; tampilan menandai penawaran berstatus `draft`/`sent` yang `valid_until < hari ini` sebagai kedaluwarsa (K15).

### 1.2 Invoice (Menempel Langsung ke Penawaran atau Pesanan)

**Kapan Lahir:**
1. **Invoice Penawaran (`source_type = 'quotation'`):** Lahir OTOMATIS saat Surat Penawaran (`quotations`) dibuat/disimpan. Menagih DP (`invoice_type = 'dp'`) atau penuh sesuai termin penawaran. Jika penawaran diedit, isi invoice disinkronkan.
2. **Invoice Pesanan (`source_type = 'order'`):** Lahir OTOMATIS saat Pesanan (`orders`) dibuat/disimpan (baik konversi dari penawaran maupun pesanan langsung). Menagih sisa pelunasan (`invoice_type = 'pelunasan'`) atau penuh (`invoice_type = 'penuh'`).

**Tiga jenis (`invoice_type`):**
- `dp`: Tagihan uang muka (nominal dihitung dari `dp_percent` penawaran).
- `pelunasan`: Tagihan sisa pelunasan pesanan (`grand_total - paid_amount`).
- `penuh`: Tagihan penuh sekali bayar.

**Dua sumber (`source_type`):**
- `quotation`: Menempel langsung ke `quotation_id` (tidak ada invoice penawaran yatim).
- `order`: Menempel langsung ke `order_id` (tidak ada invoice pesanan yatim).
- *(Sumber `manual` ditiadakan agar data 100% konsisten).*

| Bagian | Detail |
|--------|--------|
| Header | Logo, nama, alamat perusahaan |
| Nomor Dokumen | `INV-YYYYMM-NNNN` |
| Rujukan Induk | Nomor Penawaran (`PNW-xxxx`) atau Kode Pesanan (`ORD-xxxx`) |
| Tanggal / Jatuh Tempo | `invoice_date`, `due_date` |
| Kepada | Nama dan alamat pelanggan |
| Tabel Item | Nama produk, deskripsi pekerjaan, qty, harga satuan, subtotal |
| Ringkasan | Subtotal, ongkos kirim, **Total Tagihan** (`grand_total`) |
| Riwayat Bayar | `paid_amount` (snapshot pembayaran masuk; 0 untuk invoice DP) |
| Jumlah Ditagih | `amount_due`: DP = nominal DP; pelunasan = total dikurangi `paid_amount`; penuh = total |
| Metode Pembayaran | Rekening tujuan (`company_bank_accounts`) |
| Catatan | Catatan instruksi penagihan |
| Area TTD | TTD + cap perusahaan |

**Status:** `draft | sent | paid | cancelled`.
- Invoice Penawaran: `draft` -> `sent` saat penawaran dikirim -> `paid` otomatis saat DP dibayar / jadi order.
- Invoice Pesanan: `draft` / `sent` -> `paid` otomatis saat pesanan berstatus `lunas`.
- Invoice yang sudah diterbitkan (`sent`/`paid`) **tidak dihapus**, hanya dibatalkan (`cancelled`). Alasan: dokumen legal, nomor tidak di-recycle.

### 1.3 Kwitansi (Receipt): OTOMATIS via Trigger

**Kapan:** otomatis saat baris `order_payments` diinsert. Frontend tidak pernah membuat kwitansi. User hanya klik "Cetak Kwitansi".

**Alur:**
- `record_order_payment` (RPC existing, **tidak diubah**) insert ke `order_payments` --> trigger `trg_auto_create_receipt` jalan di transaksi yang sama.
- Trigger JOIN ke `orders` (nama pelanggan, kode `ORD-xxxx`), memanggil `generate_document_no`, lalu insert ke `receipts`.
- Pembayaran dihapus (`delete_order_payment`, atau cascade dari penghapusan order) --> kwitansi ikut terhapus lewat **`ON DELETE CASCADE`** (K5), bukan trigger.

> **Peringatan:** trigger ini berjalan di dalam transaksi `record_order_payment`. Kalau trigger error, **pencatatan pembayaran ikut gagal**. Jaga trigger tetap sederhana dan uji (lihat Test C di catatan).

**Isi:** header perusahaan; `KWT-YYYYMM-NNNN`; tanggal pembayaran; diterima dari; jumlah dalam kotak; terbilang; untuk pembayaran (kode order + tipe); tipe (DP/Pelunasan); metode (Tunai/Transfer/QRIS/Lainnya, label sama dengan `PAYMENT_METHOD_LABEL` di `OrderDetailModal.tsx`); area TTD penerima + cap.

> Kwitansi untuk DP yang kemudian dikembalikan/dihanguskan (`order_deposit_releases`) **tetap ada** sebagai bukti penerimaan uang. Pelepasan DP tidak mengubah kwitansi.

### 1.4 Nota

**Kapan:** setelah order lunas (`orders.status = 'lunas'`), dari modal detail order. Satu nota per order.

**Isi:** header; `NTA-YYYYMM-NNNN`; tanggal; kepada (nama pelanggan); kode order; tabel item (nama, qty, harga, subtotal); riwayat bayar (tanggal, tipe, nominal); total, total dibayar, sisa; catatan retur (teks tetap, lihat P1); area TTD penerima + TTD gudang/pengiriman.

> Dibuang dari draft lama (K10): breakdown ukuran, qty dikirim, alamat pengiriman, karena datanya tidak ada di `orders`/`order_items`. Bila pemilik ingin menampilkannya, lihat Pertanyaan P1.

---

## 2. Model Data Baru

Aturan umum semua tabel baru:
- `id uuid primary key default gen_random_uuid()`; semua FK ke `orders`, `order_payments`, `sales`, `company_bank_accounts` bertipe **uuid**.
- `user_id uuid not null references auth.users(id) on delete cascade` (agen mencocokkan pola FK `user_id` di migration `20261008063000_accounting_chart_of_accounts.sql`).
- RLS aktif, policy `select` `auth.uid() = user_id`. **Tidak ada** policy/grant tulis untuk `authenticated`; semua tulis lewat RPC (K7). Pola: `grant select ... to authenticated; revoke insert, update, delete ... from authenticated; grant all ... to service_role;` seperti `journal_entries`.
- Semua `check` ditulis eksplisit (pola `orders_status_check`).
- Migration idempotent (`create table if not exists`, `drop policy if exists`, `create or replace`).

### 2.1 quotations

```sql
create table if not exists public.quotations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  quotation_no     varchar not null,
  quotation_date   date not null default current_date,
  valid_until      date,
  customer_name    varchar not null,
  customer_company varchar,
  customer_address text,
  sales_id         uuid references public.sales(id) on delete set null,
  dp_percent       numeric,
  payment_terms    text,
  lead_time        text,
  bank_account_id  uuid references public.company_bank_accounts(id) on delete set null,
  notes            text,
  status           varchar not null default 'draft',
  order_id         uuid references public.orders(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint quotations_status_check check (status in ('draft','sent','accepted','rejected')),
  constraint quotations_dp_percent_check check (dp_percent is null or (dp_percent >= 0 and dp_percent <= 100)),
  constraint quotations_user_no_key unique (user_id, quotation_no)
);
```

### 2.2 quotation_items

```sql
create table if not exists public.quotation_items (
  id               uuid primary key default gen_random_uuid(),
  quotation_id     uuid not null references public.quotations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  sort_order       int not null default 0,
  product_name     varchar not null,
  fabric_type      text,
  fabric_color     text,
  sewing_notes     text,
  embroidery_notes text,
  print_notes      text,
  size_breakdown   jsonb,
  -- Tidak ada kolom HPP (keputusan pemilik #1)
  qty              numeric not null default 0,
  unit             varchar not null default 'pcs',
  unit_price       numeric not null default 0,
  subtotal         numeric generated always as (qty * unit_price) stored,
  item_notes       text,
  constraint quotation_items_qty_check check (qty >= 0),
  constraint quotation_items_price_check check (unit_price >= 0)
);
create index if not exists idx_quotation_items_quotation on public.quotation_items(quotation_id);
```

### 2.3 invoices dan 2.4 invoice_items

```sql
create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  invoice_no       varchar not null,
  invoice_date     date not null default current_date,
  due_date         date,
  invoice_type     varchar not null default 'dp',
  customer_name    varchar not null,
  customer_address text,
  source_type      varchar not null,
  quotation_id     uuid references public.quotations(id) on delete set null,
  order_id         uuid references public.orders(id) on delete set null,
  subtotal         numeric not null default 0,       -- diisi RPC = jumlah subtotal item, tidak diisi frontend
  shipping_cost    numeric not null default 0,
  grand_total      numeric generated always as (subtotal + shipping_cost) stored,
  paid_amount      numeric not null default 0,       -- snapshot pembayaran sebelum invoice ini
  amount_due       numeric not null default 0,       -- jumlah yang ditagih di invoice ini
  bank_account_id  uuid references public.company_bank_accounts(id) on delete set null,
  notes            text,
  status           varchar not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint invoices_type_check check (invoice_type in ('dp','pelunasan','penuh')),
  constraint invoices_source_check check (source_type in ('quotation','order')),
  constraint invoices_parent_check check (
    (source_type = 'quotation' and quotation_id is not null) or
    (source_type = 'order' and order_id is not null)
  ),
  constraint invoices_status_check check (status in ('draft','sent','paid','cancelled')),
  constraint invoices_amounts_check check (shipping_cost >= 0 and paid_amount >= 0 and amount_due >= 0),
  constraint invoices_user_no_key unique (user_id, invoice_no)
);

create table if not exists public.invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  sort_order    int not null default 0,
  product_name  varchar not null,
  description   text,
  qty           numeric not null default 0,
  unit          varchar not null default 'pcs',
  unit_price    numeric not null default 0,
  subtotal      numeric generated always as (qty * unit_price) stored,
  constraint invoice_items_qty_check check (qty >= 0),
  constraint invoice_items_price_check check (unit_price >= 0)
);
create index if not exists idx_invoice_items_invoice on public.invoice_items(invoice_id);
```

`quotation_id` dan `order_id` memakai `on delete set null` supaya invoice (dokumen legal) tidak ikut hilang bila penawaran atau order dihapus.

### 2.5 receipts (dibuat trigger, select-only dari frontend)

```sql
create table if not exists public.receipts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  receipt_no      varchar not null,
  receipt_date    date not null,                        -- = order_payments.payment_date
  order_id        uuid not null references public.orders(id) on delete cascade,
  payment_id      uuid not null unique references public.order_payments(id) on delete cascade,
  order_code      varchar not null,                     -- snapshot orders.order_id (ORD-0044)
  customer_name   varchar not null,                     -- snapshot orders.customer_name
  amount          numeric not null,                     -- snapshot order_payments.amount
  payment_type    varchar not null,                     -- dp | pelunasan
  payment_method  varchar,
  description     text,
  created_at      timestamptz not null default now(),
  constraint receipts_user_no_key unique (user_id, receipt_no)
);
```

**Trigger:** hanya satu, `AFTER INSERT ON public.order_payments FOR EACH ROW`, fungsi `fn_auto_create_receipt()` (`security definer set search_path = public`; `revoke execute ... from public, anon, authenticated`). Penghapusan ditangani `ON DELETE CASCADE` (K5), jadi **tidak ada** `trg_delete_receipt_on_payment`.

`fn_auto_create_receipt`: (1) ambil `order_id` kode dan `customer_name` dari `orders` berdasarkan `NEW.order_id`; (2) `generate_document_no(NEW.user_id, 'receipt', NEW.payment_date)`; (3) insert ke `receipts`; (4) tidak menyentuh tabel akuntansi sama sekali.

**Backfill (di migration yang sama, idempotent):** untuk setiap `order_payments` yang belum punya kwitansi, urutkan `payment_date, created_at`, buat kwitansi dengan nomor dari `generate_document_no`. `where not exists` / `on conflict (payment_id) do nothing` supaya aman dijalankan ulang (K14).

### 2.6 notas (snapshot, dibuat RPC)

```sql
create table if not exists public.notas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nota_no       varchar not null,
  nota_date     date not null default current_date,
  order_id      uuid not null unique references public.orders(id) on delete cascade,
  order_code    varchar not null,
  customer_name varchar not null,
  grand_total   numeric not null,
  paid_amount   numeric not null,
  snapshot      jsonb not null,     -- {items:[{name,qty,unit_price,subtotal}], payments:[{date,type,method,amount}], ongkir}
  notes         text,
  created_at    timestamptz not null default now(),
  constraint notas_user_no_key unique (user_id, nota_no)
);
```

`snapshot` membuat reprint tidak berubah walau order diedit kemudian (sejalan §0.1 alasan 2). Dibuat hanya oleh RPC `get_or_create_nota` (§2.8).

### 2.7 Penomoran (document_counters)

Format `PREFIX-YYYYMM-NNNN`, counter reset tiap bulan, per `user_id`. Bulan diambil dari **tanggal dokumen** (tanggal penawaran/invoice/pembayaran/nota), sama dengan cara `next_journal_entry_no` memakai tanggal jurnal (Pertanyaan P3).

```sql
create table if not exists public.document_counters (
  user_id    uuid not null references auth.users(id) on delete cascade,
  doc_type   varchar not null,
  year_month varchar not null,          -- YYYYMM
  last_seq   int not null default 0,
  primary key (user_id, doc_type, year_month),
  constraint document_counters_type_check check (doc_type in ('quotation','invoice','receipt','nota'))
);
```

```
generate_document_no(p_user_id uuid, p_doc_type text, p_date date) returns varchar
  security definer set search_path = public
  -- insert (user, type, ym, 1) on conflict (user_id, doc_type, year_month)
  --   do update set last_seq = document_counters.last_seq + 1 returning last_seq
  -- revoke execute ... from public, anon, authenticated   (fungsi INTERNAL)
```

Kenapa `INSERT ... ON CONFLICT` dan bukan `SELECT ... FOR UPDATE` (K6): baris counter bulan baru belum ada sehingga tidak ada yang bisa dikunci; `ON CONFLICT DO UPDATE` atomik dan mengunci baris saat bertabrakan. Kenapa tabel counter dan bukan `max()+1` seperti jurnal: aturan bisnis #5 "nomor tidak di-recycle" (menghapus dokumen terakhir tidak boleh membuat nomornya dipakai ulang).

| Tipe | Prefix | Contoh |
|------|--------|--------|
| quotation | PNW | PNW-202610-0001 |
| invoice | INV | INV-202610-0001 |
| receipt | KWT | KWT-202610-0001 |
| nota | NTA | NTA-202610-0001 |

### 2.8 RPC (semua `security definer set search_path = public`, cek `auth.uid()` di awal, `revoke ... from public, anon`, `grant execute ... to authenticated`)

| RPC | Parameter | Perilaku |
|-----|-----------|----------|
| `save_quotation` | `p_quotation_id uuid` (null = baru), `p_header jsonb`, `p_items jsonb` | Satu transaksi: validasi kepemilikan `sales_id`/`bank_account_id`, minimal 1 item, buat nomor bila baru, tulis header, ganti seluruh item, set `updated_at`. **Sekaligus OTOMATIS membuat/mensinkronkan Invoice Penawaran (DP)** yang menempel ke quotation ini. Mengembalikan `uuid` penawaran. |
| `set_quotation_status` | `p_quotation_id uuid`, `p_status text` | Ubah status antar `draft/sent/rejected`. `accepted` hanya lewat `link_quotation_to_order`. Status invoice penawaran ikut sinkron (`draft -> sent`). |
| `delete_quotation` | `p_quotation_id uuid` | Tolak bila `order_id` terisi (sudah jadi order). Menghapus item dan invoice penawaran terkait (cascade). |
| `link_quotation_to_order` | `p_quotation_id uuid`, `p_order_id uuid` | Validasi keduanya milik user dan penawaran belum tertaut; isi `quotations.order_id`, set `status = 'accepted'`. Invoice penawaran otomatis ditandai `paid`. |
| `save_invoice` | `p_invoice_id uuid`, `p_header jsonb`, `p_items jsonb` | Digunakan untuk memperbarui rincian invoice yang sudah ada (misal catatan instruksi/rekening/ongkir). Tolak bila `source_type` tidak menempel ke penawaran/pesanan. |
| `set_invoice_status` | `p_invoice_id uuid`, `p_status text` | `draft -> sent -> paid`, `draft/sent -> cancelled`. Tidak mencatat transaksi akuntansi (lihat 8.4). |
| `delete_invoice` | `p_invoice_id uuid` | Hanya `draft` dan bila dokumen induknya masih draft. |
| `create_invoice_from_quotation` | `p_quotation_id uuid`, `p_invoice_type text default 'dp'`, `p_amount_due numeric default null` | Salin header dan item penawaran; `source_type = 'quotation'`; `amount_due` default = `grand_total * dp_percent/100` untuk `dp`. Dipanggil otomatis saat `save_quotation`. |
| `create_invoice_from_order` | `p_order_id uuid`, `p_invoice_type text default 'pelunasan'` | Snapshot dari `order_items` (`name_item`, `qty`, `price`), `ongkir` ke `shipping_cost`, `paid_amount` = jumlah `order_payments` order itu, `amount_due` = sisa. Dipanggil otomatis saat order dibuat/dikonversi. |
| `get_or_create_nota` | `p_order_id uuid` | Bila nota ada: kembalikan. Bila belum: tolak jika `orders.status <> 'lunas'` (pesan "Order belum lunas"), bangun `snapshot`, buat nomor, insert. Atomik (`unique (order_id)` sebagai pengaman terakhir). |

Tidak ada RPC `convert_quotation_to_order` (K9). Dua fungsi penjadwalan/tampilan tidak diperlukan: kedaluwarsa dihitung di UI.

---

## 3. Keterkaitan dengan Data Existing

| Dokumen | Sumber Data | Dibuat oleh | Akses UI |
|---------|------------|-------------|---------|
| Surat Penawaran | `quotations` + `quotation_items` | RPC `save_quotation` | Halaman `/quotations` |
| Invoice Penawaran | `invoices` (`source_type = 'quotation'`) | **Otomatis** saat `save_quotation` | Halaman `/invoices` & Tombol di `/quotations` |
| Invoice Pesanan | `invoices` (`source_type = 'order'`) | **Otomatis** saat order dibuat / bayar | Halaman `/invoices` & Modal detail order (`/orders`) |
| Kwitansi | `receipts` | **Trigger** pada `order_payments` | Modal detail order (per pembayaran) |
| Nota | `notas` (+ `snapshot`) | RPC `get_or_create_nota` | Modal detail order (jika lunas) |

```
quotation (dibuat/disimpan) --> OTOMATIS create_invoice_from_quotation (INV-DP)
quotation (disetujui pelanggan, buat order) --> link_quotation_to_order
order (dibuat)              --> OTOMATIS create_invoice_from_order (INV-Pelunasan/Pesanan)
order_payments (INSERT)     --> trigger: receipt otomatis + sinkronkan paid_amount invoice order
order_payments (DELETE)     --> FK cascade: receipt ikut terhapus
order (lunas, klik cetak)   --> get_or_create_nota --> nota
```

---

## 4. Fitur Cetak / PDF

### 4.1 Pendekatan Render

`window.print()` dengan varian `print:` Tailwind, **mengikuti pola `PrintReportModal.tsx` dan `PayrollSlipModal.tsx`** (K16). Tanpa dependensi baru, tanpa backend, tanpa email/WhatsApp. Pengguna memilih "Simpan sebagai PDF" di dialog cetak browser.

### 4.2 Opsi TTD dan Cap

State lokal React di panel Print Options (default `none`), tidak disimpan ke database.

| Mode | Tampilan | Kapan Dipakai |
|------|----------|---------------|
| `none` | Area TTD kosong | Ditandatangani dan dicap fisik setelah dicetak |
| `signature_only` | Gambar TTD saja | Dokumen digital dikirim manual |
| `signature_and_stamp` | TTD + cap semi-transparan | Dokumen digital resmi |

Gambar dari `profile.signatureUrl` dan `profile.stampUrl` (hook `useCompanySettings`). Cap: `position:absolute`, `opacity:0.75`, `mix-blend-mode:multiply`. **Bila URL null, render area kosong, bukan gambar rusak.** Bucket `company-assets` public read, jadi gambar tampil tanpa signed URL (`ARSITEKTUR_TEKNIS.md` §4).

```
DocumentPreviewModal
  |- PrintOptionsPanel
  |- [QuotationTemplate | InvoiceTemplate | ReceiptTemplate | NotaTemplate]
       |- SignatureArea (mode, signatureUrl, stampUrl)
```

### 4.3 Struktur File Frontend

```
src/
  components/documents/
    QuotationTemplate.tsx  InvoiceTemplate.tsx  ReceiptTemplate.tsx  NotaTemplate.tsx
    DocumentPreviewModal.tsx  PrintOptionsPanel.tsx  SignatureArea.tsx
    quotations/   (form multi-step, tabel daftar)   invoices/   (form, tabel daftar)
  hooks/   useQuotations.ts  useInvoices.ts  useReceipts.ts (READ ONLY)  useNotas.ts
  pages/   QuotationsPage.tsx  InvoicesPage.tsx
  utils/   terbilang.ts      (cek dulu tidak ada yang serupa; saat audit tidak ada)
  types.ts (tambah tipe dokumen; pola useAccounting.ts memakai (supabase as any))
```

Pakai utilitas yang ada: `formatIDR` (`src/utils/formatCurrency.ts`) dan helper tanggal lokal di `src/utils/dateHelpers.ts` (jangan `toISOString().split('T')[0]`).

### 4.4 Titik Masuk UI

| Konteks | Dokumen |
|---------|---------|
| `/quotations`, baris penawaran | Surat Penawaran |
| `/invoices`, baris invoice | Invoice |
| `OrderDetailModal`, baris riwayat bayar (sekitar baris 326 s.d. 345) | Cetak Kwitansi per pembayaran |
| `OrderDetailModal`, bagian bawah, jika `order.status === 'lunas'` | Cetak Nota |

---

## 5. Halaman dan UI Baru

### 5.1 `/quotations`
- Tabel: nomor, tanggal, pelanggan, sales, status (+ penanda kedaluwarsa), aksi. Filter: status, tanggal, sales.
- Form multi-step: (1) header, syarat bayar, lead time, rekening; (2) item dengan spesifikasi (baris dinamis, tanpa HPP); (3) catatan dan pratinjau.
- Aksi: Edit (selalu), Cetak/PDF, Buat Invoice dari Penawaran (`create_invoice_from_quotation`), Konversi ke Order, ubah status, Hapus (ditolak bila sudah jadi order).
- **Konversi ke Order:** membuka form order dengan nilai awal dari penawaran (pelanggan, sales, catatan; nama item sebagai petunjuk). Item order berbasis produk dan kain (`OrderModal.tsx`), jadi pemilihan produk tetap manual. Setelah order tersimpan, frontend memanggil `link_quotation_to_order`. Ini **menyentuh `OrderModal.tsx`** (komponen existing): agen menampilkan rencana perubahan dan menunggu persetujuan (Pertanyaan P5).

### 5.2 `/invoices`
- Tabel: nomor, tanggal, jatuh tempo, pelanggan, jenis, total, jumlah ditagih, status.
- Buat Invoice Baru: dari penawaran, dari order, atau manual. Cetak/PDF. Ubah status. Hapus hanya `draft`.

### 5.3 Kwitansi dan Nota (modal detail order)
- **Kwitansi:** tombol per pembayaran; `useReceipts` hanya `select ... where payment_id = ...`; tidak pernah insert.
- **Nota:** tombol muncul bila lunas; memanggil `get_or_create_nota`, lalu membuka pratinjau dari `snapshot`.

### 5.4 Navigasi
Sidebar grup **Transaksi** (tempat Pesanan, Keuangan, Akuntansi): tambah **Penawaran** (`/quotations`) dan **Invoice** (`/invoices`). Daftarkan route di `src/App.tsx` mengikuti pola route `/akuntansi`.

---

## 6. Aturan Bisnis Penting

1. Surat Penawaran tidak mengunci stok; hanya dokumen komersial.
2. Invoice pra-DP tidak otomatis membuat order.
3. Kwitansi dibuat dan dihapus otomatis oleh database (trigger + FK cascade). Frontend hanya membaca.
4. Nota hanya bisa dibuat setelah order lunas. Satu order satu nota. Reprint memakai `snapshot`.
5. Nomor tidak di-recycle. Dokumen yang sudah terbit tidak dihapus dari nomor urut (invoice terbit hanya dibatalkan).
6. Spesifikasi penawaran tidak sama dengan `order_items` final.
7. Penawaran bisa diedit kapan saja, tanpa versioning.
8. Opsi TTD/cap hanya di frontend; tidak disimpan.
9. Tidak ada kirim ke pelanggan dari dalam app.
10. Penawaran yang sudah tertaut ke order tidak bisa dihapus.

---

## 7. Fase Implementasi

Tiap migration: tampilkan SQL, **berhenti, tunggu persetujuan**, baru lanjut (lihat catatan §2).

### Fase 1: Surat Penawaran
- M1 `document_counters` + `generate_document_no` (internal)
- M2 `quotations` + `quotation_items` + RLS/grant select-only
- M3 RPC `save_quotation`, `set_quotation_status`, `delete_quotation`, `link_quotation_to_order`
- Frontend: `/quotations`, `QuotationTemplate`, `DocumentPreviewModal`, `PrintOptionsPanel`, `SignatureArea`, `terbilang.ts`, hook, types
- Langkah terakhir (terpisah): Konversi ke Order (menyentuh `OrderModal.tsx`)

### Fase 2: Invoice (prasyarat: Fase 1 lulus uji)
- M4 `invoices` + `invoice_items`
- M5 RPC `save_invoice`, `set_invoice_status`, `delete_invoice`, `create_invoice_from_quotation`, `create_invoice_from_order`
- Frontend: `/invoices`, `InvoiceTemplate`

### Fase 3: Kwitansi Otomatis dan Nota (prasyarat: Fase 1 dan 2 lulus uji)
- M6 `receipts` + `notas` + RLS/grant select-only
- M7 `fn_auto_create_receipt` + trigger `AFTER INSERT` + **backfill** pembayaran lama
- M8 RPC `get_or_create_nota`
- Frontend: `ReceiptTemplate`, `NotaTemplate`, tombol di `OrderDetailModal`, `useReceipts`, `useNotas`

Setiap fase: update `supabase/clear.sql`, `supabase/seed.sql`, `supabase/DATABASE.md`, uji smoke di DB lokal.

---

## 8. Catatan Teknis untuk Agen

### 8.1 Urutan Baca
Lihat `CATATAN_IMPLEMENTASI_DOKUMEN_ORDER.md` §1 (sumber tunggal urutan baca).

### 8.2 Aturan Wajib
Lihat `CATATAN_IMPLEMENTASI_DOKUMEN_ORDER.md` §2 (sumber tunggal aturan main). Ringkas: tidak ada tulis ke DB remote tanpa persetujuan; satu migration per langkah; migration terpasang tidak diedit; additive-only terhadap tabel existing; kwitansi oleh trigger; tidak ada dependensi baru; bila ragu, berhenti dan tanya.

### 8.3 Potensi Gotcha

| Gotcha | Penjelasan |
|--------|-----------|
| Tipe ID | `orders.id`, `order_payments.id`, `sales.id`, `company_bank_accounts.id` semuanya `uuid`. Bukan `bigint`. |
| `orders.order_id` vs `orders.id` | `order_id` = kode teks `ORD-0044` (varchar, unik per user); `id` = uuid kunci. FK selalu ke `orders.id`. |
| Trigger di dalam pembayaran | Error di `fn_auto_create_receipt` membatalkan `record_order_payment`. Uji kegagalan dan jalur sukses. |
| Cascade penghapusan order | `delete_order` (migration `20261008130000`) menghapus `orders`; semua FK baru ke `orders` harus `cascade` (receipts, notas) atau `set null` (quotations, invoices). Tambahkan ke uji cascade. |
| Overload fungsi | Jangan `create or replace` dengan signature berbeda tanpa `drop function` lama (`PGRST203`). Fungsi baru, jadi pastikan hanya satu signature. |
| Default privileges | Tabel baru otomatis dapat `GRANT ALL` ke `authenticated` lewat `alter default privileges`. Karena tabel dokumen select-only, **`revoke insert, update, delete`** secara eksplisit (pola `journal_entries`). |
| `generate_document_no` | Internal. Jangan `grant execute` ke `authenticated`. Dipanggil dari RPC/trigger `security definer`. |
| `GENERATED ALWAYS AS ... STORED` | Kolom `subtotal`/`grand_total` tidak boleh ikut di `INSERT`/`UPDATE`. Saat membangun dari `jsonb`, jangan sertakan. |
| Urutan `size_breakdown` | Iterasi `Object.entries`, urutkan manual S < M < L < XL < XXL, sisanya alfabet. |
| Backfill kwitansi | Jalankan idempotent. Nomor lama mengikuti urutan `payment_date, created_at`. |
| TTD/cap null | Guard null: area kosong, bukan gambar rusak. |
| Cap di cetak | Uji di pratinjau cetak browser (`mix-blend-mode`, `opacity`). |
| `window.print()` | Cek bagaimana `PrintReportModal`/`PayrollSlipModal` menyembunyikan sidebar/header saat cetak sebelum membuat modal baru. |
| `orders_with_balance` | Fitur ini tidak menambah kolom ke `orders`, jadi view tidak berubah. Jangan ubah `orders`. |
| Seed | `seed.sql` berjalan sebagai superuser tanpa `auth.uid()`; isi data contoh dokumen dengan `insert` langsung, bukan RPC. |
| Tanggal | Pakai `dateHelpers.ts`; jangan `toISOString().split('T')[0]` (bergeser UTC). |

### 8.4 Koneksi ke Akuntansi
- Invoice berstatus `paid` **tidak** mencatat transaksi. Yang mencatat tetap `record_order_payment`.
- Kwitansi adalah bukti bahwa `order_payments` sudah dicatat; tidak ada jurnal baru dari kwitansi.
- Nota adalah ringkasan, bukan dokumen akuntansi.
- Trigger auto-receipt dan semua RPC fitur ini **tidak boleh menyentuh** tabel akuntansi (`accounts`, `journal_*`, `accounting_settings`, `transactions`).
- Periode terkunci (`accounting_settings.locked_through`) tidak memengaruhi pembuatan kwitansi; yang diblokir tetap pencatatan/penghapusan pembayaran oleh RPC existing.

---

## 9. Pertanyaan Pemilik

### 9.1 Sudah dijawab (2026-10-13)
Tujuh keputusan di §0.2.

### 9.2 Baru dari audit 2026-10-14 (menunggu jawaban; default dipakai bila disetujui apa adanya)

| # | Pertanyaan | Default yang dirancang |
|---|-----------|------------------------|
| P1 | Nota di draft lama memuat breakdown ukuran, qty dikirim, dan alamat pengiriman, tetapi datanya tidak ada di order. Mau dihapus, atau mau ditambah input/data baru (perubahan lebih besar)? | **Dihapus** dari Nota. Nota hanya item, harga, pembayaran. |
| P2 | Invoice punya jenis `dp`/`pelunasan`/`penuh` dan jumlah ditagih (`amount_due`). Sesuai kebutuhan? | Ya, seperti §1.2. |
| P3 | Nomor dokumen mengikuti **tanggal dokumen** (kwitansi mengikuti tanggal bayar), bukan tanggal input. Setuju? | Ya (sama dengan nomor jurnal). |
| P4 | Penawaran yang sudah jadi order tidak boleh dihapus; invoice yang sudah terbit hanya bisa dibatalkan, tidak dihapus. Setuju? | Ya. |
| P5 | Konversi Penawaran ke Order mengisi header form order (pelanggan, sales, catatan), sedangkan item tetap dipilih manual dari produk. Boleh menyentuh `OrderModal.tsx`? | Ya, tetapi sebagai langkah terpisah di akhir Fase 1 setelah rencana perubahan disetujui. |
| P6 | Kwitansi untuk pembayaran yang **sudah ada** sebelum fitur ini dibuat otomatis lewat backfill. Setuju? | Ya. |
| P7 | Status "kedaluwarsa" hanya penanda tampilan, bukan status tersimpan. Setuju? | Ya. |

---

## 10. Daftar Migration yang Direncanakan

> Semua file di bawah **BELUM DIBUAT**. Migration terakhir di repo saat audit: `20261014100000_accounting_fixed_assets_and_period_close_fixes.sql` (53 file). Nomor baru harus lebih besar, misalnya mulai `20261015090000`.

| No | Fase | Nama File (rencana) | Isi |
|----|------|--------------------|----|
| M1 | 1 | `YYYYMMDDHHMMSS_document_counters.sql` | `document_counters` + `generate_document_no` (internal, `ON CONFLICT`) |
| M2 | 1 | `YYYYMMDDHHMMSS_quotations.sql` | `quotations` + `quotation_items` + RLS + grant select-only |
| M3 | 1 | `YYYYMMDDHHMMSS_quotation_rpcs.sql` | `save_quotation`, `set_quotation_status`, `delete_quotation`, `link_quotation_to_order` |
| M4 | 2 | `YYYYMMDDHHMMSS_invoices.sql` | `invoices` + `invoice_items` + RLS + grant select-only |
| M5 | 2 | `YYYYMMDDHHMMSS_invoice_rpcs.sql` | `save_invoice`, `set_invoice_status`, `delete_invoice`, `create_invoice_from_quotation`, `create_invoice_from_order` |
| M6 | 3 | `YYYYMMDDHHMMSS_receipts_notas.sql` | `receipts` + `notas` + RLS + grant select-only |
| M7 | 3 | `YYYYMMDDHHMMSS_receipt_trigger.sql` | `fn_auto_create_receipt` + trigger `AFTER INSERT` + backfill |
| M8 | 3 | `YYYYMMDDHHMMSS_nota_rpc.sql` | `get_or_create_nota` |

---

## 11. Penutupan Fitur (dokumentasi)

Setelah semua fase lulus uji, ikuti `docs/AGENT_INSTRUCTIONS.md` §4 dan §9: lebur ke **satu** file domain `docs/ORDER_DAN_KEUANGAN.md` (entri fitur sesuai template §6, tabel Daftar RPC/Trigger), perbarui `ARSITEKTUR_TEKNIS.md` §5 (tabel baru) dan §7, `supabase/DATABASE.md` (baris migration, jumlah migration/tabel), `docs/README.md` (route `/quotations`, `/invoices`, istilah baru), `README.md` root, `clear.sql`, `seed.sql`; lalu pindahkan file rancangan ini ke `docs/arsip/`.

---

Dokumen ini adalah rancangan. Implementasi dimulai hanya setelah pemilik menyetujui setiap fase secara eksplisit di chat.
