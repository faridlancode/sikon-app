# Desain Sistem & Spesifikasi: Perbaikan Gate Check Potong, Validasi Stok Kurang, & Pengeluaran Bahan per Penjahit

> **Status Dokumen:** Menunggu Review & Approval Pengguna  
> **Target Modul:** Modul Gudang (`/warehouse`), Modul Worklog Potong & Jahit (`/worklog`), Mutasi Stok (`stock_movements`)  
> **Referensi Sebelumnya:** `docs/RANCANGAN_GATE_CHECK_MATERIAL_SEBELUM_JAHIT.md`, `docs/RANCANGAN_GUDANG_BARANG_KELUAR_WORKLOG.md`

---

## 1. Analisis Masalah & Kebutuhan Lapangan

Berdasarkan pengujian operasional, ditemukan 4 kendala utama pada alur gudang dan worklog:

| No | Masalah Saat Ini | Dampak Operasional | Kebutuhan Solusi |
|---|---|---|---|
| **1** | **Tukang potong bisa mengerjakan/menyelesaikan tugas sebelum kain keluar dari gudang** | Kain belum diserahkan/diverifikasi gudang tapi pemotongan sudah ditandai selesai; data stok kain tidak sinkron dengan fisik meja potong. | **Gate Check Kain Potong**: Penugasan potong terkunci (`disabled`) hingga kain dikonfirmasi keluar dari gudang (`material_dispatched_at`). |
| **2** | **Konfirmasi barang keluar tetap bisa dilanjutkan meski stok gudang minus/kurang** | Saat ini hanya muncul browser dialog `window.confirm` ("Tetap lanjutkan?"). Jika staf klik OK, transaksi error atau data minus. | **Hard Block Validasi Stok**: Jika `stok_tersedia < qty_kebutuhan`, tombol konfirmasi di gudang dinonaktifkan (`disabled`) dan muncul peringatan stok kurang. |
| **3** | **Pengeluaran barang di halaman Gudang masih gelondongan per order, bukan per penjahit** | Saat order baru dibuat, sistem meng-generate pengeluaran aksesoris sekaligus 1 order utuh. Di gudang tidak terlihat penjahit mana yang butuh apa dan berapa pcs. | **Pengeluaran per Worklog Penjahit**: Barang keluar Direct BOM (sleting, furing, label) dibuat spesifik per penugasan penjahit (contoh: Ahmad 5 pcs kemeja = butuh 10 sleting jepang). |
| **4** | **Kancing pakaian masih tercampur sebagai pengeluaran order langsung** | Kancing ikut masuk ke list barang keluar penjahit padahal penjahit tidak memasang kancing di meja rakit baju. | **Enforce Floor Stock Finishing**: Kancing wajib dialihkan 100% ke Floor Stock meja finishing, tidak dibagikan ke penjahit. |

---

## 2. Alur Operasional Lapangan (Physical Reality)

```
                            [ ORDER BARU DITERIMA & REKAP SELESAI ]
                                                │
                       ┌────────────────────────┴────────────────────────┐
                       ▼                                                 ▼
             [ ALOKASI POTONG ]                                [ DISTRIBUSI WORKLOG JAHIT ]
             Item order di-assign ke Tukang Potong              Item dibagi ke penjahit:
             (misal: Budi - Kemeja 50 pcs)                      - Ahmad (10 pcs)
                       │                                        - Siti (15 pcs)
                       │                                        - Budi (25 pcs)
                       ▼                                                 │
       ┌───────────────────────────────┐                                 │
       │   GUDANG: BARANG KELUAR       │                                 │
       │   Tab 1: Kain Potong          │                                 │
       │   - Verifikasi stok roll kain │                                 │
       │   - [BLOCK jika stok kurang]  │                                 │
       │   - Konfirmasi serah ke Budi  │                                 │
       └───────────────┬───────────────┘                                 │
                       │                                                 │
                       ▼                                                 │
       [ GATE CHECK POTONG TERBUKA ]                                     │
       Tukang potong Budi memotong kain                                  │
       -> Tandai Selesai Potong                                          │
                       │                                                 │
                       └────────────────────────┬────────────────────────┘
                                                ▼
                               ┌─────────────────────────────────┐
                               │   GUDANG: BARANG KELUAR         │
                               │   Tab 2: Bahan Jahit (Worklog)  │
                               │   - Per Penjahit & SPK:         │
                               │     * Ahmad: 10 sleting jepang  │
                               │     * Siti: 15 sleting jepang   │
                               │   - [BLOCK jika stok kurang]    │
                               │   - Serahkan bahan ke Penjahit  │
                               └────────────────┬────────────────┘
                                                │
                                                ▼
                                [ GATE CHECK JAHIT TERBUKA ]
                                Penjahit Ahmad & Siti mulai merakit
                                                │
                                                ▼
                                [ FINISHING & PACKING ]
                                Mengambil Kancing & Benang via
                                FLOOR STOCK FINISHING (Tab 3)
```

---

## 3. Spesifikasi Perubahan Teknis

### A. Perubahan Skema Database & Migration

#### 1. Kolom Gate Check pada `cutting_assignments`
Tambahkan kolom pelacakan pengeluaran kain:
```sql
alter table public.cutting_assignments
  add column if not exists material_dispatched_at timestamptz null,
  add column if not exists dispatch_notes text null;

comment on column public.cutting_assignments.material_dispatched_at is
  'Waktu kain diserahkan oleh gudang ke tukang potong. NULL = kain belum keluar.';
```

#### 2. Kolom `cutting_assignment_id` pada `stock_movements`
Menghubungkan mutasi pengeluaran kain langsung ke penugasan potong:
```sql
alter table public.stock_movements
  add column if not exists cutting_assignment_id uuid null references public.cutting_assignments(id) on delete set null;

create index if not exists idx_stock_movements_cutting_assignment
  on public.stock_movements(cutting_assignment_id);
```

#### 3. RPC: `dispatch_cutting_materials`
Fungsi atomik untuk staf gudang mengeluarkan kain potong:
- **Validasi Stok Keras**: Jika stok roll kain di gudang kurang dari kebutuhan, lemparkan error `raise exception 'Stok kain tidak mencukupi'`.
- **Pencatatan Mutasi**: Buat `stock_movements` tipe `'out'`, status `'confirmed'`, `source_type = 'order_consumption'`.
- **Buka Gate Check**: Set `cutting_assignments.material_dispatched_at = now()`.

```sql
create or replace function public.dispatch_cutting_materials(
  p_cutting_assignment_id uuid,
  p_recorded_by uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id     uuid := auth.uid();
  v_assign      record;
  v_fabric      record;
  v_needed      numeric;
  v_current     numeric;
begin
  if v_user_id is null then raise exception 'Tidak terautentikasi'; end if;

  select ca.*, oi.order_id, oi.name_item, oi.qty as item_qty,
         st.name as staff_name, o.order_id as order_code
  into v_assign
  from public.cutting_assignments ca
  join public.order_items oi on oi.id = ca.order_item_id
  join public.orders o on o.id = oi.order_id
  join public.staff st on st.id = ca.staff_id
  where ca.id = p_cutting_assignment_id and ca.user_id = v_user_id;

  if not found then raise exception 'Penugasan potong tidak ditemukan'; end if;

  -- Cek kebutuhan kain dari order_item_fabrics
  for v_fabric in
    select oif.material_id, oif.material_color_id, oif.usage_qty_snapshot,
           m.name as mat_name, mc.color_name,
           coalesce(mc.stock_qty, m.stock_qty) as current_stock,
           m.unit
    from public.order_item_fabrics oif
    join public.materials m on m.id = oif.material_id
    left join public.material_colors mc on mc.id = oif.material_color_id
    where oif.order_item_id = v_assign.order_item_id
  loop
    v_needed := v_assign.item_qty * v_fabric.usage_qty_snapshot;
    if v_fabric.current_stock < v_needed then
      raise exception 'Stok tidak mencukupi untuk kain "%" (Warna: %): Butuh % %, tersedia % %',
        v_fabric.mat_name, coalesce(v_fabric.color_name, '-'), v_needed, v_fabric.unit, v_fabric.current_stock, v_fabric.unit;
    end if;

    -- Catat pengeluaran stok
    insert into public.stock_movements (
      user_id, material_id, material_color_id, movement_type, source_type,
      source_id, cutting_assignment_id, qty, unit, status, confirmed_at,
      taken_by, recorded_by, notes
    ) values (
      v_user_id, v_fabric.material_id, v_fabric.material_color_id, 'out',
      'order_consumption', v_assign.order_id, p_cutting_assignment_id,
      v_needed, v_fabric.unit, 'confirmed', now(),
      v_assign.staff_id, p_recorded_by,
      'Penyerahan kain potong SPK ' || v_assign.order_code || ' ke tukang potong ' || v_assign.staff_name
    );

    -- Kurangi stok material / color
    if v_fabric.material_color_id is not null then
      update public.material_colors set stock_qty = stock_qty - v_needed where id = v_fabric.material_color_id;
    else
      update public.materials set stock_qty = stock_qty - v_needed where id = v_fabric.material_id;
    end if;
  end loop;

  -- Update gate check penugasan potong
  update public.cutting_assignments
  set material_dispatched_at = now()
  where id = p_cutting_assignment_id;

  return jsonb_build_object('success', true, 'assignment_id', p_cutting_assignment_id);
end;
$$;
```

#### 4. Patch RPC `mark_cutting_item_done` (Gate Check Potong)
Pastikan tukang potong tidak bisa menyelesaikan jika kain belum keluar:
```sql
-- Tambahkan pengecekan pada mark_cutting_item_done:
if v_assignment.material_dispatched_at is null then
  -- Periksa apakah item ini memang memerlukan kain gudang
  if exists (select 1 from public.order_item_fabrics where order_item_id = p_order_item_id) then
    raise exception 'Kain untuk item ini belum diserahkan oleh gudang (material_dispatched_at masih kosong). Proses potong tidak dapat diselesaikan.';
  end if;
end if;
```
*(Tersedia opsi bypass force override bagi Supervisor jika terjadi keadaan mendesak).*

---

### B. Perbaikan Alur Pembuatan Order (`useOrders.ts`)

**Masalah:** Saat order dibuat, kode di `useOrders.ts` secara otomatis membuat baris `stock_movements` pending untuk aksesoris dan kancing secara gelondongan.

**Perbaikan:**
1. **Kain**: Tetap dicatat sebagai kebutuhan kain order atau ditautkan ke antrian potong.
2. **Kancing & Benang**: **TIDAK LAGI** di-generate di `stock_movements` order, karena kancing dan benang berstatus `is_floor_stock = true`.
3. **Aksesoris Jahit (Sleting, Furing, Label)**: **TIDAK LAGI** di-generate gelondongan saat order dibuat! Pengeluaran aksesoris jahit akan di-generate **secara otomatis per worklog penjahit** saat penugasan jahit dibagikan (`sewing_assignments`).

---

### C. Redesain Halaman Gudang: Pengeluaran Barang (`/warehouse`)

Halaman Gudang pada tab **"Barang Keluar"** akan dirapikan menjadi struktur yang jelas dan tidak membingungkan:

```
┌────────────────────────────────────────────────────────────────────────┐
│  GUDANG & INVENTORI > BARANG KELUAR                                    │
├────────────────────────────────────────────────────────────────────────┤
│  [ Sub-Tab 1: Kain Potong ]  [ Sub-Tab 2: Bahan Jahit (Worklog) ]     │
│  [ Sub-Tab 3: Floor Stock ]                                            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Contoh Sub-Tab 2: Bahan Jahit (Worklog Penjahit)                      │
│  ───────────────────────────────────────────────────────────────       │
│  SPK #PO-2026-004 | PT Adhi Karya - Kemeja Kerja Lengan Panjang        │
│  Penjahit: Ahmad  |  Alokasi: 5 pcs                                    │
│  Bahan yang Dibutuhkan:                                                │
│  • Sleting Jepang 25cm (Hitam) : 5 pcs  [Stok Gudang: 120 pcs ✓ Cukup] │
│  • Woven Label PT Adhi Karya   : 5 pcs  [Stok Gudang: 4 pcs ⚠️ KURANG] │
│                                                                        │
│  [Status: Menunggu Restock Label]   [Tombol Serahkan Bahan - DISABLED] │
│                                                                        │
│  ───────────────────────────────────────────────────────────────       │
│  SPK #PO-2026-004 | PT Adhi Karya - Kemeja Kerja Lengan Panjang        │
│  Penjahit: Budi Santoso | Alokasi: 10 pcs                              │
│  Bahan yang Dibutuhkan:                                                │
│  • Sleting Jepang 25cm (Hitam) : 10 pcs [Stok Gudang: 120 pcs ✓ Cukup] │
│  • Kain Kantong Furing         : 1.5 m  [Stok Gudang: 40 m ✓ Cukup]   │
│                                                                        │
│  Pilih Staf Gudang: [ Andi (Gudang) ▼ ]                                │
│  [ Tombol: Serahkan Bahan ke Budi (10 pcs) ✓ ]                         │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

#### Aturan Logika Validasi Stok:
1. **Tidak Ada Serah Parsial**: Jika salah satu bahan Direct BOM stoknya kurang (misal sleting cukup tapi label kurang), serah terima **TIDAK BISA** dikonfirmasi.
2. **Tombol Disabled**: Tombol serah terima berubah menjadi abu-abu nonaktif dengan tooltip / pesan: *"Stok bahan [Nama Bahan] tidak mencukupi. Ajukan restock terlebih dahulu."*
3. **Pemberian Floor Stock Terpisah**: Kancing dan benang tidak muncul di kartu penjahit. Staf finishing atau penjahit mengambil kancing/benang melalui tombol **"+ Pengeluaran Floor Stock"**.

---

### D. Perbaikan Worklog Potong (`/worklog` - Tab Potong)

Pada antarmuka Tukang Potong (`CuttingAssignTab.tsx`):
1. **Item Penugasan Aktif**:
   - Jika `material_dispatched_at` masih `null`:
     - Tampilkan badge oranye: `⏳ Menunggu Kain dari Gudang`.
     - Tombol **"Tandai Selesai" dinonaktifkan** (`disabled`).
     - Tampilkan pesan: *"Kain belum diserahkan oleh bagian gudang."*
   - Jika `material_dispatched_at` sudah terisi:
     - Tampilkan badge hijau: `✓ Kain Diterima (Siap Potong)`.
     - Tombol **"Tandai Selesai" aktif**.
2. **Supervisor Override (Bypass)**:
   - Seperti pada modul jahit, tersedia tombol kecil *"Paksa Selesai (Supervisor)"* dengan modal konfirmasi wajib mengisi alasan bila ada situasi darurat.

---

## 4. Checklist Rencana Implementasi

1. [ ] **Database Migration**:
   - Tambah `material_dispatched_at` dan `dispatch_notes` di `cutting_assignments`.
   - Tambah `cutting_assignment_id` di `stock_movements`.
   - Buat RPC `dispatch_cutting_materials`.
   - Patch RPC `mark_cutting_item_done` untuk gate check kain.
2. [ ] **Backend / Hook Updates**:
   - Update `useCuttingWorklog.ts`: include `material_dispatched_at` dan handler `force`.
   - Update `useOrders.ts`: hapus pembuatan movement gelondongan non-floor-stock dan kancing.
   - Update `useWarehouseDispatch.ts`: tambahkan dukungan penyerahan kain potong & penyerahan bahan jahit per penjahit.
3. [ ] **UI Updates**:
   - `CuttingAssignTab.tsx`: Tampilkan status kain gudang, kunci tombol selesai jika kain belum keluar.
   - `PendingRequestsTab.tsx` / `SewingMaterialDispatchTab.tsx`: Satukan tampilan barang keluar agar memisahkan Kain Potong, Bahan Penjahit (Worklog), dan Floor Stock; Hard-block jika stok kurang.
4. [ ] **Data & Dokumentasi**:
   - Update `clear.sql` dan `seed.sql`.
   - Update `README.md` pada bagian fitur yang berjalan.
   - Verifikasi linting dan build (`tsc --noEmit && vite build`).
