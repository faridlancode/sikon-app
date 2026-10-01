-- Multi purchase units per material and transaction-time conversion snapshots.

alter table public.materials
add column if not exists purchase_units jsonb not null default '[]'::jsonb;

update public.materials
set
    purchase_units = jsonb_build_array(
        jsonb_build_object(
            'id',
            'legacy-primary',
            'name',
            purchase_unit,
            'conversion_rate',
            case
                when lower(purchase_unit) = 'roll' then null
                else conversion_rate
            end,
            'is_variable',
            lower(purchase_unit) = 'roll',
            'is_primary',
            true,
            'is_active',
            true
        )
    )
where
    purchase_unit is not null
    and purchase_units = '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'materials_purchase_units_is_array'
      and conrelid = 'public.materials'::regclass
  ) then
    alter table public.materials
      add constraint materials_purchase_units_is_array
      check (jsonb_typeof(purchase_units) = 'array');
  end if;
end;
$$;

alter table public.stock_requests
add column if not exists conversion_rate numeric not null default 1,
add column if not exists is_variable_unit boolean not null default false;

alter table public.purchasing_report_items
add column if not exists conversion_rate numeric not null default 1,
add column if not exists is_variable_unit boolean not null default false,
add column if not exists base_quantity numeric null;

alter table public.supplier_purchase_items
add column if not exists conversion_rate numeric not null default 1,
add column if not exists is_variable_unit boolean not null default false,
add column if not exists base_quantity numeric null;

alter table public.stock_movements
add column if not exists source_line_id uuid null;

update public.stock_requests sr
set
    conversion_rate = coalesce(m.conversion_rate, 1)
from public.materials m
where
    sr.material_id = m.id
    and sr.unit = m.purchase_unit
    and sr.conversion_rate = 1;

update public.stock_requests sr
set
    conversion_rate = 0,
    is_variable_unit = true
from public.materials m
where
    sr.material_id = m.id
    and lower(m.purchase_unit) = 'roll'
    and sr.unit = m.purchase_unit;

update public.purchasing_report_items pri
set
    conversion_rate = coalesce(m.conversion_rate, 1)
from public.materials m
where
    pri.material_id = m.id
    and pri.unit = m.purchase_unit
    and pri.conversion_rate = 1;

update public.purchasing_report_items pri
set
    conversion_rate = 0,
    is_variable_unit = true
from public.materials m
where
    pri.material_id = m.id
    and lower(m.purchase_unit) = 'roll'
    and pri.unit = m.purchase_unit;

update public.supplier_purchase_items spi
set
    conversion_rate = coalesce(m.conversion_rate, 1)
from public.materials m
where
    spi.material_id = m.id
    and spi.unit = m.purchase_unit
    and spi.conversion_rate = 1;

update public.supplier_purchase_items spi
set
    conversion_rate = 0,
    is_variable_unit = true
from public.materials m
where
    spi.material_id = m.id
    and lower(m.purchase_unit) = 'roll'
    and spi.unit = m.purchase_unit;

update public.purchasing_report_items
set
    base_quantity = quantity * conversion_rate
where
    not is_variable_unit
    and base_quantity is null;

update public.supplier_purchase_items
set
    base_quantity = quantity * conversion_rate
where
    not is_variable_unit
    and base_quantity is null;

comment on column public.materials.purchase_units is 'Daftar satuan beli material beserta konversi tetap/variabel dan satuan utama untuk tampilan stok.';

comment on column public.stock_requests.conversion_rate is 'Snapshot jumlah satuan stok dasar per satuan pengajuan; 0 untuk satuan variabel.';

comment on column public.stock_requests.is_variable_unit is 'True jika isi satuan pengajuan harus diukur saat penerimaan.';

comment on column public.purchasing_report_items.base_quantity is 'Jumlah aktual satuan stok dasar untuk item SPJ; wajib untuk satuan variabel.';

comment on column public.supplier_purchase_items.base_quantity is 'Jumlah aktual satuan stok dasar saat barang supplier diterima; wajib untuk satuan variabel.';

comment on column public.stock_movements.source_line_id is 'ID baris sumber pembelian untuk mengaitkan mutasi stok dengan rincian transaksi.';