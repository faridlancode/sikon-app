-- =========================================================================
-- SIKon — Accounting Phase B4: Laporan Keuangan (Laba Rugi, Neraca, Cek Konsistensi)
-- Migration: 20261010100000_accounting_financial_reports.sql
-- =========================================================================
-- Berisi:
-- 1. Index performa jurnal
-- 2. get_income_statement(p_from, p_to, p_compare_from, p_compare_to, p_include_provisional)
-- 3. get_balance_sheet(p_as_of, p_compare_as_of, p_include_provisional)
-- 4. get_accounting_checks(p_as_of)
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. INDEX PERFORMA LAPORAN
-- ---------------------------------------------------------------------------
create index if not exists idx_journal_lines_account_entry
  on public.journal_lines (account_id, entry_id);

create index if not exists idx_journal_entries_user_date
  on public.journal_entries (user_id, entry_date);

create index if not exists idx_journal_entries_user_source
  on public.journal_entries (user_id, source_type);

-- ---------------------------------------------------------------------------
-- 2. RPC: get_income_statement
-- ---------------------------------------------------------------------------
create or replace function public.get_income_statement(
  p_from date,
  p_to date,
  p_compare_from date default null,
  p_compare_to date default null,
  p_include_provisional boolean default true
)
returns jsonb
language plpgsql
stable
security definer set search_path = public as $$
declare
  v_uid                 uuid := auth.uid();
  v_settings            public.accounting_settings;
  v_actual_from         date := p_from;
  v_clamped             boolean := false;
  v_status              text := 'open_no_estimate';
  v_prov_applied        boolean := false;
  v_prov_cogs           numeric := 0;
  v_prov_reason         text;
  v_inv_book            numeric := 0;
  v_inv_phys            numeric := 0;
  v_acct_1500           uuid;
  v_rev_rows            jsonb := '[]'::jsonb;
  v_cogs_rows           jsonb := '[]'::jsonb;
  v_opex_rows           jsonb := '[]'::jsonb;
  v_other_rows          jsonb := '[]'::jsonb;
  v_rev_total           numeric := 0;
  v_cogs_total          numeric := 0;
  v_opex_total          numeric := 0;
  v_other_total         numeric := 0;
  v_cmp_rev_total       numeric;
  v_cmp_cogs_total      numeric;
  v_cmp_opex_total      numeric;
  v_cmp_other_total     numeric;
  v_has_compare         boolean := false;
  v_gross_profit        numeric := 0;
  v_gross_margin_pct    numeric;
  v_net_profit          numeric := 0;
  v_net_margin_pct      numeric;
  v_cmp_gross_profit    numeric;
  v_cmp_gross_margin_pct numeric;
  v_cmp_net_profit      numeric;
  v_cmp_net_margin_pct  numeric;
  v_row                 record;
  v_amount              numeric;
  v_cmp_amount          numeric;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    return jsonb_build_object(
      'meta', jsonb_build_object('enabled', false, 'reason', 'Akuntansi belum aktif'),
      'sections', '[]'::jsonb,
      'totals', '{}'::jsonb
    );
  end if;

  -- 1. Clamping dari books_start_date
  if v_settings.books_start_date is not null and p_from < v_settings.books_start_date then
    v_actual_from := v_settings.books_start_date;
    v_clamped := true;
  end if;

  -- 2. Evaluasi status & estimasi HPP sementara
  if v_settings.locked_through is not null and p_to <= v_settings.locked_through then
    v_status := 'locked';
    v_prov_applied := false;
    v_prov_cogs := 0;
  elsif p_to < date_trunc('month', current_date)::date then
    v_status := 'open_no_estimate';
    v_prov_applied := false;
    v_prov_cogs := 0;
    v_prov_reason := 'Periode ini belum ditutup, HPP Bahan belum dihitung, laba masih terlalu besar. Tutup buku dulu.';
  else
    if p_include_provisional is true then
      select id into v_acct_1500 from public.accounts where user_id = v_uid and code = '1-1500';
      if v_acct_1500 is not null then
        select coalesce(sum(jl.debit - jl.credit), 0)
          into v_inv_book
          from public.journal_lines jl
          join public.journal_entries je on je.id = jl.entry_id
         where je.user_id = v_uid
           and jl.account_id = v_acct_1500
           and je.entry_date <= p_to;
      end if;

      v_inv_phys := public.acc_inventory_value(v_uid);
      v_prov_cogs := (v_inv_book - v_inv_phys);
      if v_prov_cogs <> 0 then
        v_prov_applied := true;
        v_status := 'open_estimate';
      else
        v_prov_applied := false;
        v_status := 'open_no_estimate';
      end if;
    else
      v_status := 'open_no_estimate';
      v_prov_applied := false;
      v_prov_cogs := 0;
      v_prov_reason := 'Estimasi HPP dinonaktifkan oleh pengguna';
    end if;
  end if;

  -- 3. Cek pembanding
  if p_compare_from is not null and p_compare_to is not null
     and v_settings.books_start_date is not null
     and p_compare_from >= v_settings.books_start_date then
    v_has_compare := true;
  end if;

  -- 4. Kumpulkan per akun
  for v_row in
    select
      a.id as account_id,
      a.code,
      a.name,
      a.account_type,
      a.report_group,
      coalesce(sum(case when je.entry_date between v_actual_from and p_to then jl.debit else 0 end), 0) as cur_debit,
      coalesce(sum(case when je.entry_date between v_actual_from and p_to then jl.credit else 0 end), 0) as cur_credit,
      coalesce(sum(case when v_has_compare and je.entry_date between p_compare_from and p_compare_to then jl.debit else 0 end), 0) as cmp_debit,
      coalesce(sum(case when v_has_compare and je.entry_date between p_compare_from and p_compare_to then jl.credit else 0 end), 0) as cmp_credit
    from public.accounts a
    left join public.journal_lines jl on jl.account_id = a.id
    left join public.journal_entries je on je.id = jl.entry_id and je.user_id = v_uid
    where a.user_id = v_uid
      and a.account_type in ('revenue', 'expense')
    group by a.id, a.code, a.name, a.account_type, a.report_group
    order by a.code
  loop
    if v_row.account_type = 'revenue' then
      v_amount := v_row.cur_credit - v_row.cur_debit;
      v_cmp_amount := case when v_has_compare then (v_row.cmp_credit - v_row.cmp_debit) else null end;
    else
      v_amount := v_row.cur_debit - v_row.cur_credit;
      v_cmp_amount := case when v_has_compare then (v_row.cmp_debit - v_row.cmp_credit) else null end;
    end if;

    -- Lewati baris jika nol kedua periode
    if v_amount <> 0 or coalesce(v_cmp_amount, 0) <> 0 then
      if v_row.report_group = 'revenue' then
        v_rev_rows := v_rev_rows || jsonb_build_object(
          'account_id', v_row.account_id, 'code', v_row.code, 'name', v_row.name,
          'amount', v_amount, 'compare_amount', v_cmp_amount, 'is_estimate', false
        );
        v_rev_total := v_rev_total + v_amount;
        if v_has_compare then v_cmp_rev_total := coalesce(v_cmp_rev_total, 0) + coalesce(v_cmp_amount, 0); end if;

      elsif v_row.report_group = 'cogs' then
        v_cogs_rows := v_cogs_rows || jsonb_build_object(
          'account_id', v_row.account_id, 'code', v_row.code, 'name', v_row.name,
          'amount', v_amount, 'compare_amount', v_cmp_amount, 'is_estimate', false
        );
        v_cogs_total := v_cogs_total + v_amount;
        if v_has_compare then v_cmp_cogs_total := coalesce(v_cmp_cogs_total, 0) + coalesce(v_cmp_amount, 0); end if;

      elsif v_row.report_group = 'opex' then
        v_opex_rows := v_opex_rows || jsonb_build_object(
          'account_id', v_row.account_id, 'code', v_row.code, 'name', v_row.name,
          'amount', v_amount, 'compare_amount', v_cmp_amount, 'is_estimate', false
        );
        v_opex_total := v_opex_total + v_amount;
        if v_has_compare then v_cmp_opex_total := coalesce(v_cmp_opex_total, 0) + coalesce(v_cmp_amount, 0); end if;

      elsif v_row.report_group = 'other' then
        -- Pendapatan lain bernilai positif, beban lain bernilai negatif
        if v_row.account_type = 'expense' then
          v_amount := -v_amount;
          if v_has_compare then v_cmp_amount := -v_cmp_amount; end if;
        end if;
        v_other_rows := v_other_rows || jsonb_build_object(
          'account_id', v_row.account_id, 'code', v_row.code, 'name', v_row.name,
          'amount', v_amount, 'compare_amount', v_cmp_amount, 'is_estimate', false
        );
        v_other_total := v_other_total + v_amount;
        if v_has_compare then v_cmp_other_total := coalesce(v_cmp_other_total, 0) + coalesce(v_cmp_amount, 0); end if;
      end if;
    end if;
  end loop;

  -- 5. Tambahkan baris estimasi HPP bila aktif
  if v_prov_applied then
    v_cogs_rows := v_cogs_rows || jsonb_build_object(
      'account_id', null, 'code', '5-1000', 'name', 'Estimasi HPP Bahan (periode belum ditutup)',
      'amount', v_prov_cogs, 'compare_amount', null, 'is_estimate', true
    );
    v_cogs_total := v_cogs_total + v_prov_cogs;
  end if;

  -- 6. Hitung total laba dan margin
  v_gross_profit := v_rev_total - v_cogs_total;
  if v_rev_total > 0 then
    v_gross_margin_pct := round((v_gross_profit / v_rev_total) * 100, 2);
  end if;

  v_net_profit := (v_gross_profit - v_opex_total) + v_other_total;
  if v_rev_total > 0 then
    v_net_margin_pct := round((v_net_profit / v_rev_total) * 100, 2);
  end if;

  if v_has_compare then
    v_cmp_gross_profit := coalesce(v_cmp_rev_total, 0) - coalesce(v_cmp_cogs_total, 0);
    if coalesce(v_cmp_rev_total, 0) > 0 then
      v_cmp_gross_margin_pct := round((v_cmp_gross_profit / v_cmp_rev_total) * 100, 2);
    end if;
    v_cmp_net_profit := (v_cmp_gross_profit - coalesce(v_cmp_opex_total, 0)) + coalesce(v_cmp_other_total, 0);
    if coalesce(v_cmp_rev_total, 0) > 0 then
      v_cmp_net_margin_pct := round((v_cmp_net_profit / v_cmp_rev_total) * 100, 2);
    end if;
  end if;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'from', v_actual_from,
      'to', p_to,
      'compare_from', p_compare_from,
      'compare_to', p_compare_to,
      'status', v_status,
      'locked_through', v_settings.locked_through,
      'provisional', jsonb_build_object(
        'applied', v_prov_applied,
        'hpp_bahan', v_prov_cogs,
        'reason', v_prov_reason
      ),
      'clamped_from_books_start', v_clamped
    ),
    'sections', jsonb_build_array(
      jsonb_build_object('key', 'revenue', 'label', 'Pendapatan Usaha', 'rows', v_rev_rows, 'total', v_rev_total, 'compare_total', v_cmp_rev_total),
      jsonb_build_object('key', 'cogs', 'label', 'Harga Pokok Penjualan', 'rows', v_cogs_rows, 'total', v_cogs_total, 'compare_total', v_cmp_cogs_total),
      jsonb_build_object('key', 'opex', 'label', 'Beban Operasional', 'rows', v_opex_rows, 'total', v_opex_total, 'compare_total', v_cmp_opex_total),
      jsonb_build_object('key', 'other', 'label', 'Pendapatan / (Beban) Lain-lain', 'rows', v_other_rows, 'total', v_other_total, 'compare_total', v_cmp_other_total)
    ),
    'totals', jsonb_build_object(
      'gross_profit', v_gross_profit,
      'gross_margin_pct', v_gross_margin_pct,
      'net_profit', v_net_profit,
      'net_margin_pct', v_net_margin_pct,
      'compare_gross_profit', v_cmp_gross_profit,
      'compare_gross_margin_pct', v_cmp_gross_margin_pct,
      'compare_net_profit', v_cmp_net_profit,
      'compare_net_margin_pct', v_cmp_net_margin_pct
    )
  );
end;
$$;

revoke execute on function public.get_income_statement(date, date, date, date, boolean) from public, anon;
grant  execute on function public.get_income_statement(date, date, date, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: get_balance_sheet
-- ---------------------------------------------------------------------------
create or replace function public.get_balance_sheet(
  p_as_of date,
  p_compare_as_of date default null,
  p_include_provisional boolean default true
)
returns jsonb
language plpgsql
stable
security definer set search_path = public as $$
declare
  v_uid                 uuid := auth.uid();
  v_settings            public.accounting_settings;
  v_status              text := 'open_no_estimate';
  v_prov_applied        boolean := false;
  v_prov_diff           numeric := 0;
  v_inv_book            numeric := 0;
  v_inv_phys            numeric := 0;
  v_acct_1500           uuid;
  v_year                int;
  v_start_of_year       date;
  v_curr_assets_rows    jsonb := '[]'::jsonb;
  v_fixed_assets_rows   jsonb := '[]'::jsonb;
  v_liab_rows           jsonb := '[]'::jsonb;
  v_equity_rows         jsonb := '[]'::jsonb;
  v_curr_assets_total   numeric := 0;
  v_fixed_assets_total  numeric := 0;
  v_liab_total          numeric := 0;
  v_equity_total        numeric := 0;
  v_cmp_curr_assets_tot numeric;
  v_cmp_fixed_assets_tot numeric;
  v_cmp_liab_tot        numeric;
  v_cmp_equity_tot      numeric;
  v_has_compare         boolean := false;
  v_total_assets        numeric := 0;
  v_total_liab_equity   numeric := 0;
  v_diff                numeric := 0;
  v_balanced            boolean := true;
  v_working_capital     numeric := 0;
  v_current_ratio       numeric;
  v_row                 record;
  v_bal                 numeric;
  v_cmp_bal             numeric;
  v_retained_earnings   numeric := 0;
  v_ytd_profit          numeric := 0;
  v_cmp_ytd_profit      numeric := 0;
  v_cmp_retained_earnings numeric := 0;
  v_cmp_prior_years_profit numeric := 0;
  v_cmp_year            int;
  v_cmp_start_of_year   date;
  v_prior_years_profit  numeric := 0;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    return jsonb_build_object(
      'meta', jsonb_build_object('enabled', false, 'reason', 'Akuntansi belum aktif'),
      'sections', '[]'::jsonb,
      'totals', '{}'::jsonb
    );
  end if;

  v_year := extract(year from p_as_of)::int;
  v_start_of_year := make_date(v_year, 1, 1);

  -- 1. Evaluasi status & estimasi penyesuaian persediaan
  if v_settings.locked_through is not null and p_as_of <= v_settings.locked_through then
    v_status := 'locked';
    v_prov_applied := false;
    v_prov_diff := 0;
  elsif p_as_of < date_trunc('month', current_date)::date then
    v_status := 'open_no_estimate';
    v_prov_applied := false;
    v_prov_diff := 0;
  else
    if p_include_provisional is true then
      select id into v_acct_1500 from public.accounts where user_id = v_uid and code = '1-1500';
      if v_acct_1500 is not null then
        select coalesce(sum(jl.debit - jl.credit), 0)
          into v_inv_book
          from public.journal_lines jl
          join public.journal_entries je on je.id = jl.entry_id
         where je.user_id = v_uid
           and jl.account_id = v_acct_1500
           and je.entry_date <= p_as_of;
      end if;

      v_inv_phys := public.acc_inventory_value(v_uid);
      v_prov_diff := (v_inv_book - v_inv_phys);
      if v_prov_diff <> 0 then
        v_prov_applied := true;
        v_status := 'open_estimate';
      else
        v_prov_applied := false;
        v_status := 'open_no_estimate';
      end if;
    else
      v_status := 'open_no_estimate';
      v_prov_applied := false;
      v_prov_diff := 0;
    end if;
  end if;

  -- 2. Cek pembanding
  if p_compare_as_of is not null and v_settings.books_start_date is not null
     and p_compare_as_of >= v_settings.books_start_date then
    v_has_compare := true;
  end if;

  -- 3. Akun nyata (Aset, Liabilitas, Modal, Prive)
  for v_row in
    select
      a.id as account_id,
      a.code,
      a.name,
      a.account_type,
      a.report_group,
      coalesce(sum(case when je.entry_date <= p_as_of then jl.debit - jl.credit else 0 end), 0) as as_of_bal,
      coalesce(sum(case when v_has_compare and je.entry_date <= p_compare_as_of then jl.debit - jl.credit else 0 end), 0) as cmp_as_of_bal
    from public.accounts a
    left join public.journal_lines jl on jl.account_id = a.id
    left join public.journal_entries je on je.id = jl.entry_id and je.user_id = v_uid
    where a.user_id = v_uid
      and a.account_type in ('asset', 'liability', 'equity')
    group by a.id, a.code, a.name, a.account_type, a.report_group
    order by a.code
  loop
    -- Aset Lancar
    if v_row.report_group in ('current_asset', 'suspense') then
      v_bal := v_row.as_of_bal;
      v_cmp_bal := case when v_has_compare then v_row.cmp_as_of_bal else null end;

      -- Bila akun 1-1500 dan estimasi diterapkan, turunkan saldo ke stok fisik
      if v_row.code = '1-1500' and v_prov_applied then
        v_bal := v_bal - v_prov_diff;
      end if;

      if v_bal <> 0 or coalesce(v_cmp_bal, 0) <> 0 then
        v_curr_assets_rows := v_curr_assets_rows || jsonb_build_object(
          'account_id', v_row.account_id, 'code', v_row.code, 'name', v_row.name,
          'amount', v_bal, 'compare_amount', v_cmp_bal
        );
        v_curr_assets_total := v_curr_assets_total + v_bal;
        if v_has_compare then v_cmp_curr_assets_tot := coalesce(v_cmp_curr_assets_tot, 0) + coalesce(v_cmp_bal, 0); end if;
      end if;

    -- Aset Tetap
    elsif v_row.report_group in ('fixed_asset', 'contra_asset') then
      v_bal := v_row.as_of_bal;
      v_cmp_bal := case when v_has_compare then v_row.cmp_as_of_bal else null end;

      if v_bal <> 0 or coalesce(v_cmp_bal, 0) <> 0 then
        v_fixed_assets_rows := v_fixed_assets_rows || jsonb_build_object(
          'account_id', v_row.account_id, 'code', v_row.code, 'name', v_row.name,
          'amount', v_bal, 'compare_amount', v_cmp_bal
        );
        v_fixed_assets_total := v_fixed_assets_total + v_bal;
        if v_has_compare then v_cmp_fixed_assets_tot := coalesce(v_cmp_fixed_assets_tot, 0) + coalesce(v_cmp_bal, 0); end if;
      end if;

    -- Liabilitas
    elsif v_row.account_type = 'liability' then
      v_bal := -v_row.as_of_bal; -- saldo normal kredit
      v_cmp_bal := case when v_has_compare then -v_row.cmp_as_of_bal else null end;

      if v_bal <> 0 or coalesce(v_cmp_bal, 0) <> 0 then
        v_liab_rows := v_liab_rows || jsonb_build_object(
          'account_id', v_row.account_id, 'code', v_row.code, 'name', v_row.name,
          'amount', v_bal, 'compare_amount', v_cmp_bal
        );
        v_liab_total := v_liab_total + v_bal;
        if v_has_compare then v_cmp_liab_tot := coalesce(v_cmp_liab_tot, 0) + coalesce(v_cmp_bal, 0); end if;
      end if;

    -- Ekuitas
    elsif v_row.account_type = 'equity' then
      if v_row.code = '3-1000' then
        v_bal := -v_row.as_of_bal;
        v_cmp_bal := case when v_has_compare then -v_row.cmp_as_of_bal else null end;
        v_equity_rows := v_equity_rows || jsonb_build_object(
          'account_id', v_row.account_id, 'code', v_row.code, 'name', v_row.name,
          'amount', v_bal, 'compare_amount', v_cmp_bal
        );
        v_equity_total := v_equity_total + v_bal;
        if v_has_compare then v_cmp_equity_tot := coalesce(v_cmp_equity_tot, 0) + coalesce(v_cmp_bal, 0); end if;

      elsif v_row.code = '3-3000' then
        v_bal := -v_row.as_of_bal; -- prive mengurangi ekuitas
        v_cmp_bal := case when v_has_compare then -v_row.cmp_as_of_bal else null end;
        if v_bal <> 0 or coalesce(v_cmp_bal, 0) <> 0 then
          v_equity_rows := v_equity_rows || jsonb_build_object(
            'account_id', v_row.account_id, 'code', v_row.code, 'name', v_row.name,
            'amount', v_bal, 'compare_amount', v_cmp_bal
          );
          v_equity_total := v_equity_total + v_bal;
          if v_has_compare then v_cmp_equity_tot := coalesce(v_cmp_equity_tot, 0) + coalesce(v_cmp_bal, 0); end if;
        end if;
      end if;
    end if;
  end loop;

  -- 4. Hitung Laba Ditahan & Laba Tahun Berjalan
  -- Laba Ditahan = Saldo akun 3-2000 + Laba bersih tahun-tahun fiskal sebelum tahun ini
  select coalesce(sum(case when a.code = '3-2000' and je.entry_date <= p_as_of then jl.credit - jl.debit else 0 end), 0)
    into v_retained_earnings
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
   where je.user_id = v_uid;

  -- Laba tahun-tahun sebelum tahun p_as_of
  select coalesce(sum(case when a.account_type = 'revenue' then jl.credit - jl.debit else jl.credit - jl.debit end), 0)
    into v_prior_years_profit
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
   where je.user_id = v_uid
     and a.account_type in ('revenue', 'expense')
     and je.entry_date < v_start_of_year;

  v_retained_earnings := v_retained_earnings + v_prior_years_profit;

  -- Pembanding Laba Ditahan & Laba Tahun Berjalan (tanpa estimasi)
  if v_has_compare then
    v_cmp_year := extract(year from p_compare_as_of)::int;
    v_cmp_start_of_year := make_date(v_cmp_year, 1, 1);

    select coalesce(sum(case when a.code = '3-2000' and je.entry_date <= p_compare_as_of then jl.credit - jl.debit else 0 end), 0)
      into v_cmp_retained_earnings
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id
      join public.accounts a on a.id = jl.account_id
     where je.user_id = v_uid;

    select coalesce(sum(case when a.account_type = 'revenue' then jl.credit - jl.debit else jl.credit - jl.debit end), 0)
      into v_cmp_prior_years_profit
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id
      join public.accounts a on a.id = jl.account_id
     where je.user_id = v_uid
       and a.account_type in ('revenue', 'expense')
       and je.entry_date < v_cmp_start_of_year;

    v_cmp_retained_earnings := v_cmp_retained_earnings + v_cmp_prior_years_profit;

    select coalesce(sum(case when a.account_type = 'revenue' then jl.credit - jl.debit else jl.credit - jl.debit end), 0)
      into v_cmp_ytd_profit
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id
      join public.accounts a on a.id = jl.account_id
     where je.user_id = v_uid
       and a.account_type in ('revenue', 'expense')
       and je.entry_date between v_cmp_start_of_year and p_compare_as_of;
  end if;

  v_equity_rows := v_equity_rows || jsonb_build_object(
    'account_id', null, 'code', '3-2000', 'name', 'Laba Ditahan',
    'amount', v_retained_earnings, 'compare_amount', case when v_has_compare then v_cmp_retained_earnings else null end
  );
  v_equity_total := v_equity_total + v_retained_earnings;
  if v_has_compare then
    v_cmp_equity_tot := coalesce(v_cmp_equity_tot, 0) + v_cmp_retained_earnings;
  end if;

  -- Laba Tahun Berjalan (1 Januari tahun p_as_of s.d. p_as_of)
  select coalesce(sum(case when a.account_type = 'revenue' then jl.credit - jl.debit else jl.credit - jl.debit end), 0)
    into v_ytd_profit
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
   where je.user_id = v_uid
     and a.account_type in ('revenue', 'expense')
     and je.entry_date between v_start_of_year and p_as_of;

  -- Bila estimasi diterapkan, kurangi Laba Tahun Berjalan sebesar v_prov_diff
  if v_prov_applied then
    v_ytd_profit := v_ytd_profit - v_prov_diff;
  end if;

  v_equity_rows := v_equity_rows || jsonb_build_object(
    'account_id', null, 'code', null, 'name', 'Laba Tahun Berjalan',
    'amount', v_ytd_profit, 'compare_amount', case when v_has_compare then v_cmp_ytd_profit else null end
  );
  v_equity_total := v_equity_total + v_ytd_profit;
  if v_has_compare then
    v_cmp_equity_tot := coalesce(v_cmp_equity_tot, 0) + v_cmp_ytd_profit;
  end if;

  -- 5. Totals & Balance check
  v_total_assets := v_curr_assets_total + v_fixed_assets_total;
  v_total_liab_equity := v_liab_total + v_equity_total;
  v_diff := v_total_assets - v_total_liab_equity;
  v_balanced := (abs(v_diff) < 1);

  v_working_capital := v_curr_assets_total - v_liab_total;
  if v_liab_total > 0 then
    v_current_ratio := round((v_curr_assets_total / v_liab_total), 2);
  end if;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'as_of', p_as_of,
      'compare_as_of', p_compare_as_of,
      'status', v_status,
      'locked_through', v_settings.locked_through,
      'provisional', jsonb_build_object('applied', v_prov_applied, 'diff', v_prov_diff),
      'balanced', v_balanced
    ),
    'sections', jsonb_build_array(
      jsonb_build_object('key', 'current_assets', 'label', 'Aset Lancar', 'rows', v_curr_assets_rows, 'total', v_curr_assets_total, 'compare_total', v_cmp_curr_assets_tot),
      jsonb_build_object('key', 'fixed_assets', 'label', 'Aset Tetap', 'rows', v_fixed_assets_rows, 'total', v_fixed_assets_total, 'compare_total', v_cmp_fixed_assets_tot),
      jsonb_build_object('key', 'liabilities', 'label', 'Liabilitas', 'rows', v_liab_rows, 'total', v_liab_total, 'compare_total', v_cmp_liab_tot),
      jsonb_build_object('key', 'equity', 'label', 'Ekuitas', 'rows', v_equity_rows, 'total', v_equity_total, 'compare_total', v_cmp_equity_tot)
    ),
    'totals', jsonb_build_object(
      'total_assets', v_total_assets,
      'compare_total_assets', case when v_has_compare then coalesce(v_cmp_curr_assets_tot, 0) + coalesce(v_cmp_fixed_assets_tot, 0) else null end,
      'total_liabilities', v_liab_total,
      'compare_total_liabilities', case when v_has_compare then v_cmp_liab_tot else null end,
      'total_equity', v_equity_total,
      'compare_total_equity', case when v_has_compare then v_cmp_equity_tot else null end,
      'total_liabilities_and_equity', v_total_liab_equity,
      'compare_total_liabilities_and_equity', case when v_has_compare then coalesce(v_cmp_liab_tot, 0) + coalesce(v_cmp_equity_tot, 0) else null end,
      'difference', v_diff,
      'working_capital', v_working_capital,
      'current_ratio', v_current_ratio
    )
  );
end;
$$;

revoke execute on function public.get_balance_sheet(date, date, boolean) from public, anon;
grant  execute on function public.get_balance_sheet(date, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: get_accounting_checks
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

  return v_checks;
end;
$$;

revoke execute on function public.get_accounting_checks(date) from public, anon;
grant  execute on function public.get_accounting_checks(date) to authenticated;
