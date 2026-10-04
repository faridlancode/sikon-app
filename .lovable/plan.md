# Penyempurnaan Stok Material Gudang

## Tujuan
Membuat tab **Stok Material** lebih cepat dipindai dan lebih mudah dioperasikan, tanpa mengubah alur stok, restock, atau penerimaan barang.

## Perubahan tampilan
- Rapikan ringkasan kondisi stok agar status kritis lebih menonjol dan setiap ringkasan tetap dapat dipakai sebagai filter.
- Satukan pencarian, kategori, status aktif, jumlah hasil, reset filter, dan muat ulang dalam bilah kontrol yang jelas.
- Perjelas tabel induk material dan rincian warna: identitas material, jumlah varian, total stok fisik, batas minimum per warna, ringkasan status, serta aksi.
- Buat pembuka rincian warna lebih kentara; baris warna memiliki swatch, stok, minimum, status, dan tombol penyesuaian yang selalu mudah ditemukan.
- Pertahankan tampilan tabel yang padat di desktop dan tetap bisa digeser dengan aman pada layar kecil.

## Aturan minimum stok
- Untuk material dengan varian warna, batas minimum pada baris induk **tidak dijumlahkan**.
- Contoh: American Drill memiliki 3 warna dan minimum tiap warna 1 meter; baris induk menampilkan **1 meter / warna**, bukan 3 meter.
- Penentuan status tetap dilakukan per warna dengan membandingkan stok warna terhadap minimum warna tersebut.
- Jika minimum antarwarna berbeda, baris induk menampilkan rentang minimum per warna agar tidak memberi angka total yang menyesatkan.

## Teknis
- Perubahan dilakukan pada tampilan dan perhitungan presentasi di frontend.
- Tidak ada perubahan skema database, migrasi, RLS, atau alur Supabase.
- Dokumentasi Gudang dan README diperbarui karena aturan penyajian minimum stok berubah.
- Validasi mencakup pemeriksaan build serta pengujian halaman Gudang dan dialog penyesuaian stok.
