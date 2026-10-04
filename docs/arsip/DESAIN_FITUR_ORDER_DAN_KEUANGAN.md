# Desain Fitur Order, Pembayaran, dan Keuangan (Core Financial & Orders)

Dokumen ini merangkum rancangan database dan alur bisnis untuk fitur **Order (Pesanan)**, **Pembayaran Order**, **Keuangan (Transaksi Income/Expense)**, **Sales**, dan **Pengaturan Perusahaan**. Sumber: `supabase/migrations/20260101000002_core_financial_and_orders.sql`.

Fitur ini adalah lapisan transaksional yang duduk di atas Master Produk/Material/BOM (lihat `DESAIN_FITUR_PRODUK_DAN_COGS.md`) — tabel `products`, `materials`, `material_colors`, dan `product_fabric_slots` dari migration sebelumnya dipakai sebagai referensi di sini, terutama saat order dibuat.

---

## 1. Konsep Kunci: Dua Dimensi Status Order yang Terpisah

Tabel `orders` sengaja punya **dua kolom status berbeda dimensi**, jangan dicampur:

| Kolom | Mewakili | Nilai valid | Dihitung otomatis? |
|---|---|---|---|
| `status` | Status **pembayaran** | `belum_lunas`, `lunas` | Ya — trigger `recompute_status_on_order_change` + RPC `record_order_payment`/`delete_order_payment` |
| `production_status` | Status **pengerjaan** | `quotation`, `pending`, `production`, `ready`, `completed` | Tidak — diubah manual dari UI |

> **Catatan:** nilai `quotation` dan `pending` di `production_status` sudah disiapkan di skema, tapi **belum ada alur UI-nya**. Rencananya untuk fitur mendatang: surat penawaran (quotation) dan input order mandiri oleh sales dengan approval finance. Jangan dianggap sudah jalan sampai UI-nya benar-benar dibuat (lihat `AGENT_INSTRUCTIONS.md` poin 1).

`bonus_paid` pada `orders` adalah flag yang dipakai fitur Payroll (skema sales) untuk menandai apakah bonus sales dari order ini sudah cair — order harus `lunas` **dan** `production_status = completed` sebelum bonus dianggap layak cair (lihat `DESAIN_FITUR_PENGGAJIAN.md`).

---

## 2. Alur Order → Payment → Transaction (Ringkas)

```
[ Order dibuat ]
  trg_generate_order_code -> order_id otomatis "ORD-0001", "ORD-0002", dst (per user, incremental)
        │
        ▼
[ order_items ditambahkan ] (kategori → product → kain per slot → warna, lihat DESAIN_FITUR_PRODUK_DAN_COGS.md)
  trg_calc_order_item_total  -> total_price = qty * price (per item)
  trg_sync_order_total_price -> orders.total_price = SUM(order_items.total_price)
        │
        ▼
[ Pembayaran dicatat ] -> RPC record_order_payment(order_id, amount, payment_type: dp|pelunasan, ...)
  • Insert ke order_payments
  • Insert transactions (income, kategori "Pembayaran Order", auto-link ke order_id)
  • recompute_order_status() -> orders.status jadi 'lunas' kalau total dibayar >= (total_price + ongkir)
        │
        ▼
[ Kalau pembayaran salah input ] -> RPC delete_order_payment(payment_id)
  • Hapus baris order_payments
  • Hapus transactions terkait (via transaction_id yang disimpan di order_payments)
  • recompute_order_status() lagi
```

Poin desain penting: **satu sumber kebenaran total** — `orders.total_price` tidak pernah diedit manual, selalu hasil `SUM(order_items.total_price)` lewat trigger. Ini mencegah order total dan rincian item-nya "nyeleneh" beda angka.

`order_item_fabrics` menyimpan **snapshot** kain yang dipilih per order item (material, warna, qty pemakaian, harga saat itu, biaya baris) — terpisah dari `order_items.hpp_per_unit_snapshot`/`hpp_total_snapshot` yang menyimpan HPP total per pcs. Kolom `bahan` (free text lama) di `order_items` sudah digantikan alur ini dan dibiarkan nullable untuk kompatibilitas data lama, tidak dipakai form baru.

---

## 3. Keuangan (Financial)

- `categories` — kategori transaksi custom milik user, tipe `income`/`expense`.
- `transactions` — satu tabel untuk semua pemasukan/pengeluaran, baik manual maupun otomatis (dari pembayaran order, SPJ, supplier purchase, payroll, dll — lihat migration 3 & 4). Kolom `order_id` opsional menghubungkan balik ke order asal transaksi, dipakai untuk audit trail.
- Kategori "Pembayaran Order" dicari otomatis oleh `record_order_payment` (fallback kalau `p_category_id` tidak dikirim); kalau belum ada, transaksi tetap tercatat dengan `category_id` yang dikirim caller.

### Rekening Bank & Saldo Awal
- `company_settings` — satu baris per user (`user_id` sebagai primary key), menyimpan `saldo_awal` (modal awal sebelum sistem dipakai, dipakai untuk hitung saldo bank berjalan di dashboard), profil perusahaan, dan URL aset (logo/stempel/tanda tangan — filenya disimpan di Storage, lihat `DESAIN_FITUR_STORAGE.md`).
- `company_bank_accounts` — bisa lebih dari satu rekening, `is_primary` menandai rekening utama.

### Ganti Email Login
RPC `update_owner_email(p_new_email)` — mengubah email login pemilik akun langsung lewat `auth.users`/`auth.identities` **tanpa proses konfirmasi email** (sesuai kebutuhan single-tenant internal tool, bukan aplikasi publik). Validasi format email dan cek duplikasi dilakukan di dalam function.

---

## 4. Sales & Performa Penjualan

- `sales` — master data sales (nama, kontak, status aktif). `unique(user_id, name)` mencegah nama sales duplikat per akun.
- `orders.sales_id` menghubungkan order ke sales yang menjualnya (nullable — order boleh tanpa sales attribution).
- View `sales_performance` — agregat per sales: total order, total revenue, total dibayar, total piutang (`belum_lunas` saja). Dipakai untuk halaman performa sales di dashboard.

---

## 5. Skema Tabel Utama

```sql
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  order_id varchar not null,                    -- "ORD-0001", auto-generate
  sales_id uuid references public.sales(id) on delete set null,
  customer_name varchar not null,
  total_price numeric not null default 0,       -- SUM(order_items), jangan diedit manual
  ongkir numeric not null default 0,
  status varchar not null default 'belum_lunas',            -- status PEMBAYARAN
  production_status varchar not null default 'production',  -- status PENGERJAAN
  bonus_paid boolean not null default false,
  order_date date not null default current_date,
  constraint orders_status_check check (status in ('belum_lunas', 'lunas')),
  constraint orders_production_status_check check (
    production_status in ('quotation', 'pending', 'production', 'ready', 'completed')),
  constraint orders_user_id_order_id_key unique (user_id, order_id)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  category_id uuid references public.product_categories(id) on delete set null,
  name_item varchar not null,
  qty numeric not null default 1,
  price numeric not null default 0,
  total_price numeric not null default 0,       -- qty * price, via trigger
  hpp_per_unit_snapshot numeric,
  hpp_total_snapshot numeric,
  embroidery_cost_per_unit numeric not null default 0,
  embroidery_details jsonb                       -- detail mode flat/per-titik
);

create table public.order_item_fabrics (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  product_fabric_slot_id uuid references public.product_fabric_slots(id) on delete set null,
  material_id uuid not null references public.materials(id),
  material_color_id uuid references public.material_colors(id) on delete set null,
  usage_qty_snapshot numeric not null check (usage_qty_snapshot > 0),
  price_snapshot numeric not null check (price_snapshot >= 0),
  line_cost_snapshot numeric not null
);

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_type varchar not null check (payment_type in ('dp', 'pelunasan')),
  payment_method varchar,
  payment_date date not null default current_date,
  transaction_id uuid references public.transactions(id) on delete set null
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  title varchar(255) not null,
  amount numeric not null,
  type varchar(20) not null check (type in ('income', 'expense')),
  transaction_date date not null default current_date,
  description text
);
```

Semua tabel di atas pakai RLS `auth.uid() = user_id` dan policy `for all` (pola konsisten di seluruh project).

---

## 6. Function & Trigger Penting

| Nama | Jenis | Fungsi |
|---|---|---|
| `calc_order_item_total()` | trigger (before insert/update `order_items`) | `total_price = qty * price` |
| `sync_order_total_price()` | trigger (after i/u/d `order_items`) | Sinkronkan `orders.total_price` = SUM item |
| `generate_order_code()` | trigger (before insert `orders`) | Generate `order_id` "ORD-000N" kalau kosong |
| `recompute_order_status(order_id)` | RPC internal | Set `status` lunas/belum_lunas berdasar total dibayar vs grand total |
| `recompute_status_on_order_change()` | trigger (after update `total_price`/`ongkir`) | Panggil ulang `recompute_order_status` kalau total order berubah (misal item ditambah setelah DP masuk) |
| `record_order_payment(...)` | RPC (authenticated) | Catat pembayaran + transaksi income otomatis + update status |
| `delete_order_payment(payment_id)` | RPC (authenticated) | Batalkan pembayaran + hapus transaksi terkait + update status |
| `update_owner_email(new_email)` | RPC (authenticated) | Ganti email login tanpa konfirmasi email |

Fungsi trigger internal (`calc_order_item_total`, `sync_order_total_price`, `generate_order_code`, `recompute_status_on_order_change`) sengaja **di-revoke EXECUTE** dari semua role — hanya boleh jalan lewat trigger, bukan dipanggil langsung via RPC.

---

## 7. Views

- **`orders_with_balance`** — `orders` + nama sales + `grand_total` (`total_price + ongkir`) + `paid_amount` (SUM `order_payments`) + `remaining_amount` (piutang). Dipakai di list order & dashboard piutang.
- **`sales_performance`** — agregat performa per sales (lihat bagian 4).

> **Catatan histori:** `orders_with_balance` sempat ketinggalan kolom `production_status`/`bonus_paid` di baseline lama (view tidak ikut ter-update saat kolom baru ditambah ke `orders`). Sudah diperbaiki di baseline ini — kalau menambah kolom baru ke `orders` di masa depan, cek ulang apakah view ini perlu disesuaikan juga.

---

## 8. Keputusan Desain

- **Kenapa `hpp_per_unit_snapshot`/`hpp_total_snapshot` dan `order_item_fabrics` disimpan sebagai snapshot, bukan dihitung ulang saat ditampilkan?** Sama seperti alasan di `DESAIN_FITUR_PRODUK_DAN_COGS.md` — akurasi akuntansi historis. Kalau harga kain naik bulan depan, laporan laba-rugi order bulan lalu tidak boleh ikut berubah.
- **Kenapa status pembayaran dihitung otomatis (bukan field yang diedit manual)?** Supaya tidak ada human error — status selalu konsisten dengan jumlah pembayaran yang benar-benar tercatat di `order_payments`.
- **Kenapa `record_order_payment`/`delete_order_payment` jadi RPC (bukan insert/delete langsung dari frontend)?** Karena satu aksi ini harus atomic terhadap dua tabel sekaligus (`order_payments` + `transactions`) plus efek samping (recompute status). Tidak ada backend server terpisah, jadi atomicity ini harus dijamin di level Postgres function, bukan di frontend.
