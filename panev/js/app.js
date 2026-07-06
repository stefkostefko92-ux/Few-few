/* ============================================================
   PANEV ASCENSORI — Shared App JS (v2.0)
   Products now loaded from /api/products (server-side DB)
   Cart remains in localStorage (standard e-commerce pattern)
   ============================================================ */

// ── DOM sanitizer (prevent XSS) ───────────────────────────
function escHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ── Cart State (localStorage) ────────────────────────────
const Cart = {
  getItems() {
    try { return JSON.parse(localStorage.getItem('pa_cart') || '[]'); }
    catch { return []; }
  },
  saveItems(items) {
    localStorage.setItem('pa_cart', JSON.stringify(items));
    Cart.updateCounters();
  },
  addItem(product, qty = 1) {
    const items = Cart.getItems();
    const existing = items.find(i => i.id === product.id);
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({ ...product, qty });
    }
    Cart.saveItems(items);
    const priceStr = product.price > 0
      ? ` — ${product.priceLabel || '€' + product.price.toFixed(2)}`
      : '';
    showToast(`✓ ${product.name}${priceStr} aggiunto al carrello`);
    Cart.renderSidebar();
  },
  removeItem(id) {
    Cart.saveItems(Cart.getItems().filter(i => i.id !== id));
    Cart.renderSidebar();
  },
  changeQty(id, delta) {
    const items = Cart.getItems();
    const item = items.find(i => i.id === id);
    if (item) {
      item.qty = Math.max(1, item.qty + delta);
      Cart.saveItems(items);
      Cart.renderSidebar();
    }
  },
  getTotal() {
    return Cart.getItems().reduce((s, i) => s + (i.price || 0) * i.qty, 0);
  },
  getCount() {
    return Cart.getItems().reduce((s, i) => s + i.qty, 0);
  },
  updateCounters() {
    const count = Cart.getCount();
    document.querySelectorAll('.cart-count').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  },
  renderSidebar() {
    const list = document.getElementById('cart-items-list');
    const totalEl = document.getElementById('cart-total-val');
    if (!list) return;
    const items = Cart.getItems();
    if (items.length === 0) {
      list.innerHTML = `
        <div class="cart-empty-msg">
          <div class="icon">🛗</div>
          <p>Il carrello è vuoto</p>
        </div>`;
    } else {
      list.innerHTML = items.map(item => `
        <div class="cart-item-row">
          <div class="cart-item-img">
            ${item.image ? `<img src="${escHtml(item.image)}" alt="${escHtml(item.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:3px;">` : escHtml(item.icon || '📦')}
          </div>
          <div class="cart-item-det">
            <div class="cart-item-name">${escHtml(item.name)}</div>
            <div class="cart-item-price">${item.price > 0 ? '€' + (item.price * item.qty).toFixed(2) : escHtml(item.priceLabel || 'Su richiesta')}</div>
            <div class="cart-qty-ctrl">
              <button class="qty-b" data-id="${escHtml(item.id)}" data-delta="-1" aria-label="Diminuisci quantità ${escHtml(item.name)}">−</button>
              <span class="qty-val">${item.qty}</span>
              <button class="qty-b" data-id="${escHtml(item.id)}" data-delta="1" aria-label="Aumenta quantità ${escHtml(item.name)}">+</button>
            </div>
          </div>
          <button class="cart-item-rm" data-id="${escHtml(item.id)}" title="Rimuovi" aria-label="Rimuovi ${escHtml(item.name)} dal carrello">✕</button>
        </div>`).join('');
      list.querySelectorAll('.qty-b').forEach(btn =>
        btn.addEventListener('click', () => Cart.changeQty(btn.dataset.id, parseInt(btn.dataset.delta, 10)))
      );
      list.querySelectorAll('.cart-item-rm').forEach(btn =>
        btn.addEventListener('click', () => Cart.removeItem(btn.dataset.id))
      );
    }
    const tot = Cart.getTotal();
    if (totalEl) totalEl.textContent = tot > 0 ? `€${tot.toFixed(2)}` : "Preventivo gratuito";
    Cart.updateCounters();
  }
};

// ── Products DB (API-backed with cache) ──────────────────
const Products = {
  _cache: null,
  _loadingPromise: null,

  async load() {
    if (this._cache) return this._cache;
    if (this._loadingPromise) return this._loadingPromise;

    this._loadingPromise = fetch('/api/products', { credentials: 'same-origin' })
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(data => {
        this._cache = data.products || [];
        return this._cache;
      })
      .catch(err => {
        console.warn('[Products] fetch failed, using empty list:', err.message);
        this._cache = [];
        return this._cache;
      })
      .finally(() => { this._loadingPromise = null; });

    return this._loadingPromise;
  },

  // Synchronous access — returns cached list (or empty if not loaded yet)
  getAll() { return this._cache || []; },
  getById(id) { return (this._cache || []).find(p => p.id === id); },
  refresh() { this._cache = null; return this.load(); },
};

// Helper for code that still calls Products.getAll() synchronously —
// ensures load was kicked off early
async function ensureProductsLoaded() {
  if (!Products._cache) await Products.load();
  return Products.getAll();
}

// ── Accessible overlay helpers (focus trap / Esc / restore) ──
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let _lastFocus = null;
function trapKeydown(container) {
  return (e) => {
    if (e.key === 'Tab') {
      const f = [...container.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
}
function openOverlay(el, opener) {
  if (!el) return;
  _lastFocus = opener || document.activeElement;
  el._trap = trapKeydown(el);
  el.addEventListener('keydown', el._trap);
  const first = el.querySelector(FOCUSABLE);
  setTimeout(() => (first || el).focus(), 50);
}
function closeOverlay(el) {
  if (!el) return;
  if (el._trap) { el.removeEventListener('keydown', el._trap); el._trap = null; }
  if (_lastFocus && typeof _lastFocus.focus === 'function') _lastFocus.focus();
  _lastFocus = null;
}

// ── Cart Sidebar toggle ─────────────────────────────────
function openCart() {
  const s = document.getElementById('cart-sidebar');
  s?.classList.add('open');
  s?.removeAttribute('inert');
  s?.setAttribute('aria-hidden', 'false');
  document.getElementById('cart-overlay')?.classList.add('on');
  Cart.renderSidebar();
  openOverlay(s, document.activeElement);
}
function closeCart() {
  const s = document.getElementById('cart-sidebar');
  s?.classList.remove('open');
  s?.setAttribute('inert', '');
  s?.setAttribute('aria-hidden', 'true');
  document.getElementById('cart-overlay')?.classList.remove('on');
  closeOverlay(s);
}

// ── Toast ────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  const ico = document.createElement('span');
  ico.className = 'toast-ico';
  ico.textContent = type === 'success' ? '✓' : '⚠';
  t.innerHTML = '';
  t.appendChild(ico);
  t.appendChild(document.createTextNode(' ' + msg));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ── Scroll reveal ────────────────────────────────────────
function initReveal() {
  const els = document.querySelectorAll('.reveal:not(.in)');
  if (!els.length) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('in'), i * 80);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => obs.observe(el));
}

// ── Navbar scroll ────────────────────────────────────────
function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Normalise current path to a slug (strip dir + .html) so the active state
  // works for both clean URLs (/brevetto) and direct .html requests.
  const slug = (location.pathname.split('/').pop() || 'index').replace(/\.html$/i, '') || 'index';
  nav.querySelectorAll('.nav-menu a').forEach(a => {
    const ref = a.dataset.path || a.getAttribute('href') || '';
    const aSlug = (ref.split('/').pop() || 'index').replace(/\.html$/i, '') || 'index';
    if (aSlug === slug) a.classList.add('active');
  });
}

// ── Mobile nav ───────────────────────────────────────────
function openMobileNav() {
  const nav = document.getElementById('mobile-nav');
  if (!nav) return;
  nav.classList.add('open');
  nav.removeAttribute('inert');
  nav.setAttribute('aria-hidden', 'false');
  openOverlay(nav, document.getElementById('nav-hamburger'));
}
function closeMobileNav() {
  const nav = document.getElementById('mobile-nav');
  if (!nav) return;
  nav.classList.remove('open');
  nav.setAttribute('aria-hidden', 'true');
  nav.setAttribute('inert', '');           // remove off-canvas links from tab order
  closeOverlay(nav);
}
function initMobileNav() {
  const btn = document.getElementById('nav-hamburger');
  const nav = document.getElementById('mobile-nav');
  const close = document.getElementById('mobile-nav-close');
  if (!btn || !nav) return;
  // Closed by default: keep its links out of the tab order until opened.
  nav.setAttribute('aria-hidden', 'true');
  nav.setAttribute('inert', '');
  btn.addEventListener('click', openMobileNav);
  close?.addEventListener('click', closeMobileNav);
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileNav));
}

// ── Navbar HTML ──────────────────────────────────────────
function renderNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  nav.innerHTML = `
    <!-- Top utility bar — institutional header like Italian industrial sites -->
    <div class="nav-topbar">
      <div class="container">
        <div class="nav-topbar-inner">
          <div class="nav-topbar-left">
            <span class="nav-tag nav-tag-patent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M3 10h18M5 6h14l-7-4zM5 10v11M12 10v11M19 10v11"/></svg>
              Brevetto UIBM <span class="nav-tag-mono">N. 202023000002112</span>
            </span>
            <span class="nav-tag-sep" aria-hidden="true"></span>
            <span class="nav-tag nav-tag-italy">
              <span class="nav-tricolor" aria-hidden="true">
                <i style="background:#009246"></i><i style="background:#ffffff"></i><i style="background:#ce2b37"></i>
              </span>
              Made in Italy · Dal 2013
            </span>
          </div>
          <div class="nav-topbar-right">
            <a href="tel:+393463054093" class="nav-topbar-link" aria-label="Chiama il commerciale">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span>+39 346 305 4093</span>
            </a>
            <span class="nav-topbar-sep" aria-hidden="true">·</span>
            <a href="mailto:info@panevascensori.it" class="nav-topbar-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <span>info@panevascensori.it</span>
            </a>
            <span class="nav-topbar-sep" aria-hidden="true">·</span>
            <a href="tel:+393926848978" class="nav-topbar-link nav-topbar-urgent">
              <span class="nav-pulse-dot" aria-hidden="true"></span>
              <span>Emergenze 24/7</span>
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- Main navigation bar -->
    <div class="nav-main">
      <div class="container">
        <div class="nav-inner">
          <!-- Brand with tricolor signature bar -->
          <a href="index.html" class="nav-logo" aria-label="Panev Ascensori — Homepage">
            <span class="nav-logo-tricolor" aria-hidden="true">
              <i style="background:#009246"></i><i style="background:#ffffff"></i><i style="background:#ce2b37"></i>
            </span>
            <picture class="nav-logo-img">
              <source srcset="img/panev-logo.avif" type="image/avif">
              <source srcset="img/panev-logo.webp" type="image/webp">
              <img src="img/panev-logo.png" alt="Panev Ascensori — Staffe Brevettate dal 2013" class="nav-logo-img-tag" width="220" height="59" loading="eager" fetchpriority="high" decoding="async">
            </picture>
            <span class="nav-logo-meta">
              <span class="nav-logo-meta-top">Ascensori · Staffaggi brevettati</span>
              <span class="nav-logo-meta-bot">Vittuone MI · Dal 2013</span>
            </span>
          </a>

          <!-- Centered nav menu -->
          <nav class="nav-menu" aria-label="Navigazione principale">
            <a href="index.html" data-path="index.html">Home</a>
            <a href="/brevetto" data-path="brevetto.html">Brevetto</a>
            <a href="/prodotti" data-path="prodotti.html">Prodotti</a>
            <a href="/catalogo" data-path="catalogo.html">Catalogo</a>
            <a href="/servizi" data-path="servizi.html">Servizi</a>
            <a href="/chi-siamo" data-path="chi-siamo.html">Chi siamo</a>
            <a href="/contatti" data-path="contatti.html">Contatti</a>
          </nav>

          <!-- Actions -->
          <div class="nav-actions">
            <a href="/contatti" class="nav-cta-btn" aria-label="Richiedi preventivo">
              <span>Preventivo</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </a>
            <button class="nav-cart-btn" onclick="openCart()" aria-label="Apri carrello">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              <span class="cart-count" style="display:none">0</span>
            </button>
            <button class="nav-hamburger" id="nav-hamburger" aria-label="Apri menu mobile">
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Footer HTML ──────────────────────────────────────────
function renderFooter() {
  const f = document.getElementById('footer');
  if (!f) return;
  f.innerHTML = `
    <!-- Footer institutional header strip -->
    <div class="footer-strip">
      <div class="container">
        <div class="footer-strip-inner">
          <div class="footer-strip-left">
            <span class="footer-tag">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 10h18M5 6h14l-7-4zM5 10v11M12 10v11M19 10v11"/></svg>
              Brevetto UIBM <span class="footer-tag-mono">N. 202023000002112</span>
            </span>
            <span class="footer-tag-sep"></span>
            <span class="footer-tag">
              <span class="footer-tricolor-sm" aria-hidden="true">
                <i style="background:#009246"></i><i style="background:#ffffff"></i><i style="background:#ce2b37"></i>
              </span>
              Made in Italy · Lombardia
            </span>
          </div>
          <div class="footer-strip-right">
            <a href="/contatti" class="footer-strip-cta">
              Richiedi preventivo
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </a>
          </div>
        </div>
      </div>
    </div>

    <div class="container footer-main">
      <div class="footer-grid">
        <!-- Brand column - institutional -->
        <div class="footer-brand">
          <a href="index.html" class="footer-logo-link" aria-label="Panev Ascensori SAS">
            <span class="footer-logo-tricolor" aria-hidden="true">
              <i style="background:#009246"></i><i style="background:#ffffff"></i><i style="background:#ce2b37"></i>
            </span>
            <img src="img/panev-logo-darkmode.png" alt="Panev Ascensori SAS" class="footer-logo-img-tag" width="200" height="53" loading="lazy" decoding="async">
          </a>
          <p class="footer-brand-tagline">
            Produttore italiano di staffaggi brevettati per porte di ascensori e montacarichi. Installazione, manutenzione e certificazione in tutta Italia dal 2013.
          </p>

          <!-- Institutional company card -->
          <div class="footer-inst-card">
            <div class="footer-inst-row">
              <span class="footer-inst-label">Ragione sociale</span>
              <span class="footer-inst-value">Panev Ascensori SAS</span>
            </div>
            <div class="footer-inst-row">
              <span class="footer-inst-label">Partita IVA</span>
              <span class="footer-inst-value footer-inst-mono">IT 09346970966</span>
            </div>
            <div class="footer-inst-row">
              <span class="footer-inst-label">Sede legale</span>
              <span class="footer-inst-value">Via Madonna del Salvatore 6<br>20010 Vittuone (MI)</span>
            </div>
            <div class="footer-inst-row">
              <span class="footer-inst-label">Sede operativa</span>
              <span class="footer-inst-value">Via Milano 7<br>20010 Cornaredo (MI)</span>
            </div>
          </div>
        </div>

        <!-- Navigation columns -->
        <div class="footer-cols">
          <div class="footer-col">
            <h5>Prodotti</h5>
            <ul>
              <li><a href="/prodotti">Staffe brevettate</a></li>
              <li><a href="/prodotti">Staffe standard</a></li>
              <li><a href="/prodotti">Accessori</a></li>
              <li><a href="/catalogo">Catalogo PDF</a></li>
              <li><a href="/brevetto">Brevetto UIBM</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h5>Servizi</h5>
            <ul>
              <li><a href="/servizi">Installazione</a></li>
              <li><a href="/servizi">Manutenzione</a></li>
              <li><a href="/servizi">Modernizzazione</a></li>
              <li><a href="/servizi">Certificazione UNI 10411</a></li>
              <li><a href="tel:+393926848978">Pronto intervento 24/7</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h5>Azienda</h5>
            <ul>
              <li><a href="/chi-siamo">Chi siamo</a></li>
              <li><a href="/chi-siamo">La nostra storia</a></li>
              <li><a href="/contatti">Dove siamo</a></li>
              <li><a href="/faq">Domande frequenti</a></li>
              <li><a href="/privacy">Privacy Policy</a></li>
              <li><a href="/cookie">Cookie Policy</a></li>
              <li><button type="button" class="footer-cookie-link" onclick="riapriBannerCookie()">Gestisci cookie</button></li>
              <li><a href="/termini">Termini e Condizioni</a></li>
            </ul>
          </div>
          <div class="footer-col footer-col-contact">
            <h5>Contatti</h5>
            <a href="tel:+393463054093" class="footer-contact-row">
              <span class="footer-contact-label">Ufficio commerciale</span>
              <span class="footer-contact-value">+39 346 305 4093</span>
              <span class="footer-contact-meta">Lun-Ven · 08:00–18:00</span>
            </a>
            <a href="tel:+393926848978" class="footer-contact-row footer-contact-urgent">
              <span class="footer-contact-label">
                <span class="footer-urgent-dot"></span>
                Emergenze 24/7
              </span>
              <span class="footer-contact-value">+39 392 684 8978</span>
              <span class="footer-contact-meta">Pronto intervento</span>
            </a>
            <a href="mailto:info@panevascensori.it" class="footer-contact-row">
              <span class="footer-contact-label">Email commerciale</span>
              <span class="footer-contact-value footer-contact-email">info@panevascensori.it</span>
            </a>
          </div>
        </div>
      </div>

      <!-- Bottom bar -->
      <div class="footer-bottom">
        <div class="footer-bottom-left">
          <p class="footer-copyright">© ${new Date().getFullYear()} Panev Ascensori SAS · Tutti i diritti riservati</p>
          <p class="footer-credit">Design &amp; development · <a href="https://carbonstealth.eu" target="_blank" rel="noopener" class="footer-credit-link">Carbon Stealth</a></p>
        </div>
        <div class="footer-bottom-right">
          <div class="footer-social">
            <a href="https://www.facebook.com/panevascensori" target="_blank" rel="noopener noreferrer" class="soc-link" aria-label="Facebook">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
            <a href="https://www.instagram.com/panevascensori" target="_blank" rel="noopener noreferrer" class="soc-link" aria-label="Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.4a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM17.5 6.5h.01" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
            <a href="https://www.linkedin.com/company/panevascensori" target="_blank" rel="noopener noreferrer" class="soc-link" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>
            </a>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Cart Sidebar HTML ────────────────────────────────────
function renderCartSidebar() {
  const s = document.getElementById('cart-sidebar');
  if (!s) return;
  s.setAttribute('role', 'dialog');
  s.setAttribute('aria-modal', 'true');
  s.setAttribute('aria-label', 'Carrello');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('inert', '');
  s.innerHTML = `
    <div class="cart-sid-head">
      <h3 tabindex="-1">Carrello</h3>
      <button class="cart-close" onclick="closeCart()" aria-label="Chiudi carrello">✕</button>
    </div>
    <div class="cart-items-list" id="cart-items-list"></div>
    <div class="cart-sid-foot">
      <div class="cart-total-row">
        <span class="cart-total-lbl">Totale</span>
        <span class="cart-total-val" id="cart-total-val">€0.00</span>
      </div>
      <a href="/carrello" class="btn btn-primary btn-full" onclick="closeCart()">Richiedi Preventivo →</a>
    </div>`;
  Cart.renderSidebar();
}

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderNavbar();
  renderFooter();
  renderCartSidebar();
  initNavbar();
  initMobileNav();
  initReveal();
  Cart.updateCounters();

  // Start loading products only on pages that render them (index / prodotti),
  // not on the other ~13 pages — avoids a wasted API call on every load.
  if (document.getElementById('products-grid') ||
      document.getElementById('featured-products-grid') ||
      document.querySelector('[data-needs-products]')) {
    Products.load().catch(() => {});
  }

  document.getElementById('cart-overlay')?.addEventListener('click', closeCart);

  // Global Esc closes whichever overlay is open
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('cart-sidebar')?.classList.contains('open')) closeCart();
    else if (document.getElementById('mobile-nav')?.classList.contains('open')) closeMobileNav();
  });
});
