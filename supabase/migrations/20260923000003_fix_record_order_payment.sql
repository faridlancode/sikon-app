-- =========================================================================
-- Migration: Fix record_order_payment (perbaiki error 42703 column "paid_amount" does not exist)
-- =========================================================================
-- Tabel public.orders tidak memiliki kolom "paid_amount" atau "payment_status".
-- Status pembayaran dihitung otomatis dari tabel public.order_payments (kolom amount)
-- melalui function public.recompute_order_status(p_order_id).
-- =========================================================================

create or replace function public.record_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_payment_type text,
  p_payment_date date default current_date,
  p_payment_method text default null,
  p_category_id uuid default null
)
returns public.order_payments
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders;
  v_transaction_id uuid;
  v_payment public.order_payments;
  v_label text;
  v_category_id uuid := p_category_id;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = v_user_id;
  if v_order is null then raise exception 'Order tidak ditemukan atau bukan milik Anda'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Jumlah pembayaran harus lebih dari 0'; end if;

  if v_category_id is null then
    select id into v_category_id from public.transaction_categories
    where user_id = v_user_id and name = 'Pembayaran Order' and type = 'income' limit 1;
  end if;

  v_label := (case when p_payment_type = 'dp' then 'DP Order ' else 'Pelunasan Order ' end)
             || v_order.order_id || ' - ' || v_order.customer_name;

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description, order_id)
  values (v_user_id, v_category_id, v_label, p_amount, 'income', p_payment_date,
          'Pembayaran ' || upper(p_payment_type) || ' Order ' || v_order.order_id || ' (' || coalesce(p_payment_method, 'Transfer') || ')',
          p_order_id)
  returning id into v_transaction_id;

  insert into public.order_payments (user_id, order_id, transaction_id, amount, payment_type, payment_date, payment_method)
  values (v_user_id, p_order_id, v_transaction_id, p_amount, p_payment_type, p_payment_date, p_payment_method)
  returning * into v_payment;

  perform public.recompute_order_status(p_order_id);

  return v_payment;
end;
$$;

revoke execute on function public.record_order_payment(uuid, numeric, text, date, text, uuid) from public, anon;
grant execute on function public.record_order_payment(uuid, numeric, text, date, text, uuid) to authenticated;
