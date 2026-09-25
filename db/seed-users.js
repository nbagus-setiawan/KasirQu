/**
 * Seed akun awal (admin & kasir) dengan password ter-hash.
 * Dijalankan sekali saat setup pertama kali: `node db/seed-users.js`
 *
 * Password default HANYA untuk demo — WAJIB diganti setelah login pertama,
 * atau atur lewat environment variable sebelum menjalankan script ini:
 *   ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME
 *   CASHIER_USERNAME, CASHIER_PASSWORD, CASHIER_NAME
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function upsertUser({ username, password, fullName, role }) {
  const hash = bcrypt.hashSync(password, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, active)
     VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), full_name = VALUES(full_name), role = VALUES(role)`,
    [username, hash, fullName, role]
  );
  console.log(`✔ User "${username}" (${role}) siap. Password: ${password}`);
}

(async () => {
  try {
    await upsertUser({
      username: process.env.ADMIN_USERNAME || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      fullName: process.env.ADMIN_NAME || 'Administrator',
      role: 'admin',
    });
    await upsertUser({
      username: process.env.CASHIER_USERNAME || 'kasir',
      password: process.env.CASHIER_PASSWORD || 'kasir123',
      fullName: process.env.CASHIER_NAME || 'Kasir 1',
      role: 'kasir',
    });
    console.log('\n✅ Seed user selesai. GANTI password default ini sebelum dipakai produksi!');
  } catch (err) {
    console.error('❌ Gagal seed user:', err.message);
  } finally {
    await pool.end();
  }
})();
