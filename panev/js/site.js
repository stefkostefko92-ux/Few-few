/* Panev Ascensori — фронт логика: меню, списък за поръчка, форма.
   Ванилен JS, без зависимости. Списъкът живее в localStorage и се
   изпраща по имейл (mailto) или през POST /api/contact. */
(function () {
  'use strict';

  var LS_KEY = 'panev_order_v1';
  var cfgEl = document.getElementById('i18n-order');
  var CFG = cfgEl ? JSON.parse(cfgEl.textContent) : {};

  function fmtPrice(n) {
    if (CFG.fmt === 'en') return '€ ' + n.toFixed(2);
    return n.toFixed(2).replace('.', ',') + ' €';
  }

  // ── Мобилно меню ──
  var navToggle = document.querySelector('[data-nav-toggle]');
  var nav = document.getElementById('site-nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }

  // ── Списък за поръчка ──
  function loadOrder() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function saveOrder(list) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
  }

  var drawer = document.getElementById('order-drawer');
  var backdrop = document.querySelector('[data-order-backdrop]');
  var toggleBtn = document.querySelector('[data-order-toggle]');
  var countEl = document.querySelector('[data-order-count]');
  var itemsEl = document.querySelector('[data-order-items]');
  var emptyEl = document.querySelector('[data-order-empty]');
  var footEl = document.querySelector('[data-order-foot]');
  var totalEl = document.querySelector('[data-order-total]');
  var sendEl = document.querySelector('[data-order-send]');

  function orderCount(list) {
    return list.reduce(function (a, it) { return a + it.qty; }, 0);
  }

  function mailtoHref(list) {
    var lines = list.map(function (it) {
      var hand = it.hand ? ' — ' + it.hand : '';
      return '- ' + it.code + ' — ' + CFG.qty + ' ' + it.qty + hand;
    }).join('\n');
    var body = CFG.intro + '\n\n' + lines + '\n\n' + CFG.outro;
    return 'mailto:' + CFG.mailto +
      '?subject=' + encodeURIComponent(CFG.subject) +
      '&body=' + encodeURIComponent(body);
  }

  function render() {
    var list = loadOrder();
    var n = orderCount(list);
    if (countEl) {
      countEl.textContent = String(n);
      countEl.hidden = n === 0;
    }
    if (!itemsEl) return;

    itemsEl.textContent = '';
    var total = 0;
    var hasQuote = false;

    list.forEach(function (it, idx) {
      if (it.price != null) total += it.price * it.qty; else hasQuote = true;

      var li = document.createElement('li');

      var code = document.createElement('span');
      code.className = 'oi-code';
      code.textContent = it.code;
      li.appendChild(code);

      var price = document.createElement('span');
      price.className = 'oi-price';
      price.textContent = it.price != null ? fmtPrice(it.price * it.qty) : CFG.onRequest;
      li.appendChild(price);

      var name = document.createElement('span');
      name.className = 'oi-name';
      name.textContent = it.name || '';
      li.appendChild(name);

      var controls = document.createElement('span');
      controls.className = 'oi-controls';

      var qty = document.createElement('input');
      qty.type = 'number';
      qty.min = '1';
      qty.max = '999';
      qty.value = String(it.qty);
      qty.setAttribute('aria-label', CFG.qty + ' — ' + it.code);
      qty.addEventListener('change', function () {
        var v = Math.max(1, Math.min(999, parseInt(qty.value, 10) || 1));
        var l = loadOrder();
        if (l[idx]) { l[idx].qty = v; saveOrder(l); render(); }
      });
      controls.appendChild(qty);

      var hand = document.createElement('select');
      hand.setAttribute('aria-label', CFG.hand + ' — ' + it.code);
      ['', 'DX', 'SX', 'DX + SX'].forEach(function (v) {
        var o = document.createElement('option');
        o.value = v;
        o.textContent = v || '—';
        if (v === it.hand) o.selected = true;
        hand.appendChild(o);
      });
      hand.addEventListener('change', function () {
        var l = loadOrder();
        if (l[idx]) { l[idx].hand = hand.value; saveOrder(l); render(); }
      });
      controls.appendChild(hand);

      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'oi-remove';
      rm.textContent = '×';
      rm.setAttribute('aria-label', it.code);
      rm.addEventListener('click', function () {
        var l = loadOrder();
        l.splice(idx, 1);
        saveOrder(l);
        render();
      });
      controls.appendChild(rm);

      li.appendChild(controls);
      itemsEl.appendChild(li);
    });

    if (emptyEl) emptyEl.hidden = list.length > 0;
    if (footEl) footEl.hidden = list.length === 0;
    if (totalEl) totalEl.textContent = fmtPrice(total) + (hasQuote ? ' +' : '');
    if (sendEl) sendEl.setAttribute('href', mailtoHref(list));
  }

  function openDrawer() {
    if (!drawer) return;
    drawer.hidden = false;
    if (backdrop) backdrop.hidden = false;
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    render();
    var close = drawer.querySelector('[data-order-close]');
    if (close) close.focus();
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.hidden = true;
    if (backdrop) backdrop.hidden = true;
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.focus();
    }
  }

  if (toggleBtn) toggleBtn.addEventListener('click', openDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer && !drawer.hidden) closeDrawer();
  });
  var closeBtn = document.querySelector('[data-order-close]');
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  var clearBtn = document.querySelector('[data-order-clear]');
  if (clearBtn) clearBtn.addEventListener('click', function () {
    saveOrder([]);
    render();
  });

  // Бутони „Добави към поръчката“
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-add]') : null;
    if (!btn) return;
    var code = btn.getAttribute('data-code');
    if (!code) return;
    var priceAttr = btn.getAttribute('data-price');
    var list = loadOrder();
    var found = null;
    for (var i = 0; i < list.length; i++) if (list[i].code === code) { found = list[i]; break; }
    if (found) found.qty += 1;
    else list.push({
      code: code,
      name: btn.getAttribute('data-name') || code,
      price: priceAttr ? parseFloat(priceAttr) : null,
      qty: 1,
      hand: '',
    });
    saveOrder(list);
    render();
    var original = btn.textContent;
    btn.classList.add('is-added');
    btn.textContent = CFG.added || original;
    setTimeout(function () {
      btn.classList.remove('is-added');
      btn.textContent = original;
    }, 1200);
  });

  // ── Контактна форма → POST /api/contact ──
  var form = document.querySelector('[data-contact-form]');
  if (form) {
    // Ако идваме от „Изпрати чрез формата“, предпопълни съобщението.
    var msgField = form.querySelector('[name="messaggio"]');
    var list = loadOrder();
    if (msgField && !msgField.value && list.length && location.hash === '#modulo') {
      msgField.value = list.map(function (it) {
        return '- ' + it.code + ' — ' + CFG.qty + ' ' + it.qty + (it.hand ? ' — ' + it.hand : '');
      }).join('\n');
    }

    var status = form.querySelector('[data-form-status]');
    var submit = form.querySelector('[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      var items = loadOrder().map(function (it) {
        return { codice: it.code + (it.hand ? ' (' + it.hand + ')' : ''), name: it.name, qty: it.qty, price: it.price || 0 };
      });
      var totale = items.reduce(function (a, it) { return a + it.price * it.qty; }, 0);

      var payload = {
        nome: form.nome.value.trim(),
        azienda: form.azienda.value.trim(),
        email: form.email.value.trim(),
        tel: form.tel.value.trim(),
        messaggio: form.messaggio.value.trim(),
        privacy: form.privacy.checked,
        website: form.website.value,
        source: 'sito-' + document.documentElement.lang,
      };
      if (items.length) { payload.items = items; payload.totale = totale; }

      submit.disabled = true;
      submit.textContent = submit.getAttribute('data-sending-label');
      status.className = 'form-status';
      status.textContent = '';

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }).then(function () {
        status.className = 'form-status ok';
        status.textContent = status.getAttribute('data-ok');
        form.reset();
        saveOrder([]);
        render();
      }).catch(function () {
        status.className = 'form-status err';
        status.textContent = status.getAttribute('data-err');
      }).finally(function () {
        submit.disabled = false;
        submit.textContent = submit.getAttribute('data-submit-label');
      });
    });
  }

  // ── Дискретно появяване при скрол (уважава reduced-motion) ──
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      'IntersectionObserver' in window) {
    var targets = document.querySelectorAll(
      '.app-card, .fam-card, .step, .sys-card, .highlight-card, .preview-strip li'
    );
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-visible');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (el) {
      el.classList.add('reveal');
      io.observe(el);
    });
  }

  render();
})();
