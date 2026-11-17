# Clarus untuk GitHub Pages

Folder ini berisi halaman statis dan foto/logo publik untuk diunggah ke GitHub Pages.

## Upload ke repository

1. Unggah `index.html`, `api-config.js`, dan folder `assets/` dari folder ini ke root repository GitHub.
2. Pastikan repository menggunakan GitHub Pages. Setelah deploy, situs tersedia di alamat Pages repository tersebut dengan HTTPS.
3. Jangan unggah folder `private/`, `account-codes.txt`, atau data akun.

GitHub Pages hanya melayani halaman dan gambar statis. Login memerlukan backend Node.js. Sampai backend disiapkan, formulir login akan menampilkan informasi bahwa server login belum dikonfigurasi.

Untuk mengaktifkan login, ubah `api-config.js` agar `window.CLARUS_API_BASE_URL` berisi origin HTTPS backend, misalnya `https://api-contoh.onrender.com`, lalu atur CORS di backend agar mengizinkan origin GitHub Pages ini. Jangan masukkan kode akses atau hash akun ke file ini.
