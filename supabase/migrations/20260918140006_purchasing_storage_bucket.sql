-- =========================================================
-- Migration: purchasing_storage_bucket
-- Version: 20260918140006
-- =========================================================

-- Storage bucket untuk bukti nota SPJ purchasing
insert into storage.buckets (id, name, public)
values ('purchasing-receipts', 'purchasing-receipts', true)
on conflict (id) do nothing;

drop policy if exists "Public read purchasing receipts" on storage.objects;
create policy "Public read purchasing receipts" on storage.objects for
select using (bucket_id = 'purchasing-receipts');

drop policy if exists "Owner manage own purchasing receipts" on storage.objects;
create policy "Owner manage own purchasing receipts" on storage.objects for all using (
    bucket_id = 'purchasing-receipts'
    and (storage.foldername (name)) [1] = auth.uid ()::text
)
with check (
    bucket_id = 'purchasing-receipts'
    and (storage.foldername (name)) [1] = auth.uid ()::text
);
