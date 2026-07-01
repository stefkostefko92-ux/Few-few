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
      'menu.cat.kebab': '🥙 Kebab & Döner', 'menu.cat.pizza': '🍕 Pizze & Turche', 'menu.cat.combo': '🍟 Menù combo',
      'menu.cat.veg': '🌱 Veg & Falafel', 'menu.cat.extra': '🥤 Extra, Dolci & Bibite',
      'menu.allergen': 'Per allergeni e intolleranze chiedi al personale: un registro scritto degli allergeni è disponibile in negozio. Opzioni vegetariane e halal disponibili.',
      'menu.order': 'Ordina ora →',
      'd.k1': 'Carne di vitello e tacchino, insalata, pomodoro, cipolla e salse.',
      'd.k2': 'Piadina turca yufka arrotolata con doner, verdure fresche e salse.',
      'd.k3': 'La versione XL del nostro panino doner kebab più amato.',
      'd.k4': 'Generosa porzione di carne alla brace con patatine e insalata.',
      'd.k5': 'Carne di vitello e tacchino su riso, con salse di yogurt e piccante.',
      'd.k6': 'Solo carne, in tre formati: piccola, media e grande.',
      'd.k7': 'Polpette di ceci e verdure macinate con spezie, patatine e insalata.',
      'd.p1': 'La nostra firma: pomodoro, mozzarella, carne di doner kebab, insalata, cipolla e salse.',
      'd.p2': 'Pomodoro e mozzarella. Impasto fatto in casa.',
      'd.p3': 'Pomodoro, aglio e origano.',
      'd.p4': 'Pomodoro, mozzarella e salame piccante.',
      'd.p5': 'Pomodoro, mozzarella, prosciutto cotto, olive, capperi, funghi e carciofi.',
      'd.p6': 'Pomodoro e mozzarella di bufala.',
      'd.p7': 'Pomodoro, mozzarella, melanzane, zucchine e peperoni.',
      'd.p8': 'Mozzarella, gorgonzola, taleggio e grana.',
      'd.p9': 'Pomodoro, mozzarella, doner kebab e peperoni.',
      'd.p10': 'Sottile pizza turca con carne macinata speziata.',
      'd.p11': 'Pide turca a barchetta farcita con doner kebab.',
      'd.p12': 'Pomodoro, mozzarella e carne di doner kebab.',
      'd.m1': 'Panino doner kebab + patatine piccole + bibita in lattina 33cl.',
      'd.m2': 'Piadina doner kebab + patatine piccole + bibita in lattina 33cl.',
      'd.m3': 'Pizza margherita + patatine piccole + bibita in lattina 33cl.',
      'd.m4': 'Panino falafel + patatine piccole + bibita in lattina 33cl.',
      'd.m5': 'Panino con cotoletta + patatine piccole + bibita in lattina 33cl.',
      'd.v1': 'Polpette di ceci e verdure macinate, insalata, pomodoro, cipolla e salse.',
      'd.v2': 'Piadina con falafel, verdure fresche, pomodoro, cipolla e salse.',
      'd.v3': 'Pomodoro, mozzarella e verdure grigliate.',
      'd.v4': 'Pomodoro, cetrioli, peperoncino e prezzemolo — çoban salatası.',
      'd.v5': 'Insalata verde, pomodoro, tonno, olive, peperoni e salse.',
      'd.v6': 'Polpetta di ceci e verdure macinate con spezie.',
      'd.e1': 'Croccanti, in tre formati: piccola, media e grande.',
      'd.e2': 'Patate, formaggio e spezie (1 pezzo).',
      'd.e3': 'Pasta sfoglia, pistacchio, burro e sciroppo di zucchero (4 pezzi).',
      'd.e4': 'Pasta grattugiata, pistacchio e sciroppo di zucchero.',
      'd.e5': 'Piadina dolce con Nutella e zucchero a velo.',
      'd.e6': 'Bevanda turca a base di yogurt, fresca e dissetante.',
      'd.e7': 'Pepsi, tè pesca/limone, oran soda, lemon soda e altre.',
      'd.e8': 'Acqua naturale in bottiglia.',
      'why.eyebrow': 'Perché Uylas', 'why.title': 'Buono. Onesto. <span class="accent">Generoso.</span>',
      'why.1.t': 'Cottura alla brace', 'why.1.p': 'Carne marinata e cotta sullo spiedo verticale ogni giorno, per un sapore autentico e succoso.',
      'why.2.t': 'Ingredienti freschi', 'why.2.p': 'Verdure di giornata, pane caldo e impasto pizza fatto in casa. Niente scorciatoie.',
      'why.3.t': 'Veloce, sempre aperto', 'why.3.p': 'Tutti i giorni dalle 12:00 a mezzanotte. Pranzo, cena e dopo-serata.',
      'why.4.t': 'Consegna a domicilio', 'why.4.p': 'A Bareggio e dintorni con Just Eat e Deliveroo, oppure ordina e ritira.',
      'gal.eyebrow': 'Galleria', 'gal.title': 'Direttamente dalla <span class="accent">brace</span>',
      'gal.ph1': 'Spiedo di kebab', 'gal.ph2': 'Pizza al forno', 'gal.ph3': 'Durum farcito',
      'gal.ph4': 'Patatine', 'gal.ph5': 'Falafel', 'gal.ph6': 'Il locale',
      'gal.note': 'Illustrazioni del brand — sostituiscile con le foto reali dei tuoi piatti quando vuoi.',
      'rev.lead': 'Centinaia di recensioni positive da clienti di Bareggio, Cornaredo, Sedriano e Corbetta.',
      'rev.note': 'Testimonianze illustrative. Leggi le recensioni reali sul nostro <a href="https://www.google.com/maps/search/?api=1&amp;query=Uylas+Kebap+Center+Bareggio" target="_blank" rel="noopener">profilo Google</a>.',
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
      'foot.credit': 'Design &amp; sviluppo <a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth</a>',
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
      'why.1.t': 'Flame-grilled', 'why.1.p': 'Meat marinated and cooked on the vertical spit every day for an authentic, juicy flavour.',
      'why.2.t': 'Fresh ingredients', 'why.2.p': 'Daily vegetables, warm bread and homemade pizza dough. No shortcuts.',
      'why.3.t': 'Fast, always open', 'why.3.p': 'Every day from noon to midnight. Lunch, dinner and late night.',
      'why.4.t': 'Home delivery', 'why.4.p': 'Across Bareggio and nearby towns via Just Eat and Deliveroo, or order and collect.',
      'gal.eyebrow': 'Gallery', 'gal.title': 'Straight off the <span class="accent">grill</span>',
      'gal.ph1': 'Kebab spit', 'gal.ph2': 'Oven pizza', 'gal.ph3': 'Filled durum',
      'gal.ph4': 'Fries', 'gal.ph5': 'Falafel', 'gal.ph6': 'The venue',
      'gal.note': 'Brand illustrations — swap them for real photos of your dishes whenever you like.',
      'rev.lead': 'Hundreds of positive reviews from customers in Bareggio, Cornaredo, Sedriano and Corbetta.',
      'rev.note': 'Illustrative testimonials. Read the real reviews on our <a href="https://www.google.com/maps/search/?api=1&amp;query=Uylas+Kebap+Center+Bareggio" target="_blank" rel="noopener">Google profile</a>.',
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
      'foot.credit': 'Design &amp; development <a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth</a>',
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
