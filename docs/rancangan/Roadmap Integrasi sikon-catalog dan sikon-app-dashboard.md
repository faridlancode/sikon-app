# Roadmap Integrasi sikon-catalog dan sikon-app-dashboard

*Rancangan per 7 Oktober 2026. Status: perencanaan. Dokumen ini tidak mengubah kode maupun database apa pun.*

## 1. Ringkasan dan posisi saat ini

sikon-catalog adalah situs publik (tanpa login). sikon-app-dashboard adalah backend dan sumber kebenaran data. Keduanya memakai project Supabase yang sama (`xdojtfhkflbfuwmcjpwe`, saat ini `sikon-app-dev`).

**Sudah dikerjakan di sisi kode**

- Catalog membaca produk, kategori, kain beserta warna, dan sales lewat RPC `catalog_*`.
- Default image lokal dengan logika fallback ke foto database bila nanti tersedia.
- Halaman `/cs`, `/link`, dan picker produk di `/link/$repId` memakai data database.

**Belum terjadi di database**

- Migration `20261006120000_catalog_public_read_rpc.sql` sudah ditulis dan diuji di transaksi yang di-rollback, tetapi **belum diterapkan** ke database. Sampai migration itu diterapkan, catalog belum bisa membaca data.

## 2. Keputusan yang sudah disepakati

| # | Topik | Keputusan |
| --- | --- | --- |
| 1 | Review | Hanya lewat link bertoken per order. Tidak terbuka untuk umum. |
| 2 | Jumlah terjual | Hanya field `sold_count` per produk yang dipublikasikan. Data penjualan lain tetap privat. |
| 3 | Track order | Cukup status produksi. Tidak ada status pengiriman, kurir, atau resi dulu. |
| 4 | Harga kain | Harga bisa berbeda per kain untuk satu produk, sebagian ada yang sama. |
| 5 | Akun pelanggan | Ditunda. |
| 6 | Custom design | Ditunda. |

## 3. Prinsip desain

1. **Dashboard adalah backend.** Perubahan skema selalu lewat migration di dashboard, lengkap dengan form dan dokumentasinya.
2. **Tidak ada tabel yang dibuka ke `anon`.** Semua akses publik lewat RPC `security definer` dengan whitelist kolom.
3. **Menambah kolom ke respons publik adalah keputusan publikasi data.** Kolom biaya (HPP, upah, bonus), stok, harga beli, dan data keuangan tidak pernah ikut.
4. **RPC tulis dari publik hanya boleh lewat token atau validasi ketat.** Tidak ada insert bebas dari `anon`.
5. **Definition of done untuk setiap item:** (a) migration, (b) form atau input di dashboard, (c) update docs dashboard, (d) tambah ke whitelist RPC, (e) mapper di catalog.

## 4. Peta fase

| Fase | Isi | Prasyarat |
| --- | --- | --- |
| 0 | Persiapan | Izin menerapkan migration |
| 1 | Konten katalog: foto, publikasi, kain dan harga, GSM, sales | Fase 0 |
| 2 | Review, `sold_count`, info perusahaan | Fase 1 (foto dan produk stabil) |
| 3 | Track order (status produksi), form kontak, lead | Fase 2 |
| Next | Custom design, akun pelanggan, status pengiriman | Di luar cakupan saat ini |

## 5. Fase 0 — Persiapan

- Menerapkan migration RPC katalog ke database dev setelah ada izin eksplisit.
- Regenerate `integrations/supabase/types.ts` di catalog, lalu hapus cast longgar di `services/supabase-rpc.ts`.
- Jalankan Supabase advisor dan catat temuannya.
- Periksa policy Storage untuk bucket `company-assets` (bucket publik yang sudah ada): siapa yang boleh upload, dan di path mana.
- Tetapkan konvensi path file: `products/{product_id}/{uuid}.webp` dan `sales/{sales_id}/{uuid}.webp`.
- Pisahkan project dev dan produksi **sebelum** catalog dipublikasikan. Seluruh pengujian di dokumen ini mengasumsikan dev.

## 6. Fase 1 — Konten katalog

### 1.1 Foto produk

**Database**

- Tabel `product_images`: `id`, `user_id`, `product_id`, `image_url`, `is_primary`, `sort_order`, `created_at`.
- Satu foto utama per produk, dijaga dengan partial unique index (`where is_primary`).
- RLS mengikuti pola dashboard: `auth.uid() = user_id`.

**Dashboard**

- Halaman `/products` mendapat upload banyak foto, urutan, dan penanda foto utama.
- Kompres di browser menjadi webp maksimal 1200 px sebelum diunggah.
- Batas awal: 8 foto per produk.

**RPC dan catalog**

- `catalog_list_products` mengembalikan `images` (`id`, `image_url`, `is_primary`, `sort_order`).
- Mapper dan logika fallback ke gambar default di catalog sudah siap, jadi tidak ada perubahan di catalog selain data.

### 1.2 Publikasi dan urutan produk

| Kolom di `products` | Tipe | Aturan |
| --- | --- | --- |
| `is_published` | boolean, default false | Produk yang sudah ada di-backfill `true`. RPC hanya menampilkan `is_active and is_published`. |
| `is_featured` | boolean, default false | Untuk bagian unggulan di beranda. |
| `sort_order` | integer | Urutan manual untuk produk unggulan. |
| `updated_at` | timestamptz + trigger | Untuk sitemap dan cache. |

Catalog: sort baru "Unggulan", dan judul "Paling Populer" di beranda diganti agar jujur ("Unggulan" atau "Terbaru") sampai `sold_count` tersedia.

### 1.3 Kain, GSM, dan harga berbeda per kain

Ini keputusan #4 dan bagian yang paling berdampak pada konsistensi harga.

**Database**

- Tabel `product_fabric_options`: `id`, `user_id`, `product_id`, `material_id`, `price_adjustment` (boleh negatif), `is_offered`, `is_default`, `sort_order`.
- Unik pada (`product_id`, `material_id`). Hanya satu `is_default` per produk.
- `materials.weight_gsm` (integer): GSM melekat pada kain, bukan produk.
- Deskripsi kain untuk publik, terpisah dari `materials.description` yang mungkin catatan internal (nama kolom diusulkan `catalog_description`).

**Aturan RPC**

- Produk yang punya baris di `product_fabric_options`: tampilkan hanya yang `is_offered`, dengan `price_adjustment` apa adanya.
- Produk tanpa baris: perilaku sekarang tetap berlaku (semua kain aktif di kategori slot pertama, `price_adjustment = 0`). Ini menjaga kompatibilitas mundur.
- Yang dikirim ke publik hanya angka penyesuaian akhir yang ditetapkan pemilik, bukan harga beli kain.

**Dashboard**

- Di form produk, di bawah slot kain: daftar kain dengan centang "Tawarkan", input penyesuaian harga, dan pilihan default.
- Sebagai bantuan (bukan otomatis): tampilkan saran selisih = (harga kain dikurangi harga kain default) dikali kebutuhan per pcs. Angka akhir tetap diisi pemilik.

**Catalog**

- Tipe `price_adjustment` dan `is_default` sudah ada, dan halaman detail sudah menghitung harga dasar ditambah penyesuaian. Tinggal mapper membaca nilai dari RPC (sekarang 0).
- GSM tampil dari kain terpilih, dan `gsm_info` di kartu diturunkan dari kain default.

**Perlu dicek sebelum implementasi**

- Bagaimana form order di dashboard menghitung harga item. Penyesuaian kain harus ikut diterapkan di sana, atau harga di catalog akan berbeda dengan invoice.
- Produk dengan lebih dari satu slot kain: saat ini hanya slot pertama yang dipakai. Perlu keputusan apakah opsi per slot.

### 1.4 Tarif harga asli

- Tanpa perubahan database. `price_satuan` dan `price_prioritas` sudah dikirim RPC.
- Ganti tabel tier palsu di halaman detail (diskon 5, 10, 15 persen) dengan dua tarif asli: satuan untuk kurang dari 6 pcs, prioritas untuk 6 pcs atau lebih.
- Catat bahwa `base_price` sekarang `price_prioritas` lalu `price_satuan` lalu `default_price`. Tampilan kartu perlu dipastikan dengan pemilik.

### 1.5 Sales

| Kolom di `sales` | Tipe | Fungsi |
| --- | --- | --- |
| `photo_url` | text | Avatar. Menggantikan inisial. |
| `tagline` | text | Teks profil. Sekarang konstan untuk semua sales. |
| `display_order` | integer | Urutan tampil. Sekarang mengikuti waktu dibuat. |
| `show_in_catalog` | boolean, default true | Memisahkan "aktif internal" dari "tampil publik". |
| `slug` | text, unik | Link `/link/dina` menggantikan UUID. |
| `open_time`, `close_time` | time, opsional | Menggantikan klaim online yang tidak punya data. |

Dashboard: form sales memvalidasi dan menormalkan nomor HP ke format 62xxx, supaya catalog tidak perlu menebak.

Catalog: `/link/$repId` menerima slug. Link berbasis UUID yang sudah terlanjur dibagikan tetap diterima selama masa transisi.

### Kriteria selesai Fase 1

- Produk tanpa `is_published` tidak muncul di catalog.
- Foto yang diunggah di dashboard tampil di catalog, dan produk tanpa foto tetap memakai default image.
- Harga yang tampil di catalog sama dengan harga yang dihitung form order dashboard untuk kombinasi produk, kain, dan jumlah yang sama.
- Sales yang `show_in_catalog = false` tidak muncul di `/cs` maupun `/link`.

## 7. Fase 2 — Review, sold\_count, info perusahaan

### 2.1 Review lewat link bertoken

**Alur**

1. Order mencapai `production_status = completed`.
2. Di detail order dashboard, tombol "Kirim undangan ulasan" membuat token acak sekali pakai dan menyiapkan pesan WhatsApp berisi link.
3. Pelanggan membuka `/review/{token}` di catalog dan menilai produk yang ada di order tersebut.
4. Review masuk berstatus `pending`.
5. Pemilik menyetujui, menolak, atau membalas di dashboard.
6. Catalog hanya menampilkan yang `approved`.

**Tabel**

- `review_invitations`: `id`, `user_id`, `order_id`, `token_hash`, `expires_at`, `used_at`, `created_at`. Hanya hash token yang disimpan.
- `product_reviews`: `id`, `user_id`, `product_id`, `order_id`, `reviewer_name`, `rating` (check 1 sampai 5), `comment`, `status` (`pending`, `approved`, `rejected`), `owner_reply`, `created_at`, `moderated_at`.
- Unik pada (`order_id`, `product_id`): satu review per produk per order.

**RPC publik**

| RPC | Fungsi | Whitelist |
| --- | --- | --- |
| `catalog_get_review_form(token)` | Daftar produk di order untuk diulas | Nama produk dan id saja. Tanpa nomor order, nama pelanggan, atau harga. |
| `catalog_submit_review(token, product_id, rating, comment)` | Kirim review | Validasi token, kedaluwarsa, produk memang ada di order itu, dan belum diulas. |
| `catalog_list_reviews(product_id, page, limit)` | Daftar review disetujui | Nama disamarkan ("Budi S."), rating, komentar, tanggal, balasan. |

`catalog_list_products` ditambah `rating` (rata-rata review disetujui) dan `review_count`.

**Dashboard**

- Halaman "Ulasan": filter status, setujui, tolak, balas, sembunyikan.
- Tombol undangan di detail order, hanya aktif untuk order selesai.

**Aturan keamanan**

- Token acak minimal 128 bit, kedaluwarsa 60 hari, sekali pakai per order (atau per produk).
- Pesan kesalahan seragam untuk token salah, kedaluwarsa, atau terpakai.
- Batas panjang komentar dan sanitasi di sisi server.
- Foto di review tidak masuk fase ini.

**Catalog**

- Bagian ulasan di halaman detail, rating di kartu produk (UI yang menyembunyikan rating nol sudah ada), dan route baru `/review/$token`.

### 2.2 sold\_count

- **Definisi:** jumlah total `order_items.qty` per `product_id` untuk order dengan `production_status = completed`.
- **Yang dipublikasikan:** hanya satu angka per produk itu. Tidak ada jumlah order, omzet, tanggal, atau nama pelanggan.
- Item custom tanpa `product_id` tidak dihitung.
- Dihitung di dalam `catalog_list_products`, tanpa tabel baru.
- Opsi tampilan: angka persis, atau dibulatkan ("50+") bila ingin mengaburkan volume. Perlu dipilih sebelum rilis.
- Memberi dasar untuk sort "Terpopuler" yang sekarang dihapus dari catalog.

### 2.3 Info perusahaan

`company_settings` sudah punya nama, alamat, telepon, dan logo.

| Kolom baru di `company_settings` | Fungsi |
| --- | --- |
| `email`, `whatsapp` | Kontak resmi. |
| `instagram` dan tautan sosial lain | Footer dan halaman kontak. |
| `operating_hours` | Jam operasional. |
| `maps_url` | Lokasi. |

- `company_bank_accounts` mendapat `show_in_catalog` agar rekening untuk DP bisa tampil di halaman cara pesan, hanya yang ditandai.
- RPC `catalog_get_company_info()` mengembalikan hanya kolom di atas, bukan `saldo_awal`, `sewing_satuan_surcharge`, atau stempel dan tanda tangan.
- Catalog: halaman about, contact, how-to-order, dan footer berhenti memakai teks statis.

### Kriteria selesai Fase 2

- Review yang belum disetujui tidak pernah terlihat publik.
- Token yang sama tidak bisa dipakai dua kali.
- Tidak ada nomor order, nomor HP, atau nama lengkap pelanggan dalam respons publik mana pun.
- Angka `sold_count` cocok dengan penjumlahan manual dari order selesai.

## 8. Fase 3 — Track order, kontak, lead

### 3.1 Track order (status produksi saja)

Halaman `track-order` sekarang memakai data demo.

**Temuan di database**

- Nomor order berurutan (`ORD-0001`, `ORD-0002`), jadi mudah ditebak. Pencarian hanya dengan nomor order memungkinkan siapa pun melihat order orang lain.
- Tabel `orders` hanya punya `customer_name`, belum ada nomor HP pelanggan.

**Rancangan**

- `orders.tracking_code`: kode acak 8 karakter tanpa karakter yang mudah tertukar, unik, dibuat otomatis. Ditampilkan di detail order dan invoice dashboard.
- `orders.customer_phone`: diisi di form order dashboard.
- RPC `catalog_track_order(kode, empat_digit_akhir_hp)`. Respons seragam untuk "kode tidak ada" dan "HP tidak cocok".
- Respons hanya berisi: label status, timeline tahap, dan status lunas atau belum. Tidak ada nama pelanggan, nominal, atau item.

**Pemetaan status**

| `production_status` | Label di catalog |
| --- | --- |
| `quotation` | Penawaran |
| `pending` | Menunggu produksi |
| `production` | Dalam produksi |
| `ready` | Siap |
| `completed` | Selesai |

- Timeline diambil dari `order_stage_events` (`stage`, `status`, `completed_at`). Nama tahap di tabel itu belum diperiksa, jadi pemetaan labelnya perlu verifikasi.
- Tahap "shipping" dan "delivered" yang ada di UI demo dihapus. Status pengiriman, kurir, dan resi masuk daftar Next.

**Perlu dipikirkan:** PostgREST tidak punya rate limit. Untuk mencegah tebak-tebakan kode dan HP, pertimbangkan Edge Function di depan RPC ini, atau pencatatan percobaan gagal.

### 3.2 Form kontak

- Tabel `inquiries`: `id`, `user_id`, `name`, `email`, `topic`, `message`, `status` (`new`, `read`, `done`), `created_at`.
- RPC `catalog_submit_inquiry(...)` dengan field honeypot, batas panjang, dan validasi email.
- Dashboard: kotak masuk "Pesan masuk" dengan status.
- Catalog: `contact.tsx` memanggil RPC dan menampilkan hasilnya.

### 3.3 Lead dari klik WhatsApp

- Tabel `catalog_leads`: `id`, `user_id`, `sales_id`, `product_id`, `fabric_id`, `color_name`, `qty`, `source`, `created_at`.
- RPC `catalog_log_lead(...)` dipanggil saat tombol WhatsApp diklik.
- Dashboard: ringkasan prospek per sales dan per produk. Nanti berguna untuk atribusi bonus sales.
- Yang disimpan hanya konteks pesan, tanpa data pribadi pengunjung.

### Kriteria selesai Fase 3

- Kode order yang salah dan HP yang salah menghasilkan respons yang sama.
- Pelanggan tidak bisa melihat order milik orang lain.
- Pesan kontak masuk ke dashboard dan tidak bisa dikirim ulang tanpa batas.

## 9. Next — ditunda

| Topik | Catatan untuk nanti |
| --- | --- |
| Custom design | Simpan desain sebagai permintaan yang masuk ke dashboard sebagai order berstatus `quotation`. Surcharge ukuran (`SIZE_SURCHARGE`) dan biaya bordir sekarang hardcode di catalog dan harus pindah ke database. Upload gambar sebaiknya lewat signed URL. |
| Akun pelanggan | Baru ada satu user di auth (pemilik). Pendaftaran pelanggan akan masuk ke pool yang sama. Butuh tabel `customers`, `orders.customer_id`, claim role, dan guard role di dashboard. Halaman `/login` dan `/register` sekarang belum terhubung ke apa pun. |
| Status pengiriman | `courier`, `tracking_number`, `shipped_at`, `delivered_at`, `estimated_ready_date`. |
| Review dengan foto, atau review terbuka | Setelah alur bertoken berjalan baik. |
| Filter harga dan pencarian lanjutan | Parameter `min_price` dan `max_price` ada di tipe tetapi belum didukung RPC. |

## 10. Inventaris perubahan database

| Objek | Jenis | Fase | Publik? |
| --- | --- | --- | --- |
| `product_images` | Tabel baru | 1 | Ya, lewat RPC |
| `products.is_published`, `is_featured`, `sort_order`, `updated_at` | Kolom | 1 | Hanya efeknya |
| `product_fabric_options` | Tabel baru | 1 | Ya, lewat RPC |
| `materials.weight_gsm`, `catalog_description` | Kolom | 1 | Ya |
| `sales.photo_url`, `tagline`, `display_order`, `show_in_catalog`, `slug`, `open_time`, `close_time` | Kolom | 1 | Sebagian |
| `review_invitations` | Tabel baru | 2 | Tidak |
| `product_reviews` | Tabel baru | 2 | Hanya yang disetujui |
| `company_settings` (kolom kontak) | Kolom | 2 | Ya |
| `company_bank_accounts.show_in_catalog` | Kolom | 2 | Hanya yang ditandai |
| `orders.tracking_code`, `customer_phone` | Kolom | 3 | Tidak langsung |
| `inquiries` | Tabel baru | 3 | Tidak |
| `catalog_leads` | Tabel baru | 3 | Tidak |

## 11. Inventaris RPC publik

| RPC | Fase | Jenis |
| --- | --- | --- |
| `catalog_list_categories`, `catalog_list_sales`, `catalog_list_products` | 0 (sudah ditulis) | Baca |
| `catalog_list_products` (tambah `images`, kain per produk, `rating`, `review_count`, `sold_count`) | 1 dan 2 | Baca |
| `catalog_list_sales` (tambah foto, tagline, slug, urutan, jam kerja) | 1 | Baca |
| `catalog_get_review_form`, `catalog_submit_review`, `catalog_list_reviews` | 2 | Baca dan tulis (bertoken) |
| `catalog_get_company_info` | 2 | Baca |
| `catalog_track_order` | 3 | Baca (butuh kode dan HP) |
| `catalog_submit_inquiry`, `catalog_log_lead` | 3 | Tulis (tervalidasi) |

## 12. Checklist keamanan untuk setiap RPC

- `security definer`, `set search_path = public`, `revoke ... from public`, `grant execute` hanya ke peran yang perlu.
- Whitelist kolom eksplisit. Tidak ada `select *` ke respons.
- Batas `limit` dan `page`, serta escape karakter wildcard pada pencarian.
- Fungsi tulis: validasi panjang, tipe, dan token. Pesan kesalahan tidak membocorkan alasan.
- Diuji sebagai role `anon` di transaksi yang di-rollback sebelum diterapkan.
- Jalankan advisor setelah migration.
- Mengubah signature berarti `drop function` versi lama dulu agar tidak terjadi PGRST203.
- Fungsi tidak memfilter `user_id` karena sistem single-tenant. Kalau berubah menjadi multi-tenant, semua fungsi wajib ditambah filter.

## 13. Risiko dan hal yang belum diverifikasi

| Hal | Status |
| --- | --- |
| Konsistensi harga catalog dengan invoice dashboard (tier harga dan penyesuaian kain) | Perlu membaca logika form order dashboard sebelum Fase 1.3. |
| Policy Storage bucket `company-assets` | Belum diperiksa. |
| Nama tahap di `order_stage_events` | Belum diperiksa. |
| Produk dengan lebih dari satu slot kain | Keputusan desain belum ada. |
| `sold_count` persis atau dibulatkan | Belum diputuskan. |
| Rate limit untuk `catalog_track_order` | Perlu memilih antara Edge Function atau pencatatan percobaan. |
| Project dev dan produksi masih satu | Harus dipisah sebelum go-live. |
| Picker produk di `/link/$repId` dibatasi 50 produk | Cukup untuk sekarang, perlu paginasi bila katalog membesar. |

## 14. Langkah berikutnya

1. Tinjau dan koreksi dokumen ini.
2. Putuskan hal-hal yang masih terbuka di bagian 13.
3. Beri izin untuk menerapkan migration Fase 0 ke database dev.
4. Mulai Fase 1, satu item per migration, supaya tiap perubahan bisa diuji dan dibatalkan terpisah.
