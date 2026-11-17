# Clarus X-1

## Jalankan di komputer sendiri

1. Pasang Node.js LTS.
2. Double-click `start.bat`, atau jalankan `npm run create-accounts` satu kali lalu `npm start`.
3. Buka `http://127.0.0.1:3000`.
4. Kredensial akun tersimpan di `private/account-codes.txt`. Jaga file ini dan jangan bagikan secara publik.

## Deploy publik: GitHub Pages + Render

GitHub Pages hanya menjalankan halaman dan gambar statis; API login harus berjalan pada layanan Node.js terpisah. Workflow `.github/workflows/pages.yml` menyiapkan `index.htm` sebagai `index.html` dan mengunggah folder `assets`, jadi logo dan foto ikut ter-deploy dengan path yang benar.

### 1. Siapkan backend di Render

1. Buat repository GitHub dari project ini. Pastikan `private/` dan kode akun tidak masuk ke repository; keduanya sudah dikecualikan oleh `.gitignore`.
2. Di Render, buat Web Service dari repository ini dan gunakan `render.yaml`.
3. Buat akun lokal sekali dengan `npm run create-accounts`. Jangan unggah folder `private/`.
4. Pada Environment Render, isi:
   - `CLARUS_USERS_JSON`: seluruh isi `private/users.json` (ini berisi hash, bukan kode login asli; tetap perlakukan sebagai rahasia).
   - `CORS_ORIGINS`: origin website frontend, misalnya `https://NAMA-AKUN.github.io`. Pisahkan origin tambahan dengan koma, tanpa garis miring di akhir.
   - `NODE_ENV` sudah diatur menjadi `production`.
5. Deploy/redeploy service dan catat URL HTTPS Render, misalnya `https://clarus-api.onrender.com`.

### 2. Deploy frontend ke GitHub Pages

1. Di repository GitHub, buka **Settings → Pages** dan pilih **GitHub Actions** sebagai sumber deploy.
2. Buka **Settings → Secrets and variables → Actions → Variables**, lalu buat variable `CLARUS_API_URL` berisi URL HTTPS backend Render tanpa path, misalnya `https://clarus-api.onrender.com`.
3. Push branch `main` atau jalankan workflow **Deploy Clarus to GitHub Pages** secara manual pada tab **Actions**.
4. Buka alamat Pages yang diberikan GitHub. Foto dan logo akan tersedia di bawah folder `assets/`.

### 3. Domain sendiri dan HTTPS

GitHub Pages menyediakan HTTPS untuk alamat `NAMA-AKUN.github.io`. Untuk login yang lebih kompatibel dengan pembatasan cookie browser, gunakan domain sendiri untuk frontend dan subdomain API pada domain yang sama, misalnya `www.domainanda.id` dan `api.domainanda.id`. Tambahkan domain frontend pada **Settings → Pages → Custom domain**, lalu tambahkan domain yang sama ke Render dan atur DNS mengikuti instruksi masing-masing layanan. Setelah DNS aktif, aktifkan **Enforce HTTPS** di GitHub Pages dan ubah `CLARUS_API_URL` serta `CORS_ORIGINS` ke domain `https://` tersebut.

Jangan masukkan `private/`, `account-codes.txt`, atau kredensial akun ke repository publik. Sesi login disimpan di memori backend sehingga pengguna perlu login lagi setelah service Render dimulai ulang. Fitur chat kelas belum tersedia.
