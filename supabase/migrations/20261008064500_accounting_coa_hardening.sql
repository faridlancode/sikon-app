-- =========================================================================
-- Migration: Accounting Chart of Accounts & Settings Hardening
-- =========================================================================
-- Koreksi dan pengerasan untuk skema COA & settings (Migration 1):
-- 1. Ganti FK account_id, cash_account_id, counter_account_id menjadi NO ACTION
-- 2. Trigger guard_accounts_change:
--    - Tolak perubahan is_system dari false menjadi true pada UPDATE
--    - Izinkan DELETE akun sistem bila pemilik (old.user_id) sudah tidak ada di auth.users (cascade)
-- 3. Tambah check constraint books_start_date (harus tanggal 1) dan locked_through (harus akhir bulan)
-- 4. Revoke all privileges dari anon pada accounts dan accounting_settings
-- 5. Pastikan policy insert accounts melarang is_system = true dan accounting_settings select-only
-- =========================================================================

-- 1. Ganti foreign key menjadi ON DELETE NO ACTION
alter table public.transaction_categories
  drop constraint if exists transaction_categories_account_id_fkey,
  add constraint transaction_categories_account_id_fkey
    foreign key (account_id) references public.accounts(id) on delete no action;

alter table public.transactions
  drop constraint if exists transactions_cash_account_id_fkey,
  drop constraint if exists transactions_counter_account_id_fkey,
  add constraint transactions_cash_account_id_fkey
    foreign key (cash_account_id) references public.accounts(id) on delete no action,
  add constraint transactions_counter_account_id_fkey
    foreign key (counter_account_id) references public.accounts(id) on delete no action;

-- 2. Perbarui trigger guard_accounts_change
create or replace function public.guard_accounts_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- Izinkan penghapusan bila pemilik (old.user_id) sudah tidak ada di auth.users (cascade akun user)
    if not exists (select 1 from auth.users where id = old.user_id) then
      return old;
    end if;

    if old.is_system then
      raise exception 'Akun sistem (%) tidak dapat dihapus', old.code;
    end if;
    if to_regclass('public.journal_lines') is not null then
      if exists (select 1 from public.journal_lines where account_id = old.id) then
        raise exception 'Akun % (%) sudah memiliki riwayat mutasi jurnal dan tidak dapat dihapus, hanya bisa dinonaktifkan', old.code, old.name;
      end if;
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    -- Tolak perubahan is_system dari false menjadi true
    if old.is_system = false and new.is_system = true then
      raise exception 'Akun non-sistem (%) tidak dapat diubah menjadi akun sistem', old.code;
    end if;

    if old.is_system then
      if new.is_system = false then
        raise exception 'Status akun sistem (%) tidak dapat dicabut', old.code;
      end if;
      if new.code <> old.code then
        raise exception 'Kode akun sistem (%) tidak dapat diubah', old.code;
      end if;
      if new.account_type <> old.account_type then
        raise exception 'Tipe akun sistem (%) tidak dapat diubah', old.code;
      end if;
      if new.report_group <> old.report_group then
        raise exception 'Kelompok laporan akun sistem (%) tidak dapat diubah', old.code;
      end if;
      if new.is_cash <> old.is_cash then
        raise exception 'Status kas/bank akun sistem (%) tidak dapat diubah', old.code;
      end if;
      if new.cash_flow_activity <> old.cash_flow_activity then
        raise exception 'Aktivitas arus kas akun sistem (%) tidak dapat diubah', old.code;
      end if;
      if new.is_active = false then
        raise exception 'Akun sistem (%) tidak dapat dinonaktifkan', old.code;
      end if;
    end if;
    if new.account_type <> old.account_type then
      if to_regclass('public.journal_lines') is not null then
        if exists (select 1 from public.journal_lines where account_id = old.id) then
          raise exception 'Tipe akun % tidak dapat diubah karena sudah memiliki riwayat mutasi jurnal', old.code;
        end if;
      end if;
    end if;
    return new;
  end if;
  return null;
end;
$$;

revoke execute on function public.guard_accounts_change() from public, anon, authenticated;

drop trigger if exists trg_guard_accounts_change on public.accounts;
create trigger trg_guard_accounts_change
  before update or delete on public.accounts
  for each row execute function public.guard_accounts_change();

-- 3. Tambah check constraint pada accounting_settings
alter table public.accounting_settings
  drop constraint if exists accounting_settings_books_start_date_check,
  drop constraint if exists accounting_settings_locked_through_check;

alter table public.accounting_settings
  add constraint accounting_settings_books_start_date_check
    check (books_start_date is null or extract(day from books_start_date) = 1),
  add constraint accounting_settings_locked_through_check
    check (locked_through is null or locked_through = (date_trunc('month', locked_through) + interval '1 month' - interval '1 day')::date);

-- 4. Revoke seluruh akses dari anon
revoke all on table public.accounts from anon;
revoke all on table public.accounting_settings from anon;

-- 5. Pastikan policy RLS konsisten
drop policy if exists "Insert own non_system accounts" on public.accounts;
create policy "Insert own non_system accounts" on public.accounts
  for insert with check (auth.uid() = user_id and is_system = false);

grant select on table public.accounting_settings to authenticated;
revoke insert, update, delete on table public.accounting_settings from authenticated;
