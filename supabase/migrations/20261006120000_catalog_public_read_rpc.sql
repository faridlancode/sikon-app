-- =========================================================================
-- SIKon — Katalog publik: RPC read-only untuk sikon-catalog (role anon)
-- =========================================================================
-- Tujuan: situs katalog (sikon-catalog) tidak login, jadi memakai role `anon`.
-- Semua tabel master punya RLS `auth.uid() = user_id` dan anon tidak punya
-- GRANT, sehingga katalog tidak bisa membaca apa pun. Daripada membuka tabel,
-- kita buka 3 RPC read-only (security definer) yang HANYA mengembalikan
-- kolom aman untuk publik.
--
-- TIDAK PERNAH diekspos: HPP, tarif potong/jahit, bonus sales, harga beli &
-- stok material, BOM aksesori, order, keuangan, staf.
--
-- Pengecualian sadar dari aturan "revoke ... from anon" di AGENT_INSTRUCTIONS:
-- fungsi di bawah memang untuk anon. Kalau signature diubah, `drop function`
-- versi lama dulu (hindari PGRST203).

-- 1. Kategori produk (hanya yang punya minimal 1 produk aktif) ------------
create or replace function public.catalog_list_categories()
returns table (id uuid, name varchar)
language sql
stable
security definer
set search_path = public
as $$
  select pc.id, pc.name
  from public.product_categories pc
  where exists (
    select 1 from public.products p
    where p.category_id = pc.id and p.is_active
  )
  order by pc.name;
$$;

-- 2. Sales aktif yang punya nomor HP (untuk tombol WhatsApp) --------------
create or replace function public.catalog_list_sales()
returns table (id uuid, name varchar, phone varchar)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.phone
  from public.sales s
  where s.is_active
    and nullif(trim(s.phone), '') is not null
  order by s.created_at, s.name;
$$;

-- 3. Produk + kain + warna (list, filter, sort, paginasi, detail) ---------
-- p_sort   : 'price:asc' | 'price:desc' | lainnya = terbaru (created_at desc)
-- p_short_id: 8 karakter pertama UUID produk, untuk halaman detail
-- Harga    : base_price = price_prioritas -> price_satuan -> default_price
-- Kain     : semua material aktif di kategori kain milik slot kain pertama
--            produk (`product_fabric_slots`), beserta warna aktifnya.
create or replace function public.catalog_list_products(
  p_search      text    default null,
  p_category_id uuid    default null,
  p_sort        text    default null,
  p_page        integer default 1,
  p_limit       integer default 12,
  p_short_id    text    default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 12), 1), 50);
  v_page   integer := greatest(coalesce(p_page, 1), 1);
  v_search text    := nullif(trim(coalesce(p_search, '')), '');
  v_like   text;
begin
  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return (
    with filtered as (
      select
        p.id,
        left(p.id::text, 8) as short_id,
        p.name,
        p.description,
        p.category_id,
        pc.name as category_name,
        nullif(p.price_satuan, 0) as price_satuan,
        nullif(p.price_prioritas, 0) as price_prioritas,
        coalesce(nullif(p.price_prioritas, 0), nullif(p.price_satuan, 0),
                 nullif(p.default_price, 0), 0) as base_price,
        p.created_at
      from public.products p
      left join public.product_categories pc on pc.id = p.category_id
      where p.is_active
        and (p_category_id is null or p.category_id = p_category_id)
        and (p_short_id is null or left(p.id::text, 8) = lower(p_short_id))
        and (
          v_like is null
          or p.name ilike v_like
          or coalesce(p.description, '') ilike v_like
          or coalesce(pc.name, '') ilike v_like
        )
    ),
    ranked as (
      select
        f.*,
        row_number() over (
          order by
            case when p_sort = 'price:asc'  then f.base_price end asc,
            case when p_sort = 'price:desc' then f.base_price end desc,
            f.created_at desc, f.id
        ) as rn
      from filtered f
    ),
    page_rows as (
      select * from ranked
      where rn > (v_page - 1) * v_limit and rn <= v_page * v_limit
    ),
    total as (select count(*)::integer as n from filtered)
    select jsonb_build_object(
      'data', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'short_id', r.short_id,
            'slug', trim(both '-' from regexp_replace(lower(r.name), '[^a-z0-9]+', '-', 'g'))
                    || '-' || r.short_id,
            'name', r.name,
            'description', r.description,
            'category_id', r.category_id,
            'category_name', r.category_name,
            'price_satuan', r.price_satuan,
            'price_prioritas', r.price_prioritas,
            'base_price', r.base_price,
            'created_at', r.created_at,
            'fabrics', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', m.id,
                  'name', m.name,
                  'composition', m.composition,
                  'care_instruction', m.care_instruction,
                  'colors', coalesce((
                    select jsonb_agg(
                      jsonb_build_object('id', mc.id, 'name', mc.color_name, 'hex_code', mc.color_code)
                      order by mc.created_at, mc.color_name
                    )
                    from public.material_colors mc
                    where mc.material_id = m.id and mc.is_active
                  ), '[]'::jsonb)
                )
                order by m.name
              )
              from public.materials m
              join public.material_categories mcat on mcat.id = m.category_id and mcat.is_fabric
              where m.is_active
                and m.category_id = (
                  select s.fabric_category_id
                  from public.product_fabric_slots s
                  where s.product_id = r.id and s.fabric_category_id is not null
                  order by s.created_at, s.id
                  limit 1
                )
            ), '[]'::jsonb)
          )
          order by r.rn
        )
        from page_rows r
      ), '[]'::jsonb),
      'meta', jsonb_build_object(
        'current_page', v_page,
        'limit', v_limit,
        'total_items', (select n from total),
        'total_pages', greatest(1, ceil((select n from total)::numeric / v_limit)::integer)
      )
    )
  );
end;
$$;

-- 4. Hak akses: anon + authenticated boleh eksekusi, public dicabut --------
revoke all on function public.catalog_list_categories() from public;
revoke all on function public.catalog_list_sales() from public;
revoke all on function public.catalog_list_products(text, uuid, text, integer, integer, text) from public;

grant execute on function public.catalog_list_categories() to anon, authenticated;
grant execute on function public.catalog_list_sales() to anon, authenticated;
grant execute on function public.catalog_list_products(text, uuid, text, integer, integer, text) to anon, authenticated;
