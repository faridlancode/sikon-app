# Rancangan Perbaikan Flow Gudang & Purchasing

Dokumen ini merangkum evaluasi terhadap implementasi saat ini (`docs/DESAIN_FITUR_STAF_GUDANG_PURCHASING.md`, hook & komponen di `src/hooks` dan `src/components/warehouse|purchasing`) dan usulan perbaikan untuk 3 flow inti + 2 perbaikan tambahan yang diminta.

---

## 0. Ringkasan Temuan (Kondisi Saat Ini)

| # | Area | Kondisi saat ini | Masalah |
|---|---|---|---|
| 1 | Pemohon restock | `StockRequestModal` mengisi dropdown "Diajukan oleh" dari **semua** `activeStaff`, tanpa filter `role` | Staf non-Gudang (Purchasing, Penjahit, dst) bisa tercatat sebagai pemohon |
| 2 | Approval pembelanjaan | `stock_requests.status`: `pending → in_progress → fulfilled/cancelled`. Tombol "Proses via SPJ" / "Buat Supplier Purchase" bisa langsung diklik dari status `pending` | Tidak ada aksi **approve/reject** eksplisit oleh Purchasing/Finance sebelum uang mulai dibelanjakan — label UI sudah menulis "Menunggu Finance" tapi belum ada tombol Approve/Reject sungguhan |
| 3 | Penerimaan barang (Jalur Supplier Purchase) | `receive_supplier_purchase` dipanggil dari tab **Terima Barang** di `WarehousePage` | ✅ Sudah sesuai keinginan (staf Gudang yang menerima) — tidak perlu diubah |
| 4 | Penerimaan barang (Jalur SPJ) | Stok masuk **dan** expense tercatat sekaligus saat `approve_purchasing_report` (dieksekusi Purchasing/Finance) | Staf Gudang tidak punya titik konfirmasi fisik terpisah — perlu diselaraskan dengan pola no. 3 |
| 5 | Pengajuan otomatis dari order | `useOrders.ts` hanya membuat `stock_movements` (`out`, `order_consumption`, `pending`) untuk kebutuhan kain/aksesoris tiap order — **tidak ada** pembuatan `stock_requests` otomatis saat stok kurang | Flow 2 belum ada sama sekali |
| 6 | Barang keluar (siapa yang mengambil) | `stock_movements` tidak punya kolom penerima/pengambil; hanya `notes` teks bebas berisi nama order | Tidak ada pencatatan terstruktur "diambil oleh siapa" (tukang potong / penjahit) |
| 7 | Bulk SPJ | `PurchasingReportModal` & `SupplierPurchaseModal` **sudah** mendukung multi-item dalam satu laporan (bisa tambah baris & tautkan ke beberapa `stock_request_id` berbeda) | Belum ada **aksi bulk dari sisi daftar pengajuan** (centang beberapa pengajuan → langsung buka 1 SPJ terisi otomatis). Saat ini hanya bisa proses 1 pengajuan sebagai baris pertama, baris lain harus ditambah manual satu-satu |
| 8 | Komponen mati | `PendingRequestsTab.tsx` & `ReceiveGoodsModal.tsx` / `UnpaidReceiptsTab.tsx` sudah tidak dipakai di halaman manapun (sisa iterasi lama, mengacu tabel `purchase_receipts` yang sudah dihapus) | Perlu dibersihkan atau dipakai ulang (lihat Flow 3) supaya tidak membingungkan |

---

## 1. Perbaikan Lintas-Flow: Pemohon Hanya Staf Gudang

**Aturan baru:** kolom `stock_requests.requested_by` hanya boleh diisi staf dengan `role = 'Gudang'`.

- **UI (`StockRequestModal.tsx`):** filter `activeStaff` jadi `activeStaff.filter(s => s.role === 'Gudang')` sebelum mengisi dropdown & default value. Kalau staf Gudang aktif kosong, tampilkan pesan "Belum ada staf Gudang aktif, tambahkan dulu di halaman Staff" dan disable tombol submit.
- **Guard di level data (disarankan, bukan cuma UI):** tambahkan constraint di RPC/insert policy supaya tidak bisa dilewati lewat cara lain:
  ```sql
  create or replace function public.validate_stock_request_requester()
  returns trigger language plpgsql as $$
  begin
    if new.requested_by is not null then
      if not exists (
        select 1 from public.staff
        where id = new.requested_by and role = 'Gudang'
      ) then
        raise exception 'Pemohon restock harus staf dengan role Gudang';
      end if;
    end if;
    return new;
  end;
  $$;

  create trigger trg_validate_stock_request_requester
    before insert or update of requested_by on public.stock_requests
    for each row execute function public.validate_stock_request_requester();
  ```
- Efek turunan: field "Diajukan oleh" pada **pengajuan otomatis** (Flow 2) juga wajib memilih/mengisi staf Gudang — kalau tidak ada staf Gudang aktif, pengajuan otomatis tetap dibuat tapi `requested_by = null` sampai staf Gudang mengonfirmasi dan memilih namanya sendiri saat submit.

---

## 2. Flow 1 — Approval Pembelanjaan (Redesain)

### Alur target
```
Staf Gudang                 Purchasing/Finance              Staf Gudang / Purchasing
─────────────                ─────────────────               ────────────────────────
1. Ajukan restock      →     2. Review & putuskan      →    3a. Approved → lanjut belanja
   (status: pending)              - Approve                       (SPJ atau Supplier Purchase)
                                  - Reject (+alasan)               → status: in_progress
                                                              3b. Rejected → selesai
                                                                    (status: rejected, tidak lanjut)

4. Barang datang secara fisik:
   - Jalur Supplier Purchase → staf Gudang klik "Terima Barang" (SUDAH ADA, tetap dipakai)
   - Jalur SPJ → staf Gudang klik "Konfirmasi Terima" setelah laporan disetujui Finance (BARU)
   → status: fulfilled, stock_qty bertambah
```

### Perubahan skema `stock_requests`
```sql
alter table public.stock_requests
  drop constraint if exists stock_requests_status_check;

alter table public.stock_requests
  add column if not exists approved_by   uuid references public.staff(id),
  add column if not exists approved_at   timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists goods_received_at timestamptz; -- diisi saat staf Gudang konfirmasi fisik (khusus jalur SPJ)

alter table public.stock_requests
  add constraint stock_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'in_progress', 'fulfilled', 'cancelled'));
```

> Kenapa `approved` dipisah dari `in_progress`? Supaya ada jejak yang jelas kapan permintaan **disetujui secara finansial** (boleh belanja) vs kapan **eksekusi belanja dimulai**. Kalau digabung, sulit membedakan "sudah di-ACC tapi belum ada yang belanja" dengan "belum di-ACC sama sekali" — keduanya akan terlihat sama-sama "pending" di dashboard Purchasing.

### RPC baru
```sql
create or replace function public.approve_stock_request(p_request_id uuid, p_approved_by uuid)
returns public.stock_requests language plpgsql security definer set search_path = public as $$
declare v_result public.stock_requests;
begin
  update public.stock_requests
  set status = 'approved', approved_by = p_approved_by, approved_at = now()
  where id = p_request_id and status = 'pending'
  returning * into v_result;

  if not found then
    raise exception 'Pengajuan tidak ditemukan atau sudah diproses';
  end if;
  return v_result;
end;
$$;

create or replace function public.reject_stock_request(p_request_id uuid, p_reason text)
returns public.stock_requests language plpgsql security definer set search_path = public as $$
declare v_result public.stock_requests;
begin
  update public.stock_requests
  set status = 'rejected', rejected_reason = p_reason
  where id = p_request_id and status = 'pending'
  returning * into v_result;

  if not found then
    raise exception 'Pengajuan tidak ditemukan atau sudah diproses';
  end if;
  return v_result;
end;
$$;
```

Guard tambahan di `create_purchasing_report`/`submit_purchasing_report` dan `create_supplier_purchase`: tolak `stock_request_id` yang statusnya bukan `approved` (saat ini keduanya menerima status `pending` **atau** `in_progress` — lihat filter `r.status === 'pending' || r.status === 'in_progress'` di `PurchasingReportModal.tsx` & `SupplierPurchaseModal.tsx`, ini perlu diubah jadi `r.status === 'approved'`).

### Penerimaan barang jalur SPJ (baru, menyamakan dengan jalur Supplier Purchase)
Saat ini `approve_purchasing_report` sekaligus menambah stok. Agar konsisten dengan permintaan "staf Gudang yang menerima", pecah jadi 2 tahap:

1. `approve_purchasing_report(report_id)` — **tetap** dieksekusi Purchasing/Finance, tapi sekarang **hanya**:
   - Catat expense per kategori + service fee + reversal uang muka.
   - Set `purchasing_reports.status = 'approved'`.
   - Insert `stock_movements` dengan `status = 'pending'` (bukan langsung `confirmed`) untuk tiap item — ini menandakan "barang sudah dibayar & dilaporkan, menunggu dicek fisik oleh Gudang".
2. RPC baru `confirm_purchasing_report_receipt(report_id)` — dijalankan **staf Gudang** dari tab "Terima Barang":
   - Panggil `confirm_stock_movement` untuk semua movement terkait laporan itu (stok bertambah, harga material ter-update).
   - Set `stock_requests.status = 'fulfilled'`, `goods_received_at = now()` untuk request yang tertaut.

> Catatan implementasi: kalau tim memutuskan langkah tambahan ini dianggap terlalu berat untuk kasus SPJ (karena barang memang sudah di tangan staf yang belanja saat laporan dibuat), opsi minimal-viable adalah tetap membiarkan SPJ approval langsung menambah stok seperti sekarang, dan hanya menerapkan pemisahan approve/reject + jalur Supplier Purchase secara penuh. Tandai ini sebagai keputusan yang perlu dikonfirmasi ke pemilik bisnis.

### Perubahan UI
- **Purchasing → tab baru "Pengajuan Gudang"** (menggantikan ketergantungan pada query param `?action=new-spj&requestId=`): daftar `stock_requests` berstatus `pending`, dengan aksi **Approve** / **Reject (+alasan)** per baris, dan **checkbox multi-select** (lihat §4 Bulk SPJ).
- **Warehouse → `StockRequestsTab`**: tombol "Proses via SPJ" / "Proses via Supplier" hanya tampil kalau status `approved` (bukan lagi `pending`), dan hanya sebagai shortcut navigasi — eksekusi tetap terjadi di halaman Purchasing.
- **Warehouse → tab "Terima Barang" (`ReceiveOrdersTab`)**: tambahkan sub-bagian "Dari SPJ" di samping "Dari Supplier Purchase" yang sudah ada, memakai `confirm_purchasing_report_receipt`.
- Hapus/ganti fungsi `PendingRequestsTab.tsx` (sudah tidak dipakai) — komponennya sebenarnya cocok didaur ulang untuk Flow 3 (lihat §3), bukan untuk Flow 1.

---

## 3. Flow 2 — Pengajuan Otomatis dari Order (Fokus Kain)

### Alur target
```
Order masuk dgn kebutuhan kain
        │
        ▼
Cek stock_qty kain (dikurangi kebutuhan pending order lain yang sejenis)
        │
   kurang? ──No──► tidak terjadi apa-apa (stok cukup)
        │Yes
        ▼
Auto-create stock_requests
  status = 'draft_auto'
  quantity_needed = SELISIH kekurangan (bukan total kebutuhan order)
  source_type = 'auto_order', source_order_item_id = <order_item>
        │
        ▼
Staf Gudang review di tab "Otomatis dari Order"
        │
   ┌────┴─────┐
   ▼          ▼
Konfirmasi   Abaikan/Batalkan
(pilih nama  (mis. sudah ada stok fisik
staf sendiri  belum tercatat, atau mau
sbg pemohon)  substitusi kain lain)
   │
   ▼
status → 'pending'  ──────► lanjut ke Flow 1 (approval Purchasing)
```

### Kenapa ada tahap "draft_auto" (bukan langsung `pending`)?
Sesuai arahan: pengajuan hasil auto-deteksi **tidak boleh langsung tembus ke Purchasing/Finance**. Staf Gudang harus mengonfirmasi dulu — karena sistem tidak tahu konteks lapangan (stok retur, kain titipan, rencana substitusi warna, dll). Baru setelah staf Gudang menekan "Konfirmasi & Ajukan", statusnya berubah jadi `pending` dan mengikuti proses normal Flow 1.

### Perubahan skema
```sql
alter table public.stock_requests
  add column if not exists source_type varchar not null default 'manual'
    check (source_type in ('manual', 'auto_order')),
  add column if not exists source_order_id uuid references public.orders(id) on delete set null,
  add column if not exists source_order_item_id uuid references public.order_items(id) on delete set null;

alter table public.stock_requests
  drop constraint if exists stock_requests_status_check;
alter table public.stock_requests
  add constraint stock_requests_status_check
    check (status in ('draft_auto', 'pending', 'approved', 'rejected', 'in_progress', 'fulfilled', 'cancelled'));
```

### Logika deteksi kekurangan (di `generateOrderStockMovements`, `useOrders.ts`)
Tambahkan langkah baru **setelah** insert `stock_movements` (`order_consumption`, `pending`) untuk tiap `fabricSelections` (khusus kain — cek `material_categories.is_fabric`, BOM aksesoris **belum** masuk cakupan tahap ini sesuai arahan "fokus kain dulu"):

```ts
async function checkAndCreateAutoStockRequest(materialId, materialColorId, neededQty, unit, orderId, orderItemId, userId) {
  // 1. Ambil stok tersedia saat ini
  const stockQty = materialColorId
    ? (await supabase.from('material_colors').select('stock_qty').eq('id', materialColorId).single()).data?.stock_qty
    : (await supabase.from('materials').select('stock_qty').eq('id', materialId).single()).data?.stock_qty;

  // 2. Jumlahkan semua movement 'out' pending lain (reservasi order lain yang belum dikonfirmasi)
  const { data: reserved } = await supabase
    .from('stock_movements')
    .select('qty')
    .eq('material_id', materialId)
    .eq('material_color_id', materialColorId)
    .eq('movement_type', 'out')
    .eq('status', 'pending');
  const totalReserved = (reserved ?? []).reduce((s, r) => s + Number(r.qty), 0);

  const available = Number(stockQty || 0) - totalReserved;
  const shortage = neededQty - available; // termasuk qty order ini sendiri (sudah ikut ter-reserve di atas)

  if (shortage <= 0) return; // stok masih cukup, tidak perlu pengajuan

  await supabase.from('stock_requests').insert({
    user_id: userId,
    material_id: materialId,
    material_color_id: materialColorId,
    quantity_needed: shortage,
    unit,
    status: 'draft_auto',
    source_type: 'auto_order',
    source_order_id: orderId,
    source_order_item_id: orderItemId,
    reason: `Otomatis: stok kurang untuk order ini`,
  });
}
```

> **Dedup sederhana (opsional tahap 2):** sebelum insert baru, cek dulu apakah sudah ada `stock_request` `draft_auto`/`pending` untuk kombinasi `material_id + material_color_id` yang masih terbuka — kalau ada, `quantity_needed` ditambah (bukan bikin baris baru), supaya beberapa order dengan kain sama tidak membanjiri antrean Gudang dengan baris duplikat. Untuk MVP, boleh dulu 1 baris per order item, digabung manual oleh staf Gudang saat submit ke Purchasing (pilih beberapa `draft_auto` sekaligus → jadi satu `pending`).

### Perubahan UI
- **Warehouse → `StockRequestsTab`**: tambah filter/badge status `draft_auto` = **"Otomatis — Perlu Dikonfirmasi Gudang"**, tampil terpisah di atas daftar biasa.
- Setiap baris `draft_auto` punya info asal: nama order + item produk + kain yang dibutuhkan (join ke `orders`/`order_items` via `source_order_id`/`source_order_item_id`).
- Tombol per baris:
  - **Konfirmasi & Ajukan** → buka modal kecil untuk pilih/isi `requested_by` (staf Gudang) dan boleh sunting `quantity_needed`, submit → status `pending`.
  - **Abaikan** → status `cancelled`, wajib isi alasan singkat (misal "stok fisik ada, belum diinput").

---

## 4. Flow 3 — Barang Keluar dari Gudang

### Alur target
```
Tukang Potong ambil kain          Penjahit ambil benang/aksesoris/kancing/sleting
        │                                          │
        └───────────────┬──────────────────────────┘
                         ▼
        Staf Gudang mencatat "Barang Keluar":
        - pilih siapa yang mengambil (taken_by, difilter per role)
        - konfirmasi qty & material
        → stock_movements.status: pending → confirmed
        → stock_qty berkurang
```

### Perubahan skema `stock_movements`
```sql
alter table public.stock_movements
  add column if not exists taken_by uuid references public.staff(id),
  add column if not exists recorded_by uuid references public.staff(id); -- staf Gudang yang mencatat

comment on column public.stock_movements.taken_by
  is 'Staf yang mengambil barang keluar (Tukang Potong utk kain, Penjahit utk aksesoris/benang). Hanya relevan utk movement_type = out.';
comment on column public.stock_movements.recorded_by
  is 'Staf Gudang yang mengonfirmasi/mencatat pengeluaran barang ini.';
```

### Sumber `taken_by` otomatis (mengurangi input manual)
- Untuk baris kain (`fabricSelections`, sudah ditandai lewat `material_categories.is_fabric`): saat gudang mengonfirmasi, tarik `staff_id` dari `cutting_assignments` (via `order_item_id`) yang terkait order tersebut sebagai **saran default** — tetap bisa diedit manual kalau kain diambil orang lain.
- Untuk baris aksesoris/BOM (benang, kancing, sleting, dll): saran default dari staf dengan `role = 'Penjahit'` yang sedang mengerjakan `order_item` tersebut (`piecework_tasks.order_item_id` / assignment jahit yang berlaku).
- Kalau tidak ada assignment yang cocok (order belum di-assign ke siapapun), gudang wajib pilih manual dari daftar staf aktif difilter berdasar role (`Tukang Potong` untuk kain, `Penjahit` untuk non-kain).

### Perubahan UI
- Daur ulang `PendingRequestsTab.tsx` (saat ini tidak dipakai) menjadi tab **"Barang Keluar"** di `WarehousePage`, menggantikan alur konfirmasi generik yang ada sekarang:
  - Tampilkan seluruh `stock_movements` `movement_type = 'out'`, `status = 'pending'`.
  - Kelompokkan per order agar mudah dipindai (satu order bisa punya beberapa baris kain + aksesoris).
  - Setiap baris wajib pilih **"Diambil oleh"** (dropdown staf, difilter Tukang Potong/Penjahit sesuai kategori materialnya, dengan saran default seperti di atas) sebelum tombol **Konfirmasi** aktif.
  - Setelah konfirmasi: panggil `confirm_stock_movement(movement_id)` (RPC lama tetap dipakai) + update `taken_by`/`recorded_by` di baris yang sama.
- **`StockHistoryTab`**: tampilkan kolom baru "Diambil oleh" untuk movement `out`, supaya riwayat pengeluaran barang bisa ditelusuri per staf (berguna juga untuk audit kalau ada selisih stok).

---

## 5. Tambahan — Bulk SPJ dari Beberapa Pengajuan

Skema `purchasing_report_items` & UI `PurchasingReportModal` **sudah** mendukung banyak baris dalam satu laporan. Yang perlu ditambah hanya jalur masuknya (entry point), supaya staf Purchasing tidak perlu menambah baris manual satu-satu:

- Di tab baru "Pengajuan Gudang" (§2), tambahkan **checkbox** di depan tiap pengajuan berstatus `approved`.
- Tombol **"Proses Terpilih sebagai 1 SPJ"** — aktif kalau minimal 1 dicentang — membuka `PurchasingReportModal` dengan `initialStockRequestIds: string[]` (bukan lagi `initialStockRequestId` tunggal), yang mengisi satu baris item per pengajuan terpilih sekaligus (material, warna, qty, unit ikut ter-prefill dari masing-masing `stock_request`, tinggal staf isi harga & foto nota).
- Berlaku sama untuk **"Proses Terpilih sebagai Supplier Purchase"** memakai `SupplierPurchaseModal`.
- Validasi: semua pengajuan yang dicentang bersama harus berstatus `approved` (bukan campur dengan yang masih `pending`).

---

## 6. Ringkasan Perubahan Skema

| Tabel | Kolom baru | Tujuan |
|---|---|---|
| `stock_requests` | `approved_by`, `approved_at`, `rejected_reason`, `goods_received_at` | Jejak approval Flow 1 |
| `stock_requests` | `source_type`, `source_order_id`, `source_order_item_id` | Penanda & penautan pengajuan otomatis Flow 2 |
| `stock_requests` | status enum bertambah: `draft_auto`, `approved`, `rejected` | Status baru untuk Flow 1 & 2 |
| `stock_movements` | `taken_by`, `recorded_by` | Pencatatan siapa mengambil & siapa mencatat, Flow 3 |
| RPC baru | `approve_stock_request`, `reject_stock_request`, `confirm_purchasing_report_receipt` | Eksekusi approval & penerimaan terpisah |
| Trigger baru | `validate_stock_request_requester` | Pembatasan pemohon hanya role Gudang |

## 7. Ringkasan Dampak per Halaman

| Halaman | Perubahan |
|---|---|
| **Gudang → Pengajuan Restock** | Filter pemohon = role Gudang; tab baru "Otomatis dari Order" (`draft_auto`); tombol proses SPJ/Supplier hanya muncul saat `approved` |
| **Gudang → Terima Barang** | Tetap seperti sekarang untuk Supplier Purchase; tambah sub-alur "Dari SPJ" |
| **Gudang → Barang Keluar (baru, ganti komponen mati)** | Konfirmasi keluar barang + pilih siapa yang mengambil |
| **Gudang → Riwayat** | Tambah kolom "Diambil oleh" |
| **Purchasing** | Tab baru "Pengajuan Gudang" (approve/reject + bulk select); SPJ & Supplier Purchase modal menerima banyak `stock_request_id` sekaligus |
| **Staff** | Tidak ada perubahan struktur, hanya bergantung pada `role` yang sudah ada (`Gudang`, `Tukang Potong`, `Penjahit`) |

---

## 8. Urutan Pengerjaan yang Disarankan

1. Migrasi skema (§6) + trigger pembatasan pemohon.
2. RPC `approve_stock_request` / `reject_stock_request` + update filter status di `PurchasingReportModal`/`SupplierPurchaseModal` (`pending`→`approved`).
3. UI tab "Pengajuan Gudang" di Purchasing (approve/reject dulu, bulk-select menyusul).
4. Logika deteksi kekurangan kain di `useOrders.ts` + tab "Otomatis dari Order" di Gudang.
5. Tab "Barang Keluar" (daur ulang `PendingRequestsTab`) + kolom `taken_by`/`recorded_by`.
6. Pemisahan `approve_purchasing_report` vs `confirm_purchasing_report_receipt` (opsional, perlu konfirmasi bisnis dulu — lihat catatan di §2).
7. Bersihkan komponen mati (`ReceiveGoodsModal.tsx`, `UnpaidReceiptsTab.tsx`) kalau memang tidak dipakai lagi.
