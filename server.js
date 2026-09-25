/**
 * QR Ordering System — Server (MySQL Edition)
 * -----------------------------------------------------------
 * - Pelanggan: TANPA LOGIN. Scan QR -> /customer.html -> pilih menu & meja -> kirim pesanan.
 * - Kasir/Admin: WAJIB LOGIN (multi-akun, role admin/kasir). Dashboard realtime lengkap
 *   dengan laporan penjualan, kelola menu, kelola meja, dan manajemen user (khusus admin).
 */
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

// ---------- Middleware ----------
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ganti-secret-ini-di-produksi',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 }, // 12 jam
  })
);
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Routes ----------
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/public'));
app.use('/api/admin', require('./routes/adminOrders'));
app.use('/api/admin', require('./routes/adminMenu'));
app.use('/api/admin', require('./routes/adminTables'));
app.use('/api/admin', require('./routes/adminUsers'));
app.use('/api/admin', require('./routes/adminReports'));
app.use('/api/admin', require('./routes/adminSettings'));

// ---------- Socket.IO ----------
// Staff (kasir/admin) join room "staff" untuk menerima notifikasi realtime pesanan baru.
io.on('connection', (socket) => {
  socket.on('joinStaffRoom', () => {
    socket.join('staff');
  });
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ QR Ordering System (MySQL) berjalan di http://localhost:${PORT}`);
  console.log(`   Halaman pelanggan (scan QR ke sini): http://localhost:${PORT}/customer.html?table=1`);
  console.log(`   Halaman kasir/admin: http://localhost:${PORT}/cashier.html`);
  console.log(`   Jalankan "node db/seed-users.js" dulu jika belum punya akun login.`);
});
