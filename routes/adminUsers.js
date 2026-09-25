const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/users', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, username, full_name AS fullName, role, active, created_at AS createdAt FROM users ORDER BY created_at ASC'
  );
  res.json(rows);
});

router.post('/users', async (req, res) => {
  const { username, password, fullName, role } = req.body;
  if (!username || !password || !fullName || !['admin', 'kasir'].includes(role)) {
    return res.status(400).json({ error: 'Semua field wajib diisi dengan benar.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter.' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, full_name, role, active) VALUES (?, ?, ?, ?, 1)',
      [username.trim(), hash, fullName.trim(), role]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Username sudah dipakai.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah user.' });
  }
});

router.put('/users/:id', async (req, res) => {
  const { fullName, role, active, password } = req.body;
  const fields = [];
  const params = [];

  if (typeof fullName === 'string' && fullName.trim()) {
    fields.push('full_name = ?');
    params.push(fullName.trim());
  }
  if (['admin', 'kasir'].includes(role)) {
    fields.push('role = ?');
    params.push(role);
  }
  if (typeof active === 'boolean') {
    fields.push('active = ?');
    params.push(active ? 1 : 0);
  }
  if (typeof password === 'string' && password.length >= 6) {
    fields.push('password_hash = ?');
    params.push(bcrypt.hashSync(password, 10));
  }

  if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada perubahan dikirim.' });

  if (Number(req.params.id) === req.session.user.id && active === false) {
    return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun Anda sendiri.' });
  }

  params.push(req.params.id);
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  res.json({ success: true });
});

module.exports = router;
