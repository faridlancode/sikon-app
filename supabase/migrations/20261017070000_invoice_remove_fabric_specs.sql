-- ============================================================================
-- Migration 61: invoice_remove_fabric_specs.sql
-- Keterangan:
-- 1. Pada invoice tidak dicantumkan spesifikasi kain (komposisi/lebar/gsm),
--    hanya nama kain dan warna yang dicantumkan.
-- 2. Update create_invoice_from_quotation: menyalin bahan (kain & warna) tanpa fabric_specs.
-- 3. Update create_invoice_from_order: menyalin bahan (kain & warna) dari order_item_fabrics.
-- ============================================================================

-- 1. Update create_invoice_from_quotation
create or replace function public.create_invoice_from_quotation(
  p_quotation_id uuid,
  p_invoice_type text default 'dp',
  p_amount_due   numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_quotation    record;
  v_invoice_id   uuid;
  v_invoice_no   varchar;
  v_subtotal     numeric := 0;
  v_amount_due   numeric;
  v_q_item       record;
  v_desc_parts   text[];
  v_existing_inv record;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_invoice_type not in ('dp', 'pelunasan', 'penuh') then
    raise exception 'Jenis invoice tidak valid' using errcode = '22023';
  end if;

  select * into v_quotation
    from public.quotations
   where id = p_quotation_id and user_id = v_uid;

  if v_quotation is null then
    raise exception 'Surat penawaran tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  -- Hitung subtotal dari quotation_items
  select coalesce(sum(qty * unit_price), 0)
    into v_subtotal
    from public.quotation_items
   where quotation_id = p_quotation_id and user_id = v_uid;

  if v_subtotal <= 0 then
    raise exception 'Surat penawaran tidak memiliki item barang yang valid' using errcode = '22023';
  end if;

  -- Tentukan amount_due
  if p_amount_due is not null then
    v_amount_due := p_amount_due;
  elsif p_invoice_type = 'dp' then
    v_amount_due := round(v_subtotal * coalesce(v_quotation.dp_percent, 50) / 100);
  else
    v_amount_due := v_subtotal;
  end if;

  -- Cek apakah invoice untuk quotation ini sudah pernah dibuat sebelumnya
  select * into v_existing_inv
    from public.invoices
   where quotation_id = p_quotation_id and user_id = v_uid and status <> 'cancelled'
   limit 1;

  if v_existing_inv.id is not null then
    -- Perbarui invoice yang sudah ada
    v_invoice_id := v_existing_inv.id;

    update public.invoices set
      customer_name    = v_quotation.customer_name,
      customer_address = v_quotation.customer_address,
      due_date         = coalesce(v_quotation.valid_until, current_date + 14),
      invoice_type     = p_invoice_type,
      subtotal         = v_subtotal,
      amount_due       = v_amount_due,
      bank_account_id  = v_quotation.bank_account_id,
      notes            = v_quotation.notes,
      updated_at       = now()
    where id = v_invoice_id;

    -- Hapus item lama dan ganti dengan yang baru
    delete from public.invoice_items where invoice_id = v_invoice_id and user_id = v_uid;
  else
    -- Buat nomor invoice baru
    v_invoice_no := public.generate_document_no(v_uid, 'invoice', current_date);

    insert into public.invoices (
      user_id, invoice_no, invoice_date, due_date,
      invoice_type, customer_name, customer_address,
      source_type, quotation_id, order_id,
      subtotal, shipping_cost, paid_amount, amount_due,
      bank_account_id, notes, status, created_at, updated_at
    ) values (
      v_uid, v_invoice_no, current_date, coalesce(v_quotation.valid_until, current_date + 14),
      p_invoice_type, v_quotation.customer_name, v_quotation.customer_address,
      'quotation', p_quotation_id, v_quotation.order_id,
      v_subtotal, 0, 0, v_amount_due,
      v_quotation.bank_account_id, v_quotation.notes, 'draft', now(), now()
    )
    returning id into v_invoice_id;
  end if;

  -- Salin item dari quotation_items ke invoice_items
  for v_q_item in
    select * from public.quotation_items
     where quotation_id = p_quotation_id and user_id = v_uid
     order by sort_order asc
  loop
    v_desc_parts := array[]::text[];

    -- Hanya sertakan nama kain dan warna (spesifikasi teknis diabaikan)
    if nullif(trim(v_q_item.fabric_type), '') is not null or nullif(trim(v_q_item.fabric_color), '') is not null then
      v_desc_parts := array_append(
        v_desc_parts,
        'Bahan: ' || concat_ws(' - ', nullif(trim(v_q_item.fabric_type), ''), nullif(trim(v_q_item.fabric_color), ''))
      );
    end if;

    if nullif(trim(v_q_item.sewing_notes), '') is not null then
      v_desc_parts := array_append(v_desc_parts, 'Jahitan: ' || trim(v_q_item.sewing_notes));
    end if;
    if nullif(trim(v_q_item.embroidery_notes), '') is not null then
      v_desc_parts := array_append(v_desc_parts, 'Bordir: ' || trim(v_q_item.embroidery_notes));
    end if;
    if nullif(trim(v_q_item.print_notes), '') is not null then
      v_desc_parts := array_append(v_desc_parts, 'Sablon: ' || trim(v_q_item.print_notes));
    end if;

    insert into public.invoice_items (
      invoice_id, user_id, sort_order,
      product_name, description,
      qty, unit, unit_price
    ) values (
      v_invoice_id, v_uid, v_q_item.sort_order,
      v_q_item.product_name,
      nullif(array_to_string(v_desc_parts, ' | '), ''),
      v_q_item.qty,
      v_q_item.unit,
      v_q_item.unit_price
    );
  end loop;

  return v_invoice_id;
end;
$$;

revoke execute on function public.create_invoice_from_quotation(uuid, text, numeric) from public, anon;
grant  execute on function public.create_invoice_from_quotation(uuid, text, numeric) to authenticated;

-- 2. Update create_invoice_from_order
create or replace function public.create_invoice_from_order(
  p_order_id     uuid,
  p_invoice_type text default 'pelunasan'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_order        record;
  v_quotation_id uuid;
  v_bank_acct_id uuid;
  v_invoice_id   uuid;
  v_invoice_no   varchar;
  v_subtotal     numeric := 0;
  v_shipping     numeric := 0;
  v_paid_amount  numeric := 0;
  v_amount_due   numeric := 0;
  v_o_item       record;
  v_sort_order   int := 0;
  v_existing_inv record;
  v_desc_parts   text[];
  v_fabrics_str  text;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_invoice_type not in ('dp', 'pelunasan', 'penuh') then
    raise exception 'Jenis invoice tidak valid' using errcode = '22023';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id and user_id = v_uid;

  if v_order is null then
    raise exception 'Pesanan tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  -- 1. Snapshot subtotal dari order_items
  select coalesce(sum(qty * price), 0)
    into v_subtotal
    from public.order_items
   where order_id = p_order_id and user_id = v_uid;

  if v_subtotal <= 0 then
    raise exception 'Pesanan tidak memiliki item barang yang valid' using errcode = '22023';
  end if;

  -- 2. Ongkos kirim
  v_shipping := coalesce(v_order.ongkir, 0);

  -- 3. Snapshot total pembayaran yang telah diterima dari order_payments
  select coalesce(sum(amount), 0)
    into v_paid_amount
    from public.order_payments
   where order_id = p_order_id and user_id = v_uid;

  -- 4. Hitung amount_due sisa tagihan
  if p_invoice_type = 'pelunasan' then
    v_amount_due := greatest(0, (v_subtotal + v_shipping) - v_paid_amount);
  elsif p_invoice_type = 'dp' then
    v_amount_due := greatest(0, round((v_subtotal + v_shipping) * 0.5) - v_paid_amount);
  else
    v_amount_due := (v_subtotal + v_shipping);
  end if;

  -- Cari tautan penawaran jika ada
  select id into v_quotation_id
    from public.quotations
   where order_id = p_order_id and user_id = v_uid
   limit 1;

  -- Cari rekening bank utama perusahaan
  select id into v_bank_acct_id
    from public.company_bank_accounts
   where user_id = v_uid and is_primary = true
   limit 1;

  if v_bank_acct_id is null then
    select id into v_bank_acct_id
      from public.company_bank_accounts
     where user_id = v_uid
     limit 1;
  end if;

  -- Cek apakah invoice untuk order ini sudah pernah dibuat sebelumnya
  select * into v_existing_inv
    from public.invoices
   where order_id = p_order_id and user_id = v_uid and status <> 'cancelled'
   limit 1;

  if v_existing_inv.id is not null then
    -- Perbarui invoice yang sudah ada
    v_invoice_id := v_existing_inv.id;

    update public.invoices set
      customer_name    = v_order.customer_name,
      subtotal         = v_subtotal,
      shipping_cost    = v_shipping,
      paid_amount      = v_paid_amount,
      amount_due       = v_amount_due,
      bank_account_id  = coalesce(bank_account_id, v_bank_acct_id),
      status           = case when v_amount_due = 0 and v_paid_amount > 0 then 'paid' else status end,
      updated_at       = now()
    where id = v_invoice_id;

    -- Refresh item
    delete from public.invoice_items where invoice_id = v_invoice_id and user_id = v_uid;
  else
    -- Generate nomor invoice baru
    v_invoice_no := public.generate_document_no(v_uid, 'invoice', current_date);

    insert into public.invoices (
      user_id, invoice_no, invoice_date, due_date,
      invoice_type, customer_name, customer_address,
      source_type, quotation_id, order_id,
      subtotal, shipping_cost, paid_amount, amount_due,
      bank_account_id, notes, status, created_at, updated_at
    ) values (
      v_uid, v_invoice_no, current_date, coalesce(v_order.order_date + 30, current_date + 30),
      p_invoice_type, v_order.customer_name, null,
      'order', v_quotation_id, p_order_id,
      v_subtotal, v_shipping, v_paid_amount, v_amount_due,
      v_bank_acct_id, 'Faktur tagihan pesanan ' || coalesce(v_order.order_id, ''),
      case when v_amount_due = 0 and v_paid_amount > 0 then 'paid' else 'draft' end,
      now(), now()
    )
    returning id into v_invoice_id;
  end if;

  -- Salin item dari order_items
  for v_o_item in
    select oi.*, p.name as product_name
      from public.order_items oi
      left join public.products p on p.id = oi.product_id
     where oi.order_id = p_order_id and oi.user_id = v_uid
     order by oi.created_at asc
  loop
    v_sort_order := v_sort_order + 1;
    v_desc_parts := array[]::text[];

    -- Ambil nama kain dan warna dari order_item_fabrics (tanpa spesifikasi teknis)
    select string_agg(concat_ws(' - ', nullif(trim(m.name), ''), nullif(trim(mc.color_name), '')), ', ')
      into v_fabrics_str
      from public.order_item_fabrics oif
      join public.materials m on m.id = oif.material_id
      left join public.material_colors mc on mc.id = oif.material_color_id
     where oif.order_item_id = v_o_item.id and oif.user_id = v_uid;

    if nullif(trim(v_fabrics_str), '') is not null then
      v_desc_parts := array_append(v_desc_parts, 'Bahan: ' || trim(v_fabrics_str));
    elsif nullif(trim(v_o_item.bahan), '') is not null then
      v_desc_parts := array_append(v_desc_parts, 'Bahan: ' || trim(v_o_item.bahan));
    end if;

    if coalesce(v_o_item.embroidery_cost_per_unit, 0) > 0 then
      v_desc_parts := array_append(v_desc_parts, 'Termasuk bordir');
    end if;

    insert into public.invoice_items (
      invoice_id, user_id, sort_order,
      product_name, description,
      qty, unit, unit_price
    ) values (
      v_invoice_id, v_uid, v_sort_order,
      coalesce(nullif(trim(v_o_item.name_item), ''), v_o_item.product_name, 'Item Pesanan'),
      nullif(array_to_string(v_desc_parts, ' | '), ''),
      v_o_item.qty,
      'pcs',
      v_o_item.price
    );
  end loop;

  return v_invoice_id;
end;
$$;

revoke execute on function public.create_invoice_from_order(uuid, text) from public, anon;
grant  execute on function public.create_invoice_from_order(uuid, text) to authenticated;
