-- ===========================================================================
-- Migration: 20261012090000_accounting_depreciation_and_disposal.sql
-- Fase C2: Penyusutan Bulanan, Pelepasan Aset, dan Pembaruan Audit Konsistensi
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Redefinisi close_accounting_period (dengan perhitungan penyusutan aset)
-- ---------------------------------------------------------------------------
create or replace function public.close_accounting_period(p_period_end date)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_uid                   uuid := auth.uid();
  v_settings              public.accounting_settings;
  v_expected_period       date;
  v_val                   numeric := 0;
  v_book_balance          numeric := 0;
  v_diff                  numeric := 0;
  v_acct_1500             uuid;
  v_acct_5100             uuid;
  v_acct_6600             uuid;
  v_adj_entry_id          uuid;
  v_entry_no              varchar;
  v_detail                jsonb;
  v_period_month_start    date;
  v_asset                 record;
  v_dep_base              numeric;
  v_prev_dep              numeric;
  v_accum_total           numeric;
  v_rem                   numeric;
  v_monthly_rate          numeric;
  v_dep_amt               numeric;
  v_prev_dep_count        int;
  v_prior_months          int;
  v_dep_entry_id          uuid;
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
    raise exception 'Periode % belum berakhir (hanya boleh menutup bulan yang sudah lewat)', p_period_end using errcode = 'P0001';
  end if;

  -- 3. Validasi urutan penutupan periode
  if v_settings.locked_through is null then
    v_expected_period := (date_trunc('month', v_settings.books_start_date) + interval '1 month - 1 day')::date;
  else
    v_expected_period := (date_trunc('month', v_settings.locked_through + interval '1 day') + interval '1 month - 1 day')::date;
  end if;

  if p_period_end <> v_expected_period then
    raise exception 'Periode harus ditutup secara berurutan. Periode berikutnya yang harus ditutup: % (diberikan: %)',
      v_expected_period, p_period_end using errcode = 'P0001';
  end if;

  -- 4. Ambil akun 1-1500 (Persediaan) dan 5-1000 (HPP Bahan Baku)
  select id into v_acct_1500 from public.accounts where user_id = v_uid and code = '1-1500';
  select id into v_acct_5100 from public.accounts where user_id = v_uid and code = '5-1000';
  select id into v_acct_6600 from public.accounts where user_id = v_uid and code = '6-6000';

  if v_acct_1500 is null or v_acct_5100 is null then
    raise exception 'Akun 1-1500 atau 5-1000 tidak ditemukan. Jalankan init_accounting terlebih dahulu.' using errcode = 'P0001';
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

  -- 6. Buat jurnal penyesuaian persediaan (bila D <> 0)
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
  end if;

  -- 7. Simpan inventory_valuations
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

  -- 8. FASE C: HITUNG PENYUSUTAN BULAN ITU
  v_period_month_start := date_trunc('month', p_period_end)::date;

  -- Buat tabel sementara untuk menampung aset yang disusutkan bulan ini
  if to_regclass('pg_temp.temp_asset_dep') is null then
    create temporary table temp_asset_dep (
      asset_id               uuid,
      asset_class            varchar,
      accumulated_account_id uuid,
      amount                 numeric
    ) on commit drop;
  else
    truncate table temp_asset_dep;
  end if;

  for v_asset in
    select fa.*
      from public.fixed_assets fa
     where fa.user_id = v_uid
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
  loop
    v_dep_base := v_asset.cost - v_asset.salvage_value;
    select coalesce(sum(amount), 0) into v_prev_dep
      from public.fixed_asset_depreciations
     where asset_id = v_asset.id;

    v_accum_total := v_asset.accumulated_at_start + v_prev_dep;
    v_rem := v_dep_base - v_accum_total;

    if v_rem > 0 then
      v_monthly_rate := round(v_dep_base / v_asset.useful_life_months);

      select count(*) into v_prev_dep_count
        from public.fixed_asset_depreciations
       where asset_id = v_asset.id;

      if v_monthly_rate > 0 then
        v_prior_months := round(v_asset.accumulated_at_start / v_monthly_rate);
      else
        v_prior_months := 0;
      end if;

      -- Bulan terakhir masa manfaat atau sisa nilai buku <= tarif bulanan menghabiskan sisa persis
      if (v_prior_months + v_prev_dep_count + 1) >= v_asset.useful_life_months or v_rem <= v_monthly_rate then
        v_dep_amt := v_rem;
      else
        v_dep_amt := least(v_monthly_rate, v_rem);
      end if;

      if v_dep_amt > 0 then
        insert into temp_asset_dep (asset_id, asset_class, accumulated_account_id, amount)
        values (v_asset.id, v_asset.asset_class, v_asset.accumulated_account_id, v_dep_amt);

        v_total_dep := v_total_dep + v_dep_amt;
        v_dep_count := v_dep_count + 1;
      end if;
    end if;
  end loop;

  -- Bila terdapat penyusutan, buat satu jurnal bersama source_type = 'depreciation'
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

    -- Simpan riwayat fixed_asset_depreciations per aset
    insert into public.fixed_asset_depreciations (
      user_id, asset_id, period, amount, journal_entry_id
    )
    select v_uid, t.asset_id, v_period_month_start, t.amount, v_dep_entry_id
      from temp_asset_dep t;

    -- Baris jurnal per kelas aset: Dr 6-6000, Kr akun akumulasi kelas
    v_line_no := 1;
    for v_class_rec in
      select t.accumulated_account_id, t.asset_class, sum(t.amount) as class_amount
        from temp_asset_dep t
       group by t.accumulated_account_id, t.asset_class
    loop
      -- Baris Debit 6-6000
      insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
      values (
        v_dep_entry_id,
        v_acct_6600,
        v_class_rec.class_amount,
        0,
        'Beban penyusutan ' || v_class_rec.asset_class || ' ' || to_char(p_period_end, 'MM/YYYY'),
        v_line_no
      );
      v_line_no := v_line_no + 1;

      -- Baris Kredit Akun Akumulasi Penyusutan Kelas
      insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
      values (
        v_dep_entry_id,
        v_class_rec.accumulated_account_id,
        0,
        v_class_rec.class_amount,
        'Akumulasi penyusutan ' || v_class_rec.asset_class || ' ' || to_char(p_period_end, 'MM/YYYY'),
        v_line_no
      );
      v_line_no := v_line_no + 1;
    end loop;
  end if;

  -- 9. Kunci periode sampai p_period_end
  update public.accounting_settings
     set locked_through = p_period_end
   where user_id = v_uid;

  return jsonb_build_object(
    'period_end', p_period_end,
    'inventory_value', v_val,
    'inventory_balance_before', v_book_balance,
    'adjustment', v_diff,
    'adjustment_entry_id', v_adj_entry_id,
    'depreciation_total', v_total_dep,
    'depreciation_count', v_dep_count,
    'depreciation_entry_id', v_dep_entry_id,
    'locked_through', p_period_end
  );
end;
$$;

revoke execute on function public.close_accounting_period(date) from public, anon;
grant  execute on function public.close_accounting_period(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Redefinisi reopen_accounting_period
-- ---------------------------------------------------------------------------
create or replace function public.reopen_accounting_period(p_new_locked_through date default null)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_settings public.accounting_settings;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    raise exception 'Akuntansi belum aktif' using errcode = 'P0001';
  end if;

  if v_settings.locked_through is null then
    raise exception 'Tidak ada periode yang sedang terkunci' using errcode = 'P0001';
  end if;

  if p_new_locked_through is not null then
    -- Validasi: harus akhir bulan
    if (date_trunc('month', p_new_locked_through) + interval '1 month - 1 day')::date <> p_new_locked_through then
      raise exception 'Kunci baru harus merupakan akhir bulan (%)', p_new_locked_through using errcode = 'P0001';
    end if;

    -- Validasi: harus lebih awal dari kunci saat ini
    if p_new_locked_through >= v_settings.locked_through then
      raise exception 'Kunci baru (%) harus lebih awal dari kunci saat ini (%)', p_new_locked_through, v_settings.locked_through
        using errcode = 'P0001';
    end if;
  end if;

  -- Guard: Tolak bila akan menghapus penyusutan milik aset yang sudah dilepas dengan disposed_at sesudah kunci baru
  if exists (
    select 1
      from public.fixed_assets fa
      join public.fixed_asset_depreciations fad on fad.asset_id = fa.id
     where fa.user_id = v_uid
       and fa.status = 'disposed'
       and fad.period > coalesce(p_new_locked_through, '1900-01-01'::date)
  ) then
    raise exception 'Batalkan pelepasan aset terlebih dahulu' using errcode = 'P0001';
  end if;

  -- Hapus baris fixed_asset_depreciations yang bertanggal setelah kunci baru
  delete from public.fixed_asset_depreciations
   where user_id = v_uid
     and period > coalesce(p_new_locked_through, '1900-01-01'::date);

  -- Hapus jurnal depreciation yang bertanggal setelah kunci baru
  delete from public.journal_entries
   where user_id = v_uid
     and source_type = 'depreciation'
     and entry_date > coalesce(p_new_locked_through, '1900-01-01'::date);

  -- Hapus jurnal inventory_adjustment yang bertanggal setelah kunci baru
  delete from public.journal_entries
   where user_id = v_uid
     and source_type = 'inventory_adjustment'
     and entry_date > coalesce(p_new_locked_through, '1900-01-01'::date);

  -- Hapus inventory_valuations yang bertanggal setelah kunci baru
  delete from public.inventory_valuations
   where user_id = v_uid
     and period_end > coalesce(p_new_locked_through, '1900-01-01'::date);

  -- Pasang kunci baru
  update public.accounting_settings
     set locked_through = p_new_locked_through
   where user_id = v_uid;

  return jsonb_build_object(
    'previous_locked_through', v_settings.locked_through,
    'locked_through', p_new_locked_through
  );
end;
$$;

revoke execute on function public.reopen_accounting_period(date) from public, anon;
grant  execute on function public.reopen_accounting_period(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: dispose_fixed_asset
-- ---------------------------------------------------------------------------
create or replace function public.dispose_fixed_asset(
  p_asset_id        uuid,
  p_date            date,
  p_proceeds        numeric default 0,
  p_payment_method  text default null
)
returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_uid              uuid := auth.uid();
  v_settings         public.accounting_settings;
  v_asset            public.fixed_assets;
  v_accumulated      numeric := 0;
  v_dep_sum          numeric := 0;
  v_book_value       numeric := 0;
  v_proceeds         numeric := coalesce(p_proceeds, 0);
  v_cash_acct_id     uuid;
  v_cat_id           uuid;
  v_disposal_txn_id  uuid;
  v_entry_no         varchar;
  v_disposal_entry_id uuid;
  v_gain             numeric := 0;
  v_loss             numeric := 0;
  v_gain_acct_id     uuid;
  v_loss_acct_id     uuid;
  v_line_no          smallint := 1;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    raise exception 'Akuntansi belum aktif' using errcode = 'P0001';
  end if;

  select * into v_asset from public.fixed_assets where id = p_asset_id and user_id = v_uid;
  if v_asset is null then
    raise exception 'Aset tetap tidak ditemukan' using errcode = 'P0001';
  end if;

  if v_asset.status <> 'active' then
    raise exception 'Aset harus berstatus active untuk dilepas' using errcode = 'P0001';
  end if;

  -- Validasi tanggal pelepasan
  if v_settings.locked_through is not null and p_date <= v_settings.locked_through then
    raise exception 'Tanggal pelepasan (%) berada dalam periode terkunci (%)',
      p_date, v_settings.locked_through using errcode = 'P0001';
  end if;

  if p_date < v_settings.books_start_date then
    raise exception 'Tanggal pelepasan (%) tidak boleh sebelum tanggal mulai pembukuan (%)',
      p_date, v_settings.books_start_date using errcode = 'P0001';
  end if;

  if p_date < v_asset.acquisition_date then
    raise exception 'Tanggal pelepasan (%) tidak boleh sebelum tanggal perolehan (%)',
      p_date, v_asset.acquisition_date using errcode = 'P0001';
  end if;

  if v_proceeds < 0 then
    raise exception 'Nilai hasil penjualan (proceeds) tidak boleh negatif' using errcode = 'P0001';
  end if;

  -- Hitung akumulasi penyusutan s.d. saat ini
  select coalesce(sum(amount), 0) into v_dep_sum
    from public.fixed_asset_depreciations
   where asset_id = p_asset_id;

  v_accumulated := v_asset.accumulated_at_start + v_dep_sum;
  v_book_value  := v_asset.cost - v_accumulated;

  -- Bila ada hasil penjualan (proceeds > 0), catat transaksi penerimaan kas
  if v_proceeds > 0 then
    if p_payment_method is null or trim(p_payment_method) = '' then
      raise exception 'Metode pembayaran wajib diisi bila terdapat hasil penjualan aset' using errcode = 'P0001';
    end if;

    if lower(trim(p_payment_method)) in ('cash', 'kas', 'tunai') then
      select id into v_cash_acct_id from public.accounts where user_id = v_uid and code = '1-1100';
    else
      select id into v_cash_acct_id from public.accounts where user_id = v_uid and code = '1-1200';
    end if;

    -- Pastikan kategori sistem 'Penjualan Aset Tetap' ada
    select id into v_cat_id
      from public.transaction_categories
     where user_id = v_uid and name = 'Penjualan Aset Tetap';

    if v_cat_id is null then
      insert into public.transaction_categories (user_id, name, type, account_id)
      values (v_uid, 'Penjualan Aset Tetap', 'income', v_asset.asset_account_id)
      returning id into v_cat_id;
    else
      update public.transaction_categories
         set account_id = v_asset.asset_account_id
       where id = v_cat_id and account_id is distinct from v_asset.asset_account_id;
    end if;

    -- Insert transaksi penerimaan (trigger trg_journal_from_transaction akan membuat Dr Kas/Bank / Kr Akun Aset)
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
      'Hasil penjualan aset: ' || v_asset.name,
      v_proceeds,
      'income',
      p_date,
      'Hasil penjualan aset tetap: ' || v_asset.name,
      v_cat_id,
      v_cash_acct_id,
      v_asset.asset_account_id
    )
    returning id into v_disposal_txn_id;
  end if;

  -- Buat jurnal asset_disposal
  v_entry_no := public.next_journal_entry_no(v_uid, p_date);

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
    p_date,
    'Pelepasan aset tetap: ' || v_asset.name,
    'asset_disposal',
    p_asset_id
  )
  returning id into v_disposal_entry_id;

  -- Baris 1: Debit Akun Akumulasi Penyusutan (bila > 0)
  if v_accumulated > 0 then
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_disposal_entry_id,
      v_asset.accumulated_account_id,
      v_accumulated,
      0,
      'Penghapusan akumulasi penyusutan: ' || v_asset.name,
      v_line_no
    );
    v_line_no := v_line_no + 1;
  end if;

  -- Hitung Laba / Rugi Pelepasan
  if (v_book_value - v_proceeds) > 0 then
    v_loss := v_book_value - v_proceeds;
    select id into v_loss_acct_id from public.accounts where user_id = v_uid and code = '6-9000';
    if v_loss_acct_id is null then
      raise exception 'Akun 6-9000 Beban Lain-lain tidak ditemukan' using errcode = 'P0001';
    end if;

    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_disposal_entry_id,
      v_loss_acct_id,
      v_loss,
      0,
      'Rugi pelepasan aset tetap: ' || v_asset.name,
      v_line_no
    );
    v_line_no := v_line_no + 1;
  elsif (v_proceeds - v_book_value) > 0 then
    v_gain := v_proceeds - v_book_value;
    select id into v_gain_acct_id from public.accounts where user_id = v_uid and code = '4-9000';
    if v_gain_acct_id is null then
      raise exception 'Akun 4-9000 Pendapatan Lain-lain tidak ditemukan' using errcode = 'P0001';
    end if;

    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_disposal_entry_id,
      v_gain_acct_id,
      0,
      v_gain,
      'Keuntungan pelepasan aset tetap: ' || v_asset.name,
      v_line_no
    );
    v_line_no := v_line_no + 1;
  end if;

  -- Baris Kredit Akun Aset sebesar cost - proceeds (bila cost > proceeds)
  if (v_asset.cost - v_proceeds) > 0 then
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_disposal_entry_id,
      v_asset.asset_account_id,
      0,
      v_asset.cost - v_proceeds,
      'Penghapusan nilai buku aset: ' || v_asset.name,
      v_line_no
    );
  elsif (v_proceeds - v_asset.cost) > 0 then
    -- Kasus khusus proceeds > cost: debit akun aset penyeimbang
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_disposal_entry_id,
      v_asset.asset_account_id,
      v_proceeds - v_asset.cost,
      0,
      'Penyesuaian perolehan aset: ' || v_asset.name,
      v_line_no
    );
  end if;

  -- Update status aset tetap menjadi 'disposed'
  update public.fixed_assets
     set status = 'disposed',
         disposed_at = p_date,
         disposal_transaction_id = v_disposal_txn_id
   where id = p_asset_id;

  return v_disposal_entry_id;
end;
$$;

revoke execute on function public.dispose_fixed_asset(uuid, date, numeric, text) from public, anon;
grant  execute on function public.dispose_fixed_asset(uuid, date, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: undo_dispose_fixed_asset
-- ---------------------------------------------------------------------------
create or replace function public.undo_dispose_fixed_asset(p_asset_id uuid)
returns boolean
language plpgsql
security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_settings  public.accounting_settings;
  v_asset     public.fixed_assets;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  select * into v_asset from public.fixed_assets where id = p_asset_id and user_id = v_uid;

  if v_asset is null then
    raise exception 'Aset tetap tidak ditemukan' using errcode = 'P0001';
  end if;

  if v_asset.status <> 'disposed' then
    raise exception 'Aset belum dilepas' using errcode = 'P0001';
  end if;

  -- Validasi periode terkunci
  if v_settings.locked_through is not null and v_asset.disposed_at <= v_settings.locked_through then
    raise exception 'Tidak dapat membatalkan pelepasan aset pada periode terkunci (%)', v_settings.locked_through
      using errcode = 'P0001';
  end if;

  -- Hapus jurnal asset_disposal
  delete from public.journal_entries
   where user_id = v_uid
     and source_type = 'asset_disposal'
     and source_id = p_asset_id;

  -- Kembalikan status aset ke 'active' terlebih dahulu agar foreign key terlepas
  update public.fixed_assets
     set status = 'active',
         disposed_at = null,
         disposal_transaction_id = null
   where id = p_asset_id;

  -- Hapus transaksi hasil penjualan (trigger akan menghapus jurnal kas terkait)
  if v_asset.disposal_transaction_id is not null then
    delete from public.transactions where id = v_asset.disposal_transaction_id;
  end if;

  return true;
end;
$$;

revoke execute on function public.undo_dispose_fixed_asset(uuid) from public, anon;
grant  execute on function public.undo_dispose_fixed_asset(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Redefinisi get_accounting_checks (tambah FIXED_ASSET_MATCH & DEPRECIATION_DUE)
-- ---------------------------------------------------------------------------
create or replace function public.get_accounting_checks(p_as_of date)
returns jsonb
language plpgsql
stable
security definer set search_path = public as $$
declare
  v_uid                 uuid := auth.uid();
  v_settings            public.accounting_settings;
  v_checks              jsonb := '[]'::jsonb;
  v_debit               numeric := 0;
  v_credit              numeric := 0;
  v_bs                  jsonb;
  v_expected_cash       numeric := 0;
  v_actual_cash         numeric := 0;
  v_ob_cash             numeric := 0;
  v_tx_cash             numeric := 0;
  v_expected_adv        numeric := 0;
  v_actual_adv          numeric := 0;
  v_expected_cust_adv   numeric := 0;
  v_actual_cust_adv     numeric := 0;
  v_inv_val_last        numeric;
  v_inv_snap_period_end date;
  v_actual_inv          numeric := 0;
  v_suspense_bal        numeric := 0;
  v_unjournaled_tx      int := 0;
  v_unjournaled_rev     int := 0;
  v_unjournaled_forfeit int := 0;
  v_unjournaled_split   int := 0;
  v_abnormal_cnt        int := 0;
  v_stale_months        int := 0;
  v_last_closed_month   date;
  -- Variabel aset tetap (Fase C)
  v_fa_diff_total       numeric := 0;
  v_fa_class_rec        record;
  v_fa_active_cost      numeric := 0;
  v_fa_asset_bal        numeric := 0;
  v_fa_accum_exp        numeric := 0;
  v_fa_accum_bal        numeric := 0;
  v_fa_classes_checked  int := 0;
  v_dep_due_cnt         int := 0;
  v_asset_rec           record;
  v_first_due           date;
  v_cur_m               date;
  v_asset_dep_base      numeric;
  v_asset_prior_dep     numeric;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    return '[]'::jsonb;
  end if;

  -- 1. TB_BALANCED: Sigma debit = Sigma kredit jurnal s.d. p_as_of
  select coalesce(sum(jl.debit), 0), coalesce(sum(jl.credit), 0)
    into v_debit, v_credit
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
   where je.user_id = v_uid
     and je.entry_date <= p_as_of;

  v_checks := v_checks || jsonb_build_object(
    'code', 'TB_BALANCED',
    'severity', case when v_debit = v_credit then 'ok' else 'error' end,
    'label', 'Keseimbangan Jurnal Buku Besar',
    'expected', v_credit,
    'actual', v_debit,
    'diff', v_debit - v_credit,
    'hint', 'Total debit dan total kredit seluruh jurnal harus seimbang'
  );

  -- 2. BS_BALANCED: Neraca seimbang per p_as_of
  v_bs := public.get_balance_sheet(p_as_of, null, false);
  v_checks := v_checks || jsonb_build_object(
    'code', 'BS_BALANCED',
    'severity', case when (v_bs->'meta'->>'balanced')::boolean is true then 'ok' else 'error' end,
    'label', 'Keseimbangan Neraca (Aset = Liabilitas + Ekuitas)',
    'expected', (v_bs->'totals'->>'total_assets')::numeric,
    'actual', (v_bs->'totals'->>'total_liabilities_and_equity')::numeric,
    'diff', (v_bs->'totals'->>'difference')::numeric,
    'hint', 'Total Aset harus sama persis dengan Total Liabilitas + Ekuitas'
  );

  -- 3. CASH_MATCH: Kas+Bank = saldo Kas+Bank jurnal opening_balance + Sigma(income - expense) transaksi >= books_start_date s.d. p_as_of
  select coalesce(sum(jl.debit - jl.credit), 0)
    into v_ob_cash
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
   where je.user_id = v_uid
     and je.source_type = 'opening_balance'
     and a.is_cash is true;

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_tx_cash
    from public.transactions
   where user_id = v_uid
     and transaction_date >= coalesce(v_settings.books_start_date, '1900-01-01'::date)
     and transaction_date <= p_as_of;

  v_expected_cash := v_ob_cash + v_tx_cash;

  select coalesce(sum(jl.debit - jl.credit), 0)
    into v_actual_cash
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
   where je.user_id = v_uid
     and a.is_cash is true
     and je.entry_date <= p_as_of;

  v_checks := v_checks || jsonb_build_object(
    'code', 'CASH_MATCH',
    'severity', case when v_actual_cash = v_expected_cash then 'ok' else 'error' end,
    'label', 'Pencocokan Kas & Bank (Buku Besar vs Transaksi Kas)',
    'expected', v_expected_cash,
    'actual', v_actual_cash,
    'diff', v_actual_cash - v_expected_cash,
    'hint', 'Saldo Kas+Bank di buku besar harus cocok dengan mutasi transaksi kas'
  );

  -- 4. ADV_MATCH: 1-1400 = Sigma cash_advances outstanding (date_given <= p_as_of)
  select coalesce(sum(amount), 0)
    into v_expected_adv
    from public.cash_advances
   where user_id = v_uid
     and status = 'outstanding'
     and date_given <= p_as_of;

  select coalesce(sum(jl.debit - jl.credit), 0)
    into v_actual_adv
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
   where je.user_id = v_uid
     and a.code = '1-1400'
     and je.entry_date <= p_as_of;

  v_checks := v_checks || jsonb_build_object(
    'code', 'ADV_MATCH',
    'severity', case when v_actual_adv = v_expected_adv then 'ok' else 'error' end,
    'label', 'Pencocokan Uang Muka Karyawan (1-1400 vs Outstanding SPJ)',
    'expected', v_expected_adv,
    'actual', v_actual_adv,
    'diff', v_actual_adv - v_expected_adv,
    'hint', 'Saldo akun 1-1400 harus cocok dengan total uang muka staf yang belum selesai'
  );

  -- 5. CUSTOMER_ADV_MATCH: 2-1200 kredit = Sigma (pembayaran - pelepasan) untuk order yang belum completed
  select coalesce(sum(op.amount), 0)
    into v_expected_cust_adv
    from public.order_payments op
    join public.orders o on o.id = op.order_id
   where o.user_id = v_uid
     and o.production_status <> 'completed'
     and op.payment_date <= p_as_of;

  v_expected_cust_adv := v_expected_cust_adv - coalesce((
    select sum(r.amount) from public.order_deposit_releases r
      join public.orders o on o.id = r.order_id
     where o.user_id = v_uid and o.production_status <> 'completed' and r.release_date <= p_as_of
  ), 0);

  select coalesce(sum(jl.credit - jl.debit), 0)
    into v_actual_cust_adv
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
   where je.user_id = v_uid
     and a.code = '2-1200'
     and je.entry_date <= p_as_of;

  v_checks := v_checks || jsonb_build_object(
    'code', 'CUSTOMER_ADV_MATCH',
    'severity', case when v_actual_cust_adv = v_expected_cust_adv then 'ok' else 'error' end,
    'label', 'Pencocokan Uang Muka Pelanggan (2-1200 vs Sisa DP Order Aktif)',
    'expected', v_expected_cust_adv,
    'actual', v_actual_cust_adv,
    'diff', v_actual_cust_adv - v_expected_cust_adv,
    'hint', 'Saldo 2-1200 harus sama dengan sisa pembayaran order yang belum selesai'
  );

  -- 6. INV_MATCH: 1-1500 per period_end snapshot terakhir = total_value inventory_valuations terakhir
  select total_value, period_end into v_inv_val_last, v_inv_snap_period_end
    from public.inventory_valuations
   where user_id = v_uid and period_end <= p_as_of
   order by period_end desc limit 1;

  if v_inv_val_last is not null then
    select coalesce(sum(jl.debit - jl.credit), 0)
      into v_actual_inv
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id
      join public.accounts a on a.id = jl.account_id
     where je.user_id = v_uid and a.code = '1-1500' and je.entry_date <= v_inv_snap_period_end;
  else
    v_actual_inv := 0;
  end if;

  v_checks := v_checks || jsonb_build_object(
    'code', 'INV_MATCH',
    'severity', case
      when v_inv_val_last is null then 'ok'
      when v_actual_inv = v_inv_val_last then 'ok'
      else 'warn'
    end,
    'label', 'Pencocokan Persediaan dengan Snapshot Valuasi Terakhir',
    'expected', coalesce(v_inv_val_last, v_actual_inv),
    'actual', v_actual_inv,
    'diff', v_actual_inv - coalesce(v_inv_val_last, v_actual_inv),
    'hint', 'Setelah tutup bulan, saldo 1-1500 harus cocok dengan nilai stok fisik hasil valuasi per tanggal tutup bulan'
  );

  -- 7. SUSPENSE_ZERO: Saldo 9-9999 = 0
  select coalesce(sum(jl.debit - jl.credit), 0)
    into v_suspense_bal
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
   where je.user_id = v_uid and a.code = '9-9999' and je.entry_date <= p_as_of;

  v_checks := v_checks || jsonb_build_object(
    'code', 'SUSPENSE_ZERO',
    'severity', case when v_suspense_bal = 0 then 'ok' else 'warn' end,
    'label', 'Akun Penampung (9-9999) Bersaldo Nol',
    'expected', 0,
    'actual', v_suspense_bal,
    'diff', v_suspense_bal,
    'hint', 'Akun penampung harus bernilai 0; jika tidak 0, ada transaksi yang belum dipetakan kategorinya'
  );

  -- 8. TX_JOURNALED: Transaksi >= books_start_date tanpa jurnal
  select count(*) into v_unjournaled_tx
    from public.transactions t
    where t.user_id = v_uid
      and t.transaction_date >= coalesce(v_settings.books_start_date, '1900-01-01'::date)
      and t.transaction_date <= p_as_of
      and not exists (
        select 1 from public.journal_entries je
         where je.user_id = v_uid and je.source_type = 'transaction' and je.source_id = t.id
      );

  v_checks := v_checks || jsonb_build_object(
    'code', 'TX_JOURNALED',
    'severity', case when v_unjournaled_tx = 0 then 'ok' else 'error' end,
    'label', 'Kelengkapan Jurnal Transaksi Kas',
    'expected', 0,
    'actual', v_unjournaled_tx,
    'diff', v_unjournaled_tx,
    'hint', 'Semua transaksi kas dalam periode aktif harus memiliki jurnal'
  );

  -- 9. ORDER_REVENUE: Order completed tanpa jurnal order_revenue
  select count(*) into v_unjournaled_rev
    from public.orders o
    join public.order_stage_events ose
      on ose.order_id = o.id
     and ose.stage = 'kirim'
     and ose.status = 'done'
   where o.user_id = v_uid
     and o.production_status = 'completed'
     and coalesce(ose.completed_at::date, ose.updated_at::date) >= coalesce(v_settings.books_start_date, '1900-01-01'::date)
     and coalesce(ose.completed_at::date, ose.updated_at::date) <= p_as_of
     and not exists (
       select 1 from public.journal_entries je
        where je.user_id = v_uid and je.source_type = 'order_revenue' and je.source_id = o.id
     );

  v_checks := v_checks || jsonb_build_object(
    'code', 'ORDER_REVENUE',
    'severity', case when v_unjournaled_rev = 0 then 'ok' else 'error' end,
    'label', 'Kelengkapan Jurnal Pendapatan Order Selesai',
    'expected', 0,
    'actual', v_unjournaled_rev,
    'diff', v_unjournaled_rev,
    'hint', 'Setiap order selesai/dikirim harus memiliki jurnal pengakuan pendapatan'
  );

  -- 10. FORFEIT_JOURNALED: Pelepasan DP hangus tanpa jurnal order_forfeit
  select count(*) into v_unjournaled_forfeit
    from public.order_deposit_releases r
   where r.user_id = v_uid
     and r.kind = 'forfeit'
     and r.release_date >= coalesce(v_settings.books_start_date, '1900-01-01'::date)
     and r.release_date <= p_as_of
     and not exists (
       select 1 from public.journal_entries je
        where je.user_id = v_uid and je.source_type = 'order_forfeit' and je.source_id = r.id
     );

  v_checks := v_checks || jsonb_build_object(
    'code', 'FORFEIT_JOURNALED',
    'severity', case when v_unjournaled_forfeit = 0 then 'ok' else 'error' end,
    'label', 'Kelengkapan Jurnal DP Hangus',
    'expected', 0,
    'actual', v_unjournaled_forfeit,
    'diff', v_unjournaled_forfeit,
    'hint', 'Setiap pelepasan DP hangus harus memiliki jurnal'
  );

  -- 11. PAYROLL_SPLIT: Payroll berbayar dengan upah borongan tanpa jurnal payroll_split
  select count(*) into v_unjournaled_split
    from public.weekly_payrolls wp
   where wp.user_id = v_uid
     and wp.status = 'paid'
     and wp.payment_date >= coalesce(v_settings.books_start_date, '1900-01-01'::date)
     and wp.payment_date <= p_as_of
     and exists (
       select 1 from public.payroll_items pi
        where pi.payroll_id = wp.id and pi.piecework_amount > 0
     )
     and not exists (
       select 1 from public.journal_entries je
        where je.user_id = v_uid and je.source_type = 'payroll_split' and je.source_id = wp.id
     );

  v_checks := v_checks || jsonb_build_object(
    'code', 'PAYROLL_SPLIT',
    'severity', case when v_unjournaled_split = 0 then 'ok' else 'warn' end,
    'label', 'Kelengkapan Jurnal Reklasifikasi Upah Borongan',
    'expected', 0,
    'actual', v_unjournaled_split,
    'diff', v_unjournaled_split,
    'hint', 'Payroll yang memiliki upah borongan harus direklasifikasi ke akun 5-1100'
  );

  -- 12. ABNORMAL_BALANCE: Jumlah akun bersaldo tidak wajar (kas kredit, hutang debit)
  select count(*) into v_abnormal_cnt
    from (
      select a.id,
        sum(jl.debit - jl.credit) as net_debit
      from public.accounts a
      join public.journal_lines jl on jl.account_id = a.id
      join public.journal_entries je on je.id = jl.entry_id
      where a.user_id = v_uid and je.entry_date <= p_as_of
      group by a.id, a.account_type, a.is_cash
      having (a.is_cash is true and sum(jl.debit - jl.credit) < 0)
          or (a.account_type = 'liability' and sum(jl.credit - jl.debit) < 0)
    ) ab;

  v_checks := v_checks || jsonb_build_object(
    'code', 'ABNORMAL_BALANCE',
    'severity', case when v_abnormal_cnt = 0 then 'ok' else 'warn' end,
    'label', 'Pemeriksaan Saldo Tidak Wajar Akun',
    'expected', 0,
    'actual', v_abnormal_cnt,
    'diff', v_abnormal_cnt,
    'hint', 'Tidak boleh ada akun Kas/Bank bersaldo kredit atau Hutang bersaldo debit'
  );

  -- 13. PERIOD_STALE: Ada bulan sebelum bulan berjalan yang sudah lewat tapi belum ditutup
  v_last_closed_month := coalesce(v_settings.locked_through, v_settings.books_start_date - interval '1 day');
  if (date_trunc('month', current_date) - interval '1 day')::date > v_last_closed_month then
    v_stale_months := 1;
  end if;

  v_checks := v_checks || jsonb_build_object(
    'code', 'PERIOD_STALE',
    'severity', case when v_stale_months = 0 then 'ok' else 'warn' end,
    'label', 'Status Penutupan Periode Bulanan',
    'expected', 0,
    'actual', v_stale_months,
    'diff', v_stale_months,
    'hint', 'Bulan yang telah berakhir sebaiknya segera ditutup melalui menu Tutup Buku'
  );

  -- 14. FIXED_ASSET_MATCH (Fase C)
  -- Untuk tiap kelas aset:
  -- Σ cost aset active = saldo akun aset, dan
  -- Σ (accumulated_at_start + penyusutan terjurnal) = saldo kredit akun akumulasi
  for v_fa_class_rec in
    select * from (
      values
        ('equipment', '1-2100', '1-2110'),
        ('vehicle',   '1-2200', '1-2210'),
        ('furniture', '1-2300', '1-2310'),
        ('building',  '1-2400', '1-2410')
    ) as t(cls, asset_code, accum_code)
  loop
    v_fa_classes_checked := v_fa_classes_checked + 1;

    -- Σ cost aset active
    select coalesce(sum(cost), 0) into v_fa_active_cost
      from public.fixed_assets
     where user_id = v_uid and asset_class = v_fa_class_rec.cls and status = 'active';

    -- Saldo debit akun aset
    select coalesce(sum(jl.debit - jl.credit), 0) into v_fa_asset_bal
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id
      join public.accounts a on a.id = jl.account_id
     where je.user_id = v_uid and a.code = v_fa_class_rec.asset_code and je.entry_date <= p_as_of;

    -- Σ akumulasi yang diharapkan (accumulated_at_start + penyusutan s.d. p_as_of)
    select coalesce(sum(
      fa.accumulated_at_start + coalesce((
        select sum(fad.amount)
          from public.fixed_asset_depreciations fad
         where fad.asset_id = fa.id and fad.period <= p_as_of
      ), 0)
    ), 0) into v_fa_accum_exp
      from public.fixed_assets fa
     where fa.user_id = v_uid and fa.asset_class = v_fa_class_rec.cls and fa.status = 'active';

    -- Saldo kredit akun akumulasi
    select coalesce(sum(jl.credit - jl.debit), 0) into v_fa_accum_bal
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id
      join public.accounts a on a.id = jl.account_id
     where je.user_id = v_uid and a.code = v_fa_class_rec.accum_code and je.entry_date <= p_as_of;

    if abs(v_fa_active_cost - v_fa_asset_bal) > 0.01 then
      v_fa_diff_total := v_fa_diff_total + abs(v_fa_active_cost - v_fa_asset_bal);
    end if;

    if abs(v_fa_accum_exp - v_fa_accum_bal) > 0.01 then
      v_fa_diff_total := v_fa_diff_total + abs(v_fa_accum_exp - v_fa_accum_bal);
    end if;
  end loop;

  v_checks := v_checks || jsonb_build_object(
    'code', 'FIXED_ASSET_MATCH',
    'severity', case when v_fa_diff_total = 0 then 'ok' else 'warn' end,
    'label', 'Pencocokan Nilai dan Akumulasi Aset Tetap',
    'expected', 0,
    'actual', v_fa_diff_total,
    'diff', v_fa_diff_total,
    'hint', 'Saldo akun aset dan akumulasi penyusutan di buku besar harus cocok dengan register aset tetap aktif'
  );

  -- 15. DEPRECIATION_DUE (Fase C)
  -- Tidak ada aset active yang punya bulan jatuh tempo <= locked_through tanpa baris penyusutan
  if v_settings.locked_through is not null then
    for v_asset_rec in
      select fa.*
        from public.fixed_assets fa
       where fa.user_id = v_uid and fa.status = 'active'
    loop
      if v_asset_rec.acquisition_date < v_settings.books_start_date then
        v_first_due := date_trunc('month', v_settings.books_start_date)::date;
      else
        v_first_due := (date_trunc('month', v_asset_rec.acquisition_date) + interval '1 month')::date;
      end if;

      v_asset_dep_base := v_asset_rec.cost - v_asset_rec.salvage_value;

      if v_first_due <= date_trunc('month', v_settings.locked_through)::date then
        v_cur_m := v_first_due;
        while v_cur_m <= date_trunc('month', v_settings.locked_through)::date loop
          -- Cek apakah aset sudah habis disusutkan sebelum bulan ini
          select coalesce(sum(amount), 0) into v_asset_prior_dep
            from public.fixed_asset_depreciations
           where asset_id = v_asset_rec.id and period < v_cur_m;

          if (v_asset_dep_base - (v_asset_rec.accumulated_at_start + v_asset_prior_dep)) > 0 then
            if not exists (
              select 1 from public.fixed_asset_depreciations
               where asset_id = v_asset_rec.id and period = v_cur_m
            ) then
              v_dep_due_cnt := v_dep_due_cnt + 1;
            end if;
          end if;

          v_cur_m := (v_cur_m + interval '1 month')::date;
        end loop;
      end if;
    end loop;
  end if;

  v_checks := v_checks || jsonb_build_object(
    'code', 'DEPRECIATION_DUE',
    'severity', case when v_dep_due_cnt = 0 then 'ok' else 'warn' end,
    'label', 'Kelengkapan Penyusutan Periode Terkunci',
    'expected', 0,
    'actual', v_dep_due_cnt,
    'diff', v_dep_due_cnt,
    'hint', 'Aset tetap aktif yang telah jatuh tempo pada periode terkunci harus memiliki catatan penyusutan bulanan'
  );

  return v_checks;
end;
$$;

revoke execute on function public.get_accounting_checks(date) from public, anon;
grant  execute on function public.get_accounting_checks(date) to authenticated;
