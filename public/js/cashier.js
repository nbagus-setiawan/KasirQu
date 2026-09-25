(function () {
  // =====================================================================
  // Shared helpers
  // =====================================================================
  const toastEl = document.getElementById('toast');
  const modalRoot = document.getElementById('modalRoot');

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  function formatRupiah(n) {
    return 'Rp' + Math.round(n).toLocaleString('id-ID');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatDateTime(iso) {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      showLogin();
      throw new Error('Sesi berakhir, silakan login kembali.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.');
    return data;
  }

  function closeModal() {
    modalRoot.innerHTML = '';
  }

  function openModal(innerHtml) {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="modalBackdrop">
        <div class="modal-sheet">${innerHtml}</div>
      </div>
    `;
    document.getElementById('modalBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modalBackdrop') closeModal();
    });
  }

  // =====================================================================
  // Auth
  // =====================================================================
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

  let currentUser = null;
  let socket = null;

  function showLogin() {
    loginScreen.style.display = 'flex';
    dashboard.style.display = 'none';
    if (socket) { socket.disconnect(); socket = null; }
  }

  async function checkSession() {
    const data = await fetch('/api/session').then((r) => r.json());
    if (data.isAuthenticated) {
      currentUser = data.user;
      enterDashboard();
    } else {
      showLogin();
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    try {
      const data = await api('POST', '/api/login', { username, password });
      currentUser = data.user;
      enterDashboard();
    } catch (err) {
      loginError.textContent = err.message;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await api('POST', '/api/logout');
    currentUser = null;
    showLogin();
  });

  function enterDashboard() {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'block';
    document.getElementById('userFullName').textContent = currentUser.fullName;
    document.getElementById('userRole').textContent = currentUser.role === 'admin' ? 'Admin' : 'Kasir';
    document.querySelectorAll('.admin-only').forEach((el) => {
      el.style.display = currentUser.role === 'admin' ? '' : 'none';
    });
    connectSocket();
    switchTab('orders');
  }

  function connectSocket() {
    if (socket) return;
    socket = io();
    socket.on('connect', () => socket.emit('joinStaffRoom'));
    socket.on('newOrder', (order) => {
      ordersState.orders.unshift(order);
      renderOrders();
      showToast(`🛎️ Pesanan baru — Meja ${order.tableNumber}`);
      if (navigator.vibrate) navigator.vibrate(200);
    });
    socket.on('orderUpdated', (updated) => {
      const idx = ordersState.orders.findIndex((o) => o.id === updated.id);
      if (idx >= 0) ordersState.orders[idx] = updated;
      renderOrders();
    });
    socket.on('tablesUpdated', () => {
      if (activeTab === 'seats') loadSeats();
    });
  }

  // =====================================================================
  // Tab navigation
  // =====================================================================
  let activeTab = 'orders';

  const tabLoaders = {
    orders: loadOrders,
    seats: loadSeats,
    reports: loadReports,
    history: loadHistory,
    menu: loadMenu,
    tables: loadTables,
    users: loadUsers,
    settings: loadSettings,
  };

  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  function switchTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.nav-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.style.display = p.id === `panel-${tabName}` ? 'block' : 'none';
    });
    tabLoaders[tabName]();
  }

  // =====================================================================
  // TAB: Pesanan Masuk (realtime)
  // =====================================================================
  const ordersState = { orders: [] };
  const STATUS_LABEL = {
    pending: 'Baru Masuk', confirmed: 'Dikonfirmasi', paid: 'Sudah Dibayar',
    completed: 'Selesai', cancelled: 'Dibatalkan',
  };

  async function loadOrders() {
    const panel = document.getElementById('panel-orders');
    panel.innerHTML = `<div class="empty-state">Memuat pesanan...</div>`;
    try {
      ordersState.orders = await api('GET', '/api/admin/orders');
      renderOrders();
    } catch (err) { showToast(err.message); }
  }

  function renderOrders() {
    const panel = document.getElementById('panel-orders');
    const active = ordersState.orders.filter((o) => !['completed', 'cancelled'].includes(o.status));
    const others = ordersState.orders.filter((o) => ['completed', 'cancelled'].includes(o.status)).slice(0, 15);
    const ordered = [...active, ...others];

    if (ordered.length === 0) {
      panel.innerHTML = `<div class="empty-state">Belum ada pesanan masuk.<br/>Pesanan dari pelanggan akan muncul di sini secara realtime.</div>`;
      return;
    }
    panel.innerHTML = ordered.map(renderOrderCard).join('');
    panel.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => updateOrderStatus(btn.dataset.id, btn.dataset.action));
    });
    attachPrintHandlers(panel);
  }

  function renderOrderCard(order) {
    const itemsHtml = order.items
      .map((it) => `<div><span>${it.qty}x ${escapeHtml(it.name)}</span><span>${formatRupiah(it.price * it.qty)}</span></div>`)
      .join('');

    let actions = '';
    if (order.status === 'pending') {
      actions = `<button class="btn-sm btn-confirm" data-action="confirmed" data-id="${order.id}">Konfirmasi</button>
                 <button class="btn-sm btn-cancel" data-action="cancelled" data-id="${order.id}">Batalkan</button>`;
    } else if (order.status === 'confirmed') {
      actions = `<button class="btn-sm btn-paid" data-action="paid" data-id="${order.id}">Tandai Dibayar</button>
                 <button class="btn-sm btn-cancel" data-action="cancelled" data-id="${order.id}">Batalkan</button>`;
    } else if (order.status === 'paid') {
      actions = `<button class="btn-sm btn-complete" data-action="completed" data-id="${order.id}">Selesaikan</button>`;
    }
    if (['confirmed', 'paid', 'completed'].includes(order.status)) {
      actions += `<button class="btn-sm" style="background:var(--paper-dim); color:#14110f;" data-print="${order.id}">🖨️ Struk</button>`;
    }

    return `
      <div class="order-card status-${order.status}">
        <div class="order-card-head">
          <span class="order-table-num">Meja ${order.tableNumber}</span>
          <span class="status-pill status-${order.status}">${STATUS_LABEL[order.status]}</span>
        </div>
        <div class="order-meta" style="margin-bottom:8px;">${formatDateTime(order.createdAt)} · #${order.id}</div>
        <div class="order-items">${itemsHtml}</div>
        ${order.customerNote ? `<div class="order-note">Catatan: ${escapeHtml(order.customerNote)}</div>` : ''}
        <div class="order-total"><span>Total</span><span>${formatRupiah(order.total)}</span></div>
        ${actions ? `<div class="order-actions">${actions}</div>` : ''}
      </div>
    `;
  }

  function attachPrintHandlers(container) {
    container.querySelectorAll('[data-print]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.open(`/print-receipt.html?order=${btn.dataset.print}`, '_blank');
      });
    });
  }

  async function updateOrderStatus(orderId, status) {
    try {
      const data = await api('PUT', `/api/admin/orders/${orderId}/status`, { status });
      const idx = ordersState.orders.findIndex((o) => o.id === orderId);
      if (idx >= 0) ordersState.orders[idx] = data.order;
      renderOrders();
    } catch (err) { showToast(err.message); }
  }

  // =====================================================================
  // TAB: Status Meja
  // =====================================================================
  async function loadSeats() {
    const panel = document.getElementById('panel-seats');
    try {
      const tables = await api('GET', '/api/tables');
      panel.innerHTML = `
        <div class="seat-grid">
          ${tables.map((t) => `<div class="seat-cell ${t.status === 'terisi' ? 'occupied' : ''}">${t.number}</div>`).join('')}
        </div>
        <p style="color:var(--paper-dim); font-size:13px; margin-top:16px;">
          Meja berwarna violet = sedang terisi (ada pesanan aktif). Meja gelap = kosong.
        </p>
      `;
    } catch (err) { showToast(err.message); }
  }

  // =====================================================================
  // TAB: Laporan Penjualan (charts)
  // =====================================================================
  let revenueChart = null, topItemsChart = null, statusChart = null, peakHoursChart = null;

  async function loadReports() {
    const panel = document.getElementById('panel-reports');
    panel.innerHTML = `<div class="empty-state">Memuat laporan...</div>`;
    try {
      const [summary, trend, topItems, statusBreakdown, peakHours] = await Promise.all([
        api('GET', '/api/admin/reports/summary'),
        api('GET', '/api/admin/reports/revenue-trend?days=14'),
        api('GET', '/api/admin/reports/top-items?limit=8&days=30'),
        api('GET', '/api/admin/reports/status-breakdown?days=14'),
        api('GET', '/api/admin/reports/peak-hours?days=30'),
      ]);

      panel.innerHTML = `
        <div class="data-toolbar">
          <select id="exportDays">
            <option value="7">7 hari terakhir</option>
            <option value="14" selected>14 hari terakhir</option>
            <option value="30">30 hari terakhir</option>
            <option value="90">90 hari terakhir</option>
          </select>
          <button class="btn-add" id="exportExcelBtn">📊 Ekspor ke Excel</button>
        </div>
        <div class="stat-grid">
          <div class="stat-card"><div class="label">Pendapatan Hari Ini</div><div class="value saffron">${formatRupiah(summary.today.revenue)}</div></div>
          <div class="stat-card"><div class="label">Pesanan Hari Ini</div><div class="value">${summary.today.orders}</div></div>
          <div class="stat-card"><div class="label">Pendapatan Minggu Ini</div><div class="value teal">${formatRupiah(summary.week.revenue)}</div></div>
          <div class="stat-card"><div class="label">Pendapatan Bulan Ini</div><div class="value teal">${formatRupiah(summary.month.revenue)}</div></div>
        </div>
        <div class="stat-grid">
          <div class="stat-card"><div class="label">Rata-rata / Pesanan (hari ini)</div><div class="value">${formatRupiah(summary.avgOrderValueToday)}</div></div>
          <div class="stat-card"><div class="label">Pesanan Aktif Sekarang</div><div class="value saffron">${summary.pendingNow}</div></div>
        </div>

        <div class="panel">
          <h2>Tren Pendapatan (14 hari terakhir)</h2>
          <div class="panel-sub">Total pendapatan dari pesanan berstatus dibayar/selesai per hari.</div>
          <canvas id="revenueChartCanvas" height="180"></canvas>
        </div>

        <div class="panel">
          <h2>Menu Terlaris (30 hari terakhir)</h2>
          <div class="panel-sub">Diurutkan berdasarkan jumlah porsi terjual.</div>
          <canvas id="topItemsCanvas" height="220"></canvas>
        </div>

        <div class="panel">
          <h2>Jam Ramai</h2>
          <div class="panel-sub">Distribusi jumlah pesanan berdasarkan jam masuk (30 hari terakhir).</div>
          <canvas id="peakHoursCanvas" height="180"></canvas>
        </div>

        <div class="panel">
          <h2>Distribusi Status Pesanan</h2>
          <div class="panel-sub">Semua pesanan 14 hari terakhir menurut status akhirnya.</div>
          <canvas id="statusChartCanvas" height="200"></canvas>
        </div>
      `;

      renderRevenueChart(trend);
      renderTopItemsChart(topItems);
      renderPeakHoursChart(peakHours);
      renderStatusChart(statusBreakdown);

      document.getElementById('exportExcelBtn').addEventListener('click', exportExcel);
    } catch (err) {
      panel.innerHTML = `<div class="empty-state">Gagal memuat laporan: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function exportExcel() {
    const btn = document.getElementById('exportExcelBtn');
    const days = document.getElementById('exportDays').value;
    const originalText = btn.textContent;
    btn.textContent = 'Menyiapkan file...';
    btn.disabled = true;
    try {
      const res = await fetch(`/api/admin/reports/export?days=${days}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Gagal mengekspor laporan.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-penjualan-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Laporan Excel berhasil diunduh.');
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  function chartTextColor() { return '#c7b6d9'; }
  function chartGridColor() { return 'rgba(199,182,217,0.14)'; }

  function renderRevenueChart(trend) {
    if (revenueChart) revenueChart.destroy();
    const ctx = document.getElementById('revenueChartCanvas');
    revenueChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trend.map((d) => new Date(d.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })),
        datasets: [{
          label: 'Pendapatan',
          data: trend.map((d) => d.revenue),
          borderColor: '#EE82EE',
          backgroundColor: 'rgba(238,130,238,0.16)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#EE82EE',
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: chartTextColor() }, grid: { color: chartGridColor() } },
          y: { ticks: { color: chartTextColor(), callback: (v) => 'Rp' + (v / 1000) + 'rb' }, grid: { color: chartGridColor() } },
        },
      },
    });
  }

  function renderTopItemsChart(items) {
    if (topItemsChart) topItemsChart.destroy();
    const ctx = document.getElementById('topItemsCanvas');
    topItemsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: items.map((i) => i.name),
        datasets: [{ label: 'Terjual', data: items.map((i) => i.totalQty), backgroundColor: '#B23FB2', borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: chartTextColor() }, grid: { color: chartGridColor() } },
          y: { ticks: { color: chartTextColor() }, grid: { display: false } },
        },
      },
    });
  }

  function renderPeakHoursChart(hours) {
    if (peakHoursChart) peakHoursChart.destroy();
    const ctx = document.getElementById('peakHoursCanvas');
    peakHoursChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: hours.map((h) => `${String(h.hour).padStart(2, '0')}:00`),
        datasets: [{ label: 'Pesanan', data: hours.map((h) => h.orders), backgroundColor: '#F3AB3D', borderRadius: 3 }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: chartTextColor(), maxRotation: 0, autoSkip: true }, grid: { display: false } },
          y: { ticks: { color: chartTextColor(), stepSize: 1 }, grid: { color: chartGridColor() } },
        },
      },
    });
  }

  function renderStatusChart(breakdown) {
    if (statusChart) statusChart.destroy();
    const ctx = document.getElementById('statusChartCanvas');
    const colors = { pending: '#F3AB3D', confirmed: '#5F9CF5', paid: '#2FC39F', completed: '#B6A6C9', cancelled: '#FF5C7A' };
    statusChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: breakdown.map((b) => STATUS_LABEL[b.status] || b.status),
        datasets: [{ data: breakdown.map((b) => b.count), backgroundColor: breakdown.map((b) => colors[b.status] || '#999') }],
      },
      options: { plugins: { legend: { position: 'bottom', labels: { color: chartTextColor() } } } },
    });
  }

  // =====================================================================
  // TAB: Riwayat Pesanan
  // =====================================================================
  const historyState = { page: 1, pageSize: 15, status: '', from: '', to: '' };

  async function loadHistory() {
    const panel = document.getElementById('panel-history');
    panel.innerHTML = `
      <div class="data-toolbar">
        <select id="histStatus">
          <option value="">Semua status</option>
          <option value="pending">Baru Masuk</option>
          <option value="confirmed">Dikonfirmasi</option>
          <option value="paid">Sudah Dibayar</option>
          <option value="completed">Selesai</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
        <input type="date" id="histFrom" />
        <input type="date" id="histTo" />
      </div>
      <div id="historyList"><div class="empty-state">Memuat riwayat...</div></div>
      <div id="historyPager" style="display:flex; gap:8px; justify-content:center; margin-top:14px;"></div>
    `;

    document.getElementById('histStatus').value = historyState.status;
    document.getElementById('histFrom').value = historyState.from;
    document.getElementById('histTo').value = historyState.to;

    ['histStatus', 'histFrom', 'histTo'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => {
        historyState.status = document.getElementById('histStatus').value;
        historyState.from = document.getElementById('histFrom').value;
        historyState.to = document.getElementById('histTo').value;
        historyState.page = 1;
        fetchHistory();
      });
    });

    fetchHistory();
  }

  async function fetchHistory() {
    const listEl = document.getElementById('historyList');
    const pagerEl = document.getElementById('historyPager');
    listEl.innerHTML = `<div class="empty-state">Memuat riwayat...</div>`;
    try {
      const qs = new URLSearchParams({
        page: historyState.page, pageSize: historyState.pageSize,
        status: historyState.status, from: historyState.from, to: historyState.to,
      });
      const data = await api('GET', `/api/admin/orders/history?${qs.toString()}`);

      if (data.orders.length === 0) {
        listEl.innerHTML = `<div class="empty-state">Tidak ada pesanan yang cocok dengan filter ini.</div>`;
        pagerEl.innerHTML = '';
        return;
      }

      listEl.innerHTML = data.orders.map(renderOrderCard).join('');
      listEl.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await updateOrderStatus(btn.dataset.id, btn.dataset.action);
          fetchHistory();
        });
      });
      attachPrintHandlers(listEl);

      const totalPages = Math.max(1, Math.ceil(data.total / historyState.pageSize));
      pagerEl.innerHTML = `
        <button class="icon-btn" id="prevPage" ${historyState.page <= 1 ? 'disabled' : ''}>← Sebelumnya</button>
        <span style="align-self:center; font-size:12.5px; color:var(--paper-dim);">Halaman ${historyState.page} / ${totalPages}</span>
        <button class="icon-btn" id="nextPage" ${historyState.page >= totalPages ? 'disabled' : ''}>Berikutnya →</button>
      `;
      const prevBtn = document.getElementById('prevPage');
      const nextBtn = document.getElementById('nextPage');
      if (prevBtn) prevBtn.addEventListener('click', () => { historyState.page--; fetchHistory(); });
      if (nextBtn) nextBtn.addEventListener('click', () => { historyState.page++; fetchHistory(); });
    } catch (err) {
      listEl.innerHTML = `<div class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</div>`;
    }
  }

  // =====================================================================
  // TAB: Kelola Menu
  // =====================================================================
  let categoriesCache = [];

  async function loadMenu() {
    const panel = document.getElementById('panel-menu');
    panel.innerHTML = `<div class="empty-state">Memuat menu...</div>`;
    try {
      const [items, categories] = await Promise.all([
        api('GET', '/api/admin/menu'),
        api('GET', '/api/admin/categories'),
      ]);
      categoriesCache = categories;

      panel.innerHTML = `
        <div class="data-toolbar">
          <button class="icon-btn" id="manageCategoriesBtn">Kelola Kategori</button>
          <button class="btn-add" id="addMenuBtn">+ Tambah Menu</button>
        </div>
        <div id="menuManageList"></div>
      `;
      renderMenuList(items);
      document.getElementById('addMenuBtn').addEventListener('click', () => openMenuForm());
      document.getElementById('manageCategoriesBtn').addEventListener('click', openCategoryManager);
    } catch (err) {
      panel.innerHTML = `<div class="empty-state">Gagal memuat menu: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderMenuList(items) {
    const listEl = document.getElementById('menuManageList');
    if (items.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Belum ada menu. Tambahkan menu pertama Anda.</div>`;
      return;
    }
    listEl.innerHTML = items.map((item) => `
      <div class="data-row">
        ${item.image_url
          ? `<img src="${escapeHtml(item.image_url)}" alt="" style="width:46px; height:46px; border-radius:8px; object-fit:cover; flex-shrink:0;" />`
          : `<div style="width:46px; height:46px; border-radius:8px; background:var(--ink); flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:18px;">🍽️</div>`
        }
        <div class="main">
          <div class="title">${escapeHtml(item.name)}</div>
          <div class="sub">${escapeHtml(item.categoryName || 'Tanpa kategori')} · ${formatRupiah(item.price)}</div>
        </div>
        <div class="actions">
          <button class="toggle-pill ${item.available ? 'on' : 'off'}" data-id="${item.id}" data-action="toggle">${item.available ? 'Tersedia' : 'Habis'}</button>
          <button class="icon-btn" data-id="${item.id}" data-action="edit">Ubah</button>
          <button class="icon-btn danger" data-id="${item.id}" data-action="delete">Hapus</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const item = items.find((i) => i.id == btn.dataset.id);
        try {
          await api('PUT', `/api/admin/menu/${item.id}`, { available: !item.available });
          loadMenu();
        } catch (err) { showToast(err.message); }
      });
    });
    listEl.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = items.find((i) => i.id == btn.dataset.id);
        openMenuForm(item);
      });
    });
    listEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Hapus menu ini? Tindakan ini tidak bisa dibatalkan.')) return;
        try {
          await api('DELETE', `/api/admin/menu/${btn.dataset.id}`);
          loadMenu();
          showToast('Menu dihapus.');
        } catch (err) { showToast(err.message); }
      });
    });
  }

  function openMenuForm(item) {
    const isEdit = !!item;
    let currentImageUrl = item ? item.image_url : null;
    const categoryOptions = categoriesCache.map((c) =>
      `<option value="${c.id}" ${item && item.category_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    ).join('');

    openModal(`
      <h2>${isEdit ? 'Ubah Menu' : 'Tambah Menu Baru'}</h2>
      <form id="menuForm">
        <div class="field">
          <label>Foto Menu (opsional, maks 2MB — JPG/PNG/WEBP)</label>
          <div id="imagePreviewWrap" style="margin-bottom:8px;">
            ${currentImageUrl ? `<img id="imagePreview" src="${escapeHtml(currentImageUrl)}" style="width:100%; max-width:220px; border-radius:10px; display:block;" />` : `<div id="imagePreview" style="width:100%; max-width:220px; height:120px; border-radius:10px; background:var(--ink); display:flex; align-items:center; justify-content:center; font-size:26px;">🍽️</div>`}
          </div>
          <input type="file" id="mImageFile" accept="image/jpeg,image/png,image/webp" />
          <div id="uploadStatus" style="font-size:12px; color:var(--paper-dim); margin-top:4px;"></div>
        </div>
        <div class="field"><label>Nama Menu</label><input type="text" id="mName" value="${item ? escapeHtml(item.name) : ''}" required /></div>
        <div class="field"><label>Kategori</label><select id="mCategory"><option value="">Tanpa kategori</option>${categoryOptions}</select></div>
        <div class="field"><label>Harga (Rp)</label><input type="number" id="mPrice" min="0" value="${item ? item.price : ''}" required /></div>
        <div class="field"><label>Deskripsi</label><textarea id="mDesc" rows="2">${item ? escapeHtml(item.description || '') : ''}</textarea></div>
        <div class="checkbox-row">
          <input type="checkbox" id="mAvailable" ${!item || item.available ? 'checked' : ''} />
          <label for="mAvailable">Tersedia untuk dipesan</label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="cancelMenuForm">Batal</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Simpan Perubahan' : 'Tambah Menu'}</button>
        </div>
      </form>
    `);

    document.getElementById('cancelMenuForm').addEventListener('click', closeModal);

    document.getElementById('mImageFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const statusEl = document.getElementById('uploadStatus');
      statusEl.textContent = 'Mengunggah gambar...';
      const formData = new FormData();
      formData.append('image', file);
      try {
        const res = await fetch('/api/admin/menu/upload-image', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal mengunggah gambar.');
        currentImageUrl = data.url;
        document.getElementById('imagePreviewWrap').innerHTML = `<img id="imagePreview" src="${escapeHtml(data.url)}" style="width:100%; max-width:220px; border-radius:10px; display:block;" />`;
        statusEl.textContent = 'Gambar berhasil diunggah.';
      } catch (err) {
        statusEl.textContent = err.message;
      }
    });

    document.getElementById('menuForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('mName').value,
        categoryId: document.getElementById('mCategory').value ? Number(document.getElementById('mCategory').value) : null,
        price: Number(document.getElementById('mPrice').value),
        description: document.getElementById('mDesc').value,
        available: document.getElementById('mAvailable').checked,
        imageUrl: currentImageUrl,
      };
      try {
        if (isEdit) await api('PUT', `/api/admin/menu/${item.id}`, payload);
        else await api('POST', '/api/admin/menu', payload);
        closeModal();
        showToast(isEdit ? 'Menu diperbarui.' : 'Menu ditambahkan.');
        loadMenu();
      } catch (err) { showToast(err.message); }
    });
  }

  function openCategoryManager() {
    openModal(`
      <h2>Kelola Kategori</h2>
      <div id="categoryList" style="margin-bottom:16px;"></div>
      <form id="categoryForm" style="display:flex; gap:8px;">
        <input type="text" id="newCategoryName" placeholder="Nama kategori baru" style="flex:1; padding:11px; border-radius:8px; border:1.5px solid var(--border); background:var(--ink); color:var(--paper);" required />
        <button type="submit" class="btn-primary" style="width:auto; padding:11px 18px;">Tambah</button>
      </form>
      <div class="modal-actions"><button type="button" class="btn-secondary" id="closeCatManager">Tutup</button></div>
    `);

    function renderCatList() {
      document.getElementById('categoryList').innerHTML = categoriesCache.map((c) => `
        <div class="data-row">
          <div class="main"><div class="title">${escapeHtml(c.name)}</div></div>
          <div class="actions"><button class="icon-btn danger" data-id="${c.id}">Hapus</button></div>
        </div>
      `).join('') || `<div class="empty-state" style="padding:20px;">Belum ada kategori.</div>`;

      document.querySelectorAll('#categoryList [data-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Hapus kategori ini? Menu yang memakainya akan jadi "Tanpa kategori".')) return;
          try {
            await api('DELETE', `/api/admin/categories/${btn.dataset.id}`);
            categoriesCache = await api('GET', '/api/admin/categories');
            renderCatList();
            showToast('Kategori dihapus.');
          } catch (err) { showToast(err.message); }
        });
      });
    }
    renderCatList();

    document.getElementById('closeCatManager').addEventListener('click', closeModal);
    document.getElementById('categoryForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('newCategoryName');
      try {
        await api('POST', '/api/admin/categories', { name: nameInput.value });
        nameInput.value = '';
        categoriesCache = await api('GET', '/api/admin/categories');
        renderCatList();
        showToast('Kategori ditambahkan.');
      } catch (err) { showToast(err.message); }
    });
  }

  // =====================================================================
  // TAB: Kelola Meja
  // =====================================================================
  async function loadTables() {
    const panel = document.getElementById('panel-tables');
    panel.innerHTML = `<div class="empty-state">Memuat data meja...</div>`;
    try {
      const tables = await api('GET', '/api/admin/tables');
      panel.innerHTML = `
        <div class="data-toolbar"><button class="btn-add" id="addTableBtn">+ Tambah Meja</button></div>
        <div id="tableManageList"></div>
      `;
      renderTableList(tables);
      document.getElementById('addTableBtn').addEventListener('click', openTableForm);
    } catch (err) {
      panel.innerHTML = `<div class="empty-state">Gagal memuat meja: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderTableList(tables) {
    const listEl = document.getElementById('tableManageList');
    listEl.innerHTML = tables.map((t) => `
      <div class="data-row">
        <div class="main">
          <div class="title">Meja ${t.number}</div>
          <div class="sub">${t.status === 'terisi' ? 'Sedang terisi' : 'Kosong'}</div>
        </div>
        <div class="actions">
          <button class="toggle-pill ${t.active ? 'on' : 'off'}" data-id="${t.id}" data-active="${t.active}" data-action="toggle">${t.active ? 'Aktif' : 'Nonaktif'}</button>
          <button class="icon-btn danger" data-id="${t.id}" data-action="delete">Hapus</button>
        </div>
      </div>
    `).join('') || `<div class="empty-state">Belum ada meja.</div>`;

    listEl.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api('PUT', `/api/admin/tables/${btn.dataset.id}`, { active: btn.dataset.active !== 'true' && btn.dataset.active !== '1' });
          loadTables();
        } catch (err) { showToast(err.message); }
      });
    });
    listEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Hapus meja ini?')) return;
        try {
          await api('DELETE', `/api/admin/tables/${btn.dataset.id}`);
          loadTables();
          showToast('Meja dihapus.');
        } catch (err) { showToast(err.message); }
      });
    });
  }

  function openTableForm() {
    openModal(`
      <h2>Tambah Meja Baru</h2>
      <form id="tableForm">
        <div class="field"><label>Nomor Meja</label><input type="number" id="tNumber" min="1" required /></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="cancelTableForm">Batal</button>
          <button type="submit" class="btn-primary">Tambah</button>
        </div>
      </form>
    `);
    document.getElementById('cancelTableForm').addEventListener('click', closeModal);
    document.getElementById('tableForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('POST', '/api/admin/tables', { number: Number(document.getElementById('tNumber').value) });
        closeModal();
        showToast('Meja ditambahkan.');
        loadTables();
      } catch (err) { showToast(err.message); }
    });
  }

  // =====================================================================
  // TAB: Kelola User (admin only)
  // =====================================================================
  async function loadUsers() {
    if (currentUser.role !== 'admin') return;
    const panel = document.getElementById('panel-users');
    panel.innerHTML = `<div class="empty-state">Memuat user...</div>`;
    try {
      const users = await api('GET', '/api/admin/users');
      panel.innerHTML = `
        <div class="data-toolbar"><button class="btn-add" id="addUserBtn">+ Tambah User</button></div>
        <div id="userManageList"></div>
      `;
      renderUserList(users);
      document.getElementById('addUserBtn').addEventListener('click', () => openUserForm());
    } catch (err) {
      panel.innerHTML = `<div class="empty-state">Gagal memuat user: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderUserList(users) {
    const listEl = document.getElementById('userManageList');
    listEl.innerHTML = users.map((u) => `
      <div class="data-row">
        <div class="main">
          <div class="title">${escapeHtml(u.fullName)} <span style="color:var(--paper-dim); font-weight:400;">· ${u.username}</span></div>
          <div class="sub">${u.role === 'admin' ? 'Admin' : 'Kasir'}</div>
        </div>
        <div class="actions">
          <button class="toggle-pill ${u.active ? 'on' : 'off'}" data-id="${u.id}" data-active="${u.active}" data-action="toggle" ${u.id === currentUser.id ? 'disabled' : ''}>${u.active ? 'Aktif' : 'Nonaktif'}</button>
          <button class="icon-btn" data-id="${u.id}" data-action="edit">Ubah</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api('PUT', `/api/admin/users/${btn.dataset.id}`, { active: btn.dataset.active !== 'true' && btn.dataset.active !== '1' });
          loadUsers();
        } catch (err) { showToast(err.message); }
      });
    });
    listEl.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = users.find((x) => x.id == btn.dataset.id);
        openUserForm(u);
      });
    });
  }

  function openUserForm(user) {
    const isEdit = !!user;
    openModal(`
      <h2>${isEdit ? 'Ubah User' : 'Tambah User Baru'}</h2>
      <form id="userForm">
        ${!isEdit ? `<div class="field"><label>Username</label><input type="text" id="uUsername" required /></div>` : ''}
        <div class="field"><label>Nama Lengkap</label><input type="text" id="uFullName" value="${user ? escapeHtml(user.fullName) : ''}" required /></div>
        <div class="field"><label>Peran</label>
          <select id="uRole">
            <option value="kasir" ${user && user.role === 'kasir' ? 'selected' : ''}>Kasir</option>
            <option value="admin" ${user && user.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
        <div class="field"><label>${isEdit ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password'}</label><input type="password" id="uPassword" ${isEdit ? '' : 'required'} minlength="6" /></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="cancelUserForm">Batal</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Simpan' : 'Tambah'}</button>
        </div>
      </form>
    `);
    document.getElementById('cancelUserForm').addEventListener('click', closeModal);
    document.getElementById('userForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('uPassword').value;
      try {
        if (isEdit) {
          const payload = { fullName: document.getElementById('uFullName').value, role: document.getElementById('uRole').value };
          if (password) payload.password = password;
          await api('PUT', `/api/admin/users/${user.id}`, payload);
        } else {
          await api('POST', '/api/admin/users', {
            username: document.getElementById('uUsername').value,
            fullName: document.getElementById('uFullName').value,
            role: document.getElementById('uRole').value,
            password,
          });
        }
        closeModal();
        showToast(isEdit ? 'User diperbarui.' : 'User ditambahkan.');
        loadUsers();
      } catch (err) { showToast(err.message); }
    });
  }

  // =====================================================================
  // TAB: Pengaturan Restoran (admin only) — dipakai di kop struk cetak
  // =====================================================================
  async function loadSettings() {
    if (currentUser.role !== 'admin') return;
    const panel = document.getElementById('panel-settings');
    panel.innerHTML = `<div class="empty-state">Memuat pengaturan...</div>`;
    try {
      const settings = await api('GET', '/api/admin/settings');
      panel.innerHTML = `
        <div class="panel">
          <h2>Informasi Restoran</h2>
          <div class="panel-sub">Muncul di kop struk yang dicetak untuk pelanggan.</div>
          <form id="settingsForm">
            <div class="field"><label>Nama Restoran</label><input type="text" id="sName" value="${escapeHtml(settings.restaurant_name || '')}" /></div>
            <div class="field"><label>Alamat</label><input type="text" id="sAddress" value="${escapeHtml(settings.restaurant_address || '')}" /></div>
            <div class="field"><label>Nomor Telepon</label><input type="text" id="sPhone" value="${escapeHtml(settings.restaurant_phone || '')}" /></div>
            <div class="field"><label>Pesan Penutup Struk</label><input type="text" id="sFooter" value="${escapeHtml(settings.receipt_footer || '')}" /></div>
            <button type="submit" class="btn-primary" style="width:100%;">Simpan Pengaturan</button>
          </form>
        </div>
      `;
      document.getElementById('settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api('PUT', '/api/admin/settings', {
            restaurant_name: document.getElementById('sName').value,
            restaurant_address: document.getElementById('sAddress').value,
            restaurant_phone: document.getElementById('sPhone').value,
            receipt_footer: document.getElementById('sFooter').value,
          });
          showToast('Pengaturan disimpan.');
        } catch (err) { showToast(err.message); }
      });
    } catch (err) {
      panel.innerHTML = `<div class="empty-state">Gagal memuat pengaturan: ${escapeHtml(err.message)}</div>`;
    }
  }

  // =====================================================================
  // Init
  // =====================================================================
  checkSession();
})();