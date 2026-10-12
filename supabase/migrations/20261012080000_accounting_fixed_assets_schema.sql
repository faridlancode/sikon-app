-- ===========================================================================
-- Migration: 20261012080000_accounting_fixed_assets_schema.sql
-- Fase C1: Skema Aset Tetap, Jurnal Saldo Awal Aset, dan RPC Pendaftaran Aset
-- ===========================================================================

-- 1. Perbarui check constraint dan index pada journal_entries untuk mendukung 'asset_opening'
alter table public.journal_entries
  drop constraint if exists journal_entries_source_type_check;

alter table public.journal_entries
  add constraint journal_entries_source_type_check check (source_type in (
    'manual', 'transaction', 'opening_balance',
    'order_revenue', 'order_forfeit',
    'payroll_split', 'inventory_adjustment',
    'depreciation', 'asset_disposal', 'reversal',
    'asset_opening'
  ));

drop index if exists public.idx_journal_entries_source_unique;
create unique index idx_journal_entries_source_unique
  on public.journal_entries (user_id, source_type, source_id)
  where source_type in ('transaction', 'order_revenue', 'order_forfeit', 'payroll_split', 'asset_opening');

-- ---------------------------------------------------------------------------
-- 2. Tabel fixed_assets
-- ---------------------------------------------------------------------------
create table if not exists public.fixed_assets (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  name                        varchar not null,
  asset_class                 varchar not null check (asset_class in (
                                'equipment', 'vehicle', 'furniture', 'building',
                                'mesin_peralatan', 'kendaraan', 'inventaris_perabot', 'bangunan'
                              )),
  asset_account_id            uuid not null references public.accounts(id),
  accumulated_account_id      uuid not null references public.accounts(id),
  expense_account_id          uuid not null references public.accounts(id),
  acquisition_date            date not null,
  cost                        numeric not null check (cost > 0),
  salvage_value               numeric not null default 0 check (salvage_value >= 0 and salvage_value < cost),
  useful_life_months          integer not null check (useful_life_months > 0),
  accumulated_at_start        numeric not null default 0 check (accumulated_at_start >= 0),
  status                      varchar not null default 'active' check (status in ('active', 'disposed')),
  disposed_at                 date,
  acquisition_transaction_id  uuid references public.transactions(id) on delete no action,
  disposal_transaction_id     uuid references public.transactions(id) on delete set null,
  notes                       text,
  created_at                  timestamptz not null default now()
);

comment on table public.fixed_assets is 'Daftar aset tetap perusahaan (Fase C)';

create index if not exists idx_fixed_assets_user_status on public.fixed_assets(user_id, status);

-- ---------------------------------------------------------------------------
-- 3. Tabel fixed_asset_depreciations
-- ---------------------------------------------------------------------------
create table if not exists public.fixed_asset_depreciations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  asset_id          uuid not null references public.fixed_assets(id) on delete cascade,
  period            date not null check (extract(day from period) = 1),
  amount            numeric not null check (amount > 0),
  journal_entry_id  uuid not null references public.journal_entries(id),
  created_at        timestamptz not null default now(),
  constraint fixed_asset_depreciations_asset_period_unique unique (asset_id, period)
);

comment on table public.fixed_asset_depreciations is 'Riwayat penyusutan bulanan aset tetap (Fase C)';

create index if not exists idx_fixed_asset_depreciations_user_period on public.fixed_asset_depreciations(user_id, period);

-- ---------------------------------------------------------------------------
-- 4. Hak Akses & Row Level Security (RLS)
--    Hanya SELECT yang diizinkan untuk authenticated; tulis langsung dicabut.
-- ---------------------------------------------------------------------------
alter table public.fixed_assets enable row level security;
alter table public.fixed_asset_depreciations enable row level security;

create policy fixed_assets_select_policy on public.fixed_assets
  for select to authenticated
  using (user_id = auth.uid());

create policy fixed_asset_depreciations_select_policy on public.fixed_asset_depreciations
  for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on table public.fixed_assets from authenticated, anon, public;
revoke insert, update, delete on table public.fixed_asset_depreciations from authenticated, anon, public;

grant select on table public.fixed_assets to authenticated;
grant select on table public.fixed_asset_depreciations to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Helper Internal: resolve_asset_accounts
-- ---------------------------------------------------------------------------
create or replace function public.acc_resolve_asset_class(
  p_user_id     uuid,
  p_asset_class text,
  out v_asset_acct_id  uuid,
  out v_accum_acct_id  uuid,
  out v_exp_acct_id    uuid,
  out v_std_class      varchar
)
language plpgsql
stable
security definer set search_path = public as $$
declare
  v_norm text := lower(trim(p_asset_class));
  v_asset_code varchar;
  v_accum_code varchar;
begin
  if v_norm in ('equipment', 'mesin_peralatan', 'mesin & peralatan') then
    v_asset_code := '1-2100';
    v_accum_code := '1-2110';
    v_std_class  := 'equipment';
  elsif v_norm in ('vehicle', 'kendaraan') then
    v_asset_code := '1-2200';
    v_accum_code := '1-2210';
    v_std_class  := 'vehicle';
  elsif v_norm in ('furniture', 'inventaris_perabot', 'inventaris & perabot') then
    v_asset_code := '1-2300';
    v_accum_code := '1-2310';
    v_std_class  := 'furniture';
  elsif v_norm in ('building', 'bangunan') then
    v_asset_code := '1-2400';
    v_accum_code := '1-2410';
    v_std_class  := 'building';
  else
    raise exception 'Kelas aset % tidak valid. Pilihan: equipment, vehicle, furniture, building', p_asset_class
      using errcode = 'P0001';
  end if;

  select id into v_asset_acct_id from public.accounts where user_id = p_user_id and code = v_asset_code;
  select id into v_accum_acct_id from public.accounts where user_id = p_user_id and code = v_accum_code;
  select id into v_exp_acct_id   from public.accounts where user_id = p_user_id and code = '6-6000';

  if v_asset_acct_id is null or v_accum_acct_id is null or v_exp_acct_id is null then
    raise exception 'Akun akuntansi untuk kelas % (% / % / 6-6000) belum siap. Jalankan init_accounting terlebih dahulu.',
      p_asset_class, v_asset_code, v_accum_code using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.acc_resolve_asset_class(uuid, text) from public, anon;

-- ---------------------------------------------------------------------------
-- 6. RPC: register_fixed_asset
-- ---------------------------------------------------------------------------
create or replace function public.register_fixed_asset(
  p_name                  text,
  p_asset_class           text,
  p_acquisition_date      date,
  p_cost                  numeric,
  p_useful_life_months    integer,
  p_salvage_value         numeric default 0,
  p_payment_method        text default null,
  p_accumulated_at_start  numeric default 0,
  p_notes                 text default null
)
returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_uid            uuid := auth.uid();
  v_settings       public.accounting_settings;
  v_asset_acct_id  uuid;
  v_accum_acct_id  uuid;
  v_exp_acct_id    uuid;
  v_std_class      varchar;
  v_asset_id       uuid;
  v_cat_id         uuid;
  v_cash_acct_id   uuid;
  v_txn_id         uuid;
  v_entry_id       uuid;
  v_entry_no       varchar;
  v_laba_acct_id   uuid;
  v_line_no        smallint := 1;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    raise exception 'Akuntansi belum aktif' using errcode = 'P0001';
  end if;

  -- Validasi angka dasar
  if coalesce(p_name, '') = '' then
    raise exception 'Nama aset wajib diisi' using errcode = 'P0001';
  end if;
  if p_cost is null or p_cost <= 0 then
    raise exception 'Nilai perolehan (cost) harus > 0' using errcode = 'P0001';
  end if;
  if p_useful_life_months is null or p_useful_life_months <= 0 then
    raise exception 'Umur ekonomis (useful_life_months) harus > 0' using errcode = 'P0001';
  end if;
  if p_salvage_value is null or p_salvage_value < 0 or p_salvage_value >= p_cost then
    raise exception 'Nilai sisa (salvage_value) harus >= 0 dan < nilai perolehan' using errcode = 'P0001';
  end if;

  -- Ambil akun aset
  select * from public.acc_resolve_asset_class(v_uid, p_asset_class)
    into v_asset_acct_id, v_accum_acct_id, v_exp_acct_id, v_std_class;

  -- KASUS A: Aset baru (p_acquisition_date >= books_start_date)
  if p_acquisition_date >= v_settings.books_start_date then
    if coalesce(p_accumulated_at_start, 0) <> 0 then
      raise exception 'Aset yang diperoleh pada atau setelah tanggal mulai pembukuan tidak boleh memiliki akumulasi penyusutan awal'
        using errcode = 'P0001';
    end if;

    if v_settings.locked_through is not null and p_acquisition_date <= v_settings.locked_through then
      raise exception 'Tanggal perolehan (%) berada dalam periode yang terkunci (%)',
        p_acquisition_date, v_settings.locked_through using errcode = 'P0001';
    end if;

    if p_payment_method is null or trim(p_payment_method) = '' then
      raise exception 'Metode pembayaran wajib diisi untuk perolehan aset pada periode aktif' using errcode = 'P0001';
    end if;

    -- Tentukan Kas vs Bank
    if lower(trim(p_payment_method)) in ('cash', 'kas', 'tunai') then
      select id into v_cash_acct_id from public.accounts where user_id = v_uid and code = '1-1100';
    else
      select id into v_cash_acct_id from public.accounts where user_id = v_uid and code = '1-1200';
    end if;

    -- Pastikan kategori sistem 'Pembelian Aset Tetap' ada
    select id into v_cat_id
      from public.transaction_categories
     where user_id = v_uid and name = 'Pembelian Aset Tetap';

    if v_cat_id is null then
      insert into public.transaction_categories (user_id, name, type, account_id)
      values (v_uid, 'Pembelian Aset Tetap', 'expense', v_asset_acct_id)
      returning id into v_cat_id;
    else
      update public.transaction_categories
         set account_id = v_asset_acct_id
       where id = v_cat_id and account_id is distinct from v_asset_acct_id;
    end if;

    -- Buat transaksi pengeluaran kas (memicu trigger trg_journal_from_transaction: Dr asset / Cr cash)
    insert into public.transactions (
      user_id,
      title,
      amount,
      type,
      transaction_date,
      description,
      category_id,
      cash_account_id,
      counter_account_id
    )
    values (
      v_uid,
      'Pembelian aset: ' || p_name,
      p_cost,
      'expense',
      p_acquisition_date,
      coalesce(p_notes, 'Pembelian aset tetap: ' || p_name),
      v_cat_id,
      v_cash_acct_id,
      v_asset_acct_id
    )
    returning id into v_txn_id;

    -- Simpan entri fixed_assets
    insert into public.fixed_assets (
      user_id,
      name,
      asset_class,
      asset_account_id,
      accumulated_account_id,
      expense_account_id,
      acquisition_date,
      cost,
      salvage_value,
      useful_life_months,
      accumulated_at_start,
      status,
      acquisition_transaction_id,
      notes
    )
    values (
      v_uid,
      p_name,
      v_std_class,
      v_asset_acct_id,
      v_accum_acct_id,
      v_exp_acct_id,
      p_acquisition_date,
      p_cost,
      p_salvage_value,
      p_useful_life_months,
      0,
      'active',
      v_txn_id,
      p_notes
    )
    returning id into v_asset_id;

  -- KASUS B: Aset lama (p_acquisition_date < books_start_date)
  else
    if v_settings.locked_through is not null and v_settings.books_start_date <= v_settings.locked_through then
      raise exception 'Tanggal mulai pembukuan (%) berada dalam periode yang terkunci (%)',
        v_settings.books_start_date, v_settings.locked_through using errcode = 'P0001';
    end if;

    if coalesce(p_accumulated_at_start, 0) < 0 then
      raise exception 'Akumulasi penyusutan awal tidak boleh negatif' using errcode = 'P0001';
    end if;

    if coalesce(p_accumulated_at_start, 0) > (p_cost - p_salvage_value) then
      raise exception 'Akumulasi penyusutan awal (%) tidak boleh melebihi nilai yang dapat disusutkan (%)',
        p_accumulated_at_start, (p_cost - p_salvage_value) using errcode = 'P0001';
    end if;

    -- Simpan entri fixed_assets terlebih dahulu untuk mendapatkan ID sumber
    insert into public.fixed_assets (
      user_id,
      name,
      asset_class,
      asset_account_id,
      accumulated_account_id,
      expense_account_id,
      acquisition_date,
      cost,
      salvage_value,
      useful_life_months,
      accumulated_at_start,
      status,
      acquisition_transaction_id,
      notes
    )
    values (
      v_uid,
      p_name,
      v_std_class,
      v_asset_acct_id,
      v_accum_acct_id,
      v_exp_acct_id,
      p_acquisition_date,
      p_cost,
      p_salvage_value,
      p_useful_life_months,
      coalesce(p_accumulated_at_start, 0),
      'active',
      null,
      p_notes
    )
    returning id into v_asset_id;

    -- Buat satu jurnal asset_opening bertanggal books_start_date
    v_entry_no := public.next_journal_entry_no(v_uid, v_settings.books_start_date);

    insert into public.journal_entries (
      user_id,
      entry_no,
      entry_date,
      description,
      source_type,
      source_id
    )
    values (
      v_uid,
      v_entry_no,
      v_settings.books_start_date,
      'Saldo awal aset tetap: ' || p_name,
      'asset_opening',
      v_asset_id
    )
    returning id into v_entry_id;

    -- Baris 1: Debit Akun Aset sebesar cost
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_entry_id,
      v_asset_acct_id,
      p_cost,
      0,
      'Saldo awal perolehan aset: ' || p_name,
      v_line_no
    );
    v_line_no := v_line_no + 1;

    -- Baris 2: Kredit Akun Akumulasi Penyusutan (bila > 0)
    if coalesce(p_accumulated_at_start, 0) > 0 then
      insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
      values (
        v_entry_id,
        v_accum_acct_id,
        0,
        p_accumulated_at_start,
        'Akumulasi penyusutan awal: ' || p_name,
        v_line_no
      );
      v_line_no := v_line_no + 1;
    end if;

    -- Baris 3: Kredit 3-2000 Laba Ditahan sebesar sisa nilai buku awal (cost - accumulated_at_start)
    if (p_cost - coalesce(p_accumulated_at_start, 0)) > 0 then
      select id into v_laba_acct_id from public.accounts where user_id = v_uid and code = '3-2000';
      if v_laba_acct_id is null then
        raise exception 'Akun 3-2000 Laba Ditahan tidak ditemukan' using errcode = 'P0001';
      end if;

      insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
      values (
        v_entry_id,
        v_laba_acct_id,
        0,
        p_cost - coalesce(p_accumulated_at_start, 0),
        'Nilai buku awal aset tetap: ' || p_name,
        v_line_no
      );
    end if;
  end if;

  return v_asset_id;
end;
$$;

revoke execute on function public.register_fixed_asset(text, text, date, numeric, integer, numeric, text, numeric, text) from public, anon;
grant  execute on function public.register_fixed_asset(text, text, date, numeric, integer, numeric, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC: delete_fixed_asset
-- ---------------------------------------------------------------------------
create or replace function public.delete_fixed_asset(p_asset_id uuid)
returns boolean
language plpgsql
security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_settings  public.accounting_settings;
  v_asset     public.fixed_assets;
  v_txn_date  date;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  select * into v_asset from public.fixed_assets where id = p_asset_id and user_id = v_uid;

  if v_asset is null then
    raise exception 'Aset tetap tidak ditemukan' using errcode = 'P0001';
  end if;

  if v_asset.status <> 'active' then
    raise exception 'Aset yang sudah dilepas tidak dapat dihapus' using errcode = 'P0001';
  end if;

  -- Tolak bila sudah ada baris penyusutan
  if exists (select 1 from public.fixed_asset_depreciations where asset_id = p_asset_id) then
    raise exception 'Aset tidak dapat dihapus karena sudah memiliki data penyusutan' using errcode = 'P0001';
  end if;

  -- Validasi periode terkunci
  if v_asset.acquisition_transaction_id is not null then
    select transaction_date into v_txn_date from public.transactions where id = v_asset.acquisition_transaction_id;
    if v_settings.locked_through is not null and v_txn_date <= v_settings.locked_through then
      raise exception 'Transaksi perolehan aset berada dalam periode terkunci (%)', v_settings.locked_through using errcode = 'P0001';
    end if;

    -- Hapus aset terlebih dahulu untuk melepaskan referensi FK
    delete from public.fixed_assets where id = p_asset_id;
    -- Hapus transaksi perolehan (trigger akan otomatis menghapus jurnal transaksi)
    delete from public.transactions where id = v_asset.acquisition_transaction_id;
  else
    if v_settings.locked_through is not null and v_settings.books_start_date <= v_settings.locked_through then
      raise exception 'Jurnal saldo awal aset berada dalam periode terkunci (%)', v_settings.locked_through using errcode = 'P0001';
    end if;

    -- Hapus jurnal asset_opening terlebih dahulu
    delete from public.journal_entries
     where user_id = v_uid and source_type = 'asset_opening' and source_id = p_asset_id;
    -- Hapus aset
    delete from public.fixed_assets where id = p_asset_id;
  end if;

  return true;
end;
$$;

revoke execute on function public.delete_fixed_asset(uuid) from public, anon;
grant  execute on function public.delete_fixed_asset(uuid) to authenticated;
