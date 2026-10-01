-- Snapshot selected purchase-unit rules and apply them when goods enter stock.

create or replace function public.capture_material_purchase_unit_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_material public.materials;
  v_option jsonb;
  v_quantity numeric;
  v_snapshot_rate numeric;
  v_snapshot_variable boolean;
begin
  select * into v_material
  from public.materials
  where id = new.material_id;

  if v_material.id is null then
    raise exception 'Material untuk transaksi tidak ditemukan.';
  end if;

  if tg_table_name <> 'stock_requests' then
    if new.stock_request_id is not null then
      select sr.conversion_rate, sr.is_variable_unit
      into v_snapshot_rate, v_snapshot_variable
      from public.stock_requests sr
      where sr.id = new.stock_request_id
        and sr.unit = new.unit;
    end if;
  end if;

  if v_snapshot_rate is not null then
    new.conversion_rate := v_snapshot_rate;
    new.is_variable_unit := coalesce(v_snapshot_variable, false);
  else
    select option.value into v_option
    from jsonb_array_elements(coalesce(v_material.purchase_units, '[]'::jsonb)) as option(value)
    where lower(option.value->>'name') = lower(new.unit)
      and coalesce((option.value->>'is_active')::boolean, true)
    order by coalesce((option.value->>'is_primary')::boolean, false) desc
    limit 1;

    if v_option is not null then
      new.is_variable_unit := coalesce((v_option->>'is_variable')::boolean, false);
      new.conversion_rate := case
        when new.is_variable_unit then 0
        else coalesce(nullif(v_option->>'conversion_rate', '')::numeric, 1)
      end;
    elsif new.unit = v_material.unit then
      new.is_variable_unit := false;
      new.conversion_rate := 1;
    elsif new.unit = v_material.purchase_unit then
      new.is_variable_unit := false;
      new.conversion_rate := coalesce(v_material.conversion_rate, 1);
    else
      new.is_variable_unit := false;
      new.conversion_rate := 1;
    end if;
  end if;

  if not new.is_variable_unit and new.conversion_rate <= 0 then
    raise exception 'Rasio konversi untuk satuan % harus lebih besar dari 0.', new.unit;
  end if;

  if tg_table_name = 'stock_requests' then
    v_quantity := new.quantity_needed;
  else
    v_quantity := new.quantity;
  end if;

  if tg_table_name <> 'stock_requests' then
    new.base_quantity := case
      when new.is_variable_unit then null
      else v_quantity * new.conversion_rate
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists stock_requests_capture_purchase_unit on public.stock_requests;

create trigger stock_requests_capture_purchase_unit
before insert or update of material_id, unit, quantity_needed
on public.stock_requests
for each row execute function public.capture_material_purchase_unit_snapshot();

drop trigger if exists purchasing_report_items_capture_purchase_unit on public.purchasing_report_items;

create trigger purchasing_report_items_capture_purchase_unit
before insert or update of material_id, unit, quantity
on public.purchasing_report_items
for each row execute function public.capture_material_purchase_unit_snapshot();

drop trigger if exists supplier_purchase_items_capture_purchase_unit on public.supplier_purchase_items;

create trigger supplier_purchase_items_capture_purchase_unit
before insert or update of material_id, unit, quantity
on public.supplier_purchase_items
for each row execute function public.capture_material_purchase_unit_snapshot();

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
  v_category record;
  v_advance public.cash_advances;
  v_total numeric := 0;
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

  if v_report.service_fee is not null and v_report.service_fee > 0 then
    insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
    values (v_user_id, null, 'Jasa Purchasing - ' || coalesce(v_staff_name, 'Staf'), v_report.service_fee,
            'expense', v_report.report_date, 'Otomatis dari biaya jasa/transport SPJ #' || p_report_id);
  end if;

  if v_report.cash_advance_id is not null then
    select * into v_advance from public.cash_advances where id = v_report.cash_advance_id;
    if v_advance is not null and v_advance.status = 'outstanding' then
      insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
      values (v_user_id, null, 'Reversal Uang Muka - ' || coalesce(v_staff_name, 'Staf'), v_advance.amount,
              'income', v_report.report_date, 'Otomatis dari approval SPJ #' || p_report_id);
      update public.cash_advances set status = 'settled' where id = v_advance.id;
    end if;
  end if;

  update public.purchasing_reports
  set status = 'financially_approved', approved_at = now(), total_amount = v_total
  where id = p_report_id;
end;
$$;

drop function if exists public.confirm_purchasing_report_receipt (uuid, uuid);

create or replace function public.confirm_purchasing_report_receipt(
  p_report_id uuid,
  p_received_by uuid default null,
  p_base_quantities jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_report public.purchasing_reports;
  v_item record;
  v_base_qty numeric;
  v_movement record;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_report
  from public.purchasing_reports
  where id = p_report_id and user_id = v_user_id;
  if v_report is null then raise exception 'SPJ tidak ditemukan'; end if;
  if v_report.status <> 'financially_approved' then
    raise exception 'SPJ harus berstatus financially_approved untuk dapat dikonfirmasi penerimaan barangnya (status: %)', v_report.status;
  end if;

  delete from public.stock_movements
  where source_type = 'purchasing_report'
    and source_id = p_report_id
    and status = 'pending'
    and user_id = v_user_id;

  for v_item in
    select * from public.purchasing_report_items where report_id = p_report_id
  loop
    if v_item.material_id is not null then
      if v_item.is_variable_unit then
        select nullif(entry.value->>'base_quantity', '')::numeric into v_base_qty
        from jsonb_array_elements(coalesce(p_base_quantities, '[]'::jsonb)) as entry(value)
        where entry.value->>'item_id' = v_item.id::text
        limit 1;
        if v_base_qty is null or v_base_qty <= 0 then
          raise exception 'Isi jumlah aktual satuan stok untuk item %.', coalesce(v_item.description, v_item.unit);
        end if;
      else
        v_base_qty := v_item.quantity * v_item.conversion_rate;
      end if;

      insert into public.stock_movements
        (user_id, material_id, material_color_id, movement_type, qty, unit, status, source_type, source_id, source_line_id, notes, recorded_by, confirmed_at)
      select v_user_id, v_item.material_id, v_item.material_color_id, 'in', v_base_qty, m.unit, 'confirmed',
             'purchasing_report', p_report_id, v_item.id, 'SPJ - penerimaan gudang', p_received_by, now()
      from public.materials m
      where m.id = v_item.material_id;

      if v_item.material_color_id is not null then
        update public.material_colors
        set stock_qty = stock_qty + v_base_qty
        where id = v_item.material_color_id;
      else
        update public.materials
        set stock_qty = stock_qty + v_base_qty
        where id = v_item.material_id;
      end if;

      if v_item.total_price > 0 then
        update public.materials
        set price = v_item.total_price / v_base_qty
        where id = v_item.material_id;
      end if;

      update public.purchasing_report_items
      set base_quantity = v_base_qty
      where id = v_item.id;
    end if;

    if v_item.stock_request_id is not null then
      update public.stock_requests
      set status = 'fulfilled', fulfilled_date = now(), goods_received_at = now()
      where id = v_item.stock_request_id;
    end if;
  end loop;

  update public.stock_requests
  set status = 'fulfilled', fulfilled_date = now(), goods_received_at = now()
  where purchasing_report_id = p_report_id and status <> 'fulfilled';

  update public.purchasing_reports
  set status = 'goods_received', received_by = p_received_by, received_at = now()
  where id = p_report_id;
end;
$$;

drop function if exists public.receive_supplier_purchase (uuid, uuid);

create or replace function public.receive_supplier_purchase(
  p_purchase_id uuid,
  p_recorded_by uuid default null,
  p_base_quantities jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_purchase public.supplier_purchases;
  v_item record;
  v_base_qty numeric;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_purchase
  from public.supplier_purchases
  where id = p_purchase_id and user_id = v_user_id;
  if v_purchase is null then raise exception 'Data pembelian tidak ditemukan atau bukan milik Anda'; end if;
  if v_purchase.status <> 'ordered' then raise exception 'Status pembelian ini bukan "ordered"'; end if;

  for v_item in
    select * from public.supplier_purchase_items where purchase_id = p_purchase_id
  loop
    if v_item.is_variable_unit then
      select nullif(entry.value->>'base_quantity', '')::numeric into v_base_qty
      from jsonb_array_elements(coalesce(p_base_quantities, '[]'::jsonb)) as entry(value)
      where entry.value->>'item_id' = v_item.id::text
      limit 1;
      if v_base_qty is null or v_base_qty <= 0 then
        raise exception 'Isi jumlah aktual satuan stok untuk item supplier %.', v_item.id;
      end if;
    else
      v_base_qty := v_item.quantity * v_item.conversion_rate;
    end if;

    insert into public.stock_movements
      (user_id, material_id, material_color_id, movement_type, qty, unit, status, source_type, source_id, source_line_id, notes, recorded_by, confirmed_at)
    select v_user_id, v_item.material_id, v_item.material_color_id, 'in', v_base_qty, m.unit, 'confirmed',
           'supplier_purchase', p_purchase_id, v_item.id, 'Dari supplier ' || v_purchase.supplier_name, p_recorded_by, now()
    from public.materials m
    where m.id = v_item.material_id;

    if v_item.material_color_id is not null then
      update public.material_colors
      set stock_qty = stock_qty + v_base_qty
      where id = v_item.material_color_id;
    else
      update public.materials
      set stock_qty = stock_qty + v_base_qty
      where id = v_item.material_id;
    end if;

    if v_item.total_price > 0 then
      update public.materials
      set price = v_item.total_price / v_base_qty
      where id = v_item.material_id;
    end if;

    update public.supplier_purchase_items
    set base_quantity = v_base_qty
    where id = v_item.id;

    if v_item.stock_request_id is not null then
      update public.stock_requests
      set status = 'fulfilled', fulfilled_date = now(), goods_received_at = now()
      where id = v_item.stock_request_id;
    end if;
  end loop;

  update public.stock_requests
  set status = 'fulfilled', fulfilled_date = now(), goods_received_at = now()
  where supplier_purchase_id = p_purchase_id and status <> 'fulfilled';

  update public.supplier_purchases
  set status = 'received', received_date = now()
  where id = p_purchase_id;
end;
$$;

revoke
execute on function public.confirm_purchasing_report_receipt (uuid, uuid, jsonb)
from public, anon;

grant
execute on function public.confirm_purchasing_report_receipt (uuid, uuid, jsonb) to authenticated;

revoke
execute on function public.receive_supplier_purchase (uuid, uuid, jsonb)
from public, anon;

grant
execute on function public.receive_supplier_purchase (uuid, uuid, jsonb) to authenticated;