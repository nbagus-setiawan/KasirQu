const express = require('express');
const { nanoid } = require('nanoid');
const pool = require('../config/db');

const router = express.Router();

// ---- Menu (hanya yang tersedia) ----
router.get('/menu', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.id, m.name, m.description, m.price, m.image_url AS imageUrl,
              COALESCE(c.name, 'Lainnya') AS category
       FROM menu_items m
       LEFT JOIN categories c ON c.id = m.category_id
       WHERE m.available = 1
       ORDER BY c.sort_order ASC, m.name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat menu.' });
  }
});

// ---- Status meja (kosong / terisi berdasarkan pesanan aktif) ----
router.get('/tables', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.number,
              CASE WHEN EXISTS (
                SELECT 1 FROM orders o
                WHERE o.table_id = t.id AND o.status IN ('pending','confirmed')
              ) THEN 'terisi' ELSE 'kosong' END AS status
       FROM dining_tables t
       WHERE t.active = 1
       ORDER BY t.number ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat status meja.' });
  }
});

// ---- Pelanggan kirim pesanan (guest, tanpa login) ----
router.post('/orders', async (req, res) => {
  const { tableId, items, customerNote } = req.body;
  const io = req.app.get('io');

  if (!tableId) return res.status(400).json({ error: 'Nomor meja/kursi wajib dipilih.' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Keranjang pesanan tidak boleh kosong.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [tableRows] = await conn.query(
      'SELECT id, number FROM dining_tables WHERE id = ? AND active = 1',
      [tableId]
    );
    const table = tableRows[0];
    if (!table) {
      await conn.rollback();
      return res.status(400).json({ error: 'Meja tidak ditemukan.' });
    }

    const menuIds = items.map((i) => i.menuId);
    const [menuRows] = await conn.query(
      `SELECT id, name, price, available FROM menu_items WHERE id IN (${menuIds
        .map(() => '?')
        .join(',') || 'NULL'})`,
      menuIds
    );
    const menuMap = new Map(menuRows.map((m) => [m.id, m]));

    let total = 0;
    const validatedItems = [];
    for (const item of items) {
      const menuItem = menuMap.get(Number(item.menuId));
      if (!menuItem || !menuItem.available) {
        await conn.rollback();
        return res.status(400).json({ error: `Menu tidak tersedia: ${item.menuId}` });
      }
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);
      total += Number(menuItem.price) * qty;
      validatedItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: Number(menuItem.price),
        qty,
        note: (item.note || '').toString().slice(0, 200),
      });
    }

    const orderId = nanoid(8);
    await conn.query(
      `INSERT INTO orders (id, table_id, status, total, customer_note)
       VALUES (?, ?, 'pending', ?, ?)`,
      [orderId, table.id, total, (customerNote || '').toString().slice(0, 300)]
    );

    for (const it of validatedItems) {
      await conn.query(
        `INSERT INTO order_items (order_id, menu_item_id, name_snapshot, price_snapshot, qty, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, it.menuItemId, it.name, it.price, it.qty, it.note]
      );
    }

    await conn.commit();

    const newOrder = {
      id: orderId,
      tableId: table.id,
      tableNumber: table.number,
      items: validatedItems.map((it) => ({
        menuId: it.menuItemId,
        name: it.name,
        price: it.price,
        qty: it.qty,
        note: it.note,
      })),
      total,
      customerNote: (customerNote || '').toString().slice(0, 300),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    io.to('staff').emit('newOrder', newOrder);
    io.to('staff').emit('tablesUpdated');

    res.status(201).json({ success: true, order: newOrder });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Gagal mengirim pesanan.' });
  } finally {
    conn.release();
  }
});

// ---- Cek status pesanan (halaman "status pesanan saya") ----
router.get('/orders/:id', async (req, res) => {
  try {
    const [orderRows] = await pool.query(
      `SELECT o.id, o.status, o.total, o.customer_note AS customerNote, o.created_at AS createdAt,
              t.number AS tableNumber
       FROM orders o JOIN dining_tables t ON t.id = o.table_id
       WHERE o.id = ?`,
      [req.params.id]
    );
    const order = orderRows[0];
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });

    const [items] = await pool.query(
      `SELECT name_snapshot AS name, price_snapshot AS price, qty, note
       FROM order_items WHERE order_id = ?`,
      [req.params.id]
    );
    order.items = items;
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat pesanan.' });
  }
});

module.exports = router;
