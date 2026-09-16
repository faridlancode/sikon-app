-- Migration: link_order_items_to_products
-- Version: 20260916031228
--
-- Tahap 2 dari fitur Product / COGS / BOM. Menyambungkan order_items ke
-- products, menambahkan kolom snapshot HPP, dan tabel pilihan kain+warna
-- per order_item (order_item_fabrics).

-- order_items.name_item TETAP ADA (snapshot nama dari products.name saat
-- order dibuat, bukan diketik manual lagi). Kolom "bahan" (free text lama)
-- DIBIARKAN nullable & tidak dipakai lagi di form baru -- diganti oleh
-- order_item_fabrics yang jauh lebih terstruktur. Tidak di-drop supaya data
-- lama & histori tidak rusak.
alter table public.order_items add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.order_items add column if not exists hpp_per_unit_snapshot numeric;
alter table public.order_items add column if not exists hpp_total_snapshot numeric;
create index if not exists idx_order_items_product on public.order_items(product_id);

-- -- order_item_fabrics: kain + warna yang DIPILIH untuk tiap slot kain -----
-- pada satu order_item. Kalau product punya 2 slot (kain utama + furing),
-- maka ada 2 baris di sini untuk 1 order_item yang sama.
-- usage_qty_snapshot & price_snapshot dikunci saat order dibuat (tidak
-- berubah walau harga material di master data berubah belakangan).
create table if not exists public.order_item_fabrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  product_fabric_slot_id uuid references public.product_fabric_slots(id) on delete set null,
  material_id uuid not null references public.materials(id),
  material_color_id uuid references public.material_colors(id) on delete set null,
  usage_qty_snapshot numeric not null,
  price_snapshot numeric not null,
  line_cost_snapshot numeric not null,
  created_at timestamptz default now(),
  constraint order_item_fabrics_usage_qty_check check (usage_qty_snapshot > 0),
  constraint order_item_fabrics_price_check check (price_snapshot >= 0)
);
alter table public.order_item_fabrics enable row level security;
drop policy if exists "Manage own order item fabrics" on public.order_item_fabrics;
create policy "Manage own order item fabrics" on public.order_item_fabrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_order_item_fabrics_order_item on public.order_item_fabrics(order_item_id);
create index if not exists idx_order_item_fabrics_material on public.order_item_fabrics(material_id);
