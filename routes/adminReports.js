const express = require('express');
const ExcelJS = require('exceljs');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const PAID_STATUSES = ['paid', 'completed'];
const STATUS_LABEL_ID = {
  pending: 'Baru Masuk', confirmed: 'Dikonfirmasi', paid: 'Sudah Dibayar',
  completed: 'Selesai', cancelled: 'Dibatalkan',
};

// ---- Ringkasan kartu (hari ini, minggu ini, bulan ini) ----
router.get('/reports/summary', async (req, res) => {
  try {
    const statusesSql = PAID_STATUSES.map(() => '?').join(',');

    const [[today]] = await pool.query(
      `SELECT COUNT(*) AS orderCount, COALESCE(SUM(total),0) AS revenue
       FROM orders WHERE status IN (${statusesSql}) AND DATE(created_at) = CURDATE()`,
      PAID_STATUSES
    );
    const [[week]] = await pool.query(
      `SELECT COUNT(*) AS orderCount, COALESCE(SUM(total),0) AS revenue
       FROM orders WHERE status IN (${statusesSql}) AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)`,
      PAID_STATUSES
    );
    const [[month]] = await pool.query(
      `SELECT COUNT(*) AS orderCount, COALESCE(SUM(total),0) AS revenue
       FROM orders WHERE status IN (${statusesSql})
         AND YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())`,
      PAID_STATUSES
    );
    const [[pendingNow]] = await pool.query(
      `SELECT COUNT(*) AS count FROM orders WHERE status IN ('pending','confirmed')`
    );
    const [[avgOrder]] = await pool.query(
      `SELECT COALESCE(AVG(total),0) AS avgValue
       FROM orders WHERE status IN (${statusesSql}) AND DATE(created_at) = CURDATE()`,
      PAID_STATUSES
    );

    res.json({
      today: { orders: today.orderCount, revenue: Number(today.revenue) },
      week: { orders: week.orderCount, revenue: Number(week.revenue) },
      month: { orders: month.orderCount, revenue: Number(month.revenue) },
      pendingNow: pendingNow.count,
      avgOrderValueToday: Number(avgOrder.avgValue),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat ringkasan laporan.' });
  }
});

// ---- Tren pendapatan harian (untuk line chart) ----
router.get('/reports/revenue-trend', async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 14));
    const statusesSql = PAID_STATUSES.map(() => '?').join(',');

    const [rows] = await pool.query(
      `SELECT DATE(created_at) AS date, COALESCE(SUM(total),0) AS revenue, COUNT(*) AS orders
       FROM orders
       WHERE status IN (${statusesSql}) AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`,
      [...PAID_STATUSES, days - 1]
    );

    // Isi tanggal yang kosong dengan 0 supaya grafik tidak bolong
    const map = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = map.get(key);
      result.push({
        date: key,
        revenue: found ? Number(found.revenue) : 0,
        orders: found ? found.orders : 0,
      });
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat tren pendapatan.' });
  }
});

// ---- Menu terlaris (untuk bar chart) ----
router.get('/reports/top-items', async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8));
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const statusesSql = PAID_STATUSES.map(() => '?').join(',');

    const [rows] = await pool.query(
      `SELECT oi.name_snapshot AS name, SUM(oi.qty) AS totalQty,
              SUM(oi.qty * oi.price_snapshot) AS totalRevenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status IN (${statusesSql}) AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY oi.name_snapshot
       ORDER BY totalQty DESC
       LIMIT ?`,
      [...PAID_STATUSES, days, limit]
    );
    res.json(rows.map((r) => ({ ...r, totalRevenue: Number(r.totalRevenue) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat menu terlaris.' });
  }
});

// ---- Distribusi status pesanan (untuk donut chart) ----
router.get('/reports/status-breakdown', async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 14));
    const [rows] = await pool.query(
      `SELECT status, COUNT(*) AS count
       FROM orders
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY status`,
      [days]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat distribusi status.' });
  }
});

// ---- Jam ramai (untuk melihat jam sibuk restoran) ----
router.get('/reports/peak-hours', async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
    const statusesSql = PAID_STATUSES.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT HOUR(created_at) AS hour, COUNT(*) AS orders
       FROM orders
       WHERE status IN (${statusesSql}) AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY HOUR(created_at)
       ORDER BY hour ASC`,
      [...PAID_STATUSES, days]
    );
    const map = new Map(rows.map((r) => [r.hour, r.orders]));
    const result = [];
    for (let h = 0; h < 24; h++) {
      result.push({ hour: h, orders: map.get(h) || 0 });
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat jam ramai.' });
  }
});

// ---- Ekspor laporan penjualan ke Excel (.xlsx) ----
router.get('/reports/export', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const statusesSql = PAID_STATUSES.map(() => '?').join(',');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QR Ordering System';
    workbook.created = new Date();

    // ---- Sheet 1: Ringkasan ----
    const [[today]] = await pool.query(
      `SELECT COUNT(*) AS orderCount, COALESCE(SUM(total),0) AS revenue
       FROM orders WHERE status IN (${statusesSql}) AND DATE(created_at) = CURDATE()`,
      PAID_STATUSES
    );
    const [[periodTotal]] = await pool.query(
      `SELECT COUNT(*) AS orderCount, COALESCE(SUM(total),0) AS revenue
       FROM orders WHERE status IN (${statusesSql}) AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [...PAID_STATUSES, days]
    );

    const summarySheet = workbook.addWorksheet('Ringkasan');
    summarySheet.columns = [{ width: 32 }, { width: 24 }];
    summarySheet.addRows([
      ['Laporan Penjualan', ''],
      ['Dibuat pada', new Date().toLocaleString('id-ID')],
      ['Periode', `${days} hari terakhir`],
      [''],
      ['Pendapatan Hari Ini', Number(today.revenue)],
      ['Jumlah Pesanan Hari Ini', today.orderCount],
      [`Pendapatan ${days} Hari Terakhir`, Number(periodTotal.revenue)],
      [`Jumlah Pesanan ${days} Hari Terakhir`, periodTotal.orderCount],
    ]);
    summarySheet.getRow(1).font = { bold: true, size: 14 };
    ['A5', 'A6', 'A7', 'A8'].forEach((cell) => { summarySheet.getCell(cell).font = { bold: true }; });

    // ---- Sheet 2: Tren Pendapatan Harian ----
    const [trendRows] = await pool.query(
      `SELECT DATE(created_at) AS date, COALESCE(SUM(total),0) AS revenue, COUNT(*) AS orders
       FROM orders WHERE status IN (${statusesSql}) AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC`,
      [...PAID_STATUSES, days]
    );
    const trendSheet = workbook.addWorksheet('Tren Pendapatan');
    trendSheet.columns = [
      { header: 'Tanggal', key: 'date', width: 16 },
      { header: 'Jumlah Pesanan', key: 'orders', width: 16 },
      { header: 'Pendapatan (Rp)', key: 'revenue', width: 20 },
    ];
    trendRows.forEach((r) => trendSheet.addRow({
      date: new Date(r.date).toLocaleDateString('id-ID'),
      orders: r.orders,
      revenue: Number(r.revenue),
    }));
    trendSheet.getRow(1).font = { bold: true };

    // ---- Sheet 3: Menu Terlaris ----
    const [topItems] = await pool.query(
      `SELECT oi.name_snapshot AS name, SUM(oi.qty) AS totalQty, SUM(oi.qty * oi.price_snapshot) AS totalRevenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status IN (${statusesSql}) AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY oi.name_snapshot ORDER BY totalQty DESC`,
      [...PAID_STATUSES, days]
    );
    const topItemsSheet = workbook.addWorksheet('Menu Terlaris');
    topItemsSheet.columns = [
      { header: 'Nama Menu', key: 'name', width: 32 },
      { header: 'Porsi Terjual', key: 'qty', width: 16 },
      { header: 'Total Pendapatan (Rp)', key: 'revenue', width: 22 },
    ];
    topItems.forEach((r) => topItemsSheet.addRow({ name: r.name, qty: r.totalQty, revenue: Number(r.totalRevenue) }));
    topItemsSheet.getRow(1).font = { bold: true };

    // ---- Sheet 4: Riwayat Pesanan Detail ----
    const [historyOrders] = await pool.query(
      `SELECT o.id, t.number AS tableNumber, o.status, o.total, o.customer_note AS note, o.created_at AS createdAt
       FROM orders o JOIN dining_tables t ON t.id = o.table_id
       WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY o.created_at DESC`,
      [days]
    );
    const historySheet = workbook.addWorksheet('Riwayat Pesanan');
    historySheet.columns = [
      { header: 'Kode Pesanan', key: 'id', width: 14 },
      { header: 'Meja', key: 'table', width: 8 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Total (Rp)', key: 'total', width: 16 },
      { header: 'Catatan', key: 'note', width: 28 },
      { header: 'Waktu', key: 'time', width: 20 },
    ];
    historyOrders.forEach((o) => historySheet.addRow({
      id: o.id,
      table: o.tableNumber,
      status: STATUS_LABEL_ID[o.status] || o.status,
      total: Number(o.total),
      note: o.note || '',
      time: new Date(o.createdAt).toLocaleString('id-ID'),
    }));
    historySheet.getRow(1).font = { bold: true };

    const fileName = `laporan-penjualan-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membuat file Excel.' });
  }
});

module.exports = router;
