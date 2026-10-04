# 🧵 Produksi & Worklog — SIKon App

Mencakup: Timeline Produksi Order, Worklog Potong, Worklog Jahit, QC, dan Susulan Cash.

**Halaman terkait:** `/worklog` dan modal detail order di `/orders`

---

## 1. Tujuan & Prinsip

Tujuan sistem produksi: **di hari gajian (Sabtu) tidak ada input manual upah**. Upah borongan terbentuk otomatis dari kejadian nyata di lantai produksi.

| Pertanyaan | Keputusan |
|-----------|-----------|
| Qty jahit dianggap sah dan dibayar kapan? | **Setelah lolos QC**, bukan saat penjahit selesai menjahit |
| Sisa kerjaan belum QC saat gajian? | Dibayar sesuai qty yang sudah lolos QC. Sisa lanjut ke **penjahit yang sama** minggu depan |
| QC reject? | Tidak dibayar sampai diperbaiki dan lolos QC ulang oleh penjahit yang sama |
| Lolos QC setelah payroll ditutup? | **Susulan cash** — dibayar tunai di luar payroll, sistem mencatat status `paid_manual` |
| Upah potong dihitung kapan? | Saat item **ditandai selesai dipotong** (event-driven per item) |

---

## 2. Timeline Produksi (Order Milestone)

### 2.1 Sepuluh Tahap

```
Quotation → Rekap → Potong → Bordir → Jahit → Finishing → QC → Packaging → Pelunasan → Kirim
```

Data di tabel `order_stage_events`:
- `unique(order_id, stage)` — satu baris per tahap per order
- `status`: `pending` / `in_progress` / `done`
- `completed_at`, `staff_id`, `notes`

### 2.2 Cara Setiap Tahap Berubah

| Tahap | Cara Berubah | Gate |
|-------|-------------|------|
| Quotation | Toggle manual admin | — |
| **Rekap** | Toggle manual admin | **Wajib `done`** sebelum item bisa masuk antrian potong |
| **Potong** | **Otomatis** dari data potong | Ada assignment = `in_progress`; semua item selesai = `done` |
| Bordir | Toggle manual admin | Saat `done` → otomatis isi `order_items.ready_for_sewing_at` semua item |
| **Jahit** | **Otomatis** dari `sewing_assignments` | Ada assignment = `in_progress`; semua `completed` = `done` |
| Finishing | Toggle manual + log produktivitas | — |
| QC | Toggle manual + log produktivitas | — |
| Packaging | Toggle manual + log produktivitas | — |
| **Pelunasan** | Toggle manual | **Ditolak** jika `remaining_amount > 0` |
| **Kirim** | Toggle manual | **Ditolak** jika `remaining_amount > 0` |

### 2.3 Log Produktivitas (Finishing, QC, Packaging)

Dicatat di `stage_work_logs` per hari:
- `stage`, `staff_id`, `qty`, `logged_at`
- Banyak staf bisa mencatat di stage yang sama
- Log **tidak** otomatis menandai stage `done` — itu tetap toggle manual

### 2.4 UI Stepper di Order Detail

Tiap node bisa di-expand:
- **Rekap/Quotation:** toggle sederhana
- **Potong:** daftar item + form assign + tombol selesai per item
- **Bordir:** tombol "Tandai Bordir Selesai"
- **Jahit:** read-only, link ke halaman worklog
- **Finishing/QC/Packaging:** toggle + "Catat Log Kerja Harian"
- **Pelunasan/Kirim:** toggle dengan peringatan merah jika belum lunas

---

## 3. Worklog Potong

### 3.1 Alur End-to-End

```
1. Rekap order = done
   → item muncul di "Antrian Siap Potong" di tab Worklog Potong

2. Admin tugaskan item ke tukang potong
   RPC: assign_cutting_item(order_item_id, staff_id)
   → validasi: rekap harus = done (error jelas jika belum)
   → insert cutting_assignments (status: 'assigned')
   → satu item aktif = satu assignment (unique order_item_id)

3. Gudang serahkan kain ← GATE WAJIB
   RPC: dispatch_cutting_materials(cutting_assignment_id, ...)
   → validasi stok keras (kurang = error, tidak ada bypass)
   → catat stock_movements 'out'
   → set cutting_assignments.material_dispatched_at

4. Tukang potong memotong → Admin "Tandai Selesai"
   RPC: mark_cutting_item_done(cutting_assignment_id, qty_aktual)
   → set order_items.cutting_completed_at + cutting_qty
   → cutting_assignments → 'done'
   → AUTO-INSERT piecework_tasks:
     task_type: 'cutting'
     qty: qty_aktual
     rate_per_unit: products.cutting_cost_per_pcs
     status: 'completed' (langsung bisa masuk payroll)
```

### 3.2 Gate Kain

`mark_cutting_item_done` ditolak jika:
- `material_dispatched_at` kosong **DAN** item punya kain di `order_item_fabrics`

**Override Supervisor:** ada opsi "Paksa Selesai" dengan alasan wajib.

### 3.3 Status Stage Potong (Otomatis)

| Kondisi | Stage Potong |
|---------|-------------|
| Belum ada assignment | `pending` |
| Ada assignment `assigned`/`in_progress`, atau sebagian item selesai | `in_progress` |
| Semua `order_items` punya `cutting_completed_at` | `done` |

### 3.4 UI Tab Worklog Potong

- Sub-tab **Assign & Potong:** toggle "Antrian Siap Potong" / "Sedang Dikerjakan"
- Sub-tab **Riwayat Potong:** log semua penugasan yang selesai

---

## 4. Worklog Jahit

### 4.1 Tabel yang Dipakai

| Tabel | Fungsi |
|-------|--------|
| `sewing_distribution_batches` | Jejak audit setiap "Bagikan Kerja" |
| `sewing_assignments` | **Bundel:** satu potongan qty dari satu order item untuk satu penjahit |
| `qc_checks` | Riwayat setiap pemeriksaan QC per bundel |
| `order_items` | Kolom baru: `ready_for_sewing_at`, `cutting_completed_at`, `cutting_qty` |
| `piecework_tasks` | Tugas borongan yang terbentuk saat lolos QC |

### 4.2 Kolom Penting `sewing_assignments`

| Kolom | Keterangan |
|-------|-----------|
| `order_item_id` | FK ke order item |
| `staff_id` | FK ke penjahit |
| `assigned_qty` | Qty yang dialokasikan (tetap) |
| `sewn_qty` | Qty yang sudah dijahit penjahit (monitoring, opsional) |
| `qc_passed_qty` | Kumulatif qty lolos QC — **ini dasar perhitungan bayar** |
| `qc_rejected_qty` | Kumulatif qty ditolak QC |
| `applied_sewing_rate` | Tarif upah jahit (snapshot saat bundel dibuat) |
| `status` | `assigned` → `in_progress` → `completed` |
| `material_dispatched_at` | Gate: bahan dari gudang sudah diserahkan |
| `notes` | Catatan, termasuk `[PAKSA MULAI: ...]` jika ada override |

Bundel `completed` ketika `qc_passed_qty = assigned_qty`.

### 4.3 Alur End-to-End Jahit

```
1. Bordir selesai → item masuk pool jahit (ready_for_sewing_at terisi)
   RPC: mark_ready_for_sewing(order_item_id)

2. Admin "Bagikan Kerja" → RPC distribusi (lihat §4.4)
   Hanya penjahit aktif: wage_type='piecework', is_active=true, role mengandung "Penjahit"/"jahit"/"sewing"

3. Gudang serahkan bahan per bundel ← GATE
   (lihat GUDANG_DAN_PURCHASING.md §6)

4. "Mulai Jahit" per bundel atau "Mulai Semua"
   RPC: start_sewing_assignment(id) — tolak jika bahan belum diserahkan
   RPC: start_all_sewing_assignments(p_staff_id) — lewati bundel yang belum dapat bahan

5. Penjahit kerja → opsional update sewn_qty

6. Finishing (fisik, tanpa tracking per staf)

7. QC per bundel
   RPC: record_qc_check(sewing_assignment_id, passed_qty, rejected_qty)
   → simpan qc_checks
   → update kumulatif qc_passed_qty / qc_rejected_qty di bundel
   → jika passed_qty > 0:
     AUTO-INSERT piecework_tasks (task_type: 'sewing', status: 'completed')
   → jika rejected_qty > 0:
     bundel kembali ke in_progress (penjahit yang sama rework)
   → jika qc_passed_qty = assigned_qty:
     bundel → completed

8. Sabtu: payroll menjumlahkan semua piecework_tasks 'completed'
```

### 4.4 Algoritma Distribusi Jahit

**v1 — Distribusi Rata (sudah jalan, `distribute_sewing_work`):**
- Pool semua item dibagi rata ke semua penjahit aktif
- Kuota: `base = floor(pool / n)`, sisa ke penjahit dengan beban terkecil
- Satu order_item bisa dipecah ke beberapa penjahit

**v2 — Dua Jalur (sudah terpasang di UI, diverifikasi di `src/hooks/useSewingWorklog.ts` dan `src/components/worklog/SewingQueueTab.tsx`):**

| Aspek | Prioritas (qty ≥ 6) | Satuan (qty < 6) |
|-------|---------------------|-----------------|
| Unit kerja | Per order utuh | Pool gabungan lintas order |
| Jumlah penjahit | `min(3, max(1, floor(qty/5)))` | Semua penjahit aktif |
| Minimum per orang | 5 pcs | 1 pcs |
| Pemilihan penjahit | Fair queue: `last_priority_assigned_at ASC` | Semua |
| RPC | `distribute_priority_sewing_order(order_id, ...)` | `distribute_sewing_work` (dimodifikasi) |

Tombol di UI: "⚡ Bagikan Otomatis (N Orang)" untuk mode otomatis, modal `ManualSewingAssignModal` untuk mode supervisor manual. Keduanya memanggil `distribute_priority_sewing_order` dengan parameter berbeda (`p_manual_staff_ids`/`p_manual_quotas` kosong untuk otomatis, terisi untuk manual).

**Fair queue prioritas:**
- Setelah dibagikan: update `staff.last_priority_assigned_at` dan `priority_orders_count`
- Penjahit yang belum pernah dapat order prioritas → urutan pertama berikutnya

**Mode ganda:**
- *Otomatis:* "Bagikan Otomatis" sesuai algoritma
- *Manual Supervisor:* modal "Tugaskan Manual" — pilih penjahit, isi alokasi pcs bebas

### 4.5 Tarif Jahit & Surcharge Satuan

```
Tarif aktual (order satuan)    = sewing_cost_per_pcs + sewing_satuan_surcharge
Tarif aktual (order prioritas) = sewing_cost_per_pcs
```

- `sewing_satuan_surcharge` default Rp10.000/pcs, diatur di profil perusahaan
- Tarif di-**snapshot** ke `sewing_assignments.applied_sewing_rate` saat bundel dibuat
- Mengubah master tidak mengubah tarif bundel yang sudah dibagikan

---

## 5. QC (Quality Control)

### 5.1 Alur QC

1. Pilih bundel yang statusnya `in_progress`
2. Input qty lolos dan qty reject
3. RPC `record_qc_check(...)`:
   - Simpan ke `qc_checks`
   - Update kumulatif di `sewing_assignments`
   - Qty lolos → buat `piecework_tasks` (status: `completed`)
   - Qty reject → bundel kembali `in_progress` untuk rework
   - Jika total lolos = assigned_qty → bundel `completed`

### 5.2 QC Berkali-kali

`qc_checks` bisa punya banyak baris per bundel (tiap pemeriksaan = satu baris baru). Berguna untuk analisis reject rate per penjahit.

---

## 6. Susulan Cash

Ketika penjahit baru lolos QC **setelah** payroll mingguan ditutup:
- `piecework_tasks` sudah dalam status `completed` tapi tidak ikut payroll yang lalu
- Admin ke tab **Susulan Cash** → "Tandai Dibayar Manual"
- **RPC:** `mark_sewing_manual_paid(task_id, notes)`
- Status berubah ke `paid_manual` → task tidak akan ikut payroll berikutnya lagi

---

## 7. Peta UI Halaman `/worklog`

| Tab | Fungsi | RPC Utama |
|-----|--------|-----------|
| **Antrian Jahit** | Pool item siap jahit. Bagikan kerja (otomatis/manual) | `distribute_sewing_work`, `distribute_priority_sewing_order` |
| **Beban Penjahit** | Per penjahit: assigned/lolos QC/reject, progress bar, reject rate. Tombol Mulai Jahit | `start_sewing_assignment`, `start_all_sewing_assignments` |
| **Pemeriksaan QC** | Pilih bundel in_progress, input lolos/reject | `record_qc_check` |
| **Susulan Cash** | Tasks completed yang belum masuk payroll → tandai dibayar manual | `mark_sewing_manual_paid` |
| **Worklog Potong** | Assign & Potong (antrian + sedang dikerjakan) + Riwayat | `assign_cutting_item`, `mark_cutting_item_done` |

---

## 8. Daftar RPC & Trigger

| Nama | Jenis | Fungsi |
|------|-------|--------|
| `assign_cutting_item` | RPC | Tugaskan item ke tukang potong |
| `mark_cutting_item_done` | RPC | Tandai selesai potong + buat piecework_task |
| `dispatch_cutting_materials` | RPC | Serah kain dari gudang ke tukang potong |
| `mark_ready_for_sewing` | RPC | Masukkan item ke pool jahit |
| `distribute_sewing_work` | RPC | Bagi kerja jahit rata (v1 / satuan v2) |
| `distribute_priority_sewing_order` | RPC | Bagi order prioritas dengan fair queue (v2) |
| `start_sewing_assignment` | RPC | Mulai jahit satu bundel (dengan gate check) |
| `start_all_sewing_assignments` | RPC | Mulai semua bundel satu penjahit |
| `record_qc_check` | RPC | Catat QC + buat piecework_task |
| `mark_sewing_manual_paid` | RPC | Susulan cash — tandai dibayar manual |
| `sync_potong_stage` | trigger | Sinkron status timeline Potong dari data aktual |
| `sync_jahit_stage` | trigger | Sinkron status timeline Jahit dari data aktual |
| `calculate_order_type` | function | Satuan/prioritas dari total qty |

---

## 9. Yang Belum Diimplementasi

| Fitur | Status |
|-------|--------|
| Laporan produktivitas dari `stage_work_logs` | Skema ada, UI belum didesain |
| Antrian bordir / tracking vendor bordir | Belum ada |
| Notifikasi ke penjahit untuk bundel baru | Butuh akun login per karyawan |

> **Koreksi:** draft dokumen ini sebelumnya menulis "distribusi jahit v2 checklist UI belum selesai" — itu sudah tidak akurat. Dicek langsung ke `src/`: `distribute_priority_sewing_order` dipanggil dari `useSewingWorklog.ts` dan ada tombolnya di `SewingQueueTab.tsx`. v2 **sudah berjalan**, lihat §4.4.
