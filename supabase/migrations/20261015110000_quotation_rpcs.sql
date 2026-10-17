-- =========================================================================
-- Migration: Quotations RPCs (Fase 1 - Dokumen Order: M3)
-- =========================================================================
-- Menambahkan RPC publik untuk Surat Penawaran:
-- 1. save_quotation(p_quotation_id, p_header, p_items) -> uuid
-- 2. set_quotation_status(p_quotation_id, p_status) -> void
-- 3. delete_quotation(p_quotation_id) -> void
-- 4. link_quotation_to_order(p_quotation_id, p_order_id) -> void
--
-- Standar keamanan:
-- - security definer set search_path = public
-- - cek auth.uid() di awal
-- - revoke execute dari public, anon; grant execute ke authenticated
-- - pesan error bahasa Indonesia yang jelas
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC save_quotation
-- ---------------------------------------------------------------------------
create or replace function public.save_quotation(
  p_quotation_id uuid default null,
  p_header       jsonb default '{}'::jsonb,
  p_items        jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_quotation_id   uuid := p_quotation_id;
  v_quotation_no   varchar;
  v_quotation_date date;
  v_valid_until    date;
  v_customer_name  varchar;
  v_customer_comp  varchar;
  v_customer_addr  text;
  v_sales_id       uuid;
  v_dp_percent     numeric;
  v_payment_terms  text;
  v_lead_time      text;
  v_bank_acct_id   uuid;
  v_notes          text;
  v_status         varchar;
  v_existing       record;
  v_item           jsonb;
  v_sort_order     int := 0;
  v_prod_name      varchar;
  v_qty            numeric;
  v_unit_price     numeric;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  -- Validasi array items tidak boleh kosong
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Surat penawaran harus memiliki minimal 1 item barang' using errcode = '22023';
  end if;

  if v_quotation_id is not null then
    -- Operasi UPDATE: ambil data existing terlebih dahulu
    select * into v_existing
      from public.quotations
     where id = v_quotation_id and user_id = v_uid;

    if v_existing is null then
      raise exception 'Surat penawaran tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
    end if;

    v_customer_name  := coalesce(nullif(trim(p_header->>'customer_name'), ''), v_existing.customer_name);
    v_customer_comp  := coalesce(nullif(trim(p_header->>'customer_company'), ''), v_existing.customer_company);
    v_customer_addr  := coalesce(nullif(trim(p_header->>'customer_address'), ''), v_existing.customer_address);
    v_quotation_date := coalesce(nullif(p_header->>'quotation_date', '')::date, v_existing.quotation_date);
    v_valid_until    := coalesce(nullif(p_header->>'valid_until', '')::date, v_existing.valid_until);

    if p_header ? 'sales_id' then
      v_sales_id := nullif(p_header->>'sales_id', '')::uuid;
    else
      v_sales_id := v_existing.sales_id;
    end if;

    if p_header ? 'bank_account_id' then
      v_bank_acct_id := nullif(p_header->>'bank_account_id', '')::uuid;
    else
      v_bank_acct_id := v_existing.bank_account_id;
    end if;

    if p_header ? 'dp_percent' then
      v_dp_percent := nullif(p_header->>'dp_percent', '')::numeric;
    else
      v_dp_percent := v_existing.dp_percent;
    end if;

    v_payment_terms := coalesce(nullif(trim(p_header->>'payment_terms'), ''), v_existing.payment_terms);
    v_lead_time     := coalesce(nullif(trim(p_header->>'lead_time'), ''), v_existing.lead_time);
    v_notes         := coalesce(nullif(trim(p_header->>'notes'), ''), v_existing.notes);

    v_status := coalesce(nullif(p_header->>'status', ''), v_existing.status);
    if v_status not in ('draft', 'sent', 'rejected') and v_status <> v_existing.status then
      raise exception 'Status tidak valid' using errcode = '22023';
    end if;

    -- Validasi foreign key jika ada perubahan
    if v_sales_id is not null and not exists (select 1 from public.sales where id = v_sales_id and user_id = v_uid) then
      raise exception 'Salesperson tidak ditemukan atau bukan milik Anda' using errcode = '22023';
    end if;
    if v_bank_acct_id is not null and not exists (select 1 from public.company_bank_accounts where id = v_bank_acct_id and user_id = v_uid) then
      raise exception 'Rekening bank tidak ditemukan atau bukan milik Anda' using errcode = '22023';
    end if;
    if v_dp_percent is not null and (v_dp_percent < 0 or v_dp_percent > 100) then
      raise exception 'Persentase DP harus berada di antara 0 dan 100' using errcode = '22023';
    end if;

    update public.quotations
       set quotation_date   = v_quotation_date,
           valid_until      = v_valid_until,
           customer_name    = v_customer_name,
           customer_company = v_customer_comp,
           customer_address = v_customer_addr,
           sales_id         = v_sales_id,
           dp_percent       = v_dp_percent,
           payment_terms    = v_payment_terms,
           lead_time        = v_lead_time,
           bank_account_id  = v_bank_acct_id,
           notes            = v_notes,
           status           = v_status,
           updated_at       = now()
     where id = v_quotation_id and user_id = v_uid;

    -- Hapus item lama untuk digantikan seluruhnya oleh item baru
    delete from public.quotation_items
     where quotation_id = v_quotation_id and user_id = v_uid;

  else
    -- Operasi INSERT baru
    v_customer_name  := nullif(trim(p_header->>'customer_name'), '');
    if v_customer_name is null then
      raise exception 'Nama pelanggan wajib diisi' using errcode = '22023';
    end if;

    v_customer_comp  := nullif(trim(p_header->>'customer_company'), '');
    v_customer_addr  := nullif(trim(p_header->>'customer_address'), '');
    v_quotation_date := coalesce(nullif(p_header->>'quotation_date', '')::date, current_date);
    v_valid_until    := nullif(p_header->>'valid_until', '')::date;

    if v_valid_until is null then
      v_valid_until := v_quotation_date + interval '14 days';
    end if;

    if nullif(p_header->>'sales_id', '') is not null then
      v_sales_id := (p_header->>'sales_id')::uuid;
      if not exists (select 1 from public.sales where id = v_sales_id and user_id = v_uid) then
        raise exception 'Salesperson tidak ditemukan atau bukan milik Anda' using errcode = '22023';
      end if;
    end if;

    if nullif(p_header->>'bank_account_id', '') is not null then
      v_bank_acct_id := (p_header->>'bank_account_id')::uuid;
      if not exists (select 1 from public.company_bank_accounts where id = v_bank_acct_id and user_id = v_uid) then
        raise exception 'Rekening bank tidak ditemukan atau bukan milik Anda' using errcode = '22023';
      end if;
    end if;

    if nullif(p_header->>'dp_percent', '') is not null then
      v_dp_percent := (p_header->>'dp_percent')::numeric;
      if v_dp_percent < 0 or v_dp_percent > 100 then
        raise exception 'Persentase DP harus berada di antara 0 dan 100' using errcode = '22023';
      end if;
    end if;

    v_payment_terms := nullif(trim(p_header->>'payment_terms'), '');
    v_lead_time     := nullif(trim(p_header->>'lead_time'), '');
    v_notes         := nullif(trim(p_header->>'notes'), '');

    v_quotation_no := public.generate_document_no(v_uid, 'quotation', v_quotation_date);
    v_status       := coalesce(nullif(p_header->>'status', ''), 'draft');
    if v_status not in ('draft', 'sent', 'rejected') then
      v_status := 'draft';
    end if;

    insert into public.quotations (
      user_id, quotation_no, quotation_date, valid_until,
      customer_name, customer_company, customer_address,
      sales_id, dp_percent, payment_terms, lead_time,
      bank_account_id, notes, status, created_at, updated_at
    ) values (
      v_uid, v_quotation_no, v_quotation_date, v_valid_until,
      v_customer_name, v_customer_comp, v_customer_addr,
      v_sales_id, v_dp_percent, v_payment_terms, v_lead_time,
      v_bank_acct_id, v_notes, v_status, now(), now()
    )
    returning id into v_quotation_id;
  end if;

  -- Insert baris item
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sort_order := v_sort_order + 1;
    v_prod_name  := nullif(trim(v_item->>'product_name'), '');
    if v_prod_name is null then
      raise exception 'Nama produk pada item ke-% wajib diisi', v_sort_order using errcode = '22023';
    end if;

    v_qty        := coalesce(nullif(v_item->>'qty', '')::numeric, 0);
    v_unit_price := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0);

    if v_qty < 0 then
      raise exception 'Jumlah qty pada item ke-% tidak boleh negatif', v_sort_order using errcode = '22023';
    end if;
    if v_unit_price < 0 then
      raise exception 'Harga satuan pada item ke-% tidak boleh negatif', v_sort_order using errcode = '22023';
    end if;

    insert into public.quotation_items (
      quotation_id, user_id, sort_order,
      product_name, fabric_type, fabric_color,
      sewing_notes, embroidery_notes, print_notes,
      size_breakdown, qty, unit, unit_price, item_notes
    ) values (
      v_quotation_id, v_uid, coalesce((v_item->>'sort_order')::int, v_sort_order),
      v_prod_name,
      nullif(trim(v_item->>'fabric_type'), ''),
      nullif(trim(v_item->>'fabric_color'), ''),
      nullif(trim(v_item->>'sewing_notes'), ''),
      nullif(trim(v_item->>'embroidery_notes'), ''),
      nullif(trim(v_item->>'print_notes'), ''),
      case when v_item ? 'size_breakdown' and jsonb_typeof(v_item->'size_breakdown') = 'object'
           then v_item->'size_breakdown' else null end,
      v_qty,
      coalesce(nullif(trim(v_item->>'unit'), ''), 'pcs'),
      v_unit_price,
      nullif(trim(v_item->>'item_notes'), '')
    );
  end loop;

  return v_quotation_id;
end;
$$;

revoke execute on function public.save_quotation(uuid, jsonb, jsonb) from public, anon;
grant  execute on function public.save_quotation(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC set_quotation_status
-- ---------------------------------------------------------------------------
create or replace function public.set_quotation_status(
  p_quotation_id uuid,
  p_status       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_status not in ('draft', 'sent', 'rejected') then
    raise exception 'Status tidak valid. Status yang diizinkan: draft, sent, rejected' using errcode = '22023';
  end if;

  update public.quotations
     set status     = p_status,
         updated_at = now()
   where id = p_quotation_id and user_id = v_uid;

  if not found then
    raise exception 'Surat penawaran tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.set_quotation_status(uuid, text) from public, anon;
grant  execute on function public.set_quotation_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC delete_quotation
-- ---------------------------------------------------------------------------
create or replace function public.delete_quotation(
  p_quotation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_order_id uuid;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select order_id into v_order_id
    from public.quotations
   where id = p_quotation_id and user_id = v_uid;

  if not found then
    raise exception 'Surat penawaran tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  if v_order_id is not null then
    raise exception 'Penawaran yang sudah terhubung ke pesanan tidak dapat dihapus' using errcode = '23503';
  end if;

  delete from public.quotations
   where id = p_quotation_id and user_id = v_uid;
end;
$$;

revoke execute on function public.delete_quotation(uuid) from public, anon;
grant  execute on function public.delete_quotation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC link_quotation_to_order
-- ---------------------------------------------------------------------------
create or replace function public.link_quotation_to_order(
  p_quotation_id uuid,
  p_order_id     uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid             uuid := auth.uid();
  v_exist_order_id  uuid;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  -- Pastikan order valid dan milik user
  if not exists (select 1 from public.orders where id = p_order_id and user_id = v_uid) then
    raise exception 'Pesanan tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  -- Pastikan penawaran ada dan milik user
  select order_id into v_exist_order_id
    from public.quotations
   where id = p_quotation_id and user_id = v_uid;

  if not found then
    raise exception 'Surat penawaran tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  if v_exist_order_id is not null then
    raise exception 'Penawaran sudah tertaut ke pesanan lain' using errcode = '23505';
  end if;

  update public.quotations
     set order_id   = p_order_id,
         status     = 'accepted',
         updated_at = now()
   where id = p_quotation_id and user_id = v_uid;
end;
$$;

revoke execute on function public.link_quotation_to_order(uuid, uuid) from public, anon;
grant  execute on function public.link_quotation_to_order(uuid, uuid) to authenticated;
