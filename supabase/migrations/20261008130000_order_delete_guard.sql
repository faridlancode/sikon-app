-- =========================================================================
-- Migration: Order Delete Guard + delete_order RPC (Fase A - Langkah 8)
-- =========================================================================
-- Menambahkan:
-- 1. Trigger trg_guard_order_delete (before delete on orders)
--    Tolak jika Σ order_payments > Σ order_deposit_releases (masih memegang uang pelanggan)
-- 2. RPC delete_order (atomik: cek + batalkan + hapus)
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. FUNGSI TRIGGER: guard_order_delete
--    Aturan keras 11: order tidak bisa dihapus selama masih memegang uang pelanggan.
--    TRUNCATE tidak terkena trigger baris — clear.sql aman.
-- ---------------------------------------------------------------------------
create or replace function public.guard_order_delete()
returns trigger language plpgsql
security definer set search_path = public as $$
declare
  v_total_paid     numeric;
  v_total_released numeric;
begin
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
--    (b) trigger guard_order_delete sudah mengecek aturan keras 11
--    (c) batalkan stock_movements pending milik order (set status = 'cancelled')
--    (d) batalkan stock_requests berstatus draft_auto milik order
--        (yang sudah approved/fulfilled dibiarkan; FK source_order_id -> set null oleh DB)
--    (e) hapus order (cascade: order_items, order_payments, dll. ikut terhapus;
--        order_deposit_releases juga cascade karena FK order_id on delete cascade)
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

  -- (c) Batalkan stock_movements pending milik order
  update public.stock_movements
  set status = 'cancelled'
  where source_id = p_order_id
    and status = 'pending'
    and user_id = v_uid;

  -- (d) Batalkan stock_requests draft_auto milik order
  --     source_order_id akan di-set null oleh DB (on delete set null) saat order dihapus,
  --     tapi kita perlu update status dulu agar tidak tergantung ke order
  update public.stock_requests
  set status = 'cancelled'
  where source_order_id = p_order_id
    and status = 'draft_auto'
    and user_id = v_uid;

  -- (e) Hapus order (trigger trg_guard_order_delete akan cek aturan keras 11)
  delete from public.orders where id = p_order_id and user_id = v_uid;
end;
$$;

revoke execute on function public.delete_order(uuid) from public, anon;
grant  execute on function public.delete_order(uuid) to authenticated;
