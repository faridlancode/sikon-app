-- =========================================================
-- Migration: purchasing_rpc_functions
-- Version: 20260918140005
-- =========================================================

-- 1. give_cash_advance: Kasih uang muka -> langsung catat expense
create or replace function public.give_cash_advance(
  p_staff_id uuid,
  p_amount numeric,
  p_purpose text default null,
  p_date date default current_date
)
returns public.cash_advances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_staff public.staff;
  v_category_id uuid;
  v_transaction_id uuid;
  v_advance public.cash_advances;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select * into v_staff from public.staff where id = p_staff_id and user_id = v_user_id;
  if v_staff is null then
    raise exception 'Staff tidak ditemukan atau bukan milik Anda';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Jumlah harus lebih dari 0';
  end if;

  select id into v_category_id from public.categories
  where user_id = v_user_id and type = 'expense' and name = 'Uang Muka Purchasing'
  limit 1;

  if v_category_id is null then
    insert into public.categories (user_id, name, type)
    values (v_user_id, 'Uang Muka Purchasing', 'expense')
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

revoke execute on function public.give_cash_advance(uuid, numeric, text, date) from public, anon;
grant execute on function public.give_cash_advance(uuid, numeric, text, date) to authenticated;

-- 2. approve_purchasing_report: Inti alur SPJ
create or replace function public.approve_purchasing_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_report public.purchasing_reports;
  v_staff_name text;
  v_item record;
  v_cat record;
  v_advance public.cash_advances;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select * into v_report from public.purchasing_reports where id = p_report_id and user_id = v_user_id;
  if v_report is null then
    raise exception 'SPJ tidak ditemukan atau bukan milik Anda';
  end if;
  if v_report.status <> 'submitted' then
    raise exception 'SPJ ini belum di-submit atau sudah diproses';
  end if;

  select name into v_staff_name from public.staff where id = v_report.staff_id;

  -- 1. Stock movement (langsung confirmed) + update stok fisik & harga acuan, per item yang punya material_id
  for v_item in select * from public.purchasing_report_items where report_id = p_report_id
  loop
    if v_item.material_id is not null then
      insert into public.stock_movements
        (user_id, material_id, material_color_id, movement_type, qty, unit, status, source_type, source_id, notes, confirmed_at)
      values
        (v_user_id, v_item.material_id, v_item.material_color_id, 'in', v_item.quantity, v_item.unit, 'confirmed',
         'purchasing_report', p_report_id, 'SPJ - ' || coalesce(v_staff_name, 'Staf'), now());

      if v_item.material_color_id is not null then
        update public.material_colors
        set stock_qty = stock_qty + v_item.quantity
        where id = v_item.material_color_id;

        if v_item.unit_price is not null and v_item.unit_price > 0 then
          update public.materials
          set price = v_item.unit_price
          where id = v_item.material_id;
        end if;
      else
        update public.materials
        set stock_qty = stock_qty + v_item.quantity,
            price = case when v_item.unit_price is not null and v_item.unit_price > 0 then v_item.unit_price else price end
        where id = v_item.material_id;
      end if;
    end if;

    if v_item.stock_request_id is not null then
      update public.stock_requests
      set status = 'fulfilled', fulfilled_date = now()
      where id = v_item.stock_request_id;
    end if;
  end loop;

  -- 2. Expense per kategori
  for v_cat in
    select pri.category_id, c.name as category_name, sum(pri.total_price) as total
    from public.purchasing_report_items pri
    left join public.categories c on c.id = pri.category_id
    where pri.report_id = p_report_id
    group by pri.category_id, c.name
  loop
    insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
    values (
      v_user_id, v_cat.category_id,
      'SPJ ' || coalesce(v_cat.category_name, 'Lainnya') || ' - ' || coalesce(v_staff_name, 'Staf'),
      v_cat.total, 'expense', v_report.report_date,
      'Otomatis dari SPJ #' || p_report_id
    );
  end loop;

  -- 3. Reversal uang muka (jika SPJ terhubung ke 1 cash advance yang statusnya outstanding)
  if v_report.cash_advance_id is not null then
    select * into v_advance from public.cash_advances where id = v_report.cash_advance_id;
    if v_advance is not null and v_advance.status = 'outstanding' then
      insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
      values (
        v_user_id, null, 'Reversal Uang Muka - ' || coalesce(v_staff_name, 'Staf'), v_advance.amount, 'income',
        v_report.report_date, 'Otomatis dari approval SPJ #' || p_report_id
      );
      update public.cash_advances set status = 'settled' where id = v_advance.id;
    end if;
  end if;

  -- 4. Update status SPJ menjadi approved
  update public.purchasing_reports
  set status = 'approved', approved_at = now(),
      total_amount = (select coalesce(sum(total_price), 0) from public.purchasing_report_items where report_id = p_report_id)
  where id = p_report_id;
end;
$$;

revoke execute on function public.approve_purchasing_report(uuid) from public, anon;
grant execute on function public.approve_purchasing_report(uuid) to authenticated;

-- X. placeholder
create or replace function public.reject_purchasing_report(p_report_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi';
  end if;

  update public.purchasing_reports
  set status = 'rejected',
      notes = coalesce(notes, '') || case when p_reason is not null then E'\nAlasan ditolak: ' || p_reason else '' end
  where id = p_report_id and user_id = v_user_id and status = 'submitted';

  if not found then
    raise exception 'SPJ tidak ditemukan, bukan milik Anda, atau statusnya bukan submitted';
  end if;
end;
$$;

revoke execute on function public.reject_purchasing_report(uuid, text) from public, anon;
grant execute on function public.reject_purchasing_report(uuid, text) to authenticated;

-- 4. create_supplier_purchase: Order + bayar (selalu lunas di awal)
create or replace function public.create_supplier_purchase(
  p_requested_by uuid,
  p_supplier_name varchar,
  p_payment_date date,
  p_items jsonb
)
returns public.supplier_purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_purchase public.supplier_purchases;
  v_item jsonb;
  v_total numeric := 0;
  v_line_total numeric;
  v_cat record;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal 1 item pembelian';
  end if;

  insert into public.supplier_purchases (user_id, requested_by, supplier_name, payment_date, status, total_amount)
  values (v_user_id, p_requested_by, p_supplier_name, p_payment_date, 'ordered', 0)
  returning * into v_purchase;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
    v_total := v_total + v_line_total;

    insert into public.supplier_purchase_items
      (user_id, purchase_id, material_id, material_color_id, category_id, stock_request_id, quantity, unit, unit_price, total_price)
    values (
      v_user_id, v_purchase.id,
      (v_item->>'material_id')::uuid,
      nullif(v_item->>'material_color_id', '')::uuid,
      (v_item->>'category_id')::uuid,
      nullif(v_item->>'stock_request_id', '')::uuid,
      (v_item->>'quantity')::numeric,
      v_item->>'unit',
      (v_item->>'unit_price')::numeric,
      v_line_total
    );
  end loop;

  for v_cat in
    select spi.category_id, c.name as category_name, sum(spi.total_price) as total
    from public.supplier_purchase_items spi
    left join public.categories c on c.id = spi.category_id
    where spi.purchase_id = v_purchase.id
    group by spi.category_id, c.name
  loop
    insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
    values (
      v_user_id, v_cat.category_id,
      'Pembelian ' || coalesce(v_cat.category_name, 'Lainnya') || ' - ' || p_supplier_name,
      v_cat.total, 'expense', p_payment_date,
      'Otomatis dari supplier purchase #' || v_purchase.id
    );
  end loop;

  update public.supplier_purchases set total_amount = v_total where id = v_purchase.id;
  select * into v_purchase from public.supplier_purchases where id = v_purchase.id;
  return v_purchase;
end;
$$;

revoke execute on function public.create_supplier_purchase(uuid, varchar, date, jsonb) from public, anon;
grant execute on function public.create_supplier_purchase(uuid, varchar, date, jsonb) to authenticated;

-- 5. receive_supplier_purchase: Barang datang -> stock movement confirmed + tambah saldo stok
create or replace function public.receive_supplier_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_purchase public.supplier_purchases;
  v_item record;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select * into v_purchase from public.supplier_purchases where id = p_purchase_id and user_id = v_user_id;
  if v_purchase is null then
    raise exception 'Data pembelian tidak ditemukan atau bukan milik Anda';
  end if;
  if v_purchase.status <> 'ordered' then
    raise exception 'Status pembelian ini bukan "ordered"';
  end if;

  for v_item in select * from public.supplier_purchase_items where purchase_id = p_purchase_id
  loop
    insert into public.stock_movements
      (user_id, material_id, material_color_id, movement_type, qty, unit, status, source_type, source_id, notes, confirmed_at)
    values
      (v_user_id, v_item.material_id, v_item.material_color_id, 'in', v_item.quantity, v_item.unit, 'confirmed',
       'supplier_purchase', p_purchase_id, 'Dari supplier ' || v_purchase.supplier_name, now());

    if v_item.material_color_id is not null then
      update public.material_colors
      set stock_qty = stock_qty + v_item.quantity
      where id = v_item.material_color_id;

      if v_item.unit_price is not null and v_item.unit_price > 0 then
        update public.materials
        set price = v_item.unit_price
        where id = v_item.material_id;
      end if;
    else
      update public.materials
      set stock_qty = stock_qty + v_item.quantity,
          price = case when v_item.unit_price is not null and v_item.unit_price > 0 then v_item.unit_price else price end
      where id = v_item.material_id;
    end if;

    if v_item.stock_request_id is not null then
      update public.stock_requests
      set status = 'fulfilled', fulfilled_date = now()
      where id = v_item.stock_request_id;
    end if;
  end loop;

  update public.supplier_purchases set status = 'received', received_date = now() where id = p_purchase_id;
end;
$$;

revoke execute on function public.receive_supplier_purchase(uuid) from public, anon;
grant execute on function public.receive_supplier_purchase(uuid) to authenticated;
