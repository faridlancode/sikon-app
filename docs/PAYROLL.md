# 💵 Payroll — SIKon App

Mencakup: Payroll Mingguan, Tugas Borongan, Skema Upah per Tipe, Bonus Sales, dan Susulan Cash.

**Halaman terkait:** `/payroll`

---

## 1. Gambaran Sistem Payroll

Payroll SIKon dirancang untuk **hari Sabtu** — semua komponen upah terhitung otomatis tanpa input manual:
- Penjahit & tukang potong: upah dari tugas borongan yang sudah lolos QC
- Staf absensi: upah harian × hari hadir
- Sales: gaji harian + bonus per order yang layak cair

```
Tugas borongan terbentuk otomatis
  saat potong selesai → piecework_task (cutting, completed)
  saat QC lolos      → piecework_task (sewing, completed)
                                ↓
                     Sabtu: Buat Draft Payroll
                                ↓
                       Review + Edit jika perlu
                                ↓
                         Klik "Bayar"
                       → 1 transaksi expense ke Keuangan
                       → semua piecework_tasks 'completed' → 'paid'
                       → payroll locked
```

---

## 2. Tiga Skema Upah (`wage_type`)

### 2.1 `attendance` — Upah Harian

- **Rumus:** `attendance_days × daily_rate`
- **Kalender kerja:** 6 hari (Senin–Sabtu) — aturan ini ada di frontend, bukan constraint DB
- **Berlaku untuk:** Admin, staf tetap, staf produksi non-borongan

### 2.2 `piecework` — Borongan

- **Rumus:** SUM `piecework_tasks.total_wage` yang `status = 'completed'`
- **Berlaku untuk:** Penjahit lepas, tukang potong
- **Penting:** Query pembuatan draft tidak filter tanggal — semua task `completed` yang belum pernah dibayar ikut masuk, bahkan dari minggu-minggu sebelumnya

### 2.3 `sales` — Gaji + Bonus

- **Rumus:** `daily_rate` + bonus per order yang layak cair
- **Bonus layak cair:** order berstatus `lunas` **DAN** produksinya selesai (`bonus_paid = false`)
- **Target qty:** bisa diset per periode (`sales_target_qty`)
- **Scheme di bawah target:** `none` (bonus tetap full) atau `half` (bonus dipotong 50%)

---

## 3. Struktur Data Payroll

### 3.1 `weekly_payrolls` (Header Payroll)

| Kolom | Keterangan |
|-------|-----------|
| `period_start` | Tanggal awal periode gaji |
| `period_end` | Tanggal akhir periode gaji |
| `payment_date` | Tanggal dibayar |
| `total_amount` | Total gaji semua staf |
| `sales_target_qty` | Target qty penjualan untuk periode ini |
| `sales_below_target_scheme` | `none` atau `half` |
| `status` | `draft` → `paid` |
| `transaction_id` | FK ke `transactions` (terisi saat dibayar) |

### 3.2 `payroll_items` (Detail Per Staf)

Satu baris per staf per payroll:

| Kolom | Keterangan |
|-------|-----------|
| `wage_type` | Snapshot tipe upah saat payroll dibuat |
| `attendance_days` | Jumlah hari hadir (input manual di draft) |
| `daily_rate` | Snapshot tarif harian |
| `base_amount` | Upah dasar (attendance_days × daily_rate) |
| `piecework_amount` | Total upah borongan |
| `sales_total_qty` | Total qty order sales periode ini |
| `sales_potential_bonus` | Bonus potensial sebelum scheme diterapkan |
| `sales_bonus_percentage` | Persentase bonus yang disetujui |
| `sales_bonus_amount` | Nominal bonus akhir |
| `allowances` | Tunjangan tambahan |
| `deductions` | Potongan |
| `take_home_pay` | **Gaji bersih = base + piecework + bonus + allowances - deductions** |

### 3.3 `piecework_tasks` (Tugas Borongan)

| Kolom | Keterangan |
|-------|-----------|
| `staff_id` | FK ke staf |
| `order_id` | FK ke order (opsional) |
| `task_type` | `cutting`, `sewing`, `finishing`, `other` |
| `qty` | Jumlah pcs |
| `rate_per_unit` | Tarif per pcs (snapshot saat task dibuat) |
| `total_wage` | `qty × rate_per_unit` |
| `status` | `pending` → `completed` → `paid` / `paid_manual` |
| `sewing_assignment_id` | Link ke bundel jahit (untuk task sewing) |
| `order_item_id` | Link ke item order (untuk task cutting) |
| `payroll_id` | Terisi saat diklaim oleh payroll |

---

## 4. Alur UI Payroll

### 4.1 Tab "Payroll Mingguan"

1. **Buat Draft Payroll** — sistem menghitung otomatis semua komponen
   - Ambil semua staf aktif
   - Untuk `piecework`: SUM task `completed`
   - Untuk `attendance`: hari hadir diisi 0 (admin isi manual)
   - Untuk `sales`: hitung bonus dari order yang layak

2. **Review Draft** — admin bisa:
   - Edit `attendance_days` per staf absensi
   - Edit `allowances`, `deductions`
   - Tambah catatan per staf

3. **Klik "Bayar"** → RPC `pay_weekly_payroll(payroll_id)`:
   - Tolak jika sudah `paid`
   - Cari/buat kategori "Gaji Karyawan" (expense)
   - Insert **satu** `transactions` untuk total gabungan
   - Tandai semua `piecework_tasks` `completed` → `paid`
   - Set payroll `paid` + simpan `transaction_id`

### 4.2 Tab "Pekerjaan Borongan"

- Daftar semua `piecework_tasks`
- Filter: pending, completed, paid, paid_manual
- Badge jumlah task `completed` (siap masuk payroll berikutnya)
- Tombol **Catat Tugas Borongan** — untuk input manual task `other`/`finishing`
- CRUD task: tambah, edit, ubah status, hapus

### 4.3 Tab "Riwayat Penggajian"

- Daftar semua payroll yang pernah dibuat
- Status badge: draft / paid
- Klik untuk lihat detail per staf
- Payroll draft bisa dibayar dari sini
- Payroll draft bisa dihapus (payroll paid tidak bisa dihapus)

---

## 5. Pencegahan Double Payroll

Trigger `check_payroll_period_overlap` menolak pembuatan payroll jika periodenya tumpang-tindih dengan payroll lain milik user yang sama.

---

## 6. Susulan Cash

Jika penjahit lolos QC **setelah** payroll ditutup:
- `piecework_tasks` masuk status `completed` setelah payroll yang lalu sudah `paid`
- Bayar tunai ke penjahit di luar payroll
- Di sistem: tab **Susulan Cash** di `/worklog` → "Tandai Dibayar Manual"
- Status task berubah: `completed` → `paid_manual`
- Task dengan `paid_manual` **tidak** ikut payroll berikutnya

---

## 7. Daftar RPC & Trigger Payroll

| Nama | Jenis | Fungsi |
|------|-------|--------|
| `pay_weekly_payroll(payroll_id)` | **RPC** | Bayar payroll: transaksi + klaim piecework_tasks + lock payroll |
| `mark_sewing_manual_paid(task_id)` | **RPC** | Susulan cash untuk task jahit |
| `check_payroll_period_overlap` | trigger | Tolak payroll baru jika periode tumpang-tindih |

---

## 8. Catatan Penting untuk Developer

1. **Tidak ada filter tanggal di draft payroll untuk piecework.** Semua task `completed` yang belum dibayar ikut masuk, walau dari bulan lalu. Ini **disengaja** — model susulan cash membutuhkan ini.

2. **`pay_weekly_payroll` menandai semua task `completed` milik staf piecework menjadi `paid`**, tanpa filter tanggal. Jika ada task lama yang entah kenapa belum pernah dibayar, dia otomatis ikut.

3. **Bonus sales:** flag `bonus_paid` di `orders` harus diset `true` setelah bonus dihitung, supaya order yang sama tidak dihitung dua kali di payroll berikutnya.

4. **`pay_salary` (RPC lama)** masih ada di DB berdampingan dengan `pay_weekly_payroll`. Jangan gunakan yang lama untuk fitur baru.
