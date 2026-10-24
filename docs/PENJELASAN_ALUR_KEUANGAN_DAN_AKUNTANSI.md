# Panduan & Penjelasan Lengkap: Alur Keuangan & Akuntansi SIKon

Dokumen ini disusun untuk menjelaskan secara menyeluruh bagaimana sistem pencatatan keuangan dan akuntansi berpasangan (*double-entry*) bekerja di SIKon, serta menjawab kasus nyata terkait **Purchasing SPJ**, **Uang Muka**, **Pembelian Material**, **Laporan Laba Rugi**, dan **Laporan Neraca**.

---

## 1. Dua Lapisan Pencatatan di SIKon

Di SIKon terdapat dua menu yang mencatat keuangan dengan tujuan dan sudut pandang berbeda:

| Fitur | Lokasi Menu | Pendekatan | Fungsi Utama |
|---|---|---|---|
| **Buku Kas Harian** | Menu `Keuangan` (`/financial`) | Single-Entry (Arus Kas Masuk & Keluar) | Memantau mutasi kas riil, bon belanja, kasbon karyawan, dan saldo uang fisik di brankas/bank hari ini. |
| **Laporan Akuntansi** | Menu `Akuntansi` (`/akuntansi`) | Double-Entry (Standar SAK EMKM) | Mengukur kesehatan bisnis: Aset (Kekayaan), Liabilitas (Hutang), Ekuitas (Modal), dan Laba/Rugi usaha yang sebenarnya. |

---

## 2. Bedah Kasus: Alur Purchasing SPJ & Kenapa Angka Kas "Menggelembung"

### Kronologi Kasus Anda:
1. **Saldo Awal**: Rp 100.000.000
2. **Pencairan Uang Muka**: Finance mencairkan kasbon ke Budi sebesar **Rp 5.500.000**
3. **Belanja melalui SPJ Budi**:
   - Pembelian Kain: **Rp 5.400.000**
   - Jasa Belanja Purchasing: **Rp 25.000**
   - *(Sisa kasbon di tangan Budi: Rp 75.000)*
4. **Pembelian Direct Supplier**:
   - PT Warna Warni: **Rp 2.000.000**
   - PT Multi: **Rp 240.000**

---

### A. Mengapa di Halaman Keuangan Muncul "Pemasukan Rp 5.500.000" dan "Pengeluaran Rp 13.165.000"?

Di halaman Keuangan (`/financial`), tercatat 6 baris transaksi:
1. `Uang Muka - Budi`: Pengeluaran **Rp 5.500.000** *(saat kasbon dicairkan)*
2. `Reversal Uang Muka - Budi`: Pemasukan **Rp 5.500.000** *(saat SPJ disetujui)*
3. `SPJ Pembelian Material - Budi`: Pengeluaran **Rp 5.400.000** *(bon belanja kain riil)*
4. `Jasa Purchasing - Budi`: Pengeluaran **Rp 25.000** *(upah jasa belanja)*
5. `Pembelian Material - PT Warna Warni`: Pengeluaran **Rp 2.000.000**
6. `Pembelian Material - PT Multi`: Pengeluaran **Rp 240.000**

#### Kenapa ada "Reversal Uang Muka"?
- Saat finance pertama kali memberikan kasbon Rp 5.500.000 kepada Budi, uang kas sudah keluar dari brankas/bank, sehingga dicatat sebagai `Pengeluaran: Rp 5.500.000`.
- Ketika Budi kembali membawa nota belanja SPJ (Kain Rp 5.400.000 dan Jasa Rp 25.000), sistem harus mencatat rincian belanja kain tersebut agar stok kain gudang bertambah dan ada bukti nota.
- **Masalahnya**: Jika nota belanja Rp 5.400.000 dan Jasa Rp 25.000 langsung dicatat sebagai pengeluaran baru, saldo kas akan terpotong dua kali (kasbon keluar 5,5 juta + nota keluar 5,425 juta = seolah keluar 10,925 juta)!
- **Cara sistem menyelesaikannya**: Sistem membuat satu baris penyeimbang bernama **"Reversal Uang Muka" bertipe Pemasukan sebesar Rp 5.500.000**.
  - Pemasukan fiktif administratif ini bertugas **menetralkan / membatalkan** kasbon 5,5 juta sebelumnya, sehingga yang tersisa di kas hanyalah pengeluaran belanja riilnya.

#### Mengapa Total di Kartu Atas Menggelembung?
Di halaman `/financial`, kartu indikator dihitung dengan rumus sederhana:
- **Total Pemasukan** = Semua baris bertipe `income` dijumlahkan.
  Karena ada baris `Reversal Uang Muka (+Rp 5.500.000)`, kartu menampilkan **Rp 5.500.000**.
  *(Ini bukan omzet penjualan/uang masuk dari pelanggan, melainkan angka penyeimbang kasbon)*.
- **Total Pengeluaran** = Semua baris bertipe `expense` dijumlahkan:
  $$5.500.000 + 5.400.000 + 25.000 + 2.000.000 + 240.000 = \mathbf{Rp\ 13.165.000}$$
  *(Angka ini menggelembung kotor karena mencatat kasbon 5,5 juta keluar DAN nota belanja 5,425 juta keluar)*.

#### Kabar Baiknya: Saldo Akhir Kas & Selisih Kas 100% Cocok dan Benar!
- **Selisih Kas Bersih**:
  $$\text{Pemasukan} - \text{Pengeluaran} = 5.500.000 - 13.165.000 = \mathbf{-Rp\ 7.665.000}$$
- **Total Kas & Bank Akhir**:
  $$100.000.000 - 7.665.000 = \mathbf{Rp\ 92.335.000}$$
- **Uang Fisik Sebenarnya yang Keluar**:
  - Kain Budi: Rp 5.400.000
  - Jasa Budi: Rp 25.000
  - PT Warna Warni: Rp 2.000.000
  - PT Multi: Rp 240.000
  - Total riil = **Rp 7.665.000**.
- Saldo fisik uang di rekening bank/brankas Anda saat ini memang **persis Rp 92.335.000** (asumsi sisa kasbon Rp 75.000 sudah dikembalikan Budi ke kasir).

---

## 3. Bedah Laporan Akuntansi: Laba Rugi & Neraca

### B. Mengapa di Laba Rugi ada "Laba Bersih: 25.000 (atau -25.000)"? Laba dari mana? Kenapa Beli Kain Jutaan Rupiah Tidak Muncul di Laba Rugi?

Dalam akuntansi bisnis manufaktur/konveksi (standar SAK EMKM):

#### 1. Membeli Kain BUKAN Beban (Expense) Pengurang Laba
- Saat Anda membeli kain:
  - SPJ: Rp 5.400.000
  - PT Warna Warni: Rp 2.000.000
  - PT Multi: Rp 240.000
  - **Total Kain: Rp 7.640.000**
- Uang kas Anda berkurang Rp 7.640.000, **TETAPI uang tersebut tidak hilang**. Uang kas tersebut hanya **berubah wujud** menjadi gulungan kain di rak gudang (**Akun `1-1500 Persediaan Bahan Baku`**, kelompok Aset Lancar).
- Jika belanja kain langsung diakui sebagai kerugian saat dibeli, maka setiap kali konveksi belanja kain 50 juta, pembukuan bulan itu akan langsung tampak "Rugi 50 Juta", padahal gudang penuh kain berharga yang siap dijual bernilai ratusan juta!
- **Kapan kain menjadi beban pengurang laba?**
  Kain baru menjadi beban (**HPP - Harga Pokok Penjualan**) ketika pakaian selesai dijahit dan **dikirim ke pelanggan** (saat omzet diakui), atau saat tutup buku bulanan melalui stock opname.

#### 2. Lalu apa arti angka 25.000?
- Angka Rp 25.000 adalah **Jasa Purchasing Budi** (Akun `6-2000 Beban Operasional`).
- Jasa belanja adalah murni biaya tenaga kerja/operasional yang tidak berwujud barang di gudang, sehingga langsung diakui sebagai **Beban Operasional**.
- Karena pada periode ini Anda belum melakukan penjualan baju (Omzet = Rp 0):
  - **Pendapatan Usaha**: Rp 0
  - **HPP Bahan Baku**: Rp 0 *(karena kain masih utuh di gudang)*
  - **Laba Kotor**: Rp 0
  - **Beban Operasional**: Rp 25.000 *(Jasa Budi)*
  - **Laba (Rugi) Bersih**: $0 - 25.000 = \mathbf{-Rp\ 25.000}$ *(Rugi Bersih Rp 25.000)*
- Di format akuntansi standar, angka minus/rugi ditulis dengan tanda kurung: `(Rp 25.000)`.

---

### C. Mengapa Total Ekuitas di Neraca Tercatat Rp 107.640.000? Dari Mana Angka Ini?

Perhatikan angka:
$$\mathbf{100.000.000\ (Saldo\ Awal\ Kas)} + \mathbf{7.640.000\ (Total\ Belanja\ Kain)} = \mathbf{107.640.000}$$

Mari kita pahami rumus Neraca Akuntansi:
$$\mathbf{ASET\ (Kekayaan)} = \mathbf{LIABILITAS\ (Hutang)} + \mathbf{EKUITAS\ (Modal\ Pemilik)}$$

#### Dari mana angka Rp 107.640.000 itu berasal?
Saat fitur Akuntansi diaktifkan pertama kali melalui menu **Aktivasi Akuntansi** (`init_accounting` & `suggest_opening_balance`), sistem menghitung usulan saldo awal:
1. **Kas & Bank**: Rp 100.000.000
2. **Persediaan Bahan Baku**: Rp 7.640.000 *(karena data stok kain dari SPJ dan supplier sudah ada di database gudang saat wizard saldo awal dibuka)*.
3. Karena total Aset yang terdeteksi adalah:
   $$\text{Kas (100 Jt)} + \text{Persediaan Kain (7,64 Jt)} = \mathbf{Rp\ 107.640.000}$$
4. Dan karena bisnis Anda belum memiliki hutang (Liabilitas = Rp 0), maka sistem akuntansi menyeimbangkan persamaan dengan mencatat:
   $$\mathbf{Ekuitas\ (Modal\ Disetor\ /\ Laba\ Ditahan)} = \mathbf{Rp\ 107.640.000}$$
5. **Artinya bagi sistem**: Pemilik dianggap menyetor modal awal ke perusahaan berupa:
   - Uang tunai di rekening: **Rp 100.000.000**
   - Modal barang/kain di gudang: **Rp 7.640.000**
   - Sehingga total nilai kekayaan bersih (ekuitas) perusahaan Anda adalah **Rp 107.640.000**.

> **Catatan Penting**:
> Jika uang Rp 7.640.000 untuk membeli kain tersebut sebenarnya diambil dari uang kas Rp 100.000.000 itu sendiri (bukan modal kain terpisah yang sudah ada sebelum uang 100 juta disetor), maka terjadi **dobel pencatatan modal awal**.
> Seharusnya:
> - Modal awal uang kas = Rp 100.000.000.
> - Pembelian kain Rp 7.640.000 adalah transaksi operasional harian yang mengurangi kas menjadi Rp 92.335.000 dan menambah persediaan menjadi Rp 7.640.000.
> - Total aset tetap Rp 99.975.000 (100jt - jasa 25rb), dan Ekuitas tetap Rp 99.975.000.

---

## 4. Rangkuman & Pilihan Solusi ke Depan

### Rangkuman Fakta
1. **Buku Kas (`/financial`)**:
   - Angka Total Pemasukan 5,5 jt dan Pengeluaran 13,165 jt memang terlihat menggelembung secara visual karena adanya baris penyeimbang "Reversal Uang Muka".
   - Namun **Saldo Akhir Kas (Rp 92.335.000)** dan **Selisih Kas Bersih (-Rp 7.665.000)** adalah **100% akurat** sesuai fisik brankas.
2. **Laba Rugi (`/akuntansi`)**:
   - Belanja kain tidak memotong laba rugi karena menjadi aset persediaan gudang.
   - Angka Rp 25.000 adalah biaya jasa belanja purchasing Budi (Rugi bersih -Rp 25.000).
3. **Neraca (`/akuntansi`)**:
   - Ekuitas Rp 107.640.000 mencerminkan Kas 100 Juta + Stok Kain 7,64 Juta yang masuk ke saldo awal.

### Opsi yang Dapat Kita Diskusikan:
- **Opsi A (Tampilan Kas Lebih Bersih di `/financial`)**:
  Kita bisa membuat filter atau logika kartu di `/financial` agar transaksi berkategori `Uang Muka Purchasing` dan `Reversal Uang Muka` dihitung secara netto (atau memiliki ringkasan khusus kasbon), sehingga kartu "Total Pengeluaran" hanya menampilkan pengeluaran riil Rp 7.665.000 dan "Total Pemasukan" tidak menampilkan 5.500.000 jika bukan omzet penjualan.
- **Opsi B (Menyesuaikan Saldo Awal Akuntansi)**:
  Jika uang belanja kain 7,64 juta sebenarnya diambil dari uang 100 juta tersebut, jurnal saldo awal akuntansi dapat disesuaikan agar Ekuitas awal tepat Rp 100.000.000.
