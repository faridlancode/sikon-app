# Desain Fitur Penggajian (Payroll)

Dokumen ini merangkum rancangan database dan alur bisnis untuk fitur **Penggajian Mingguan** dengan 3 skema upah berbeda. Sumber: `supabase/migrations/20260101000004_payroll.sql`.

---

## 1. Tiga Skema Upah

`staff.wage_type` (dari migration 3) menentukan skema mana yang dipakai per karyawan:

| `wage_type` | Cara hitung | Sumber data |
|---|---|---|
| **`attendance`** (harian) | `attendance_days × daily_rate` | Input manual jumlah hari hadir per periode |
| **`piecework`** (borongan) | SUM `total_wage` dari tugas jahit/potong yang `completed` di periode berjalan | Tabel `piecework_tasks`, terhubung ke `orders` & `products` |
| **`sales`** | `daily_rate` harian + bonus per order yang cair | `sales_total_qty` × potensi bonus, dengan skema pengurangan kalau di bawah target |

Kalender kerja yang dipakai untuk hitung hari kerja adalah **6 hari (Senin–Sabtu, Minggu libur)** — ini aturan bisnis yang diterapkan di layer frontend (perhitungan `attendance_days`), bukan constraint di database.

---

## 2. Payroll Mingguan — Struktur

```
weekly_payrolls (1 periode = 1 baris)
   │  period_start, period_end, payment_date
   │  sales_target_qty          -> target qty order untuk skema bonus sales periode ini
   │  sales_below_target_scheme -> 'none' | 'half' (kalau sales di bawah target, bonus dipotong berapa)
   │  status: draft -> paid
   │
   └─▶ payroll_items (1 baris per staf per periode)
          wage_type (snapshot dari staff.wage_type saat payroll dibuat)
          attendance_days, daily_rate, base_amount        -> untuk skema attendance
          piecework_amount                                -> untuk skema piecework (dari piecework_tasks)
          sales_total_qty, sales_potential_bonus,
          sales_bonus_percentage, sales_bonus_amount       -> untuk skema sales
          allowances, deductions
          take_home_pay                                   -> total akhir yang dibayarkan ke staf ini
```

`piecework_tasks` dicatat **berkelanjutan** (bukan hanya saat payroll dibuat) — tiap kali penjahit/tukang potong menyelesaikan sebuah tugas yang terhubung ke `order_id` dan `product_id` tertentu, satu baris `piecework_tasks` dibuat dengan status `completed`. Baru saat payroll dibayar, baris-baris ini "diklaim" (di-link ke `payroll_id` dan status berubah jadi `paid`) supaya tidak terhitung dobel di payroll periode berikutnya.

```sql
create table public.piecework_tasks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  task_type varchar not null check (task_type in ('cutting', 'sewing', 'finishing', 'other')),
  qty integer not null check (qty > 0),
  rate_per_unit numeric not null check (rate_per_unit >= 0),
  total_wage numeric not null check (total_wage >= 0),
  status varchar not null default 'completed' check (status in ('pending', 'completed', 'paid')),
  payroll_id uuid references public.weekly_payrolls(id) on delete set null,
  paid_at timestamptz
);
```

---

## 3. Pencairan Payroll — RPC `pay_weekly_payroll`

**`pay_weekly_payroll(payroll_id)`** — satu aksi "Bayar" memicu:
1. Validasi payroll belum pernah dibayar (`status <> 'paid'`).
2. Cari/buat kategori transaksi "Gaji Karyawan" (expense).
3. Insert satu `transactions` (expense) untuk **total gabungan** seluruh payroll periode ini (bukan per staf — satu baris pengeluaran kas mewakili satu event "bayar gaji mingguan").
4. Untuk semua `payroll_items` dengan `wage_type = 'piecework'`: tandai `piecework_tasks` milik staf terkait yang masih `completed` jadi `paid`, link ke `payroll_id`.
5. Update `weekly_payrolls.status = 'paid'`, simpan `transaction_id`.

```sql
create function public.pay_weekly_payroll(p_payroll_id uuid)
returns jsonb ...
```
Mengembalikan `{payroll_id, transaction_id, status: 'paid'}` supaya frontend bisa langsung konfirmasi & navigasi ke transaksi terkait.

---

## 4. Pencegahan Payroll Dobel — Trigger `check_payroll_period_overlap`

Trigger `before insert or update of period_start, period_end on weekly_payrolls` menolak periode baru yang **tumpang tindih** dengan periode payroll lain milik user yang sama:

```sql
where user_id = new.user_id
  and id <> new.id
  and period_start <= new.period_end
  and period_end >= new.period_start
```

Ini mencegah kejadian tidak sengaja bikin 2 payroll untuk rentang tanggal yang sama (misal double-klik "Buat Payroll Baru"), yang bisa menyebabkan piecework tasks atau bonus sales terhitung dobel.

> **Catatan keamanan:** fungsi trigger ini sengaja **di-revoke EXECUTE** dari `public`/`anon`/`authenticated` — hanya boleh dijalankan otomatis oleh trigger, bukan dipanggil langsung lewat RPC. Di baseline lama, grant ini sempat kelewat (fungsi trigger punya EXECUTE grant ke `anon` yang seharusnya tidak perlu) — sudah diperbaiki di baseline ini.

---

## 5. Skema Tabel

```sql
create table public.weekly_payrolls (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  payment_date date not null,
  total_amount numeric not null default 0 check (total_amount >= 0),
  sales_target_qty integer not null default 0 check (sales_target_qty >= 0),
  sales_below_target_scheme varchar not null default 'none'
    check (sales_below_target_scheme in ('none', 'half')),
  status varchar not null default 'draft' check (status in ('draft', 'paid')),
  transaction_id uuid references public.transactions(id) on delete set null,
  notes text
);

create table public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_id uuid not null references public.weekly_payrolls(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  wage_type varchar not null check (wage_type in ('attendance', 'piecework', 'sales')),
  attendance_days integer not null default 0,
  daily_rate numeric not null default 0,
  base_amount numeric not null default 0,
  piecework_amount numeric not null default 0,
  sales_total_qty integer not null default 0,
  sales_potential_bonus numeric not null default 0,
  sales_bonus_percentage numeric not null default 100,
  sales_bonus_amount numeric not null default 0,
  allowances numeric not null default 0,
  deductions numeric not null default 0,
  take_home_pay numeric not null default 0
);
```

---

## 6. Keputusan Desain

- **Kenapa satu `transactions` untuk seluruh payroll, bukan per staf?** Merefleksikan kenyataan operasional — gaji mingguan biasanya dicairkan sekaligus dari satu sumber kas, jadi satu baris pengeluaran lebih sesuai dengan arus kas riil. Rincian per staf tetap lengkap tersimpan di `payroll_items` untuk kebutuhan audit/laporan per karyawan.
- **Kenapa `piecework_tasks` dicatat real-time (bukan diinput manual saat bikin payroll)?** Supaya penjahit/tukang potong bisa dilacak produktivitasnya kapan saja (bukan cuma saat payroll), dan supaya total borongan otomatis akurat tanpa perlu rekap manual tiap minggu.
- **Kenapa bonus sales terkait ke `orders.bonus_paid` (lihat `DESAIN_FITUR_ORDER_DAN_KEUANGAN.md`)?** Bonus sales baru layak cair kalau order sudah **lunas** dan pengerjaannya **completed** — dua syarat ini ada di tabel `orders`, bukan di payroll, jadi payroll perlu membaca status order saat menghitung `sales_potential_bonus`.
