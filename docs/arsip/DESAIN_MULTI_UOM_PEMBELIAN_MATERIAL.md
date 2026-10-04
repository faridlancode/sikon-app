# Desain Fitur: Satuan Beli Grosir dan Stok Material

## Status Dokumen

Keputusan desain disepakati dan sedang diterapkan. Migration database belum dijalankan.

## 1. Latar Belakang

Material sering dibeli dalam bentuk kemasan, sementara stok gudang dan pemakaian produksi menggunakan satuan dasar yang lebih kecil. Contohnya:

- Benang dibeli per cone besar atau cone kecil, stok dasar dalam yard.
- Sleting dibeli per plastik atau satuan, stok dasar dalam pcs.
- Kancing dibeli per plastik, stok dasar dalam pcs.
- Kain dibeli per meter atau roll, stok dasar dalam meter. Panjang aktual setiap roll dapat berbeda.
- Material lain seperti jarum, kain keras, dan velkro perlu dapat memakai pola yang sama tanpa menambahkan kolom khusus per jenis barang.

Master material saat ini sudah memiliki `unit`, `purchase_unit`, dan `conversion_rate`. Akan tetapi, satu material hanya dapat menyimpan satu satuan beli, dan alur permintaan serta penerimaan belum menggunakan konversi tersebut secara konsisten.

## 2. Keputusan dari Diskusi

1. Pemohon/purchasing boleh memilih satuan beli yang sesuai untuk material tersebut.
2. Isi roll atau kemasan tertentu tidak selalu standar; jumlah aktual perlu dicatat saat penerimaan barang.
3. Satu material dapat memiliki beberapa satuan beli, misalnya benang cone kecil dan cone besar, atau kain meter dan roll.
4. Tampilan stok fisik di halaman Gudang untuk sementara menampilkan dua satuan: satuan stok dasar dan satu satuan beli utama yang ditetapkan per material.
5. Untuk satuan beli dengan isi variabel, petugas mencatat jumlah aktual dalam satuan stok dasar saat penerimaan.
6. Untuk kemasan variabel seperti roll dengan panjang berbeda, halaman stok hanya menampilkan jumlah dalam satuan dasar. Jumlah roll tidak ditampilkan sebagai saldo stok karena sistem tidak melacak saldo tiap roll setelah dibuka/dipakai.

## 3. Prinsip Satuan

- **Satuan stok dasar (`base unit`)** adalah satuan tunggal yang menjadi sumber kebenaran untuk saldo gudang, mutasi stok, BOM, dan HPP material. Contohnya pcs, meter, yard, atau kg.
- **Satuan beli (`purchase unit`)** adalah pilihan kemasan/transaksi per material, misalnya cone kecil, cone besar, plastik, roll, atau meter.
- **Konversi tetap** dipakai jika isi kemasan konsisten. Contoh: 1 plastik = 100 pcs.
- **Konversi variabel** dipakai jika isi kemasan berubah-ubah. Contoh: panjang roll kain bervariasi. Jumlah stok dasarnya ditentukan dari kuantitas aktual yang diukur saat penerimaan, bukan dari rasio perkiraan.
- Setiap baris transaksi menyimpan snapshot nama satuan dan data konversi yang dipakai saat transaksi. Mengubah konfigurasi material di kemudian hari tidak boleh mengubah makna transaksi lama.

Untuk kemasan dengan konversi tetap:

`stok dasar bertambah = jumlah kemasan diterima x isi satu kemasan`

Untuk kemasan dengan isi variabel:

`stok dasar bertambah = jumlah aktual satuan dasar yang dicatat saat penerimaan`

Harga stok per satuan dasar dihitung dari total biaya pembelian dibagi jumlah stok dasar aktual yang diterima. Total pengeluaran pembelian tetap dihitung dari jumlah dan harga transaksi satuan beli.

## 4. Alur yang Dirancang

### 4.1 Master Material

- Tetap ada satu satuan stok dasar per material.
- Material dapat memiliki nol atau lebih pilihan satuan beli.
- Setiap pilihan menyimpan nama satuan, jenis konversi (tetap atau variabel), dan rasio jika konversinya tetap.
- Pilihan satuan beli dapat dinonaktifkan tanpa menghapus riwayat transaksi.
- Stok material menampilkan jumlah satuan dasar dan ekuivalen satuan beli utama hanya jika satuan tersebut memiliki rasio tetap. Untuk satuan utama variabel, stok hanya ditampilkan dalam satuan dasar.
- Contoh benang dapat memiliki `cone kecil` dan `cone besar`, masing-masing dengan isi yard yang berbeda.

### 4.2 Pengajuan Restok

- Pemohon memilih material dan salah satu satuan beli yang tersedia.
- Jumlah dan estimasi harga merujuk ke satuan yang dipilih, misalnya 2 cone @ Rp 25.000/cone.
- Form menampilkan ekuivalen satuan dasar untuk kemasan berkonversi tetap dan subtotal estimasi.
- Permintaan menyimpan nama satuan, jumlah, harga per satuan transaksi, serta snapshot konversi agar perubahan master tidak mengubah pengajuan yang sudah dibuat.
- Untuk satuan dengan isi variabel, ekuivalen stok dasar ditampilkan sebagai belum diketahui sampai jumlah aktual diterima.

### 4.3 Pembelian dan Penerimaan

- Baris SPJ dan Direct Supplier menggunakan satuan transaksi yang dipilih, jumlah yang dibeli, dan harga per satuan transaksi.
- Saat penerimaan, konversi tetap dihitung dari rasio snapshot transaksi.
- Untuk kemasan variabel, petugas gudang memasukkan jumlah aktual dalam satuan dasar yang diterima. Jika barang datang sebagian atau ada selisih, jumlah aktual yang diterima menjadi dasar mutasi stok.
- Mutasi stok selalu dicatat dalam satuan dasar. Detail kemasan dan jumlah transaksi tetap tersedia pada rincian pembelian.
- Penerimaan tidak boleh menggunakan rasio master terbaru untuk transaksi lama.

## 5. Cakupan Perubahan yang Diperkirakan

Implementasi nantinya perlu meninjau setidaknya:

- Struktur data master pilihan satuan beli dan migrasi dari kolom `purchase_unit` / `conversion_rate` yang sekarang.
- Form material untuk mengatur beberapa satuan beli dan jenis konversinya.
- Pengajuan restok serta prefill ke form SPJ dan Direct Supplier.
- Baris transaksi pembelian, rincian historis, dan input kuantitas aktual saat penerimaan.
- Fungsi database yang menerima pembelian dan mencatat mutasi stok, agar konversi dilakukan secara atomik dan konsisten.
- Tampilan stok material di halaman Gudang, mengikuti keputusan tampilan dua satuan yang belum dikonfirmasi.
- Tes untuk kemasan tetap, kemasan variabel, pengajuan tanpa satuan grosir, dan pembelian historis setelah konfigurasi satuan berubah.
- `README.md` setelah fitur benar-benar berjalan, sesuai instruksi proyek.

Tidak ada migration lama yang akan diedit. Perubahan skema akan menggunakan migration baru, dan perubahan penting pada data seed/clear akan mengikuti aturan di `AGENT_INSTRUCTIONS.md`.

## 6. Contoh Perilaku yang Diharapkan

| Material | Satuan stok dasar | Satuan beli | Konversi | Saat diterima |
| --- | --- | --- | --- | --- |
| Benang | yard | cone kecil | Tetap, misalnya 500 yard/cone | 2 cone menambah 1.000 yard |
| Benang | yard | cone besar | Tetap, misalnya 5.000 yard/cone | 1 cone menambah 5.000 yard |
| Sleting | pcs | plastik | Tetap sesuai isi plastik | 3 plastik dikonversi ke pcs |
| Sleting | pcs | pcs | 1:1 | 10 pcs menambah 10 pcs |
| Kain | meter | roll | Variabel | Petugas mencatat meter aktual per roll |
| Kain | meter | meter | 1:1 | 20 meter menambah 20 meter |

Rasio pada contoh hanya ilustrasi; isi kemasan aktual dikonfigurasi per material dan satuan beli.

## 7. Batasan yang Disepakati

Untuk kemasan variabel, jumlah aktual satuan dasar dicatat ketika barang diterima. Sistem tidak menghitung jumlah kemasan yang masih ada setelah stok digabungkan atau dikeluarkan. Pelacakan saldo per roll/kemasan dapat menjadi pengembangan terpisah jika dibutuhkan.

## 8. Acuan

- `docs/AGENT_INSTRUCTIONS.md`
- `docs/DESAIN_MATERIAL_GUDANG_HPP_DAN_ORDER_STATUS.md`
- `docs/DESAIN_FITUR_STAF_GUDANG_PURCHASING.md`
- `docs/RANCANGAN_BULK_PENGAJUAN_RESTOCK_GUDANG.md`
