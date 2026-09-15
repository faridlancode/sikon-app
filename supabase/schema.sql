-- =========================================================
-- SIKon Financial — Skrip Schema Database (Supabase / Postgres)
-- Status: SUDAH DIJALANKAN di project Supabase Anda (gdrqfwqdxazrdrxumnhy)
-- File ini disertakan sebagai dokumentasi & referensi jika Anda
-- perlu mereplikasi schema ini di project Supabase lain.
-- =========================================================

-- 1. TABEL CATEGORIES
create table if not exists public.categories (
    id uuid primary key default gen_random_uuid (),
    user_id uuid references auth.users (id),
    name varchar not null,
    type varchar not null check (type in ('income', 'expense')),
    created_at timestamptz default now()
);

-- 2. TABEL TRANSACTIONS
create table if not exists public.transactions (
    id uuid primary key default gen_random_uuid (),
    user_id uuid not null references auth.users (id),
    category_id uuid references public.categories (id),
    title varchar not null,
    amount numeric not null,
    type varchar not null check (type in ('income', 'expense')),
    transaction_date date not null default current_date,
    description text,
    created_at timestamptz default now()
);

-- 3. ROW LEVEL SECURITY (RLS)
alter table public.categories enable row level security;

alter table public.transactions enable row level security;

-- Owner hanya bisa mengakses (SELECT/INSERT/UPDATE/DELETE) baris miliknya sendiri.
-- WITH CHECK memastikan user tidak bisa insert/update baris dengan user_id milik orang lain.
create policy "Manage own categories" on public.categories for all using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);

create policy "Manage own transactions" on public.transactions for all using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);

-- 4. MEMBUAT AKUN OWNER (Single Tenant)
-- Catatan: Insert langsung ke auth.users hanya untuk kebutuhan seed/dummy awal.
-- Cara yang direkomendasikan untuk produksi: gunakan Supabase Dashboard
-- (Authentication > Users > Add User) atau Admin API (auth.admin.createUser)
-- agar proses hashing password & trigger internal Supabase berjalan normal.
do $$
declare
  new_user_id uuid;
begin
  if not exists (select 1 from auth.users where email = 'owner@sikon.com') then
    new_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      new_user_id, 'authenticated', 'authenticated',
      'owner@sikon.com', crypt('password123', gen_salt('bf')),
      now(), now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Owner SIKon"}',
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), new_user_id::text, new_user_id,
      jsonb_build_object('sub', new_user_id::text, 'email', 'owner@sikon.com'),
      'email', now(), now(), now()
    );
  end if;
end $$;

-- 5. SEED KATEGORI DEFAULT UNTUK OWNER
insert into public.categories (user_id, name, type)
select u.id, c.name, c.type
from auth.users u
cross join (values
  ('Penjualan', 'income'),
  ('Jasa / Konsultasi', 'income'),
  ('Investasi', 'income'),
  ('Pendapatan Lain', 'income'),
  ('Operasional', 'expense'),
  ('Gaji Karyawan', 'expense'),
  ('Sewa Tempat', 'expense'),
  ('Marketing', 'expense'),
  ('Utilitas', 'expense'),
  ('Lain-lain', 'expense')
) as c(name, type)
where u.email = 'owner@sikon.com'
  and not exists (
    select 1 from public.categories existing where existing.user_id = u.id
  );

-- =========================================================
-- CARA MENGGANTI EMAIL & PASSWORD OWNER KE AKUN RESMI PERUSAHAAN:
-- Opsi A (disarankan): Supabase Dashboard > Authentication > Users >
--   klik user owner@sikon.com > "Send password recovery" atau edit
--   langsung email/password dari panel tersebut.
-- Opsi B: gunakan Admin API dari server terpercaya (bukan dari frontend):
--   supabase.auth.admin.updateUserById(userId, { email, password })
-- =========================================================

-- =========================================================
-- FITUR ORDER — Skrip Schema Tambahan
-- Status: SUDAH DIJALANKAN di project Supabase Anda.
-- =========================================================

-- 6. COMPANY SETTINGS (saldo awal kas/bank, dipakai kartu "Total Uang di Bank")
create table if not exists public.company_settings (
    user_id uuid primary key references auth.users (id),
    saldo_awal numeric not null default 0,
    updated_at timestamptz default now()
);

alter table public.company_settings enable row level security;

create policy "Manage own settings" on public.company_settings for all using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);

-- 7. ORDERS
create table if not exists public.orders (
    id uuid primary key default gen_random_uuid (),
    user_id uuid not null references auth.users (id),
    order_id varchar not null, -- kode order tampil ke user, mis. ORD-0001 (auto-generate)
    sales_name varchar,
    customer_name varchar not null,
    total_price numeric not null default 0, -- subtotal item, auto-sinkron dari order_items via trigger
    ongkir numeric not null default 0,
    status varchar not null default 'belum_lunas' check (
        status in ('belum_lunas', 'lunas')
    ),
    order_date date not null default current_date,
    created_at timestamptz default now(),
    unique (user_id, order_id)
);

alter table public.orders enable row level security;

create policy "Manage own orders" on public.orders for all using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);

-- 8. ORDER ITEMS
create table if not exists public.order_items (
    id uuid primary key default gen_random_uuid (),
    order_id uuid not null references public.orders (id) on delete cascade,
    user_id uuid not null references auth.users (id),
    name_item varchar not null,
    bahan varchar,
    qty numeric not null default 1,
    price numeric not null default 0,
    total_price numeric not null default 0, -- auto-dihitung: qty * price (trigger)
    created_at timestamptz default now()
);

alter table public.order_items enable row level security;

create policy "Manage own order items" on public.order_items for all using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);

-- 8a. PRODUCT CATEGORIES
-- Berbeda dari categories keuangan yang dipakai untuk income/expense.
create table if not exists public.product_categories (
    id uuid primary key default gen_random_uuid (),
    user_id uuid not null references auth.users (id) on delete cascade,
    name varchar not null,
    created_at timestamptz not null default now(),
    unique (user_id, name)
);

alter table public.product_categories enable row level security;

create policy "Manage own product categories" on public.product_categories for all using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);

alter table public.order_items
add column if not exists category_id uuid references public.product_categories (id) on delete set null;

create index if not exists order_items_category_id_idx on public.order_items (category_id);

-- 9. ORDER PAYMENTS (DP / Pelunasan) — otomatis tertaut ke transactions
create table if not exists public.order_payments (
    id uuid primary key default gen_random_uuid (),
    order_id uuid not null references public.orders (id) on delete cascade,
    user_id uuid not null references auth.users (id),
    amount numeric not null check (amount > 0),
    payment_type varchar not null check (
        payment_type in ('dp', 'pelunasan')
    ),
    payment_method varchar,
    payment_date date not null default current_date,
    transaction_id uuid references public.transactions (id) on delete set null,
    created_at timestamptz default now()
);

alter table public.order_payments enable row level security;

create policy "Manage own order payments" on public.order_payments for all using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);

-- 10. Tautkan transactions ke order (untuk traceability di tabel Transaksi)
alter table public.transactions
add column if not exists order_id uuid references public.orders (id) on delete set null;

-- 11. Trigger: auto-hitung total_price item, sinkronkan total order, auto-generate kode order,
--     dan hitung ulang status ('lunas' jika total dibayar >= total_price + ongkir).
--     Lihat migration "orders_triggers_and_rpc_functions" untuk definisi lengkap function-nya:
--     calc_order_item_total(), sync_order_total_price(), generate_order_code(),
--     recompute_order_status(), recompute_status_on_order_change().

-- 12. RPC record_order_payment(...) — dipanggil dari frontend saat "Catat Pembayaran".
--     Dalam SATU transaksi database: insert ke transactions (income) + insert ke order_payments
--     + hitung ulang status order. Kategori transaksi otomatis: "Pembayaran Order".
-- 13. RPC delete_order_payment(...) — hapus pembayaran + transaksi terkait + hitung ulang status.
--     Kedua RPC ini SECURITY DEFINER namun tetap memvalidasi auth.uid() = user_id secara manual,
--     dan hanya di-GRANT ke role "authenticated" (bukan "anon").

-- 14. View orders_with_balance (security_invoker) — menggabungkan orders dengan total dibayar
--     (SUM order_payments) dan sisa tagihan (piutang), dipakai untuk tabel Order & kartu
--     "Tagihan / Piutang" di Financial.

-- Kategori & saldo awal
insert into
    public.categories (user_id, name, type)
select u.id, 'Pembayaran Order', 'income'
from auth.users u
where
    u.email = 'owner@sikon.com'
    and not exists (
        select 1
        from public.categories c
        where
            c.user_id = u.id
            and c.name = 'Pembayaran Order'
    );

insert into
    public.company_settings (user_id, saldo_awal)
select id, 0
from auth.users
where
    email = 'owner@sikon.com'
on conflict (user_id) do nothing;

-- =========================================================
-- FITUR INFORMASI PERUSAHAAN — Skrip Schema Tambahan
-- Status: SUDAH DIJALANKAN di project Supabase Anda.
-- =========================================================

-- 15. Perluas company_settings dengan profil perusahaan lengkap
alter table public.company_settings
add column if not exists company_name varchar;

alter table public.company_settings
add column if not exists address text;

alter table public.company_settings
add column if not exists phone varchar;

alter table public.company_settings
add column if not exists logo_url text;

alter table public.company_settings
add column if not exists stamp_url text;

alter table public.company_settings
add column if not exists signature_url text;

-- 16. Rekening bank perusahaan (satu perusahaan bisa punya banyak rekening)
create table if not exists public.company_bank_accounts (
    id uuid primary key default gen_random_uuid (),
    user_id uuid not null references auth.users (id),
    bank_name varchar not null,
    account_number varchar not null,
    account_holder_name varchar not null,
    is_primary boolean not null default false,
    created_at timestamptz default now()
);

alter table public.company_bank_accounts enable row level security;

create policy "Manage own bank accounts" on public.company_bank_accounts for all using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);

-- 17. Storage bucket untuk logo / stempel / tanda tangan
-- Bucket PUBLIC (read) karena gambar-gambar ini memang akan tampil di dokumen/surat
-- yang dicetak atau dibagikan. Upload/update/delete tetap dibatasi RLS ke folder
-- milik user sendiri (path wajib berformat "{user_id}/nama-file.ext").
insert into
    storage.buckets (id, name, public)
values (
        'company-assets',
        'company-assets',
        true
    )
on conflict (id) do nothing;

create policy "Public read company assets" on storage.objects for
select using (bucket_id = 'company-assets');

create policy "Owner manage own company assets" on storage.objects for all using (
    bucket_id = 'company-assets'
    and (storage.foldername (name)) [1] = auth.uid ()::text
)
with
    check (
        bucket_id = 'company-assets'
        and (storage.foldername (name)) [1] = auth.uid ()::text
    );

-- 18. RPC update_owner_email(p_new_email) — ganti email login TANPA alur konfirmasi
-- standar Supabase (yang biasanya kirim email verifikasi ke alamat lama & baru).
-- SECURITY DEFINER, tapi tetap memvalidasi auth.uid() di dalam function, dan hanya
-- di-GRANT ke role "authenticated". Update password tetap pakai jalur standar
-- supabase.auth.updateUser({ password }) dari client (tidak perlu RPC/konfirmasi
-- karena user sudah dalam sesi login).
create or replace function public.update_owner_email(p_new_email varchar)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if p_new_email is null or p_new_email = '' or p_new_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Format email tidak valid';
  end if;

  if exists (select 1 from auth.users where email = p_new_email and id <> v_user_id) then
    raise exception 'Email sudah digunakan akun lain';
  end if;

  update auth.users
  set email = p_new_email, email_confirmed_at = now(), updated_at = now()
  where id = v_user_id;

  update auth.identities
  set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(p_new_email)),
      updated_at = now()
  where user_id = v_user_id and provider = 'email';
end;
$$;

revoke
execute on function public.update_owner_email (varchar)
from public, anon;

grant
execute on function public.update_owner_email (varchar) to authenticated;