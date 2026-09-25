# Website Kasir & Ordering System berbasis QR Code — MySQL Edition (KasirQu)

Sistem pemesanan makanan untuk restoran/kafe, versi lengkap dengan **database MySQL**, **laporan penjualan bergrafik**, dan **manajemen penuh** (menu, meja, user).

- **Pelanggan**: scan QR → langsung lihat menu & pilih meja → kirim pesanan. **Tanpa login, tanpa registrasi.**
- **Kasir/Admin**: login (multi-akun, dua peran: admin & kasir) → dashboard realtime lengkap dengan laporan penjualan, riwayat pesanan, kelola menu, kelola meja, dan kelola user (khusus admin).

---

## 1. Fitur Lengkap

**Pelanggan (tanpa login):**
- Scan QR per meja → menu & nomor meja otomatis terisi
- Filter menu per kategori, keranjang dengan kontrol kuantitas
- Catatan khusus untuk dapur
- Konfirmasi pesanan terkirim beserta ringkasan & kode pesanan

**Kasir/Admin (wajib login):**
- **Pesanan Masuk** — realtime via Socket.IO, aksi Konfirmasi → Tandai Dibayar → Selesaikan, atau Batalkan
- **Status Meja** — peta visual meja kosong/terisi
- **Laporan Penjualan** — kartu ringkasan (pendapatan hari ini/minggu/bulan, rata-rata per pesanan, pesanan aktif) + 4 grafik interaktif (Chart.js): tren pendapatan harian, menu terlaris, jam ramai, distribusi status pesanan
- **Riwayat Pesanan** — filter berdasarkan status & rentang tanggal, dengan paginasi
- **Kelola Menu** — tambah/ubah/hapus menu, toggle tersedia/habis, kelola kategori
- **Kelola Meja** — tambah/nonaktifkan/hapus meja
- **Kelola User** (khusus admin) — multi-akun kasir & admin, masing-masing dengan nama, role, dan status aktif/nonaktif
- **Upload Foto Menu** — unggah foto langsung dari form tambah/ubah menu, tampil di halaman pelanggan & daftar kelola menu
- **Cetak Struk Thermal** — tombol "🖨️ Struk" di tiap pesanan (setelah dikonfirmasi), membuka halaman siap cetak berukuran kertas 80mm dengan kop nama/alamat/telepon restoran
- **Ekspor Laporan ke Excel** — satu klik unduh file `.xlsx` 4 sheet (Ringkasan, Tren Pendapatan, Menu Terlaris, Riwayat Pesanan) untuk periode 7/14/30/90 hari
- **Pengaturan Restoran** (khusus admin) — atur nama, alamat, telepon, dan pesan penutup yang muncul di struk

## 2. Struktur Proyek

```
qr-ordering-system/
├── server.js                  # Entry point Express + Socket.IO
├── package.json
├── .env.example                # Contoh konfigurasi environment
├── config/
│   └── db.js                   # Koneksi pool MySQL
├── middleware/
│   └── auth.js                 # requireAuth & requireAdmin
├── db/
│   ├── schema.sql               # Struktur tabel database
│   ├── seed.sql                 # Data awal: kategori, menu, meja, pengaturan (aman dijalankan berkali-kali)
│   └── seed-users.js            # Script buat akun admin & kasir pertama
├── middleware/
│   ├── auth.js                  # requireAuth & requireAdmin
│   └── upload.js                 # Konfigurasi multer untuk upload foto menu
├── routes/
│   ├── auth.js                  # Login/logout/session
│   ├── public.js                 # Menu, meja, submit pesanan (guest)
│   ├── adminOrders.js            # Pesanan masuk, riwayat, & data struk
│   ├── adminMenu.js              # CRUD menu & kategori, upload foto
│   ├── adminTables.js            # CRUD meja
│   ├── adminUsers.js             # CRUD user (admin only)
│   ├── adminReports.js           # Endpoint laporan/grafik & ekspor Excel
│   └── adminSettings.js          # Pengaturan restoran (untuk kop struk)
└── public/
    ├── customer.html              # Halaman pelanggan (SCAN QR ke sini)
    ├── cashier.html                # Dashboard kasir/admin
    ├── print-receipt.html          # Halaman cetak struk (80mm thermal)
    ├── uploads/menu/                # Foto menu yang diunggah (dibuat otomatis)
    ├── css/style.css
    └── js/
        ├── customer.js
        └── cashier.js
```

## 3. Persiapan

Dibutuhkan:
- **Node.js 18+** (`node -v`)
- **MySQL 8.0+** ter-install dan berjalan (`mysql --version`)

### a) Buat database & tabel

```bash
mysql -u root -p < db/schema.sql
mysql -u root -p < db/seed.sql
```

Ini akan membuat database `qr_ordering` beserta tabel-tabelnya, lalu mengisi 3 kategori, 12 menu contoh, dan 12 meja.

### b) (Disarankan) Buat user database khusus, jangan pakai root

```sql
CREATE USER 'qr_app'@'localhost' IDENTIFIED BY 'password_yang_kuat';
GRANT ALL PRIVILEGES ON qr_ordering.* TO 'qr_app'@'localhost';
FLUSH PRIVILEGES;
```

### c) Konfigurasi environment

```bash
cp .env.example .env
```
Lalu edit `.env` sesuai kredensial database Anda:
```
DB_HOST=localhost
DB_USER=qr_app
DB_PASSWORD=password_yang_kuat
DB_NAME=qr_ordering
SESSION_SECRET=ganti-dengan-string-acak-panjang
```

### d) Install dependencies & buat akun login pertama

```bash
npm install
npm run seed        # membuat akun admin & kasir sesuai .env (atau default demo)
```

### e) Jalankan

```bash
npm start
```

```
✅ QR Ordering System (MySQL) berjalan di http://localhost:3000
   Halaman pelanggan (scan QR ke sini): http://localhost:3000/customer.html?table=1
   Halaman kasir/admin: http://localhost:3000/cashier.html
```

- **Login demo**: admin `admin` / `admin123`, kasir `kasir` / `kasir123` — **ganti sebelum dipakai produksi** lewat tab "Kelola User" atau langsung di `.env` sebelum `npm run seed`.

## 4. Cara Kerja QR Code per Meja

```
https://domain-anda.com/customer.html?table=1   -> otomatis pilih Meja nomor 1
https://domain-anda.com/customer.html?table=2   -> otomatis pilih Meja nomor 2
```

Angka setelah `?table=` merujuk ke **nomor meja** (kolom `number` di tabel `dining_tables`, bisa dikelola lewat tab "Kelola Meja"). Buat QR code untuk tiap URL di atas menggunakan generator QR gratis, lalu cetak dan tempel di masing-masing meja. Pelanggan yang membuka tanpa parameter `?table=` tetap bisa memilih meja secara manual.

## 5. Alur Sistem

**Pelanggan:** scan QR → pilih menu & meja (otomatis dari QR) → kirim pesanan → pesanan langsung tampil realtime di dashboard kasir.

**Kasir/Admin:** login → tab "Pesanan Masuk" menerima notifikasi realtime (toast + getar) → Konfirmasi → Tandai Dibayar → Selesaikan. Semua histori otomatis tersimpan di database dan langsung terhitung di tab "Laporan Penjualan".

## 6. Role: Admin vs Kasir

| Fitur | Kasir | Admin |
|---|---|---|
| Pesanan Masuk, Status Meja, Laporan, Riwayat | ✅ | ✅ |
| Melihat menu & meja | ✅ | ✅ |
| Menambah/mengubah/menghapus menu, kategori, meja | ❌ | ✅ |
| Kelola User (tambah kasir/admin baru) | ❌ | ✅ |

Setiap aksi pada pesanan (konfirmasi, tandai dibayar, selesaikan) tercatat di database beserta user mana yang melakukannya (`confirmed_by`, `paid_by`, `completed_by`) — berguna untuk audit di kemudian hari.

## 7. Cetak Struk Thermal

Tombol **"🖨️ Struk"** muncul di setiap pesanan yang sudah dikonfirmasi/dibayar/selesai, baik di tab "Pesanan Masuk" maupun "Riwayat". Klik tombol ini membuka `print-receipt.html` di tab baru, diformat pas untuk kertas thermal 80mm, dan otomatis membuka dialog cetak browser.

**Cara menyambungkan printer thermal sungguhan:**
1. Sambungkan printer thermal (USB, Bluetooth, atau LAN) ke komputer/tablet kasir seperti biasa, install driver-nya (biasanya printer thermal muncul sebagai printer biasa di OS setelah driver terpasang — merek umum seperti EPSON TM-T82, atau printer thermal generik 80mm/58mm biasanya kompatibel dengan Windows/Android POS driver).
2. Saat dialog cetak browser muncul, pilih printer thermal tersebut sebagai tujuan cetak (bukan "Save as PDF").
3. Set margin ke "None"/"Tanpa margin" jika browser menawarkan opsi tersebut (halaman struk sudah diatur `@page { margin: 0 }` secara otomatis).
4. Jika printer Anda 58mm bukan 80mm, ubah nilai `width: 80mm` di dalam tag `<style>` pada `public/print-receipt.html` menjadi `58mm`.

Nama, alamat, telepon, dan pesan penutup di kop struk diatur lewat tab **"Pengaturan"** (khusus admin) di dashboard.

> Catatan: pendekatan ini memakai dialog cetak bawaan browser (bukan library ESC/POS langsung ke port printer), sehingga bekerja di semua platform tanpa driver tambahan khusus Node.js. Jika ke depan Anda butuh cetak otomatis tanpa dialog konfirmasi (misalnya cetak langsung begitu status "Dibayar"), beri tahu saya — itu butuh integrasi library ESC/POS (seperti `node-thermal-printer`) yang terhubung langsung ke IP/USB printer dari server.

## 8. Ekspor Laporan ke Excel

Di tab **"Laporan Penjualan"**, pilih rentang periode (7/14/30/90 hari) lalu klik **"📊 Ekspor ke Excel"**. File `.xlsx` yang diunduh berisi 4 sheet:
- **Ringkasan** — total pendapatan & jumlah pesanan hari ini dan periode terpilih
- **Tren Pendapatan** — rincian per hari
- **Menu Terlaris** — porsi terjual & pendapatan per menu
- **Riwayat Pesanan** — daftar lengkap setiap pesanan dalam periode tersebut

File ini bisa langsung dibuka di Excel, Google Sheets, atau LibreOffice Calc.

## 9. Upload Foto Menu

Di form tambah/ubah menu (tab "Kelola Menu"), ada field unggah foto (JPG/PNG/WEBP, maksimal 2MB). Foto langsung diunggah begitu dipilih dan pratinjaunya tampil di form — tidak perlu menunggu tombol simpan. Foto otomatis muncul di halaman pelanggan (`customer.html`) dan daftar kelola menu. File foto disimpan di `public/uploads/menu/` — pastikan folder ini ikut di-backup atau, jika deploy ke platform dengan filesystem sementara (lihat bagian Deploy), pertimbangkan memindahkan penyimpanan ke layanan seperti Cloudinary atau AWS S3 (beri tahu saya jika ingin dibantu migrasi).

## 10. Deploy ke Internet

Server ini aplikasi Node.js + MySQL standar, bisa di-deploy ke:
- **VPS** (DigitalOcean, dsb.) dengan Node.js + MySQL + PM2 + Nginx reverse proxy + SSL (Let's Encrypt) — kontrol penuh, direkomendasikan untuk restoran yang serius jangka panjang.
- **Platform PaaS** (Railway, Render) untuk aplikasi + **database MySQL terkelola** (PlanetScale, AWS RDS, DigitalOcean Managed MySQL, dsb.) — lebih mudah tanpa mengurus server manual.

Yang wajib diperhatikan saat deploy:
- Set semua environment variable di `.env` (kredensial DB, `SESSION_SECRET`, akun admin awal) — **jangan pernah commit file `.env` ke Git**.
- Aktifkan HTTPS (wajib untuk keamanan sesi login dan supaya kamera HP membuka QR tanpa peringatan keamanan).
- Pastikan koneksi ke MySQL menggunakan SSL jika database di-hosting terpisah dari server aplikasi.
- Pastikan hosting/reverse proxy mendukung WebSocket (untuk Socket.IO realtime) — Nginx perlu konfigurasi header `Upgrade`/`Connection`.
- Backup database MySQL secara berkala (`mysqldump`), karena ini sekarang sumber data utama termasuk riwayat penjualan.

## 11. Pengembangan Lanjutan (opsional, beri tahu saya jika ingin dibantu)

- Cetak struk otomatis langsung ke printer (ESC/POS) tanpa dialog konfirmasi browser
- Ekspor struk/laporan ke PDF
- Penyimpanan foto menu ke cloud storage (Cloudinary/S3) untuk deploy di platform serverless
- Notifikasi WhatsApp/SMS ke pelanggan saat pesanan siap
- Split bill / pembagian tagihan per meja
- Program loyalitas pelanggan
# KasirQu
