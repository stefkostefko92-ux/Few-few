/* ============================================================
   PANEV ASCENSORI — Admin JS (v2.0)
   Server-backed CRUD via REST API
   Auth: JWT httpOnly cookie (set by /api/admin/login)
   ============================================================ */

// ── XSS helpers ─────────────────────────────────────────
function escHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function escAttr(str) { return escHtml(String(str == null ? '' : str)); }

// ── Fetch helper with auth handling ─────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401) {
    // Session expired — kick back to login
    location.href = 'login.html?timeout=1';
    // Never-resolving promise to halt caller
    return new Promise(() => {});
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error((data && data.error) || 'HTTP ' + res.status);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

// ── Auth guard — runs on every admin page ───────────────
async function adminAuthGuard() {
  try {
    const r = await fetch('/api/admin/me', { credentials: 'same-origin' });
    if (!r.ok) { location.href = 'login.html'; return null; }
    const data = await r.json();
    return data.user;
  } catch {
    location.href = 'login.html';
    return null;
  }
}

async function adminLogout() {
  try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
  location.href = 'login.html';
}

// ── Sidebar ─────────────────────────────────────────────
async function renderAdminLayout() {
  const sidebar = document.getElementById('admin-sidebar');
  if (!sidebar) return;

  const page = location.pathname.split('/').pop() || 'index.html';
  const navItems = [
    { href: 'index.html',        icon: '📊', label: 'Dashboard' },
    { href: 'prodotti.html',     icon: '📦', label: 'Prodotti' },
    { href: 'ordini.html',       icon: '🛒', label: 'Ordini' },
    { href: 'messaggi.html',     icon: '✉️', label: 'Messaggi' },
    { href: 'impostazioni.html', icon: '⚙️', label: 'Impostazioni' },
  ];

  // Fetch counts for badges (ignore errors silently)
  let newOrders = 0, newMsgs = 0;
  try {
    const stats = await apiFetch('/api/admin/stats');
    newOrders = Number(stats.orders?.newCount) || 0;
    newMsgs   = Number(stats.messages?.unreadCount) || 0;
  } catch {}

  sidebar.innerHTML = `
    <div class="admin-brand">
      <a href="index.html" class="admin-brand-logo">
        <span class="admin-brand-mark">PA</span>
        <div>
          <div class="admin-brand-name">Panev Ascensori</div>
          <div class="admin-brand-sub">Admin Panel</div>
        </div>
      </a>
    </div>
    <nav class="admin-nav">
      ${navItems.map(item => {
        const badge = item.href === 'ordini.html' && newOrders > 0
          ? `<span class="admin-nav-badge">${newOrders}</span>`
          : item.href === 'messaggi.html' && newMsgs > 0
          ? `<span class="admin-nav-badge">${newMsgs}</span>`
          : '';
        return `<a href="${item.href}" class="admin-nav-item ${page === item.href ? 'active' : ''}">
          <span class="admin-nav-icon">${item.icon}</span>
          <span>${escHtml(item.label)}</span>
          ${badge}
        </a>`;
      }).join('')}
    </nav>
    <div class="admin-sidebar-foot">
      <a href="../index.html" class="admin-nav-item" target="_blank">
        <span class="admin-nav-icon">🌐</span>
        <span>Vedi sito</span>
      </a>
      <button class="admin-nav-item admin-logout-btn" onclick="adminLogout()">
        <span class="admin-nav-icon">🚪</span>
        <span>Esci</span>
      </button>
    </div>`;
}

// ── Topbar ──────────────────────────────────────────────
function renderAdminTopbar(title = 'Dashboard') {
  const topbar = document.getElementById('admin-topbar');
  if (!topbar) return;
  const email = window._adminUser?.email || 'info@panevascensori.it';
  const name  = window._adminUser?.name  || 'Amministratore';
  topbar.innerHTML = `
    <div class="topbar-left">
      <button class="topbar-hamburger" id="topbar-hamburger" onclick="toggleMobileNav()">☰</button>
      <h1 class="topbar-title">${escHtml(title)}</h1>
    </div>
    <div class="topbar-right">
      <div class="topbar-user">
        <div class="topbar-avatar">${escHtml((name || '?').charAt(0).toUpperCase())}</div>
        <div class="topbar-user-info">
          <div class="topbar-user-name">${escHtml(name)}</div>
          <div class="topbar-user-email">${escHtml(email)}</div>
        </div>
      </div>
    </div>`;
}

function toggleMobileNav() {
  document.getElementById('admin-sidebar')?.classList.toggle('mobile-open');
}

// ── Toast & Confirm modal ───────────────────────────────
function adminToast(msg, type = 'success') {
  let t = document.getElementById('admin-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'admin-toast';
    document.body.appendChild(t);
  }
  t.className = `admin-toast-popup ${type}`;
  const ico = document.createElement('span');
  ico.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  t.innerHTML = '';
  t.appendChild(ico);
  t.appendChild(document.createTextNode(' ' + msg));
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

function adminConfirm(msg, onConfirm) {
  let modal = document.getElementById('admin-confirm-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'admin-confirm-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box confirm-modal-box">
        <div class="confirm-icon">⚠️</div>
        <p id="confirm-modal-msg"></p>
        <div class="confirm-modal-actions">
          <button class="btn-admin btn-outline-admin" onclick="document.getElementById('admin-confirm-modal').style.display='none'">Annulla</button>
          <button class="btn-admin btn-danger-admin" id="confirm-modal-ok">Conferma</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('confirm-modal-msg').textContent = msg;
  modal.style.display = 'flex';
  const okBtn = document.getElementById('confirm-modal-ok');
  const newOk = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOk, okBtn);
  newOk.addEventListener('click', () => {
    modal.style.display = 'none';
    onConfirm();
  });
}

// ── Products API ────────────────────────────────────────
const AdminProducts = {
  async list()           { return (await apiFetch('/api/admin/products')).products; },
  async create(data)     { return (await apiFetch('/api/admin/products', { method: 'POST', body: JSON.stringify(data) })).product; },
  async update(id, data) { return (await apiFetch('/api/admin/products/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(data) })).product; },
  async remove(id)       { return apiFetch('/api/admin/products/' + encodeURIComponent(id), { method: 'DELETE' }); },
};

// ── Orders API ──────────────────────────────────────────
const AdminOrders = {
  async list()               { return await apiFetch('/api/admin/orders'); },
  async updateStatus(id, s)  { return apiFetch('/api/admin/orders/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ stato: s }) }); },
  async remove(id)           { return apiFetch('/api/admin/orders/' + encodeURIComponent(id), { method: 'DELETE' }); },
  async clearAll()           { return apiFetch('/api/admin/orders', { method: 'DELETE' }); },
};

// ── Messages API ────────────────────────────────────────
const AdminMessages = {
  async list()           { return await apiFetch('/api/admin/messages'); },
  async markRead(id)     { return apiFetch('/api/admin/messages/' + encodeURIComponent(id) + '/read', { method: 'PUT' }); },
  async markAllRead()    { return apiFetch('/api/admin/messages/read-all', { method: 'PUT' }); },
  async remove(id)       { return apiFetch('/api/admin/messages/' + encodeURIComponent(id), { method: 'DELETE' }); },
  async clearAll()       { return apiFetch('/api/admin/messages', { method: 'DELETE' }); },
};

// ── Format date ─────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  // SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' UTC without Z — append Z for correct parsing
  let parseable = iso;
  if (typeof iso === 'string' && !iso.endsWith('Z') && !iso.includes('T') && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(iso)) {
    parseable = iso.replace(' ', 'T') + 'Z';
  }
  const d = new Date(parseable);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// ── Session keepalive ───────────────────────────────────
function setupIdleTimeout() {
  const TIMEOUT = 30 * 60 * 1000; // 30 min
  let timer = setTimeout(forceLogout, TIMEOUT);
  function reset() { clearTimeout(timer); timer = setTimeout(forceLogout, TIMEOUT); }
  function forceLogout() {
    fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).finally(() => {
      location.href = 'login.html?timeout=1';
    });
  }
  document.addEventListener('mousemove', reset, { passive: true });
  document.addEventListener('keydown', reset, { passive: true });
  document.addEventListener('click', reset, { passive: true });
}

// ── Init on load ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = await adminAuthGuard();
  if (!user) return;
  window._adminUser = user;
  await renderAdminLayout();
  setupIdleTimeout();
  if (typeof initPageContent === 'function') initPageContent();
});
