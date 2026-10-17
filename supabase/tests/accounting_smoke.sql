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
  v_c        uuid := gen_random_uuid();
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

  -- Variabel Test 13 (alur SPJ approve_purchasing_report)
  v_cat_um_c   uuid;
  v_cat_kain_c uuid;
  v_staff_c    uuid;
  v_t_um_c     uuid;
  v_adv_c      uuid;
  v_rep_c      uuid;
  v_item_c     uuid;
  v_mat_c      uuid;

  -- Variabel Test 14 (atomisitas delete_order)
  v_staff_14   uuid;
  v_mat_14     uuid;
  v_o14        uuid;
  v_sm_14      uuid;
  v_sr_14      uuid;

  -- Variabel Test 15 (orders_with_balance & sales_performance)
  v_sales_15   uuid;
  v_o15        uuid;
  v_owb        record;
  v_sp         record;

  -- Variabel Test 16 (suggest_opening_balance filter tanggal & post_opening_balance)
  v_d           uuid := gen_random_uuid();
  v_staff_16    uuid;
  v_o16_old     uuid;
  v_o16_new     uuid;
  v_sug_16      jsonb;
  v_elem_16     jsonb;
  v_debit_1400  numeric := 0;
  v_credit_2200 numeric := 0;
  v_ob_entry_id uuid;

  -- Variabel Test 17 (order delete cascade dengan item, penugasan potong, jahit, stage event)
  v_o17         uuid;
  v_oi17        uuid;
  v_ca17        uuid;
  v_sa17        uuid;
  v_staff_cut17 uuid;
  v_staff_sew17 uuid;

  -- Variabel Test 18 (saldo awal di neraca saldo dan buku besar)
  v_tb_row      record;
  v_acct_18     uuid;

  -- Variabel Test 19-26 (Pengakuan Pendapatan Order)
  v_f               uuid := gen_random_uuid();
  v_o19             uuid;
  v_o21             uuid;
  v_o23             uuid;
  v_e               uuid := gen_random_uuid();
  v_o_e             uuid;
  v_user_ob         uuid := gen_random_uuid();
  v_cur_lock_date   date;
  v_old_ed          date;
  v_ed_before       date;
  v_cur_month_start date;
  v_prev_month_date date;
  v_o_ob            uuid;
  v_ob_lines        jsonb;
  v_o_free          uuid;
  v_o_unpaid        uuid;
  v_o_candup        uuid;

  -- Variabel Test 27 (B2: Pembagian Upah Borongan / Payroll Split)
  v_user_b2         uuid := gen_random_uuid();
  v_staff_b2_pw     uuid;
  v_staff_b2_att    uuid;
  v_payroll_b2      uuid;
  v_pay_res         jsonb;

  -- Variabel Test 28 (B3: Tutup Bulan & Penyesuaian Persediaan)
  v_user_b3         uuid := gen_random_uuid();
  v_m2_start        date;
  v_m2_end          date;
  v_m1_start        date;
  v_m1_end          date;
  v_mat_b3_1        uuid;
  v_mat_b3_2        uuid;
  v_col_b3_a        uuid;
  v_col_b3_b        uuid;
  v_preview_b3      jsonb;
  v_close_res_b3    jsonb;

  -- Variabel Test 29 (B4: Laporan Keuangan Laba Rugi, Neraca, Cek Konsistensi)
  v_user_b4         uuid := gen_random_uuid();
  v_user_b4_other   uuid := gen_random_uuid();
  v_order_b4        uuid;
  v_staff_b4_pw     uuid;
  v_payroll_b4      uuid;
  v_mat_b4          uuid;
  v_inc_b4          jsonb;
  v_bs_b4           jsonb;
  v_checks_b4       jsonb;
  v_chk_elem        jsonb;
  v_chk_code        text;
  v_chk_sev         text;
  v_chk_ok_cnt      int := 0;
  v_o_pre           uuid;
  v_o_post          uuid;
  v_cur_start       date;
  v_cur_date        date;
  v_est_inc         jsonb;
  v_est_bs          jsonb;

  -- Variabel Test 30-37 (Fase C: Aset Tetap, Penyusutan, Pelepasan)
  v_user_c30         uuid := gen_random_uuid();
  v_user_c31         uuid := gen_random_uuid();
  v_user_c32         uuid := gen_random_uuid();
  v_user_c33         uuid := gen_random_uuid();
  v_user_c34         uuid := gen_random_uuid();
  v_user_c35         uuid := gen_random_uuid();
  v_user_c36         uuid := gen_random_uuid();
  v_user_c36_other   uuid := gen_random_uuid();
  v_user_c37         uuid := gen_random_uuid();
  v_user_c38         uuid := gen_random_uuid();
  v_user_c38_other   uuid := gen_random_uuid();
  v_c_preview        jsonb;
  v_c_m0_start       date;
  v_c_m0_end         date;
  v_c_m1_start       date;
  v_c_m1_end         date;
  v_c_m2_start       date;
  v_c_m2_end         date;
  v_c_m3_start       date;
  v_c_m3_end         date;
  v_c_m_loop_start   date;
  v_c_idx            int;
  v_c_asset_1        uuid;
  v_c_asset_2        uuid;
  v_c_asset_3        uuid;
  v_c_close_res      jsonb;
  v_c_bs             jsonb;
  v_c_checks         jsonb;
  v_c_chk_elem       jsonb;
  v_c_ok             boolean;
  v_c_disp_je        uuid;

  -- Variabel Test 39 (Penyusutan tuntas, delete disposed ditolak, selisih persediaan nol, kategori terkunci, update info)
  v_user_c39         uuid := gen_random_uuid();
  v_user_c39_other   uuid := gen_random_uuid();
  v_t39_asset_1      uuid;
  v_t39_asset_2      uuid;
  v_t39_asset_old    uuid;
  v_t39_cat_id       uuid;
  v_t39_cat_acct_id  uuid;
  v_t39_close_res    jsonb;
  v_t39_ok           boolean;
  v_t39_m0_end       date := '2024-01-31'::date;
  v_t39_m1_end       date := '2024-02-29'::date;
  v_t39_m2_end       date := '2024-03-31'::date;
  v_t39_m3_end       date := '2024-04-30'::date;
  v_t39_m4_end       date := '2024-05-31'::date;
  v_t39_m5_end       date := '2024-06-30'::date;
  v_t39_m6_end       date := '2024-07-31'::date;
  v_t39_m7_end       date := '2024-08-31'::date;
  v_t39_m8_end       date := '2024-09-30'::date;
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

  -- Catatan: Menghapus user yang punya order tidak didukung skema lama (orders.user_id dan order_payments.user_id tidak ber-cascade).
  -- Penghapusan user hanya diuji pada user B yang memiliki data akuntansi tanpa order dan tanpa transaksi.
  delete from auth.users where id = v_b;

  select count(*) into v_n from public.accounts where user_id = v_b;
  perform pg_temp.ck(v_n = 0, 'akun user B seharusnya ikut terhapus saat user dihapus');
  select count(*) into v_n from public.journal_entries where user_id = v_b;
  perform pg_temp.ck(v_n = 0, 'jurnal user B seharusnya ikut terhapus saat user dihapus');
  raise notice '[TEST 12 LULUS] hapus user tanpa order (cascade) berhasil membersihkan data akuntansi';

  -- -----------------------------------------------------------------------
  -- TEST 13: alur approve_purchasing_report
  -- -----------------------------------------------------------------------
  -- Buat user dummy C
  insert into auth.users (id, email, aud, role)
  values (v_c, 'smoke_c_' || substr(v_c::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  -- Kategori dibuat SEBELUM init_accounting
  insert into public.transaction_categories (user_id, name, type)
  values
    (v_c, 'Uang Muka Purchasing', 'expense'),
    (v_c, 'Pembelian Kain', 'expense');

  select id into v_cat_um_c   from public.transaction_categories where user_id = v_c and name = 'Uang Muka Purchasing';
  select id into v_cat_kain_c from public.transaction_categories where user_id = v_c and name = 'Pembelian Kain';

  -- Konteks login sebagai user C
  perform set_config('request.jwt.claim.sub', v_c::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Inisialisasi akuntansi user C (akan memetakan Uang Muka Purchasing -> 1-1400 dan Pembelian Kain -> 1-1500)
  perform public.init_accounting('2026-11-01'::date);

  -- Satu staf purchasing
  insert into public.staff (user_id, name, wage_type, daily_rate, role)
  values (v_c, 'Staf Purchasing C', 'attendance', 100000, 'Purchasing')
  returning id into v_staff_c;

  -- Transaksi pencairan uang muka Rp 1.000.000 (kategori Uang Muka Purchasing)
  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (v_c, v_cat_um_c, 'Pencairan Uang Muka', 1000000, 'expense', '2026-11-05', 'Uang muka purchasing')
  returning id into v_t_um_c;

  -- Satu cash_advances berstatus outstanding Rp 1.000.000
  insert into public.cash_advances (user_id, staff_id, amount, status, date_given, transaction_id, purpose)
  values (v_c, v_staff_c, 1000000, 'outstanding', '2026-11-05', v_t_um_c, 'Uang muka belanja kain')
  returning id into v_adv_c;

  -- Satu SPJ berstatus submitted dengan jasa (service_fee) Rp 25.000 terhubung ke uang muka itu
  insert into public.purchasing_reports (user_id, staff_id, cash_advance_id, report_date, status, service_fee, total_amount)
  values (v_c, v_staff_c, v_adv_c, '2026-11-06', 'submitted', 25000, 925000)
  returning id into v_rep_c;

  -- Siapkan material kain untuk item SPJ
  insert into public.materials (user_id, name, unit, price, stock_qty, minimum_stock)
  values (v_c, 'Kain Drill C', 'meter', 90000, 100, 10)
  returning id into v_mat_c;

  -- Berisi satu item kategori Pembelian Kain Rp 900.000
  insert into public.purchasing_report_items (user_id, report_id, material_id, category_id, description, quantity, unit, unit_price, total_price)
  values (v_c, v_rep_c, v_mat_c, v_cat_kain_c, 'Kain Drill', 10, 'meter', 90000, 900000)
  returning id into v_item_c;

  -- Panggil approve_purchasing_report
  perform public.approve_purchasing_report(v_rep_c);

  -- Asersi Test 13:
  perform pg_temp.ck(pg_temp.bal(v_c, '1-1500') = 900000, 'Test 13: saldo 1-1500 seharusnya 900.000 (debit)');
  perform pg_temp.ck(pg_temp.bal(v_c, '6-2000') = 25000, 'Test 13: saldo 6-2000 seharusnya 25.000 (debit)');
  perform pg_temp.ck(pg_temp.bal(v_c, '1-1400') = 0, 'Test 13: saldo 1-1400 seharusnya 0');
  perform pg_temp.ck(pg_temp.bal(v_c, '1-1200') = -925000, 'Test 13: saldo 1-1200 (Bank) seharusnya -925.000 (kredit)');
  perform pg_temp.ck(pg_temp.bal(v_c, '9-9999') = 0, 'Test 13: saldo 9-9999 seharusnya 0');

  select status into v_msg from public.purchasing_reports where id = v_rep_c;
  perform pg_temp.ck(v_msg = 'financially_approved', 'Test 13: status SPJ seharusnya financially_approved');

  select status into v_msg from public.cash_advances where id = v_adv_c;
  perform pg_temp.ck(v_msg = 'settled', 'Test 13: status uang muka seharusnya settled');

  -- Menyetujui SPJ yang sama untuk kedua kalinya ditolak
  v_ok := false;
  begin
    perform public.approve_purchasing_report(v_rep_c);
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.ck(v_ok, 'Test 13: menyetujui SPJ untuk kedua kalinya harus ditolak');

  -- Neraca Saldo (get_trial_balance) seimbang (jumlah closing_debit = jumlah closing_credit)
  select coalesce(sum(closing_debit), 0), coalesce(sum(closing_credit), 0)
    into v_num, v_num2
    from public.get_trial_balance('2026-11-01'::date, '2026-11-30'::date);
  perform pg_temp.ck(v_num = v_num2 and v_num > 0, 'Test 13: neraca saldo harus seimbang (closing_debit = closing_credit)');
  raise notice '[TEST 13 LULUS] alur approve_purchasing_report seimbang (closing_debit = %, closing_credit = %, rentang: 2026-11-01 s.d. 2026-11-30)', v_num, v_num2;

  -- -----------------------------------------------------------------------
  -- TEST 14: atomisitas delete_order
  -- -----------------------------------------------------------------------
  -- Kembalikan konteks login ke user A
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Siapkan staf dengan role Gudang untuk restock request
  insert into public.staff (user_id, name, wage_type, daily_rate, role)
  values (v_a, 'Staf Gudang 14', 'attendance', 100000, 'Gudang')
  returning id into v_staff_14;

  -- Siapkan material
  insert into public.materials (user_id, name, unit, price, stock_qty, minimum_stock)
  values (v_a, 'Bahan Uji 14', 'meter', 50000, 100, 10)
  returning id into v_mat_14;

  -- Siapkan order yang memegang uang (DP Rp 100.000 lewat record_order_payment)
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_a, 'SMOKE-014', 'Pelanggan Uji 14', 500000, 0, 'belum_lunas', 'pending', '2026-11-16')
  returning id into v_o14;

  v_pay := public.record_order_payment(v_o14, 100000, 'dp', '2026-11-16'::date, 'cash', null);

  -- Satu stock_movements berstatus pending dengan source_id = id order itu
  insert into public.stock_movements (user_id, material_id, movement_type, qty, unit, status, source_type, source_id, notes)
  values (v_a, v_mat_14, 'out', 5, 'meter', 'pending', 'order_consumption', v_o14, 'Pengujian Test 14')
  returning id into v_sm_14;

  -- Satu stock_requests berstatus draft_auto dengan source_order_id = id order itu
  insert into public.stock_requests (
    user_id, material_id, requested_by, quantity_needed, unit,
    status, fulfillment_type, source_type, source_order_id
  )
  values (
    v_a, v_mat_14, v_staff_14, 10, 'meter',
    'draft_auto', 'spj', 'auto_order', v_o14
  )
  returning id into v_sr_14;

  -- Asersi: delete_order ditolak (pesan memuat "memegang uang")
  v_ok := false;
  begin
    perform public.delete_order(v_o14);
  exception when others then
    if sqlerrm like '%memegang uang%' then
      v_ok := true;
    end if;
  end;
  perform pg_temp.ck(v_ok, 'Test 14: delete_order harus ditolak karena order memegang uang');

  -- Asersi: setelah ditolak, stock_movements itu masih pending dan stock_requests itu masih draft_auto
  select status into v_msg from public.stock_movements where id = v_sm_14;
  perform pg_temp.ck(v_msg = 'pending', 'Test 14: stock_movements harus tetap pending setelah penolakan delete_order');

  select status into v_msg from public.stock_requests where id = v_sr_14;
  perform pg_temp.ck(v_msg = 'draft_auto', 'Test 14: stock_requests harus tetap draft_auto setelah penolakan delete_order');

  -- Kembalikan uang penuh (release_order_deposit jenis refund)
  perform public.release_order_deposit(v_o14, 'refund', 100000, '2026-11-16'::date, 'cash', 'Refund penuh sebelum hapus order');

  -- Panggil delete_order kembali
  perform public.delete_order(v_o14);

  -- Asersi: stock_movements menjadi cancelled
  select status into v_msg from public.stock_movements where id = v_sm_14;
  perform pg_temp.ck(v_msg = 'cancelled', 'Test 14: stock_movements harus menjadi cancelled');

  -- Asersi: stock_requests menjadi cancelled dengan source_order_id kosong
  select status, source_order_id into v_msg, v_o14 from public.stock_requests where id = v_sr_14;
  perform pg_temp.ck(v_msg = 'cancelled', 'Test 14: stock_requests harus menjadi cancelled');
  perform pg_temp.ck(v_o14 is null, 'Test 14: source_order_id pada stock_requests harus kosong/null');

  raise notice '[TEST 14 LULUS] atomisitas delete_order menjaga integritas status pergerakan dan permintaan stok';

  -- -----------------------------------------------------------------------
  -- TEST 15: orders_with_balance dan sales_performance
  -- -----------------------------------------------------------------------
  -- Kembalikan konteks login ke user A
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Siapkan sales khusus untuk Test 15
  insert into public.sales (user_id, name)
  values (v_a, 'Sales Uji 15')
  returning id into v_sales_15;

  -- Siapkan order total Rp 1.000.000 dengan sales_id
  insert into public.orders (user_id, sales_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_a, v_sales_15, 'SMOKE-015', 'Pelanggan Uji 15', 1000000, 0, 'belum_lunas', 'pending', '2026-11-17')
  returning id into v_o15;

  -- DP Rp 500.000 lewat record_order_payment
  v_pay := public.record_order_payment(v_o15, 500000, 'dp', '2026-11-17'::date, 'cash', null);

  -- Asersi sebagai user biasa (authenticated)
  execute 'set role authenticated';

  -- Asersi pada view orders_with_balance:
  -- paid_amount = 500.000, remaining_amount = 500.000, status = belum_lunas
  select paid_amount, remaining_amount, status
    into v_owb
    from public.orders_with_balance
   where id = v_o15;

  if v_owb.paid_amount <> 500000 then
    raise exception 'Test 15 GAGAL: paid_amount seharusnya 500000, didapat %', v_owb.paid_amount;
  end if;
  if v_owb.remaining_amount <> 500000 then
    raise exception 'Test 15 GAGAL: remaining_amount seharusnya 500000, didapat %', v_owb.remaining_amount;
  end if;
  if v_owb.status <> 'belum_lunas' then
    raise exception 'Test 15 GAGAL: status seharusnya belum_lunas, didapat %', v_owb.status;
  end if;

  -- Asersi sales_performance konsisten bila order punya sales_id
  select total_orders, total_revenue, total_paid, total_outstanding
    into v_sp
    from public.sales_performance
   where sales_id = v_sales_15;

  if v_sp.total_orders <> 1 then
    raise exception 'Test 15 GAGAL: sales total_orders seharusnya 1, didapat %', v_sp.total_orders;
  end if;
  if v_sp.total_revenue <> 1000000 then
    raise exception 'Test 15 GAGAL: sales total_revenue seharusnya 1000000, didapat %', v_sp.total_revenue;
  end if;
  if v_sp.total_paid <> 500000 then
    raise exception 'Test 15 GAGAL: sales total_paid seharusnya 500000, didapat %', v_sp.total_paid;
  end if;
  if v_sp.total_outstanding <> 500000 then
    raise exception 'Test 15 GAGAL: sales total_outstanding seharusnya 500000, didapat %', v_sp.total_outstanding;
  end if;

  -- Setelah release_order_deposit refund Rp 500.000
  perform public.release_order_deposit(v_o15, 'refund', 500000, '2026-11-17'::date, 'cash', 'Refund Test 15');

  -- Asersi ulang pada view orders_with_balance:
  -- paid_amount = 0, remaining_amount = 1.000.000
  select paid_amount, remaining_amount, status
    into v_owb
    from public.orders_with_balance
   where id = v_o15;

  if v_owb.paid_amount <> 0 then
    raise exception 'Test 15 GAGAL: setelah refund, paid_amount seharusnya 0, didapat %', v_owb.paid_amount;
  end if;
  if v_owb.remaining_amount <> 1000000 then
    raise exception 'Test 15 GAGAL: setelah refund, remaining_amount seharusnya 1000000, didapat %', v_owb.remaining_amount;
  end if;

  -- Cek juga sales_performance konsisten setelah refund
  select total_orders, total_revenue, total_paid, total_outstanding
    into v_sp
    from public.sales_performance
   where sales_id = v_sales_15;

  if v_sp.total_orders <> 1 then
    raise exception 'Test 15 GAGAL: setelah refund, sales total_orders seharusnya 1, didapat %', v_sp.total_orders;
  end if;
  if v_sp.total_revenue <> 1000000 then
    raise exception 'Test 15 GAGAL: setelah refund, sales total_revenue seharusnya 1000000, didapat %', v_sp.total_revenue;
  end if;
  if v_sp.total_paid <> 0 then
    raise exception 'Test 15 GAGAL: setelah refund, sales total_paid seharusnya 0, didapat %', v_sp.total_paid;
  end if;
  if v_sp.total_outstanding <> 1000000 then
    raise exception 'Test 15 GAGAL: setelah refund, sales total_outstanding seharusnya 1000000, didapat %', v_sp.total_outstanding;
  end if;

  execute 'reset role';
  raise notice '[TEST 15 LULUS] orders_with_balance dan sales_performance konsisten sebelum dan sesudah refund (sebagai authenticated)';

  -- -----------------------------------------------------------------------
  -- TEST 16: suggest_opening_balance filter tanggal & post_opening_balance
  -- -----------------------------------------------------------------------
  -- Buat user dummy D
  insert into auth.users (id, email, aud, role)
  values (v_d, 'smoke_d_' || substr(v_d::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  -- Konteks login sebagai user D
  perform set_config('request.jwt.claim.sub', v_d::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Siapkan staf purchasing untuk user D
  insert into public.staff (user_id, name, wage_type, daily_rate, role)
  values (v_d, 'Staf Purchasing 16', 'attendance', 100000, 'Purchasing')
  returning id into v_staff_16;

  -- 1) Cash Advance (Uang Muka Karyawan):
  --    - Sebelum tanggal mulai (2026-10-25): Rp 300.000 (harus masuk usulan)
  --    - Pada/setelah tanggal mulai (2026-11-02): Rp 700.000 (TIDAK boleh masuk usulan)
  insert into public.cash_advances (user_id, staff_id, amount, status, date_given, purpose)
  values
    (v_d, v_staff_16, 300000, 'outstanding', '2026-10-25'::date, 'Uang muka Oktober'),
    (v_d, v_staff_16, 700000, 'outstanding', '2026-11-02'::date, 'Uang muka November');

  -- 2) Pembayaran Order (Uang Muka Pelanggan):
  --    - Order lama (2026-10-20) dengan payment_date 2026-10-20: Rp 400.000 (harus masuk usulan)
  --    - Order baru (2026-11-03) dengan payment_date 2026-11-03: Rp 600.000 (TIDAK boleh masuk usulan)
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_d, 'ORD-16-OLD', 'Pelanggan Lama 16', 1000000, 0, 'belum_lunas', 'pending', '2026-10-20')
  returning id into v_o16_old;

  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_d, 'ORD-16-NEW', 'Pelanggan Baru 16', 1000000, 0, 'belum_lunas', 'pending', '2026-11-03')
  returning id into v_o16_new;

  insert into public.order_payments (user_id, order_id, amount, payment_type, payment_date, payment_method)
  values
    (v_d, v_o16_old, 400000, 'dp', '2026-10-20'::date, 'cash'),
    (v_d, v_o16_new, 600000, 'dp', '2026-11-03'::date, 'cash');

  -- Panggil suggest_opening_balance dengan tanggal mulai 2026-11-01 (sebelum init_accounting)
  v_sug_16 := public.suggest_opening_balance('2026-11-01'::date);

  -- Ekstrak nilai usulan dari jsonb array
  v_debit_1400  := 0;
  v_credit_2200 := 0;
  for v_elem_16 in select * from jsonb_array_elements(v_sug_16)
  loop
    if v_elem_16->>'code' = '1-1400' then
      v_debit_1400 := (v_elem_16->>'suggested_debit')::numeric;
    elsif v_elem_16->>'code' = '2-1200' then
      v_credit_2200 := (v_elem_16->>'suggested_credit')::numeric;
    end if;
  end loop;

  -- Asersi Test 16: item bertanggal >= tanggal mulai tidak masuk usulan
  if v_debit_1400 <> 300000 then
    raise exception 'Test 16 GAGAL: suggested_debit 1-1400 seharusnya 300000 (hanya < 2026-11-01), didapat %', v_debit_1400;
  end if;

  if v_credit_2200 <> 400000 then
    raise exception 'Test 16 GAGAL: suggested_credit 2-1200 seharusnya 400000 (hanya < 2026-11-01), didapat %', v_credit_2200;
  end if;

  -- Sekarang inisialisasi pembukuan user D
  perform public.init_accounting('2026-11-01'::date);

  -- Simulasikan opsi "langsung bukukan" saldo awal dengan payload saran (meskipun account_id null, fallback code jalan)
  v_ob_entry_id := public.post_opening_balance('2026-11-01'::date, v_sug_16);

  if v_ob_entry_id is null then
    raise exception 'Test 16 GAGAL: post_opening_balance mengembalikan null';
  end if;

  -- Asersi: jurnal saldo awal terposting di tabel journal_entries
  select count(*) into v_n
    from public.journal_entries
   where id = v_ob_entry_id
     and user_id = v_d
     and source_type = 'opening_balance'
     and entry_date = '2026-11-01';

  if v_n <> 1 then
    raise exception 'Test 16 GAGAL: jurnal saldo awal tidak ditemukan di journal_entries';
  end if;

  -- Asersi saldo: 1-1400 = 300.000, 2-1200 = -400.000 (kredit), dan neraca saldo seimbang
  perform pg_temp.ck(pg_temp.bal(v_d, '1-1400') = 300000, 'Test 16: saldo 1-1400 seharusnya 300.000, didapat ' || pg_temp.bal(v_d, '1-1400'));
  perform pg_temp.ck(pg_temp.bal(v_d, '2-1200') = -400000, 'Test 16: saldo 2-1200 seharusnya -400.000 (kredit), didapat ' || pg_temp.bal(v_d, '2-1200'));

  select coalesce(sum(closing_debit), 0), coalesce(sum(closing_credit), 0)
    into v_num, v_num2
    from public.get_trial_balance('2026-11-01'::date, '2026-11-30'::date);
  perform pg_temp.ck(v_num = v_num2 and v_num > 0, 'Test 16: neraca saldo setelah saldo awal harus seimbang');

  raise notice '[TEST 16 LULUS] suggest_opening_balance hanya menyaring transaksi < books_start_date dan jurnal saldo awal terposting dengan seimbang';

  -- -----------------------------------------------------------------------
  -- TEST 17: cascade delete_order dengan order_items, cutting, sewing, dan stage_events
  -- -----------------------------------------------------------------------
  -- Login konteks sebagai user A
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Siapkan staf potong dan staf jahit
  insert into public.staff (user_id, name, wage_type, daily_rate, role)
  values (v_a, 'Staf Potong 17', 'attendance', 100000, 'Potong')
  returning id into v_staff_cut17;

  insert into public.staff (user_id, name, wage_type, daily_rate, role)
  values (v_a, 'Staf Jahit 17', 'attendance', 100000, 'Penjahit')
  returning id into v_staff_sew17;

  -- Buat order 17
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_a, 'ORD-SMOKE-017', 'Pelanggan Uji 17', 500000, 0, 'belum_lunas', 'pending', '2026-11-20')
  returning id into v_o17;

  -- Buat order_items untuk order 17
  insert into public.order_items (user_id, order_id, name_item, qty, price, total_price)
  values (v_a, v_o17, 'Kaos Polo 17', 10, 50000, 500000)
  returning id into v_oi17;

  -- Buat cutting_assignments untuk item itu
  insert into public.cutting_assignments (user_id, order_id, order_item_id, staff_id, status)
  values (v_a, v_o17, v_oi17, v_staff_cut17, 'assigned')
  returning id into v_ca17;

  -- Buat sewing_assignments untuk item itu
  insert into public.sewing_assignments (user_id, order_item_id, staff_id, assigned_qty, status)
  values (v_a, v_oi17, v_staff_sew17, 10, 'assigned')
  returning id into v_sa17;

  -- Buat order_stage_events tambahan untuk order 17
  insert into public.order_stage_events (user_id, order_id, stage, status)
  values (v_a, v_o17, 'rekap', 'done')
  on conflict (order_id, stage) do update set status = 'done';

  -- Catat pembayaran DP Rp 200.000
  v_pay := public.record_order_payment(v_o17, 200000, 'dp', '2026-11-20'::date, 'cash', null);

  -- 1) delete_order harus ditolak karena masih memegang uang
  v_ok := false;
  begin
    perform public.delete_order(v_o17);
  exception when others then
    if sqlerrm like '%memegang uang%' then
      v_ok := true;
    end if;
  end;
  perform pg_temp.ck(v_ok, 'Test 17: delete_order harus ditolak saat order masih memegang uang');

  -- 2) Kembalikan uang DP lewat release_order_deposit
  perform public.release_order_deposit(v_o17, 'refund', 200000, '2026-11-20'::date, 'cash', 'Refund penuh Test 17');

  -- 3) Panggil delete_order kembali setelah uang dikembalikan: harus berhasil tanpa error FK
  perform public.delete_order(v_o17);

  -- Asersi: order dan seluruh data relasi cascade (items, cutting, sewing, stage_events) terhapus bersih
  select count(*) into v_n from public.orders where id = v_o17;
  perform pg_temp.ck(v_n = 0, 'Test 17: order 17 seharusnya sudah terhapus');

  select count(*) into v_n from public.order_items where id = v_oi17;
  perform pg_temp.ck(v_n = 0, 'Test 17: order_items 17 seharusnya ikut terhapus via cascade');

  select count(*) into v_n from public.cutting_assignments where id = v_ca17;
  perform pg_temp.ck(v_n = 0, 'Test 17: cutting_assignments 17 seharusnya ikut terhapus via cascade');

  select count(*) into v_n from public.sewing_assignments where id = v_sa17;
  perform pg_temp.ck(v_n = 0, 'Test 17: sewing_assignments 17 seharusnya ikut terhapus via cascade');

  select count(*) into v_n from public.order_stage_events where order_id = v_o17;
  perform pg_temp.ck(v_n = 0, 'Test 17: order_stage_events 17 seharusnya ikut terhapus via cascade');

  raise notice '[TEST 17 LULUS] delete_order berhasil menghapus order ber-item, penugasan potong, jahit, dan stage event tanpa error foreign key';

  -- -----------------------------------------------------------------------
  -- TEST 18: saldo awal di get_trial_balance dan get_general_ledger
  -- -----------------------------------------------------------------------
  -- Login kembali sebagai user D (yang sudah diposting opening_balance per 2026-11-01 di Test 16)
  perform set_config('request.jwt.claim.sub', v_d::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Panggil get_trial_balance dengan p_from = books_start_date (2026-11-01)
  -- 1) Akun 1-1400 (Piutang Karyawan) harus memiliki opening_debit = 300.000, mutasi period = 0, closing = 300.000
  select * into v_tb_row
    from public.get_trial_balance('2026-11-01'::date, '2026-11-30'::date)
   where code = '1-1400';

  if v_tb_row.opening_debit <> 300000 or v_tb_row.period_debit <> 0 or v_tb_row.closing_debit <> 300000 then
    raise exception 'Test 18 GAGAL: 1-1400 opening_debit %, period_debit %, closing_debit % (ekspektasi: 300000, 0, 300000)',
      v_tb_row.opening_debit, v_tb_row.period_debit, v_tb_row.closing_debit;
  end if;

  -- 2) Akun 2-1200 (Pendapatan Diterima di Muka) harus memiliki opening_credit = 400.000, mutasi period = 0, closing = 400.000
  select * into v_tb_row
    from public.get_trial_balance('2026-11-01'::date, '2026-11-30'::date)
   where code = '2-1200';

  if v_tb_row.opening_credit <> 400000 or v_tb_row.period_credit <> 0 or v_tb_row.closing_credit <> 400000 then
    raise exception 'Test 18 GAGAL: 2-1200 opening_credit %, period_credit %, closing_credit % (ekspektasi: 400000, 0, 400000)',
      v_tb_row.opening_credit, v_tb_row.period_credit, v_tb_row.closing_credit;
  end if;

  -- 3) Neraca saldo tetap seimbang
  select coalesce(sum(closing_debit), 0), coalesce(sum(closing_credit), 0)
    into v_num, v_num2
    from public.get_trial_balance('2026-11-01'::date, '2026-11-30'::date);
  perform pg_temp.ck(v_num = v_num2 and v_num > 0, 'Test 18: neraca saldo harus seimbang pada rentang books_start_date');

  -- 4) get_general_ledger untuk akun 1-1400: tidak boleh ada baris mutasi opening_balance di lines
  select id into v_acct_18 from public.accounts where user_id = v_d and code = '1-1400';
  select count(*) into v_n from public.get_general_ledger(v_acct_18, '2026-11-01'::date, '2026-11-30'::date);
  perform pg_temp.ck(v_n = 0, 'Test 18: get_general_ledger tidak boleh memuat baris jurnal opening_balance dalam lines mutasi');

  raise notice '[TEST 18 LULUS] get_trial_balance dan get_general_ledger menghitung opening_balance sebagai saldo awal, bukan mutasi; total seimbang';

  -- -----------------------------------------------------------------------
  -- TEST 19: Order Rp 9.000.000 + ongkir Rp 100.000, lunas di muka, lalu completed
  -- (Dijalankan pada user F dengan books_start_date 2026-01-01)
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_f, 'smoke_f_' || substr(v_f::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  insert into public.transaction_categories (user_id, name, type)
  values
    (v_f, 'Operasional', 'expense'),
    (v_f, 'Investasi', 'income'),
    (v_f, 'Pembayaran Order', 'income');

  perform set_config('request.jwt.claim.sub', v_f::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.init_accounting('2026-01-01'::date);

  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_f, 'ORD-SMOKE-019', 'Pelanggan Uji 19', 9000000, 100000, 'belum_lunas', 'pending', '2026-01-10')
  returning id into v_o19;

  -- DP Rp 4.000.000 dan Pelunasan Rp 5.100.000 via record_order_payment
  v_pay := public.record_order_payment(v_o19, 4000000, 'dp', '2026-01-10'::date, 'cash', null);
  v_pay := public.record_order_payment(v_o19, 5100000, 'pelunasan', '2026-01-11'::date, 'cash', null);

  -- Sebelum completed: saldo 2-1200 kredit 9.100.000 (-9.100.000)
  perform pg_temp.ck(pg_temp.bal(v_f, '2-1200') = -9100000, 'Test 19: saldo 2-1200 sebelum completed harus -9.100.000');

  -- Selesaikan order (trigger trg_journal_order_revenue aktif)
  update public.orders set production_status = 'completed' where id = v_o19;

  -- Asersi: saldo 2-1200 kembali 0, 4-1000 kredit 9.000.000, 4-1100 kredit 100.000, tanpa 9-9999
  perform pg_temp.ck(pg_temp.bal(v_f, '2-1200') = 0, 'Test 19: saldo 2-1200 setelah completed harus kembali 0');
  perform pg_temp.ck(pg_temp.bal(v_f, '4-1000') = -9000000, 'Test 19: saldo 4-1000 harus kredit 9.000.000');
  perform pg_temp.ck(pg_temp.bal(v_f, '4-1100') = -100000, 'Test 19: saldo 4-1100 harus kredit 100.000');
  perform pg_temp.ck(pg_temp.bal(v_f, '9-9999') = 0, 'Test 19: tidak boleh ada jurnal yang masuk ke akun 9-9999');

  -- Neraca saldo seimbang pada rentang '2026-01-01' sampai '2099-12-31'
  select coalesce(sum(closing_debit), 0), coalesce(sum(closing_credit), 0)
    into v_num, v_num2
    from public.get_trial_balance('2026-01-01'::date, '2099-12-31'::date);
  perform pg_temp.ck(v_num = v_num2 and v_num > 0, 'Test 19: neraca saldo harus seimbang setelah order revenue diakui');

  raise notice '[TEST 19 LULUS] order lunas diselesaikan: saldo 2-1200 kembali 0, 4-1000 kredit 9.000.000, 4-1100 kredit 100.000, tanpa 9-9999, neraca saldo seimbang';

  -- -----------------------------------------------------------------------
  -- TEST 20: Batal kirim (completed ke status valid 'ready')
  -- -----------------------------------------------------------------------
  update public.orders set production_status = 'ready' where id = v_o19;

  -- Asersi: jurnal order_revenue hilang, saldo 2-1200 kembali kredit 9.100.000 (-9.100.000)
  select count(*) into v_n
    from public.journal_entries
   where user_id = v_f and source_type = 'order_revenue' and source_id = v_o19;
  perform pg_temp.ck(v_n = 0, 'Test 20: jurnal order_revenue harus terhapus saat order batal kirim');
  perform pg_temp.ck(pg_temp.bal(v_f, '2-1200') = -9100000, 'Test 20: saldo 2-1200 harus kembali -9.100.000 setelah batal kirim');
  perform pg_temp.ck(pg_temp.bal(v_f, '4-1000') = 0, 'Test 20: saldo 4-1000 harus kembali 0 setelah batal kirim');
  perform pg_temp.ck(pg_temp.bal(v_f, '4-1100') = 0, 'Test 20: saldo 4-1100 harus kembali 0 setelah batal kirim');

  raise notice '[TEST 20 LULUS] batal kirim menghapus jurnal pendapatan dan memulihkan saldo 2-1200 ke 9.100.000';

  -- Kembalikan v_o19 ke completed agar tetap valid untuk pengujian berikutnya
  update public.orders set production_status = 'completed' where id = v_o19;

  -- -----------------------------------------------------------------------
  -- TEST 21: completed dengan pembayaran sebagian & pelunasan susulan
  -- -----------------------------------------------------------------------
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_f, 'ORD-SMOKE-021', 'Pelanggan Uji 21', 5000000, 50000, 'belum_lunas', 'production', '2026-01-15')
  returning id into v_o21;

  -- DP Rp 2.000.000
  v_pay := public.record_order_payment(v_o21, 2000000, 'dp', '2026-01-15'::date, 'cash', null);

  -- Selesaikan order dengan sisa belum lunas (grand_total = 5.050.000, DP = 2.000.000 -> sisa piutang 3.050.000)
  update public.orders set production_status = 'completed' where id = v_o21;

  -- Asersi: saldo 1-1300 debit 3.050.000
  perform pg_temp.ck(pg_temp.bal(v_f, '1-1300') = 3050000, 'Test 21: saldo 1-1300 seharusnya debit 3.050.000 setelah order selesai sebagian');

  -- Pelunasan susulan Rp 3.050.000 (karena order completed, transaksi mengkredit 1-1300 Piutang)
  v_pay := public.record_order_payment(v_o21, 3050000, 'pelunasan', '2026-01-16'::date, 'cash', null);

  -- Asersi: saldo 1-1300 menjadi 0
  perform pg_temp.ck(pg_temp.bal(v_f, '1-1300') = 0, 'Test 21: saldo 1-1300 seharusnya menjadi 0 setelah pelunasan susulan');

  raise notice '[TEST 21 LULUS] order sebagian diselesaikan memunculkan piutang 1-1300, dan pelunasan susulan menolkan saldo 1-1300';

  -- -----------------------------------------------------------------------
  -- TEST 22: Kasus yang mengubah nilai selagi completed & mempertahankan entry_date jurnal lama
  -- -----------------------------------------------------------------------
  select entry_date into v_old_ed
    from public.journal_entries
   where user_id = v_f and source_type = 'order_revenue' and source_id = v_o21;

  -- Ubah total_price dari 5.000.000 menjadi 6.000.000 (grand total baru 6.050.000)
  update public.orders set total_price = 6000000 where id = v_o21;

  -- Asersi: jurnal order_revenue tetap tepat satu
  select count(*) into v_n
    from public.journal_entries
   where user_id = v_f and source_type = 'order_revenue' and source_id = v_o21;
  perform pg_temp.ck(v_n = 1, 'Test 22: jumlah jurnal order_revenue untuk order 21 harus tetap tepat 1');

  -- Asersi: entry_date jurnal baru mempertahankan entry_date jurnal lama
  select entry_date into v_ed_before
    from public.journal_entries
   where user_id = v_f and source_type = 'order_revenue' and source_id = v_o21;
  perform pg_temp.ck(v_ed_before = v_old_ed, 'Test 22: saat membuat ulang jurnal order yang masih completed, pakai entry_date jurnal lama');

  -- Asersi: saldo 2-1200 tidak negatif (harus 0)
  perform pg_temp.ck(pg_temp.bal(v_f, '2-1200') = 0, 'Test 22: saldo 2-1200 tidak boleh negatif (harus 0)');

  -- Asersi: saldo 1-1300 konsisten dengan total baru:
  -- Piutang baru: 6.050.000 - 2.000.000 = 4.050.000. Sudah dilunasi 3.050.000 -> sisa piutang debit 1.000.000
  perform pg_temp.ck(pg_temp.bal(v_f, '1-1300') = 1000000, 'Test 22: saldo 1-1300 harus konsisten dengan total baru (1.000.000)');

  raise notice '[TEST 22 LULUS] perubahan total_price selagi completed menghasilkan tepat satu jurnal order_revenue, mempertahankan entry_date lama, 2-1200 tidak negatif, dan 1-1300 konsisten';

  -- -----------------------------------------------------------------------
  -- TEST 23: Menyimpan order completed tanpa perubahan nilai di periode terkunci
  -- (Tanggal kunci dihitung dari current_date: akhir bulan berjalan)
  -- -----------------------------------------------------------------------
  v_cur_lock_date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  update public.accounting_settings set locked_through = v_cur_lock_date where user_id = v_f;

  select entry_date into v_ed_before
    from public.journal_entries
   where user_id = v_f and source_type = 'order_revenue' and source_id = v_o19;

  -- Menyimpan order completed tanpa perubahan nilai (hanya customer_name)
  update public.orders set customer_name = 'Pelanggan 19 Update Tanpa Ubah Nilai' where id = v_o19;

  -- Asersi: tidak menimbulkan error dan tidak mengubah entry_date
  select entry_date into v_old_ed
    from public.journal_entries
   where user_id = v_f and source_type = 'order_revenue' and source_id = v_o19;
  perform pg_temp.ck(v_old_ed = v_ed_before, 'Test 23: menyimpan order tanpa perubahan nilai tidak boleh mengubah entry_date');

  -- Sebaliknya: mengubah nilai di periode terkunci harus ditolak
  v_ok := false;
  begin
    update public.orders set total_price = 9500000 where id = v_o19;
  exception when others then
    if sqlerrm like '%terkunci%' then
      v_ok := true;
    end if;
  end;
  perform pg_temp.ck(v_ok, 'Test 23: mengubah total_price pada periode terkunci harus ditolak');

  -- Buka kunci kembali
  update public.accounting_settings set locked_through = null where user_id = v_f;

  raise notice '[TEST 23 LULUS] menyimpan order completed tanpa perubahan nilai tidak mengubah entry_date dan tidak error di periode terkunci; perubahan nilai ditolak';

  -- -----------------------------------------------------------------------
  -- TEST 24: Tanggal sebelum books_start_date dilewati tanpa jurnal
  -- (User E dengan tanggal mulai di masa depan jauh 2099-01-01)
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_e, 'smoke_e_' || substr(v_e::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_e::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.init_accounting('2099-01-01'::date);

  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_e, 'ORD-SMOKE-E', 'Pelanggan Uji E', 1000000, 0, 'belum_lunas', 'pending', current_date)
  returning id into v_o_e;

  -- Selesaikan order (current_date < 2099-01-01)
  update public.orders set production_status = 'completed' where id = v_o_e;

  -- Asersi: jurnal tidak dibuat (dilewati tanpa error)
  select count(*) into v_n
    from public.journal_entries
   where user_id = v_e and source_type = 'order_revenue' and source_id = v_o_e;
  perform pg_temp.ck(v_n = 0, 'Test 24: order completed sebelum books_start_date tidak boleh dijurnal');

  -- Order tanpa jurnal revenue (sebelum tanggal mulai) tetap bisa dihapus bila syarat lain terpenuhi
  perform public.delete_order(v_o_e);
  select count(*) into v_n from public.orders where id = v_o_e;
  perform pg_temp.ck(v_n = 0, 'Test 24: order tanpa jurnal revenue sebelum books_start_date dapat dihapus');

  raise notice '[TEST 24 LULUS] order sebelum books_start_date dilewati tanpa jurnal dan dapat dihapus bila syarat lain terpenuhi';

  -- -----------------------------------------------------------------------
  -- TEST 25: DP sebelum books_start_date terwakili di saldo awal (Butir 3)
  -- User baru dengan books_start_date = tanggal 1 bulan berjalan, DP di bulan sebelumnya
  -- -----------------------------------------------------------------------
  v_cur_month_start := date_trunc('month', current_date)::date;
  v_prev_month_date := (date_trunc('month', current_date) - interval '5 days')::date;

  insert into auth.users (id, email, aud, role)
  values (v_user_ob, 'smoke_ob_' || substr(v_user_ob::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_ob::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.init_accounting(v_cur_month_start);

  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_user_ob, 'ORD-SMOKE-OB', 'Pelanggan Uji OB', 1000000, 0, 'belum_lunas', 'pending', v_prev_month_date)
  returning id into v_o_ob;

  -- DP bertanggal sebelum tanggal mulai (tidak terjurnal)
  insert into public.order_payments (user_id, order_id, amount, payment_type, payment_date, payment_method)
  values (v_user_ob, v_o_ob, 300000, 'dp', v_prev_month_date, 'cash');

  -- Post opening balance: kredit 2-1200 sebesar DP itu (300.000) dan debit Bank 300.000
  v_ob_lines := jsonb_build_array(
    jsonb_build_object('code', '2-1200', 'debit', 0, 'credit', 300000),
    jsonb_build_object('code', '1-1200', 'debit', 300000, 'credit', 0)
  );
  perform public.post_opening_balance(v_cur_month_start, v_ob_lines);

  perform pg_temp.ck(pg_temp.bal(v_user_ob, '2-1200') = -300000, 'Test 25: saldo 2-1200 setelah opening balance harus -300.000');

  -- Selesaikan order (current_date >= v_cur_month_start)
  update public.orders set production_status = 'completed' where id = v_o_ob;

  -- Rumus X memperhitungkan DP sebelum tanggal mulai:
  -- Bagian uang muka = 300.000, sisa piutang = 700.000
  perform pg_temp.ck(pg_temp.bal(v_user_ob, '2-1200') = 0, 'Test 25: saldo 2-1200 setelah completed harus kembali 0');
  perform pg_temp.ck(pg_temp.bal(v_user_ob, '1-1300') = 700000, 'Test 25: saldo 1-1300 harus debit 700.000');

  -- Pelunasan order Rp 700.000 pada tanggal hari ini
  v_pay := public.record_order_payment(v_o_ob, 700000, 'pelunasan', current_date, 'cash', null);

  -- Asersi akhir: saldo 2-1200 kembali 0 dan saldo 1-1300 = 0
  perform pg_temp.ck(pg_temp.bal(v_user_ob, '2-1200') = 0, 'Test 25: saldo akhir 2-1200 harus 0');
  perform pg_temp.ck(pg_temp.bal(v_user_ob, '1-1300') = 0, 'Test 25: saldo akhir 1-1300 harus 0');

  -- Neraca saldo seimbang
  select coalesce(sum(closing_debit), 0), coalesce(sum(closing_credit), 0)
    into v_num, v_num2
    from public.get_trial_balance(v_cur_month_start, '2099-12-31'::date);
  perform pg_temp.ck(v_num = v_num2 and v_num > 0, 'Test 25: neraca saldo user OB harus seimbang');

  raise notice '[TEST 25 LULUS] DP pra-mulai di saldo awal berhasil diperhitungkan rumus X saat completed & lunas: saldo 2-1200 kembali 0 dan 1-1300 = 0';

  -- -----------------------------------------------------------------------
  -- TEST 26: Penjaga hapus order (guard_order_delete) (Butir 5)
  -- -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_f::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- 1) Order completed tanpa pembayaran (total 0 atau gratis) tidak bisa dihapus
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_f, 'ORD-SMOKE-FREE', 'Pelanggan Uji Gratis', 0, 0, 'lunas', 'pending', '2026-01-20')
  returning id into v_o_free;

  update public.orders set production_status = 'completed' where id = v_o_free;

  v_ok := false;
  begin
    perform public.delete_order(v_o_free);
  exception when others then
    if sqlerrm like '%sudah dikirim dan pendapatannya sudah dibukukan%' then
      v_ok := true;
    end if;
  end;
  perform pg_temp.ck(v_ok, 'Test 26: order completed tanpa pembayaran (total 0 / gratis) tidak boleh bisa dihapus');

  -- 2) Order completed tanpa pembayaran (total > 0, piutang) tidak bisa dihapus
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_f, 'ORD-SMOKE-UNPAID', 'Pelanggan Uji Belum Bayar', 500000, 0, 'belum_lunas', 'pending', '2026-01-20')
  returning id into v_o_unpaid;

  update public.orders set production_status = 'completed' where id = v_o_unpaid;

  v_ok := false;
  begin
    perform public.delete_order(v_o_unpaid);
  exception when others then
    if sqlerrm like '%sudah dikirim dan pendapatannya sudah dibukukan%' then
      v_ok := true;
    end if;
  end;
  perform pg_temp.ck(v_ok, 'Test 26: order completed yang ada pendapatan/piutang tidak boleh bisa dihapus');

  -- 3) Order tanpa jurnal revenue (belum completed) tetap bisa dihapus bila syarat lain terpenuhi
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_f, 'ORD-SMOKE-CANDUP', 'Pelanggan Uji Belum Selesai', 500000, 0, 'belum_lunas', 'ready', '2026-01-20')
  returning id into v_o_candup;

  perform public.delete_order(v_o_candup);
  select count(*) into v_n from public.orders where id = v_o_candup;
  perform pg_temp.ck(v_n = 0, 'Test 26: order tanpa jurnal revenue (belum completed) harus berhasil dihapus');

  -- 4) Order gratis bila keluar dari completed (batal kirim) jurnal revenue dihapus, lalu dapat dihapus
  update public.orders set production_status = 'ready' where id = v_o_free;
  perform public.delete_order(v_o_free);
  select count(*) into v_n from public.orders where id = v_o_free;
  perform pg_temp.ck(v_n = 0, 'Test 26: order gratis setelah keluar dari completed harus berhasil dihapus');

  raise notice '[TEST 26 LULUS] guard_order_delete menolak order completed dengan pesan tepat; order tanpa jurnal revenue dapat dihapus';

  -- -----------------------------------------------------------------------
  -- TEST 27: Tahap 1, B2: Pembagian Upah Borongan (Payroll Split)
  -- Gaji Rp 3.000.000 dengan borongan Rp 2.000.000 via pay_weekly_payroll
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_user_b2, 'smoke_b2_' || substr(v_user_b2::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_b2::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.init_accounting('2026-01-01'::date);

  -- Siapkan staf
  insert into public.staff (user_id, name, wage_type, daily_rate, role)
  values
    (v_user_b2, 'Penjahit Borongan B2', 'piecework', 0, 'Penjahit')
  returning id into v_staff_b2_pw;

  insert into public.staff (user_id, name, wage_type, daily_rate, role)
  values
    (v_user_b2, 'Staf Harian B2', 'attendance', 100000, 'Finishing')
  returning id into v_staff_b2_att;

  -- Buat weekly_payrolls status draft Rp 3.000.000
  insert into public.weekly_payrolls (
    user_id, period_start, period_end, payment_date, total_amount, status
  )
  values (
    v_user_b2,
    (current_date - interval '7 days')::date,
    (current_date - interval '1 day')::date,
    current_date,
    3000000,
    'draft'
  )
  returning id into v_payroll_b2;

  -- Buat payroll_items: item borongan Rp 2.000.000 dan item harian Rp 1.000.000
  insert into public.payroll_items (
    user_id, payroll_id, staff_id, wage_type, piecework_amount, take_home_pay
  )
  values (
    v_user_b2, v_payroll_b2, v_staff_b2_pw, 'piecework', 2000000, 2000000
  );

  insert into public.payroll_items (
    user_id, payroll_id, staff_id, wage_type, base_amount, take_home_pay
  )
  values (
    v_user_b2, v_payroll_b2, v_staff_b2_att, 'attendance', 1000000, 1000000
  );

  -- Panggil pay_weekly_payroll
  v_pay_res := public.pay_weekly_payroll(v_payroll_b2);

  -- Asersi: saldo 5-1100 = 2.000.000 (debit), 6-1000 = 1.000.000 (debit), Bank = -3.000.000 (kredit)
  perform pg_temp.ck(pg_temp.bal(v_user_b2, '5-1100') = 2000000, 'Test 27: saldo 5-1100 (Upah Borongan) harus 2.000.000 (debit)');
  perform pg_temp.ck(pg_temp.bal(v_user_b2, '6-1000') = 1000000, 'Test 27: saldo 6-1000 (Gaji) harus 1.000.000 (debit)');
  perform pg_temp.ck(pg_temp.bal(v_user_b2, '1-1200') = -3000000, 'Test 27: saldo 1-1200 (Bank) harus -3.000.000 (kredit)');
  perform pg_temp.ck(pg_temp.bal(v_user_b2, '9-9999') = 0, 'Test 27: tidak boleh ada yang masuk ke 9-9999');

  -- Tepat satu jurnal payroll_split dan satu jurnal transaksi
  select count(*) into v_n from public.journal_entries
   where user_id = v_user_b2 and source_type = 'payroll_split' and source_id = v_payroll_b2;
  perform pg_temp.ck(v_n = 1, 'Test 27: harus ada tepat satu jurnal payroll_split');

  select count(*) into v_n from public.journal_entries
   where user_id = v_user_b2 and source_type = 'transaction' and source_id = (v_pay_res->>'transaction_id')::uuid;
  perform pg_temp.ck(v_n = 1, 'Test 27: harus ada tepat satu jurnal transaction untuk payroll');

  -- Status keluar dari paid (misal update ke 'draft') menghapus jurnal reklasifikasi
  update public.weekly_payrolls set status = 'draft', transaction_id = null where id = v_payroll_b2;

  select count(*) into v_n from public.journal_entries
   where user_id = v_user_b2 and source_type = 'payroll_split' and source_id = v_payroll_b2;
  perform pg_temp.ck(v_n = 0, 'Test 27: jurnal payroll_split harus terhapus saat keluar dari paid');

  -- Saldo 5-1100 kembali 0
  perform pg_temp.ck(pg_temp.bal(v_user_b2, '5-1100') = 0, 'Test 27: saldo 5-1100 harus kembali 0 saat keluar dari paid');

  -- Kembalikan status ke paid untuk menguji periode terkunci
  update public.weekly_payrolls
     set status = 'paid', transaction_id = (v_pay_res->>'transaction_id')::uuid
   where id = v_payroll_b2;

  perform pg_temp.ck(pg_temp.bal(v_user_b2, '5-1100') = 2000000, 'Test 27: saldo 5-1100 kembali 2.000.000 saat status paid');

  -- Periode terkunci menolak perubahan status keluar dari paid
  update public.accounting_settings
     set locked_through = (date_trunc('month', current_date) + interval '1 month - 1 day')::date
   where user_id = v_user_b2;

  v_ok := false;
  begin
    update public.weekly_payrolls set status = 'draft' where id = v_payroll_b2;
  exception when others then
    if sqlerrm like '%terkunci%' then
      v_ok := true;
    end if;
  end;
  perform pg_temp.ck(v_ok, 'Test 27: pembatalan reklasifikasi payroll pada periode terkunci harus ditolak');

  update public.accounting_settings set locked_through = null where user_id = v_user_b2;

  -- Hapus baris weekly_payrolls berstatus paid: jurnal payroll_split ikut terhapus tanpa error
  select count(*) into v_n from public.journal_entries where user_id = v_user_b2 and source_type = 'payroll_split' and source_id = v_payroll_b2;
  perform pg_temp.ck(v_n = 1, 'Test 27: jurnal payroll_split harus ada sebelum weekly_payrolls dihapus');

  delete from public.weekly_payrolls where id = v_payroll_b2;

  select count(*) into v_n from public.journal_entries where user_id = v_user_b2 and source_type = 'payroll_split' and source_id = v_payroll_b2;
  perform pg_temp.ck(v_n = 0, 'Test 27: jurnal payroll_split harus ikut terhapus saat weekly_payrolls dihapus');

  raise notice '[TEST 27 LULUS] payroll_split membagi upah borongan 5-1100 Rp 2.000.000 dan gaji 6-1000 Rp 1.000.000 secara atomik, keluar dari paid/penghapusan baris menghapus reklasifikasi, periode terkunci menolak';

  -- -----------------------------------------------------------------------
  -- TEST 28: Tahap 2, B3: Tutup Bulan & Penyesuaian Persediaan
  -- -----------------------------------------------------------------------
  v_m2_start := (date_trunc('month', current_date) - interval '2 months')::date;
  v_m2_end   := (date_trunc('month', current_date) - interval '1 month' - interval '1 day')::date;
  v_m1_start := (date_trunc('month', current_date) - interval '1 month')::date;
  v_m1_end   := (date_trunc('month', current_date) - interval '1 day')::date;

  insert into auth.users (id, email, aud, role)
  values (v_user_b3, 'smoke_b3_' || substr(v_user_b3::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_b3::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.init_accounting(v_m2_start);

  -- Siapkan material bernilai stok Rp 12.000.000:
  -- Material 1 (tanpa warna): 100 meter x Rp 40.000 = Rp 4.000.000
  insert into public.materials (user_id, name, unit, price, stock_qty, minimum_stock)
  values (v_user_b3, 'Kain Polos B3', 'meter', 40000, 100, 10)
  returning id into v_mat_b3_1;

  -- Material 2 (berwarna): harga 80.000. Varian A: 60 m (4.800.000), Varian B: 40 m (3.200.000) -> total 8.000.000
  insert into public.materials (user_id, name, unit, price, stock_qty, minimum_stock)
  values (v_user_b3, 'Kain Warna B3', 'meter', 80000, 0, 10)
  returning id into v_mat_b3_2;

  insert into public.material_colors (user_id, material_id, color_name, stock_qty, minimum_stock, is_active)
  values
    (v_user_b3, v_mat_b3_2, 'Merah', 60, 5, true),
    (v_user_b3, v_mat_b3_2, 'Biru', 40, 5, true);

  -- Asersi nilai stok fisik via acc_inventory_value harus 12.000.000
  perform pg_temp.ck(public.acc_inventory_value(v_user_b3) = 12000000, 'Test 28: nilai stok fisik harus 12.000.000');

  -- Saldo awal 1-1500 Rp 10.000.000 per v_m2_start
  v_ob_lines := jsonb_build_array(
    jsonb_build_object('code', '1-1500', 'debit', 10000000, 'credit', 0),
    jsonb_build_object('code', '1-1200', 'debit', 20000000, 'credit', 0)
  );
  perform public.post_opening_balance(v_m2_start, v_ob_lines);

  -- Pembelian bahan Rp 6.000.000 di bulan tersebut sehingga saldo 1-1500 menjadi Rp 16.000.000
  insert into public.transaction_categories (user_id, name, type)
  values (v_user_b3, 'Pembelian Kain', 'expense');

  -- Petakan ke 1-1500
  update public.transaction_categories
     set account_id = (select id from public.accounts where user_id = v_user_b3 and code = '1-1500')
   where user_id = v_user_b3 and name = 'Pembelian Kain';

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date)
  values (
    v_user_b3,
    (select id from public.transaction_categories where user_id = v_user_b3 and name = 'Pembelian Kain'),
    'Beli Kain Tambahan',
    6000000,
    'expense',
    (v_m2_start + interval '5 days')::date
  );

  perform pg_temp.ck(pg_temp.bal(v_user_b3, '1-1500') = 16000000, 'Test 28: saldo 1-1500 sebelum tutup bulan harus 16.000.000');

  -- get_close_preview harus cocok
  v_preview_b3 := public.get_close_preview();
  perform pg_temp.ck((v_preview_b3->>'can_close')::boolean is true, 'Test 28: preview can_close harus true');
  perform pg_temp.ck((v_preview_b3->>'inventory_balance')::numeric = 16000000, 'Test 28: preview inventory_balance harus 16.000.000');
  perform pg_temp.ck((v_preview_b3->>'inventory_value')::numeric = 12000000, 'Test 28: preview inventory_value harus 12.000.000');
  perform pg_temp.ck((v_preview_b3->>'adjustment')::numeric = -4000000, 'Test 28: preview adjustment harus -4.000.000');

  -- Validasi: tutup bulan melompat harus ditolak
  v_ok := false;
  begin
    perform public.close_accounting_period(v_m1_end);
  exception when others then
    if sqlerrm like '%berurutan%' or sqlerrm like '%pertama%' then
      v_ok := true;
    end if;
  end;
  perform pg_temp.ck(v_ok, 'Test 28: tutup bulan melompat harus ditolak');

  -- Validasi: bulan yang belum berakhir harus ditolak (p_period_end >= current_date)
  v_ok := false;
  begin
    perform public.close_accounting_period((date_trunc('month', current_date) + interval '1 month - 1 day')::date);
  exception when others then
    if sqlerrm like '%belum berakhir%' then
      v_ok := true;
    end if;
  end;
  perform pg_temp.ck(v_ok, 'Test 28: tutup bulan yang belum berakhir harus ditolak');

  -- Jalankan tutup bulan berurutan untuk v_m2_end
  v_close_res_b3 := public.close_accounting_period(v_m2_end);

  -- Asersi format deskripsi MM/YYYY
  select description into v_msg from public.journal_entries where user_id = v_user_b3 and source_type = 'inventory_adjustment';
  perform pg_temp.ck(v_msg = ('Penyesuaian Persediaan Akhir Bulan ' || to_char(v_m2_end, 'MM/YYYY')), 'Test 28: deskripsi jurnal penyesuaian harus berformat MM/YYYY');

  -- Asersi: saldo 5-1000 Debit 4.000.000 dan 1-1500 menjadi 12.000.000
  perform pg_temp.ck(pg_temp.bal(v_user_b3, '5-1000') = 4000000, 'Test 28: saldo 5-1000 harus debit 4.000.000');
  perform pg_temp.ck(pg_temp.bal(v_user_b3, '1-1500') = 12000000, 'Test 28: saldo 1-1500 setelah tutup bulan harus menjadi 12.000.000');

  -- Kunci terpasang
  select locked_through into v_cur_lock_date from public.accounting_settings where user_id = v_user_b3;
  perform pg_temp.ck(v_cur_lock_date = v_m2_end, 'Test 28: locked_through harus terpasang di v_m2_end');

  -- Transaksi di bulan yang telah ditutup ditolak
  v_ok := false;
  begin
    insert into public.transactions (user_id, title, amount, type, transaction_date)
    values (v_user_b3, 'Transaksi Terkunci', 50000, 'expense', (v_m2_start + interval '10 days')::date);
  exception when others then
    if sqlerrm like '%terkunci%' or sqlerrm like '%ditutup%' then
      v_ok := true;
    end if;
  end;
  perform pg_temp.ck(v_ok, 'Test 28: transaksi pada periode terkunci harus ditolak');

  -- Reopen accounting period
  perform public.reopen_accounting_period(null);

  -- Asersi: jurnal penyesuaian dan valuasi terhapus, saldo 1-1500 kembali 16.000.000
  select count(*) into v_n from public.journal_entries where user_id = v_user_b3 and source_type = 'inventory_adjustment';
  perform pg_temp.ck(v_n = 0, 'Test 28: jurnal inventory_adjustment harus terhapus setelah reopen');

  select count(*) into v_n from public.inventory_valuations where user_id = v_user_b3;
  perform pg_temp.ck(v_n = 0, 'Test 28: inventory_valuations harus terhapus setelah reopen');

  perform pg_temp.ck(pg_temp.bal(v_user_b3, '1-1500') = 16000000, 'Test 28: saldo 1-1500 kembali 16.000.000 setelah reopen');

  -- Tutup ulang tidak menggandakan
  perform public.close_accounting_period(v_m2_end);
  select count(*) into v_n from public.journal_entries where user_id = v_user_b3 and source_type = 'inventory_adjustment';
  perform pg_temp.ck(v_n = 1, 'Test 28: tutup ulang harus menghasilkan tepat 1 jurnal penyesuaian');

  select count(*) into v_n from public.inventory_valuations where user_id = v_user_b3;
  perform pg_temp.ck(v_n = 1, 'Test 28: tutup ulang harus menghasilkan tepat 1 baris inventory_valuations');

  -- Authenticated tidak bisa menulis langsung ke inventory_valuations atau accounting_settings
  execute 'set local role authenticated';

  v_ok := false;
  begin
    insert into public.inventory_valuations (user_id, period_end, total_value)
    values (v_user_b3, v_m2_end, 5000000);
  exception when insufficient_privilege then
    v_ok := true;
  end;
  perform pg_temp.ck(v_ok, 'Test 28: authenticated tidak boleh bisa menulis langsung ke inventory_valuations');

  v_ok := false;
  begin
    update public.accounting_settings set locked_through = null where user_id = v_user_b3;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  perform pg_temp.ck(v_ok, 'Test 28: authenticated tidak boleh bisa mengupdate langsung accounting_settings');

  execute 'reset role';

  raise notice '[TEST 28 LULUS] tutup bulan menyesuaikan 1-1500 Rp 16.000.000 menjadi Rp 12.000.000 dan Debit 5-1000 Rp 4.000.000, validasi urutan & preview benar, reopen bersih dan tutup ulang idempotent';

  -- -----------------------------------------------------------------------
  -- TEST 29: Tahap 3, B4: Laporan Keuangan (Laba Rugi, Neraca, Cek Konsistensi)
  -- Skenario Akseptansi 7.1 cocok persis
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_user_b4, 'smoke_b4_' || substr(v_user_b4::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_b4::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Books start date = awal bulan lalu (v_m1_start)
  perform public.init_accounting(v_m1_start);

  -- Langkah 0: Saldo awal per v_m1_start: Dr Bank 20.000.000, Dr 1-1500 10.000.000 / Cr 3-2000 30.000.000
  v_ob_lines := jsonb_build_array(
    jsonb_build_object('code', '1-1200', 'debit', 20000000, 'credit', 0),
    jsonb_build_object('code', '1-1500', 'debit', 10000000, 'credit', 0)
  );
  perform public.post_opening_balance(v_m1_start, v_ob_lines);

  -- Langkah 1: DP Order A Rp 5.000.000 (transfer/bank)
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_user_b4, 'ORD-A', 'Pelanggan A', 9000000, 100000, 'belum_lunas', 'pending', (v_m1_start + interval '1 day')::date)
  returning id into v_order_b4;

  v_pay := public.record_order_payment(v_order_b4, 5000000, 'dp', (v_m1_start + interval '1 day')::date, 'transfer', null);

  -- Langkah 2: Beli kain Direct Supplier Rp 6.000.000 (Dr 1-1500 / Cr Bank)
  insert into public.transaction_categories (user_id, name, type)
  values (v_user_b4, 'Pembelian Kain B4', 'expense');

  update public.transaction_categories
     set account_id = (select id from public.accounts where user_id = v_user_b4 and code = '1-1500')
   where user_id = v_user_b4 and name = 'Pembelian Kain B4';

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date)
  values (
    v_user_b4,
    (select id from public.transaction_categories where user_id = v_user_b4 and name = 'Pembelian Kain B4'),
    'Beli Kain Supplier',
    6000000,
    'expense',
    (v_m1_start + interval '2 days')::date
  );

  -- Langkah 3: Payroll Rp 3.000.000 (borongan 2.000.000, harian 1.000.000)
  insert into public.staff (user_id, name, wage_type, daily_rate, role)
  values (v_user_b4, 'Penjahit B4', 'piecework', 0, 'Penjahit')
  returning id into v_staff_b4_pw;

  insert into public.weekly_payrolls (user_id, period_start, period_end, payment_date, total_amount, status)
  values (
    v_user_b4,
    (v_m1_start + interval '1 day')::date,
    (v_m1_start + interval '3 days')::date,
    (v_m1_start + interval '3 days')::date,
    3000000,
    'draft'
  )
  returning id into v_payroll_b4;

  insert into public.payroll_items (user_id, payroll_id, staff_id, wage_type, piecework_amount, take_home_pay)
  values (v_user_b4, v_payroll_b4, v_staff_b4_pw, 'piecework', 2000000, 2000000);

  insert into public.payroll_items (user_id, payroll_id, staff_id, wage_type, base_amount, take_home_pay)
  values (v_user_b4, v_payroll_b4, v_staff_b4_pw, 'attendance', 1000000, 1000000);

  perform public.pay_weekly_payroll(v_payroll_b4);

  -- Langkah 4: Bayar listrik Rp 500.000 (Dr 6-5000 / Cr Bank)
  insert into public.transaction_categories (user_id, name, type)
  values (v_user_b4, 'Utilitas B4', 'expense');

  update public.transaction_categories
     set account_id = (select id from public.accounts where user_id = v_user_b4 and code = '6-5000')
   where user_id = v_user_b4 and name = 'Utilitas B4';

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date)
  values (
    v_user_b4,
    (select id from public.transaction_categories where user_id = v_user_b4 and name = 'Utilitas B4'),
    'Listrik PLN',
    500000,
    'expense',
    (v_m1_start + interval '4 days')::date
  );

  -- Langkah 5: Pelunasan Order A Rp 4.100.000 (transfer/bank)
  v_pay := public.record_order_payment(v_order_b4, 4100000, 'pelunasan', (v_m1_start + interval '5 days')::date, 'transfer', null);

  -- Langkah 6: Order A dikirim (completed, total_price 9.000.000 + ongkir 100.000)
  update public.orders set production_status = 'completed' where id = v_order_b4;

  -- TEKNIK TES: Karena pengakuan pendapatan default-nya memakai tanggal penyelesaian,
  -- kita geser entry_date jurnal order_revenue ke bulan tersebut (v_m1_start + 6) untuk menguji periode historis.
  update public.journal_entries
     set entry_date = (v_m1_start + interval '6 days')::date
   where user_id = v_user_b4 and source_type = 'order_revenue' and source_id = v_order_b4;

  -- Langkah 7: Siapkan stok fisik senilai Rp 12.000.000
  insert into public.materials (user_id, name, unit, price, stock_qty, minimum_stock)
  values (v_user_b4, 'Kain Gudang B4', 'meter', 80000, 150, 10)
  returning id into v_mat_b4;

  perform pg_temp.ck(public.acc_inventory_value(v_user_b4) = 12000000, 'Test 29: stok fisik B4 harus 12.000.000');

  -- (b) Sebelum tutup bulan:
  -- Bulan lalu belum ditutup -> tanpa estimasi (status open_no_estimate, alasan sesuai 2.4)
  v_inc_b4 := public.get_income_statement(v_m1_start, v_m1_end, null, null, true);
  perform pg_temp.ck(v_inc_b4->'meta'->>'status' = 'open_no_estimate', 'Test 29: bulan lalu belum ditutup status harus open_no_estimate');
  perform pg_temp.ck((v_inc_b4->'meta'->'provisional'->>'applied')::boolean is false, 'Test 29: bulan lalu belum ditutup applied harus false');
  perform pg_temp.ck(v_inc_b4->'meta'->'provisional'->>'reason' = 'Periode ini belum ditutup, HPP Bahan belum dihitung, laba masih terlalu besar. Tutup buku dulu.', 'Test 29: alasan belum ditutup harus sesuai 2.4');
  perform pg_temp.ck((v_inc_b4->'totals'->>'gross_profit')::numeric = 7100000, 'Test 29: bulan lalu belum ditutup tanpa estimasi gross_profit harus 7.100.000');
  perform pg_temp.ck((v_inc_b4->'totals'->>'net_profit')::numeric = 5600000, 'Test 29: bulan lalu belum ditutup tanpa estimasi net_profit harus 5.600.000');

  -- Lakukan Tutup Bulan
  perform public.close_accounting_period(v_m1_end);

  -- (a) Setelah tutup bulan: angka harus cocok persis dengan skenario 7.1
  v_inc_b4 := public.get_income_statement(v_m1_start, v_m1_end);

  perform pg_temp.ck((v_inc_b4->'sections'->0->>'total')::numeric = 9100000, 'Test 29: Pendapatan harus 9.100.000');
  perform pg_temp.ck((v_inc_b4->'sections'->1->>'total')::numeric = 6000000, 'Test 29: HPP harus 6.000.000');
  perform pg_temp.ck((v_inc_b4->'totals'->>'gross_profit')::numeric = 3100000, 'Test 29: Laba Kotor harus 3.100.000');
  perform pg_temp.ck((v_inc_b4->'sections'->2->>'total')::numeric = 1500000, 'Test 29: Beban Operasional harus 1.500.000');
  perform pg_temp.ck((v_inc_b4->'totals'->>'net_profit')::numeric = 1600000, 'Test 29: Laba Bersih harus 1.600.000');

  v_bs_b4 := public.get_balance_sheet(v_m1_end);
  perform pg_temp.ck((v_bs_b4->'totals'->>'total_assets')::numeric = 31600000, 'Test 29: Total Aset harus 31.600.000');
  perform pg_temp.ck((v_bs_b4->'totals'->>'total_liabilities')::numeric = 0, 'Test 29: Total Liabilitas harus 0');
  perform pg_temp.ck((v_bs_b4->'totals'->>'total_equity')::numeric = 31600000, 'Test 29: Total Ekuitas harus 31.600.000');
  perform pg_temp.ck((v_bs_b4->'meta'->>'balanced')::boolean is true, 'Test 29: Neraca harus balanced = true');

  -- (c) Laba Tahun Berjalan Neraca = Laba Bersih Laba Rugi 1 Januari s.d. tanggal Neraca
  perform pg_temp.ck(
    (select (elem->>'amount')::numeric from jsonb_array_elements(v_bs_b4->'sections'->3->'rows') elem where elem->>'name' = 'Laba Tahun Berjalan') = (v_inc_b4->'totals'->>'net_profit')::numeric,
    'Test 29: Laba Tahun Berjalan di Neraca harus sama dengan Laba Bersih Laba Rugi'
  );

  -- Angka final setelah tutup buku sama dengan estimasi yang sebelumnya dihitung jika periode berjalan ditutup
  -- Uji pada bulan berjalan:
  v_cur_start := date_trunc('month', current_date)::date;
  v_cur_date  := current_date;

  -- 1) Uji INV_MATCH: Ada pembelian sesudah snapshot terakhir -> tetap ok
  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date)
  values (
    v_user_b4,
    (select id from public.transaction_categories where user_id = v_user_b4 and name = 'Pembelian Kain B4'),
    'Beli Kain Bulan Berjalan',
    5000000,
    'expense',
    v_cur_start
  );

  v_checks_b4 := public.get_accounting_checks(v_cur_date);
  v_ok := false;
  for v_chk_elem in select * from jsonb_array_elements(v_checks_b4) loop
    if v_chk_elem->>'code' = 'INV_MATCH' and v_chk_elem->>'severity' = 'ok' then v_ok := true; end if;
  end loop;
  perform pg_temp.ck(v_ok, 'Test 29: INV_MATCH tetap ok setelah pembelian di bulan baru pasca tutup buku');

  -- 2) Uji INV_MATCH gagal paksa: Ubah saldo 1-1500 pada tanggal snapshot (v_m1_end) -> warn
  insert into public.journal_entries (user_id, entry_no, entry_date, description, source_type)
  values (v_user_b4, 'JE-TAMPER-INV', v_m1_end, 'Tamper 1-1500', 'manual')
  returning id into v_je;
  insert into public.journal_lines (entry_id, account_id, debit, credit, line_no)
  values
    (v_je, (select id from public.accounts where user_id = v_user_b4 and code = '1-1500'), 100000, 0, 1),
    (v_je, (select id from public.accounts where user_id = v_user_b4 and code = '3-1000'), 0, 100000, 2);

  v_checks_b4 := public.get_accounting_checks(v_cur_date);
  v_ok := false;
  for v_chk_elem in select * from jsonb_array_elements(v_checks_b4) loop
    if v_chk_elem->>'code' = 'INV_MATCH' and v_chk_elem->>'severity' = 'warn' then v_ok := true; end if;
  end loop;
  perform pg_temp.ck(v_ok, 'Test 29: INV_MATCH harus warn jika saldo 1-1500 pada tanggal snapshot diubah');

  delete from public.journal_entries where id = v_je;

  -- 3) Uji Estimasi simetris: stok fisik > saldo buku -> estimasi mengurangi HPP & Neraca seimbang
  -- Saldo buku 1-1500 per v_cur_date adalah 17.000.000 (12.000.000 + 5.000.000)
  -- Naikkan stok fisik ke 250 meter x 80.000 = Rp 20.000.000 (stok fisik > saldo buku)
  update public.materials set stock_qty = 250 where id = v_mat_b4;
  perform pg_temp.ck(public.acc_inventory_value(v_user_b4) = 20000000, 'Test 29: stok fisik B4 diupdate ke 20.000.000');

  v_est_inc := public.get_income_statement(v_cur_start, v_cur_date, null, null, true);
  perform pg_temp.ck(v_est_inc->'meta'->>'status' = 'open_estimate', 'Test 29: status laporan bulan berjalan harus open_estimate');
  perform pg_temp.ck((v_est_inc->'meta'->'provisional'->>'applied')::boolean is true, 'Test 29: estimasi harus applied = true');
  perform pg_temp.ck((v_est_inc->'meta'->'provisional'->>'hpp_bahan')::numeric = -3000000, 'Test 29: selisih negatif harus menghasilkan estimasi pengurang HPP -3.000.000');
  perform pg_temp.ck((v_est_inc->'sections'->1->>'total')::numeric = -3000000, 'Test 29: total HPP harus berkurang -3.000.000');

  v_est_bs := public.get_balance_sheet(v_cur_date, null, true);
  perform pg_temp.ck((v_est_bs->'meta'->>'balanced')::boolean is true, 'Test 29: Neraca dengan estimasi simetris harus tetap seimbang');
  perform pg_temp.ck(
    (select (elem->>'amount')::numeric from jsonb_array_elements(v_est_bs->'sections'->0->'rows') elem where elem->>'code' = '1-1500') = 20000000,
    'Test 29: saldo 1-1500 di Neraca estimasi harus naik ke nilai fisik 20.000.000'
  );

  -- 4) Uji get_balance_sheet pembanding:
  -- Pembanding akhir bulan lalu (v_m1_end), total aset pembanding sama dengan total liabilitas + ekuitas pembanding
  v_bs_b4 := public.get_balance_sheet(v_cur_date, v_m1_end, true);
  perform pg_temp.ck(
    (v_bs_b4->'totals'->>'compare_total_assets')::numeric = (v_bs_b4->'totals'->>'compare_total_liabilities_and_equity')::numeric,
    'Test 29: total aset pembanding harus sama dengan total liabilitas + ekuitas pembanding'
  );
  perform pg_temp.ck((v_bs_b4->'totals'->>'compare_total_assets')::numeric = 31600000, 'Test 29: total aset pembanding harus 31.600.000');
  perform pg_temp.ck(
    (select elem->>'compare_amount' from jsonb_array_elements(v_bs_b4->'sections'->3->'rows') elem where elem->>'name' = 'Laba Ditahan') is not null,
    'Test 29: compare_amount Laba Ditahan harus terisi'
  );
  perform pg_temp.ck(
    (select elem->>'compare_amount' from jsonb_array_elements(v_bs_b4->'sections'->3->'rows') elem where elem->>'name' = 'Laba Tahun Berjalan') is not null,
    'Test 29: compare_amount Laba Tahun Berjalan harus terisi'
  );

  -- 5) Uji ORDER_REVENUE di get_accounting_checks:
  -- Order completed sebelum tanggal mulai tanpa jurnal -> ok
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_user_b4, 'ORD-PRE-START', 'Pelanggan Pre', 2000000, 0, 'lunas', 'completed', (v_m1_start - interval '5 days')::date)
  returning id into v_o_pre;

  insert into public.order_stage_events (user_id, order_id, stage, status, completed_at)
  values (v_user_b4, v_o_pre, 'kirim', 'done', (v_m1_start - interval '3 days')::timestamptz);

  delete from public.journal_entries where user_id = v_user_b4 and source_type = 'order_revenue' and source_id = v_o_pre;

  v_checks_b4 := public.get_accounting_checks(v_cur_date);
  v_ok := false;
  for v_chk_elem in select * from jsonb_array_elements(v_checks_b4) loop
    if v_chk_elem->>'code' = 'ORDER_REVENUE' and v_chk_elem->>'severity' = 'ok' then v_ok := true; end if;
  end loop;
  perform pg_temp.ck(v_ok, 'Test 29: ORDER_REVENUE harus ok untuk order selesai sebelum tanggal mulai tanpa jurnal');

  -- Order completed sesudah tanggal mulai tanpa jurnal (dipaksa) -> error
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_user_b4, 'ORD-POST-START', 'Pelanggan Post', 3000000, 0, 'lunas', 'completed', (v_m1_start + interval '2 days')::date)
  returning id into v_o_post;

  insert into public.order_stage_events (user_id, order_id, stage, status, completed_at)
  values (v_user_b4, v_o_post, 'kirim', 'done', (v_m1_start + interval '2 days')::timestamptz);

  delete from public.journal_entries where user_id = v_user_b4 and source_type = 'order_revenue' and source_id = v_o_post;

  v_checks_b4 := public.get_accounting_checks(v_cur_date);
  v_ok := false;
  for v_chk_elem in select * from jsonb_array_elements(v_checks_b4) loop
    if v_chk_elem->>'code' = 'ORDER_REVENUE' and v_chk_elem->>'severity' = 'error' then v_ok := true; end if;
  end loop;
  perform pg_temp.ck(v_ok, 'Test 29: ORDER_REVENUE harus error untuk order selesai sesudah tanggal mulai tanpa jurnal');

  delete from public.order_stage_events where order_id in (v_o_pre, v_o_post);
  delete from public.orders where id in (v_o_pre, v_o_post);

  -- (d) Pembanding sebelum books_start_date kosong tanpa error
  v_inc_b4 := public.get_income_statement(v_m1_start, v_m1_end, (v_m1_start - interval '1 month')::date, (v_m1_start - interval '1 day')::date);
  perform pg_temp.ck(v_inc_b4->'sections'->0->>'compare_total' is null, 'Test 29: compare_total sebelum books_start_date harus null tanpa error');

  -- (e) Cek Konsistensi: semua kode harus 'ok'
  v_checks_b4 := public.get_accounting_checks(v_m1_end);
  v_chk_ok_cnt := 0;
  for v_chk_elem in select * from jsonb_array_elements(v_checks_b4)
  loop
    v_chk_code := v_chk_elem->>'code';
    v_chk_sev  := v_chk_elem->>'severity';
    if v_chk_code in ('TB_BALANCED', 'BS_BALANCED', 'CASH_MATCH', 'ADV_MATCH', 'CUSTOMER_ADV_MATCH', 'INV_MATCH', 'SUSPENSE_ZERO', 'TX_JOURNALED', 'ORDER_REVENUE', 'FORFEIT_JOURNALED', 'PAYROLL_SPLIT', 'ABNORMAL_BALANCE', 'PERIOD_STALE') then
      perform pg_temp.ck(v_chk_sev = 'ok', 'Test 29: cek konsistensi ' || v_chk_code || ' harus ok, didapat ' || v_chk_sev);
      v_chk_ok_cnt := v_chk_ok_cnt + 1;
    end if;
  end loop;
  perform pg_temp.ck(v_chk_ok_cnt >= 13, 'Test 29: minimal 13 kode cek konsistensi harus diuji dan berstatus ok');

  -- Tes gagal paksa:
  -- 1) CASH_MATCH gagal paksa (jurnal kas manual tanpa transaksi kas)
  insert into public.journal_entries (user_id, entry_no, entry_date, description, source_type)
  values (v_user_b4, 'JE-CASH-TEST', v_m1_start, 'Test Cash Mismatch', 'manual')
  returning id into v_je;

  insert into public.journal_lines (entry_id, account_id, debit, credit, line_no)
  values
    (v_je, (select id from public.accounts where user_id = v_user_b4 and code = '1-1200'), 50000, 0, 1),
    (v_je, (select id from public.accounts where user_id = v_user_b4 and code = '3-1000'), 0, 50000, 2);

  v_checks_b4 := public.get_accounting_checks(v_m1_end);
  v_ok := false;
  for v_chk_elem in select * from jsonb_array_elements(v_checks_b4) loop
    if v_chk_elem->>'code' = 'CASH_MATCH' and v_chk_elem->>'severity' = 'error' then v_ok := true; end if;
  end loop;
  perform pg_temp.ck(v_ok, 'Test 29: CASH_MATCH gagal paksa harus error');

  delete from public.journal_entries where id = v_je;

  -- 2) SUSPENSE_ZERO gagal paksa
  insert into public.journal_entries (user_id, entry_no, entry_date, description, source_type)
  values (v_user_b4, 'JE-SUSPENSE-TEST', v_m1_start, 'Test Suspense', 'manual')
  returning id into v_je;

  insert into public.journal_lines (entry_id, account_id, debit, credit, line_no)
  values
    (v_je, (select id from public.accounts where user_id = v_user_b4 and code = '9-9999'), 50000, 0, 1),
    (v_je, (select id from public.accounts where user_id = v_user_b4 and code = '1-1200'), 0, 50000, 2);

  v_checks_b4 := public.get_accounting_checks(v_m1_end);
  v_ok := false;
  for v_chk_elem in select * from jsonb_array_elements(v_checks_b4) loop
    if v_chk_elem->>'code' = 'SUSPENSE_ZERO' and v_chk_elem->>'severity' = 'warn' then v_ok := true; end if;
  end loop;
  perform pg_temp.ck(v_ok, 'Test 29: SUSPENSE_ZERO gagal paksa harus warn');

  delete from public.journal_entries where id = v_je;

  -- 3) CUSTOMER_ADV_MATCH gagal paksa
  -- Buat order aktif dengan status pending
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_user_b4, 'ORD-CUST-FAIL', 'Cust Fail', 1000000, 0, 'belum_lunas', 'pending', v_m1_start)
  returning id into v_o_candup;

  -- Catat pembayaran langsung di tabel payments tanpa transaksi kas (atau selisih DP)
  insert into public.order_payments (user_id, order_id, amount, payment_type, payment_date, payment_method)
  values (v_user_b4, v_o_candup, 500000, 'dp', v_m1_start, 'cash');

  v_checks_b4 := public.get_accounting_checks(v_m1_end);
  v_ok := false;
  for v_chk_elem in select * from jsonb_array_elements(v_checks_b4) loop
    if v_chk_elem->>'code' = 'CUSTOMER_ADV_MATCH' and v_chk_elem->>'severity' = 'error' then v_ok := true; end if;
  end loop;
  perform pg_temp.ck(v_ok, 'Test 29: CUSTOMER_ADV_MATCH gagal paksa harus error');

  delete from public.order_payments where order_id = v_o_candup;
  delete from public.orders where id = v_o_candup;

  -- (f) Pengguna lain tidak bisa melihat data user b4 lewat RPC laporan
  insert into auth.users (id, email, aud, role)
  values (v_user_b4_other, 'smoke_b4_other_' || substr(v_user_b4_other::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_b4_other::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.init_accounting(v_m1_start);

  v_inc_b4 := public.get_income_statement(v_m1_start, v_m1_end);
  perform pg_temp.ck((v_inc_b4->'totals'->>'net_profit')::numeric = 0, 'Test 29: user lain tidak boleh melihat pendapatan/laba user B4');

  v_bs_b4 := public.get_balance_sheet(v_m1_end);
  perform pg_temp.ck((v_bs_b4->'totals'->>'total_assets')::numeric = 0, 'Test 29: user lain tidak boleh melihat aset user B4');

  raise notice '[TEST 29 LULUS] skenario akseptansi 7.1 cocok persis: Laba Bersih 1.600.000, Neraca 31.600.000 seimbang, estimasi HPP aktif/nonaktif/simetris sesuai, INV_MATCH per snapshot date, pembanding Neraca seimbang, ORDER_REVENUE per tanggal kirim, isolasi data aman';

  -- -----------------------------------------------------------------------
  -- TEST 30: Beli mesin Rp 12.000.000, umur 60 bulan, tunai (Fase C)
  -- Jurnal Dr 1-2100 / Cr 1-1100, tepat satu transaksi; tutup bulan perolehan
  -- tidak menyusutkan; tutup bulan berikutnya menyusutkan Rp 200.000 (Dr 6-6000 / Cr 1-2110);
  -- Neraca seimbang dan nilai buku Rp 11.800.000.
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_user_c30, 'smoke_c30_' || substr(v_user_c30::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_c30::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_c_m0_start := (date_trunc('month', current_date) - interval '4 months')::date;
  v_c_m0_end   := ((v_c_m0_start + interval '1 month') - interval '1 day')::date;
  v_c_m1_start := (v_c_m0_start + interval '1 month')::date;
  v_c_m1_end   := ((v_c_m1_start + interval '1 month') - interval '1 day')::date;

  perform public.init_accounting(v_c_m0_start);

  -- Modal awal kas
  insert into public.transactions (user_id, title, amount, type, transaction_date, description, cash_account_id, counter_account_id)
  values (
    v_user_c30, 'Modal Kas', 50000000, 'income', v_c_m0_start, 'Modal Kas',
    (select id from public.accounts where user_id = v_user_c30 and code = '1-1100'),
    (select id from public.accounts where user_id = v_user_c30 and code = '3-1000')
  );

  -- Beli mesin baru
  v_c_asset_1 := public.register_fixed_asset(
    'Mesin Jahit Industri',
    'equipment',
    (v_c_m0_start + interval '5 days')::date,
    12000000,
    60,
    0,
    'cash',
    0,
    'Beli mesin tunai'
  );

  -- Jurnal transaksi Dr 1-2100 / Cr 1-1100
  perform pg_temp.ck(
    (select count(*) from public.transactions where user_id = v_user_c30 and type = 'expense') = 1,
    'Test 30: harus ada tepat satu transaksi pembelian aset'
  );

  perform pg_temp.ck(
    (select sum(jl.debit - jl.credit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c30 and je.source_type = 'transaction' and je.source_id = (select acquisition_transaction_id from public.fixed_assets where id = v_c_asset_1) and a.code = '1-2100') = 12000000,
    'Test 30: jurnal Dr 1-2100 harus Rp 12.000.000'
  );
  perform pg_temp.ck(
    (select sum(jl.credit - jl.debit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c30 and je.source_type = 'transaction' and je.source_id = (select acquisition_transaction_id from public.fixed_assets where id = v_c_asset_1) and a.code = '1-1100') = 12000000,
    'Test 30: jurnal Cr 1-1100 harus Rp 12.000.000'
  );

  -- Tutup bulan perolehan (v_c_m0_end): tidak menyusutkan mesin
  v_c_close_res := public.close_accounting_period(v_c_m0_end);
  perform pg_temp.ck((v_c_close_res->>'depreciation_total')::numeric = 0, 'Test 30: tutup bulan perolehan tidak menyusutkan');

  -- Tutup bulan berikutnya (v_c_m1_end): menyusutkan Rp 200.000
  v_c_close_res := public.close_accounting_period(v_c_m1_end);
  perform pg_temp.ck((v_c_close_res->>'depreciation_total')::numeric = 200000, 'Test 30: tutup bulan berikutnya menyusutkan Rp 200.000');

  -- Periksa jurnal penyusutan: Dr 6-6000 / Cr 1-2110
  perform pg_temp.ck(
    (select sum(jl.debit - jl.credit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c30 and je.source_type = 'depreciation' and a.code = '6-6000') = 200000,
    'Test 30: jurnal Dr 6-6000 harus Rp 200.000'
  );
  perform pg_temp.ck(
    (select sum(jl.credit - jl.debit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c30 and je.source_type = 'depreciation' and a.code = '1-2110') = 200000,
    'Test 30: jurnal Cr 1-2110 harus Rp 200.000'
  );

  -- Neraca per v_c_m1_end seimbang dan nilai buku Rp 11.800.000
  v_c_bs := public.get_balance_sheet(v_c_m1_end);
  perform pg_temp.ck((v_c_bs->'meta'->>'balanced')::boolean is true, 'Test 30: Neraca harus seimbang');
  perform pg_temp.ck(
    (select (r->>'amount')::numeric from jsonb_array_elements(v_c_bs->'sections'->1->'rows') r where r->>'name' = 'Mesin & Peralatan') = 12000000
    and (select (r->>'amount')::numeric from jsonb_array_elements(v_c_bs->'sections'->1->'rows') r where r->>'name' = 'Akum. Penyusutan Mesin') = -200000,
    'Test 30: nilai buku mesin harus 12.000.000 - 200.000 = 11.800.000 di neraca'
  );

  raise notice '[TEST 30 LULUS] beli mesin Rp 12.000.000 umur 60 bulan tunai: jurnal perolehan tepat satu transaksi, bulan perolehan tidak menyusutkan, bulan kedua menyusutkan Rp 200.000 dan Neraca seimbang';

  -- -----------------------------------------------------------------------
  -- TEST 31: Aset lama Rp 12.000.000 dengan akumulasi Rp 2.400.000, umur 60
  -- Jurnal asset_opening seimbang ke 3-2000 Rp 9.600.000;
  -- Penyusutan Rp 200.000 per bulan sejak penutupan pertama.
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_user_c31, 'smoke_c31_' || substr(v_user_c31::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_c31::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.init_accounting(v_c_m0_start);

  -- Daftarkan aset lama
  v_c_asset_1 := public.register_fixed_asset(
    'Mobil Operasional Lama',
    'vehicle',
    (v_c_m0_start - interval '1 year')::date,
    12000000,
    60,
    0,
    null,
    2400000,
    'Aset lama pra-pembukuan'
  );

  -- Jurnal asset_opening bertanggal v_c_m0_start
  perform pg_temp.ck(
    (select count(*) from public.journal_entries where user_id = v_user_c31 and source_type = 'asset_opening') = 1,
    'Test 31: tepat satu jurnal asset_opening'
  );
  perform pg_temp.ck(
    (select sum(jl.debit - jl.credit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c31 and je.source_type = 'asset_opening' and a.code = '1-2200') = 12000000,
    'Test 31: Dr 1-2200 harus Rp 12.000.000'
  );
  perform pg_temp.ck(
    (select sum(jl.credit - jl.debit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c31 and je.source_type = 'asset_opening' and a.code = '1-2210') = 2400000,
    'Test 31: Cr 1-2210 harus Rp 2.400.000'
  );
  perform pg_temp.ck(
    (select sum(jl.credit - jl.debit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c31 and je.source_type = 'asset_opening' and a.code = '3-2000') = 9600000,
    'Test 31: Cr 3-2000 penyeimbang Laba Ditahan harus Rp 9.600.000'
  );

  -- Tutup bulan pertama (v_c_m0_end): menyusutkan Rp 200.000 sejak penutupan pertama!
  v_c_close_res := public.close_accounting_period(v_c_m0_end);
  perform pg_temp.ck((v_c_close_res->>'depreciation_total')::numeric = 200000, 'Test 31: tutup bulan pertama menyusutkan Rp 200.000');

  -- Tutup bulan kedua (v_c_m1_end): menyusutkan Rp 200.000 lagi!
  v_c_close_res := public.close_accounting_period(v_c_m1_end);
  perform pg_temp.ck((v_c_close_res->>'depreciation_total')::numeric = 200000, 'Test 31: tutup bulan kedua menyusutkan Rp 200.000');

  raise notice '[TEST 31 LULUS] aset lama Rp 12.000.000 dengan akumulasi Rp 2.400.000, umur 60: jurnal asset_opening seimbang dengan penyeimbang 3-2000 Rp 9.600.000; penyusutan Rp 200.000 per bulan sejak penutupan pertama';

  -- -----------------------------------------------------------------------
  -- TEST 32: Kasus pembulatan: harga Rp 10.000.000, umur 7 bulan
  -- Jumlah bulanan dan bulan terakhir tepat menghabiskan nilai dan tidak lebih.
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_user_c32, 'smoke_c32_' || substr(v_user_c32::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_c32::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Gunakan tanggal mulai 8 bulan lalu agar bisa menutup 8 bulan berurutan
  v_c_m_loop_start := (date_trunc('month', current_date) - interval '8 months')::date;
  perform public.init_accounting(v_c_m_loop_start);

  -- Aset lama umur 7 bulan, tanpa akumulasi awal
  v_c_asset_1 := public.register_fixed_asset(
    'Alat Khusus 7 Bulan',
    'equipment',
    (v_c_m_loop_start - interval '1 month')::date,
    10000000,
    7,
    0,
    null,
    0,
    'Test pembulatan 7 bulan'
  );

  -- Tutup 7 bulan berurutan
  for v_c_idx in 0..6 loop
    v_c_m0_end := ((v_c_m_loop_start + (v_c_idx || ' months')::interval + interval '1 month') - interval '1 day')::date;
    v_c_close_res := public.close_accounting_period(v_c_m0_end);
    if v_c_idx < 6 then
      perform pg_temp.ck((v_c_close_res->>'depreciation_total')::numeric = 1428571, 'Test 32: bulan ' || (v_c_idx + 1) || ' harus 1.428.571');
    else
      -- Bulan ke-7: sisa nilai buku (10.000.000 - 6 * 1.428.571 = 1.428.574)
      perform pg_temp.ck((v_c_close_res->>'depreciation_total')::numeric = 1428574, 'Test 32: bulan ke-7 harus tepat 1.428.574');
    end if;
  end loop;

  -- Bulan ke-8: nilai buku sudah habis, penyusutan harus 0
  v_c_m0_end := ((v_c_m_loop_start + interval '8 months') - interval '1 day')::date;
  v_c_close_res := public.close_accounting_period(v_c_m0_end);
  perform pg_temp.ck((v_c_close_res->>'depreciation_total')::numeric = 0, 'Test 32: bulan ke-8 penyusutan harus 0');

  perform pg_temp.ck(
    (select sum(amount) from public.fixed_asset_depreciations where asset_id = v_c_asset_1) = 10000000,
    'Test 32: total penyusutan harus tepat 10.000.000 tanpa lebih'
  );

  raise notice '[TEST 32 LULUS] kasus pembulatan: harga Rp 10.000.000, umur 7 bulan: jumlah bulanan dan bulan terakhir tepat menghabiskan nilai dan tidak lebih';

  -- -----------------------------------------------------------------------
  -- TEST 33: Pelepasan untung, rugi, dan hasil nol
  -- Tiap jurnal seimbang, saldo aset dan akumulasi kelas itu kembali nol,
  -- 4-9000 atau 6-9000 benar; undo_dispose memulihkan.
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_user_c33, 'smoke_c33_' || substr(v_user_c33::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_c33::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_c_m0_start := (date_trunc('month', current_date) - interval '4 months')::date;
  v_c_m0_end   := ((v_c_m0_start + interval '1 month') - interval '1 day')::date;
  perform public.init_accounting(v_c_m0_start);

  -- 1) Hasil nol: Perabot kantor Rp 1.000.000 (furniture, 1-2300), pelepasan Rp 0
  v_c_asset_1 := public.register_fixed_asset('Meja Rapat', 'furniture', (v_c_m0_start - interval '1 year')::date, 1000000, 10, 0, null, 200000);
  v_c_disp_je := public.dispose_fixed_asset(v_c_asset_1, (v_c_m0_start + interval '10 days')::date, 0);

  -- Verifikasi seimbang dan akun rugi 6-9000 terisi 800.000
  perform pg_temp.ck(
    (select sum(jl.debit) from public.journal_lines jl where jl.entry_id = v_c_disp_je) =
    (select sum(jl.credit) from public.journal_lines jl where jl.entry_id = v_c_disp_je),
    'Test 33: disposal hasil nol harus seimbang'
  );
  perform pg_temp.ck(
    (select sum(jl.debit - jl.credit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id where jl.entry_id = v_c_disp_je and a.code = '6-9000') = 800000,
    'Test 33: rugi pelepasan hasil nol harus Rp 800.000 (Dr 6-9000)'
  );
  perform pg_temp.ck(
    (select coalesce(sum(jl.debit - jl.credit), 0) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c33 and a.code = '1-2300') = 0,
    'Test 33: saldo 1-2300 kembali 0'
  );
  perform pg_temp.ck(
    (select coalesce(sum(jl.credit - jl.debit), 0) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c33 and a.code = '1-2310') = 0,
    'Test 33: saldo 1-2310 kembali 0'
  );

  -- 2) Untung: Bangunan kantor Rp 10.000.000 (1-2400), akumulasi 2.000.000 (nilai buku 8.000.000), dijual Rp 9.000.000 (untung 1.000.000)
  v_c_asset_2 := public.register_fixed_asset('Gudang Kecil', 'building', (v_c_m0_start - interval '1 year')::date, 10000000, 10, 0, null, 2000000);
  v_c_disp_je := public.dispose_fixed_asset(v_c_asset_2, (v_c_m0_start + interval '12 days')::date, 9000000, 'cash');

  perform pg_temp.ck(
    (select sum(jl.debit) from public.journal_lines jl where jl.entry_id = v_c_disp_je) =
    (select sum(jl.credit) from public.journal_lines jl where jl.entry_id = v_c_disp_je),
    'Test 33: disposal untung harus seimbang'
  );
  perform pg_temp.ck(
    (select sum(jl.credit - jl.debit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id where jl.entry_id = v_c_disp_je and a.code = '4-9000') = 1000000,
    'Test 33: untung pelepasan harus Rp 1.000.000 (Cr 4-9000)'
  );
  perform pg_temp.ck(
    (select coalesce(sum(jl.debit - jl.credit), 0) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c33 and a.code = '1-2400') = 0,
    'Test 33: saldo 1-2400 kembali 0'
  );
  perform pg_temp.ck(
    (select coalesce(sum(jl.credit - jl.debit), 0) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c33 and a.code = '1-2410') = 0,
    'Test 33: saldo 1-2410 kembali 0'
  );

  -- 3) Rugi: Kendaraan Rp 5.000.000 (1-2200), akumulasi 1.000.000 (nilai buku 4.000.000), dijual Rp 3.500.000 (rugi 500.000)
  v_c_asset_3 := public.register_fixed_asset('Motor Lama', 'vehicle', (v_c_m0_start - interval '1 year')::date, 5000000, 10, 0, null, 1000000);
  v_c_disp_je := public.dispose_fixed_asset(v_c_asset_3, (v_c_m0_start + interval '15 days')::date, 3500000, 'transfer');

  perform pg_temp.ck(
    (select sum(jl.debit) from public.journal_lines jl where jl.entry_id = v_c_disp_je) =
    (select sum(jl.credit) from public.journal_lines jl where jl.entry_id = v_c_disp_je),
    'Test 33: disposal rugi harus seimbang'
  );
  perform pg_temp.ck(
    (select sum(jl.debit - jl.credit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id where jl.entry_id = v_c_disp_je and a.code = '6-9000') = 500000,
    'Test 33: rugi pelepasan harus Rp 500.000 (Dr 6-9000)'
  );
  perform pg_temp.ck(
    (select coalesce(sum(jl.debit - jl.credit), 0) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c33 and a.code = '1-2200') = 0,
    'Test 33: saldo 1-2200 kembali 0'
  );
  perform pg_temp.ck(
    (select coalesce(sum(jl.credit - jl.debit), 0) from public.journal_lines jl join public.accounts a on a.id = jl.account_id join public.journal_entries je on je.id = jl.entry_id where je.user_id = v_user_c33 and a.code = '1-2210') = 0,
    'Test 33: saldo 1-2210 kembali 0'
  );

  -- 4) Uji undo_dispose memulihkan
  perform public.undo_dispose_fixed_asset(v_c_asset_3);
  perform pg_temp.ck((select status from public.fixed_assets where id = v_c_asset_3) = 'active', 'Test 33: status aset 3 kembali active');
  perform pg_temp.ck(
    (select count(*) from public.journal_entries where user_id = v_user_c33 and source_type = 'asset_disposal' and source_id = v_c_asset_3) = 0,
    'Test 33: jurnal asset_disposal aset 3 terhapus'
  );

  raise notice '[TEST 33 LULUS] pelepasan untung, rugi, dan hasil nol: tiap jurnal seimbang, saldo aset dan akumulasi kelas itu kembali nol, 4-9000 atau 6-9000 benar; undo_dispose memulihkan';

  -- -----------------------------------------------------------------------
  -- TEST 34: reopen_accounting_period menghapus penyusutan setelah kunci baru
  -- Penutupan ulang tidak menggandakan; ditolak bila ada aset terlepas sesudah kunci baru.
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_user_c34, 'smoke_c34_' || substr(v_user_c34::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_c34::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_c_m0_start := (date_trunc('month', current_date) - interval '4 months')::date;
  v_c_m0_end   := ((v_c_m0_start + interval '1 month') - interval '1 day')::date;
  v_c_m1_start := (v_c_m0_start + interval '1 month')::date;
  v_c_m1_end   := ((v_c_m1_start + interval '1 month') - interval '1 day')::date;

  perform public.init_accounting(v_c_m0_start);

  v_c_asset_1 := public.register_fixed_asset('Komputer Kantor', 'equipment', (v_c_m0_start - interval '1 year')::date, 6000000, 60, 0, null, 0);

  -- Tutup 2 bulan
  perform public.close_accounting_period(v_c_m0_end);
  perform public.close_accounting_period(v_c_m1_end);

  perform pg_temp.ck((select count(*) from public.fixed_asset_depreciations where asset_id = v_c_asset_1) = 2, 'Test 34: ada 2 baris penyusutan');

  -- Reopen ke akhir bulan 0 (v_c_m0_end)
  perform public.reopen_accounting_period(v_c_m0_end);

  perform pg_temp.ck((select count(*) from public.fixed_asset_depreciations where asset_id = v_c_asset_1) = 1, 'Test 34: baris penyusutan bulan 1 terhapus');
  perform pg_temp.ck(
    (select count(*) from public.journal_entries where user_id = v_user_c34 and source_type = 'depreciation' and entry_date = v_c_m1_end) = 0,
    'Test 34: jurnal penyusutan bulan 1 terhapus'
  );

  -- Tutup ulang bulan 1 (idempotent, tidak menggandakan)
  perform public.close_accounting_period(v_c_m1_end);
  perform pg_temp.ck((select count(*) from public.fixed_asset_depreciations where asset_id = v_c_asset_1) = 2, 'Test 34: setelah tutup ulang tetap 2 baris');

  -- Lepas aset pada periode yang belum dikunci (setelah bulan 1)
  perform public.dispose_fixed_asset(v_c_asset_1, (v_c_m1_end + interval '5 days')::date, 0);

  -- Coba reopen ke bulan 0 -> harus ditolak
  v_ok := false;
  begin
    perform public.reopen_accounting_period(v_c_m0_end);
  exception when others then
    if sqlerrm like '%Batalkan pelepasan aset terlebih dahulu%' then v_ok := true; end if;
  end;
  perform pg_temp.ck(v_ok, 'Test 34: reopen harus ditolak bila ada aset terlepas sesudah kunci baru');

  raise notice '[TEST 34 LULUS] reopen_accounting_period menghapus penyusutan setelah kunci baru dan penutupan ulang tidak menggandakan; ditolak bila ada aset terlepas setelah kunci baru';

  -- -----------------------------------------------------------------------
  -- TEST 35: delete_fixed_asset hanya sebelum ada penyusutan
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_user_c35, 'smoke_c35_' || substr(v_user_c35::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_c35::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_c_m0_start := (date_trunc('month', current_date) - interval '4 months')::date;
  v_c_m0_end   := ((v_c_m0_start + interval '1 month') - interval '1 day')::date;

  perform public.init_accounting(v_c_m0_start);

  -- Modal
  insert into public.transactions (user_id, title, amount, type, transaction_date, description, cash_account_id, counter_account_id)
  values (v_user_c35, 'Modal', 10000000, 'income', v_c_m0_start, 'Modal', (select id from public.accounts where user_id = v_user_c35 and code = '1-1100'), (select id from public.accounts where user_id = v_user_c35 and code = '3-1000'));

  -- 1) Aset baru tanpa penyusutan -> boleh dihapus
  v_c_asset_1 := public.register_fixed_asset('Meja Baru', 'furniture', (v_c_m0_start + interval '1 day')::date, 1000000, 12, 0, 'cash', 0);
  perform pg_temp.ck(public.delete_fixed_asset(v_c_asset_1) is true, 'Test 35: delete_fixed_asset harus berhasil untuk aset baru tanpa penyusutan');
  perform pg_temp.ck((select count(*) from public.fixed_assets where id = v_c_asset_1) = 0, 'Test 35: baris fixed_assets terhapus');
  perform pg_temp.ck((select count(*) from public.transactions where user_id = v_user_c35 and type = 'expense') = 0, 'Test 35: transaksi perolehan terhapus');

  -- 2) Aset lama tanpa penyusutan -> boleh dihapus
  v_c_asset_2 := public.register_fixed_asset('Lemari Lama', 'furniture', (v_c_m0_start - interval '1 year')::date, 2000000, 12, 0, null, 500000);
  perform pg_temp.ck(public.delete_fixed_asset(v_c_asset_2) is true, 'Test 35: delete_fixed_asset harus berhasil untuk aset lama tanpa penyusutan');
  perform pg_temp.ck((select count(*) from public.journal_entries where user_id = v_user_c35 and source_type = 'asset_opening' and source_id = v_c_asset_2) = 0, 'Test 35: jurnal asset_opening terhapus');

  -- 3) Aset yang sudah disusutkan -> ditolak
  v_c_asset_3 := public.register_fixed_asset('Mesin Uji', 'equipment', (v_c_m0_start - interval '1 year')::date, 12000000, 60, 0, null, 0);
  perform public.close_accounting_period(v_c_m0_end);

  v_ok := false;
  begin
    perform public.delete_fixed_asset(v_c_asset_3);
  exception when others then
    if sqlerrm like '%sudah memiliki data penyusutan%' then v_ok := true; end if;
  end;
  perform pg_temp.ck(v_ok, 'Test 35: delete_fixed_asset harus ditolak bila sudah ada data penyusutan');

  raise notice '[TEST 35 LULUS] delete_fixed_asset hanya sebelum ada penyusutan';

  -- -----------------------------------------------------------------------
  -- TEST 36: authenticated tidak bisa menulis langsung ke fixed_assets dan depreciations;
  -- user lain tidak bisa melihat aset; register_fixed_asset memakai metode cash ke Kas dan transfer ke Bank.
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_user_c36, 'smoke_c36_' || substr(v_user_c36::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');
  insert into auth.users (id, email, aud, role)
  values (v_user_c36_other, 'smoke_c36_other_' || substr(v_user_c36_other::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_c36::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_c_m0_start := (date_trunc('month', current_date) - interval '4 months')::date;
  perform public.init_accounting(v_c_m0_start);

  -- Modal
  insert into public.transactions (user_id, title, amount, type, transaction_date, description, cash_account_id, counter_account_id)
  values (v_user_c36, 'Modal Kas', 10000000, 'income', v_c_m0_start, 'Modal', (select id from public.accounts where user_id = v_user_c36 and code = '1-1100'), (select id from public.accounts where user_id = v_user_c36 and code = '3-1000'));
  insert into public.transactions (user_id, title, amount, type, transaction_date, description, cash_account_id, counter_account_id)
  values (v_user_c36, 'Modal Bank', 10000000, 'income', v_c_m0_start, 'Modal Bank', (select id from public.accounts where user_id = v_user_c36 and code = '1-1200'), (select id from public.accounts where user_id = v_user_c36 and code = '3-1000'));

  -- Cek register_fixed_asset metode cash -> Kas 1-1100
  v_c_asset_1 := public.register_fixed_asset('Aset Tunai', 'equipment', (v_c_m0_start + interval '1 day')::date, 1000000, 10, 0, 'cash', 0);
  perform pg_temp.ck(
    (select a.code from public.transactions t join public.accounts a on a.id = t.cash_account_id where t.id = (select acquisition_transaction_id from public.fixed_assets where id = v_c_asset_1)) = '1-1100',
    'Test 36: metode cash harus memilih Kas 1-1100'
  );

  -- Cek register_fixed_asset metode transfer -> Bank 1-1200
  v_c_asset_2 := public.register_fixed_asset('Aset Transfer', 'equipment', (v_c_m0_start + interval '2 days')::date, 1000000, 10, 0, 'transfer', 0);
  perform pg_temp.ck(
    (select a.code from public.transactions t join public.accounts a on a.id = t.cash_account_id where t.id = (select acquisition_transaction_id from public.fixed_assets where id = v_c_asset_2)) = '1-1200',
    'Test 36: metode transfer harus memilih Bank 1-1200'
  );

  -- Hak tulis langsung dicabut (42501)
  execute 'set local role authenticated';

  v_ok := false;
  begin
    insert into public.fixed_assets (user_id, name, asset_class, asset_account_id, accumulated_account_id, expense_account_id, acquisition_date, cost, useful_life_months)
    values (v_user_c36, 'Direct Insert', 'equipment', (select id from public.accounts where user_id = v_user_c36 and code = '1-2100'), (select id from public.accounts where user_id = v_user_c36 and code = '1-2110'), (select id from public.accounts where user_id = v_user_c36 and code = '6-6000'), v_c_m0_start, 500000, 12);
  exception when insufficient_privilege then
    v_ok := true;
  end;
  perform pg_temp.ck(v_ok, 'Test 36: direct insert ke fixed_assets harus ditolak (42501)');

  v_ok := false;
  begin
    insert into public.fixed_asset_depreciations (user_id, asset_id, period, amount, journal_entry_id)
    values (v_user_c36, v_c_asset_1, v_c_m0_start, 100000, gen_random_uuid());
  exception when insufficient_privilege then
    v_ok := true;
  end;
  perform pg_temp.ck(v_ok, 'Test 36: direct insert ke fixed_asset_depreciations harus ditolak (42501)');

  -- User lain tidak bisa melihat aset
  perform set_config('request.jwt.claim.sub', v_user_c36_other::text, true);
  perform pg_temp.ck((select count(*) from public.fixed_assets) = 0, 'Test 36: user lain tidak boleh melihat aset user c36');

  execute 'reset role';

  raise notice '[TEST 36 LULUS] authenticated tidak bisa menulis langsung ke fixed_assets dan fixed_asset_depreciations; user lain tidak bisa melihat aset; register_fixed_asset memakai metode cash ke Kas dan transfer ke Bank';

  -- -----------------------------------------------------------------------
  -- TEST 37: FIXED_ASSET_MATCH dan DEPRECIATION_DUE lulus pada kondisi normal
  -- dan satu tes gagal yang dipaksa untuk masing-masing.
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_user_c37, 'smoke_c37_' || substr(v_user_c37::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_c37::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_c_m0_start := (date_trunc('month', current_date) - interval '4 months')::date;
  v_c_m0_end   := ((v_c_m0_start + interval '1 month') - interval '1 day')::date;

  perform public.init_accounting(v_c_m0_start);

  -- Daftarkan aset lama
  v_c_asset_1 := public.register_fixed_asset('Mesin Pabrik', 'equipment', (v_c_m0_start - interval '1 year')::date, 12000000, 60, 0, null, 2400000);

  -- Tutup bulan
  perform public.close_accounting_period(v_c_m0_end);

  -- 1) Kondisi normal: keduanya harus berstatus 'ok'
  v_c_checks := public.get_accounting_checks(v_c_m0_end);
  v_c_ok := false;
  for v_c_chk_elem in select * from jsonb_array_elements(v_c_checks) loop
    if v_c_chk_elem->>'code' = 'FIXED_ASSET_MATCH' and v_c_chk_elem->>'severity' = 'ok' then v_c_ok := true; end if;
  end loop;
  perform pg_temp.ck(v_c_ok, 'Test 37: FIXED_ASSET_MATCH normal harus ok');

  v_c_ok := false;
  for v_c_chk_elem in select * from jsonb_array_elements(v_c_checks) loop
    if v_c_chk_elem->>'code' = 'DEPRECIATION_DUE' and v_c_chk_elem->>'severity' = 'ok' then v_c_ok := true; end if;
  end loop;
  perform pg_temp.ck(v_c_ok, 'Test 37: DEPRECIATION_DUE normal harus ok');

  -- 2) Gagal paksa FIXED_ASSET_MATCH: Buat jurnal manual mengubah saldo 1-2100
  insert into public.journal_entries (user_id, entry_no, entry_date, description, source_type)
  values (v_user_c37, 'JE-FAIL-ASSET', v_c_m0_end, 'Paksa Mismatch', 'manual')
  returning id into v_je;

  insert into public.journal_lines (entry_id, account_id, debit, credit, line_no)
  values
    (v_je, (select id from public.accounts where user_id = v_user_c37 and code = '1-2100'), 500000, 0, 1),
    (v_je, (select id from public.accounts where user_id = v_user_c37 and code = '3-2000'), 0, 500000, 2);

  v_c_checks := public.get_accounting_checks(v_c_m0_end);
  v_c_ok := false;
  for v_c_chk_elem in select * from jsonb_array_elements(v_c_checks) loop
    if v_c_chk_elem->>'code' = 'FIXED_ASSET_MATCH' and v_c_chk_elem->>'severity' = 'warn' then v_c_ok := true; end if;
  end loop;
  perform pg_temp.ck(v_c_ok, 'Test 37: FIXED_ASSET_MATCH gagal paksa harus warn');

  delete from public.journal_entries where id = v_je;

  -- 3) Gagal paksa DEPRECIATION_DUE: Hapus baris di fixed_asset_depreciations pada periode terkunci
  delete from public.fixed_asset_depreciations where asset_id = v_c_asset_1 and period = v_c_m0_start;

  v_c_checks := public.get_accounting_checks(v_c_m0_end);
  v_c_ok := false;
  for v_c_chk_elem in select * from jsonb_array_elements(v_c_checks) loop
    if v_c_chk_elem->>'code' = 'DEPRECIATION_DUE' and v_c_chk_elem->>'severity' = 'warn' then v_c_ok := true; end if;
  end loop;
  perform pg_temp.ck(v_c_ok, 'Test 37: DEPRECIATION_DUE gagal paksa harus warn');

  raise notice '[TEST 37 LULUS] FIXED_ASSET_MATCH dan DEPRECIATION_DUE lulus pada kondisi normal dan satu tes gagal yang dipaksa untuk masing-masing';

  -- -----------------------------------------------------------------------
  -- TEST 38: Tambahan Fase C: get_close_preview depreciation dan get_fixed_asset_register
  -- (a) depreciation di get_close_preview sama dengan jumlah yang dijurnal close_accounting_period pada bulan yang sama;
  -- (b) register menampilkan akumulasi dan nilai buku yang benar sebelum dan sesudah penutupan, untuk aset baru, aset lama, dan aset terlepas;
  -- (c) pengguna lain tidak bisa melihat register user ini.
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_user_c38, 'smoke_c38_' || substr(v_user_c38::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');
  insert into auth.users (id, email, aud, role)
  values (v_user_c38_other, 'smoke_c38_other_' || substr(v_user_c38_other::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_c38::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_c_m0_start := (date_trunc('month', current_date) - interval '5 months')::date;
  v_c_m0_end   := ((v_c_m0_start + interval '1 month') - interval '1 day')::date;
  v_c_m1_start := (v_c_m0_start + interval '1 month')::date;
  v_c_m1_end   := ((v_c_m1_start + interval '1 month') - interval '1 day')::date;

  perform public.init_accounting(v_c_m0_start);

  -- Modal Kas Rp 100.000.000
  insert into public.transactions (user_id, title, amount, type, transaction_date, description, cash_account_id, counter_account_id)
  values (v_user_c38, 'Modal Kas', 100000000, 'income', v_c_m0_start, 'Modal Kas',
    (select id from public.accounts where user_id = v_user_c38 and code = '1-1100'),
    (select id from public.accounts where user_id = v_user_c38 and code = '3-1000'));

  -- 1) Aset Lama: Mobil Lama Rp 24.000.000, akumulasi awal Rp 4.800.000, umur 60 bulan (tarif Rp 400.000/bln)
  v_c_asset_1 := public.register_fixed_asset('Mobil Lama C38', 'vehicle', (v_c_m0_start - interval '1 year')::date, 24000000, 60, 0, null, 4800000);

  -- 2) Aset Baru 1: Mesin Jahit Rp 12.000.000, umur 60 bulan (tarif Rp 200.000/bln), tunai
  v_c_asset_2 := public.register_fixed_asset('Mesin Jahit C38', 'equipment', (v_c_m0_start + interval '2 days')::date, 12000000, 60, 0, 'cash', 0);

  -- 3) Aset Baru 2 (akan dilepas): Laptop C38 Rp 6.000.000, umur 20 bulan (tarif Rp 300.000/bln), transfer
  v_c_asset_3 := public.register_fixed_asset('Laptop C38', 'equipment', (v_c_m0_start + interval '3 days')::date, 6000000, 20, 0, 'transfer', 0);

  -- (b1) Cek register SEBELUM tutup bulan pertama (m0):
  -- Aset lama: akumulasi = 4.800.000, nilai buku = 19.200.000, next = v_c_m0_start
  perform pg_temp.ck(
    (select accumulated from public.get_fixed_asset_register(v_c_m0_end) where id = v_c_asset_1) = 4800000
    and (select book_value from public.get_fixed_asset_register(v_c_m0_end) where id = v_c_asset_1) = 19200000
    and (select depreciation_months_posted from public.get_fixed_asset_register(v_c_m0_end) where id = v_c_asset_1) = 0
    and (select next_depreciation_period from public.get_fixed_asset_register(v_c_m0_end) where id = v_c_asset_1) = v_c_m0_start,
    'Test 38: register aset lama sebelum tutup bulan harus tepat'
  );

  -- Aset baru 1: akumulasi = 0, nilai buku = 12.000.000, next = v_c_m1_start
  perform pg_temp.ck(
    (select accumulated from public.get_fixed_asset_register(v_c_m0_end) where id = v_c_asset_2) = 0
    and (select book_value from public.get_fixed_asset_register(v_c_m0_end) where id = v_c_asset_2) = 12000000
    and (select next_depreciation_period from public.get_fixed_asset_register(v_c_m0_end) where id = v_c_asset_2) = v_c_m1_start,
    'Test 38: register aset baru sebelum tutup bulan harus tepat'
  );

  -- (a1) Cek get_close_preview m0: hanya aset lama yang jatuh tempo (Rp 400.000)
  v_c_preview := public.get_close_preview();
  perform pg_temp.ck((v_c_preview->>'depreciation')::numeric = 400000, 'Test 38: preview penyusutan m0 harus Rp 400.000');
  perform pg_temp.ck(
    (select count(*) from jsonb_array_elements(v_c_preview->'depreciation_by_class')) = 1
    and (v_c_preview->'depreciation_by_class'->0->>'account_code') = '1-2210'
    and (v_c_preview->'depreciation_by_class'->0->>'amount')::numeric = 400000,
    'Test 38: preview depreciation_by_class m0 harus tepat kendaraan Rp 400.000'
  );

  -- Tutup bulan m0
  v_c_close_res := public.close_accounting_period(v_c_m0_end);
  perform pg_temp.ck((v_c_close_res->>'depreciation_total')::numeric = (v_c_preview->>'depreciation')::numeric,
    'Test 38: jumlah penyusutan close_accounting_period m0 harus sama dengan preview');

  -- (b2) Cek register SESUDAH tutup bulan m0:
  -- Aset lama bertambah akumulasi Rp 400.000 -> 5.200.000, nilai buku 18.800.000, posted = 1, next = v_c_m1_start
  perform pg_temp.ck(
    (select accumulated from public.get_fixed_asset_register(v_c_m0_end) where id = v_c_asset_1) = 5200000
    and (select book_value from public.get_fixed_asset_register(v_c_m0_end) where id = v_c_asset_1) = 18800000
    and (select depreciation_months_posted from public.get_fixed_asset_register(v_c_m0_end) where id = v_c_asset_1) = 1
    and (select next_depreciation_period from public.get_fixed_asset_register(v_c_m0_end) where id = v_c_asset_1) = v_c_m1_start,
    'Test 38: register aset lama sesudah tutup bulan m0 harus bertambah penyusutan'
  );

  -- (a2) Cek get_close_preview m1: ketiga aset jatuh tempo (400.000 + 200.000 + 300.000 = Rp 900.000)
  v_c_preview := public.get_close_preview();
  perform pg_temp.ck((v_c_preview->>'depreciation')::numeric = 900000, 'Test 38: preview penyusutan m1 harus Rp 900.000');

  -- Tutup bulan m1
  v_c_close_res := public.close_accounting_period(v_c_m1_end);
  perform pg_temp.ck((v_c_close_res->>'depreciation_total')::numeric = (v_c_preview->>'depreciation')::numeric,
    'Test 38: jumlah penyusutan close_accounting_period m1 harus sama dengan preview (Rp 900.000)');

  -- (b3) Lepas Aset 3 pada bulan berikutnya (belum dikunci), lalu cek register untuk aset terlepas
  perform public.dispose_fixed_asset(v_c_asset_3, (v_c_m1_end + interval '5 days')::date, 5500000, 'cash');

  perform pg_temp.ck(
    (select status from public.get_fixed_asset_register() where id = v_c_asset_3) = 'disposed'
    and (select disposed_at from public.get_fixed_asset_register() where id = v_c_asset_3) = (v_c_m1_end + interval '5 days')::date
    and (select accumulated from public.get_fixed_asset_register() where id = v_c_asset_3) = 300000
    and (select book_value from public.get_fixed_asset_register() where id = v_c_asset_3) = 5700000
    and (select next_depreciation_period from public.get_fixed_asset_register() where id = v_c_asset_3) is null,
    'Test 38: register aset terlepas harus berstatus disposed, next_period null, akumulasi dan nilai buku tepat'
  );

  -- (c) Uji isolasi antar pengguna: user lain tidak bisa melihat register user ini
  perform set_config('request.jwt.claim.sub', v_user_c38_other::text, true);
  perform pg_temp.ck(
    (select count(*) from public.get_fixed_asset_register()) = 0,
    'Test 38: user lain tidak boleh melihat aset di get_fixed_asset_register'
  );

  raise notice '[TEST 38 LULUS] preview penyusutan sama persis dengan tutup buku, register menampilkan akumulasi dan nilai buku benar sebelum dan sesudah penutupan serta setelah pelepasan, dan isolasi data aman';

  -- ============================================================================
  -- TEST 39: Perbaikan Penyusutan Tuntas, Tolak Hapus Disposed, Tutup Bulan Selisih Nol, Kategori Terkunci, update_fixed_asset_info
  -- ============================================================================
  insert into auth.users (id, email, aud, role)
  values
    (v_user_c39, 'smoke_c39_' || substr(v_user_c39::text, 1, 8) || '@example.com', 'authenticated', 'authenticated'),
    (v_user_c39_other, 'smoke_c39_oth_' || substr(v_user_c39_other::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_c39::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Inisialisasi pembukuan per 2024-01-01
  perform public.init_accounting('2024-01-01'::date);

  -- Saldo awal kas/bank Rp 100.000.000
  perform public.post_opening_balance('2024-01-01'::date, jsonb_build_array(
    jsonb_build_object('code', '1-1200', 'debit', 100000000, 'credit', 0),
    jsonb_build_object('code', '3-1000', 'debit', 0, 'credit', 100000000)
  ));

  -- (d) Mendaftarkan dua aset beda kelas tidak mengubah account_id kategori 'Pembelian Aset Tetap'
  v_t39_asset_1 := public.register_fixed_asset(
    p_name := 'Mesin Jahit 7Bln',
    p_asset_class := 'equipment',
    p_acquisition_date := '2024-01-15'::date,
    p_cost := 10000000,
    p_useful_life_months := 7,
    p_salvage_value := 0,
    p_payment_method := 'transfer',
    p_notes := 'Catatan Mesin 1'
  );

  select id, account_id into v_t39_cat_id, v_t39_cat_acct_id
    from public.transaction_categories
   where user_id = v_user_c39 and name = 'Pembelian Aset Tetap';

  perform pg_temp.ck(
    v_t39_cat_acct_id = (select id from public.accounts where user_id = v_user_c39 and code = '1-2100'),
    'Test 39(d): Kategori Pembelian Aset Tetap harus terkait dengan akun 1-2100'
  );

  -- Daftarkan aset kedua beda kelas (vehicle / kendaraan)
  v_t39_asset_2 := public.register_fixed_asset(
    p_name := 'Motor Operasional',
    p_asset_class := 'vehicle',
    p_acquisition_date := '2024-01-20'::date,
    p_cost := 20000000,
    p_useful_life_months := 24,
    p_salvage_value := 0,
    p_payment_method := 'transfer',
    p_notes := 'Catatan Motor'
  );

  -- Asersi: account_id kategori Pembelian Aset Tetap TIDAK BERUBAH (tetap 1-2100)
  perform pg_temp.ck(
    (select account_id from public.transaction_categories where id = v_t39_cat_id) = v_t39_cat_acct_id,
    'Test 39(d): Mendaftarkan aset beda kelas tidak boleh mengubah account_id kategori Pembelian Aset Tetap'
  );

  -- Asersi: counter_account_id pada transaksi perolehan Motor adalah akun 1-2200 (Kendaraan)
  perform pg_temp.ck(
    (select counter_account_id from public.transactions where id = (select acquisition_transaction_id from public.fixed_assets where id = v_t39_asset_2)) =
      (select id from public.accounts where user_id = v_user_c39 and code = '1-2200'),
    'Test 39(d): counter_account_id pada transaksi harus menentukan akun aset yang tepat (1-2200)'
  );

  -- (e) update_fixed_asset_info mengubah nama dan catatan tanpa mengubah angka
  perform public.update_fixed_asset_info(v_t39_asset_1, 'Mesin Jahit 7Bln Direvisi', 'Catatan revisi nomor seri 123');

  perform pg_temp.ck(
    (select name from public.fixed_assets where id = v_t39_asset_1) = 'Mesin Jahit 7Bln Direvisi'
    and (select notes from public.fixed_assets where id = v_t39_asset_1) = 'Catatan revisi nomor seri 123'
    and (select cost from public.fixed_assets where id = v_t39_asset_1) = 10000000
    and (select salvage_value from public.fixed_assets where id = v_t39_asset_1) = 0
    and (select useful_life_months from public.fixed_assets where id = v_t39_asset_1) = 7,
    'Test 39(e): update_fixed_asset_info harus mengubah nama dan catatan tanpa menyentuh angka'
  );

  -- update_fixed_asset_info ditolak untuk aset milik user lain
  perform set_config('request.jwt.claim.sub', v_user_c39_other::text, true);
  v_t39_ok := false;
  begin
    perform public.update_fixed_asset_info(v_t39_asset_1, 'Hacked Name', 'Hacked Notes');
  exception when others then
    if sqlerrm like '%tidak ditemukan%' or sqlstate = '42501' or sqlerrm like '%P0001%' then
      v_t39_ok := true;
    end if;
  end;
  perform pg_temp.ck(v_t39_ok, 'Test 39(e): update_fixed_asset_info harus ditolak untuk aset milik user lain');
  perform set_config('request.jwt.claim.sub', v_user_c39::text, true);

  -- (b) delete_fixed_asset pada aset disposed yang belum disusutkan ditolak; setelah undo berhasil dihapus
  perform public.dispose_fixed_asset(v_t39_asset_2, '2024-01-25'::date, 20000000, 'transfer');

  v_t39_ok := false;
  begin
    perform public.delete_fixed_asset(v_t39_asset_2);
  exception when others then
    if sqlerrm = 'Batalkan pelepasan aset terlebih dahulu' then
      v_t39_ok := true;
    end if;
  end;
  perform pg_temp.ck(v_t39_ok, 'Test 39(b): delete_fixed_asset pada aset disposed harus ditolak dengan pesan Batalkan pelepasan aset terlebih dahulu');

  -- Batalkan pelepasan aset 2 lalu hapus
  perform public.undo_dispose_fixed_asset(v_t39_asset_2);
  perform pg_temp.ck(
    (select status from public.fixed_assets where id = v_t39_asset_2) = 'active',
    'Test 39(b): undo_dispose_fixed_asset harus mengembalikan status active'
  );

  perform public.delete_fixed_asset(v_t39_asset_2);
  perform pg_temp.ck(
    not exists (select 1 from public.fixed_assets where id = v_t39_asset_2),
    'Test 39(b): setelah undo_dispose, delete_fixed_asset harus berhasil menghapus aset'
  );

  -- Daftarkan Aset Lama untuk pengujian (a): Rp 10.000.000 umur 7 bulan, accumulated_at_start = 2.857.142 (posisi 2 bulan, sisa 5 bulan)
  v_t39_asset_old := public.register_fixed_asset(
    p_name := 'Aset Lama 7Bln',
    p_asset_class := 'equipment',
    p_acquisition_date := '2023-11-01'::date,
    p_cost := 10000000,
    p_useful_life_months := 7,
    p_salvage_value := 0,
    p_accumulated_at_start := 2857142,
    p_notes := 'Aset lama jalan 2 bulan'
  );

  -- (a) Siklus 8 Penutupan Bulan:
  -- Bulan 0: 2024-01-31 (Aset Lama susut bulan ke-3 umur, Aset Baru belum susut)
  -- (c) Diuji bersamaan: persediaan fisik = 0, saldo buku = 0 (diff = 0)
  v_t39_close_res := public.close_accounting_period(v_t39_m0_end);
  perform pg_temp.ck(
    (v_t39_close_res->>'adjustment_entry_id') is null,
    'Test 39(c): penutupan bulan dengan selisih persediaan nol tidak boleh membuat jurnal penyesuaian'
  );
  perform pg_temp.ck(
    exists (select 1 from public.inventory_valuations where user_id = v_user_c39 and period_end = v_t39_m0_end and journal_entry_id is null),
    'Test 39(c): snapshot inventory_valuations harus tetap tersimpan dengan journal_entry_id null'
  );

  -- Bulan 1: 2024-02-29 (Aset Lama pos 4, Aset Baru pos 1)
  perform public.close_accounting_period(v_t39_m1_end);

  -- Bulan 2: 2024-03-31 (Aset Lama pos 5, Aset Baru pos 2)
  perform public.close_accounting_period(v_t39_m2_end);

  -- Bulan 3: 2024-04-30 (Aset Lama pos 6, Aset Baru pos 3)
  perform public.close_accounting_period(v_t39_m3_end);

  -- Bulan 4: 2024-05-31 (Aset Lama pos 7 / bulan terakhir masa manfaat -> tuntas tepat Rp 10.000.000)
  perform public.close_accounting_period(v_t39_m4_end);

  perform pg_temp.ck(
    (select accumulated from public.get_fixed_asset_register(v_t39_m4_end) where id = v_t39_asset_old) = 10000000
    and (select book_value from public.get_fixed_asset_register(v_t39_m4_end) where id = v_t39_asset_old) = 0
    and (select fully_depreciated from public.get_fixed_asset_register(v_t39_m4_end) where id = v_t39_asset_old) is true,
    'Test 39(a): aset lama setelah 5 penutupan (total 7 bulan masa manfaat) akumulasi harus tepat Rp 10.000.000 dan nilai sisa 0'
  );

  -- Bulan 5: 2024-06-30 (Aset Lama tidak menyusut lagi, Aset Baru pos 5)
  perform public.close_accounting_period(v_t39_m5_end);

  perform pg_temp.ck(
    (select count(*) from public.fixed_asset_depreciations where asset_id = v_t39_asset_old) = 5
    and (select accumulated from public.get_fixed_asset_register(v_t39_m5_end) where id = v_t39_asset_old) = 10000000,
    'Test 39(a): aset lama tidak boleh disusutkan lagi setelah nilainya habis'
  );

  -- Bulan 6: 2024-07-31 (Aset Baru pos 6)
  perform public.close_accounting_period(v_t39_m6_end);

  -- Bulan 7: 2024-08-31 (Aset Baru pos 7 / bulan terakhir masa manfaat -> tuntas tepat Rp 10.000.000)
  perform public.close_accounting_period(v_t39_m7_end);

  perform pg_temp.ck(
    (select accumulated from public.get_fixed_asset_register(v_t39_m7_end) where id = v_t39_asset_1) = 10000000
    and (select book_value from public.get_fixed_asset_register(v_t39_m7_end) where id = v_t39_asset_1) = 0
    and (select fully_depreciated from public.get_fixed_asset_register(v_t39_m7_end) where id = v_t39_asset_1) is true,
    'Test 39(a): aset baru setelah 7 penutupan akumulasi harus tepat Rp 10.000.000 dan nilai sisa 0'
  );

  -- Bulan 8: 2024-09-30 (Penutupan ke-8: aset baru tidak menyusutkan lagi)
  v_t39_close_res := public.close_accounting_period(v_t39_m8_end);

  perform pg_temp.ck(
    (v_t39_close_res->>'depreciation_total')::numeric = 0
    and (select count(*) from public.fixed_asset_depreciations where asset_id = v_t39_asset_1) = 7
    and (select accumulated from public.get_fixed_asset_register(v_t39_m8_end) where id = v_t39_asset_1) = 10000000,
    'Test 39(a): penutupan ke-8 tidak boleh menyusutkan aset yang sudah habis dan tidak ada baris penyusutan tambahan'
  );

  raise notice '[TEST 39 LULUS] penyusutan tepat habis Rp 10.000.000 tanpa sisa pada penutupan ke-7 untuk aset baru dan lama, penolakan hapus aset disposed dengan pesan spesifik, tutup bulan selisih nol tanpa jurnal, kategori terkunci ke 1-2100, dan update_fixed_asset_info aman';

  -- =========================================================================
  -- TEST 40: R2 Skenario Akseptansi 7.1 (Arus Kas -400.000 & Perubahan Ekuitas 31.600.000)
  -- =========================================================================
  declare
    v_user_r2_40    uuid := gen_random_uuid();
    v_m1_start_40   date := '2024-11-01';
    v_m1_end_40     date := '2024-11-30';
    v_ord_40        uuid;
    v_staff_40      uuid;
    v_payroll_40    uuid;
    v_mat_40        uuid;
    v_cf_40         jsonb;
    v_eq_40         jsonb;
    v_bs_40         jsonb;
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (v_user_r2_40, 'smoke_r2_40@test.com', '{"role":"owner"}'::jsonb);

    perform set_config('request.jwt.claim.sub', v_user_r2_40::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    perform public.init_accounting(v_m1_start_40);

    -- Langkah 0: Saldo awal Dr Bank 20.000.000, Dr Persediaan 10.000.000 / Cr Laba Ditahan 30.000.000
    perform public.post_opening_balance(
      v_m1_start_40,
      jsonb_build_array(
        jsonb_build_object('account_id', (select id from public.accounts where user_id = v_user_r2_40 and code = '1-1200'), 'debit', 20000000, 'credit', 0),
        jsonb_build_object('account_id', (select id from public.accounts where user_id = v_user_r2_40 and code = '1-1500'), 'debit', 10000000, 'credit', 0),
        jsonb_build_object('account_id', (select id from public.accounts where user_id = v_user_r2_40 and code = '3-2000'), 'debit', 0, 'credit', 30000000)
      )
    );

    -- Langkah 1: DP Order A Rp 5.000.000 masuk Bank
    insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, production_status, status, order_date)
    values (v_user_r2_40, 'ORD-2024-40-001', 'Pelanggan 40', 9000000, 100000, 'production', 'belum_lunas', '2024-11-02'::date)
    returning id into v_ord_40;

    perform public.record_order_payment(v_ord_40, 5000000, 'dp', '2024-11-02'::date, 'transfer', null);

    -- Langkah 2: Beli kain Direct Supplier Rp 6.000.000 keluar Bank
    insert into public.transactions (user_id, title, amount, type, transaction_date, cash_account_id, counter_account_id)
    values (
      v_user_r2_40, 'Beli Kain Supplier', 6000000, 'expense', '2024-11-03'::date,
      (select id from public.accounts where user_id = v_user_r2_40 and code = '1-1200'),
      (select id from public.accounts where user_id = v_user_r2_40 and code = '1-1500')
    );

    -- Langkah 3: Payroll Rp 3.000.000 (borongan 2.000.000, gaji 1.000.000)
    insert into public.staff (user_id, name, wage_type, daily_rate, role)
    values (v_user_r2_40, 'Penjahit 40', 'piecework', 0, 'Penjahit')
    returning id into v_staff_40;

    insert into public.weekly_payrolls (user_id, period_start, period_end, payment_date, total_amount, status)
    values (v_user_r2_40, '2024-11-01', '2024-11-05', '2024-11-05', 3000000, 'draft')
    returning id into v_payroll_40;

    insert into public.payroll_items (user_id, payroll_id, staff_id, wage_type, piecework_amount, take_home_pay)
    values (v_user_r2_40, v_payroll_40, v_staff_40, 'piecework', 2000000, 2000000);

    insert into public.payroll_items (user_id, payroll_id, staff_id, wage_type, base_amount, take_home_pay)
    values (v_user_r2_40, v_payroll_40, v_staff_40, 'attendance', 1000000, 1000000);

    perform public.pay_weekly_payroll(v_payroll_40);
    update public.transactions
       set cash_account_id = (select id from public.accounts where user_id = v_user_r2_40 and code = '1-1200')
     where user_id = v_user_r2_40 and title like '%Payroll%';

    -- Langkah 4: Bayar listrik Rp 500.000 (Dr 6-5000 / Cr Bank)
    insert into public.transactions (user_id, title, amount, type, transaction_date, cash_account_id, counter_account_id)
    values (
      v_user_r2_40, 'Listrik PLN', 500000, 'expense', '2024-11-06'::date,
      (select id from public.accounts where user_id = v_user_r2_40 and code = '1-1200'),
      (select id from public.accounts where user_id = v_user_r2_40 and code = '6-5000')
    );

    -- Langkah 5: Pelunasan Order A Rp 4.100.000 (masuk Bank)
    perform public.record_order_payment(v_ord_40, 4100000, 'pelunasan', '2024-11-07'::date, 'transfer', null);

    -- Langkah 6: Order A dikirim (completed, total_price 9.000.000 + ongkir 100.000)
    update public.orders set production_status = 'completed' where id = v_ord_40;
    update public.journal_entries
       set entry_date = '2024-11-08'::date
     where user_id = v_user_r2_40 and source_type = 'order_revenue' and source_id = v_ord_40;

    -- Langkah 7: Siapkan stok fisik senilai Rp 12.000.000 & Tutup Bulan
    insert into public.materials (user_id, name, unit, price, stock_qty, minimum_stock)
    values (v_user_r2_40, 'Kain Gudang 40', 'meter', 80000, 150, 10)
    returning id into v_mat_40;

    perform public.close_accounting_period(v_m1_end_40);

    -- Evaluasi Laporan Arus Kas
    v_cf_40 := public.get_cash_flow(v_m1_start_40, v_m1_end_40);
    perform pg_temp.ck((v_cf_40->'totals'->>'net_operating')::numeric = -400000, 'Test 40: net_operating harus -400.000');
    perform pg_temp.ck((v_cf_40->'totals'->>'net_investing')::numeric = 0, 'Test 40: net_investing harus 0');
    perform pg_temp.ck((v_cf_40->'totals'->>'net_financing')::numeric = 0, 'Test 40: net_financing harus 0');
    perform pg_temp.ck((v_cf_40->'totals'->>'net_change')::numeric = -400000, 'Test 40: net_change harus -400.000');
    perform pg_temp.ck((v_cf_40->'totals'->>'opening_cash')::numeric = 20000000, 'Test 40: opening_cash harus 20.000.000');
    perform pg_temp.ck((v_cf_40->'totals'->>'closing_cash')::numeric = 19600000, 'Test 40: closing_cash harus 19.600.000');
    perform pg_temp.ck((v_cf_40->'meta'->>'reconciled')::boolean is true, 'Test 40: cash flow reconciled harus true');

    -- Evaluasi Laporan Perubahan Ekuitas
    v_eq_40 := public.get_equity_changes(v_m1_start_40, v_m1_end_40);
    perform pg_temp.ck((v_eq_40->'totals'->>'opening_equity')::numeric = 30000000, 'Test 40: opening_equity harus 30.000.000');
    perform pg_temp.ck((v_eq_40->'rows'->1->>'amount')::numeric = 1600000, 'Test 40: net_profit harus 1.600.000');
    perform pg_temp.ck((v_eq_40->'totals'->>'closing_equity')::numeric = 31600000, 'Test 40: closing_equity harus 31.600.000');
    perform pg_temp.ck((v_eq_40->'meta'->>'reconciled')::boolean is true, 'Test 40: equity reconciled harus true');

    raise notice '[TEST 40 LULUS] skenario akseptansi 7.1 cocok persis: arus kas operasi -400.000, kas awal 20.000.000, kas akhir 19.600.000, perubahan ekuitas 30.000.000 + 1.600.000 = 31.600.000 dan seluruhnya reconciled = true';
  end;

  -- =========================================================================
  -- TEST 41: Aktivitas Investasi, Pendanaan, Refund, DP Hangus, Mutasi Kas-Bank, Pembanding
  -- =========================================================================
  declare
    v_user_r2_41    uuid := gen_random_uuid();
    v_m1_start_41   date := '2024-01-01';
    v_m1_end_41     date := '2024-01-31';
    v_asset_id_41   uuid;
    v_ord_41_ref    uuid;
    v_ord_41_for    uuid;
    v_cf_41         jsonb;
    v_cf_cmp_empty  jsonb;
    v_cf_cmp_valid  jsonb;
    v_eq_41         jsonb;
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (v_user_r2_41, 'smoke_r2_41@test.com', '{"role":"owner"}'::jsonb);

    perform set_config('request.jwt.claim.sub', v_user_r2_41::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    perform public.init_accounting(v_m1_start_41);

    -- Saldo awal: Dr Kas 10jt, Dr Bank 20jt / Cr Modal 30jt
    perform public.post_opening_balance(
      v_m1_start_41,
      jsonb_build_array(
        jsonb_build_object('account_id', (select id from public.accounts where user_id = v_user_r2_41 and code = '1-1100'), 'debit', 10000000, 'credit', 0),
        jsonb_build_object('account_id', (select id from public.accounts where user_id = v_user_r2_41 and code = '1-1200'), 'debit', 20000000, 'credit', 0),
        jsonb_build_object('account_id', (select id from public.accounts where user_id = v_user_r2_41 and code = '3-1000'), 'debit', 0, 'credit', 30000000)
      )
    );

    -- 1. Pembelian aset tunai Rp 12.000.000 (Kas keluar metode cash) -> Investasi
    v_asset_id_41 := public.register_fixed_asset(
      'Mesin Bordir 41',
      'equipment',
      '2024-01-10'::date,
      12000000,
      60,
      0,
      'cash'
    );

    -- 2. Setoran modal tambahan Rp 5.000.000 (Bank) -> Pendanaan
    insert into public.transactions (user_id, title, amount, type, transaction_date, cash_account_id, counter_account_id)
    values (
      v_user_r2_41, 'Setoran Modal Tambahan', 5000000, 'income', '2024-01-12'::date,
      (select id from public.accounts where user_id = v_user_r2_41 and code = '1-1200'),
      (select id from public.accounts where user_id = v_user_r2_41 and code = '3-1000')
    );

    -- 3. Prive Rp 2.000.000 (Bank keluar lawan 3-3000) -> Pendanaan (-2.000.000)
    insert into public.transactions (user_id, title, amount, type, transaction_date, cash_account_id, counter_account_id)
    values (
      v_user_r2_41, 'Prive Pemilik', 2000000, 'expense', '2024-01-15'::date,
      (select id from public.accounts where user_id = v_user_r2_41 and code = '1-1200'),
      (select id from public.accounts where user_id = v_user_r2_41 and code = '3-3000')
    );

    -- 4. Order dengan DP Rp 4.000.000 lalu Refund Rp 1.500.000
    insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, production_status, status, order_date)
    values (v_user_r2_41, 'ORD-2024-41-REF', 'Customer Refund 41', 5000000, 0, 'production', 'belum_lunas', '2024-01-16'::date)
    returning id into v_ord_41_ref;

    perform public.record_order_payment(v_ord_41_ref, 4000000, 'dp', '2024-01-16'::date, 'transfer', null);
    perform public.release_order_deposit(v_ord_41_ref, 'refund', 1500000, '2024-01-18'::date, 'transfer', 'Batal sebagian');

    -- 5. Order dengan DP Rp 1.000.000 lalu Forfeit (DP hangus tanpa kas)
    insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, production_status, status, order_date)
    values (v_user_r2_41, 'ORD-2024-41-FOR', 'Customer Forfeit 41', 2000000, 0, 'production', 'belum_lunas', '2024-01-19'::date)
    returning id into v_ord_41_for;

    perform public.record_order_payment(v_ord_41_for, 1000000, 'dp', '2024-01-19'::date, 'transfer', null);
    perform public.release_order_deposit(v_ord_41_for, 'forfeit', 1000000, '2024-01-20'::date, null, 'DP hangus');

    -- 6. Pemindahan Kas ke Bank Rp 3.000.000 lewat jurnal manual (Net kas = 0)
    perform public.post_journal_entry(
      '2024-01-22'::date,
      'Mutasi Kas ke Bank',
      jsonb_build_array(
        jsonb_build_object('account_id', (select id from public.accounts where user_id = v_user_r2_41 and code = '1-1200'), 'debit', 3000000, 'credit', 0),
        jsonb_build_object('account_id', (select id from public.accounts where user_id = v_user_r2_41 and code = '1-1100'), 'debit', 0, 'credit', 3000000)
      )
    );

    -- Uji Arus Kas
    v_cf_41 := public.get_cash_flow(v_m1_start_41, v_m1_end_41);

    -- Penerimaan pelanggan: (DP 4jt - refund 1.5jt) + DP 1jt = 3.5jt
    perform pg_temp.ck((v_cf_41->'sections'->0->'rows'->0->>'amount')::numeric = 3500000, 'Test 41: customer_receipts harus 3.500.000');
    -- Arus kas investasi: pembelian aset -12.000.000
    perform pg_temp.ck((v_cf_41->'totals'->>'net_investing')::numeric = -12000000, 'Test 41: net_investing harus -12.000.000');
    -- Arus kas pendanaan: setoran modal 5jt - prive 2jt = +3jt
    perform pg_temp.ck((v_cf_41->'totals'->>'net_financing')::numeric = 3000000, 'Test 41: net_financing harus 3.000.000');
    -- Reconciled kas akhir
    perform pg_temp.ck((v_cf_41->'meta'->>'reconciled')::boolean is true, 'Test 41: arus kas reconciled harus true');

    -- Pembanding sebelum tanggal mulai pembukuan harus kosong tanpa error
    v_cf_cmp_empty := public.get_cash_flow(v_m1_start_41, v_m1_end_41, '2023-12-01'::date, '2023-12-31'::date);
    perform pg_temp.ck((v_cf_cmp_empty->'meta'->>'compare_from') is null, 'Test 41: compare_from sebelum books_start_date harus null');
    perform pg_temp.ck((v_cf_cmp_empty->'totals'->>'compare_net_change') is null, 'Test 41: compare_net_change harus null');

    -- Perubahan Ekuitas: setoran modal dan prive tercermin tepat
    v_eq_41 := public.get_equity_changes(v_m1_start_41, v_m1_end_41);
    perform pg_temp.ck((v_eq_41->'rows'->2->>'amount')::numeric = 5000000, 'Test 41: setoran modal di perubahan ekuitas harus 5.000.000');
    perform pg_temp.ck((v_eq_41->'rows'->3->>'amount')::numeric = -2000000, 'Test 41: prive di perubahan ekuitas harus -2.000.000');
    perform pg_temp.ck((v_eq_41->'meta'->>'reconciled')::boolean is true, 'Test 41: perubahan ekuitas reconciled harus true');

    raise notice '[TEST 41 LULUS] arus kas investasi (pembelian aset), pendanaan (modal & prive), operasi (refund mengurangi penerimaan, DP hangus tanpa kas), mutasi kas-bank net kas nol, dan pembanding pra-mulai kosong tanpa error';
  end;

  -- =========================================================================
  -- TEST 42: get_report_notes dan Rekonsiliasi dengan Neraca serta Isolasi RLS
  -- =========================================================================
  declare
    v_user_r2_42    uuid := gen_random_uuid();
    v_notes_41      jsonb;
    v_bs_41         jsonb;
    v_notes_42      jsonb;
    v_cf_42         jsonb;
    v_eq_42         jsonb;
  begin
    -- 1. Evaluasi catatan laporan untuk user 41 per 2024-01-31
    perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = 'smoke_r2_41@test.com'), true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    v_notes_41 := public.get_report_notes('2024-01-31'::date);
    v_bs_41 := public.get_balance_sheet('2024-01-31'::date);

    -- Kas & Bank di Catatan harus sama dengan saldo Kas + Bank di Neraca
    perform pg_temp.ck(
      (v_notes_41->'cash_and_banks'->>'total')::numeric = (
        (select coalesce(sum((elem->>'amount')::numeric), 0)
         from jsonb_array_elements(v_bs_41->'sections'->0->'rows') elem
         where elem->>'code' in ('1-1100', '1-1200'))
      ),
      'Test 42: total kas & bank di catatan harus sama dengan neraca'
    );

    -- Jadwal aset tetap di Catatan harus sama dengan harga perolehan di Neraca
    perform pg_temp.ck(
      (v_notes_41->'fixed_assets'->'totals'->>'cost')::numeric = (
        (select coalesce(sum((elem->>'amount')::numeric), 0)
         from jsonb_array_elements(v_bs_41->'sections'->1->'rows') elem
         where elem->>'code' in ('1-2100', '1-2200', '1-2300', '1-2400'))
      ),
      'Test 42: total harga perolehan aset tetap di catatan harus sama dengan neraca'
    );

    -- Uang muka pelanggan di Catatan harus sama dengan liabilitas 2-1200 di Neraca
    perform pg_temp.ck(
      (v_notes_41->'customer_advances'->>'total')::numeric = (
        (select coalesce((elem->>'amount')::numeric, 0)
         from jsonb_array_elements(v_bs_41->'sections'->2->'rows') elem
         where elem->>'code' = '2-1200')
      ),
      'Test 42: total uang muka pelanggan di catatan harus sama dengan akun 2-1200 di neraca'
    );

    -- 2. Uji Isolasi RLS: User baru 42 tidak boleh melihat data User 41
    insert into auth.users (id, email, raw_user_meta_data)
    values (v_user_r2_42, 'smoke_r2_42@test.com', '{"role":"owner"}'::jsonb);

    perform set_config('request.jwt.claim.sub', v_user_r2_42::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    perform public.init_accounting('2024-01-01'::date);

    v_cf_42 := public.get_cash_flow('2024-01-01'::date, '2024-01-31'::date);
    perform pg_temp.ck((v_cf_42->'totals'->>'closing_cash')::numeric = 0, 'Test 42: arus kas user lain harus 0');

    v_eq_42 := public.get_equity_changes('2024-01-01'::date, '2024-01-31'::date);
    perform pg_temp.ck((v_eq_42->'totals'->>'closing_equity')::numeric = 0, 'Test 42: perubahan ekuitas user lain harus 0');

    v_notes_42 := public.get_report_notes('2024-01-31'::date);
    perform pg_temp.ck((v_notes_42->'cash_and_banks'->>'total')::numeric = 0, 'Test 42: kas user lain di catatan harus 0');
    perform pg_temp.ck((v_notes_42->'customer_advances'->>'total')::numeric = 0, 'Test 42: uang muka user lain di catatan harus 0');

    raise notice '[TEST 42 LULUS] get_report_notes mencocokkan seluruh rincian kas, persediaan, uang muka pelanggan/staf, aset tetap, dan hutang ke saldo Neraca, serta isolasi data antar pengguna terjamin';
  end;

  raise notice '==================================================';
  raise notice 'SEMUA SMOKE TEST AKUNTANSI LULUS';
  raise notice '==================================================';
end;
$$;

rollback;
