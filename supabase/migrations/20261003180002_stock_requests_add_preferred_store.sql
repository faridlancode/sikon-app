-- =========================================================================
-- SIKon — Tambah Kolom preferred_store di stock_requests
-- =========================================================================
-- Tujuan: Staf Gudang dapat mengisi nama toko / supplier rekomendasi
-- saat membuat pengajuan restock baru. Bersifat opsional, hanya sebagai
-- referensi untuk tim Purchasing.
-- =========================================================================

alter table public.stock_requests
  add column if not exists preferred_store text null;

comment on column public.stock_requests.preferred_store is
  'Nama toko / supplier rekomendasi dari staf Gudang saat mengajukan restock. '
  'Opsional — hanya sebagai referensi untuk tim Purchasing.';
