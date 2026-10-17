-- =========================================================================
-- SIKon — Accounting Phase R2: Laporan Arus Kas, Perubahan Ekuitas, & Catatan Laporan
-- Migration: 20261018080000_accounting_r2_reports.sql
-- =========================================================================
-- Berisi:
-- 1. get_cash_flow(p_from, p_to, p_compare_from, p_compare_to)
-- 2. get_equity_changes(p_from, p_to, p_include_provisional)
-- 3. get_report_notes(p_as_of)
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC: get_cash_flow (Metode Langsung)
-- ---------------------------------------------------------------------------
create or replace function public.get_cash_flow(
  p_from date,
  p_to date,
  p_compare_from date default null,
  p_compare_to date default null
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
  v_status              text := 'open';
  v_has_compare         boolean := false;
  v_opening_cash        numeric := 0;
  v_closing_cash        numeric := 0;
  v_net_operating       numeric := 0;
  v_net_investing       numeric := 0;
  v_net_financing       numeric := 0;
  v_net_change          numeric := 0;
  v_bs_cash             numeric := 0;

  -- Variabel Pembanding
  v_cmp_opening_cash    numeric;
  v_cmp_closing_cash    numeric;
  v_cmp_net_operating   numeric;
  v_cmp_net_investing   numeric;
  v_cmp_net_financing   numeric;
  v_cmp_net_change      numeric;

  -- Baris Aktivitas Utama
  v_cust_rec            numeric := 0;
  v_inv_pay             numeric := 0;
  v_pay_pay             numeric := 0;
  v_opex_pay            numeric := 0;
  v_emp_adv             numeric := 0;
  v_oth_op              numeric := 0;
  v_ast_buy             numeric := 0;
  v_ast_disp            numeric := 0;
  v_cap_contrib         numeric := 0;
  v_drawings            numeric := 0;
  v_oth_debt            numeric := 0;

  -- Baris Aktivitas Pembanding
  v_cmp_cust_rec        numeric := 0;
  v_cmp_inv_pay         numeric := 0;
  v_cmp_pay_pay         numeric := 0;
  v_cmp_opex_pay        numeric := 0;
  v_cmp_emp_adv         numeric := 0;
  v_cmp_oth_op          numeric := 0;
  v_cmp_ast_buy         numeric := 0;
  v_cmp_ast_disp        numeric := 0;
  v_cmp_cap_contrib     numeric := 0;
  v_cmp_drawings        numeric := 0;
  v_cmp_oth_debt        numeric := 0;

  v_rec                 record;
  v_net_kas             numeric;
  v_act                 text;
  v_line_key            text;
  v_top_non_cash        record;
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

  -- 2. Status periode terkunci
  if v_settings.locked_through is not null and p_to <= v_settings.locked_through then
    v_status := 'locked';
  else
    v_status := 'open';
  end if;

  -- 3. Evaluasi pembanding
  if p_compare_from is not null and p_compare_to is not null
     and v_settings.books_start_date is not null
     and p_compare_from >= v_settings.books_start_date then
    v_has_compare := true;
  end if;

  -- 4. Hitung Kas Awal (Periode Utama)
  -- Saldo akun is_cash < v_actual_from, ditambah jurnal opening_balance bertanggal v_actual_from
  select coalesce(sum(jl.debit - jl.credit), 0) into v_opening_cash
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id
  join public.accounts a on a.id = jl.account_id
  where je.user_id = v_uid
    and a.is_cash is true
    and (
      je.entry_date < v_actual_from
      or (je.entry_date = v_actual_from and je.source_type = 'opening_balance')
    );

  -- 5. Hitung Kas Awal (Pembanding bila ada)
  if v_has_compare then
    select coalesce(sum(jl.debit - jl.credit), 0) into v_cmp_opening_cash
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
    where je.user_id = v_uid
      and a.is_cash is true
      and (
        je.entry_date < p_compare_from
        or (je.entry_date = p_compare_from and je.source_type = 'opening_balance')
      );
  end if;

  -- 6. Loop Jurnal Periode Utama
  for v_rec in
    select je.id, je.entry_date
    from public.journal_entries je
    where je.user_id = v_uid
      and je.entry_date between v_actual_from and p_to
      and je.source_type <> 'opening_balance'
      and exists (
        select 1 from public.journal_lines jl
        join public.accounts a on a.id = jl.account_id
        where jl.entry_id = je.id and a.is_cash is true
      )
  loop
    -- a. Hitung net kas jurnal ini
    select coalesce(sum(jl.debit - jl.credit), 0) into v_net_kas
    from public.journal_lines jl
    join public.accounts a on a.id = jl.account_id
    where jl.entry_id = v_rec.id and a.is_cash is true;

    if v_net_kas = 0 then
      continue; -- Pemindahan Kas<->Bank (net kas nol), bukan arus kas
    end if;

    -- b. Tentukan aktivitas dari baris non-kas (investing > financing > operating)
    if exists (
      select 1 from public.journal_lines jl
      join public.accounts a on a.id = jl.account_id
      where jl.entry_id = v_rec.id
        and a.is_cash is false
        and (a.cash_flow_activity = 'investing' or a.report_group in ('fixed_asset', 'contra_asset'))
    ) then
      v_act := 'investing';
    elsif exists (
      select 1 from public.journal_lines jl
      join public.accounts a on a.id = jl.account_id
      where jl.entry_id = v_rec.id
        and a.is_cash is false
        and (a.cash_flow_activity = 'financing' or a.code in ('3-1000', '3-3000', '2-1300'))
    ) then
      v_act := 'financing';
    else
      v_act := 'operating';
    end if;

    -- c. Ambil akun non-kas dengan mutasi absolut terbesar
    select a.code, a.account_type, a.report_group, a.cash_flow_activity
      into v_top_non_cash
      from public.journal_lines jl
      join public.accounts a on a.id = jl.account_id
     where jl.entry_id = v_rec.id and a.is_cash is false
     order by abs(jl.debit - jl.credit) desc,
              case when a.cash_flow_activity = 'investing' then 1
                   when a.cash_flow_activity = 'financing' then 2 else 3 end,
              a.code asc
     limit 1;

    -- d. Petakan ke baris laporan sesuai §5.3
    if v_act = 'operating' then
      if v_top_non_cash.code in ('2-1200', '1-1300') or v_top_non_cash.account_type = 'revenue' then
        v_cust_rec := v_cust_rec + v_net_kas;
      elsif v_top_non_cash.code = '1-1500' then
        v_inv_pay := v_inv_pay + v_net_kas;
      elsif v_top_non_cash.code in ('5-1100', '6-1000') then
        v_pay_pay := v_pay_pay + v_net_kas;
      elsif v_top_non_cash.code = '1-1400' then
        v_emp_adv := v_emp_adv + v_net_kas;
      elsif v_top_non_cash.account_type = 'expense' then
        v_opex_pay := v_opex_pay + v_net_kas;
      else
        v_oth_op := v_oth_op + v_net_kas;
      end if;
    elsif v_act = 'investing' then
      if v_net_kas < 0 then
        v_ast_buy := v_ast_buy + v_net_kas;
      else
        v_ast_disp := v_ast_disp + v_net_kas;
      end if;
    elsif v_act = 'financing' then
      if v_top_non_cash.code = '3-1000' then
        v_cap_contrib := v_cap_contrib + v_net_kas;
      elsif v_top_non_cash.code = '3-3000' then
        v_drawings := v_drawings + v_net_kas;
      elsif v_top_non_cash.code = '2-1300' then
        v_oth_debt := v_oth_debt + v_net_kas;
      else
        v_cap_contrib := v_cap_contrib + v_net_kas;
      end if;
    end if;
  end loop;

  -- 7. Loop Jurnal Periode Pembanding (bila ada)
  if v_has_compare then
    for v_rec in
      select je.id, je.entry_date
      from public.journal_entries je
      where je.user_id = v_uid
        and je.entry_date between p_compare_from and p_compare_to
        and je.source_type <> 'opening_balance'
        and exists (
          select 1 from public.journal_lines jl
          join public.accounts a on a.id = jl.account_id
          where jl.entry_id = je.id and a.is_cash is true
        )
    loop
      select coalesce(sum(jl.debit - jl.credit), 0) into v_net_kas
      from public.journal_lines jl
      join public.accounts a on a.id = jl.account_id
      where jl.entry_id = v_rec.id and a.is_cash is true;

      if v_net_kas = 0 then
        continue;
      end if;

      if exists (
        select 1 from public.journal_lines jl
        join public.accounts a on a.id = jl.account_id
        where jl.entry_id = v_rec.id
          and a.is_cash is false
          and (a.cash_flow_activity = 'investing' or a.report_group in ('fixed_asset', 'contra_asset'))
      ) then
        v_act := 'investing';
      elsif exists (
        select 1 from public.journal_lines jl
        join public.accounts a on a.id = jl.account_id
        where jl.entry_id = v_rec.id
          and a.is_cash is false
          and (a.cash_flow_activity = 'financing' or a.code in ('3-1000', '3-3000', '2-1300'))
      ) then
        v_act := 'financing';
      else
        v_act := 'operating';
      end if;

      select a.code, a.account_type, a.report_group, a.cash_flow_activity
        into v_top_non_cash
        from public.journal_lines jl
        join public.accounts a on a.id = jl.account_id
       where jl.entry_id = v_rec.id and a.is_cash is false
       order by abs(jl.debit - jl.credit) desc,
                case when a.cash_flow_activity = 'investing' then 1
                     when a.cash_flow_activity = 'financing' then 2 else 3 end,
                a.code asc
       limit 1;

      if v_act = 'operating' then
        if v_top_non_cash.code in ('2-1200', '1-1300') or v_top_non_cash.account_type = 'revenue' then
          v_cmp_cust_rec := v_cmp_cust_rec + v_net_kas;
        elsif v_top_non_cash.code = '1-1500' then
          v_cmp_inv_pay := v_cmp_inv_pay + v_net_kas;
        elsif v_top_non_cash.code in ('5-1100', '6-1000') then
          v_cmp_pay_pay := v_cmp_pay_pay + v_net_kas;
        elsif v_top_non_cash.code = '1-1400' then
          v_cmp_emp_adv := v_cmp_emp_adv + v_net_kas;
        elsif v_top_non_cash.account_type = 'expense' then
          v_cmp_opex_pay := v_cmp_opex_pay + v_net_kas;
        else
          v_cmp_oth_op := v_cmp_oth_op + v_net_kas;
        end if;
      elsif v_act = 'investing' then
        if v_net_kas < 0 then
          v_cmp_ast_buy := v_cmp_ast_buy + v_net_kas;
        else
          v_cmp_ast_disp := v_cmp_ast_disp + v_net_kas;
        end if;
      elsif v_act = 'financing' then
        if v_top_non_cash.code = '3-1000' then
          v_cmp_cap_contrib := v_cmp_cap_contrib + v_net_kas;
        elsif v_top_non_cash.code = '3-3000' then
          v_cmp_drawings := v_cmp_drawings + v_net_kas;
        elsif v_top_non_cash.code = '2-1300' then
          v_cmp_oth_debt := v_cmp_oth_debt + v_net_kas;
        else
          v_cmp_cap_contrib := v_cmp_cap_contrib + v_net_kas;
        end if;
      end if;
    end loop;
  end if;

  -- 8. Hitung Total & Kas Akhir
  v_net_operating := v_cust_rec + v_inv_pay + v_pay_pay + v_opex_pay + v_emp_adv + v_oth_op;
  v_net_investing := v_ast_buy + v_ast_disp;
  v_net_financing := v_cap_contrib + v_drawings + v_oth_debt;
  v_net_change    := v_net_operating + v_net_investing + v_net_financing;
  v_closing_cash  := v_opening_cash + v_net_change;

  if v_has_compare then
    v_cmp_net_operating := v_cmp_cust_rec + v_cmp_inv_pay + v_cmp_pay_pay + v_cmp_opex_pay + v_cmp_emp_adv + v_cmp_oth_op;
    v_cmp_net_investing := v_cmp_ast_buy + v_cmp_ast_disp;
    v_cmp_net_financing := v_cmp_cap_contrib + v_cmp_drawings + v_cmp_oth_debt;
    v_cmp_net_change    := v_cmp_net_operating + v_cmp_net_investing + v_cmp_net_financing;
    v_cmp_closing_cash  := v_cmp_opening_cash + v_cmp_net_change;
  end if;

  -- 9. Rekonsiliasi dengan saldo Kas & Bank Neraca per p_to
  select coalesce(sum(jl.debit - jl.credit), 0) into v_bs_cash
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id
  join public.accounts a on a.id = jl.account_id
  where je.user_id = v_uid
    and a.is_cash is true
    and je.entry_date <= p_to;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'from', v_actual_from,
      'to', p_to,
      'compare_from', case when v_has_compare then p_compare_from else null end,
      'compare_to', case when v_has_compare then p_compare_to else null end,
      'status', v_status,
      'clamped_from_books_start', v_clamped,
      'reconciled', (v_closing_cash = v_bs_cash)
    ),
    'sections', jsonb_build_array(
      jsonb_build_object(
        'key', 'operating',
        'label', 'Arus Kas dari Aktivitas Operasi',
        'rows', jsonb_build_array(
          jsonb_build_object('key', 'customer_receipts', 'name', 'Penerimaan dari pelanggan (bersih setelah pengembalian uang)', 'amount', v_cust_rec, 'compare_amount', case when v_has_compare then v_cmp_cust_rec else null end),
          jsonb_build_object('key', 'inventory_payments', 'name', 'Pembayaran persediaan bahan', 'amount', v_inv_pay, 'compare_amount', case when v_has_compare then v_cmp_inv_pay else null end),
          jsonb_build_object('key', 'payroll_payments', 'name', 'Pembayaran upah dan gaji', 'amount', v_pay_pay, 'compare_amount', case when v_has_compare then v_cmp_pay_pay else null end),
          jsonb_build_object('key', 'opex_payments', 'name', 'Pembayaran beban operasional lain', 'amount', v_opex_pay, 'compare_amount', case when v_has_compare then v_cmp_opex_pay else null end),
          jsonb_build_object('key', 'employee_advances', 'name', 'Uang muka karyawan (purchasing), bersih', 'amount', v_emp_adv, 'compare_amount', case when v_has_compare then v_cmp_emp_adv else null end),
          jsonb_build_object('key', 'other_operating', 'name', 'Lain-lain / belum diklasifikasi', 'amount', v_oth_op, 'compare_amount', case when v_has_compare then v_cmp_oth_op else null end)
        ),
        'total', v_net_operating,
        'compare_total', case when v_has_compare then v_cmp_net_operating else null end
      ),
      jsonb_build_object(
        'key', 'investing',
        'label', 'Arus Kas dari Aktivitas Investasi',
        'rows', jsonb_build_array(
          jsonb_build_object('key', 'asset_purchases', 'name', 'Pembelian aset tetap', 'amount', v_ast_buy, 'compare_amount', case when v_has_compare then v_cmp_ast_buy else null end),
          jsonb_build_object('key', 'asset_disposals', 'name', 'Hasil pelepasan aset tetap', 'amount', v_ast_disp, 'compare_amount', case when v_has_compare then v_cmp_ast_disp else null end)
        ),
        'total', v_net_investing,
        'compare_total', case when v_has_compare then v_cmp_net_investing else null end
      ),
      jsonb_build_object(
        'key', 'financing',
        'label', 'Arus Kas dari Aktivitas Pendanaan',
        'rows', jsonb_build_array(
          jsonb_build_object('key', 'capital_contributions', 'name', 'Setoran modal', 'amount', v_cap_contrib, 'compare_amount', case when v_has_compare then v_cmp_cap_contrib else null end),
          jsonb_build_object('key', 'drawings', 'name', 'Prive', 'amount', v_drawings, 'compare_amount', case when v_has_compare then v_cmp_drawings else null end),
          jsonb_build_object('key', 'other_debts', 'name', 'Penerimaan/pembayaran hutang lain', 'amount', v_oth_debt, 'compare_amount', case when v_has_compare then v_cmp_oth_debt else null end)
        ),
        'total', v_net_financing,
        'compare_total', case when v_has_compare then v_cmp_net_financing else null end
      )
    ),
    'totals', jsonb_build_object(
      'net_operating', v_net_operating,
      'net_investing', v_net_investing,
      'net_financing', v_net_financing,
      'net_change', v_net_change,
      'opening_cash', v_opening_cash,
      'closing_cash', v_closing_cash,
      'compare_net_operating', case when v_has_compare then v_cmp_net_operating else null end,
      'compare_net_investing', case when v_has_compare then v_cmp_net_investing else null end,
      'compare_net_financing', case when v_has_compare then v_cmp_net_financing else null end,
      'compare_net_change', case when v_has_compare then v_cmp_net_change else null end,
      'compare_opening_cash', case when v_has_compare then v_cmp_opening_cash else null end,
      'compare_closing_cash', case when v_has_compare then v_cmp_closing_cash else null end
    )
  );
end;
$$;

revoke execute on function public.get_cash_flow(date, date, date, date) from public, anon;
grant  execute on function public.get_cash_flow(date, date, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC: get_equity_changes
-- ---------------------------------------------------------------------------
create or replace function public.get_equity_changes(
  p_from date,
  p_to date,
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
  v_pnl                 jsonb;
  v_bs_prev             jsonb;
  v_bs_curr             jsonb;
  v_opening_equity      numeric := 0;
  v_net_profit          numeric := 0;
  v_capital_contrib     numeric := 0;
  v_drawings            numeric := 0;
  v_re_adj              numeric := 0;
  v_closing_equity      numeric := 0;
  v_bs_equity           numeric := 0;
  v_reconciled          boolean := false;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    return jsonb_build_object(
      'meta', jsonb_build_object('enabled', false, 'reason', 'Akuntansi belum aktif'),
      'rows', '[]'::jsonb,
      'totals', '{}'::jsonb
    );
  end if;

  -- 1. Clamping dari books_start_date
  if v_settings.books_start_date is not null and p_from < v_settings.books_start_date then
    v_actual_from := v_settings.books_start_date;
    v_clamped := true;
  end if;

  -- 2. Ekuitas Awal Periode:
  -- Bila p_from = books_start_date, ambil dari saldo awal jurnal opening_balance
  -- Bila p_from > books_start_date, ambil dari Total Ekuitas Neraca sehari sebelum p_from (tanpa estimasi)
  if v_actual_from = v_settings.books_start_date then
    select coalesce(sum(jl.credit - jl.debit), 0) into v_opening_equity
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
    join public.accounts a on a.id = jl.account_id
    where je.user_id = v_uid
      and a.account_type = 'equity'
      and je.source_type = 'opening_balance'
      and je.entry_date <= v_actual_from;
  else
    v_bs_prev := public.get_balance_sheet((v_actual_from - interval '1 day')::date, null, false);
    v_opening_equity := coalesce((v_bs_prev->'totals'->>'total_equity')::numeric, 0);
  end if;

  -- 3. Laba Bersih Periode dari get_income_statement (termasuk estimasi bila p_include_provisional aktif)
  v_pnl := public.get_income_statement(v_actual_from, p_to, null, null, p_include_provisional);
  v_net_profit := coalesce((v_pnl->'totals'->>'net_profit')::numeric, 0);

  -- 4. Setoran Modal periode ini (kredit bersih 3-1000 di luar opening_balance)
  select coalesce(sum(jl.credit - jl.debit), 0) into v_capital_contrib
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id
  join public.accounts a on a.id = jl.account_id
  where je.user_id = v_uid
    and a.code = '3-1000'
    and je.source_type <> 'opening_balance'
    and je.entry_date between v_actual_from and p_to;

  -- 5. Prive periode ini (debit bersih 3-3000 disajikan negatif di luar opening_balance)
  select coalesce(-sum(jl.debit - jl.credit), 0) into v_drawings
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id
  join public.accounts a on a.id = jl.account_id
  where je.user_id = v_uid
    and a.code = '3-3000'
    and je.source_type <> 'opening_balance'
    and je.entry_date between v_actual_from and p_to;

  -- 6. Koreksi Laba Ditahan periode ini (mutasi 3-2000 di luar opening_balance)
  select coalesce(sum(jl.credit - jl.debit), 0) into v_re_adj
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id
  join public.accounts a on a.id = jl.account_id
  where je.user_id = v_uid
    and a.code = '3-2000'
    and je.source_type <> 'opening_balance'
    and je.entry_date between v_actual_from and p_to;

  -- 7. Ekuitas Akhir Periode
  v_closing_equity := v_opening_equity + v_net_profit + v_capital_contrib + v_drawings + v_re_adj;

  -- 8. Rekonsiliasi dengan Total Ekuitas Neraca pada p_to (dengan pengaturan estimasi yang sama)
  v_bs_curr := public.get_balance_sheet(p_to, null, p_include_provisional);
  v_bs_equity := coalesce((v_bs_curr->'totals'->>'total_equity')::numeric, 0);
  v_reconciled := (v_closing_equity = v_bs_equity);

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'from', v_actual_from,
      'to', p_to,
      'status', v_pnl->'meta'->>'status',
      'provisional', v_pnl->'meta'->'provisional',
      'clamped_from_books_start', v_clamped,
      'reconciled', v_reconciled
    ),
    'rows', jsonb_build_array(
      jsonb_build_object('key', 'opening_equity', 'label', 'Ekuitas awal periode', 'amount', v_opening_equity),
      jsonb_build_object('key', 'net_profit', 'label', '(+) Laba bersih periode', 'amount', v_net_profit),
      jsonb_build_object('key', 'capital_contributions', 'label', '(+) Setoran modal', 'amount', v_capital_contrib),
      jsonb_build_object('key', 'drawings', 'label', '(−) Prive', 'amount', v_drawings),
      jsonb_build_object('key', 'retained_earnings_adjustments', 'label', '(±) Koreksi Laba Ditahan', 'amount', v_re_adj),
      jsonb_build_object('key', 'closing_equity', 'label', 'Ekuitas akhir periode', 'amount', v_closing_equity)
    ),
    'totals', jsonb_build_object(
      'opening_equity', v_opening_equity,
      'closing_equity', v_closing_equity,
      'balance_sheet_equity', v_bs_equity,
      'difference', v_closing_equity - v_bs_equity
    )
  );
end;
$$;

revoke execute on function public.get_equity_changes(date, date, boolean) from public, anon;
grant  execute on function public.get_equity_changes(date, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: get_report_notes
-- ---------------------------------------------------------------------------
create or replace function public.get_report_notes(p_as_of date)
returns jsonb
language plpgsql
stable
security definer set search_path = public as $$
declare
  v_uid                 uuid := auth.uid();
  v_settings            public.accounting_settings;
  v_snap                public.inventory_valuations;
  v_is_estimate         boolean := false;
  v_snap_date           date;
  v_inv_rows            jsonb := '[]'::jsonb;
  v_inv_total           numeric := 0;

  v_cash_rows           jsonb := '[]'::jsonb;
  v_cash_total          numeric := 0;

  v_adv_cust_rows       jsonb := '[]'::jsonb;
  v_adv_cust_total      numeric := 0;

  v_adv_emp_rows        jsonb := '[]'::jsonb;
  v_adv_emp_total       numeric := 0;

  v_fa_rows             jsonb := '[]'::jsonb;
  v_fa_cost_total       numeric := 0;
  v_fa_accum_total      numeric := 0;
  v_fa_nbv_total        numeric := 0;

  v_liab_rows           jsonb := '[]'::jsonb;
  v_liab_total          numeric := 0;

  v_row                 record;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    return jsonb_build_object(
      'meta', jsonb_build_object('enabled', false, 'reason', 'Akuntansi belum aktif')
    );
  end if;

  -- (a) Kas dan Bank per akun
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'account_id', t.id,
      'code', t.code,
      'name', t.name,
      'amount', t.amount
    ) order by t.code), '[]'::jsonb),
    coalesce(sum(t.amount), 0)
  into v_cash_rows, v_cash_total
  from (
    select
      a.id, a.code, a.name,
      coalesce(sum(jl.debit - jl.credit), 0) as amount
    from public.accounts a
    left join public.journal_lines jl on jl.account_id = a.id
    left join public.journal_entries je on je.id = jl.entry_id and je.user_id = v_uid and je.entry_date <= p_as_of
    where a.user_id = v_uid and a.is_cash is true
    group by a.id, a.code, a.name
  ) t;

  -- (b) Persediaan: rincian per material dari snapshot inventory_valuations terakhir <= p_as_of
  -- bila tidak ada snapshot, dihitung saat ini via acc_inventory_valuation_detail dan is_estimate = true
  select * into v_snap
  from public.inventory_valuations
  where user_id = v_uid and period_end <= p_as_of
  order by period_end desc
  limit 1;

  if v_snap.id is not null and v_snap.detail is not null then
    v_is_estimate := false;
    v_snap_date := v_snap.period_end;
    v_inv_rows := v_snap.detail;
    v_inv_total := v_snap.total_value;
  else
    v_is_estimate := true;
    v_snap_date := null;
    v_inv_rows := public.acc_inventory_valuation_detail(v_uid);
    v_inv_total := public.acc_inventory_value(v_uid);
  end if;

  -- (c) Uang Muka Pelanggan per order (kode order, pelanggan, jumlah bersih) untuk order belum completed
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'order_id', t.id,
      'order_number', t.order_id,
      'customer_name', t.customer_name,
      'deposit_received', t.received,
      'released', t.released,
      'net_advance', t.net_adv
    ) order by t.order_id), '[]'::jsonb),
    coalesce(sum(t.net_adv), 0)
  into v_adv_cust_rows, v_adv_cust_total
  from (
    select
      o.id,
      o.order_id,
      o.customer_name,
      coalesce(sum(op.amount), 0) as received,
      coalesce((select sum(r.amount) from public.order_deposit_releases r where r.order_id = o.id and r.release_date <= p_as_of), 0) as released,
      (coalesce(sum(op.amount), 0) - coalesce((select sum(r.amount) from public.order_deposit_releases r where r.order_id = o.id and r.release_date <= p_as_of), 0)) as net_adv
    from public.orders o
    left join public.order_payments op on op.order_id = o.id and op.payment_date <= p_as_of
    where o.user_id = v_uid
      and o.production_status <> 'completed'
    group by o.id, o.order_id, o.customer_name
    having (coalesce(sum(op.amount), 0) - coalesce((select sum(r.amount) from public.order_deposit_releases r where r.order_id = o.id and r.release_date <= p_as_of), 0)) <> 0
  ) t;

  -- (d) Uang Muka Karyawan per staf (dari cash_advances outstanding)
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'staff_id', t.staff_id,
      'staff_name', t.staff_name,
      'amount', t.tot_amt,
      'count', t.cnt
    ) order by t.staff_name), '[]'::jsonb),
    coalesce(sum(t.tot_amt), 0)
  into v_adv_emp_rows, v_adv_emp_total
  from (
    select
      s.id as staff_id,
      s.name as staff_name,
      sum(ca.amount) as tot_amt,
      count(ca.id) as cnt
    from public.cash_advances ca
    join public.staff s on s.id = ca.staff_id
    where ca.user_id = v_uid
      and ca.status = 'outstanding'
      and ca.date_given <= p_as_of
    group by s.id, s.name
  ) t;

  -- (e) Jadwal Aset Tetap per kelas dari get_fixed_asset_register
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'asset_class', t.asset_class,
      'label', t.label,
      'cost', t.cost,
      'accumulated', t.accumulated,
      'book_value', t.book_value,
      'count', t.cnt
    ) order by t.ord), '[]'::jsonb),
    coalesce(sum(t.cost), 0),
    coalesce(sum(t.accumulated), 0),
    coalesce(sum(t.book_value), 0)
  into v_fa_rows, v_fa_cost_total, v_fa_accum_total, v_fa_nbv_total
  from (
    select
      c.asset_class,
      c.label,
      c.ord,
      coalesce(sum(r.cost), 0) as cost,
      coalesce(sum(r.accumulated), 0) as accumulated,
      coalesce(sum(r.book_value), 0) as book_value,
      count(r.id) as cnt
    from (
      values
        ('equipment', 'Mesin & Peralatan', 1),
        ('vehicle', 'Kendaraan', 2),
        ('furniture', 'Perabot & Perlengkapan', 3),
        ('building', 'Bangunan', 4)
    ) as c(asset_class, label, ord)
    left join public.get_fixed_asset_register(p_as_of) r
      on r.asset_class = c.asset_class and r.status <> 'disposed'
    group by c.asset_class, c.label, c.ord
  ) t;

  -- (f) Saldo Hutang (2-1100 Hutang Usaha & 2-1300 Hutang Lain-lain)
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'account_id', t.id,
      'code', t.code,
      'name', t.name,
      'amount', t.amount
    ) order by t.code), '[]'::jsonb),
    coalesce(sum(t.amount), 0)
  into v_liab_rows, v_liab_total
  from (
    select
      a.id, a.code, a.name,
      coalesce(sum(jl.credit - jl.debit), 0) as amount
    from public.accounts a
    left join public.journal_lines jl on jl.account_id = a.id
    left join public.journal_entries je on je.id = jl.entry_id and je.user_id = v_uid and je.entry_date <= p_as_of
    where a.user_id = v_uid
      and a.code in ('2-1100', '2-1300')
    group by a.id, a.code, a.name
  ) t;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'as_of', p_as_of,
      'enabled', true
    ),
    'cash_and_banks', jsonb_build_object(
      'rows', v_cash_rows,
      'total', v_cash_total
    ),
    'inventories', jsonb_build_object(
      'is_estimate', v_is_estimate,
      'snapshot_date', v_snap_date,
      'rows', v_inv_rows,
      'total', v_inv_total
    ),
    'customer_advances', jsonb_build_object(
      'rows', v_adv_cust_rows,
      'total', v_adv_cust_total
    ),
    'employee_advances', jsonb_build_object(
      'rows', v_adv_emp_rows,
      'total', v_adv_emp_total
    ),
    'fixed_assets', jsonb_build_object(
      'rows', v_fa_rows,
      'totals', jsonb_build_object(
        'cost', v_fa_cost_total,
        'accumulated', v_fa_accum_total,
        'book_value', v_fa_nbv_total
      )
    ),
    'liabilities', jsonb_build_object(
      'rows', v_liab_rows,
      'total', v_liab_total
    )
  );
end;
$$;

revoke execute on function public.get_report_notes(date) from public, anon;
grant  execute on function public.get_report_notes(date) to authenticated;
