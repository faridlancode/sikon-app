# Desain: Fix Bulk Approval Supplier Purchase & Field Nama Toko di Stock Request

> **Status:** Siap Diimplementasi
> **Modul:** Purchasing (`/purchasing`), Gudang (`/warehouse` — Pengajuan Restock)
> **File Utama:** `PurchasingPage.tsx`, `useStockRequests.ts`, `StockRequestModal.tsx`, `bulk_approve_stock_requests` RPC, `stock_requests` tabel

---

## 1. Bug: Bulk Approval untuk Supplier Purchase

### Root Cause

Alur Purchasing memiliki **dua jalur berbeda** setelah pengajuan restock disetujui:

| Jalur | Flow Approval | Status setelah "disetujui" |
|---|---|---|
| **SPJ Belanja** | `pending` → **bulk approve** (`approved`) → Buat SPJ (uang muka cair, `in_progress`) | `approved` = siap diproses ke SPJ |
| **Direct Supplier** | `pending` → **langsung buat supplier_purchase** (RPC `approve_stock_request_supplier`) | Tidak perlu tahap `approved` terpisah |

**Masalah:** `bulk_approve_stock_requests` mengubah semua pengajuan pending (termasuk `supplier_purchase`) ke `approved`. Tapi RPC `approve_stock_request_supplier` hanya menerima status `pending` atau `draft_auto` — bukan `approved`. Akibatnya, request yang sudah bulk-approved tidak bisa dilanjutkan ke pembelian supplier.

### Diagram Alur yang Salah vs Benar

```
SALAH (saat ini):
  stock_request (supplier_purchase, pending)
    → bulk_approve → status: 'approved'    ← request.status = 'approved'
    → Buat Pembelian Supplier              ← ERROR: RPC hanya terima 'pending'

BENAR (seharusnya):
  stock_request (supplier_purchase, pending)
    → Klik "Proses ke Supplier" (tanpa bulk approve dulu) → approve_stock_request_supplier → status: 'in_progress'
  
  ATAU jika memang perlu tahap approval terpisah:
  stock_request (supplier_purchase, pending)
    → bulk_approve (supplier_purchase) → status: 'approved'
    → Buat Pembelian Supplier dari yang 'approved' → RPC terima juga 'approved'
```

### Solusi yang Dipilih

**Opsi B** (lebih robust): Patch `approve_stock_request_supplier` agar menerima status `approved` SELAIN `pending`/`draft_auto`.

Alasan:
- Tidak mengubah alur UX (bulk approve tetap bisa dipakai untuk supplier_purchase juga)
- Satu-satunya yang perlu diubah adalah validasi status di RPC — hanya 1 baris
- Tidak ada risk regresi ke flow SPJ

```sql
-- SEBELUM (baris 376 migration 20260926000003):
if v_req.status <> 'pending' and v_req.status <> 'draft_auto' then

-- SESUDAH:
if v_req.status not in ('pending', 'draft_auto', 'approved') then
```

---

## 2. Fitur: Field Nama Toko Belanja di Pengajuan Restock

### Kebutuhan

Saat staf Gudang membuat pengajuan restock baru, mereka sering sudah tahu di toko mana bahan tersedia. Field `preferred_store` (nama toko/supplier rekomendasi) membantu tim Purchasing mengarahkan pembelian ke tempat yang tepat.

### Skema

```sql
-- Tambah kolom preferred_store ke stock_requests
alter table public.stock_requests
  add column if not exists preferred_store text null;

comment on column public.stock_requests.preferred_store is
  'Nama toko / supplier rekomendasi dari staf Gudang saat mengajukan restock. Bersifat opsional — hanya referensi untuk Purchasing.';
```

### UI: `StockRequestModal.tsx`

Tambahkan field **"Nama Toko / Supplier Rekomendasi"** (opsional) di antara field "Alasan" dan "Jalur Pembelian":

```
┌─────────────────────────────────────────────────┐
│  Material *           [Pilih Material ▼]        │
│  Qty *                [____] [unit]             │
│  Jalur Pembelian      [SPJ ▼ / Direct ▼]       │
│  Nama Toko (Opsional) [_________________________] │
│    Contoh: Toko ABC Jl. Sudirman No. 5...       │
│  Alasan               [_________________________] │
└─────────────────────────────────────────────────┘
```

- Field bersifat **opsional** — tidak wajib diisi
- Ditampilkan di tabel pengajuan pada kolom "Catatan / Alasan" (di bawah alasan, sebagai info tambahan)
- Diteruskan ke `useStockRequests` → disimpan ke kolom `preferred_store`
- Juga ditampilkan di panel Purchasing saat review pengajuan

### Update Type

```typescript
// types.ts — StockRequest interface
preferred_store?: string | null;
```

---

## 3. Checklist Implementasi

### Database
- [ ] Migration baru: kolom `preferred_store` di `stock_requests`
- [ ] Migration baru: patch `approve_stock_request_supplier` — tambah `'approved'` di validasi status

### Frontend — Bug Fix
- [ ] Verifikasi RPC `approve_stock_request_supplier` sudah dipatch
- [ ] Cek apakah ada validasi di UI (`PurchasingPage.tsx`) yang perlu disesuaikan
  - Tab "Pengajuan Gudang" → tombol Proses ke Supplier → pastikan menampilkan pengajuan `approved` juga (bukan hanya `pending`)

### Frontend — Field Nama Toko
- [ ] `types.ts`: tambah `preferred_store?: string | null` ke `StockRequest`
- [ ] `StockRequestModal.tsx`: tambah field input "Nama Toko / Supplier Rekomendasi" (opsional)
- [ ] `useStockRequests.ts` → `createRequest()`: teruskan `preferred_store` ke insert
- [ ] Tabel Pengajuan (`StockRequestsTab.tsx` / `PurchasingPage.tsx`): tampilkan `preferred_store` jika ada, di bawah kolom Alasan

---

## 4. Kasus Pengujian

| Skenario | Ekspektasi |
|---|---|
| Bulk approve pengajuan `supplier_purchase` | Status berubah ke `approved` ✓ |
| Buat Pembelian Supplier dari status `approved` | Berhasil — `in_progress`, tidak error |
| Buat Pembelian Supplier dari status `pending` | Tetap bisa (backward compat) ✓ |
| Input nama toko saat buat pengajuan | Tersimpan di `preferred_store` |
| Tidak isi nama toko | Tetap bisa submit (opsional) |
| Tabel pengajuan: ada `preferred_store` | Tampil di kolom Catatan |
| Tabel pengajuan: tidak ada `preferred_store` | Kolom normal, tanpa efek |
