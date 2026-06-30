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
  var I18N = {
    it: {
      'skip': 'Vai al contenuto',
      'nav.menu': 'Menu', 'nav.about': 'Chi siamo', 'nav.why': 'Perché noi',
      'nav.delivery': 'Consegna', 'nav.contact': 'Contatti',
      'hero.chip.halal': '🍢 Carne Halal', 'hero.chip.fresh': 'Forno & brace ogni giorno',
      'hero.title1': 'Il vero kebab turco', 'hero.title2': 'a Bareggio.',
      'hero.lead': 'Carne marinata e cotta alla brace, pizza con impasto fatto in casa, durum, piadine e falafel. Da gustare al tavolo, da asporto o a domicilio.',
      'hero.cta.menu': 'Scopri il menu', 'hero.cta.call': 'Chiama & ordina',
      'hero.note': 'Oltre 130 recensioni a 4.6★ su Google · Aperto tutti i giorni 12:00–24:00',
      'about.eyebrow': 'La nostra storia', 'about.title': 'Sapori di <span class="accent">Istanbul</span>, cuore a Bareggio',
      'about.p1': 'Uylas Kebap Center nasce dalla passione per la vera cucina turca di strada: carne selezionata, marinata con spezie e cotta lentamente alla brace, pane caldo ogni giorno e una pizza preparata con impasto fatto in casa.',
      'about.p2': 'Qui a Bareggio serviamo famiglie, studenti e lavoratori che cercano un pasto generoso, onesto e veloce — al tavolo, da asporto o comodamente a casa. Ingredienti freschi, porzioni abbondanti e il sorriso di sempre.',
      'about.stat1': 'anni a Bareggio', 'about.stat2': 'valutazione media', 'about.stat3': 'carne halal',
      'about.photo': 'Foto del locale<br>(inserire immagine reale)',
      'menu.eyebrow': 'Il menu', 'menu.title': 'Kebab e pizza a <span class="accent">Bareggio</span>',
      'ob.call': 'Chiama', 'ob.order': 'Ordina online',
      'menu.lead': 'Prezzi indicativi — la lista completa e aggiornata è disponibile in negozio e sulle app di consegna.',
      'menu.cat.kebab': '🥙 Kebab & Durum', 'menu.cat.pizza': '🍕 Pizza', 'menu.cat.combo': '🍟 Menù combo',
      'menu.cat.veg': '🌱 Veg & Falafel', 'menu.cat.extra': '🥤 Extra & Bibite',
      'menu.allergen': 'Per allergeni e intolleranze chiedi al personale. Disponibili opzioni vegetariane e halal.',
      'menu.order': 'Ordina ora →',
      'd.panino': 'Pane turco, carne alla brace, insalata fresca e salse a scelta.',
      'd.durum': 'Piadina turca arrotolata, carne, verdure croccanti e salse.',
      'd.piadina': 'Piadina farcita con kebab, insalata e salse della casa.',
      'd.adana': 'Spiedino speziato di carne macinata cotto alla brace, con contorni.',
      'd.piatto': 'Generosa porzione di carne, patatine, insalata e pane caldo.',
      'd.iskender': 'Kebab su pane con salsa di pomodoro, burro e yogurt.',
      'd.margherita': 'Pomodoro, mozzarella e basilico. Impasto fatto in casa.',
      'd.diavola': 'Pomodoro, mozzarella e salame piccante.',
      'd.kebabpizza': 'La nostra firma: pomodoro, mozzarella, carne kebab e salse.',
      'd.stagioni': 'Pomodoro, mozzarella, funghi, prosciutto, carciofi e olive.',
      'd.vegpizza': 'Pomodoro, mozzarella e verdure grigliate di stagione.',
      'd.capricciosa': 'Pomodoro, mozzarella, prosciutto, funghi, carciofi e uovo.',
      'd.mpanino': 'Panino kebab + patatine + bibita 33cl.',
      'd.mdurum': 'Durum kebab + patatine + bibita 33cl.',
      'd.mmargherita': 'Pizza margherita + patatine + bibita 33cl.',
      'd.mfalafel': 'Panino falafel + patatine + bibita 33cl.',
      'd.mcotoletta': 'Panino con cotoletta + patatine + bibita 33cl.',
      'd.mfamiglia': '2 kebab + pizza + patatine grandi + 4 bibite.',
      'd.falafel': 'Polpette di ceci e spezie, verdure fresche e salsa allo yogurt.',
      'd.durumfalafel': 'Piadina arrotolata con falafel, hummus e verdure.',
      'd.insalata': 'Insalata mista abbondante con verdure di stagione.',
      'd.hummus': 'Crema di ceci e tahina servita con pane turco caldo.',
      'd.patatine': 'Croccanti fuori, morbide dentro. Piccole o grandi.',
      'd.onion': 'Anelli di cipolla dorati e croccanti.',
      'd.bibite': 'Cola, aranciata, acqua, the freddo e altre bevande.',
      'd.ayran': 'Bevanda turca a base di yogurt, fresca e dissetante.',
      'd.baklava': 'Dolce turco a strati di pasta fillo, miele e pistacchio.',
      'why.eyebrow': 'Perché Uylas', 'why.title': 'Buono. Onesto. <span class="accent">Generoso.</span>',
      'why.1.t': 'Cottura alla brace', 'why.1.p': 'Carne marinata e cotta sullo spiedo verticale ogni giorno, per un sapore autentico e succoso.',
      'why.2.t': 'Ingredienti freschi', 'why.2.p': 'Verdure di giornata, pane caldo e impasto pizza fatto in casa. Niente scorciatoie.',
      'why.3.t': 'Veloce, sempre aperto', 'why.3.p': 'Tutti i giorni dalle 12:00 a mezzanotte. Pranzo, cena e dopo-serata.',
      'why.4.t': 'Consegna a domicilio', 'why.4.p': 'A Bareggio e dintorni con Just Eat e Deliveroo, oppure ordina e ritira.',
      'gal.eyebrow': 'Galleria', 'gal.title': 'Direttamente dalla <span class="accent">brace</span>',
      'gal.ph1': 'Spiedo di kebab', 'gal.ph2': 'Pizza al forno', 'gal.ph3': 'Durum farcito',
      'gal.ph4': 'Patatine', 'gal.ph5': 'Falafel', 'gal.ph6': 'Il locale',
      'gal.note': 'Sostituisci questi riquadri con le foto reali dei tuoi piatti per il massimo impatto.',
      'rev.lead': 'Centinaia di recensioni positive da clienti di Bareggio, Cornaredo, Sedriano e Corbetta.',
      'rev.1': '„Il miglior kebab della zona, porzioni enormi e prezzo onesto. Carne saporita e personale gentilissimo.“',
      'rev.2': '„Ordiniamo a casa quasi ogni venerdì. Pizza e durum sempre puntuali e caldi. Consigliatissimo!“',
      'rev.3': '„Locale pulito, servizio veloce e falafel davvero buoni. Ottimo anche per chi non mangia carne.“',
      'del.eyebrow': 'Ordina ora', 'del.title': 'A casa tua, <span class="accent">caldo e veloce</span>',
      'del.lead': 'Consegniamo a Bareggio e nei comuni vicini. Ordina online sulle app o chiamaci direttamente per asporto e prenotazioni.',
      'del.online': 'Ordina online', 'del.online2': 'Ordina online', 'del.call': 'Chiama e ordina',
      'del.cta': '📞 Chiama adesso', 'del.note': 'Asporto pronto in pochi minuti · Prenotazione tavoli disponibile',
      'con.eyebrow': 'Dove siamo', 'con.title': 'Passa a <span class="accent">trovarci</span>',
      'con.open': 'Aperto adesso', 'con.closed': 'Chiuso adesso',
      'con.addr': 'Indirizzo', 'con.phone': 'Telefono', 'con.hours': 'Orari di apertura',
      'con.maptext': 'La mappa di Google viene caricata solo con il tuo consenso (cookie di terze parti).',
      'con.mapbtn': 'Carica la mappa', 'con.mapalt': 'oppure apri in Google Maps →',
      'day.mon': 'Lunedì', 'day.tue': 'Martedì', 'day.wed': 'Mercoledì', 'day.thu': 'Giovedì',
      'day.fri': 'Venerdì', 'day.sat': 'Sabato', 'day.sun': 'Domenica',
      'foot.tag': 'Il vero kebab turco, la pizza fatta in casa e i sapori mediterranei nel cuore di Bareggio.',
      'foot.explore': 'Esplora', 'foot.contact': 'Contatti', 'foot.legal': 'Informazioni',
      'foot.hours': 'Tutti i giorni 12:00–24:00', 'foot.privacy': 'Privacy Policy',
      'foot.cookie': 'Cookie Policy', 'foot.prefs': 'Preferenze cookie', 'foot.vat': 'da inserire',
      'ck.title': '🍪 Rispettiamo la tua privacy',
      'ck.text': 'Usiamo solo cookie tecnici necessari al funzionamento del sito. Eventuali cookie statistici o di mappe vengono attivati solo con il tuo consenso. <a href="cookie.html">Leggi la Cookie Policy</a>.',
      'ck.accept': 'Accetta tutti', 'ck.reject': 'Rifiuta non necessari'
    },
    en: {
      'skip': 'Skip to content',
      'nav.menu': 'Menu', 'nav.about': 'About us', 'nav.why': 'Why us',
      'nav.delivery': 'Delivery', 'nav.contact': 'Contact',
      'hero.chip.halal': '🍢 Halal meat', 'hero.chip.fresh': 'Oven & grill daily',
      'hero.title1': 'Authentic Turkish kebab', 'hero.title2': 'in Bareggio.',
      'hero.lead': 'Marinated, flame-grilled meat, pizza with homemade dough, durum, piadina and falafel. Dine in, take away or delivered to your door.',
      'hero.cta.menu': 'See the menu', 'hero.cta.call': 'Call & order',
      'hero.note': '130+ reviews at 4.6★ on Google · Open every day 12:00–24:00',
      'about.eyebrow': 'Our story', 'about.title': 'Flavours of <span class="accent">Istanbul</span>, heart in Bareggio',
      'about.p1': 'Uylas Kebap Center was born from a passion for authentic Turkish street food: selected meat, spice-marinated and slow-grilled, warm bread every day and pizza made with homemade dough.',
      'about.p2': 'Here in Bareggio we serve families, students and workers looking for a generous, honest and quick meal — at the table, to take away or comfortably at home. Fresh ingredients, big portions and a warm welcome.',
      'about.stat1': 'years in Bareggio', 'about.stat2': 'average rating', 'about.stat3': 'halal meat',
      'about.photo': 'Photo of the venue<br>(add real image)',
      'menu.eyebrow': 'The menu', 'menu.title': 'Kebab &amp; pizza in <span class="accent">Bareggio</span>',
      'ob.call': 'Call', 'ob.order': 'Order online',
      'menu.lead': 'Indicative prices — the full, up-to-date list is available in store and on the delivery apps.',
      'menu.cat.kebab': '🥙 Kebab & Durum', 'menu.cat.pizza': '🍕 Pizza', 'menu.cat.combo': '🍟 Combo meals',
      'menu.cat.veg': '🌱 Veg & Falafel', 'menu.cat.extra': '🥤 Sides & Drinks',
      'menu.allergen': 'For allergens and intolerances ask our staff. Vegetarian and halal options available.',
      'menu.order': 'Order now →',
      'd.panino': 'Turkish bread, flame-grilled meat, fresh salad and sauces of your choice.',
      'd.durum': 'Rolled Turkish flatbread, meat, crunchy veg and sauces.',
      'd.piadina': 'Flatbread filled with kebab, salad and house sauces.',
      'd.adana': 'Spiced minced-meat skewer grilled over the flame, with sides.',
      'd.piatto': 'Generous portion of meat, fries, salad and warm bread.',
      'd.iskender': 'Kebab over bread with tomato sauce, butter and yogurt.',
      'd.margherita': 'Tomato, mozzarella and basil. Homemade dough.',
      'd.diavola': 'Tomato, mozzarella and spicy salami.',
      'd.kebabpizza': 'Our signature: tomato, mozzarella, kebab meat and sauces.',
      'd.stagioni': 'Tomato, mozzarella, mushrooms, ham, artichokes and olives.',
      'd.vegpizza': 'Tomato, mozzarella and seasonal grilled vegetables.',
      'd.capricciosa': 'Tomato, mozzarella, ham, mushrooms, artichokes and egg.',
      'd.mpanino': 'Kebab sandwich + fries + 33cl drink.',
      'd.mdurum': 'Durum kebab + fries + 33cl drink.',
      'd.mmargherita': 'Margherita pizza + fries + 33cl drink.',
      'd.mfalafel': 'Falafel sandwich + fries + 33cl drink.',
      'd.mcotoletta': 'Cutlet sandwich + fries + 33cl drink.',
      'd.mfamiglia': '2 kebabs + pizza + large fries + 4 drinks.',
      'd.falafel': 'Chickpea & spice patties, fresh veg and yogurt sauce.',
      'd.durumfalafel': 'Rolled flatbread with falafel, hummus and veg.',
      'd.insalata': 'Generous mixed salad with seasonal vegetables.',
      'd.hummus': 'Chickpea and tahini cream served with warm Turkish bread.',
      'd.patatine': 'Crispy outside, soft inside. Small or large.',
      'd.onion': 'Golden, crunchy onion rings.',
      'd.bibite': 'Cola, orange, water, iced tea and more.',
      'd.ayran': 'Turkish yogurt drink, fresh and thirst-quenching.',
      'd.baklava': 'Turkish layered filo pastry with honey and pistachio.',
      'why.eyebrow': 'Why Uylas', 'why.title': 'Tasty. Honest. <span class="accent">Generous.</span>',
      'why.1.t': 'Flame-grilled', 'why.1.p': 'Meat marinated and cooked on the vertical spit every day for an authentic, juicy flavour.',
      'why.2.t': 'Fresh ingredients', 'why.2.p': 'Daily vegetables, warm bread and homemade pizza dough. No shortcuts.',
      'why.3.t': 'Fast, always open', 'why.3.p': 'Every day from noon to midnight. Lunch, dinner and late night.',
      'why.4.t': 'Home delivery', 'why.4.p': 'Across Bareggio and nearby towns via Just Eat and Deliveroo, or order and collect.',
      'gal.eyebrow': 'Gallery', 'gal.title': 'Straight off the <span class="accent">grill</span>',
      'gal.ph1': 'Kebab spit', 'gal.ph2': 'Oven pizza', 'gal.ph3': 'Filled durum',
      'gal.ph4': 'Fries', 'gal.ph5': 'Falafel', 'gal.ph6': 'The venue',
      'gal.note': 'Replace these tiles with real photos of your dishes for maximum impact.',
      'rev.lead': 'Hundreds of positive reviews from customers in Bareggio, Cornaredo, Sedriano and Corbetta.',
      'rev.1': '“The best kebab around, huge portions and a fair price. Tasty meat and very kind staff.”',
      'rev.2': '“We order home almost every Friday. Pizza and durum always on time and hot. Highly recommended!”',
      'rev.3': '“Clean place, fast service and really good falafel. Great for non-meat eaters too.”',
      'del.eyebrow': 'Order now', 'del.title': 'To your door, <span class="accent">hot and fast</span>',
      'del.lead': 'We deliver in Bareggio and nearby towns. Order online on the apps or call us directly for takeaway and reservations.',
      'del.online': 'Order online', 'del.online2': 'Order online', 'del.call': 'Call & order',
      'del.cta': '📞 Call now', 'del.note': 'Takeaway ready in minutes · Table reservations available',
      'con.eyebrow': 'Find us', 'con.title': 'Come <span class="accent">visit us</span>',
      'con.open': 'Open now', 'con.closed': 'Closed now',
      'con.addr': 'Address', 'con.phone': 'Phone', 'con.hours': 'Opening hours',
      'con.maptext': 'The Google map loads only with your consent (third-party cookies).',
      'con.mapbtn': 'Load the map', 'con.mapalt': 'or open in Google Maps →',
      'day.mon': 'Monday', 'day.tue': 'Tuesday', 'day.wed': 'Wednesday', 'day.thu': 'Thursday',
      'day.fri': 'Friday', 'day.sat': 'Saturday', 'day.sun': 'Sunday',
      'foot.tag': 'Authentic Turkish kebab, homemade pizza and Mediterranean flavours in the heart of Bareggio.',
      'foot.explore': 'Explore', 'foot.contact': 'Contact', 'foot.legal': 'Information',
      'foot.hours': 'Every day 12:00–24:00', 'foot.privacy': 'Privacy Policy',
      'foot.cookie': 'Cookie Policy', 'foot.prefs': 'Cookie preferences', 'foot.vat': 'to be added',
      'ck.title': '🍪 We respect your privacy',
      'ck.text': 'We only use technical cookies required for the site to work. Any analytics or map cookies are enabled only with your consent. <a href="cookie.html">Read the Cookie Policy</a>.',
      'ck.accept': 'Accept all', 'ck.reject': 'Reject non-essential'
    }
  };

  function applyLang(lang) {
    var dict = I18N[lang] || I18N.it;
    $$('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key] != null) el.innerHTML = dict[key];
    });
    document.documentElement.lang = lang;
    $$('.lang-toggle button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
    try { localStorage.setItem('uylas_lang', lang); } catch (e) {}
    refreshOpenState(lang);
  }

  /* lingua iniziale: query ?lang= → localStorage → browser → it */
  function initLang() {
    var q = new URLSearchParams(location.search).get('lang');
    var saved; try { saved = localStorage.getItem('uylas_lang'); } catch (e) {}
    var nav = (navigator.language || 'it').slice(0, 2);
    var lang = q || saved || (I18N[nav] ? nav : 'it');
    applyLang(lang);
  }
  $$('.lang-toggle button').forEach(function (b) {
    b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
  });

  /* ───────── Tab del menu ───────── */
  var tabs = $$('.menu-tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { selectTab(tab); });
    tab.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(tab), n = null;
      if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
      if (n) { e.preventDefault(); n.focus(); selectTab(n); }
    });
  });
  function selectTab(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
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

  /* ───────── Stato apertura (12:00–24:00 ogni giorno) ───────── */
  function refreshOpenState(lang) {
    var dict = I18N[lang] || I18N.it;
    var now = new Date();
    var h = now.getHours();
    var open = h >= 12; // aperto 12:00 → mezzanotte
    var badge = $('#openBadge');
    if (badge) {
      var label = badge.querySelector('[data-i18n="con.open"], [data-i18n="con.closed"]');
      badge.classList.toggle('closed', !open);
      if (label) {
        label.textContent = open ? dict['con.open'] : dict['con.closed'];
        label.setAttribute('data-i18n', open ? 'con.open' : 'con.closed');
      }
    }
    // evidenzia il giorno corrente
    var day = now.getDay();
    $$('#hoursTable tr').forEach(function (tr) {
      tr.classList.toggle('today', String(tr.getAttribute('data-day')) === String(day));
    });
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
