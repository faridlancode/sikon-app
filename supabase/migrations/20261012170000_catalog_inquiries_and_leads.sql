-- =========================================================================
-- SIKon — Katalog Fase 3b: Kotak Masuk Kontak & Logging Lead WhatsApp
-- =========================================================================
-- Tambahkan:
--   1. Tabel `inquiries`      — form pesan kontak publik
--   2. Tabel `catalog_leads`  — log klik tombol WhatsApp
--   3. RPC `catalog_submit_inquiry(...)` — dengan proteksi honeypot
--   4. RPC `catalog_log_lead(...)` — pencatatan tanpa data PII invasif
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Tabel kotak masuk inquiry
-- -------------------------------------------------------------------------
create table if not exists public.inquiries (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       varchar(100) not null,
  email      varchar(150) not null,
  topic      varchar(100) null,
  message    text        not null,
  status     varchar(20) not null default 'new'
               check (status in ('new', 'read', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists idx_inquiries_user_status
  on public.inquiries(user_id, status, created_at desc);

alter table public.inquiries enable row level security;

create policy "inquiries_owner_manage"
  on public.inquiries for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -------------------------------------------------------------------------
-- 2. Tabel log lead WhatsApp
-- -------------------------------------------------------------------------
create table if not exists public.catalog_leads (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  sales_id      uuid        null references public.sales(id) on delete set null,
  product_id    uuid        null references public.products(id) on delete set null,
  material_id   uuid        null references public.materials(id) on delete set null,
  color_name    varchar(50) null,
  estimated_qty integer     null,
  source        varchar(50) not null default 'whatsapp_button',
  created_at    timestamptz not null default now()
);

create index if not exists idx_catalog_leads_user_created
  on public.catalog_leads(user_id, created_at desc);

alter table public.catalog_leads enable row level security;

create policy "catalog_leads_owner_manage"
  on public.catalog_leads for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================================================
-- 3. RPC catalog_submit_inquiry — form kontak publik dengan proteksi bot
-- =========================================================================
create or replace function public.catalog_submit_inquiry(
  p_name      text,
  p_email     text,
  p_topic     text    default null,
  p_message   text    default null,
  p_honeypot  text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  -- Proteksi honeypot: bot biasanya mengisi semua field termasuk honeypot
  -- Kembalikan sukses palsu tanpa menyimpan ke database
  if nullif(trim(coalesce(p_honeypot, '')), '') is not null then
    return jsonb_build_object('success', true, 'message', 'Pesan berhasil dikirim');
  end if;

  -- Validasi nama
  if nullif(trim(coalesce(p_name, '')), '') is null then
    return jsonb_build_object('success', false, 'message', 'Nama wajib diisi');
  end if;

  if length(trim(p_name)) > 100 then
    return jsonb_build_object('success', false, 'message', 'Nama terlalu panjang (maks. 100 karakter)');
  end if;

  -- Validasi format email sederhana
  if nullif(trim(coalesce(p_email, '')), '') is null
     or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  then
    return jsonb_build_object('success', false, 'message', 'Format email tidak valid');
  end if;

  if length(trim(p_email)) > 150 then
    return jsonb_build_object('success', false, 'message', 'Email terlalu panjang (maks. 150 karakter)');
  end if;

  -- Validasi pesan
  if nullif(trim(coalesce(p_message, '')), '') is null then
    return jsonb_build_object('success', false, 'message', 'Pesan tidak boleh kosong');
  end if;

  if length(trim(p_message)) > 2000 then
    return jsonb_build_object('success', false, 'message', 'Pesan terlalu panjang (maks. 2000 karakter)');
  end if;

  -- Ambil user_id owner (satu-satunya user yang memiliki company_settings)
  select cs.user_id into v_owner_id from public.company_settings cs limit 1;

  if v_owner_id is null then
    return jsonb_build_object('success', false, 'message', 'Layanan tidak tersedia saat ini');
  end if;

  -- Simpan inquiry
  insert into public.inquiries (user_id, name, email, topic, message)
  values (
    v_owner_id,
    trim(p_name),
    lower(trim(p_email)),
    nullif(trim(coalesce(p_topic, '')), ''),
    trim(p_message)
  );

  return jsonb_build_object('success', true, 'message', 'Pesan berhasil dikirim');
end;
$$;

revoke all on function public.catalog_submit_inquiry(text, text, text, text, text) from public;
grant execute on function public.catalog_submit_inquiry(text, text, text, text, text) to anon, authenticated;

-- =========================================================================
-- 4. RPC catalog_log_lead — log klik tombol WhatsApp (tanpa PII invasif)
-- =========================================================================
create or replace function public.catalog_log_lead(
  p_sales_id      uuid    default null,
  p_product_id    uuid    default null,
  p_material_id   uuid    default null,
  p_color_name    text    default null,
  p_estimated_qty integer default null,
  p_source        text    default 'whatsapp_button'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  -- Ambil user_id owner
  select cs.user_id into v_owner_id from public.company_settings cs limit 1;

  if v_owner_id is null then
    return jsonb_build_object('success', false);
  end if;

  insert into public.catalog_leads (
    user_id, sales_id, product_id, material_id,
    color_name, estimated_qty, source
  ) values (
    v_owner_id,
    p_sales_id,
    p_product_id,
    p_material_id,
    nullif(trim(coalesce(p_color_name, '')), ''),
    p_estimated_qty,
    coalesce(nullif(trim(p_source), ''), 'whatsapp_button')
  );

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.catalog_log_lead(uuid, uuid, uuid, text, integer, text) from public;
grant execute on function public.catalog_log_lead(uuid, uuid, uuid, text, integer, text) to anon, authenticated;
