# Rancangan Fitur: Bulk Pengajuan Restock Gudang (Tahap 2)

Dokumen ini merinci rancangan implementasi **Tahap 2 (Opsi 1)**: kemampuan staf Gudang untuk mengajukan restock banyak item material sekaligus dalam satu kali proses di **Warehouse Page**.

---

## 1. Latar Belakang & Masalah Saat Ini

### Kondisi Eksisting
1. Saat ini di tab **Permintaan Restock** (`StockRequestsTab.tsx`), tombol **"Ajukan Restock Baru"** membuka modal tunggal (`StockRequestModal.tsx`).
2. Staf gudang hanya bisa memilih **1 material** (dan 1 warna kain) per pengajuan.
3. Jika gudang perlu mengajukan 5–10 kebutuhan bahan yang menipis (misalnya berbagai macam warna kain furing, benang jahit, kancing, zipper), staf gudang harus:
   - Mengisi staf pemohon,
   - Memilih 1 item,
   - Memasukkan kuantiti & catatan,
   - Klik Simpan,
   - Lalu mengulangi proses tersebut dari awal berkali-kali.
4. Hal ini memakan waktu dan berisiko terjadinya inkonsistensi (misal salah mengisi staf pemohon atau beda kategori pembelian untuk pengajuan yang seharusnya satu paket).

### Target Solusi
Menyediakan pengalaman form **Multi-Item Restock** yang intuitif, cepat, dan rapi:
- Header level (diisi sekali): Staf Pemohon (Gudang), Jalur Pembelian Utama (SPJ Belanja / Direct Supplier), serta Catatan Global.
- Line Items level (bisa tambah/hapus baris dinamis): Material, Warna Kain (jika fabric), Jumlah Kebutuhan, Satuan, Estimasi Harga, dan Catatan per item.
- Eksekusi pengajuan atomik: Seluruh item tersimpan bersamaan dengan status `pending`.
- Kemampuan integrasi cepat: Tombol "Ajukan Restock" dari tab Permintaan Restock, serta opsi "Bulk Ajukan dari Tabel Stok" untuk material yang stoknya menipis/habis.

---

## 2. Alur Pengguna (User Flow)

```
STAF GUDANG
┌─────────────────────────────────────────────────────────────┐
│ 1. Buka Tab "Permintaan Restock" (atau centang item menipis)│
│    Klik Tombol: "Ajukan Restock"                            │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Modal Bulk Pengajuan Terbuka:                             │
│    [Header]                                                 │
│    - Staf Pemohon (Gudang)      : [Budi - Gudang ▼]         │
│    - Jalur Pembelian            : (•) SPJ  ( ) Supplier     │
│    - Alasan Global (Opsional)   : Restock mingguan PO #102  │
│                                                             │
│    [Daftar Item Kebutuhan]                                  │
│    ┌───┬──────────────────────┬─────────┬──────┬──────────┐ │
│    │#  │ Material             │ Warna   │ Qty  │ Aksi     │ │
│    ├───┼──────────────────────┼─────────┼──────┼──────────┤ │
│    │1  │ Katun Combed 30s     │ Hitam   │ 50 m │ [Hapus]  │ │
│    │2  │ Katun Combed 30s     │ Putih   │ 30 m │ [Hapus]  │ │
│    │3  │ Benang Jahit Spun    │ -       │ 12 pc│ [Hapus]  │ │
│    └───┴──────────────────────┴─────────┴──────┴──────────┘ │
│    [+ Tambah Item Lain]                                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Klik "Kirim Semua Pengajuan (3 Item)"                    │
│    - Validasi: minimal 1 baris valid, qty > 0               │
│    - Panggil batch insert / RPC atomik                      │
│    - Notifikasi sukses + refresh data tabel                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
PURCHASING / FINANCE
┌─────────────────────────────────────────────────────────────┐
│ 4. Purchasing melihat semua item masuk berstatus `pending`  │
│    dan siap di-approve menggunakan Bulk Approval (Tahap 1)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Desain Teknis & Skema Database

### A. Skema Database `stock_requests`
Struktur tabel `stock_requests` saat ini:
- `id` (uuid, PK)
- `user_id` (uuid)
- `material_id` (uuid, FK ke `materials`)
- `material_color_id` (uuid, FK ke `material_colors`, nullable)
- `requested_by` (uuid, FK ke `staff`)
- `quantity_needed` (numeric)
- `unit` (varchar)
- `estimated_price` (numeric, nullable)
- `reason` (text, nullable)
- `status` (`draft_auto`, `pending`, `approved`, `in_progress`, `rejected`, `fulfilled`, `cancelled`)
- `fulfillment_type` (`spj`, `supplier_purchase`)
- `source_type` (`manual`, `order_auto`)
- `created_at` (timestamptz)

> **Pertimbangan Kolom Tambahan (`group_id` / `batch_id`)**:
> - Kolom opsional `batch_id` (uuid nullable): Sangat bermanfaat untuk menandai bahwa beberapa baris pengajuan diajukan bersamaan dalam satu "keranjang pengajuan".
> - Manfaat: Di halaman Purchasing, item-item dengan `batch_id` yang sama bisa ditampilkan dengan label batch/kelompok yang seragam atau langsung diseleksi bersama.
> - Jika tidak menambahkan kolom baru pun, multi-row insert tetap berjalan lancar karena setiap baris independen.
> - **Rekomendasi**: Tambahkan `batch_id uuid default null` via migration baru yang idempotent. Jika belum ada, sistem tetap bisa menyimpan tanpa kolom tersebut, namun dengan `batch_id` data menjadi jauh lebih terstruktur.

### B. Database Migration (RPC Atomik)
Untuk menjamin konsistensi ACID (all-or-nothing), dibuatkan RPC baru `create_bulk_stock_requests`:

```sql
-- Migration: 20260930000002_create_bulk_stock_requests.sql
alter table public.stock_requests
  add column if not exists batch_id uuid;

create or replace function public.create_bulk_stock_requests(
  p_items jsonb,
  p_requested_by uuid,
  p_fulfillment_type text,
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
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Sesi login tidak valid.';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Daftar item pengajuan tidak boleh kosong.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
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
      (v_item->>'material_id')::uuid,
      nullif(v_item->>'material_color_id', '')::uuid,
      p_requested_by,
      (v_item->>'quantity_needed')::numeric,
      coalesce(nullif(v_item->>'unit', ''), 'pcs'),
      nullif(v_item->>'estimated_price', '')::numeric,
      coalesce(nullif(v_item->>'reason', ''), p_global_reason),
      'pending',
      coalesce(nullif(p_fulfillment_type, ''), 'spj'),
      'manual',
      p_batch_id
    );
    v_inserted_count := v_inserted_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'count', v_inserted_count,
    'batch_id', p_batch_id
  );
end;
$$;
```

---

## 4. Rincian Perubahan Frontend

### A. Hook `useStockRequests.ts`
Tambahkan fungsi `createBulkRequests`:
```typescript
async function createBulkRequests(payload: {
  requested_by: string;
  fulfillment_type: 'spj' | 'supplier_purchase';
  global_reason?: string;
  items: Array<{
    material_id: string;
    material_color_id?: string | null;
    quantity_needed: number;
    unit: string;
    estimated_price?: number | null;
    reason?: string | null;
  }>;
}) {
  const { data, error } = await supabase.rpc('create_bulk_stock_requests', {
    p_items: payload.items,
    p_requested_by: payload.requested_by,
    p_fulfillment_type: payload.fulfillment_type,
    p_global_reason: payload.global_reason || null,
  });
  if (error) throw error;
  await fetchRequests();
  return data;
}
```

### B. Komponen Form: `StockRequestModal.tsx` (Refactor Multi-Item)
Mengubah modal agar ramah input banyak item sekaligus:
1. **Bagian Atas (Header Form)**:
   - Dropdown **Staf Gudang Pemohon** (wajib).
   - Selector **Jalur Pembelian**: `SPJ Belanja` vs `Direct Supplier` (dengan badge/kartu visual seperti saat ini).
   - Field **Catatan / Keterangan Kebutuhan Bersama** (misal: "Pengadaan proyek seragam kantor PT Mandiri").
2. **Bagian Tengah (Daftar Baris Item)**:
   - Tabel / Card interaktif per baris item:
     - Nomor urut (1, 2, 3...)
     - Dropdown Material (mencakup badge tipe/kategori & info sisa stok)
     - Dropdown Warna (otomatis muncul jika material bertipe kain/`is_fabric`)
     - Input Qty & Satuan (auto-populate dari satuan material)
     - Input Estimasi Harga Satuan (auto-populate dari harga master material)
     - Catatan spesifik item (opsional)
     - Tombol Hapus Baris (icon sampah, disable jika hanya tersisa 1 baris)
   - Tombol **"+ Tambah Item Bahan Baku"** di bawah daftar baris.
3. **Bagian Bawah (Footer)**:
   - Ringkasan total item yang akan diajukan (misal: "3 item akan diajukan ke Purchasing").
   - Estimasi total anggaran (total Qty × Estimasi Harga per item).
   - Tombol "Batal" & Tombol Submit: "Kirim Pengajuan (N Item)".

### C. Komponen `StockRequestsTab.tsx`
- Menghubungkan fungsi `createBulkRequests` ke modal.
- Menampilkan indikator jika suatu baris request merupakan bagian dari satu batch yang sama (`batch_id`).

### D. Ekstra (Peningkatan UX): Multi-Select di Tab Stok Material
Di `StockTable.tsx` (tab Stok Material):
- Staf gudang sering kali melihat stok tipis dari tabel daftar stok.
- Berikan tombol / aksi "Ajukan Restock" langsung dari baris yang menipis atau multi-select beberapa baris material yang stoknya merah/kuning untuk langsung dikirim ke `StockRequestModal` dengan item-item tersebut sudah otomatis terisi.

---

## 5. Rencana Pengujian (Test Plan)

| No | Skenario | Hasil yang Diharapkan |
|---|---|---|
| 1 | Buka modal "Ajukan Restock Baru" | Form terbuka dengan 1 baris item kosong default, staf pemohon & jalur beli default terisi |
| 2 | Tambah 3 baris item (kain warna hitam, kain warna navy, dan benang) | Dropdown warna muncul dinamis pada kain, satuan dan estimasi harga terisi otomatis dari master |
| 3 | Hapus salah satu baris | Baris terhapus, ringkasan jumlah item dan total estimasi harga berkurang |
| 4 | Validasi form kosong (qty 0 atau material belum dipilih) | Tampil pesan error validasi sebelum submit dikirim |
| 5 | Submit pengajuan multi-item | Seluruh item tersimpan ke database, modal tertutup, muncul di tabel berstatus `pending` |
| 6 | Cek di Halaman Purchasing | Seluruh item tadi muncul di tab Pengajuan Gudang dan dapat diapprove sekaligus dengan tombol Bulk Approve |

---

## 6. Checklist Implementasi

- [ ] 1. Migration `20260930000002_create_bulk_stock_requests.sql` (tambah kolom `batch_id` & RPC `create_bulk_stock_requests`).
- [ ] 2. Update `useStockRequests.ts` untuk menyediakan method `createBulkRequests`.
- [ ] 3. Refactor `StockRequestModal.tsx` menjadi multi-item request modal.
- [ ] 4. Update `StockRequestsTab.tsx` dan `WarehousePage.tsx` untuk integrasi alur baru.
- [ ] 5. Jalankan `npx tsc --noEmit` untuk verifikasi TypeScript.
- [ ] 6. Jalankan `npx supabase db push` untuk mengeksekusi migration.
- [ ] 7. Update `README.md` pada bagian fitur Gudang & Inventori sesuai ketentuan `AGENT_INSTRUCTIONS.md`.
