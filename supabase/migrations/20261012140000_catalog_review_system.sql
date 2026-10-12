-- =========================================================================
-- SIKon — Katalog Fase 2a: Sistem Ulasan Bertoken & Agregasi Rating
-- =========================================================================
-- Tambahkan:
--   1. Tabel `review_invitations`  — undangan ulasan dengan token hash SHA-256
--   2. Tabel `product_reviews`     — ulasan produk dengan moderasi owner
--   3. RPC dashboard: `create_review_invitation(p_order_id)`
--   4. RPC publik:    `catalog_get_review_form(p_token)`
--                     `catalog_submit_review(...)`
--                     `catalog_list_reviews(...)`
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Tabel undangan ulasan (token disimpan dalam hash SHA-256)
-- -------------------------------------------------------------------------
create table if not exists public.review_invitations (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  order_id    uuid        not null references public.orders(id) on delete cascade,
  token_hash  text        not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_review_invitations_token
  on public.review_invitations(token_hash);

alter table public.review_invitations enable row level security;

create policy "review_invitations_owner_manage"
  on public.review_invitations for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -------------------------------------------------------------------------
-- 2. Tabel ulasan produk
-- -------------------------------------------------------------------------
create table if not exists public.product_reviews (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  product_id    uuid        not null references public.products(id) on delete cascade,
  order_id      uuid        not null references public.orders(id) on delete cascade,
  reviewer_name varchar(100) not null,
  rating        smallint    not null check (rating between 1 and 5),
  comment       text        null,
  status        varchar(20) not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  owner_reply   text        null,
  moderated_at  timestamptz null,
  created_at    timestamptz not null default now(),
  constraint uq_product_reviews_order_product unique (order_id, product_id)
);

create index if not exists idx_product_reviews_product_approved
  on public.product_reviews(product_id, status)
  where status = 'approved';

alter table public.product_reviews enable row level security;

create policy "product_reviews_owner_manage"
  on public.product_reviews for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================================================
-- 3. RPC dashboard: buat undangan ulasan (authenticated only)
-- =========================================================================
create or replace function public.create_review_invitation(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id  uuid := auth.uid();
  v_token    text;
  v_hash     text;
  v_inv_id   uuid;
begin
  -- Hanya owner terdaftar yang dapat membuat undangan
  if v_user_id is null then
    raise exception 'Autentikasi diperlukan' using errcode = '42501';
  end if;

  -- Pastikan order milik user ini dan statusnya completed
  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.user_id = v_user_id
      and o.production_status = 'completed'
  ) then
    raise exception 'Pesanan tidak ditemukan atau belum selesai diproduksi'
      using errcode = 'P0002';
  end if;

  -- Buat token acak 128-bit (32 karakter hex) dan simpan hash-nya
  v_token := encode(gen_random_bytes(16), 'hex');
  v_hash  := encode(sha256(v_token::bytea), 'hex');

  insert into public.review_invitations (
    user_id, order_id, token_hash, expires_at
  ) values (
    v_user_id, p_order_id, v_hash, now() + interval '30 days'
  )
  returning id into v_inv_id;

  return jsonb_build_object(
    'invitation_id', v_inv_id,
    'token',         v_token,
    'expires_at',    now() + interval '30 days'
  );
end;
$$;

revoke all on function public.create_review_invitation(uuid) from public;
grant execute on function public.create_review_invitation(uuid) to authenticated;

-- =========================================================================
-- 4. RPC publik: catalog_get_review_form — validasi token, daftar produk
-- =========================================================================
create or replace function public.catalog_get_review_form(
  p_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_hash    text := encode(sha256(p_token::bytea), 'hex');
  v_inv     record;
begin
  select ri.*
  into   v_inv
  from   public.review_invitations ri
  where  ri.token_hash = v_hash;

  if not found then
    return jsonb_build_object('valid', false, 'message', 'Token tidak valid atau sudah kedaluwarsa');
  end if;

  if v_inv.expires_at < now() then
    return jsonb_build_object('valid', false, 'message', 'Token tidak valid atau sudah kedaluwarsa');
  end if;

  if v_inv.used_at is not null then
    return jsonb_build_object('valid', false, 'message', 'Token sudah pernah digunakan');
  end if;

  -- Kembalikan daftar item produk dalam pesanan (TANPA data sensitif order)
  return jsonb_build_object(
    'valid', true,
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_id',   p.id,
          'product_name', p.name,
          'already_reviewed', exists (
            select 1 from public.product_reviews pr
            where pr.order_id = v_inv.order_id and pr.product_id = p.id
          )
        )
        order by p.name
      )
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = v_inv.order_id
        and oi.product_id is not null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.catalog_get_review_form(text) from public;
grant execute on function public.catalog_get_review_form(text) to anon, authenticated;

-- =========================================================================
-- 5. RPC publik: catalog_submit_review — kirim ulasan via token
-- =========================================================================
create or replace function public.catalog_submit_review(
  p_token         text,
  p_product_id    uuid,
  p_rating        integer,
  p_reviewer_name text,
  p_comment       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash    text := encode(sha256(p_token::bytea), 'hex');
  v_inv     record;
begin
  -- Validasi token
  select ri.*
  into   v_inv
  from   public.review_invitations ri
  where  ri.token_hash = v_hash
  for update;

  if not found or v_inv.expires_at < now() or v_inv.used_at is not null then
    return jsonb_build_object('success', false, 'message', 'Token tidak valid, sudah kedaluwarsa, atau sudah digunakan');
  end if;

  -- Validasi produk benar-benar ada di pesanan ini
  if not exists (
    select 1 from public.order_items oi
    where oi.order_id = v_inv.order_id and oi.product_id = p_product_id
  ) then
    return jsonb_build_object('success', false, 'message', 'Produk tidak ditemukan dalam pesanan ini');
  end if;

  -- Validasi rating
  if p_rating not between 1 and 5 then
    return jsonb_build_object('success', false, 'message', 'Rating harus antara 1 dan 5');
  end if;

  -- Validasi nama reviewer
  if nullif(trim(coalesce(p_reviewer_name, '')), '') is null then
    return jsonb_build_object('success', false, 'message', 'Nama reviewer wajib diisi');
  end if;

  -- Simpan ulasan (status default: pending)
  insert into public.product_reviews (
    user_id, product_id, order_id, reviewer_name, rating, comment, status
  ) values (
    v_inv.user_id, p_product_id, v_inv.order_id,
    trim(p_reviewer_name), p_rating, nullif(trim(coalesce(p_comment, '')), ''), 'pending'
  );

  -- Tandai token sudah digunakan
  update public.review_invitations
     set used_at = now()
   where id = v_inv.id;

  return jsonb_build_object('success', true, 'message', 'Ulasan berhasil dikirim dan sedang menunggu moderasi');
end;
$$;

revoke all on function public.catalog_submit_review(text, uuid, integer, text, text) from public;
grant execute on function public.catalog_submit_review(text, uuid, integer, text, text) to anon, authenticated;

-- =========================================================================
-- 6. RPC publik: catalog_list_reviews — daftar ulasan approved (masking nama)
-- =========================================================================
create or replace function public.catalog_list_reviews(
  p_product_id uuid,
  p_page       integer default 1,
  p_limit      integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_page  integer := greatest(coalesce(p_page, 1), 1);
begin
  return (
    with approved as (
      select
        pr.id,
        pr.rating,
        -- Masking nama: "Budi Santoso" -> "Budi S."
        case
          when position(' ' in trim(pr.reviewer_name)) > 0
          then split_part(trim(pr.reviewer_name), ' ', 1)
               || ' ' || left(split_part(trim(pr.reviewer_name), ' ', 2), 1) || '.'
          else trim(pr.reviewer_name)
        end                as reviewer_name_masked,
        left(pr.comment, 2000) as comment,
        pr.owner_reply,
        pr.created_at
      from public.product_reviews pr
      where pr.product_id = p_product_id
        and pr.status = 'approved'
      order by pr.created_at desc
    ),
    total as (select count(*)::integer as n from approved)
    select jsonb_build_object(
      'data', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',            a.id,
            'rating',        a.rating,
            'reviewer_name', a.reviewer_name_masked,
            'comment',       a.comment,
            'owner_reply',   a.owner_reply,
            'created_at',    a.created_at
          )
          order by a.created_at desc
        )
        from (
          select * from approved
          limit  v_limit
          offset (v_page - 1) * v_limit
        ) a
      ), '[]'::jsonb),
      'meta', jsonb_build_object(
        'current_page', v_page,
        'limit',        v_limit,
        'total_items',  (select n from total),
        'total_pages',  greatest(1, ceil((select n from total)::numeric / v_limit)::integer)
      )
    )
  );
end;
$$;

revoke all on function public.catalog_list_reviews(uuid, integer, integer) from public;
grant execute on function public.catalog_list_reviews(uuid, integer, integer) to anon, authenticated;
