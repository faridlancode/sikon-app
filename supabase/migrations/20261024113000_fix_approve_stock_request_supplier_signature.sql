-- =========================================================================
-- Migration: Fix Parameter Signature approve_stock_request_supplier & get_transaction_purchase_items
-- File: 20261024113000_fix_approve_stock_request_supplier_signature.sql
-- =========================================================================
-- 1. Perbaiki signature approve_stock_request_supplier:
--    Gunakan p_payment_date (bukan p_purchase_date) agar cocok dengan payload frontend
--    dan skema types.ts (PostgREST mencari rpc dengan nama parameter yang persis).
-- 2. Perbaiki query get_transaction_purchase_items:
--    Gunakan kolom sp.payment_date dari tabel supplier_purchases (bukan purchase_date).
-- =========================================================================

-- 1. Drop function lama yang overload / beda nama parameter
drop function if exists public.approve_stock_request_supplier(uuid[], uuid, varchar, date, jsonb, text);
drop function if exists public.approve_stock_request_supplier(uuid[], uuid, varchar, date, jsonb);

-- 2. Buat ulang approve_stock_request_supplier dengan signature presisi
create or replace function public.approve_stock_request_supplier(
  p_request_ids  uuid[],
  p_requested_by uuid,
  p_supplier_name varchar,
  p_payment_date  date,
  p_items         jsonb,
  p_notes         text default null
)
returns public.supplier_purchases
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_purchase      public.supplier_purchases;
  v_item          jsonb;
  v_total         numeric := 0;
  v_line_total    numeric;
  v_cat           record;
  v_req_id        uuid;
  v_req           public.stock_requests;
  v_items_summary text;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal 1 item pembelian';
  end if;

  -- Validasi request ids jika ada
  if p_request_ids is not null and array_length(p_request_ids, 1) > 0 then
    foreach v_req_id in array p_request_ids
    loop
      select * into v_req
      from public.stock_requests
      where id = v_req_id and user_id = v_user_id;

      if v_req is null then
        raise exception 'Pengajuan restock % tidak ditemukan', v_req_id;
      end if;

      if v_req.status not in ('pending', 'draft_auto', 'approved') then
        raise exception
          'Pengajuan restock % tidak bisa diproses (status saat ini: %). '
          'Hanya status pending, approved, atau draft_auto yang bisa dilanjutkan ke pembelian supplier.',
          v_req_id, v_req.status;
      end if;

      if v_req.fulfillment_type <> 'supplier_purchase' then
        raise exception 'Pengajuan restock % bukan kategori Direct Supplier', v_req_id;
      end if;
    end loop;
  end if;

  -- 1. Insert supplier_purchases
  insert into public.supplier_purchases (
    user_id, requested_by, supplier_name, payment_date, notes, status, total_amount
  )
  values (
    v_user_id, p_requested_by, p_supplier_name, p_payment_date, p_notes, 'ordered', 0
  )
  returning * into v_purchase;

  -- 2. Insert items
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

  -- 3. Update total
  update public.supplier_purchases
  set total_amount = v_total
  where id = v_purchase.id;

  -- 4. Ringkasan bahan yang dibeli untuk transaksi buku kas
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

  -- 5. Insert transaction expense per kategori
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
        p_payment_date,
        'Otomatis dari supplier purchase #' || v_purchase.id,
        v_purchase.id,
        v_items_summary
      );
    end if;
  end loop;

  -- 6. Link request IDs -> supplier_purchase, update status in_progress
  if p_request_ids is not null and array_length(p_request_ids, 1) > 0 then
    update public.stock_requests
    set status              = 'in_progress',
        supplier_purchase_id = v_purchase.id
    where id = any(p_request_ids)
      and user_id = v_user_id
      and status in ('pending', 'draft_auto', 'approved');
  end if;

  select * into v_purchase from public.supplier_purchases where id = v_purchase.id;
  return v_purchase;
end;
$$;

revoke execute on function public.approve_stock_request_supplier(uuid[], uuid, varchar, date, jsonb, text) from public, anon;
grant  execute on function public.approve_stock_request_supplier(uuid[], uuid, varchar, date, jsonb, text) to authenticated;

-- 7. Perbaiki get_transaction_purchase_items agar membaca sp.payment_date
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
    select sp.supplier_name, sp.payment_date, sp.total_amount
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
