-- Migration: 20260930000002_bulk_create_stock_requests.sql
-- Menambahkan kolom batch_id dan RPC create_bulk_stock_requests untuk pengajuan restock banyak item sekaligus secara atomik.

alter table public.stock_requests
  add column if not exists batch_id uuid;

comment on column public.stock_requests.batch_id is 'ID kelompok/batch jika pengajuan dibuat bersamaan dalam 1 transaksi bulk';

create index if not exists idx_stock_requests_batch_id on public.stock_requests(batch_id);

-- RPC: create_bulk_stock_requests
create or replace function public.create_bulk_stock_requests(
  p_items jsonb,
  p_requested_by uuid,
  p_fulfillment_type varchar,
  p_global_reason text default null,
  p_batch_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_item jsonb;
  v_inserted_count int := 0;
  v_batch_id uuid;
  v_mat_id uuid;
  v_color_id uuid;
  v_qty numeric;
  v_unit varchar;
  v_est_price numeric;
  v_reason text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Sesi login tidak valid.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Daftar item pengajuan tidak boleh kosong.';
  end if;

  v_batch_id := coalesce(p_batch_id, gen_random_uuid());

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_mat_id := (v_item->>'material_id')::uuid;
    if v_mat_id is null then
      raise exception 'Material ID wajib diisi.';
    end if;

    v_qty := (v_item->>'quantity_needed')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Jumlah kebutuhan harus lebih dari 0.';
    end if;

    if nullif(trim(v_item->>'material_color_id'), '') is not null then
      v_color_id := (v_item->>'material_color_id')::uuid;
    else
      v_color_id := null;
    end if;

    v_unit := coalesce(nullif(trim(v_item->>'unit'), ''), 'pcs');
    
    if nullif(trim(v_item->>'estimated_price'), '') is not null then
      v_est_price := (v_item->>'estimated_price')::numeric;
    else
      v_est_price := null;
    end if;

    v_reason := coalesce(nullif(trim(v_item->>'reason'), ''), nullif(trim(p_global_reason), ''));

    insert into public.stock_requests (
      user_id,
      material_id,
      material_color_id,
      requested_by,
      quantity_needed,
      unit,
      estimated_price,
      reason,
      status,
      fulfillment_type,
      source_type,
      batch_id
    ) values (
      v_user_id,
      v_mat_id,
      v_color_id,
      p_requested_by,
      v_qty,
      v_unit,
      v_est_price,
      v_reason,
      'pending',
      coalesce(nullif(trim(p_fulfillment_type), ''), 'spj'),
      'manual',
      v_batch_id
    );

    v_inserted_count := v_inserted_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'count', v_inserted_count,
    'batch_id', v_batch_id
  );
end;
$$;

revoke execute on function public.create_bulk_stock_requests(jsonb, uuid, varchar, text, uuid) from public, anon;
grant execute on function public.create_bulk_stock_requests(jsonb, uuid, varchar, text, uuid) to authenticated;
