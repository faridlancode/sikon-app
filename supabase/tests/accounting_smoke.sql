-- =========================================================================
-- SMOKE TEST AKUNTANSI DASAR
-- Lokasi: supabase/tests/accounting_smoke.sql (DI LUAR supabase/migrations/)
--
-- CARA MENJALANKAN (hanya di database lokal sekali pakai atau project scratch):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/accounting_smoke.sql
-- Prasyarat: semua migration sudah terpasang (supabase db reset).
--
-- JANGAN dijalankan di database yang berisi data nyata.
-- Seluruh skrip dibungkus begin ... rollback, jadi tidak meninggalkan data
-- baik saat lulus maupun gagal.
--
-- Catatan: bila insert ke tabel orders gagal karena ada kolom wajib lain
-- (mis. order_type tanpa default), tambahkan kolom itu pada insert di bawah.
-- =========================================================================

begin;

-- Pembantu (temp, hilang saat sesi berakhir)
create or replace function pg_temp.ck(p_ok boolean, p_msg text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'GAGAL: %', p_msg;
  end if;
end;
$$;

create or replace function pg_temp.bal(p_uid uuid, p_code text)
returns numeric language sql stable as $$
  select coalesce(sum(jl.debit - jl.credit), 0)
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
   where je.user_id = p_uid
     and a.user_id = p_uid
     and a.code = p_code;
$$;

do $$
declare
  v_a        uuid := gen_random_uuid();
  v_b        uuid := gen_random_uuid();
  v_cat_op   uuid;
  v_cat_inv  uuid;
  v_t_oct    uuid;
  v_t_nov    uuid;
  v_t_new    uuid;
  v_o1       uuid;
  v_o2       uuid;
  v_o3       uuid;
  v_o4       uuid;
  v_o5       uuid;
  v_pay      public.order_payments;
  v_rel      uuid;
  v_rel2     uuid;
  v_acct     uuid;
  v_bank     uuid;
  v_je       uuid;
  v_rev      uuid;
  v_n        int;
  v_num      numeric;
  v_num2     numeric;
  v_msg      text;
  v_ok       boolean;
  v_rec      record;
begin
  raise notice '=== MEMULAI SMOKE TEST AKUNTANSI ===';

  -- -----------------------------------------------------------------------
  -- SETUP: dua user dummy + kategori + konteks login sebagai user A
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values
    (v_a, 'smoke_a_' || substr(v_a::text, 1, 8) || '@example.com', 'authenticated', 'authenticated'),
    (v_b, 'smoke_b_' || substr(v_b::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  insert into public.transaction_categories (user_id, name, type)
  values (v_a, 'Operasional', 'expense'),
         (v_a, 'Investasi', 'income'),
         (v_a, 'Pembayaran Order', 'income');

  select id into v_cat_op  from public.transaction_categories where user_id = v_a and name = 'Operasional';
  select id into v_cat_inv from public.transaction_categories where user_id = v_a and name = 'Investasi';

  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Transaksi SEBELUM akuntansi aktif (untuk menguji backfill)
  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (v_a, v_cat_op, 'Beban sebelum pembukuan', 200000, 'expense', '2026-10-25', 'smoke')
  returning id into v_t_oct;

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (v_a, v_cat_op, 'Beban November (backfill)', 150000, 'expense', '2026-11-05', 'smoke')
  returning id into v_t_nov;

  select count(*) into v_n from public.journal_entries where user_id = v_a;
  perform pg_temp.ck(v_n = 0, 'sebelum init_accounting seharusnya belum ada jurnal, ditemukan ' || v_n);

  -- -----------------------------------------------------------------------
  -- TEST 1: init_accounting
  -- -----------------------------------------------------------------------
  v_ok := false;
  begin
    perform public.init_accounting('2026-11-15'::date);
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%tanggal 1%', 'tanggal bukan tanggal 1 harus ditolak dengan pesan yang jelas (pesan: ' || coalesce(v_msg, '-') || ')');

  perform public.init_accounting('2026-11-01'::date);

  select count(*) into v_n from public.accounts where user_id = v_a;
  perform pg_temp.ck(v_n = 33, 'jumlah akun seharusnya 33, ditemukan ' || v_n);

  perform public.init_accounting('2026-11-01'::date);
  select count(*) into v_n from public.accounts where user_id = v_a;
  perform pg_temp.ck(v_n = 33, 'init_accounting kedua menggandakan akun: ' || v_n);

  select count(*) into v_n from public.accounting_settings
   where user_id = v_a and enabled is true and books_start_date = '2026-11-01';
  perform pg_temp.ck(v_n = 1, 'accounting_settings belum aktif atau tanggal mulai salah');

  select a.code into v_msg
    from public.transaction_categories tc join public.accounts a on a.id = tc.account_id
   where tc.id = v_cat_op;
  perform pg_temp.ck(v_msg = '6-2000', 'kategori Operasional seharusnya terpetakan ke 6-2000, ditemukan ' || coalesce(v_msg, 'null'));

  select a.code into v_msg
    from public.transaction_categories tc join public.accounts a on a.id = tc.account_id
   where tc.id = v_cat_inv;
  perform pg_temp.ck(v_msg = '3-1000', 'kategori Investasi seharusnya terpetakan ke 3-1000, ditemukan ' || coalesce(v_msg, 'null'));
  raise notice '[TEST 1 LULUS] init_accounting: 33 akun, idempotent, pemetaan kategori benar';

  -- -----------------------------------------------------------------------
  -- TEST 2: backfill dan filter tanggal mulai pembukuan
  -- -----------------------------------------------------------------------
  select count(*) into v_n from public.journal_entries
   where user_id = v_a and source_type = 'transaction' and source_id = v_t_nov;
  perform pg_temp.ck(v_n = 1, 'backfill: transaksi 2026-11-05 seharusnya punya tepat 1 jurnal, ditemukan ' || v_n);

  select count(*) into v_n from public.journal_entries
   where user_id = v_a and source_type = 'transaction' and source_id = v_t_oct;
  perform pg_temp.ck(v_n = 0, 'transaksi 2026-10-25 (sebelum mulai) seharusnya tidak dijurnal');

  perform pg_temp.ck(pg_temp.bal(v_a, '6-2000') = 150000, 'backfill: 6-2000 seharusnya debit 150000');
  perform pg_temp.ck(pg_temp.bal(v_a, '1-1200') = -150000, 'backfill: 1-1200 (Bank) seharusnya kredit 150000');
  raise notice '[TEST 2 LULUS] backfill dan filter tanggal pembukuan';

  -- -----------------------------------------------------------------------
  -- TEST 3: jurnal otomatis saat insert, update nominal, dan hapus transaksi
  -- -----------------------------------------------------------------------
  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (v_a, v_cat_inv, 'Setoran modal uji', 1000000, 'income', '2026-11-06', 'smoke')
  returning id into v_t_new;
  perform pg_temp.ck(pg_temp.bal(v_a, '3-1000') = -1000000, 'Investasi seharusnya kredit 3-1000 sebesar 1.000.000');

  update public.transactions set amount = 1200000 where id = v_t_new;
  perform pg_temp.ck(pg_temp.bal(v_a, '3-1000') = -1200000, 'setelah update nominal, 3-1000 seharusnya 1.200.000');
  select count(*) into v_n from public.journal_entries where source_type = 'transaction' and source_id = v_t_new;
  perform pg_temp.ck(v_n = 1, 'update nominal seharusnya menghasilkan tepat 1 jurnal, ditemukan ' || v_n);

  delete from public.transactions where id = v_t_new;
  perform pg_temp.ck(pg_temp.bal(v_a, '3-1000') = 0, 'setelah transaksi dihapus, jurnalnya harus hilang');
  raise notice '[TEST 3 LULUS] insert, update, delete transaksi menjaga jurnal sinkron';

  -- -----------------------------------------------------------------------
  -- TEST 4: DP (Kas), guard hapus order, lalu refund dan hapus order
  -- -----------------------------------------------------------------------
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_a, 'SMOKE-001', 'Pelanggan Uji 1', 1000000, 0, 'belum_lunas', 'pending', '2026-11-03')
  returning id into v_o1;

  v_pay := public.record_order_payment(v_o1, 500000, 'dp', '2026-11-06'::date, 'cash', null);
  perform pg_temp.ck(pg_temp.bal(v_a, '2-1200') = -500000, 'DP seharusnya kredit 2-1200 sebesar 500.000');
  perform pg_temp.ck(pg_temp.bal(v_a, '1-1100') = 500000, 'DP metode cash seharusnya debit 1-1100 (Kas)');

  v_ok := false;
  begin
    perform public.delete_order(v_o1);
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%memegang uang%', 'hapus order yang memegang uang harus ditolak (pesan: ' || coalesce(v_msg, '-') || ')');
  perform pg_temp.ck(exists (select 1 from public.orders where id = v_o1), 'order seharusnya masih ada setelah penghapusan ditolak');

  v_rel := public.release_order_deposit(v_o1, 'refund', 500000, '2026-11-07'::date, 'transfer', 'Refund uji');
  perform pg_temp.ck(pg_temp.bal(v_a, '2-1200') = 0, 'setelah refund, 2-1200 seharusnya 0');
  select count(*) into v_n from public.journal_entries je
   where je.source_type = 'transaction'
     and je.source_id = (select transaction_id from public.order_deposit_releases where id = v_rel);
  perform pg_temp.ck(v_n = 1, 'transaksi refund seharusnya punya tepat 1 jurnal');

  perform public.delete_order(v_o1);
  perform pg_temp.ck(not exists (select 1 from public.orders where id = v_o1), 'order seharusnya terhapus setelah semua uang dikembalikan');
  perform pg_temp.ck(pg_temp.bal(v_a, '2-1200') = 0, 'setelah order dihapus, 2-1200 harus tetap 0');
  perform pg_temp.ck(pg_temp.bal(v_a, '9-9999') = 0, 'tidak boleh ada jurnal yang jatuh ke 9-9999 (Penampung)');
  raise notice '[TEST 4 LULUS] DP, guard hapus order, refund, hapus order';

  -- -----------------------------------------------------------------------
  -- TEST 5: DP hangus (forfeit), batalkan, lalu hapus order
  -- -----------------------------------------------------------------------
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_a, 'SMOKE-002', 'Pelanggan Uji 2', 800000, 0, 'belum_lunas', 'pending', '2026-11-03')
  returning id into v_o2;

  v_pay := public.record_order_payment(v_o2, 300000, 'dp', '2026-11-08'::date, 'transfer', null);

  v_rel := public.release_order_deposit(v_o2, 'forfeit', 300000, '2026-11-09'::date, null, 'DP hangus uji');
  select count(*) into v_n from public.journal_entries
   where user_id = v_a and source_type = 'order_forfeit' and source_id = v_rel;
  perform pg_temp.ck(v_n = 1, 'DP hangus seharusnya menghasilkan 1 jurnal order_forfeit');
  perform pg_temp.ck(pg_temp.bal(v_a, '4-9000') = -300000, 'DP hangus seharusnya kredit 4-9000 sebesar 300.000');
  perform pg_temp.ck(pg_temp.bal(v_a, '2-1200') = 0, 'setelah DP hangus, 2-1200 seharusnya 0');

  perform public.delete_order_deposit_release(v_rel);
  select count(*) into v_n from public.journal_entries
   where user_id = v_a and source_type = 'order_forfeit' and source_id = v_rel;
  perform pg_temp.ck(v_n = 0, 'membatalkan DP hangus seharusnya menghapus jurnal order_forfeit');
  perform pg_temp.ck(pg_temp.bal(v_a, '4-9000') = 0, 'setelah DP hangus dibatalkan, 4-9000 seharusnya 0');
  perform pg_temp.ck(pg_temp.bal(v_a, '2-1200') = -300000, 'setelah DP hangus dibatalkan, 2-1200 kembali -300.000');

  -- hanguskan lagi, lalu hapus order: jurnal pendapatan lain TIDAK boleh ikut hilang
  v_rel := public.release_order_deposit(v_o2, 'forfeit', 300000, '2026-11-09'::date, null, 'DP hangus uji 2');
  perform public.delete_order(v_o2);
  perform pg_temp.ck(not exists (select 1 from public.orders where id = v_o2), 'order dengan DP hangus seharusnya bisa dihapus');
  perform pg_temp.ck(pg_temp.bal(v_a, '4-9000') = -300000, 'jurnal DP hangus harus tetap ada setelah order dihapus');
  perform pg_temp.ck(pg_temp.bal(v_a, '2-1200') = 0, 'setelah order dihapus, 2-1200 harus 0');
  raise notice '[TEST 5 LULUS] DP hangus: jurnal, pembatalan, dan tetap ada setelah order dihapus';

  -- -----------------------------------------------------------------------
  -- TEST 6: aturan hapus pembayaran yang sudah sebagian dilepas
  -- -----------------------------------------------------------------------
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_a, 'SMOKE-003', 'Pelanggan Uji 3', 800000, 0, 'belum_lunas', 'pending', '2026-11-03')
  returning id into v_o3;

  v_pay := public.record_order_payment(v_o3, 200000, 'dp', '2026-11-10'::date, 'transfer', null);
  v_rel := public.release_order_deposit(v_o3, 'refund', 200000, '2026-11-11'::date, 'transfer', 'Refund uji 3');

  v_ok := false;
  begin
    perform public.delete_order_payment(v_pay.id);
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%dikembalikan%', 'hapus pembayaran yang sudah dilepas harus ditolak (pesan: ' || coalesce(v_msg, '-') || ')');

  perform public.delete_order_deposit_release(v_rel);
  perform pg_temp.ck(pg_temp.bal(v_a, '2-1200') = -200000, 'setelah refund dibatalkan, 2-1200 kembali -200.000');
  perform public.delete_order_payment(v_pay.id);
  perform pg_temp.ck(pg_temp.bal(v_a, '2-1200') = 0, 'setelah pembayaran dihapus, 2-1200 harus 0');
  perform public.delete_order(v_o3);
  raise notice '[TEST 6 LULUS] aturan hapus pembayaran dan pembatalan refund';

  -- -----------------------------------------------------------------------
  -- TEST 7: periode terkunci (insert, update, delete, pelepasan DP)
  -- -----------------------------------------------------------------------
  update public.accounting_settings set locked_through = '2026-11-30' where user_id = v_a;

  v_ok := false;
  begin
    insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
    values (v_a, v_cat_op, 'Beban di periode terkunci', 50000, 'expense', '2026-11-20', 'smoke');
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%ditutup%', 'insert di periode terkunci harus ditolak (pesan: ' || coalesce(v_msg, '-') || ')');

  v_ok := false;
  begin
    update public.transactions set amount = amount + 1 where id = v_t_nov;
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%ditutup%', 'update di periode terkunci harus ditolak (pesan: ' || coalesce(v_msg, '-') || ')');

  v_ok := false;
  begin
    delete from public.transactions where id = v_t_nov;
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%ditutup%', 'delete di periode terkunci harus ditolak (pesan: ' || coalesce(v_msg, '-') || ')');

  -- DP di Desember (setelah kunci) boleh; pelepasan bertanggal di periode terkunci harus ditolak
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_a, 'SMOKE-004', 'Pelanggan Uji 4', 500000, 0, 'belum_lunas', 'pending', '2026-12-01')
  returning id into v_o4;
  v_pay := public.record_order_payment(v_o4, 100000, 'dp', '2026-12-02'::date, 'transfer', null);

  v_ok := false;
  begin
    perform public.release_order_deposit(v_o4, 'refund', 50000, '2026-11-25'::date, 'transfer', 'di periode terkunci');
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%ditutup%', 'pelepasan DP di periode terkunci harus ditolak (pesan: ' || coalesce(v_msg, '-') || ')');

  v_rel := public.release_order_deposit(v_o4, 'refund', 100000, '2026-12-03'::date, 'transfer', 'refund Desember');
  perform public.delete_order(v_o4);

  update public.accounting_settings set locked_through = null where user_id = v_a;
  raise notice '[TEST 7 LULUS] periode terkunci menolak insert, update, delete, dan pelepasan DP';

  -- -----------------------------------------------------------------------
  -- TEST 8: akun nonaktif, jurnal manual, neraca saldo seimbang
  -- -----------------------------------------------------------------------
  select id into v_bank from public.accounts where user_id = v_a and code = '1-1200';

  insert into public.accounts (user_id, code, name, account_type, report_group, is_system)
  values (v_a, '6-9100', 'Beban Uji Nonaktif', 'expense', 'opex', false)
  returning id into v_acct;

  -- jurnal tidak seimbang harus ditolak
  v_ok := false;
  begin
    perform public.post_journal_entry('2026-11-12'::date, 'tidak seimbang', jsonb_build_array(
      jsonb_build_object('account_id', v_acct, 'debit', 10000, 'credit', 0),
      jsonb_build_object('account_id', v_bank, 'debit', 0, 'credit', 9000)));
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%tidak seimbang%', 'jurnal tidak seimbang harus ditolak (pesan: ' || coalesce(v_msg, '-') || ')');

  v_je := public.post_journal_entry('2026-11-12'::date, 'Uji akun nonaktif', jsonb_build_array(
    jsonb_build_object('account_id', v_acct, 'debit', 10000, 'credit', 0),
    jsonb_build_object('account_id', v_bank, 'debit', 0, 'credit', 10000)));

  update public.accounts set is_active = false where id = v_acct;

  -- akun sistem tidak boleh dinonaktifkan
  v_ok := false;
  begin
    update public.accounts set is_active = false where user_id = v_a and code = '1-1200';
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%tidak dapat dinonaktifkan%', 'menonaktifkan akun sistem harus ditolak (pesan: ' || coalesce(v_msg, '-') || ')');

  select coalesce(sum(closing_debit), 0), coalesce(sum(closing_credit), 0)
    into v_num, v_num2
    from public.get_trial_balance('2026-11-01', '2026-11-30');
  perform pg_temp.ck(v_num = v_num2 and v_num > 0, 'Neraca Saldo tidak seimbang: debit ' || v_num || ' kredit ' || v_num2);

  select count(*) into v_n from public.get_trial_balance('2026-11-01', '2026-11-30') where code = '6-9100';
  perform pg_temp.ck(v_n = 1, 'akun nonaktif yang punya mutasi harus tetap tampil di Neraca Saldo');
  raise notice '[TEST 8 LULUS] jurnal manual, akun nonaktif, neraca saldo seimbang (debit = kredit = %)', v_num;

  -- -----------------------------------------------------------------------
  -- TEST 9: balik jurnal, buku besar, saldo awal, usulan saldo awal
  -- -----------------------------------------------------------------------
  v_rev := public.reverse_journal_entry(v_je, 'uji balik jurnal');
  perform pg_temp.ck(pg_temp.bal(v_a, '6-9100') = 0, 'setelah dibalik, saldo 6-9100 harus 0');

  v_ok := false;
  begin
    perform public.reverse_journal_entry(v_je, 'balik dua kali');
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%sudah pernah dibalik%', 'balik jurnal dua kali harus ditolak (pesan: ' || coalesce(v_msg, '-') || ')');

  select count(*), coalesce(max(running_balance) filter (where true), 0)
    into v_n, v_num
    from public.get_general_ledger(v_acct, '2020-01-01', '2099-12-31');
  perform pg_temp.ck(v_n = 2, 'buku besar 6-9100 seharusnya 2 baris (jurnal dan pembalik), ditemukan ' || v_n);

  -- usulan saldo awal harus bisa dijalankan (menangkap kolom/tabel yang salah)
  perform pg_temp.ck(jsonb_array_length(public.suggest_opening_balance('2026-11-01'::date)) = 4, 'suggest_opening_balance seharusnya mengembalikan 4 baris');

  v_ok := false;
  begin
    perform public.post_opening_balance('2026-11-02'::date, jsonb_build_array(
      jsonb_build_object('account_id', v_bank, 'debit', 1000000, 'credit', 0)));
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%sama dengan tanggal mulai%', 'saldo awal bertanggal selain tanggal mulai harus ditolak (pesan: ' || coalesce(v_msg, '-') || ')');

  perform public.post_opening_balance('2026-11-01'::date, jsonb_build_array(
    jsonb_build_object('account_id', v_bank, 'debit', 1000000, 'credit', 0, 'memo', 'Saldo awal uji')));
  perform pg_temp.ck(pg_temp.bal(v_a, '3-2000') = -1000000, 'Laba Ditahan seharusnya menjadi penyeimbang kredit 1.000.000');

  v_ok := false;
  begin
    perform public.post_opening_balance('2026-11-01'::date, jsonb_build_array(
      jsonb_build_object('account_id', v_bank, 'debit', 5, 'credit', 0)));
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%sudah pernah diposting%', 'saldo awal kedua harus ditolak (pesan: ' || coalesce(v_msg, '-') || ')');
  raise notice '[TEST 9 LULUS] balik jurnal, buku besar, saldo awal';

  -- -----------------------------------------------------------------------
  -- TEST 10: skema yang diasumsikan migration benar-benar ada
  -- -----------------------------------------------------------------------
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'material_colors' and column_name = 'is_active';
  perform pg_temp.ck(v_n = 1, 'kolom material_colors.is_active tidak ada (dipakai suggest_opening_balance)');

  for v_rec in
    select conrelid::regclass::text as tabel, pg_get_constraintdef(oid) as definisi
      from pg_constraint
     where contype = 'c'
       and conrelid in ('public.stock_movements'::regclass, 'public.stock_requests'::regclass)
       and pg_get_constraintdef(oid) ilike '%status%'
  loop
    perform pg_temp.ck(v_rec.definisi ilike '%cancelled%',
      'check status di ' || v_rec.tabel || ' tidak mengizinkan ''cancelled'': ' || v_rec.definisi);
  end loop;
  raise notice '[TEST 10 LULUS] skema yang diasumsikan migration sesuai';

  -- -----------------------------------------------------------------------
  -- TEST 11: hak akses (sebagai role authenticated) dan isolasi antar user
  -- -----------------------------------------------------------------------
  -- siapkan user B (sebagai superuser), lalu kembali ke konteks user A
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  perform public.init_accounting('2026-11-01'::date);
  perform set_config('request.jwt.claim.sub', v_a::text, true);

  execute 'set local role authenticated';

  v_ok := false;
  begin
    insert into public.journal_entries (user_id, entry_no, entry_date, description, source_type)
    values (v_a, 'JE-HACK-001', '2026-11-20', 'bypass', 'manual');
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then raise exception 'GAGAL: insert langsung ke journal_entries seharusnya ditolak (42501)'; end if;

  v_ok := false;
  begin
    insert into public.journal_lines (entry_id, account_id, debit, credit, line_no)
    values (v_je, v_acct, 1, 0, 99);
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then raise exception 'GAGAL: insert langsung ke journal_lines seharusnya ditolak (42501)'; end if;

  v_ok := false;
  begin
    insert into public.order_deposit_releases (user_id, order_id, kind, amount)
    values (v_a, v_je, 'forfeit', 1);
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then raise exception 'GAGAL: insert langsung ke order_deposit_releases seharusnya ditolak (42501)'; end if;

  v_ok := false;
  begin
    update public.accounting_settings set locked_through = null where user_id = v_a;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then raise exception 'GAGAL: update langsung ke accounting_settings seharusnya ditolak (42501)'; end if;

  v_ok := false;
  begin
    perform public.post_transaction_journal(v_t_nov);
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then raise exception 'GAGAL: post_transaction_journal tidak boleh bisa dipanggil klien (hak eksekusi harus dicabut)'; end if;

  -- RLS: user A tidak boleh melihat data user B
  select count(*) into v_n from public.accounts where user_id = v_b;
  if v_n <> 0 then raise exception 'GAGAL: user A bisa melihat % akun milik user B', v_n; end if;
  select count(*) into v_n from public.accounts where user_id = v_a;
  if v_n < 33 then raise exception 'GAGAL: user A seharusnya melihat akunnya sendiri, terlihat %', v_n; end if;
  select count(*) into v_n from public.journal_entries where user_id = v_b;
  if v_n <> 0 then raise exception 'GAGAL: user A bisa melihat jurnal milik user B'; end if;

  execute 'reset role';
  raise notice '[TEST 11 LULUS] tulis langsung ditolak (42501) dan RLS memisahkan data antar user';

  -- -----------------------------------------------------------------------
  -- TEST 12: sisa konsistensi akhir dan hapus user (cascade)
  -- -----------------------------------------------------------------------
  perform pg_temp.ck(pg_temp.bal(v_a, '2-1200') = 0, 'akhir uji: 2-1200 seharusnya 0');
  perform pg_temp.ck(pg_temp.bal(v_a, '9-9999') = 0, 'akhir uji: 9-9999 seharusnya 0');

  -- Uji cascade hapus user dummy pada akun sistem (guard_accounts_change)
  -- Inisialisasi COA untuk user B
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  perform public.init_accounting('2026-11-01'::date);
  select count(*) into v_n from public.accounts where user_id = v_b;
  perform pg_temp.ck(v_n = 33, 'user B harus punya 33 akun sebelum dihapus');

  -- Hapus user B dari auth.users: akun sistem harus cascade terhapus tanpa dicegat guard_accounts_change
  delete from auth.users where id = v_b;
  select count(*) into v_n from public.accounts where user_id = v_b;
  perform pg_temp.ck(v_n = 0, 'akun sistem user B seharusnya ikut terhapus saat user dihapus');
  select count(*) into v_n from public.accounting_settings where user_id = v_b;
  perform pg_temp.ck(v_n = 0, 'accounting_settings user B seharusnya ikut terhapus saat user dihapus');

  raise notice '[TEST 12 LULUS] hapus user (cascade) tidak tertahan trigger penjaga';

  raise notice '==================================================';
  raise notice 'SEMUA SMOKE TEST AKUNTANSI LULUS';
  raise notice '==================================================';
end;
$$;

rollback;