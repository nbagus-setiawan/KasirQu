(function () {
  const params = new URLSearchParams(window.location.search);
  const presetTableParam = params.get('table'); // QR mengarah ke ?table=3 -> nomor meja 3

  const state = {
    menu: [],
    tables: [],
    selectedTableId: null,
    cart: {}, // menuId -> { menuId, qty }
    activeCategory: 'Semua',
    menuLoaded: false,
    tablesLoaded: false,
  };

  // ---- Elemen: step 1 (pilih meja) ----
  const tablePickerScreen = document.getElementById('tablePickerScreen');
  const tableGridPicker = document.getElementById('tableGridPicker');

  // ---- Elemen: step 2 (menu) ----
  const orderingScreen = document.getElementById('orderingScreen');
  const menuListEl = document.getElementById('menuList');
  const tabsEl = document.getElementById('categoryTabs');
  const tableBadgeNum = document.getElementById('tableBadgeNum');
  const changeTableBtn = document.getElementById('changeTableBtn');
  const noteEl = document.getElementById('customerNote');
  const toastEl = document.getElementById('toast');

  // ---- Elemen: cart bar + sheet ----
  const cartBarBtn = document.getElementById('cartBarBtn');
  const cartBarCount = document.getElementById('cartBarCount');
  const cartBarText = document.getElementById('cartBarText');
  const cartBarTotal = document.getElementById('cartBarTotal');
  const cartSheetBackdrop = document.getElementById('cartSheetBackdrop');
  const cartItemsList = document.getElementById('cartItemsList');
  const sheetTotalPrice = document.getElementById('sheetTotalPrice');
  const sendBtn = document.getElementById('sendOrderBtn');
  const closeCartSheet = document.getElementById('closeCartSheet');

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

  // =====================================================================
  // Loading
  // =====================================================================
  async function loadMenu() {
    try {
      const res = await fetch('/api/menu');
      state.menu = await res.json();
    } catch (err) {
      menuListEl.innerHTML = `<div class="empty-block">Gagal memuat menu. Periksa koneksi internet Anda dan coba muat ulang halaman.</div>`;
      return;
    }
    state.menuLoaded = true;
    renderCategoryTabs();
    renderMenu();
  }

  async function loadTables() {
    try {
      const res = await fetch('/api/tables');
      state.tables = await res.json();
    } catch (err) {
      tableGridPicker.innerHTML = `<div class="tp-loading">Gagal memuat daftar meja. Coba muat ulang halaman.</div>`;
      return;
    }
    state.tablesLoaded = true;

    if (state.selectedTableId === null && presetTableParam) {
      const matched = state.tables.find((t) => String(t.number) === presetTableParam);
      if (matched) state.selectedTableId = matched.id;
    }

    renderTablePicker();

    // Jika meja sudah otomatis terisi dari QR, langsung lompat ke step menu
    if (state.selectedTableId !== null && tablePickerScreen.style.display !== 'none' && !tablePickerScreen.dataset.userOpened) {
      goToOrderingScreen();
    }
  }

  // =====================================================================
  // STEP 1: Pilih Meja
  // =====================================================================
  function renderTablePicker() {
    if (state.tables.length === 0) {
      tableGridPicker.innerHTML = `<div class="tp-loading">Belum ada meja yang tersedia. Hubungi staf.</div>`;
      return;
    }
    tableGridPicker.innerHTML = state.tables.map((t) => {
      const occupied = t.status === 'terisi' && t.id !== state.selectedTableId;
      const selected = t.id === state.selectedTableId;
      return `<div class="table-chip${selected ? ' selected' : ''}${occupied ? ' occupied' : ''}" data-id="${t.id}" ${occupied ? '' : 'role="button" tabindex="0"'}>${t.number}</div>`;
    }).join('');

    tableGridPicker.querySelectorAll('.table-chip:not(.occupied)').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.selectedTableId = Number(chip.dataset.id);
        renderTablePicker();
        setTimeout(goToOrderingScreen, 180); // beri jeda kecil agar terasa responsif, bukan instan-kasar
      });
    });
  }

  function goToOrderingScreen() {
    tablePickerScreen.style.display = 'none';
    orderingScreen.style.display = 'block';
    updateTableBadge();
    if (!state.menuLoaded) loadMenu();
  }

  function backToTablePicker() {
    tablePickerScreen.dataset.userOpened = '1';
    tablePickerScreen.style.display = 'flex';
    orderingScreen.style.display = 'none';
    renderTablePicker();
  }

  changeTableBtn.addEventListener('click', backToTablePicker);

  function updateTableBadge() {
    const t = state.tables.find((tb) => tb.id === state.selectedTableId);
    tableBadgeNum.textContent = t ? t.number : '-';
  }

  // =====================================================================
  // STEP 2: Menu
  // =====================================================================
  function renderCategoryTabs() {
    const categories = ['Semua', ...new Set(state.menu.map((m) => m.category))];
    tabsEl.innerHTML = '';
    categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (cat === state.activeCategory ? ' active' : '');
      btn.type = 'button';
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
    if (state.menu.length === 0) {
      menuListEl.innerHTML = `<div class="empty-block">Menu belum tersedia saat ini. Silakan hubungi staf.</div>`;
      return;
    }

    const items =
      state.activeCategory === 'Semua'
        ? state.menu
        : state.menu.filter((m) => m.category === state.activeCategory);

    menuListEl.innerHTML = '';
    items.forEach((item) => {
      const qty = state.cart[item.id]?.qty || 0;
      const card = document.createElement('div');
      card.className = 'menu-card' + (qty > 0 ? ' in-cart' : '');
      card.innerHTML = `
        ${item.imageUrl
          ? `<img src="${escapeHtml(item.imageUrl)}" alt="" class="menu-thumb" />`
          : `<div class="menu-thumb menu-thumb-placeholder">🍽️</div>`}
        <div class="menu-info">
          <h3>${escapeHtml(item.name)}</h3>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
          <div class="menu-price">${formatRupiah(item.price)}</div>
        </div>
        <div class="qty-control">
          ${qty > 0
            ? `<button class="qty-btn" data-action="dec" data-id="${item.id}" aria-label="Kurangi">−</button>
               <span class="qty-val" id="qty-${item.id}">${qty}</span>
               <button class="qty-btn" data-action="inc" data-id="${item.id}" aria-label="Tambah">+</button>`
            : `<button class="qty-add-btn" data-action="inc" data-id="${item.id}">+ Tambah</button>`
          }
        </div>
      `;
      menuListEl.appendChild(card);
    });

    menuListEl.querySelectorAll('[data-action]').forEach((btn) => {
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
    // Re-render kartu ini saja supaya transisi tombol "+ Tambah" <-> stepper mulus
    renderMenu();
    updateCartBar();
    if (delta > 0 && navigator.vibrate) navigator.vibrate(15);
  }

  // =====================================================================
  // Cart bar + bottom sheet
  // =====================================================================
  function cartEntries() {
    return Object.values(state.cart);
  }

  function cartTotal() {
    return cartEntries().reduce((s, e) => {
      const m = state.menu.find((mi) => mi.id === e.menuId);
      return s + (m ? m.price * e.qty : 0);
    }, 0);
  }

  function updateCartBar() {
    const entries = cartEntries();
    const totalQty = entries.reduce((s, e) => s + e.qty, 0);

    if (totalQty === 0) {
      cartBarBtn.disabled = true;
      cartBarBtn.classList.remove('active');
      cartBarCount.style.display = 'none';
      cartBarText.textContent = 'Keranjang kosong — pilih menu untuk mulai';
      cartBarTotal.textContent = '';
    } else {
      cartBarBtn.disabled = false;
      cartBarBtn.classList.add('active');
      cartBarCount.style.display = 'flex';
      cartBarCount.textContent = totalQty;
      cartBarText.textContent = totalQty === 1 ? '1 item dipilih' : `${totalQty} item dipilih`;
      cartBarTotal.textContent = formatRupiah(cartTotal());
    }

    if (cartSheetBackdrop.classList.contains('show')) renderCartSheet();
  }

  function renderCartSheet() {
    const entries = cartEntries();
    if (entries.length === 0) {
      cartItemsList.innerHTML = `<div class="empty-block" style="padding:30px 10px;">Belum ada item di keranjang.</div>`;
      sendBtn.disabled = true;
    } else {
      cartItemsList.innerHTML = entries.map((e) => {
        const m = state.menu.find((mi) => mi.id === e.menuId);
        if (!m) return '';
        return `
          <div class="cart-line">
            <div class="cart-line-info">
              <div class="cart-line-name">${escapeHtml(m.name)}</div>
              <div class="cart-line-price">${formatRupiah(m.price)} x ${e.qty}</div>
            </div>
            <div class="qty-control">
              <button class="qty-btn" data-action="dec" data-id="${m.id}" aria-label="Kurangi">−</button>
              <span class="qty-val">${e.qty}</span>
              <button class="qty-btn" data-action="inc" data-id="${m.id}" aria-label="Tambah">+</button>
            </div>
          </div>
        `;
      }).join('');
      sendBtn.disabled = false;

      cartItemsList.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.dataset.id);
          changeQty(id, btn.dataset.action === 'inc' ? 1 : -1);
        });
      });
    }
    sheetTotalPrice.textContent = formatRupiah(cartTotal());
  }

  function openCartSheet() {
    if (cartBarBtn.disabled) return;
    renderCartSheet();
    cartSheetBackdrop.classList.add('show');
  }

  function closeCartSheetFn() {
    cartSheetBackdrop.classList.remove('show');
  }

  cartBarBtn.addEventListener('click', openCartSheet);
  closeCartSheet.addEventListener('click', closeCartSheetFn);
  cartSheetBackdrop.addEventListener('click', (e) => {
    if (e.target === cartSheetBackdrop) closeCartSheetFn();
  });

  // =====================================================================
  // Kirim Pesanan
  // =====================================================================
  sendBtn.addEventListener('click', async () => {
    if (sendBtn.disabled) return;
    const items = cartEntries().map((e) => ({ menuId: e.menuId, qty: e.qty }));
    if (items.length === 0) return;

    sendBtn.disabled = true;
    const originalText = sendBtn.textContent;
    sendBtn.textContent = 'Mengirim...';
    sendBtn.classList.add('is-loading');

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
      sendBtn.textContent = originalText;
      sendBtn.classList.remove('is-loading');
    }
  });

  function showOrderSuccess(order) {
    document.body.innerHTML = `
      <div class="success-screen">
        <div class="success-card">
          <div class="success-icon">✅</div>
          <h2>Pesanan Terkirim!</h2>
          <p class="success-sub">Meja ${order.tableNumber} · Kode Pesanan <b>#${order.id}</b></p>
          <div class="success-order-box">
            <div class="order-items">
              ${order.items
                .map(
                  (it) =>
                    `<div><span>${it.qty}x ${escapeHtml(it.name)}</span><span>${formatRupiah(it.price * it.qty)}</span></div>`
                )
                .join('')}
            </div>
            <div class="order-total">
              <span>Total</span><span>${formatRupiah(order.total)}</span>
            </div>
          </div>
          <p class="success-note">
            Pesanan Anda sedang diproses oleh kasir. Tunjukkan kode pesanan ini saat pembayaran jika diminta.
          </p>
          <button class="btn-primary" style="width:100%;" onclick="location.href=location.pathname">Pesan Lagi</button>
        </div>
      </div>
    `;
  }

  // =====================================================================
  // Init
  // =====================================================================
  (async function init() {
    await loadTables();
    // Jika belum ada meja terpilih (tidak dari QR), tampilkan step 1 dan tunggu pilihan.
    if (state.selectedTableId === null) {
      tablePickerScreen.style.display = 'flex';
    }
    updateCartBar();
  })();

  setInterval(loadTables, 10000);
})();