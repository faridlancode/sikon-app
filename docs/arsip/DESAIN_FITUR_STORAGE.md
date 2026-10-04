# Desain Fitur Storage (File Upload)

Dokumen ini merangkum rancangan Supabase Storage untuk menyimpan file yang dipakai fitur lain: aset perusahaan dan bukti foto SPJ. Sumber: `supabase/migrations/20260101000005_storage.sql`.

---

## 1. Dua Bucket

| Bucket | Dipakai oleh | Isi |
|---|---|---|
| `company-assets` | Pengaturan Perusahaan (`company_settings`) | Logo (`logo_url`), stempel digital (`stamp_url`), tanda tangan digital (`signature_url`) — dipakai untuk surat-menyurat resmi |
| `purchasing-receipts` | Purchasing — SPJ (`purchasing_report_items`) | Foto bukti nota belanja (`receipt_photo_url`) |

Kedua bucket dibuat **public** (`public: true`) — file bisa diakses lewat URL langsung tanpa signed URL, karena isinya bukan data sensitif per-user (logo perusahaan & bukti nota memang perlu ditampilkan/dicetak di surat/laporan) dan aplikasi ini single-tenant (bukan multi-perusahaan publik yang saling bersaing).

---

## 2. Konvensi Path & Policy Akses

Semua object **wajib** disimpan dengan folder pertama = `auth.uid()` milik uploader, contoh: `{user_id}/logo.png`, `{user_id}/receipt-abc123.jpg`. Policy menegakkan ini lewat `storage.foldername(name)[1]`:

```sql
-- Baca: publik (siapa saja dengan URL bisa lihat/download)
create policy "Public read company assets" on storage.objects
  for select using (bucket_id = 'company-assets');

-- Tulis/ubah/hapus: hanya pemilik folder (harus login & folder pertama = uid sendiri)
create policy "Owner manage own company assets" on storage.objects
  for all
  using (bucket_id = 'company-assets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'company-assets' and (storage.foldername(name))[1] = auth.uid()::text);
```

Pola yang sama diterapkan identik untuk bucket `purchasing-receipts`. Jadi meski bucket-nya public untuk **dibaca**, hanya pemilik akun yang bisa **upload/replace/hapus** file di folder miliknya sendiri — isolasi datanya ada di sisi tulis, bukan baca.

---

## 3. Keputusan Desain

- **Kenapa public read, bukan signed URL?** Aplikasi ini single-tenant (satu perusahaan pakai satu akun owner), jadi tidak ada risiko kebocoran data antar-kompetitor lewat URL publik. Logo/stempel/tanda tangan memang perlu tampil di dokumen cetak (invoice, surat jalan) tanpa proses autentikasi tambahan, dan bukti nota SPJ perlu gampang diakses saat proses approval.
- **Kenapa folder path pakai `auth.uid()` walau bucket-nya public?** Supaya kalau di masa depan aplikasi ini jadi multi-tenant, kontrol tulis per-user sudah siap tanpa perlu migrasi ulang struktur folder — tinggal ubah `for select` jadi ikut cek folder juga.
