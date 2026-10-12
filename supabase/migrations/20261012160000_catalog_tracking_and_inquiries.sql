-- =========================================================================
-- SIKon — Katalog Fase 3a: Pelacakan Pesanan Aman (Dual Verification)
-- =========================================================================
-- Tambahkan:
--   1. Kolom `orders.tracking_code` & `customer_phone`
--   2. Trigger otomatis tracking_code pada insert order baru
--   3. RPC `catalog_track_order(p_tracking_code, p_phone_last4)`
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Kolom pada tabel orders
-- -------------------------------------------------------------------------
alter table public.orders
  add column if not exists tracking_code   varchar(16) null,
  add column if not exists customer_phone  varchar(30) null;

-- Unik pada kode tracking (case-insensitive)
create unique index if not exists uq_orders_tracking_code
  on public.orders(lower(tracking_code))
  where tracking_code is not null;

-- -------------------------------------------------------------------------
-- 2. Fungsi generator tracking_code: 8 karakter alfanumerik tanpa ambigu
--    (tanpa huruf O/I dan angka 0/1 agar mudah dibaca)
-- -------------------------------------------------------------------------
create or replace function public.trg_generate_tracking_code()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_chars  text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- gen_random_bytes dari pgcrypto (extensions schema)
  v_code   text    := '';
  v_len    integer := 8;
  v_idx    integer;
  v_attempt integer := 0;
begin
  if new.tracking_code is not null then
    return new;
  end if;

  loop
    v_code := '';
    for i in 1..v_len loop
      v_idx  := (get_byte(gen_random_bytes(1), 0) % length(v_chars)) + 1;
      v_code := v_code || substr(v_chars, v_idx, 1);
    end loop;

    -- Pastikan unik
    if not exists (
      select 1 from public.orders
      where lower(tracking_code) = lower(v_code)
    ) then
      new.tracking_code := v_code;
      exit;
    end if;

    v_attempt := v_attempt + 1;
    if v_attempt > 100 then
      raise exception 'Gagal membuat tracking_code unik setelah 100 percobaan';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_orders_tracking_code on public.orders;
create trigger trg_orders_tracking_code
  before insert on public.orders
  for each row execute function public.trg_generate_tracking_code();

-- Backfill: isi tracking_code untuk order lama yang belum punya kode
do $$
declare
  v_rec   record;
  v_chars text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code  text;
  v_idx   integer;
begin
  set search_path to public, extensions;
  for v_rec in
    select id from public.orders where tracking_code is null order by created_at
  loop
    loop
      v_code := '';
      for i in 1..8 loop
        v_idx  := (get_byte(gen_random_bytes(1), 0) % length(v_chars)) + 1;
        v_code := v_code || substr(v_chars, v_idx, 1);
      end loop;
      exit when not exists (
        select 1 from public.orders where lower(tracking_code) = lower(v_code)
      );
    end loop;
    update public.orders set tracking_code = v_code where id = v_rec.id;
  end loop;
end;
$$;

-- =========================================================================
-- 3. RPC catalog_track_order — pelacakan dual-key (tracking_code + 4 digit HP)
-- =========================================================================
create or replace function public.catalog_track_order(
  p_tracking_code text,
  p_phone_last4   text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order record;
  v_label text;
begin
  -- Sanitasi input
  if length(trim(coalesce(p_tracking_code, ''))) = 0
     or length(trim(coalesce(p_phone_last4, ''))) <> 4
     or p_phone_last4 !~ '^\d{4}$'
  then
    return jsonb_build_object(
      'found',   false,
      'message', 'Pesanan tidak ditemukan atau data verifikasi tidak cocok'
    );
  end if;

  -- Cari order berdasarkan tracking_code DAN 4 digit terakhir nomor HP
  select o.id, o.tracking_code, o.production_status, o.status
  into   v_order
  from   public.orders o
  where  lower(o.tracking_code) = lower(trim(p_tracking_code))
    and  right(regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g'), 4) = p_phone_last4;

  -- Respons seragam jika tidak ditemukan (anti-enumeration)
  if not found then
    return jsonb_build_object(
      'found',   false,
      'message', 'Pesanan tidak ditemukan atau data verifikasi tidak cocok'
    );
  end if;

  -- Label status produksi dalam bahasa Indonesia
  v_label := case v_order.production_status
    when 'offered'    then 'Penawaran'
    when 'queued'     then 'Menunggu Antrean'
    when 'production' then 'Sedang Diproduksi'
    when 'ready'      then 'Siap Diambil/Dikirim'
    when 'completed'  then 'Selesai'
    else 'Status tidak diketahui'
  end;

  -- Kembalikan hanya data publik yang diizinkan (whitelist ketat)
  return jsonb_build_object(
    'found',             true,
    'tracking_code',     v_order.tracking_code,
    'production_status', v_order.production_status,
    'status_label',      v_label,
    'is_fully_paid',     (v_order.status = 'lunas'),
    -- Timeline tahapan dari order_stage_events
    'stages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'stage_name',   ose.stage,
          'status',       ose.status,
          'completed_at', ose.completed_at
        )
        order by ose.updated_at asc
      )
      from public.order_stage_events ose
      where ose.order_id = v_order.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.catalog_track_order(text, text) from public;
grant execute on function public.catalog_track_order(text, text) to anon, authenticated;
