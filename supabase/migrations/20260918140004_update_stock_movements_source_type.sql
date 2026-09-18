-- =========================================================
-- Migration: update_stock_movements_source_type
-- Version: 20260918140004
-- =========================================================

-- Tambahkan 'purchasing_report', 'supplier_purchase', dan 'adjustment'
-- ke whitelist source_type pada tabel stock_movements
alter table public.stock_movements
  drop constraint if exists stock_movements_source_type_check;

alter table public.stock_movements
  add constraint stock_movements_source_type_check
  check (source_type in (
    'initial',
    'purchase',
    'order_consumption',
    'manual',
    'purchasing_report',
    'supplier_purchase',
    'adjustment'
  ));
