-- =========================================================================
-- SIKon — Accounting Phase B3: Tutup Bulan & Penyesuaian Persediaan Periodik
-- Migration: 20261010090000_accounting_period_close_inventory.sql
-- =========================================================================
-- Berisi:
-- 1. Fungsi internal acc_inventory_value(uuid) & acc_inventory_valuation_detail(uuid)
-- 2. Tabel inventory_valuations (RLS select only, revoke insert/update/delete)
-- 3. RPC close_accounting_period(p_period_end date)
-- 4. RPC reopen_accounting_period(p_new_locked_through date)
-- 5. RPC get_close_preview()
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. FUNGSI INTERNAL: acc_inventory_value & acc_inventory_valuation_detail
-- ---------------------------------------------------------------------------
create or replace function public.acc_inventory_value(p_user_id uuid default null)
returns numeric
language plpgsql
security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_val numeric;
begin
  if v_uid is null then return 0; end if;

  select coalesce(sum(
    coalesce(
      (select sum(mc.stock_qty) from public.material_colors mc
        where mc.material_id = m.id and mc.is_active = true
        having count(mc.id) > 0),
      m.stock_qty,
      0
    ) * coalesce(m.price, 0)
  ), 0) into v_val
  from public.materials m
  where m.user_id = v_uid;

  return v_val;
end;
$$;

revoke execute on function public.acc_inventory_value(uuid) from public, anon, authenticated;

create or replace function public.acc_inventory_valuation_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_detail jsonb;
begin
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_detail
  from (
    select
      m.id as material_id,
      m.name as material_name,
      m.unit,
      coalesce(m.price, 0) as unit_price,
      case
        when exists (select 1 from public.material_colors mc where mc.material_id = m.id and mc.is_active = true)
        then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'color_id', mc.id,
            'color_name', mc.color_name,
            'stock_qty', mc.stock_qty,
            'subtotal', mc.stock_qty * coalesce(m.price, 0)
          )), '[]'::jsonb)
          from public.material_colors mc
          where mc.material_id = m.id and mc.is_active = true
        )
        else null
      end as colors,
      coalesce(
        (select sum(mc.stock_qty) from public.material_colors mc where mc.material_id = m.id and mc.is_active = true having count(mc.id) > 0),
        m.stock_qty,
        0
      ) as effective_qty,
      (
        coalesce(
          (select sum(mc.stock_qty) from public.material_colors mc where mc.material_id = m.id and mc.is_active = true having count(mc.id) > 0),
          m.stock_qty,
          0
        ) * coalesce(m.price, 0)
      ) as total_value
    from public.materials m
    where m.user_id = p_user_id
    order by m.name
  ) item;

  return v_detail;
end;
$$;

revoke execute on function public.acc_inventory_valuation_detail(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. TABEL: inventory_valuations
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_end date not null,
  total_value numeric not null,
  detail jsonb,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, period_end)
);

alter table public.inventory_valuations enable row level security;

drop policy if exists "Users can view own inventory valuations" on public.inventory_valuations;
create policy "Users can view own inventory valuations"
  on public.inventory_valuations for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.inventory_valuations from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- 3. RPC: close_accounting_period
-- ---------------------------------------------------------------------------
create or replace function public.close_accounting_period(p_period_end date)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  v_uid            uuid := auth.uid();
  v_settings       public.accounting_settings;
  v_expected       date;
  v_val            numeric := 0;
  v_book_balance   numeric := 0;
  v_diff           numeric := 0;
  v_acct_1500      uuid;
  v_acct_5100      uuid;
  v_entry_no       varchar;
  v_adj_entry_id   uuid;
  v_detail         jsonb;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;
  if v_settings is null or v_settings.enabled is not true then
    raise exception 'Akuntansi belum aktif. Jalankan init_accounting terlebih dahulu.' using errcode = 'P0001';
  end if;

  -- 1. Validasi: harus akhir bulan
  if (date_trunc('month', p_period_end) + interval '1 month - 1 day')::date <> p_period_end then
    raise exception 'Tanggal tutup buku harus merupakan hari terakhir dalam bulan (%)', p_period_end using errcode = 'P0001';
  end if;

  -- 2. Validasi: bulan belum berakhir (p_period_end >= current_date ditolak)
  if p_period_end >= current_date then
    raise exception 'Bulan ini belum berakhir, tutup buku hanya dapat dilakukan setelah akhir bulan terlewati' using errcode = 'P0001';
  end if;

  -- 3. Validasi: bulan berurutan
  if v_settings.locked_through is null then
    v_expected := (date_trunc('month', v_settings.books_start_date) + interval '1 month - 1 day')::date;
    if p_period_end <> v_expected then
      raise exception 'Tutup buku pertama harus untuk bulan mulai pembukuan (%)', v_expected using errcode = 'P0001';
    end if;
  else
    v_expected := (date_trunc('month', v_settings.locked_through + interval '1 day') + interval '1 month - 1 day')::date;
    if p_period_end <> v_expected then
      raise exception 'Tutup buku harus berurutan. Bulan berikutnya yang harus ditutup adalah (%)', v_expected using errcode = 'P0001';
    end if;
  end if;

  -- 4. Ambil akun 1-1500 (Persediaan) dan 5-1000 (HPP Bahan Baku)
  select id into v_acct_1500 from public.accounts where user_id = v_uid and code = '1-1500';
  select id into v_acct_5100 from public.accounts where user_id = v_uid and code = '5-1000';

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

  -- 6. Buat jurnal penyesuaian (bila D <> 0)
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

  -- 8. Kunci periode sampai p_period_end
  update public.accounting_settings
     set locked_through = p_period_end
   where user_id = v_uid;

  return jsonb_build_object(
    'period_end', p_period_end,
    'inventory_value', v_val,
    'inventory_balance_before', v_book_balance,
    'adjustment', v_diff,
    'adjustment_entry_id', v_adj_entry_id,
    'locked_through', p_period_end
  );
end;
$$;

revoke execute on function public.close_accounting_period(date) from public, anon;
grant  execute on function public.close_accounting_period(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: reopen_accounting_period
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
-- 5. RPC: get_close_preview
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
      'adjustment', 0
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

  return jsonb_build_object(
    'can_close', v_can_close,
    'reason', v_reason,
    'next_period_end', v_expected,
    'locked_through', v_settings.locked_through,
    'inventory_balance', v_book_balance,
    'inventory_value', v_val,
    'adjustment', v_diff
  );
end;
$$;

revoke execute on function public.get_close_preview() from public, anon;
grant  execute on function public.get_close_preview() to authenticated;
