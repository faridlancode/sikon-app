# Catatan Teknis: Grant Table Privileges ke Role `authenticated`

Migration ini bukan fitur bisnis baru, melainkan **perbaikan bug infrastruktur** yang berdampak ke seluruh fitur lain. Didokumentasikan terpisah karena baru ditemukan saat proses konsolidasi baseline dan penting untuk dipahami siapa pun yang menambah tabel baru ke depannya. Sumber: `supabase/migrations/20260101000006_grant_table_privileges.sql`.

---

## 1. Masalahnya

Baseline `...0001` sampai `...0005` membuat semua tabel lengkap dengan Row Level Security (RLS) policy (`auth.uid() = user_id`), tapi **tidak pernah menjalankan `GRANT`** di level tabel ke role `authenticated`.

Akibatnya: PostgreSQL menolak akses dengan error `42501 permission denied for table ...` di hampir semua tabel — **walau RLS policy-nya sendiri sudah benar**. Ini karena urutan evaluasi di Postgres:

```
1. Cek table-level privilege (GRANT/REVOKE)  <-- ditolak di sini, RLS belum sempat dicek
2. Baru kalau lolos, RLS policy dievaluasi
```

Tanpa `GRANT SELECT/INSERT/UPDATE/DELETE` ke `authenticated`, request apa pun dari frontend (yang jalan sebagai role `authenticated` lewat `@supabase/supabase-js`) ditolak di langkah 1, sebelum RLS punya kesempatan mengizinkan atau menolak berdasarkan kepemilikan data.

---

## 2. Perbaikan

```sql
grant select, insert, update, delete on
  public.product_categories, public.material_categories, public.materials,
  public.material_colors, public.products, public.product_materials,
  public.product_fabric_slots, public.categories, public.sales, public.orders,
  public.order_items, public.order_item_fabrics, public.order_payments,
  public.transactions, public.company_settings, public.company_bank_accounts,
  public.staff, public.stock_movements, public.stock_requests, public.cash_advances,
  public.purchasing_reports, public.purchasing_report_items, public.supplier_purchases,
  public.supplier_purchase_items, public.weekly_payrolls, public.payroll_items,
  public.piecework_tasks
to authenticated;

-- Supaya tabel baru ke depannya otomatis dapat grant yang sama tanpa perlu diingat manual:
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
```

Total 27 tabel dasar diberi grant penuh (SELECT/INSERT/UPDATE/DELETE) ke role `authenticated`. Role `anon` **sengaja tidak** diberi akses sama sekali — semua data di aplikasi ini memang hanya untuk user yang sudah login, tidak ada fitur publik tanpa autentikasi.

RLS (`auth.uid() = user_id`) tetap jadi **lapisan isolasi data utama** — GRANT di sini hanya membuka pintu masuk di level tabel; siapa boleh lihat/ubah baris mana tetap sepenuhnya dikontrol oleh RLS policy seperti biasa.

---

## 3. Dua Bug Kecil Lain yang Ikut Ditemukan & Diperbaiki

Saat proses konsolidasi baseline (reset ~20 file migration lama jadi 6 file bersih), ditemukan 2 bug tambahan yang tidak berhubungan langsung dengan grant, tapi diperbaiki di baseline yang sama:

1. **View `orders_with_balance`** ketinggalan kolom `production_status`/`bonus_paid` — lupa di-update saat kedua kolom itu ditambahkan ke tabel `orders`. Sudah diperbaiki di `20260101000002` (lihat `DESAIN_FITUR_ORDER_DAN_KEUANGAN.md` bagian Views).
2. **Function trigger `check_payroll_period_overlap`** masih punya EXECUTE grant ke `anon`/`authenticated`, padahal seharusnya cuma dipanggil internal oleh trigger, bukan lewat RPC langsung. Sudah di-revoke di `20260101000004` (lihat `DESAIN_FITUR_PENGGAJIAN.md` bagian 4).

---

## 4. Keputusan Desain

- **Kenapa grant penuh ke `authenticated` dianggap aman?** Karena RLS tetap jadi lapisan isolasi utama — `authenticated` boleh "mengetuk pintu" tabel mana pun, tapi RLS yang menentukan baris mana yang benar-benar terlihat/bisa diubah (`auth.uid() = user_id`). Tanpa RLS, grant seluas ini baru berbahaya.
- **Kenapa pakai `alter default privileges` juga, bukan cuma `grant` sekali?** Supaya kesalahan yang sama tidak terulang di masa depan — kalau ada developer (manusia atau AI agent) yang lupa menambahkan `grant` saat bikin migration tabel baru, Postgres tetap otomatis memberi privilege yang sama selama tabel itu dibuat oleh role yang sama dengan yang menjalankan migration ini.
- **Kenapa ini jadi migration terpisah, bukan ditambal langsung ke `...0001`–`...0005`?** Sesuai aturan di `AGENT_INSTRUCTIONS.md` — migration file yang sudah ada **tidak boleh diedit**, perbaikan apa pun harus jadi file migration baru, walau baseline-nya baru saja dibuat di sesi yang sama.
