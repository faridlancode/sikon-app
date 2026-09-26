-- =========================================================================
-- SIKon — Migration: Stock Requests Fulfillment Type v2
-- =========================================================================
-- 1. Pastikan fulfillment_type tidak null dengan default 'spj'
-- 2. Validasi constraint fulfillment_type ('spj', 'supplier_purchase')
-- 3. Function helper untuk ubah fulfillment_type saat pengajuan masih pending
-- =========================================================================

update public.stock_requests
set fulfillment_type = 'spj'
where fulfillment_type is null;

alter table public.stock_requests
  drop constraint if exists stock_requests_fulfillment_type_check;

alter table public.stock_requests
  alter column fulfillment_type set default 'spj',
  alter column fulfillment_type set not null;

alter table public.stock_requests
  add constraint stock_requests_fulfillment_type_check
    check (fulfillment_type in ('spj', 'supplier_purchase'));

comment on column public.stock_requests.fulfillment_type
  is 'Kategori pembelian yang DIPILIH STAF GUDANG saat pengajuan dibuat: spj (belanja retail via staf) atau supplier_purchase (supplier langganan). Menentukan modal apa yang dibuka Purchasing saat approve.';

create index if not exists idx_stock_requests_fulfillment_type on public.stock_requests(fulfillment_type);

-- Function untuk mengubah fulfillment_type ketika masih pending/draft_auto (oleh Finance/Purchasing jika ada salah pilih)
create or replace function public.update_stock_request_fulfillment_type(
  p_request_id uuid,
  p_fulfillment_type varchar
)
returns void language plpgsql as $$
declare
  v_status varchar;
begin
  select status into v_status from public.stock_requests where id = p_request_id;
  if v_status is null then
    raise exception 'Pengajuan restock tidak ditemukan';
  end if;
  if v_status not in ('pending', 'draft_auto') then
    raise exception 'Kategori pembelian hanya dapat diubah saat pengajuan masih berstatus pending atau draft';
  end if;
  if p_fulfillment_type not in ('spj', 'supplier_purchase') then
    raise exception 'Kategori pembelian tidak valid (harus spj atau supplier_purchase)';
  end if;

  update public.stock_requests
  set fulfillment_type = p_fulfillment_type
  where id = p_request_id;
end;
$$;
