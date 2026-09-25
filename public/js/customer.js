(function () {
  const params = new URLSearchParams(window.location.search);
  const presetTableParam = params.get('table'); // QR mengarah ke ?table=3 -> nomor meja 3

  const state = {
    menu: [],
    tables: [],
    selectedTableId: null,
    cart: {}, // menuId -> { menuId, qty }
    activeCategory: 'Semua',
  };

  const menuListEl = document.getElementById('menuList');
  const tabsEl = document.getElementById('categoryTabs');
  const tableGridEl = document.getElementById('tableGrid');
  const tableIndicatorEl = document.getElementById('tableIndicator');
  const cartSummaryEl = document.getElementById('cartSummary');
  const sendBtn = document.getElementById('sendOrderBtn');
  const noteEl = document.getElementById('customerNote');
  const toastEl = document.getElementById('toast');

  function formatRupiah(n) {
    return 'Rp' + n.toLocaleString('id-ID');
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadMenu() {
    const res = await fetch('/api/menu');
    state.menu = await res.json();
    renderCategoryTabs();
    renderMenu();
  }

  async function loadTables() {
    const res = await fetch('/api/tables');
    state.tables = await res.json();

    if (state.selectedTableId === null && presetTableParam) {
      const matched = state.tables.find((t) => String(t.number) === presetTableParam);
      if (matched) state.selectedTableId = matched.id;
    }
    renderTables();
  }

  function renderCategoryTabs() {
    const categories = ['Semua', ...new Set(state.menu.map((m) => m.category))];
    tabsEl.innerHTML = '';
    categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (cat === state.activeCategory ? ' active' : '');
      btn.textContent = cat;
      btn.onclick = () => {
        state.activeCategory = cat;
        renderCategoryTabs();
        renderMenu();
      };
      tabsEl.appendChild(btn);
    });
  }

  function renderMenu() {
    const items =
      state.activeCategory === 'Semua'
        ? state.menu
        : state.menu.filter((m) => m.category === state.activeCategory);

    menuListEl.innerHTML = '';
    items.forEach((item) => {
      const qty = state.cart[item.id]?.qty || 0;
      const card = document.createElement('div');
      card.className = 'menu-card';
      card.innerHTML = `
        ${item.imageUrl
          ? `<img src="${escapeHtml(item.imageUrl)}" alt="" style="width:64px; height:64px; border-radius:10px; object-fit:cover; flex-shrink:0;" />`
          : ''}
        <div class="menu-info">
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.description || '')}</p>
          <div class="menu-price">${formatRupiah(item.price)}</div>
        </div>
        <div class="qty-control">
          <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
          <span class="qty-val" id="qty-${item.id}">${qty}</span>
          <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
        </div>
      `;
      menuListEl.appendChild(card);
    });

    menuListEl.querySelectorAll('.qty-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const action = btn.dataset.action;
        changeQty(id, action === 'inc' ? 1 : -1);
      });
    });
  }

  function changeQty(menuId, delta) {
    const current = state.cart[menuId]?.qty || 0;
    const next = Math.max(0, current + delta);
    if (next === 0) {
      delete state.cart[menuId];
    } else {
      state.cart[menuId] = { menuId, qty: next };
    }
    const qtyEl = document.getElementById(`qty-${menuId}`);
    if (qtyEl) qtyEl.textContent = next;
    updateCartSummary();
  }

  function updateCartSummary() {
    const entries = Object.values(state.cart);
    const totalQty = entries.reduce((s, e) => s + e.qty, 0);
    const totalPrice = entries.reduce((s, e) => {
      const menuItem = state.menu.find((m) => m.id === e.menuId);
      return s + (menuItem ? menuItem.price * e.qty : 0);
    }, 0);

    if (totalQty === 0) {
      cartSummaryEl.innerHTML = 'Keranjang kosong';
    } else {
      cartSummaryEl.innerHTML = `${totalQty} item — <b>${formatRupiah(totalPrice)}</b>`;
    }
    validateSendButton();
  }

  function renderTables() {
    tableGridEl.innerHTML = '';
    state.tables.forEach((t) => {
      const chip = document.createElement('div');
      const occupied = t.status === 'terisi' && t.id !== state.selectedTableId;
      chip.className =
        'table-chip' +
        (t.id === state.selectedTableId ? ' selected' : '') +
        (occupied ? ' occupied' : '');
      chip.textContent = t.number;
      if (!occupied) {
        chip.onclick = () => {
          state.selectedTableId = t.id;
          renderTables();
          updateTableIndicator();
          validateSendButton();
        };
      }
      tableGridEl.appendChild(chip);
    });
    updateTableIndicator();
  }

  function updateTableIndicator() {
    const t = state.tables.find((tb) => tb.id === state.selectedTableId);
    tableIndicatorEl.innerHTML = t
      ? `Meja <b>${t.number}</b> terpilih`
      : 'Silakan pilih nomor meja di bawah';
  }

  function validateSendButton() {
    const hasItems = Object.keys(state.cart).length > 0;
    const hasTable = state.selectedTableId !== null;
    sendBtn.disabled = !(hasItems && hasTable);
  }

  sendBtn.addEventListener('click', async () => {
    if (sendBtn.disabled) return;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Mengirim...';

    const items = Object.values(state.cart).map((e) => ({ menuId: e.menuId, qty: e.qty }));

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: state.selectedTableId,
          items,
          customerNote: noteEl.value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim pesanan');
      showOrderSuccess(data.order);
    } catch (err) {
      showToast(err.message);
      sendBtn.disabled = false;
      sendBtn.textContent = 'Kirim Pesanan';
    }
  });

  function showOrderSuccess(order) {
    document.body.innerHTML = `
      <div class="container" style="padding-top:70px; text-align:center;">
        <div style="font-size:48px;">✅</div>
        <h2 style="font-family:var(--serif); font-size:22px; margin-top:10px;">Pesanan Terkirim</h2>
        <p style="color:#6b6255; font-size:13.5px;">Meja ${order.tableNumber} · Kode Pesanan <b>${order.id}</b></p>
        <div style="text-align:left; margin-top:22px; border:1px solid #e7ded0; border-radius:14px; padding:16px;">
          <div class="order-items" style="color:#333;">
            ${order.items
              .map(
                (it) =>
                  `<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>${it.qty}x ${escapeHtml(
                    it.name
                  )}</span><span>${formatRupiah(it.price * it.qty)}</span></div>`
              )
              .join('')}
          </div>
          <div style="display:flex;justify-content:space-between;font-family:var(--serif);font-weight:600;border-top:1px dashed #ddd;padding-top:10px;margin-top:8px;">
            <span>Total</span><span>${formatRupiah(order.total)}</span>
          </div>
        </div>
        <p style="color:#6b6255; font-size:13px; margin-top:20px; line-height:1.6;">
          Pesanan Anda sedang diproses oleh kasir. Tunjukkan kode pesanan ini saat pembayaran jika diminta.
        </p>
        <button class="btn-primary" style="margin-top:8px; width:100%;" onclick="location.href=location.pathname">Pesan Lagi</button>
      </div>
    `;
  }

  (async function init() {
    await Promise.all([loadMenu(), loadTables()]);
    updateCartSummary();
  })();

  setInterval(loadTables, 10000);
})();
