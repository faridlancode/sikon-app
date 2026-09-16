# Roadmap: Fitur Product, COGS & BOM

Status: **Migration schema selesai & sudah live di project DEV (`xdojtfhkflbfuwmcjpwe` / faridlancode-test).** Implementasi frontend belum dimulai — dokumen ini jadi panduan tahapan pengerjaannya.

> **Koreksi penting:** migration ini sempat salah kena ke production (`gdrqfwqdxazrdrxumnhy`) karena awalnya saya belum tahu ada 2 project terpisah. Sudah di-rollback dari production dan diterapkan ulang khusus di project dev. Project dev juga sudah dilengkapi function/trigger/view/storage policy yang tadinya belum ada (sebelumnya cuma tabel dasar). `.env` project sekarang sudah menunjuk ke dev, bukan production — lihat catatan di bagian bawah.
>
> Login dev: `dev@sikon.com` (password sesuai yang di-seed sebelumnya di `seed-dev.sql`).

## Ringkasan Keputusan Desain

- `products` = resep/BOM, bukan barang fisik. Tidak terikat ke kain spesifik.
- Kain (`materials` berkategori `is_fabric=true`) baru dipilih saat **Order** dibuat, karena harga kain beda-beda per jenis.
- Satu product bisa punya **lebih dari 1 slot kain** (`product_fabric_slots`) — misal kain utama + furing.
- Biaya jahit & potong dihitung **per pcs**, dikali qty saat order.
- Harga warna kain **sama semua** (`material_colors` cuma buat referensi, bukan pricing).
- HPP **di-snapshot** saat order dibuat (`order_items.hpp_per_unit_snapshot`, `hpp_total_snapshot`, dan detail per kain di `order_item_fabrics`) — histori margin tidak berubah walau harga material naik belakangan.
- Alur pilih di form Order: **Kategori Product → Product (model) → Kain → Warna**.

## Skema Database (sudah diterapkan)

| Migration | Isi |
|---|---|
| `202609150001_product_categories.sql` | `product_categories` (Kemeja, Rompi, dll) — *sudah ada dari sesi sebelumnya, file ini backfill* |
| `20260916031213_create_product_bom_master_data.sql` | `material_categories`, `materials`, `material_colors`, `products`, `product_materials`, `product_fabric_slots` |
| `20260916031228_link_order_items_to_products.sql` | `order_items.product_id` + kolom snapshot HPP, tabel `order_item_fabrics` |

Lihat isi masing-masing file untuk detail kolom & constraint. Semua tabel sudah RLS-protected (single-tenant, `auth.uid() = user_id`).

---

## Tahapan Implementasi Frontend

### Fase 1 — Master Data: Kategori
**Tujuan:** owner bisa kelola kategori product & kategori material sendiri, sebelum bisa input Material/Product.

- [ ] Hook `useProductCategories.ts` (CRUD sederhana, ikuti pola `useSales.ts`)
- [ ] Hook `useMaterialCategories.ts` (CRUD + field `is_fabric`)
- [ ] Halaman `pages/ProductCategoriesPage.tsx` — tabel + modal tambah/edit (copy pola dari `SalesPage.tsx`)
- [ ] Halaman `pages/MaterialCategoriesPage.tsx` — sama, plus toggle "Ini kategori kain?"
- [ ] Tambah 2 menu baru di `Sidebar.tsx` (grup "Master Data" atau grup baru "Produksi")

### Fase 2 — Master Data: Material & Warna
**Tujuan:** owner bisa input bahan baku (kain & aksesoris) beserta warnanya.

- [ ] Hook `useMaterials.ts` (CRUD, join `material_categories` untuk tampilkan nama kategori)
- [ ] Hook `useMaterialColors.ts` (CRUD per material_id)
- [ ] Komponen `MaterialModal.tsx` — form dinamis: kalau kategori terpilih `is_fabric=true`, tampilkan field Komposisi/Instruksi Perawatan/Deskripsi. Kalau bukan, sembunyikan.
- [ ] Komponen `MaterialColorsManager.tsx` — sub-section di dalam detail Material (bukan halaman terpisah), list warna + tambah/hapus cepat
- [ ] Halaman `pages/MaterialsPage.tsx` — tabel material, filter by kategori, aksi buka detail (buat kelola warna) / edit / hapus

### Fase 3 — Master Data: Product (BOM)
**Tujuan:** owner bisa rakit "resep" product — pilih kategori, isi biaya jahit/potong, tambah BOM aksesoris, tambah slot kain.

- [ ] Hook `useProducts.ts` (CRUD product + nested insert/update untuk `product_materials` dan `product_fabric_slots`, mirip pola `useOrders.ts` yang sudah handle order+items sekaligus)
- [ ] Komponen `ProductModal.tsx` — form multi-section:
  - Info dasar: kategori, nama, deskripsi, biaya jahit/potong per pcs
  - Section BOM Aksesoris: baris dinamis (pilih material non-kain + qty) — mirip pola item dinamis di `OrderModal.tsx`
  - Section Slot Kain: baris dinamis (label, kategori kain, usage_qty, unit)
- [ ] Halaman `pages/ProductsPage.tsx` — tabel product + kolom "Estimasi HPP" (hitung live: jahit+potong+aksesoris, TANPA kain karena kain belum dipilih — kasih catatan "+ kain saat order")

### Fase 4 — Kalkulasi HPP (logic inti)
**Tujuan:** fungsi reusable untuk hitung HPP final begitu kain+warna dipilih.

- [ ] Util/hook `useCalculateHpp.ts` — terima `product_id` + array `{slot_id, material_id, color_id}` → return breakdown (jahit, potong, aksesoris, tiap slot kain, total per unit)
- [ ] Pertimbangkan: hitung di frontend (query material prices + product BOM, hitung JS) vs RPC database (`calculate_product_hpp`). **Rekomendasi: RPC**, supaya logic konsisten dipakai dari mana saja (form order, halaman product, laporan) dan tidak duplikasi logic di banyak tempat frontend.

### Fase 5 — Integrasi ke Order
**Tujuan:** form Order pakai alur Kategori → Product → Kain → Warna, otomatis hitung & snapshot HPP.

- [ ] Ubah `OrderModal.tsx`: baris item order tidak lagi input `name_item` bebas teks, tapi:
  1. Select Kategori Product
  2. Select Product (difilter oleh kategori terpilih)
  3. Untuk tiap `product_fabric_slots` milik product tsb → select Material (kain, difilter kategori slot) → select Warna
  4. Tampilkan estimasi HPP per pcs (live, dari Fase 4) sebagai referensi sebelum owner isi harga jual
- [ ] Saat submit order: insert ke `order_items` (dengan `product_id`, `hpp_per_unit_snapshot`, `hpp_total_snapshot`) + insert baris `order_item_fabrics` untuk tiap slot yang dipilih
- [ ] Update `OrderDetailModal.tsx` — tampilkan breakdown HPP & kain yang dipakai per item (bukan cuma nama+qty+harga seperti sekarang)

### Fase 6 — Laporan Margin (opsional, nice-to-have)
- [ ] Kartu/chart baru di Dashboard: Total Revenue vs Total HPP vs Margin, dari `order_items.hpp_total_snapshot`
- [ ] Breakdown margin per Product (product mana paling untung)

---

## Yang Belum Diputuskan / Perlu Didiskusikan Lagi Nanti

- **Stok/inventori material** — skema saat ini belum tracking stok kain/aksesoris (cuma master data harga). Kalau nanti butuh tahu "kain Nagata Drill sisa berapa meter", perlu tabel pergerakan stok terpisah (topik lanjutan, belum di-scope sekarang).
- **Harga jual disarankan** — `products` belum ada `suggested_selling_price`/markup %. Bisa ditambah kalau owner mau sistem otomatis saranin harga jual dari HPP + margin target.
- **Approval / lock harga material** — saat ini siapa saja (ya, cuma owner sih, single-tenant) bisa ubah harga material kapan saja tanpa histori perubahan harga. Kalau butuh audit trail harga (kapan harga kain naik, dari berapa ke berapa), perlu tabel `material_price_history` terpisah.
