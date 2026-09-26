-- =========================================================================
-- SIKon — Migration: Flow Approval SPJ & Direct Supplier
-- =========================================================================
-- 1. purchasing_reports:
--    - Update status check: 'disbursed', 'submitted', 'financially_approved', 'goods_received', 'rejected'
--    - Data migration existing rows: 'draft' -> 'disbursed', 'approved' -> 'goods_received'
--    - Kolom received_by & received_at (konfirmasi penerimaan fisik oleh Gudang)
-- 2. supplier_purchases:
--    - Kolom payment_proof_url, proof_uploaded_by, proof_uploaded_at
-- 3. stock_requests:
--    - Kolom purchasing_report_id, supplier_purchase_id, goods_received_at
-- 4. RPCs:
--    - approve_stock_request_spj: 1-click approve request + cairkan uang muka + buat SPJ (status: disbursed)
--    - approve_purchasing_report: revisi verifikasi Finance, buat stock_movements (status: pending, TANPA tambah stok langsung)
--    - confirm_purchasing_report_receipt: konfirmasi fisik oleh Gudang, tambah stok material & update status goods_received
--    - cancel_disbursed_report: pembatalan SPJ saat masih disbursed
--    - approve_stock_request_supplier: 1-click approve request + buat supplier_purchase
--    - upload_supplier_purchase_proof: upload nota / bukti transfer supplier
--    - receive_supplier_purchase: konfirmasi penerimaan fisik supplier oleh Gudang
-- =========================================================================

-- 1. purchasing_reports: migrasi status & kolom penerima fisik
alter table public.purchasing_reports
  drop constraint if exists purchasing_reports_status_check;

update public.purchasing_reports
set status = 'disbursed'
where status = 'draft';

update public.purchasing_reports
set status = 'goods_received'
where status = 'approved';

alter table public.purchasing_reports
  alter column status set default 'disbursed';

alter table public.purchasing_reports
  add constraint purchasing_reports_status_check
    check (status in ('disbursed', 'submitted', 'financially_approved', 'goods_received', 'rejected'));

alter table public.purchasing_reports
  add column if not exists received_by uuid references public.staff(id) on delete set null,
  add column if not exists received_at timestamptz;

create index if not exists idx_purchasing_reports_received_by on public.purchasing_reports(received_by);

-- 2. supplier_purchases: kolom bukti nota & pengiriman
alter table public.supplier_purchases
  add column if not exists payment_proof_url text,
  add column if not exists proof_uploaded_by uuid references public.staff(id) on delete set null,
  add column if not exists proof_uploaded_at timestamptz;

create index if not exists idx_supplier_purchases_proof_uploaded_by on public.supplier_purchases(proof_uploaded_by);

-- 3. stock_requests: pastikan kolom relasi tersedia
alter table public.stock_requests
  add column if not exists purchasing_report_id uuid references public.purchasing_reports(id) on delete set null,
  add column if not exists supplier_purchase_id uuid references public.supplier_purchases(id) on delete set null,
  add column if not exists goods_received_at timestamptz;

create index if not exists idx_stock_requests_purchasing_report on public.stock_requests(purchasing_report_id);
create index if not exists idx_stock_requests_supplier_purchase on public.stock_requests(supplier_purchase_id);

-- =========================================================================
-- 4. RPCs: SPJ FLOW
-- =========================================================================

-- 4a. approve_stock_request_spj
create or replace function public.approve_stock_request_spj(
  p_request_ids uuid[],
  p_purchasing_staff_id uuid,
  p_advance_amount numeric default 0,
  p_notes text default null
)
returns public.purchasing_reports language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_staff public.staff;
  v_cat_id uuid;
  v_trx_id uuid;
  v_advance public.cash_advances;
  v_report public.purchasing_reports;
  v_req_id uuid;
  v_req public.stock_requests;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  if p_request_ids is null or array_length(p_request_ids, 1) = 0 then
    raise exception 'Minimal 1 pengajuan restock harus dipilih';
  end if;
  if p_advance_amount is null or p_advance_amount < 0 then
    raise exception 'Nominal uang muka tidak valid';
  end if;

  select * into v_staff from public.staff where id = p_purchasing_staff_id and user_id = v_user_id;
  if v_staff is null then raise exception 'Staf purchasing tidak ditemukan'; end if;

  -- Validasi tiap stock request
  foreach v_req_id in array p_request_ids
  loop
    select * into v_req from public.stock_requests where id = v_req_id and user_id = v_user_id;
    if v_req is null then raise exception 'Pengajuan restock % tidak ditemukan', v_req_id; end if;
    if v_req.status <> 'pending' and v_req.status <> 'draft_auto' then
      raise exception 'Pengajuan restock % bukan berstatus pending (status: %)', v_req_id, v_req.status;
    end if;
    if v_req.fulfillment_type <> 'spj' then
      raise exception 'Pengajuan restock % bukan kategori SPJ', v_req_id;
    end if;
  end loop;

  -- 1. Berikan Uang Muka (Cash Advance) jika nominal > 0
  if p_advance_amount > 0 then
    select id into v_cat_id from public.transaction_categories
    where user_id = v_user_id and type = 'expense' and name = 'Uang Muka Purchasing' limit 1;
    if v_cat_id is null then
      insert into public.transaction_categories (user_id, name, type)
      values (v_user_id, 'Uang Muka Purchasing', 'expense')
      returning id into v_cat_id;
    end if;

    insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
    values (v_user_id, v_cat_id, 'Uang Muka - ' || v_staff.name, p_advance_amount, 'expense', current_date, coalesce(p_notes, 'Uang muka belanja SPJ'))
    returning id into v_trx_id;

    insert into public.cash_advances (user_id, staff_id, amount, purpose, date_given, status, transaction_id)
    values (v_user_id, p_purchasing_staff_id, p_advance_amount, coalesce(p_notes, 'Uang muka belanja SPJ'), current_date, 'outstanding', v_trx_id)
    returning * into v_advance;
  end if;

  -- 2. Buat Purchasing Report dengan status 'disbursed'
  insert into public.purchasing_reports (
    user_id, staff_id, cash_advance_id, report_date, status, total_amount, notes
  )
  values (
    v_user_id, p_purchasing_staff_id, v_advance.id, current_date, 'disbursed', 0, p_notes
  )
  returning * into v_report;

  -- 3. Update stock_requests -> in_progress & masukkan placeholder items ke purchasing_report_items
  foreach v_req_id in array p_request_ids
  loop
    select * into v_req from public.stock_requests where id = v_req_id;

    insert into public.purchasing_report_items (
      user_id, report_id, stock_request_id, material_id, material_color_id,
      category_id, description, quantity, unit, unit_price, total_price
    )
    values (
      v_user_id, v_report.id, v_req.id, v_req.material_id, v_req.material_color_id,
      null, coalesce(v_req.reason, 'Belanja restock'), v_req.quantity_needed, v_req.unit, 0, 0
    );

    update public.stock_requests
    set status = 'in_progress',
        approved_by = p_purchasing_staff_id,
        approved_at = now(),
        purchasing_report_id = v_report.id
    where id = v_req_id;
  end loop;

  return v_report;
end;
$$;

-- 4b. approve_purchasing_report (Revisi: Finance cek nota, catat expense & advance reversal, stock movements 'pending')
create or replace function public.approve_purchasing_report(p_report_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_report public.purchasing_reports;
  v_staff_name text;
  v_item record;
  v_cat record;
  v_advance public.cash_advances;
  v_total numeric := 0;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_report from public.purchasing_reports where id = p_report_id and user_id = v_user_id;
  if v_report is null then raise exception 'SPJ tidak ditemukan atau bukan milik Anda'; end if;
  if v_report.status <> 'submitted' then raise exception 'SPJ ini belum di-submit atau sudah diproses (status: %)', v_report.status; end if;

  select name into v_staff_name from public.staff where id = v_report.staff_id;

  select coalesce(sum(total_price), 0) into v_total
  from public.purchasing_report_items where report_id = p_report_id;

  -- 1. Buat stock_movements berstatus 'pending' (MENUNGGU diserahkan dan dicek fisik oleh Gudang)
  for v_item in select * from public.purchasing_report_items where report_id = p_report_id
  loop
    if v_item.material_id is not null then
      insert into public.stock_movements
        (user_id, material_id, material_color_id, movement_type, qty, unit, status, source_type, source_id, notes)
      values
        (v_user_id, v_item.material_id, v_item.material_color_id, 'in', v_item.quantity, v_item.unit, 'pending',
         'purchasing_report', p_report_id, 'SPJ - ' || coalesce(v_staff_name, 'Staf'));
    end if;
  end loop;

  -- 2. Catat transaksi expense per kategori
  for v_cat in
    select pri.category_id, c.name as category_name, sum(pri.total_price) as total
    from public.purchasing_report_items pri
    left join public.transaction_categories c on c.id = pri.category_id
    where pri.report_id = p_report_id
    group by pri.category_id, c.name
  loop
    if v_cat.total > 0 then
      insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
      values (v_user_id, v_cat.category_id, 'SPJ ' || coalesce(v_cat.category_name, 'Lainnya') || ' - ' || coalesce(v_staff_name, 'Staf'),
              v_cat.total, 'expense', v_report.report_date, 'Otomatis dari SPJ #' || p_report_id);
    end if;
  end loop;

  -- 3. Jasa purchasing jika ada
  if v_report.service_fee is not null and v_report.service_fee > 0 then
    insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
    values (v_user_id, null, 'Jasa Purchasing - ' || coalesce(v_staff_name, 'Staf'), v_report.service_fee, 'expense',
            v_report.report_date, 'Otomatis dari biaya jasa/transport SPJ #' || p_report_id);
  end if;

  -- 4. Reversal cash advance (income) & settle advance
  if v_report.cash_advance_id is not null then
    select * into v_advance from public.cash_advances where id = v_report.cash_advance_id;
    if v_advance is not null and v_advance.status = 'outstanding' then
      insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
      values (v_user_id, null, 'Reversal Uang Muka - ' || coalesce(v_staff_name, 'Staf'), v_advance.amount, 'income',
              v_report.report_date, 'Otomatis dari approval SPJ #' || p_report_id);
      update public.cash_advances set status = 'settled' where id = v_advance.id;
    end if;
  end if;

  -- 5. Update purchasing_reports status -> financially_approved
  update public.purchasing_reports
  set status = 'financially_approved',
      approved_at = now(),
      total_amount = v_total
  where id = p_report_id;
end;
$$;

-- 4c. confirm_purchasing_report_receipt (Konfirmasi barang fisik oleh staf Gudang)
create or replace function public.confirm_purchasing_report_receipt(
  p_report_id uuid,
  p_received_by uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_report public.purchasing_reports;
  v_item record;
  v_movement record;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_report from public.purchasing_reports where id = p_report_id and user_id = v_user_id;
  if v_report is null then raise exception 'SPJ tidak ditemukan'; end if;
  if v_report.status <> 'financially_approved' then
    raise exception 'SPJ harus berstatus financially_approved untuk dapat dikonfirmasi penerimaan barangnya (status: %)', v_report.status;
  end if;

  -- 1. Konfirmasi stock movements pending untuk report ini
  for v_movement in
    select * from public.stock_movements
    where source_type = 'purchasing_report' and source_id = p_report_id and status = 'pending' and user_id = v_user_id
  loop
    if v_movement.material_color_id is not null then
      update public.material_colors
      set stock_qty = stock_qty + v_movement.qty
      where id = v_movement.material_color_id;
    else
      update public.materials
      set stock_qty = stock_qty + v_movement.qty
      where id = v_movement.material_id;
    end if;

    update public.stock_movements
    set status = 'confirmed',
        confirmed_at = now(),
        recorded_by = p_received_by
    where id = v_movement.id;
  end loop;

  -- 2. Update harga material jika ada data unit_price pada purchasing_report_items
  for v_item in select * from public.purchasing_report_items where report_id = p_report_id
  loop
    if v_item.material_id is not null and v_item.unit_price is not null and v_item.unit_price > 0 then
      update public.materials set price = v_item.unit_price where id = v_item.material_id;
    end if;
    if v_item.stock_request_id is not null then
      update public.stock_requests
      set status = 'fulfilled',
          fulfilled_date = now(),
          goods_received_at = now()
      where id = v_item.stock_request_id;
    end if;
  end loop;

  -- Update juga stock_requests yang tertaut langsung via purchasing_report_id
  update public.stock_requests
  set status = 'fulfilled',
      fulfilled_date = now(),
      goods_received_at = now()
  where purchasing_report_id = p_report_id and status <> 'fulfilled';

  -- 3. Update purchasing_reports status -> goods_received
  update public.purchasing_reports
  set status = 'goods_received',
      received_by = p_received_by,
      received_at = now()
  where id = p_report_id;
end;
$$;

-- 4d. cancel_disbursed_report (Pembatalan SPJ saat masih disbursed)
create or replace function public.cancel_disbursed_report(
  p_report_id uuid,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_report public.purchasing_reports;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_report from public.purchasing_reports where id = p_report_id and user_id = v_user_id;
  if v_report is null then raise exception 'SPJ tidak ditemukan'; end if;
  if v_report.status <> 'disbursed' then
    raise exception 'Hanya SPJ dengan status disbursed yang dapat dibatalkan melalui aksi ini';
  end if;

  update public.purchasing_reports
  set status = 'rejected',
      notes = coalesce(notes, '') || case when p_reason is not null then E'\nAlasan dibatalkan: ' || p_reason else '' end
  where id = p_report_id;

  update public.stock_requests
  set status = 'rejected',
      rejected_reason = coalesce(p_reason, 'SPJ dibatalkan sebelum submit')
  where purchasing_report_id = p_report_id and status = 'in_progress';
end;
$$;

-- =========================================================================
-- 5. RPCs: DIRECT SUPPLIER FLOW
-- =========================================================================

-- 5a. approve_stock_request_supplier (1-click approve request + buat supplier_purchase)
create or replace function public.approve_stock_request_supplier(
  p_request_ids uuid[],
  p_requested_by uuid,
  p_supplier_name varchar,
  p_payment_date date,
  p_items jsonb,
  p_notes text default null
)
returns public.supplier_purchases language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_purchase public.supplier_purchases;
  v_item jsonb;
  v_total numeric := 0;
  v_line_total numeric;
  v_cat record;
  v_req_id uuid;
  v_req public.stock_requests;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal 1 item pembelian';
  end if;

  -- Validasi request ids jika ada
  if p_request_ids is not null and array_length(p_request_ids, 1) > 0 then
    foreach v_req_id in array p_request_ids
    loop
      select * into v_req from public.stock_requests where id = v_req_id and user_id = v_user_id;
      if v_req is null then raise exception 'Pengajuan restock % tidak ditemukan', v_req_id; end if;
      if v_req.status <> 'pending' and v_req.status <> 'draft_auto' then
        raise exception 'Pengajuan restock % bukan berstatus pending', v_req_id;
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
      (user_id, purchase_id, material_id, material_color_id, category_id, stock_request_id, quantity, unit, unit_price, total_price)
    values (
      v_user_id, v_purchase.id, (v_item->>'material_id')::uuid, nullif(v_item->>'material_color_id', '')::uuid,
      (v_item->>'category_id')::uuid, nullif(v_item->>'stock_request_id', '')::uuid,
      (v_item->>'quantity')::numeric, v_item->>'unit', (v_item->>'unit_price')::numeric, v_line_total
    );
  end loop;

  -- 3. Insert transaction expense per kategori
  for v_cat in
    select spi.category_id, c.name as category_name, sum(spi.total_price) as total
    from public.supplier_purchase_items spi
    left join public.transaction_categories c on c.id = spi.category_id
    where spi.purchase_id = v_purchase.id
    group by spi.category_id, c.name
  loop
    if v_cat.total > 0 then
      insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
      values (v_user_id, v_cat.category_id, 'Pembelian ' || coalesce(v_cat.category_name, 'Lainnya') || ' - ' || p_supplier_name,
              v_cat.total, 'expense', p_payment_date, 'Otomatis dari supplier purchase #' || v_purchase.id);
    end if;
  end loop;

  update public.supplier_purchases set total_amount = v_total where id = v_purchase.id;

  -- 4. Update stock_requests -> in_progress
  if p_request_ids is not null and array_length(p_request_ids, 1) > 0 then
    update public.stock_requests
    set status = 'in_progress',
        approved_by = p_requested_by,
        approved_at = now(),
        supplier_purchase_id = v_purchase.id
    where id = any(p_request_ids);
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if (v_item->>'stock_request_id') is not null and (v_item->>'stock_request_id') <> '' then
      update public.stock_requests
      set status = 'in_progress',
          approved_by = coalesce(approved_by, p_requested_by),
          approved_at = coalesce(approved_at, now()),
          supplier_purchase_id = v_purchase.id
      where id = (v_item->>'stock_request_id')::uuid;
    end if;
  end loop;

  select * into v_purchase from public.supplier_purchases where id = v_purchase.id;
  return v_purchase;
end;
$$;

-- 5b. upload_supplier_purchase_proof
create or replace function public.upload_supplier_purchase_proof(
  p_purchase_id uuid,
  p_proof_url text,
  p_uploaded_by uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  update public.supplier_purchases
  set payment_proof_url = p_proof_url,
      proof_uploaded_by = p_uploaded_by,
      proof_uploaded_at = now()
  where id = p_purchase_id and user_id = v_user_id;

  if not found then
    raise exception 'Pembelian supplier tidak ditemukan';
  end if;
end;
$$;

-- 5c. receive_supplier_purchase (Diperbarui menerima p_recorded_by opsional)
create or replace function public.receive_supplier_purchase(
  p_purchase_id uuid,
  p_recorded_by uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_purchase public.supplier_purchases;
  v_item record;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_purchase from public.supplier_purchases where id = p_purchase_id and user_id = v_user_id;
  if v_purchase is null then raise exception 'Data pembelian tidak ditemukan atau bukan milik Anda'; end if;
  if v_purchase.status <> 'ordered' then raise exception 'Status pembelian ini bukan "ordered"'; end if;

  for v_item in select * from public.supplier_purchase_items where purchase_id = p_purchase_id
  loop
    insert into public.stock_movements
      (user_id, material_id, material_color_id, movement_type, qty, unit, status, source_type, source_id, notes, recorded_by, confirmed_at)
    values (v_user_id, v_item.material_id, v_item.material_color_id, 'in', v_item.quantity, v_item.unit, 'confirmed',
            'supplier_purchase', p_purchase_id, 'Dari supplier ' || v_purchase.supplier_name, p_recorded_by, now());

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
      update public.stock_requests
      set status = 'fulfilled',
          fulfilled_date = now(),
          goods_received_at = now()
      where id = v_item.stock_request_id;
    end if;
  end loop;

  update public.stock_requests
  set status = 'fulfilled',
      fulfilled_date = now(),
      goods_received_at = now()
  where supplier_purchase_id = p_purchase_id and status <> 'fulfilled';

  update public.supplier_purchases set status = 'received', received_date = now() where id = p_purchase_id;
end;
$$;

-- 6. Permissions
revoke execute on function public.approve_stock_request_spj(uuid[], uuid, numeric, text) from public, anon;
grant execute on function public.approve_stock_request_spj(uuid[], uuid, numeric, text) to authenticated;

revoke execute on function public.approve_purchasing_report(uuid) from public, anon;
grant execute on function public.approve_purchasing_report(uuid) to authenticated;

revoke execute on function public.confirm_purchasing_report_receipt(uuid, uuid) from public, anon;
grant execute on function public.confirm_purchasing_report_receipt(uuid, uuid) to authenticated;

revoke execute on function public.cancel_disbursed_report(uuid, text) from public, anon;
grant execute on function public.cancel_disbursed_report(uuid, text) to authenticated;

revoke execute on function public.approve_stock_request_supplier(uuid[], uuid, varchar, date, jsonb, text) from public, anon;
grant execute on function public.approve_stock_request_supplier(uuid[], uuid, varchar, date, jsonb, text) to authenticated;

revoke execute on function public.upload_supplier_purchase_proof(uuid, text, uuid) from public, anon;
grant execute on function public.upload_supplier_purchase_proof(uuid, text, uuid) to authenticated;

revoke execute on function public.receive_supplier_purchase(uuid, uuid) from public, anon;
grant execute on function public.receive_supplier_purchase(uuid, uuid) to authenticated;
