-- =========================================================================
-- Migration: Invoice RPCs (Fase 2 - Dokumen Order: M5)
-- =========================================================================
-- Berisi RPC untuk pengelolaan Invoice:
-- 1. save_invoice                   (Simpan / ubah invoice dan item secara atomik)
-- 2. set_invoice_status             (Ubah status invoice: draft -> sent -> paid, draft/sent -> cancelled)
-- 3. delete_invoice                 (Hapus invoice khusus draft)
-- 4. create_invoice_from_quotation  (Salin penawaran menjadi invoice)
-- 5. create_invoice_from_order      (Snapshot order_items & payments menjadi invoice pelunasan/DP)
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC: save_invoice
-- ---------------------------------------------------------------------------
create or replace function public.save_invoice(
  p_invoice_id uuid default null,
  p_header     jsonb default '{}'::jsonb,
  p_items      jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_invoice_id     uuid := p_invoice_id;
  v_invoice_no     varchar;
  v_invoice_date   date;
  v_due_date       date;
  v_invoice_type   varchar;
  v_customer_name  varchar;
  v_customer_addr  text;
  v_source_type    varchar;
  v_quotation_id   uuid;
  v_order_id       uuid;
  v_shipping_cost  numeric;
  v_paid_amount    numeric;
  v_amount_due     numeric;
  v_bank_acct_id   uuid;
  v_notes          text;
  v_status         varchar;
  v_existing       record;
  v_item           jsonb;
  v_sort_order     int := 0;
  v_prod_name      varchar;
  v_qty            numeric;
  v_unit_price     numeric;
  v_subtotal_calc  numeric := 0;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  -- Validasi array items tidak boleh kosong
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Invoice harus memiliki minimal 1 item barang' using errcode = '22023';
  end if;

  -- Hitung total subtotal dari seluruh item
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty        := coalesce(nullif(v_item->>'qty', '')::numeric, 0);
    v_unit_price := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0);
    if v_qty < 0 or v_unit_price < 0 then
      raise exception 'Jumlah qty dan harga satuan item tidak boleh negatif' using errcode = '22023';
    end if;
    v_subtotal_calc := v_subtotal_calc + (v_qty * v_unit_price);
  end loop;

  if v_invoice_id is not null then
    -- Operasi UPDATE: ambil data existing terlebih dahulu
    select * into v_existing
      from public.invoices
     where id = v_invoice_id and user_id = v_uid;

    if v_existing is null then
      raise exception 'Invoice tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
    end if;

    if v_existing.status = 'paid' then
      raise exception 'Invoice yang sudah lunas (paid) tidak dapat diubah' using errcode = '22023';
    end if;

    if v_existing.status = 'cancelled' then
      raise exception 'Invoice yang sudah dibatalkan (cancelled) tidak dapat diubah' using errcode = '22023';
    end if;

    v_customer_name := coalesce(nullif(trim(p_header->>'customer_name'), ''), v_existing.customer_name);
    v_customer_addr := coalesce(nullif(trim(p_header->>'customer_address'), ''), v_existing.customer_address);
    v_invoice_date  := coalesce(nullif(p_header->>'invoice_date', '')::date, v_existing.invoice_date);
    v_due_date      := coalesce(nullif(p_header->>'due_date', '')::date, v_existing.due_date);
    v_invoice_type  := coalesce(nullif(p_header->>'invoice_type', ''), v_existing.invoice_type);
    v_source_type   := coalesce(nullif(p_header->>'source_type', ''), v_existing.source_type);

    if p_header ? 'bank_account_id' then
      v_bank_acct_id := nullif(p_header->>'bank_account_id', '')::uuid;
      if v_bank_acct_id is not null and not exists (
        select 1 from public.company_bank_accounts where id = v_bank_acct_id and user_id = v_uid
      ) then
        raise exception 'Rekening bank tidak ditemukan atau bukan milik Anda' using errcode = '22023';
      end if;
    else
      v_bank_acct_id := v_existing.bank_account_id;
    end if;

    if p_header ? 'quotation_id' then
      v_quotation_id := nullif(p_header->>'quotation_id', '')::uuid;
      if v_quotation_id is not null and not exists (
        select 1 from public.quotations where id = v_quotation_id and user_id = v_uid
      ) then
        raise exception 'Surat penawaran rujukan tidak ditemukan atau bukan milik Anda' using errcode = '22023';
      end if;
    else
      v_quotation_id := v_existing.quotation_id;
    end if;

    if p_header ? 'order_id' then
      v_order_id := nullif(p_header->>'order_id', '')::uuid;
      if v_order_id is not null and not exists (
        select 1 from public.orders where id = v_order_id and user_id = v_uid
      ) then
        raise exception 'Pesanan rujukan tidak ditemukan atau bukan milik Anda' using errcode = '22023';
      end if;
    else
      v_order_id := v_existing.order_id;
    end if;

    v_shipping_cost := coalesce(nullif(p_header->>'shipping_cost', '')::numeric, v_existing.shipping_cost);
    v_paid_amount   := coalesce(nullif(p_header->>'paid_amount', '')::numeric, v_existing.paid_amount);

    if nullif(p_header->>'amount_due', '') is not null then
      v_amount_due := (p_header->>'amount_due')::numeric;
    else
      -- Hitung default amount_due sesuai jenis invoice
      if v_invoice_type = 'pelunasan' then
        v_amount_due := greatest(0, (v_subtotal_calc + v_shipping_cost) - v_paid_amount);
      elsif v_invoice_type = 'dp' then
        v_amount_due := coalesce(v_existing.amount_due, round((v_subtotal_calc + v_shipping_cost) * 0.5));
      else
        v_amount_due := (v_subtotal_calc + v_shipping_cost);
      end if;
    end if;

    v_notes  := coalesce(nullif(trim(p_header->>'notes'), ''), v_existing.notes);
    v_status := coalesce(nullif(p_header->>'status', ''), v_existing.status);

    if v_status not in ('draft', 'sent', 'paid', 'cancelled') then
      raise exception 'Status tidak valid' using errcode = '22023';
    end if;

    update public.invoices set
      customer_name    = v_customer_name,
      customer_address = v_customer_addr,
      invoice_date     = v_invoice_date,
      due_date         = v_due_date,
      invoice_type     = v_invoice_type,
      source_type      = v_source_type,
      quotation_id     = v_quotation_id,
      order_id         = v_order_id,
      subtotal         = v_subtotal_calc,
      shipping_cost    = v_shipping_cost,
      paid_amount      = v_paid_amount,
      amount_due       = v_amount_due,
      bank_account_id  = v_bank_acct_id,
      notes            = v_notes,
      status           = v_status,
      updated_at       = now()
    where id = v_invoice_id and user_id = v_uid;

    -- Hapus item lama untuk diganti dengan item baru
    delete from public.invoice_items where invoice_id = v_invoice_id;

  else
    -- Operasi INSERT BARU
    v_customer_name := nullif(trim(p_header->>'customer_name'), '');
    if v_customer_name is null then
      raise exception 'Nama pelanggan wajib diisi' using errcode = '22023';
    end if;

    v_customer_addr := nullif(trim(p_header->>'customer_address'), '');
    v_invoice_date  := coalesce(nullif(p_header->>'invoice_date', '')::date, current_date);
    v_due_date      := nullif(p_header->>'due_date', '')::date;
    v_invoice_type  := coalesce(nullif(p_header->>'invoice_type', ''), 'dp');
    v_source_type   := coalesce(nullif(p_header->>'source_type', ''), 'manual');

    if v_invoice_type not in ('dp', 'pelunasan', 'penuh') then
      raise exception 'Jenis invoice tidak valid' using errcode = '22023';
    end if;

    if nullif(p_header->>'bank_account_id', '') is not null then
      v_bank_acct_id := (p_header->>'bank_account_id')::uuid;
      if not exists (select 1 from public.company_bank_accounts where id = v_bank_acct_id and user_id = v_uid) then
        raise exception 'Rekening bank tidak ditemukan atau bukan milik Anda' using errcode = '22023';
      end if;
    end if;

    if nullif(p_header->>'quotation_id', '') is not null then
      v_quotation_id := (p_header->>'quotation_id')::uuid;
      if not exists (select 1 from public.quotations where id = v_quotation_id and user_id = v_uid) then
        raise exception 'Surat penawaran rujukan tidak ditemukan atau bukan milik Anda' using errcode = '22023';
      end if;
    end if;

    if nullif(p_header->>'order_id', '') is not null then
      v_order_id := (p_header->>'order_id')::uuid;
      if not exists (select 1 from public.orders where id = v_order_id and user_id = v_uid) then
        raise exception 'Pesanan rujukan tidak ditemukan atau bukan milik Anda' using errcode = '22023';
      end if;
    end if;

    v_shipping_cost := coalesce(nullif(p_header->>'shipping_cost', '')::numeric, 0);
    v_paid_amount   := coalesce(nullif(p_header->>'paid_amount', '')::numeric, 0);

    if nullif(p_header->>'amount_due', '') is not null then
      v_amount_due := (p_header->>'amount_due')::numeric;
    else
      if v_invoice_type = 'pelunasan' then
        v_amount_due := greatest(0, (v_subtotal_calc + v_shipping_cost) - v_paid_amount);
      elsif v_invoice_type = 'dp' then
        v_amount_due := round((v_subtotal_calc + v_shipping_cost) * 0.5);
      else
        v_amount_due := (v_subtotal_calc + v_shipping_cost);
      end if;
    end if;

    v_notes  := nullif(trim(p_header->>'notes'), '');
    v_status := coalesce(nullif(p_header->>'status', ''), 'draft');

    if v_status not in ('draft', 'sent', 'paid', 'cancelled') then
      raise exception 'Status tidak valid' using errcode = '22023';
    end if;

    -- Generate nomor invoice otomatis
    v_invoice_no := public.generate_document_no(v_uid, 'invoice', v_invoice_date);

    insert into public.invoices (
      user_id, invoice_no, invoice_date, due_date,
      invoice_type, customer_name, customer_address,
      source_type, quotation_id, order_id,
      subtotal, shipping_cost, paid_amount, amount_due,
      bank_account_id, notes, status, created_at, updated_at
    ) values (
      v_uid, v_invoice_no, v_invoice_date, v_due_date,
      v_invoice_type, v_customer_name, v_customer_addr,
      v_source_type, v_quotation_id, v_order_id,
      v_subtotal_calc, v_shipping_cost, v_paid_amount, v_amount_due,
      v_bank_acct_id, v_notes, v_status, now(), now()
    )
    returning id into v_invoice_id;
  end if;

  -- Insert baris rincian item invoice
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sort_order := v_sort_order + 1;
    v_prod_name  := nullif(trim(v_item->>'product_name'), '');
    if v_prod_name is null then
      raise exception 'Nama produk pada item ke-% wajib diisi', v_sort_order using errcode = '22023';
    end if;

    v_qty        := coalesce(nullif(v_item->>'qty', '')::numeric, 0);
    v_unit_price := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0);

    insert into public.invoice_items (
      invoice_id, user_id, sort_order,
      product_name, description,
      qty, unit, unit_price
    ) values (
      v_invoice_id, v_uid, coalesce((v_item->>'sort_order')::int, v_sort_order),
      v_prod_name,
      nullif(trim(v_item->>'description'), ''),
      v_qty,
      coalesce(nullif(trim(v_item->>'unit'), ''), 'pcs'),
      v_unit_price
    );
  end loop;

  return v_invoice_id;
end;
$$;

revoke execute on function public.save_invoice(uuid, jsonb, jsonb) from public, anon;
grant  execute on function public.save_invoice(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC: set_invoice_status
-- ---------------------------------------------------------------------------
create or replace function public.set_invoice_status(
  p_invoice_id uuid,
  p_status     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_existing record;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_status not in ('draft', 'sent', 'paid', 'cancelled') then
    raise exception 'Status invoice tidak valid: %', p_status using errcode = '22023';
  end if;

  select * into v_existing
    from public.invoices
   where id = p_invoice_id and user_id = v_uid;

  if v_existing is null then
    raise exception 'Invoice tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  -- Validasi transisi status
  if v_existing.status = p_status then
    return;
  end if;

  if v_existing.status = 'paid' then
    raise exception 'Invoice yang sudah lunas (paid) tidak dapat diubah statusnya' using errcode = '22023';
  end if;

  if v_existing.status = 'cancelled' then
    raise exception 'Invoice yang sudah dibatalkan (cancelled) tidak dapat diaktifkan kembali' using errcode = '22023';
  end if;

  -- Transisi yang diizinkan: draft -> sent, sent -> paid, draft/sent -> cancelled
  if v_existing.status = 'draft' and p_status not in ('sent', 'cancelled') then
    raise exception 'Invoice draft hanya dapat ditandai sebagai sent atau cancelled' using errcode = '22023';
  end if;

  if v_existing.status = 'sent' and p_status not in ('paid', 'cancelled') then
    raise exception 'Invoice sent hanya dapat ditandai sebagai paid atau cancelled' using errcode = '22023';
  end if;

  -- CATATAN PENTING: Invoice yang berstatus 'paid' TIDAK mencatat transaksi akuntansi
  -- (jangan menyentuh accounts, journal_*, accounting_settings, transactions).
  update public.invoices
     set status     = p_status,
         updated_at = now()
   where id = p_invoice_id and user_id = v_uid;
end;
$$;

revoke execute on function public.set_invoice_status(uuid, text) from public, anon;
grant  execute on function public.set_invoice_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: delete_invoice
-- ---------------------------------------------------------------------------
create or replace function public.delete_invoice(
  p_invoice_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_existing record;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_existing
    from public.invoices
   where id = p_invoice_id and user_id = v_uid;

  if v_existing is null then
    raise exception 'Invoice tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  -- Invoice yang sudah diterbitkan (sent / paid) tidak boleh dihapus demi kepatuhan audit
  if v_existing.status <> 'draft' then
    raise exception 'Hanya invoice berstatus draft yang dapat dihapus. Invoice yang telah diterbitkan hanya dapat dibatalkan (cancelled).'
      using errcode = '22023';
  end if;

  delete from public.invoices
   where id = p_invoice_id and user_id = v_uid;
end;
$$;

revoke execute on function public.delete_invoice(uuid) from public, anon;
grant  execute on function public.delete_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: create_invoice_from_quotation
-- ---------------------------------------------------------------------------
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

  -- Generate nomor invoice otomatis
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

  -- Salin item dari quotation_items ke invoice_items
  for v_q_item in
    select * from public.quotation_items
     where quotation_id = p_quotation_id and user_id = v_uid
     order by sort_order asc
  loop
    v_desc_parts := array[]::text[];
    if nullif(trim(v_q_item.fabric_type), '') is not null or nullif(trim(v_q_item.fabric_color), '') is not null then
      v_desc_parts := array_append(v_desc_parts, 'Bahan: ' || concat_ws(' - ', nullif(trim(v_q_item.fabric_type), ''), nullif(trim(v_q_item.fabric_color), '')));
    end if;
    if nullif(trim(v_q_item.fabric_specs), '') is not null then
      v_desc_parts := array_append(v_desc_parts, 'Spesifikasi: ' || trim(v_q_item.fabric_specs));
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

-- ---------------------------------------------------------------------------
-- 5. RPC: create_invoice_from_order
-- ---------------------------------------------------------------------------
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

  -- Generate nomor invoice otomatis
  v_invoice_no := public.generate_document_no(v_uid, 'invoice', current_date);

  insert into public.invoices (
    user_id, invoice_no, invoice_date, due_date,
    invoice_type, customer_name, customer_address,
    source_type, quotation_id, order_id,
    subtotal, shipping_cost, paid_amount, amount_due,
    bank_account_id, notes, status, created_at, updated_at
  ) values (
    v_uid, v_invoice_no, current_date, current_date + 7,
    p_invoice_type, v_order.customer_name, null,
    'order', v_quotation_id, p_order_id,
    v_subtotal, v_shipping, v_paid_amount, v_amount_due,
    v_bank_acct_id, 'Tagihan pesanan ' || coalesce(v_order.order_id, ''), 'draft', now(), now()
  )
  returning id into v_invoice_id;

  -- 5. Snapshot mandiri dari baris order_items ke invoice_items
  -- Mengedit order_items sesudahnya tidak akan mengubah invoice_items
  for v_o_item in
    select
      oi.id,
      coalesce(nullif(trim(oi.name_item), ''), p.name, 'Item Pesanan') as item_title,
      oi.qty,
      oi.price
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id and oi.user_id = v_uid
    order by oi.created_at asc
  loop
    v_sort_order := v_sort_order + 1;
    insert into public.invoice_items (
      invoice_id, user_id, sort_order,
      product_name, description,
      qty, unit, unit_price
    ) values (
      v_invoice_id, v_uid, v_sort_order,
      v_o_item.item_title,
      null,
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
