# Rancangan: Batch PO (Pre Order Mingguan)

> [!WARNING]
> **CATATAN REVISI:** Dokumen ini sebagian telah diamandemen oleh [REVISI_1_BATCH_PO_FLEKSIBEL.md](file:///d:/FARIDLAN/Dev/react/sikon-app/docs/rancangan/REVISI_1_BATCH_PO_FLEKSIBEL.md) (2026-10-20). Aturan siklus Senin–Minggu kaku, `get_current_po`, `ensure_po_batch`, dan penugasan PO otomatis berbasis `order_date` tidak lagi berlaku. Gunakan [REVISI_1_BATCH_PO_FLEKSIBEL.md](file:///d:/FARIDLAN/Dev/react/sikon-app/docs/rancangan/REVISI_1_BATCH_PO_FLEKSIBEL.md) sebagai rujukan utama.

- Tanggal: 2026-10-18
- Status: Menunggu persetujuan (ada 6 pertanyaan pemblokir di §8; sisanya sudah punya default)
- Domain pemilik: ORDER_DAN_KEUANGAN (yang mengubah data: `orders` dan tabel baru `po_batches`). Dampak ke PRODUKSI_DAN_WORKLOG, GUDANG_DAN_PURCHASING, AKUNTANSI, PAYROLL hanya ditulis 1–2 kalimat + rujukan saat dilebur.
- Pendamping: `CATATAN_IMPLEMENTASI_BATCH_PO.md` (urutan kerja agen) dan `PROMPT_AGEN_BATCH_PO.md`.

---

## 1. Masalah

Bisnis berjalan dengan model pre-order mingguan: PO dibuka Senin, ditutup Minggu, dan tiap order menempel ke satu PO. Sistem sekarang tidak mengenal konsep ini. Order hanya punya `order_date`, jadi pemilik tidak bisa melihat (a) rekap order per hari, (b) rekap final saat PO ditutup, (c) rekap per bulan yang terdiri dari 4–5 PO. Selain itu tidak ada penanda PO di Worklog, Purchasing, dan laporan keuangan, sehingga pertanyaan "PO ini untung berapa, bahannya sudah dibeli semua, produksinya sampai mana" harus dihitung manual.

Terdampak: pemilik/finance (laporan), staf Gudang & Purchasing (daftar belanja per PO), admin produksi (urutan kerja per PO).

---

## 2. Keputusan

| # | Keputusan | Alasan / alternatif yang ditolak |
|---|---|---|
| D1 | **PO adalah dimensi analitik di atas order, bukan periode akuntansi.** Jurnal, `locked_through`, dan `close_accounting_period` tetap per bulan kalender. | PO melintasi bulan (28 Sep–4 Okt). Kalau periode jurnal diikat ke PO, tutup buku bulanan, neraca, dan `books_start_date` jadi tidak konsisten. Ditolak. |
| D2 | **Tabel `po_batches` eksplisit**, satu baris per minggu. Dibuat otomatis (lazy) oleh fungsi `ensure_po_batch(tanggal)` saat order pertama minggu itu masuk. Tanpa cron. | Menghitung PO "on the fly" dari tanggal membuat aturan bulan tersebar di banyak query. Dengan baris tersimpan, aturan dihitung sekali dan laporan lama stabil kalau aturan berubah. |
| D3 | **Aturan bulan PO:** sebuah minggu (Senin–Minggu) milik bulan di mana hari **Rabu**-nya jatuh. Nomor urut = `(hari_Rabu - 1) / 7 + 1` (pembagian bulat). | Satu-satunya aturan sederhana yang cocok dengan 8 PO di contoh Anda (tabel di bawah). Aturan "bulan Senin" gagal (PO 1 Sep mulai 31 Agt). Aturan "bulan Kamis/ISO" gagal (PO 5 Sep berakhir 4 Okt, Kamis-nya 1 Okt). **Perlu konfirmasi (Q2).** |
| D4 | **Zona waktu WIB (`Asia/Jakarta`)** untuk semua penentuan tanggal PO. Default `orders.order_date` dan `order_payments.payment_date` diganti dari `current_date` (UTC) ke tanggal WIB. | `current_date` di Postgres Supabase = UTC. Order jam 00:00–06:59 WIB hari Senin akan tercatat Minggu dan masuk PO yang salah. |
| D5 | `orders.po_batch_id` diisi trigger dari `order_date`. Order tidak bisa masuk PO yang sudah `closed`. | Satu sumber kebenaran (tanggal), tidak ada pilihan PO manual yang bisa salah. |
| D6 | **Open otomatis, close manual** lewat tombol (RPC `close_po_batch`). Close hanya boleh mulai hari Minggu; sebelum itu butuh alasan ("tutup lebih awal"). | Tidak ada server custom; cron (`pg_cron`) bisa menutup PO saat pemilik belum selesai input order Minggu malam. Banner pengingat di UI cukup untuk awal. **Perlu konfirmasi (Q3, Q4).** |
| D7 | **Close membekukan laporan** (`po_batches.close_snapshot`, jsonb) mengikuti prinsip "snapshot, bukan hitung ulang". Ada `reopen_po_batch` dengan syarat ketat dan jejak audit di `po_batch_events`. | Laporan close harus tetap sama walau master harga berubah. Reopen mirip `reopen_accounting_period`. |
| D8 | **Gerbang produksi dikendalikan satu saklar:** `company_settings.po_gate_production` (boolean, default `false` saat migration). Jika `true` (Mode A): tahap **Rekap** di timeline hanya bisa ditandai selesai kalau PO-nya `closed`; karena potong sudah mensyaratkan Rekap, seluruh produksi otomatis menunggu close. Jika `false` (Mode B): PO hanya untuk pelaporan dan penandaan. | Ini perubahan alur bisnis terbesar. Dengan saklar, kode bisa rilis dulu tanpa mengubah alur lapangan, lalu pemilik menyalakan Mode A kapan siap. Hanya **satu titik gerbang** (`toggle_order_stage` stage `rekap`) agar tidak ada 5 tempat yang harus diubah. **Perlu keputusan (Q1).** |
| D9 | **Purchasing: tandai, bukan bangun ulang.** `stock_requests.po_batch_id` diisi trigger dari `source_order_id` (auto dari order) atau dipilih manual (opsional). Pada Mode A, tombol "Konfirmasi & Ajukan" untuk `draft_auto` milik PO yang masih `open` dikunci sampai PO ditutup. Ditambah RPC baca `get_po_purchase_list` (daftar belanja agregat per PO). | Logika kekurangan kain sudah netting terhadap reservasi `stock_movements` pending-out per order (`useOrders.ts`), jadi tidak ada kebutuhan menghitung ulang saat close. Pembelian per PO diturunkan lewat `stock_request_id` di item SPJ/supplier, tanpa menggandakan kolom di `purchasing_reports`/`supplier_purchases`. |
| D10 | **Laporan PO adalah laporan manajemen.** Margin PO = `total_price − hpp_total_snapshot` (estimasi). Pendapatan akuntansi tetap diakui saat kirim dan ditampilkan terpisah sebagai rekonsiliasi. | HPP bahan di akuntansi periodik (disesuaikan saat tutup bulan), jadi biaya bahan per PO tidak bisa disamakan dengan HPP buku. Label "estimasi" wajib tampil. |
| D11 | Nama kolom/tabel memakai **`po_batch_id`** dan **`po_batches`**, bukan `batch_id`. | `stock_requests.batch_id` sudah berarti "pengajuan bulk", dan ada `sewing_distribution_batches`. Tiga arti "batch" di satu skema membuka peluang salah join. |
| D12 | **Payroll tidak diubah.** Payroll Sabtu jatuh di dalam minggu PO; borongan sudah punya `order_id`, jadi biaya borongan per PO cukup dijumlahkan di laporan. | Gaji harian/sales tidak bisa dialokasikan ke PO tanpa aturan alokasi baru; tidak masuk lingkup. |
| D13 | "Prioritas" (order ≥ 6 pcs) **bukan** PO. Di UI dan dokumen, PO tidak pernah disebut "prioritas". | Istilah sudah dipakai untuk `order_type`. |

### Validasi aturan D3 (dihitung dengan skrip, Rabu sebagai jangkar)

| Bulan PO | Jumlah PO | Daftar minggu |
|---|---|---|
| Agustus 2026 | 4 | 3–9, 10–16, 17–23, 24–30 Agt |
| **September 2026** | **5** | 31 Agt–6 Sep, 7–13, 14–20, 21–27, 28 Sep–4 Okt |
| **Oktober 2026** | **4** | 5–11, 12–18, 19–25, 26 Okt–1 Nov |
| November 2026 | 4 | 2–8, 9–15, 16–22, 23–29 Nov |
| Desember 2026 | 5 | 30 Nov–6 Des, 7–13, 14–20, 21–27, 28 Des–3 Jan |
| Januari 2027 | 4 | 4–10, 11–17, 18–24, 25–31 Jan |
| Februari 2027 | 4 | 1–7, 8–14, 15–21, 22–28 Feb |

September dan Oktober sama persis dengan contoh Anda. Aturan "Selasa" juga cocok untuk semua contoh; keduanya baru berbeda saat tanggal 1 jatuh pada Rabu (pertama kali **1 September 2027**): aturan Rabu memasukkan minggunya ke bulan baru (5 dari 7 hari), aturan Selasa ke bulan lama (hanya 2 hari). Rekomendasi: Rabu.

**Catatan akuntansi:** `books_start_date` = 2026-11-01 jatuh pada hari Minggu, yaitu hari terakhir PO 4 Oktober. Data keuangan PO 4 Oktober hanya lengkap sebagian di jurnal. Laporan PO tidak terpengaruh karena membaca tabel operasional, tetapi blok rekonsiliasi jurnal untuk PO itu harus diberi catatan.

---

## 3. Aturan bisnis keras

1. Satu order tepat satu PO. Tidak ada order tanpa PO setelah backfill (`po_batch_id not null`).
2. PO dibentuk per minggu Senin–Minggu, `start_date` selalu Senin, `end_date = start_date + 6`.
3. Order baru atau perubahan `order_date` ke PO `closed` ditolak. Pesan: *"PO {kode} sudah ditutup. Order baru masuk ke PO {kode berikutnya} (mulai {tanggal})."*
4. PO `closed`: tambah/hapus item order, ubah `product_id`, `qty`, atau `price` item ditolak. Pembayaran, produksi, pengiriman, dan pengeluaran gudang tetap berjalan normal.
5. PO `closed` dengan flag `is_legacy = true` (hasil backfill) dikecualikan dari aturan 4, agar order lama yang masih berjalan tetap bisa dikoreksi.
6. `close_po_batch` idempoten: memanggil ulang PO yang sudah `closed` mengembalikan snapshot yang ada, tidak membuat snapshot baru.
7. Close sebelum hari Minggu (WIB) wajib mengisi alasan; tersimpan di `po_batches.close_early_reason` dan `po_batch_events`.
8. `reopen_po_batch` ditolak jika: ada `cutting_assignments` aktif/selesai untuk order di PO itu, ada `stock_requests` berstatus `in_progress`/`fulfilled` dengan `po_batch_id` PO itu, atau PO `is_legacy`. Alasan wajib. Snapshot lama dipindahkan ke `po_batch_events.payload`.
9. Mode A (`po_gate_production = true`): `toggle_order_stage(…, 'rekap', true)` ditolak jika PO order belum `closed`. Pesan: *"Rekap hanya bisa dilakukan setelah PO {kode} ditutup."* Override supervisor tidak disediakan di v1 (lihat Q1).
10. Laporan PO hanya membaca; tidak ada jurnal baru dan tidak ada transaksi baru.
11. Penghapusan order yang menyebabkan item terhapus lewat cascade tidak boleh diblokir guard aturan 4 (guard harus melewati kasus "order induk sudah tidak ada"; lihat migration `20261010062000` untuk pola yang sama).

---

## 4. Perubahan data

### 4.1 Tabel baru `po_batches`

| Kolom | Keterangan |
|---|---|
| `id`, `user_id`, `created_at` | Pola standar. RLS `auth.uid() = user_id`, **select-only** dari klien; tulis lewat RPC |
| `code` | `PO-YYYYMM-N`, contoh `PO-202609-1`. Label tampil: "PO 1 September 2026" |
| `period_year`, `period_month`, `seq_in_month` | Hasil aturan D3 |
| `start_date`, `end_date` | Senin dan Minggu. Check: `extract(isodow from start_date) = 1` dan `end_date = start_date + 6` |
| `status` | `open` / `closed` |
| `closed_at`, `closed_by` | `closed_by` = `auth.uid()` |
| `close_early_reason`, `close_note` | Opsional |
| `close_snapshot` | jsonb, berisi `schema_version` (mulai 1) |
| `is_legacy` | `true` untuk hasil backfill |
| `reopen_count` | Default 0 |

Unique: `(user_id, start_date)` dan `(user_id, period_year, period_month, seq_in_month)`.

### 4.2 Tabel baru `po_batch_events` (audit)

`id, user_id, po_batch_id, event` (`opened`, `closed`, `reopened`, `order_deleted_after_close`, `rekap_bulk`), `reason`, `payload` jsonb, `created_at`. Select-only dari klien.

### 4.3 Kolom baru di tabel lama

| Tabel | Kolom | Catatan |
|---|---|---|
| `orders` | `po_batch_id uuid references po_batches(id)` | Diisi trigger; not null setelah backfill; index |
| `stock_requests` | `po_batch_id uuid references po_batches(id) on delete set null` | Dari `source_order_id` atau manual; nullable |
| `company_settings` | `po_gate_production boolean not null default false` | Saklar Mode A/B (D8) |
| `orders.order_date`, `order_payments.payment_date` | default diubah ke tanggal WIB | D4 |
| `stock_requests.source_type` | tidak berubah di v1 | Konsolidasi otomatis ditunda (Q10) |

### 4.4 View dan backfill

- `orders_with_balance`: tambahkan `po_batch_id`, `po_code`, `po_status` **di posisi paling akhir** (jebakan view di `AGENT_INSTRUCTIONS` §8).
- Backfill: untuk setiap `order_date` yang ada, buat `po_batches` lewat fungsi yang sama dengan runtime. Semua PO dengan `end_date` < hari ini (WIB) → `closed`, `is_legacy = true`, tanpa snapshot. PO minggu berjalan → `open`. `stock_requests` yang punya `source_order_id` ikut diisi.
- `clear.sql`: tambahkan `po_batches`, `po_batch_events`. `seed.sql`: order contoh harus masuk PO yang valid.

---

## 5. Perubahan RPC / trigger

| Nama | Jenis | Perilaku |
|---|---|---|
| `po_week_info(p_date date)` | fungsi murni | Mengembalikan `start_date`, `end_date`, `period_year`, `period_month`, `seq_in_month` untuk tanggal tertentu (aturan D3). Satu-satunya tempat aturan ditulis |
| `ensure_po_batch(p_date date)` | fungsi internal | Buat baris jika belum ada (`insert … on conflict do nothing`, lalu select), aman untuk balapan dua order bersamaan |
| `trg_orders_assign_po_batch` | trigger `orders` BEFORE INSERT / UPDATE OF `order_date` | Isi `po_batch_id`; tolak jika PO `closed` (aturan 3) |
| `trg_order_items_guard_closed_po` | trigger `order_items` | Aturan 4, 5, 11 |
| `close_po_batch(p_batch_id, p_early_reason, p_mark_rekap default true, p_note)` | RPC | Validasi tanggal, bangun snapshot, opsional memanggil `toggle_order_stage(order, 'rekap', true)` untuk semua order PO, set `closed`, tulis event. Idempoten |
| `reopen_po_batch(p_batch_id, p_reason)` | RPC | Aturan 8 |
| `get_current_po()` | RPC baca | PO minggu berjalan (membuatnya jika belum ada) + hitung mundur ke Minggu |
| `list_po_batches(p_year, p_month)` | RPC baca | Daftar PO per bulan PO |
| `get_po_daily_report(p_date)` | RPC baca | Laporan harian (§6.2) |
| `get_po_close_report(p_batch_id)` | RPC baca | Snapshot beku + tambahan live (status bayar, progres produksi sekarang) |
| `get_po_monthly_report(p_year, p_month)` | RPC baca | Laporan bulanan (§6.2) |
| `get_po_purchase_list(p_batch_id)` | RPC baca | Daftar belanja agregat per material/warna dari `stock_requests` PO itu |
| `trg_stock_requests_assign_po_batch` | trigger `stock_requests` BEFORE INSERT | Isi `po_batch_id` dari `source_order_id` |
| `toggle_order_stage` | **diubah** | Tambah gerbang Mode A untuk stage `rekap`. `drop function` signature lama bila signature berubah |
| `delete_order` | **diubah** | Tulis `order_deleted_after_close` ke `po_batch_events` bila PO `closed` |

Semua RPC: `security definer set search_path = public`, cek `auth.uid()`, `revoke … from public, anon`, `grant execute … to authenticated`.

---

## 6. Perubahan UI

### 6.1 Navigasi dan halaman

Halaman baru **`/po` (Batch PO)** di grup Transaksi pada `Sidebar.tsx`. Empat tab:

| Tab | Isi |
|---|---|
| **PO Berjalan** | Kartu PO minggu ini (kode, rentang tanggal, hitung mundur ke Minggu, jumlah order, qty, nilai), daftar order PO, tombol **Tutup PO** (modal konfirmasi: alasan jika sebelum Minggu, centang "Tandai Rekap semua order" default aktif). Banner kuning jika ada PO lama masih `open` setelah lewat hari Minggu |
| **Laporan Harian** | Pilih tanggal (default hari ini WIB) |
| **Laporan Close** | Pilih PO `closed`; tombol Cetak/PDF lewat paginator A4 bersama yang sudah ada. Tombol **Buka Kembali PO** (alasan wajib) |
| **Laporan Bulanan** | Pilih bulan PO; tabel per PO + total + pembanding bulan lalu + blok rekonsiliasi |

### 6.2 Isi laporan (usulan, lihat Q7–Q9)

**Harian** (`get_po_daily_report`): kode PO, tanggal; jumlah order, total qty, nilai (`total_price`), ongkir, pembayaran masuk hari itu (`order_payments.payment_date`); rincian per sales dan per kategori produk; daftar order hari itu; kumulatif PO sejak Senin.

**Close** (snapshot): header (kode, periode, waktu dan pelaku close, tanda "ditutup lebih awal"); total order, qty, satuan vs prioritas, nilai, ongkir, terbayar dan sisa saat close; per sales; per kategori dan per produk; **rekap kebutuhan kain** (material + warna: kebutuhan, stok saat close, kekurangan); daftar order. Tambahan live di bawahnya: status bayar dan progres produksi sekarang (potong/jahit/QC lolos terhadap qty order).

**Bulanan**: satu baris per PO dengan order, qty, nilai booking, terbayar (bersih), piutang, jumlah dan nilai order terkirim, HPP snapshot, margin estimasi, borongan aktual (`piecework_tasks.total_wage` via `order_id`), pembelian bahan (item SPJ disetujui + item supplier via `stock_request_id`, berlabel "per PO, sebagian bisa belum terkait"). Total bulan dan selisih terhadap bulan lalu. Blok rekonsiliasi: pendapatan diakui di jurnal bulan kalender yang sama (4-1000 + 4-1100), dengan penjelasan satu kalimat kenapa angkanya berbeda dari "nilai booking PO".

### 6.3 Perubahan di halaman lain

| Halaman | Perubahan |
|---|---|
| `/orders` | Badge kode PO di tabel dan modal detail; filter PO; form order menampilkan "Masuk ke PO …" sesuai tanggal; pesan jelas bila tanggal jatuh di PO tertutup |
| `/worklog` | Badge PO di antrian potong/jahit; filter PO; urutan antrian: PO terlama dulu, lalu `order_date` (FIFO). Pool satuan tetap lintas PO. Pada Mode A, order dari PO `open` tidak muncul di antrian (karena Rekap belum bisa) dan tampil pesan penjelas |
| `/gudang` dan `/purchasing` | Badge PO pada pengajuan; filter PO; pada Mode A tombol "Konfirmasi & Ajukan" untuk `draft_auto` PO `open` nonaktif dengan tooltip. Panel "Daftar Belanja PO" (hasil `get_po_purchase_list`) |
| `/financial` | Filter PO untuk transaksi yang punya `order_id` (pembayaran order). Transaksi tanpa order tidak punya PO dan tidak difilter |
| `/payroll`, `/akuntansi` | Tidak berubah |

---

## 7. Kasus uji

**Aturan minggu:** 31 Agt 2026 → PO 1 Sep; 4 Okt 2026 → PO 5 Sep; 5 Okt → PO 1 Okt; 1 Nov 2026 → PO 4 Okt; 2 Nov → PO 1 Nov; 30 Nov → PO 1 Des; 28 Des → PO 5 Des; 1 Sep 2027 (Rabu) → minggu 30 Agt–5 Sep masuk **September 2027** PO 1.

**Zona waktu:** order disimpan 2026-10-19 00:30 WIB (= 2026-10-18 17:30 UTC) harus masuk PO yang mulai 19 Okt, bukan PO 12–18 Okt.

**Sukses:** order pertama minggu baru membuat PO `open` otomatis; dua order bersamaan tidak membuat PO ganda; close hari Minggu menghasilkan snapshot; close dipanggil dua kali mengembalikan snapshot yang sama; reopen saat belum ada potong/pembelian berhasil dan snapshot lama tersimpan di event.

**Ditolak:** order dengan `order_date` di PO `closed`; edit qty item di PO `closed` (non-legacy); close hari Rabu tanpa alasan; reopen setelah ada `cutting_assignments`; Mode A rekap pada PO `open`.

**Batas:** PO kosong (0 order) boleh ditutup; hapus order di PO `closed` tidak diblokir guard item; order legacy bisa diedit; backfill menghasilkan 0 order tanpa PO; `orders_with_balance` memuat kolom PO tanpa menggeser kolom lama (cek frontend yang memakai kolom berdasarkan nama); `clear.sql` lalu `seed.sql` lulus.

**Laporan:** jumlah order laporan harian × 7 hari = jumlah order di rincian PO; total bulanan = jumlah baris PO; snapshot close tidak berubah setelah harga master diubah.

---

## 8. Yang belum diputuskan (pertanyaan untuk pemilik)

### Pemblokir (jawab sebelum Fase 3 dimulai; Fase 1–2 boleh jalan dengan default)

| # | Pertanyaan | Rekomendasi default |
|---|---|---|
| Q1 | **Apakah produksi harus menunggu PO ditutup?** (Mode A) Artinya lead time order bertambah sampai 7 hari. Atau produksi tetap jalan seperti sekarang dan PO hanya untuk laporan dan pembelian? (Mode B) | Rilis dengan saklar `false` (Mode B). Nyalakan Mode A setelah pemilik yakin. Mode A tanpa override supervisor di v1; bila diperlukan, ditambah belakangan |
| Q2 | Konfirmasi aturan bulan PO: minggu milik bulan tempat hari **Rabu** jatuh (tabel §2)? | Rabu |
| Q3 | Close **manual** atau **otomatis** Minggu 23:59 WIB (`pg_cron`)? | Manual + banner pengingat |
| Q4 | Boleh menutup PO **sebelum Minggu**? | Boleh dengan alasan wajib |
| Q5 | Pelanggan mau order **setelah close** tapi minta ikut PO yang lalu. Boleh? | Tidak. Masuk PO berikutnya. Kalau perlu pengecualian: Buka Kembali PO |
| Q6 | **Order batal atau qty berubah setelah close**: boleh? Hapus order saat ini diizinkan (jika tidak memegang uang pelanggan), perubahan qty/item diblokir. | Hapus boleh dan tercatat di event; ubah qty/item diblokir (pakai Buka Kembali PO) |

### Boleh pakai default dulu

| # | Pertanyaan | Default |
|---|---|---|
| Q7 | Isi **laporan harian** yang diinginkan sudah sesuai §6.2? Siapa pembacanya dan formatnya (layar saja, PDF/cetak)? | Layar + cetak/PDF |
| Q8 | Laporan **close**: butuh rekap kebutuhan **kain** saja, atau juga bahan Direct BOM (sleting, label, furing)? Auto-restock sekarang hanya mencakup kain. | Kain saja di v1 |
| Q9 | Laporan **bulanan**: cukup margin estimasi dari HPP snapshot, ditambah borongan aktual dan pembelian bahan per PO? | Ya, berlabel "estimasi" |
| Q10 | Perlu **konsolidasi otomatis kebutuhan bahan saat close** (satu draft belanja per PO), atau cukup tandai pengajuan yang ada per PO dan tampilkan daftar belanja agregat? | Tandai + daftar agregat; konsolidasi ditunda |
| Q11 | Apakah order hanya boleh masuk PO bila **DP sudah dibayar**? Sekarang order bisa dibuat tanpa DP. | Tidak ada syarat DP; laporan menampilkan order tanpa DP sebagai peringatan |
| Q12 | Format kode PO `PO-202609-1` dan label "PO 1 September 2026" sudah cocok? | Ya |
