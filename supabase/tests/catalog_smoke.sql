-- =========================================================================
-- SIKon — Smoke Test: Catalog Backend (catalog_smoke.sql)
-- =========================================================================
-- Jalankan di database LOKAL setelah supabase db reset & seed.sql.
-- Setiap blok test mencetak PASS / FAIL ke output.
-- Seluruh 15 test harus PASS sebelum migration boleh dipush ke remote.
-- =========================================================================

-- Helper: raise exception jika kondisi false
create or replace function _test_assert(
  p_label text,
  p_cond  boolean,
  p_fail_msg text default 'assertion gagal'
)
returns void language plpgsql as $$
begin
  if p_cond then
    raise notice 'PASS  %', p_label;
  else
    raise exception 'FAIL  % — %', p_label, p_fail_msg;
  end if;
end;
$$;

-- =========================================================================
-- DATA SETUP — seed minimal untuk kebutuhan smoke test catalog
-- Semua INSERT di bawah menggunakan user_id owner yang sudah ada di auth.users
-- =========================================================================

do $$
declare
  v_user_id          uuid;
  v_matcat_kain      uuid;
  v_mat_nagata       uuid;
  v_mat_american     uuid;
  v_color_hitam      uuid;
  v_color_navy       uuid;
  v_cat_kemeja       uuid;
  v_prod_published   uuid;
  v_prod_unpublished uuid;
  v_slot_kemeja      uuid;
  v_sales_visible    uuid;
  v_sales_hidden     uuid;
  v_order_completed  uuid;
  v_order_queued     uuid;
  v_item_uuid        uuid;
  v_image_primary    uuid;
  v_image_secondary  uuid;
  v_pfo_nagata       uuid;
  v_inv_token        text;
  v_inv_hash         text;
  v_inv_id           uuid;
  v_bank_acc_id      uuid;
begin
  -- Aktifkan akses pgcrypto (gen_random_bytes, sha256)
  set search_path to public, extensions;

  -- Ambil user_id owner
  select id into v_user_id from auth.users where email = 'owner@sikon.com' limit 1;
  if v_user_id is null then
    raise exception 'Seed user owner@sikon.com tidak ditemukan — jalankan seed.sql dulu';
  end if;

  -- -----------------------------------------------------------------------
  -- Material category kain
  -- -----------------------------------------------------------------------
  insert into public.material_categories (user_id, name, is_fabric)
  values (v_user_id, 'Kain Test Smoke', true)
  returning id into v_matcat_kain;

  -- -----------------------------------------------------------------------
  -- Materials
  -- -----------------------------------------------------------------------
  insert into public.materials (user_id, category_id, name, unit, is_active, weight_gsm, catalog_description)
  values (v_user_id, v_matcat_kain, 'Nagata Smoke', 'meter', true, 220, 'Kain tebal nyaman untuk seragam')
  returning id into v_mat_nagata;

  insert into public.materials (user_id, category_id, name, unit, is_active, weight_gsm, catalog_description)
  values (v_user_id, v_matcat_kain, 'American Smoke', 'meter', true, 180, null)
  returning id into v_mat_american;

  -- -----------------------------------------------------------------------
  -- Material colors
  -- -----------------------------------------------------------------------
  insert into public.material_colors (user_id, material_id, color_name, color_code, is_active)
  values (v_user_id, v_mat_nagata, 'Hitam', '#000000', true)
  returning id into v_color_hitam;

  insert into public.material_colors (user_id, material_id, color_name, color_code, is_active)
  values (v_user_id, v_mat_nagata, 'Navy', '#001f5b', true)
  returning id into v_color_navy;

  -- -----------------------------------------------------------------------
  -- Product category
  -- -----------------------------------------------------------------------
  insert into public.product_categories (user_id, name)
  values (v_user_id, 'Kemeja Smoke')
  returning id into v_cat_kemeja;

  -- -----------------------------------------------------------------------
  -- Products: 1 published, 1 unpublished
  -- -----------------------------------------------------------------------
  insert into public.products (
    user_id, category_id, name, description, is_active, is_published, is_featured,
    price_satuan, price_prioritas, default_price
  ) values (
    v_user_id, v_cat_kemeja, 'Kemeja Polo Smoke', 'Produk demo smoke test', true, true, true,
    85000, 75000, 90000
  )
  returning id into v_prod_published;

  insert into public.products (
    user_id, category_id, name, description, is_active, is_published,
    price_satuan, default_price
  ) values (
    v_user_id, v_cat_kemeja, 'Kemeja Draft Smoke', 'Produk belum tayang', true, false,
    70000, 75000
  )
  returning id into v_prod_unpublished;

  -- -----------------------------------------------------------------------
  -- Product fabric slot (fallback)
  -- -----------------------------------------------------------------------
  insert into public.product_fabric_slots (user_id, product_id, fabric_category_id, usage_qty)
  values (v_user_id, v_prod_published, v_matcat_kain, 1.5)
  returning id into v_slot_kemeja;

  -- -----------------------------------------------------------------------
  -- Product fabric option (opsi kustom produk published)
  -- -----------------------------------------------------------------------
  insert into public.product_fabric_options (
    user_id, product_id, material_id, price_adjustment, is_offered, is_default, sort_order
  ) values (
    v_user_id, v_prod_published, v_mat_nagata, 5000, true, true, 1
  )
  returning id into v_pfo_nagata;

  insert into public.product_fabric_options (
    user_id, product_id, material_id, price_adjustment, is_offered, is_default, sort_order
  ) values (
    v_user_id, v_prod_published, v_mat_american, -2000, true, false, 2
  );

  -- -----------------------------------------------------------------------
  -- Product images
  -- -----------------------------------------------------------------------
  insert into public.product_images (user_id, product_id, image_url, is_primary, sort_order)
  values (v_user_id, v_prod_published, 'https://example.com/foto-utama.webp', true, 0)
  returning id into v_image_primary;

  insert into public.product_images (user_id, product_id, image_url, is_primary, sort_order)
  values (v_user_id, v_prod_published, 'https://example.com/foto-kedua.webp', false, 1)
  returning id into v_image_secondary;

  -- -----------------------------------------------------------------------
  -- Sales
  -- -----------------------------------------------------------------------
  insert into public.sales (
    user_id, name, phone, is_active, show_in_catalog, display_order,
    slug, photo_url, tagline, open_time, close_time
  ) values (
    v_user_id, 'Budi Sales Smoke', '081234567890', true, true, 1,
    'budi-smoke', 'https://example.com/budi.webp', 'Siap membantu!', '08:00', '17:00'
  )
  returning id into v_sales_visible;

  insert into public.sales (
    user_id, name, phone, is_active, show_in_catalog, display_order
  ) values (
    v_user_id, 'Siti Hidden Smoke', '089988776655', true, false, 2
  )
  returning id into v_sales_hidden;

  -- -----------------------------------------------------------------------
  -- Orders
  -- -----------------------------------------------------------------------
  insert into public.orders (
    user_id, order_id, customer_name, production_status, status, customer_phone,
    total_price
  ) values (
    v_user_id, 'ORD-SMOKE-01', 'Pelanggan Smoke', 'completed', 'lunas', '081234567890',
    850000
  )
  returning id into v_order_completed;

  insert into public.orders (
    user_id, order_id, customer_name, production_status, status, customer_phone,
    total_price
  ) values (
    v_user_id, 'ORD-SMOKE-02', 'Pelanggan Antrian', 'production', 'belum_lunas', '089988776655',
    500000
  )
  returning id into v_order_queued;

  -- Order items (name_item wajib NOT NULL, pakai price & total_price)
  insert into public.order_items (user_id, order_id, product_id, name_item, qty, price, total_price)
  values (v_user_id, v_order_completed, v_prod_published, 'Kemeja Polo Smoke', 10, 75000, 750000)
  returning id into v_item_uuid;

  insert into public.order_items (user_id, order_id, product_id, name_item, qty, price, total_price)
  values (v_user_id, v_order_queued, v_prod_published, 'Kemeja Polo Smoke', 5, 75000, 375000);

  -- -----------------------------------------------------------------------
  -- Review invitation (token acak)
  -- -----------------------------------------------------------------------
  v_inv_token := encode(gen_random_bytes(16), 'hex');
  v_inv_hash  := encode(sha256(v_inv_token::bytea), 'hex');

  insert into public.review_invitations (user_id, order_id, token_hash, expires_at)
  values (v_user_id, v_order_completed, v_inv_hash, now() + interval '30 days')
  returning id into v_inv_id;

  -- Simpan token ke temp table untuk dipakai skenario uji
  create temp table if not exists smoke_catalog_vars (key text primary key, val text);
  insert into smoke_catalog_vars values
    ('user_id',           v_user_id::text),
    ('prod_published',    v_prod_published::text),
    ('prod_unpublished',  v_prod_unpublished::text),
    ('cat_kemeja',        v_cat_kemeja::text),
    ('sales_visible',     v_sales_visible::text),
    ('sales_hidden',      v_sales_hidden::text),
    ('order_completed',   v_order_completed::text),
    ('order_queued',      v_order_queued::text),
    ('item_uuid',         v_item_uuid::text),
    ('image_primary',     v_image_primary::text),
    ('inv_token',         v_inv_token),
    ('inv_hash',          v_inv_hash),
    ('inv_id',            v_inv_id::text),
    ('mat_nagata',        v_mat_nagata::text),
    ('mat_american',      v_mat_american::text),
    ('sales_slug',        'budi-smoke');

  -- Company settings: pastikan ada data perusahaan
  insert into public.company_settings (
    user_id, company_name, address, whatsapp, email, instagram,
    operating_hours, maps_url, logo_url
  ) values (
    v_user_id,
    'Konveksi Smoke Test', 'Jl. Smoke No. 1, Surabaya',
    '6281234567890', 'info@smoketest.com', '@smoketest_cv',
    'Senin-Jumat 08:00-17:00', 'https://maps.google.com', 'https://example.com/logo.webp'
  )
  on conflict (user_id) do nothing;

  -- Bank account (show_in_catalog = true)
  insert into public.company_bank_accounts (user_id, bank_name, account_number, account_holder_name, show_in_catalog)
  values (v_user_id, 'Bank BCA Smoke', '1234567890', 'Konveksi Smoke', true)
  returning id into v_bank_acc_id;

  insert into smoke_catalog_vars values ('bank_acc_id', v_bank_acc_id::text);

  raise notice '=== DATA SETUP SELESAI ===';
end;
$$;

-- =========================================================================
-- TEST 1: Proteksi akses tabel langsung oleh role anon
-- =========================================================================
do $$
declare
  v_denied boolean;
begin
  -- Uji bahwa anon TIDAK bisa SELECT dari products langsung
  begin
    set local role anon;
    perform * from public.products limit 1;
    -- Jika sampai sini tanpa exception, berarti anon bisa akses → FAIL
    v_denied := false;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  reset role;
  perform _test_assert(
    'Test 1a: anon ditolak SELECT products',
    v_denied,
    'anon bisa SELECT products langsung — periksa RLS!'
  );
end;
$$;

do $$
declare v_denied boolean; begin
  begin set local role anon; perform * from public.orders limit 1; v_denied := false;
  exception when insufficient_privilege then v_denied := true; end;
  reset role;
  perform _test_assert('Test 1b: anon ditolak SELECT orders', v_denied,
    'anon bisa SELECT orders langsung — periksa RLS!');
end; $$;

do $$
declare v_denied boolean; begin
  begin set local role anon; perform * from public.product_images limit 1; v_denied := false;
  exception when insufficient_privilege then v_denied := true; end;
  reset role;
  perform _test_assert('Test 1c: anon ditolak SELECT product_images', v_denied,
    'anon bisa SELECT product_images langsung — periksa RLS!');
end; $$;

do $$
declare v_denied boolean; begin
  begin set local role anon; perform * from public.product_reviews limit 1; v_denied := false;
  exception when insufficient_privilege then v_denied := true; end;
  reset role;
  perform _test_assert('Test 1d: anon ditolak SELECT product_reviews', v_denied,
    'anon bisa SELECT product_reviews langsung — periksa RLS!');
end; $$;

do $$
declare v_denied boolean; begin
  begin set local role anon; perform * from public.review_invitations limit 1; v_denied := false;
  exception when insufficient_privilege then v_denied := true; end;
  reset role;
  perform _test_assert('Test 1e: anon ditolak SELECT review_invitations', v_denied,
    'anon bisa SELECT review_invitations langsung — periksa RLS!');
end; $$;

do $$
declare v_denied boolean; begin
  begin set local role anon; perform * from public.inquiries limit 1; v_denied := false;
  exception when insufficient_privilege then v_denied := true; end;
  reset role;
  perform _test_assert('Test 1f: anon ditolak SELECT inquiries', v_denied,
    'anon bisa SELECT inquiries langsung — periksa RLS!');
end; $$;

do $$
declare v_denied boolean; begin
  begin set local role anon; perform * from public.catalog_leads limit 1; v_denied := false;
  exception when insufficient_privilege then v_denied := true; end;
  reset role;
  perform _test_assert('Test 1g: anon ditolak SELECT catalog_leads', v_denied,
    'anon bisa SELECT catalog_leads langsung — periksa RLS!');
end; $$;

-- =========================================================================
-- TEST 2: Eksekusi RPC read baseline oleh role anon
-- =========================================================================
do $$
declare
  v_result   jsonb;
  v_cat_id   uuid;
  v_cat_name text;
  v_count    integer;
begin
  set local role anon;

  -- catalog_list_categories
  select id, name into v_cat_id, v_cat_name
  from public.catalog_list_categories()
  limit 1;

  reset role;

  perform _test_assert(
    'Test 2a: anon dapat memanggil catalog_list_categories',
    v_cat_id is not null,
    'catalog_list_categories tidak mengembalikan data'
  );
end;
$$;

do $$
declare
  v_id   uuid;
  v_name varchar;
  v_phone varchar;
begin
  set local role anon;

  select id, name, phone into v_id, v_name, v_phone
  from public.catalog_list_sales()
  limit 1;

  reset role;

  perform _test_assert(
    'Test 2b: anon dapat memanggil catalog_list_sales',
    v_id is not null,
    'catalog_list_sales tidak mengembalikan data'
  );
end;
$$;

-- =========================================================================
-- TEST 3: Whitelist & Filter Produk (catalog_list_products)
-- =========================================================================
do $$
declare
  v_result     jsonb;
  v_data       jsonb;
  v_prod_pub   uuid;
  v_prod_unpub uuid;
  v_count      integer;
  v_names      text;
begin
  v_prod_pub   := (select val from smoke_catalog_vars where key = 'prod_published')::uuid;
  v_prod_unpub := (select val from smoke_catalog_vars where key = 'prod_unpublished')::uuid;

  set local role anon;
  v_result := public.catalog_list_products();
  reset role;

  v_data  := v_result -> 'data';
  v_count := jsonb_array_length(v_data);

  perform _test_assert(
    'Test 3a: catalog_list_products mengembalikan minimal 1 produk',
    v_count >= 1,
    'Tidak ada produk dikembalikan: ' || v_result::text
  );

  -- Produk unpublished tidak boleh muncul
  perform _test_assert(
    'Test 3b: produk is_published=false tidak tampil',
    not exists (
      select 1 from jsonb_array_elements(v_data) as p
      where (p->>'id')::uuid = v_prod_unpub
    ),
    'Produk is_published=false muncul di hasil anon!'
  );

  -- Produk published harus muncul
  perform _test_assert(
    'Test 3c: produk is_published=true tampil',
    exists (
      select 1 from jsonb_array_elements(v_data) as p
      where (p->>'id')::uuid = v_prod_pub
    ),
    'Produk is_published=true tidak muncul!'
  );
end;
$$;

-- =========================================================================
-- TEST 4: Partial Unique Index — Hanya 1 foto utama per produk
-- =========================================================================
do $$
declare
  v_prod_pub uuid;
  v_user_id  uuid;
  v_rejected boolean := false;
begin
  v_prod_pub := (select val from smoke_catalog_vars where key = 'prod_published')::uuid;
  v_user_id  := (select val from smoke_catalog_vars where key = 'user_id')::uuid;

  begin
    insert into public.product_images (user_id, product_id, image_url, is_primary, sort_order)
    values (v_user_id, v_prod_pub, 'https://example.com/foto-duplikat-primary.webp', true, 99);
  exception when unique_violation then
    v_rejected := true;
  end;

  perform _test_assert(
    'Test 4: duplikat is_primary=true per produk ditolak (unique index)',
    v_rejected,
    'Duplikat foto utama berhasil disimpan — partial unique index tidak bekerja!'
  );
end;
$$;

-- =========================================================================
-- TEST 5: Opsi Kain, Penyesuaian Harga, & Fallback
-- =========================================================================
do $$
declare
  v_result       jsonb;
  v_prod_pub     uuid;
  v_prod_unpub   uuid;
  v_fabrics_pub  jsonb;
  v_fabrics_unp  jsonb;
  v_fab_count    integer;
  v_has_adj      boolean;
begin
  v_prod_pub   := (select val from smoke_catalog_vars where key = 'prod_published')::uuid;
  v_prod_unpub := (select val from smoke_catalog_vars where key = 'prod_unpublished')::uuid;

  set local role anon;
  v_result := public.catalog_list_products(null, null, null, 1, 50, null);
  reset role;

  -- Ambil fabrics produk published (pakai product_fabric_options)
  select elem->'fabrics'
  into   v_fabrics_pub
  from   jsonb_array_elements(v_result->'data') as elem
  where  (elem->>'id')::uuid = v_prod_pub
  limit 1;

  perform _test_assert(
    'Test 5a: fabrics produk published ada (product_fabric_options)',
    v_fabrics_pub is not null and jsonb_array_length(v_fabrics_pub) >= 1,
    'fabrics kosong untuk produk dengan product_fabric_options: ' || coalesce(v_fabrics_pub::text, 'NULL')
  );

  -- Pastikan price_adjustment ada di setiap fabric
  v_has_adj := true;
  for i in 0..jsonb_array_length(v_fabrics_pub) - 1 loop
    if (v_fabrics_pub->i->'price_adjustment') is null then
      v_has_adj := false;
    end if;
  end loop;

  perform _test_assert(
    'Test 5b: setiap fabric memiliki kolom price_adjustment',
    v_has_adj,
    'Ada fabric tanpa price_adjustment!'
  );

  -- weight_gsm harus ada di setidaknya 1 fabric (nagata punya weight_gsm=220)
  perform _test_assert(
    'Test 5c: weight_gsm tersedia di fabric catalog',
    exists (
      select 1 from jsonb_array_elements(v_fabrics_pub) as f
      where (f->>'weight_gsm') is not null and (f->>'weight_gsm')::integer > 0
    ),
    'Tidak ada fabric dengan weight_gsm!'
  );
end;
$$;

-- =========================================================================
-- TEST 6: Metadata Sales, Filter Katalog, & Slug Unik
-- =========================================================================
do $$
declare
  v_result        jsonb;
  v_sales_visible uuid;
  v_sales_hidden  uuid;
  v_row           record;
  v_visible_found boolean := false;
  v_hidden_found  boolean := false;
  v_rejected      boolean := false;
  v_user_id       uuid;
begin
  v_sales_visible := (select val from smoke_catalog_vars where key = 'sales_visible')::uuid;
  v_sales_hidden  := (select val from smoke_catalog_vars where key = 'sales_hidden')::uuid;
  v_user_id       := (select val from smoke_catalog_vars where key = 'user_id')::uuid;

  set local role anon;
  for v_row in select * from public.catalog_list_sales() loop
    if v_row.id = v_sales_visible then v_visible_found := true; end if;
    if v_row.id = v_sales_hidden  then v_hidden_found  := true; end if;
  end loop;
  reset role;

  perform _test_assert(
    'Test 6a: sales show_in_catalog=true tampil di catalog_list_sales',
    v_visible_found,
    'Sales visible tidak ditemukan dalam hasil RPC!'
  );

  perform _test_assert(
    'Test 6b: sales show_in_catalog=false tidak tampil',
    not v_hidden_found,
    'Sales hidden muncul dalam hasil RPC!'
  );

  -- Uji slug unik: mencoba insert slug duplikat harus ditolak
  begin
    insert into public.sales (user_id, name, phone, is_active, show_in_catalog, slug)
    values (v_user_id, 'Duplikat Slug Sales', '081111111111', true, true, 'budi-smoke');
  exception when unique_violation then
    v_rejected := true;
  end;

  perform _test_assert(
    'Test 6c: slug duplikat sales ditolak (unique index)',
    v_rejected,
    'Slug duplikat berhasil disimpan — unique index tidak bekerja!'
  );

  -- Uji kolom slug tersedia di catalog_list_sales
  perform _test_assert(
    'Test 6d: catalog_list_sales mengembalikan kolom slug & photo_url',
    exists (
      select 1 from public.catalog_list_sales()
      where id = v_sales_visible and slug = 'budi-smoke' and photo_url is not null
    ),
    'Kolom slug atau photo_url tidak dikembalikan di catalog_list_sales!'
  );
end;
$$;

-- =========================================================================
-- TEST 7: Generator Undangan Ulasan & Hash Token (authenticated)
-- =========================================================================
do $$
declare
  v_user_id       uuid;
  v_order_comp    uuid;
  v_order_queued  uuid;
  v_result        jsonb;
  v_token         text;
  v_hash_stored   text;
  v_hash_computed text;
  v_rejected      boolean := false;
begin
  v_user_id      := (select val from smoke_catalog_vars where key = 'user_id')::uuid;
  v_order_comp   := (select val from smoke_catalog_vars where key = 'order_completed')::uuid;
  v_order_queued := (select val from smoke_catalog_vars where key = 'order_queued')::uuid;

  -- Set role authenticated dengan user_id owner
  set local role authenticated;
  set local "request.jwt.claims" to '{"sub": "' || v_user_id || '", "role": "authenticated"}';

  v_result := public.create_review_invitation(v_order_comp);
  reset role;

  perform _test_assert(
    'Test 7a: create_review_invitation berhasil untuk order completed',
    (v_result->>'invitation_id') is not null and (v_result->>'token') is not null,
    'create_review_invitation gagal: ' || coalesce(v_result::text, 'NULL')
  );

  -- Pastikan token disimpan sebagai hash SHA-256
  v_token := v_result->>'token';
  v_hash_computed := encode(sha256(v_token::bytea), 'hex');

  perform _test_assert(
    'Test 7b: token tersimpan dalam hash SHA-256 di database',
    exists (
      select 1 from public.review_invitations
      where token_hash = v_hash_computed
        and used_at is null
        and expires_at > now()
    ),
    'Token tidak ditemukan dalam bentuk hash di review_invitations!'
  );

  -- Simpan token baru ini untuk uji lebih lanjut (Test 8 & 9)
  insert into smoke_catalog_vars values ('new_inv_token', v_token)
  on conflict (key) do update set val = excluded.val;
end;
$$;

-- =========================================================================
-- TEST 8: Validasi Form Ulasan Publik (catalog_get_review_form)
-- =========================================================================
do $$
declare
  v_token       text;
  v_result      jsonb;
  v_prod_pub    uuid;
  v_expired_res jsonb;
  v_wrong_res   jsonb;
begin
  v_token    := (select val from smoke_catalog_vars where key = 'inv_token');
  v_prod_pub := (select val from smoke_catalog_vars where key = 'prod_published')::uuid;

  set local role anon;

  -- Token valid
  v_result := public.catalog_get_review_form(v_token);
  perform _test_assert(
    'Test 8a: token valid mengembalikan valid=true',
    (v_result->>'valid')::boolean = true,
    'Token valid gagal: ' || coalesce(v_result::text, 'NULL')
  );

  -- Daftar produk dikembalikan
  perform _test_assert(
    'Test 8b: catalog_get_review_form mengembalikan daftar produk',
    jsonb_array_length(v_result->'products') >= 1,
    'Daftar produk kosong: ' || coalesce(v_result::text, 'NULL')
  );

  -- Token salah
  v_wrong_res := public.catalog_get_review_form('token-acak-salah-bukan-hex-valid');
  perform _test_assert(
    'Test 8c: token salah mengembalikan valid=false',
    (v_wrong_res->>'valid')::boolean = false,
    'Token salah tidak menghasilkan valid=false!'
  );

  reset role;
end;
$$;

-- =========================================================================
-- TEST 9: Pengiriman Ulasan (catalog_submit_review)
-- =========================================================================
do $$
declare
  v_token       text;
  v_prod_pub    uuid;
  v_result      jsonb;
  v_dup_result  jsonb;
  v_used_at_set boolean;
begin
  v_token    := (select val from smoke_catalog_vars where key = 'inv_token');
  v_prod_pub := (select val from smoke_catalog_vars where key = 'prod_published')::uuid;

  set local role anon;

  -- Submit ulasan pertama kali
  v_result := public.catalog_submit_review(
    v_token, v_prod_pub, 5, 'Pelanggan Smoke', 'Produk sangat bagus dan berkualitas!'
  );

  perform _test_assert(
    'Test 9a: submit review berhasil',
    (v_result->>'success')::boolean = true,
    'submit review gagal: ' || coalesce(v_result::text, 'NULL')
  );

  reset role;

  -- Pastikan ulasan tersimpan dengan status pending
  perform _test_assert(
    'Test 9b: ulasan tersimpan dengan status pending',
    exists (
      select 1 from public.product_reviews
      where product_id = v_prod_pub and status = 'pending' and reviewer_name = 'Pelanggan Smoke'
    ),
    'Ulasan tidak ditemukan atau bukan pending!'
  );

  -- Pastikan token ditandai used_at
  perform _test_assert(
    'Test 9c: token ditandai used_at setelah submit',
    exists (
      select 1 from public.review_invitations
      where token_hash = encode(sha256(v_token::bytea), 'hex')
        and used_at is not null
    ),
    'Token tidak ditandai used_at setelah submit!'
  );

  set local role anon;
  -- Percobaan kedua dengan token yang sama harus gagal (token sudah terpakai)
  v_dup_result := public.catalog_submit_review(
    v_token, v_prod_pub, 4, 'Pelanggan Smoke', 'Review kedua pakai token sama'
  );
  reset role;

  perform _test_assert(
    'Test 9d: token sudah dipakai ditolak pada submit kedua',
    (v_dup_result->>'success')::boolean = false,
    'Token terpakai masih bisa dipakai untuk submit ulasan!'
  );
end;
$$;

-- =========================================================================
-- TEST 10: Tampilan Ulasan Publik (catalog_list_reviews)
-- =========================================================================
do $$
declare
  v_prod_pub  uuid;
  v_user_id   uuid;
  v_result    jsonb;
  v_data      jsonb;
begin
  v_prod_pub := (select val from smoke_catalog_vars where key = 'prod_published')::uuid;
  v_user_id  := (select val from smoke_catalog_vars where key = 'user_id')::uuid;

  -- Ulasan berstatus pending (dari Test 9) tidak boleh muncul
  set local role anon;
  v_result := public.catalog_list_reviews(v_prod_pub);
  reset role;

  v_data := v_result -> 'data';

  perform _test_assert(
    'Test 10a: ulasan pending tidak tampil di catalog_list_reviews',
    jsonb_array_length(v_data) = 0,
    'Ulasan pending muncul di katalog publik!'
  );

  -- Approve ulasan, lalu cek masking nama
  update public.product_reviews
     set status = 'approved', moderated_at = now()
   where product_id = v_prod_pub and reviewer_name = 'Pelanggan Smoke';

  set local role anon;
  v_result := public.catalog_list_reviews(v_prod_pub);
  reset role;

  v_data := v_result -> 'data';

  perform _test_assert(
    'Test 10b: ulasan approved tampil setelah disetujui',
    jsonb_array_length(v_data) >= 1,
    'Ulasan approved tidak muncul!'
  );

  -- Cek masking nama (harus ada titik di nama)
  perform _test_assert(
    'Test 10c: nama reviewer dimasking (format "Nama I.")',
    exists (
      select 1 from jsonb_array_elements(v_data) as r
      where (r->>'reviewer_name') like '% _.' or (r->>'reviewer_name') like '% %.'
    ),
    'Nama reviewer tidak dimasking: ' || (v_data->0->>'reviewer_name')
  );
end;
$$;

-- =========================================================================
-- TEST 11: Metrik sold_count & Agregasi Rating
-- =========================================================================
do $$
declare
  v_result   jsonb;
  v_data     jsonb;
  v_prod_pub uuid;
  v_prod_row jsonb;
  v_sold     integer;
  v_rating   numeric;
  v_rev_cnt  integer;
begin
  v_prod_pub := (select val from smoke_catalog_vars where key = 'prod_published')::uuid;

  set local role anon;
  v_result := public.catalog_list_products();
  reset role;

  v_data := v_result -> 'data';

  select elem into v_prod_row
  from   jsonb_array_elements(v_data) as elem
  where  (elem->>'id')::uuid = v_prod_pub
  limit  1;

  v_sold    := (v_prod_row->>'sold_count')::integer;
  v_rating  := (v_prod_row->>'rating')::numeric;
  v_rev_cnt := (v_prod_row->>'review_count')::integer;

  -- Order completed memiliki qty=10, jadi sold_count harus = 10
  perform _test_assert(
    'Test 11a: sold_count = 10 (dari order completed)',
    v_sold = 10,
    'sold_count salah: ' || v_sold
  );

  -- Rating harus = 5.0 (satu ulasan approved dengan rating 5)
  perform _test_assert(
    'Test 11b: rating = 5.0',
    v_rating = 5.0,
    'rating salah: ' || v_rating
  );

  -- Review count harus = 1
  perform _test_assert(
    'Test 11c: review_count = 1',
    v_rev_cnt = 1,
    'review_count salah: ' || v_rev_cnt
  );
end;
$$;

-- =========================================================================
-- TEST 12: Profil Perusahaan Publik & Whitelist Rekening
-- =========================================================================
do $$
declare
  v_result  jsonb;
  v_banks   jsonb;
begin
  set local role anon;
  v_result := public.catalog_get_company_info();
  reset role;

  perform _test_assert(
    'Test 12a: catalog_get_company_info mengembalikan data',
    v_result is not null and (v_result->>'name') is not null,
    'catalog_get_company_info null atau name kosong: ' || coalesce(v_result::text, 'NULL')
  );

  perform _test_assert(
    'Test 12b: nama perusahaan benar',
    v_result->>'name' = 'Konveksi Smoke Test',
    'nama perusahaan salah: ' || coalesce(v_result->>'name', 'NULL')
  );

  -- Pastikan ada rekening bank publik
  v_banks := v_result -> 'bank_accounts';
  perform _test_assert(
    'Test 12c: rekening show_in_catalog=true dikembalikan',
    jsonb_array_length(v_banks) >= 1,
    'Rekening bank publik tidak ada!'
  );

  -- Pastikan tidak ada kolom saldo awal/internal yang bocor
  perform _test_assert(
    'Test 12d: tidak ada kolom sensitif (saldo, opening_balance) di respons',
    v_result->>'opening_balance' is null
      and v_result->>'initial_balance' is null,
    'Kolom sensitif bocor di catalog_get_company_info!'
  );
end;
$$;

-- =========================================================================
-- TEST 13: Pelacakan Pesanan Publik & Proteksi Brute-Force
-- =========================================================================
do $$
declare
  v_order_comp  uuid;
  v_order_queued uuid;
  v_track_code  text;
  v_result      jsonb;
  v_result_wrong jsonb;
  v_result_miss  jsonb;
begin
  v_order_comp  := (select val from smoke_catalog_vars where key = 'order_completed')::uuid;
  v_order_queued := (select val from smoke_catalog_vars where key = 'order_queued')::uuid;

  -- Ambil tracking_code yang dihasilkan trigger
  select tracking_code into v_track_code from public.orders where id = v_order_comp;

  set local role anon;

  -- Kode benar + 4 digit HP benar (081234567890 → last 4 = 7890)
  v_result := public.catalog_track_order(v_track_code, '7890');

  perform _test_assert(
    'Test 13a: tracking dengan kode & 4 digit HP benar → found=true',
    (v_result->>'found')::boolean = true,
    'Tracking benar tidak ditemukan: ' || coalesce(v_result::text, 'NULL')
  );

  -- Pastikan status produksi dikembalikan dalam bahasa Indonesia
  perform _test_assert(
    'Test 13b: status_label dalam bahasa Indonesia',
    v_result->>'status_label' = 'Selesai',
    'status_label salah: ' || coalesce(v_result->>'status_label', 'NULL')
  );

  -- Pastikan data sensitif tidak bocor (customer_name, nominal rupiah, dll)
  perform _test_assert(
    'Test 13c: tidak ada kolom sensitif di respons track_order',
    v_result->>'customer_name' is null
      and v_result->>'total_amount' is null
      and v_result->>'order_number' is null,
    'Kolom sensitif bocor di catalog_track_order!'
  );

  -- Kode benar + 4 digit HP SALAH → respons seragam
  v_result_wrong := public.catalog_track_order(v_track_code, '0000');
  perform _test_assert(
    'Test 13d: 4 digit HP salah → found=false, pesan seragam',
    (v_result_wrong->>'found')::boolean = false
      and v_result_wrong->>'message' = 'Pesanan tidak ditemukan atau data verifikasi tidak cocok',
    'Respons HP salah tidak seragam: ' || coalesce(v_result_wrong::text, 'NULL')
  );

  -- Kode tracking salah → respons seragam
  v_result_miss := public.catalog_track_order('TIDAKADA', '7890');
  perform _test_assert(
    'Test 13e: kode tracking salah → found=false, pesan seragam',
    (v_result_miss->>'found')::boolean = false
      and v_result_miss->>'message' = 'Pesanan tidak ditemukan atau data verifikasi tidak cocok',
    'Respons kode salah tidak seragam: ' || coalesce(v_result_miss::text, 'NULL')
  );

  reset role;
end;
$$;

-- =========================================================================
-- TEST 14: Form Kontak & Proteksi Honeypot
-- =========================================================================
do $$
declare
  v_result     jsonb;
  v_bot_result jsonb;
  v_bad_email  jsonb;
  v_count_before integer;
  v_count_after  integer;
begin
  select count(*)::integer into v_count_before from public.inquiries;

  set local role anon;

  -- Pengiriman bot (honeypot terisi) → sukses palsu tanpa menyimpan
  v_bot_result := public.catalog_submit_inquiry(
    'Bot Name', 'bot@bot.com', 'Test', 'Pesan bot', 'isi honeypot'
  );

  reset role;

  select count(*)::integer into v_count_after from public.inquiries;

  perform _test_assert(
    'Test 14a: honeypot terisi → RPC return sukses tapi tidak menyimpan ke DB',
    (v_bot_result->>'success')::boolean = true and v_count_after = v_count_before,
    'Honeypot gagal — data bot masuk ke database!'
  );

  set local role anon;

  -- Pengiriman valid
  v_result := public.catalog_submit_inquiry(
    'Pelanggan Nyata', 'pelanggan@test.com', 'Info Harga',
    'Saya ingin tanya tentang harga kaos polos', null
  );

  reset role;

  perform _test_assert(
    'Test 14b: inquiry valid berhasil disimpan',
    (v_result->>'success')::boolean = true
      and exists (
        select 1 from public.inquiries
        where email = 'pelanggan@test.com' and status = 'new'
      ),
    'Inquiry valid tidak tersimpan: ' || coalesce(v_result::text, 'NULL')
  );

  set local role anon;

  -- Email format salah
  v_bad_email := public.catalog_submit_inquiry(
    'Nama Valid', 'ini-bukan-email', null, 'Pesan dengan email salah', null
  );

  reset role;

  perform _test_assert(
    'Test 14c: email format salah ditolak',
    (v_bad_email->>'success')::boolean = false,
    'Email salah format berhasil masuk!'
  );
end;
$$;

-- =========================================================================
-- TEST 15: Pencatatan Lead WhatsApp (catalog_log_lead)
-- =========================================================================
do $$
declare
  v_prod_pub    uuid;
  v_sales_vis   uuid;
  v_mat_nagata  uuid;
  v_result      jsonb;
  v_count       integer;
begin
  v_prod_pub   := (select val from smoke_catalog_vars where key = 'prod_published')::uuid;
  v_sales_vis  := (select val from smoke_catalog_vars where key = 'sales_visible')::uuid;
  v_mat_nagata := (select val from smoke_catalog_vars where key = 'mat_nagata')::uuid;

  set local role anon;

  v_result := public.catalog_log_lead(
    v_sales_vis, v_prod_pub, v_mat_nagata, 'Hitam', 50, 'whatsapp_button'
  );

  reset role;

  perform _test_assert(
    'Test 15a: catalog_log_lead berhasil merekam klik',
    (v_result->>'success')::boolean = true,
    'catalog_log_lead gagal: ' || coalesce(v_result::text, 'NULL')
  );

  -- Pastikan tersimpan di database tanpa data PII invasif (tidak ada nama/email)
  select count(*)::integer into v_count
  from public.catalog_leads
  where product_id = v_prod_pub
    and sales_id   = v_sales_vis
    and color_name = 'Hitam'
    and estimated_qty = 50
    and source = 'whatsapp_button';

  perform _test_assert(
    'Test 15b: lead tersimpan dengan konteks yang benar',
    v_count = 1,
    'Lead tidak ditemukan di catalog_leads!'
  );
end;
$$;

-- =========================================================================
-- RINGKASAN AKHIR
-- =========================================================================
do $$
begin
  raise notice '';
  raise notice '============================================================';
  raise notice '  Smoke Test Catalog Selesai — Periksa baris PASS/FAIL di atas';
  raise notice '  Jika seluruh baris menunjukkan PASS, migration siap ke remote.';
  raise notice '============================================================';
end;
$$;

-- Cleanup helper
drop function if exists _test_assert(text, boolean, text);
drop table if exists smoke_catalog_vars;
