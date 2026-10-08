# PIM EI & OT Asset Register - Final

Paket ini siap dipasang di GitHub Pages. Data awal berisi 1.254 aset dari workbook terbaru dan dashboard publik langsung dapat dibuka tanpa login.

## Pemasangan

1. Hapus file lama di repository GitHub, jangan hapus repository-nya.
2. Upload seluruh isi folder ini ke root repository. Pastikan `index.html` berada di root, bukan di dalam folder tambahan.
3. Buka Supabase > SQL Editor > New query. Salin seluruh isi `supabase-setup.sql`, lalu klik Run. Langkah ini hanya satu kali.
4. Di Supabase Authentication > Users, pastikan akun Administrator memakai `smartworkreport@gmail.com`. Buat akun Technician Dedy dengan email yang dikehendaki. Semua akun selain email Administrator otomatis menjadi Technician.
5. Buka website GitHub Pages, login Administrator, buka **Kelola > Import Excel**, lalu pilih `ID-MJK Asset Registers.xlsx`. Import pertama memindahkan seluruh data awal ke database online.

## Hak akses

- Viewer: tanpa login, hanya melihat dashboard, denah, chart, filter, detail, dan unduh CSV.
- Technician: dapat mengubah status, kondisi, remark, dan URL foto. Tidak dapat menambah, menghapus, import, atau mengubah identitas aset.
- Administrator: akses penuh, termasuk tambah aset, edit, hapus, dan sinkronisasi Excel.

## Mekanisme perubahan aset

- Import menggunakan identitas stabil dari kombinasi Category, Functional Location, Equipment Number, dan Tagname.
- Aset yang sama diperbarui, bukan digandakan.
- Aset baru otomatis ditambahkan.
- Condition, Status, foto, dan dokumentasi lama dipertahankan saat data master diimpor ulang.
- Mapping area dihitung dari Plant/Area, Functional Location, dan Tagname.
- Penghapusan aset tidak dilakukan otomatis ketika baris hilang dari Excel, untuk mencegah kehilangan data dokumentasi. Penghapusan dilakukan Administrator dari aplikasi.

## File utama

- `index.html`: halaman aplikasi.
- `style.css`: tampilan responsif.
- `app.js`: dashboard, role, CRUD, mapping, filter, dan import.
- `config.js`: koneksi Supabase dan email Administrator.
- `assets/assets.json`: data awal.
- `assets/denah-area-pabrik.png`: denah.
- `supabase-setup.sql`: tabel dan keamanan akses.

## Ketahanan data

- Pembacaan Supabase memakai pagination 1.000 baris sampai seluruh aset selesai dimuat.
- Pengamanan role dilakukan di UI dan database. Technician tidak dapat mengubah master aset melalui request langsung.
- Import diproses per 500 aset agar stabil untuk database besar.
