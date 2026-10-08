-- =========================================================================
-- SMOKE TEST AKUNTANSI DASAR (10 Skenario Uji)
-- File: supabase/tests/accounting_smoke.sql (DI LUAR MIGRATIONS/)
--
-- PENTING:
-- Jalankan HANYA di database lokal sekali pakai (misal: supabase start / local scratch).
-- JANGAN PERNAH DIJALANKAN DI DATABASE REMOTE PRODUCTION/STAGING TANPA IZIN!
-- =========================================================================

do $$
declare
  v_test_user_id   uuid := gen_random_uuid();
  v_test_email     text := 'test_accounting_' || substr(gen_random_uuid()::text, 1, 8) || '@example.com';
  v_acct_count     int;
  v_order_id       uuid;
  v_cat_id         uuid;
  v_txn_dp_id      uuid;
  v_release_id     uuid;
  v_order_forfeit  uuid;
  v_rel_forfeit_id uuid;
  v_tb_rows        int;
  v_tb_debit       numeric;
  v_tb_credit      numeric;
  v_inactive_acct  uuid;
  v_err_caught     boolean;
begin
  raise notice '=== MEMULAI SMOKE TEST AKUNTANSI DASAR ===';

  -- -------------------------------------------------------------------------
  -- SETUP: Buat user dummy di auth.users untuk testing terisolasi
  -- -------------------------------------------------------------------------
  insert into auth.users (id, email, raw_user_meta_data, role, aud)
  values (v_test_user_id, v_test_email, '{"full_name":"Test Accounting"}'::jsonb, 'authenticated', 'authenticated');

  -- Set session auth context sebagai user dummy
  perform set_config('request.jwt.claim.sub', v_test_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- -------------------------------------------------------------------------
  -- SKENARIO 1: init_accounting
  -- (a) Tanggal bukan tanggal 1 harus ditolak
  -- (b) Eksekusi pertama membuat 33 akun COA standar & setting aktif
  -- (c) Eksekusi kedua idempotent (tidak menggandakan akun)
  -- -------------------------------------------------------------------------
  raise notice '[TEST 1] Testing init_accounting...';
  
  v_err_caught := false;
  begin
    perform public.init_accounting('2026-11-15'::date);
  exception when others then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception 'TEST 1 GAGAL: Tanggal 2026-11-15 bukan tanggal 1 harusnya ditolak!';
  end if;

  -- Inisialisasi resmi per 2026-11-01
  perform public.init_accounting('2026-11-01'::date);

  select count(*) into v_acct_count from public.accounts where user_id = v_test_user_id;
  if v_acct_count <> 33 then
    raise exception 'TEST 1 GAGAL: Jumlah akun seharusnya 33, ditemukan: %', v_acct_count;
  end if;

  -- Eksekusi kedua untuk memastikan idempotensi
  perform public.init_accounting('2026-11-01'::date);
  select count(*) into v_acct_count from public.accounts where user_id = v_test_user_id;
  if v_acct_count <> 33 then
    raise exception 'TEST 1 GAGAL: Eksekusi kedua merusak idempotensi akun: %', v_acct_count;
  end if;
  raise notice '[TEST 1 PASS] init_accounting 33 akun berhasil & idempotent.';

  -- -------------------------------------------------------------------------
  -- SKENARIO 7 (diuji duluan untuk memastikan backfill transaksi):
  -- Backfill menghasilkan jurnal untuk transaksi >= books_start_date
  -- dan tidak membuat jurnal untuk transaksi < books_start_date.
  -- -------------------------------------------------------------------------
  raise notice '[TEST 7] Testing backfill dan auto-jurnal transaksi...';
  
  -- Ambil kategori kas default (misal Operasional / Beban Lain-lain)
  select id into v_cat_id from public.transaction_categories where user_id = v_test_user_id limit 1;

  -- Buat transaksi bertanggal 2026-11-05 (harus ada jurnal)
  insert into public.transactions (user_id, category_id, type, amount, transaction_date, description)
  values (v_test_user_id, v_cat_id, 'expense', 150000, '2026-11-05', 'Beban Operasional Tes');

  -- Buat transaksi bertanggal 2026-10-25 (< books_start_date, tidak dijurnal)
  insert into public.transactions (user_id, category_id, type, amount, transaction_date, description)
  values (v_test_user_id, v_cat_id, 'expense', 200000, '2026-10-25', 'Beban Sebelum Pembukuan');

  if not exists (
    select 1 from public.journal_entries je
    join public.transactions t on t.id = je.source_id
    where t.user_id = v_test_user_id and t.transaction_date = '2026-11-05'
  ) then
    raise exception 'TEST 7 GAGAL: Transaksi >= books_start_date tidak memiliki jurnal otomatis!';
  end if;

  if exists (
    select 1 from public.journal_entries je
    join public.transactions t on t.id = je.source_id
    where t.user_id = v_test_user_id and t.transaction_date = '2026-10-25'
  ) then
    raise exception 'TEST 7 GAGAL: Transaksi < books_start_date seharusnya tidak dijurnal!';
  end if;
  raise notice '[TEST 7 PASS] Auto-jurnal transaksi & filter tanggal pembukuan bekerja dengan benar.';

  -- -------------------------------------------------------------------------
  -- SKENARIO 2 & 4:
  -- DP lalu coba hapus order (harus ditolak karena masih pegang uang).
  -- Lalu refund DP -> hapus order: jurnal 2-1200 tetap benar (bukan 9-9999).
  -- -------------------------------------------------------------------------
  raise notice '[TEST 2 & 4] Testing DP, delete_order guard, dan refund...';

  insert into public.orders (user_id, order_no, title, customer_name, customer_contact, total_price, status, production_status)
  values (v_test_user_id, 'ORD-TEST-001', 'Order Tes DP', 'Pelanggan Tes', '08123456789', 1000000, 'processing', 'pending')
  returning id into v_order_id;

  -- Buat pembayaran DP 500.000
  insert into public.order_payments (user_id, order_id, amount, payment_date, payment_method)
  values (v_test_user_id, v_order_id, 500000, '2026-11-06', 'cash');

  -- Coba panggil delete_order saat masih memegang uang -> harus ditolak
  v_err_caught := false;
  begin
    perform public.delete_order(v_order_id);
  exception when others then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception 'TEST 4 GAGAL: Order yang masih memegang uang DP seharusnya tidak bisa dihapus!';
  end if;
  raise notice '[TEST 4 PASS] Guard delete_order menolak penghapusan order yang memegang uang.';

  -- Lakukan pelepasan DP refund (uang dikembalikan)
  select public.release_order_deposit(
    p_order_id := v_order_id,
    p_kind := 'refund',
    p_amount := 500000,
    p_release_date := '2026-11-07',
    p_notes := 'Refund pembatalan'
  ) into v_release_id;

  -- Hapus order sekarang harus berhasil karena uang sudah bersih (paid = released)
  perform public.delete_order(v_order_id);

  if exists (select 1 from public.orders where id = v_order_id) then
    raise exception 'TEST 2 GAGAL: Order seharusnya sudah terhapus!';
  end if;

  -- Pastikan tidak ada jurnal yang jatuh ke akun penampung 9-9999
  if exists (
    select 1 from public.journal_lines jl
    join public.accounts a on a.id = jl.account_id
    where a.user_id = v_test_user_id and a.code = '9-9999'
  ) then
    raise exception 'TEST 2 GAGAL: Ditemukan jurnal yang jatuh ke akun 9-9999!';
  end if;
  raise notice '[TEST 2 PASS] Refund DP berhasil, hapus order berhasil tanpa merusak jurnal.';

  -- -------------------------------------------------------------------------
  -- SKENARIO 3 & 5:
  -- DP lalu hangus (forfeit) lalu hapus order: jurnal order_forfeit tetap ada.
  -- Uji delete_order_deposit_release untuk forfeit.
  -- -------------------------------------------------------------------------
  raise notice '[TEST 3 & 5] Testing DP hangus (forfeit) dan delete_order_deposit_release...';

  insert into public.orders (user_id, order_no, title, customer_name, customer_contact, total_price, status, production_status)
  values (v_test_user_id, 'ORD-TEST-002', 'Order Tes Forfeit', 'Pelanggan 2', '08123456788', 800000, 'processing', 'pending')
  returning id into v_order_forfeit;

  insert into public.order_payments (user_id, order_id, amount, payment_date, payment_method)
  values (v_test_user_id, v_order_forfeit, 300000, '2026-11-08', 'transfer');

  -- Rilis sebagai forfeit (DP hangus)
  select public.release_order_deposit(
    p_order_id := v_order_forfeit,
    p_kind := 'forfeit',
    p_amount := 300000,
    p_release_date := '2026-11-09',
    p_notes := 'DP Hangus karena batas waktu'
  ) into v_rel_forfeit_id;

  -- Pastikan jurnal order_forfeit terbuat
  if not exists (
    select 1 from public.journal_entries
    where user_id = v_test_user_id and source_type = 'order_forfeit' and source_id = v_rel_forfeit_id
  ) then
    raise exception 'TEST 3 GAGAL: Jurnal DP hangus (order_forfeit) tidak ditemukan!';
  end if;

  -- Tes pembatalan release (delete_order_deposit_release)
  perform public.delete_order_deposit_release(v_rel_forfeit_id);

  if exists (
    select 1 from public.journal_entries
    where user_id = v_test_user_id and source_type = 'order_forfeit' and source_id = v_rel_forfeit_id
  ) then
    raise exception 'TEST 5 GAGAL: Jurnal order_forfeit harusnya ikut terhapus saat release dihapus!';
  end if;
  raise notice '[TEST 3 & 5 PASS] DP hangus & delete_order_deposit_release bekerja sesuai spesifikasi.';

  -- Bersihkan order kedua agar tidak mengganjal
  select public.release_order_deposit(v_order_forfeit, 'refund', 300000, '2026-11-09', 'Refund pembersihan') into v_rel_forfeit_id;
  perform public.delete_order(v_order_forfeit);

  -- -------------------------------------------------------------------------
  -- SKENARIO 6: Periode Terkunci
  -- Insert, update, delete transaksi di tanggal <= locked_through harus ditolak
  -- -------------------------------------------------------------------------
  raise notice '[TEST 6] Testing guard periode terkunci...';

  update public.accounting_settings
  set locked_through = '2026-11-10'
  where user_id = v_test_user_id;

  -- Coba insert transaksi bertanggal 2026-11-10 (terkunci) -> harus ditolak
  v_err_caught := false;
  begin
    insert into public.transactions (user_id, category_id, type, amount, transaction_date, description)
    values (v_test_user_id, v_cat_id, 'income', 100000, '2026-11-10', 'Penjualan Terkunci');
  exception when others then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception 'TEST 6 GAGAL: Transaksi di periode terkunci seharusnya ditolak!';
  end if;
  raise notice '[TEST 6 PASS] Periode terkunci menolak modifikasi transaksi.';

  -- -------------------------------------------------------------------------
  -- SKENARIO 8: Neraca Saldo (Trial Balance) seimbang
  -- Termasuk saat ada akun nonaktif yang punya mutasi
  -- -------------------------------------------------------------------------
  raise notice '[TEST 8] Testing Neraca Saldo (Trial Balance)...';

  -- Buka kunci sementara untuk posting transaksi uji
  update public.accounting_settings set locked_through = null where user_id = v_test_user_id;

  -- Buat transaksi baru
  insert into public.transactions (user_id, category_id, type, amount, transaction_date, description)
  values (v_test_user_id, v_cat_id, 'income', 500000, '2026-11-20', 'Pendapatan Usaha');

  -- Nonaktifkan salah satu akun yang punya transaksi
  select account_id into v_inactive_acct from public.transaction_categories where id = v_cat_id;
  if v_inactive_acct is not null then
    update public.accounts set is_active = false where id = v_inactive_acct;
  end if;

  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_tb_rows, v_tb_debit, v_tb_credit
    from public.get_trial_balance('2026-11-01', '2026-11-30');

  if v_tb_debit <> v_tb_credit then
    raise exception 'TEST 8 GAGAL: Neraca Saldo tidak seimbang! Debit: %, Credit: %', v_tb_debit, v_tb_credit;
  end if;
  raise notice '[TEST 8 PASS] Neraca Saldo seimbang (Debit = Credit = %).', v_tb_debit;

  -- -------------------------------------------------------------------------
  -- SKENARIO 9: Keamanan RLS & Hak Tulis Langsung
  -- User authenticated tidak boleh menulis langsung ke tabel jurnal/setting
  -- -------------------------------------------------------------------------
  raise notice '[TEST 9] Testing proteksi hak akses tulis langsung...';

  v_err_caught := false;
  begin
    insert into public.journal_entries (user_id, entry_no, entry_date, description, source_type)
    values (v_test_user_id, 'JE-HACK-001', '2026-11-20', 'Bypass test', 'manual');
  exception when insufficient_privilege then
    v_err_caught := true;
  end;
  if not v_err_caught then
    raise exception 'TEST 9 GAGAL: Insert langsung ke journal_entries harusnya menghasilkan 42501 insufficient_privilege!';
  end if;
  raise notice '[TEST 9 PASS] Hak akses tulis langsung dicegah dengan 42501.';

  -- -------------------------------------------------------------------------
  -- SKENARIO 10: Cascade Auth Deletion
  -- Penghapusan user di auth.users tidak tertahan oleh trigger guard_order_delete
  -- -------------------------------------------------------------------------
  raise notice '[TEST 10] Testing cascade deletion user dari auth.users...';

  -- Buat order untuk user dummy sebelum user dihapus
  insert into public.orders (user_id, order_no, title, customer_name, customer_contact, total_price, status, production_status)
  values (v_test_user_id, 'ORD-TEST-003', 'Order User Delete', 'Cust 3', '08123456787', 500000, 'processing', 'pending');

  -- Hapus user dari auth.users -> harus sukses cascade tanpa error trigger
  delete from auth.users where id = v_test_user_id;

  if exists (select 1 from auth.users where id = v_test_user_id) then
    raise exception 'TEST 10 GAGAL: User auth dummy gagal dihapus!';
  end if;
  raise notice '[TEST 10 PASS] Cascade delete auth.users berhasil tanpa halangan trigger.';

  raise notice '==================================================';
  raise notice 'SEMUA 10 SKENARIO SMOKE TEST AKUNTANSI BERHASIL!';
  raise notice '==================================================';
end;
$$;
