-- =========================================================================
-- Migration: Invoice Parent Binding & Automation (Dokumen Order: M5b)
-- =========================================================================
-- Menjamin arsitektur "Zero Orphan Invoice":
-- 1. Invoice WAJIB menempel ke Quotation (source_type = 'quotation') atau Order (source_type = 'order').
-- 2. Menghapus 'manual' dari source_type.
-- 3. Menambahkan constraint invoices_parent_check.
-- 4. Unique partial index: 1 quotation = 1 invoice aktif, 1 order = 1 invoice aktif.
-- 5. Automasi: save_quotation otomatis melahirkan/mensinkronkan Invoice Penawaran (DP).
-- 6. Automasi: link_quotation_to_order menandai invoice DP sebagai 'paid' & melahirkan invoice pesanan.
-- 7. Automasi: trigger order_payments otomatis mensinkronkan paid_amount & amount_due pada invoice pesanan.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Pembersihan & Constraint Baru pada public.invoices
-- ---------------------------------------------------------------------------

-- Hapus invoice manual lepas jika ada
delete from public.invoices where source_type = 'manual' or (quotation_id is null and order_id is null);

-- Perbarui constraint source_type
alter table public.invoices drop constraint if exists invoices_source_check;
alter table public.invoices add constraint invoices_source_check check (source_type in ('quotation', 'order'));

-- Hapus constraint parent_check lama jika ada agar ON DELETE SET NULL tidak terhalang
alter table public.invoices drop constraint if exists invoices_parent_check;

-- Trigger penegakan Zero Orphan saat INSERT: invoice harus memiliki quotation_id atau order_id
create or replace function public.fn_guard_invoice_parent()
returns trigger
language plpgsql
as $$
begin
  if NEW.source_type = 'quotation' and NEW.quotation_id is null then
    raise exception 'Invoice dengan source_type quotation wajib memiliki quotation_id (invoices_parent_check)'
      using errcode = '23514';
  end if;
  if NEW.source_type = 'order' and NEW.order_id is null then
    raise exception 'Invoice dengan source_type order wajib memiliki order_id (invoices_parent_check)'
      using errcode = '23514';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_invoice_parent on public.invoices;
create trigger trg_guard_invoice_parent
  before insert on public.invoices
  for each row execute function public.fn_guard_invoice_parent();

-- Unique index per parent dokumen agar tidak terjadi duplikasi invoice aktif
create unique index if not exists idx_invoices_user_quotation
  on public.invoices(user_id, quotation_id)
  where quotation_id is not null and status <> 'cancelled';

create unique index if not exists idx_invoices_user_order
  on public.invoices(user_id, order_id)
  where order_id is not null and status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- 2. Update create_invoice_from_quotation (Idempotent / Sinkronisasi)
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
-- 3. Update save_quotation (Otomatis Melahirkan/Mensinkronkan Invoice DP)
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
  v_cat_id         uuid;
  v_prod_id        uuid;
  v_mat_id         uuid;
  v_mat_color_id   uuid;
  v_fabric_specs   text;
  v_unused_inv_id  uuid;
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
    -- Operasi INSERT: buat nomor penawaran baru
    v_customer_name  := nullif(trim(p_header->>'customer_name'), '');
    if v_customer_name is null then
      raise exception 'Nama pelanggan wajib diisi' using errcode = '22023';
    end if;

    v_customer_comp  := nullif(trim(p_header->>'customer_company'), '');
    v_customer_addr  := nullif(trim(p_header->>'customer_address'), '');
    v_quotation_date := coalesce(nullif(p_header->>'quotation_date', '')::date, current_date);
    v_valid_until    := nullif(p_header->>'valid_until', '')::date;
    v_sales_id       := nullif(p_header->>'sales_id', '')::uuid;
    v_bank_acct_id   := nullif(p_header->>'bank_account_id', '')::uuid;
    v_dp_percent     := nullif(p_header->>'dp_percent', '')::numeric;
    v_payment_terms  := nullif(trim(p_header->>'payment_terms'), '');
    v_lead_time      := nullif(trim(p_header->>'lead_time'), '');
    v_notes          := nullif(trim(p_header->>'notes'), '');
    v_status         := coalesce(nullif(p_header->>'status', ''), 'draft');

    if v_status not in ('draft', 'sent', 'rejected') then
      raise exception 'Status tidak valid' using errcode = '22023';
    end if;

    if v_sales_id is not null and not exists (select 1 from public.sales where id = v_sales_id and user_id = v_uid) then
      raise exception 'Salesperson tidak ditemukan atau bukan milik Anda' using errcode = '22023';
    end if;
    if v_bank_acct_id is not null and not exists (select 1 from public.company_bank_accounts where id = v_bank_acct_id and user_id = v_uid) then
      raise exception 'Rekening bank tidak ditemukan atau bukan milik Anda' using errcode = '22023';
    end if;
    if v_dp_percent is not null and (v_dp_percent < 0 or v_dp_percent > 100) then
      raise exception 'Persentase DP harus berada di antara 0 dan 100' using errcode = '22023';
    end if;

    -- Generate nomor unik via document_counters
    v_quotation_no := public.generate_document_no(v_uid, 'quotation', v_quotation_date);

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

  -- Insert item-item penawaran baru
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sort_order := v_sort_order + 1;
    v_prod_name  := nullif(trim(v_item->>'product_name'), '');
    if v_prod_name is null then
      raise exception 'Nama produk pada item #% tidak boleh kosong', v_sort_order using errcode = '22023';
    end if;

    v_qty        := coalesce(nullif(v_item->>'qty', '')::numeric, 0);
    v_unit_price := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0);

    if v_qty < 0 or v_unit_price < 0 then
      raise exception 'Qty dan harga satuan item #% tidak boleh negatif', v_sort_order using errcode = '22023';
    end if;

    -- Ekstraksi kolom referensi terstruktur (opsional)
    v_cat_id       := nullif(v_item->>'category_id', '')::uuid;
    v_prod_id      := nullif(v_item->>'product_id', '')::uuid;
    v_mat_id       := nullif(v_item->>'material_id', '')::uuid;
    v_mat_color_id := nullif(v_item->>'material_color_id', '')::uuid;
    v_fabric_specs := nullif(trim(v_item->>'fabric_specs'), '');

    -- Validasi kepemilikan referensi jika disediakan
    if v_cat_id is not null and not exists (select 1 from public.product_categories where id = v_cat_id and user_id = v_uid) then
      raise exception 'Kategori produk pada item ke-% tidak ditemukan atau bukan milik Anda', v_sort_order using errcode = '22023';
    end if;

    if v_prod_id is not null and not exists (select 1 from public.products where id = v_prod_id and user_id = v_uid) then
      raise exception 'Model produk pada item ke-% tidak ditemukan atau bukan milik Anda', v_sort_order using errcode = '22023';
    end if;

    if v_mat_id is not null and not exists (select 1 from public.materials where id = v_mat_id and user_id = v_uid) then
      raise exception 'Bahan/kain pada item ke-% tidak ditemukan atau bukan milik Anda', v_sort_order using errcode = '22023';
    end if;

    if v_mat_color_id is not null and not exists (select 1 from public.material_colors where id = v_mat_color_id and user_id = v_uid) then
      raise exception 'Warna bahan pada item ke-% tidak ditemukan atau bukan milik Anda', v_sort_order using errcode = '22023';
    end if;

    insert into public.quotation_items (
      quotation_id, user_id, sort_order,
      category_id, product_id, material_id, material_color_id,
      product_name, fabric_type, fabric_color, fabric_specs,
      sewing_notes, embroidery_notes, print_notes,
      size_breakdown, qty, unit, unit_price, item_notes
    ) values (
      v_quotation_id, v_uid, coalesce((v_item->>'sort_order')::int, v_sort_order),
      v_cat_id, v_prod_id, v_mat_id, v_mat_color_id,
      v_prod_name,
      nullif(trim(v_item->>'fabric_type'), ''),
      nullif(trim(v_item->>'fabric_color'), ''),
      v_fabric_specs,
      nullif(trim(v_item->>'sewing_notes'), ''),
      nullif(trim(v_item->>'embroidery_notes'), ''),
      nullif(trim(v_item->>'print_notes'), ''),
      case when v_item ? 'size_breakdown' and (v_item->'size_breakdown') is not null
           then v_item->'size_breakdown'
           else null
      end,
      v_qty,
      coalesce(nullif(trim(v_item->>'unit'), ''), 'pcs'),
      v_unit_price,
      nullif(trim(v_item->>'item_notes'), '')
    );
  end loop;

  -- OTOMASI: Setiap kali quotation dibuat / diupdate, sinkronkan Invoice DP terkait
  v_unused_inv_id := public.create_invoice_from_quotation(v_quotation_id, 'dp');

  return v_quotation_id;
end;
$$;

revoke execute on function public.save_quotation(uuid, jsonb, jsonb) from public, anon;
grant  execute on function public.save_quotation(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Update set_quotation_status (Sinkron Status Invoice Penawaran)
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
  v_uid      uuid := auth.uid();
  v_existing record;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_existing
    from public.quotations
   where id = p_quotation_id and user_id = v_uid;

  if v_existing is null then
    raise exception 'Surat penawaran tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  if p_status not in ('draft', 'sent', 'rejected') then
    raise exception 'Status tujuan tidak valid. Status accepted hanya dapat diatur melalui proses konversi pesanan.'
      using errcode = '22023';
  end if;

  if v_existing.order_id is not null then
    raise exception 'Penawaran telah menjadi pesanan dan tidak dapat diubah statusnya' using errcode = '22023';
  end if;

  update public.quotations
     set status     = p_status,
         updated_at = now()
   where id = p_quotation_id and user_id = v_uid;

  -- Sinkronkan status invoice penawaran jika ada
  if p_status = 'sent' then
    update public.invoices
       set status = 'sent', updated_at = now()
     where quotation_id = p_quotation_id and user_id = v_uid and status = 'draft';
  elsif p_status = 'rejected' then
    update public.invoices
       set status = 'cancelled', updated_at = now()
     where quotation_id = p_quotation_id and user_id = v_uid and status in ('draft', 'sent');
  end if;
end;
$$;

revoke execute on function public.set_quotation_status(uuid, text) from public, anon;
grant  execute on function public.set_quotation_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4b. Update delete_quotation (Hapus Invoice Penawaran Terkait)
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
  v_existing record;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_existing
    from public.quotations
   where id = p_quotation_id and user_id = v_uid;

  if v_existing is null then
    raise exception 'Surat penawaran tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  if v_existing.order_id is not null then
    raise exception 'Surat penawaran yang sudah terhubung ke pesanan tidak dapat dihapus'
      using errcode = '22023';
  end if;

  -- Hapus invoice penawaran draft terkait
  delete from public.invoices
   where quotation_id = p_quotation_id and user_id = v_uid;

  -- Hapus quotation
  delete from public.quotations
   where id = p_quotation_id and user_id = v_uid;
end;
$$;

revoke execute on function public.delete_quotation(uuid) from public, anon;
grant  execute on function public.delete_quotation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Update link_quotation_to_order (Tandai Invoice DP Paid & Buat Invoice Order)
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
  v_uid            uuid := auth.uid();
  v_quotation      record;
  v_order          record;
  v_unused_inv_id  uuid;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_quotation
    from public.quotations
   where id = p_quotation_id and user_id = v_uid;

  if v_quotation is null then
    raise exception 'Surat penawaran tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  if v_quotation.order_id is not null then
    raise exception 'Surat penawaran ini sudah pernah ditautkan ke pesanan lain' using errcode = '22023';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id and user_id = v_uid;

  if v_order is null then
    raise exception 'Pesanan tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  -- Update quotation
  update public.quotations
     set order_id   = p_order_id,
         status     = 'accepted',
         updated_at = now()
   where id = p_quotation_id and user_id = v_uid;

  -- Tandai invoice DP penawaran sebagai 'paid'
  update public.invoices
     set status = 'paid', updated_at = now()
   where quotation_id = p_quotation_id and user_id = v_uid and status in ('draft', 'sent');

  -- OTOMASI: Terbitkan invoice pesanan untuk order ini jika item pesanan sudah ada
  if exists (select 1 from public.order_items where order_id = p_order_id and user_id = v_uid) then
    v_unused_inv_id := public.create_invoice_from_order(p_order_id, 'pelunasan');
  end if;
end;
$$;

revoke execute on function public.link_quotation_to_order(uuid, uuid) from public, anon;
grant  execute on function public.link_quotation_to_order(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Update create_invoice_from_order (Idempotent / Sinkronisasi)
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
  v_existing_inv record;
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
    insert into public.invoice_items (
      invoice_id, user_id, sort_order,
      product_name, description,
      qty, unit, unit_price
    ) values (
      v_invoice_id, v_uid, v_sort_order,
      coalesce(nullif(trim(v_o_item.name_item), ''), v_o_item.product_name, 'Item Pesanan'),
      case
        when v_o_item.embroidery_cost_per_unit > 0 then 'Termasuk bordir'
        else null
      end,
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

-- ---------------------------------------------------------------------------
-- 7. Trigger Sinkronisasi Pembayaran: order_payments -> invoices
-- ---------------------------------------------------------------------------
create or replace function public.fn_sync_order_invoice_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_order_id uuid;
  v_user_id         uuid;
  v_total_paid      numeric := 0;
begin
  if TG_OP = 'DELETE' then
    v_target_order_id := OLD.order_id;
    v_user_id         := OLD.user_id;
  else
    v_target_order_id := NEW.order_id;
    v_user_id         := NEW.user_id;
  end if;

  -- Hitung total pembayaran untuk order ini
  select coalesce(sum(amount), 0)
    into v_total_paid
    from public.order_payments
   where order_id = v_target_order_id and user_id = v_user_id;

  -- Sinkronkan invoice pesanan jika ada
  update public.invoices
     set paid_amount = v_total_paid,
         amount_due  = greatest(0, (subtotal + shipping_cost) - v_total_paid),
         status      = case
                         when greatest(0, (subtotal + shipping_cost) - v_total_paid) = 0 and v_total_paid > 0 then 'paid'
                         when status = 'paid' and greatest(0, (subtotal + shipping_cost) - v_total_paid) > 0 then 'sent'
                         else status
                       end,
         updated_at  = now()
   where order_id = v_target_order_id and user_id = v_user_id and status <> 'cancelled';

  return null;
end;
$$;

revoke execute on function public.fn_sync_order_invoice_on_payment() from public, anon;

drop trigger if exists trg_sync_order_invoice_on_payment on public.order_payments;
create trigger trg_sync_order_invoice_on_payment
  after insert or update or delete on public.order_payments
  for each row execute function public.fn_sync_order_invoice_on_payment();
