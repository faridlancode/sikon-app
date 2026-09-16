-- =========================================================================
-- SIKon — SEED DATA UNTUK BRANCH DEV (opsional)
-- =========================================================================
-- Jalankan file ini SETELAH full-schema.sql, di project/branch yang MASIH
-- KOSONG. Skrip ini membuat:
--   1. Satu akun Owner untuk login di branch dev (email/password dummy,
--      silakan ganti sesuai kebutuhan Anda).
--   2. Kategori transaksi default (income & expense) + kategori khusus
--      "Pembayaran Order" yang dipakai otomatis oleh RPC record_order_payment.
--   3. Saldo awal kas/bank = 0 (bisa diubah nanti dari halaman Financial).
--
-- GANTI EMAIL & PASSWORD DI BAWAH sebelum dijalankan kalau perlu.
-- =========================================================================

do $$
declare
  v_dev_email varchar := 'dev@sikon.com';
  v_dev_password varchar := 'password123';
  v_user_id uuid;
begin
  if not exists (select 1 from auth.users where email = v_dev_email) then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated',
      v_dev_email, crypt(v_dev_password, gen_salt('bf')),
      now(), now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Owner Dev"}',
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id::text, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_dev_email),
      'email', now(), now(), now()
    );
  else
    select id into v_user_id from auth.users where email = v_dev_email;
  end if;

  -- Kategori default
  insert into public.categories (user_id, name, type)
  select v_user_id, c.name, c.type
  from (values
    ('Penjualan', 'income'),
    ('Jasa / Konsultasi', 'income'),
    ('Investasi', 'income'),
    ('Pendapatan Lain', 'income'),
    ('Pembayaran Order', 'income'),   -- dipakai otomatis oleh RPC record_order_payment
    ('Operasional', 'expense'),
    ('Gaji Karyawan', 'expense'),
    ('Sewa Tempat', 'expense'),
    ('Marketing', 'expense'),
    ('Utilitas', 'expense'),
    ('Lain-lain', 'expense')
  ) as c(name, type)
  where not exists (
    select 1 from public.categories existing
    where existing.user_id = v_user_id and existing.name = c.name
  );

  -- Saldo awal
  insert into public.company_settings (user_id, saldo_awal, company_name)
  values (v_user_id, 0, 'SIKon Dev')
  on conflict (user_id) do nothing;

  raise notice 'Akun dev siap: % / %', v_dev_email, v_dev_password;
end $$;
