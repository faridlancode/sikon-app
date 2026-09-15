-- Product categories for order items.
create table if not exists public.product_categories (
    id uuid primary key default gen_random_uuid (),
    user_id uuid not null references auth.users (id) on delete cascade,
    name varchar not null,
    created_at timestamptz not null default now(),
    unique (user_id, name)
);

alter table public.product_categories enable row level security;

create policy "Manage own product categories" on public.product_categories for all using (auth.uid () = user_id)
with
    check (auth.uid () = user_id);

alter table public.order_items
add column if not exists category_id uuid references public.product_categories (id) on delete set null;

create index if not exists order_items_category_id_idx on public.order_items (category_id);

-- Preserve existing item names by converting each distinct name into a product category.
insert into
    public.product_categories (user_id, name)
select distinct
    oi.user_id,
    trim(oi.name_item)
from public.order_items oi
where
    oi.name_item is not null
    and trim(oi.name_item) <> ''
on conflict (user_id, name) do nothing;

update public.order_items oi
set
    category_id = pc.id
from public.product_categories pc
where
    pc.user_id = oi.user_id
    and lower(pc.name) = lower(trim(oi.name_item))
    and oi.category_id is null;

-- Optional starter categories for users who have no product category yet.
insert into
    public.product_categories (user_id, name)
select u.id, seed.name
from auth.users u
    cross join (
        values ('Kemeja'), ('Rompi')
    ) as seed (name)
where
    not exists (
        select 1
        from public.product_categories pc
        where
            pc.user_id = u.id
    )
on conflict (user_id, name) do nothing;