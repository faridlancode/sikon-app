-- =========================================================================
-- SIKon — Katalog Fase 1d: Pembaruan RPC List Produk & Sales (Fase 1)
-- =========================================================================
-- Update:
--   catalog_list_sales()       — sertakan foto, tagline, slug, jam kerja
--   catalog_list_products(...) — filter is_published, foto galeri, opsi kain
--                                dengan fallback, dukungan sort 'featured'
-- Aturan: DROP function lama dulu (hindari PGRST203 overloading)
-- =========================================================================

-- =========================================================================
-- DROP versi lama (signature lama)
-- =========================================================================
drop function if exists public.catalog_list_sales();
drop function if exists public.catalog_list_products(text, uuid, text, integer, integer, text);

-- =========================================================================
-- catalog_list_sales — Fase 1
-- =========================================================================
create or replace function public.catalog_list_sales()
returns table (
  id            uuid,
  name          varchar,
  phone         varchar,
  photo_url     text,
  tagline       text,
  slug          varchar,
  open_time     time,
  close_time    time
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.phone,
    s.photo_url,
    s.tagline,
    s.slug,
    s.open_time,
    s.close_time
  from public.sales s
  where s.is_active = true
    and s.show_in_catalog = true
    and nullif(trim(s.phone), '') is not null
  order by s.display_order asc, s.name asc;
$$;

-- =========================================================================
-- catalog_list_products — Fase 1
-- =========================================================================
-- p_sort: 'price:asc' | 'price:desc' | 'featured' | lainnya = terbaru
-- fabrics: dari product_fabric_options (is_offered=true) ATAU fallback ke
--          kain kategori slot pertama dengan price_adjustment=0
-- images : dari product_images, diurutkan (foto utama pertama)
-- =========================================================================
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
        left(p.id::text, 8)                        as short_id,
        p.name,
        p.description,
        p.category_id,
        pc.name                                    as category_name,
        nullif(p.price_satuan, 0)                  as price_satuan,
        nullif(p.price_prioritas, 0)               as price_prioritas,
        coalesce(
          nullif(p.price_prioritas, 0),
          nullif(p.price_satuan, 0),
          nullif(p.default_price, 0),
          0
        )                                          as base_price,
        p.is_featured,
        p.sort_order,
        p.created_at
      from public.products p
      left join public.product_categories pc on pc.id = p.category_id
      where p.is_active = true
        and p.is_published = true
        and (p_category_id is null or p.category_id = p_category_id)
        and (p_short_id   is null or left(p.id::text, 8) = lower(p_short_id))
        and (
          v_like is null
          or p.name                        ilike v_like
          or coalesce(p.description, '')   ilike v_like
          or coalesce(pc.name, '')         ilike v_like
        )
    ),
    ranked as (
      select
        f.*,
        row_number() over (
          order by
            case when p_sort = 'price:asc'  then f.base_price end asc,
            case when p_sort = 'price:desc' then f.base_price end desc,
            case when p_sort = 'featured'   then (case when f.is_featured then 0 else 1 end) end asc,
            case when p_sort = 'featured'   then f.sort_order end asc,
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
            'id',             r.id,
            'short_id',       r.short_id,
            'slug',
              trim(both '-' from regexp_replace(lower(r.name), '[^a-z0-9]+', '-', 'g'))
              || '-' || r.short_id,
            'name',           r.name,
            'description',    r.description,
            'category_id',    r.category_id,
            'category_name',  r.category_name,
            'price_satuan',   r.price_satuan,
            'price_prioritas',r.price_prioritas,
            'base_price',     r.base_price,
            'is_featured',    r.is_featured,
            'created_at',     r.created_at,

            -- -------------------------------------------------------
            -- Galeri foto: diurutkan (is_primary first, lalu sort_order)
            -- -------------------------------------------------------
            'images', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id',        pi.id,
                  'image_url', pi.image_url,
                  'is_primary',pi.is_primary,
                  'sort_order',pi.sort_order
                )
                order by (pi.is_primary::int) desc, pi.sort_order asc, pi.created_at asc
              )
              from public.product_images pi
              where pi.product_id = r.id
            ), '[]'::jsonb),

            -- -------------------------------------------------------
            -- Opsi kain: product_fabric_options ATAU fallback slot kain
            -- -------------------------------------------------------
            'fabrics', coalesce((
              -- Prioritas 1: product_fabric_options (kain yang is_offered)
              case
                when exists (
                  select 1 from public.product_fabric_options pfo
                  where pfo.product_id = r.id and pfo.is_offered = true
                )
                then (
                  select jsonb_agg(
                    jsonb_build_object(
                      'id',                  m.id,
                      'name',                m.name,
                      'composition',         m.composition,
                      'care_instruction',    m.care_instruction,
                      'weight_gsm',          m.weight_gsm,
                      'catalog_description', m.catalog_description,
                      'price_adjustment',    pfo.price_adjustment,
                      'is_default',          pfo.is_default,
                      'colors', coalesce((
                        select jsonb_agg(
                          jsonb_build_object('id', mc.id, 'name', mc.color_name, 'hex_code', mc.color_code)
                          order by mc.created_at, mc.color_name
                        )
                        from public.material_colors mc
                        where mc.material_id = m.id and mc.is_active
                      ), '[]'::jsonb)
                    )
                    order by pfo.sort_order asc, m.name asc
                  )
                  from public.product_fabric_options pfo
                  join public.materials m on m.id = pfo.material_id and m.is_active
                  where pfo.product_id = r.id and pfo.is_offered = true
                )
                -- Fallback: kain dari kategori slot pertama produk
                else (
                  select jsonb_agg(
                    jsonb_build_object(
                      'id',                  m.id,
                      'name',                m.name,
                      'composition',         m.composition,
                      'care_instruction',    m.care_instruction,
                      'weight_gsm',          m.weight_gsm,
                      'catalog_description', m.catalog_description,
                      'price_adjustment',    0,
                      'is_default',          false,
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
                )
              end
            ), '[]'::jsonb)
          )
          order by r.rn
        )
        from page_rows r
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

-- =========================================================================
-- Hak akses
-- =========================================================================
revoke all on function public.catalog_list_sales() from public;
revoke all on function public.catalog_list_products(text, uuid, text, integer, integer, text) from public;

grant execute on function public.catalog_list_sales() to anon, authenticated;
grant execute on function public.catalog_list_products(text, uuid, text, integer, integer, text) to anon, authenticated;
