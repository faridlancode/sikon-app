-- Migration: 20261014100000_accounting_fixed_assets_and_period_close_fixes.sql
-- Description:
-- 1. delete_fixed_asset menolak aset disposed dengan pesan 'Batalkan pelepasan aset terlebih dahulu'
-- 2. acc_depreciation_due menyusutkan persis habis pada bulan terakhir masa manfaat / sisa <= tarif bulanan,
--    menghitung posisi bulan untuk aset lama dari accumulated_at_start / tarif, dan mencegah penyusutan sesudah nilai habis
-- 3. close_accounting_period tidak membuat jurnal bila selisih persediaan nol, snapshot inventory_valuations tetap tersimpan
-- 4. register_fixed_asset mengunci account_id kategori 'Pembelian Aset Tetap' ke 1-2100 tanpa mengubahnya saat aset kelas lain didaftarkan
-- 5. Menambahkan RPC update_fixed_asset_info(p_asset_id, p_name, p_notes)

-- ============================================================================
-- 1. Redefinisi delete_fixed_asset
-- ============================================================================
create or replace function public.delete_fixed_asset(p_asset_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
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

  if v_asset.status = 'disposed' then
    raise exception 'Batalkan pelepasan aset terlebih dahulu' using errcode = 'P0001';
  end if;

  if v_asset.status <> 'active' then
    raise exception 'Aset tidak dalam status aktif' using errcode = 'P0001';
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

-- ============================================================================
-- 2. Redefinisi acc_depreciation_due
-- ============================================================================
create or replace function public.acc_depreciation_due(p_user_id uuid, p_period_end date)
returns table (
  asset_id                uuid,
  asset_class             varchar,
  accumulated_account_id  uuid,
  amount                  numeric
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_settings            public.accounting_settings;
  v_period_month_start  date;
  v_asset               record;
  v_dep_base            numeric;
  v_prev_dep            numeric;
  v_accum_total         numeric;
  v_rem                 numeric;
  v_monthly_rate        numeric;
  v_dep_amt             numeric;
  v_prev_dep_count      int;
  v_prior_months        int;
begin
  select * into v_settings from public.accounting_settings where user_id = p_user_id;
  if v_settings is null or v_settings.enabled is not true then
    return;
  end if;

  v_period_month_start := date_trunc('month', p_period_end)::date;

  for v_asset in
    select fa.*
      from public.fixed_assets fa
     where fa.user_id = p_user_id
       and fa.status = 'active'
       and (
         -- Aset lama: mulai disusutkan sejak bulan pertama pembukuan
         (fa.acquisition_date < v_settings.books_start_date and v_period_month_start >= date_trunc('month', v_settings.books_start_date)::date)
         or
         -- Aset baru: penyusutan pertama pada bulan setelah bulan perolehan
         (fa.acquisition_date >= v_settings.books_start_date and v_period_month_start >= (date_trunc('month', fa.acquisition_date) + interval '1 month')::date)
       )
       and not exists (
         select 1 from public.fixed_asset_depreciations fad
          where fad.asset_id = fa.id and fad.period = v_period_month_start
       )
     order by fa.created_at asc, fa.id asc
  loop
    v_dep_base := v_asset.cost - v_asset.salvage_value;
    select coalesce(sum(fad.amount), 0) into v_prev_dep
      from public.fixed_asset_depreciations fad
     where fad.asset_id = v_asset.id;

    v_accum_total := v_asset.accumulated_at_start + v_prev_dep;
    v_rem := v_dep_base - v_accum_total;

    -- Tidak ada penyusutan sesudah nilai dasar susut habis
    if v_rem > 0 and v_asset.useful_life_months > 0 then
      v_monthly_rate := round(v_dep_base / v_asset.useful_life_months);

      select count(*) into v_prev_dep_count
        from public.fixed_asset_depreciations fad
       where fad.asset_id = v_asset.id;

      if v_monthly_rate > 0 then
        -- Untuk aset lama, hitung posisi bulan dari accumulated_at_start / tarif
        v_prior_months := round(v_asset.accumulated_at_start / v_monthly_rate);
      else
        v_prior_months := 0;
      end if;

      -- Pada bulan terakhir masa manfaat atau bila sisa <= tarif bulanan, alokasikan seluruh sisa
      if (v_prior_months + v_prev_dep_count + 1) >= v_asset.useful_life_months or v_rem <= v_monthly_rate then
        v_dep_amt := v_rem;
      else
        v_dep_amt := least(v_monthly_rate, v_rem);
      end if;

      -- Batasi agar tidak pernah melampaui sisa dasar susut
      v_dep_amt := least(v_dep_amt, v_rem);

      if v_dep_amt > 0 then
        asset_id := v_asset.id;
        asset_class := v_asset.asset_class;
        accumulated_account_id := v_asset.accumulated_account_id;
        amount := v_dep_amt;
        return next;
      end if;
    end if;
  end loop;
end;
$$;

-- ============================================================================
-- 3. Redefinisi close_accounting_period
-- ============================================================================
create or replace function public.close_accounting_period(p_period_end date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid                   uuid := auth.uid();
  v_settings              public.accounting_settings;
  v_expected              date;
  v_val                   numeric := 0;
  v_book_balance          numeric := 0;
  v_diff                  numeric := 0;
  v_acct_1500             uuid;
  v_acct_5100             uuid;
  v_acct_6600             uuid;
  v_adj_entry_id          uuid := null;
  v_entry_no              varchar;
  v_detail                jsonb;
  v_period_month_start    date;
  v_dep_entry_id          uuid := null;
  v_dep_entry_no          varchar;
  v_total_dep             numeric := 0;
  v_dep_count             int := 0;
  v_class_rec             record;
  v_line_no               smallint := 1;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    raise exception 'Akuntansi belum aktif' using errcode = 'P0001';
  end if;

  -- 1. Validasi: harus akhir bulan
  if (date_trunc('month', p_period_end) + interval '1 month - 1 day')::date <> p_period_end then
    raise exception 'Tanggal akhir periode harus merupakan akhir bulan: %', p_period_end using errcode = 'P0001';
  end if;

  -- 2. Guard: Tolak menutup bulan yang belum berakhir penuh
  if p_period_end >= current_date then
    raise exception 'Periode % belum berakhir penuh', p_period_end using errcode = 'P0001';
  end if;

  -- 3. Validasi urutan periode (tidak boleh lompat bulan)
  if v_settings.locked_through is null then
    v_expected := (date_trunc('month', v_settings.books_start_date) + interval '1 month - 1 day')::date;
  else
    v_expected := (date_trunc('month', v_settings.locked_through + interval '1 day') + interval '1 month - 1 day')::date;
  end if;

  if p_period_end <> v_expected then
    raise exception 'Periode harus ditutup berurutan. Periode berikutnya yang harus ditutup adalah %, bukan %',
      v_expected, p_period_end using errcode = 'P0001';
  end if;

  -- 4. Ambil akun COA
  select id into v_acct_1500 from public.accounts where user_id = v_uid and code = '1-1500';
  select id into v_acct_5100 from public.accounts where user_id = v_uid and code = '5-1000';
  select id into v_acct_6600 from public.accounts where user_id = v_uid and code = '6-6000';

  if v_acct_1500 is null or v_acct_5100 is null then
    raise exception 'Akun 1-1500 atau 5-1000 tidak ditemukan' using errcode = 'P0001';
  end if;

  -- 5. Hitung nilai stok fisik V dan saldo buku persediaan B per p_period_end
  v_val := public.acc_inventory_value(v_uid);

  select coalesce(sum(jl.debit - jl.credit), 0)
    into v_book_balance
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
   where je.user_id = v_uid
     and jl.account_id = v_acct_1500
     and je.entry_date <= p_period_end;

  v_diff := v_val - v_book_balance;

  -- 6. Buat jurnal penyesuaian persediaan (HANYA bila diff <> 0, jangan buat bila nol)
  if v_diff <> 0 then
    v_entry_no := public.next_journal_entry_no(v_uid, p_period_end);

    insert into public.journal_entries (
      user_id, entry_no, entry_date, description, source_type
    )
    values (
      v_uid,
      v_entry_no,
      p_period_end,
      'Penyesuaian Persediaan Akhir Bulan ' || to_char(p_period_end, 'MM/YYYY'),
      'inventory_adjustment'
    )
    returning id into v_adj_entry_id;

    if v_diff < 0 then
      -- Stok fisik < Saldo buku: Debit 5-1000 (HPP), Kredit 1-1500 sebesar |D|
      insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
      values (v_adj_entry_id, v_acct_5100, abs(v_diff), 0, 'Penyesuaian HPP Bahan Baku', 1);

      insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
      values (v_adj_entry_id, v_acct_1500, 0, abs(v_diff), 'Penyesuaian Persediaan Bahan Baku', 2);
    else
      -- Stok fisik > Saldo buku: Debit 1-1500, Kredit 5-1000 sebesar D
      insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
      values (v_adj_entry_id, v_acct_1500, v_diff, 0, 'Penyesuaian Persediaan Bahan Baku', 1);

      insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
      values (v_adj_entry_id, v_acct_5100, 0, v_diff, 'Pengurang HPP Bahan Baku', 2);
    end if;
  else
    v_adj_entry_id := null;
  end if;

  -- 7. Simpan snapshot inventory_valuations (selalu disimpan, walaupun v_adj_entry_id null)
  v_detail := public.acc_inventory_valuation_detail(v_uid);

  insert into public.inventory_valuations (
    user_id, period_end, total_value, detail, journal_entry_id
  )
  values (
    v_uid, p_period_end, v_val, v_detail, v_adj_entry_id
  )
  on conflict (user_id, period_end) do update
  set total_value = excluded.total_value,
      detail = excluded.detail,
      journal_entry_id = excluded.journal_entry_id;

  -- 8. Hitung penyusutan bulan itu via acc_depreciation_due
  v_period_month_start := date_trunc('month', p_period_end)::date;

  select coalesce(sum(d.amount), 0), count(*)
    into v_total_dep, v_dep_count
    from public.acc_depreciation_due(v_uid, p_period_end) d;

  if v_total_dep > 0 then
    if v_acct_6600 is null then
      raise exception 'Akun 6-6000 Beban Penyusutan tidak ditemukan' using errcode = 'P0001';
    end if;

    v_dep_entry_no := public.next_journal_entry_no(v_uid, p_period_end);

    insert into public.journal_entries (
      user_id, entry_no, entry_date, description, source_type
    )
    values (
      v_uid,
      v_dep_entry_no,
      p_period_end,
      'Penyusutan aset tetap periode ' || to_char(p_period_end, 'MM/YYYY'),
      'depreciation'
    )
    returning id into v_dep_entry_id;

    -- Baris Debit 6-6000
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    select v_dep_entry_id, v_acct_6600, sum(d.amount), 0, 'Beban penyusutan aset tetap', 1
      from public.acc_depreciation_due(v_uid, p_period_end) d;

    -- Baris Kredit Akun Akumulasi per kelas
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    select v_dep_entry_id, d.accumulated_account_id, 0, sum(d.amount), 'Akumulasi penyusutan: ' || d.asset_class,
           (row_number() over (order by d.asset_class) + 1)::smallint
      from public.acc_depreciation_due(v_uid, p_period_end) d
     group by d.accumulated_account_id, d.asset_class;

    -- Simpan riwayat fixed_asset_depreciations per aset
    insert into public.fixed_asset_depreciations (
      user_id, asset_id, period, amount, journal_entry_id
    )
    select v_uid, d.asset_id, v_period_month_start, d.amount, v_dep_entry_id
      from public.acc_depreciation_due(v_uid, p_period_end) d;
  end if;

  -- 9. Kunci periode
  update public.accounting_settings
     set locked_through = p_period_end
   where user_id = v_uid;

  return jsonb_build_object(
    'period_end', p_period_end,
    'locked_through', p_period_end,
    'inventory_value', v_val,
    'inventory_book_balance', v_book_balance,
    'adjustment', v_diff,
    'depreciation_total', v_total_dep,
    'depreciation_count', v_dep_count,
    'adjustment_entry_id', v_adj_entry_id,
    'depreciation_entry_id', v_dep_entry_id
  );
end;
$$;

-- ============================================================================
-- 4. Redefinisi register_fixed_asset
-- ============================================================================
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
security definer
set search_path to 'public'
as $$
declare
  v_uid            uuid := auth.uid();
  v_settings       public.accounting_settings;
  v_asset_acct_id  uuid;
  v_accum_acct_id  uuid;
  v_exp_acct_id    uuid;
  v_std_class      varchar;
  v_asset_id       uuid;
  v_cat_id         uuid;
  v_cat_acct_id    uuid;
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
  if coalesce(trim(p_name), '') = '' then
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

  -- Ambil akun aset berdasarkan kelas yang dipilih
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

    -- Tentukan Kas (1-1100) vs Bank (1-1200)
    if lower(trim(p_payment_method)) in ('cash', 'kas', 'tunai') then
      select id into v_cash_acct_id from public.accounts where user_id = v_uid and code = '1-1100';
    else
      select id into v_cash_acct_id from public.accounts where user_id = v_uid and code = '1-1200';
    end if;

    -- Pastikan kategori sistem 'Pembelian Aset Tetap' ada dan terkait dengan akun 1-2100 (dibuat sekali dan tidak diubah lagi)
    select id into v_cat_id
      from public.transaction_categories
     where user_id = v_uid and name = 'Pembelian Aset Tetap';

    if v_cat_id is null then
      select id into v_cat_acct_id from public.accounts where user_id = v_uid and code = '1-2100';
      insert into public.transaction_categories (user_id, name, type, account_id)
      values (v_uid, 'Pembelian Aset Tetap', 'expense', coalesce(v_cat_acct_id, v_asset_acct_id))
      returning id into v_cat_id;
    end if;

    -- Buat transaksi pengeluaran kas (memicu trigger trg_journal_from_transaction)
    -- counter_account_id menentukan akun aset debit yang tepat (misal 1-2100, 1-2200, 1-2300, 1-2400)
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
      'Pembelian aset: ' || trim(p_name),
      p_cost,
      'expense',
      p_acquisition_date,
      coalesce(p_notes, 'Pembelian aset tetap: ' || trim(p_name)),
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
      trim(p_name),
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
      trim(p_name),
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
      'Saldo awal aset tetap: ' || trim(p_name),
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
      'Saldo awal perolehan aset: ' || trim(p_name),
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
        'Akumulasi penyusutan awal: ' || trim(p_name),
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
        'Nilai buku awal aset tetap: ' || trim(p_name),
        v_line_no
      );
    end if;
  end if;

  return v_asset_id;
end;
$$;

-- ============================================================================
-- 5. Tambah RPC update_fixed_asset_info
-- ============================================================================
create or replace function public.update_fixed_asset_info(
  p_asset_id uuid,
  p_name     text,
  p_notes    text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_asset public.fixed_assets;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nama aset wajib diisi' using errcode = 'P0001';
  end if;

  select * into v_asset from public.fixed_assets where id = p_asset_id and user_id = v_uid;
  if v_asset is null then
    raise exception 'Aset tetap tidak ditemukan' using errcode = 'P0001';
  end if;

  update public.fixed_assets
     set name = trim(p_name),
         notes = p_notes
   where id = p_asset_id
     and user_id = v_uid;

  return true;
end;
$$;

grant execute on function public.update_fixed_asset_info(uuid, text, text) to authenticated;
