-- =========================================================================
-- Migration: Opening Balance, Trial Balance, General Ledger (Fase A - Langkah 5)
-- =========================================================================
-- Menambahkan:
-- 1. RPC suggest_opening_balance(p_books_start_date)
-- 2. RPC post_opening_balance(p_date, p_lines)
-- 3. RPC get_trial_balance(p_from, p_to)
-- 4. RPC get_general_ledger(p_account_id, p_from, p_to)
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. suggest_opening_balance
--    Menghitung usulan saldo awal berdasarkan data yang ada:
--    - Kas/Bank: saldo awal + transaksi sebelum books_start_date
--    - Uang Muka Karyawan: cash_advances outstanding
--    - Persediaan: rumus stok efektif (GUDANG_DAN_PURCHASING.md par.3.3) x harga beli
--    - Uang Muka Pelanggan: order_payments - order_deposit_releases (order belum completed)
--    Mengembalikan jsonb array: [{account_id, code, name, suggested_debit, suggested_credit, note}]
-- ---------------------------------------------------------------------------
create or replace function public.suggest_opening_balance(p_books_start_date date)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_uid                 uuid := auth.uid();
  v_result              jsonb := '[]'::jsonb;
  v_kas_bank            numeric;
  v_uang_muka_karyawan  numeric;
  v_persediaan          numeric;
  v_uang_muka_pelanggan numeric;
  v_deposit_released    numeric := 0;
  v_kas_id              uuid;
  v_bank_id             uuid;
  v_1400_id             uuid;
  v_1500_id             uuid;
  v_2200_id             uuid;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  -- Saldo kas + bank gabungan dari buku kas lama sebelum books_start_date
  -- (company_settings.saldo_awal + Sigma income - Sigma expense)
  select
    coalesce(cs.saldo_awal, 0)
    + coalesce((select sum(amount) from public.transactions t
                 where t.user_id = v_uid and t.type = 'income'
                   and t.transaction_date < p_books_start_date), 0)
    - coalesce((select sum(amount) from public.transactions t
                 where t.user_id = v_uid and t.type = 'expense'
                   and t.transaction_date < p_books_start_date), 0)
  into v_kas_bank
  from public.company_settings cs
  where cs.user_id = v_uid;

  -- Uang muka karyawan purchasing yang masih outstanding
  select coalesce(sum(amount), 0) into v_uang_muka_karyawan
    from public.cash_advances
   where user_id = v_uid and status = 'outstanding';

  -- Persediaan: stok efektif x harga beli material (GUDANG_DAN_PURCHASING.md par.3.3)
  select coalesce(sum(
    coalesce(
      (select sum(mc.stock_qty) from public.material_colors mc
        where mc.material_id = m.id and mc.is_active = true
        having count(mc.id) > 0),
      m.stock_qty,
      0
    ) * coalesce(m.price, 0)
  ), 0) into v_persediaan
  from public.materials m
  where m.user_id = v_uid;

  -- Uang muka pelanggan: Sigma (order_payments - order_deposit_releases) untuk order belum completed
  select coalesce(sum(op.amount), 0) into v_uang_muka_pelanggan
    from public.order_payments op
    join public.orders o on o.id = op.order_id
   where o.user_id = v_uid
     and o.production_status <> 'completed';

  -- Kurangi pelepasan DP jika tabel order_deposit_releases sudah ada
  if to_regclass('public.order_deposit_releases') is not null then
    execute $q$
      select coalesce(sum(r.amount), 0)
        from public.order_deposit_releases r
        join public.orders o on o.id = r.order_id
       where o.user_id = $1
         and o.production_status <> 'completed'
    $q$ into v_deposit_released using v_uid;

    v_uang_muka_pelanggan := greatest(v_uang_muka_pelanggan - coalesce(v_deposit_released, 0), 0);
  end if;

  -- Ambil ID akun
  select id into v_kas_id  from public.accounts where user_id = v_uid and code = '1-1100' limit 1;
  select id into v_bank_id from public.accounts where user_id = v_uid and code = '1-1200' limit 1;
  select id into v_1400_id from public.accounts where user_id = v_uid and code = '1-1400' limit 1;
  select id into v_1500_id from public.accounts where user_id = v_uid and code = '1-1500' limit 1;
  select id into v_2200_id from public.accounts where user_id = v_uid and code = '2-1200' limit 1;

  -- Bangun hasil
  v_result := jsonb_build_array(
    jsonb_build_object(
      'account_id', v_bank_id, 'code', '1-1200', 'name', 'Bank',
      'suggested_debit', greatest(v_kas_bank, 0), 'suggested_credit', 0,
      'note', 'Saldo kas+bank gabungan - pisahkan ke Kas dan Bank sesuai kondisi nyata'
    ),
    jsonb_build_object(
      'account_id', v_1400_id, 'code', '1-1400', 'name', 'Uang Muka Karyawan (Purchasing)',
      'suggested_debit', v_uang_muka_karyawan, 'suggested_credit', 0,
      'note', 'Uang muka karyawan yang masih outstanding'
    ),
    jsonb_build_object(
      'account_id', v_1500_id, 'code', '1-1500', 'name', 'Persediaan Bahan Baku',
      'suggested_debit', v_persediaan, 'suggested_credit', 0,
      'note', 'Stok efektif x harga beli terakhir'
    ),
    jsonb_build_object(
      'account_id', v_2200_id, 'code', '2-1200', 'name', 'Uang Muka Pelanggan',
      'suggested_debit', 0, 'suggested_credit', v_uang_muka_pelanggan,
      'note', 'Sigma pembayaran order yang belum dikirim dikurangi pelepasan DP'
    )
  );

  return v_result;
end;
$$;

revoke execute on function public.suggest_opening_balance(date) from public, anon;
grant  execute on function public.suggest_opening_balance(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. post_opening_balance
--    Memposting satu jurnal opening_balance; Laba Ditahan (3-2000) jadi penyeimbang.
--    p_lines: jsonb array [{account_id, debit, credit, memo}]
--    (tanpa akun 3-2000 - dihitung otomatis sebagai penyeimbang)
-- ---------------------------------------------------------------------------
create or replace function public.post_opening_balance(
  p_date  date,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_uid          uuid := auth.uid();
  v_settings     record;
  v_entry_id     uuid;
  v_entry_no     varchar;
  v_line         jsonb;
  v_line_no      smallint := 1;
  v_acct         record;
  v_sum_debit    numeric := 0;
  v_sum_credit   numeric := 0;
  v_balance_diff numeric;
  v_laba_acct_id uuid;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  -- Cek hanya boleh satu jurnal opening_balance
  if exists (
    select 1 from public.journal_entries
     where user_id = v_uid and source_type = 'opening_balance'
  ) then
    raise exception 'Saldo awal sudah pernah diposting. Balik jurnal lama sebelum memposting ulang.'
      using errcode = 'P0001';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;

  if v_settings.enabled is not true then
    raise exception 'Akuntansi belum diaktifkan. Jalankan init_accounting terlebih dahulu.'
      using errcode = 'P0001';
  end if;

  if p_date is distinct from v_settings.books_start_date then
    raise exception 'Tanggal saldo awal harus sama dengan tanggal mulai pembukuan (%)', v_settings.books_start_date
      using errcode = 'P0001';
  end if;

  if jsonb_array_length(p_lines) < 1 then
    raise exception 'Saldo awal minimal harus memiliki 1 baris' using errcode = 'P0001';
  end if;

  -- Validasi dan hitung total
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select * into v_acct
      from public.accounts
     where id = (v_line->>'account_id')::uuid and user_id = v_uid;

    if not found then
      raise exception 'Akun % tidak ditemukan', v_line->>'account_id' using errcode = 'P0001';
    end if;

    v_sum_debit  := v_sum_debit  + coalesce((v_line->>'debit')::numeric, 0);
    v_sum_credit := v_sum_credit + coalesce((v_line->>'credit')::numeric, 0);
  end loop;

  -- Cari akun 3-2000 Laba Ditahan (penyeimbang)
  select id into v_laba_acct_id from public.accounts
   where user_id = v_uid and code = '3-2000' limit 1;

  if v_laba_acct_id is null then
    raise exception 'Akun 3-2000 (Laba Ditahan) tidak ditemukan. Jalankan init_accounting terlebih dahulu.'
      using errcode = 'P0001';
  end if;

  v_balance_diff := v_sum_debit - v_sum_credit; -- positif: butuh kredit penyeimbang; negatif: butuh debit

  v_entry_no := public.next_journal_entry_no(v_uid, p_date);

  insert into public.journal_entries (user_id, entry_no, entry_date, description, source_type)
  values (v_uid, v_entry_no, p_date, 'Saldo Awal per ' || to_char(p_date, 'DD Mon YYYY'), 'opening_balance')
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_entry_id,
      (v_line->>'account_id')::uuid,
      coalesce((v_line->>'debit')::numeric, 0),
      coalesce((v_line->>'credit')::numeric, 0),
      coalesce(v_line->>'memo', 'Saldo awal'),
      v_line_no
    );
    v_line_no := v_line_no + 1;
  end loop;

  -- Tambah baris penyeimbang Laba Ditahan jika perlu
  if v_balance_diff <> 0 then
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_entry_id, v_laba_acct_id,
      case when v_balance_diff < 0 then abs(v_balance_diff) else 0 end,
      case when v_balance_diff > 0 then v_balance_diff else 0 end,
      'Laba Ditahan (penyeimbang otomatis)',
      v_line_no
    );
  end if;

  return v_entry_id;
end;
$$;

revoke execute on function public.post_opening_balance(date, jsonb) from public, anon;
grant  execute on function public.post_opening_balance(date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_trial_balance
--    Neraca Saldo: saldo awal, mutasi debit, mutasi kredit, saldo akhir per akun.
--    p_from: awal periode (inklusif); p_to: akhir periode (inklusif).
--    Catatan: TIDAK menyaring is_active = true agar akun nonaktif bermutasi tetap masuk
--    dan total neraca saldo selalu seimbang.
-- ---------------------------------------------------------------------------
create or replace function public.get_trial_balance(
  p_from date,
  p_to   date
)
returns table (
  account_id      uuid,
  code            varchar,
  name            varchar,
  account_type    varchar,
  report_group    varchar,
  opening_debit   numeric,
  opening_credit  numeric,
  period_debit    numeric,
  period_credit   numeric,
  closing_debit   numeric,
  closing_credit  numeric
)
language sql
security definer set search_path = public
stable
as $$
  with acct as (
    select a.id, a.code, a.name, a.account_type, a.report_group
      from public.accounts a
     where a.user_id = auth.uid()
  ),
  opening as (
    select jl.account_id,
           coalesce(sum(jl.debit),  0) as open_dr,
           coalesce(sum(jl.credit), 0) as open_cr
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id
     where je.user_id = auth.uid()
       and je.entry_date < p_from
     group by jl.account_id
  ),
  period as (
    select jl.account_id,
           coalesce(sum(jl.debit),  0) as per_dr,
           coalesce(sum(jl.credit), 0) as per_cr
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id
     where je.user_id = auth.uid()
       and je.entry_date between p_from and p_to
     group by jl.account_id
  )
  select
    a.id,
    a.code,
    a.name,
    a.account_type,
    a.report_group,
    coalesce(o.open_dr, 0)  as opening_debit,
    coalesce(o.open_cr, 0)  as opening_credit,
    coalesce(p.per_dr, 0)   as period_debit,
    coalesce(p.per_cr, 0)   as period_credit,
    coalesce(o.open_dr, 0) + coalesce(p.per_dr, 0) as closing_debit,
    coalesce(o.open_cr, 0) + coalesce(p.per_cr, 0) as closing_credit
  from acct a
  left join opening o on o.account_id = a.id
  left join period  p on p.account_id = a.id
  where coalesce(o.open_dr, 0) + coalesce(o.open_cr, 0)
      + coalesce(p.per_dr,  0) + coalesce(p.per_cr,  0) > 0
  order by a.code;
$$;

revoke execute on function public.get_trial_balance(date, date) from public, anon;
grant  execute on function public.get_trial_balance(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. get_general_ledger
--    Buku Besar: mutasi + saldo berjalan untuk satu akun.
-- ---------------------------------------------------------------------------
create or replace function public.get_general_ledger(
  p_account_id uuid,
  p_from       date,
  p_to         date
)
returns table (
  journal_entry_id uuid,
  entry_no         varchar,
  entry_date       date,
  description      text,
  source_type      varchar,
  memo             text,
  debit            numeric,
  credit           numeric,
  running_balance  numeric
)
language sql
security definer set search_path = public
stable
as $$
  with opening as (
    select coalesce(sum(jl.debit - jl.credit), 0) as balance
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.entry_id
     where je.user_id = auth.uid()
       and jl.account_id = p_account_id
       and je.entry_date < p_from
  ),
  lines as (
    select
      je.id       as journal_entry_id,
      je.entry_no,
      je.entry_date,
      je.description,
      je.source_type,
      jl.memo,
      jl.debit,
      jl.credit,
      row_number() over (order by je.entry_date, je.created_at, jl.line_no) as rn
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.entry_id
   where je.user_id = auth.uid()
     and jl.account_id = p_account_id
     and je.entry_date between p_from and p_to
  )
  select
    l.journal_entry_id,
    l.entry_no,
    l.entry_date,
    l.description,
    l.source_type,
    l.memo,
    l.debit,
    l.credit,
    (select o.balance from opening o) + sum(l.debit - l.credit) over (order by l.rn) as running_balance
  from lines l
  order by l.rn;
$$;

revoke execute on function public.get_general_ledger(uuid, date, date) from public, anon;
grant  execute on function public.get_general_ledger(uuid, date, date) to authenticated;
