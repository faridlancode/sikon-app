-- =========================================================================
-- SIKon — Fix: approve_stock_request_supplier menerima status 'approved'
-- =========================================================================
-- Root cause: bulk_approve_stock_requests mengubah status 'pending' →
-- 'approved' untuk semua tipe (termasuk supplier_purchase). Tapi RPC
-- approve_stock_request_supplier hanya menerima 'pending' / 'draft_auto'.
-- Akibatnya request yang sudah bulk-approved tidak bisa dilanjutkan ke
-- pembelian supplier (error "bukan berstatus pending").
--
-- Fix: tambahkan 'approved' ke whitelist validasi status di RPC.
-- Tidak ada perubahan skema tabel — hanya replace fungsi.
-- =========================================================================

create or replace function public.approve_stock_request_supplier(
  p_request_ids  uuid[],
  p_requested_by uuid,
  p_supplier_name varchar,
  p_payment_date  date,
  p_items         jsonb,
  p_notes         text default null
)
returns public.supplier_purchases language plpgsql security definer set search_path = public as $$
declare
  v_user_id  uuid := auth.uid();
  v_purchase public.supplier_purchases;
  v_item     jsonb;
  v_total    numeric := 0;
  v_line_total numeric;
  v_cat      record;
  v_req_id   uuid;
  v_req      public.stock_requests;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
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

      -- FIX: tambahkan 'approved' ke whitelist (sebelumnya hanya 'pending' dan 'draft_auto')
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

  -- 4. Insert transaction expense per kategori
  for v_cat in
    select spi.category_id, c.name as category_name, sum(spi.total_price) as total
    from public.supplier_purchase_items spi
    left join public.transaction_categories c on c.id = spi.category_id
    where spi.purchase_id = v_purchase.id
    group by spi.category_id, c.name
  loop
    if v_cat.total > 0 then
      insert into public.transactions (
        user_id, category_id, title, amount, type, transaction_date, description
      )
      values (
        v_user_id,
        v_cat.category_id,
        'Pembelian ' || coalesce(v_cat.category_name, 'Lainnya') || ' - ' || p_supplier_name,
        v_cat.total,
        'expense',
        p_payment_date,
        'Otomatis dari supplier purchase #' || v_purchase.id
      );
    end if;
  end loop;

  -- 5. Link request IDs → supplier_purchase, update status in_progress
  if p_request_ids is not null and array_length(p_request_ids, 1) > 0 then
    update public.stock_requests
    set status              = 'in_progress',
        supplier_purchase_id = v_purchase.id
    where id = any(p_request_ids)
      and user_id = v_user_id
      and status in ('pending', 'draft_auto', 'approved');
  end if;

  -- Return purchase dengan total terupdate
  select * into v_purchase from public.supplier_purchases where id = v_purchase.id;
  return v_purchase;
end;
$$;

revoke execute on function public.approve_stock_request_supplier(uuid[], uuid, varchar, date, jsonb, text)
  from public, anon;
grant  execute on function public.approve_stock_request_supplier(uuid[], uuid, varchar, date, jsonb, text)
  to authenticated;
