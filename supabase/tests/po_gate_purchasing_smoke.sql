-- ============================================================================
-- SMOKE TEST: po_gate_purchasing_smoke.sql
-- Fase 3a: Gate Produksi Hibrida (Soft Gate Rekap), Lepas Lebih Awal,
--          dan Integrasi Pengajuan Bahan (Stock Requests) ke Batch PO
-- ============================================================================

do $$
declare
  v_uid            uuid;
  v_po_open        public.po_batches;
  v_po_closed      public.po_batches;
  v_po_purch       public.po_batches;
  v_order_open1_id uuid;
  v_order_open2_id uuid;
  v_order_closed_id uuid;
  v_order_purch_id  uuid;
  v_mat_id         uuid;
  v_color_id       uuid;
  v_sr_order_id    uuid;
  v_sr_manual_id   uuid;
  v_sr_purch1_id   uuid;
  v_sr_purch2_id   uuid;
  v_err_msg        text;
  v_event_cnt      integer;
  v_rekap_st       varchar;
  v_released_at    timestamptz;
  v_close_res      jsonb;
  v_purch_list     jsonb;
  v_owb_row        record;
  v_orig_gate      boolean;
begin
  raise notice '=== MEMULAI SMOKE TEST FASE 3a (GATE PRODUKSI & STOCK REQUESTS) ===';

  -- 1. Siapkan user uji
  select id into v_uid from auth.users where email = 'owner@sikon.com' limit 1;
  if v_uid is null then
    select id into v_uid from auth.users limit 1;
  end if;
  if v_uid is null then
    raise exception 'Tidak ada user auth untuk pengujian';
  end if;

  perform set_config('request.jwt.claim.sub', v_uid::text, true);

  -- Simpan status po_gate_production saat ini
  select coalesce(po_gate_production, false) into v_orig_gate
  from public.company_settings where user_id = v_uid;

  -- Bersihkan data uji sisa sebelumnya jika ada
  delete from public.stock_requests where user_id = v_uid and reason like 'UJI_FASE3A%';
  delete from public.orders where user_id = v_uid and customer_name in (
    'UJI_3A_Cust_Open1', 'UJI_3A_Cust_Open2', 'UJI_3A_Cust_Closed', 'UJI_3A_Cust_Purch'
  );
  delete from public.po_batches where user_id = v_uid and lower(name) in (
    'po uji gate open', 'po uji gate closed', 'po uji stock requests'
  );

  -- Buat material dan color uji jika belum ada
  select id into v_mat_id from public.materials where user_id = v_uid limit 1;
  if v_mat_id is null then
    insert into public.materials (user_id, name, unit)
    values (v_uid, 'Kain Katun Combed Uji 3A', 'meter')
    returning id into v_mat_id;
  end if;

  select id into v_color_id from public.material_colors where material_id = v_mat_id limit 1;

  -- Buat 3 PO Uji
  v_po_open := public.create_po_batch(
    'PO Uji Gate Open',
    current_date,
    current_date + 7,
    extract(year from current_date)::integer,
    extract(month from current_date)::integer,
    500,
    'Uji gate open'
  );

  v_po_closed := public.create_po_batch(
    'PO Uji Gate Closed',
    current_date - 14,
    current_date - 7,
    extract(year from current_date)::integer,
    extract(month from current_date)::integer,
    500,
    'Uji gate closed'
  );

  v_po_purch := public.create_po_batch(
    'PO Uji Stock Requests',
    current_date,
    current_date + 10,
    extract(year from current_date)::integer,
    extract(month from current_date)::integer,
    300,
    'Uji delete stock requests'
  );

  -- Buat Order Uji
  insert into public.orders (
    user_id, order_id, customer_name, order_date, total_price, status, production_status, po_batch_id
  ) values
    (v_uid, 'ORD-3A-OP1', 'UJI_3A_Cust_Open1', current_date, 250000, 'belum_lunas', 'pending', v_po_open.id)
    returning id into v_order_open1_id;

  insert into public.orders (
    user_id, order_id, customer_name, order_date, total_price, status, production_status, po_batch_id
  ) values
    (v_uid, 'ORD-3A-OP2', 'UJI_3A_Cust_Open2', current_date, 300000, 'belum_lunas', 'pending', v_po_open.id)
    returning id into v_order_open2_id;

  insert into public.orders (
    user_id, order_id, customer_name, order_date, total_price, status, production_status, po_batch_id
  ) values
    (v_uid, 'ORD-3A-CLS', 'UJI_3A_Cust_Closed', current_date - 10, 200000, 'belum_lunas', 'pending', v_po_closed.id)
    returning id into v_order_closed_id;

  insert into public.orders (
    user_id, order_id, customer_name, order_date, total_price, status, production_status, po_batch_id
  ) values
    (v_uid, 'ORD-3A-PUR', 'UJI_3A_Cust_Purch', current_date, 150000, 'belum_lunas', 'pending', v_po_purch.id)
    returning id into v_order_purch_id;

  -- Tutup v_po_closed
  perform public.close_po_batch(v_po_closed.id, null, false, 'Tutup untuk uji');

  -- --------------------------------------------------------------------------
  -- UJI 1: Saklar po_gate_production = false
  -- toggle_order_stage('rekap', true) pada order di PO open harus BERHASIL
  -- --------------------------------------------------------------------------
  update public.company_settings set po_gate_production = false where user_id = v_uid;

  perform public.toggle_order_stage(v_order_open1_id, 'rekap', true, 'Test toggle saat gate false');
  select status into v_rekap_st from public.order_stage_events where order_id = v_order_open1_id and stage = 'rekap';
  assert v_rekap_st = 'done', 'Uji 1 GAGAL: Rekap harus done saat saklar false';
  raise notice '[PASS] Uji 1: Saklar false -> toggle Rekap PO open berhasil';

  -- Kembalikan rekap ke pending
  perform public.toggle_order_stage(v_order_open1_id, 'rekap', false);

  -- --------------------------------------------------------------------------
  -- UJI 2: Saklar po_gate_production = true
  -- toggle_order_stage('rekap', true) pada order di PO open DITOLAK
  -- --------------------------------------------------------------------------
  update public.company_settings set po_gate_production = true where user_id = v_uid;

  v_err_msg := null;
  begin
    perform public.toggle_order_stage(v_order_open1_id, 'rekap', true);
  exception when others then
    v_err_msg := sqlerrm;
  end;
  assert v_err_msg is not null and v_err_msg like 'PO % belum ditutup. Tutup PO atau gunakan Lepas ke Produksi Lebih Awal.%',
    'Uji 2 GAGAL: Toggle rekap pada PO open saat gate true harus ditolak. Pesan: ' || coalesce(v_err_msg, 'none');
  raise notice '[PASS] Uji 2a: Saklar true -> toggle Rekap PO open ditolak dengan pesan yang tepat';

  -- Pada PO closed, toggle_order_stage('rekap', true) harus BERHASIL
  perform public.toggle_order_stage(v_order_closed_id, 'rekap', true, 'Test rekap pada PO closed');
  select status into v_rekap_st from public.order_stage_events where order_id = v_order_closed_id and stage = 'rekap';
  assert v_rekap_st = 'done', 'Uji 2b GAGAL: Rekap pada PO closed harus berhasil';
  raise notice '[PASS] Uji 2b: Saklar true -> toggle Rekap pada PO closed berhasil';

  -- --------------------------------------------------------------------------
  -- UJI 3: Batalkan Rekap (p_done = false) saat saklar true TIDAK DITOLAK
  -- --------------------------------------------------------------------------
  perform public.toggle_order_stage(v_order_closed_id, 'rekap', false);
  select status into v_rekap_st from public.order_stage_events where order_id = v_order_closed_id and stage = 'rekap';
  assert v_rekap_st = 'pending', 'Uji 3 GAGAL: Batalkan rekap (p_done=false) harus berhasil';
  raise notice '[PASS] Uji 3: Batalkan Rekap (p_done = false) tidak ditolak saat saklar true';

  -- --------------------------------------------------------------------------
  -- UJI 4: release_order_early validasi alasan & keberhasilan
  -- --------------------------------------------------------------------------
  -- Alasan kosong / spasi ditolak
  v_err_msg := null;
  begin
    perform public.release_order_early(v_order_open1_id, '   ');
  exception when others then
    v_err_msg := sqlerrm;
  end;
  assert v_err_msg is not null and v_err_msg like '%Alasan lepas ke produksi lebih awal wajib diisi%',
    'Uji 4a GAGAL: release_order_early tanpa alasan harus ditolak';
  raise notice '[PASS] Uji 4a: release_order_early tanpa alasan ditolak';

  -- Dengan alasan: berhasil, Rekap done, released_early_at terisi, event tercatat
  perform public.release_order_early(v_order_open1_id, 'Perlu potong duluan kain motif khusus');

  select status into v_rekap_st from public.order_stage_events where order_id = v_order_open1_id and stage = 'rekap';
  assert v_rekap_st = 'done', 'Uji 4b GAGAL: Rekap harus done setelah release_order_early';

  select released_early_at into v_released_at from public.orders where id = v_order_open1_id;
  assert v_released_at is not null, 'Uji 4b GAGAL: orders.released_early_at harus terisi';

  select count(*) into v_event_cnt
  from public.po_batch_events
  where po_batch_id = v_po_open.id and event = 'rekap_early';
  assert v_event_cnt = 1, 'Uji 4b GAGAL: event rekap_early harus tercatat 1 kali';
  raise notice '[PASS] Uji 4b: release_order_early berhasil menandai Rekap done, catat timestamp & event';

  -- Idempotensi: Panggil kedua kali tidak menduplikasi event
  perform public.release_order_early(v_order_open1_id, 'Panggilan kedua');
  select count(*) into v_event_cnt
  from public.po_batch_events
  where po_batch_id = v_po_open.id and event = 'rekap_early';
  assert v_event_cnt = 1, 'Uji 4c GAGAL: release_order_early kedua kali tidak boleh menggandakan event';
  raise notice '[PASS] Uji 4c: release_order_early idempoten';

  -- --------------------------------------------------------------------------
  -- UJI 5: release_order_early pada order di PO closed DITOLAK
  -- --------------------------------------------------------------------------
  v_err_msg := null;
  begin
    perform public.release_order_early(v_order_closed_id, 'Alasan tes pada PO closed');
  exception when others then
    v_err_msg := sqlerrm;
  end;
  assert v_err_msg is not null and v_err_msg like '%sudah ditutup. Tidak perlu melepas order lebih awal.%',
    'Uji 5 GAGAL: release_order_early pada PO closed harus ditolak. Pesan: ' || coalesce(v_err_msg, 'none');
  raise notice '[PASS] Uji 5: release_order_early pada PO closed ditolak';

  -- --------------------------------------------------------------------------
  -- UJI 6: close_po_batch dengan saklar true
  -- Rekap massal berhasil untuk order belum done, order yang sudah dilepas lebih awal dilewati tanpa gagal
  -- --------------------------------------------------------------------------
  v_close_res := public.close_po_batch(v_po_open.id, 'Alasan close smoke test', true, 'Tutup uji 6');

  assert (v_close_res->'rekap_bulk_result'->>'failed_count')::integer = 0,
    'Uji 6 GAGAL: failed_count pada rekap_bulk_result harus 0, dapat: ' || (v_close_res->'rekap_bulk_result'->>'failed_count');

  select status into v_rekap_st from public.order_stage_events where order_id = v_order_open2_id and stage = 'rekap';
  assert v_rekap_st = 'done', 'Uji 6 GAGAL: order kedua harus ditandai done saat close';
  raise notice '[PASS] Uji 6: close_po_batch saklar true sukses Rekap massal dan lewati order early tanpa gagal';

  -- --------------------------------------------------------------------------
  -- UJI 7: Trigger stock_requests po_batch_id link & backfill
  -- --------------------------------------------------------------------------
  -- Pengajuan dari order (source_order_id terisi) otomatis mengisi po_batch_id
  insert into public.stock_requests (
    user_id, material_id, material_color_id, quantity_needed, unit, source_order_id, reason
  ) values (
    v_uid, v_mat_id, v_color_id, 25.5, 'meter', v_order_purch_id, 'UJI_FASE3A Order request'
  ) returning id into v_sr_order_id;

  select po_batch_id into v_sr_manual_id from public.stock_requests where id = v_sr_order_id;
  assert v_sr_manual_id = v_po_purch.id,
    'Uji 7a GAGAL: stock_requests.po_batch_id harus otomatis terisi dari orders.po_batch_id';
  raise notice '[PASS] Uji 7a: Trigger stock_requests otomatis mengisi po_batch_id dari order';

  -- Pengajuan manual (source_order_id null) tetap boleh null
  insert into public.stock_requests (
    user_id, material_id, material_color_id, quantity_needed, unit, reason
  ) values (
    v_uid, v_mat_id, v_color_id, 10, 'meter', 'UJI_FASE3A Manual request'
  ) returning id into v_sr_manual_id;

  select po_batch_id into v_sr_order_id from public.stock_requests where id = v_sr_manual_id;
  assert v_sr_order_id is null, 'Uji 7b GAGAL: Pengajuan manual harus po_batch_id null';
  raise notice '[PASS] Uji 7b: Pengajuan manual stock_requests tetap null';

  -- --------------------------------------------------------------------------
  -- UJI 8: delete_po_batch menolak PO yang punya stock_requests
  -- --------------------------------------------------------------------------
  -- Hapus order pada PO purch sehingga PO tidak punya order, namun punya stock_requests
  delete from public.orders where id = v_order_purch_id;

  v_err_msg := null;
  begin
    perform public.delete_po_batch(v_po_purch.id);
  exception when others then
    v_err_msg := sqlerrm;
  end;
  assert v_err_msg is not null and v_err_msg like '%Tidak dapat menghapus PO yang memiliki pengajuan bahan (stock requests)%',
    'Uji 8 GAGAL: delete_po_batch harus menolak PO yang punya stock requests. Pesan: ' || coalesce(v_err_msg, 'none');
  raise notice '[PASS] Uji 8: delete_po_batch menolak PO yang punya stock_requests';

  -- --------------------------------------------------------------------------
  -- UJI 9: get_po_purchase_list daftar belanja agregat
  -- --------------------------------------------------------------------------
  -- Tambah satu request lagi untuk material dan warna yang sama pada PO purch
  insert into public.stock_requests (
    user_id, material_id, material_color_id, quantity_needed, unit, po_batch_id, status, reason
  ) values (
    v_uid, v_mat_id, v_color_id, 14.5, 'meter', v_po_purch.id, 'fulfilled', 'UJI_FASE3A Second request fulfilled'
  ) returning id into v_sr_purch2_id;

  v_purch_list := public.get_po_purchase_list(v_po_purch.id);

  assert jsonb_array_length(v_purch_list->'items') = 1,
    'Uji 9a GAGAL: Harus ada 1 item agregat material+warna';

  assert (v_purch_list->'items'->0->>'total_quantity_needed')::numeric = 40.0,
    'Uji 9b GAGAL: Total quantity needed harus 25.5 + 14.5 = 40.0, dapat: ' || (v_purch_list->'items'->0->>'total_quantity_needed');

  assert (v_purch_list->'items'->0->>'total_quantity_fulfilled')::numeric = 14.5,
    'Uji 9c GAGAL: Total quantity fulfilled harus 14.5, dapat: ' || (v_purch_list->'items'->0->>'total_quantity_fulfilled');
  raise notice '[PASS] Uji 9: get_po_purchase_list agregasi per material+warna tepat';

  -- --------------------------------------------------------------------------
  -- UJI 10: orders_with_balance tetap terbaca dan released_early_at di akhir
  -- --------------------------------------------------------------------------
  select * into v_owb_row from public.orders_with_balance where id = v_order_open1_id;
  assert v_owb_row.customer_name = 'UJI_3A_Cust_Open1', 'Uji 10a GAGAL: orders_with_balance tidak terbaca';
  assert v_owb_row.released_early_at is not null, 'Uji 10b GAGAL: released_early_at harus ada di orders_with_balance';
  raise notice '[PASS] Uji 10: orders_with_balance utuh dan released_early_at tersedia di akhir';

  -- --------------------------------------------------------------------------
  -- Cleanup Data Uji
  -- --------------------------------------------------------------------------
  delete from public.stock_requests where user_id = v_uid and reason like 'UJI_FASE3A%';
  delete from public.orders where user_id = v_uid and customer_name in (
    'UJI_3A_Cust_Open1', 'UJI_3A_Cust_Open2', 'UJI_3A_Cust_Closed', 'UJI_3A_Cust_Purch'
  );
  delete from public.po_batches where user_id = v_uid and lower(name) in (
    'po uji gate open', 'po uji gate closed', 'po uji stock requests'
  );

  -- Kembalikan saklar po_gate_production ke status semula
  update public.company_settings set po_gate_production = v_orig_gate where user_id = v_uid;

  raise notice '=== SEMUA 10 UJI FASE 3a LULUS 100%% ===';
end;
$$;
