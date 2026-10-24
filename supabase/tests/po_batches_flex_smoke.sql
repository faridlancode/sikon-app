-- ============================================================================
-- SMOKE TEST: po_batches_flex_smoke.sql
-- Menguji seluruh kasus uji REVISI_1_BATCH_PO_FLEKSIBEL.md §7 bagian Database
-- ============================================================================

do $$
declare
  v_uid         uuid;
  v_po1         public.po_batches;
  v_po2         public.po_batches;
  v_po_overlap  public.po_batches;
  v_po_closed   public.po_batches;
  v_po_legacy   public.po_batches;
  v_po_del      public.po_batches;
  v_order1_id   uuid;
  v_order2_id   uuid;
  v_order3_id   uuid;
  v_order_date1 date := '2026-10-01';
  v_order_date2 date := '2026-10-15';
  v_order_date_none date := '2025-01-01';
  v_err_msg     text;
  v_daily_rep   jsonb;
  v_close_rep   jsonb;
  v_monthly_rep jsonb;
  v_list_sum    record;
  v_fn_exists   boolean;
begin
  raise notice '=== MEMULAI SMOKE TEST BATCH PO REVISI 1 (FLEKSIBEL) ===';

  -- 1. Siapkan user uji
  select id into v_uid from auth.users where email = 'owner@sikon.com' limit 1;
  if v_uid is null then
    select id into v_uid from auth.users limit 1;
  end if;
  if v_uid is null then
    raise exception 'Tidak ada user auth untuk pengujian';
  end if;

  -- Simulasikan konteks auth.uid()
  perform set_config('request.jwt.claim.sub', v_uid::text, true);

  -- Bersihkan data uji jika sebelumnya pernah dijalankan
  delete from public.orders where user_id = v_uid and customer_name in ('Pelanggan Tanggal Tumpang Tindih', 'Pelanggan Closed', 'Pelanggan Error');
  delete from public.po_batches where user_id = v_uid and lower(name) in (
    'po 5 september 2026',
    'po spesial tumpang tindih',
    'po 2 oktober 2026 test',
    'po tertutup uji',
    'po tertutup uji renamed',
    'po siap hapus',
    'po future end'
  );

  -- 2. UJI 1: create_po_batch "PO 5 September" 28 Sep - 4 Okt, bulan laporan September
  v_po1 := public.create_po_batch(
    'PO 5 September 2026',
    '2026-09-28',
    '2026-10-04',
    2026,
    9,
    50,
    'PO akhir September lintas Oktober'
  );
  assert v_po1.id is not null, 'Gagal membuat PO 5 September';
  assert v_po1.code like 'PO-%', 'Format kode PO harus PO-XXXX';
  assert v_po1.period_month = 9, 'Bulan periode harus 9';
  raise notice '[PASS] Uji 1: create_po_batch berhasil dibuat (Kode: %, Nama: %)', v_po1.code, v_po1.name;

  -- 3. UJI 2: Nama kembar (beda huruf besar/kecil) harus ditolak
  begin
    perform public.create_po_batch(
      'po 5 september 2026',
      '2026-09-28',
      '2026-10-04',
      2026,
      9
    );
    raise exception 'Seharusnya ditolak karena nama kembar case-insensitive';
  exception when others then
    get stacked diagnostics v_err_msg = message_text;
    assert v_err_msg like '%sudah digunakan%', 'Pesan error nama kembar salah: ' || v_err_msg;
    raise notice '[PASS] Uji 2: Penolakan nama kembar case-insensitive berhasil: %', v_err_msg;
  end;

  -- 4. UJI 3: Tanggal selesai < tanggal mulai harus ditolak
  begin
    perform public.create_po_batch(
      'PO Invalid Dates',
      '2026-10-10',
      '2026-10-05',
      2026,
      10
    );
    raise exception 'Seharusnya ditolak karena tanggal selesai < tanggal mulai';
  exception when others then
    get stacked diagnostics v_err_msg = message_text;
    assert v_err_msg like '%tidak boleh sebelum%', 'Pesan error tanggal range salah: ' || v_err_msg;
    raise notice '[PASS] Uji 3: Penolakan end_date < start_date berhasil: %', v_err_msg;
  end;

  -- 5. UJI 4: Dua PO open tumpang tindih rentang tanggal diizinkan
  v_po_overlap := public.create_po_batch(
    'PO Spesial Tumpang Tindih',
    '2026-10-01',
    '2026-10-10',
    2026,
    10,
    100
  );
  assert v_po_overlap.id is not null, 'PO rentang tumpang tindih harus berhasil dibuat';
  raise notice '[PASS] Uji 4: PO tumpang tindih berhasil dibuat (%)', v_po_overlap.name;

  -- Buat PO kedua untuk Oktober
  v_po2 := public.create_po_batch(
    'PO 2 Oktober 2026 Test',
    '2026-10-12',
    '2026-10-18',
    2026,
    10,
    30
  );

  -- 6. UJI 5: Insert order tanpa po_batch_id
  -- 6a. Tanggal yang tidak ada PO terbuka -> harus ditolak dengan pesan §2.2 no 4, dan TIDAK membuat PO otomatis
  begin
    insert into public.orders (user_id, customer_name, total_price, ongkir, status, order_date)
    values (v_uid, 'Pelanggan Error', 100000, 0, 'belum_lunas', v_order_date_none);
    raise exception 'Seharusnya ditolak karena tidak ada PO terbuka untuk tanggal 2025-01-01';
  exception when others then
    get stacked diagnostics v_err_msg = message_text;
    assert v_err_msg like 'Belum ada PO terbuka untuk tanggal%', 'Pesan error fallback salah: ' || v_err_msg;
    raise notice '[PASS] Uji 5a: Fallback order tanpa PO terbuka ditolak tanpa auto-create: %', v_err_msg;
  end;

  -- Pastikan tidak ada PO 2025 otomatis yang dibuat
  assert not exists (
    select 1 from public.po_batches where user_id = v_uid and start_date = '2024-12-30' or start_date = '2025-01-01'
  ), 'PO otomatis tidak boleh terbentuk!';

  -- 6b. Tanggal ada 2 PO open (v_po1: 28 Sep - 4 Okt vs v_po_overlap: 1 Okt - 10 Okt pada tanggal 2026-10-01)
  -- Harus memilih yang start_date paling akhir (yaitu v_po_overlap yang mulai 1 Okt > v_po1 yang mulai 28 Sep)
  insert into public.orders (user_id, customer_name, total_price, ongkir, status, order_date)
  values (v_uid, 'Pelanggan Tanggal Tumpang Tindih', 200000, 10000, 'belum_lunas', '2026-10-01')
  returning id into v_order1_id;

  select po_batch_id into v_err_msg from public.orders where id = v_order1_id;
  assert v_err_msg = v_po_overlap.id::text, 'Order harus masuk ke PO overlap dengan start_date terbaru (1 Okt)';
  raise notice '[PASS] Uji 5b: Fallback multi-PO memilih PO dengan start_date terbaru';

  -- 7. UJI 6: Insert order ke PO closed harus ditolak
  -- Buat PO lalu tutup
  v_po_closed := public.create_po_batch(
    'PO Tertutup Uji',
    '2026-08-01',
    '2026-08-07',
    2026,
    8
  );
  -- Tutup PO
  perform public.close_po_batch(v_po_closed.id, 'Uji penutupan', false);

  begin
    insert into public.orders (user_id, customer_name, total_price, ongkir, status, order_date, po_batch_id)
    values (v_uid, 'Pelanggan Closed', 150000, 0, 'belum_lunas', '2026-08-02', v_po_closed.id);
    raise exception 'Insert order ke PO closed harus ditolak';
  exception when others then
    get stacked diagnostics v_err_msg = message_text;
    assert v_err_msg like 'PO % sudah ditutup%', 'Pesan error PO closed salah: ' || v_err_msg;
    raise notice '[PASS] Uji 6: Insert order ke PO closed ditolak: %', v_err_msg;
  end;

  -- 8. UJI 7: Pindah PO
  -- 8a. Ubah po_batch_id ke PO closed -> ditolak
  begin
    update public.orders set po_batch_id = v_po_closed.id where id = v_order1_id;
    raise exception 'Pindah ke PO closed harus ditolak';
  exception when others then
    get stacked diagnostics v_err_msg = message_text;
    assert v_err_msg like 'PO % sudah ditutup%', 'Pesan pindah ke PO closed salah: ' || v_err_msg;
    raise notice '[PASS] Uji 7a: Pindah order ke PO closed ditolak: %', v_err_msg;
  end;

  -- 8b. Ubah order_date -> PO tidak boleh berpindah
  update public.orders set order_date = '2026-10-15' where id = v_order1_id;
  select po_batch_id into v_err_msg from public.orders where id = v_order1_id;
  assert v_err_msg = v_po_overlap.id::text, 'PO tidak boleh berpindah saat order_date berubah';
  raise notice '[PASS] Uji 8: Ubah order_date tidak memindahkan PO';

  -- 9. UJI 8: update_po_batch
  -- 9a. Ubah tanggal pada PO closed -> ditolak
  begin
    perform public.update_po_batch(
      v_po_closed.id,
      v_po_closed.name,
      '2026-08-02',
      '2026-08-08',
      2026,
      8
    );
    raise exception 'Ubah tanggal PO closed harus ditolak';
  exception when others then
    get stacked diagnostics v_err_msg = message_text;
    assert v_err_msg like '%sudah ditutup tidak dapat diubah%', 'Pesan ubah tanggal PO closed salah: ' || v_err_msg;
    raise notice '[PASS] Uji 9a: Ubah tanggal PO closed ditolak: %', v_err_msg;
  end;

  -- 9b. Ubah nama, kuota, catatan pada PO closed -> diizinkan dan snapshot tidak berubah
  perform public.update_po_batch(
    v_po_closed.id,
    'PO Tertutup Uji Renamed',
    v_po_closed.start_date,
    v_po_closed.end_date,
    2026,
    8,
    75,
    'Catatan revisi setelah close'
  );
  assert exists (
    select 1 from public.po_batch_events
    where po_batch_id = v_po_closed.id and event = 'updated'
  ), 'Event updated harus tercatat di po_batch_events';
  raise notice '[PASS] Uji 9b: update_po_batch pada PO closed berhasil dan event updated tercatat';

  -- 10. UJI 9: delete_po_batch
  -- 10a. PO berisi order ditolak
  begin
    perform public.delete_po_batch(v_po_overlap.id);
    raise exception 'Hapus PO berisi order harus ditolak';
  exception when others then
    get stacked diagnostics v_err_msg = message_text;
    assert v_err_msg like '%sudah memiliki pesanan%', 'Pesan hapus PO ber-order salah: ' || v_err_msg;
    raise notice '[PASS] Uji 10a: Hapus PO berisi order ditolak: %', v_err_msg;
  end;

  -- 10b. PO kosong open berhasil dihapus
  v_po_del := public.create_po_batch('PO Siap Hapus', '2026-11-01', '2026-11-07', 2026, 11);
  perform public.delete_po_batch(v_po_del.id);
  assert not exists (select 1 from public.po_batches where id = v_po_del.id), 'PO kosong harus terhapus';
  raise notice '[PASS] Uji 10b: delete_po_batch untuk PO kosong berhasil';

  -- 11. UJI 10: close_po_batch aturan tanggal selesai (end_date)
  -- Buat PO yang end_date di masa depan
  v_po_del := public.create_po_batch('PO Future End', (current_date - 1), (current_date + 5), 2026, 10);
  begin
    perform public.close_po_batch(v_po_del.id, null, false);
    raise exception 'Tutup sebelum end_date tanpa alasan harus ditolak';
  exception when others then
    get stacked diagnostics v_err_msg = message_text;
    assert v_err_msg like '%alasan penutupan lebih awal%', 'Pesan early close salah: ' || v_err_msg;
    raise notice '[PASS] Uji 11a: Tutup PO sebelum end_date tanpa alasan ditolak: %', v_err_msg;
  end;

  -- Dengan alasan -> berhasil
  perform public.close_po_batch(v_po_del.id, 'Target sudah tercapai', false);
  raise notice '[PASS] Uji 11b: Tutup PO sebelum end_date dengan alasan berhasil';

  -- 12. UJI 11: Kuota terlampaui tidak menolak order
  insert into public.order_items (order_id, user_id, name_item, qty, price)
  values (v_order1_id, v_uid, 'Item Uji Melebihi Kuota', 9999, 10000);
  assert (select count(*) from public.order_items where order_id = v_order1_id) > 0, 'Order item kuota besar harus tersimpan';
  raise notice '[PASS] Uji 12: Kuota tidak menolak order (kuota hanya bersifat peringatan)';

  -- 13. UJI 12: Laporan Harian membawa 'pos'
  v_daily_rep := public.get_po_daily_report('2026-10-15');
  assert v_daily_rep ? 'pos', 'Laporan harian harus memuat array "pos"';
  assert v_daily_rep ? 'today_summary', 'Laporan harian harus memuat "today_summary"';
  assert v_daily_rep ? 'orders', 'Laporan harian harus memuat "orders"';
  raise notice '[PASS] Uji 13: get_po_daily_report berhasil mengembalikan struktur baru (pos: %)', jsonb_array_length(v_daily_rep->'pos');

  -- 14. UJI 13: Laporan Bulanan memakai period_year dan period_month pilihan owner
  -- v_po1 dibuat dengan period_year 2026, period_month 9 (September)
  v_monthly_rep := public.get_po_monthly_report(2026, 9);
  assert exists (
    select 1 from jsonb_array_elements(v_monthly_rep->'po_batches') b
    where b->>'name' = 'PO 5 September 2026'
  ), 'PO 5 September harus muncul di laporan bulanan September 2026';

  -- Dan tidak boleh muncul di Oktober 2026
  v_monthly_rep := public.get_po_monthly_report(2026, 10);
  assert not exists (
    select 1 from jsonb_array_elements(v_monthly_rep->'po_batches') b
    where b->>'name' = 'PO 5 September 2026'
  ), 'PO 5 September TIDAK boleh muncul di laporan bulanan Oktober 2026';
  raise notice '[PASS] Uji 14: Laporan bulanan tepat mengikuti period_year & period_month pilihan owner';

  -- 15. UJI 14: Verifikasi get_current_po dan ensure_po_batch sudah dicabut
  select exists (select 1 from pg_proc where proname = 'get_current_po') into v_fn_exists;
  assert not v_fn_exists, 'get_current_po harus sudah dicabut!';

  select exists (select 1 from pg_proc where proname = 'ensure_po_batch') into v_fn_exists;
  assert not v_fn_exists, 'ensure_po_batch harus sudah dicabut!';
  raise notice '[PASS] Uji 15: get_current_po dan ensure_po_batch terbukti telah dicabut dari skema database';

  -- 16. UJI 15: list_po_batches_summary mengembalikan kuota dan data terisi
  select * into v_list_sum from public.list_po_batches_summary() limit 1;
  assert v_list_sum.id is not null, 'list_po_batches_summary harus mengembalikan baris';
  raise notice '[PASS] Uji 16: list_po_batches_summary berhasil mengembalikan data (PO: %, Terisi: % pcs)', v_list_sum.name, v_list_sum.total_qty;

  -- 17. Bersihkan data pesanan uji
  delete from public.order_items where order_id = v_order1_id;
  delete from public.orders where id = v_order1_id;
  delete from public.po_batches where id in (v_po1.id, v_po_overlap.id, v_po2.id, v_po_closed.id, v_po_del.id);

  raise notice '=== SEMUA 16 KASUS UJI SMOKE TEST REVISI 1 LULUS 100%% ===';
end;
$$;
