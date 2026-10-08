-- =========================================================================
-- Migration: Patch SPJ & Order Payment RPCs for Accounting (Fase A - Langkah 3)
-- =========================================================================
-- Menyesuaikan 2 fungsi pencatatan yang ada agar mengisi kolom akuntansi:
-- 1. approve_purchasing_report
--    - Mengisi counter_account_id = akun 1-1400 pada transaksi Reversal Uang Muka
--    - Menetapkan category_id 'Jasa Purchasing' (akun 6-2000) pada transaksi service_fee
-- 2. record_order_payment
--    - Mengisi cash_account_id (1-1100 Kas bila 'cash', 1-1200 Bank untuk lainnya)
--      pada transaksi pembayaran order
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. approve_purchasing_report
--    Sumber: 20261001100002_convert_purchase_receipts_to_base_units.sql
-- ---------------------------------------------------------------------------
create or replace function public.approve_purchasing_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid := auth.uid();
  v_report         public.purchasing_reports;
  v_staff_name     text;
  v_item           record;
  v_category       record;
  v_advance        public.cash_advances;
  v_total          numeric := 0;
  v_jasa_cat_id    uuid;
  v_akun_1400_id   uuid;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_report
  from public.purchasing_reports
  where id = p_report_id and user_id = v_user_id;
  if v_report is null then raise exception 'SPJ tidak ditemukan atau bukan milik Anda'; end if;
  if v_report.status <> 'submitted' then
    raise exception 'SPJ ini belum di-submit atau sudah diproses (status: %)', v_report.status;
  end if;

  select name into v_staff_name from public.staff where id = v_report.staff_id;
  select coalesce(sum(total_price), 0) into v_total
  from public.purchasing_report_items where report_id = p_report_id;

  -- Cari/buat kategori 'Jasa Purchasing' untuk tagging transaksi service_fee
  select id into v_jasa_cat_id
    from public.transaction_categories
   where user_id = v_user_id and name = 'Jasa Purchasing' and type = 'expense'
   limit 1;

  if v_jasa_cat_id is null then
    -- Cari akun 6-2000 (Beban Operasional) milik user
    -- Hanya assign account_id jika akun sudah ada (seed oleh init_accounting nanti)
    insert into public.transaction_categories (user_id, name, type, account_id)
    select v_user_id, 'Jasa Purchasing', 'expense', a.id
      from public.accounts a
     where a.user_id = v_user_id and a.code = '6-2000'
    limit 1
    returning id into v_jasa_cat_id;

    -- Jika akun 6-2000 belum ada (akuntansi belum diinisialisasi), buat tanpa account_id
    if v_jasa_cat_id is null then
      insert into public.transaction_categories (user_id, name, type)
      values (v_user_id, 'Jasa Purchasing', 'expense')
      returning id into v_jasa_cat_id;
    end if;
  end if;

  -- Cari akun 1-1400 (Uang Muka Karyawan) untuk counter_account_id reversal
  select id into v_akun_1400_id
    from public.accounts
   where user_id = v_user_id and code = '1-1400'
   limit 1;

  for v_item in
    select pri.*, m.unit as base_unit
    from public.purchasing_report_items pri
    left join public.materials m on m.id = pri.material_id
    where pri.report_id = p_report_id
  loop
    if v_item.material_id is not null and not v_item.is_variable_unit then
      insert into public.stock_movements
        (user_id, material_id, material_color_id, movement_type, qty, unit, status, source_type, source_id, source_line_id, notes)
      values
        (v_user_id, v_item.material_id, v_item.material_color_id, 'in', v_item.quantity * v_item.conversion_rate,
         v_item.base_unit, 'pending', 'purchasing_report', p_report_id, v_item.id,
         'SPJ - ' || coalesce(v_staff_name, 'Staf'));
    end if;
  end loop;

  for v_category in
    select pri.category_id, c.name as category_name, sum(pri.total_price) as total
    from public.purchasing_report_items pri
    left join public.transaction_categories c on c.id = pri.category_id
    where pri.report_id = p_report_id
    group by pri.category_id, c.name
  loop
    if v_category.total > 0 then
      insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
      values (v_user_id, v_category.category_id,
              'SPJ ' || coalesce(v_category.category_name, 'Lainnya') || ' - ' || coalesce(v_staff_name, 'Staf'),
              v_category.total, 'expense', v_report.report_date, 'Otomatis dari SPJ #' || p_report_id);
    end if;
  end loop;

  -- (b) Jasa Purchasing: pakai category_id yang sudah dicari/dibuat di atas
  if v_report.service_fee is not null and v_report.service_fee > 0 then
    insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
    values (v_user_id, v_jasa_cat_id,
            'Jasa Purchasing - ' || coalesce(v_staff_name, 'Staf'), v_report.service_fee,
            'expense', v_report.report_date, 'Otomatis dari biaya jasa/transport SPJ #' || p_report_id);
  end if;

  if v_report.cash_advance_id is not null then
    select * into v_advance from public.cash_advances where id = v_report.cash_advance_id;
    if v_advance is not null and v_advance.status = 'outstanding' then
      -- (a) Reversal Uang Muka: tambah counter_account_id = akun 1-1400 (Uang Muka Karyawan)
      insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description, counter_account_id)
      values (v_user_id, null,
              'Reversal Uang Muka - ' || coalesce(v_staff_name, 'Staf'), v_advance.amount,
              'income', v_report.report_date, 'Otomatis dari approval SPJ #' || p_report_id,
              v_akun_1400_id);
      update public.cash_advances set status = 'settled' where id = v_advance.id;
    end if;
  end if;

  update public.purchasing_reports
  set status = 'financially_approved', approved_at = now(), total_amount = v_total
  where id = p_report_id;
end;
$$;

revoke execute on function public.approve_purchasing_report(uuid) from public, anon;
grant  execute on function public.approve_purchasing_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. record_order_payment
--    Sumber: 20260923000003_fix_record_order_payment.sql
--    Perubahan: isi cash_account_id berdasarkan p_payment_method.
--    'cash' -> akun 1-1100 (Kas); 'transfer'/'qris'/'lainnya' -> 1-1200 (Bank).
-- ---------------------------------------------------------------------------
create or replace function public.record_order_payment(
  p_order_id      uuid,
  p_amount        numeric,
  p_payment_type  text,
  p_payment_date  date    default current_date,
  p_payment_method text   default null,
  p_category_id   uuid   default null
)
returns public.order_payments
language plpgsql security definer set search_path = public as $$
declare
  v_user_id        uuid := auth.uid();
  v_order          public.orders;
  v_transaction_id uuid;
  v_payment        public.order_payments;
  v_label          text;
  v_category_id    uuid := p_category_id;
  v_cash_account_id uuid;
  v_akun_code      text;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = v_user_id;
  if v_order is null then raise exception 'Order tidak ditemukan atau bukan milik Anda'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Jumlah pembayaran harus lebih dari 0'; end if;

  if v_category_id is null then
    select id into v_category_id from public.transaction_categories
    where user_id = v_user_id and name = 'Pembayaran Order' and type = 'income' limit 1;
  end if;

  v_label := (case when p_payment_type = 'dp' then 'DP Order ' else 'Pelunasan Order ' end)
             || v_order.order_id || ' - ' || v_order.customer_name;

  -- Tentukan akun Kas/Bank berdasarkan metode pembayaran
  -- 'cash' -> 1-1100 Kas; selain itu (transfer, qris, lainnya) -> 1-1200 Bank
  v_akun_code := case when lower(p_payment_method) = 'cash' then '1-1100' else '1-1200' end;
  select id into v_cash_account_id
    from public.accounts
   where user_id = v_user_id and code = v_akun_code
   limit 1;
  -- Jika akuntansi belum diinisialisasi (akun belum ada), v_cash_account_id tetap null

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description, order_id, cash_account_id)
  values (v_user_id, v_category_id, v_label, p_amount, 'income', p_payment_date,
          'Pembayaran ' || upper(p_payment_type) || ' Order ' || v_order.order_id || ' (' || coalesce(p_payment_method, 'Transfer') || ')',
          p_order_id, v_cash_account_id)
  returning id into v_transaction_id;

  insert into public.order_payments (user_id, order_id, transaction_id, amount, payment_type, payment_date, payment_method)
  values (v_user_id, p_order_id, v_transaction_id, p_amount, p_payment_type, p_payment_date, p_payment_method)
  returning * into v_payment;

  perform public.recompute_order_status(p_order_id);

  return v_payment;
end;
$$;

revoke execute on function public.record_order_payment(uuid, numeric, text, date, text, uuid) from public, anon;
grant  execute on function public.record_order_payment(uuid, numeric, text, date, text, uuid) to authenticated;
