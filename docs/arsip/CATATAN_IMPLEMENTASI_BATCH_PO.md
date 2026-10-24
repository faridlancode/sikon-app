# Catatan Implementasi Batch PO (serah-terima untuk agen)

> [!WARNING]
> **CATATAN REVISI:** Dokumen ini sebagian telah diamandemen oleh [REVISI_1_BATCH_PO_FLEKSIBEL.md](file:///d:/FARIDLAN/Dev/react/sikon-app/docs/rancangan/REVISI_1_BATCH_PO_FLEKSIBEL.md) (2026-10-20). Aturan siklus Senin–Minggu kaku, `get_current_po`, `ensure_po_batch`, dan penugasan PO otomatis berbasis `order_date` tidak lagi berlaku. Gunakan [REVISI_1_BATCH_PO_FLEKSIBEL.md](file:///d:/FARIDLAN/Dev/react/sikon-app/docs/rancangan/REVISI_1_BATCH_PO_FLEKSIBEL.md) sebagai rujukan utama.

- Dibuat: 2026-10-18
- Lokasi di repo: `docs/rancangan/CATATAN_IMPLEMENTASI_BATCH_PO.md`
- Tujuan: agen mana pun harus bisa melanjutkan pekerjaan hanya dari file di repo, tanpa riwayat chat.
- **Agen wajib memperbarui §9 (log progres) setiap selesai satu langkah.**

---

## 1. Urutan baca (wajib, sebelum menyentuh apa pun)

1. `AGENTS.md`
2. `docs/AGENT_INSTRUCTIONS.md`
3. `docs/README.md`, lalu `docs/ORDER_DAN_KEUANGAN.md`, `docs/PRODUKSI_DAN_WORKLOG.md` §2 dan §8, `docs/GUDANG_DAN_PURCHASING.md` §4–5, `docs/AKUNTANSI.md` §1 dan §4
4. `docs/rancangan/RANCANGAN_BATCH_PO.md` (sumber kebenaran fitur)
5. File ini
6. `git status` dan `git log -n 15 --stat`

Kalau isi file ini bertentangan dengan rancangan, **rancangan menang**, kecuali koreksi yang tercatat di §6 (yang harus ikut mengubah rancangan).

---

## 2. Aturan main (tidak boleh dilanggar)

1. **Jangan menjalankan `supabase db push`, `db reset`, atau SQL tulis ke database remote tanpa persetujuan eksplisit pemilik di chat.** Perintah baca (`migration list`, `select`) boleh. Belum dikonfirmasi apakah project `xdojtfhkflbfuwmcjpwe` (lihat `supabase/.temp/project-ref`) adalah project uji; tanyakan.
2. **Satu migration per langkah.** Tampilkan SQL-nya, berhenti, tunggu persetujuan. Migration yang sudah terpasang di remote tidak boleh diedit.
3. **Jangan menandai fase "selesai"** sebelum lulus kasus uji rancangan §7 di database sekali pakai (branch Supabase atau lokal).
4. **Pertanyaan pemblokir Q1–Q6 (rancangan §8)**: jangan menebak. Fase 1–2 boleh jalan dengan default; Fase 3 tidak boleh dimulai sebelum Q1 dijawab pemilik.
5. Logika multi-tabel di Postgres (RPC/trigger), bukan di frontend.
6. Jangan menambah dependensi frontend tanpa persetujuan. Cetak/PDF wajib lewat paginator A4 bersama yang ada (`src/utils/pdfPagination.ts`, `documentPdf.ts`, `PrintReportModal`), bukan layout aplikasi.
7. Bahasa Indonesia untuk komentar domain, pesan error, dan dokumen.
8. Menulis file SQL: simpan UTF-8 tanpa BOM; setelah menulis, cek tidak ada tanda kutip ganda yang tergandakan (`''kata''`).
9. Di akhir setiap tugas yang menyentuh UI, tulis daftar **"Yang bisa dicek di browser"** (aturan `AGENTS.md`). Jangan menulis hasil yang tampil di browser kalau tidak melihatnya langsung.
10. Bila ragu atau menemukan hal yang bertentangan dengan rancangan: berhenti dan bertanya.

---

## 3. Keputusan pemilik (ringkas; rincian di rancangan §2)

PO = dimensi analitik, bukan periode akuntansi. Tabel `po_batches` eksplisit, dibuat lazy. Bulan PO = bulan tempat hari Rabu jatuh. Zona waktu WIB. Open otomatis, close manual. Close membekukan snapshot. Gerbang produksi lewat saklar `company_settings.po_gate_production` (default `false`). Nama kolom `po_batch_id`.

**Status jawaban pertanyaan pemblokir:** belum ada yang dijawab (diisi agen di §9 bila pemilik menjawab).

---

## 4. Fakta repo yang sudah dicek (2026-10-18)

| Fakta | Cara dicek | Dampak |
|---|---|---|
| Migration terakhir: `20261018080000_accounting_r2_reports.sql` (65 migration) | `ls supabase/migrations`, `DATABASE.md` | Nomor migration PO harus lebih besar. Rencana: `20261019*` |
| `orders.order_date` default `current_date` (UTC), dan form `OrderModal.tsx` memakai `todayISO()` di frontend; `order_payments.payment_date` juga `current_date` | `20260101000002_core_financial_and_orders.sql`, `OrderModal.tsx:45` | Jebakan zona waktu (rancangan D4). Cek bahwa `todayISO()` memakai WIB, bukan UTC |
| Auto-restock kain saat order dibuat **dihitung di frontend**, di `src/hooks/useOrders.ts` (sekitar baris 185–250): kekurangan = reservasi `stock_movements` pending-out − stok, lalu insert `stock_requests` `draft_auto`, `source_type = 'auto_order'`, `source_order_id` | Baca kode | Trigger `stock_requests` BEFORE INSERT cukup untuk mengisi `po_batch_id` dari `source_order_id`; tidak perlu mengubah kode itu di v1. Ini melanggar prinsip "logika di Postgres" tetapi di luar lingkup; catat di `ARSITEKTUR_TEKNIS.md` §7 |
| Auto-restock hanya mencakup **kain** (`fabricSelections`), bukan Direct BOM | Baca kode | Dasar Q8/Q10 |
| `stock_requests` sudah punya `batch_id` (pengajuan bulk) dan `source_order_id` | Migration `20260930000002`, `20260926000001` | Pakai nama `po_batch_id` (D11) |
| Item SPJ dan supplier punya `stock_request_id` (`purchasing_report_items`, `supplier_purchase_items`) | `20260101000003_staff_warehouse_purchasing.sql` | Biaya pembelian per PO bisa diturunkan tanpa kolom baru. Satu SPJ bisa menggabung banyak pengajuan lintas PO, jadi atribusi per item, bukan per SPJ |
| `toggle_order_stage(p_order_id uuid, p_stage varchar, p_done boolean, p_notes text default null)`; definisi terakhir perlu dicari (jangan asumsikan di migration `20260929000001`, bisa sudah diganti migration lain) | `grep -n "function public.toggle_order_stage" supabase/migrations/*.sql`, ambil yang **terbaru** | Dasar Mode A dan `close_po_batch` memanggilnya untuk Rekap massal |
| Potong mensyaratkan Rekap `done` | `PRODUKSI_DAN_WORKLOG.md` §2.2, `assign_cutting_item` | Gerbang tunggal di Rekap cukup |
| Pola penjaga cascade-delete pada trigger yang membaca order induk | `20261010062000_fix_cascade_order_delete_stage_sync.sql` | Pola wajib untuk trigger `order_items` (aturan 11 rancangan) |
| `view orders_with_balance` memakai daftar kolom eksplisit; kolom baru harus di akhir | `20261008120000_order_deposit_releases.sql` (sekitar baris 407) dan `20261008110000` | `create or replace view` hanya boleh menambah kolom di akhir |
| Payroll Sabtu, kalender kerja Senin–Sabtu; `piecework_tasks.order_id` nullable | `PAYROLL.md` | Borongan tanpa `order_id` tidak terhitung di laporan PO; tampilkan sebagai "tidak terkait PO" |
| `books_start_date` akuntansi 2026-11-01 (hari Minggu, hari terakhir PO 4 Okt) | `AKUNTANSI.md` §1 | Catatan di blok rekonsiliasi laporan bulanan Oktober |
| Hari ini (2026-10-18) adalah Minggu penutup PO 2 Oktober (12–18 Okt) | Kalender | Backfill harus memperlakukan PO ini `open` bila migration jalan hari ini sebelum tengah malam WIB; PO yang `end_date` < hari ini → legacy `closed` |

| Status migration DB lokal vs remote | `supabase migration list --local` | 65 migration (hingga `20261018080000`) 100% terpasang di database lokal (port 54322). Akses remote CLI mengembalikan 403 (perlu izin/konfirmasi status project remote) |
| Definisi fungsi eksisting terkait | `supabase/migrations/` | `toggle_order_stage`: di `20260929000001` (4 param: `p_order_id`, `p_stage`, `p_done`, `p_notes`). `delete_order`: di `20261008130000`. `assign_cutting_item`: di `20260924000003`. Tombol "Konfirmasi & Ajukan" `draft_auto`: langsung `UPDATE` ke tabel `stock_requests` dari frontend (`useStockRequests.ts:206-210`), bukan via RPC |
| Zona waktu `todayISO()` di frontend | `src/utils/dateHelpers.ts` | Menggunakan waktu lokal browser klien (`d.getFullYear()`, `d.getMonth()`, `d.getDate()`). Aman jika sistem klien di WIB, namun untuk isolasi mutlak WIB perlu dipastikan tidak terpengaruh jika perangkat klien non-WIB |
| Pemakaian kolom `orders_with_balance` di frontend | `grep src/` | Seluruh pemakaian via `supabase.from("orders_with_balance").select("*")` dan diakses via key objek (properti nama), tidak ada akses berdasarkan posisi/indeks |
| `company_settings` & hook `useCompanySettings` | `src/hooks/useCompanySettings.ts` | 1 baris per user via `user_id`, diakses via `maybeSingle()`, siap ditambah kolom `po_gate_production` |
| `order_item_fabrics.usage_qty_snapshot` | `src/hooks/useOrders.ts:93, 187` | Nama kolom adalah `usage_qty_snapshot` dan nilainya **per pcs/unit**. Total kebutuhan kain = `usage_qty_snapshot × order_items.qty` |

### Belum dicek (untuk fase mendatang)

- Status remote DB project `xdojtfhkflbfuwmcjpwe` (apakah dev/uji atau production). Menunggu konfirmasi pemilik.


---

## 5. Rencana fase dan migration

Nama file migration bersifat rencana; nomor harus tetap naik. Satu migration, satu tujuan.

| Fase | Isi | Migration | UI | Boleh jalan tanpa jawaban Q1? |
|---|---|---|---|---|
| **0** | Cek DB, konfirmasi project uji, jawab "belum dicek" di §4 | — | — | Ya |
| **1a** | `po_batches`, `po_batch_events`, `po_week_info`, `ensure_po_batch`, RLS select-only, grant | `20261019090000_po_batches_core.sql` | — | Ya |
| **1b** | `orders.po_batch_id`, trigger assign, default tanggal WIB, backfill, view `orders_with_balance` (+3 kolom di akhir), `clear.sql` | `20261019100000_orders_po_batch_link.sql` | Badge PO di `/orders`, filter PO, info "Masuk ke PO …" di `OrderModal` | Ya |
| **1c** | `trg_order_items_guard_closed_po`, `close_po_batch`, `reopen_po_batch`, `get_current_po`, `list_po_batches`, saklar `po_gate_production` (default `false`), revisi `delete_order` | `20261019110000_po_batch_close_reopen.sql` | Halaman `/po` tab **PO Berjalan** + modal Tutup/Buka Kembali | Ya |
| **2** | `get_po_daily_report`, `get_po_close_report`, `get_po_monthly_report` | `20261019120000_po_reports_rpcs.sql` | Tab Laporan Harian / Close / Bulanan + cetak PDF | Ya |
| **3** | `stock_requests.po_batch_id` + trigger + backfill, `get_po_purchase_list`, gerbang Mode A di `toggle_order_stage` (stage `rekap`), gerbang tombol Konfirmasi & Ajukan | `20261019130000_po_purchasing_worklog_link.sql` | Badge/filter PO di `/worklog`, `/gudang`, `/purchasing`; urutan FIFO per PO; panel Daftar Belanja PO | **Tidak** (Q1) |
| **4** | Filter PO di `/financial`, borongan dan pembelian per PO di laporan bulanan (jika belum di Fase 2), catatan rekonsiliasi | (mungkin tanpa migration) | Filter di `TransactionFilters.tsx` | Ya |
| **5** | Lebur ke file domain, update README, `DATABASE.md`, `ARSITEKTUR_TEKNIS.md`, arsipkan rancangan | — | — | Ya |

### Perubahan frontend yang sudah bisa diperkirakan

| Area | File yang kemungkinan disentuh |
|---|---|
| Navigasi | `src/components/layout/Sidebar.tsx`, `src/App.tsx` |
| Halaman baru | `src/pages/PoPage.tsx`, `src/components/po/*`, `src/hooks/usePoBatches.ts`, `src/hooks/usePoReports.ts` |
| Order | `src/hooks/useOrders.ts`, `OrdersTable.tsx`, `OrderFilters.tsx`, `OrderDetailModal.tsx`, `OrderModal.tsx` |
| Worklog | `useCuttingWorklog.ts`, `useSewingWorklog.ts`, `CuttingAssignTab.tsx`, `SewingQueueTab.tsx` |
| Gudang/Purchasing | `StockRequestsTab.tsx`, `PurchasingPage.tsx`, `useStockRequests.ts` |
| Keuangan | `TransactionFilters.tsx`, `useTransactions.ts` |
| Tipe | `src/types.ts`, `src/integrations/supabase/types.ts` (regenerasi bila CLI tersedia, kalau tidak edit tangan dan catat) |

---

## 6. Koreksi terhadap rancangan

Belum ada. Bila agen menemukan rancangan keliru, tulis di sini: apa yang salah, bukti (nama file/baris), dan perubahan yang diusulkan, lalu berhenti dan tanya pemilik.

---

## 7. Jebakan khusus fitur ini

| Jebakan | Gejala | Pencegahan |
|---|---|---|
| `current_date` = UTC | Order dini hari Senin masuk PO Minggu lalu | Selalu `(now() at time zone 'Asia/Jakarta')::date`; ubah default kolom; tes kasus 00:30 WIB |
| Aturan bulan ditulis di dua tempat (SQL dan TypeScript) | Label bulan beda antara laporan dan UI | Aturan hanya di `po_week_info`; frontend memanggil RPC, tidak menghitung sendiri |
| Trigger guard `order_items` memblokir cascade `delete_order` | Hapus order gagal dengan pesan PO tertutup | Izinkan bila order induk tidak ditemukan |
| Guard item memblokir RPC produksi yang mengubah `order_items` | `mark_cutting_item_done`, `mark_ready_for_sewing` gagal | Guard hanya untuk kolom komersial: `product_id`, `qty`, `price` (dan insert/delete), bukan kolom timestamp produksi |
| `create or replace view` dengan kolom disisipkan di tengah | Error "cannot change name of view column" | Tambah kolom hanya di akhir |
| Overload `toggle_order_stage` | `PGRST203` | `drop function` signature lama jika parameter berubah. Jangan ubah signature bila tidak perlu: letakkan gerbang Mode A di badan fungsi |
| Backfill memicu trigger assign lalu menolak karena PO `closed` | Migration gagal di tengah | Backfill: buat PO dulu, isi `po_batch_id` dengan `update` saat trigger dinonaktifkan sementara (`alter table … disable trigger`) atau trigger memberi jalur `is_legacy`; uji di DB sekali pakai |
| Snapshot memakai `current` untuk "terbayar saat close" | Angka berubah tiap dibuka | Snapshot menyimpan nilai saat close; bagian live diberi label "per sekarang" |
| Pembelian per PO dihitung dari header SPJ | Satu SPJ lintas PO terhitung ganda | Hitung dari item (`stock_request_id`) |
| Pembayaran order lintas PO atau lintas bulan | Laporan bulanan tidak sama dengan jurnal | Blok rekonsiliasi dan label "booking" vs "diakui" |
| Seed memakai tanggal tetap | Order seed masuk PO `closed` legacy sehingga tidak bisa dicoba | `seed.sql` memakai `current_date` WIB relatif (minggu berjalan) |
| `source_type` baru ditambahkan tanpa memeriksa seed/UI | Seed gagal; label UI kosong | Tidak ada `source_type` baru di v1; bila Q10 mengubahnya, ikuti checklist `AGENT_INSTRUCTIONS` §8 |

---

## 8. Checklist akhir fitur

Selain checklist `AGENT_INSTRUCTIONS.md` §9:

- [ ] Q1–Q6 dijawab pemilik dan jawabannya tercatat di §3 file ini dan di rancangan §8
- [ ] Semua kasus uji rancangan §7 lulus (catat dicek di mana: branch/lokal/DB uji)
- [ ] `po_week_info` lulus 8 contoh tanggal di rancangan §7 plus kasus 1 Sep 2027
- [ ] Mode B (saklar `false`) tidak mengubah perilaku produksi/gudang sama sekali (bandingkan dengan sebelum migration)
- [ ] Mode A (saklar `true`) diuji pada branch, bukan data live
- [ ] `clear.sql`, `seed.sql`, `DATABASE.md` (baris migration baru), `ARSITEKTUR_TEKNIS.md` §5 dan §7 diperbarui
- [ ] `ORDER_DAN_KEUANGAN.md` memuat bagian Batch PO; `PRODUKSI_DAN_WORKLOG.md`, `GUDANG_DAN_PURCHASING.md`, `AKUNTANSI.md`, `PAYROLL.md` hanya rujukan 1–2 kalimat
- [ ] Glosarium `docs/README.md`: PO, Batch PO, bulan PO; peta route `/po`
- [ ] README root: fitur Batch PO ditambahkan hanya untuk yang benar-benar jalan
- [ ] Laporan cetak diuji pratinjau dan PDF multi-halaman
- [ ] Rancangan dipindah ke `docs/arsip/` setelah dilebur

---

## 9. Log progres (agen wajib mengisi)

| Tanggal | Agen | Langkah | Hasil | Belum dicek |
|---|---|---|---|---|
| 2026-10-18 | (perancang) | Rancangan dan catatan ditulis | Selesai, menunggu persetujuan pemilik | Semua item "Belum dicek" di §4 |
| 2026-10-18 | Antigravity | **Fase 0: Investigasi Awal & Verifikasi Fakta Repo** | Lulus. DB lokal aktif (port 54322) dengan 65 migration sinkron; definisi `toggle_order_stage`, `delete_order`, `assign_cutting_item` teridentifikasi; "Konfirmasi & Ajukan" `draft_auto` langsung update dari client; `orders_with_balance` diakses via properti (bukan indeks); `company_settings` 1 baris per user via `maybeSingle()`; kolom `usage_qty_snapshot` per pcs terverifikasi. | Status remote DB `xdojtfhkflbfuwmcjpwe` (menunggu konfirmasi pemilik); pertanyaan pemblokir Q1-Q6 |
| 2026-10-18 | Antigravity | **Fase 1a: po_batches_core & po_week_info** | File migration `20261019090000_po_batches_core.sql` dan smoke test `supabase/tests/po_batches_phase1a_smoke.sql` dibuat. Seluruh 8 kasus tanggal `po_week_info`, idempotensi `ensure_po_batch`, audit `po_batch_events`, serta RLS select-only lulus 100% di DB lokal. | Menunggu persetujuan pemilik untuk menerapkan migration ke DB (tidak diterapkan ke remote). |
| 2026-10-18 | Antigravity | **Fase 1b: orders_po_batch_link & UI Order** | Migration `20261019100000_orders_po_batch_link.sql`, smoke test `supabase/tests/po_batches_phase1b_smoke.sql`, update `clear.sql`, dan update `seed.sql` selesai. Smoke test & seed lulus di DB lokal. Helper `todayISO()` diperbaiki mengunci zona waktu WIB. UI `/orders` diperbarui dan diverifikasi langsung lewat browser: badge PO tampil di tabel pesanan & modal detail, filter dropdown 'Batch PO' aktif, info 'Masuk ke PO PO-...' tampil di modal pesanan. `npm run build` lulus. | Fase 1b selesai. |
| 2026-10-18 | Antigravity | **Fase 1c: po_batch_close_reopen & UI PO Berjalan** | File migration `20261019110000_po_batch_close_reopen.sql` dan smoke test `supabase/tests/po_batches_phase1c_smoke.sql` selesai dibuat dan diuji di DB lokal (9 skenario lulus 100%). Menu Sidebar `/po`, route di `App.tsx`, hook `usePoBatches.ts`, kartu `CurrentPoCard`, tabel `CurrentPoOrdersTable`, banner `PastOpenWarningBanner`, serta modal `ClosePoModal` & `ReopenPoModal` selesai dibuat. Tampilan diverifikasi langsung di browser pada `http://localhost:5173/po`. `npm run build` lulus. | Fase 1c selesai. |
| 2026-10-19 | Antigravity | **Fase 2: po_reports_rpcs & UI Laporan (Harian, Close, Bulanan, PDF A4)** | Migration `20261019120000_po_reports_rpcs.sql` dan smoke test `supabase/tests/po_batches_phase2_smoke.sql` lulus 100%. Komponen tab antarmuka `PoDailyReportTab`, `PoCloseReportTab`, `PoMonthlyReportTab`, template cetak A4 `PoDailyReportPrintTemplate`, `PoCloseReportPrintTemplate`, `PoMonthlyReportPrintTemplate` terintegrasi dengan `DocumentPreviewModal` paginator A4 bersama. `npm run build` berhasil (0 error). | Fase 2 selesai. |
| 2026-10-21 | Antigravity | **REVISI 1: Bagian Backend (R1) - Batch PO Fleksibel & CRUD Owner** | Migration korektif tunggal `20261020090000_po_flexible_crud.sql`, update `seed.sql`, dan smoke test `supabase/tests/po_batches_flex_smoke.sql` selesai dibuat. Seluruh 16 kasus uji lulus 100% di DB lokal (`supabase_db_xdojtfhkflbfuwmcjpwe`). Siklus `clear.sql` -> `seed.sql` berjalan mulus. RPC `create_po_batch`, `update_po_batch`, `delete_po_batch`, `list_po_batches_summary` aktif; `get_current_po` & `ensure_po_batch` berhasil dicabut; fallback trigger order tolak bila tidak ada PO terbuka; `close_po_batch`, `orders_with_balance`, `get_po_daily_report`, dan `get_po_monthly_report` diperbarui sesuai spesifikasi fleksibel. | Remote database `xdojtfhkflbfuwmcjpwe` (tidak disentuh sama sekali). |
| 2026-10-21 | Antigravity | **REVISI 1: Bagian Frontend CRUD & Order (R2)** | Tab 'Daftar PO' menggantikan 'PO Berjalan', modal tambah/edit PO (`PoBatchModal`) dengan validasi tumpang-tindih tanggal, progress bar kuota (kuning ≥90%, merah ≥100%), modal tutup PO netral (`todayISO() < end_date`), form order (`OrderModal`) dengan dropdown PO fleksibel dan auto-suggest, badge PO name di `/orders`. Build & Browser subagent lulus 100%. | Fase 3 (produksi hibrida & purchasing). |
| 2026-10-21 | Antigravity | **REVISI 1: Bagian Frontend Laporan & Cetak PDF (R3)** | Laporan Harian (`PoDailyReportTab` & `PoDailyReportPrintTemplate`) menampilkan kotak kumulatif per PO dari array `pos` dan kolom PO pada tabel order. Laporan Close (`PoCloseReportTab` & `PoCloseReportPrintTemplate`) menampilkan nama batch dan kuota dengan fallback aman untuk snapshot lama. Laporan Bulanan (`PoMonthlyReportTab` & `PoMonthlyReportPrintTemplate`) menampilkan kolom Kuota, nama PO, dan teks netral. Pratinjau PDF A4 via `DocumentPreviewModal` terverifikasi di browser. `npm run build` lulus 100%. | Fase 3a (database & smoke test). |
| 2026-10-21 | Antigravity | **Fase 3a: Database Produksi Hibrida & Purchasing Link** | Migration `20261021090000_po_gate_purchasing_link.sql` dan smoke test `supabase/tests/po_gate_purchasing_smoke.sql` selesai dibuat dan diterapkan di DB lokal. Seluruh 10 skenario lulus 100%: gerbang lunak Rekap pada saklar `po_gate_production`, `release_order_early` idempoten dengan audit event `rekap_early`, `close_po_batch` bypass lokal & skip order early, trigger `stock_requests.po_batch_id` otomatis dari order, `delete_po_batch` tolak bila punya `stock_requests`, RPC `get_po_purchase_list`, `orders_with_balance` dengan `released_early_at` di akhir, serta siklus `seed -> clear -> seed` lulus. Types TypeScript diperbarui dan `npm run build` lulus 100%. | Fase 3b (UI Produksi Hibrida, badge Lebih Awal, konfirmasi Purchasing, & Worklog). |
| 2026-10-21 | Antigravity | **Fase 3b (Bagian 1): Saklar Gerbang PO & Lepas ke Produksi Lebih Awal** | Saklar `po_gate_production` ("Produksi menunggu PO ditutup") ditambahkan di form `/perusahaan` (`CompanyProfileForm.tsx` & `useCompanySettings.ts`), komponen `ReleaseEarlyModal.tsx` dibuat dengan validasi alasan wajib dan penanganan pesan error server apa adanya, tombol "Lepas ke Produksi Lebih Awal" ditambahkan di `OrderTimeline.tsx` (node Rekap) dan tabel pesanan PO di `/po` (`CurrentPoOrdersTable.tsx`), penanganan tolakan server Rekap menampilkan pesan server dan banner tawaran "Lepas Lebih Awal", badge peringatan "Lebih Awal" (`released_early_at`) ditampilkan di `OrdersTable.tsx`, `OrderDetailModal.tsx`, `CurrentPoOrdersTable.tsx`, `CuttingAssignTab.tsx`, dan `SewingQueueTab.tsx`. `npm run build` lulus 0 error. Seluruh flow diverifikasi langsung di browser via browser subagent. | Bagian 2 (Worklog filter/urutan PO, Gudang/Purchasing konfirmasi PO open, panel Daftar Belanja PO). |
| 2026-10-21 | Antigravity | **Fase 3b (Bagian 2): Worklog, Gudang, Purchasing & Panel Daftar Belanja PO** | Antrian potong & jahit (`/worklog`) diurutkan berdasarkan `po_batches.start_date ASC` lalu `order_date ASC`, dilengkapi dropdown Filter PO dan badge nama PO, serta banner peringatan pesanan yang tertahan jika `po_gate_production` aktif. Halaman Gudang (`/gudang`) dan Purchasing (`/purchasing`) dilengkapi dropdown Filter PO, badge nama PO pada item permohonan, badge "PO belum ditutup", dan dialog konfirmasi 1 kali saat staf mengonfirmasi `draft_auto` dari PO yang masih terbuka tanpa mengunci pengajuan. Panel "Daftar Belanja PO" (`PoPurchaseListPanel.tsx`) dibuat di halaman detail PO (`/po`) memanggil RPC `get_po_purchase_list` untuk menampilkan agregat kebutuhan bahan (material, warna, qty, fulfilled, total permohonan, dan status). Catatan auto-restock ditambahkan di `docs/ARSITEKTUR_TEKNIS.md §7.3`. `npm run build` lulus 0 error dan seluruh halaman diverifikasi langsung lewat browser subagent. | Fase 3 Selesai Penuh. |
| 2026-10-21 | Antigravity | **Fase 4: Filter PO Keuangan, Atribusi Pembelian Bahan di Laporan Bulanan, & Rekonsiliasi Dinamis** | Migration `20261021110000_po_monthly_report_purchasing_link.sql` dan smoke test `po_monthly_report_phase4_smoke.sql` lulus 100%. RPC `get_po_monthly_report` menghubungkan pembelian bahan per PO langsung dari item (`purchasing_report_items` & `supplier_purchase_items` via `stock_requests.po_batch_id`), pembelian tanpa PO ditampilkan terpisah (`unlinked_material_purchases`), upah borongan tanpa order_id ditampilkan terpisah, dan catatan rekonsiliasi dibuat dinamis mendeteksi seluruh PO yang melintasi tanggal buku (`2026-11-01`). Halaman `/financial` dilengkapi filter dropdown PO dengan join `transactions -> orders.po_batch_id`, banner peringatan bahwa filter PO khusus transaksi order, dan badge PO pada baris transaksi. Jurnal, neraca, dan penutupan buku tetap 100% utuh tanpa modifikasi. `npm run build` lulus 0 error dan antarmuka diverifikasi langsung di browser. | Fase 4 Selesai Penuh. |
| 2026-10-22 | Antigravity | **Revisi Laporan Batch PO: Matriks Sales x Kategori, Sisa Pelunasan PO Terdahulu, Hapus Rekap Kain, Laporan Progres Produksi Terpisah, & Restrukturisasi Bulanan** | Migration `20261022090000_po_reports_matrix_and_progress.sql` & smoke test `po_reports_revision_smoke.sql` lulus 100%. Matriks pesanan silang Sales x Kategori (`SalesCategoryMatrixTable`) dibuat untuk Harian, Close, dan Bulanan (sesuai format referensi spreadsheet). Bagian Sisa Pelunasan PO Terdahulu yang belum lunas (`PastUnpaidPosSection`) ditambahkan di Laporan Harian. Rekap kebutuhan kain dihapus dari Laporan Close. Subview dan cetak PDF terpisah untuk Laporan Progres Produksi Fisik diurutkan dari order kuantitas terbanyak (`ORDER BY total_pcs DESC`). Laporan Bulanan ditata ulang bersih dan proporsional untuk cetak A4 portrait. `npm run build` lulus 100% (0 error). | Menunggu peninjauan pemilik di antarmuka web. |
| 2026-10-22 | Antigravity | **Revisi Laporan Batch PO: Layout Landscape, Rincian Order Piutang PO Lalu, Perbaikan Kategori Produk, & Kinerja Batch Bulanan 10 Kolom** | Migration `20261022100000_fix_po_reports_category_and_unpaid_details.sql` disetujui & diterapkan ke DB lokal. Kategori produk diperbaiki via `coalesce(oi.category_id, p.category_id)` & backfill `order_items.category_id`, serta di `OrderModal.tsx`. Rincian order belum lunas (customer, sales, qty, sisa tagihan) ditambahkan di `past_unpaid_pos` & `PastUnpaidPosSection.tsx`. Dukungan cetak & download landscape 273mm diintegrasikan ke `DocumentPreviewModal` dan `documentPdf.ts`. Tabel 'Kinerja Finansial & Operasional per Batch PO' ditata ulang dengan 10 kolom rapi dan proporsional. `npm run build` sukses 0 error. | Siap dicek pemilik di browser. |










