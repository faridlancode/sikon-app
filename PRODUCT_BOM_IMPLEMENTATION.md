# Implementation Spec: Product, COGS & BOM

**Untuk:** AI coding agent yang mengerjakan implementasi di repo ini.
**Status database:** Schema SUDAH LIVE di project dev Supabase (`sikon-app-dev` / `xdojtfhkflbfuwmcjpwe`). Jangan bikin tabel baru lagi kecuali disebutkan eksplisit di dokumen ini (ada 1 function baru yang perlu ditambahkan, lihat Fase 4). Referensi struktur tabel lengkap ada di:
- `supabase/migrations/20260916031213_create_product_bom_master_data.sql`
- `supabase/migrations/20260916031228_link_order_items_to_products.sql`

**Baca dulu sebelum mulai:** `supabase/PRODUCT_BOM_ROADMAP.md` untuk konteks keputusan desain (kenapa product tidak terikat kain spesifik, dll).

---

## 0. Konvensi Wajib Diikuti

Proyek ini React + TypeScript + Vite + react-router-dom + Tailwind (CSS variables/shadcn-style tokens) + Supabase. **Jangan perkenalkan library atau pola baru** — ikuti pola yang SUDAH ADA di file-file berikut sebagai referensi:

| Yang mau dibuat | Contoh pola yang harus ditiru |
|---|---|
| Hook CRUD master data sederhana | `src/hooks/useSales.ts` |
| Hook CRUD dengan nested insert (parent+children) | `src/hooks/useOrders.ts` (lihat `createOrder`) |
| Halaman list + modal tambah/edit | `src/pages/SalesPage.tsx` + `src/components/sales/SalesTable.tsx` + `src/components/sales/SalesModal.tsx` |
| Form dengan baris item dinamis (tambah/hapus baris) | `src/components/orders/OrderModal.tsx` |
| Modal umum | Semua modal di `src/components/*/​*Modal.tsx` — pola: `fixed inset-0 z-50` + backdrop blur + panel putih rounded-2xl |

**Aturan spesifik:**
- Komponen UI dasar (`Button`, `Card`, badge, dll) ada di `src/components/ui/` — **pakai ulang**, jangan bikin baru. Import selalu lowercase filename: `../ui/button`, `../ui/card`, `../ui/FormField` (huruf besar khusus file ini).
- `inputClass` dari `src/components/ui/FormField.tsx` dipakai di semua `<input>`/`<select>`/`<textarea>`.
- Semua halaman dibungkus `<AppShell title="..." subtitle="..." actions={...}>`.
- Semua hook: `useState` + `useEffect(fetchX, [])` + return `{ data, loading, error, refetch, addX, updateX, deleteX }`. Selalu ambil `user.id` dari `supabase.auth.getUser()` sebelum insert (jangan asumsikan RLS auto-isi `user_id` — semua insert WAJIB eksplisit sertakan `user_id`).
- Format angka Rupiah: pakai `formatIDR` dari `src/utils/formatCurrency.ts`. **Jangan** bikin formatter baru.
- Warna semantik yang sudah dipakai: `emerald` = positif/lunas/aktif, `amber` = pending/belum lunas, `rose` = negatif/error/hapus, `sky`/`violet` = aksen netral. Ikuti token CSS (`text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`) — **jangan** hardcode `slate-900` dsb kecuali file yang kamu edit memang sudah pakai itu (cek dulu).
- `tsconfig.json` punya `noImplicitAny: false` dan `strictNullChecks: false` — boleh agak longgar soal tipe (ikuti gaya file existing, jangan over-engineer generic types), TAPI tetap definisikan interface untuk semua data model baru di `src/types.ts`.
- Semua tabel baru sudah RLS-protected (`auth.uid() = user_id`). Tidak perlu logic tambahan di frontend untuk isolasi data.

---

## 1. Tipe Data Baru (`src/types.ts`)

Tambahkan interface berikut (jangan hapus yang sudah ada):

```ts
export interface ProductCategory {
  id: string;
  name: string;
}

export interface MaterialCategory {
  id: string;
  name: string;
  is_fabric: boolean;
}

export interface Material {
  id: string;
  category_id: string | null;
  name: string;
  unit: string;
  price: number;
  composition: string | null;
  care_instruction: string | null;
  description: string | null;
  is_active: boolean;
  // Joined field (via select dengan join ke material_categories)
  material_categories?: { name: string; is_fabric: boolean } | null;
}

export interface MaterialColor {
  id: string;
  material_id: string;
  color_name: string;
  color_code: string | null;
  is_active: boolean;
}

export interface ProductMaterialLine {
  id?: string; // undefined kalau baris baru belum tersimpan
  material_id: string;
  quantity: number;
}

export interface ProductFabricSlot {
  id?: string;
  fabric_category_id: string | null;
  label: string;
  usage_qty: number;
  unit: string;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  sewing_cost_per_pcs: number;
  cutting_cost_per_pcs: number;
  is_active: boolean;
  // Joined field
  product_categories?: { name: string } | null;
}

export interface ProductWithBom extends Product {
  materials: (ProductMaterialLine & { materials?: { name: string; unit: string; price: number } })[];
  fabricSlots: ProductFabricSlot[];
}

/** Kain + warna yang dipilih user untuk 1 slot, dipakai di form Order */
export interface FabricSelection {
  slotId: string;
  slotLabel: string;
  usageQty: number;
  materialId: string;
  materialColorId: string | null;
}

/** Hasil kalkulasi HPP, dipakai untuk tampilan & untuk snapshot ke order_items */
export interface HppBreakdown {
  sewingCost: number;
  cuttingCost: number;
  fixedMaterialsCost: number;
  fabricCost: number;
  hppPerUnit: number;
  fabricLines: {
    slotId: string;
    slotLabel: string;
    materialId: string;
    materialColorId: string | null;
    usageQty: number;
    price: number;
    lineCost: number;
  }[];
}
```

---

## 2. Fase 1 — Master Data: Kategori

**Satu halaman untuk 2 jenis kategori sekaligus** (Product & Material), supaya sidebar tidak terlalu banyak menu. Layout: 2 `Card` bersebelahan (`grid grid-cols-1 lg:grid-cols-2 gap-5`), masing-masing punya tabel + tombol tambah sendiri.

### File yang dibuat

1. **`src/hooks/useProductCategories.ts`** — CRUD `product_categories` (kolom: `name`). Ikuti persis pola `useSales.ts` tapi lebih simpel (cuma 1 kolom `name`, tidak ada `phone`/`is_active`).

2. **`src/hooks/useMaterialCategories.ts`** — CRUD `material_categories` (kolom: `name`, `is_fabric`).

3. **`src/components/categories/ProductCategoryList.tsx`** — Card berisi: header "Kategori Product" + tombol "+ Tambah", list nama kategori (baris sederhana: nama + tombol edit/hapus, TIDAK perlu tabel `<table>` penuh karena cuma 1 kolom — cukup `<ul>` styled mirip list di `BankAccountsCard.tsx`), pakai `useProductCategories`.

4. **`src/components/categories/MaterialCategoryList.tsx`** — Sama seperti di atas tapi untuk `material_categories`, dan setiap baris tampilkan badge kecil "Kain" (emerald) kalau `is_fabric=true`.

5. **`src/components/categories/CategoryModal.tsx`** — Satu modal reusable untuk kedua jenis kategori. Props:
   ```ts
   type CategoryModalProps = {
     open: boolean;
     onClose: () => void;
     onSubmit: (payload: { name: string; is_fabric?: boolean }) => Promise<unknown>;
     editingCategory: { id: string; name: string; is_fabric?: boolean } | null;
     showFabricToggle: boolean; // true kalau dipanggil dari MaterialCategoryList
     title: string; // "Tambah Kategori Product" / "Edit Kategori Material" dst
   };
   ```
   Field: input nama (wajib). Kalau `showFabricToggle=true`, tambahkan checkbox "Ini kategori kain? (akan memunculkan field komposisi/perawatan di form Material)".

6. **`src/pages/CategoriesPage.tsx`** — `<AppShell title="Kategori" subtitle="Kelola kategori product dan kategori material">`, isi `<div className="grid grid-cols-1 lg:grid-cols-2 gap-5"><ProductCategoryList /><MaterialCategoryList /></div>`.

### Routing & Sidebar

- Tambahkan route `/kategori` → `CategoriesPage` di `src/App.tsx`, dibungkus `<ProtectedRoute>` (ikuti pola route lain).
- Di `src/components/layout/Sidebar.tsx`, tambahkan grup baru **"Produksi"** (setelah grup "Transaksi", sebelum "Sumber Daya" atau "Pengaturan" — urutan bebas asal logis), isinya:
  ```ts
  {
    label: 'Produksi',
    items: [
      { to: '/kategori', label: 'Kategori', icon: Layers },
      { to: '/materials', label: 'Material', icon: Package },
      { to: '/products', label: 'Product', icon: Shirt },
    ],
  },
  ```
  (import `Layers`, `Package`, `Shirt` dari `lucide-react`). Route `/materials` dan `/products` dibuat di Fase 2 & 3 — untuk sekarang link-nya boleh sudah ada di sidebar walau halamannya belum jadi (akan dikerjakan fase berikutnya berurutan).

### Definition of Done Fase 1
- [ ] Bisa tambah/edit/hapus kategori product
- [ ] Bisa tambah/edit/hapus kategori material, dengan toggle `is_fabric`
- [ ] Nama kategori unik per user (DB sudah enforce via constraint `unique(user_id, name)` — pastikan pesan error dari Supabase ditangkap & ditampilkan user-friendly, bukan raw Postgres error, kalau user coba input nama duplikat)

---

## 3. Fase 2 — Master Data: Material & Warna

### File yang dibuat

1. **`src/hooks/useMaterials.ts`** — CRUD `materials`. Fetch dengan join: `.select('*, material_categories(name, is_fabric)')`. Tambahkan filter opsional by `category_id`.

2. **`src/hooks/useMaterialColors.ts`** — CRUD `material_colors`, terima `materialId` sebagai parameter hook (`useMaterialColors(materialId: string)`), fetch cuma warna milik material tsb.

3. **`src/components/materials/MaterialModal.tsx`** — Form tambah/edit material:
   - Select Kategori Material (dari `useMaterialCategories`)
   - Input Nama, Satuan (unit — free text atau select dari daftar umum: meter, yard, pcs, roll), Harga
   - **Field kondisional**: kalau kategori terpilih punya `is_fabric=true`, tampilkan 3 field tambahan: Komposisi (textarea), Instruksi Perawatan (textarea), Deskripsi/Spesifikasi (textarea). Kalau `is_fabric=false`, field-field ini disembunyikan DAN value-nya di-null-kan sebelum submit (jangan kirim data lama yang nyangkut kalau user ganti kategori dari kain ke non-kain).

4. **`src/components/materials/MaterialColorsSection.tsx`** — Sub-section (bukan halaman/modal terpisah) yang muncul di dalam detail/edit material, HANYA kalau material tsb kategorinya kain. List warna (nama + kode warna kecil) + input inline "tambah warna baru" (nama + kode, tombol tambah) + tombol hapus per baris. Pakai `useMaterialColors(material.id)`.
   - **Catatan UX:** karena warna baru menyimpan `material_id`, material HARUS sudah tersimpan (punya `id`) sebelum section ini bisa dipakai. Kalau modal masih dalam mode "tambah material baru" (belum ada id), sembunyikan section ini dan tampilkan pesan "Simpan material dulu untuk menambahkan warna."

5. **`src/components/materials/MaterialsTable.tsx`** — Tabel list: Nama, Kategori (badge), Satuan, Harga, Status (aktif/nonaktif), aksi (edit/hapus). Baris kain bisa dikasih indikator kecil (ikon kain) di kolom nama.

6. **`src/pages/MaterialsPage.tsx`** — `<AppShell title="Material" subtitle="Kelola bahan baku (kain & aksesoris)" actions={<Button>+ Tambah Material</Button>}>`. Filter tabs by kategori (mirip pola tab status di `OrderFilters.tsx`, tapi opsi tab-nya dinamis dari daftar `material_categories` + "Semua").

### Routing
- Tambahkan route `/materials` → `MaterialsPage` di `App.tsx`.

### Definition of Done Fase 2
- [ ] Bisa tambah material non-kain (field kain tersembunyi, tidak ada section warna)
- [ ] Bisa tambah material kain (field komposisi/perawatan/deskripsi muncul, section warna muncul setelah material tersimpan)
- [ ] Bisa tambah/hapus warna untuk material kain
- [ ] Filter tabel by kategori berfungsi

---

## 4. Fase 3 — Master Data: Product (BOM)

Ini bagian paling kompleks di master data. Form Product = 3 section dalam 1 modal (mirip struktur `OrderModal.tsx` yang sudah handle multi-section + baris dinamis).

### File yang dibuat

1. **`src/hooks/useProducts.ts`** — CRUD `products` DENGAN nested insert/update untuk `product_materials` dan `product_fabric_slots`, persis pola `useOrders.ts` (`createOrder`/`updateOrder` yang insert parent lalu children, dan untuk update: hapus semua children lama lalu insert ulang — strategi paling aman untuk edit form dengan baris dinamis).

   Signature yang disarankan:
   ```ts
   async function createProduct(payload: {
     product: Omit<Product, 'id'>;
     materials: ProductMaterialLine[];
     fabricSlots: ProductFabricSlot[];
   }): Promise<Product>

   async function updateProduct(id: string, payload: sama seperti di atas): Promise<void>

   async function fetchProductBom(productId: string): Promise<{ materials: ProductMaterialLine[]; fabricSlots: ProductFabricSlot[] }>
   ```

2. **`src/components/products/ProductModal.tsx`** — Modal besar (`max-w-2xl`, scrollable, mirip `OrderModal.tsx`):
   - **Section Info Dasar:** Select Kategori Product, Input Nama, Textarea Deskripsi, Input Biaya Jahit per pcs (Rp), Input Biaya Potong per pcs (Rp)
   - **Section BOM Aksesoris** (judul: "Bahan Baku Fix (Aksesoris, dll)"): baris dinamis, tiap baris = Select Material (**HANYA tampilkan material yang kategorinya `is_fabric=false`** — filter di dropdown) + Input Qty + tombol hapus baris. Tombol "+ Tambah Bahan".
   - **Section Slot Kain** (judul: "Kebutuhan Kain"): baris dinamis, tiap baris = Input Label (default "Kain Utama", placeholder contoh "Kain Furing/Lining") + Select Kategori Kain (filter `material_categories` yang `is_fabric=true`) + Input Kebutuhan (angka) + Select Satuan (meter/yard) + tombol hapus baris. Tombol "+ Tambah Slot Kain". **Boleh kosong** (product tanpa kain sama sekali, misal produk aksesoris murni).
   - Footer: tampilkan **Estimasi HPP (tanpa kain)** live = `sewing_cost + cutting_cost + Σ(qty × harga material aksesoris)`. Kasih catatan kecil di bawahnya: "*Belum termasuk kain — kain dipilih saat membuat order*".

3. **`src/components/products/ProductsTable.tsx`** — Tabel: Nama, Kategori, Biaya Jahit, Biaya Potong, Estimasi HPP (tanpa kain), Status, aksi (edit/hapus). Aksi hapus: konfirmasi dulu (`window.confirm`), ingat product yang sudah dipakai di `order_items.product_id` akan otomatis jadi `null` di order lama (FK `on delete set null`) — tidak perlu validasi block-delete, tapi kasih pesan di confirm dialog: "Product yang sudah pernah dipakai di order tetap muncul historinya, tapi tidak bisa dipilih lagi untuk order baru."

4. **`src/pages/ProductsPage.tsx`** — `<AppShell title="Product" subtitle="Kelola resep/BOM produk" actions={<Button>+ Tambah Product</Button>}>`.

### Routing
- Tambahkan route `/products` → `ProductsPage` di `App.tsx`.

### Definition of Done Fase 3
- [ ] Bisa buat product dengan kategori, biaya jahit/potong
- [ ] Bisa tambah beberapa baris BOM aksesoris (dropdown material HANYA menampilkan non-kain)
- [ ] Bisa tambah beberapa slot kain (0, 1, atau lebih dari 1 baris)
- [ ] Estimasi HPP tanpa-kain terhitung benar & live update saat form diisi
- [ ] Edit product: baris BOM & slot kain lama ter-load dengan benar, submit ulang menyimpan perubahan (termasuk hapus baris)

---

## 5. Fase 4 — Utility Kalkulasi HPP

**Keputusan desain (revisi dari roadmap awal):** HPP dihitung di **frontend (TypeScript)**, BUKAN via database RPC. Alasan: perhitungannya murni aritmatika sederhana (kali & jumlah) dari data yang sudah di-fetch, tidak butuh atomicity seperti `record_order_payment`. Ini juga konsisten dengan `useOrders.createOrder` yang sudah orchestrate insert dari frontend, bukan RPC tunggal.

### File yang dibuat

**`src/utils/calculateHpp.ts`**

```ts
import type { ProductWithBom, FabricSelection, HppBreakdown, Material } from '../types';

/**
 * Hitung HPP per unit untuk 1 product + pilihan kain per slot.
 * materialsById: map semua material yang relevan (aksesoris di BOM + kain yang dipilih),
 * key = material.id, supaya function ini tidak perlu fetch sendiri (data sudah di-fetch
 * di level form/hook pemanggil).
 */
export function calculateHpp(
  product: ProductWithBom,
  fabricSelections: FabricSelection[],
  materialsById: Record<string, Material>
): HppBreakdown {
  const sewingCost = product.sewing_cost_per_pcs;
  const cuttingCost = product.cutting_cost_per_pcs;

  const fixedMaterialsCost = product.materials.reduce((sum, line) => {
    const material = materialsById[line.material_id];
    return sum + (material ? material.price * line.quantity : 0);
  }, 0);

  const fabricLines = fabricSelections.map((sel) => {
    const material = materialsById[sel.materialId];
    const price = material?.price ?? 0;
    const lineCost = price * sel.usageQty;
    return {
      slotId: sel.slotId,
      slotLabel: sel.slotLabel,
      materialId: sel.materialId,
      materialColorId: sel.materialColorId,
      usageQty: sel.usageQty,
      price,
      lineCost,
    };
  });

  const fabricCost = fabricLines.reduce((sum, l) => sum + l.lineCost, 0);

  return {
    sewingCost,
    cuttingCost,
    fixedMaterialsCost,
    fabricCost,
    hppPerUnit: sewingCost + cuttingCost + fixedMaterialsCost + fabricCost,
    fabricLines,
  };
}
```

Tidak perlu unit test formal, tapi pastikan handle kasus: product tanpa slot kain (`fabricSelections = []` → `fabricCost = 0`, valid), dan material yang sudah dihapus/tidak ketemu di `materialsById` (fallback price 0, jangan crash).

### Definition of Done Fase 4
- [ ] Function menghasilkan angka yang benar untuk kasus: product tanpa kain, product dengan 1 kain, product dengan 2+ slot kain
- [ ] `hppPerUnit` = jumlah semua komponen, tidak ada NaN/undefined kalau data parsial

---

## 6. Fase 5 — Integrasi ke Order (bagian paling penting)

Ini yang mengubah `OrderModal.tsx` supaya alur pilih item jadi: **Kategori → Product → Kain (per slot) → Warna**, ganti input `name_item` bebas teks.

### 6.1 Ubah `src/hooks/useOrders.ts`

- `createOrder` dan `updateOrder`: ubah cara insert `order_items`. **Jangan bulk insert array sekaligus** — insert satu per satu di dalam loop, supaya bisa dapat `id` hasil insert tiap item (pakai `.insert(item).select().single()`), karena `id` itu dibutuhkan untuk insert `order_item_fabrics` (foreign key `order_item_id`) setelahnya.
- Payload item sekarang berisi: `product_id`, `name_item` (auto dari `product.name`, JANGAN dari input manual lagi), `qty`, `price` (harga jual, tetap manual input), `hpp_per_unit_snapshot`, `hpp_total_snapshot` (`= hpp_per_unit_snapshot * qty`), plus array `fabricSelections` (tidak disimpan langsung ke `order_items`, tapi dipakai untuk insert `order_item_fabrics` setelah tau `order_item.id`).
- Setelah dapat `order_item.id`, insert ke `order_item_fabrics`: untuk tiap `fabricSelections`, baris `{ order_item_id, product_fabric_slot_id: slotId, material_id, material_color_id, usage_qty_snapshot: usageQty, price_snapshot: price, line_cost_snapshot: lineCost, user_id }`.
- Kolom `bahan` (free text lama) di `order_items`: **jangan diisi lagi** dari form baru (biarkan `null`).

### 6.2 Ubah `src/components/orders/OrderModal.tsx`

Struktur baris item order berubah total. Per baris item:

1. **Select Kategori Product** (dari `useProductCategories`)
2. **Select Product** — opsinya difilter oleh kategori terpilih di atas, dari `useProducts` (cuma yang `is_active=true`)
3. Begitu Product dipilih, **fetch BOM-nya** (`fetchProductBom(product.id)` dari Fase 3, ATAU sertakan `materials`+`fabricSlots` langsung di response `useProducts` kalau product list sudah di-fetch dengan join lengkap — pilih salah satu, yang penting datanya sampai ke form)
4. **Untuk tiap `product_fabric_slots` milik product tsb** (bisa 0, 1, atau banyak baris), render sub-form:
   - Label slot (read-only, dari `slot.label`)
   - Select Material — difilter: HANYA material yang `category_id` cocok dengan `slot.fabric_category_id` (atau semua material `is_fabric=true` kalau `slot.fabric_category_id` null)
   - Select Warna — muncul SETELAH Material dipilih, opsinya dari `useMaterialColors(materialId)`. Kalau material yang dipilih tidak punya warna sama sekali (list kosong), sembunyikan select warna (tidak wajib).
5. Input **Qty** (jumlah pcs yang dipesan)
6. Input **Harga Jual** (manual, seperti sebelumnya — ini beda dari HPP)
7. **Tampilkan live**: card kecil "Estimasi HPP: Rp xxx / pcs · Total: Rp xxx" (pakai `calculateHpp` dari Fase 4), dan opsional tampilkan margin (`price - hppPerUnit`) kalau mau (nice-to-have, tidak wajib untuk MVP fase ini).

**Validasi sebelum baris item bisa disubmit:**
- Product wajib dipilih
- Kalau product punya N slot kain, SEMUA N slot wajib ada Material terpilih (warna opsional kalau material tsb tidak punya warna terdaftar)
- Qty > 0, Harga jual > 0 (aturan lama yang sudah ada, tetap berlaku)

### 6.3 Ubah `src/components/orders/OrdersTable.tsx`

Tambahkan kolom **"Total Qty"** di tabel list order (ini request terpisah dari user yang belum dikerjakan — sekalian di fase ini). Nilainya = jumlah semua `order_items.qty` dalam 1 order. Cara paling gampang: tambahkan agregasi ini di query/hook `useOrders` (JOIN + SUM, atau hitung di JS setelah fetch `order_items` — pilih yang lebih murah query-nya, idealnya lewat view `orders_with_balance` yang di-extend, TAPI karena tidak boleh ubah schema lagi di fase ini tanpa migration baru, hitung agregasi total_qty di level JavaScript setelah fetch `order_items` per order, atau tambahkan 1 migration kecil terpisah untuk nambahin `total_qty` ke view `orders_with_balance` kalau agent menilai itu lebih baik — opsional, silakan pertimbangkan sendiri mana yang lebih maintainable).

### 6.4 Ubah `src/components/orders/OrderDetailModal.tsx`

Tampilan detail item order sekarang perlu menunjukkan breakdown yang lebih kaya dari sebelumnya (dulu cuma nama+qty+harga):
- Nama product + kategori
- Untuk tiap kain yang dipakai (dari `order_item_fabrics`, join ke `materials`+`material_colors` untuk nama): "Kain Utama: Nagata Drill - Navy (1.5m × Rp xxx)"
- HPP per unit & total (snapshot, dari `order_items.hpp_per_unit_snapshot`/`hpp_total_snapshot`)
- Margin (opsional): `price - hpp_per_unit_snapshot`, ditampilkan per baris

### Definition of Done Fase 5
- [ ] Form Order: alur Kategori → Product → Kain per slot → Warna berfungsi penuh
- [ ] Product tanpa slot kain (misal produk aksesoris) tetap bisa di-order tanpa perlu pilih kain
- [ ] Product dengan 2+ slot kain (kain utama + furing) mewajibkan user isi kedua-duanya
- [ ] Submit order berhasil insert `order_items` + `order_item_fabrics` dengan benar, HPP ter-snapshot
- [ ] Kolom Total Qty muncul & benar di tabel Orders
- [ ] Detail order menampilkan breakdown kain & HPP yang dipakai

---

## 7. Fase 6 (Opsional / Nice-to-have, kerjakan terakhir kalau sempat)

- Kartu di Dashboard: Total Revenue vs Total HPP vs Margin (dari `SUM(order_items.hpp_total_snapshot)` vs `SUM(order_items.price * order_items.qty)`)
- Breakdown margin per Product (product mana paling untung), bisa pakai view baru `product_margin` (butuh migration terpisah kalau mau dibuat sebagai view, atau cukup dihitung di frontend dari data yang sudah ada)

**Jangan kerjakan fase ini sebelum Fase 1-5 selesai dan sudah dicoba end-to-end.**

---

## 8. Catatan Tambahan untuk Agent

- **Test manual setelah tiap fase**, jangan tunggu sampai semua fase selesai baru dicoba — form BOM/Order ini kompleks, lebih gampang debug per fase.
- Kalau nemu ambiguitas yang tidak dijawab dokumen ini, **pilih pendekatan yang konsisten dengan pola existing codebase** dulu, baru custom kalau memang perlu. Jangan ragu tambahkan komentar `// TODO:` di kode kalau ada keputusan yang sengaja disederhanakan untuk MVP.
- Jangan hapus/ubah kolom `bahan` di `order_items` — biarkan nullable & tidak dipakai, jangan drop dari database (ada kemungkinan dipakai lagi nanti, dan drop kolom butuh migration terpisah yang harus direview manual, bukan keputusan sepihak agent).
- Kalau butuh migration BARU (misal jadi butuh view tambahan di Fase 5.3 atau Fase 6), buat sebagai file baru di `supabase/migrations/` dengan format nama `<YYYYMMDDHHMMSS>_<deskripsi_singkat>.sql`, JANGAN edit file migration yang sudah ada.
