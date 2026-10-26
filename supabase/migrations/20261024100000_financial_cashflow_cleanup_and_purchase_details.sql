-- ===========================================================================
-- Migration: Pembersihan Arus Kas & Rincian Pembelian Material di Transaksi
-- File: 20261024100000_financial_cashflow_cleanup_and_purchase_details.sql
-- ===========================================================================
-- 1. Tambah kolom purchasing_report_id, supplier_purchase_id, dan items_summary ke transactions
-- 2. Index untuk performa
-- 3. Backfill relasi dan items_summary pada data transaksi lama
-- 4. Patch approve_purchasing_report (isi purchasing_report_id dan items_summary)
-- 5. Patch approve_stock_request_supplier (isi supplier_purchase_id dan items_summary)
-- 6. RPC get_transaction_purchase_items(p_transaction_id uuid)
-- ===========================================================================

-- 1. Tambah kolom ke public.transactions
alter table public.transactions
  add column if not exists purchasing_report_id uuid null references public.purchasing_reports(id) on delete set null,
  add column if not exists supplier_purchase_id uuid null references public.supplier_purchases(id) on delete set null,
  add column if not exists items_summary text null;

comment on column public.transactions.purchasing_report_id is 'Relasi ke SPJ Purchasing Report (jika transaksi berasal dari SPJ)';
comment on column public.transactions.supplier_purchase_id is 'Relasi ke Pembelian Direct Supplier (jika transaksi berasal dari supplier purchase)';
comment on column public.transactions.items_summary is 'Ringkasan singkat bahan/kain yang dibeli untuk tampilan cepat di buku kas';

-- 2. Index
create index if not exists idx_transactions_purchasing_report on public.transactions(purchasing_report_id);
create index if not exists idx_transactions_supplier_purchase on public.transactions(supplier_purchase_id);

-- 3. Backfill relasi dari pola description yang sudah ada
update public.transactions
set purchasing_report_id = substring(description from 'SPJ #([a-f0-9\-]{36})')::uuid
where purchasing_report_id is null
  and description ~ 'SPJ #[a-f0-9\-]{36}';

update public.transactions
set supplier_purchase_id = substring(description from 'pembelian supplier #([a-f0-9\-]{36})')::uuid
where supplier_purchase_id is null
  and description ~ 'pembelian supplier #[a-f0-9\-]{36}';

-- Backfill items_summary untuk SPJ
update public.transactions t
set items_summary = sub.summary
from (
  select
    pri.report_id,
    string_agg(
      coalesce(m.name, 'Item') ||
      case when mc.color_name is not null and mc.color_name <> '' then ' ' || mc.color_name else '' end ||
      ' (' || pri.quantity || ' ' || coalesce(pri.unit, m.unit, '') || ')',
      ', '
      order by pri.id
    ) as summary
  from public.purchasing_report_items pri
  left join public.materials m on m.id = pri.material_id
  left join public.material_colors mc on mc.id = pri.material_color_id
  where pri.quantity > 0
  group by pri.report_id
) sub
where t.purchasing_report_id = sub.report_id
  and (t.items_summary is null or t.items_summary = '')
  and t.type = 'expense';

-- Backfill items_summary untuk Direct Supplier
update public.transactions t
set items_summary = sub.summary
from (
  select
    spi.purchase_id,
    string_agg(
      coalesce(m.name, 'Item') ||
      case when mc.color_name is not null and mc.color_name <> '' then ' ' || mc.color_name else '' end ||
      ' (' || spi.quantity || ' ' || coalesce(spi.unit, m.unit, '') || ')',
      ', '
      order by spi.id
    ) as summary
  from public.supplier_purchase_items spi
  left join public.materials m on m.id = spi.material_id
  left join public.material_colors mc on mc.id = spi.material_color_id
  where spi.quantity > 0
  group by spi.purchase_id
) sub
where t.supplier_purchase_id = sub.purchase_id
  and (t.items_summary is null or t.items_summary = '')
  and t.type = 'expense';

-- 4. Patch approve_purchasing_report
create or replace function public.approve_purchasing_report(p_report_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_report        public.purchasing_reports;
  v_staff_name    text;
  v_total         numeric := 0;
  v_item          record;
  v_category      record;
  v_advance       public.cash_advances;
  v_jasa_cat_id   uuid;
  v_akun_1400_id  uuid;
  v_items_summary text;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_report from public.purchasing_reports where id = p_report_id and user_id = v_user_id;
  if v_report is null then raise exception 'Laporan purchasing % tidak ditemukan', p_report_id; end if;
  if v_report.status <> 'submitted' then
    raise exception 'Laporan % belum disubmit atau sudah diapprove (status: %)', p_report_id, v_report.status;
  end if;

  select name into v_staff_name from public.staff where id = v_report.staff_id;

  select coalesce(sum(total_price), 0) into v_total
  from public.purchasing_report_items
  where report_id = p_report_id;

  v_total := v_total + coalesce(v_report.service_fee, 0);

  -- Ringkasan bahan yang dibeli
  select string_agg(
    coalesce(m.name, 'Item') ||
    case when mc.color_name is not null and mc.color_name <> '' then ' ' || mc.color_name else '' end ||
    ' (' || pri.quantity || ' ' || coalesce(pri.unit, m.unit, '') || ')',
    ', '
    order by pri.id
  ) into v_items_summary
  from public.purchasing_report_items pri
  left join public.materials m on m.id = pri.material_id
  left join public.material_colors mc on mc.id = pri.material_color_id
  where pri.report_id = p_report_id and pri.quantity > 0;

  -- Kategori Jasa Purchasing
  select id into v_jasa_cat_id from public.transaction_categories
  where user_id = v_user_id and type = 'expense' and name = 'Jasa Purchasing' limit 1;

  if v_jasa_cat_id is null then
    insert into public.transaction_categories (user_id, name, type, account_id)
    select v_user_id, 'Jasa Purchasing', 'expense', a.id
    from public.accounts a
    where a.user_id = v_user_id and a.code = '6-2000'
    limit 1
    returning id into v_jasa_cat_id;

    if v_jasa_cat_id is null then
      insert into public.transaction_categories (user_id, name, type)
      values (v_user_id, 'Jasa Purchasing', 'expense')
      returning id into v_jasa_cat_id;
    end if;
  end if;

  -- Akun 1-1400 (Uang Muka Karyawan)
  select id into v_akun_1400_id
    from public.accounts
   where user_id = v_user_id and code = '1-1400'
   limit 1;

  -- Stock movements
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

  -- Insert transactions per kategori belanja
  for v_category in
    select pri.category_id, c.name as category_name, sum(pri.total_price) as total
    from public.purchasing_report_items pri
    left join public.transaction_categories c on c.id = pri.category_id
    where pri.report_id = p_report_id
    group by pri.category_id, c.name
  loop
    if v_category.total > 0 then
      insert into public.transactions (
        user_id, category_id, title, amount, type, transaction_date, description,
        purchasing_report_id, items_summary
      )
      values (
        v_user_id, v_category.category_id,
        'SPJ ' || coalesce(v_category.category_name, 'Lainnya') || ' - ' || coalesce(v_staff_name, 'Staf'),
        v_category.total, 'expense', v_report.report_date, 'Otomatis dari SPJ #' || p_report_id,
        p_report_id, v_items_summary
      );
    end if;
  end loop;

  -- Jasa Purchasing
  if v_report.service_fee is not null and v_report.service_fee > 0 then
    insert into public.transactions (
      user_id, category_id, title, amount, type, transaction_date, description,
      purchasing_report_id
    )
    values (
      v_user_id, v_jasa_cat_id,
      'Jasa Purchasing - ' || coalesce(v_staff_name, 'Staf'), v_report.service_fee,
      'expense', v_report.report_date, 'Otomatis dari biaya jasa/transport SPJ #' || p_report_id,
      p_report_id
    );
  end if;

  -- Reversal Uang Muka
  if v_report.cash_advance_id is not null then
    select * into v_advance from public.cash_advances where id = v_report.cash_advance_id;
    if v_advance is not null and v_advance.status = 'outstanding' then
      -- Hubungkan transaksi uang muka lama ke purchasing_report_id jika belum terhubung
      if v_advance.transaction_id is not null then
        update public.transactions
        set purchasing_report_id = p_report_id
        where id = v_advance.transaction_id and purchasing_report_id is null;
      end if;

      insert into public.transactions (
        user_id, category_id, title, amount, type, transaction_date, description,
        counter_account_id, purchasing_report_id
      )
      values (
        v_user_id, null,
        'Reversal Uang Muka - ' || coalesce(v_staff_name, 'Staf'), v_advance.amount,
        'income', v_report.report_date, 'Otomatis dari approval SPJ #' || p_report_id,
        v_akun_1400_id, p_report_id
      );
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

-- 5. Patch approve_stock_request_supplier
drop function if exists public.approve_stock_request_supplier(uuid[], uuid, varchar, date, jsonb, text);

create or replace function public.approve_stock_request_supplier(
  p_request_ids    uuid[],
  p_requested_by   uuid,
  p_supplier_name  varchar(255),
  p_purchase_date  date default current_date,
  p_items          jsonb default '[]'::jsonb,
  p_notes          text default null
)
returns public.supplier_purchases
language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_req_id        uuid;
  v_req           public.stock_requests;
  v_purchase      public.supplier_purchases;
  v_item          jsonb;
  v_total         numeric := 0;
  v_line_total    numeric;
  v_cat           record;
  v_items_summary text;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  foreach v_req_id in array p_request_ids
  loop
    select * into v_req from public.stock_requests where id = v_req_id and user_id = v_user_id;
    if v_req is null then raise exception 'Pengajuan restock % tidak ditemukan', v_req_id; end if;
    if v_req.status <> 'pending' and v_req.status <> 'draft_auto' and v_req.status <> 'approved' then
      raise exception 'Pengajuan restock % bukan berstatus pending/approved (status: %)', v_req_id, v_req.status;
    end if;
    if v_req.fulfillment_type <> 'supplier' then
      raise exception 'Pengajuan restock % bukan kategori Supplier', v_req_id;
    end if;
  end loop;

  insert into public.supplier_purchases (
    user_id, supplier_name, purchase_date, status, total_amount, notes
  )
  values (
    v_user_id, p_supplier_name, p_purchase_date, 'ordered', 0, p_notes
  )
  returning * into v_purchase;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
    v_total := v_total + v_line_total;
    insert into public.supplier_purchase_items
      (user_id, purchase_id, material_id, material_color_id, category_id,
       stock_request_id, quantity, unit, unit_price, total_price)
    values (
      v_user_id,
      v_purchase.id,
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

  update public.supplier_purchases
  set total_amount = v_total
  where id = v_purchase.id;

  -- Ringkasan bahan yang dibeli
  select string_agg(
    coalesce(m.name, 'Item') ||
    case when mc.color_name is not null and mc.color_name <> '' then ' ' || mc.color_name else '' end ||
    ' (' || spi.quantity || ' ' || coalesce(spi.unit, m.unit, '') || ')',
    ', '
    order by spi.id
  ) into v_items_summary
  from public.supplier_purchase_items spi
  left join public.materials m on m.id = spi.material_id
  left join public.material_colors mc on mc.id = spi.material_color_id
  where spi.purchase_id = v_purchase.id and spi.quantity > 0;

  for v_cat in
    select spi.category_id, c.name as category_name, sum(spi.total_price) as total
    from public.supplier_purchase_items spi
    left join public.transaction_categories c on c.id = spi.category_id
    where spi.purchase_id = v_purchase.id
    group by spi.category_id, c.name
  loop
    if v_cat.total > 0 then
      insert into public.transactions (
        user_id, category_id, title, amount, type, transaction_date, description,
        supplier_purchase_id, items_summary
      )
      values (
        v_user_id,
        v_cat.category_id,
        'Pembelian ' || coalesce(v_cat.category_name, 'Lainnya') || ' - ' || p_supplier_name,
        v_cat.total,
        'expense',
        p_purchase_date,
        'Otomatis dari pembelian supplier #' || v_purchase.id || coalesce(' - ' || nullif(p_notes, ''), ''),
        v_purchase.id,
        v_items_summary
      );
    end if;
  end loop;

  foreach v_req_id in array p_request_ids
  loop
    update public.stock_requests
    set status = 'ordered',
        approved_at = now(),
        supplier_purchase_id = v_purchase.id
    where id = v_req_id;
  end loop;

  return v_purchase;
end;
$$;

revoke execute on function public.approve_stock_request_supplier(uuid[], uuid, varchar, date, jsonb, text) from public, anon;
grant  execute on function public.approve_stock_request_supplier(uuid[], uuid, varchar, date, jsonb, text) to authenticated;

-- 6. RPC: get_transaction_purchase_items
create or replace function public.get_transaction_purchase_items(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public as $$
declare
  v_user_id   uuid := auth.uid();
  v_trx       public.transactions;
  v_items     jsonb := '[]'::jsonb;
  v_result    jsonb;
  v_staff     text;
  v_supplier  text;
  v_doc_date  date;
  v_service   numeric := 0;
  v_total     numeric := 0;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_trx
  from public.transactions
  where id = p_transaction_id and user_id = v_user_id;

  if v_trx is null then
    return null;
  end if;

  -- 1. Bila bersumber dari SPJ
  if v_trx.purchasing_report_id is not null then
    select s.name, pr.report_date, coalesce(pr.service_fee, 0), pr.total_amount
      into v_staff, v_doc_date, v_service, v_total
      from public.purchasing_reports pr
      left join public.staff s on s.id = pr.staff_id
     where pr.id = v_trx.purchasing_report_id and pr.user_id = v_user_id;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', pri.id,
        'material_name', coalesce(m.name, 'Material'),
        'color_name', mc.color_name,
        'quantity', pri.quantity,
        'unit', coalesce(pri.unit, m.unit),
        'unit_price', pri.unit_price,
        'total_price', pri.total_price,
        'description', pri.description
      ) order by pri.id
    ), '[]'::jsonb)
    into v_items
    from public.purchasing_report_items pri
    left join public.materials m on m.id = pri.material_id
    left join public.material_colors mc on mc.id = pri.material_color_id
    where pri.report_id = v_trx.purchasing_report_id;

    return jsonb_build_object(
      'source_type', 'spj',
      'source_id', v_trx.purchasing_report_id,
      'title', v_trx.title,
      'staff_name', v_staff,
      'document_date', v_doc_date,
      'service_fee', v_service,
      'total_amount', v_total,
      'items', v_items
    );

  -- 2. Bila bersumber dari Supplier Purchase
  elsif v_trx.supplier_purchase_id is not null then
    select sp.supplier_name, sp.purchase_date, sp.total_amount
      into v_supplier, v_doc_date, v_total
      from public.supplier_purchases sp
     where sp.id = v_trx.supplier_purchase_id and sp.user_id = v_user_id;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', spi.id,
        'material_name', coalesce(m.name, 'Material'),
        'color_name', mc.color_name,
        'quantity', spi.quantity,
        'unit', coalesce(spi.unit, m.unit),
        'unit_price', spi.unit_price,
        'total_price', spi.total_price,
        'description', null
      ) order by spi.id
    ), '[]'::jsonb)
    into v_items
    from public.supplier_purchase_items spi
    left join public.materials m on m.id = spi.material_id
    left join public.material_colors mc on mc.id = spi.material_color_id
    where spi.purchase_id = v_trx.supplier_purchase_id;

    return jsonb_build_object(
      'source_type', 'supplier',
      'source_id', v_trx.supplier_purchase_id,
      'title', v_trx.title,
      'supplier_name', v_supplier,
      'document_date', v_doc_date,
      'service_fee', 0,
      'total_amount', v_total,
      'items', v_items
    );
  end if;

  return null;
end;
$$;

revoke execute on function public.get_transaction_purchase_items(uuid) from public, anon;
grant  execute on function public.get_transaction_purchase_items(uuid) to authenticated;
