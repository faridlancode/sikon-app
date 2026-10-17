-- ============================================================================
-- Migration 64 (M8): nota_rpc.sql
-- Keterangan:
-- 1. RPC get_or_create_nota(p_order_id uuid):
--    - Hanya untuk pesanan berstatus 'lunas'
--    - Idempoten: mengembalikan nota yang sama bila sudah ada
--    - Mengunci rincian item & riwayat pembayaran ke dalam snapshot JSON
-- ============================================================================

create or replace function public.get_or_create_nota(
  p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_order        record;
  v_existing_id  uuid;
  v_nota_id      uuid;
  v_nota_no      varchar;
  v_items_json   jsonb;
  v_payments_json jsonb;
  v_subtotal     numeric := 0;
  v_paid_amount  numeric := 0;
  v_grand_total  numeric := 0;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id and user_id = v_uid;

  if v_order is null then
    raise exception 'Pesanan tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  -- 1. Validasi status harus 'lunas'
  if v_order.status <> 'lunas' then
    raise exception 'Order belum lunas' using errcode = '22023';
  end if;

  -- 2. Idempotensi: jika nota untuk pesanan ini sudah ada, kembalikan ID nota tersebut
  select id into v_existing_id
    from public.notas
   where order_id = p_order_id and user_id = v_uid;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  -- 3. Bangun snapshot items
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', coalesce(nullif(trim(oi.name_item), ''), p.name, 'Item Pesanan'),
        'qty', oi.qty,
        'unit_price', oi.price,
        'subtotal', (oi.qty * oi.price)
      ) order by oi.created_at asc
    ),
    '[]'::jsonb
  ),
  coalesce(sum(oi.qty * oi.price), 0)
  into v_items_json, v_subtotal
  from public.order_items oi
  left join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id and oi.user_id = v_uid;

  -- 4. Bangun snapshot payments
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', op.payment_date,
        'type', op.payment_type,
        'method', op.payment_method,
        'amount', op.amount
      ) order by op.payment_date asc, op.created_at asc
    ),
    '[]'::jsonb
  ),
  coalesce(sum(op.amount), 0)
  into v_payments_json, v_paid_amount
  from public.order_payments op
  where op.order_id = p_order_id and op.user_id = v_uid;

  v_grand_total := v_subtotal + coalesce(v_order.ongkir, 0);

  -- 5. Buat nomor nota baru NTA-YYYYMM-NNNN
  v_nota_no := public.generate_document_no(v_uid, 'nota', current_date);

  -- 6. Insert baris nota
  insert into public.notas (
    user_id,
    nota_no,
    nota_date,
    order_id,
    order_code,
    customer_name,
    grand_total,
    paid_amount,
    snapshot,
    notes,
    created_at
  ) values (
    v_uid,
    v_nota_no,
    current_date,
    p_order_id,
    v_order.order_id,
    coalesce(nullif(trim(v_order.customer_name), ''), 'Pelanggan'),
    v_grand_total,
    v_paid_amount,
    jsonb_build_object(
      'items', v_items_json,
      'payments', v_payments_json,
      'ongkir', coalesce(v_order.ongkir, 0)
    ),
    'Nota pesanan ' || coalesce(v_order.order_id, ''),
    now()
  )
  returning id into v_nota_id;

  return v_nota_id;
end;
$$;

revoke execute on function public.get_or_create_nota(uuid) from public, anon;
grant  execute on function public.get_or_create_nota(uuid) to authenticated;
