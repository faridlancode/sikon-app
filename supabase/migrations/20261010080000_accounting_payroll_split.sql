-- =========================================================================
-- SIKon — Accounting Phase B2: Pembagian Upah Borongan (Payroll Split)
-- Migration: 20261010080000_accounting_payroll_split.sql
-- =========================================================================
-- Trigger trg_journal_payroll_split pada tabel public.weekly_payrolls:
-- 1. Bertindak after update of status, transaction_id or delete pada weekly_payrolls
--    (hanya bila nilai relevan benar-benar berubah).
-- 2. Jangan menyentuh jurnal transaksi gaji (Debit 6-1000, Kredit kas/bank).
-- 3. Saat status menjadi 'paid' dan transaction_id terisi:
--    Buat satu jurnal reklasifikasi (source_type = 'payroll_split', source_id = weekly_payrolls.id)
--    bertanggal sama dengan transaksi:
--    - Debit 5-1100 (Upah Borongan Produksi)
--    - Kredit 6-1000 (Beban Gaji & Upah)
--    sebesar least(Sigma payroll_items.piecework_amount, amount transaksi).
-- 4. Lewati bila nilainya 0, akuntansi belum aktif, tanggal < books_start_date,
--    atau bila baris debit jurnal transaksi itu bukan 6-1000.
-- 5. Tolak bila tanggal <= locked_through.
-- 6. Bila status keluar dari 'paid', transaction_id jadi null, atau baris dihapus:
--    hapus jurnal reklasifikasi (dengan pemeriksaan periode terkunci).
-- =========================================================================

create or replace function public.trg_journal_payroll_split_fn()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_settings          public.accounting_settings;
  v_txn               public.transactions;
  v_txn_entry_id      uuid;
  v_acct_5100         uuid;
  v_acct_6100         uuid;
  v_sum_piecework     numeric := 0;
  v_reclass_amount    numeric := 0;
  v_entry_no          varchar;
  v_reclass_entry_id  uuid;
  v_old_entry         public.journal_entries;
  v_target_user_id    uuid;
  v_target_id         uuid;
begin
  -- 1. Guard: bertindak hanya bila nilai relevan benar-benar berubah
  if TG_OP = 'UPDATE' then
    if NEW.status is not distinct from OLD.status
       and NEW.transaction_id is not distinct from OLD.transaction_id then
      return NEW;
    end if;
  end if;

  -- 2. Kasus A: Status menjadi 'paid' dan transaction_id terisi
  if TG_OP = 'UPDATE' and NEW.status = 'paid' and NEW.transaction_id is not null then
    select * into v_settings from public.accounting_settings where user_id = NEW.user_id;

    -- Lewati bila akuntansi belum aktif
    if v_settings.enabled is not true then
      return NEW;
    end if;

    select * into v_txn from public.transactions where id = NEW.transaction_id;
    if v_txn is null then
      return NEW;
    end if;

    -- Lewati bila tanggal transaksi < books_start_date
    if v_settings.books_start_date is not null and v_txn.transaction_date < v_settings.books_start_date then
      return NEW;
    end if;

    -- Tolak bila tanggal transaksi <= locked_through
    if v_settings.locked_through is not null and v_txn.transaction_date <= v_settings.locked_through then
      raise exception 'Tidak dapat mereklasifikasi upah borongan: periode hingga % telah terkunci', v_settings.locked_through
        using errcode = 'P0001';
    end if;

    -- Ambil akun 5-1100 dan 6-1000
    select id into v_acct_5100 from public.accounts where user_id = NEW.user_id and code = '5-1100';
    select id into v_acct_6100 from public.accounts where user_id = NEW.user_id and code = '6-1000';

    if v_acct_5100 is null or v_acct_6100 is null then
      raise exception 'Akun standar akuntansi (5-1100, 6-1000) belum lengkap. Jalankan init_accounting terlebih dahulu.'
        using errcode = 'P0001';
    end if;

    -- Ambil jurnal transaksi gaji
    select je.id into v_txn_entry_id
      from public.journal_entries je
     where je.user_id = NEW.user_id
       and je.source_type = 'transaction'
       and je.source_id = NEW.transaction_id;

    -- Lewati bila jurnal transaksi belum ada
    if v_txn_entry_id is null then
      return NEW;
    end if;

    -- Lewati bila baris debit jurnal transaksi itu bukan 6-1000
    if not exists (
      select 1 from public.journal_lines
       where entry_id = v_txn_entry_id
         and account_id = v_acct_6100
         and debit > 0
    ) then
      return NEW;
    end if;

    -- Hitung total borongan dari payroll_items
    select coalesce(sum(piecework_amount), 0)
      into v_sum_piecework
      from public.payroll_items
     where payroll_id = NEW.id;

    v_reclass_amount := least(v_sum_piecework, coalesce(v_txn.amount, 0));

    -- Lewati bila nominal reklasifikasi <= 0
    if v_reclass_amount <= 0 then
      -- Pastikan tidak ada jurnal reklasifikasi lama yang tersisa
      delete from public.journal_entries
       where user_id = NEW.user_id
         and source_type = 'payroll_split'
         and source_id = NEW.id;
      return NEW;
    end if;

    -- Hapus jurnal lama bila ada agar tetap tepat satu
    delete from public.journal_entries
     where user_id = NEW.user_id
       and source_type = 'payroll_split'
       and source_id = NEW.id;

    -- Buat jurnal reklasifikasi
    v_entry_no := public.next_journal_entry_no(NEW.user_id, v_txn.transaction_date);

    insert into public.journal_entries (
      user_id, entry_no, entry_date, description, source_type, source_id
    )
    values (
      NEW.user_id,
      v_entry_no,
      v_txn.transaction_date,
      'Reklasifikasi Upah Borongan Payroll ' || to_char(NEW.period_start, 'DD/MM') || ' - ' || to_char(NEW.period_end, 'DD/MM/YYYY'),
      'payroll_split',
      NEW.id
    )
    returning id into v_reclass_entry_id;

    -- Baris 1: Debit 5-1100 (Upah Borongan Produksi)
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_reclass_entry_id,
      v_acct_5100,
      v_reclass_amount,
      0,
      'Upah Borongan Produksi',
      1
    );

    -- Baris 2: Kredit 6-1000 (Beban Gaji & Upah)
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_reclass_entry_id,
      v_acct_6100,
      0,
      v_reclass_amount,
      'Pengurang Beban Gaji (Reklasifikasi Upah Borongan)',
      2
    );

    return NEW;

  -- 3. Kasus B: Keluar dari status 'paid', transaction_id menjadi null, atau baris dihapus
  elsif TG_OP = 'DELETE' or (TG_OP = 'UPDATE' and (OLD.status = 'paid' and (NEW.status <> 'paid' or NEW.transaction_id is null))) then
    v_target_user_id := coalesce(OLD.user_id, NEW.user_id);
    v_target_id      := coalesce(OLD.id, NEW.id);

    select * into v_old_entry
      from public.journal_entries
     where user_id = v_target_user_id
       and source_type = 'payroll_split'
       and source_id = v_target_id;

    if v_old_entry.id is not null then
      select * into v_settings from public.accounting_settings where user_id = v_target_user_id;

      -- Tolak bila periode telah terkunci
      if v_settings.enabled is true and v_settings.locked_through is not null
         and v_old_entry.entry_date <= v_settings.locked_through then
        raise exception 'Tidak dapat membatalkan reklasifikasi upah borongan: periode hingga % telah terkunci', v_settings.locked_through
          using errcode = 'P0001';
      end if;

      delete from public.journal_entries where id = v_old_entry.id;
    end if;

    if TG_OP = 'DELETE' then
      return OLD;
    else
      return NEW;
    end if;
  end if;

  return NEW;
end;
$$;

revoke execute on function public.trg_journal_payroll_split_fn() from public, anon, authenticated;

drop trigger if exists trg_journal_payroll_split on public.weekly_payrolls;
create trigger trg_journal_payroll_split
  after update of status, transaction_id or delete
  on public.weekly_payrolls
  for each row
  execute function public.trg_journal_payroll_split_fn();

-- ---------------------------------------------------------------------------
-- Perbarui pay_weekly_payroll agar kategori 'Gaji Karyawan' otomatis terhubung
-- ke akun 6-1000 (Beban Gaji & Upah) jika akuntansi telah diinisialisasi
-- ---------------------------------------------------------------------------
create or replace function public.pay_weekly_payroll(p_payroll_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_payroll  public.weekly_payrolls;
  v_cat_id   uuid;
  v_trx_id   uuid;
  v_item     record;
  v_acct_6100 uuid;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_payroll from public.weekly_payrolls where id = p_payroll_id and user_id = v_user_id;
  if v_payroll is null then
    raise exception 'Data payroll tidak ditemukan atau bukan milik Anda';
  end if;

  if v_payroll.status = 'paid' then
    raise exception 'Payroll ini sudah dibayarkan sebelumnya';
  end if;

  -- Cari akun 6-1000 jika ada
  select id into v_acct_6100 from public.accounts where user_id = v_user_id and code = '6-1000' limit 1;

  select id into v_cat_id from public.transaction_categories
  where user_id = v_user_id and name = 'Gaji Karyawan' and type = 'expense' limit 1;

  if v_cat_id is null then
    insert into public.transaction_categories (user_id, name, type, account_id)
    values (v_user_id, 'Gaji Karyawan', 'expense', v_acct_6100)
    returning id into v_cat_id;
  elsif v_acct_6100 is not null then
    update public.transaction_categories
       set account_id = v_acct_6100
     where id = v_cat_id and account_id is null;
  end if;

  insert into public.transactions (user_id, category_id, title, amount, type, transaction_date, description)
  values (
    v_user_id, v_cat_id,
    'Gaji Karyawan (' || to_char(v_payroll.period_start, 'DD/MM') || ' - ' || to_char(v_payroll.period_end, 'DD/MM/YYYY') || ')',
    v_payroll.total_amount, 'expense', v_payroll.payment_date,
    'Pembayaran payroll mingguan untuk karyawan (absensi, upah borongan, bonus sales)'
  )
  returning id into v_trx_id;

  for v_item in select staff_id from public.payroll_items where payroll_id = p_payroll_id and wage_type = 'piecework'
  loop
    update public.piecework_tasks
    set status = 'paid', payroll_id = p_payroll_id, paid_at = now()
    where user_id = v_user_id and staff_id = v_item.staff_id and status = 'completed';
  end loop;

  update public.weekly_payrolls set status = 'paid', transaction_id = v_trx_id where id = p_payroll_id;

  return jsonb_build_object('payroll_id', p_payroll_id, 'transaction_id', v_trx_id, 'status', 'paid');
end;
$$;

revoke execute on function public.pay_weekly_payroll(uuid) from public, anon;
grant execute on function public.pay_weekly_payroll(uuid) to authenticated;

