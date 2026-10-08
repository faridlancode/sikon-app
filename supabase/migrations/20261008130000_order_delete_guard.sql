-- =========================================================================
-- Migration: Order Delete Guard + delete_order RPC (Fase A - Langkah 8)
-- =========================================================================
-- Menambahkan:
-- 1. Trigger trg_guard_order_delete (before delete on orders)
--    - Tolak jika Sigma order_payments > Sigma order_deposit_releases (masih memegang uang pelanggan)
--    - Tolak jika order sudah dipakai pada distribusi jahit (target_order_id)
--    - Izinkan hapus bila pemilik (old.user_id) sudah tidak ada di auth.users (cascade)
-- 2. RPC delete_order (atomik: validasi batch jahit + cek + batalkan stok & request + hapus order)
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. FUNGSI TRIGGER: guard_order_delete
--    Aturan keras 10 & 11: order tidak bisa dihapus selama masih memegang uang pelanggan.
--    Pengecualian: jika user dihapus dari auth.users, cascade penghapusan diizinkan.
-- ---------------------------------------------------------------------------
create or replace function public.guard_order_delete()
returns trigger language plpgsql
security definer set search_path = public as $$
declare
  v_total_paid     numeric;
  v_total_released numeric;
begin
  -- Izinkan jika pemilik order sudah tidak ada di auth.users (cascade hapus user)
  if not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;

  -- Pemeriksaan batch jahit
  if exists (
    select 1 from public.sewing_distribution_batches
     where target_order_id = old.id
  ) then
    raise exception 'Order ini sudah dipakai pada distribusi jahit dan tidak dapat dihapus'
      using errcode = 'P0001';
  end if;

  select coalesce(sum(amount), 0) into v_total_paid
    from public.order_payments where order_id = old.id;

  select coalesce(sum(amount), 0) into v_total_released
    from public.order_deposit_releases where order_id = old.id;

  if v_total_paid > v_total_released then
    raise exception
      'Order ini masih memegang uang pelanggan Rp %. Kembalikan uang atau tandai DP hangus terlebih dahulu.',
      (v_total_paid - v_total_released)
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

revoke execute on function public.guard_order_delete() from public, anon, authenticated;

drop trigger if exists trg_guard_order_delete on public.orders;
create trigger trg_guard_order_delete
  before delete on public.orders
  for each row execute function public.guard_order_delete();

-- ---------------------------------------------------------------------------
-- 2. RPC delete_order
--    Atomik: dalam satu transaksi
--    (a) cek kepemilikan
--    (b) cek apakah order sudah dipakai pada distribusi jahit
--    (c) batalkan stock_movements pending milik order (status = 'cancelled')
--    (d) batalkan stock_requests draft_auto milik order (status = 'cancelled')
--    (e) hapus order (trigger guard_order_delete memeriksa aturan sisa uang pelanggan)
-- ---------------------------------------------------------------------------
create or replace function public.delete_order(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_order record;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi' using errcode = '42501'; end if;

  -- Ambil order, pastikan milik user
  select * into v_order from public.orders where id = p_order_id and user_id = v_uid;
  if not found then
    raise exception 'Order tidak ditemukan atau bukan milik Anda' using errcode = 'P0001';
  end if;

  -- (b) Pemeriksaan batch jahit
  if exists (
    select 1 from public.sewing_distribution_batches
     where target_order_id = p_order_id
  ) then
    raise exception 'Order ini sudah dipakai pada distribusi jahit dan tidak dapat dihapus'
      using errcode = 'P0001';
  end if;

  -- (c) Batalkan stock_movements pending milik order
  update public.stock_movements
  set status = 'cancelled'
  where source_id = p_order_id
    and status = 'pending'
    and user_id = v_uid;

  -- (d) Batalkan stock_requests draft_auto milik order
  update public.stock_requests
  set status = 'cancelled'
  where source_order_id = p_order_id
    and status = 'draft_auto'
    and user_id = v_uid;

  -- (e) Hapus order (trigger trg_guard_order_delete akan cek uang pelanggan)
  delete from public.orders where id = p_order_id and user_id = v_uid;
end;
$$;

revoke execute on function public.delete_order(uuid) from public, anon;
grant  execute on function public.delete_order(uuid) to authenticated;
