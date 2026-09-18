-- =========================================================
-- Migration: spj_service_fee
-- Version: 20260918150001
-- =========================================================

-- 1. Tambah kolom service_fee ke purchasing_reports
alter table public.purchasing_reports
  add column if not exists service_fee numeric not null default 0 check (service_fee >= 0);
