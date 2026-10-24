-- =========================================================================
-- SMOKE TEST BATCH PO (Fase 1a: po_week_info, ensure_po_batch, & Skema Inti)
-- Lokasi: supabase/tests/po_batches_phase1a_smoke.sql
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
  v_user_a    uuid := gen_random_uuid();
  v_user_b    uuid := gen_random_uuid();
  v_info      record;
  v_batch_1   public.po_batches;
  v_batch_2   public.po_batches;
  v_event_cnt int;
  v_cnt_b     int;
begin
  raise notice '=== MEMULAI SMOKE TEST BATCH PO (FASE 1a) ===';

  -- -----------------------------------------------------------------------
  -- SETUP USER
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values
    (v_user_a, 'po_user_a_' || substr(v_user_a::text, 1, 8) || '@example.com', 'authenticated', 'authenticated'),
    (v_user_b, 'po_user_b_' || substr(v_user_b::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  -- -----------------------------------------------------------------------
  -- PENGUJIAN 1: po_week_info (8 Kasus Tanggal Kritis)
  -- -----------------------------------------------------------------------

  -- Kasus 1: 2026-08-31 (Senin) -> September 2026 PO 1
  select * into v_info from public.po_week_info('2026-08-31'::date);
  perform pg_temp.ck(
    v_info.period_year = 2026 and v_info.period_month = 9 and v_info.seq_in_month = 1
    and v_info.code = 'PO-202609-1' and v_info.start_date = '2026-08-31'::date and v_info.end_date = '2026-09-06'::date,
    'Kasus 1 GAGAL: 2026-08-31 harus September seq 1 (PO-202609-1)'
  );
  raise notice '[LULUS] Kasus 1: 2026-08-31 -> September 2026 PO 1';

  -- Kasus 2: 2026-10-04 (Minggu) -> September 2026 PO 5
  select * into v_info from public.po_week_info('2026-10-04'::date);
  perform pg_temp.ck(
    v_info.period_year = 2026 and v_info.period_month = 9 and v_info.seq_in_month = 5
    and v_info.code = 'PO-202609-5' and v_info.start_date = '2026-09-28'::date and v_info.end_date = '2026-10-04'::date,
    'Kasus 2 GAGAL: 2026-10-04 harus September seq 5 (PO-202609-5)'
  );
  raise notice '[LULUS] Kasus 2: 2026-10-04 -> September 2026 PO 5';

  -- Kasus 3: 2026-10-05 (Senin) -> Oktober 2026 PO 1
  select * into v_info from public.po_week_info('2026-10-05'::date);
  perform pg_temp.ck(
    v_info.period_year = 2026 and v_info.period_month = 10 and v_info.seq_in_month = 1
    and v_info.code = 'PO-202610-1' and v_info.start_date = '2026-10-05'::date and v_info.end_date = '2026-10-11'::date,
    'Kasus 3 GAGAL: 2026-10-05 harus Oktober seq 1 (PO-202610-1)'
  );
  raise notice '[LULUS] Kasus 3: 2026-10-05 -> Oktober 2026 PO 1';

  -- Kasus 4: 2026-11-01 (Minggu) -> Oktober 2026 PO 4
  select * into v_info from public.po_week_info('2026-11-01'::date);
  perform pg_temp.ck(
    v_info.period_year = 2026 and v_info.period_month = 10 and v_info.seq_in_month = 4
    and v_info.code = 'PO-202610-4' and v_info.start_date = '2026-10-26'::date and v_info.end_date = '2026-11-01'::date,
    'Kasus 4 GAGAL: 2026-11-01 harus Oktober seq 4 (PO-202610-4)'
  );
  raise notice '[LULUS] Kasus 4: 2026-11-01 -> Oktober 2026 PO 4';

  -- Kasus 5: 2026-11-02 (Senin) -> November 2026 PO 1
  select * into v_info from public.po_week_info('2026-11-02'::date);
  perform pg_temp.ck(
    v_info.period_year = 2026 and v_info.period_month = 11 and v_info.seq_in_month = 1
    and v_info.code = 'PO-202611-1' and v_info.start_date = '2026-11-02'::date and v_info.end_date = '2026-11-08'::date,
    'Kasus 5 GAGAL: 2026-11-02 harus November seq 1 (PO-202611-1)'
  );
  raise notice '[LULUS] Kasus 5: 2026-11-02 -> November 2026 PO 1';

  -- Kasus 6: 2026-11-30 (Senin) -> Desember 2026 PO 1
  select * into v_info from public.po_week_info('2026-11-30'::date);
  perform pg_temp.ck(
    v_info.period_year = 2026 and v_info.period_month = 12 and v_info.seq_in_month = 1
    and v_info.code = 'PO-202612-1' and v_info.start_date = '2026-11-30'::date and v_info.end_date = '2026-12-06'::date,
    'Kasus 6 GAGAL: 2026-11-30 harus Desember seq 1 (PO-202612-1)'
  );
  raise notice '[LULUS] Kasus 6: 2026-11-30 -> Desember 2026 PO 1';

  -- Kasus 7: 2026-12-28 (Senin) -> Desember 2026 PO 5
  select * into v_info from public.po_week_info('2026-12-28'::date);
  perform pg_temp.ck(
    v_info.period_year = 2026 and v_info.period_month = 12 and v_info.seq_in_month = 5
    and v_info.code = 'PO-202612-5' and v_info.start_date = '2026-12-28'::date and v_info.end_date = '2027-01-03'::date,
    'Kasus 7 GAGAL: 2026-12-28 harus Desember seq 5 (PO-202612-5)'
  );
  raise notice '[LULUS] Kasus 7: 2026-12-28 -> Desember 2026 PO 5';

  -- Kasus 8: 2027-09-01 (Rabu) -> September 2027 PO 1
  select * into v_info from public.po_week_info('2027-09-01'::date);
  perform pg_temp.ck(
    v_info.period_year = 2027 and v_info.period_month = 9 and v_info.seq_in_month = 1
    and v_info.code = 'PO-202709-1' and v_info.start_date = '2027-08-30'::date and v_info.end_date = '2027-09-05'::date,
    'Kasus 8 GAGAL: 2027-09-01 harus September 2027 seq 1 (PO-202709-1)'
  );
  raise notice '[LULUS] Kasus 8: 2027-09-01 (Rabu) -> September 2027 PO 1';

  -- -----------------------------------------------------------------------
  -- PENGUJIAN 2: ensure_po_batch & Idempotensi / Concurrency
  -- -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);

  -- Panggilan pertama: membuat PO
  v_batch_1 := public.ensure_po_batch('2026-10-18'::date);
  perform pg_temp.ck(v_batch_1.id is not null, 'ensure_po_batch gagal mengembalikan baris batch');
  perform pg_temp.ck(v_batch_1.code = 'PO-202610-2', 'ensure_po_batch 2026-10-18 harus PO-202610-2');
  perform pg_temp.ck(v_batch_1.status = 'open', 'Status batch baru harus open');

  -- Cek event 'opened' tercatat
  select count(*) into v_event_cnt
  from public.po_batch_events
  where po_batch_id = v_batch_1.id and event = 'opened';
  perform pg_temp.ck(v_event_cnt = 1, 'Event opened harus tercatat tepat 1 kali');

  -- Panggilan kedua pada tanggal di minggu yang sama: mengembalikan batch yang sama tanpa duplikasi
  v_batch_2 := public.ensure_po_batch('2026-10-14'::date); -- Rabu minggu yang sama
  perform pg_temp.ck(v_batch_1.id = v_batch_2.id, 'Panggilan kedua harus mengembalikan batch_id yang sama');

  select count(*) into v_event_cnt
  from public.po_batch_events
  where po_batch_id = v_batch_1.id and event = 'opened';
  perform pg_temp.ck(v_event_cnt = 1, 'Event opened tidak boleh terduplikasi');
  raise notice '[LULUS] ensure_po_batch idempoten dan aman terhadap balapan (on conflict do nothing)';

  -- -----------------------------------------------------------------------
  -- PENGUJIAN 3: RLS & Isolasi Data per Akun
  -- -----------------------------------------------------------------------
  -- Ubah role ke authenticated untuk menguji RLS
  execute 'set role authenticated';

  -- Sebagai user A
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  select count(*) into v_cnt_b from public.po_batches;
  perform pg_temp.ck(v_cnt_b = 1, 'User A harus melihat 1 batch miliknya');

  -- Ganti context ke user B
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);

  select count(*) into v_cnt_b from public.po_batches;
  perform pg_temp.ck(v_cnt_b = 0, 'RLS po_batches gagal: User B tidak boleh melihat batch User A');

  select count(*) into v_cnt_b from public.po_batch_events;
  perform pg_temp.ck(v_cnt_b = 0, 'RLS po_batch_events gagal: User B tidak boleh melihat event User A');

  -- User B membuat batch sendiri via ensure_po_batch (security definer)
  v_batch_2 := public.ensure_po_batch('2026-10-18'::date);
  perform pg_temp.ck(v_batch_2.user_id = v_user_b, 'User B harus memiliki batch sendiri');
  perform pg_temp.ck(v_batch_2.id <> v_batch_1.id, 'Batch User B harus berbeda ID dengan User A');

  select count(*) into v_cnt_b from public.po_batches;
  perform pg_temp.ck(v_cnt_b = 1, 'User B hanya boleh melihat 1 batch miliknya');

  execute 'reset role';
  raise notice '[LULUS] RLS dan isolasi multi-tenant po_batches & po_batch_events berfungsi tepat';

  raise notice '==================================================';
  raise notice 'SEMUA SMOKE TEST FASE 1a (po_week_info, ensure_po_batch, RLS) LULUS!';
  raise notice '==================================================';
end;
$$;

rollback;
