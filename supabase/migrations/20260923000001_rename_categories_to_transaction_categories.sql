-- =========================================================================
-- Migration: Rename categories table to transaction_categories
-- Tujuan: Memberikan kejelasan nama tabel kategori khusus transaksi keuangan
--         (income / expense) agar konsisten dengan product_categories
--         dan material_categories.
-- =========================================================================

-- 1. Rename table categories to transaction_categories (jika masih bernama categories)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'categories'
  ) then
    alter table public.categories rename to transaction_categories;
  end if;
end $$;

-- 2. Rename check constraint jika ada
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'categories_type_check'
  ) then
    alter table public.transaction_categories rename constraint categories_type_check to transaction_categories_type_check;
  end if;
end $$;

-- 3. Pastikan unique constraint pada (user_id, name, type)
alter table public.transaction_categories drop constraint if exists transaction_categories_user_id_name_type_key;
alter table public.transaction_categories add constraint transaction_categories_user_id_name_type_key unique (user_id, name, type);

-- 4. Perbarui RLS Policy
alter table public.transaction_categories enable row level security;
drop policy if exists "Manage own categories" on public.transaction_categories;
drop policy if exists "Manage own transaction_categories" on public.transaction_categories;

create policy "Manage own transaction_categories" on public.transaction_categories
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Perbarui functions / RPC yang mereferensikan public.categories

-- 5a. record_order_payment
create or replace function public.record_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_payment_type text,
  p_payment_method text,
  p_payment_date date,
  p_category_id uuid default null
)
returns public.order_payments
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders;
  v_transaction_id uuid;
  v_payment public.order_payments;
  v_label text;
  v_category_id uuid := p_category_id;
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

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description, order_id)
  values (v_user_id, v_category_id, v_label, p_amount, 'income', p_payment_date,
          'Otomatis dari pembayaran order ' || v_order.order_id, p_order_id)
  returning id into v_transaction_id;

  insert into public.order_payments (order_id, user_id, amount, payment_type, payment_method, payment_date, transaction_id)
  values (p_order_id, v_user_id, p_amount, p_payment_type, p_payment_method, p_payment_date, v_transaction_id)
  returning * into v_payment;

  perform public.recompute_order_status(p_order_id);
  return v_payment;
end;
$$;

-- 5b. record_supplier_purchase_down_payment
create or replace function public.record_supplier_purchase_down_payment(
  p_staff_id uuid,
  p_amount numeric,
  p_date date default current_date,
  p_purpose text default 'Uang Muka Pembelian Supplier'
)
returns public.cash_advances
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_staff public.staff;
  v_category_id uuid;
  v_transaction_id uuid;
  v_advance public.cash_advances;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_staff from public.staff where id = p_staff_id and user_id = v_user_id;
  if v_staff is null then raise exception 'Staff tidak ditemukan atau bukan milik Anda'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;

  select id into v_category_id from public.transaction_categories
  where user_id = v_user_id and type = 'expense' and name = 'Uang Muka Purchasing' limit 1;
  if v_category_id is null then
    insert into public.transaction_categories (user_id, name, type) values (v_user_id, 'Uang Muka Purchasing', 'expense')
    returning id into v_category_id;
  end if;

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (v_user_id, v_category_id, 'Uang Muka - ' || v_staff.name, p_amount, 'expense', p_date, coalesce(p_purpose, ''))
  returning id into v_transaction_id;

  insert into public.cash_advances (user_id, staff_id, amount, purpose, date_given, status, transaction_id)
  values (v_user_id, p_staff_id, p_amount, p_purpose, p_date, 'outstanding', v_transaction_id)
  returning * into v_advance;

  return v_advance;
end;
$$;

-- 5c. approve_purchasing_report
create or replace function public.approve_purchasing_report(p_report_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_report public.purchasing_reports;
  v_staff_name varchar;
  v_item record;
  v_cat record;
  v_advance public.cash_advances;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_report from public.purchasing_reports where id = p_report_id and user_id = v_user_id;
  if v_report is null then raise exception 'SPJ tidak ditemukan atau bukan milik Anda'; end if;
  if v_report.status <> 'submitted' then raise exception 'SPJ ini belum di-submit atau sudah diproses'; end if;

  select name into v_staff_name from public.staff where id = v_report.staff_id;

  for v_item in select * from public.purchasing_report_items where report_id = p_report_id
  loop
    if v_item.material_id is not null then
      insert into public.stock_movements
        (user_id, material_id, material_color_id, movement_type, qty, unit, status, source_type, source_id, notes, confirmed_at)
      values
        (v_user_id, v_item.material_id, v_item.material_color_id, 'in', v_item.quantity, v_item.unit, 'confirmed',
         'purchasing_report', p_report_id, 'SPJ - ' || coalesce(v_staff_name, 'Staf'), now());

      if v_item.material_color_id is not null then
        update public.material_colors set stock_qty = stock_qty + v_item.quantity where id = v_item.material_color_id;
        if v_item.unit_price is not null and v_item.unit_price > 0 then
          update public.materials set price = v_item.unit_price where id = v_item.material_id;
        end if;
      else
        update public.materials
        set stock_qty = stock_qty + v_item.quantity,
            price = case when v_item.unit_price is not null and v_item.unit_price > 0 then v_item.unit_price else price end
        where id = v_item.material_id;
      end if;
    end if;

    if v_item.stock_request_id is not null then
      update public.stock_requests set status = 'fulfilled', fulfilled_date = now() where id = v_item.stock_request_id;
    end if;
  end loop;

  for v_cat in
    select pri.category_id, c.name as category_name, sum(pri.total_price) as total
    from public.purchasing_report_items pri
    left join public.transaction_categories c on c.id = pri.category_id
    where pri.report_id = p_report_id
    group by pri.category_id, c.name
  loop
    insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
    values (v_user_id, v_cat.category_id, 'SPJ ' || coalesce(v_cat.category_name, 'Lainnya') || ' - ' || coalesce(v_staff_name, 'Staf'),
            v_cat.total, 'expense', v_report.report_date, 'Otomatis dari SPJ #' || p_report_id);
  end loop;

  if v_report.service_fee is not null and v_report.service_fee > 0 then
    insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
    values (v_user_id, null, 'Jasa Purchasing - ' || coalesce(v_staff_name, 'Staf'), v_report.service_fee, 'expense',
            v_report.report_date, 'Otomatis dari biaya jasa/transport SPJ #' || p_report_id);
  end if;

  if v_report.cash_advance_id is not null then
    select * into v_advance from public.cash_advances where id = v_report.cash_advance_id;
    if v_advance is not null and v_advance.status = 'outstanding' then
      insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
      values (v_user_id, null, 'Reversal Uang Muka - ' || coalesce(v_staff_name, 'Staf'), v_advance.amount, 'income',
              v_report.report_date, 'Otomatis dari approval SPJ #' || p_report_id);
      update public.cash_advances set status = 'settled' where id = v_advance.id;
    end if;
  end if;

  update public.purchasing_reports
  set status = 'approved', approved_at = now(),
      total_amount = (select coalesce(sum(total_price), 0) from public.purchasing_report_items where report_id = p_report_id)
  where id = p_report_id;
end;
$$;

-- 5d. create_supplier_purchase
create or replace function public.create_supplier_purchase(
  p_requested_by uuid, p_supplier_name varchar, p_payment_date date, p_items jsonb, p_notes text default null
)
returns public.supplier_purchases language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_purchase public.supplier_purchases;
  v_item jsonb;
  v_total numeric := 0;
  v_line_total numeric;
  v_cat record;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Minimal 1 item pembelian'; end if;

  insert into public.supplier_purchases (user_id, requested_by, supplier_name, payment_date, notes, status, total_amount)
  values (v_user_id, p_requested_by, p_supplier_name, p_payment_date, p_notes, 'ordered', 0)
  returning * into v_purchase;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
    v_total := v_total + v_line_total;
    insert into public.supplier_purchase_items
      (user_id, purchase_id, material_id, material_color_id, category_id, stock_request_id, quantity, unit, unit_price, total_price)
    values (v_user_id, v_purchase.id, (v_item->>'material_id')::uuid, nullif(v_item->>'material_color_id', '')::uuid,
            (v_item->>'category_id')::uuid, nullif(v_item->>'stock_request_id', '')::uuid,
            (v_item->>'quantity')::numeric, v_item->>'unit', (v_item->>'unit_price')::numeric, v_line_total);
  end loop;

  for v_cat in
    select spi.category_id, c.name as category_name, sum(spi.total_price) as total
    from public.supplier_purchase_items spi
    left join public.transaction_categories c on c.id = spi.category_id
    where spi.purchase_id = v_purchase.id
    group by spi.category_id, c.name
  loop
    insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
    values (v_user_id, v_cat.category_id, 'Pembelian ' || coalesce(v_cat.category_name, 'Lainnya') || ' - ' || p_supplier_name,
            v_cat.total, 'expense', p_payment_date, 'Otomatis dari supplier purchase #' || v_purchase.id);
  end loop;

  update public.supplier_purchases set total_amount = v_total where id = v_purchase.id;
  select * into v_purchase from public.supplier_purchases where id = v_purchase.id;
  return v_purchase;
end;
$$;

-- 5e. pay_salary
create or replace function public.pay_salary(p_payroll_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_payroll public.weekly_payrolls;
  v_cat_id uuid;
  v_trx_id uuid;
  v_item record;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_payroll from public.weekly_payrolls where id = p_payroll_id and user_id = v_user_id;
  if v_payroll is null then raise exception 'Data payroll tidak ditemukan atau bukan milik Anda'; end if;
  if v_payroll.status = 'paid' then raise exception 'Payroll ini sudah dibayarkan sebelumnya'; end if;

  select id into v_cat_id from public.transaction_categories
  where user_id = v_user_id and name = 'Gaji Karyawan' and type = 'expense' limit 1;
  if v_cat_id is null then
    insert into public.transaction_categories (user_id, name, type) values (v_user_id, 'Gaji Karyawan', 'expense')
    returning id into v_cat_id;
  end if;

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (
    v_user_id, v_cat_id,
    'Gaji Karyawan (' || to_char(v_payroll.period_start, 'DD/MM') || ' - ' || to_char(v_payroll.period_end, 'DD/MM/YYYY') || ')',
    v_payroll.total_amount, 'expense', v_payroll.payment_date,
    'Pembayaran payroll mingguan untuk karyawan (absensi, upah borongan, bonus sales)'
  )
  returning id into v_trx_id;

  for v_item in select staff_id from public.payroll_items where payroll_id = p_payroll_id and wage_type = 'piecework'
  loop
    update public.piecework_tasks
    set is_paid = true, payroll_id = p_payroll_id, paid_at = now()
    where user_id = v_user_id and staff_id = v_item.staff_id and status = 'completed' and is_paid = false;
  end loop;

  update public.weekly_payrolls
  set status = 'paid', paid_at = now(), transaction_id = v_trx_id
  where id = p_payroll_id;
end;
$$;

-- 6. Table privileges
grant select, insert, update, delete on table public.transaction_categories to authenticated;
grant all on table public.transaction_categories to service_role;
