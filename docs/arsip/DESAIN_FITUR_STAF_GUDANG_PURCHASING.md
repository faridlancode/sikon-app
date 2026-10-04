# Desain Fitur Staf, Gudang (Warehouse), dan Purchasing

Dokumen ini merangkum rancangan database dan alur bisnis untuk fitur **Staf & Karyawan**, **Gudang** (pergerakan stok & permintaan restock), dan **Purchasing** (dua jalur: SPJ dan Supplier Purchase). Sumber: `supabase/migrations/20260101000003_staff_warehouse_purchasing.sql`.

> **Catatan histori:** tabel lama `purchase_receipts` / `purchase_receipt_items` (iterasi awal alur pembelian) **sengaja tidak dibawa** ke baseline ini — sudah digantikan total oleh alur SPJ (`purchasing_reports`) dan Supplier Purchase (`supplier_purchases`) di bawah. Dikonfirmasi belum pernah dipakai di lapangan sebelum dihapus.

---

## 1. Staf & Karyawan

Tabel `staff` adalah master data karyawan lintas peran (purchasing, gudang, penjahit, tukang potong, sales, dst — kolom `role` bebas teks, bukan enum). Tiap staf punya `wage_type` yang menentukan cara hitung gajinya di fitur Payroll:

| `wage_type` | Skema upah | Contoh peran |
|---|---|---|
| `attendance` | Harian, berdasar absensi | Penjahit tetap, admin |
| `piecework` | Borongan, per tugas jahit/potong (lihat `piecework_tasks`) | Penjahit lepas, tukang potong |
| `sales` | Gaji harian + bonus per order | Staf sales |

**Aturan penting:** kalau `role = 'Sales'`, kolom `sales_id` **wajib diisi** (constraint `staff_sales_role_requires_sales_id`), merujuk ke tabel `sales` (dibuat di migration 2). Ini menjaga `sales` sebagai satu-satunya sumber kebenaran identitas sales — data kontak dan performa penjualan tetap di `sales`, `staff` hanya menambahkan sisi kepegawaian (gaji, absensi). Disiapkan juga untuk kemungkinan staf sales punya akun login sendiri di masa depan.

```sql
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  name varchar not null,
  phone varchar,
  role varchar,
  wage_type varchar not null default 'attendance'
    check (wage_type in ('attendance', 'piecework', 'sales')),
  daily_rate numeric not null default 0 check (daily_rate >= 0),
  sales_id uuid references public.sales(id) on delete set null,
  is_active boolean not null default true,
  constraint staff_sales_role_requires_sales_id check (role <> 'Sales' or sales_id is not null)
);
```

---

## 2. Gudang (Warehouse)

### Pergerakan Stok — `stock_movements`
Log semua perubahan stok material (dan warna kain spesifik lewat `material_color_id`, nullable untuk material non-kain).

- `movement_type`: `in` (masuk), `out` (keluar), `adjustment` (penyesuaian langsung ke angka `qty`).
- `status`: `pending` → `confirmed`/`cancelled`. Movement `pending` **belum** mengubah `stock_qty` di tabel `materials`/`material_colors` — baru efektif setelah dikonfirmasi lewat RPC `confirm_stock_movement`.
- `source_type` melacak asal movement: `initial` (stok awal), `purchase`, `order_consumption`, `manual`, `purchasing_report` (dari SPJ), `supplier_purchase`, `adjustment`.

RPC terkait:
- **`confirm_stock_movement(movement_id)`** — validasi stok cukup (khusus movement `out`), lalu update `stock_qty` di `materials` atau `material_colors` sesuai `movement_type`, set status jadi `confirmed`.
- **`cancel_stock_movement(movement_id)`** — batalkan movement yang masih `pending` (tidak mengubah stok karena memang belum pernah diterapkan).

### Permintaan Restock — `stock_requests`
Staf gudang (`requested_by`) mengajukan permintaan bahan yang kurang. Status: `pending` → `in_progress` → `fulfilled`/`cancelled`. `fulfillment_type` (`spj` atau `supplier_purchase`) dan kolom `purchasing_report_id`/`supplier_purchase_id` diisi begitu permintaan ini diambil alih oleh salah satu jalur purchasing — inilah jembatan yang menghubungkan permintaan gudang ke realisasi pembeliannya.

```sql
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  material_color_id uuid references public.material_colors(id) on delete set null,
  movement_type varchar not null check (movement_type in ('in', 'out', 'adjustment')),
  source_type varchar check (source_type in
    ('initial', 'purchase', 'order_consumption', 'manual', 'purchasing_report', 'supplier_purchase', 'adjustment')),
  source_id uuid,
  qty numeric not null check (qty >= 0),
  unit varchar not null,
  status varchar not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled')),
  confirmed_at timestamptz
);

create table public.stock_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.staff(id),
  material_id uuid not null references public.materials(id),
  material_color_id uuid references public.material_colors(id),
  quantity_needed numeric not null check (quantity_needed > 0),
  status varchar not null default 'pending'
    check (status in ('pending', 'in_progress', 'fulfilled', 'cancelled')),
  fulfillment_type varchar check (fulfillment_type is null or fulfillment_type in ('spj', 'supplier_purchase')),
  purchasing_report_id uuid,   -- FK ditambahkan belakangan (circular dependency dengan purchasing_reports)
  supplier_purchase_id uuid    -- FK ditambahkan belakangan
);
```

---

## 3. Purchasing — Dua Jalur Pembelian Bahan

Ada dua alur berbeda untuk membeli bahan baku, tergantung sifat pembeliannya:

```
                         ┌─────────────────────────────────────┐
                         │  Butuh bahan (stock_requests, opsional) │
                         └───────────────┬───────────────────────┘
                                          │
                 ┌────────────────────────┴────────────────────────┐
                 ▼                                                  ▼
       JALUR A: SPJ (retail, staf belanja)          JALUR B: Supplier Purchase (supplier tetap)
       ─────────────────────────────────            ──────────────────────────────
       1. give_cash_advance(staff, amount)           1. create_supplier_purchase(items)
          -> uang muka ke staf + expense                -> langsung tercatat sbg expense per
             transaction "Uang Muka Purchasing"            kategori (SELALU LUNAS DI MUKA)
       2. Staf belanja, input purchasing_reports +     2. Barang menyusul terpisah waktu,
          purchasing_report_items (dgn bukti foto)         status "ordered"
       3. Submit -> status 'submitted'                 3. receive_supplier_purchase(purchase_id)
       4. approve_purchasing_report(report_id)            -> saat barang tiba: stok masuk +
          -> stok masuk (stock_movements 'in')             update harga material + fulfill
          -> expense transaction per kategori item            stock_request terkait
          -> reversal uang muka (income, settle advance)
          -> reject_purchasing_report() kalau ditolak
```

### Jalur A: SPJ (Surat Pertanggungjawaban)
Dipakai saat staf purchasing diberi **uang muka** untuk belanja retail (toko/pasar), lalu melaporkan realisasi belanjanya dengan bukti.

- `cash_advances` — uang muka ke staf. Status `outstanding` → `settled` (settle terjadi otomatis saat SPJ terkait di-approve).
- `purchasing_reports` — laporan SPJ per staf, status `draft` → `submitted` → `approved`/`rejected`. `service_fee` untuk biaya jasa/transport tambahan (di luar harga barang).
- `purchasing_report_items` — rincian barang yang dibeli, tiap baris punya bukti foto (`receipt_photo_url`, disimpan di Storage — lihat `DESAIN_FITUR_STORAGE.md`) dan boleh ditautkan ke `stock_request_id` asalnya.

**RPC `approve_purchasing_report(report_id)`** — satu aksi approval memicu banyak efek sekaligus (atomic):
1. Untuk tiap item: insert `stock_movements` (`in`, `confirmed`) + update `stock_qty` di `materials`/`material_colors` + update harga terbaru material + fulfill `stock_request` terkait (kalau ada).
2. Insert `transactions` (expense) **per kategori** barang yang dibeli (di-group, bukan satu transaksi gabungan — supaya laporan keuangan per kategori tetap rapi).
3. Insert `transactions` (expense) untuk `service_fee` kalau ada.
4. Kalau SPJ ini berasal dari uang muka (`cash_advance_id`): insert `transactions` (income, "Reversal Uang Muka") dan set `cash_advances.status = 'settled'`.
5. Update `purchasing_reports.status = 'approved'`, `total_amount` dihitung ulang dari SUM item.

**RPC `reject_purchasing_report(report_id, reason)`** — hanya bisa untuk SPJ berstatus `submitted`, set status `rejected` + catat alasan di `notes`. Uang muka **tidak** di-settle (tetap `outstanding`, perlu SPJ baru atau penyelesaian manual).

### Jalur B: Supplier Purchase
Dipakai untuk pembelian ke supplier langganan/tetap — **selalu dibayar lunas di muka** saat order dibuat, barangnya baru menyusul (`status: ordered → received`).

- `supplier_purchases` + `supplier_purchase_items`.

**RPC `create_supplier_purchase(requested_by, supplier_name, payment_date, items[])`**:
1. Insert `supplier_purchases` (status `ordered`).
2. Insert semua `supplier_purchase_items`, hitung `total_price` per baris.
3. Insert `transactions` (expense) **per kategori** — langsung tercatat sebagai pengeluaran walau barang belum diterima (karena memang sudah dibayar lunas di muka).

**RPC `receive_supplier_purchase(purchase_id)`** — dipanggil saat barang benar-benar tiba:
1. Untuk tiap item: insert `stock_movements` (`in`, `confirmed`) + update `stock_qty` + update harga material terbaru + fulfill `stock_request` terkait.
2. Update `supplier_purchases.status = 'received'`, `received_date = now()`.

> **Beda kunci dengan SPJ:** Supplier Purchase mencatat expense **saat order dibuat** (karena lunas di muka), sedangkan stok baru bertambah saat **diterima**. SPJ sebaliknya — expense dan stok masuk **bersamaan saat approval**, karena laporan SPJ memang baru dibuat setelah belanja & barang sudah di tangan staf.

---

## 4. Skema Tabel Purchasing

```sql
create table public.cash_advances (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  amount numeric not null check (amount > 0),
  purpose text,
  date_given date not null default current_date,
  status varchar not null default 'outstanding' check (status in ('outstanding', 'settled')),
  transaction_id uuid references public.transactions(id) on delete set null
);

create table public.purchasing_reports (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  cash_advance_id uuid references public.cash_advances(id),
  report_date date not null default current_date,
  status varchar not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected')),
  total_amount numeric not null default 0,
  service_fee numeric not null default 0 check (service_fee >= 0),
  notes text
);

create table public.purchasing_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.purchasing_reports(id) on delete cascade,
  stock_request_id uuid references public.stock_requests(id),
  material_id uuid references public.materials(id),
  material_color_id uuid references public.material_colors(id),
  category_id uuid references public.categories(id),
  quantity numeric not null check (quantity > 0),
  unit varchar not null,
  unit_price numeric not null check (unit_price >= 0),
  total_price numeric not null,
  receipt_photo_url text
);

create table public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.staff(id),
  supplier_name varchar not null,
  payment_date date not null default current_date,
  received_date timestamptz,
  status varchar not null default 'ordered' check (status in ('ordered', 'received')),
  total_amount numeric not null default 0
);

create table public.supplier_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.supplier_purchases(id) on delete cascade,
  stock_request_id uuid references public.stock_requests(id),
  material_id uuid not null references public.materials(id),
  material_color_id uuid references public.material_colors(id),
  category_id uuid references public.categories(id),
  quantity numeric not null check (quantity > 0),
  unit varchar not null,
  unit_price numeric not null check (unit_price >= 0),
  total_price numeric not null
);
```

---

## 5. Keputusan Desain

- **Kenapa dua jalur purchasing (SPJ vs Supplier Purchase) dan bukan satu tabel generik?** Sifat bisnisnya beda secara fundamental: retail (uang muka dulu, nota menyusul, jumlah tidak pasti) vs supplier tetap (harga & qty sudah pasti di muka, selalu lunas duluan, barang menyusul). Memaksakan satu skema untuk keduanya akan bikin banyak kolom nullable yang membingungkan dan validasi jadi rumit.
- **Kenapa expense dicatat per kategori (grouped), bukan satu transaksi per SPJ/Supplier Purchase?** Supaya laporan Keuangan per kategori (misal "Kain" vs "Aksesoris" vs "Packaging") tetap akurat tanpa perlu breakdown manual.
- **Kenapa `stock_movements` punya status `pending`?** Memberi ruang untuk skenario di mana pencatatan stok butuh konfirmasi terpisah (misal double-check oleh admin) sebelum benar-benar mengubah angka stok — meski saat ini sebagian besar sumber (SPJ approval, supplier purchase receive) langsung insert dengan status `confirmed`.
