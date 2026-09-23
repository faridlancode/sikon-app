-- =========================================================================
-- Migration: Fix Function Overloading and Remaining categories References
-- Masalah yang diselesaikan:
-- 1. PGRST203 pada create_supplier_purchase akibat adanya 2 signature fungsi
--    di remote database: 4 argumen vs 5 argumen (dengan p_notes text default null).
-- 2. give_cash_advance masih query/insert ke public.categories lama.
-- 3. Pencegahan overloading pada record_order_payment.
-- =========================================================================

-- 1. Drop fungsi overloaded lama 4-argumen create_supplier_purchase
drop function if exists public.create_supplier_purchase(uuid, varchar, date, jsonb);

-- Buat ulang create_supplier_purchase dengan signature 5-argumen konsisten
create or replace function public.create_supplier_purchase(
  p_requested_by uuid,
  p_supplier_name varchar,
  p_payment_date date,
  p_items jsonb,
  p_notes text default null
)
returns public.supplier_purchases
language plpgsql security definer set search_path = public as $$
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

revoke execute on function public.create_supplier_purchase(uuid, varchar, date, jsonb, text) from public, anon;
grant execute on function public.create_supplier_purchase(uuid, varchar, date, jsonb, text) to authenticated;

-- 2. Perbarui give_cash_advance agar menggunakan public.transaction_categories
create or replace function public.give_cash_advance(
  p_staff_id uuid,
  p_amount numeric,
  p_purpose text default null,
  p_date date default current_date
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

revoke execute on function public.give_cash_advance(uuid, numeric, text, date) from public, anon;
grant execute on function public.give_cash_advance(uuid, numeric, text, date) to authenticated;

-- Hapus fungsi tidak terpakai dari migration sebelumnya jika ada
drop function if exists public.record_supplier_purchase_down_payment(uuid, numeric, date, text);

-- 3. Standardisasi record_order_payment untuk cegah ambiguous candidate
drop function if exists public.record_order_payment(uuid, numeric, varchar, date, varchar, uuid);
drop function if exists public.record_order_payment(uuid, numeric, text, text, date, uuid);

create or replace function public.record_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_payment_type text,
  p_payment_date date default current_date,
  p_payment_method text default null,
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
          'Pembayaran ' || upper(p_payment_type) || ' Order ' || v_order.order_id || ' (' || coalesce(p_payment_method, 'Transfer') || ')',
          p_order_id)
  returning id into v_transaction_id;

  insert into public.order_payments (user_id, order_id, transaction_id, amount, payment_type, payment_date, payment_method)
  values (v_user_id, p_order_id, v_transaction_id, p_amount, p_payment_type, p_payment_date, p_payment_method)
  returning * into v_payment;

  perform public.recompute_order_status(p_order_id);

  return v_payment;
end;
$$;

revoke execute on function public.record_order_payment(uuid, numeric, text, date, text, uuid) from public, anon;
grant execute on function public.record_order_payment(uuid, numeric, text, date, text, uuid) to authenticated;
