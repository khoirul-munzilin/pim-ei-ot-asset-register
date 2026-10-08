# PIM Asset Report: Email Manual dan Otomatis 07.00 WIB

## Fungsi paket

- Perbaikan import Excel `duplicate key assets_asset_uid_unique_idx` dengan deduplikasi tiap `asset_uid`.
- Tombol kirim email manual khusus Administrator.
- Filter report berdasarkan Area, Functional Location, dan Category.
- Report HTML berisi aset, foto, dan deskripsi yang dikelompokkan per Functional Location.
- Lampiran CSV yang dapat dibuka di Excel.
- Email otomatis setiap hari pukul 07.00 WIB.
- Pengirim Gmail melalui GitHub Actions, bukan browser.

## Upload ke root repository

Upload seluruh isi paket ke root repository. Folder `.github` dan `supabase` harus ikut diunggah.

Struktur:

```
index.html
app.js
daily-report.mjs
package.json
package-lock.json
.github/workflows/daily-email-report.yml
.github/workflows/deploy-report-function.yml
supabase/config.toml
supabase/functions/trigger-asset-report/index.ts
```

File `style.css`, `config.js`, dan folder `assets` yang sudah ada tetap dipertahankan.

## GitHub Secrets wajib

Buka GitHub > Settings > Secrets and variables > Actions > New repository secret.

Buat:

- `SUPABASE_URL`: URL project Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: service_role key Supabase, hanya di Secrets.
- `SUPABASE_ACCESS_TOKEN`: personal access token akun Supabase untuk deployment function.
- `SUPABASE_PROJECT_REF`: `xahwinynkdqvcqefuqqw`.
- `SMTP_USER`: `smartworkreport@gmail.com`.
- `SMTP_PASS`: Gmail App Password 16 karakter, tanpa spasi.
- `REPORT_TO`: email penerima report otomatis.
- `REPORT_GITHUB_PAT`: fine-grained GitHub token dengan akses repository ini dan permission Contents: Read and write.

Jangan masukkan service role, Gmail App Password, atau GitHub PAT ke `config.js`.

## Pemeriksaan workflow

1. Buka Actions.
2. Jalankan `Deploy Report Trigger Function` sekali melalui `Run workflow`.
3. Pastikan centang hijau.
4. Jalankan `Daily and Manual Asset Email Report` melalui `Run workflow` untuk tes email langsung.
5. Setelah tes berhasil, jadwal otomatis berjalan setiap hari pukul 07.00 WIB.

## Tombol manual

Login sebagai `smartworkreport@gmail.com`, buka Kelola, isi email penerima dan filter, lalu klik `Kirim Laporan Email`. Tombol memicu `repository_dispatch`; workflow tampil di Actions beberapa detik kemudian.

## Catatan report

Foto ditampilkan dalam badan email menggunakan URL publik Supabase Storage. CSV dilampirkan untuk data aset. Maksimal enam foto ditampilkan per aset dalam email untuk menjaga ukuran report.
