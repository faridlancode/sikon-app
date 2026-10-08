-- =========================================================================
-- Migration: Accounting Journal Core (Fase A - Langkah 2)
-- =========================================================================
-- Menambahkan:
-- 1. Tabel public.journal_entries
-- 2. Tabel public.journal_lines
-- 3. Constraint trigger trg_journal_balanced (deferred, cek Sigma debit = Sigma kredit)
-- 4. RPC post_journal_entry   -- posting jurnal manual
-- 5. RPC reverse_journal_entry -- membalik jurnal manual
-- 6. Revoke hak INSERT/UPDATE/DELETE langsung dari authenticated
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. TABEL journal_entries
-- ---------------------------------------------------------------------------
create table if not exists public.journal_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  entry_no      varchar(20)  not null,
  entry_date    date         not null,
  description   text         not null,
  source_type   varchar(30)  not null,
  source_id     uuid         null,
  reverses_entry_id uuid     null references public.journal_entries(id) on delete set null,
  created_at    timestamptz  not null default now(),

  constraint journal_entries_user_id_entry_no_key unique (user_id, entry_no),
  constraint journal_entries_source_type_check check (source_type in (
    ''manual'', ''transaction'', ''opening_balance'',
    ''order_revenue'', ''order_forfeit'',
    ''payroll_split'', ''inventory_adjustment'',
    ''depreciation'', ''asset_disposal'', ''reversal''
  ))
);

comment on table  public.journal_entries                     is ''Jurnal Umum — satu baris per entri jurnal'';
comment on column public.journal_entries.entry_no            is ''Nomor jurnal: JU-YYYYMM-NNNN, dihitung dengan advisory lock di dalam RPC'';
comment on column public.journal_entries.source_type         is ''Asal jurnal: manual / transaction / order_revenue / dst.'';
comment on column public.journal_entries.source_id           is ''UUID sumber (mis. transactions.id); tanpa FK supaya sumber bisa dihapus'';
comment on column public.journal_entries.reverses_entry_id   is ''Jurnal yang dibalik oleh entri ini (hanya ada pada source_type=reversal)'';

create unique index if not exists idx_journal_entries_source_unique
  on public.journal_entries (user_id, source_type, source_id)
  where source_type in (''transaction'', ''order_revenue'', ''order_forfeit'', ''payroll_split'');

create index if not exists idx_journal_entries_user_date
  on public.journal_entries (user_id, entry_date);

create index if not exists idx_journal_entries_user_type
  on public.journal_entries (user_id, source_type);

alter table public.journal_entries enable row level security;

drop policy if exists "Select own journal_entries"  on public.journal_entries;
drop policy if exists "Manage own journal_entries"  on public.journal_entries;

create policy "Select own journal_entries" on public.journal_entries
  for select using (auth.uid() = user_id);

grant select on table public.journal_entries to authenticated;
revoke insert, update, delete on table public.journal_entries from authenticated;
grant all on table public.journal_entries to service_role;

-- ---------------------------------------------------------------------------
-- 2. TABEL journal_lines
-- ---------------------------------------------------------------------------
create table if not exists public.journal_lines (
  id         uuid    primary key default gen_random_uuid(),
  entry_id   uuid    not null references public.journal_entries(id) on delete cascade,
  account_id uuid    not null references public.accounts(id),
  debit      numeric not null default 0,
  credit     numeric not null default 0,
  memo       text    null,
  line_no    smallint not null,
  created_at timestamptz not null default now(),

  constraint journal_lines_debit_check  check (debit  >= 0),
  constraint journal_lines_credit_check check (credit >= 0),
  constraint journal_lines_one_side_check check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);

comment on table  public.journal_lines             is ''Baris jurnal (sisi debit/kredit) dari sebuah journal_entry'';
comment on column public.journal_lines.account_id  is ''FK ke accounts; NO ACTION default (hapus akun ditolak bila ada journal_lines)'';
comment on column public.journal_lines.line_no     is ''Urutan baris dalam satu jurnal (1-based)'';

create index if not exists idx_journal_lines_entry
  on public.journal_lines (entry_id);

create index if not exists idx_journal_lines_account
  on public.journal_lines (account_id);

alter table public.journal_lines enable row level security;

drop policy if exists "Select own journal_lines"  on public.journal_lines;
drop policy if exists "Manage own journal_lines"  on public.journal_lines;

create policy "Select own journal_lines" on public.journal_lines
  for select using (
    exists (
      select 1 from public.journal_entries je
      where je.id = entry_id and je.user_id = auth.uid()
    )
  );

grant select on table public.journal_lines to authenticated;
revoke insert, update, delete on table public.journal_lines from authenticated;
grant all on table public.journal_lines to service_role;

-- ---------------------------------------------------------------------------
-- 3. CONSTRAINT TRIGGER trg_journal_balanced (deferred initially deferred)
-- ---------------------------------------------------------------------------
create or replace function public.check_journal_balanced()
returns trigger language plpgsql
security definer set search_path = public as $$
declare
  v_sum_debit  numeric;
  v_sum_credit numeric;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_sum_debit, v_sum_credit
    from public.journal_lines
   where entry_id = coalesce(new.entry_id, old.entry_id);

  if v_sum_debit <> v_sum_credit then
    raise exception
      ''Jurnal tidak seimbang (entry_id %): total debit % <> total kredit %'',
      coalesce(new.entry_id, old.entry_id), v_sum_debit, v_sum_credit
      using errcode = ''P0001'';
  end if;
  return null;
end;
$$;

revoke execute on function public.check_journal_balanced() from public, anon, authenticated;

drop trigger if exists trg_journal_balanced on public.journal_lines;
create constraint trigger trg_journal_balanced
  after insert or update or delete on public.journal_lines
  deferrable initially deferred
  for each row execute function public.check_journal_balanced();

-- ---------------------------------------------------------------------------
-- 4. HELPER: next_journal_entry_no (advisory lock per user)
-- ---------------------------------------------------------------------------
create or replace function public.next_journal_entry_no(
  p_user_id uuid,
  p_date    date
)
returns varchar
language plpgsql
security definer set search_path = public as $$
declare
  v_ym   text;
  v_seq  int;
  v_lock bigint;
begin
  v_ym   := to_char(p_date, ''YYYYMM'');
  v_lock := (''x'' || substr(replace(p_user_id::text, ''-'', ''''), 1, 15))::bit(60)::bigint;
  perform pg_advisory_xact_lock(v_lock);

  select coalesce(max(
    (regexp_match(entry_no, ''^JU-\d{6}-(\d+)$''))[1]::int
  ), 0) + 1
    into v_seq
    from public.journal_entries
   where user_id = p_user_id
     and entry_no like ''JU-'' || v_ym || ''-%'';

  return ''JU-'' || v_ym || ''-'' || lpad(v_seq::text, 4, ''0'');
end;
$$;

revoke execute on function public.next_journal_entry_no(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC post_journal_entry
-- ---------------------------------------------------------------------------
create or replace function public.post_journal_entry(
  p_date        date,
  p_description text,
  p_lines       jsonb
)
returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_uid         uuid := auth.uid();
  v_entry_id    uuid;
  v_entry_no    varchar;
  v_line        jsonb;
  v_line_no     smallint := 1;
  v_acct        record;
  v_sum_debit   numeric := 0;
  v_sum_credit  numeric := 0;
  v_settings    record;
begin
  if v_uid is null then
    raise exception ''Tidak terautentikasi'' using errcode = ''42501'';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;

  if v_settings.enabled and v_settings.locked_through is not null
     and p_date <= v_settings.locked_through then
    raise exception
      ''Periode akuntansi sampai % sudah ditutup. Gunakan jurnal koreksi bertanggal setelahnya.'',
      v_settings.locked_through
      using errcode = ''P0001'';
  end if;

  if v_settings.enabled and v_settings.books_start_date is not null
     and p_date < v_settings.books_start_date then
    raise exception
      ''Tanggal % lebih awal dari tanggal mulai pembukuan %. Gunakan saldo awal untuk periode sebelumnya.'',
      p_date, v_settings.books_start_date
      using errcode = ''P0001'';
  end if;

  if jsonb_array_length(p_lines) < 2 then
    raise exception ''Jurnal minimal harus memiliki 2 baris'' using errcode = ''P0001'';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select * into v_acct
      from public.accounts
     where id = (v_line->>''account_id'')::uuid
       and user_id = v_uid;

    if not found then
      raise exception ''Akun % tidak ditemukan atau bukan milik Anda'', v_line->>''account_id''
        using errcode = ''P0001'';
    end if;

    if not v_acct.is_active then
      raise exception ''Akun % (%) tidak aktif dan tidak dapat digunakan dalam jurnal'',
        v_acct.code, v_acct.name
        using errcode = ''P0001'';
    end if;

    v_sum_debit  := v_sum_debit  + coalesce((v_line->>''debit'')::numeric, 0);
    v_sum_credit := v_sum_credit + coalesce((v_line->>''credit'')::numeric, 0);
  end loop;

  if v_sum_debit <> v_sum_credit then
    raise exception
      ''Jurnal tidak seimbang: total debit % tidak sama dengan total kredit %'',
      v_sum_debit, v_sum_credit
      using errcode = ''P0001'';
  end if;

  if v_sum_debit = 0 then
    raise exception ''Jurnal tidak boleh bernilai nol'' using errcode = ''P0001'';
  end if;

  v_entry_no := public.next_journal_entry_no(v_uid, p_date);

  insert into public.journal_entries (user_id, entry_no, entry_date, description, source_type)
  values (v_uid, v_entry_no, p_date, p_description, ''manual'')
  returning id into v_entry_id;

  v_line_no := 1;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (
      v_entry_id,
      (v_line->>''account_id'')::uuid,
      coalesce((v_line->>''debit'')::numeric,  0),
      coalesce((v_line->>''credit'')::numeric, 0),
      v_line->>''memo'',
      v_line_no
    );
    v_line_no := v_line_no + 1;
  end loop;

  return v_entry_id;
end;
$$;

revoke execute on function public.post_journal_entry(date, text, jsonb) from public, anon;
grant  execute on function public.post_journal_entry(date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC reverse_journal_entry
-- ---------------------------------------------------------------------------
create or replace function public.reverse_journal_entry(
  p_entry_id uuid,
  p_reason   text
)
returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_uid          uuid := auth.uid();
  v_orig         record;
  v_rev_id       uuid;
  v_rev_entry_no varchar;
  v_rev_date     date;
  v_settings     record;
  v_line         record;
  v_line_no      smallint := 1;
begin
  if v_uid is null then
    raise exception ''Tidak terautentikasi'' using errcode = ''42501'';
  end if;

  select * into v_orig
    from public.journal_entries
   where id = p_entry_id and user_id = v_uid;

  if not found then
    raise exception ''Jurnal % tidak ditemukan atau bukan milik Anda'', p_entry_id
      using errcode = ''P0001'';
  end if;

  if v_orig.source_type <> ''manual'' then
    raise exception
      ''Hanya jurnal manual yang dapat dibalik dengan cara ini. Jurnal % bertipe "%".'',
      v_orig.entry_no, v_orig.source_type
      using errcode = ''P0001'';
  end if;

  if exists (
    select 1 from public.journal_entries
     where reverses_entry_id = p_entry_id and user_id = v_uid
  ) then
    raise exception ''Jurnal % sudah pernah dibalik'', v_orig.entry_no
      using errcode = ''P0001'';
  end if;

  select * into v_settings from public.accounting_settings where user_id = v_uid;

  v_rev_date := current_date;
  if v_settings.locked_through is not null and v_rev_date <= v_settings.locked_through then
    v_rev_date := v_settings.locked_through + 1;
  end if;

  v_rev_entry_no := public.next_journal_entry_no(v_uid, v_rev_date);

  insert into public.journal_entries (
    user_id, entry_no, entry_date, description,
    source_type, reverses_entry_id
  ) values (
    v_uid, v_rev_entry_no, v_rev_date,
    ''Pembalik: '' || v_orig.entry_no || coalesce('' — '' || p_reason, ''''),
    ''reversal'', p_entry_id
  ) returning id into v_rev_id;

  for v_line in
    select * from public.journal_lines
     where entry_id = p_entry_id
     order by line_no
  loop
    insert into public.journal_lines (entry_id, account_id, debit, credit, memo, line_no)
    values (v_rev_id, v_line.account_id, v_line.credit, v_line.debit, v_line.memo, v_line_no);
    v_line_no := v_line_no + 1;
  end loop;

  return v_rev_id;
end;
$$;

revoke execute on function public.reverse_journal_entry(uuid, text) from public, anon;
grant  execute on function public.reverse_journal_entry(uuid, text) to authenticated;
