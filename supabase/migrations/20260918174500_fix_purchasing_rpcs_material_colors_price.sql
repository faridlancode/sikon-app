-- =========================================================
-- Migration: fix_purchasing_rpcs_material_colors_price
-- Version: 20260918174500
-- Description:
--   Fix error: column "price" of relation "material_colors" does not exist
--   in approve_purchasing_report and receive_supplier_purchase.
--   When material_color_id is provided, update stock_qty on material_colors,
--   and update reference price on materials (since material_colors has no price column).
--   Also ensures service_fee from purchasing_reports is recorded as an expense transaction.
-- =========================================================

-- 1. approve_purchasing_report: Inti alur SPJ
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
        -- Kain: stok dicatat di material_colors per varian warna
        update public.material_colors
        set stock_qty = stock_qty + v_item.quantity
        where id = v_item.material_color_id;

        -- Update harga acuan di master materials (jika unit_price diinput)
        if v_item.unit_price is not null and v_item.unit_price > 0 then
          update public.materials
          set price = v_item.unit_price
          where id = v_item.material_id;
        end if;
      else
        -- Non-kain / material umum: stok & harga dicatat di master materials
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

  -- 2. Expense per kategori belanja item
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

  -- 2b. Expense untuk biaya jasa / transport purchasing jika ada
  if v_report.service_fee is not null and v_report.service_fee > 0 then
    insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
    values (
      v_user_id, null,
      'Jasa Purchasing - ' || coalesce(v_staff_name, 'Staf'),
      v_report.service_fee, 'expense', v_report.report_date,
      'Otomatis dari biaya jasa/transport SPJ #' || p_report_id
    );
  end if;

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


-- 2. receive_supplier_purchase: Barang datang -> stock movement confirmed + tambah saldo stok
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
      -- Kain: stok dicatat di material_colors per varian warna
      update public.material_colors
      set stock_qty = stock_qty + v_item.quantity
      where id = v_item.material_color_id;

      -- Update harga acuan di master materials (jika unit_price diinput)
      if v_item.unit_price is not null and v_item.unit_price > 0 then
        update public.materials
        set price = v_item.unit_price
        where id = v_item.material_id;
      end if;
    else
      -- Non-kain / material umum: stok & harga dicatat di master materials
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
