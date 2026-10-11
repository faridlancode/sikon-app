-- =========================================================================
-- SIKon — Accounting Phase B1: Pengakuan Pendapatan Order Saat Dikirim
-- Migration: 20261010070000_accounting_order_revenue_recognition.sql
-- =========================================================================
-- Trigger trg_journal_order_revenue pada tabel public.orders:
-- 1. Saat production_status menjadi 'completed' dan akuntansi aktif:
--    Memposting jurnal pendapatan order (source_type = 'order_revenue', source_id = order.id).
--    - Debit 2-1200 (Uang Muka Pelanggan) sebesar bagian uang muka: min(grand_total, X)
--      X = jumlah kredit ke 2-1200 dari jurnal transaksi order_payments milik order itu
--          dikurangi jumlah order_deposit_releases order itu (refund dan forfeit).
--    - Debit 1-1300 (Piutang Usaha) sebesar sisa (grand_total - bagian uang muka), bila > 0.
--    - Kredit 4-1000 (Pendapatan Penjualan) sebesar total_price, bila > 0.
--    - Kredit 4-1100 (Pendapatan Ongkos Kirim) sebesar ongkir, bila > 0.
-- 2. Saat keluar dari 'completed': hapus jurnal order_revenue.
-- 3. Saat total_price atau ongkir berubah selagi 'completed': buat ulang jurnalnya
--    (jumlah jurnal order_revenue untuk order tersebut tetap tepat satu).
-- 4. Validasi: tolak bila tanggal <= locked_through; lewati bila tanggal < books_start_date
--    atau akuntansi belum aktif; validasi kepemilikan akun.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Fungsi Pembantu: post_order_revenue_journal
-- ---------------------------------------------------------------------------
create or replace function public.post_order_revenue_journal(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order           public.orders;
  v_settings        public.accounting_settings;
  v_entry_date      date := current_date;
  v_old_entry_date  date;
  v_entry_id        uuid;
  v_entry_no        varchar;
  v_grand_total     numeric;
  v_sum_cr_2200     numeric := 0;
  v_sum_pre_start_dp numeric := 0;
  v_sum_released    numeric := 0;
  v_x               numeric := 0;
  v_advance_part    numeric := 0;
  v_receivable_part numeric := 0;
  v_acct_2200_id    uuid;
  v_acct_1300_id    uuid;
  v_acct_4100_id    uuid;
  v_acct_4110_id    uuid;
  v_line_no         smallint := 1;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then
    return;
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_order.user_id;

  -- Lewati bila akuntansi belum aktif
  if v_settings.enabled is not true then
    return;
  end if;

  -- Periksa tanggal jurnal lama (bila ada) untuk mempertahankan entry_date saat membuat ulang jurnal
  select entry_date into v_old_entry_date
    from public.journal_entries
   where user_id = v_order.user_id
     and source_type = 'order_revenue'
     and source_id = p_order_id;

  -- Bila membuat ulang jurnal order yang masih completed, pakai entry_date jurnal lama
  v_entry_date := coalesce(v_old_entry_date, current_date);

  -- Lewati bila tanggal jurnal < books_start_date
  if v_settings.books_start_date is not null and v_entry_date < v_settings.books_start_date then
    return;
  end if;

  -- Tolak bila tanggal <= locked_through
  if v_settings.locked_through is not null and v_entry_date <= v_settings.locked_through then
    if v_old_entry_date is not null then
      raise exception 'Tidak dapat memperbarui pendapatan order: periode hingga % telah terkunci', v_settings.locked_through
        using errcode = 'P0001';
    else
      raise exception 'Tidak dapat mengakui pendapatan order: periode hingga % telah terkunci', v_settings.locked_through
        using errcode = 'P0001';
    end if;
  end if;

  -- Validasi kepemilikan akun standar
  select id into v_acct_2200_id from public.accounts where user_id = v_order.user_id and code = '2-1200';
  select id into v_acct_1300_id from public.accounts where user_id = v_order.user_id and code = '1-1300';
  select id into v_acct_4100_id from public.accounts where user_id = v_order.user_id and code = '4-1000';
  select id into v_acct_4110_id from public.accounts where user_id = v_order.user_id and code = '4-1100';

  if v_acct_2200_id is null or v_acct_1300_id is null or v_acct_4100_id is null or v_acct_4110_id is null then
    raise exception 'Akun standar akuntansi (2-1200, 1-1300, 4-1000, 4-1100) belum lengkap. Jalankan init_accounting terlebih dahulu.'
      using errcode = 'P0001';
  end if;

  -- Hapus jurnal lama bila ada agar jumlah jurnal tepat satu
  delete from public.journal_entries
   where user_id = v_order.user_id
     and source_type = 'order_revenue'
     and source_id = p_order_id;

  v_grand_total := coalesce(v_order.total_price, 0) + coalesce(v_order.ongkir, 0);

  -- Hitung X:
  -- (1) jumlah kredit ke 2-1200 pada jurnal transaksi milik order_payments order itu
  select coalesce(sum(jl.credit), 0)
    into v_sum_cr_2200
    from public.order_payments op
    join public.journal_entries je on je.source_id = op.transaction_id and je.source_type = 'transaction'
    join public.journal_lines jl on jl.entry_id = je.id
   where op.order_id = p_order_id
     and jl.account_id = v_acct_2200_id;

  -- (2) jumlah order_payments.amount dengan payment_date < books_start_date (sudah terwakili di jurnal saldo awal)
  select coalesce(sum(op.amount), 0)
    into v_sum_pre_start_dp
    from public.order_payments op
   where op.order_id = p_order_id
     and v_settings.books_start_date is not null
     and op.payment_date < v_settings.books_start_date;

  -- (3) jumlah semua order_deposit_releases order itu (refund dan forfeit)
  select coalesce(sum(amount), 0)
    into v_sum_released
    from public.order_deposit_releases
   where order_id = p_order_id;

  v_x := greatest(0, (v_sum_cr_2200 + v_sum_pre_start_dp) - v_sum_released);

  -- Bagian uang muka = min(grand_total, X)
  v_advance_part    := least(v_grand_total, v_x);
  v_receivable_part := v_grand_total - v_advance_part;

  -- Buat header jurnal baru
  v_entry_no := public.next_journal_entry_no(v_order.user_id, v_entry_date);

  insert into public.journal_entries (
    user_id, entry_no, entry_date, description, source_type, source_id
  )
  values (
    v_order.user_id,
    v_entry_no,
    v_entry_date,
    'Pendapatan Order ' || coalesce(v_order.order_id, v_order.id::text),
    'order_revenue',
    p_order_id
  )
  returning id into v_entry_id;

  -- Debit 2-1200 sebesar bagian uang muka (hanya bila > 0)
  if v_advance_part > 0 then
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_entry_id,
      v_acct_2200_id,
      v_advance_part,
      0,
      'Penyelesaian Uang Muka Order ' || coalesce(v_order.order_id, ''),
      v_line_no
    );
    v_line_no := v_line_no + 1;
  end if;

  -- Debit 1-1300 sebesar grand_total dikurangi bagian uang muka (hanya bila > 0)
  if v_receivable_part > 0 then
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_entry_id,
      v_acct_1300_id,
      v_receivable_part,
      0,
      'Piutang Usaha Order ' || coalesce(v_order.order_id, ''),
      v_line_no
    );
    v_line_no := v_line_no + 1;
  end if;

  -- Kredit 4-1000 sebesar total_price (hanya bila > 0)
  if coalesce(v_order.total_price, 0) > 0 then
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_entry_id,
      v_acct_4100_id,
      0,
      v_order.total_price,
      'Pendapatan Penjualan Order ' || coalesce(v_order.order_id, ''),
      v_line_no
    );
    v_line_no := v_line_no + 1;
  end if;

  -- Kredit 4-1100 sebesar ongkir (hanya bila > 0)
  if coalesce(v_order.ongkir, 0) > 0 then
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_entry_id,
      v_acct_4110_id,
      0,
      v_order.ongkir,
      'Pendapatan Ongkir Order ' || coalesce(v_order.order_id, ''),
      v_line_no
    );
    v_line_no := v_line_no + 1;
  end if;
end;
$$;

revoke execute on function public.post_order_revenue_journal(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fungsi Trigger: trg_journal_order_revenue_fn
-- ---------------------------------------------------------------------------
create or replace function public.trg_journal_order_revenue_fn()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_settings       public.accounting_settings;
  v_old_entry_date date;
begin
  -- Trigger hanya bertindak bila ada perubahan relevan:
  -- bandingkan OLD dan NEW pada production_status, total_price, ongkir dengan is distinct from
  if NEW.production_status is not distinct from OLD.production_status
     and NEW.total_price is not distinct from OLD.total_price
     and NEW.ongkir is not distinct from OLD.ongkir then
    return NEW;
  end if;

  if NEW.production_status = 'completed' then
    perform public.post_order_revenue_journal(NEW.id);
  elsif OLD.production_status = 'completed' and NEW.production_status <> 'completed' then
    -- Keluar dari completed: periksa periode terkunci lalu hapus jurnalnya
    select * into v_settings from public.accounting_settings where user_id = OLD.user_id;
    if v_settings.enabled is true and v_settings.locked_through is not null then
      select entry_date into v_old_entry_date
        from public.journal_entries
       where user_id = OLD.user_id
         and source_type = 'order_revenue'
         and source_id = OLD.id;

      if v_old_entry_date is not null and v_old_entry_date <= v_settings.locked_through then
        raise exception 'Tidak dapat membatalkan penyelesaian order: periode hingga % telah terkunci', v_settings.locked_through
          using errcode = 'P0001';
      end if;
    end if;

    delete from public.journal_entries
     where user_id = OLD.user_id
       and source_type = 'order_revenue'
       and source_id = OLD.id;
  end if;

  return NEW;
end;
$$;

revoke execute on function public.trg_journal_order_revenue_fn() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Trigger trg_journal_order_revenue pada tabel public.orders
-- ---------------------------------------------------------------------------
drop trigger if exists trg_journal_order_revenue on public.orders;
create trigger trg_journal_order_revenue
  after update of production_status, total_price, ongkir
  on public.orders
  for each row
  execute function public.trg_journal_order_revenue_fn();
