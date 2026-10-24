-- =========================================================================
-- SMOKE TEST BATCH PO (Fase 1b: orders.po_batch_id, Trigger Assign, & View)
-- Lokasi: supabase/tests/po_batches_phase1b_smoke.sql
-- =========================================================================

begin;

-- Helper cek kondisi
create or replace function pg_temp.ck(p_ok boolean, p_msg text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'GAGAL: %', p_msg;
  end if;
end;
$$;

do $$
declare
  v_user_a        uuid := gen_random_uuid();
  v_order_id_1    uuid;
  v_order_id_2    uuid;
  v_order_id_wib  uuid;
  v_order_row     record;
  v_view_row      record;
  v_batch_1       public.po_batches;
  v_batch_wib     public.po_batches;
  v_ok            boolean;
  v_msg           text;
  v_ts_wib        timestamptz;
  v_date_wib      date;
  v_orphan_cnt    int;
begin
  raise notice '=== MEMULAI SMOKE TEST BATCH PO (FASE 1b) ===';

  -- -----------------------------------------------------------------------
  -- SETUP USER
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values
    (v_user_a, 'po_user_1b_' || substr(v_user_a::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claim.sub', v_user_a::text, true);

  -- -----------------------------------------------------------------------
  -- PENGUJIAN 1: Insert Order Baru Otomatis Menempel ke PO yang Sesuai
  -- -----------------------------------------------------------------------
  insert into public.orders (
    user_id,
    order_id,
    customer_name,
    order_date,
    total_price,
    ongkir,
    status
  )
  values (
    v_user_a,
    'ORD-TEST-1B-01',
    'Pelanggan Test 1',
    '2026-10-18'::date,
    1000000,
    25000,
    'belum_lunas'
  )
  returning id into v_order_id_1;

  -- Periksa kolom orders.po_batch_id
  select * into v_order_row from public.orders where id = v_order_id_1;
  perform pg_temp.ck(v_order_row.po_batch_id is not null, 'Test 1 Gagal: orders.po_batch_id harus terisi otomatis');

  -- Periksa detail po_batches yang terbentuk/terkait
  select * into v_batch_1 from public.po_batches where id = v_order_row.po_batch_id;
  perform pg_temp.ck(v_batch_1.code = 'PO-202610-2', 'Test 1 Gagal: Kode PO harus PO-202610-2, didapat ' || coalesce(v_batch_1.code, 'null'));
  perform pg_temp.ck(v_batch_1.status = 'open', 'Test 1 Gagal: Status PO harus open');
  raise notice '[LULUS] Test 1: Insert order baru otomatis menempel ke PO (PO-202610-2)';

  -- -----------------------------------------------------------------------
  -- PENGUJIAN WAJIB A: Order 2026-10-19 00:30 WIB Masuk PO yang Mulai 19 Okt
  -- (2026-10-19 00:30:00 WIB = 2026-10-18 17:30:00 UTC)
  -- -----------------------------------------------------------------------
  v_ts_wib := '2026-10-18 17:30:00+00'::timestamptz;
  v_date_wib := (v_ts_wib at time zone 'Asia/Jakarta')::date;
  perform pg_temp.ck(v_date_wib = '2026-10-19'::date, 'Konversi zona waktu WIB salah: 17:30 UTC harus menjadi 2026-10-19 WIB');

  insert into public.orders (
    user_id,
    order_id,
    customer_name,
    order_date,
    total_price,
    ongkir,
    status
  )
  values (
    v_user_a,
    'ORD-TEST-1B-WIB',
    'Pelanggan Dini Hari WIB',
    v_date_wib,
    250000,
    0,
    'belum_lunas'
  )
  returning id into v_order_id_wib;

  select * into v_order_row from public.orders where id = v_order_id_wib;
  select * into v_batch_wib from public.po_batches where id = v_order_row.po_batch_id;
  perform pg_temp.ck(v_batch_wib.start_date = '2026-10-19'::date,
    'Pengujian Wajib A GAGAL: Order 2026-10-19 00:30 WIB harus masuk PO yang mulai 19 Okt, didapat ' || v_batch_wib.start_date);
  perform pg_temp.ck(v_batch_wib.code = 'PO-202610-3',
    'Pengujian Wajib A GAGAL: Kode PO harus PO-202610-3, didapat ' || v_batch_wib.code);
  raise notice '[LULUS] Pengujian Wajib A: Order 2026-10-19 00:30 WIB (17:30 UTC) tepat masuk PO yang mulai 19 Okt (PO-202610-3)';

  -- -----------------------------------------------------------------------
  -- PENGUJIAN 2: View orders_with_balance memuat po_batch_id, po_code, po_status
  -- -----------------------------------------------------------------------
  select * into v_view_row from public.orders_with_balance where id = v_order_id_1;
  perform pg_temp.ck(v_view_row.po_batch_id = v_batch_1.id, 'Test 2 Gagal: view orders_with_balance po_batch_id tidak cocok');
  perform pg_temp.ck(v_view_row.po_code = 'PO-202610-2', 'Test 2 Gagal: view orders_with_balance po_code harus PO-202610-2');
  perform pg_temp.ck(v_view_row.po_status = 'open', 'Test 2 Gagal: view orders_with_balance po_status harus open');
  perform pg_temp.ck(v_view_row.grand_total = 1025000, 'Test 2 Gagal: grand_total tetap valid');
  raise notice '[LULUS] Test 2: View orders_with_balance memuat kolom PO dengan tepat di posisi akhir';

  -- -----------------------------------------------------------------------
  -- PENGUJIAN 3: Order Baru pada PO Tertutup Ditolak
  -- -----------------------------------------------------------------------
  -- Tutup batch PO-202610-2 secara manual untuk pengujian
  update public.po_batches
  set status = 'closed', closed_at = now()
  where id = v_batch_1.id;

  v_ok := false;
  begin
    insert into public.orders (
      user_id,
      order_id,
      customer_name,
      order_date,
      total_price,
      ongkir,
      status
    )
    values (
      v_user_a,
      'ORD-TEST-1B-02',
      'Pelanggan Ditolak',
      '2026-10-18'::date, -- Tanggal jatuh di PO tertutup
      500000,
      0,
      'belum_lunas'
    )
    returning id into v_order_id_2;
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;

  perform pg_temp.ck(v_ok, 'Test 3 Gagal: Order baru di PO closed harus ditolak');
  perform pg_temp.ck(v_msg like '%sudah ditutup. Order baru masuk ke PO%', 'Test 3 Gagal: Pesan error salah: ' || v_msg);
  raise notice '[LULUS] Test 3: Order baru pada PO tertutup ditolak dengan pesan yang sesuai';

  -- -----------------------------------------------------------------------
  -- PENGUJIAN 4: Perubahan order_date ke PO Tertutup Ditolak
  -- -----------------------------------------------------------------------
  -- Buat order di minggu lain (misal 2026-10-20 di PO-202610-3 yang masih open)
  insert into public.orders (
    user_id,
    order_id,
    customer_name,
    order_date,
    total_price,
    ongkir,
    status
  )
  values (
    v_user_a,
    'ORD-TEST-1B-03',
    'Pelanggan Open',
    '2026-10-20'::date,
    750000,
    0,
    'belum_lunas'
  )
  returning id into v_order_id_2;

  -- Coba pindahkan order_date ke 2026-10-18 (PO closed)
  v_ok := false;
  begin
    update public.orders
    set order_date = '2026-10-18'::date
    where id = v_order_id_2;
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;

  perform pg_temp.ck(v_ok, 'Test 4 Gagal: Pindah order_date ke PO closed harus ditolak');
  perform pg_temp.ck(v_msg like '%sudah ditutup. Order baru masuk ke PO%', 'Test 4 Gagal: Pesan error salah: ' || v_msg);
  raise notice '[LULUS] Test 4: Perubahan order_date ke PO tertutup ditolak';

  -- -----------------------------------------------------------------------
  -- PENGUJIAN 5: Update Field Non-Tanggal pada Order di PO Tertutup Tetap Diizinkan
  -- -----------------------------------------------------------------------
  update public.orders
  set customer_name = 'Pelanggan Test 1 Diperbarui',
      ongkir = 30000
  where id = v_order_id_1;

  select customer_name, ongkir into v_order_row from public.orders where id = v_order_id_1;
  perform pg_temp.ck(v_order_row.customer_name = 'Pelanggan Test 1 Diperbarui' and v_order_row.ongkir = 30000,
    'Test 5 Gagal: Update non-tanggal pada order di PO closed harus diizinkan');
  raise notice '[LULUS] Test 5: Update data non-tanggal pada order di PO tertutup tetap diizinkan';

  -- -----------------------------------------------------------------------
  -- PENGUJIAN WAJIB B: Backfill Memastikan 0 Order Tanpa PO
  -- -----------------------------------------------------------------------
  select count(*) into v_orphan_cnt from public.orders where po_batch_id is null;
  perform pg_temp.ck(v_orphan_cnt = 0, 'Pengujian Wajib B GAGAL: Masih ada ' || v_orphan_cnt || ' order tanpa po_batch_id!');
  raise notice '[LULUS] Pengujian Wajib B: Terverifikasi 0 order tanpa PO (semua order memiliki po_batch_id yang valid)';

  raise notice '==================================================';
  raise notice 'SEMUA SMOKE TEST FASE 1b (orders.po_batch_id, Trigger Assign, View) LULUS!';
  raise notice '==================================================';
end;
$$;

rollback;
