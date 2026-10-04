# AGENT_INSTRUCTIONS — Aturan Kerja & Cara Memelihara Dokumentasi

Berlaku untuk semua yang mengubah repo SIKon: developer, AI agent, maupun junior yang baru menerima legacy code.

Prinsip utama: **satu fitur = satu tempat di dokumentasi.** Jangan menulis hal yang sama secara lengkap di dua file. Kalau dua domain sama-sama menyinggung satu fitur, satu domain jadi pemilik (tulis lengkap di sana), domain lain cukup satu-dua kalimat + rujukan.

> Pelajaran nyata: versi awal dokumentasi ini menulis "Timeline Produksi (Milestone)" lengkap dua kali — di `ORDER_DAN_KEUANGAN.md` dan `PRODUKSI_DAN_WORKLOG.md` — dan keduanya sudah mulai berbeda isi (satu punya kolom "Gate", satu tidak) sebelum sempat dipakai. Itu kenapa aturan ini ditulis tegas, bukan basa-basi.

---

## 1. Aturan kode

1. **Update `README.md`** (root, bukan `docs/README.md`) kalau menambah fitur atau mengubah logika bisnis. Isinya fitur yang *benar-benar jalan*. Persiapan struktur yang belum ada UI-nya masuk "Catatan", bukan daftar fitur.
2. **Migration**
   - Setiap perubahan skema (tabel, kolom, function, constraint, RLS, grant) = file baru di `supabase/migrations/`.
   - Nama: `<YYYYMMDDHHMMSS>_<deskripsi_snake_case>.sql`. Nomor harus lebih besar dari migration terakhir.
   - **Jangan edit migration lama.** Buat file baru walau hanya 1 kolom.
   - Idempotent (`if not exists`, `drop ... if exists`, `create or replace`).
   - 1 migration = 1 tujuan. Nama file harus sesuai isi.
   - Kalau mengganti signature function (tambah parameter), `drop function` versi lama dulu — kalau tidak, terjadi overloading dan PostgREST menolak dengan `PGRST203`. Ini pernah terjadi pada `create_supplier_purchase`.
   - Tabel baru: aktifkan RLS dengan pola `auth.uid() = user_id`. Cek apakah perlu `GRANT` eksplisit (lihat `ARSITEKTUR_TEKNIS.md` §2.2) atau sudah cukup lewat `alter default privileges`.
   - RPC untuk frontend: `security definer set search_path = public`, cek `auth.uid()` di awal, lalu `revoke ... from public, anon` dan `grant execute ... to authenticated`.
3. **`supabase/clear.sql`**: tabel baru wajib masuk `TRUNCATE`.
4. **`supabase/seed.sql`**: kalau skema berubah, sesuaikan juga. Data contoh alur kerja berhenti di status "siap diproses" supaya tombol aksi bisa langsung dicoba. **Setelah migration apa pun yang mengubah constraint, cek apakah nilai di seed masih valid** — ini pernah bolong: `seed.sql` memakai `source_type` `'initial'`/`'purchasing'` yang sudah lama tidak ada di constraint, dan baru ketahuan saat dicek manual, bukan dari error yang pernah dilaporkan.
5. **Tes**: jalankan `clear.sql` lalu `seed.sql` di DB dev sebelum menyatakan selesai. Kalau ada akses Supabase connector, pakai itu untuk cek langsung: `list_migrations` (migration yang benar-benar jalan di DB vs file lokal), `list_tables` (jumlah baris nyata, apakah data live cocok dengan ekspektasi seed), atau `execute_sql` (cek nilai kolom/constraint tanpa harus menjalankan seed dulu). Jangan jalankan `clear.sql`/`seed.sql`/migration ke project yang datanya sedang dipakai orang lain tanpa izin — pertimbangkan `create_branch` dulu untuk project berbayar.
6. **Ragu soal aturan bisnis? Berhenti dan tanya pemilik.** Jangan menebak (contoh: kapan bonus sales cair, SPJ vs supplier).
7. **Logika multi-tabel ada di Postgres (RPC/trigger), bukan di frontend.** Tidak ada backend server, jadi atomicity harus dijaga di database.
8. **Kode mati:** kalau menghapus/mengganti RPC, cari dulu apakah masih ada hook/komponen frontend yang memanggilnya (`grep -rn "nama_rpc" src/`). Kalau ada yang masih memanggil RPC yang sudah dihapus dari DB tapi tidak pernah diimpor di mana pun (dead code), catat di `ARSITEKTUR_TEKNIS.md` §7.2 dan pertimbangkan dihapus — jangan dibiarkan menumpuk.

---

## 2. Peta dokumentasi

| File | Isi | Masuk sini kalau fiturnya tentang... |
|---|---|---|
| `docs/README.md` | Peta, alur besar satu halaman, peta route, 3 prinsip utama, glosarium | Selalu diupdate kalau ada domain baru atau istilah baru |
| `docs/MASTER_DATA.md` | Produk + BOM + HPP, Material + varian warna + multi-UOM, Staf, Sales, Perusahaan, Kategori | Produk, material, staf, sales, profil perusahaan, kategori |
| `docs/ORDER_DAN_KEUANGAN.md` | Order, item order, pembayaran, transaksi, dashboard | Order, uang masuk/keluar, laporan keuangan |
| `docs/GUDANG_DAN_PURCHASING.md` | Stok, restock, SPJ, Direct Supplier, barang keluar, retur | Gudang, pembelian, stok material |
| `docs/PRODUKSI_DAN_WORKLOG.md` | Timeline milestone (pemilik utama), potong, jahit, QC, susulan cash | `/worklog`, status produksi, tarif borongan |
| `docs/PAYROLL.md` | Payroll mingguan, skema upah, susulan cash | Penggajian |
| `docs/ARSITEKTUR_TEKNIS.md` | Stack, pola DB, RLS/GRANT, storage, daftar tabel, known issues | Infrastruktur, setup DB baru, bug yang sudah diketahui |
| `supabase/DATABASE.md` | **Satu-satunya** daftar lengkap migration (nama file, isi, urutan), cakupan seed/clear | Setiap ada migration baru — update di sini, jangan duplikasi daftarnya ke `ARSITEKTUR_TEKNIS.md` |
| `docs/arsip/` | Dokumen desain/rancangan lama (isi SQL lengkap, histori keputusan) + versi `00_BACA_DULU`/`01`–`03` yang sudah digantikan struktur ini | Tidak diupdate rutin. Rujukan sejarah saja |

**Kalau fitur menyentuh dua domain** (contoh: timeline milestone memengaruhi baik Order/Keuangan maupun Produksi), pilih satu domain sebagai pemilik berdasarkan **siapa yang mengubah datanya**, bukan siapa yang paling sering membacanya. Timeline dimiliki `PRODUKSI_DAN_WORKLOG.md` karena stage Potong/Jahit disinkronkan dari data produksi; `ORDER_DAN_KEUANGAN.md` hanya menyebut efeknya ke gate pelunasan/kirim dalam 1-2 paragraf + rujukan `lihat PRODUKSI_DAN_WORKLOG.md §2`.

**Kapan boleh membuat file baru di `docs/`?** Hampir tidak pernah. Tujuh file di atas (README + 6 domain) sudah mencakup seluruh aplikasi. Satu-satunya alasan bikin file baru: domain operasional yang benar-benar baru (bukan sekadar sub-fitur dari yang sudah ada). Kalau begitu, daftarkan di tabel struktur dokumen `docs/README.md`.

---

## 3. Dua kategori perubahan

| Jenis | Contoh | Yang diupdate |
|---|---|---|
| **Kecil**: bug fix, kolom baru, tweak aturan | Fix `approve_stock_request_supplier`, tambah `preferred_store` | Langsung ke file domain + `ARSITEKTUR_TEKNIS.md` §7 (known issues) + `supabase/DATABASE.md` (baris migration baru). Tanpa file rancangan terpisah |
| **Besar**: alur baru, tabel baru, mengubah aturan bisnis | Gate check bahan, retur cacat, multi-UOM | Tulis rancangan dulu di `docs/rancangan/`, minta persetujuan, implementasi, **lalu lebur ke file domain** (§5) |

---

## 4. Langkah saat fitur ditambah atau diubah

Lakukan berurutan. Tandai sendiri tiap langkah sebelum menyatakan pekerjaan selesai.

1. **Baca dulu** `docs/README.md`, lalu file domain yang relevan, lalu bagian "Known Issues" di `ARSITEKTUR_TEKNIS.md` §7. Cek apakah fitur ini sudah ada, atau ada masalah terbuka yang menyentuhnya. Kalau ragu status sebenarnya di DB (apakah migration sudah jalan, apakah seed valid), **cek langsung ke Supabase connector** kalau tersedia, jangan hanya percaya file migration lokal.
2. **Kode & SQL** sesuai §1 (migration baru, `clear.sql`, `seed.sql`, `README.md` root).
3. **Update SATU file domain pemilik fitur.** Jangan menambah bagian paralel di file domain lain — cukup satu-dua kalimat + rujukan kalau domain lain perlu menyinggungnya.
   - Aturan lama yang sudah tidak berlaku: **hapus atau ganti**, jangan dibiarkan dengan tulisan "dulu begitu".
   - Kalau perilakunya berubah dari dokumen sebelumnya, tulis satu kalimat alasan ("Menggantikan alur lama karena ...").
4. **Update tabel "Daftar RPC/Trigger"** di akhir file domain yang bersangkutan.
5. **Update `ARSITEKTUR_TEKNIS.md`**:
   - §5 (Daftar Tabel Database): tambah tabel baru ke kategori yang sesuai.
   - §6a (Status Verifikasi): kalau baru saja mengecek sesuatu lewat Supabase connector, catat temuannya.
   - §7 (Known Issues): tambahkan temuan baru; **pindahkan** yang sudah selesai ke bagian "sudah diperbaiki" atau hapus barisnya.
6. **Update `supabase/DATABASE.md`**: tambah baris migration baru (nomor, nama file, isi singkat), perbarui cakupan seed kalau berubah.
7. **Update `docs/README.md`** kalau ada istilah baru (glosarium) atau route baru (peta halaman).
8. **Cocokkan**: nama function, kolom, status, dan nilai constraint di docs harus persis sama dengan SQL. Kalau ragu, `grep` di migration **dan** di `src/` — dokumentasi yang hanya mengandalkan migration tanpa cek frontend pernah salah (contoh: menulis "v2 belum di-UI-kan" padahal sudah dipanggil dari hook dan ada tombolnya).
9. **Ringkas ke pengguna** apa yang berubah di kode dan di docs, dan apa yang **tidak** sempat dicek.

---

## 5. Alur untuk perubahan besar (file rancangan)

1. Buat `docs/rancangan/RANCANGAN_<TOPIK>.md` dari template di bawah. Status awal: `Menunggu persetujuan`.
2. Setelah disetujui: ubah status jadi `Disetujui`, implementasi.
3. Setelah migration dan UI selesai: **lebur isinya ke SATU file domain pemilik** (cukup keputusan, alur, aturan keras, tabel/kolom, RPC; tanpa menyalin seluruh isi fungsi SQL).
4. Pindahkan file rancangan ke `docs/arsip/`.

### Template rancangan

```markdown
# Rancangan: <judul singkat>

- Tanggal: YYYY-MM-DD
- Status: Menunggu persetujuan | Disetujui | Selesai (sudah dilebur ke <file> §<bagian>)
- Domain pemilik: MASTER_DATA | ORDER_DAN_KEUANGAN | GUDANG_DAN_PURCHASING | PRODUKSI_DAN_WORKLOG | PAYROLL

## 1. Masalah
Apa yang salah / belum ada, dan siapa yang terdampak. 2–5 kalimat.

## 2. Keputusan
Apa yang dipilih, dan **kenapa** (termasuk alternatif yang ditolak).

## 3. Aturan bisnis keras
Daftar singkat. Hal yang tidak boleh dilanggar (gate, validasi, siapa boleh apa).

## 4. Perubahan data
Tabel/kolom/constraint baru atau berubah. Snapshot apa yang disimpan.

## 5. Perubahan RPC / trigger
Nama, parameter, perilaku, status yang diterima/dihasilkan.

## 6. Perubahan UI
Halaman/tab, tombol, badge, pesan error.

## 7. Kasus uji
Skenario sukses, ditolak, dan batas.

## 8. Yang belum diputuskan
Pertanyaan untuk pemilik.
```

---

## 6. Template entri fitur di file domain

```markdown
### X.Y <Nama fitur>
*Migration: `<nama file>`. Status: Ada | Sebagian | Rencana.*

**Tujuan** — satu kalimat.

**Alur** — diagram teks atau langkah bernomor, menyebut RPC yang dipanggil.

**Aturan keras** — hal yang ditolak sistem, beserta pesan/penyebabnya.

**Data** — tabel/kolom penting, dan apa yang di-snapshot.

**Jebakan** — hal yang pernah menimbulkan bug atau mudah salah.
```

---

## 7. Aturan penulisan

1. **Tulis hanya yang sudah dicek**, dan sebutkan *bagaimana* dicek:
   - `Ada` = SQL-nya ada di migration **dan** dipanggil dari `src/` (kalau hanya cek migration tanpa cek frontend, tulis "ada di migration, belum dicek pemakaian UI").
   - `Sebagian` = sebagian bagian ada.
   - `Rencana` = baru dirancang, belum ada migration.
   - Jangan menulis "sudah jalan" untuk sesuatu yang belum dicoba, dan jangan menulis "belum di-UI-kan" tanpa benar-benar `grep` ke `src/` dulu — dua-duanya pernah salah di dokumen ini.
2. **Rujuk migration dengan nama file**, bukan hanya "migration terbaru". Daftar migration lengkap hanya hidup di `supabase/DATABASE.md` — jangan menyalin ulang daftarnya di file lain, cukup rujuk nomor/nama filenya.
3. **Jangan menyalin isi function SQL panjang.** Cukup nama, parameter, dan perilaku.
4. **Satu istilah, satu arti.** Pakai glosarium di `README.md`. Nama tabel/kolom/status ditulis dengan `kode`.
5. **Tulis alasan, bukan hanya aturan.** "Stok hanya naik saat Gudang konfirmasi, karena uang bisa keluar sebelum barang fisik tiba."
6. **Sebelum menulis ulang penjelasan yang sudah ada di domain lain, cek dulu apakah itu sudah ditulis di sana.** Kalau sudah, rujuk — jangan tulis ulang versi "ringkas" yang isinya ternyata sama persis (lihat catatan di bagian atas dokumen ini soal duplikasi timeline).
7. **Bahasa Indonesia, singkat.** Tabel untuk perbandingan dan daftar RPC; prosa untuk alasan.
8. **Tanggal pakai format `YYYY-MM-DD`.**

---

## 8. Jebakan yang sudah pernah terjadi (baca sebelum menulis SQL atau docs)

| Jebakan | Gejala | Pencegahan |
|---|---|---|
| Lupa `GRANT` ke `authenticated` | `42501 permission denied` walau RLS benar | Cek `alter default privileges`; beri grant eksplisit kalau perlu |
| Function overloaded | `PGRST203` / "300 Multiple Choices" | `drop function` signature lama sebelum membuat yang baru |
| Rename tabel tapi function lama masih merujuk nama lama | `relation "public.categories" does not exist` | `grep` nama tabel lama di semua function sebelum rename |
| View ketinggalan kolom baru | UI menampilkan `null` | Cek `orders_with_balance` setiap menambah kolom ke `orders` |
| Stok material berwarna dibaca dari `materials.stock_qty` | Stok terbaca 0, tombol serah terkunci | Pakai rumus stok efektif (`GUDANG_DAN_PURCHASING.md` §3.3) di setiap RPC stok |
| Constraint diubah, seed tidak | `seed.sql` gagal di insert | Setelah ubah constraint, cari nilai lama di `seed.sql` |
| Status baru, RPC lama tidak menerima | "bukan berstatus pending" | Saat menambah status di alur, cek semua RPC yang memfilter status itu |
| Insert langsung ke tabel yang butuh efek samping | Saldo dan status tidak sinkron | Pakai RPC (`record_order_payment`, dll.), jangan insert manual |
| Dokumentasi menulis status fitur dari migration saja | "Belum di-UI-kan" padahal sudah dipanggil frontend | `grep` nama RPC di `src/` sebelum menulis status implementasi |
| Satu fitur ditulis lengkap di dua file domain | Dua versi perlahan berbeda isi tanpa disadari | Satu domain jadi pemilik; domain lain cukup rujukan singkat |

---

## 9. Checklist sebelum menyatakan selesai

- [ ] Migration baru, nomor naik, idempotent, 1 tujuan
- [ ] Signature function lama sudah di-`drop` kalau berubah
- [ ] `supabase/clear.sql` mencakup tabel baru
- [ ] `supabase/seed.sql` masih valid terhadap semua constraint (nilai status dan `source_type`)
- [ ] `clear.sql` lalu `seed.sql` dijalankan tanpa error di DB dev (atau dicek lewat Supabase connector kalau tidak bisa dites langsung)
- [ ] `README.md` root diupdate kalau logika bisnis berubah
- [ ] **Satu** file domain diupdate (bagian yang berubah, bukan bagian paralel di file lain)
- [ ] Tabel "Daftar RPC/Trigger" di file domain diupdate
- [ ] `ARSITEKTUR_TEKNIS.md` §5 (tabel) dan §7 (known issues) diupdate
- [ ] `supabase/DATABASE.md` diupdate (baris migration baru)
- [ ] `docs/README.md` diupdate kalau ada istilah/route baru
- [ ] Nama di docs sama persis dengan SQL **dan** dengan pemakaian di `src/` (`grep` keduanya)
- [ ] Tidak ada penjelasan yang sama ditulis lengkap di dua file domain
- [ ] Rancangan yang selesai sudah dilebur dan dipindah ke `docs/arsip/`
- [ ] Ringkasan ke pengguna menyebut apa yang belum dicek
