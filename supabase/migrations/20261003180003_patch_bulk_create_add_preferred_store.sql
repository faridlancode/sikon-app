-- =========================================================================
-- SIKon — Patch create_bulk_stock_requests: tambah preferred_store
-- =========================================================================
-- Menambahkan parameter p_preferred_store ke RPC create_bulk_stock_requests
-- agar field "Nama Toko / Supplier Rekomendasi" dari StockRequestModal
-- tersimpan ke kolom preferred_store di stock_requests.
-- =========================================================================

create or replace function public.create_bulk_stock_requests(
  p_items           jsonb,
  p_requested_by    uuid,
  p_fulfillment_type varchar,
  p_global_reason   text    default null,
  p_preferred_store text    default null,
  p_batch_id        uuid    default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id       uuid;
  v_item          jsonb;
  v_inserted_count int := 0;
  v_batch_id      uuid;
  v_mat_id        uuid;
  v_color_id      uuid;
  v_qty           numeric;
  v_unit          varchar;
  v_est_price     numeric;
  v_reason        text;
  v_conv_rate     numeric;
  v_is_variable   boolean;
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

    v_reason := coalesce(
      nullif(trim(v_item->>'reason'), ''),
      nullif(trim(p_global_reason), '')
    );

    v_conv_rate  := coalesce(nullif(v_item->>'conversion_rate', '')::numeric, 1);
    v_is_variable := coalesce((v_item->>'is_variable_unit')::boolean, false);

    insert into public.stock_requests (
      user_id,
      material_id,
      material_color_id,
      requested_by,
      quantity_needed,
      unit,
      conversion_rate,
      is_variable_unit,
      estimated_price,
      reason,
      preferred_store,
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
      v_conv_rate,
      v_is_variable,
      v_est_price,
      v_reason,
      nullif(trim(p_preferred_store), ''),
      'pending',
      coalesce(nullif(trim(p_fulfillment_type), ''), 'spj'),
      'manual',
      v_batch_id
    );

    v_inserted_count := v_inserted_count + 1;
  end loop;

  return jsonb_build_object(
    'success',  true,
    'count',    v_inserted_count,
    'batch_id', v_batch_id
  );
end;
$$;

revoke execute on function public.create_bulk_stock_requests(jsonb, uuid, varchar, text, uuid) from public, anon;
revoke execute on function public.create_bulk_stock_requests(jsonb, uuid, varchar, text, text, uuid) from public, anon;
grant  execute on function public.create_bulk_stock_requests(jsonb, uuid, varchar, text, text, uuid) to authenticated;
