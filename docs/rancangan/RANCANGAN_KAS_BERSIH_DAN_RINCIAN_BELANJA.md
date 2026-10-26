# Rancangan: Pembersihan Arus Kas Buku Kas & Rincian Belanja Material (Opsi 3)

- Tanggal: 2026-10-24
- Status: Disetujui
- Domain pemilik: `ORDER_DAN_KEUANGAN` (rujukan ke `GUDANG_DAN_PURCHASING` untuk rincian SPJ & supplier)
- Dokumen pendamping: `docs/PENJELASAN_ALUR_KEUANGAN_DAN_AKUNTANSI.md`

---

## 1. Masalah

1. **Arus Kas Menggelembung di `/financial`**:
   Saat staf mengajukan kasbon (uang muka purchasing) lalu mempertanggungjawabkannya lewat SPJ, sistem mencatat pengeluaran kasbon, pengeluaran belanja riil, dan pemasukan "Reversal Uang Muka" sebagai penyeimbang kas. Di halaman `/financial`, rumus sederhana `SUM(income)` dan `SUM(expense)` menyebabkan:
   - Total Pemasukan menampilkan angka pembalikan kasbon (misal Rp 5.500.000) seolah-olah ada omzet bisnis masuk.
   - Total Pengeluaran terhitung dua kali (kasbon keluar + belanja keluar = Rp 13.165.000), padahal uang keluar riil hanya Rp 7.665.000.
2. **Ketiadaan Rincian Bahan di Buku Kas**:
   Transaksi belanja material hanya menampilkan judul global seperti `SPJ Pembelian Material - Budi` atau `Pembelian Pembelian Material - PT Warna Warni` dengan deskripsi teks ID mentah. Pemilik usaha tidak bisa melihat kain atau aksesoris apa saja yang dibeli tanpa harus berpindah ke modul gudang/purchasing.

---

## 2. Keputusan

1. **Pembersihan Logika Ringkasan Finansial (`useFinanceSummary`)**:
   - Transaksi bertipe `Reversal Uang Muka` (teridentifikasi dari judul atau `counter_account_id = 1-1400`) **dikeluarkan dari Total Pemasukan**. Pemasukan murni mencerminkan penerimaan bisnis riil.
   - Transaksi `Uang Muka Purchasing` yang sudah memiliki reversal pasangannya **dinetralkan dari Total Pengeluaran**, sehingga yang dihitung sebagai beban pengeluaran kas adalah belanja riil dari SPJ itu sendiri. Uang muka yang masih *outstanding* (belum ada SPJ/reversal) tetap dihitung sebagai kas keluar berjalan.
   - Saldo Kas & Bank akhir tetap 100% konsisten dengan brankas fisik: $\text{Saldo Kas} = \text{Saldo Awal} + \text{Pemasukan Bersih} - \text{Pengeluaran Bersih}$.
2. **Badge Visual Khusus Penyeimbang Kasbon**:
   - Baris `Reversal Uang Muka` di tabel diberi badge semantik netral (`Penyeimbang Kasbon`) dengan catatan penjelasan agar pemilik tidak mengiranya sebagai omzet penjualan.
3. **Rincian Belanja Material Gabungan (Opsi 3)**:
   - Menambahkan kolom `purchasing_report_id` dan `supplier_purchase_id` pada tabel `transactions`.
   - Mengupdate RPC `approve_purchasing_report` dan `approve_stock_request_supplier` agar menyimpan relasi FK tersebut.
   - Menyiapkan RPC `get_transaction_purchase_items(p_transaction_id uuid)` untuk mengambil rincian bahan (nama material, warna, qty, satuan, harga satuan, subtotal).
   - Di UI `TransactionTable`:
     - Menampilkan ringkasan teks 1-2 bahan utama di bawah judul transaksi.
     - Menyediakan tombol/link klik *"Lihat Rincian (N item)"* yang membuka modal pop-up detail nota belanja (`PurchaseDetailsModal`).

---

## 3. Aturan Bisnis Keras

1. **Konsistensi Saldo Fisik**:
   Formula pembersihan kartu summary tidak boleh mengubah nilai akhir `bankBalance`:
   $$\text{bankBalance} = \text{saldoAwal} + \Sigma \text{income riil} - \Sigma \text{expense riil} \equiv \text{saldoAwal} + \Sigma \text{income gross} - \Sigma \text{expense gross}$$
2. **Pemisahan Peran**:
   Pembersihan tampilan buku kas `/financial` tidak memengaruhi jurnal akuntansi double-entry di `/akuntansi` (jurnal umum tetap mencatat debit/kredit seimbang).
3. **Data Relasional**:
   Jika transaksi berasal dari SPJ atau Direct Supplier, relasi harus terjaga dengan `on delete set null` agar riwayat transaksi kas tidak terhapus jika dokumen induk diarsipkan/dihapus.

---

## 4. Perubahan Data & Migrasi

- **Migration**: `20261024100000_financial_cashflow_cleanup_and_purchase_details.sql`
- Tambah kolom di `public.transactions`:
  - `purchasing_report_id uuid null references public.purchasing_reports(id) on delete set null`
  - `supplier_purchase_id uuid null references public.supplier_purchases(id) on delete set null`
- Indexing kedua kolom.
- Backfill otomatis dari pola teks `description` pada transaksi yang sudah ada.

---

## 5. Perubahan RPC

1. `approve_purchasing_report(uuid)`: Mengisi `purchasing_report_id = p_report_id` pada baris insert `transactions`.
2. `approve_stock_request_supplier(...)`: Mengisi `supplier_purchase_id = v_purchase.id` pada baris insert `transactions`.
3. RPC baru `get_transaction_purchase_items(p_transaction_id uuid)`:
   - Security: `security definer set search_path = public`, validasi `user_id = auth.uid()`.
   - Mengembalikan JSON array berisi detail item belanja material.

---

## 6. Perubahan UI

1. `src/hooks/useFinanceSummary.ts`: Filter transaksi reversal dan pengeluaran kasbon yang sudah settled.
2. `src/components/transactions/TransactionTable.tsx`: Ringkasan teks material, badge penyeimbang kasbon, dan tombol buka detail.
3. `src/components/transactions/PurchaseDetailsModal.tsx`: Modal pop-up tabel rincian bahan, warna, jumlah, harga satuan, dan subtotal.
4. `src/hooks/useTransactions.ts`: Mengikutsertakan kolom `purchasing_report_id` dan `supplier_purchase_id` dalam `select`.
