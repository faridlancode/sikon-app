# Revisi 1: Batch PO Fleksibel (CRUD oleh Owner), Kuota, dan Produksi Hibrida

- Tanggal: 2026-10-19
- Status: **Disetujui pemilik** (R-Q1 = a, R-Q6 = peringatan saja dalam pcs). Siap dikerjakan agen.
- Berlaku untuk: `RANCANGAN_BATCH_PO.md`, `CATATAN_IMPLEMENTASI_BATCH_PO.md`, `PROMPT_AGEN_BATCH_PO.md`.
- **Kalau dokumen lama bertentangan dengan file ini, file ini menang.**
- Dasar: audit kode Fase 1–2 (zip `sikon-app_1.zip`), hasilnya di §3.
- Prompt pelaksana: satu file, `PROMPT_REVISI_1.md` (Prompt 1 = backend R1, Prompt 2 = frontend R2 dan R3), lengkap dengan panduan mulai dari mana.

---

## 1. Keputusan pemilik

| Topik | Keputusan |
|---|---|
| Bentuk PO | PO dibuat, diubah, dan dihapus owner lewat halaman CRUD. **Nama dan tanggal PO bebas.** Bulan laporan dipilih owner. Tidak ada PO otomatis mingguan lagi |
| Pemilihan PO saat order (R-Q1) | **(a)** Sistem menyarankan PO otomatis dari tanggal order; owner boleh mengganti |
| Kuota (R-Q6) | **Peringatan saja**, satuan **pcs**. Tidak ada penolakan order karena kuota |
| Produksi (Q1) | Idealnya menunggu PO ditutup, tetapi boleh dilepas lebih awal per order dengan alasan wajib (gerbang lunak; dikerjakan di Fase 3, bukan R1–R3) |
| Order setelah close (Q6 lama) | Hapus order boleh dan tercatat di `po_batch_events`; ubah qty/item/harga diblokir (pakai Buka Kembali PO). **Sudah terimplementasi di Fase 1c, tidak diubah** |

Status keputusan rancangan awal:

| Keputusan lama | Status |
|---|---|
| D1 PO = dimensi analitik, bukan periode akuntansi | Tetap |
| D2 Tabel eksplisit dibuat otomatis | **Diubah**: tabel tetap, dibuat owner |
| D3 Aturan bulan Rabu, `seq_in_month` | **Dicabut** |
| D4 Zona waktu WIB | Tetap |
| D5 PO ditentukan dari `order_date` | **Diubah**: PO dipilih (disarankan dari tanggal), server tetap punya fallback otomatis |
| D6 Close hanya mulai Minggu | **Diubah**: lihat §2.5 |
| D7 Snapshot + reopen + audit | Tetap (sudah terimplementasi) |
| D8, D9 Gerbang produksi/purchasing | **Diubah** jadi gerbang lunak (§6) |
| D10–D13 | Tetap |

---

## 1A. Urutan kerja (R0–R3, lalu Fase 3)

| Langkah | Isi | Siapa | Status |
|---|---|---|---|
| **R0** | Audit kode Fase 1–2 terhadap desain baru | Sudah dikerjakan perancang dari zip `sikon-app_1.zip`; hasilnya §3 | **Selesai, agen tidak perlu mengulang** |
| **R1** | Satu migration korektif `20261020090000_po_flexible_crud.sql` + seed + smoke test + `DATABASE.md` | Agen, **Prompt 1** | Belum |
| **R2** | UI: Daftar PO + CRUD, dropdown PO di form order, modal Tutup PO, badge/filter nama PO | Agen, **Prompt 2 bagian R2** | Belum |
| **R3** | Koreksi tiga laporan (harian, close, bulanan) + kolom kuota + bersihkan sisa teks "Senin/Minggu" | Agen, **Prompt 2 bagian R3** | Belum |
| **Fase 3** | Produksi hibrida dan purchasing (§6) | Agen, prompt menyusul setelah R3 lulus | Belum |
| **Fase 4, 5** | Filter PO di keuangan; dokumentasi; arsipkan rancangan | Seperti rancangan awal | Belum |

Aturan: R1 selesai dan disetujui dulu, baru R2; R2 dicek di browser dulu, baru R3. Migration R1 tidak boleh di-push ke remote sebelum R2 selesai.

---

## 2. Rancangan baru

### 2.1 Tabel `po_batches` (perubahan)

| Kolom | Perubahan |
|---|---|
| `name` | **Baru**, teks wajib, unik per user tanpa membedakan huruf besar/kecil. Backfill baris lama dengan label lama ("PO 2 Oktober 2026") |
| `code` | Format baru untuk PO baru: `PO-0001`, `PO-0002`, … dari sequence database. Kode lama (`PO-202610-2`) dibiarkan. Kode adalah pengenal teknis; yang ditampilkan ke pengguna adalah `name` |
| `start_date`, `end_date` | Bebas. Check baru: `end_date >= start_date`. Check "Senin" dan "+6 hari" dihapus |
| `period_year`, `period_month` | Dipilih owner (laporan bulan apa). UI menyarankan bulan dari `end_date` |
| `seq_in_month` | **Nullable**, check 1–5 dihapus, unique dihapus. Tidak dipakai logika baru. Kolom tidak di-drop (laporan/snapshot lama masih menyimpannya) |
| `quota_qty` | **Baru**, numeric nullable. Kuota total pcs. Null = tanpa kuota. Hanya peringatan |
| `note` | **Baru**, teks opsional |
| unique | Hapus `(user_id, start_date)` dan `(user_id, period_year, period_month, seq_in_month)`. Tambah unique index `(user_id, lower(name))` |

`po_batch_events.event`: tambah nilai `updated`. (Nilai `opened` dipakai untuk "PO dibuat".)

### 2.2 Order menempel ke PO

1. Form order punya dropdown **PO** berisi PO berstatus `open` (nama, rentang tanggal, terisi/kuota pcs).
2. Pilihan awal otomatis: PO `open` yang rentang tanggalnya memuat `order_date`; kalau lebih dari satu, yang `start_date`-nya paling akhir; kalau tidak ada, kosong dan pengguna wajib memilih. Saat tanggal order diganti, saran dihitung ulang selama pengguna belum memilih manual.
3. Frontend mengirim `po_batch_id` saat membuat/mengubah order.
4. **Server tetap punya fallback**: bila `po_batch_id` null saat INSERT (kode lama, seed, jalur lain), trigger memilih PO dengan aturan nomor 2. Bila tidak ada, error: *"Belum ada PO terbuka untuk tanggal {tanggal}. Buat PO di menu Batch PO terlebih dahulu."* Server **tidak lagi membuat PO otomatis**.
5. INSERT ke PO `closed` ditolak: *"PO {name} sudah ditutup. Pilih PO yang masih terbuka atau buka kembali PO tersebut."*
6. Memindahkan order ke PO lain (ubah `po_batch_id`): PO tujuan harus `open`; PO asal tidak boleh `closed` non-legacy.
7. Mengubah `order_date` tidak lagi memindahkan PO. Trigger tidak lagi dipasang pada `order_date`.
8. Tanggal order di luar rentang PO terpilih: boleh, UI memberi peringatan kuning. Tidak ada constraint tumpang tindih; UI CRUD memberi peringatan saat rentang tumpang tindih dengan PO lain.

### 2.3 Kuota

- Realisasi = `sum(order_items.qty)` seluruh order di PO. Dihitung langsung, tidak disimpan.
- Peringatan kuning mulai 90%, merah mulai 100% dari kuota. Order tetap bisa disimpan.
- Tampil di: Daftar PO (progress bar), dropdown PO di form order, Laporan Harian, Laporan Close, Laporan Bulanan.
- Close menyimpan `quota_qty` dan realisasi ke snapshot (`summary.quota_qty`, `summary.quota_used_pct`). Mengubah kuota setelah close tidak mengubah snapshot.
- Kuota boleh diubah kapan saja, termasuk setelah PO `closed` (tidak mengubah snapshot).

### 2.4 RPC baru / diubah

| RPC | Tindakan |
|---|---|
| `create_po_batch(p_name, p_start_date, p_end_date, p_period_year, p_period_month, p_quota_qty default null, p_note default null)` | Baru. Status `open`, `code` dari sequence, event `opened`. Nama kembar ditolak |
| `update_po_batch(p_batch_id, p_name, p_start_date, p_end_date, p_period_year, p_period_month, p_quota_qty, p_note)` | Baru. Nama, bulan laporan, kuota, catatan: kapan saja. **Tanggal: hanya saat `open`.** Event `updated` dengan nilai lama/baru di `payload` |
| `delete_po_batch(p_batch_id)` | Baru. Hanya PO tanpa order, bukan legacy, dan bukan `closed`. Fase 3 menambah syarat "tanpa `stock_requests`" |
| `list_po_batches_summary(p_status default null, p_year default null, p_month default null)` | Baru. Mengembalikan baris PO + `order_count`, `total_qty`, `total_price`, `quota_used_pct`. Dipakai Daftar PO dan dropdown order |
| `fn_orders_assign_po_batch` (trigger) | **Ganti** sesuai §2.2; trigger dipasang `before insert or update of po_batch_id` |
| `close_po_batch` | **Ubah**: aturan "lebih awal" jadi `today_wib < end_date`; snapshot memuat `name`, `quota_qty`, `quota_used_pct`; kegagalan `toggle_order_stage` saat tandai Rekap massal **dicatat** (jumlah gagal di payload event dan snapshot), tidak ditelan diam-diam |
| `get_current_po` | **Dicabut** (`drop function`); `ensure_po_batch` **dicabut**. Frontend memakai `list_po_batches_summary` |
| `po_week_info` | **Dibiarkan di database** (dipakai migration lama), ditandai deprecated lewat `comment on function`, tidak dipakai kode baru |
| `get_po_daily_report` | **Ubah** (§5.1) |
| `get_po_close_report`, `get_po_monthly_report` | **Ubah** (§5.2, §5.3) |
| `list_po_batches(year, month)` | Tetap (tipe baris otomatis memuat kolom baru) |
| `guard_order_items_closed_po`, `reopen_po_batch`, `delete_order` | **Tidak diubah** |

Semua RPC baru: `security definer`, `set search_path to 'public'`, cek `auth.uid()`, `revoke … from public, anon`, `grant execute … to authenticated`.

### 2.5 Aturan penutupan (D6 baru)

- PO boleh ditutup kapan saja.
- Kalau `today_wib < end_date`, **alasan wajib** (disebut "ditutup lebih awal"). Pada atau setelah `end_date` tanpa alasan.
- PO `open` yang `end_date`-nya sudah lewat memicu banner pengingat.

---

## 3. Hasil audit kode Fase 1–2

Dicek langsung pada zip. Yang **belum bisa dicek**: apakah empat migration PO sudah di-push ke remote. Log agen menyebut "tidak diterapkan ke remote". Rencana ini aman untuk dua kemungkinan: koreksi selalu lewat **migration baru**, jangan mengedit empat migration PO yang ada.

| Lokasi | Temuan | Tindakan |
|---|---|---|
| `20261019090000_po_batches_core.sql` | Constraint `po_batches_start_monday_ck`, `po_batches_end_sunday_ck`, `po_batches_user_start_uniq`, `po_batches_user_seq_uniq`; `seq_in_month not null` + check 1–5; check `event` tanpa `updated`; fungsi `po_week_info`, `ensure_po_batch` | Migration korektif: drop constraint, longgarkan, tambah `name`/`quota_qty`/`note`, cabut `ensure_po_batch` |
| `20261019100000_orders_po_batch_link.sql` | Trigger `fn_orders_assign_po_batch` menghitung PO dari `po_week_info(order_date)` **dan membuat PO baru otomatis**; dipasang pada `insert or update of order_date`. Backfill sudah jalan (data lama tetap valid). View `orders_with_balance` memuat `po_batch_id`, `po_code`, `po_status` | Ganti trigger (§2.2). **Tambahkan `po_name` di akhir view** (kolom lama tidak digeser) |
| `20261019110000_po_batch_close_reopen.sql` | `close_po_batch`: aturan awal memakai `isodow < 7`; loop Rekap massal menelan semua exception (`exception when others then null`); `get_current_po` memanggil `ensure_po_batch` dan menghitung hitung mundur ke Minggu; `list_po_batches` hanya filter tahun+bulan. Guard `order_items`, `reopen_po_batch`, `delete_order`, kolom `po_gate_production` sudah benar | Ubah `close_po_batch`; cabut `get_current_po`; tambah `list_po_batches_summary`. Sisanya dibiarkan |
| `20261019120000_po_reports_rpcs.sql` | Laporan harian menentukan PO dari `po_week_info(p_date)` dan menjumlahkan order berdasarkan rentang minggu; JSON memuat `po_info`, `cumulative_since_monday`; close/monthly memilih `seq_in_month` | Ubah ketiganya (§5) |
| `src/components/po/poHelpers.ts` | `getPoLabel` memakai `seq_in_month` ("PO 2 Oktober 2026"); `getCountdownText` bicara "minggu ini" | Pakai `batch.name`; countdown ke `end_date` |
| `src/components/orders/OrderModal.tsx` (sekitar baris 220–290) | Memanggil RPC `po_week_info` dan menebak "PO berikutnya"; **tidak mengirim `po_batch_id`**; insert order di `src/hooks/useOrders.ts` (sekitar baris 270) juga tidak mengirimnya | Ganti dengan dropdown PO (§2.2) dan kirim `po_batch_id` di insert/update |
| `src/components/po/ClosePoModal.tsx` | Mendeteksi "sebelum hari Minggu" dari hari dalam minggu | Bandingkan hari ini WIB dengan `end_date` |
| `CurrentPoCard.tsx`, `CurrentPoOrdersTable.tsx`, `PastOpenWarningBanner.tsx`, `PoPage.tsx` | Teks dan logika "PO minggu berjalan", "Minggu 23:59:59", "PO Minggu Lalu"; tab `current` memakai `get_current_po` | Ganti menjadi **Daftar PO** + CRUD (§4); teks netral |
| `usePoBatches.ts` | Memakai `get_current_po` dan `list_po_batches` | Pakai `list_po_batches_summary` + hook CRUD |
| `PoDailyReportTab.tsx`, `PoDailyReportPrintTemplate.tsx` | Kotak "Kumulatif PO Sejak Senin" | Ganti sesuai §5.1 |
| `PoMonthlyReportTab.tsx`, `PoMonthlyReportPrintTemplate.tsx` | Teks "batch mingguan", "Minggu PO Terdaftar" | Teks netral; tambah kolom kuota |
| `src/types.ts` (dua interface sekitar baris 68 dan 246 memuat `seq_in_month`) | Tipe `PoBatch` tidak punya `name`, `quota_qty`, `note` | Tambah; `seq_in_month` jadi opsional |
| `OrdersTable.tsx`, `OrderDetailModal.tsx`, `OrdersPage.tsx` | Badge dan filter PO memakai `po_code` | Tampilkan `po_name`; filter memakai nama |
| `supabase/seed.sql` | **Tidak punya referensi PO.** Order seed bergantung pada trigger yang membuat PO otomatis; setelah revisi, seed akan gagal | Seed membuat satu PO `open` yang memuat tanggal order seed, sebelum order |
| `supabase/clear.sql` | Sudah memuat tabel PO | Cek urutan hapus tetap benar |
| `supabase/tests/po_batches_phase{1a,1b,1c,2}_smoke.sql` | Menguji `po_week_info`, auto-create, `get_current_po`, JSON lama | Perbarui atau ganti dengan `po_batches_flex_smoke.sql` (§7) |
| `toggle_order_stage`, `stock_requests` | Belum disentuh Fase 1–2. `po_gate_production` ada di DB tapi **belum dipakai** di mana pun | Fase 3 |

---

## 4. UI

### 4.1 Halaman `/po`

Tab pertama diganti dari "PO Berjalan" menjadi **Daftar PO**. Tab Laporan Harian / Close / Bulanan tetap.

### 4.2 Daftar PO

- Tabel: nama, rentang tanggal, bulan laporan, status, jumlah order, qty terisi / kuota (progress bar, kuning ≥ 90%, merah ≥ 100%), nilai.
- Filter status (Terbuka / Ditutup / Semua) dan bulan laporan.
- Tombol **Tambah PO**, **Edit**, **Hapus** (hanya bila diizinkan), **Tutup PO**, **Buka Kembali**.
- Klik baris membuka daftar order PO tersebut (komponen `CurrentPoOrdersTable` dipakai ulang dengan teks netral).
- Banner pengingat bila ada PO `open` yang `end_date`-nya sudah lewat.

### 4.3 Modal Tambah/Edit PO

Field: Nama (wajib), Tanggal mulai, Tanggal selesai, Bulan laporan (default dari tanggal selesai, bisa diganti), Kuota pcs (opsional), Catatan (opsional). Peringatan kuning (tidak memblokir) bila rentang tumpang tindih dengan PO lain. Pada PO `closed`: tanggal dikunci; nama, bulan laporan, kuota, catatan tetap bisa diubah.

### 4.4 Form order

Dropdown **PO** sesuai §2.2, dengan sisa kuota di tiap opsi dan peringatan bila tanggal order di luar rentang atau kuota terlampaui. Pesan error PO tertutup sesuai §2.2 nomor 5.

### 4.5 Modal Tutup PO

Hapus teks "hari Minggu". Tampilkan "belum melewati tanggal selesai ({end_date})" bila `today_wib < end_date`; kotak alasan wajib hanya saat itu.

---

## 5. Laporan (perubahan JSON & Format Laporan)

### 5.1 `get_po_daily_report(p_date)`

- Menyaring order berdasarkan `order_date = p_date` (bukan rentang minggu).
- **Rincian Pesanan per Sales & Kategori (Matrix Cross-tab):** Menggabungkan breakdown sales dan produk ke dalam satu tabel matriks silang (`sales_category_matrix`: `{ sales_name, category_name, total_pcs, total_price }`). Baris berupa Sales (CS), kolom berupa Kategori Produk (Kemeja, Rompi, Celana, dll.), total pcs, dan total nilai (Rp).
- **Sisa Pelunasan PO Terdahulu (`past_unpaid_pos`):** Menampilkan daftar batch PO sebelumnya yang statusnya sudah closed atau tanggalnya lewat namun masih memiliki piutang / sisa pembayaran belum lunas (`batch_id, name, code, status, start_date, end_date, total_orders, unpaid_orders_count, total_booking_and_ongkir, total_paid, remaining_amount`).
- **Kotak Kumulatif per PO (`pos`):** Tetap menampilkan akumulasi per PO berjalan s.d. tanggal laporan.
- Layout cetak A4 dan UI dirapikan untuk kemudahan membaca.

### 5.2 `get_po_close_report` & Snapshot

- **Tanpa Rekap Kebutuhan Kain:** Bagian `fabric_requirements` dihilangkan dari tampilan dan cetak laporan close PO.
- **Rincian Pesanan per Sales & Kategori:** Menambahkan tabel matriks silang per Sales & Kategori (`sales_category_matrix`) yang dibekukan ke dalam snapshot saat penutupan PO.
- **Laporan Progres Produksi Terpisah (Khusus PO Closed):**
  - Dipisahkan dari laporan order / komersial via sub-view dan tombol cetak tersendiri (`Cetak Progres Produksi (PDF)`).
  - Menyajikan ringkasan progres fisik (total pcs, potong % & pcs, jahit % & pcs, QC lolos % & pcs).
  - Tabel rincian order diurutkan dari order kuantitas terbanyak (`ORDER BY total_pcs DESC`), menampilkan pelanggan, item produk, sales, total pcs, progres potong, progres jahit, QC, dan status produksi.

### 5.3 `get_po_monthly_report(p_year, p_month)`

- Mengelompokkan PO berdasarkan `period_year/period_month` pilihan owner.
- Menambahkan matriks pesanan per Sales & Kategori (`sales_category_matrix`) akumulasi sebulan.
- **Perapian Layout:** Tabel kinerja finansial & operasional per batch PO dirapikan dari 10 kolom berdesakan menjadi 7 kolom terstruktur yang proporsional di A4 portrait (Batch PO & Periode, Status & Kuota, Order/Pcs, Nilai Booking & Ongkir, Terbayar & Sisa Piutang, Estimasi Margin & HPP, Borongan & Bahan).
- Rekonsiliasi jurnal akuntansi dan perbandingan bulan lalu tetap terjaga rapi.

---

## 6. Fase 3 versi baru: produksi hibrida dan purchasing (belum dikerjakan)

Tidak ikut R1–R3. Spesifikasi, dikerjakan setelah R3 lulus:

- Saklar `company_settings.po_gate_production` (sudah ada, default `false`). Bila `true`: `toggle_order_stage(order, 'rekap', true)` pada order dari PO `open` ditolak dengan pesan *"PO {name} belum ditutup. Tutup PO atau gunakan Lepas ke Produksi Lebih Awal."*
- RPC baru `release_order_early(p_order_id, p_reason)`: alasan wajib, menandai Rekap `done` lewat logika `toggle_order_stage`, mencatat event `rekap_early` (tambah ke check `event`), badge `⚠ Lebih Awal`.
- `close_po_batch` dengan "Tandai Rekap semua" tidak menyentuh order yang sudah Rekap `done`.
- Purchasing: `stock_requests.po_batch_id` (trigger dari `source_order_id`), badge `PO belum ditutup` dan konfirmasi sekali pada "Konfirmasi & Ajukan" (tidak dikunci), `get_po_purchase_list`, syarat tambahan di `delete_po_batch`.
- Worklog: badge/filter PO, urutan antrian PO terlama lalu `order_date`.
- Dengan saklar `false`, perilaku harus identik dengan sebelum fitur PO.

---

## 7. Kasus uji

**Database (`po_batches_flex_smoke.sql`)**
- Buat PO "PO 5 September" 28 Sep–4 Okt, bulan laporan September → muncul di laporan bulanan September, tidak di Oktober.
- Nama kembar (beda huruf besar/kecil) → ditolak. Tanggal selesai < tanggal mulai → ditolak.
- Dua PO `open` tumpang tindih → berhasil.
- Insert order tanpa `po_batch_id` → masuk PO `open` yang memuat tanggal; bila ada dua, yang `start_date` terbaru; bila tidak ada → error pesan §2.2 nomor 4 dan **tidak ada PO baru terbentuk**.
- Insert order ke PO `closed` → ditolak dengan pesan §2.2 nomor 5.
- Ubah `po_batch_id` ke PO `closed` → ditolak; dari PO `closed` non-legacy → ditolak; dari PO legacy → diizinkan.
- Ubah `order_date` order → PO tidak berpindah.
- `update_po_batch`: tanggal PO `closed` ditolak; nama/bulan laporan/kuota/catatan berhasil dan snapshot tidak berubah; event `updated` tercatat.
- `delete_po_batch`: PO berisi order ditolak; PO kosong `open` berhasil; PO legacy ditolak.
- `close_po_batch`: sebelum `end_date` tanpa alasan ditolak; pada `end_date` tanpa alasan berhasil; snapshot memuat `name` dan kuota; bila `toggle_order_stage` gagal untuk sebagian order, jumlahnya tercatat di event.
- Kuota tidak menolak order mana pun, walau terlampaui.
- Laporan harian: order tanggal X dari dua PO berbeda → `pos` berisi dua entri dengan kumulatif masing-masing.
- Laporan bulanan memakai `period_year/period_month` pilihan owner.
- `seed.sql` lalu `clear.sql` lalu `seed.sql` lulus. `get_current_po` dan `ensure_po_batch` tidak ada lagi.

**Browser**
- Tambah PO "PO Spesial Lebaran" dengan rentang bebas, muncul di Daftar PO dan di dropdown form order.
- Buat order bertanggal dalam rentang PO → dropdown terisi otomatis; ganti ke PO lain → tersimpan di PO itu.
- Buat order melewati kuota → peringatan tampil, order tetap tersimpan.
- PO `closed` tidak ada di dropdown; order lama di PO `closed` yang dibuka untuk diedit menampilkan PO-nya.
- Tutup PO sebelum tanggal selesai tanpa alasan → tombol Tutup tertahan; dengan alasan → berhasil.
- Laporan harian, close, dan bulanan tampil dan cetak PDF tanpa error; snapshot lama tetap terbuka.
- Tidak ada lagi teks "Senin", "Minggu", atau "minggu ini" yang menyesatkan di halaman PO.

---

## 8. Yang masih terbuka (tidak menahan R1–R3)

| # | Pertanyaan | Default |
|---|---|---|
| T1 | Apakah empat migration PO sudah di-push ke remote? | Dianggap belum. R1 tetap migration baru; **jangan push R1 sebelum R2 siap**, karena UI lama memanggil RPC yang dicabut |
| T2 | Isi laporan harian/close/bulanan sesuai §5 dan rancangan awal §6.2 | Ya |
| T3 | Rekap kebutuhan bahan di laporan close: hanya kain | Ya |
| T4 | Syarat DP untuk masuk PO | Tidak ada syarat |
| T5 | Field lain di CRUD PO di sistem lama Anda selain nama, tanggal, bulan laporan, kuota, catatan | Tidak ada |
