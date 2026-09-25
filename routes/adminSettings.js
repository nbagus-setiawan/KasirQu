const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/settings', async (req, res) => {
  const [rows] = await pool.query('SELECT `key`, `value` FROM settings');
  const settings = {};
  rows.forEach((r) => { settings[r.key] = r.value; });
  res.json(settings);
});

router.put('/settings', requireAdmin, async (req, res) => {
  const allowedKeys = ['restaurant_name', 'restaurant_address', 'restaurant_phone', 'receipt_footer'];
  const entries = Object.entries(req.body).filter(([k]) => allowedKeys.includes(k));
  if (entries.length === 0) return res.status(400).json({ error: 'Tidak ada pengaturan valid dikirim.' });

  for (const [key, value] of entries) {
    await pool.query(
      'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
      [key, String(value).slice(0, 255)]
    );
  }
  res.json({ success: true });
});

module.exports = router;
