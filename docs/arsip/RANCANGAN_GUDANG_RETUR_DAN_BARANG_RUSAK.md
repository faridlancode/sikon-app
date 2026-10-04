# Desain Sistem & Spesifikasi Implementasi: Retur Material Cacat Produksi & Fitur Edit Pengajuan Restock

> **Status Dokumen:** Siap Diimplementasi (Approved Design)  
> **Target Modul:** Modul Gudang (`/warehouse`), Permintaan Restock (`stock_requests`), Mutasi Stok Cacat  
> **Sumber Daya:** `docs/RANCANGAN_PERBAIKAN_FLOW_GUDANG_v2.md`, `src/pages/WarehousePage.tsx`, `src/types.ts`

---

## 1. Latar Belakang & Aturan Bisnis yang Disetujui

1. **Alur Lapangan Retur Aksesoris Cacat**:
   - Saat menjahit pakaian, penjahit kerap menemukan aksesoris yang cacat fisik dari toko (misal: **sleting macet / rel patah**, **kain sobek**, **label rajut cacat printing**).
   - Penjahit membawa aksesoris rusak ke loket gudang.
   - **Staf Gudang yang menginput ke sistem**: Staf gudang membuka form penerimaan retur cacat, memilih nama penjahit, order terkait, material yang rusak, qty rusak, dan catatan alasan cacat (misal: *"sleting macet"*).

2. **Penggantian Barang & Kebijakan Stok Habis**:
   - Jika stok pengganti di gudang **tersedia**: Gudang langsung menyerahkan barang pengganti yang bagus ke penjahit (stok aktif berkurang, stok cacat dicatat).
   - Jika stok pengganti di gudang **habis (0 pcs)**: Sistem otomatis membuatkan draf **`stock_requests` darurat** ke bagian purchasing.

3. **Perlakuan Barang Cacat (Disposisi)**:
   - Barang rusak **langsung dianggap susut / afkir (*scrap / write-off*)**, tidak perlu alur rumit penagihan kembali ke supplier toko.

4. **Fitur Tambahan: Edit Permintaan Restock (`stock_requests`)**:
   - Staf Gudang dapat mengedit `quantity_needed`, `material_id`, `material_color_id`, `fulfillment_type`, dan `reason` pada pengajuan restock.
   - **Syarat Ketat**: Hanya dapat diedit selama status pengajuan masih **`pending`** (belum disetujui / di-approve oleh Finance/Purchasing). Begitu berstatus `approved` atau `in_progress`, data terkunci permanen.

---

## 2. Perubahan Skema Database

```sql
-- 1. Tabel pencatatan retur material cacat dari penjahit ke gudang
create table if not exists public.material_defect_returns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  order_id uuid null references public.orders(id),
  sewing_assignment_id uuid null references public.sewing_assignments(id),
  staff_id uuid not null references public.staff(id),                  -- Penjahit yang mengembalikan
  received_by uuid not null references public.staff(id),               -- Staf gudang penerima
  material_id uuid not null references public.materials(id),
  material_color_id uuid null references public.material_colors(id),
  qty numeric not null check (qty > 0),
  unit varchar not null,
  defect_reason text not null,                                        -- Contoh: 'sleting macet', 'kain sobek'
  is_replaced boolean not null default true,                          -- Apakah barang pengganti sudah diserahkan
  replacement_movement_id uuid null references public.stock_movements(id),
  disposition varchar not null default 'scrap'                        -- Langsung dianggap susut/scrap
    check (disposition in ('scrap', 'reworked')),
  created_at timestamptz not null default now()
);

comment on table public.material_defect_returns is 'Riwayat material cacat dari meja jahit yang diserahkan ke gudang';

-- 2. Kolom akumulasi stok cacat/susut di materials (opsional untuk audit susut)
alter table public.materials
  add column if not exists scrap_qty numeric not null default 0 check (scrap_qty >= 0);

comment on column public.materials.scrap_qty is 'Total akumulasi barang rusak/afkir yang disusutkan';
```

---

## 3. Database Functions & RPC

### 3.1 RPC Retur Material Cacat & Serah Pengganti: `process_defect_material_return`
```sql
create or replace function public.process_defect_material_return(
  p_staff_id uuid,               -- Penjahit
  p_received_by uuid,            -- Staf Gudang
  p_material_id uuid,
  p_qty numeric,
  p_defect_reason text,
  p_order_id uuid default null,
  p_sewing_assignment_id uuid default null,
  p_material_color_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id        uuid := auth.uid();
  v_mat            record;
  v_return_id      uuid;
  v_mov_id         uuid;
  v_req_id         uuid;
  v_is_replaced    boolean := false;
  v_notes          text;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select * into v_mat from public.materials where id = p_material_id and user_id = v_user_id;
  if not found then raise exception 'Material tidak ditemukan'; end if;

  -- 1. Cek ketersediaan stok pengganti
  if v_mat.stock_qty >= p_qty then
    -- Stok tersedia -> langsung potong untuk barang pengganti
    v_is_replaced := true;

    insert into public.stock_movements (
      user_id, material_id, material_color_id, movement_type, source_type,
      source_id, qty, unit, status, confirmed_at, taken_by, recorded_by, notes
    ) values (
      v_user_id, p_material_id, p_material_color_id, 'out', 'order_consumption',
      p_order_id, p_qty, v_mat.unit, 'confirmed', now(), p_staff_id, p_received_by,
      'Barang pengganti retur cacat: ' || p_defect_reason
    ) returning id into v_mov_id;

    -- Update stok aktif & akumulasi susut
    update public.materials
    set stock_qty = stock_qty - p_qty,
        scrap_qty = scrap_qty + p_qty
    where id = p_material_id;
  else
    -- Stok habis -> tidak bisa langsung ganti fisik, buat stock_request darurat
    v_is_replaced := false;

    -- Catat penambahan scrap saja
    update public.materials
    set scrap_qty = scrap_qty + p_qty
    where id = p_material_id;

    insert into public.stock_requests (
      user_id, material_id, material_color_id, quantity_needed, unit,
      requested_by, status, fulfillment_type, reason
    ) values (
      v_user_id, p_material_id, p_material_color_id, (p_qty - v_mat.stock_qty), v_mat.unit,
      p_received_by, 'pending', 'spj',
      'Darurat pengganti material cacat (' || p_defect_reason || ') penjahit'
    ) returning id into v_req_id;
  end if;

  -- 2. Simpan catatan retur cacat
  insert into public.material_defect_returns (
    user_id, order_id, sewing_assignment_id, staff_id, received_by,
    material_id, material_color_id, qty, unit, defect_reason,
    is_replaced, replacement_movement_id, disposition
  ) values (
    v_user_id, p_order_id, p_sewing_assignment_id, p_staff_id, p_received_by,
    p_material_id, p_material_color_id, p_qty, v_mat.unit, p_defect_reason,
    v_is_replaced, v_mov_id, 'scrap'
  ) returning id into v_return_id;

  return jsonb_build_object(
    'success', true,
    'return_id', v_return_id,
    'is_replaced', v_is_replaced,
    'stock_request_created', (v_req_id is not null),
    'stock_request_id', v_req_id
  );
end;
$$;
```

### 3.2 RPC Update Pengajuan Restock (Sebelum di-Approve)
```sql
create or replace function public.update_pending_stock_request(
  p_request_id uuid,
  p_material_id uuid,
  p_quantity_needed numeric,
  p_fulfillment_type varchar,
  p_reason text,
  p_material_color_id uuid default null,
  p_estimated_price numeric default null
)
returns public.stock_requests language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.stock_requests;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  -- Validasi status: HANYA BOLEH JIKA PENDING
  select * into v_result from public.stock_requests
  where id = p_request_id and user_id = v_user_id;

  if not found then
    raise exception 'Pengajuan restock tidak ditemukan';
  end if;

  if v_result.status <> 'pending' then
    raise exception 'Pengajuan tidak dapat diedit karena sudah berstatus % (hanya status pending yang boleh diedit).', v_result.status;
  end if;

  update public.stock_requests
  set material_id       = p_material_id,
      material_color_id = p_material_color_id,
      quantity_needed   = p_quantity_needed,
      fulfillment_type  = p_fulfillment_type,
      reason            = p_reason,
      estimated_price   = p_estimated_price,
      updated_at        = now()
  where id = p_request_id and status = 'pending'
  returning * into v_result;

  return v_result;
end;
$$;
```

---

## 4. Perubahan UI pada Halaman Gudang (`WarehousePage.tsx`)

### 4.1 Modal Input Retur Cacat (`DefectReturnModal.tsx`)
* Dibuka dari tombol **"+ Terima Barang Rusak"** di Gudang.
* Field input yang diisi staf gudang:
  - **Penjahit**: Dropdown staf (role penjahit).
  - **Order Terkait (Opsional)**: Dropdown order aktif penjahit tersebut.
  - **Material Rusak**: Dropdown material (misal: Sleting Besi 15cm).
  - **Jumlah Cacat**: Input angka (misal `2`).
  - **Alasan Cacat**: Input teks wajib (contoh: *"sleting macet / rel melintir"*).
* Feedback real-time saat submit:
  - Jika stok cukup: Notifikasi hijau `✓ Retur dicatat. 2 pcs barang pengganti berhasil diserahkan ke penjahit.`
  - Jika stok kurang: Notifikasi oranye `⚠️ Retur dicatat. Stok gudang tidak mencukupi untuk penggantian langsung. Pengajuan restock SPJ darurat otomatis dibuatkan.`

### 4.2 Tab "Pengajuan Restock" — Fitur Edit Baris
* Pada setiap baris pengajuan restock di `StockRequestsTab.tsx`:
  - Jika `status === 'pending'`: Tampilkan tombol **"Edit"** di samping tombol Hapus.
  - Mengklik tombol Edit membuka `StockRequestModal` dalam mode edit.
  - Jika status sudah `approved` / `in_progress` / `fulfilled`: Tombol Edit disembunyikan / disabled dengan tooltip *"Sudah diproses Finance/Purchasing"*.

---

## 5. Checklist Implementasi & Pengujian

- [ ] Jalankan migrasi tabel `material_defect_returns` dan kolom `scrap_qty`.
- [ ] Buat RPC `process_defect_material_return` dan `update_pending_stock_request`.
- [ ] Buat komponen `DefectReturnModal.tsx` di folder `src/components/warehouse/`.
- [ ] Tambahkan tombol Edit di `StockRequestsTab.tsx` dan integrasikan ke `StockRequestModal.tsx`.
- [ ] Verifikasi kasus:
  - Penjahit mengembalikan 2 sleting macet, stok ada 10 $\implies$ retur tercatat, stok terpotong 2 pcs pengganti.
  - Penjahit mengembalikan 2 sleting macet, stok ada 0 $\implies$ retur tercatat, `stock_requests` darurat otomatis terbentuk.
  - Edit pengajuan restock berstatus `pending` $\implies$ berhasil tersimpan.
  - Coba edit pengajuan yang sudah `approved` $\implies$ sistem menolak dengan pesan validasi jelas.
