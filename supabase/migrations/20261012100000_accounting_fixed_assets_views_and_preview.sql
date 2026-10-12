-- =========================================================================
-- SIKon — Accounting Phase C: Fixed Asset Register & Preview Integration
-- Migration: 20261012100000_accounting_fixed_assets_views_and_preview.sql
-- =========================================================================
-- Berisi:
-- 1. Internal function: acc_depreciation_due(p_user_id, p_period_end)
-- 2. Redefinisi close_accounting_period(p_period_end) memakai acc_depreciation_due
-- 3. Redefinisi get_close_preview() menambahkan depreciation & depreciation_by_class
-- 4. RPC get_fixed_asset_register(p_as_of)
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Internal Function: acc_depreciation_due
-- ---------------------------------------------------------------------------
create or replace function public.acc_depreciation_due(
  p_user_id     uuid,
  p_period_end  date
)
returns table (
  asset_id                uuid,
  asset_class             varchar,
  accumulated_account_id  uuid,
  amount                  numeric
)
language plpgsql
security definer set search_path = public as $$
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

    if v_rem > 0 then
      v_monthly_rate := round(v_dep_base / v_asset.useful_life_months);

      select count(*) into v_prev_dep_count
        from public.fixed_asset_depreciations fad
       where fad.asset_id = v_asset.id;

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

revoke execute on function public.acc_depreciation_due(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Redefinisi close_accounting_period (memakai acc_depreciation_due)
-- ---------------------------------------------------------------------------
create or replace function public.close_accounting_period(p_period_end date)
returns jsonb
language plpgsql
security definer set search_path = public as $$
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
  v_adj_entry_id          uuid;
  v_entry_no              varchar;
  v_detail                jsonb;
  v_period_month_start    date;
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

  -- 8. FASE C: HITUNG PENYUSUTAN BULAN ITU VIA acc_depreciation_due
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

    -- Baris jurnal per kelas aset: Dr 6-6000, Kr akun akumulasi kelas
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

revoke execute on function public.close_accounting_period(date) from public, anon;
grant  execute on function public.close_accounting_period(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Redefinisi get_close_preview
-- ---------------------------------------------------------------------------
create or replace function public.get_close_preview()
returns jsonb
language plpgsql
stable
security definer set search_path = public as $$
declare
  v_uid            uuid := auth.uid();
  v_settings       public.accounting_settings;
  v_expected       date;
  v_val            numeric := 0;
  v_book_balance   numeric := 0;
  v_diff           numeric := 0;
  v_acct_1500      uuid;
  v_can_close      boolean := true;
  v_reason         text;
  v_dep_total      numeric := 0;
  v_dep_by_class   jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    return jsonb_build_object(
      'can_close', false,
      'reason', 'Akuntansi belum aktif',
      'next_period_end', null,
      'locked_through', null,
      'inventory_balance', 0,
      'inventory_value', 0,
      'adjustment', 0,
      'depreciation', 0,
      'depreciation_by_class', '[]'::jsonb
    );
  end if;

  -- Hitung next_period_end
  if v_settings.locked_through is null then
    v_expected := (date_trunc('month', v_settings.books_start_date) + interval '1 month - 1 day')::date;
  else
    v_expected := (date_trunc('month', v_settings.locked_through + interval '1 day') + interval '1 month - 1 day')::date;
  end if;

  if v_expected >= current_date then
    v_can_close := false;
    v_reason := 'Bulan ' || to_char(v_expected, 'MM/YYYY') || ' belum berakhir';
  end if;

  -- Nilai fisik dan saldo buku
  v_val := public.acc_inventory_value(v_uid);

  select id into v_acct_1500 from public.accounts where user_id = v_uid and code = '1-1500';
  if v_acct_1500 is not null then
    select coalesce(sum(jl.debit - jl.credit), 0)
      into v_book_balance
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id
     where je.user_id = v_uid
       and jl.account_id = v_acct_1500
       and je.entry_date <= v_expected;
  end if;

  v_diff := v_val - v_book_balance;

  -- FASE C: Hitung penyusutan bulanan yang jatuh tempo untuk next_period_end
  select coalesce(sum(d.amount), 0)
    into v_dep_total
    from public.acc_depreciation_due(v_uid, v_expected) d;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'asset_class', grp.asset_class,
      'account_code', a.code,
      'name', a.name,
      'amount', grp.class_amount
    ) order by a.code
  ), '[]'::jsonb)
    into v_dep_by_class
    from (
      select d.asset_class, d.accumulated_account_id, sum(d.amount) as class_amount
        from public.acc_depreciation_due(v_uid, v_expected) d
       group by d.asset_class, d.accumulated_account_id
    ) grp
    join public.accounts a on a.id = grp.accumulated_account_id;

  return jsonb_build_object(
    'can_close', v_can_close,
    'reason', v_reason,
    'next_period_end', v_expected,
    'locked_through', v_settings.locked_through,
    'inventory_balance', v_book_balance,
    'inventory_value', v_val,
    'adjustment', v_diff,
    'depreciation', v_dep_total,
    'depreciation_by_class', v_dep_by_class
  );
end;
$$;

revoke execute on function public.get_close_preview() from public, anon;
grant  execute on function public.get_close_preview() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: get_fixed_asset_register
-- ---------------------------------------------------------------------------
create or replace function public.get_fixed_asset_register(p_as_of date default current_date)
returns table (
  id                          uuid,
  name                        varchar,
  asset_class                 varchar,
  acquisition_date            date,
  cost                        numeric,
  salvage_value               numeric,
  useful_life_months          integer,
  status                      varchar,
  disposed_at                 date,
  notes                       text,
  accumulated                 numeric,
  book_value                  numeric,
  depreciation_months_posted  integer,
  monthly_depreciation        numeric,
  fully_depreciated           boolean,
  next_depreciation_period    date
)
language plpgsql
stable
security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_settings  public.accounting_settings;
  v_as_of     date := coalesce(p_as_of, current_date);
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    return;
  end if;

  return query
  with dep_summary as (
    select fad.asset_id,
           coalesce(sum(fad.amount), 0) as posted_amount,
           count(fad.id)::int as dep_count,
           max(fad.period) as last_period
      from public.fixed_asset_depreciations fad
      join public.journal_entries je on je.id = fad.journal_entry_id
     where fad.user_id = v_uid
       and je.entry_date <= v_as_of
     group by fad.asset_id
  )
  select
    fa.id,
    fa.name,
    fa.asset_class,
    fa.acquisition_date,
    fa.cost,
    fa.salvage_value,
    fa.useful_life_months,
    fa.status,
    fa.disposed_at,
    fa.notes,
    (fa.accumulated_at_start + coalesce(d.posted_amount, 0)) as accumulated,
    (fa.cost - (fa.accumulated_at_start + coalesce(d.posted_amount, 0))) as book_value,
    coalesce(d.dep_count, 0)::integer as depreciation_months_posted,
    round((fa.cost - fa.salvage_value) / fa.useful_life_months) as monthly_depreciation,
    ((fa.cost - (fa.accumulated_at_start + coalesce(d.posted_amount, 0))) <= fa.salvage_value) as fully_depreciated,
    case
      when fa.status = 'disposed' then null
      when ((fa.cost - (fa.accumulated_at_start + coalesce(d.posted_amount, 0))) <= fa.salvage_value) then null
      when d.last_period is not null then (d.last_period + interval '1 month')::date
      when fa.acquisition_date < v_settings.books_start_date then date_trunc('month', v_settings.books_start_date)::date
      else (date_trunc('month', fa.acquisition_date) + interval '1 month')::date
    end as next_depreciation_period
  from public.fixed_assets fa
  left join dep_summary d on d.asset_id = fa.id
  where fa.user_id = v_uid
  order by fa.acquisition_date desc, fa.name asc;
end;
$$;

revoke execute on function public.get_fixed_asset_register(date) from public, anon;
grant  execute on function public.get_fixed_asset_register(date) to authenticated;
