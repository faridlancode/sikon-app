-- =========================================================================
-- Migration: Document Counters & Generator (Fase 1 - Dokumen Order: M1)
-- =========================================================================
-- Menambahkan:
-- 1. Tabel public.document_counters (penghitung nomor per user, tipe, dan YYYYMM)
-- 2. Fungsi internal public.generate_document_no(p_user_id, p_doc_type, p_date)
--    Format nomor: PREFIX-YYYYMM-NNNN (reset per bulan kalender sesuai tanggal dokumen)
--    Fungsi internal: revoke execute dari public, anon, authenticated
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. TABEL document_counters
-- ---------------------------------------------------------------------------
create table if not exists public.document_counters (
  user_id    uuid not null references auth.users(id) on delete cascade,
  doc_type   varchar not null,
  year_month varchar not null,          -- YYYYMM
  last_seq   int not null default 0,
  primary key (user_id, doc_type, year_month),
  constraint document_counters_type_check check (doc_type in ('quotation', 'invoice', 'receipt', 'nota'))
);

comment on table  public.document_counters            is 'Counter nomor urut dokumen order per pengguna, jenis dokumen, dan periode bulan';
comment on column public.document_counters.doc_type   is 'Jenis dokumen: quotation, invoice, receipt, nota';
comment on column public.document_counters.year_month is 'Periode tahun-bulan format YYYYMM dari tanggal dokumen';
comment on column public.document_counters.last_seq   is 'Nomor urut terakhir yang diterbitkan';

alter table public.document_counters enable row level security;

drop policy if exists "Select own document_counters" on public.document_counters;
create policy "Select own document_counters" on public.document_counters
  for select using (auth.uid() = user_id);

grant select on table public.document_counters to authenticated;
revoke insert, update, delete on table public.document_counters from authenticated;
grant all on table public.document_counters to service_role;

-- ---------------------------------------------------------------------------
-- 2. FUNGSI INTERNAL generate_document_no
-- ---------------------------------------------------------------------------
create or replace function public.generate_document_no(
  p_user_id  uuid,
  p_doc_type text,
  p_date     date default current_date
)
returns varchar
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date   date := coalesce(p_date, current_date);
  v_ym     text;
  v_prefix text;
  v_seq    int;
begin
  if p_user_id is null then
    raise exception 'user_id tidak boleh null' using errcode = '22004';
  end if;

  v_ym := to_char(v_date, 'YYYYMM');

  case p_doc_type
    when 'quotation' then v_prefix := 'PNW';
    when 'invoice'   then v_prefix := 'INV';
    when 'receipt'   then v_prefix := 'KWT';
    when 'nota'      then v_prefix := 'NTA';
    else
      raise exception 'Tipe dokumen tidak valid: %', p_doc_type using errcode = '22023';
  end case;

  insert into public.document_counters (user_id, doc_type, year_month, last_seq)
  values (p_user_id, p_doc_type, v_ym, 1)
  on conflict (user_id, doc_type, year_month)
  do update set last_seq = public.document_counters.last_seq + 1
  returning last_seq into v_seq;

  return v_prefix || '-' || v_ym || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

comment on function public.generate_document_no(uuid, text, date) is 'Fungsi internal pembuat nomor dokumen otomatis PREFIX-YYYYMM-NNNN secara atomik';

-- Kunci hak akses: fungsi internal hanya boleh dieksekusi oleh definer/service_role
revoke execute on function public.generate_document_no(uuid, text, date) from public, anon, authenticated;
