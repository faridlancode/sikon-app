-- ============================================================================
-- Migration: 20261021090000_po_gate_purchasing_link.sql
-- Fase 3a: Gate Produksi Hibrida (Soft Gate Rekap), Lepas Lebih Awal,
--          dan Integrasi Pengajuan Bahan (Stock Requests) ke Batch PO
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Kolom orders.released_early_at & View orders_with_balance
-- ----------------------------------------------------------------------------

alter table public.orders
  add column if not exists released_early_at timestamptz null;

comment on column public.orders.released_early_at is
  'Waktu order dilepas ke produksi lebih awal sebelum PO ditutup.';

-- Update view orders_with_balance (menambahkan released_early_at di AKHIR)
create or replace view public.orders_with_balance
with (security_invoker = true) as
select
  -- 12 kolom orders awal
  o.id,
  o.user_id,
  o.order_id,
  o.sales_id,
  o.customer_name,
  o.total_price,
  o.ongkir,
  o.status,
  o.production_status,
  o.bonus_paid,
  o.order_date,
  o.created_at,
  -- 4 kolom kalkulasi keuangan
  s.name as sales_name,
  (o.total_price + o.ongkir) as grand_total,
  coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0) as paid_amount,
  (o.total_price + o.ongkir) - (coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)) as remaining_amount,
  -- 2 kolom order_type
  o.order_type,
  o.is_order_type_manual_override,
  -- 4 kolom Batch PO
  o.po_batch_id,
  pb.code as po_code,
  pb.status as po_status,
  pb.name as po_name,
  -- Kolom baru Fase 3a di PALING AKHIR (agar kolom lama tidak bergeser)
  o.released_early_at
from public.orders o
left join public.sales s on s.id = o.sales_id
left join (
  select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
) p on p.order_id = o.id
left join (
  select order_id, sum(amount) as released_amount from public.order_deposit_releases group by order_id
) r on r.order_id = o.id
left join public.po_batches pb on pb.id = o.po_batch_id;

grant select on public.orders_with_balance to authenticated;


-- ----------------------------------------------------------------------------
-- 2. Integrasi stock_requests dengan po_batches (Link, Trigger, Backfill)
-- ----------------------------------------------------------------------------

alter table public.stock_requests
  add column if not exists po_batch_id uuid references public.po_batches(id) on delete set null;

create index if not exists idx_stock_requests_po_batch_id on public.stock_requests(po_batch_id);

comment on column public.stock_requests.po_batch_id is
  'Batch PO yang terkait dengan pengajuan bahan (diisi otomatis dari order bila sumbernya order).';

-- Trigger BEFORE INSERT: bila po_batch_id null dan source_order_id terisi, isi dari orders.po_batch_id
create or replace function public.fn_stock_requests_assign_po_batch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.po_batch_id is null and new.source_order_id is not null then
    select po_batch_id into new.po_batch_id
    from public.orders
    where id = new.source_order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stock_requests_assign_po_batch on public.stock_requests;
create trigger trg_stock_requests_assign_po_batch
before insert on public.stock_requests
for each row execute function public.fn_stock_requests_assign_po_batch();

-- Backfill data historis dari source_order_id
update public.stock_requests sr
set po_batch_id = o.po_batch_id
from public.orders o
where sr.source_order_id = o.id
  and sr.po_batch_id is null
  and o.po_batch_id is not null;


-- ----------------------------------------------------------------------------
-- 3. Check Constraint po_batch_events (tambah 'rekap_early')
-- ----------------------------------------------------------------------------

alter table public.po_batch_events drop constraint if exists po_batch_events_event_check;
alter table public.po_batch_events
  add constraint po_batch_events_event_check
  check (event in ('opened', 'closed', 'reopened', 'order_deleted_after_close', 'rekap_bulk', 'updated', 'rekap_early'));


-- ----------------------------------------------------------------------------
-- 4. Gerbang Lunak di toggle_order_stage (Signature Tetap Identik)
-- ----------------------------------------------------------------------------

create or replace function public.toggle_order_stage(
  p_order_id uuid,
  p_stage    varchar,
  p_done     boolean,
  p_notes    text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id      uuid := auth.uid();
  v_order        public.orders;
  v_status       varchar;
  v_done_at      timestamptz;
  v_remaining    numeric;
  v_bypass       text;
  v_gate_enabled boolean := false;
  v_po_name      text;
  v_po_code      text;
  v_po_status    varchar;
begin
  if v_user_id is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_stage in ('potong', 'jahit') then
    raise exception 'Stage % tidak bisa di-toggle manual — diatur otomatis dari sistem', p_stage
      using errcode = 'P0001';
  end if;

  if p_stage not in ('quotation','rekap','bordir','finishing','qc','packaging','pelunasan','kirim') then
    raise exception 'Stage tidak valid: %', p_stage
      using errcode = 'P0001';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = v_user_id;

  if not found then
    raise exception 'Order tidak ditemukan' using errcode = 'P0001';
  end if;

  -- GERBANG LUNAK FASE 3a: Gate Produksi PO
  -- Jika p_stage = 'rekap', p_done = true, saklar po_gate_production aktif, PO order masih 'open',
  -- dan bypass lokal transaksi tidak aktif, maka tolak.
  v_bypass := coalesce(current_setting('app.po_release_bypass', true), 'off');

  if p_stage = 'rekap' and p_done and v_bypass <> 'on' then
    select coalesce(po_gate_production, false) into v_gate_enabled
    from public.company_settings
    where user_id = v_user_id;

    if coalesce(v_gate_enabled, false) = true and v_order.po_batch_id is not null then
      select name, code, status into v_po_name, v_po_code, v_po_status
      from public.po_batches
      where id = v_order.po_batch_id and user_id = v_user_id;

      if v_po_status = 'open' then
        raise exception 'PO % belum ditutup. Tutup PO atau gunakan Lepas ke Produksi Lebih Awal.',
          coalesce(v_po_name, v_po_code, 'Batch PO')
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- STRICT GATE CHECK PELUNASAN:
  -- Dilarang menandai stage 'kirim' atau 'pelunasan' sebagai selesai jika masih ada sisa tagihan
  if p_stage in ('kirim', 'pelunasan') and p_done then
    select remaining_amount into v_remaining
    from public.orders_with_balance
    where id = p_order_id;

    if coalesce(v_remaining, 0) > 0 then
      raise exception 'Pesanan belum lunas (sisa tagihan: Rp %). Pelunasan wajib diselesaikan sebelum barang dapat ditandai selesai/dikirim.',
        to_char(v_remaining, 'FM999,999,999')
        using errcode = 'P0001';
    end if;
  end if;

  v_status  := case when p_done then 'done' else 'pending' end;
  v_done_at := case when p_done then now() else null end;

  perform public.upsert_order_stage_event(
    v_user_id, p_order_id, p_stage, v_status, v_done_at, p_notes
  );

  -- Efek samping: bordir selesai → set ready_for_sewing_at semua order_items
  if p_stage = 'bordir' and p_done then
    update public.order_items
    set ready_for_sewing_at = now()
    where order_id = p_order_id
      and user_id  = v_user_id
      and ready_for_sewing_at is null;
  end if;

  -- Efek samping: packaging selesai → otomatis status pesanan menjadi 'ready' (Siap Kirim)
  if p_stage = 'packaging' then
    if p_done then
      update public.orders
      set production_status = 'ready'
      where id = p_order_id and user_id = v_user_id and production_status = 'production';
    else
      update public.orders
      set production_status = 'production'
      where id = p_order_id and user_id = v_user_id and production_status = 'ready';
    end if;
  end if;

  -- Efek samping: pengiriman selesai → otomatis status pesanan menjadi 'completed' (Selesai)
  if p_stage = 'kirim' then
    if p_done then
      update public.orders
      set production_status = 'completed'
      where id = p_order_id and user_id = v_user_id;
    else
      update public.orders
      set production_status = 'ready'
      where id = p_order_id and user_id = v_user_id and production_status = 'completed';
    end if;
  end if;
end;
$$;

revoke execute on function public.toggle_order_stage(uuid, varchar, boolean, text) from public, anon;
grant  execute on function public.toggle_order_stage(uuid, varchar, boolean, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 5. RPC release_order_early (Lepas Order ke Produksi Lebih Awal)
-- ----------------------------------------------------------------------------

create or replace function public.release_order_early(
  p_order_id uuid,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid       uuid := auth.uid();
  v_order     public.orders;
  v_po        public.po_batches;
  v_stage_st  varchar;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Alasan lepas ke produksi lebih awal wajib diisi' using errcode = 'P0001';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = v_uid;

  if not found then
    raise exception 'Order tidak ditemukan' using errcode = 'P0001';
  end if;

  if v_order.po_batch_id is null then
    raise exception 'Order tidak terhubung ke Batch PO mana pun' using errcode = 'P0001';
  end if;

  select * into v_po
  from public.po_batches
  where id = v_order.po_batch_id and user_id = v_uid;

  if not found then
    raise exception 'Batch PO order tidak ditemukan' using errcode = 'P0001';
  end if;

  if v_po.status = 'closed' then
    raise exception 'PO % sudah ditutup. Tidak perlu melepas order lebih awal.',
      coalesce(v_po.name, v_po.code)
      using errcode = 'P0001';
  end if;

  -- Idempotensi: Cek apakah stage 'rekap' sudah 'done' dan order sudah tercatat released_early_at
  select status into v_stage_st
  from public.order_stage_events
  where order_id = p_order_id and stage = 'rekap' and user_id = v_uid;

  if coalesce(v_stage_st, 'pending') = 'done' and v_order.released_early_at is not null then
    return;
  end if;

  -- Set bypass lokal transaksi agar toggle_order_stage tidak terblokir
  perform set_config('app.po_release_bypass', 'on', true);

  -- Panggil toggle_order_stage untuk menandai stage 'rekap' selesai
  perform public.toggle_order_stage(
    p_order_id,
    'rekap',
    true,
    'Dilepas ke produksi lebih awal: ' || trim(p_reason)
  );

  -- Catat waktu rilis lebih awal pada order
  update public.orders
  set released_early_at = now()
  where id = p_order_id and user_id = v_uid;

  -- Catat event 'rekap_early' pada po_batch_events
  insert into public.po_batch_events (user_id, po_batch_id, event, reason, payload)
  values (
    v_uid,
    v_order.po_batch_id,
    'rekap_early',
    trim(p_reason),
    jsonb_build_object(
      'order_id', v_order.id,
      'order_code', v_order.order_id,
      'reason', trim(p_reason)
    )
  );
end;
$$;

revoke execute on function public.release_order_early(uuid, text) from public, anon;
grant  execute on function public.release_order_early(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 6. REVISI close_po_batch (Bypass Gerbang & Lewati Order yang Sudah Rekap Done)
-- ----------------------------------------------------------------------------

create or replace function public.close_po_batch(
  p_batch_id     uuid,
  p_early_reason text default null,
  p_mark_rekap   boolean default true,
  p_note         text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid            uuid := auth.uid();
  v_today_wib      date := (now() at time zone 'Asia/Jakarta')::date;
  v_batch          public.po_batches;
  v_is_early       boolean := false;
  v_total_orders   integer := 0;
  v_total_pcs      numeric := 0;
  v_unit_orders    integer := 0;
  v_unit_pcs       numeric := 0;
  v_priority_orders integer := 0;
  v_priority_pcs   numeric := 0;
  v_total_price    numeric := 0;
  v_total_ongkir   numeric := 0;
  v_total_paid     numeric := 0;
  v_total_remaining numeric := 0;
  v_quota_used_pct numeric := null;
  v_total_hpp      numeric := 0;
  v_by_sales       jsonb := '[]'::jsonb;
  v_by_category    jsonb := '[]'::jsonb;
  v_by_product     jsonb := '[]'::jsonb;
  v_fabrics        jsonb := '[]'::jsonb;
  v_orders_list    jsonb := '[]'::jsonb;
  v_order_rec      record;
  v_failed_rekap_ids jsonb := '[]'::jsonb;
  v_failed_rekap_cnt integer := 0;
  v_snapshot       jsonb;
  v_closer_name    text;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_batch
  from public.po_batches
  where id = p_batch_id and user_id = v_uid;

  if not found then
    raise exception 'Batch PO tidak ditemukan' using errcode = 'P0001';
  end if;

  -- 1. Idempoten: bila sudah closed, kembalikan snapshot yang ada
  if v_batch.status = 'closed' then
    return v_batch.close_snapshot;
  end if;

  -- 2. Ditutup lebih awal bila tanggal hari ini WIB < tanggal selesai (end_date)
  if v_today_wib < v_batch.end_date then
    v_is_early := true;
    if p_early_reason is null or trim(p_early_reason) = '' then
      raise exception 'Penutupan PO sebelum tanggal selesai (%) memerlukan alasan penutupan lebih awal',
        to_char(v_batch.end_date, 'YYYY-MM-DD')
        using errcode = 'P0001';
    end if;
  end if;

  -- 3. Agregasi data snapshot untuk order dalam PO ini
  select
    coalesce(count(*), 0)::integer,
    coalesce(sum(sub.total_pcs), 0)::numeric,
    coalesce(count(*) filter (where sub.order_type = 'satuan'), 0)::integer,
    coalesce(sum(case when sub.order_type = 'satuan' then sub.total_pcs else 0 end), 0)::numeric,
    coalesce(count(*) filter (where sub.order_type = 'prioritas'), 0)::integer,
    coalesce(sum(case when sub.order_type = 'prioritas' then sub.total_pcs else 0 end), 0)::numeric,
    coalesce(sum(sub.total_price), 0)::numeric,
    coalesce(sum(sub.ongkir), 0)::numeric,
    coalesce(sum(sub.paid_amount), 0)::numeric,
    coalesce(sum(sub.remaining_amount), 0)::numeric
  into
    v_total_orders,
    v_total_pcs,
    v_unit_orders,
    v_unit_pcs,
    v_priority_orders,
    v_priority_pcs,
    v_total_price,
    v_total_ongkir,
    v_total_paid,
    v_total_remaining
  from (
    select
      o.id,
      coalesce(o.order_type, 'satuan') as order_type,
      o.total_price,
      o.ongkir,
      coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0) as paid_amount,
      (o.total_price + o.ongkir) - (coalesce(p.paid_amount, 0) - coalesce(r.released_amount, 0)) as remaining_amount,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs
    from public.orders o
    left join public.order_items oi on oi.order_id = o.id
    left join (
      select order_id, sum(amount) as paid_amount from public.order_payments group by order_id
    ) p on p.order_id = o.id
    left join (
      select order_id, sum(amount) as released_amount from public.order_deposit_releases group by order_id
    ) r on r.order_id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by o.id, o.order_type, o.total_price, o.ongkir, p.paid_amount, r.released_amount
  ) sub;

  if v_batch.quota_qty is not null and v_batch.quota_qty > 0 then
    v_quota_used_pct := round((v_total_pcs / v_batch.quota_qty) * 100, 2);
  end if;

  -- 3.1 Total HPP snapshot dari order_items
  select coalesce(sum(coalesce(oi.hpp_total_snapshot, (oi.qty * coalesce(oi.hpp_per_unit_snapshot, 0)))), 0)::numeric
  into v_total_hpp
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.po_batch_id = p_batch_id and o.user_id = v_uid;

  -- 3.2 Breakdown per sales
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_sales
  from (
    select
      s.id::text as sales_id,
      coalesce(s.name, 'Tanpa Sales') as sales_name,
      count(distinct o.id)::integer as order_count,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(o.total_price), 0)::numeric as total_price
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    left join public.order_items oi on oi.order_id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by s.id, s.name
    order by total_price desc
  ) sub;

  -- 3.3 Breakdown per kategori produk
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_category
  from (
    select
      coalesce(pc.name, 'Tanpa Kategori') as category,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      coalesce(sum(oi.qty * oi.price), 0)::numeric as total_price
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.product_categories pc on pc.id = oi.category_id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by pc.name
    order by total_pcs desc
  ) sub;

  -- 3.4 Breakdown per produk
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_product
  from (
    select
      oi.product_id::text as product_id,
      oi.name_item as product_name,
      coalesce(pc.name, 'Tanpa Kategori') as category,
      sum(oi.qty)::numeric as total_pcs,
      sum(oi.qty * oi.price)::numeric as total_price
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.product_categories pc on pc.id = oi.category_id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by oi.product_id, oi.name_item, pc.name
    order by total_pcs desc
  ) sub;

  -- 3.5 Rekap kebutuhan kain (BOM material & warna) vs stok terkini saat close
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_fabrics
  from (
    select
      m.id::text as material_id,
      m.name as material_name,
      mc.id::text as color_id,
      coalesce(mc.color_name, 'Polos') as color_name,
      round(sum(oi.qty * coalesce(oif.usage_qty_snapshot, 0)), 2)::numeric as required_meters,
      coalesce(mc.stock_qty, m.stock_qty, 0)::numeric as stock_meters_at_close,
      greatest(0, round(sum(oi.qty * coalesce(oif.usage_qty_snapshot, 0)), 2) - coalesce(mc.stock_qty, m.stock_qty, 0))::numeric as shortage_meters
    from public.order_item_fabrics oif
    join public.order_items oi on oi.id = oif.order_item_id
    join public.orders o on o.id = oi.order_id
    join public.materials m on m.id = oif.material_id
    left join public.material_colors mc on mc.id = oif.material_color_id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by m.id, m.name, mc.id, mc.color_name, coalesce(mc.stock_qty, m.stock_qty, 0)
    order by m.name asc, mc.color_name asc
  ) sub;

  -- 3.6 Daftar order saat close
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_orders_list
  from (
    select
      o.id::text as id,
      o.order_id,
      o.order_date::text as order_date,
      coalesce(o.order_type, 'satuan') as order_type,
      o.customer_name,
      s.name as sales_name,
      coalesce(sum(oi.qty), 0)::numeric as total_pcs,
      o.total_price,
      o.ongkir,
      o.status as payment_status,
      o.production_status
    from public.orders o
    left join public.sales s on s.id = o.sales_id
    left join public.order_items oi on oi.order_id = o.id
    where o.po_batch_id = p_batch_id and o.user_id = v_uid
    group by o.id, o.order_id, o.order_date, o.order_type, o.customer_name, s.name, o.total_price, o.ongkir, o.status, o.production_status
    order by o.created_at asc
  ) sub;

  select coalesce(company_name, 'Admin') into v_closer_name
  from public.company_settings where user_id = v_uid limit 1;

  -- 4. Opsi tandai Rekap massal untuk seluruh order
  -- REVISI FASE 3a:
  -- 1) Aktifkan bypass lokal selama loop agar tidak terhalang gerbang po_gate_production.
  -- 2) Lewati order yang stage Rekap-nya sudah 'done' (misal: dilepas lebih awal) dan jangan dihitung gagal.
  if p_mark_rekap and v_total_orders > 0 then
    perform set_config('app.po_release_bypass', 'on', true);

    for v_order_rec in (
      select o.id, os.status as rekap_status
      from public.orders o
      left join public.order_stage_events os on os.order_id = o.id and os.stage = 'rekap' and os.user_id = v_uid
      where o.po_batch_id = p_batch_id and o.user_id = v_uid
    ) loop
      -- Jika sudah 'done', lewati tanpa mengubah dan tanpa menghitung gagal
      if coalesce(v_order_rec.rekap_status, 'pending') = 'done' then
        continue;
      end if;

      begin
        perform public.toggle_order_stage(v_order_rec.id, 'rekap', true, 'Ditandai selesai otomatis saat tutup PO');
      exception when others then
        v_failed_rekap_cnt := v_failed_rekap_cnt + 1;
        v_failed_rekap_ids := v_failed_rekap_ids || to_jsonb(v_order_rec.id::text);
      end;
    end loop;

    insert into public.po_batch_events (user_id, po_batch_id, event, reason, payload)
    values (
      v_uid,
      p_batch_id,
      'rekap_bulk',
      'Tandai Rekap selesai untuk semua order saat tutup PO',
      jsonb_build_object(
        'total_orders', v_total_orders,
        'failed_count', v_failed_rekap_cnt,
        'failed_order_ids', v_failed_rekap_ids
      )
    );
  end if;

  -- Susun snapshot versi 1
  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'closed_at', now(),
    'closed_by', v_uid,
    'closed_by_name', coalesce(v_closer_name, 'Admin'),
    'is_early', v_is_early,
    'close_early_reason', p_early_reason,
    'close_note', p_note,
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'code', v_batch.code,
      'name', v_batch.name,
      'start_date', v_batch.start_date,
      'end_date', v_batch.end_date,
      'period_year', v_batch.period_year,
      'period_month', v_batch.period_month,
      'quota_qty', v_batch.quota_qty
    ),
    'summary', jsonb_build_object(
      'total_orders', v_total_orders,
      'total_pcs', v_total_pcs,
      'unit_orders', v_unit_orders,
      'unit_pcs', v_unit_pcs,
      'priority_orders', v_priority_orders,
      'priority_pcs', v_priority_pcs,
      'total_price', v_total_price,
      'total_ongkir', v_total_ongkir,
      'total_paid', v_total_paid,
      'total_remaining', v_total_remaining,
      'quota_qty', v_batch.quota_qty,
      'quota_used_pct', v_quota_used_pct,
      'total_hpp_estimate', v_total_hpp,
      'estimated_margin', (v_total_price - v_total_hpp)
    ),
    'sales_breakdown', v_by_sales,
    'category_breakdown', v_by_category,
    'product_breakdown', v_by_product,
    'fabric_requirements', v_fabrics,
    'orders', v_orders_list,
    'rekap_bulk_result', jsonb_build_object(
      'marked', p_mark_rekap,
      'failed_count', v_failed_rekap_cnt,
      'failed_order_ids', v_failed_rekap_ids
    )
  );

  -- 5. Perbarui status PO menjadi closed beserta snapshot
  update public.po_batches
  set
    status = 'closed',
    closed_at = now(),
    closed_by = v_uid,
    close_early_reason = p_early_reason,
    close_note = p_note,
    close_snapshot = v_snapshot
  where id = p_batch_id and user_id = v_uid;

  -- 6. Catat audit event penutupan PO
  insert into public.po_batch_events (user_id, po_batch_id, event, reason, payload)
  values (
    v_uid,
    p_batch_id,
    'closed',
    coalesce(p_early_reason, p_note, 'Tutup PO'),
    jsonb_build_object(
      'is_early_close', v_is_early,
      'early_reason', p_early_reason,
      'note', p_note,
      'snapshot_summary', v_snapshot->'summary'
    )
  );

  return v_snapshot;
end;
$$;

revoke execute on function public.close_po_batch(uuid, text, boolean, text) from public, anon;
grant  execute on function public.close_po_batch(uuid, text, boolean, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 7. REVISI delete_po_batch (Tambah Syarat Tidak Punya stock_requests)
-- ----------------------------------------------------------------------------

create or replace function public.delete_po_batch(
  p_batch_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_batch public.po_batches;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_batch
  from public.po_batches
  where id = p_batch_id and user_id = v_uid;

  if not found then
    raise exception 'Batch PO tidak ditemukan' using errcode = 'P0001';
  end if;

  if coalesce(v_batch.is_legacy, false) = true then
    raise exception 'Batch PO legacy tidak dapat dihapus' using errcode = 'P0001';
  end if;

  if v_batch.status = 'closed' then
    raise exception 'Batch PO yang sudah ditutup tidak dapat dihapus' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.orders
    where po_batch_id = p_batch_id and user_id = v_uid
  ) then
    raise exception 'Tidak dapat menghapus PO yang sudah memiliki pesanan' using errcode = 'P0001';
  end if;

  -- Syarat tambahan Fase 3a: Tolak bila PO memiliki pengajuan bahan (stock requests)
  if exists (
    select 1 from public.stock_requests
    where po_batch_id = p_batch_id and user_id = v_uid
  ) then
    raise exception 'Tidak dapat menghapus PO yang memiliki pengajuan bahan (stock requests)' using errcode = 'P0001';
  end if;

  delete from public.po_batches
  where id = p_batch_id and user_id = v_uid;

  return true;
end;
$$;

revoke execute on function public.delete_po_batch(uuid) from public, anon;
grant  execute on function public.delete_po_batch(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 8. RPC get_po_purchase_list (Daftar Belanja Agregat dari stock_requests PO)
-- ----------------------------------------------------------------------------

create or replace function public.get_po_purchase_list(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_po  public.po_batches;
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select * into v_po
  from public.po_batches
  where id = p_batch_id and user_id = v_uid;

  if not found then
    raise exception 'Batch PO tidak ditemukan' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_res
  from (
    select
      sr.material_id,
      m.name as material_name,
      sr.material_color_id,
      mc.color_name,
      coalesce(sr.unit, m.unit, 'meter') as unit,
      sum(case when sr.status <> 'cancelled' then sr.quantity_needed else 0 end)::numeric as total_quantity_needed,
      sum(case when sr.status = 'fulfilled' then sr.quantity_needed else 0 end)::numeric as total_quantity_fulfilled,
      count(*)::integer as total_request_count,
      jsonb_build_object(
        'draft_auto', count(*) filter (where sr.status = 'draft_auto'),
        'pending', count(*) filter (where sr.status = 'pending'),
        'in_progress', count(*) filter (where sr.status = 'in_progress'),
        'fulfilled', count(*) filter (where sr.status = 'fulfilled'),
        'cancelled', count(*) filter (where sr.status = 'cancelled')
      ) as status_breakdown
    from public.stock_requests sr
    join public.materials m on m.id = sr.material_id
    left join public.material_colors mc on mc.id = sr.material_color_id
    where sr.po_batch_id = p_batch_id
      and sr.user_id = v_uid
    group by sr.material_id, m.name, sr.material_color_id, mc.color_name, coalesce(sr.unit, m.unit, 'meter')
    order by m.name asc, mc.color_name asc nulls first
  ) sub;

  return jsonb_build_object(
    'po_batch', jsonb_build_object(
      'id', v_po.id,
      'code', v_po.code,
      'name', v_po.name,
      'status', v_po.status
    ),
    'items', v_res
  );
end;
$$;

revoke execute on function public.get_po_purchase_list(uuid) from public, anon;
grant  execute on function public.get_po_purchase_list(uuid) to authenticated;
