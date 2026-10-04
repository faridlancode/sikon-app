# Desain Sistem & Spesifikasi Implementasi: Harga Produk & Harga Jahit (Satuan vs Prioritas)

> **Status Dokumen:** Siap Diimplementasi (Approved Design)  
> **Target Modul:** Master Data Produk (`/products`), Form & Detail Order (`/orders`), Payroll & Worklog (`/worklog`, `/payroll`)  
> **Sumber Daya:** `src/types.ts`, `src/components/products/ProductModal.tsx`, `src/components/orders/OrderModal.tsx`, `src/utils/calculateHpp.ts`

---

## 1. Latar Belakang & Aturan Bisnis yang Disetujui

1. **Kategori Order (Satuan vs Prioritas)**:
   - Dihitung dari **total akumulasi `qty` seluruh item** dalam satu order.
   - $\sum \text{qty} < 6 \implies \textbf{Satuan}$ (`order_type = 'satuan'`).
   - $\sum \text{qty} \ge 6 \implies \textbf{Prioritas}$ (`order_type = 'prioritas'`).
   - **Otomatis dengan Override Manual**: Sistem otomatis menentukan kategori saat item ditambahkan/diubah, namun form menyediakan kontrol override (toggle/dropdown) bagi Admin jika ada perlakuan khusus.
   - **Perubahan Qty Pasca-Simpan**: Jika order diedit sehingga total qty melintasi ambang batas 6 pcs (misal revisi dari 5 pcs $\to$ 8 pcs), sistem mengalkulasi ulang harga produk dan tarif jahit ke skema Prioritas.

2. **Harga Jual Produk (`products`)**:
   - Menerapkan **Opsi A dengan Fallback**:
     - `price_prioritas` (atau harga standar partai besar $\ge 6$ pcs).
     - `price_satuan` (harga khusus order $< 6$ pcs).
     - Jika `price_satuan` bernilai null / 0, sistem fallback ke `price_prioritas` (atau `price_prioritas + default_satuan_markup`).

3. **Harga Upah Jahit (`sewing_cost_per_pcs`)**:
   - Master produk menyimpan ongkos jahit standar: `products.sewing_cost_per_pcs`.
   - **Surcharge Satuan Global**: Disimpan di profil perusahaan (`company_profiles.sewing_satuan_surcharge`), default **Rp 10.000 / pcs**, berlaku rata untuk semua pakaian satuan.
   - Pada Order Satuan:
     $$\text{Tarif Jahit Aktual} = \text{products.sewing\_cost\_per\_pcs} + \text{company\_profiles.sewing\_satuan\_surcharge}$$
   - Pada Order Prioritas:
     $$\text{Tarif Jahit Aktual} = \text{products.sewing\_cost\_per\_pcs}$$
   - Nilai tarif ini di-snapshot ke dalam `applied_sewing_rate` di `sewing_assignments` dan menjadi `rate_per_unit` di `piecework_tasks` saat pakaian lulus QC.

---

## 2. Perubahan Skema Database

```sql
-- 1. Tambah kolom kategori order dan override flag pada orders
alter table public.orders
  add column if not exists order_type varchar not null default 'prioritas'
    check (order_type in ('satuan', 'prioritas')),
  add column if not exists is_order_type_manual_override boolean not null default false;

comment on column public.orders.order_type is 'Kategori order: satuan (<6 pcs) atau prioritas (>=6 pcs)';
comment on column public.orders.is_order_type_manual_override is 'True jika admin sengaja mengubah kategori secara manual dari rekomendasi sistem';

-- 2. Tambah kolom harga satuan & prioritas di tabel products
alter table public.products
  add column if not exists price_satuan numeric null check (price_satuan >= 0),
  add column if not exists price_prioritas numeric null check (price_prioritas >= 0);

comment on column public.products.price_satuan is 'Harga jual dasar untuk kategori satuan (<6 pcs)';
comment on column public.products.price_prioritas is 'Harga jual dasar untuk kategori prioritas (>=6 pcs)';

-- 3. Konfigurasi Surcharge Jahit Satuan di company_profiles
alter table public.company_profiles
  add column if not exists sewing_satuan_surcharge numeric not null default 10000 check (sewing_satuan_surcharge >= 0);

comment on column public.company_profiles.sewing_satuan_surcharge is 'Besaran tambahan upah jahit per pcs untuk order satuan (default: Rp 10.000)';

-- 4. Kolom applied_sewing_rate pada sewing_assignments untuk snapshot upah jahit
alter table public.sewing_assignments
  add column if not exists applied_sewing_rate numeric null check (applied_sewing_rate >= 0);

comment on column public.sewing_assignments.applied_sewing_rate is 'Snapshot tarif upah jahit per pcs (termasuk surcharge satuan jika berlaku)';
```

---

## 3. Database Functions & Triggers

### 3.1 Fungsi Evaluasi Kategori Order Otomatis
```sql
create or replace function public.calculate_order_type(p_total_qty numeric)
returns varchar language plpgsql immutable as $$
begin
  if coalesce(p_total_qty, 0) < 6 then
    return 'satuan';
  else
    return 'prioritas';
  end if;
end;
$$;
```

### 3.2 Update Trigger QC Check untuk Memakai `applied_sewing_rate`
Ketika QC meluluskan jahitan di `record_qc_check`:
```sql
-- Cuplikan modifikasi record_qc_check:
-- Mengambil rate jahit dari sewing_assignments.applied_sewing_rate terlebih dahulu
-- Jika null, fallback ke products.sewing_cost_per_pcs
v_rate := coalesce(v_assignment.applied_sewing_rate, v_product.sewing_cost_per_pcs, 0);

insert into public.piecework_tasks (
  user_id, staff_id, order_id, product_id, order_item_id, sewing_assignment_id,
  task_type, qty, rate_per_unit, total_wage, status
) values (
  v_user_id, v_assignment.staff_id, v_order.id, v_product.id, v_item.id, p_sewing_assignment_id,
  'sewing', p_passed_qty, v_rate, (p_passed_qty * v_rate), 'completed'
);
```

---

## 4. Perubahan TypeScript Types (`src/types.ts`)

```typescript
export interface Product {
  id: string;
  name: string;
  // ... existing fields
  default_price?: number;
  price_satuan?: number | null;        // BARU
  price_prioritas?: number | null;     // BARU
  sewing_cost_per_pcs: number;
  // ...
}

export interface Order {
  id: number | string;
  order_date: string;
  order_type: 'satuan' | 'prioritas';            // BARU
  is_order_type_manual_override?: boolean;       // BARU
  grand_total: number | string;
  // ...
}

export interface CompanyProfile {
  // ...
  sewing_satuan_surcharge?: number;              // BARU (default: 10000)
}

export interface SewingAssignment {
  // ...
  applied_sewing_rate?: number | null;           // BARU
}
```

---

## 5. Perubahan Frontend & UI

### 5.1 Modal Master Produk (`ProductModal.tsx`)
* Tambahkan 2 input harga di bagian informasi finansial:
  - **"Harga Jual Prioritas (Partai ≥ 6 pcs)"**: Nilai default harga jual normal.
  - **"Harga Jual Satuan (< 6 pcs)"**: Nilai harga jual satuan (diberi hint: *"Kosongkan jika mengikuti harga prioritas"*).
* Simpan ke kolom `price_prioritas` dan `price_satuan`.

### 5.2 Modal Form Order (`OrderModal.tsx`)
* **Deteksi Reaktif**:
  - Saat item/qty ditambahkan, hitung `currentTotalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)`.
  - Jika `!isManualOverride`:
    `autoType = currentTotalQty < 6 ? 'satuan' : 'prioritas'`.
* **Badge & Toggle Kategori**:
  - Tampilkan badge di dekat Total Item:
    - 🟡 **"Kategori: Satuan (< 6 pcs)"** jika `< 6`.
    - 🟢 **"Kategori: Prioritas (≥ 6 pcs)"** jika `≥ 6`.
  - Sediakan tombol switch/dropdown kecil: *"Ubah Kategori Manual"* untuk mengaktifkan `is_order_type_manual_override`.
* **Prefill Harga Item Otomatis**:
  - Saat produk dipilih atau saat kategori order beralih dari Satuan $\leftrightarrow$ Prioritas, otomatis sesuaikan saran harga produk:
    - Jika Satuan: gunakan `product.price_satuan || product.price_prioritas || product.default_price`.
    - Jika Prioritas: gunakan `product.price_prioritas || product.default_price`.

### 5.3 Modal Pengaturan Perusahaan (`CompanyProfileModal.tsx`)
* Tambahkan field: **"Tambahan Upah Jahit Satuan (Surcharge)"** dengan nilai default `Rp 10.000`.

---

## 6. Checklist Implementasi & Pengujian

- [ ] Jalankan migrasi SQL untuk kolom `order_type`, `price_satuan`, `price_prioritas`, `sewing_satuan_surcharge`, dan `applied_sewing_rate`.
- [ ] Update `src/types.ts` dengan interface yang sesuai.
- [ ] Update `ProductModal.tsx` & `ProductsTable.tsx` agar menampilkan input dan kolom harga satuan vs prioritas.
- [ ] Update `OrderModal.tsx`:
  - Kalkulasi total order qty.
  - Auto-set `order_type` dan seleksi harga satuan vs prioritas.
  - Sediakan opsi manual override kategori.
- [ ] Update `record_qc_check` agar menyimpan `applied_sewing_rate` ke `piecework_tasks.rate_per_unit`.
- [ ] Pengujian kasus:
  - Buat order 3 pcs kemeja $\to$ terdeteksi `satuan` $\to$ harga satuan terpilih $\to$ tarif jahit $+10.000$.
  - Tambah qty jadi 8 pcs $\to$ beralih ke `prioritas` $\to$ harga prioritas terpilih $\to$ tarif jahit standar.
