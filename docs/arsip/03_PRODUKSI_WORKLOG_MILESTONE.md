# 03 — Produksi: Worklog Potong & Jahit, QC, Timeline Order

Rangkuman dari: `DESAIN_WORKLOG_JAHIT`, `RANCANGAN_PEMBAGIAN_WORKLOG_v2`, `RANCANGAN_HARGA_PRODUK_DAN_JAHIT` (bagian tarif jahit), bagian milestone dari `DESAIN_MATERIAL_GUDANG_HPP_DAN_ORDER_STATUS`, dan bagian gate check dari dua dokumen gate check.

Halaman terkait: **`/worklog`** (tab Antrian Jahit, Beban Penjahit, Pemeriksaan QC, Susulan Cash, Worklog Potong) dan **Order Detail** (stepper timeline).

---

## 1. Tujuan dan keputusan bisnis

Tujuan: di hari gajian (Sabtu) **tidak ada input manual upah** di payroll. Upah borongan terbentuk otomatis dari kejadian nyata di lantai produksi.

| Pertanyaan | Keputusan |
|---|---|
| Qty jahit dianggap sah dan dibayar kapan? | **Setelah lolos Finishing → QC**, bukan saat penjahit selesai menjahit |
| Sisa kerjaan belum QC saat gajian? | Dibayar sesuai qty yang **sudah lolos QC**. Sisa lanjut ke **penjahit yang sama** minggu depan (tidak dibagi ulang) |
| QC reject? | Tidak dibayar sampai diperbaiki dan lolos QC ulang oleh penjahit yang sama |
| Lolos QC setelah payroll ditutup? | **Susulan cash**: dibayar tunai di luar payroll, sistem hanya mencatat status (`paid_manual`) |
| Dasar pembagian jahit (v1) | Rata **jumlah pcs**, bukan rata Rp. Penjahit yang kebagian produk bertarif mahal otomatis berpenghasilan lebih. Ini trade-off yang disadari; algoritma sengaja modular |
| Upah potong dihitung kapan? | Saat item **ditandai selesai dipotong** (event-driven, bukan setoran mingguan) |

---

## 2. Timeline order (milestone)

### 2.1 Sepuluh tahap
```
Quotation → Rekap → Potong → Bordir → Jahit → Finishing → QC → Packaging → Pelunasan → Kirim
```
Data di `order_stage_events` (`unique(order_id, stage)`, status `pending`/`in_progress`/`done`, `completed_at`, `staff_id`, `notes`).

| Tahap | Cara berubah |
|---|---|
| Quotation, Rekap, Pelunasan, Kirim | Manual toggle admin |
| **Potong** | **Otomatis** dari data potong (lihat 2.2) |
| **Bordir** | Manual toggle. Begitu `done`, otomatis set `order_items.ready_for_sewing_at` untuk semua item order → masuk pool **Antrian Jahit** |
| **Jahit** | **Otomatis** dari `sewing_assignments` (lihat 2.2) |
| Finishing, QC, Packaging | Manual toggle + log produktivitas (2.4) |

`order_stage_events` juga berfungsi sebagai **penjaga gerbang**: tahap `rekap = done` adalah syarat agar item muncul di antrian potong.

### 2.2 Sinkronisasi status Potong dan Jahit (perbaikan dari bug lama)
Bug lama: trigger `sync_potong_stage` / `sync_jahit_stage` hanya melihat kolom "selesai" (`cutting_completed_at`, qty lolos), sehingga status tetap "Belum Dimulai" padahal pekerjaan sudah dibagikan dan berjalan.

Aturan yang benar:

| Stage | `pending` | `in_progress` | `done` |
|---|---|---|---|
| Potong | Belum ada penugasan potong | Ada assignment `assigned`/`in_progress`, **atau** sebagian item sudah selesai dipotong | Semua `order_items` punya `cutting_completed_at` |
| Jahit | Belum ada `sewing_assignments` | Ada assignment `assigned`/`in_progress` | Semua assignment `completed` |

### 2.3 Satu sumber kebenaran status + gate pelunasan
*Status: sudah ada di migration `20260929000001` (`toggle_order_stage`).*
- Stepper milestone adalah acuan progres. `orders.production_status` **diturunkan otomatis**: Packaging selesai = `ready` ("Siap Kirim"), Kirim selesai = `completed`. Tombol manual "Tandai Siap Kirim" tidak diperlukan.
- **Gate ketat di database:** menandai **Pelunasan atau Kirim** selesai ditolak kalau `remaining_amount > 0` (dari `orders_with_balance`), dengan pesan "Pesanan belum lunas (sisa tagihan: Rp X)...". Di UI tombol dikunci dengan peringatan merah.
- Bordir selesai otomatis mengisi `order_items.ready_for_sewing_at` untuk semua item order.

### 2.4 Log produktivitas (Finishing, QC, Packaging)
Kerja harian, **bukan borongan** (tidak masuk `piecework_tasks`). Tetap dicatat siapa dan berapa pcs di `stage_work_logs` (`stage`, `staff_id`, `qty`, `logged_at`). Banyak staf boleh mencatat di stage yang sama. Log **tidak** otomatis menandai stage `done`; itu tetap toggle manual.

### 2.5 UI stepper di Order Detail
Tiap node bisa di-expand: **Potong** (daftar item + form assign/selesai), **Bordir** (tombol "Tandai Bordir Selesai"), **Jahit** (read-only, link ke worklog), **Finishing/QC/Packaging** (toggle + "+ Catat Log"), lainnya toggle sederhana.

---

## 3. Worklog Potong

### 3.1 Alur
```
Rekap order = done
   └► item muncul di "Antrian Siap Potong"
Admin: Tugaskan ke tukang potong  ── RPC assign_cutting_item (security definer)
   • validasi stage rekap = done (kalau belum: error jelas)
   • insert cutting_assignments (status 'assigned'), 1 item = 1 assignment aktif (unique order_item_id)
GUDANG: serahkan kain ── RPC dispatch_cutting_materials   ◄── GATE
   • validasi stok keras (kurang = error), catat stock_movements 'out', set material_dispatched_at
Tukang potong memotong → Admin: Tandai Selesai ── RPC mark_cutting_item_done(qty aktual)
   • set order_items.cutting_completed_at + cutting_qty (boleh beda dari qty order kalau ada kain rusak)
   • cutting_assignments → 'done'
   • AUTO-INSERT piecework_tasks: task_type 'cutting', rate = products.cutting_cost_per_pcs, status 'completed'
```
- Granularitas **per item**, bertahap. Stage "Potong" order = `done` kalau semua item selesai.
- Tarif tetap per item dari `products.cutting_cost_per_pcs` (tidak perlu hitung proporsional multi-produk).
- Susulan: kalau selesai setelah payroll ditutup → sama seperti jahit (`paid_manual`).

### 3.2 Gate kain (`material_dispatched_at`)
*Status: **menunggu review & approval**.*
- Masalah: tukang potong bisa menandai selesai sebelum kain dikeluarkan gudang, sehingga stok tidak sinkron dengan fisik.
- `mark_cutting_item_done` ditolak kalau `material_dispatched_at` kosong **dan** item punya kain di `order_item_fabrics`. Ada "Paksa Selesai (Supervisor)" dengan alasan wajib.
- UI `CuttingAssignTab`: badge oranye "⏳ Menunggu Kain dari Gudang" + tombol "Tandai Selesai" disabled; setelah kain keluar badge hijau "✓ Kain Diterima (Siap Potong)".

### 3.3 UI
Sub-tab **Assign & Potong** (toggle Antrian Siap Potong / Sedang Dikerjakan) dan **Riwayat Potong**.

---

## 4. Worklog Jahit

### 4.1 Tabel
| Tabel | Fungsi |
|---|---|
| *(legacy)* `cutting_weekly_reports`, `cutting_report_lines` | Desain potong setoran-mingguan yang sudah digantikan. **Sengaja tidak di-drop** (migration `20260924000001`), masih ada di DB dan di `clear.sql`. Fungsi lama `assign_cutting_order` dan `submit_cutting_report` juga masih ada. Jangan dipakai untuk fitur baru. |
| `sewing_distribution_batches` | Jejak audit tiap "Bagikan Kerja" (`pool_qty_total`, `staff_count`, + `distribution_mode` auto/manual, `target_order_type`, `target_order_id`) |
| `sewing_assignments` | **Bundel**: satu potongan qty dari satu order_item untuk satu penjahit. Kolom: `assigned_qty` (tetap), `sewn_qty` (monitoring), `qc_passed_qty` (kumulatif, **dasar bayar**), `qc_rejected_qty`, `status` (`assigned`/`in_progress`/`completed`), `applied_sewing_rate`, `material_dispatched_at`, `notes` |
| `qc_checks` | Riwayat tiap pemeriksaan QC per bundel (`passed_qty`, `rejected_qty`). Bisa berkali-kali kalau rework. Berguna untuk reject rate per penjahit |
| `order_items` (kolom baru) | `ready_for_sewing_at`, `cutting_completed_at`, `cutting_qty` |
| `piecework_tasks` (kolom baru) | `sewing_assignment_id`, `order_item_id`, `manual_paid_at`, `manual_paid_note`; status bertambah `paid_manual` |

Bundel `completed` ketika `qc_passed_qty = assigned_qty`.

### 4.2 Alur end-to-end
1. **Bordir selesai** → item masuk pool (`ready_for_sewing_at` terisi, RPC `mark_ready_for_sewing`).
2. **Bagikan Kerja** (manual admin) → RPC pembagian (4.3). Hanya penjahit aktif: `wage_type = 'piecework'`, `is_active`, role mengandung "Penjahit"/"jahit"/"sewing".
3. **Bahan diserahkan Gudang** per bundel (02 §6) → `material_dispatched_at` terisi. **Gate:** "Mulai Jahit" disabled sebelum ini.
4. **Mulai Jahit** → bundel `in_progress` (`start_sewing_assignment` per bundel, `start_all_sewing_assignments` per penjahit; yang belum dapat bahan dilewati).
5. Penjahit kerja; `sewn_qty` opsional.
6. **Finishing** (fisik, tanpa tracking per staf).
7. **QC per bundel** → RPC `record_qc_check(passed, rejected)`:
   - simpan `qc_checks`, update kumulatif di bundel;
   - `passed_qty > 0` → insert `piecework_tasks` (`sewing`, `qty = passed`, `rate_per_unit = applied_sewing_rate`, fallback `products.sewing_cost_per_pcs`, `status = 'completed'`);
   - `rejected_qty > 0` → bundel kembali `in_progress` menunggu rework penjahit yang sama;
   - semua lolos → `completed`.
8. **Sabtu: payroll** menjumlahkan `piecework_tasks` `completed` (lihat 01 §6).
9. **Susulan:** tab "Susulan Cash" → "Tandai Dibayar Manual" (`mark_sewing_manual_paid`) → `paid_manual`. Karena payroll hanya menjumlah `completed`, baris ini otomatis tidak ikut lagi.

### 4.3 Algoritma pembagian

**v1 (sudah jalan, `distribute_sewing_work`):** semua pool dibagi rata ke semua penjahit aktif.
- Kuota: `base = floor(pool / n)`, sisa `pool mod n` diberikan ke penjahit dengan **beban berjalan terkecil** (beban = Σ(`assigned_qty − qc_passed_qty`) bundel belum selesai).
- Pool disusuri urut tanggal order lama → baru, satu order_item boleh **dipecah** ke beberapa penjahit.
- Masalah: order partai besar terbagi tipis (30 pcs ÷ 10 penjahit = 3 pcs/orang) sehingga sering ganti setelan mesin dan benang.

**v2 (disetujui, checklist belum dicentang):** dua jalur berdasarkan kategori order.

| | **Prioritas** (total qty ≥ 6) | **Satuan** (total qty < 6) |
|---|---|---|
| Unit kerja | Per order utuh | Pool satuan gabungan lintas order |
| Jumlah penjahit | `min(3, max(1, floor(qty / 5)))` → 6–9 pcs: 1 orang; 10–14: 2 orang; ≥15: 3 orang. **Minimal 5 pcs/orang** | **Semua** penjahit aktif, dibagi rata (minimal 1 pcs kalau cukup) |
| Pemilihan penjahit | **Fair queue**: `last_priority_assigned_at ASC NULLS FIRST`, lalu beban berjalan terendah | Semua |
| Tarif | Standar | Standar + surcharge satuan (4.4) |
| RPC | `distribute_priority_sewing_order(order_id, manual_staff_ids?, manual_quotas?, notes?)` | `distribute_sewing_work` (dimodifikasi) |

- Multi-item campuran (kemeja + celana) dalam satu order: kuota dibagi berurutan ke penjahit terpilih.
- Setelah dibagikan: update `staff.last_priority_assigned_at` dan `priority_orders_count` supaya penjahit yang belum kebagian jadi urutan pertama di order prioritas berikutnya.
- **Mode ganda:** *Otomatis* ("Bagikan Otomatis") atau *Manual Supervisor* (modal "Tugaskan Manual": pilih penjahit sendiri, mis. spesialis jaket, dan alokasi pcs bebas, `ManualSewingAssignModal.tsx`).

Kasus uji dari dokumen: 7 pcs → 1 penjahit; 12 pcs → 2 penjahit (6/6); 30 pcs → 3 penjahit (10 masing-masing); order prioritas berikutnya harus memilih penjahit berbeda (rotasi adil).

### 4.4 Tarif jahit dan surcharge satuan
- Master: `products.sewing_cost_per_pcs`.
- Surcharge satuan global (default **Rp10.000/pcs**), diatur di profil perusahaan (`sewing_satuan_surcharge`; **nama tabel perlu dicek**, lihat 00 §6 no. 2).
```
Tarif aktual (satuan)    = sewing_cost_per_pcs + sewing_satuan_surcharge
Tarif aktual (prioritas) = sewing_cost_per_pcs
```
- Tarif aktual **di-snapshot** ke `sewing_assignments.applied_sewing_rate` saat bundel dibuat, lalu menjadi `piecework_tasks.rate_per_unit` saat lolos QC. Mengubah master tidak mengubah tarif bundel yang sudah dibagikan.
- Kategori order (`order_type`) dan harga jual dibahas di 01 §5.

### 4.5 Gate bahan sebelum mulai jahit
*Status: disetujui, siap implementasi.* Ringkas:

| Kondisi | Tampilan di kartu bundel | Tombol |
|---|---|---|
| Produk tanpa BOM direct | (tidak ada badge) | Mulai Jahit aktif |
| Ada BOM, bahan belum diserahkan | `⏳ Menunggu Bahan Gudang` (amber) | Mulai Jahit **disabled** + tooltip, muncul "⚠ Paksa Mulai" |
| Bahan sudah diserahkan | `✓ Bahan Diterima • tgl jam` (hijau) | Aktif |
| Override supervisor (`[PAKSA MULAI:` di notes) | `⚠ Override Supervisor` (merah) | — |

"Mulai Semua" memberi umpan balik jumlah yang dilewati dan opsi "Paksa Mulai Semua yang Dilewati?". Tab Gudang "Bahan Jahit" menyembunyikan bundel yang sudah `material_dispatched_at`.

Kasus uji: mulai tanpa bahan (ada BOM) = error; tanpa BOM = sukses; paksa tanpa alasan = error; 3 sudah dispatch + 2 belum di "Mulai Semua" = 3 dimulai, 2 dilewati.

---

## 5. Peta UI `/worklog`

| Tab | Fungsi | RPC utama |
|---|---|---|
| **Antrian Jahit** | Pool item siap jahit. Status pool: 🟡 menunggu distribusi, 🔵 sebagian, 🟢 sudah dibagikan. Filter. (v2: section **Prioritas** per kartu order + section **Satuan** gabungan) | `distribute_sewing_work`, `distribute_priority_sewing_order` |
| **Beban Penjahit** | Per orang: assigned / lolos QC / reject, progress bar, reject rate. Tombol Mulai Jahit (per bundel dan "Mulai Semua (N)") | `start_sewing_assignment`, `start_all_sewing_assignments` |
| **Pemeriksaan QC** | Pilih bundel `in_progress`, input lolos/reject | `record_qc_check` |
| **Susulan Cash** | `piecework_tasks` `completed` yang belum masuk payroll → tandai dibayar manual | `mark_sewing_manual_paid` |
| **Worklog Potong** | Assign & Potong (antrian + sedang dikerjakan) + Riwayat | `assign_cutting_item`, `mark_cutting_item_done` |

---

## 6. Belum dikerjakan (menurut dokumen sumber)
- **Laporan produktivitas** dari `stage_work_logs` (skema ada, UI belum didesain).
- **Antrian bordir:** penandaan "Bordir selesai" masih toggle manual, belum ada tracking vendor atau estimasi selesai.
- **Notifikasi** ke penjahit untuk bundel baru (butuh akun login per karyawan).

---

## 7. Daftar cepat: RPC & trigger

| Nama | Jenis | Fungsi |
|---|---|---|
| `assign_cutting_item` | RPC | Tugaskan item ke tukang potong (validasi rekap done) |
| `mark_cutting_item_done` | RPC | Selesai potong + buat `piecework_tasks` (dengan gate kain) |
| `mark_ready_for_sewing` | RPC | Masukkan item ke pool jahit |
| `distribute_sewing_work` | RPC | Bagi kerja jahit (v1 / satuan v2) |
| `distribute_priority_sewing_order` | RPC | Bagi order prioritas (v2) |
| `start_sewing_assignment`, `start_all_sewing_assignments` | RPC | Mulai jahit + gate |
| `record_qc_check` | RPC | Catat QC + buat `piecework_tasks` |
| `mark_sewing_manual_paid` | RPC | Susulan cash |
| `sync_potong_stage`, `sync_jahit_stage` | trigger | Sinkron status timeline dari data granular |
| `calculate_order_type` | function | Satuan/prioritas dari total qty |
