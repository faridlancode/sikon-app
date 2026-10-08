-- =========================================================================
-- Migration: Accounting Chart of Accounts & Settings (Fase A - Langkah 1)
-- =========================================================================
-- Menambahkan:
-- 1. Tabel public.accounts (Bagan Akun / Chart of Accounts)
-- 2. Tabel public.accounting_settings (Pengaturan Akuntansi per owner)
-- 3. Kolom account_id di public.transaction_categories
-- 4. Kolom cash_account_id & counter_account_id di public.transactions
-- 5. Trigger proteksi aturan keras 6 pada accounts
-- =========================================================================

-- 1. TABEL accounts (COA)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code varchar(50) not null,
  name varchar(255) not null,
  account_type varchar(20) not null,
  report_group varchar(30) not null,
  is_cash boolean not null default false,
  cash_flow_activity varchar(20) not null default 'operating',
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint accounts_user_id_code_key unique (user_id, code),
  constraint accounts_type_check check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  constraint accounts_report_group_check check (
    (account_type = 'asset' and report_group in ('current_asset', 'fixed_asset', 'contra_asset', 'suspense')) or
    (account_type = 'liability' and report_group in ('current_liability')) or
    (account_type = 'equity' and report_group in ('equity')) or
    (account_type = 'revenue' and report_group in ('revenue', 'other')) or
    (account_type = 'expense' and report_group in ('cogs', 'opex', 'other'))
  ),
  constraint accounts_is_cash_asset_check check (not is_cash or account_type = 'asset'),
  constraint accounts_cash_flow_activity_check check (cash_flow_activity in ('operating', 'investing', 'financing'))
);

comment on table public.accounts is 'Bagan Akun (Chart of Accounts) standar double-entry';
comment on column public.accounts.code is 'Kode akun unik per user (misal 1-1100)';
comment on column public.accounts.report_group is 'Klasifikasi pelaporan laporan keuangan';
comment on column public.accounts.is_cash is 'True jika akun merupakan Kas atau Bank (dipakai arus kas)';
comment on column public.accounts.cash_flow_activity is 'Klasifikasi arus kas: operating, investing, atau financing';
comment on column public.accounts.is_system is 'True jika akun standar sistem, tidak dapat dihapus atau diubah tipenya';

create index if not exists idx_accounts_user_type on public.accounts(user_id, account_type);
create index if not exists idx_accounts_user_active on public.accounts(user_id, is_active);

alter table public.accounts enable row level security;

drop policy if exists "Manage own accounts" on public.accounts;
drop policy if exists "Select own accounts" on public.accounts;
drop policy if exists "Insert own non_system accounts" on public.accounts;
drop policy if exists "Update own accounts" on public.accounts;
drop policy if exists "Delete own accounts" on public.accounts;

create policy "Select own accounts" on public.accounts
  for select using (auth.uid() = user_id);

create policy "Insert own non_system accounts" on public.accounts
  for insert with check (auth.uid() = user_id and is_system = false);

create policy "Update own accounts" on public.accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Delete own accounts" on public.accounts
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.accounts to authenticated;
grant all on table public.accounts to service_role;

-- 2. TRIGGER PENJAGA ATURAN KERAS 6 PADA ACCOUNTS
-- (Akun sistem tidak bisa dihapus/dinonaktifkan, atribut klasifikasi terkunci, akun bermutasi tidak bisa dihapus/diubah tipenya)
create or replace function public.guard_accounts_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
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

-- 3. TABEL accounting_settings
create table if not exists public.accounting_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  enabled boolean not null default false,
  books_start_date date null,
  locked_through date null,
  default_cash_account_id uuid null references public.accounts(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.accounting_settings is 'Pengaturan modul akuntansi per owner (1 baris per user, select-only dari klien, ditulis lewat RPC)';
comment on column public.accounting_settings.enabled is 'Status aktifasi akuntansi (true setelah init_accounting)';
comment on column public.accounting_settings.books_start_date is 'Tanggal mulai pembukuan (wajib tanggal 1)';
comment on column public.accounting_settings.locked_through is 'Tanggal batas akhir periode terkunci/tutup buku';

alter table public.accounting_settings enable row level security;

drop policy if exists "Manage own accounting_settings" on public.accounting_settings;
drop policy if exists "View own accounting_settings" on public.accounting_settings;

create policy "View own accounting_settings" on public.accounting_settings
  for select using (auth.uid() = user_id);

grant select on table public.accounting_settings to authenticated;
revoke insert, update, delete on table public.accounting_settings from authenticated;
grant all on table public.accounting_settings to service_role;

-- 4. ALTER TABLE transaction_categories (tambah account_id)
alter table public.transaction_categories
  add column if not exists account_id uuid null references public.accounts(id) on delete restrict;

comment on column public.transaction_categories.account_id is 'Pemetaan kategori transaksi ke akun COA lawan';

-- 5. ALTER TABLE transactions (tambah cash_account_id & counter_account_id)
alter table public.transactions
  add column if not exists cash_account_id uuid null references public.accounts(id) on delete restrict,
  add column if not exists counter_account_id uuid null references public.accounts(id) on delete restrict;

comment on column public.transactions.cash_account_id is 'Akun Kas/Bank spesifik untuk transaksi ini (null = default bank)';
comment on column public.transactions.counter_account_id is 'Akun lawan override jika berbeda dari kategori transaksi';
