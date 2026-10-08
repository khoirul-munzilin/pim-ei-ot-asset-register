# Instalasi PIM EI & OT Asset Register

## 1. Siapkan Supabase
1. Buka project Supabase yang sudah ada.
2. Pilih **SQL Editor** lalu **New query**.
3. Buka file `database.sql`, salin seluruh isinya, lalu klik **Run**.
4. Buka **Project Settings > Data API / API**.
5. Salin **Project URL** dan **Publishable key / anon public key**.
6. Jangan gunakan `service_role` pada aplikasi browser.

## 2. Isi konfigurasi
Buka `config.js`, kemudian ganti:

```js
SUPABASE_URL: "https://xxxxx.supabase.co",
SUPABASE_ANON_KEY: "sb_publishable_xxxxx",
DEFAULT_EMAIL: "email.perusahaan@domain.com"
```

## 3. Upload ke GitHub
1. Buat repository baru, misalnya `pim-asset-register`.
2. Upload seluruh isi folder paket, bukan folder pembungkusnya.
3. Pastikan `index.html` berada di root repository.
4. Commit ke branch `main`.

## 4. Aktifkan GitHub Pages
1. Masuk repository > **Settings > Pages**.
2. Pada **Build and deployment**, pilih **GitHub Actions**.
3. Masuk tab **Actions** dan tunggu workflow `Deploy GitHub Pages` selesai hijau.
4. Alamat aplikasi biasanya: `https://USERNAME.github.io/pim-asset-register/`.

## 5. Import file asset existing
1. Buka aplikasi online.
2. Pilih **Import Excel**.
3. Pilih file asset register `.xlsx`.
4. Klik **Preview**.
5. Periksa jumlah dan contoh data.
6. Klik **Import ke Supabase**.
7. Tunggu sampai muncul pesan selesai.

## 6. Dokumentasi foto
1. Buka **Daftar Asset**.
2. Cari aset.
3. Klik **Lihat / Foto**.
4. Ambil foto asset atau nameplate.
5. Foto akan masuk ke bucket `asset-photos`.

## 7. Laporan dan email manual
1. Buka **Laporan & Email**.
2. Isi email tujuan, subjek, dan pesan.
3. Klik **Download Excel & Buka Email**.
4. File `PIM_Asset_Register.xlsx` terunduh.
5. Email terbuka pada aplikasi email default.
6. Lampirkan file dari folder Download, lalu klik Send.

## Catatan keamanan
Versi awal ini mengikuti permintaan tanpa login. Siapa pun yang mengetahui URL aplikasi dapat membaca dan menambah data. Gunakan URL hanya untuk tim internal pada tahap uji coba. Setelah alur disetujui, aktifkan Supabase Auth dan ubah policy dari role `anon` menjadi `authenticated`.
