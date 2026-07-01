/* ═══════════════════════════════════════════════════════════════════
   UYLAS KEBAP CENTER — app.js
   CSP-safe (nessuno script inline). Vanilla JS, zero dipendenze.
   i18n IT/EN · tab del menu · navigazione mobile · cookie · mappa gated
   · reveal allo scroll · stato apertura · back-to-top.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ───────── i18n ───────── */
  var I18N_EN = {
      'con.lead': 'Uylas Kebap Center in Cornaredo, Bareggio and Sedriano — always close to you in west Milan.',
      'sede.main': '★ Main venue · wood-fired oven',
      'sede.call': 'Call',
      'sede.dir': 'Directions',
      'sede.h.cornaredo': 'Tue–Sun 11:00–24:00 · Closed Monday',
      'sede.h.bareggio': 'Every day 12:00–24:00',
      'sede.h.sedriano': 'Tue–Sun 11:30–24:00 · Closed Monday',
      'skip': 'Skip to content',
      'nav.menu': 'Menu', 'nav.about': 'About us', 'nav.why': 'Why us',
      'nav.delivery': 'Delivery', 'nav.contact': 'Contact',
      'hero.chip.halal': '🍢 Halal meat', 'hero.chip.fresh': 'Oven & grill daily',
      'hero.title1': 'Authentic Turkish kebab', 'hero.title2': 'in Milano Ovest.',
      'hero.lead': 'Marinated, flame-grilled meat, pizza with homemade dough, durum, piadina and falafel. Dine in, take away or delivered to your door.',
      'hero.cta.menu': 'See the menu', 'hero.cta.call': 'Call & order',
      'hero.note': '3 locations: Cornaredo · Bareggio · Sedriano — wood-fired oven & free delivery',
      'about.eyebrow': 'Our story', 'about.title': 'Flavours of <span class="accent">Istanbul</span>, heart in west Milan',
      'about.p1': 'Uylas Kebap Center was born from a passion for authentic Turkish street food: selected meat, spice-marinated and slow-grilled, warm bread every day and pizza made with homemade dough.',
      'about.p2': 'With three locations in Cornaredo, Bareggio and Sedriano we serve families, students and workers looking for a generous, honest and quick meal — dine in, take away or at home. Fresh ingredients, big portions and a warm welcome.',
      'about.stat1': 'locations nearby', 'about.stat2': 'wood-fired oven', 'about.stat3': 'halal meat',
      'about.photo': 'Photo of the venue<br>(add real image)',
      'menu.eyebrow': 'The menu', 'menu.title': 'Kebab &amp; pizza <span class="accent">at Uylas</span>',
      'ob.call': 'Call', 'ob.order': 'Order online',
      'menu.lead': 'Indicative prices — the full, up-to-date list is available in store and on the delivery apps.',
      'menu.cat.kebab': '🥙 Kebab & Döner', 'menu.cat.pizza': '🍕 Pizzas & Turkish specials', 'menu.cat.combo': '🍟 Combo meals',
      'menu.cat.veg': '🌱 Veg & Falafel', 'menu.cat.extra': '🥤 Sides, Sweets & Drinks',
      'menu.allergen': 'For allergens and intolerances ask our staff: a written allergen register is available in store. Vegetarian and halal options available.',
      'menu.order': 'Order now →',
      'd.k1': 'Veal and turkey meat, salad, tomato, onion and sauces.',
      'd.k2': 'Rolled Turkish yufka flatbread with döner, fresh veg and sauces.',
      'd.k3': 'The XL version of our most-loved döner kebab sandwich.',
      'd.k4': 'Generous portion of flame-grilled meat with fries and salad.',
      'd.k5': 'Veal and turkey on rice, with yogurt and spicy sauces.',
      'd.k6': 'Meat only, in three sizes: small, medium and large.',
      'd.k7': 'Chickpea & minced-veg patties with spices, fries and salad.',
      'd.p1': 'Our signature: tomato, mozzarella, döner kebab meat, salad, onion and sauces.',
      'd.p2': 'Tomato and mozzarella. Homemade dough.',
      'd.p3': 'Tomato, garlic and oregano.',
      'd.p4': 'Tomato, mozzarella and spicy salami.',
      'd.p5': 'Tomato, mozzarella, ham, olives, capers, mushrooms and artichokes.',
      'd.p6': 'Tomato and buffalo mozzarella.',
      'd.p7': 'Tomato, mozzarella, aubergine, courgette and peppers.',
      'd.p8': 'Mozzarella, gorgonzola, taleggio and grana.',
      'd.p9': 'Tomato, mozzarella, döner kebab and peppers.',
      'd.p10': 'Thin Turkish flatbread with spiced minced meat.',
      'd.p11': 'Boat-shaped Turkish pide filled with döner kebab.',
      'd.p12': 'Tomato, mozzarella and döner kebab meat.',
      'd.m1': 'Döner kebab sandwich + small fries + 33cl can.',
      'd.m2': 'Döner kebab piadina + small fries + 33cl can.',
      'd.m3': 'Margherita pizza + small fries + 33cl can.',
      'd.m4': 'Falafel sandwich + small fries + 33cl can.',
      'd.m5': 'Cutlet sandwich + small fries + 33cl can.',
      'd.v1': 'Chickpea & minced-veg patties, salad, tomato, onion and sauces.',
      'd.v2': 'Flatbread with falafel, fresh veg, tomato, onion and sauces.',
      'd.v3': 'Tomato, mozzarella and grilled vegetables.',
      'd.v4': 'Tomato, cucumber, chilli and parsley — çoban salatası.',
      'd.v5': 'Green salad, tomato, tuna, olives, peppers and sauces.',
      'd.v6': 'Chickpea & minced-veg patty with spices.',
      'd.e1': 'Crispy, in three sizes: small, medium and large.',
      'd.e2': 'Potato, cheese and spices (1 piece).',
      'd.e3': 'Filo pastry, pistachio, butter and sugar syrup (4 pieces).',
      'd.e4': 'Shredded pastry, pistachio and sugar syrup.',
      'd.e5': 'Sweet flatbread with Nutella and icing sugar.',
      'd.e6': 'Turkish yogurt drink, fresh and thirst-quenching.',
      'd.e7': 'Pepsi, peach/lemon iced tea, oran soda, lemon soda and more.',
      'd.e8': 'Still bottled water.',
      'why.eyebrow': 'Why Uylas', 'why.title': 'Tasty. Honest. <span class="accent">Generous.</span>',
      'why.1.t': 'Wood oven & grill', 'why.1.p': 'Pizza baked in the wood-fired oven and flame-grilled kebab every day, for an authentic taste.',
      'why.2.t': 'Fresh ingredients', 'why.2.p': 'Daily vegetables, warm bread and homemade pizza dough. No shortcuts.',
      'why.3.t': 'Non-stop hours', 'why.3.p': 'Tuesday to Sunday, 11:00–24:00 non-stop. Closed Monday. Meal vouchers accepted.',
      'why.4.t': 'Home delivery', 'why.4.p': 'Across Cornaredo, Bareggio and nearby towns via Just Eat and Deliveroo, or order and collect.',
      'gal.eyebrow': 'Gallery', 'gal.title': 'Straight off the <span class="accent">grill</span>',
      'gal.ph1': 'Kebab spit', 'gal.ph2': 'Oven pizza', 'gal.ph3': 'Filled durum',
      'gal.ph4': 'Fries', 'gal.ph5': 'Falafel', 'gal.ph6': 'The venue',
      'gal.note': 'Brand illustrations — swap them for real photos of your dishes whenever you like.',
      'rev.lead': 'Hundreds of positive reviews from customers in Cornaredo, Bareggio, Pero and Rho.',
      'rev.note': 'Illustrative testimonials. Read the real reviews on our <a href="https://www.google.com/maps/search/?api=1&amp;query=Uylas+Kebap+Center+Cornaredo" target="_blank" rel="noopener">Google profile</a>.',
      'rev.1': '“The best kebab around, huge portions and a fair price. Tasty meat and very kind staff.”',
      'rev.2': '“We order home almost every Friday. Pizza and durum always on time and hot. Highly recommended!”',
      'rev.3': '“Clean place, fast service and really good falafel. Great for non-meat eaters too.”',
      'del.eyebrow': 'Order now', 'del.title': 'To your door, <span class="accent">hot and fast</span>',
      'del.lead': 'Free home delivery in Cornaredo; 2 € to neighbouring towns, free for orders over 15 €. Order on the apps or call us for takeaway and reservations.',
      'del.online': 'Order online', 'del.online2': 'Order online', 'del.call': 'Call & order',
      'del.cta': '📞 Call now', 'del.note': 'Takeaway ready in minutes · Table reservations available',
      'con.eyebrow': 'Find us', 'con.title': 'Our <span class="accent">three locations</span>',
      'con.open': 'Open now', 'con.closed': 'Closed now',
      'con.addr': 'Address', 'con.phone': 'Phone', 'con.hours': 'Opening hours',
      'con.maptext': 'The Google map (Cornaredo) loads only with your consent.',
      'con.mapbtn': 'Load the map', 'con.mapalt': 'or open in Google Maps →',
      'day.mon': 'Monday', 'day.tue': 'Tuesday', 'day.wed': 'Wednesday', 'day.thu': 'Thursday',
      'day.fri': 'Friday', 'day.sat': 'Saturday', 'day.sun': 'Sunday',
      'foot.tag': 'Kebap, bar and pizzeria with Turkish specialties and wood-fired pizza in the heart of Cornaredo.',
      'foot.explore': 'Explore', 'foot.contact': 'Contact', 'foot.legal': 'Information',
      'foot.hours': 'Tue–Sun 11:00–24:00 · Mon closed', 'foot.privacy': 'Privacy Policy',
      'foot.cookie': 'Cookie Policy', 'foot.prefs': 'Cookie preferences', 'foot.vat': 'to be added',
      'foot.credit': 'Design &amp; development <a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth</a>',
      'ck.title': '🍪 We respect your privacy',
      'ck.text': 'We only use technical cookies required for the site to work. Any analytics or map cookies are enabled only with your consent. <a href="cookie.html">Read the Cookie Policy</a>.',
      'ck.accept': 'Accept all', 'ck.reject': 'Reject non-essential'
  };

  /* Италианският е източникът на истината в HTML. Пазим оригиналите и
     превеждаме към EN само при превключване; за IT връщаме оригинала. */
  var I18N_NODES = $$('[data-i18n]');
  I18N_NODES.forEach(function (el) { el.setAttribute('data-it', el.innerHTML); });
  function applyLang(lang) {
    var en = lang === 'en';
    I18N_NODES.forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      el.innerHTML = (en && I18N_EN[key] != null) ? I18N_EN[key] : el.getAttribute('data-it');
    });
    document.documentElement.lang = en ? 'en' : 'it';
    $$('.lang-toggle button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
    try { localStorage.setItem('uylas_lang', lang); } catch (e) {}
  }

  /* lingua iniziale: query ?lang= → localStorage → browser → it */
  function initLang() {
    var q = new URLSearchParams(location.search).get('lang');
    var saved; try { saved = localStorage.getItem('uylas_lang'); } catch (e) {}
    var nav = (navigator.language || 'it').slice(0, 2);
    var lang = (q === 'en' || q === 'it') ? q : (saved || (nav === 'en' ? 'en' : 'it'));
    applyLang(lang);
  }
  $$('.lang-toggle button').forEach(function (b) {
    b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
  });

  /* ───────── Tab del menu ───────── */
  var tabs = $$('.menu-tab');
  tabs.forEach(function (tab) {
    tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' ? '0' : '-1');
    tab.addEventListener('click', function () { selectTab(tab, true); });
    tab.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(tab), n = null;
      if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') n = tabs[0];
      else if (e.key === 'End') n = tabs[tabs.length - 1];
      if (n) { e.preventDefault(); n.focus(); selectTab(n, true); }
    });
  });
  function selectTab(tab, anchor) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.setAttribute('tabindex', on ? '0' : '-1');
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    // при смяна на таб котвим към лентата с табове, ако е излязла над хедъра
    if (anchor) {
      var head = document.querySelector('.menu-tabs');
      if (head && head.getBoundingClientRect().top < 90) {
        var top = head.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: top, behavior: prefersReduced() ? 'auto' : 'smooth' });
      }
    }
  }

  /* ───────── Navigazione mobile ───────── */
  var burger = $('#burger'), nav = $('#nav');
  if (burger && nav) {
    nav.classList.add('mobile');
    burger.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', String(open));
    });
    $$('#nav a').forEach(function (a) {
      a.addEventListener('click', function () {
        document.body.classList.remove('nav-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ───────── Header scrolled + back-to-top ───────── */
  var header = $('#header'), toTop = $('#toTop');
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle('scrolled', y > 24);
    if (toTop) toTop.classList.toggle('show', y > 600);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' });
  });

  /* ───────── Reveal allo scroll ───────── */
  function prefersReduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !prefersReduced()) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ───────── Cookie consent ───────── */
  var COOKIE_KEY = 'uylas_consent';
  var cookie = $('#cookie');
  function getConsent() { try { return localStorage.getItem(COOKIE_KEY); } catch (e) { return null; } }
  function setConsent(v) {
    try { localStorage.setItem(COOKIE_KEY, v); } catch (e) {}
    if (cookie) cookie.classList.remove('show');
    if (v === 'all') loadMap();
  }
  function showCookie() { if (cookie && !getConsent()) setTimeout(function () { cookie.classList.add('show'); }, 800); }
  var ckA = $('#ckAccept'), ckR = $('#ckReject'), ckPrefs = $('#cookiePrefs');
  if (ckA) ckA.addEventListener('click', function () { setConsent('all'); });
  if (ckR) ckR.addEventListener('click', function () { setConsent('necessary'); });
  if (ckPrefs) ckPrefs.addEventListener('click', function (e) {
    e.preventDefault();
    try { localStorage.removeItem(COOKIE_KEY); } catch (er) {}
    if (cookie) cookie.classList.add('show');
  });

  /* ───────── Mappa consent-gated ───────── */
  var mapWrap = $('#mapWrap');
  function loadMap() {
    if (!mapWrap || mapWrap.dataset.loaded) return;
    var src = mapWrap.getAttribute('data-src');
    if (!src) return;
    var ifr = document.createElement('iframe');
    ifr.src = src;
    ifr.loading = 'lazy';
    ifr.title = 'Mappa — Uylas Kebap Center, Via Milano 102, Bareggio';
    ifr.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    mapWrap.innerHTML = '';
    mapWrap.appendChild(ifr);
    mapWrap.dataset.loaded = '1';
  }
  var mapLoadBtn = $('#mapLoad');
  if (mapLoadBtn) mapLoadBtn.addEventListener('click', function () {
    try { localStorage.setItem('uylas_map', '1'); } catch (e) {}  // съгласие за картата се запомня
    loadMap();
  });

  /* ───────── Marquee: пауза-контрол (WCAG 2.2.2) ───────── */
  var mq = $('.marquee'), mqBtn = $('#marqueePause');
  if (mq && mqBtn) mqBtn.addEventListener('click', function () {
    var p = mq.classList.toggle('paused');
    mqBtn.setAttribute('aria-pressed', String(p));
    mqBtn.textContent = p ? '▶' : '⏸';
  });

  /* ───────── Anno corrente ───────── */
  var yEl = $('#year');
  if (yEl) yEl.textContent = String(new Date().getFullYear());

  /* ───────── Init ───────── */
  initLang();
  var mapOk = false;
  try { mapOk = localStorage.getItem('uylas_map') === '1'; } catch (e) {}
  if (getConsent() === 'all' || mapOk) loadMap();
  showCookie();
})();
