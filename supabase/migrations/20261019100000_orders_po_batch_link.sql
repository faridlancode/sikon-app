-- ============================================================================
-- MIGRATION: 20261019100000_orders_po_batch_link.sql
-- FASE 1b: Tautkan Orders ke Batch PO, Default Tanggal WIB, Trigger Assign, & View
-- ============================================================================

-- 1. UBAH DEFAULT TANGGAL KE WIB (Asia/Jakarta)
alter table public.orders
  alter column order_date set default ((now() at time zone 'Asia/Jakarta')::date);

alter table public.order_payments
  alter column payment_date set default ((now() at time zone 'Asia/Jakarta')::date);

-- 2. TAMBAH KOLOM po_batch_id KE TABEL orders
alter table public.orders
  add column if not exists po_batch_id uuid references public.po_batches(id);

create index if not exists idx_orders_po_batch_id on public.orders (po_batch_id);

-- 3. BACKFILL ORDERS YANG SUDAH ADA
do $$
declare
  v_order     record;
  v_info      record;
  v_batch_id  uuid;
  v_today     date := (now() at time zone 'Asia/Jakarta')::date;
  v_is_past   boolean;
begin
  for v_order in
    select id, user_id, coalesce(order_date, created_at::date, v_today) as o_date
    from public.orders
    where po_batch_id is null
  loop
    select * into v_info from public.po_week_info(v_order.o_date);
    v_is_past := (v_info.end_date < v_today);

    -- Pastikan batch PO tersedia untuk setiap order lama
    insert into public.po_batches (
      user_id,
      code,
      period_year,
      period_month,
      seq_in_month,
      start_date,
      end_date,
      status,
      is_legacy,
      closed_at
    )
    values (
      v_order.user_id,
      v_info.code,
      v_info.period_year,
      v_info.period_month,
      v_info.seq_in_month,
      v_info.start_date,
      v_info.end_date,
      case when v_is_past then 'closed' else 'open' end,
      v_is_past,
      case when v_is_past then (v_info.end_date + time '23:59:59') at time zone 'Asia/Jakarta' else null end
    )
    on conflict (user_id, start_date) do update
      set is_legacy = (po_batches.is_legacy or excluded.is_legacy)
    returning id into v_batch_id;

    if v_batch_id is null then
      select id into v_batch_id
      from public.po_batches
      where user_id = v_order.user_id
        and start_date = v_info.start_date;
    end if;

    update public.orders
    set po_batch_id = v_batch_id
    where id = v_order.id;
  end loop;
end;
$$;

-- Setelah backfill, kolom po_batch_id wajib not null
alter table public.orders
  alter column po_batch_id set not null;

-- 4. TRIGGER FUNCTION trg_orders_assign_po_batch
create or replace function public.fn_orders_assign_po_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_info      record;
  v_next_info record;
  v_batch     public.po_batches;
begin
  -- Pastikan order_date memiliki nilai default WIB jika null
  if NEW.order_date is null then
    NEW.order_date := (now() at time zone 'Asia/Jakarta')::date;
  end if;

  -- Jika UPDATE dan order_date tidak berubah serta po_batch_id sudah ada, pertahankan
  if TG_OP = 'UPDATE' and OLD.order_date = NEW.order_date and NEW.po_batch_id is not null then
    return NEW;
  end if;

  select * into v_info from public.po_week_info(NEW.order_date);

  -- Cari batch yang ada untuk user_id dan minggu tersebut
  select * into v_batch
  from public.po_batches
  where user_id = NEW.user_id
    and start_date = v_info.start_date;

  if found then
    -- Aturan 3: Order baru atau perubahan order_date ke PO closed ditolak
    if v_batch.status = 'closed' then
      -- Jika UPDATE tapi po_batch_id sudah sesuai dan tidak ada perubahan tanggal (penanganan edge case)
      if TG_OP = 'UPDATE' and OLD.order_date = NEW.order_date and OLD.po_batch_id = v_batch.id then
        NEW.po_batch_id := v_batch.id;
        return NEW;
      end if;

      select * into v_next_info from public.po_week_info(v_info.end_date + 1);
      raise exception 'PO % sudah ditutup. Order baru masuk ke PO % (mulai %).',
        v_batch.code, v_next_info.code, to_char(v_next_info.start_date, 'YYYY-MM-DD')
        using errcode = 'P0001';
    end if;

    NEW.po_batch_id := v_batch.id;
  else
    -- Belum ada batch untuk minggu ini: buat baru (open)
    insert into public.po_batches (
      user_id,
      code,
      period_year,
      period_month,
      seq_in_month,
      start_date,
      end_date,
      status
    )
    values (
      NEW.user_id,
      v_info.code,
      v_info.period_year,
      v_info.period_month,
      v_info.seq_in_month,
      v_info.start_date,
      v_info.end_date,
      'open'
    )
    on conflict (user_id, start_date) do nothing
    returning * into v_batch;

    if v_batch.id is null then
      select * into v_batch
      from public.po_batches
      where user_id = NEW.user_id
        and start_date = v_info.start_date;
    else
      -- Catat event opened
      insert into public.po_batch_events (
        user_id,
        po_batch_id,
        event,
        reason,
        payload
      )
      values (
        NEW.user_id,
        v_batch.id,
        'opened',
        'Dibuat otomatis dari order baru',
        jsonb_build_object(
          'order_date', NEW.order_date,
          'code', v_info.code,
          'start_date', v_info.start_date,
          'end_date', v_info.end_date
        )
      );
    end if;

    NEW.po_batch_id := v_batch.id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_orders_assign_po_batch on public.orders;
create trigger trg_orders_assign_po_batch
  before insert or update of order_date
  on public.orders
  for each row
  execute function public.fn_orders_assign_po_batch();

-- 5. UPDATE VIEW orders_with_balance (Tambah 3 kolom di akhir)
create or replace view public.orders_with_balance
with (security_invoker = true) as
select
  -- 12 kolom orders
  o.id,
  o.user_id,
  o.order_id,
  o.sales_id,
  o.customer_name,
  o.total_price,
  o.ongkir,
  o.status,
  o.production_status,
  o.bonus_paid,
  o.order_date,
  o.created_at,
  -- 4 kolom kalkulasi (paid_amount bersih setelah dikurangi pelepasan)
  s.name as sales_name,
  (o.total_price + o.ongkir) as grand_total,
  coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0) as paid_amount,
  (o.total_price + o.ongkir) - (coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)) as remaining_amount,
  -- 2 kolom order_type
  o.order_type,
  o.is_order_type_manual_override,
  -- 3 kolom Batch PO di akhir
  o.po_batch_id,
  pb.code as po_code,
  pb.status as po_status
from public.orders o
left join public.sales s on s.id = o.sales_id
left join (
  select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
) p on p.order_id = o.id
left join (
  select order_id, sum(amount) as released_amount from public.order_deposit_releases group by order_id
) r on r.order_id = o.id
left join public.po_batches pb on pb.id = o.po_batch_id;

grant select on public.orders_with_balance to authenticated;
