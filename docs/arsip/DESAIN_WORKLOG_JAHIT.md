# Desain Sistem Worklog Jahit & Potong — SIKon

> **Status dokumen:** Living design doc. Terakhir diperbarui 24 Sep 2026 — mencerminkan kondisi **sudah diimplementasi** seluruhnya kecuali bagian §9.

## 1. Latar Belakang

Flow produksi saat ini:

```
order masuk -> rekap -> potong kain -> bordir (vendor) -> jahit -> finishing (harian) -> qc (harian) -> packaging -> pelunasan -> kirim
```

Fokus dokumen ini: **tahap jahit & potong** — sistem pembagian kerja (worklog) untuk penjahit & tukang potong, supaya di hari gajian (Sabtu) tidak ada lagi input manual upah di payroll.

Contoh kasus pemicu diskusi: 10 order dengan total 76 pcs, dibagi rata ke 5 penjahit → 15 pcs × 4 orang + 16 pcs × 1 orang.

## 2. Kondisi Sistem Saat Ini (hasil review codebase)

Sudah ada, jadi fondasi:
- Tabel `piecework_tasks` (borongan): `task_type` (cutting/sewing/finishing/other), `staff_id`, `order_id`, `product_id`, `qty`, `rate_per_unit`, `total_wage`, `status` (pending/completed/paid).
- Payroll (`calculateDraftPayroll`) **sudah otomatis** menjumlahkan `piecework_tasks` dengan `status = 'completed'` per staf → tidak perlu input manual saat payroll, **asal** baris `piecework_tasks`-nya sudah terbentuk sebelum periode ditutup.
- `staff.wage_type`: attendance / piecework / sales.
- `products.sewing_cost_per_pcs` & `cutting_cost_per_pcs` — beda per produk.

Belum ada (gap, sudah diselesaikan):
- ~~`orders.production_status` masih kasar~~ → digantikan `order_stage_events` (§8).
- ~~Belum ada mekanisme pembagian kerja otomatis~~ → sudah ada `distribute_sewing_work` (§5).
- ~~Belum ada tracking identitas penjahit sampai ke tahap QC~~ → sudah ada `sewing_assignments` + `qc_checks` (§4.2).

## 3. Keputusan Desain (hasil diskusi)

| Pertanyaan | Keputusan |
|---|---|
| Dasar pembagian kerja jahit | **Rata jumlah pcs** (bukan berdasar nilai upah/Rp), bisa lintas order & memecah satu order_item ke beberapa penjahit |
| Qty selesai dianggap sah (siap dibayar) | **Baru terhitung setelah lolos Finishing → QC**, bukan saat penjahit selesai jahit |
| Sisa kerjaan belum selesai saat hari gajian | **Dibayar sesuai qty yang sudah lolos QC saja**; sisanya lanjut ke penjahit yang sama minggu berikutnya (bukan dibagi ulang ke orang lain) |
| QC reject (cacat) | **Tidak dihitung/dibayar** sampai diperbaiki dan lolos QC ulang oleh penjahit yang sama |
| Gaji susulan | Kalau qty baru lolos QC **setelah** payroll mingguan ditutup, dibayar **cash langsung di luar sistem payroll** — sistem hanya mencatat status pembayarannya, tidak masuk ke `weekly_payrolls` |

**Catatan trade-off yang disadari bersama:** karena dasarnya rata pcs (bukan rata nilai Rp), penjahit yang kebagian produk dengan `sewing_cost_per_pcs` lebih mahal akan berpenghasilan lebih tinggi dari yang kebagian produk lebih murah walau jumlah pcs sama. Ini keputusan sadar demi kesederhanaan; aturan pembagian bisa diubah belakangan karena algoritmanya modular.

## 4. Skema Database

### 4.1 Perubahan pada tabel existing

**`order_items`** — tambah kolom:
```sql
ready_for_sewing_at   timestamptz null   -- diisi saat bordir selesai; item masuk pool jahit
cutting_completed_at  timestamptz null   -- diisi saat item ditandai selesai dipotong
cutting_qty           numeric null       -- qty aktual yang dipotong (default = qty, editable kalau ada kain rusak)
```

**`piecework_tasks`** — tambah kolom & perluas status:
```sql
sewing_assignment_id  uuid null references sewing_assignments(id)
order_item_id         uuid null references order_items(id)  -- referensi per-item (cutting & sewing)
manual_paid_at        timestamptz null
manual_paid_note      text null
-- status diperluas jadi: 'pending' | 'completed' | 'paid' | 'paid_manual'
```
`paid_manual` = jalur susulan cash. Karena payroll draft hanya menjumlahkan `status = 'completed'`, baris `paid_manual` otomatis tidak ikut terhitung lagi — tidak perlu ubah logic `calculateDraftPayroll` / `pay_weekly_payroll` yang sudah ada.

### 4.2 Tabel baru

**`sewing_distribution_batches`** — jejak audit tiap kali tombol "Bagikan Kerja" ditekan
```sql
id                uuid primary key
user_id           uuid not null references auth.users(id)
distributed_at    timestamptz default now()
pool_qty_total    numeric not null
staff_count       integer not null
notes             text
created_at        timestamptz default now()
```

**`sewing_assignments`** — "bundel" jatah kerja: satu potongan qty dari satu order_item untuk satu penjahit
```sql
id                uuid primary key
user_id           uuid not null references auth.users(id)
order_item_id     uuid not null references order_items(id)
staff_id          uuid not null references staff(id)
batch_id          uuid references sewing_distribution_batches(id)
assigned_qty      numeric not null      -- target pcs bundel ini (tetap, tidak berkurang oleh reject)
sewn_qty          numeric default 0     -- progres dijahit (opsional, untuk monitoring produktivitas)
qc_passed_qty     numeric default 0     -- kumulatif lolos QC -> dasar pembayaran
qc_rejected_qty   numeric default 0     -- kumulatif reject, menunggu rework
status            varchar not null default 'assigned'  -- 'assigned' | 'in_progress' | 'completed'
created_at        timestamptz default now()
```
Bundel berstatus `completed` ketika `qc_passed_qty = assigned_qty`.

**`qc_checks`** — riwayat setiap kali QC memeriksa satu bundel (bisa berkali-kali kalau ada rework)
```sql
id                    uuid primary key
user_id               uuid not null references auth.users(id)
sewing_assignment_id  uuid not null references sewing_assignments(id)
checked_at            timestamptz default now()
passed_qty            numeric not null default 0
rejected_qty          numeric not null default 0
notes                 text
```
Data ini juga berguna untuk evaluasi kualitas per penjahit (reject rate), bukan cuma untuk pembayaran.

**`cutting_assignments`** — assign per **order_item**
```sql
id              uuid primary key
user_id         uuid not null references auth.users(id)
order_id        uuid null references orders(id)        -- nullable (diisi otomatis dari order_item)
order_item_id   uuid not null references order_items(id)
staff_id        uuid not null references staff(id)
assigned_at     timestamptz default now()
status          varchar not null default 'assigned'    -- 'assigned' | 'done'
notes           text
constraint cutting_assignments_item_unique unique (order_item_id)  -- 1 item cuma 1 assignment aktif
```

### 4.3 Relasi singkat

```
orders 1--* order_items 1--* sewing_assignments *--1 staff
                                    |
                                    +--* qc_checks
                                    |
                                    +--* piecework_tasks --* weekly_payrolls (via payroll_items, existing)

sewing_distribution_batches 1--* sewing_assignments

order_items 1--1 cutting_assignments *--1 staff
```

## 5. Alur Sistem Jahit (End-to-End)

1. **Bordir selesai** → admin menandai stage "Bordir" selesai di Timeline Order, atau menandai `order_items.ready_for_sewing_at` langsung. Item masuk pool Antrian Jahit.
2. **"Bagikan Kerja"** (aksi manual admin, kapan saja pool dianggap cukup) —
   - Hitung `pool_qty_total` = total sisa qty semua item yang sudah `ready_for_sewing_at` dan belum sepenuhnya ter-assign.
   - **Hanya penjahit aktif yang dicakup**: staf dengan `wage_type='piecework'`, `is_active=true`, dan `role` mengandung kata "Penjahit"/"jahit"/"sewing". Tukang potong (role "Tukang Potong") tidak ikut terdistribusi walau juga piecework.
   - Hitung beban berjalan tiap penjahit aktif = Σ(`assigned_qty − qc_passed_qty`) dari assignment yang belum `completed`.
   - Tentukan kuota baru per orang: `base = floor(pool / n)`; sisa `pool mod n` diberikan ke penjahit dengan beban berjalan paling kecil dulu.
   - Susuri pool (urut tanggal order lama → baru), isi kuota tiap penjahit berurutan; kalau kuota seseorang pas habis di tengah satu order_item, item itu **dipecah** jadi 2 baris `sewing_assignments`.
   - Simpan sebagai 1 baris `sewing_distribution_batches` + banyak baris `sewing_assignments` (status `assigned`).
3. **Mulai Jahit** → admin/supervisor mengubah status bundel dari `assigned` → `in_progress` via tombol "Mulai Jahit" di tab "Beban Penjahit". Bisa per-bundel atau "Mulai Semua" per penjahit sekaligus. Ini dikerjakan via RPC `start_sewing_assignment` / `start_all_sewing_assignments`.
4. **Penjahit kerja** → `sewn_qty` di-update opsional untuk monitoring (belum memengaruhi pembayaran).
5. **Finishing** → tahap fisik harian, tidak perlu tracking per staf, pcs lanjut ke QC.
6. **QC memeriksa per bundel** → input `passed_qty` & `rejected_qty`:
   - Simpan baris baru di `qc_checks`, update kumulatif di `sewing_assignments`.
   - `passed_qty > 0` → insert baris baru ke `piecework_tasks` (`task_type='sewing'`, `qty=passed_qty`, `rate_per_unit=products.sewing_cost_per_pcs`, `status='completed'`, `sewing_assignment_id` terisi).
   - `rejected_qty > 0` → bundel kembali berstatus `in_progress`, menunggu rework oleh penjahit yang sama, di-QC ulang sampai semua lolos.
   - Jika `qc_passed_qty = assigned_qty` → bundel status → `completed`.
7. **Sabtu, payroll berjalan seperti sistem sekarang** — `calculateDraftPayroll` menjumlahkan semua `piecework_tasks` berstatus `completed` per staf tanpa input manual; `pay_weekly_payroll` menandainya `paid`.
8. **Susulan** — qty yang baru lolos QC setelah payroll ditutup tetap tercatat di `piecework_tasks` (`status='completed'`); saat dibayar cash, personalia menandainya manual jadi `status='paid_manual'` + isi `manual_paid_at` & `manual_paid_note`. Otomatis tidak tertarik lagi ke payroll resmi berikutnya.

## 6. Kebutuhan UI — Jahit

Semua diimplementasi di halaman `/worklog`, tab-tab:

### 6.1 Tab "Antrian Jahit"
Daftar `order_items` yang punya `ready_for_sewing_at` (sudah siap dijahit), dengan **3 status pool**:
- 🟡 **Menunggu distribusi** — `assigned_qty = 0`, belum ada penjahit yang ditugaskan.
- 🔵 **Sebagian (N pcs sisa)** — sebagian qty sudah di-assign, masih ada sisa belum didistribusikan.
- 🟢 **Sudah didistribusikan** — seluruh qty item sudah ter-assign ke penjahit.

Filter tab tersedia: "Menunggu Distribusi" / "Sudah Dibagikan" / "Semua Pool".

Tombol **"Bagikan Kerja"**: bisa dijalankan tanpa memilih item (distribusi semua yang belum fully-assigned), atau setelah memilih item tertentu (distribusi selektif). Setelah distribusi berhasil, item pindah ke status "Sudah didistribusikan" di UI.

### 6.2 Tab "Beban Penjahit"
Per orang: assigned / lolos QC / reject, progress bar visual, rata-rata reject rate.

- Status bundel: **Belum Mulai** (`assigned`) / **Sedang Dikerjakan** (`in_progress`) / **Selesai** (`completed`).
- Tombol **"Mulai Jahit"** di tiap baris bundel yang masih `assigned` → update ke `in_progress`.
- Tombol **"Mulai Semua (N)"** di header per penjahit → update semua bundel `assigned` miliknya ke `in_progress` sekaligus.

### 6.3 Tab "Pemeriksaan QC"
Pilih bundel `in_progress`, input qty lolos / reject → memanggil RPC `record_qc_check`.

### 6.4 Tab "Susulan Cash"
Daftar `piecework_tasks` yang `status='completed'` dan belum masuk payroll manapun. Tombol "Tandai Dibayar Manual" → `status='paid_manual'`.

## 7. Desain Sistem Worklog Potong (event-driven, bukan setoran mingguan)

> **Perubahan penting dari desain awal:** desain pertama (setoran mingguan H-2/H-1 + validasi silang) **digantikan** oleh pendekatan event-driven real-time. Insight pemicunya: order baru boleh masuk pool jahit setelah ditandai "Siap Jahit" (setelah bordir selesai) — dan untuk order bisa sampai ke titik itu, potong **pasti sudah selesai duluan**. Daripada dikumpulkan ulang lewat setoran mingguan terpisah, datanya dicatat **langsung per-order/per-item, real-time**, saat prosesnya benar-benar terjadi.

### 7.1 Keputusan Desain

| Pertanyaan | Keputusan |
|---|---|
| Assignment tukang potong | Tetap ada **tahap assign terpisah** (order_item → tukang potong) sebelum dikerjakan, untuk visibility "siapa lagi pegang apa" |
| Syarat masuk antrian potong | **Stage 'rekap' order harus sudah berstatus 'done'** di `order_stage_events`. Fungsi `assign_cutting_item` memvalidasi ini sebelum insert. Item dari order yang rekap-nya belum selesai tidak akan muncul di antrian potong. |
| Granularitas penandaan selesai | **Per item, bertahap** — item A boleh selesai duluan, item B nyusul. Order dianggap "Potong Selesai" (di timeline) kalau **semua item**-nya sudah selesai |
| Sumber data pembayaran | Langsung dari momen "Tandai Item Selesai Dipotong" — bukan setoran mingguan |

**Catatan asumsi:** rate upah tetap per-item, ambil dari `cutting_cost_per_pcs` produk item tersebut — tidak perlu kalkulasi proporsional multi-produk, karena qty dicatat native per `order_item`.

### 7.2 Alur Sistem — Potong

1. **Rekap order selesai** → admin menandai stage "Rekap" selesai di Timeline Order (`order_stage_events.status = 'done'`). Item-item order otomatis muncul di tab "Antrian Siap Potong" di Worklog Potong.
2. **Assign** → admin pilih item dari antrian, pilih tukang potong, klik "Tugaskan". RPC `assign_cutting_item` dipanggil — fungsi ini:
   - Memvalidasi stage 'rekap' sudah 'done' (jika belum, error dengan pesan jelas).
   - Insert ke `cutting_assignments` (status `assigned`), mengisi `order_id` otomatis dari item.
   - Menggunakan `security definer` sehingga melewati RLS dengan aman.
3. **Tandai Item Selesai Dipotong** → dari tab "Sedang Dikerjakan", admin klik "Tandai Selesai", input qty aktual (boleh berbeda dari order qty jika ada kain rusak). RPC `mark_cutting_item_done`:
   - Set `order_items.cutting_completed_at` & `cutting_qty`.
   - Update `cutting_assignments.status = 'done'`.
   - **Generate otomatis** `piecework_tasks` (`task_type='cutting'`, `qty=cutting_qty`, `rate_per_unit=products.cutting_cost_per_pcs`, `status='completed'`).
4. **Status "Potong" di timeline order** dihitung otomatis: `pending` kalau belum ada item selesai, `in_progress` kalau sebagian, `done` kalau semua `order_items` order itu punya `cutting_completed_at`.
5. **Sabtu, payroll** → sama seperti jahit, otomatis tarik semua `piecework_tasks` `completed` — tanpa input manual.
6. **Susulan** — pola sama seperti jahit: kalau item baru ditandai selesai dipotong setelah payroll ditutup, tetap `status='completed'`, dibayar cash lalu ditandai manual `status='paid_manual'`.

### 7.3 UI Worklog Potong

Di halaman `/worklog`, tab "Worklog Potong" → dua sub-tab:

**Sub-tab "Assign & Potong"** dengan dua view yang bisa di-toggle:
- **Antrian Siap Potong** — daftar `order_items` dari order yang rekap-nya sudah selesai, belum punya `cutting_completed_at`, dan belum ter-assign. Menampilkan: no. order, nama item, produk, target qty, tarif borongan, estimasi upah, tombol "Tugaskan". Klik "Tugaskan" → modal pilih tukang potong + catatan opsional.
- **Sedang Dikerjakan** — daftar `cutting_assignments` dengan status `assigned`. Menampilkan: order, item, tukang potong, qty, tanggal ditugaskan, tombol "Tandai Selesai" → modal konfirmasi qty aktual + catatan.

**Sub-tab "Riwayat Potong"** — semua `cutting_assignments` dengan status `done`, tampilan laporan.

## 8. Order Milestone Timeline

Fitur di halaman **Order Detail**: stepper/timeline yang menampilkan progres order dari awal sampai selesai, sekaligus jadi tempat aksi "Tandai Siap Jahit" dan manajemen stage lainnya.

```
Quotation -> Rekap -> Potong -> Bordir -> Jahit -> Finishing -> QC -> Packaging -> Pelunasan -> Kirim
```

### 8.1 Cara tiap stage ditandai

| Stage | Cara update | Level |
|---|---|---|
| Quotation, Rekap, Pelunasan, Kirim | Manual toggle oleh admin | Order |
| **Potong** | **Otomatis terhitung** dari `order_items.cutting_completed_at` (§7.2) | Order (agregat dari item) |
| **Bordir** | Manual toggle oleh admin — begitu ditandai selesai, otomatis set `order_items.ready_for_sewing_at` untuk semua item order itu → masuk pool **Antrian Jahit** | Order |
| **Jahit** | **Otomatis terhitung** dari `sewing_assignments` (selesai kalau semua item order itu `qc_passed_qty = quantity`) | Order (agregat dari item) |
| Finishing, QC, Packaging | Manual toggle status stage (selesai/belum) + log produktivitas staf terpisah (§8.2) | Order |

### 8.2 Log Produktivitas — Finishing, QC, Packaging

Ketiganya kerja **harian** (bukan borongan, tidak masuk `piecework_tasks`), tapi tetap perlu dicatat staf & qty untuk data produktivitas.

**`stage_work_logs`**
```sql
id             uuid primary key
user_id        uuid not null references auth.users(id)
order_id       uuid not null references orders(id)
order_item_id  uuid null references order_items(id)
stage          varchar not null  -- 'finishing' | 'qc' | 'packaging'
staff_id       uuid not null references staff(id)
qty            numeric not null
logged_at      timestamptz default now()
notes          text
```
Satu stage bisa punya banyak baris log (beberapa staf boleh kerja di stage yang sama). Log ini **tidak** otomatis menandai stage "done" di timeline — status stage tetap ditoggle manual terpisah oleh admin, log-nya murni untuk laporan produktivitas.

### 8.3 Tabel pendukung timeline

**`order_stage_events`** — status & metadata tiap stage per order (sumber data stepper)
```sql
id            uuid primary key
user_id       uuid not null references auth.users(id)
order_id      uuid not null references orders(id)
stage         varchar not null  -- 'quotation'|'rekap'|'potong'|'bordir'|'jahit'|'finishing'|'qc'|'packaging'|'pelunasan'|'kirim'
status        varchar not null default 'pending'  -- 'pending' | 'in_progress' | 'done'
completed_at  timestamptz null
staff_id      uuid null references staff(id)
notes         text
updated_at    timestamptz default now()
constraint order_stage_events_unique unique (order_id, stage)
```

> **Penting — `order_stage_events` sebagai penjaga gerbang:**
> - Stage `rekap` yang `status='done'` adalah **syarat** agar item order muncul di antrian potong.
> - Stage `potong` & `jahit` disinkronkan otomatis dari data granular di `order_items`/`sewing_assignments` — bukan diklik manual oleh admin.
> - Stage lainnya diupdate manual lewat aksi toggle di UI.

### 8.4 Kebutuhan UI — Timeline

- Komponen **stepper** di Order Detail, tiap node bisa diklik untuk expand detail:
  - Node **Potong** → expand jadi list order_items dengan status assign & selesai masing-masing, plus form assign & tandai selesai.
  - Node **Bordir** → tombol "Tandai Bordir Selesai" (memicu semua item masuk pool jahit).
  - Node **Jahit** → read-only, link ke halaman "Antrian Jahit / Beban Penjahit" (§6).
  - Node **Finishing/QC/Packaging** → tombol toggle status + tombol kecil "+ Catat Log" (staf, qty) untuk `stage_work_logs`.
  - Node lain → toggle manual sederhana.

## 9. Catatan Implementasi & Hal yang Belum Dibahas

### Sudah diimplementasi (migration & UI)
- Seluruh skema tabel: `sewing_assignments`, `qc_checks`, `sewing_distribution_batches`, `cutting_assignments` (per-item), `order_stage_events`, `stage_work_logs`, kolom baru di `order_items` & `piecework_tasks`.
- RPC: `distribute_sewing_work`, `mark_ready_for_sewing`, `record_qc_check`, `assign_cutting_item`, `mark_cutting_item_done`, `start_sewing_assignment`, `start_all_sewing_assignments`, `mark_sewing_manual_paid`.
- Halaman `/worklog` lengkap: Antrian Jahit (dengan 3 status pool), Beban Penjahit (dengan tombol Mulai Jahit per bundel & per staff), Pemeriksaan QC, Susulan Cash, Worklog Potong (Antrian + Sedang Dikerjakan + Riwayat).
- Validasi rekap di `assign_cutting_item` (stage rekap harus done).
- Filter role di `distribute_sewing_work` (hanya staf role "Penjahit"/"jahit"/"sewing").

### Belum diimplementasi / langkah berikutnya
- **Laporan produktivitas** dari `stage_work_logs` (rekap mingguan/bulanan per staf) — skema sudah ada, tampilan UI belum didesain.
- **Antrian bordir** — saat ini penandaan "Bordir Selesai" masih manual toggle di timeline, belum ada tracking vendor bordir atau estimasi selesai bordir.
- **Notifikasi** ke penjahit ketika ada bundel baru yang di-assign (jika sistem nanti punya akun per karyawan).
