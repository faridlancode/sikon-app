-- =========================================================================
-- SIKon — Clean Baseline 3/5: Staff, Warehouse, Purchasing
-- =========================================================================
-- CATATAN: purchase_receipts / purchase_receipt_items / pay_purchase_receipt
-- dari baseline lama SENGAJA TIDAK dibawa ke sini — sudah diputuskan diganti
-- total oleh alur SPJ (purchasing_reports) & Supplier Purchase di bawah.

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name varchar not null,
  phone varchar,
  role varchar,
  wage_type varchar not null default 'attendance',
  daily_rate numeric not null default 0,
  sales_id uuid references public.sales(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  constraint staff_wage_type_check check (wage_type in ('attendance', 'piecework', 'sales')),
  constraint staff_daily_rate_check check (daily_rate >= 0),
  -- Staf role 'Sales' WAJIB reference sales yang sudah ada (sales tetap sumber kebenaran identitas,
  -- disiapkan untuk kemungkinan dipakai sebagai akun login karyawan di masa depan).
  constraint staff_sales_role_requires_sales_id check (role <> 'Sales' or sales_id is not null)
);
alter table public.staff enable row level security;
create policy "Manage own staff" on public.staff
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  material_id uuid not null references public.materials(id) on delete cascade,
  material_color_id uuid references public.material_colors(id) on delete set null,
  movement_type varchar not null,
  source_type varchar,
  source_id uuid,
  qty numeric not null,
  unit varchar not null,
  notes text,
  status varchar not null default 'confirmed',
  confirmed_at timestamptz,
  created_at timestamptz default now(),
  constraint stock_movements_movement_type_check check (movement_type in ('in', 'out', 'adjustment')),
  constraint stock_movements_status_check check (status in ('pending', 'confirmed', 'cancelled')),
  constraint stock_movements_qty_check check (qty >= 0),
  constraint stock_movements_source_type_check check (source_type in
    ('initial', 'purchase', 'order_consumption', 'manual', 'purchasing_report', 'supplier_purchase', 'adjustment'))
);
alter table public.stock_movements enable row level security;
create policy "Manage own stock movements" on public.stock_movements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_stock_movements_material on public.stock_movements(material_id);
create index idx_stock_movements_color on public.stock_movements(material_color_id);
create index idx_stock_movements_source on public.stock_movements(source_id);
create index idx_stock_movements_status on public.stock_movements(status);

create table public.stock_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  requested_by uuid references public.staff(id),
  material_id uuid not null references public.materials(id),
  material_color_id uuid references public.material_colors(id),
  quantity_needed numeric not null,
  unit varchar not null,
  reason text,
  status varchar not null default 'pending',
  fulfillment_type varchar,
  purchasing_report_id uuid,
  supplier_purchase_id uuid,
  requested_date date not null default current_date,
  fulfilled_date timestamptz,
  created_at timestamptz default now(),
  constraint stock_requests_quantity_check check (quantity_needed > 0),
  constraint stock_requests_status_check check (status in ('pending', 'in_progress', 'fulfilled', 'cancelled')),
  constraint stock_requests_fulfillment_type_check check (fulfillment_type is null or fulfillment_type in ('spj', 'supplier_purchase'))
);
alter table public.stock_requests enable row level security;
create policy "Manage own stock requests" on public.stock_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_stock_requests_material on public.stock_requests(material_id);
create index idx_stock_requests_staff on public.stock_requests(requested_by);
create index idx_stock_requests_status on public.stock_requests(status);

create table public.cash_advances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  staff_id uuid not null references public.staff(id),
  amount numeric not null,
  purpose text,
  date_given date not null default current_date,
  status varchar not null default 'outstanding',
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz default now(),
  constraint cash_advances_amount_check check (amount > 0),
  constraint cash_advances_status_check check (status in ('outstanding', 'settled'))
);
alter table public.cash_advances enable row level security;
create policy "Manage own cash advances" on public.cash_advances
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_cash_advances_staff on public.cash_advances(staff_id);
create index idx_cash_advances_status on public.cash_advances(status);

create table public.purchasing_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  staff_id uuid not null references public.staff(id),
  cash_advance_id uuid references public.cash_advances(id),
  report_date date not null default current_date,
  status varchar not null default 'draft',
  total_amount numeric not null default 0,
  service_fee numeric not null default 0,
  notes text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz default now(),
  constraint purchasing_reports_status_check check (status in ('draft', 'submitted', 'approved', 'rejected')),
  constraint purchasing_reports_service_fee_check check (service_fee >= 0)
);
alter table public.purchasing_reports enable row level security;
create policy "Manage own purchasing reports" on public.purchasing_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_purchasing_reports_staff on public.purchasing_reports(staff_id);
create index idx_purchasing_reports_status on public.purchasing_reports(status);

create table public.purchasing_report_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  report_id uuid not null references public.purchasing_reports(id) on delete cascade,
  stock_request_id uuid references public.stock_requests(id),
  material_id uuid references public.materials(id),
  material_color_id uuid references public.material_colors(id),
  category_id uuid references public.categories(id),
  description text,
  supplier_name varchar,
  quantity numeric not null,
  unit varchar not null,
  unit_price numeric not null,
  total_price numeric not null,
  receipt_photo_url text,
  created_at timestamptz default now(),
  constraint purchasing_report_items_quantity_check check (quantity > 0),
  constraint purchasing_report_items_price_check check (unit_price >= 0)
);
alter table public.purchasing_report_items enable row level security;
create policy "Manage own purchasing report items" on public.purchasing_report_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_purchasing_report_items_report on public.purchasing_report_items(report_id);

alter table public.stock_requests add constraint stock_requests_purchasing_report_id_fkey
  foreign key (purchasing_report_id) references public.purchasing_reports(id);

create table public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  requested_by uuid references public.staff(id),
  supplier_name varchar not null,
  payment_date date not null default current_date,
  received_date timestamptz,
  status varchar not null default 'ordered',
  total_amount numeric not null default 0,
  notes text,
  created_at timestamptz default now(),
  constraint supplier_purchases_status_check check (status in ('ordered', 'received'))
);
alter table public.supplier_purchases enable row level security;
create policy "Manage own supplier purchases" on public.supplier_purchases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_supplier_purchases_staff on public.supplier_purchases(requested_by);
create index idx_supplier_purchases_status on public.supplier_purchases(status);

create table public.supplier_purchase_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  purchase_id uuid not null references public.supplier_purchases(id) on delete cascade,
  stock_request_id uuid references public.stock_requests(id),
  material_id uuid not null references public.materials(id),
  material_color_id uuid references public.material_colors(id),
  category_id uuid references public.categories(id),
  quantity numeric not null,
  unit varchar not null,
  unit_price numeric not null,
  total_price numeric not null,
  created_at timestamptz default now(),
  constraint supplier_purchase_items_quantity_check check (quantity > 0),
  constraint supplier_purchase_items_price_check check (unit_price >= 0)
);
alter table public.supplier_purchase_items enable row level security;
create policy "Manage own supplier purchase items" on public.supplier_purchase_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_supplier_purchase_items_purchase on public.supplier_purchase_items(purchase_id);

alter table public.stock_requests add constraint stock_requests_supplier_purchase_id_fkey
  foreign key (supplier_purchase_id) references public.supplier_purchases(id);


-- =========================================================================
-- FUNCTIONS (warehouse & purchasing)
-- =========================================================================

create function public.confirm_stock_movement(p_movement_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_movement public.stock_movements%rowtype;
  v_current_stock numeric;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_movement from public.stock_movements where id = p_movement_id and user_id = v_user_id;
  if not found then raise exception 'Stock movement tidak ditemukan'; end if;
  if v_movement.status != 'pending' then raise exception 'Hanya movement berstatus pending yang bisa dikonfirmasi'; end if;

  if v_movement.material_color_id is not null then
    select stock_qty into v_current_stock from public.material_colors where id = v_movement.material_color_id;
  else
    select stock_qty into v_current_stock from public.materials where id = v_movement.material_id;
  end if;

  if v_movement.movement_type = 'out' and v_current_stock < v_movement.qty then
    raise exception 'Stok tidak mencukupi. Stok tersedia: %, dibutuhkan: %', v_current_stock, v_movement.qty;
  end if;

  if v_movement.material_color_id is not null then
    update public.material_colors set stock_qty = case
      when v_movement.movement_type = 'in' then stock_qty + v_movement.qty
      when v_movement.movement_type = 'out' then stock_qty - v_movement.qty
      when v_movement.movement_type = 'adjustment' then v_movement.qty
    end where id = v_movement.material_color_id;
  else
    update public.materials set stock_qty = case
      when v_movement.movement_type = 'in' then stock_qty + v_movement.qty
      when v_movement.movement_type = 'out' then stock_qty - v_movement.qty
      when v_movement.movement_type = 'adjustment' then v_movement.qty
    end where id = v_movement.material_id;
  end if;

  update public.stock_movements set status = 'confirmed', confirmed_at = now() where id = p_movement_id;
end;
$$;

create function public.cancel_stock_movement(p_movement_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_movement public.stock_movements%rowtype;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_movement from public.stock_movements where id = p_movement_id and user_id = v_user_id;
  if not found then raise exception 'Stock movement tidak ditemukan'; end if;
  if v_movement.status != 'pending' then raise exception 'Hanya movement berstatus pending yang bisa dibatalkan'; end if;
  update public.stock_movements set status = 'cancelled' where id = p_movement_id;
end;
$$;

create function public.give_cash_advance(
  p_staff_id uuid, p_amount numeric, p_purpose text default null, p_date date default current_date
)
returns public.cash_advances language plpgsql security definer set search_path = public as $$
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

  select id into v_category_id from public.categories
  where user_id = v_user_id and type = 'expense' and name = 'Uang Muka Purchasing' limit 1;
  if v_category_id is null then
    insert into public.categories (user_id, name, type) values (v_user_id, 'Uang Muka Purchasing', 'expense')
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

create function public.approve_purchasing_report(p_report_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_report public.purchasing_reports;
  v_staff_name text;
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
    left join public.categories c on c.id = pri.category_id
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

create function public.reject_purchasing_report(p_report_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  update public.purchasing_reports
  set status = 'rejected',
      notes = coalesce(notes, '') || case when p_reason is not null then E'\nAlasan ditolak: ' || p_reason else '' end
  where id = p_report_id and user_id = v_user_id and status = 'submitted';
  if not found then raise exception 'SPJ tidak ditemukan, bukan milik Anda, atau statusnya bukan submitted'; end if;
end;
$$;

create function public.create_supplier_purchase(
  p_requested_by uuid, p_supplier_name varchar, p_payment_date date, p_items jsonb
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

  insert into public.supplier_purchases (user_id, requested_by, supplier_name, payment_date, status, total_amount)
  values (v_user_id, p_requested_by, p_supplier_name, p_payment_date, 'ordered', 0)
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
    left join public.categories c on c.id = spi.category_id
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

create function public.receive_supplier_purchase(p_purchase_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_purchase public.supplier_purchases; v_item record;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_purchase from public.supplier_purchases where id = p_purchase_id and user_id = v_user_id;
  if v_purchase is null then raise exception 'Data pembelian tidak ditemukan atau bukan milik Anda'; end if;
  if v_purchase.status <> 'ordered' then raise exception 'Status pembelian ini bukan "ordered"'; end if;

  for v_item in select * from public.supplier_purchase_items where purchase_id = p_purchase_id
  loop
    insert into public.stock_movements
      (user_id, material_id, material_color_id, movement_type, qty, unit, status, source_type, source_id, notes, confirmed_at)
    values (v_user_id, v_item.material_id, v_item.material_color_id, 'in', v_item.quantity, v_item.unit, 'confirmed',
            'supplier_purchase', p_purchase_id, 'Dari supplier ' || v_purchase.supplier_name, now());

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

    if v_item.stock_request_id is not null then
      update public.stock_requests set status = 'fulfilled', fulfilled_date = now() where id = v_item.stock_request_id;
    end if;
  end loop;

  update public.supplier_purchases set status = 'received', received_date = now() where id = p_purchase_id;
end;
$$;

revoke execute on function public.confirm_stock_movement(uuid) from public, anon;
grant execute on function public.confirm_stock_movement(uuid) to authenticated;
revoke execute on function public.cancel_stock_movement(uuid) from public, anon;
grant execute on function public.cancel_stock_movement(uuid) to authenticated;
revoke execute on function public.give_cash_advance(uuid, numeric, text, date) from public, anon;
grant execute on function public.give_cash_advance(uuid, numeric, text, date) to authenticated;
revoke execute on function public.approve_purchasing_report(uuid) from public, anon;
grant execute on function public.approve_purchasing_report(uuid) to authenticated;
revoke execute on function public.reject_purchasing_report(uuid, text) from public, anon;
grant execute on function public.reject_purchasing_report(uuid, text) to authenticated;
revoke execute on function public.create_supplier_purchase(uuid, varchar, date, jsonb) from public, anon;
grant execute on function public.create_supplier_purchase(uuid, varchar, date, jsonb) to authenticated;
revoke execute on function public.receive_supplier_purchase(uuid) from public, anon;
grant execute on function public.receive_supplier_purchase(uuid) to authenticated;
