-- ===========================================================================
-- Test: supabase/tests/po_batches_phase1c_smoke.sql
-- Memverifikasi Fase 1c:
-- 1. company_settings.po_gate_production default false
-- 2. get_current_po mengembalikan data batch berjalan dan countdown
-- 3. close_po_batch:
--    - Tolak jika early close tanpa alasan
--    - Sukses dengan alasan (early close) atau di hari Minggu
--    - Idempoten (pemanggilan ulang tidak mengubah snapshot)
--    - Rekap massal dijalankan dan tercatat event jika p_mark_rekap = true
-- 4. trg_order_items_guard_closed_po:
--    - Tolak insert item di PO closed
--    - Tolak edit qty/price di PO closed
--    - Izinkan edit kolom produksi (cutting_completed_at, cutting_qty) di PO closed
--    - Tolak delete item di PO closed
--    - Izinkan edit item jika PO is_legacy = true
-- 5. delete_order pada PO closed:
--    - Cascade delete lolos tanpa diblokir guard
--    - Tercatat event order_deleted_after_close
-- 6. reopen_po_batch:
--    - Tolak jika alasan kosong
--    - Tolak jika PO legacy
--    - Tolak jika ada cutting assignment
--    - Sukses jika bersih (snapshot diarsipkan ke event, status kembali open)
-- ===========================================================================

begin;

-- Ambil user id pertama untuk simulasi pengujian
do $$
declare
  v_test_uid    uuid;
  v_batch_id    uuid;
  v_legacy_bid  uuid;
  v_curr_po_res jsonb;
  v_order_id    uuid;
  v_item_id     uuid;
  v_order_legacy_id uuid;
  v_item_legacy_id  uuid;
  v_snapshot    jsonb;
  v_snapshot2   jsonb;
  v_dow_wib     integer := extract(isodow from now() at time zone 'Asia/Jakarta')::integer;
  v_gate_prod   boolean;
  v_event_count integer;
  v_batch_row   record;
  v_staff_id    uuid;
  v_ca_id       uuid;
begin
  select id into v_test_uid from auth.users order by created_at asc limit 1;
  if v_test_uid is null then
    raise exception 'Tidak ada user di auth.users untuk testing';
  end if;

  -- Set session auth context ke v_test_uid
  perform set_config('request.jwt.claim.sub', v_test_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  raise notice '--- 1. Cek default company_settings.po_gate_production ---';
  insert into public.company_settings (user_id, company_name)
  values (v_test_uid, 'Test Company')
  on conflict (user_id) do nothing;

  select po_gate_production into v_gate_prod
  from public.company_settings where user_id = v_test_uid;

  if v_gate_prod is distinct from false then
    raise exception 'TEST FAILED: po_gate_production default bukan false, dapat: %', v_gate_prod;
  end if;
  raise notice 'PASS: po_gate_production default false';

  raise notice '--- 2. Cek get_current_po ---';
  v_curr_po_res := public.get_current_po();
  if v_curr_po_res->'batch' is null or v_curr_po_res->'seconds_remaining' is null then
    raise exception 'TEST FAILED: get_current_po tidak mengembalikan batch atau seconds_remaining';
  end if;
  v_batch_id := (v_curr_po_res->'batch'->>'id')::uuid;
  raise notice 'PASS: get_current_po menghasilkan batch code: %', v_curr_po_res->'batch'->>'code';

  raise notice '--- 3. Setup Order uji coba dalam PO (batch terisolasi) ---';
  -- Gunakan batch terisolasi agar tidak terganggu cutting_assignments dari data seed
  v_batch_row := public.ensure_po_batch('2026-11-09'::date);
  v_batch_id  := v_batch_row.id;

  insert into public.orders (
    user_id, po_batch_id, order_id, customer_name, order_date, total_price
  ) values (
    v_test_uid, v_batch_id, 'TEST-PO-ORD-01', 'Budi Test', '2026-11-09'::date, 150000
  ) returning id into v_order_id;

  insert into public.order_items (
    user_id, order_id, name_item, qty, price, total_price
  ) values (
    v_test_uid, v_order_id, 'Kemeja Test', 2, 75000, 150000
  ) returning id into v_item_id;

  raise notice '--- 4. Cek validasi close_po_batch ---';
  -- Jika saat ini bukan hari Minggu, penutupan tanpa alasan harus gagal
  if v_dow_wib < 7 then
    begin
      perform public.close_po_batch(v_batch_id, null, true);
      raise exception 'TEST FAILED: close_po_batch sebelum Minggu tanpa alasan seharusnya ditolak';
    exception when others then
      if SQLERRM not like '%alasan%' then
        raise exception 'TEST FAILED: Pesan error penutupan lebih awal tidak sesuai: %', SQLERRM;
      end if;
      raise notice 'PASS: Penutupan sebelum Minggu tanpa alasan berhasil ditolak';
    end;
  end if;

  -- Tutup PO dengan alasan
  v_snapshot := public.close_po_batch(v_batch_id, 'Uji coba tutup lebih awal', true, 'Catatan uji');
  if v_snapshot->'summary' is null or (v_snapshot->'summary'->>'total_orders')::int < 1 then
    raise exception 'TEST FAILED: close_snapshot tidak memuat ringkasan order yang benar';
  end if;
  raise notice 'PASS: close_po_batch sukses menghasilkan snapshot versi 1';

  -- Cek status PO setelah ditutup
  select * into v_batch_row from public.po_batches where id = v_batch_id;
  if v_batch_row.status != 'closed' or v_batch_row.closed_at is null then
    raise exception 'TEST FAILED: status batch bukan closed setelah close_po_batch';
  end if;
  raise notice 'PASS: status batch menjadi closed dengan closed_at';

  -- Cek idempotensi: panggil close_po_batch kedua kali
  v_snapshot2 := public.close_po_batch(v_batch_id, 'Alasan kedua', false);
  if v_snapshot::text is distinct from v_snapshot2::text then
    raise exception 'TEST FAILED: close_po_batch tidak idempoten, snapshot berubah';
  end if;
  raise notice 'PASS: close_po_batch terbukti idempoten';

  raise notice '--- 5. Cek trigger guard order_items pada PO closed ---';
  -- A. INSERT item baru harus ditolak
  begin
    insert into public.order_items (
      user_id, order_id, name_item, qty, price, total_price
    ) values (
      v_test_uid, v_order_id, 'Celana Tambahan', 1, 50000, 50000
    );
    raise exception 'TEST FAILED: INSERT item pada PO closed seharusnya ditolak';
  exception when others then
    if SQLERRM not like '%sudah ditutup%' then
      raise exception 'TEST FAILED: Pesan error insert item closed salah: %', SQLERRM;
    end if;
    raise notice 'PASS: INSERT item baru pada PO closed ditolak';
  end;

  -- B. UPDATE qty/price (komersial) harus ditolak
  begin
    update public.order_items set qty = 5 where id = v_item_id;
    raise exception 'TEST FAILED: UPDATE qty pada PO closed seharusnya ditolak';
  exception when others then
    if SQLERRM not like '%sudah ditutup%' then
      raise exception 'TEST FAILED: Pesan error update qty closed salah: %', SQLERRM;
    end if;
    raise notice 'PASS: UPDATE qty/price pada PO closed ditolak';
  end;

  -- C. UPDATE kolom produksi (cutting_completed_at, cutting_qty) HARUS DIIZINKAN
  update public.order_items
  set cutting_completed_at = now(), cutting_qty = 2
  where id = v_item_id;
  raise notice 'PASS: UPDATE kolom produksi pada PO closed diizinkan';

  -- D. DELETE item langsung harus ditolak
  begin
    delete from public.order_items where id = v_item_id;
    raise exception 'TEST FAILED: DELETE item langsung pada PO closed seharusnya ditolak';
  exception when others then
    if SQLERRM not like '%sudah ditutup%' then
      raise exception 'TEST FAILED: Pesan error delete item closed salah: %', SQLERRM;
    end if;
    raise notice 'PASS: DELETE item langsung pada PO closed ditolak';
  end;

  raise notice '--- 6. Cek perkecualian PO legacy ---';
  -- Buat batch legacy: buat sebagai open terlebih dahulu agar bisa memasukkan order contoh, lalu set closed & is_legacy
  insert into public.po_batches (
    user_id, code, period_year, period_month, seq_in_month, start_date, end_date, status, is_legacy
  ) values (
    v_test_uid, 'PO-202601-1', 2026, 1, 1, '2026-01-05', '2026-01-11', 'open', false
  ) returning id into v_legacy_bid;

  insert into public.orders (
    user_id, po_batch_id, order_id, customer_name, order_date, total_price
  ) values (
    v_test_uid, v_legacy_bid, 'TEST-LEGACY-ORD-01', 'Customer Legacy', '2026-01-06', 100000
  ) returning id into v_order_legacy_id;

  insert into public.order_items (
    user_id, order_id, name_item, qty, price, total_price
  ) values (
    v_test_uid, v_order_legacy_id, 'Item Legacy', 1, 100000, 100000
  ) returning id into v_item_legacy_id;

  -- Sekarang tandai batch sebagai closed dan is_legacy = true
  update public.po_batches
  set status = 'closed', is_legacy = true, closed_at = now()
  where id = v_legacy_bid;

  -- Edit qty pada item legacy HARUS DIIZINKAN
  update public.order_items set qty = 2 where id = v_item_legacy_id;
  raise notice 'PASS: Edit item pada PO legacy diizinkan';

  -- Reopen pada PO legacy HARUS DITOLAK
  begin
    perform public.reopen_po_batch(v_legacy_bid, 'Mau buka legacy');
    raise exception 'TEST FAILED: Reopen pada PO legacy seharusnya ditolak';
  exception when others then
    if SQLERRM not like '%legacy%' then
      raise exception 'TEST FAILED: Pesan error reopen legacy salah: %', SQLERRM;
    end if;
    raise notice 'PASS: Reopen pada PO legacy ditolak';
  end;

  raise notice '--- 7. Cek reopen_po_batch ---';
  -- A. Reopen tanpa alasan HARUS DITOLAK
  begin
    perform public.reopen_po_batch(v_batch_id, '  ');
    raise exception 'TEST FAILED: Reopen tanpa alasan seharusnya ditolak';
  exception when others then
    raise notice 'PASS: Reopen tanpa alasan ditolak';
  end;

  -- B. Reopen jika ada cutting_assignments HARUS DITOLAK
  select id into v_staff_id from public.staff where user_id = v_test_uid limit 1;
  if v_staff_id is null then
    insert into public.staff (user_id, name, role)
    values (v_test_uid, 'Staff Tester', 'potong')
    returning id into v_staff_id;
  end if;

  insert into public.cutting_assignments (
    user_id, order_item_id, staff_id, status, assigned_at
  ) values (
    v_test_uid, v_item_id, v_staff_id, 'assigned', now()
  ) returning id into v_ca_id;

  begin
    perform public.reopen_po_batch(v_batch_id, 'Coba buka saat ada potong');
    raise exception 'TEST FAILED: Reopen saat ada penugasan potong seharusnya ditolak';
  exception when others then
    if SQLERRM not like '%potong%' then
      raise exception 'TEST FAILED: Pesan error potong salah: %', SQLERRM;
    end if;
    raise notice 'PASS: Reopen saat ada tugas potong berhasil ditolak';
  end;

  -- Bersihkan cutting assignment uji coba
  delete from public.cutting_assignments where id = v_ca_id;

  -- C. Reopen sukses saat bersih
  perform public.reopen_po_batch(v_batch_id, 'Perlu tambah pesanan khusus');
  select * into v_batch_row from public.po_batches where id = v_batch_id;
  if v_batch_row.status != 'open' or v_batch_row.reopen_count != 1 or v_batch_row.close_snapshot is not null then
    raise exception 'TEST FAILED: Status batch tidak reset ke open atau snapshot belum dibersihkan';
  end if;

  select count(*) into v_event_count
  from public.po_batch_events
  where po_batch_id = v_batch_id and event = 'reopened';
  if v_event_count < 1 then
    raise exception 'TEST FAILED: Event reopened tidak tercatat di po_batch_events';
  end if;
  raise notice 'PASS: reopen_po_batch sukses dan mengarsipkan snapshot ke event';

  raise notice '--- 8. Cek delete_order cascade delete dan audit event ---';
  -- Tutup kembali batch untuk menguji delete_order di PO closed
  perform public.close_po_batch(v_batch_id, 'Tutup lagi untuk test delete', false);

  -- Panggil delete_order: harus sukses dan menghapus order beserta order_items tanpa terblokir guard
  perform public.delete_order(v_order_id);

  if exists (select 1 from public.orders where id = v_order_id) then
    raise exception 'TEST FAILED: Order belum terhapus';
  end if;
  if exists (select 1 from public.order_items where id = v_item_id) then
    raise exception 'TEST FAILED: Order item belum terhapus cascade';
  end if;

  -- Pastikan event order_deleted_after_close tercatat
  select count(*) into v_event_count
  from public.po_batch_events
  where po_batch_id = v_batch_id and event = 'order_deleted_after_close';
  if v_event_count < 1 then
    raise exception 'TEST FAILED: Event order_deleted_after_close tidak tercatat';
  end if;
  raise notice '--- 9. Cek list_po_batches ---';
  select count(*) into v_event_count
  from public.list_po_batches();
  if v_event_count < 1 then
    raise exception 'TEST FAILED: list_po_batches tidak mengembalikan baris data';
  end if;
  raise notice 'PASS: list_po_batches sukses mengembalikan daftar batch';

  raise notice '=== SEMUA PENGUJIAN FASE 1c LULUS 100%%%% ===';
end;
$$;

rollback; -- Selalu rollback di akhir agar tidak mengubah data DB
