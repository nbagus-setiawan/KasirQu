const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const ACTIVE_STATUSES = ['pending', 'confirmed', 'paid'];

async function fetchOrdersByIds(ids) {
  if (ids.length === 0) return [];
  const [orders] = await pool.query(
    `SELECT o.id, o.table_id AS tableId, t.number AS tableNumber, o.status, o.total,
            o.customer_note AS customerNote, o.created_at AS createdAt, o.updated_at AS updatedAt
     FROM orders o JOIN dining_tables t ON t.id = o.table_id
     WHERE o.id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const [items] = await pool.query(
    `SELECT order_id AS orderId, name_snapshot AS name, price_snapshot AS price, qty, note
     FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const itemsByOrder = new Map();
  for (const it of items) {
    if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
    itemsByOrder.get(it.orderId).push(it);
  }
  return orders.map((o) => ({ ...o, items: itemsByOrder.get(o.id) || [] }));
}

// ---- Pesanan aktif (untuk tab "Pesanan Masuk") ----
router.get('/orders', async (req, res) => {
  try {
    const [idRows] = await pool.query(
      `SELECT id FROM orders ORDER BY created_at DESC LIMIT 100`
    );
    const orders = await fetchOrdersByIds(idRows.map((r) => r.id));
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat pesanan.' });
  }
});

// ---- Riwayat pesanan dengan filter ----
router.get('/orders/history', async (req, res) => {
  try {
    const { status, from, to, tableId, page = 1, pageSize = 20 } = req.query;
    const where = [];
    const params = [];

    if (status) {
      where.push('o.status = ?');
      params.push(status);
    }
    if (from) {
      where.push('o.created_at >= ?');
      params.push(from + ' 00:00:00');
    }
    if (to) {
      where.push('o.created_at <= ?');
      params.push(to + ' 23:59:59');
    }
    if (tableId) {
      where.push('o.table_id = ?');
      params.push(tableId);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(100, parseInt(pageSize, 10) || 20);
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o ${whereSql}`,
      params
    );
    const [idRows] = await pool.query(
      `SELECT o.id FROM orders o ${whereSql} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const orders = await fetchOrdersByIds(idRows.map((r) => r.id));
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ orders, total: countRows[0].total, page: Number(page), pageSize: limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat riwayat pesanan.' });
  }
});

// ---- Update status pesanan ----
router.put('/orders/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'paid', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status tidak valid.' });
  }

  try {
    const [existingRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!existingRows[0]) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });

    const userId = req.session.user.id;
    const fieldMap = {
      confirmed: ['confirmed_by', 'confirmed_at'],
      paid: ['paid_by', 'paid_at'],
      completed: ['completed_by', 'completed_at'],
    };

    let extraSql = '';
    const params = [status];
    if (fieldMap[status]) {
      const [byField, atField] = fieldMap[status];
      extraSql = `, ${byField} = ?, ${atField} = NOW()`;
      params.push(userId);
    }

    await pool.query(`UPDATE orders SET status = ?${extraSql} WHERE id = ?`, [
      ...params,
      req.params.id,
    ]);

    const [order] = await fetchOrdersByIds([req.params.id]);
    const io = req.app.get('io');
    io.to('staff').emit('orderUpdated', order);
    io.to('staff').emit('tablesUpdated');

    res.json({ success: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal update status pesanan.' });
  }
});

// ---- Data struk untuk dicetak (dipakai oleh halaman print-receipt.html) ----
router.get('/orders/:id/receipt', async (req, res) => {
  try {
    const [order] = await fetchOrdersByIds([req.params.id]);
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });

    const [settingsRows] = await pool.query('SELECT `key`, `value` FROM settings');
    const settings = {};
    settingsRows.forEach((r) => { settings[r.key] = r.value; });

    res.json({ order, settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat data struk.' });
  }
});

module.exports = router;
