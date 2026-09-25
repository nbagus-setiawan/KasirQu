const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { upload, UPLOAD_DIR } = require('../middleware/upload');

const router = express.Router();
router.use(requireAuth);

// ---- Upload foto menu ----
// Mengembalikan URL publik gambar; dipanggil terpisah dari form sebelum
// menu disimpan, sehingga pratinjau bisa langsung ditampilkan di dashboard.
router.post('/menu/upload-image', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Gagal mengunggah gambar.' });
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file gambar yang dikirim.' });
    res.json({ success: true, url: `/uploads/menu/${req.file.filename}` });
  });
});

// ---- Kategori ----
router.get('/categories', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM categories ORDER BY sort_order ASC, name ASC');
  res.json(rows);
});

router.post('/categories', requireAdmin, async (req, res) => {
  const { name, sortOrder = 0 } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
  try {
    const [result] = await pool.query(
      'INSERT INTO categories (name, sort_order) VALUES (?, ?)',
      [name.trim(), sortOrder]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Kategori dengan nama itu sudah ada.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah kategori.' });
  }
});

router.delete('/categories/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ---- Menu (semua item termasuk yang tidak tersedia, untuk dikelola) ----
router.get('/menu', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT m.*, c.name AS categoryName
     FROM menu_items m LEFT JOIN categories c ON c.id = m.category_id
     ORDER BY m.created_at DESC`
  );
  res.json(rows);
});

router.post('/menu', requireAdmin, async (req, res) => {
  const { name, description = '', price, categoryId = null, available = true, imageUrl = null } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nama menu wajib diisi.' });
  if (typeof price !== 'number' || price < 0) {
    return res.status(400).json({ error: 'Harga tidak valid.' });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO menu_items (category_id, name, description, price, available, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [categoryId || null, name.trim(), description, price, available ? 1 : 0, imageUrl || null]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah menu.' });
  }
});

router.put('/menu/:id', requireAdmin, async (req, res) => {
  const fields = [];
  const params = [];
  const { name, description, price, categoryId, available, imageUrl } = req.body;

  if (typeof name === 'string' && name.trim()) {
    fields.push('name = ?');
    params.push(name.trim());
  }
  if (typeof description === 'string') {
    fields.push('description = ?');
    params.push(description);
  }
  if (typeof price === 'number' && price >= 0) {
    fields.push('price = ?');
    params.push(price);
  }
  if (categoryId !== undefined) {
    fields.push('category_id = ?');
    params.push(categoryId || null);
  }
  if (typeof available === 'boolean') {
    fields.push('available = ?');
    params.push(available ? 1 : 0);
  }
  let oldImagePath = null;
  if (imageUrl !== undefined) {
    const [existingRows] = await pool.query('SELECT image_url FROM menu_items WHERE id = ?', [req.params.id]);
    if (existingRows[0] && existingRows[0].image_url && existingRows[0].image_url !== imageUrl) {
      oldImagePath = path.join(__dirname, '..', 'public', existingRows[0].image_url);
    }
    fields.push('image_url = ?');
    params.push(imageUrl || null);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'Tidak ada perubahan dikirim.' });

  params.push(req.params.id);
  await pool.query(`UPDATE menu_items SET ${fields.join(', ')} WHERE id = ?`, params);

  // Hapus file gambar lama (best-effort, tidak menggagalkan request jika gagal)
  if (oldImagePath) fs.unlink(oldImagePath, () => {});

  const [rows] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  res.json({ success: true, item: rows[0] });
});

router.delete('/menu/:id', requireAdmin, async (req, res) => {
  const [rows] = await pool.query('SELECT image_url FROM menu_items WHERE id = ?', [req.params.id]);
  await pool.query('DELETE FROM menu_items WHERE id = ?', [req.params.id]);
  if (rows[0] && rows[0].image_url) {
    fs.unlink(path.join(__dirname, '..', 'public', rows[0].image_url), () => {});
  }
  res.json({ success: true });
});

module.exports = router;
