# Desain Sistem & Spesifikasi Implementasi: Pengeluaran Barang Gudang Berbasis Worklog & Floor Stock

> **Status Dokumen:** Siap Diimplementasi (Approved Design)  
> **Target Modul:** Modul Gudang (`/warehouse`), Modul Worklog Jahit (`/worklog`), Mutasi Stok (`stock_movements`)  
> **Sumber Daya:** `docs/DESAIN_MATERIAL_GUDANG_HPP_DAN_ORDER_STATUS.md`, `src/pages/WarehousePage.tsx`, `src/types.ts`

---

## 1. Latar Belakang & Klarifikasi Operasional Lapangan

Berdasarkan kesepakatan alur nyata di konveksi:
1. **Kain Utama**:
   - Kain utama diambil dan dipotong oleh **Tukang Potong** (*Cutting*).
   - Penjahit **tidak mengambil kain gelondongan dari gudang**, melainkan menerima bundel pola kain yang *sudah selesai dipotong*.
2. **Kancing Pakaian**:
   - **Kancing TIDAK dibagikan ke penjahit**.
   - Pemasangan kancing dan pembuatan lubang kancing (*buttonhole*) dikerjakan pada tahap **Finishing** dengan mesin khusus.
   - Oleh karena itu, kancing dialihkan menjadi **Floor Stock Finishing** (bukan bahan penjahit).
3. **Bahan yang Diterima Penjahit via Worklog (Direct BOM)**:
   - Murni aksesoris yang dijahit bersamaan saat proses merakit pakaian:
     - **Sleting** (panjang & warna spesifik).
     - **Kain Furing / Kantong**.
     - **Woven Label** (merk, care label, size tag).
     - **Rib Leher / Manset**, **Tali Kerut**, **Velcro / Perekat**.
4. **Kebijakan Kekurangan Stok**:
   - Jika stok material di gudang tidak mencukupi kebutuhan worklog penjahit, serah terima bahan **harus menunggu restock** (tidak diserahkan parsial) agar jahitan tidak mangkrak di tengah jalan.
5. **Pencatatan Floor Stock (Benang, Kancing, Jarum)**:
   - Walaupun dikeluarkan per kemasan utuh (1 cone benang, 1 pack jarum, 1 pack kancing finishing), sistem **wajib mencatat nama staf yang meminta** (`taken_by`), sehingga riwayat konsumsi per penjahit/staf finishing tetap terdata rapi.

---

## 2. Klasifikasi Pengeluaran Material Gudang

```
                                GUDANG MATERIAL SIKON
                                          │
            ┌─────────────────────────────┴─────────────────────────────┐
            ▼                                                           ▼
   [TIPE 1: DIRECT BOM PENJAHIT]                               [TIPE 2: FLOOR STOCK]
   (Bahan Berbasis Worklog Jahit)                              (Bahan Operasional / Meja)
   - Sleting (YKK besi/gigi buaya/plastik)                     - Benang jahit (1 Cone)
   - Kain Furing / Kantong                                     - Jarum mesin (1 Pack)
   - Woven Label, Size Label                                   - Kancing (Stok Mesin Finishing)
   - Rib Manset / Tali kerut                                   - Minyak mesin, gunting catrek
            │                                                           │
            ▼                                                           ▼
   Alokasi Otomatis per Worklog:                               Dikeluarkan Utuh per Kemasan:
   = assigned_qty × BOM per pcs                                Catat `taken_by` staf peminta
   Diserahkan ke Penjahit                                      (source_type: 'floor_stock')
   (Wajib stok lengkap, tidak parsial)
```

---

## 3. Desain Skema Database

```sql
-- 1. Tambah kolom penanda floor stock pada kategori material atau master material
alter table public.materials
  add column if not exists is_floor_stock boolean not null default false;

comment on column public.materials.is_floor_stock is 'True jika material didistribusikan via Floor Stock (benang, kancing mesin finishing, jarum)';

-- Tandai default material benang dan kancing sebagai floor stock
update public.materials set is_floor_stock = true
where lower(name) like '%benang%'
   or lower(name) like '%kancing%'
   or lower(name) like '%jarum%';

-- 2. Tambah kolom sewing_assignment_id di stock_movements
alter table public.stock_movements
  add column if not exists sewing_assignment_id uuid null references public.sewing_assignments(id);

comment on column public.stock_movements.sewing_assignment_id is 'Tautan ke penugasan jahit penjahit penerima bahan';

-- 3. RPC Pengeluaran Bahan Worklog oleh Staf Gudang (Atomic & Validasi Stok Lengkap)
create or replace function public.dispatch_sewing_materials(
  p_sewing_assignment_id uuid,
  p_recorded_by uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id       uuid := auth.uid();
  v_assignment    record;
  v_mat           record;
  v_needed_qty    numeric;
  v_current_stock numeric;
  v_movements     jsonb := '[]'::jsonb;
  v_mov_id        uuid;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  -- 1. Ambil detail assignment
  select sa.*, oi.product_id, st.name as staff_name, o.order_id as order_code
  into v_assignment
  from public.sewing_assignments sa
  join public.order_items oi on oi.id = sa.order_item_id
  join public.orders o on o.id = oi.order_id
  join public.staff st on st.id = sa.staff_id
  where sa.id = p_sewing_assignment_id and sa.user_id = v_user_id;

  if not found then raise exception 'Penugasan jahit tidak ditemukan'; end if;

  -- 2. Validasi Ketersediaan Stok Seluruh Bahan Non-Floor Stock (Wajib lengkap)
  for v_mat in
    select pm.material_id, m.name, pm.quantity as bom_qty, m.stock_qty, m.unit
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed_qty := v_assignment.assigned_qty * v_mat.bom_qty;
    if v_mat.stock_qty < v_needed_qty then
      raise exception 'Stok tidak cukup untuk bahan "%": butuh % %, tersedia % %. Serah terima harus menunggu restock.',
        v_mat.name, v_needed_qty, v_mat.unit, v_mat.stock_qty, v_mat.unit;
    end if;
  end loop;

  -- 3. Eksekusi Pengeluaran Stok untuk Setiap Bahan Direct BOM
  for v_mat in
    select pm.material_id, m.name, pm.quantity as bom_qty, m.unit
    from public.product_materials pm
    join public.materials m on m.id = pm.material_id
    where pm.product_id = v_assignment.product_id
      and coalesce(m.is_floor_stock, false) = false
  loop
    v_needed_qty := v_assignment.assigned_qty * v_mat.bom_qty;

    insert into public.stock_movements (
      user_id, material_id, movement_type, source_type, source_id, sewing_assignment_id,
      qty, unit, status, confirmed_at, taken_by, recorded_by, notes
    ) values (
      v_user_id, v_mat.material_id, 'out', 'order_consumption', v_assignment.order_item_id,
      p_sewing_assignment_id, v_needed_qty, v_mat.unit, 'confirmed', now(),
      v_assignment.staff_id, p_recorded_by,
      'Penyerahan bahan jahit SPK ' || v_assignment.order_code || ' ke ' || v_assignment.staff_name
    ) returning id into v_mov_id;

    -- Kurangi stok material
    update public.materials
    set stock_qty = stock_qty - v_needed_qty
    where id = v_mat.material_id;
  end loop;

  return jsonb_build_object('success', true, 'assignment_id', p_sewing_assignment_id);
end;
$$;
```

---

## 4. Perubahan UI pada Halaman Gudang (`WarehousePage.tsx`)

### 4.1 Tab "Bahan Jahit & Finishing"
Tab ini menggantikan alur manual acak dengan 2 sub-tampilan terstruktur:

#### Sub-Tampilan A: "Serah Bahan Penjahit (Direct BOM)"
* Menampilkan daftar bundel jahit yang berstatus `assigned` (belum diserahkan bahannya).
* Dikelompokkan per Order $\to$ per Penjahit.
* Contoh tampilan card:
  ```
  [Order #ORD-101 | PT Adhi Karya]
  Penjahit: Agus (Kemeja Drill - 10 pcs)
  Daftar Aksesoris Siap Serah:
  • Sleting Besi 15cm: 10 pcs [Stok Gudang: 45 pcs - CUKUP]
  • Woven Label SIKON: 10 pcs [Stok Gudang: 120 pcs - CUKUP]
  [Tombol: Serahkan Bahan ke Agus]
  ```
* Jika ada stok yang kurang:
  - Badge merah: `[Stok Gudang: 4 pcs - KURANG 6 pcs]`.
  - Tombol serahkan di-disable otomatis dan muncul tombol bantu: `[Ajukan Restock Gudang]`.

#### Sub-Tampilan B: "Pengeluaran Floor Stock"
* Form cepat untuk mengeluarkan benang, jarum, atau kancing finishing:
  - **Material**: Dropdown material (difilter `is_floor_stock = true`).
  - **Jumlah Kemasan**: Misal 2 Cone / 1 Pack.
  - **Diserahkan Kepada (`taken_by`)**: Dropdown nama staf penjahit / staf finishing (wajib diisi sesuai kesepakatan).
  - **Staf Gudang (`recorded_by`)**: Dropdown staf gudang yang menyerahkan.
* Tombol **"Keluarkan Floor Stock"** $\implies$ langsung memotong stok gudang dan mencatat movement.

---

## 5. Checklist Implementasi & Pengujian

- [ ] Jalankan migrasi kolom `is_floor_stock` dan `sewing_assignment_id`.
- [ ] Buat RPC `dispatch_sewing_materials` dengan validasi stok lengkap anti-parsial.
- [ ] Buat komponen UI `SewingMaterialDispatchTab.tsx` dan `FloorStockIssueModal.tsx` di `WarehousePage`.
- [ ] Verifikasi kasus:
  - Order 10 pcs butuh 10 sleting; stok ada 5 sleting $\implies$ sistem menolak serah terima dan menampilkan error "Stok tidak cukup, menunggu restock".
  - Stok ada 20 sleting $\implies$ tombol "Serahkan Bahan" sukses memotong 10 sleting dan mencatat `taken_by: penjahit_id`.
  - Floor stock benang dikeluarkan $\implies$ stok berkurang dan nama penjahit peminta tercatat di kartu riwayat stok.
