-- =========================================================================
-- SMOKE TEST DOKUMEN ORDER (Fase 1: Penomoran & Surat Penawaran)
-- Lokasi: supabase/tests/document_order_smoke.sql
--
-- CARA MENJALANKAN (hanya di database lokal sekali pakai):
--   Get-Content supabase/tests/document_order_smoke.sql | docker exec -i supabase_db_xdojtfhkflbfuwmcjpwe psql -U postgres -d postgres -v ON_ERROR_STOP=1
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
  v_user_b        uuid := gen_random_uuid();
  v_sales_a       uuid;
  v_sales_b       uuid;
  v_bank_a        uuid;
  v_bank_b        uuid;
  v_order_a       uuid;
  v_order_b       uuid;

  v_no1           text;
  v_no2           text;
  v_no3           text;
  v_no_inv        text;
  v_no_next_m     text;
  v_cnt           int;

  v_q1            uuid;
  v_q1_rec        record;
  v_item_cnt      int;
  v_subtotal_sum  numeric;
  v_ok            boolean;
  v_msg           text;
begin
  raise notice '=== MEMULAI SMOKE TEST DOKUMEN ORDER (BAGIAN A & B) ===';

  -- -----------------------------------------------------------------------
  -- SETUP: buat user dummy di auth.users & master pendukung
  -- -----------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values
    (v_user_a, 'smoke_doc_a_' || substr(v_user_a::text, 1, 8) || '@example.com', 'authenticated', 'authenticated'),
    (v_user_b, 'smoke_doc_b_' || substr(v_user_b::text, 1, 8) || '@example.com', 'authenticated', 'authenticated');

  insert into public.sales (user_id, name, phone)
  values
    (v_user_a, 'Sales A', '08123456789'),
    (v_user_b, 'Sales B', '08987654321');
  select id into v_sales_a from public.sales where user_id = v_user_a;
  select id into v_sales_b from public.sales where user_id = v_user_b;

  insert into public.company_bank_accounts (user_id, bank_name, account_number, account_holder_name)
  values
    (v_user_a, 'BCA', '1234567890', 'PT Mad Ali'),
    (v_user_b, 'Mandiri', '0987654321', 'PT Lain');
  select id into v_bank_a from public.company_bank_accounts where user_id = v_user_a;
  select id into v_bank_b from public.company_bank_accounts where user_id = v_user_b;

  -- =======================================================================
  -- BAGIAN A: PENOMORAN (Test 1 - 5)
  -- =======================================================================

  -- Test 1: generate_document_no menghasilkan format PNW-YYYYMM-0001 lalu 0002
  v_no1 := public.generate_document_no(v_user_a, 'quotation', '2026-10-15'::date);
  perform pg_temp.ck(v_no1 = 'PNW-202610-0001', 'Test 1 gagal: nomor pertama seharusnya PNW-202610-0001, didapat: ' || coalesce(v_no1, 'null'));

  v_no2 := public.generate_document_no(v_user_a, 'quotation', '2026-10-15'::date);
  perform pg_temp.ck(v_no2 = 'PNW-202610-0002', 'Test 1 gagal: nomor kedua seharusnya PNW-202610-0002, didapat: ' || coalesce(v_no2, 'null'));
  raise notice '[TEST 1 LULUS] Penomoran urut quotation PNW-YYYYMM-0001 & 0002';

  -- Test 2: Bulan berbeda reset ke 0001; tipe berbeda punya counter sendiri
  v_no_next_m := public.generate_document_no(v_user_a, 'quotation', '2026-11-01'::date);
  perform pg_temp.ck(v_no_next_m = 'PNW-202611-0001', 'Test 2 gagal: bulan baru harus reset ke 0001, didapat: ' || coalesce(v_no_next_m, 'null'));

  v_no_inv := public.generate_document_no(v_user_a, 'invoice', '2026-10-15'::date);
  perform pg_temp.ck(v_no_inv = 'INV-202610-0001', 'Test 2 gagal: tipe invoice harus mulai dari INV-202610-0001, didapat: ' || coalesce(v_no_inv, 'null'));

  -- Cek isolasi per user: user B juga mulai dari 0001
  v_no3 := public.generate_document_no(v_user_b, 'quotation', '2026-10-15'::date);
  perform pg_temp.ck(v_no3 = 'PNW-202610-0001', 'Test 2 gagal: user B harus mulai dari 0001, didapat: ' || coalesce(v_no3, 'null'));
  raise notice '[TEST 2 LULUS] Reset bulan baru, pemisahan antar tipe dokumen, dan isolasi antar pengguna';

  -- Test 3: Nomor tidak di-recycle (counter terus naik)
  v_no3 := public.generate_document_no(v_user_a, 'quotation', '2026-10-20'::date);
  perform pg_temp.ck(v_no3 = 'PNW-202610-0003', 'Test 3 gagal: nomor berikutnya harus 0003, didapat: ' || coalesce(v_no3, 'null'));
  raise notice '[TEST 3 LULUS] Nomor dokumen berlanjut naik dan tidak di-recycle';

  -- Test 4: Atomisitas / validasi parameter generate_document_no
  begin
    perform public.generate_document_no(null, 'quotation', current_date);
    raise exception 'Seharusnya ditolak bila user_id null';
  exception when others then
    if sqlstate <> '22004' then
      raise exception 'Test 4 gagal: kode error user_id null salah (diharapkan 22004, didapat %)', sqlstate;
    end if;
  end;

  begin
    perform public.generate_document_no(v_user_a, 'tipe_palsu', current_date);
    raise exception 'Seharusnya ditolak bila tipe dokumen tidak valid';
  exception when others then
    if sqlstate <> '22023' then
      raise exception 'Test 4 gagal: kode error tipe dokumen tidak valid salah (diharapkan 22023, didapat %)', sqlstate;
    end if;
  end;
  raise notice '[TEST 4 LULUS] Validasi parameter input generate_document_no';

  -- Test 5: Keamanan & Hak Akses (Privileges Catalog Check)
  perform pg_temp.ck(
    not has_function_privilege('authenticated', 'public.generate_document_no(uuid, text, date)', 'execute'),
    'Test 5a gagal: generate_document_no seharusnya dicabut dari role authenticated'
  );
  perform pg_temp.ck(
    not has_function_privilege('anon', 'public.generate_document_no(uuid, text, date)', 'execute'),
    'Test 5a gagal: generate_document_no seharusnya dicabut dari role anon'
  );
  perform pg_temp.ck(
    has_table_privilege('authenticated', 'public.document_counters', 'select'),
    'Test 5b gagal: authenticated seharusnya boleh SELECT pada document_counters'
  );
  perform pg_temp.ck(
    not has_table_privilege('authenticated', 'public.document_counters', 'insert'),
    'Test 5b gagal: authenticated tidak boleh INSERT pada document_counters'
  );
  perform pg_temp.ck(
    not has_table_privilege('authenticated', 'public.document_counters', 'update'),
    'Test 5b gagal: authenticated tidak boleh UPDATE pada document_counters'
  );
  perform pg_temp.ck(
    not has_table_privilege('authenticated', 'public.document_counters', 'delete'),
    'Test 5b gagal: authenticated tidak boleh DELETE pada document_counters'
  );
  raise notice '[TEST 5 LULUS] Keamanan fungsi internal (revoke execute) & privileges tabel document_counters';

  -- =======================================================================
  -- BAGIAN B: SURAT PENAWARAN (QUOTATIONS) (Test 6 - 12)
  -- =======================================================================

  -- Set konteks login sebagai user A
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- -----------------------------------------------------------------------
  -- Test 6: save_quotation baru: header + item tersimpan, nomor terisi, edit mengganti item
  -- -----------------------------------------------------------------------
  v_q1 := public.save_quotation(
    null,
    jsonb_build_object(
      'customer_name', 'PT Pelanggan Sukses',
      'customer_company', 'Sukses Group',
      'customer_address', 'Jl. Industri No. 10',
      'sales_id', v_sales_a,
      'bank_account_id', v_bank_a,
      'dp_percent', 50,
      'payment_terms', 'DP 50%, pelunasan sebelum kirim',
      'lead_time', '14 hari kerja setelah DP',
      'notes', 'Catatan penawaran uji'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'product_name', 'Kemeja Drill Custom',
        'fabric_type', 'American Drill 1919',
        'fabric_color', 'Navy',
        'qty', 100,
        'unit', 'pcs',
        'unit_price', 85000,
        'size_breakdown', jsonb_build_object('S', 20, 'M', 50, 'L', 30),
        'item_notes', 'Bordir dada kiri'
      ),
      jsonb_build_object(
        'product_name', 'Topi Trucker Bordir',
        'qty', 50,
        'unit', 'pcs',
        'unit_price', 30000
      )
    )
  );

  select * into v_q1_rec from public.quotations where id = v_q1;
  perform pg_temp.ck(v_q1_rec.quotation_no = 'PNW-202610-0004', 'Test 6 gagal: nomor quotation salah: ' || v_q1_rec.quotation_no);
  perform pg_temp.ck(v_q1_rec.customer_name = 'PT Pelanggan Sukses', 'Test 6 gagal: nama pelanggan salah');
  perform pg_temp.ck(v_q1_rec.status = 'draft', 'Test 6 gagal: status default harus draft');
  perform pg_temp.ck(v_q1_rec.dp_percent = 50, 'Test 6 gagal: dp_percent salah');

  select count(*), coalesce(sum(subtotal), 0) into v_item_cnt, v_subtotal_sum
    from public.quotation_items
   where quotation_id = v_q1;
  perform pg_temp.ck(v_item_cnt = 2, 'Test 6 gagal: item seharusnya 2, ditemukan ' || v_item_cnt);
  -- 100 * 85000 + 50 * 30000 = 8.500.000 + 1.500.000 = 10.000.000
  perform pg_temp.ck(v_subtotal_sum = 10000000, 'Test 6 gagal: total subtotal item salah, didapat: ' || v_subtotal_sum);

  -- Edit penawaran: ganti dengan 1 item saja
  perform public.save_quotation(
    v_q1,
    jsonb_build_object(
      'customer_name', 'PT Pelanggan Sukses Rev 1',
      'dp_percent', 40
    ),
    jsonb_build_array(
      jsonb_build_object(
        'product_name', 'Kemeja Drill Custom Rev',
        'qty', 120,
        'unit', 'pcs',
        'unit_price', 80000
      )
    )
  );

  select * into v_q1_rec from public.quotations where id = v_q1;
  perform pg_temp.ck(v_q1_rec.customer_name = 'PT Pelanggan Sukses Rev 1', 'Test 6 edit gagal: customer_name tidak berubah');
  perform pg_temp.ck(v_q1_rec.quotation_no = 'PNW-202610-0004', 'Test 6 edit gagal: nomor dokumen tidak boleh berubah saat edit');
  perform pg_temp.ck(v_q1_rec.dp_percent = 40, 'Test 6 edit gagal: dp_percent tidak berubah');

  select count(*), coalesce(sum(subtotal), 0) into v_item_cnt, v_subtotal_sum
    from public.quotation_items
   where quotation_id = v_q1;
  perform pg_temp.ck(v_item_cnt = 1, 'Test 6 edit gagal: item lama harus terhapus, jumlah item sekarang: ' || v_item_cnt);
  perform pg_temp.ck(v_subtotal_sum = 9600000, 'Test 6 edit gagal: subtotal baru (120*80000) salah: ' || v_subtotal_sum);

  raise notice '[TEST 6 LULUS] save_quotation baru & edit (penggantian item atomik, nomor dokumen dipertahankan)';

  -- -----------------------------------------------------------------------
  -- Test 7: quotation_items tidak punya kolom HPP; subtotal generated
  -- -----------------------------------------------------------------------
  perform pg_temp.ck(
    not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'quotation_items' and column_name like '%hpp%'
    ),
    'Test 7 gagal: quotation_items tidak boleh memiliki kolom HPP'
  );
  raise notice '[TEST 7 LULUS] quotation_items bebas dari kolom HPP & subtotal dihitung otomatis oleh database';

  -- -----------------------------------------------------------------------
  -- Test 8: Validasi kepemilikan sales_id, bank_account_id, dan minimal 1 item
  -- -----------------------------------------------------------------------
  -- 8a: sales_id milik user B ditolak
  v_ok := false;
  begin
    perform public.save_quotation(
      null,
      jsonb_build_object('customer_name', 'Customer Test', 'sales_id', v_sales_b),
      jsonb_build_array(jsonb_build_object('product_name', 'Kaos', 'qty', 10, 'unit_price', 50000))
    );
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%Salesperson tidak ditemukan%', 'Test 8a gagal: sales milik user lain harus ditolak: ' || coalesce(v_msg, '-'));

  -- 8b: bank_account_id milik user B ditolak
  v_ok := false;
  begin
    perform public.save_quotation(
      null,
      jsonb_build_object('customer_name', 'Customer Test', 'bank_account_id', v_bank_b),
      jsonb_build_array(jsonb_build_object('product_name', 'Kaos', 'qty', 10, 'unit_price', 50000))
    );
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%Rekening bank tidak ditemukan%', 'Test 8b gagal: rekening bank milik user lain harus ditolak: ' || coalesce(v_msg, '-'));

  -- 8c: tanpa item ditolak
  v_ok := false;
  begin
    perform public.save_quotation(
      null,
      jsonb_build_object('customer_name', 'Customer Test'),
      '[]'::jsonb
    );
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%minimal 1 item%', 'Test 8c gagal: tanpa item harus ditolak: ' || coalesce(v_msg, '-'));

  raise notice '[TEST 8 LULUS] Validasi ketat kepemilikan foreign key dan minimal 1 item barang';

  -- -----------------------------------------------------------------------
  -- Test 9: Transisi status (set_quotation_status) & edit saat sent berhasil
  -- -----------------------------------------------------------------------
  perform public.set_quotation_status(v_q1, 'sent');
  select status into v_msg from public.quotations where id = v_q1;
  perform pg_temp.ck(v_msg = 'sent', 'Test 9 gagal: status seharusnya sent');

  -- Edit saat status = sent harus tetap bisa (Aturan Bisnis Pemilik #6)
  perform public.save_quotation(
    v_q1,
    jsonb_build_object('notes', 'Catatan ditambahkan saat penawaran berstatus sent'),
    jsonb_build_array(jsonb_build_object('product_name', 'Kemeja Drill Custom Rev', 'qty', 120, 'unit_price', 80000))
  );
  select notes into v_msg from public.quotations where id = v_q1;
  perform pg_temp.ck(v_msg = 'Catatan ditambahkan saat penawaran berstatus sent', 'Test 9 gagal: edit saat sent harus diizinkan');

  -- Status 'accepted' tidak boleh diset manual lewat set_quotation_status (hanya lewat link_quotation_to_order)
  v_ok := false;
  begin
    perform public.set_quotation_status(v_q1, 'accepted');
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg ilike '%tidak valid%', 'Test 9 gagal: status accepted tidak boleh diset manual: ' || coalesce(v_msg, '-'));

  raise notice '[TEST 9 LULUS] Transisi status penawaran & fleksibilitas edit pada status sent';

  -- -----------------------------------------------------------------------
  -- Test 10: delete_quotation menghapus item (cascade); ditolak bila order_id terisi
  -- -----------------------------------------------------------------------
  -- Buat quotation dummy untuk diuji hapus
  declare
    v_q_del uuid;
  begin
    v_q_del := public.save_quotation(
      null,
      jsonb_build_object('customer_name', 'Pelanggan Hapus'),
      jsonb_build_array(jsonb_build_object('product_name', 'Item Hapus', 'qty', 1, 'unit_price', 1000))
    );
    perform public.delete_quotation(v_q_del);
    perform pg_temp.ck(not exists (select 1 from public.quotations where id = v_q_del), 'Test 10 gagal: header quotation seharusnya terhapus');
    perform pg_temp.ck(not exists (select 1 from public.quotation_items where quotation_id = v_q_del), 'Test 10 gagal: item quotation seharusnya terhapus cascade');
  end;
  raise notice '[TEST 10 LULUS] delete_quotation menghapus dokumen beserta rincian item secara cascade';

  -- -----------------------------------------------------------------------
  -- Test 11: link_quotation_to_order mengisi order_id, status accepted, penolakan tautan ganda
  -- -----------------------------------------------------------------------
  -- Buat order untuk ditautkan
  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_user_a, 'ORD-0099', 'PT Pelanggan Sukses', 9600000, 0, 'belum_lunas', 'production', current_date)
  returning id into v_order_a;

  insert into public.orders (user_id, order_id, customer_name, total_price, ongkir, status, production_status, order_date)
  values (v_user_b, 'ORD-0100', 'Pelanggan B', 5000000, 0, 'belum_lunas', 'production', current_date)
  returning id into v_order_b;

  -- 11a: link ke order milik user B ditolak
  v_ok := false;
  begin
    perform public.link_quotation_to_order(v_q1, v_order_b);
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%Pesanan tidak ditemukan%', 'Test 11a gagal: link ke order user lain harus ditolak: ' || coalesce(v_msg, '-'));

  -- 11b: link ke order milik sendiri berhasil
  perform public.link_quotation_to_order(v_q1, v_order_a);
  select * into v_q1_rec from public.quotations where id = v_q1;
  perform pg_temp.ck(v_q1_rec.order_id = v_order_a, 'Test 11b gagal: order_id tidak terisi');
  perform pg_temp.ck(v_q1_rec.status = 'accepted', 'Test 11b gagal: status harus menjadi accepted');

  -- 11c: link kedua kalinya ditolak
  v_ok := false;
  begin
    perform public.link_quotation_to_order(v_q1, v_order_a);
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg ilike '%taut%', 'Test 11c gagal: penautan ganda harus ditolak: ' || coalesce(v_msg, '-'));

  -- 11d: quotation yang sudah tertaut ke order tidak boleh dihapus
  v_ok := false;
  begin
    perform public.delete_quotation(v_q1);
  exception when others then
    v_ok := true;
    v_msg := sqlerrm;
  end;
  perform pg_temp.ck(v_ok and v_msg like '%sudah terhubung ke pesanan%', 'Test 11d gagal: hapus penawaran tertaut harus ditolak: ' || coalesce(v_msg, '-'));

  raise notice '[TEST 11 LULUS] link_quotation_to_order menautkan order, set status accepted, cegah tautan ganda & proteksi hapus';

  -- -----------------------------------------------------------------------
  -- Test 12: Hapus order yang tertaut: quotations.order_id menjadi null (on delete set null)
  -- -----------------------------------------------------------------------
  delete from public.orders where id = v_order_a;
  select order_id into v_order_a from public.quotations where id = v_q1;
  perform pg_temp.ck(v_order_a is null, 'Test 12 gagal: saat order dihapus, quotations.order_id harus menjadi null');
  raise notice '[TEST 12 LULUS] quotations.order_id set null saat pesanan terkait dihapus (tanpa merusak histori penawaran)';

  -- -----------------------------------------------------------------------
  -- Test Tambahan: Isolasi RLS & Privileges Tabel quotations & quotation_items
  -- -----------------------------------------------------------------------
  perform pg_temp.ck(
    has_table_privilege('authenticated', 'public.quotations', 'select') and
    not has_table_privilege('authenticated', 'public.quotations', 'insert') and
    not has_table_privilege('authenticated', 'public.quotations', 'update') and
    not has_table_privilege('authenticated', 'public.quotations', 'delete'),
    'Test RLS gagal: quotations harus select-only untuk authenticated'
  );
  perform pg_temp.ck(
    has_table_privilege('authenticated', 'public.quotation_items', 'select') and
    not has_table_privilege('authenticated', 'public.quotation_items', 'insert') and
    not has_table_privilege('authenticated', 'public.quotation_items', 'update') and
    not has_table_privilege('authenticated', 'public.quotation_items', 'delete'),
    'Test RLS gagal: quotation_items harus select-only untuk authenticated'
  );

  -- -----------------------------------------------------------------------
  -- Test 13: Kolom referensi terstruktur (category, product, material, color, fabric_specs)
  -- -----------------------------------------------------------------------
  declare
    v_test_cat_id      uuid;
    v_test_prod_id     uuid;
    v_test_mat_cat_id  uuid;
    v_test_mat_id      uuid;
    v_test_color_id    uuid;
    v_q_ref_id         uuid;
    v_stored_item      record;
  begin
    insert into public.product_categories (user_id, name)
    values (v_user_a, 'Kemeja PDL Test')
    returning id into v_test_cat_id;

    insert into public.products (user_id, category_id, name, default_price)
    values (v_user_a, v_test_cat_id, 'Kemeja Tactical 5.11', 175000)
    returning id into v_test_prod_id;

    insert into public.material_categories (user_id, name, is_fabric)
    values (v_user_a, 'Kain Katun Test', true)
    returning id into v_test_mat_cat_id;

    insert into public.materials (user_id, category_id, name, unit, composition, description, care_instruction)
    values (v_user_a, v_test_mat_cat_id, 'Ripstop Tornado', 'meter', '65% Katun, 35% Poliester', 'Lebar 150cm, gramasi 210 gsm, kotak-kotak ripstop anti sobek', 'Cuci suhu dingin')
    returning id into v_test_mat_id;

    insert into public.material_colors (user_id, material_id, color_name)
    values (v_user_a, v_test_mat_id, 'Hijau Army')
    returning id into v_test_color_id;

    -- Simpan quotation dengan item referensi lengkap
    v_q_ref_id := public.save_quotation(
      null,
      jsonb_build_object('customer_name', 'TNI AU Lanud', 'quotation_date', '2026-10-15'),
      jsonb_build_array(
        jsonb_build_object(
          'product_name', 'Kemeja Tactical 5.11',
          'category_id', v_test_cat_id,
          'product_id', v_test_prod_id,
          'material_id', v_test_mat_id,
          'material_color_id', v_test_color_id,
          'fabric_type', 'Ripstop Tornado',
          'fabric_color', 'Hijau Army',
          'fabric_specs', 'Komposisi: 65% Katun, 35% Poliester | Lebar 150cm, 210 gsm',
          'qty', 100,
          'unit', 'pcs',
          'unit_price', 175000
        )
      )
    );

    select * into v_stored_item
      from public.quotation_items
     where quotation_id = v_q_ref_id;

    perform pg_temp.ck(v_stored_item.category_id = v_test_cat_id, 'Test 13a gagal: category_id tidak tersimpan');
    perform pg_temp.ck(v_stored_item.product_id = v_test_prod_id, 'Test 13b gagal: product_id tidak tersimpan');
    perform pg_temp.ck(v_stored_item.material_id = v_test_mat_id, 'Test 13c gagal: material_id tidak tersimpan');
    perform pg_temp.ck(v_stored_item.material_color_id = v_test_color_id, 'Test 13d gagal: material_color_id tidak tersimpan');
    perform pg_temp.ck(v_stored_item.fabric_specs like '%65% Katun%', 'Test 13e gagal: fabric_specs tidak tersimpan');

    -- Validasi penolakan jika material milik user lain
    v_ok := false;
    begin
      perform public.save_quotation(
        null,
        jsonb_build_object('customer_name', 'Pelanggan X'),
        jsonb_build_array(
          jsonb_build_object(
            'product_name', 'Kemeja Salah',
            'material_id', gen_random_uuid(), -- ID acak / milik user lain
            'qty', 10,
            'unit_price', 50000
          )
        )
      );
    exception when others then
      v_ok := true;
      v_msg := sqlerrm;
    end;
    perform pg_temp.ck(v_ok and v_msg like '%tidak ditemukan atau bukan milik Anda%', 'Test 13f gagal: material asing harus ditolak: ' || coalesce(v_msg, '-'));
  end;

  raise notice '[TEST 13 LULUS] Kolom referensi terstruktur (category, product, material, color, fabric_specs) tersimpan & tervalidasi';

  -- =======================================================================
  -- BAGIAN C: INVOICES (Zero Orphan Parent Binding & Sync Tests)
  -- =======================================================================

  -- Test 14: Otomasi save_quotation melahirkan invoice DP & create_invoice_from_quotation
  declare
    v_inv_q_id       uuid;
    v_inv_q_rec      record;
    v_inv_items_cnt  int;
    v_item_desc      text;
  begin
    -- Cari invoice yang otomatis dilahirkan oleh save_quotation pada v_q1 (subtotal 9.600.000, dp_percent 40%)
    select * into v_inv_q_rec
      from public.invoices
     where quotation_id = v_q1;

    perform pg_temp.ck(v_inv_q_rec.id is not null, 'Test 14a gagal: invoice penawaran harus otomatis dibuat saat save_quotation');
    perform pg_temp.ck(v_inv_q_rec.invoice_no like 'INV-202610-%', 'Test 14b gagal: nomor invoice tidak berformat INV-202610-NNNN: ' || v_inv_q_rec.invoice_no);
    perform pg_temp.ck(v_inv_q_rec.invoice_type = 'dp', 'Test 14c gagal: invoice_type harus dp');
    perform pg_temp.ck(v_inv_q_rec.source_type = 'quotation', 'Test 14d gagal: source_type harus quotation');
    perform pg_temp.ck(v_inv_q_rec.quotation_id = v_q1, 'Test 14e gagal: quotation_id harus tertaut');
    perform pg_temp.ck(v_inv_q_rec.subtotal = 9600000, 'Test 14f gagal: subtotal invoice harus 9.600.000');
    perform pg_temp.ck(v_inv_q_rec.grand_total = 9600000, 'Test 14g gagal: grand_total invoice harus 9.600.000');
    perform pg_temp.ck(v_inv_q_rec.amount_due = 3840000, 'Test 14h gagal: amount_due DP 40% harus 3.840.000, didapat: ' || v_inv_q_rec.amount_due);

    select count(*), max(description) into v_inv_items_cnt, v_item_desc
      from public.invoice_items
     where invoice_id = v_inv_q_rec.id;
    perform pg_temp.ck(v_inv_items_cnt = 1, 'Test 14i gagal: item penawaran harus tersalin ke invoice_items');
    perform pg_temp.ck(coalesce(v_item_desc, '') not like '%Spesifikasi:%', 'Test 14j gagal: spesifikasi kain tidak boleh masuk ke invoice');

    raise notice '[TEST 14 LULUS] save_quotation otomatis melahirkan invoice penawaran DP 40%% dengan rincian item lengkap';
  end;

  -- Test 15: create_invoice_from_order & snapshot independen
  declare
    v_ord_test_id    uuid;
    v_inv_ord_id     uuid;
    v_inv_ord_rec    record;
    v_inv_item_bef   record;
    v_inv_item_aft   record;
  begin
    -- 1. Buat order dengan 2 item dan ongkir 50.000
    insert into public.orders (
      user_id, customer_name, order_date, ongkir, status
    ) values (
      v_user_a, 'PT Pelunasan Test', '2026-10-15', 50000, 'belum_lunas'
    ) returning id into v_ord_test_id;

    insert into public.order_items (
      order_id, user_id, name_item, qty, price
    ) values
      (v_ord_test_id, v_user_a, 'Kemeja Drill', 10, 100000), -- 1.000.000
      (v_ord_test_id, v_user_a, 'Topi Bordir', 20, 25000);   --   500.000
      -- Subtotal = 1.500.000, Ongkir = 50.000, Grand Total = 1.550.000

    -- 2. Catat pembayaran DP 600.000
    insert into public.order_payments (
      order_id, user_id, amount, payment_type, payment_method, payment_date
    ) values (
      v_ord_test_id, v_user_a, 600000, 'dp', 'transfer', '2026-10-15'
    );

    -- 3. Buat invoice pelunasan dari order
    v_inv_ord_id := public.create_invoice_from_order(v_ord_test_id, 'pelunasan');

    select * into v_inv_ord_rec
      from public.invoices
     where id = v_inv_ord_id;

    perform pg_temp.ck(v_inv_ord_rec.source_type = 'order', 'Test 15a gagal: source_type harus order');
    perform pg_temp.ck(v_inv_ord_rec.order_id = v_ord_test_id, 'Test 15b gagal: order_id harus tertaut');
    perform pg_temp.ck(v_inv_ord_rec.subtotal = 1500000, 'Test 15c gagal: subtotal harus 1.500.000');
    perform pg_temp.ck(v_inv_ord_rec.shipping_cost = 50000, 'Test 15d gagal: shipping_cost harus 50.000');
    perform pg_temp.ck(v_inv_ord_rec.grand_total = 1550000, 'Test 15e gagal: grand_total harus 1.550.000');
    perform pg_temp.ck(v_inv_ord_rec.paid_amount = 600000, 'Test 15f gagal: paid_amount snapshot harus 600.000');
    -- Sisa amount_due: 1.550.000 - 600.000 = 950.000
    perform pg_temp.ck(v_inv_ord_rec.amount_due = 950000, 'Test 15g gagal: amount_due sisa pelunasan harus 950.000, didapat: ' || v_inv_ord_rec.amount_due);

    -- 4. Uji snapshot: ubah order_items dan pastikan invoice_items TIDAK berubah
    select * into v_inv_item_bef
      from public.invoice_items
     where invoice_id = v_inv_ord_id and product_name = 'Kemeja Drill';
    perform pg_temp.ck(v_inv_item_bef.qty = 10 and v_inv_item_bef.unit_price = 100000, 'Test 15h gagal: item sebelum edit harus qty 10 price 100000');

    -- Edit order_items: ubah qty menjadi 999 dan price menjadi 500000
    update public.order_items
       set qty = 999, price = 500000
     where order_id = v_ord_test_id and name_item = 'Kemeja Drill';

    select * into v_inv_item_aft
      from public.invoice_items
     where invoice_id = v_inv_ord_id and product_name = 'Kemeja Drill';
    perform pg_temp.ck(v_inv_item_aft.qty = 10 and v_inv_item_aft.unit_price = 100000, 'Test 15i gagal: invoice_items tidak boleh terpengaruh oleh edit order_items sesudahnya!');

    -- 5. Uji trigger trg_sync_order_invoice_on_payment: tambah pembayaran pelunasan 950.000
    insert into public.order_payments (
      order_id, user_id, amount, payment_type, payment_method, payment_date
    ) values (
      v_ord_test_id, v_user_a, 950000, 'pelunasan', 'transfer', '2026-10-16'
    );

    select * into v_inv_ord_rec
      from public.invoices
     where id = v_inv_ord_id;

    perform pg_temp.ck(v_inv_ord_rec.paid_amount = 1550000, 'Test 15j gagal: paid_amount harus ter-sync menjadi 1.550.000');
    perform pg_temp.ck(v_inv_ord_rec.amount_due = 0, 'Test 15k gagal: amount_due harus ter-sync menjadi 0');
    perform pg_temp.ck(v_inv_ord_rec.status = 'paid', 'Test 15l gagal: invoice status harus otomatis paid saat lunas');

    raise notice '[TEST 15 LULUS] create_invoice_from_order snapshot aman & trigger pembayaran otomatis mensinkronkan paid_amount/status lunas';
  end;

  -- Test 16: Penegakan Zero Orphan (Constraint Parent & Source Check)
  declare
    v_ord_dummy_id uuid;
    v_inv_test_id  uuid;
    v_rec_status   record;
  begin
    -- 16a: Insert invoice dengan source_type = 'manual' harus DITOLAK
    v_ok := false;
    begin
      insert into public.invoices (user_id, invoice_no, customer_name, source_type)
      values (v_user_a, 'INV-MANUAL-01', 'Pelanggan Lepas', 'manual');
    exception when others then
      v_ok := true;
      v_msg := sqlerrm;
    end;
    perform pg_temp.ck(v_ok and v_msg like '%invoices_source_check%', 'Test 16a gagal: source_type manual harus ditolak constraint: ' || coalesce(v_msg, '-'));

    -- 16b: Insert invoice tanpa quotation_id dan tanpa order_id harus DITOLAK
    v_ok := false;
    begin
      insert into public.invoices (user_id, invoice_no, customer_name, source_type)
      values (v_user_a, 'INV-ORPHAN-01', 'Pelanggan Yatim', 'quotation');
    exception when others then
      v_ok := true;
      v_msg := sqlerrm;
    end;
    perform pg_temp.ck(v_ok and v_msg like '%invoices_parent_check%', 'Test 16b gagal: invoice tanpa parent harus ditolak constraint: ' || coalesce(v_msg, '-'));

    -- 16c: Transisi status invoice valid (draft -> sent -> cancelled) & proteksi delete
    insert into public.orders (user_id, customer_name, order_date, status)
    values (v_user_a, 'Customer Transisi', current_date, 'belum_lunas')
    returning id into v_ord_dummy_id;

    insert into public.order_items (order_id, user_id, name_item, qty, price)
    values (v_ord_dummy_id, v_user_a, 'Item X', 1, 10000);

    v_inv_test_id := public.create_invoice_from_order(v_ord_dummy_id, 'penuh');

    perform public.set_invoice_status(v_inv_test_id, 'sent');
    select status into v_rec_status from public.invoices where id = v_inv_test_id;
    perform pg_temp.ck(v_rec_status.status = 'sent', 'Test 16c gagal: status harus sent');

    -- Sent tidak boleh dihapus
    v_ok := false;
    begin
      perform public.delete_invoice(v_inv_test_id);
    exception when others then
      v_ok := true;
      v_msg := sqlerrm;
    end;
    perform pg_temp.ck(v_ok and v_msg like '%Hanya invoice berstatus draft yang dapat dihapus%', 'Test 16d gagal: delete invoice non-draft harus ditolak: ' || coalesce(v_msg, '-'));

    -- Batalkan invoice sent (harus bisa)
    perform public.set_invoice_status(v_inv_test_id, 'cancelled');
    select status into v_rec_status from public.invoices where id = v_inv_test_id;
    perform pg_temp.ck(v_rec_status.status = 'cancelled', 'Test 16e gagal: status harus cancelled');

    raise notice '[TEST 16 LULUS] Penegakan integritas Zero Orphan berhasil: invoice lepas ditolak, transisi & proteksi legal aktif';
  end;

  -- Test 17: Hapus order/penawaran sumber: invoice tetap ada (on delete set null)
  declare
    v_src_ord_id  uuid;
    v_inv_src_id  uuid;
    v_check_inv   record;
  begin
    insert into public.orders (user_id, customer_name, order_date, status)
    values (v_user_a, 'Sumber Order Hapus', '2026-10-15', 'belum_lunas')
    returning id into v_src_ord_id;

    insert into public.order_items (order_id, user_id, name_item, qty, price)
    values (v_src_ord_id, v_user_a, 'Item Temp', 5, 50000);

    v_inv_src_id := public.create_invoice_from_order(v_src_ord_id, 'penuh');

    select * into v_check_inv from public.invoices where id = v_inv_src_id;
    perform pg_temp.ck(v_check_inv.order_id = v_src_ord_id, 'Test 17a gagal: order_id harus tertaut sebelum dihapus');

    -- Hapus order sumber
    delete from public.orders where id = v_src_ord_id;

    -- Pastikan invoice TETAP ADA, dengan order_id bernilai null
    select * into v_check_inv from public.invoices where id = v_inv_src_id;
    perform pg_temp.ck(v_check_inv.id is not null, 'Test 17b gagal: invoice tidak boleh terhapus saat order dihapus!');
    perform pg_temp.ck(v_check_inv.order_id is null, 'Test 17c gagal: order_id harus menjadi null via ON DELETE SET NULL');

    raise notice '[TEST 17 LULUS] ON DELETE SET NULL pada order_id & quotation_id menjaga integritas dokumen legal invoice';
  end;

  -- =======================================================================
  -- BAGIAN D: RECEIPTS (Kwitansi Otomatis via Trigger & Cascade Delete)
  -- =======================================================================

  -- Test 18: Insert order_payment melahirkan kwitansi otomatis KWT-YYYYMM-NNNN
  declare
    v_rcpt_ord_id   uuid;
    v_pay_id_1      uuid;
    v_pay_id_2      uuid;
    v_rcpt_1        record;
    v_rcpt_2        record;
    v_jn_cnt_before int;
    v_jn_cnt_after  int;
  begin
    insert into public.orders (user_id, customer_name, order_date, status)
    values (v_user_a, 'Customer Kwitansi Test', '2026-10-17', 'belum_lunas')
    returning id into v_rcpt_ord_id;

    -- Hitung jumlah baris journal_entries saat ini
    select count(*) into v_jn_cnt_before from public.journal_entries;

    -- Insert pembayaran DP 500.000
    insert into public.order_payments (
      order_id, user_id, amount, payment_type, payment_method, payment_date
    ) values (
      v_rcpt_ord_id, v_user_a, 500000, 'dp', 'transfer', '2026-10-17'
    ) returning id into v_pay_id_1;

    -- Kwitansi harus otomatis terbit
    select * into v_rcpt_1 from public.receipts where payment_id = v_pay_id_1;
    perform pg_temp.ck(v_rcpt_1.id is not null, 'Test 18a gagal: kwitansi tidak dibuat otomatis oleh trigger');
    perform pg_temp.ck(v_rcpt_1.receipt_no like 'KWT-202610-%', 'Test 18b gagal: nomor kwitansi tidak berformat KWT-YYYYMM-NNNN: ' || v_rcpt_1.receipt_no);
    perform pg_temp.ck(v_rcpt_1.order_id = v_rcpt_ord_id, 'Test 18c gagal: order_id tidak cocok');
    perform pg_temp.ck(v_rcpt_1.amount = 500000, 'Test 18d gagal: nominal kwitansi harus 500.000');
    perform pg_temp.ck(v_rcpt_1.customer_name = 'Customer Kwitansi Test', 'Test 18e gagal: customer_name tidak cocok');
    perform pg_temp.ck(v_rcpt_1.payment_type = 'dp', 'Test 18f gagal: payment_type harus dp');

    -- Pastikan kwitansi TIDAK memicu baris jurnal baru
    select count(*) into v_jn_cnt_after from public.journal_entries;
    perform pg_temp.ck(v_jn_cnt_after = v_jn_cnt_before, 'Test 18g gagal: kwitansi tidak boleh menambah baris jurnal akuntansi!');

    raise notice '[TEST 18 LULUS] Insert pembayaran otomatis melahirkan kwitansi KWT-YYYYMM-NNNN tanpa mencemari jurnal akuntansi';

    -- Test 19: Pembayaran kedua melahirkan kwitansi kedua dengan nomor & ID berbeda
    insert into public.order_payments (
      order_id, user_id, amount, payment_type, payment_method, payment_date
    ) values (
      v_rcpt_ord_id, v_user_a, 300000, 'pelunasan', 'cash', '2026-10-17'
    ) returning id into v_pay_id_2;

    select * into v_rcpt_2 from public.receipts where payment_id = v_pay_id_2;
    perform pg_temp.ck(v_rcpt_2.id is not null, 'Test 19a gagal: kwitansi kedua tidak terbuat');
    perform pg_temp.ck(v_rcpt_2.id <> v_rcpt_1.id, 'Test 19b gagal: id kwitansi kedua harus berbeda');
    perform pg_temp.ck(v_rcpt_2.receipt_no <> v_rcpt_1.receipt_no, 'Test 19c gagal: nomor kwitansi kedua harus berbeda');
    perform pg_temp.ck(v_rcpt_2.amount = 300000, 'Test 19d gagal: amount kwitansi kedua harus 300.000');
    perform pg_temp.ck(v_rcpt_2.payment_type = 'pelunasan', 'Test 19e gagal: payment_type kedua harus pelunasan');

    raise notice '[TEST 19 LULUS] Pembayaran kedua melahirkan kwitansi kedua dengan nomor berurut & unik';

    -- Test 20: Hapus pembayaran menghapus kwitansi terkait (ON DELETE CASCADE)
    delete from public.order_payments where id = v_pay_id_1;
    perform pg_temp.ck(not exists (select 1 from public.receipts where id = v_rcpt_1.id), 'Test 20a gagal: kwitansi 1 harus terhapus saat pembayarannya dihapus');
    perform pg_temp.ck(exists (select 1 from public.receipts where id = v_rcpt_2.id), 'Test 20b gagal: kwitansi 2 tidak boleh terpengaruh');

    -- Hapus pembayaran kedua juga (menghapus kwitansi 2)
    delete from public.order_payments where id = v_pay_id_2;
    perform pg_temp.ck(not exists (select 1 from public.receipts where id = v_rcpt_2.id), 'Test 20c gagal: kwitansi 2 harus terhapus saat pembayarannya dihapus');

    -- Hapus order yang sudah bersih dari uang pelanggan
    delete from public.orders where id = v_rcpt_ord_id;
    perform pg_temp.ck(not exists (select 1 from public.orders where id = v_rcpt_ord_id), 'Test 20d gagal: order harus berhasil dihapus');

    raise notice '[TEST 20 LULUS] ON DELETE CASCADE pada payment_id & order_id membersihkan kwitansi tanpa error foreign key';
  end;

  -- =======================================================================
  -- BAGIAN E: NOTAS (get_or_create_nota, Idempotensi, Snapshot Lock)
  -- =======================================================================

  declare
    v_nota_ord_id   uuid;
    v_nota_id_1     uuid;
    v_nota_id_2     uuid;
    v_nota_rec_1    record;
    v_nota_rec_2    record;
    v_snap_item     jsonb;
    v_snap_pay      jsonb;
  begin
    -- 1. Buat pesanan status 'belum_lunas'
    insert into public.orders (user_id, customer_name, order_date, ongkir, status)
    values (v_user_a, 'Customer Nota Test', '2026-10-17', 25000, 'belum_lunas')
    returning id into v_nota_ord_id;

    insert into public.order_items (order_id, user_id, name_item, qty, price)
    values (v_nota_ord_id, v_user_a, 'Kaos Polo', 10, 85000); -- 850.000 + 25.000 = 875.000

    -- Test 22: Order belum lunas ditolak
    v_ok := false;
    begin
      perform public.get_or_create_nota(v_nota_ord_id);
    exception when others then
      v_ok := true;
      v_msg := sqlerrm;
    end;
    perform pg_temp.ck(v_ok and v_msg like '%Order belum lunas%', 'Test 22 gagal: order belum lunas harus ditolak: ' || coalesce(v_msg, '-'));
    raise notice '[TEST 22 LULUS] get_or_create_nota menolak order yang belum lunas';

    -- Bayar lunas pesanan
    insert into public.order_payments (order_id, user_id, amount, payment_type, payment_method, payment_date)
    values (v_nota_ord_id, v_user_a, 875000, 'pelunasan', 'transfer', '2026-10-17');

    update public.orders set status = 'lunas' where id = v_nota_ord_id;

    -- Test 23: Order lunas berhasil melahirkan nota ber-snapshot
    v_nota_id_1 := public.get_or_create_nota(v_nota_ord_id);
    select * into v_nota_rec_1 from public.notas where id = v_nota_id_1;

    perform pg_temp.ck(v_nota_rec_1.id is not null, 'Test 23a gagal: nota tidak tersimpan');
    perform pg_temp.ck(v_nota_rec_1.nota_no like 'NTA-202610-%', 'Test 23b gagal: nomor nota tidak berformat NTA-YYYYMM-NNNN: ' || v_nota_rec_1.nota_no);
    perform pg_temp.ck(v_nota_rec_1.grand_total = 875000, 'Test 23c gagal: grand_total nota harus 875.000');
    perform pg_temp.ck(v_nota_rec_1.paid_amount = 875000, 'Test 23d gagal: paid_amount nota harus 875.000');

    -- Periksa isi snapshot
    v_snap_item := v_nota_rec_1.snapshot->'items'->0;
    perform pg_temp.ck(v_snap_item->>'name' = 'Kaos Polo', 'Test 23e gagal: snapshot items name tidak cocok');
    perform pg_temp.ck((v_snap_item->>'qty')::numeric = 10, 'Test 23f gagal: snapshot items qty tidak cocok');
    perform pg_temp.ck((v_snap_item->>'subtotal')::numeric = 850000, 'Test 23g gagal: snapshot items subtotal tidak cocok');

    v_snap_pay := v_nota_rec_1.snapshot->'payments'->0;
    perform pg_temp.ck((v_snap_pay->>'amount')::numeric = 875000, 'Test 23h gagal: snapshot payments amount tidak cocok');

    -- Panggilan kedua harus idempoten (mengembalikan ID & nomor yang sama persis)
    v_nota_id_2 := public.get_or_create_nota(v_nota_ord_id);
    perform pg_temp.ck(v_nota_id_1 = v_nota_id_2, 'Test 23i gagal: panggilan kedua harus mengembalikan nota yang sama');

    raise notice '[TEST 23 LULUS] get_or_create_nota menerbitkan nota dengan snapshot terkunci & idempoten';

    -- Test 24: Edit order_items tidak mengubah snapshot nota
    update public.order_items
       set qty = 999, price = 1000
     where order_id = v_nota_ord_id and name_item = 'Kaos Polo';

    select * into v_nota_rec_2 from public.notas where id = v_nota_id_1;
    v_snap_item := v_nota_rec_2.snapshot->'items'->0;
    perform pg_temp.ck((v_snap_item->>'qty')::numeric = 10, 'Test 24 gagal: snapshot nota tidak boleh terpengaruh perubahan order_items sesudahnya!');

    raise notice '[TEST 24 LULUS] Snapshot nota kebal terhadap pengeditan data order sesudahnya';

    -- Test 25: Akses order milik user lain ditolak
    -- Ganti context ke v_user_b
    perform set_config('request.jwt.claim.sub', v_user_b::text, true);
    v_ok := false;
    begin
      perform public.get_or_create_nota(v_nota_ord_id);
    exception when others then
      v_ok := true;
      v_msg := sqlerrm;
    end;
    perform pg_temp.ck(v_ok and v_msg like '%tidak ditemukan atau bukan milik Anda%', 'Test 25 gagal: akses order user lain harus ditolak');
    raise notice '[TEST 25 LULUS] get_or_create_nota melindungi isolasi hak akses antar pengguna';

    -- Kembalikan context ke v_user_a
    perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  end;

  raise notice '==================================================';
  raise notice 'SEMUA SMOKE TEST DOKUMEN ORDER (BAGIAN A, B, C, D, & E) LULUS';
  raise notice '==================================================';
end;
$$;

rollback;
