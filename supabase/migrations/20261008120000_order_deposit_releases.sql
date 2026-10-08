-- =========================================================================
-- Migration: Order Deposit Releases (Fase A - Langkah 7)
-- =========================================================================
-- Menambahkan:
-- 1. Tabel public.order_deposit_releases
-- 2. Trigger trg_journal_order_forfeit (posting jurnal DP hangus)
-- 3. RPC release_order_deposit (kembalikan uang / hanguskan DP)
-- 4. RPC delete_order_deposit_release (batalkan pelepasan)
-- 5. Update recompute_order_status: "paid_amount" jadi bersih (Σ bayar - Σ pelepasan)
-- 6. Update delete_order_payment: tolak jika Σ bayar < Σ pelepasan (aturan keras 13)
-- 7. Update orders_with_balance dan sales_performance: paid_amount jadi bersih
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. TABEL order_deposit_releases
-- ---------------------------------------------------------------------------
create table if not exists public.order_deposit_releases (
  id             uuid    primary key default gen_random_uuid(),
  user_id        uuid    not null references auth.users(id) on delete cascade,
  order_id       uuid    not null references public.orders(id) on delete cascade,
  kind           varchar(10) not null,
  amount         numeric not null,
  release_date   date    not null default current_date,
  payment_method text    null,
  transaction_id uuid    null references public.transactions(id),  -- NO ACTION default
  notes          text    null,
  created_at     timestamptz not null default now(),

  constraint order_deposit_releases_kind_check check (kind in ('refund', 'forfeit')),
  constraint order_deposit_releases_amount_check check (amount > 0),
  -- refund wajib punya transaction_id; forfeit harus null
  constraint order_deposit_releases_refund_needs_txn check (
    (kind = 'refund' and transaction_id is not null) or
    (kind = 'forfeit' and transaction_id is null)
  ),
  -- refund wajib punya payment_method
  constraint order_deposit_releases_refund_needs_method check (
    kind = 'forfeit' or payment_method is not null
  )
);

comment on table  public.order_deposit_releases            is 'Pelepasan DP pelanggan: refund (uang dikembalikan) atau forfeit (DP hangus)';
comment on column public.order_deposit_releases.kind       is 'refund = uang dikembalikan; forfeit = DP hangus menjadi pendapatan';
comment on column public.order_deposit_releases.transaction_id is 'FK ke transactions (NO ACTION default); wajib untuk refund, null untuk forfeit';

create index if not exists idx_order_deposit_releases_order
  on public.order_deposit_releases (order_id);

create index if not exists idx_order_deposit_releases_user
  on public.order_deposit_releases (user_id);

alter table public.order_deposit_releases enable row level security;

drop policy if exists "Select own order_deposit_releases"  on public.order_deposit_releases;
drop policy if exists "Manage own order_deposit_releases"  on public.order_deposit_releases;

create policy "Select own order_deposit_releases" on public.order_deposit_releases
  for select using (auth.uid() = user_id);

grant select on table public.order_deposit_releases to authenticated;
revoke insert, update, delete on table public.order_deposit_releases from authenticated;
grant all on table public.order_deposit_releases to service_role;

-- ---------------------------------------------------------------------------
-- 2. TRIGGER trg_journal_order_forfeit
--    Posting jurnal DP hangus (#5): Dr 2-1200 / Cr 4-9000
--    Hanya untuk kind = 'forfeit'. refund ditangani trigger transactions.
-- ---------------------------------------------------------------------------
create or replace function public.journal_order_forfeit()
returns trigger language plpgsql
security definer set search_path = public as $$
declare
  v_uid          uuid;
  v_settings     record;
  v_acct_2200    uuid;
  v_acct_4900    uuid;
  v_entry_id     uuid;
  v_entry_no     varchar;
  v_order        record;
begin
  -- Hanya untuk forfeit
  if tg_op = 'INSERT' and new.kind <> 'forfeit' then return new; end if;
  if tg_op = 'DELETE' and old.kind <> 'forfeit' then return old; end if;

  v_uid := coalesce(new.user_id, old.user_id);
  select * into v_settings from public.accounting_settings where user_id = v_uid;

  if v_settings is null or not v_settings.enabled then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    -- Hapus jurnal forfeit terkait
    delete from public.journal_entries
     where user_id = v_uid
       and source_type = 'order_forfeit'
       and source_id = old.id;
    return old;
  end if;

  -- INSERT: cek periode terkunci
  if v_settings.locked_through is not null and new.release_date <= v_settings.locked_through then
    raise exception 'Periode akuntansi sampai % sudah ditutup.', v_settings.locked_through
      using errcode = 'P0001';
  end if;
  if v_settings.books_start_date is not null and new.release_date < v_settings.books_start_date then
    return new;  -- sebelum tanggal mulai, tidak dijurnal
  end if;

  select id into v_acct_2200 from public.accounts where user_id = v_uid and code = '2-1200' limit 1;
  select id into v_acct_4900 from public.accounts where user_id = v_uid and code = '4-9000' limit 1;

  if v_acct_2200 is null or v_acct_4900 is null then
    return new;  -- COA belum diinisialisasi
  end if;

  select o.order_id || ' - ' || o.customer_name into v_order.order_id
    from public.orders o where o.id = new.order_id;

  v_entry_no := public.next_journal_entry_no(v_uid, new.release_date);

  insert into public.journal_entries (user_id, entry_no, entry_date, description, source_type, source_id)
  values (v_uid, v_entry_no, new.release_date,
          'DP Hangus - Order ' || coalesce(v_order.order_id, new.order_id::text),
          'order_forfeit', new.id)
  returning id into v_entry_id;

  -- Dr 2-1200 / Cr 4-9000
  insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
  values
    (v_entry_id, v_acct_2200, new.amount, 0,           'DP hangus ' || coalesce(new.notes, ''), 1),
    (v_entry_id, v_acct_4900, 0,          new.amount,  'DP hangus ' || coalesce(new.notes, ''), 2);

  return new;
end;
$$;

revoke execute on function public.journal_order_forfeit() from public, anon, authenticated;

drop trigger if exists trg_journal_order_forfeit on public.order_deposit_releases;
create trigger trg_journal_order_forfeit
  after insert or delete on public.order_deposit_releases
  for each row execute function public.journal_order_forfeit();

-- ---------------------------------------------------------------------------
-- 3. recompute_order_status: paid_amount = Σ bayar - Σ pelepasan (bersih)
--    Sumber: 20260923000003_fix_record_order_payment.sql
-- ---------------------------------------------------------------------------
create or replace function public.recompute_order_status(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total  numeric;
  v_paid   numeric;
  v_released numeric;
  v_net    numeric;
begin
  select (total_price + ongkir) into v_total from public.orders where id = p_order_id;
  select coalesce(sum(amount), 0) into v_paid
    from public.order_payments where order_id = p_order_id;
  select coalesce(sum(amount), 0) into v_released
    from public.order_deposit_releases where order_id = p_order_id;
  v_net := v_paid - v_released;
  update public.orders
  set status = case when v_total > 0 and v_net >= v_total then 'lunas' else 'belum_lunas' end
  where id = p_order_id;
end;
$$;

revoke execute on function public.recompute_order_status(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. delete_order_payment: tambah penolakan aturan keras 13
--    Sumber: 20260101000002_core_financial_and_orders.sql
-- ---------------------------------------------------------------------------
create or replace function public.delete_order_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id        uuid := auth.uid();
  v_payment        public.order_payments;
  v_total_paid     numeric;
  v_total_released numeric;
  v_settings       record;
  v_txn_date       date;
begin
  select * into v_payment from public.order_payments
   where id = p_payment_id and user_id = v_user_id;
  if v_payment is null then
    raise exception 'Data pembayaran tidak ditemukan atau bukan milik Anda';
  end if;

  -- Aturan keras 13: tolak jika menghapus pembayaran ini membuat total_bayar < total_pelepasan
  select coalesce(sum(amount), 0) into v_total_paid
    from public.order_payments where order_id = v_payment.order_id;
  select coalesce(sum(amount), 0) into v_total_released
    from public.order_deposit_releases where order_id = v_payment.order_id;

  if (v_total_paid - v_payment.amount) < v_total_released then
    raise exception
      'Pembayaran ini sudah sebagian dikembalikan atau dihanguskan. Batalkan pelepasan DP terlebih dahulu.'
      using errcode = 'P0001';
  end if;

  -- Cek periode terkunci
  select * into v_settings from public.accounting_settings where user_id = v_user_id;
  if v_settings.enabled and v_settings.locked_through is not null then
    select transaction_date into v_txn_date from public.transactions where id = v_payment.transaction_id;
    if v_txn_date is not null and v_txn_date <= v_settings.locked_through then
      raise exception 'Periode akuntansi sampai % sudah ditutup.', v_settings.locked_through
        using errcode = 'P0001';
    end if;
  end if;

  delete from public.transactions where id = v_payment.transaction_id and user_id = v_user_id;
  delete from public.order_payments where id = p_payment_id;
  perform public.recompute_order_status(v_payment.order_id);
end;
$$;

revoke execute on function public.delete_order_payment(uuid) from public, anon;
grant  execute on function public.delete_order_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. release_order_deposit
-- ---------------------------------------------------------------------------
create or replace function public.release_order_deposit(
  p_order_id       uuid,
  p_kind           text,
  p_amount         numeric,
  p_date           date   default current_date,
  p_payment_method text   default null,
  p_notes          text   default null
)
returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_uid            uuid := auth.uid();
  v_order          record;
  v_total_paid     numeric;
  v_total_released numeric;
  v_available      numeric;
  v_settings       record;
  v_release_id     uuid;
  v_txn_id         uuid;
  v_cat_id         uuid;
  v_cash_acct      uuid;
  v_akun_code      text;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi' using errcode = '42501'; end if;

  -- Validasi kind
  if p_kind not in ('refund', 'forfeit') then
    raise exception 'Jenis pelepasan harus "refund" atau "forfeit"' using errcode = 'P0001';
  end if;

  -- Ambil order
  select * into v_order from public.orders where id = p_order_id and user_id = v_uid;
  if not found then raise exception 'Order tidak ditemukan atau bukan milik Anda' using errcode = 'P0001'; end if;

  -- Aturan keras 12a: hanya untuk order yang belum completed
  if v_order.production_status = 'completed' then
    raise exception 'Order sudah dikirim, DP tidak dapat dikembalikan dari sini' using errcode = 'P0001';
  end if;

  -- Hitung dana tersedia
  select coalesce(sum(amount), 0) into v_total_paid
    from public.order_payments where order_id = p_order_id;
  select coalesce(sum(amount), 0) into v_total_released
    from public.order_deposit_releases where order_id = p_order_id;
  v_available := v_total_paid - v_total_released;

  -- Aturan keras 12b: nominal <= sisa dana
  if p_amount > v_available then
    raise exception 'Nominal melebihi sisa dana pelanggan Rp %', v_available
      using errcode = 'P0001';
  end if;
  if p_amount <= 0 then
    raise exception 'Nominal harus lebih dari 0' using errcode = 'P0001';
  end if;

  -- Cek periode terkunci
  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings.enabled and v_settings.locked_through is not null
     and p_date <= v_settings.locked_through then
    raise exception 'Periode akuntansi sampai % sudah ditutup.', v_settings.locked_through
      using errcode = 'P0001';
  end if;

  if p_kind = 'refund' then
    -- refund wajib punya payment_method
    if p_payment_method is null then
      raise exception 'Metode pembayaran wajib diisi untuk pengembalian uang' using errcode = 'P0001';
    end if;

    -- Cari/buat kategori 'Pengembalian Uang Pelanggan'
    select id into v_cat_id from public.transaction_categories
     where user_id = v_uid and name = 'Pengembalian Uang Pelanggan' and type = 'expense'
     limit 1;

    if v_cat_id is null then
      -- Buat kategori dengan account_id = 2-1200 (Uang Muka Pelanggan)
      insert into public.transaction_categories (user_id, name, type, account_id)
      select v_uid, 'Pengembalian Uang Pelanggan', 'expense', a.id
        from public.accounts a where a.user_id = v_uid and a.code = '2-1200'
      limit 1
      returning id into v_cat_id;

      if v_cat_id is null then
        insert into public.transaction_categories (user_id, name, type)
        values (v_uid, 'Pengembalian Uang Pelanggan', 'expense')
        returning id into v_cat_id;
      end if;
    end if;

    -- Tentukan akun kas/bank
    v_akun_code := case when lower(p_payment_method) = 'cash' then '1-1100' else '1-1200' end;
    select id into v_cash_acct from public.accounts
     where user_id = v_uid and code = v_akun_code limit 1;

    -- Insert transaksi expense
    insert into public.transactions (
      user_id, category_id, title, amount, type, transaction_date, description, order_id, cash_account_id
    ) values (
      v_uid, v_cat_id,
      'Pengembalian DP - Order ' || v_order.order_id || ' - ' || v_order.customer_name,
      p_amount, 'expense', p_date,
      'Pengembalian uang pelanggan' || coalesce(': ' || p_notes, ''),
      p_order_id, v_cash_acct
    ) returning id into v_txn_id;

    -- Insert order_deposit_releases (refund)
    insert into public.order_deposit_releases (user_id, order_id, kind, amount, release_date, payment_method, transaction_id, notes)
    values (v_uid, p_order_id, 'refund', p_amount, p_date, p_payment_method, v_txn_id, p_notes)
    returning id into v_release_id;

  else
    -- forfeit: hanya insert order_deposit_releases (trigger posting jurnal)
    insert into public.order_deposit_releases (user_id, order_id, kind, amount, release_date, notes)
    values (v_uid, p_order_id, 'forfeit', p_amount, p_date, p_notes)
    returning id into v_release_id;
  end if;

  perform public.recompute_order_status(p_order_id);
  return v_release_id;
end;
$$;

revoke execute on function public.release_order_deposit(uuid, text, numeric, date, text, text) from public, anon;
grant  execute on function public.release_order_deposit(uuid, text, numeric, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. delete_order_deposit_release
-- ---------------------------------------------------------------------------
create or replace function public.delete_order_deposit_release(p_release_id uuid)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_release  record;
  v_settings record;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi' using errcode = '42501'; end if;

  select * into v_release from public.order_deposit_releases
   where id = p_release_id and user_id = v_uid;
  if not found then raise exception 'Data pelepasan tidak ditemukan atau bukan milik Anda' using errcode = 'P0001'; end if;

  -- Cek periode terkunci
  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings.enabled and v_settings.locked_through is not null
     and v_release.release_date <= v_settings.locked_through then
    raise exception 'Periode akuntansi sampai % sudah ditutup.', v_settings.locked_through
      using errcode = 'P0001';
  end if;

  -- Hapus transaksi refund terlebih dahulu (jika ada; trigger akan hapus jurnalnya)
  if v_release.transaction_id is not null then
    delete from public.transactions where id = v_release.transaction_id and user_id = v_uid;
  end if;

  -- Hapus pelepasan (trigger akan hapus jurnal forfeit jika kind = 'forfeit')
  delete from public.order_deposit_releases where id = p_release_id;

  perform public.recompute_order_status(v_release.order_id);
end;
$$;

revoke execute on function public.delete_order_deposit_release(uuid) from public, anon;
grant  execute on function public.delete_order_deposit_release(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Update views: paid_amount jadi bersih (Σ bayar - Σ pelepasan)
-- ---------------------------------------------------------------------------
create or replace view public.orders_with_balance
with (security_invoker = true) as
select
  o.id, o.user_id, o.order_id, o.sales_id, o.customer_name,
  o.total_price, o.ongkir, o.status, o.production_status, o.bonus_paid,
  o.order_date, o.created_at, o.order_type, o.is_order_type_manual_override,
  s.name as sales_name,
  (o.total_price + o.ongkir) as grand_total,
  coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0) as paid_amount,
  (o.total_price + o.ongkir) - (coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)) as remaining_amount
from public.orders o
left join public.sales s on s.id = o.sales_id
left join (
  select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
) p on p.order_id = o.id
left join (
  select order_id, sum(amount) as released_amount from public.order_deposit_releases group by order_id
) r on r.order_id = o.id;

grant select on public.orders_with_balance to authenticated;
grant select on public.orders_with_balance to anon;

create or replace view public.sales_performance
with (security_invoker = true) as
select
  s.id as sales_id, s.user_id, s.name as sales_name, s.is_active,
  count(o.id) as total_orders,
  coalesce(sum(o.total_price + o.ongkir), 0) as total_revenue,
  coalesce(sum(coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)), 0) as total_paid,
  coalesce(sum(
    (o.total_price + o.ongkir) - (coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0))
  ) filter (where o.status = 'belum_lunas'), 0) as total_outstanding
from public.sales s
left join public.orders o on o.sales_id = s.id
left join (
  select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
) p on p.order_id = o.id
left join (
  select order_id, sum(amount) as released_amount from public.order_deposit_releases group by order_id
) r on r.order_id = o.id
group by s.id, s.user_id, s.name, s.is_active;

grant select on public.sales_performance to authenticated;
grant select on public.sales_performance to anon;
