-- ============================================================================
-- MIGRATION: 20261019090000_po_batches_core.sql
-- FASE 1a: Fondasi Batch PO (po_batches, po_batch_events, po_week_info, ensure_po_batch)
-- ============================================================================

-- 1. TABEL po_batches
create table if not exists public.po_batches (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  code                varchar(20) not null,
  period_year         integer not null,
  period_month        integer not null check (period_month between 1 and 12),
  seq_in_month        integer not null check (seq_in_month between 1 and 5),
  start_date          date not null,
  end_date            date not null,
  status              varchar(10) not null default 'open' check (status in ('open', 'closed')),
  closed_at           timestamptz,
  closed_by           uuid references auth.users(id),
  close_early_reason  text,
  close_note          text,
  close_snapshot      jsonb,
  is_legacy           boolean not null default false,
  reopen_count        integer not null default 0,
  created_at          timestamptz not null default now(),

  constraint po_batches_start_monday_ck check (extract(isodow from start_date) = 1),
  constraint po_batches_end_sunday_ck check (end_date = start_date + 6),
  constraint po_batches_user_start_uniq unique (user_id, start_date),
  constraint po_batches_user_seq_uniq unique (user_id, period_year, period_month, seq_in_month)
);

create index if not exists idx_po_batches_user_dates on public.po_batches (user_id, start_date, end_date);
create index if not exists idx_po_batches_user_period on public.po_batches (user_id, period_year, period_month);
create index if not exists idx_po_batches_status on public.po_batches (user_id, status);

-- 2. TABEL po_batch_events (Audit Trail)
create table if not exists public.po_batch_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  po_batch_id   uuid not null references public.po_batches(id) on delete cascade,
  event         varchar(30) not null check (event in ('opened', 'closed', 'reopened', 'order_deleted_after_close', 'rekap_bulk')),
  reason        text,
  payload       jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_po_batch_events_batch on public.po_batch_events (po_batch_id);
create index if not exists idx_po_batch_events_user on public.po_batch_events (user_id);

-- 3. RLS & GRANTS
alter table public.po_batches enable row level security;
alter table public.po_batch_events enable row level security;

-- Policy Select Only untuk authenticated (auth.uid() = user_id)
drop policy if exists "po_batches_select_policy" on public.po_batches;
create policy "po_batches_select_policy"
  on public.po_batches
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "po_batch_events_select_policy" on public.po_batch_events;
create policy "po_batch_events_select_policy"
  on public.po_batch_events
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Hak akses tabel: SELECT saja untuk authenticated; tulis via SECURITY DEFINER RPC
revoke all on table public.po_batches from public, anon;
grant select on table public.po_batches to authenticated;

revoke all on table public.po_batch_events from public, anon;
grant select on table public.po_batch_events to authenticated;

-- 4. FUNGSI po_week_info (Satu-satunya sumber kebenaran aturan tanggal & bulan PO)
create or replace function public.po_week_info(p_date date)
returns table (
  start_date   date,
  end_date     date,
  period_year  integer,
  period_month integer,
  seq_in_month integer,
  code         varchar
)
language plpgsql
immutable
as $$
declare
  v_start_date   date;
  v_end_date     date;
  v_wednesday    date;
  v_year         integer;
  v_month        integer;
  v_seq          integer;
  v_code         varchar;
begin
  if p_date is null then
    raise exception 'Tanggal tidak boleh null' using errcode = '22004';
  end if;

  -- Hari Senin minggu tersebut (extract isodow: 1 = Senin, 7 = Minggu)
  v_start_date := p_date - (extract(isodow from p_date)::integer - 1);
  -- Hari Minggu penutup
  v_end_date   := v_start_date + 6;
  -- Hari Rabu sebagai jangkar kepemilikan bulan PO (Senin + 2)
  v_wednesday  := v_start_date + 2;

  v_year  := extract(year from v_wednesday)::integer;
  v_month := extract(month from v_wednesday)::integer;
  -- Nomor urut PO dalam bulan: (hari_Rabu - 1) / 7 + 1
  v_seq   := (extract(day from v_wednesday)::integer - 1) / 7 + 1;

  v_code  := 'PO-' || v_year::text || lpad(v_month::text, 2, '0') || '-' || v_seq::text;

  return query select v_start_date, v_end_date, v_year, v_month, v_seq, v_code;
end;
$$;

revoke execute on function public.po_week_info(date) from public, anon;
grant execute on function public.po_week_info(date) to authenticated;

-- 5. RPC ensure_po_batch (Lazy batch creation, aman race condition)
create or replace function public.ensure_po_batch(
  p_date date default (now() at time zone 'Asia/Jakarta')::date
)
returns public.po_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_info      record;
  v_batch     public.po_batches;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_date is null then
    p_date := (now() at time zone 'Asia/Jakarta')::date;
  end if;

  select * into v_info from public.po_week_info(p_date);

  -- Concurrency-safe: ON CONFLICT DO NOTHING
  insert into public.po_batches (
    user_id,
    code,
    period_year,
    period_month,
    seq_in_month,
    start_date,
    end_date,
    status
  )
  values (
    v_user_id,
    v_info.code,
    v_info.period_year,
    v_info.period_month,
    v_info.seq_in_month,
    v_info.start_date,
    v_info.end_date,
    'open'
  )
  on conflict (user_id, start_date) do nothing
  returning * into v_batch;

  if found and v_batch.id is not null then
    insert into public.po_batch_events (
      user_id,
      po_batch_id,
      event,
      reason,
      payload
    )
    values (
      v_user_id,
      v_batch.id,
      'opened',
      'Dibuat otomatis oleh sistem',
      jsonb_build_object(
        'trigger_date', p_date,
        'code', v_info.code,
        'start_date', v_info.start_date,
        'end_date', v_info.end_date
      )
    );
  else
    select * into v_batch
    from public.po_batches
    where user_id = v_user_id
      and start_date = v_info.start_date;
  end if;

  return v_batch;
end;
$$;

revoke execute on function public.ensure_po_batch(date) from public, anon;
grant execute on function public.ensure_po_batch(date) to authenticated;
