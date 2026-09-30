-- Migration: 20260930000001_bulk_approve_stock_requests.sql
-- Menambahkan RPC bulk_approve_stock_requests untuk menyetujui banyak
-- pengajuan restock gudang sekaligus dalam satu operasi atomik.

-- RPC: bulk_approve_stock_requests
-- Menerima array UUID pengajuan, meng-update semua yang statusnya 'pending'
-- milik user yang terautentikasi ke 'approved' secara atomik.
-- Return: jumlah baris yang berhasil diupdate.
create or replace function public.bulk_approve_stock_requests(
  p_request_ids uuid[],
  p_approved_by uuid default null
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_updated_count integer;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if p_request_ids is null or array_length(p_request_ids, 1) is null then
    raise exception 'Daftar ID pengajuan tidak boleh kosong';
  end if;

  update public.stock_requests
  set
    status      = 'approved',
    approved_by = p_approved_by,
    approved_at = now()
  where
    id        = any(p_request_ids)
    and user_id   = v_user_id
    and status    = 'pending';

  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    raise exception 'Tidak ada pengajuan yang valid untuk disetujui (pastikan status masih pending dan milik akun ini)';
  end if;

  return v_updated_count;
end;
$$;

-- Permissions
revoke execute on function public.bulk_approve_stock_requests(uuid[], uuid) from public, anon;
grant execute on function public.bulk_approve_stock_requests(uuid[], uuid) to authenticated;
