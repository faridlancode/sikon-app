# Rancangan: Laporan Keuangan (Laba Rugi, Neraca, Arus Kas, Perubahan Ekuitas, Catatan)

- Tanggal: 2026-10-06 (diperbarui 2026-10-07)
- Status: Disetujui (arah sudah diputuskan pemilik, lihat §2.7; baris pajak ditunda sampai ada arahan konsultan pajak, lihat §8)
- Domain pemilik: **AKUNTANSI** (file domain baru `docs/AKUNTANSI.md`, bersama `RANCANGAN_AKUNTANSI_DASAR.md`)
- Bergantung pada: `RANCANGAN_AKUNTANSI_DASAR.md` (COA, jurnal, aturan posting, pelepasan DP, tutup bulan). Dokumen ini **menggantikan** definisi laporan di dokumen itu (RPC `get_income_statement`, `get_balance_sheet`, `get_cash_flow`, `get_equity_changes`, `get_report_notes`, `get_accounting_checks`, tab "Laporan").
- Lokasi file saat disetujui: `docs/rancangan/RANCANGAN_LAPORAN_KEUANGAN.md`

> **Dasar rancangan ini.** Rancangan akuntansi dasar (dokumen induk) plus pembacaan `SummaryCards.tsx`, `useFinanceSummary.ts`, `FinancialPage.tsx`, `PayrollSlipModal.tsx` (pola cetak), `formatCurrency.ts`, `package.json` (tidak ada library ekspor Excel/PDF), `company_settings` (logo, stempel, tanda tangan).
> **Terverifikasi (2026-10-07):** Database live linked (`xdojtfhkflbfuwmcjpwe`, 35 migration sinkron 1:1 antara lokal dan remote); `AppShell`, `Sidebar`, dan `Header` tidak memiliki kelas `print:hidden`, sehingga keputusan mencetak laporan lewat modal layar penuh khusus (seperti `PayrollSlipModal.tsx`) terkonfirmasi tepat.
> **Catatan:** saya bukan akuntan atau konsultan pajak. Laporan ini ditujukan untuk **pemakaian internal** (keputusan pemilik). Bila suatu hari dipakai untuk bank, investor, atau pajak, minta akuntan memeriksa susunan laporan dan teks Catatan lebih dulu.

---

## 1. Masalah

Dokumen induk hanya menyebut "Neraca" dan "Laba Rugi" dalam dua baris. Belum ada keputusan tentang:

1. **Isi dan susunan baris** tiap laporan, dan akun mana masuk ke bagian mana.
2. **Laporan yang belum tercakup:** arus kas, perubahan ekuitas, catatan atas laporan.
3. **Status angka.** Dengan metode periodik, HPP bahan baru muncul saat tutup bulan. Selama bulan berjalan, Laba Rugi akan tampak jauh lebih untung dari sebenarnya.
4. **Angka kembar yang menyesatkan.** Kartu "Laba Bersih" di `/financial` (`SummaryCards.tsx`) sebenarnya `Σ income − Σ expense` kas (`useFinanceSummary.ts`). Begitu ada Laba Rugi akrual, dua angka "laba" yang berbeda akan membingungkan pemilik.
5. **Cara memakai:** pembanding antar periode, telusur ke buku besar, cetak dengan identitas perusahaan, dan unduh data.

Yang terdampak: pemilik/Finance sebagai pembaca laporan.

---

## 2. Keputusan

### 2.1 Paket laporan

| Kode | Laporan | Jenis periode | Fase |
|---|---|---|---|
| L1 | **Laporan Laba Rugi** | Rentang tanggal | R1 |
| L2 | **Laporan Posisi Keuangan (Neraca)** | Per tanggal | R1 |
| L3 | **Cek Konsistensi** (rekonsiliasi buku besar dengan modul operasional) | Per tanggal | R1 |
| L4 | **Laporan Arus Kas** (metode langsung) | Rentang tanggal | R2 |
| L5 | **Laporan Perubahan Ekuitas** | Rentang tanggal | R2 |
| L6 | **Catatan atas Laporan Keuangan** (otomatis) | Per tanggal | R2 |
| L7 | Tren bulanan (grafik) dan margin per order | Rentang | **Ditunda** (diputuskan nanti, tidak masuk rencana ini) |

Neraca Saldo dan Buku Besar tetap di dokumen induk (Fase A) dan dipakai sebagai halaman telusur.

R1 dapat dirilis bersama Fase B dokumen induk. Laporan **tidak menambah tabel**; semuanya dihitung dari `journal_lines`, `journal_entries`, `accounts`, dan `accounting_settings`.

### 2.2 Prinsip

1. **Dihitung di Postgres (RPC), bukan di frontend.** Frontend hanya memformat dan menampilkan (`AGENTS.md`, prinsip 1).
2. **Sumber tunggal: jurnal.** Laba Rugi, Neraca, Arus Kas, dan Perubahan Ekuitas harus saling cocok karena membaca data yang sama. Kecocokan ini diuji (§7).
3. **Setiap angka bisa ditelusuri** ke akun, lalu ke jurnal, lalu ke transaksi atau order sumbernya.
4. **Angka sementara harus terlihat sementara.** Lihat §2.4.
5. **Satu istilah, satu arti.** "Laba" hanya untuk Laba Rugi akrual. Selisih kas diberi nama "Selisih Kas".

### 2.3 Susunan Laporan Laba Rugi (L1)

Pengelompokan memakai `accounts.report_group` (dokumen induk §4.1), bukan kode akun, supaya akun buatan pemilik ikut masuk ke bagian yang benar.

| Bagian | Sumber | Contoh akun seed |
|---|---|---|
| **Pendapatan Usaha** | `account_type = revenue`, `report_group = revenue` | 4-1000 Penjualan, 4-1100 Ongkos Kirim, 4-2000 Jasa |
| **Harga Pokok Penjualan** | `expense` + `cogs` | 5-1000 HPP Bahan Baku, 5-1100 Upah Borongan |
| **LABA KOTOR** | Pendapatan − HPP. Tampil juga **margin kotor %** | |
| **Beban Operasional** | `expense` + `opex` | 6-1000 Gaji, 6-2000 Operasional, 6-3000 Sewa, 6-4000 Pemasaran, 6-5000 Utilitas, 6-6000 Penyusutan |
| **LABA USAHA** | Laba Kotor − Beban Operasional | |
| **Pendapatan/Beban Lain-lain** | `report_group = other` (pendapatan dan beban) | 4-9000 (termasuk **DP hangus**), 6-9000 |
| **LABA BERSIH** | Laba Usaha + Lain-lain. Tampil juga **margin bersih %** | |

Belum ada baris pajak penghasilan (menunggu konsultasi pemilik, §8). Akun dengan saldo tidak wajar (misal pendapatan bersaldo debit) ditampilkan negatif, bukan disembunyikan.

### 2.4 Status periode dan estimasi HPP sementara

Metode periodik (dokumen induk §2.2) berarti HPP Bahan baru diposting saat `close_accounting_period`. Untuk periode yang belum ditutup, Laba Rugi tanpa penyesuaian menampilkan HPP Bahan = 0 dan laba terlalu besar.

**Keputusan (default aktif, pemilik bisa mematikan):** laporan menghitung **estimasi** penyesuaian di memori (tidak diposting):

```
estimasi_HPP_bahan = saldo 1-1500 pada p_to  −  nilai stok fisik saat ini
nilai stok fisik   = acc_inventory_value()   (dari dokumen induk, migration 10)
                     Σ (stok efektif × materials.price), per warna lalu dijumlah;
                     rumus stok efektif: GUDANG_DAN_PURCHASING.md §3.3
```

| Kondisi | Perilaku |
|---|---|
| `p_to` berada di bulan berjalan atau sesudahnya, dan `p_to > locked_through` | Estimasi diterapkan. Baris tampil miring dengan label **"Estimasi HPP Bahan (periode belum ditutup)"**, dan seluruh laporan diberi spanduk kuning "Sementara" |
| `p_to` di bulan yang sudah lewat tetapi belum ditutup | Estimasi **tidak** dihitung (nilai stok hari ini bukan nilai stok saat itu). Spanduk: "Periode ini belum ditutup, HPP Bahan belum dihitung, laba masih terlalu besar. Tutup buku dulu" |
| `p_to ≤ locked_through` | Angka final. Spanduk hijau "Periode terkunci sampai YYYY-MM-DD" |
| Pengguna mematikan toggle estimasi | Estimasi tidak diterapkan, spanduk tetap menyebut status |

Pada Neraca, estimasi yang sama menurunkan Persediaan ke nilai stok fisik dan menurunkan Laba Tahun Berjalan dengan jumlah yang sama, sehingga Neraca tetap seimbang.

### 2.5 Komparatif

**Satu** kolom pembanding per laporan (keputusan pemilik).

| Laporan | Pilihan pembanding |
|---|---|
| Laba Rugi, Arus Kas | Tanpa; periode sebelumnya yang setara (mis. bulan lalu); periode yang sama tahun lalu; kustom |
| Neraca | Tanpa; akhir bulan lalu; akhir tahun lalu; kustom |

Kolom tambahan: **Selisih (Rp)** dan **Selisih (%)**. Persen kosong ("–") bila pembanding nol. Pembanding yang jatuh sebelum `books_start_date` (2026-11-01) ditampilkan kosong dengan keterangan "belum ada pembukuan". Artinya laporan November 2026 belum punya pembanding; pembanding bulan lalu baru tersedia mulai Desember 2026.

### 2.6 Alternatif yang ditolak

- **Menghitung laporan di frontend dari `transactions`:** mengulang masalah lama (kas, bukan akrual) dan memecah sumber kebenaran.
- **Arus kas metode tidak langsung:** perlu klasifikasi perubahan modal kerja per akun dan rekonsiliasi laba, lebih rumit dan lebih sulit dibaca pemilik non-akuntan. Metode langsung bisa diturunkan langsung dari jurnal sisi-kas.
- **Menutup bulan otomatis agar laba selalu final:** nilai stok dibutuhkan saat itu juga dan keputusan tutup buku adalah keputusan Finance.
- **Tabel snapshot laporan:** menggandakan data. Laporan cukup dihitung ulang dari jurnal (volume satu perusahaan kecil).
- **Ekspor `.xlsx` asli dan PDF langsung:** membutuhkan library baru. Tidak dipilih (§2.7).

### 2.7 Keputusan pemilik (2026-10-06)

| Topik | Keputusan |
|---|---|
| Metode arus kas | Langsung |
| Pembaca laporan | Internal saja |
| Estimasi HPP sementara | Aktif secara default, bisa dimatikan |
| Kartu "Laba Bersih" di `/financial` | Diganti label "Selisih Kas" |
| Format unduhan | CSV (bisa dibuka di Excel) + cetak ke PDF lewat browser; tanpa library baru |
| Pembanding antar periode | Satu kolom |
| Baris pajak di Laba Rugi | Perlu, dirancang **setelah** konsultasi pajak (terbuka, §8) |
| Grafik tren dan margin per order | Diputuskan nanti (ditunda dari rencana ini) |
| Tahun fiskal | Tahun kalender |
| Tanggal mulai pembukuan | 2026-11-01 (laporan pertama: November 2026) |
| Dokumentasi | File domain baru `AKUNTANSI.md` |

---

## 3. Aturan bisnis keras

1. **Neraca harus seimbang:** Total Aset = Total Liabilitas + Total Ekuitas (toleransi < Rp 1). Bila tidak, RPC tetap mengembalikan angka tetapi menandai `balanced = false` dan spanduk merah muncul. Ini tidak boleh terjadi bila jurnal selalu seimbang, jadi tanda ini adalah alarm bug.
2. **Laba Tahun Berjalan di Neraca = Laba Bersih Laba Rugi dari 1 Januari sampai tanggal Neraca.** Diuji (§7).
3. **Kas Akhir Arus Kas = Kas + Bank di Neraca pada tanggal akhir.** Diuji.
4. **Ekuitas Akhir Perubahan Ekuitas = Total Ekuitas Neraca pada tanggal akhir.** Diuji.
5. **Estimasi tidak pernah diposting dan tidak pernah memengaruhi periode terkunci.**
6. **Laporan tidak menampilkan data sebelum `books_start_date`.** Rentang yang dimulai sebelumnya dipotong ke `books_start_date` dengan keterangan.
7. **Laporan hanya membaca.** RPC laporan `stable`, tidak mengubah data.
8. **Akun `9-9999 Penampung`** ditampilkan eksplisit (tidak digabung ke akun lain) dan memicu spanduk merah selama saldonya tidak nol.
9. **Tahun fiskal = tahun kalender.**

---

## 4. Perubahan data

**Tidak ada tabel baru.** Perubahan yang dibutuhkan:

| Objek | Perubahan | Catatan |
|---|---|---|
| `accounts.is_cash`, `accounts.cash_flow_activity` | Kolom | Sudah masuk migration 1 di dokumen induk (belum ada migration-nya, jadi bukan perubahan skema yang sudah jalan) |
| Index | `journal_lines (account_id, entry_id)`, `journal_entries (user_id, entry_date)`, `journal_entries (user_id, source_type)` | Dibuat di migration R1-1 bila belum ada di migration jurnal. Perlu untuk laporan per rentang dan telusur |
| Form tambah akun | `report_group` wajib dipilih sesuai `account_type` | Supaya akun baru tidak jatuh di luar laporan (sudah di dokumen induk §6) |

### 4.1 Bentuk keluaran RPC (kontrak dengan frontend)

Semua RPC laporan mengembalikan `jsonb`:

```
{
  "meta": {
    "from": "2026-11-01", "to": "2026-11-30",
    "compare_from": null, "compare_to": null,
    "status": "locked" | "open_estimate" | "open_no_estimate",
    "locked_through": null,
    "provisional": { "applied": true, "hpp_bahan": 4000000, "reason": null },
    "clamped_from_books_start": false,
    "balanced": true
  },
  "sections": [
    { "key": "revenue", "label": "Pendapatan Usaha",
      "rows": [ { "account_id": "...", "code": "4-1000", "name": "Penjualan",
                  "amount": 9000000, "compare_amount": null, "is_estimate": false } ],
      "total": 9100000, "compare_total": null }
  ],
  "totals": { "gross_profit": 3100000, "gross_margin_pct": 34.07, "net_profit": 1600000, "net_margin_pct": 17.58 }
}
```

`amount` sudah bertanda untuk tampilan (akun kontra seperti Akumulasi Penyusutan bernilai negatif; Prive bernilai negatif di bagian ekuitas). Frontend tidak menghitung ulang total.

---

## 5. Perubahan RPC

Semua: `security definer set search_path = public`, `stable`, cek `auth.uid()` di awal, filter eksplisit `user_id = auth.uid()`, `revoke ... from public, anon`, `grant execute ... to authenticated` (`AGENT_INSTRUCTIONS.md` §1).

> **Signature final ditetapkan sekarang.** Parameter pembanding dan estimasi sudah masuk sejak versi pertama supaya tidak perlu `drop function` + overload di kemudian hari (jebakan `PGRST203`, `AGENT_INSTRUCTIONS.md` §8).

| RPC | Fase |
|---|---|
| `get_income_statement(p_from date, p_to date, p_compare_from date default null, p_compare_to date default null, p_include_provisional boolean default true)` | R1 |
| `get_balance_sheet(p_as_of date, p_compare_as_of date default null, p_include_provisional boolean default true)` | R1 |
| `get_accounting_checks(p_as_of date)` | R1 |
| `get_cash_flow(p_from date, p_to date, p_compare_from date default null, p_compare_to date default null)` | R2 |
| `get_equity_changes(p_from date, p_to date, p_include_provisional boolean default true)` | R2 |
| `get_report_notes(p_as_of date)` | R2 |

`get_monthly_pnl` (grafik tren) **tidak dibuat** di rencana ini (L7 ditunda).

### 5.1 `get_income_statement`

Σ per akun dari `journal_lines` join `journal_entries` untuk `entry_date between p_from and p_to`, user sendiri. Revenue: `credit − debit`; expense: `debit − credit`. Dikelompokkan per `report_group` sesuai §2.3. Estimasi HPP (§2.4) ditambahkan sebagai baris `is_estimate = true` pada bagian HPP bila syarat terpenuhi. Mengisi `gross_profit`, `net_profit`, dan persen margin (null bila pendapatan 0).

### 5.2 `get_balance_sheet`

Saldo akun nyata sampai `p_as_of` (`entry_date <= p_as_of`).

| Bagian | Isi | Rumus |
|---|---|---|
| **Aset Lancar** | Kas, Bank, Piutang Usaha, Uang Muka Karyawan, Persediaan, dan `9-9999` bila bersaldo | debit − kredit |
| **Aset Tetap** | Per kelas: Harga Perolehan, lalu Akumulasi Penyusutan (negatif), lalu **Nilai Buku** | debit − kredit |
| **TOTAL ASET** | | |
| **Liabilitas** | Hutang Usaha, Uang Muka Pelanggan, Hutang Lain-lain | kredit − debit |
| **Ekuitas** | Modal Disetor; **Laba Ditahan** = saldo `3-2000` + Σ laba bersih semua tahun fiskal sebelum tahun `p_as_of`; Prive (negatif); **Laba Tahun Berjalan** = Σ laba bersih 1 Jan sampai `p_as_of` (+ estimasi bila diterapkan) | |
| **TOTAL LIABILITAS + EKUITAS** | | |
| Baris kontrol | Selisih = Total Aset − Total (Liabilitas + Ekuitas). Harus 0 | |

Dengan estimasi diterapkan: Persediaan = nilai stok fisik, dan Laba Tahun Berjalan dikurangi `saldo 1-1500 − nilai stok`. Ada kartu ringkas: **Modal Kerja** (Aset Lancar − Liabilitas) dan **Rasio Lancar** (Aset Lancar ÷ Liabilitas; "–" bila liabilitas 0).

### 5.3 `get_cash_flow` (metode langsung)

Diturunkan dari jurnal yang menyentuh akun `is_cash = true`.

Langkah per jurnal (kecuali `source_type = opening_balance`):

1. `net_kas = Σ(debit − kredit)` pada baris akun kas/bank di jurnal itu.
2. Jika `net_kas = 0` (misal pemindahan Kas ↔ Bank), lewati: bukan arus kas.
3. **Aktivitas** jurnal ditentukan dari baris non-kas: bila ada akun `cash_flow_activity = investing` → Investasi; bila tidak, ada `financing` → Pendanaan; selain itu → Operasi.
4. **Baris laporan** ditentukan dari akun non-kas dengan nilai absolut terbesar di jurnal itu, dipetakan sebagai berikut. Seluruh `net_kas` jurnal masuk ke baris itu.

| Aktivitas | Baris | Akun non-kas penentu |
|---|---|---|
| Operasi | Penerimaan dari pelanggan (bersih setelah pengembalian uang) | 2-1200, 1-1300, `revenue` |
| Operasi | Pembayaran persediaan bahan | 1-1500 |
| Operasi | Pembayaran upah dan gaji | 5-1100, 6-1000 |
| Operasi | Pembayaran beban operasional lain | `expense` selain di atas |
| Operasi | Uang muka karyawan (purchasing), bersih | 1-1400 |
| Operasi | Lain-lain / belum diklasifikasi | 9-9999 dan sisanya |
| Investasi | Pembelian aset tetap | `fixed_asset`, kas keluar |
| Investasi | Hasil pelepasan aset tetap | `fixed_asset`, kas masuk |
| Pendanaan | Setoran modal (termasuk kategori Investasi) | 3-1000 |
| Pendanaan | Prive | 3-3000 |
| Pendanaan | Penerimaan/pembayaran hutang lain | 2-1300 |

Pengembalian uang pelanggan (kas keluar, lawan 2-1200) otomatis mengurangi baris "Penerimaan dari pelanggan". **DP hangus tidak muncul** karena tidak ada uang yang bergerak.

**Kas awal** = saldo Kas+Bank sebelum `p_from`, ditambah jurnal `opening_balance` bila bertanggal `p_from`. **Kas akhir** = kas awal + Σ arus kas. Harus sama dengan Kas+Bank di Neraca `p_to` (aturan keras 3).

Batas: jurnal manual yang mencampur beberapa jenis dikelompokkan ke satu baris (baris non-kas terbesar). Dicatat di §9.

### 5.4 `get_equity_changes`

| Baris | Isi |
|---|---|
| Ekuitas awal periode | Total ekuitas Neraca sehari sebelum `p_from` (tanpa estimasi); bila `p_from = books_start_date`, dari jurnal `opening_balance` |
| (+) Laba bersih periode | Dari §5.1, termasuk estimasi bila diterapkan |
| (+) Setoran modal | Kredit bersih `3-1000` periode ini |
| (−) Prive | Debit bersih `3-3000` periode ini |
| (±) Koreksi Laba Ditahan | Mutasi `3-2000` periode ini selain jurnal `opening_balance` |
| **Ekuitas akhir periode** | Jumlah di atas. Harus sama dengan Total Ekuitas Neraca `p_to` (aturan keras 4) |

### 5.5 `get_accounting_checks` (L3)

Mengembalikan array `{ code, severity (ok | warn | error), label, expected, actual, diff, hint }`. Tiap cek menunjukkan selisih, bukan hanya status.

| Kode | Cek | Severity bila gagal |
|---|---|---|
| `TB_BALANCED` | Σ debit = Σ kredit seluruh jurnal sampai tanggal | error |
| `BS_BALANCED` | Neraca seimbang | error |
| `CASH_MATCH` | Kas+Bank buku besar = `saldo_awal + Σ income − Σ expense` (sampai tanggal) | error |
| `ADV_MATCH` | 1-1400 = `Σ cash_advances.amount` berstatus `outstanding` | error |
| `CUSTOMER_ADV_MATCH` | 2-1200 = Σ untuk order yang belum `completed`: `(Σ order_payments − Σ order_deposit_releases)`, ditambah saldo awal order berjalan. Karena order yang masih memegang uang tidak bisa dihapus (dokumen induk aturan 11), selisih di sini berarti ada bug atau data yang diubah di luar alur | error |
| `INV_MATCH` | 1-1500 setelah tutup bulan = nilai snapshot `inventory_valuations` terakhir | warn |
| `SUSPENSE_ZERO` | Saldo 9-9999 = 0 | warn |
| `TX_JOURNALED` | Tidak ada `transactions` bertanggal ≥ `books_start_date` tanpa jurnal | error |
| `ORDER_REVENUE` | Tiap order `completed` (tanggal kirim ≥ `books_start_date`) punya jurnal `order_revenue` | error |
| `FORFEIT_JOURNALED` | Tiap pelepasan `forfeit` (tanggal ≥ `books_start_date`) punya jurnal `order_forfeit` | error |
| `PAYROLL_SPLIT` | Tiap `weekly_payrolls` berstatus `paid` bertanggal ≥ `books_start_date` punya jurnal `payroll_split` | warn |
| `ABNORMAL_BALANCE` | Daftar akun bersaldo tidak wajar (mis. Kas bersaldo kredit) | warn |
| `PERIOD_STALE` | Ada bulan lewat yang belum ditutup | warn |

### 5.6 `get_report_notes` (L6)

Mengembalikan data rincian untuk Catatan: Kas dan Bank per akun; Persediaan per kategori material (dari `inventory_valuations.detail` terakhir bila ada, kalau tidak dihitung saat ini dan ditandai estimasi); Uang Muka Pelanggan per order (kode order, pelanggan, jumlah bersih); Uang Muka Karyawan per staf (dari `cash_advances`); jadwal aset tetap (perolehan awal, tambahan, pelepasan, akumulasi, nilai buku); Hutang. Teks kebijakan akuntansi tetap ada di frontend (konstanta), bukan di database.

---

## 6. Perubahan UI

Tab **Laporan** di `/akuntansi`. Komponen di `src/components/accounting/reports/`, hook `useFinancialStatements.ts` (satu fungsi per RPC; parameter periode di state halaman). Tipe di `src/types.ts` mengikuti bentuk §4.1.

### 6.1 Bilah kontrol (sama di semua laporan)

- **Periode:** Bulan ini, Bulan lalu, Kuartal ini, Tahun berjalan, Tahun lalu, Kustom (Neraca: satu tanggal).
- **Bandingkan dengan:** sesuai §2.5.
- Toggle **Sertakan estimasi HPP** (default aktif; hanya tampil bila relevan menurut §2.4).
- Tombol **Cetak** dan **Unduh CSV**.

### 6.2 Spanduk status (selalu di atas laporan)

| Status | Warna | Teks |
|---|---|---|
| `locked` | hijau | "Periode terkunci sampai YYYY-MM-DD. Angka final." |
| `open_estimate` | kuning | "Sementara. HPP bahan diperkirakan dari nilai stok saat ini (Rp X)." |
| `open_no_estimate` | kuning | "Periode belum ditutup. HPP bahan belum dihitung, laba masih terlalu besar." + tombol **Tutup Buku** |
| `balanced = false` | merah | "Neraca tidak seimbang. Hubungi developer." |
| Saldo `9-9999` ≠ 0 | merah | "Ada transaksi belum diklasifikasi (Rp X)." + tautan ke daftar |

### 6.3 Perilaku laporan

- **Laba Rugi:** tiga kartu di atas tabel (Pendapatan, Laba Kotor + margin %, Laba Bersih + margin %). Bagian bisa dilipat. Klik baris akun membuka **laci Buku Besar** (`get_general_ledger`) untuk periode yang sama; klik jurnal membuka sumbernya.
- **Neraca:** dua kolom (Aset | Liabilitas + Ekuitas) di layar lebar, bertumpuk di ponsel. Kartu Modal Kerja dan Rasio Lancar. Klik baris akun membuka Buku Besar dari `books_start_date` sampai tanggal Neraca.
- **Arus Kas:** tiga bagian (Operasi, Investasi, Pendanaan), lalu Kenaikan/Penurunan Kas Bersih, Kas Awal, Kas Akhir. Teks bantu di bawah: "Kenapa laba berbeda dari arus kas?" yang menjelaskan selisih persediaan dan uang muka.
- **Perubahan Ekuitas:** satu tabel §5.4.
- **Catatan:** bagian bernomor (Umum, Kebijakan Akuntansi, Rincian Akun, Peristiwa Penting). Nama, alamat, periode dari `company_settings`.
- Tabel lebar memakai `overflow-x-auto` (ponsel). Angka rata kanan, `tabular-nums`, format `formatIDR`; negatif dalam tanda minus merah.

### 6.4 Cetak dan unduh

- **Cetak:** laporan dibuka dalam **modal layar penuh** seperti `PayrollSlipModal.tsx` (kelas `print:*` dan `window.print()`), bukan mencetak halaman, karena belum dicek apakah `Sidebar`/`Header` memakai `print:hidden`. Kop: logo, nama, alamat dari `company_settings`; judul, periode; blok tanda tangan memakai `signature_url` dan `stamp_url` yang sudah ada. Pengguna memilih "Simpan sebagai PDF" di dialog cetak browser.
- **CSV:** dibuat di browser tanpa dependensi baru. Pemisah `;`, UTF-8 dengan BOM (agar terbaca benar di Excel berlokal Indonesia), angka mentah tanpa simbol mata uang. Satu file per laporan, kolom: Bagian, Kode, Akun, Jumlah, Pembanding, Selisih.
- Tidak ada `.xlsx` asli dan tidak ada library baru (keputusan pemilik).

### 6.5 Perubahan di halaman lama

| Berkas | Perubahan | Alasan |
|---|---|---|
| `SummaryCards.tsx` | Label "Laba Bersih" menjadi **"Selisih Kas"**, hint "Pemasukan − pengeluaran kas, bukan laba akuntansi". Setelah Kas/Bank dipisah, "Total Uang di Bank" menjadi **"Total Kas & Bank"** | Hindari dua angka "laba" |
| `FinancialPage.tsx` | Tautan kecil "Lihat Laporan Laba Rugi" bila akuntansi aktif | Jalan pintas, tidak mengubah logika |
| `useFinanceSummary.ts` | Tidak diubah (nama variabel `netProfit` dibiarkan; hanya label yang berubah) | Menghindari perubahan lebar untuk label |

Dashboard (`/dashboard`) tidak diubah di rancangan ini.

---

## 7. Kasus uji

### 7.1 Skenario acceptance: November 2026 (angka dihitung tangan, harus cocok persis)

Mulai pembukuan 2026-11-01. Semua kas lewat Bank.

| # | Peristiwa | Jurnal |
|---|---|---|
| 0 | Saldo awal | Dr Bank 20.000.000, Dr Persediaan 10.000.000 / Cr Laba Ditahan 30.000.000 |
| 1 | DP order A | Dr Bank 5.000.000 / Cr Uang Muka Pelanggan 5.000.000 |
| 2 | Beli kain (Direct Supplier) | Dr Persediaan 6.000.000 / Cr Bank 6.000.000 |
| 3 | Payroll 3.000.000 (borongan 2.000.000) | Dr Upah Borongan 2.000.000, Dr Gaji 1.000.000 / Cr Bank 3.000.000 |
| 4 | Bayar listrik | Dr Utilitas 500.000 / Cr Bank 500.000 |
| 5 | Pelunasan order A | Dr Bank 4.100.000 / Cr Uang Muka Pelanggan 4.100.000 |
| 6 | Order A dikirim (`total_price` 9.000.000 + ongkir 100.000) | Dr Uang Muka Pelanggan 9.100.000 / Cr Penjualan 9.000.000, Cr Ongkir 100.000 |
| 7 | Tutup bulan: stok fisik Rp 12.000.000, saldo Persediaan 16.000.000 | Dr HPP Bahan 4.000.000 / Cr Persediaan 4.000.000 |

**Hasil yang diharapkan per 2026-11-30:**

| Laporan | Angka |
|---|---|
| **Laba Rugi** | Pendapatan 9.100.000 (Penjualan 9.000.000 + Ongkir 100.000). HPP 6.000.000 (Bahan 4.000.000 + Upah Borongan 2.000.000). **Laba Kotor 3.100.000 (margin 34,07%)**. Beban Operasional 1.500.000 (Gaji 1.000.000 + Utilitas 500.000). **Laba Bersih 1.600.000 (margin 17,58%)** |
| **Neraca** | Aset: Bank 19.600.000 + Persediaan 12.000.000 = **31.600.000**. Liabilitas: 0 (Uang Muka Pelanggan sudah 0). Ekuitas: Laba Ditahan 30.000.000 + Laba Tahun Berjalan 1.600.000 = **31.600.000**. Selisih 0 |
| **Arus Kas** | Operasi: penerimaan pelanggan +9.100.000, pembayaran persediaan −6.000.000, pembayaran upah −3.000.000, beban operasional lain −500.000 = **−400.000**. Investasi 0, Pendanaan 0. Kas awal 20.000.000 → kas akhir **19.600.000** |
| **Perubahan Ekuitas** | Awal 30.000.000 + laba 1.600.000 = **31.600.000** |

Penjelasan yang harus tampil di Arus Kas: laba +1.600.000 tetapi kas operasi −400.000, selisih 2.000.000 karena persediaan naik dari 10 juta ke 12 juta (belanja kain lebih besar dari pemakaian).

### 7.2 Status periode dan estimasi

1. Sebelum langkah 7 (belum tutup bulan) di bulan berjalan: toggle estimasi aktif → HPP Bahan estimasi 4.000.000 (16.000.000 − 12.000.000), baris miring, spanduk kuning, Laba Bersih 1.600.000 sama dengan setelah tutup. Toggle mati → HPP Bahan 0, Laba Kotor 7.100.000, spanduk "belum dihitung".
2. Estimasi aktif di Neraca: Persediaan 12.000.000, Laba Tahun Berjalan 1.600.000, tetap seimbang.
3. Bulan lalu yang belum ditutup: estimasi tidak dihitung (spanduk kuning dengan tombol Tutup Buku).
4. Setelah tutup bulan: spanduk hijau, tidak ada baris estimasi.

### 7.3 Pengembalian uang dan DP hangus

5. Tambahan di skenario §7.1: order B dengan DP Rp 5.000.000 dibatalkan pelanggan; Rp 3.000.000 dikembalikan lewat Bank, Rp 2.000.000 dihanguskan. Efek: Bank −3.000.000, Pendapatan Lain-lain +2.000.000, Uang Muka Pelanggan order B = 0. Laba Rugi menampilkan **Pendapatan Lain-lain 2.000.000** di bagian Lain-lain dan Laba Bersih naik 2.000.000. Arus Kas: baris "Penerimaan dari pelanggan (bersih setelah pengembalian)" naik 5.000.000 (DP) dan turun 3.000.000 (refund) = bersih +2.000.000; **DP hangus tidak muncul** sebagai arus kas. Neraca tetap seimbang dan `CUSTOMER_ADV_MATCH` tetap `ok`.

### 7.4 Kecocokan antarlaporan (uji otomatis di DB dev)

6. Laba Bersih Laba Rugi 1 Jan sampai T = Laba Tahun Berjalan Neraca pada T (tanpa estimasi, dan dengan estimasi).
7. Kas Akhir Arus Kas = Kas+Bank Neraca.
8. Ekuitas Akhir Perubahan Ekuitas = Total Ekuitas Neraca.
9. Neraca seimbang pada setiap akhir bulan skenario, termasuk setelah satu jurnal manual dan satu jurnal pembalik.

### 7.5 Batas dan penolakan

10. Rentang dimulai sebelum `books_start_date` (2026-11-01): dipotong, `clamped_from_books_start = true`, keterangan tampil.
11. Pembanding sebelum pembukuan (mis. Oktober 2026 untuk laporan November): kolom kosong, tidak error, persen "–".
12. Pemindahan Bank → Kas (jurnal manual): tidak muncul di Arus Kas; Kas+Bank total tidak berubah.
13. Pembelian aset tetap 6.000.000 tunai: Arus Kas Investasi −6.000.000; Neraca menampilkan Harga Perolehan, Akumulasi, Nilai Buku.
14. Pemasukan kategori `Investasi` Rp 10.000.000: Arus Kas Pendanaan "Setoran modal" +10.000.000; Laba Rugi tidak berubah; Ekuitas bertambah di Modal Disetor.
15. Transaksi tanpa kategori Rp 100.000: saldo 9-9999, spanduk merah, `SUSPENSE_ZERO` warn, Arus Kas masuk "Lain-lain / belum diklasifikasi".
16. Akun buatan pemilik `report_group = opex`: otomatis muncul di Beban Operasional.
17. Pendapatan 0: margin "–", tidak ada pembagian dengan nol; Liabilitas 0: Rasio Lancar "–".
18. Akuntansi belum aktif: tab Laporan menampilkan ajakan mengaktifkan, tidak error.
19. Panggilan RPC laporan oleh pengguna lain / tanpa login: ditolak (`Tidak terautentikasi`), tidak ada kebocoran data antar akun.
20. CSV dibuka di Excel lokal Indonesia: kolom terpisah benar, karakter Indonesia utuh, angka terbaca sebagai angka.
21. Cetak: kop memuat logo/nama; tanda tangan dan stempel tampil bila diunggah; tabel tidak terpotong di A4.

### 7.6 Cek Konsistensi

22. Pada data skenario §7.1 dan §7.3: semua cek `ok`. Hapus satu pembayaran order di bulan terbuka lewat `delete_order_payment` (yang belum dilepas DP-nya): cek tetap `ok`.
23. Insert jurnal langsung dari klien tidak mungkin (dicabut), jadi `TX_JOURNALED` dan `FORFEIT_JOURNALED` hanya bisa gagal bila trigger error; uji dengan menonaktifkan trigger di DB dev lalu memastikan cek menjadi `error`.

---

## 8. Yang masih terbuka

1. **Baris pajak di Laba Rugi.** Pemilik menyatakan perlu, dan akan dirancang setelah konsultasi dengan konsultan pajak. Tidak menghalangi R1/R2. Bila jawabannya ada, kemungkinan yang perlu ditambah: akun beban pajak (dokumen induk §4.3), bagian "Beban Pajak" di §2.3 (antara Laba Sebelum Pajak dan Laba Bersih), dan penyesuaian kasus uji. Sementara itu pemilik bisa menambah akun beban sendiri.

Grafik tren bulanan dan margin per order bukan pertanyaan terbuka, melainkan **ditunda** (§2.7); kalau nanti dikerjakan, dirancang sebagai rancangan terpisah.

---

## 9. Keterbatasan yang disengaja

- **Laba Rugi bulan yang belum ditutup bersifat sementara**, dan estimasi hanya tersedia untuk bulan berjalan (nilai stok diambil saat ini).
- **Persediaan dinilai pada harga beli terakhir** (warisan dokumen induk), jadi angka HPP bahan sensitif terhadap perubahan harga bahan.
- **Tidak ada Barang Dalam Proses**, sehingga HPP bulan tertentu bisa tinggi saat banyak bahan sudah keluar gudang tetapi barang belum dikirim.
- **Arus kas jurnal campuran** (jurnal manual yang mencampur beberapa jenis aktivitas) dikelompokkan ke satu baris, yaitu baris non-kas terbesar.
- **Tidak ada laporan per departemen/proyek/sales**, dan tidak ada konsolidasi multi-entitas.
- **Belum ada pajak** (menunggu konsultasi) dan tidak ada multi-mata uang.
- **Laporan pertama baru November 2026**; tidak ada data historis sebelum `books_start_date`.
- **Tahun fiskal tetap tahun kalender.**

---

## 10. Rencana migration (nomor mengikuti aturan AGENT_INSTRUCTIONS.md §1, harus > 20261006120000)

Dijalankan **setelah migration 10** di dokumen induk (`..._accounting_period_close_inventory`), karena estimasi HPP memakai fungsi `acc_inventory_value` yang dibuat di sana.

| # | Nama (usulan, timestamp diisi saat dibuat) | Fase | Isi |
|---|---|---|---|
| R1-1 | `..._accounting_report_helpers` | R1 | Index laporan (§4), fungsi internal saldo akun per tanggal. Tidak membuat ulang `acc_inventory_value`. Tanpa GRANT ke `authenticated` |
| R1-2 | `..._accounting_income_statement_balance_sheet` | R1 | `get_income_statement`, `get_balance_sheet` (signature final §5) |
| R1-3 | `..._accounting_consistency_checks` | R1 | `get_accounting_checks` |
| R2-1 | `..._accounting_cash_flow_equity` | R2 | `get_cash_flow`, `get_equity_changes` |
| R2-2 | `..._accounting_report_notes` | R2 | `get_report_notes` |

**Tidak ada tabel baru**, jadi `supabase/clear.sql` tidak berubah dari dokumen ini. `supabase/seed.sql` sudah tercakup (jurnal contoh di dokumen induk); tambahkan satu jurnal contoh per jenis laporan agar halaman Laporan tidak kosong, dan **cek ulang nilai constraint**.

**Dampak ke berkas lain (checklist `AGENT_INSTRUCTIONS.md` §9):**
- `supabase/DATABASE.md`: baris migration baru; jumlah migration; tidak ada perubahan jumlah tabel dari dokumen ini.
- `docs/ARSITEKTUR_TEKNIS.md`: tidak ada tabel baru; catat di §7 bahwa kartu "Laba Bersih" di `/financial` diganti label.
- `docs/README.md`: glosarium (Laba Rugi, Neraca, Arus Kas, Perubahan Ekuitas, Estimasi HPP Sementara, Selisih Kas).
- **`docs/AKUNTANSI.md`** (baru, bersama dokumen induk): satu bagian Laporan Keuangan yang menyalin keputusan §2, bukan seluruh SQL; tabel "Daftar RPC" diperbarui.
- `README.md` (root): daftar fitur setelah benar-benar jalan.
- Frontend: `SummaryCards.tsx` (label), `FinancialPage.tsx` (tautan), komponen dan hook baru, tipe di `src/types.ts`, regenerasi `integrations/supabase/types.ts`.
