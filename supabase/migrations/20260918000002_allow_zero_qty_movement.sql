-- Allow qty >= 0 on stock_movements for adjustment to 0
alter table public.stock_movements
  drop constraint if exists stock_movements_qty_check;

alter table public.stock_movements
  add constraint stock_movements_qty_check check (qty >= 0);
