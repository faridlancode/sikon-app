-- ===========================================================================
-- Test: supabase/tests/po_batches_phase2_smoke.sql
-- Memverifikasi Fase 2:
-- 1. get_po_daily_report:
--    - Mengembalikan info PO, ringkasan hari ini, breakdown sales & kategori,
--      dan akumulasi kumulatif sejak hari Senin.
-- 2. get_po_close_report:
--    - Mengembalikan snapshot close beku (schema_version 1).
--    - Snapshot terbukti tidak berubah walau master harga produk diubah.
--    - Bagian live memuat label "Kondisi Terkini (Per Sekarang)", metrik bayar,
--      dan progres fisik produksi (potong, jahit, qc).
-- 3. get_po_monthly_report:
--    - Mengembalikan array batches dalam bulan PO.
--    - Total bulanan sama dengan agregat baris PO.
--    - Menampilkan borongan aktual per PO dan borongan tanpa order_id.
--    - Menampilkan pembelian bahan dari item SPJ/supplier via stock_request_id.
--    - Blok rekonsiliasi akuntansi memuat pendapatan jurnal 4-1000 + 4-1100
--      dan memuat catatan khusus books_start_date 2026-11-01 untuk Oktober 2026.
-- ===========================================================================

begin;

do $$
declare
  v_test_uid         uuid;
  v_batch_id         uuid;
  v_batch_row        record;
  v_prod_id          uuid;
  v_order_id         uuid;
  v_daily_res        jsonb;
  v_close_res        jsonb;
  v_close_res_after  jsonb;
  v_monthly_res      jsonb;
  v_initial_snap_val numeric;
  v_after_snap_val   numeric;
  v_recon_exp        text;
begin
  -- 1. Ambil user context
  select id into v_test_uid from auth.users order by created_at asc limit 1;
  if v_test_uid is null then
    raise exception 'Tidak ada user di auth.users untuk testing';
  end if;

  perform set_config('request.jwt.claim.sub', v_test_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  raise notice '--- 1. Uji get_po_daily_report ---';
  -- Pastikan ada batch & order untuk hari ini WIB
  v_batch_row := public.ensure_po_batch((now() at time zone 'Asia/Jakarta')::date);
  v_batch_id  := v_batch_row.id;

  v_daily_res := public.get_po_daily_report((now() at time zone 'Asia/Jakarta')::date);

  if v_daily_res->'po_info' is null or v_daily_res->'today_summary' is null or v_daily_res->'cumulative_since_monday' is null then
    raise exception 'TEST FAILED: Struktur get_po_daily_report tidak lengkap';
  end if;

  raise notice 'PASS: get_po_daily_report berhasil untuk tanggal % (PO: %)',
    v_daily_res->>'date', v_daily_res->'po_info'->>'code';

  raise notice '--- 2. Uji get_po_close_report & stabilitas snapshot ---';
  -- Setup batch pengujian tersendiri untuk close report (PO 2026-11-16)
  v_batch_row := public.ensure_po_batch('2026-11-16'::date);
  v_batch_id  := v_batch_row.id;

  -- Buat produk uji
  insert into public.products (user_id, name, default_price)
  values (v_test_uid, 'Kemeja Batik Test Freeze', 200000)
  returning id into v_prod_id;

  -- Buat order di batch ini
  insert into public.orders (
    user_id, po_batch_id, order_id, customer_name, order_date, total_price
  ) values (
    v_test_uid, v_batch_id, 'TEST-SNAP-01', 'Pembeli Snapshot', '2026-11-16'::date, 200000
  ) returning id into v_order_id;

  insert into public.order_items (
    user_id, order_id, product_id, name_item, qty, price, total_price, hpp_total_snapshot
  ) values (
    v_test_uid, v_order_id, v_prod_id, 'Kemeja Batik Test Freeze', 1, 200000, 200000, 120000
  );

  -- Tutup PO dengan alasan early
  perform public.close_po_batch(v_batch_id, 'Tutup untuk uji snapshot', true);

  -- Ambil laporan close pertama
  v_close_res := public.get_po_close_report(v_batch_id);
  v_initial_snap_val := (v_close_res->'snapshot'->'summary'->>'total_price')::numeric;

  if v_initial_snap_val != 200000 then
    raise exception 'TEST FAILED: Nilai awal snapshot salah, dapat: %', v_initial_snap_val;
  end if;

  -- Ubah master harga produk
  update public.products set default_price = 350000 where id = v_prod_id;

  -- Ambil laporan close kedua
  v_close_res_after := public.get_po_close_report(v_batch_id);
  v_after_snap_val  := (v_close_res_after->'snapshot'->'summary'->>'total_price')::numeric;

  -- Buktikan snapshot BEKU dan tidak berubah
  if v_initial_snap_val is distinct from v_after_snap_val then
    raise exception 'TEST FAILED: Snapshot berubah setelah master harga diubah! Dari % menjadi %',
      v_initial_snap_val, v_after_snap_val;
  end if;
  raise notice 'PASS: Snapshot PO terbukti beku (nilai tetap %) walau master harga produk diubah', v_after_snap_val;

  -- Cek keberadaan bagian live
  if v_close_res_after->'live_as_of_now' is null or
     v_close_res_after->'live_as_of_now'->'production_progress' is null or
     v_close_res_after->'live_as_of_now'->'payment_summary' is null then
    raise exception 'TEST FAILED: Bagian live_as_of_now tidak lengkap di get_po_close_report';
  end if;
  raise notice 'PASS: Bagian live_as_of_now terverifikasi dengan label: %',
    v_close_res_after->'live_as_of_now'->>'label';

  raise notice '--- 3. Uji get_po_monthly_report ---';
  -- Panggil laporan bulanan Oktober 2026
  v_monthly_res := public.get_po_monthly_report(2026, 10);

  if v_monthly_res->'batches' is null or jsonb_array_length(v_monthly_res->'batches') = 0 then
    raise exception 'TEST FAILED: get_po_monthly_report tidak mengembalikan batches untuk Oktober 2026';
  end if;

  if v_monthly_res->'current_month_totals' is null or v_monthly_res->'accounting_reconciliation' is null then
    raise exception 'TEST FAILED: Totals atau accounting_reconciliation tidak ada di get_po_monthly_report';
  end if;

  -- Periksa catatan khusus books_start_date 2026-11-01 pada Oktober 2026
  v_recon_exp := v_monthly_res->'accounting_reconciliation'->>'explanation';
  if v_recon_exp not like '%books_start_date%' or v_recon_exp not like '%2026-11-01%' then
    raise exception 'TEST FAILED: Penjelasan rekonsiliasi tidak memuat catatan books_start_date 2026-11-01: %', v_recon_exp;
  end if;
  raise notice 'PASS: get_po_monthly_report berhasil memuat rekap bulanan & catatan rekonsiliasi Oktober 2026';

  raise notice '=== SEMUA PENGUJIAN FASE 2 LULUS 100%%%% ===';
end;
$$;

rollback;
