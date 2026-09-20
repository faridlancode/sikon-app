-- =========================================================================
-- SIKon — Seed Data (jalankan SETELAH ke-5 file clean baseline di atas)
-- =========================================================================

do $$
declare
  v_email varchar := 'owner@sikon.com';
  v_password varchar := 'password123';
  v_user_id uuid;
begin
  if not exists (select 1 from auth.users where email = v_email) then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, crypt(v_password, gen_salt('bf')), now(), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"Owner SIKon"}',
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user_id::text, v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_email), 'email', now(), now(), now());
  else
    select id into v_user_id from auth.users where email = v_email;
  end if;

  insert into public.categories (user_id, name, type)
  select v_user_id, c.name, c.type
  from (values
    ('Penjualan', 'income'), ('Jasa / Konsultasi', 'income'), ('Investasi', 'income'),
    ('Pendapatan Lain', 'income'), ('Pembayaran Order', 'income'), ('Uang Muka Purchasing', 'expense'),
    ('Gaji Karyawan', 'expense'), ('Operasional', 'expense'), ('Sewa Tempat', 'expense'),
    ('Marketing', 'expense'), ('Utilitas', 'expense'), ('Lain-lain', 'expense')
  ) as c(name, type)
  where not exists (select 1 from public.categories e where e.user_id = v_user_id and e.name = c.name);

  insert into public.company_settings (user_id, saldo_awal, company_name)
  values (v_user_id, 0, 'SIKon')
  on conflict (user_id) do nothing;

  raise notice 'Akun owner siap: % / %', v_email, v_password;
end $$;
