-- ============================================================================
-- Migration 63 (M7): receipt_trigger.sql
-- Keterangan:
-- 1. Trigger AFTER INSERT pada order_payments untuk melahirkan kwitansi otomatis.
-- 2. Fungsi trigger: fn_auto_create_receipt (security definer, internal).
-- 3. Backfill kwitansi untuk order_payments yang sudah ada secara idempotent.
-- ============================================================================

-- 1. Fungsi Trigger
create or replace function public.fn_auto_create_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_code    varchar;
  v_customer_name varchar;
  v_receipt_no    varchar;
  v_type_label    varchar;
begin
  -- Ambil kode pesanan dan nama pelanggan dari orders
  select order_id, customer_name
    into v_order_code, v_customer_name
    from public.orders
   where id = NEW.order_id and user_id = NEW.user_id;

  if v_order_code is null then
    raise exception 'Pesanan tidak ditemukan atau bukan milik Anda' using errcode = 'P0002';
  end if;

  -- Label jenis pembayaran untuk deskripsi
  if NEW.payment_type = 'dp' then
    v_type_label := 'DP (Uang Muka)';
  else
    v_type_label := 'Pelunasan';
  end if;

  -- Buat nomor urut kwitansi KWT-YYYYMM-NNNN
  v_receipt_no := public.generate_document_no(NEW.user_id, 'receipt', NEW.payment_date);

  -- Insert baris kwitansi
  insert into public.receipts (
    user_id,
    receipt_no,
    receipt_date,
    order_id,
    payment_id,
    order_code,
    customer_name,
    amount,
    payment_type,
    payment_method,
    description,
    created_at
  ) values (
    NEW.user_id,
    v_receipt_no,
    NEW.payment_date,
    NEW.order_id,
    NEW.id,
    v_order_code,
    coalesce(nullif(trim(v_customer_name), ''), 'Pelanggan'),
    NEW.amount,
    NEW.payment_type,
    NEW.payment_method,
    'Pembayaran ' || v_type_label || ' untuk pesanan ' || v_order_code,
    now()
  );

  return NEW;
end;
$$;

-- Cabut hak eksekusi langsung (hanya sistem trigger yang mengeksekusi)
revoke execute on function public.fn_auto_create_receipt() from public, anon, authenticated;

-- 2. Pasang Trigger AFTER INSERT pada order_payments
drop trigger if exists trg_auto_create_receipt on public.order_payments;
create trigger trg_auto_create_receipt
  after insert on public.order_payments
  for each row
  execute function public.fn_auto_create_receipt();

-- 3. Backfill Idempotent untuk order_payments yang sudah ada
do $$
declare
  r_pay           record;
  v_order_code    varchar;
  v_customer_name varchar;
  v_receipt_no    varchar;
  v_type_label    varchar;
begin
  for r_pay in
    select op.*
      from public.order_payments op
     where not exists (
       select 1 from public.receipts r where r.payment_id = op.id
     )
     order by op.payment_date asc, op.created_at asc
  loop
    select order_id, customer_name
      into v_order_code, v_customer_name
      from public.orders
     where id = r_pay.order_id and user_id = r_pay.user_id;

    if v_order_code is not null then
      v_receipt_no := public.generate_document_no(r_pay.user_id, 'receipt', r_pay.payment_date);

      if r_pay.payment_type = 'dp' then
        v_type_label := 'DP (Uang Muka)';
      else
        v_type_label := 'Pelunasan';
      end if;

      insert into public.receipts (
        user_id,
        receipt_no,
        receipt_date,
        order_id,
        payment_id,
        order_code,
        customer_name,
        amount,
        payment_type,
        payment_method,
        description,
        created_at
      ) values (
        r_pay.user_id,
        v_receipt_no,
        r_pay.payment_date,
        r_pay.order_id,
        r_pay.id,
        v_order_code,
        coalesce(nullif(trim(v_customer_name), ''), 'Pelanggan'),
        r_pay.amount,
        r_pay.payment_type,
        r_pay.payment_method,
        'Pembayaran ' || v_type_label || ' untuk pesanan ' || v_order_code,
        coalesce(r_pay.created_at, now())
      )
      on conflict (payment_id) do nothing;
    end if;
  end loop;
end;
$$;
