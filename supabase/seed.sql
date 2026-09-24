-- =========================================================================
-- SIKon — SEED (data contoh untuk SEMUA tabel, saling terhubung)
-- =========================================================================
-- Jalankan SETELAH ke-5 file migration di supabase/migrations/.
-- Idempotent secara garis besar (akun owner & master data pakai "where not
-- exists"), TAPI transaksi/order dibuat baru tiap dijalankan kalau sudah ada
-- (tidak dicek duplikat) — jalankan clear.sql dulu kalau mau seed ulang bersih.
-- =========================================================================

do $$
declare
  v_user_id uuid;

  -- Master data: kategori
  v_cat_kemeja uuid; v_cat_celana uuid;
  v_matcat_kain uuid; v_matcat_kancing uuid; v_matcat_resleting uuid; v_matcat_benang uuid;

  -- Master data: material & warna
  v_mat_nagata uuid; v_mat_american uuid; v_mat_kancing uuid; v_mat_resleting uuid; v_mat_benang uuid;
  v_color_nagata_hitam uuid; v_color_nagata_navy uuid; v_color_american_abu uuid;

  -- Master data: product & BOM
  v_prod_kemeja uuid; v_prod_celana uuid;
  v_slot_kemeja uuid; v_slot_celana uuid;

  -- Master data: sales & staff
  v_sales_budi uuid; v_sales_siti uuid;
  v_staff_budi uuid; v_staff_andi uuid; v_staff_joko uuid; v_staff_dedi uuid; v_staff_rina uuid;

  -- Kategori transaksi (income/expense) yang relevan buat seed ini
  v_txcat_penjualan uuid; v_txcat_bayar_order uuid; v_txcat_uang_muka uuid; v_txcat_gaji uuid; v_txcat_operasional uuid;
  v_txcat_beli_kancing uuid; v_txcat_beli_benang uuid; v_txcat_beli_kain uuid;

  -- Order & transaksi
  v_order1 uuid; v_order2 uuid;
  v_item1 uuid; v_item2 uuid;
  v_trx1 uuid; v_trx2 uuid; v_trx3 uuid;

  -- Purchasing
  v_advance1 uuid; v_report1 uuid; v_supplier_purchase1 uuid;

  -- Payroll
  v_payroll1 uuid;
begin
  -- =======================================================================
  -- 0. AKUN OWNER (sama seperti sebelumnya, idempotent)
  -- =======================================================================
  if not exists (select 1 from auth.users where email = 'owner@sikon.com') then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      'owner@sikon.com', crypt('password123', gen_salt('bf')), now(), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"Owner SIKon"}',
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user_id::text, v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', 'owner@sikon.com'), 'email', now(), now(), now());
  else
    select id into v_user_id from auth.users where email = 'owner@sikon.com';
  end if;

  -- =======================================================================
  -- 1. KATEGORI TRANSAKSI (income/expense)
  -- =======================================================================
  insert into public.transaction_categories (user_id, name, type)
  select v_user_id, c.name, c.type
  from (values
    ('Penjualan', 'income'), ('Jasa / Konsultasi', 'income'), ('Investasi', 'income'),
    ('Pendapatan Lain', 'income'), ('Pembayaran Order', 'income'), ('Uang Muka Purchasing', 'expense'),
    ('Gaji Karyawan', 'expense'), ('Operasional', 'expense'), ('Sewa Tempat', 'expense'),
    ('Marketing', 'expense'), ('Utilitas', 'expense'), ('Lain-lain', 'expense'),
    ('Pembelian Kancing', 'expense'), ('Pembelian Benang', 'expense'), ('Pembelian Kain', 'expense')
  ) as c(name, type)
  where not exists (select 1 from public.transaction_categories e where e.user_id = v_user_id and e.name = c.name);

  select id into v_txcat_penjualan from public.transaction_categories where user_id = v_user_id and name = 'Penjualan';
  select id into v_txcat_bayar_order from public.transaction_categories where user_id = v_user_id and name = 'Pembayaran Order';
  select id into v_txcat_uang_muka from public.transaction_categories where user_id = v_user_id and name = 'Uang Muka Purchasing';
  select id into v_txcat_gaji from public.transaction_categories where user_id = v_user_id and name = 'Gaji Karyawan';
  select id into v_txcat_operasional from public.transaction_categories where user_id = v_user_id and name = 'Operasional';
  select id into v_txcat_beli_kancing from public.transaction_categories where user_id = v_user_id and name = 'Pembelian Kancing';
  select id into v_txcat_beli_benang from public.transaction_categories where user_id = v_user_id and name = 'Pembelian Benang';
  select id into v_txcat_beli_kain from public.transaction_categories where user_id = v_user_id and name = 'Pembelian Kain';

  insert into public.company_settings (user_id, saldo_awal, company_name, address, phone)
  values (v_user_id, 5000000, 'SIKon Konveksi', 'Jl. Industri Konveksi No. 1, Bandung', '081234567890')
  on conflict (user_id) do nothing;

  insert into public.company_bank_accounts (user_id, bank_name, account_number, account_holder_name, is_primary)
  values
    (v_user_id, 'BCA', '1234567890', 'SIKon Konveksi', true),
    (v_user_id, 'Mandiri', '0987654321', 'SIKon Konveksi', false);

  -- =======================================================================
  -- 2. MASTER DATA PRODUCT & MATERIAL
  -- =======================================================================
  insert into public.product_categories (user_id, name) values
    (v_user_id, 'Kemeja'), (v_user_id, 'Celana'), (v_user_id, 'Rompi')
  returning id into v_cat_kemeja; -- ambil id baris pertama saja sementara, di-select ulang di bawah
  select id into v_cat_kemeja from public.product_categories where user_id = v_user_id and name = 'Kemeja';
  select id into v_cat_celana from public.product_categories where user_id = v_user_id and name = 'Celana';

  insert into public.material_categories (user_id, name, is_fabric) values
    (v_user_id, 'Kain', true), (v_user_id, 'Kancing', false),
    (v_user_id, 'Resleting', false), (v_user_id, 'Benang', false);
  select id into v_matcat_kain from public.material_categories where user_id = v_user_id and name = 'Kain';
  select id into v_matcat_kancing from public.material_categories where user_id = v_user_id and name = 'Kancing';
  select id into v_matcat_resleting from public.material_categories where user_id = v_user_id and name = 'Resleting';
  select id into v_matcat_benang from public.material_categories where user_id = v_user_id and name = 'Benang';

  insert into public.materials (user_id, category_id, name, unit, price, stock_qty, minimum_stock, composition, care_instruction, description)
  values
    (v_user_id, v_matcat_kain, 'Nagata Drill', 'meter', 45000, 0, 20,
     '80% Cotton, 20% Polyester', 'Jangan disikat kasar, setrika suhu sedang', 'Kain drill standar untuk seragam kerja'),
    (v_user_id, v_matcat_kain, 'American Drill', 'meter', 55000, 0, 15,
     '100% Cotton', 'Cuci dengan air dingin, jangan diperas', 'Kain drill premium, lebih tebal dan halus')
  returning id into v_mat_nagata;
  select id into v_mat_nagata from public.materials where user_id = v_user_id and name = 'Nagata Drill';
  select id into v_mat_american from public.materials where user_id = v_user_id and name = 'American Drill';

  insert into public.materials (user_id, category_id, name, unit, price, stock_qty, minimum_stock)
  values
    (v_user_id, v_matcat_kancing, 'Kancing Jepret 15mm', 'pcs', 500, 2000, 200),
    (v_user_id, v_matcat_resleting, 'Resleting YKK No.5', 'pcs', 3500, 300, 50),
    (v_user_id, v_matcat_benang, 'Benang Jahit Polyester', 'roll', 8000, 150, 30);
  select id into v_mat_kancing from public.materials where user_id = v_user_id and name = 'Kancing Jepret 15mm';
  select id into v_mat_resleting from public.materials where user_id = v_user_id and name = 'Resleting YKK No.5';
  select id into v_mat_benang from public.materials where user_id = v_user_id and name = 'Benang Jahit Polyester';

  insert into public.material_colors (user_id, material_id, color_name, color_code, stock_qty, minimum_stock) values
    (v_user_id, v_mat_nagata, 'Hitam', '#1a1a1a', 40, 10),
    (v_user_id, v_mat_nagata, 'Navy', '#1b2a4a', 35, 10),
    (v_user_id, v_mat_american, 'Abu-abu', '#808080', 25, 10);
  select id into v_color_nagata_hitam from public.material_colors where material_id = v_mat_nagata and color_name = 'Hitam';
  select id into v_color_nagata_navy from public.material_colors where material_id = v_mat_nagata and color_name = 'Navy';
  select id into v_color_american_abu from public.material_colors where material_id = v_mat_american and color_name = 'Abu-abu';

  insert into public.products (user_id, category_id, name, description, sewing_cost_per_pcs, cutting_cost_per_pcs, default_price, sales_bonus_per_pcs)
  values
    (v_user_id, v_cat_kemeja, 'Kemeja Series 1', 'Kemeja lengan panjang, model formal', 15000, 8000, 150000, 5000),
    (v_user_id, v_cat_celana, 'Celana Series 1', 'Celana kerja panjang, bahan drill', 20000, 10000, 180000, 7000);
  select id into v_prod_kemeja from public.products where user_id = v_user_id and name = 'Kemeja Series 1';
  select id into v_prod_celana from public.products where user_id = v_user_id and name = 'Celana Series 1';

  insert into public.product_materials (user_id, product_id, material_id, quantity) values
    (v_user_id, v_prod_kemeja, v_mat_kancing, 7),
    (v_user_id, v_prod_kemeja, v_mat_benang, 1),
    (v_user_id, v_prod_celana, v_mat_resleting, 1),
    (v_user_id, v_prod_celana, v_mat_benang, 1);

  insert into public.product_fabric_slots (user_id, product_id, fabric_category_id, label, usage_qty, unit) values
    (v_user_id, v_prod_kemeja, v_matcat_kain, 'Kain Utama', 1.5, 'meter')
  returning id into v_slot_kemeja;
  insert into public.product_fabric_slots (user_id, product_id, fabric_category_id, label, usage_qty, unit) values
    (v_user_id, v_prod_celana, v_matcat_kain, 'Kain Utama', 1.2, 'meter')
  returning id into v_slot_celana;

  -- =======================================================================
  -- 3. SALES & STAFF
  -- =======================================================================
  insert into public.sales (user_id, name, phone, is_active) values
    (v_user_id, 'Budi Santoso', '081111111111', true),
    (v_user_id, 'Siti Aminah', '082222222222', true);
  select id into v_sales_budi from public.sales where user_id = v_user_id and name = 'Budi Santoso';
  select id into v_sales_siti from public.sales where user_id = v_user_id and name = 'Siti Aminah';

  insert into public.staff (user_id, name, phone, role, wage_type, daily_rate, sales_id) values
    (v_user_id, 'Budi Santoso', '081111111111', 'Sales', 'sales', 75000, v_sales_budi)
  returning id into v_staff_budi;

  insert into public.staff (user_id, name, phone, role, wage_type, daily_rate) values
    (v_user_id, 'Andi Wijaya', '083333333333', 'Purchasing', 'attendance', 100000)
  returning id into v_staff_andi;
  insert into public.staff (user_id, name, phone, role, wage_type, daily_rate) values
    (v_user_id, 'Joko Prasetyo', '084444444444', 'Gudang', 'attendance', 100000)
  returning id into v_staff_joko;
  insert into public.staff (user_id, name, phone, role, wage_type, daily_rate) values
    (v_user_id, 'Dedi Kurniawan', '085555555555', 'Penjahit', 'piecework', 0)
  returning id into v_staff_dedi;
  insert into public.staff (user_id, name, phone, role, wage_type, daily_rate) values
    (v_user_id, 'Rina Marlina', '086666666666', 'Tukang Potong', 'piecework', 0)
  returning id into v_staff_rina;

  -- =======================================================================
  -- 4. ORDER (2 contoh: 1 lunas selesai, 1 belum lunas masih produksi)
  -- =======================================================================
  insert into public.orders (user_id, sales_id, customer_name, ongkir, status, production_status, bonus_paid, order_date)
  values (v_user_id, v_sales_budi, 'PT Maju Jaya', 50000, 'belum_lunas', 'production', false, current_date - 10)
  returning id into v_order1;
  insert into public.orders (user_id, sales_id, customer_name, ongkir, status, production_status, bonus_paid, order_date)
  values (v_user_id, v_sales_siti, 'Toko Sinar Abadi', 30000, 'belum_lunas', 'production', false, current_date - 3)
  returning id into v_order2;

  insert into public.order_items (order_id, user_id, product_id, category_id, name_item, qty, price, ready_for_sewing_at)
  values (v_order1, v_user_id, v_prod_kemeja, v_cat_kemeja, 'Kemeja Series 1', 10, 150000, now())
  returning id into v_item1;
  insert into public.order_items (order_id, user_id, product_id, category_id, name_item, qty, price, ready_for_sewing_at)
  values (v_order2, v_user_id, v_prod_celana, v_cat_celana, 'Celana Series 1', 5, 180000, now())
  returning id into v_item2;

  -- Snapshot HPP (dihitung manual di sini, mencerminkan cara frontend menghitung)
  update public.order_items set
    hpp_per_unit_snapshot = 15000 + 8000 + (7 * 500) + (1 * 8000) + (1.5 * 45000),
    hpp_total_snapshot = (15000 + 8000 + (7 * 500) + (1 * 8000) + (1.5 * 45000)) * 10
  where id = v_item1;
  update public.order_items set
    hpp_per_unit_snapshot = 20000 + 10000 + (1 * 3500) + (1 * 8000) + (1.2 * 55000),
    hpp_total_snapshot = (20000 + 10000 + (1 * 3500) + (1 * 8000) + (1.2 * 55000)) * 5
  where id = v_item2;

  insert into public.order_item_fabrics (user_id, order_item_id, product_fabric_slot_id, material_id, material_color_id, usage_qty_snapshot, price_snapshot, line_cost_snapshot)
  values (v_user_id, v_item1, v_slot_kemeja, v_mat_nagata, v_color_nagata_hitam, 1.5, 45000, 1.5 * 45000 * 10);
  insert into public.order_item_fabrics (user_id, order_item_id, product_fabric_slot_id, material_id, material_color_id, usage_qty_snapshot, price_snapshot, line_cost_snapshot)
  values (v_user_id, v_item2, v_slot_celana, v_mat_american, v_color_american_abu, 1.2, 55000, 1.2 * 55000 * 5);

  -- Pembayaran: order1 DP 50%, order2 DP 30% (insert manual, RPC record_order_payment
  -- butuh sesi auth.uid() yang tidak tersedia saat seed dijalankan lewat SQL editor)
  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description, order_id)
  values (v_user_id, v_txcat_bayar_order, 'DP Order ' || (select order_id from public.orders where id = v_order1) || ' - PT Maju Jaya',
          750000, 'income', current_date - 8, 'Otomatis dari pembayaran order (seed)', v_order1)
  returning id into v_trx1;
  insert into public.order_payments (order_id, user_id, amount, payment_type, payment_method, payment_date, transaction_id)
  values (v_order1, v_user_id, 750000, 'dp', 'transfer', current_date - 8, v_trx1);

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description, order_id)
  values (v_user_id, v_txcat_bayar_order, 'DP Order ' || (select order_id from public.orders where id = v_order2) || ' - Toko Sinar Abadi',
          270000, 'income', current_date - 2, 'Otomatis dari pembayaran order (seed)', v_order2)
  returning id into v_trx2;
  insert into public.order_payments (order_id, user_id, amount, payment_type, payment_method, payment_date, transaction_id)
  values (v_order2, v_user_id, 270000, 'dp', 'cash', current_date - 2, v_trx2);

  -- Transaksi operasional biasa (tidak terkait order)
  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (v_user_id, v_txcat_operasional, 'Listrik & Air Bulan Ini', 850000, 'expense', current_date - 5, 'Tagihan bulanan')
  returning id into v_trx3;

  -- =======================================================================
  -- 5. WAREHOUSE: stok awal (movement 'in' langsung confirmed)
  -- =======================================================================
  insert into public.stock_movements (user_id, material_id, material_color_id, movement_type, qty, unit, status, source_type, notes, confirmed_at) values
    (v_user_id, v_mat_nagata, v_color_nagata_hitam, 'in', 40, 'meter', 'confirmed', 'initial', 'Stok awal (seed)', now()),
    (v_user_id, v_mat_nagata, v_color_nagata_navy, 'in', 35, 'meter', 'confirmed', 'initial', 'Stok awal (seed)', now()),
    (v_user_id, v_mat_american, v_color_american_abu, 'in', 25, 'meter', 'confirmed', 'initial', 'Stok awal (seed)', now()),
    (v_user_id, v_mat_kancing, null, 'in', 2000, 'pcs', 'confirmed', 'initial', 'Stok awal (seed)', now()),
    (v_user_id, v_mat_resleting, null, 'in', 300, 'pcs', 'confirmed', 'initial', 'Stok awal (seed)', now());

  -- Contoh stock request yang masih pending (belum diproses Finance)
  insert into public.stock_requests (user_id, requested_by, material_id, quantity_needed, unit, reason, status)
  values (v_user_id, v_staff_joko, v_mat_benang, 50, 'roll', 'Stok benang menipis, sisa di bawah minimum', 'pending');

  -- =======================================================================
  -- 6. PURCHASING: contoh SPJ (submitted, siap di-approve user) + Supplier Purchase (ordered)
  -- =======================================================================
  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (v_user_id, v_txcat_uang_muka, 'Uang Muka - Andi Wijaya', 500000, 'expense', current_date - 2, 'Uang muka belanja bahan (seed)')
  returning id into v_advance1;
  insert into public.cash_advances (user_id, staff_id, amount, purpose, date_given, status, transaction_id)
  values (v_user_id, v_staff_andi, 500000, 'Belanja kancing & benang', current_date - 2, 'outstanding', v_advance1)
  returning id into v_report1; -- reuse var sementara buat nampung id cash_advance
  -- (v_report1 sekarang berisi id cash_advance, dipakai di bawah lalu ditimpa jadi id purchasing_report)

  insert into public.purchasing_reports (user_id, staff_id, cash_advance_id, report_date, status, notes)
  values (v_user_id, v_staff_andi, v_report1, current_date - 1, 'submitted', 'Belanja kancing & benang tambahan')
  returning id into v_report1;

  insert into public.purchasing_report_items (user_id, report_id, material_id, category_id, description, supplier_name, quantity, unit, unit_price, total_price)
  values
    (v_user_id, v_report1, v_mat_kancing, v_txcat_beli_kancing, 'Kancing Jepret 15mm', 'Toko Aksesoris Jaya', 500, 'pcs', 550, 275000),
    (v_user_id, v_report1, v_mat_benang, v_txcat_beli_benang, 'Benang Jahit Polyester', 'Toko Aksesoris Jaya', 25, 'roll', 8500, 212500);

  insert into public.supplier_purchases (user_id, requested_by, supplier_name, payment_date, status)
  values (v_user_id, v_staff_joko, 'CV Tekstil Nusantara', current_date - 1, 'ordered')
  returning id into v_supplier_purchase1;
  insert into public.supplier_purchase_items (user_id, purchase_id, material_id, category_id, quantity, unit, unit_price, total_price)
  values (v_user_id, v_supplier_purchase1, v_mat_nagata, v_txcat_beli_kain, 100, 'meter', 46000, 4600000);
  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (v_user_id, v_txcat_beli_kain, 'Pembelian Kain - CV Tekstil Nusantara', 4600000, 'expense', current_date - 1, 'Otomatis dari supplier purchase (seed)');

  -- =======================================================================
  -- 7. PAYROLL: contoh piecework tasks (completed, siap dibayarkan) + 1 payroll draft
  -- =======================================================================
  insert into public.piecework_tasks (user_id, staff_id, order_id, product_id, task_type, qty, rate_per_unit, total_wage, status)
  values
    (v_user_id, v_staff_dedi, v_order1, v_prod_kemeja, 'sewing', 10, 15000, 150000, 'completed'),
    (v_user_id, v_staff_rina, v_order1, v_prod_kemeja, 'cutting', 10, 8000, 80000, 'completed');

  insert into public.weekly_payrolls (user_id, period_start, period_end, payment_date, sales_target_qty, status, notes)
  values (v_user_id, current_date - 6, current_date, current_date + 1, 20, 'draft', 'Payroll mingguan contoh (seed)')
  returning id into v_payroll1;

  insert into public.payroll_items (user_id, payroll_id, staff_id, wage_type, attendance_days, daily_rate, base_amount, take_home_pay)
  values
    (v_user_id, v_payroll1, v_staff_andi, 'attendance', 6, 100000, 600000, 600000),
    (v_user_id, v_payroll1, v_staff_joko, 'attendance', 6, 100000, 600000, 600000);

  update public.weekly_payrolls set total_amount = 1200000 where id = v_payroll1;

  -- =======================================================================
  -- 8. WORKLOG & TIMELINE: contoh cutting assignment & stage events (§7 & §8)
  -- =======================================================================
  -- v_item1 selesai dipotong
  update public.order_items
  set cutting_completed_at = now() - interval '2 days', cutting_qty = 10
  where id = v_item1;

  insert into public.cutting_assignments (user_id, order_id, order_item_id, staff_id, assigned_at, status, notes)
  values (v_user_id, v_order1, v_item1, v_staff_rina, now() - interval '3 days', 'done', 'Selesai dipotong tepat waktu (seed)')
  on conflict (order_item_id) do update set status = 'done', staff_id = excluded.staff_id, order_id = excluded.order_id;

  -- v_item2 sedang ditugaskan (assigned)
  insert into public.cutting_assignments (user_id, order_id, order_item_id, staff_id, assigned_at, status, notes)
  values (v_user_id, v_order1, v_item2, v_staff_rina, now() - interval '1 day', 'assigned', 'Dipotong minggu ini (seed)')
  on conflict (order_item_id) do update set status = 'assigned', staff_id = excluded.staff_id, order_id = excluded.order_id;

  -- Contoh order stage events untuk v_order1
  insert into public.order_stage_events (user_id, order_id, stage, status, completed_at)
  values
    (v_user_id, v_order1, 'quotation', 'done', now() - interval '10 days'),
    (v_user_id, v_order1, 'rekap', 'done', now() - interval '8 days'),
    (v_user_id, v_order1, 'bordir', 'done', now() - interval '1 day')
  on conflict (order_id, stage) do update set status = excluded.status, completed_at = excluded.completed_at;

  -- Contoh stage work logs untuk v_order1
  insert into public.stage_work_logs (user_id, order_id, order_item_id, stage, staff_id, qty, logged_at, notes)
  values
    (v_user_id, v_order1, v_item1, 'finishing', v_staff_andi, 5, now() - interval '4 hours', 'Perapihan sisa benang gelombang 1 (seed)');

  raise notice 'Seed selesai. Login: owner@sikon.com / password123';
end $$;
