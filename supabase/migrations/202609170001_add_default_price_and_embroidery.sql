-- Migration: add_default_price_and_embroidery
-- Version: 202609170001
--
-- Menambahkan default_price pada products dan field biaya bordir
-- (embroidery_cost_per_unit & embroidery_details) pada order_items.

-- 1. default_price pada products
alter table public.products 
  add column if not exists default_price numeric not null default 0;

alter table public.products 
  drop constraint if exists products_default_price_check;

alter table public.products 
  add constraint products_default_price_check check (default_price >= 0);

-- 2. embroidery pada order_items
alter table public.order_items 
  add column if not exists embroidery_cost_per_unit numeric not null default 0;

alter table public.order_items 
  drop constraint if exists order_items_embroidery_cost_check;

alter table public.order_items 
  add constraint order_items_embroidery_cost_check check (embroidery_cost_per_unit >= 0);

alter table public.order_items 
  add column if not exists embroidery_details jsonb;
