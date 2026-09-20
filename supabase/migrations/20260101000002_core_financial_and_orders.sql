-- =========================================================================
-- SIKon — Clean Baseline 2/5: Core Financial & Orders
-- =========================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name varchar(100) not null,
  type varchar(20) not null,
  created_at timestamptz default now(),
  constraint categories_type_check check (type in ('income', 'expense'))
);
alter table public.categories enable row level security;
create policy "Manage own categories" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name varchar not null,
  phone varchar,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  constraint sales_user_id_name_key unique (user_id, name)
);
alter table public.sales enable row level security;
create policy "Manage own sales" on public.sales
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- production_status: status PENGERJAAN (quotation/pending disiapkan untuk fitur
-- surat penawaran & self-entry-order-by-sales mendatang, belum ada UI-nya sekarang).
-- status: status PEMBAYARAN (belum_lunas/lunas). Dua dimensi berbeda, jangan dicampur.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  order_id varchar not null,
  sales_id uuid references public.sales(id) on delete set null,
  customer_name varchar not null,
  total_price numeric not null default 0,
  ongkir numeric not null default 0,
  status varchar not null default 'belum_lunas',
  production_status varchar not null default 'production',
  bonus_paid boolean not null default false,
  order_date date not null default current_date,
  created_at timestamptz default now(),
  constraint orders_status_check check (status in ('belum_lunas', 'lunas')),
  constraint orders_production_status_check check (production_status in ('quotation', 'pending', 'production', 'ready', 'completed')),
  constraint orders_user_id_order_id_key unique (user_id, order_id)
);
alter table public.orders enable row level security;
create policy "Manage own orders" on public.orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_orders_user_status on public.orders(user_id, status);
create index idx_orders_sales on public.orders(sales_id);
create index idx_orders_production_status on public.orders(production_status);
comment on column public.orders.status is 'Status PEMBAYARAN: belum_lunas / lunas.';
comment on column public.orders.production_status is 'Status PENGERJAAN. quotation/pending disiapkan untuk fitur mendatang, belum ada alur UI-nya sekarang.';

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  product_id uuid references public.products(id) on delete set null,
  category_id uuid references public.product_categories(id) on delete set null,
  name_item varchar not null,
  bahan varchar,
  qty numeric not null default 1,
  price numeric not null default 0,
  total_price numeric not null default 0,
  hpp_per_unit_snapshot numeric,
  hpp_total_snapshot numeric,
  embroidery_cost_per_unit numeric not null default 0,
  embroidery_details jsonb,
  created_at timestamptz default now(),
  constraint order_items_embroidery_cost_check check (embroidery_cost_per_unit >= 0)
);
alter table public.order_items enable row level security;
create policy "Manage own order items" on public.order_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_order_items_order on public.order_items(order_id);
create index idx_order_items_product on public.order_items(product_id);
create index idx_order_items_category on public.order_items(category_id);
comment on column public.order_items.bahan is 'Free text lama, sudah digantikan order_item_fabrics. Dibiarkan nullable, tidak dipakai form baru.';

create table public.order_item_fabrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  product_fabric_slot_id uuid references public.product_fabric_slots(id) on delete set null,
  material_id uuid not null references public.materials(id),
  material_color_id uuid references public.material_colors(id) on delete set null,
  usage_qty_snapshot numeric not null,
  price_snapshot numeric not null,
  line_cost_snapshot numeric not null,
  created_at timestamptz default now(),
  constraint order_item_fabrics_usage_qty_check check (usage_qty_snapshot > 0),
  constraint order_item_fabrics_price_check check (price_snapshot >= 0)
);
alter table public.order_item_fabrics enable row level security;
create policy "Manage own order item fabrics" on public.order_item_fabrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_order_item_fabrics_order_item on public.order_item_fabrics(order_item_id);
create index idx_order_item_fabrics_material on public.order_item_fabrics(material_id);

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  amount numeric not null,
  payment_type varchar not null,
  payment_method varchar,
  payment_date date not null default current_date,
  transaction_id uuid,
  created_at timestamptz default now(),
  constraint order_payments_amount_check check (amount > 0),
  constraint order_payments_payment_type_check check (payment_type in ('dp', 'pelunasan'))
);
alter table public.order_payments enable row level security;
create policy "Manage own order payments" on public.order_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_order_payments_order on public.order_payments(order_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  title varchar(255) not null,
  amount numeric not null,
  type varchar(20) not null,
  transaction_date date not null default current_date,
  description text,
  created_at timestamptz default now(),
  constraint transactions_type_check check (type in ('income', 'expense'))
);
alter table public.transactions enable row level security;
create policy "Manage own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_transactions_order on public.transactions(order_id);

alter table public.order_payments add constraint order_payments_transaction_id_fkey
  foreign key (transaction_id) references public.transactions(id) on delete set null;

create table public.company_settings (
  user_id uuid primary key references auth.users(id),
  saldo_awal numeric not null default 0,
  company_name varchar,
  address text,
  phone varchar,
  logo_url text,
  stamp_url text,
  signature_url text,
  updated_at timestamptz default now()
);
alter table public.company_settings enable row level security;
create policy "Manage own settings" on public.company_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.company_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  bank_name varchar not null,
  account_number varchar not null,
  account_holder_name varchar not null,
  is_primary boolean not null default false,
  created_at timestamptz default now()
);
alter table public.company_bank_accounts enable row level security;
create policy "Manage own bank accounts" on public.company_bank_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_bank_accounts_user on public.company_bank_accounts(user_id);


-- =========================================================================
-- FUNCTIONS (core)
-- =========================================================================

create function public.calc_order_item_total()
returns trigger language plpgsql set search_path = public as $$
begin
  new.total_price := new.qty * new.price;
  return new;
end;
$$;

create function public.sync_order_total_price()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.orders
  set total_price = coalesce(
    (select sum(total_price) from public.order_items where order_id = coalesce(new.order_id, old.order_id)), 0)
  where id = coalesce(new.order_id, old.order_id);
  return null;
end;
$$;

create function public.generate_order_code()
returns trigger language plpgsql set search_path = public as $$
declare v_count integer;
begin
  if new.order_id is null or new.order_id = '' then
    select count(*) + 1 into v_count from public.orders where user_id = new.user_id;
    new.order_id := 'ORD-' || lpad(v_count::text, 4, '0');
  end if;
  return new;
end;
$$;

create function public.recompute_order_status(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_paid numeric;
begin
  select (total_price + ongkir) into v_total from public.orders where id = p_order_id;
  select coalesce(sum(amount), 0) into v_paid from public.order_payments where order_id = p_order_id;
  update public.orders
  set status = case when v_total > 0 and v_paid >= v_total then 'lunas' else 'belum_lunas' end
  where id = p_order_id;
end;
$$;

create function public.recompute_status_on_order_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_order_status(new.id);
  return null;
end;
$$;

create function public.record_order_payment(
  p_order_id uuid, p_amount numeric, p_payment_type varchar,
  p_payment_date date default current_date, p_payment_method varchar default null, p_category_id uuid default null
)
returns public.order_payments language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders;
  v_payment public.order_payments;
  v_transaction_id uuid;
  v_label text;
  v_category_id uuid := p_category_id;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = v_user_id;
  if v_order is null then raise exception 'Order tidak ditemukan atau bukan milik Anda'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Jumlah pembayaran harus lebih dari 0'; end if;

  if v_category_id is null then
    select id into v_category_id from public.categories
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

create function public.delete_order_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_payment public.order_payments;
begin
  select * into v_payment from public.order_payments where id = p_payment_id and user_id = v_user_id;
  if v_payment is null then raise exception 'Data pembayaran tidak ditemukan atau bukan milik Anda'; end if;
  delete from public.transactions where id = v_payment.transaction_id and user_id = v_user_id;
  delete from public.order_payments where id = p_payment_id;
  perform public.recompute_order_status(v_payment.order_id);
end;
$$;

create function public.update_owner_email(p_new_email varchar)
returns void language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  if p_new_email is null or p_new_email = '' or p_new_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Format email tidak valid';
  end if;
  if exists (select 1 from auth.users where email = p_new_email and id <> v_user_id) then
    raise exception 'Email sudah digunakan akun lain';
  end if;
  update auth.users set email = p_new_email, email_confirmed_at = now(), updated_at = now() where id = v_user_id;
  update auth.identities
  set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(p_new_email)), updated_at = now()
  where user_id = v_user_id and provider = 'email';
end;
$$;

revoke execute on function public.calc_order_item_total() from public, anon, authenticated;
revoke execute on function public.sync_order_total_price() from public, anon, authenticated;
revoke execute on function public.generate_order_code() from public, anon, authenticated;
revoke execute on function public.recompute_order_status(uuid) from public, anon, authenticated;
revoke execute on function public.recompute_status_on_order_change() from public, anon, authenticated;

revoke execute on function public.record_order_payment(uuid, numeric, varchar, date, varchar, uuid) from public, anon;
grant execute on function public.record_order_payment(uuid, numeric, varchar, date, varchar, uuid) to authenticated;
revoke execute on function public.delete_order_payment(uuid) from public, anon;
grant execute on function public.delete_order_payment(uuid) to authenticated;
revoke execute on function public.update_owner_email(varchar) from public, anon;
grant execute on function public.update_owner_email(varchar) to authenticated;

create trigger trg_calc_order_item_total before insert or update on public.order_items
  for each row execute function public.calc_order_item_total();
create trigger trg_sync_order_total_price after insert or update or delete on public.order_items
  for each row execute function public.sync_order_total_price();
create trigger trg_generate_order_code before insert on public.orders
  for each row execute function public.generate_order_code();
create trigger trg_recompute_status_on_order_change after update of total_price, ongkir on public.orders
  for each row execute function public.recompute_status_on_order_change();


-- =========================================================================
-- VIEWS
-- =========================================================================
-- FIX dari baseline lama: orders_with_balance sebelumnya TIDAK menyertakan
-- production_status & bonus_paid walau kolomnya sudah ada di tabel orders
-- (view tidak ikut ter-update saat kolom baru ditambah). Di sini disertakan.

create view public.orders_with_balance
with (security_invoker = true) as
select
  o.*,
  s.name as sales_name,
  (o.total_price + o.ongkir) as grand_total,
  coalesce(p.paid_amount, 0) as paid_amount,
  (o.total_price + o.ongkir) - coalesce(p.paid_amount, 0) as remaining_amount
from public.orders o
left join public.sales s on s.id = o.sales_id
left join (
  select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
) p on p.order_id = o.id;

create view public.sales_performance
with (security_invoker = true) as
select
  s.id as sales_id, s.user_id, s.name as sales_name, s.is_active,
  count(o.id) as total_orders,
  coalesce(sum(o.total_price + o.ongkir), 0) as total_revenue,
  coalesce(sum(coalesce(p.paid_amount, 0)), 0) as total_paid,
  coalesce(sum((o.total_price + o.ongkir) - coalesce(p.paid_amount, 0)) filter (where o.status = 'belum_lunas'), 0) as total_outstanding
from public.sales s
left join public.orders o on o.sales_id = s.id
left join (
  select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
) p on p.order_id = o.id
group by s.id, s.user_id, s.name, s.is_active;

grant select on public.orders_with_balance to authenticated;
grant select on public.sales_performance to authenticated;
