const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/tables', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.*,
            CASE WHEN EXISTS (
              SELECT 1 FROM orders o WHERE o.table_id = t.id AND o.status IN ('pending','confirmed')
            ) THEN 'terisi' ELSE 'kosong' END AS status
     FROM dining_tables t ORDER BY t.number ASC`
  );
  res.json(rows);
});

router.post('/tables', requireAdmin, async (req, res) => {
  const { number } = req.body;
  if (!number || isNaN(number)) return res.status(400).json({ error: 'Nomor meja wajib diisi.' });
  try {
    const [result] = await pool.query(
      'INSERT INTO dining_tables (number, active) VALUES (?, 1)',
      [number]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Nomor meja sudah ada.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah meja.' });
  }
});

router.put('/tables/:id', requireAdmin, async (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'Field active wajib boolean.' });
  await pool.query('UPDATE dining_tables SET active = ? WHERE id = ?', [active ? 1 : 0, req.params.id]);
  res.json({ success: true });
});

router.delete('/tables/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM dining_tables WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        error: 'Meja tidak bisa dihapus karena masih punya riwayat pesanan. Nonaktifkan saja meja ini.',
      });
    }
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus meja.' });
  }
});

module.exports = router;
