#!/usr/bin/env python3
"""Ценоразписът на Carbon Stealth — страници /prezzi/, /en/pricing/, /bg/ceni/ + src/pricing.json.

Пуска се от cs-revolution/:  python3 scripts/generate-pricing.py
После:  python3 scripts/inject-widgets.py  (WA бутон, a11y, SW)  и  npx vite build.

ЕДИНСТВЕНИЯТ източник на числата е портфолиото — portfolio/src/pricing.mjs в монорепото
(клон claude/carbon-stealth-portfolio-tufnlp; проучване docs/PRICING-RESEARCH.md, 2026-09-17).
Числата тук са преписани 1:1 оттам; текстовете са адаптирани за сайта (без „демотата").
Правило на собственика: всяка наша цена е ПОНЕ 15% под пазарната референция.

Същите данни се записват в src/pricing.json, откъдето секцията „Prezzi" на началната
страница ги чете — една таблица, две места, нула разминаване.
"""
import html, json, os

BASE = "https://carbonstealth.eu"
LASTMOD = "2026-09-17"
RESEARCH_DATE = "2026-09-17"
MIN_DISCOUNT = 0.15
VAT_RATE_BG = 20

# ── Числата (от portfolio/src/pricing.mjs) ──────────────────────
TIERS = [
    dict(id="start",     price=790,  market=950,  days=(5, 7),   popular=False),
    dict(id="business",  price=1890, market=2300, days=(10, 15), popular=True),
    dict(id="premium",   price=4290, market=5200, days=(20, 30), popular=False),
    dict(id="ecommerce", price=2190, market=2600, days=(15, 25), popular=False),
]
ADDONS = [
    dict(id="language",    price=350, market=500, kind="once"),
    dict(id="page",        price=120, market=150, kind="once"),
    dict(id="logo",        price=390, market=480, kind="once"),
    dict(id="copy",        price=90,  market=110, kind="once"),
    dict(id="maintenance", price=69,  market=85,  kind="monthly"),
    dict(id="seo",         price=290, market=350, kind="monthly"),
    dict(id="hosting",     price=15,  market=19,  kind="monthly"),
]
MARKET_RANGES = [
    dict(id="landing",   bg=(360, 770),   it=(400, 1500),  eu=(300, 800)),
    dict(id="business",  bg=(770, 2560),  it=(2000, 5000), eu=(2500, 6000)),
    dict(id="corporate", bg=(2050, 7670), it=(3500, 8500), eu=(4500, 15000)),
    dict(id="ecommerce", bg=(1280, 4090), it=(1400, 6500), eu=(2000, 8000)),
    dict(id="maint",     bg=(67, 100),    it=(50, 200),    eu=(50, 200)),
    dict(id="seo",       bg=(150, 500),   it=(400, 3000),  eu=(400, 2000)),
]
SOURCES = [
    ("saitami.bg — Колко струва сайт в България през 2026", "https://saitami.bg/kolko-struva-sait-2026"),
    ("denvelkoff.studio — Цена за изработка на сайт (2026)", "https://denvelkoff.studio/blog/cena-za-izrabotka-na-sait/"),
    ("codingturtles.com — Реални цени (2026)", "https://codingturtles.com/kolko-struva-izrabotka-na-sait"),
    ("tedbg.com — Цени за изработка на онлайн магазин 2026", "https://tedbg.com/ceni-za-izrabotka-na-onlayn-magazin"),
    ("spinfludigital.com — SEO цени и пакети в България (2026)", "https://spinfludigital.com/blog-bg/seo-optimizacia-ceni-bulgaria"),
    ("artworkstudios.it — Quanto costa un sito web nel 2026", "https://www.artworkstudios.it/sito-web/quanto-costa-un-sito-web-nel-2026/"),
    ("lorenzoalbano.it — Prezzi reali 2026", "https://www.lorenzoalbano.it/quanto-costa-sito-web-2026/"),
    ("dueelleweb.it — Costo manutenzione sito web 2026", "https://dueelleweb.it/blog/sito-web/costo-manutenzione-sito-web-annuale-guida-completa-ai-prezzi-2026.html"),
    ("valentinomea.it — Costi SEO 2026", "https://www.valentinomea.it/costi-seo/"),
    ("webars.at — Website costs in Europe 2026", "https://webars.at/en/blog/website-cost-europe"),
    ("sunbytes.io — Website development cost Europe 2026", "https://sunbytes.io/blog/software-development/website-development-cost-europe/"),
]

def discount(item):
    return int((1 - item["price"] / item["market"]) * 100)  # закръглено надолу — не обещаваме повече

for t in TIERS + ADDONS:
    assert t["price"] <= t["market"] * (1 - MIN_DISCOUNT) + 1e-9, f'{t["id"]}: под 15% под пазара'

# ── Текстове ─────────────────────────────────────────────────────
T = {
 "it": dict(
   path="/prezzi/", locale="it_IT", nav_label="PREZZI",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="70" height="30" decoding="async"></a><div><a href="/">HOME</a><a href="/chi-siamo/">CHI SIAMO</a><a href="/servizi/sviluppo-siti-web/">SERVIZI</a><a href="/portfolio/">PORTFOLIO</a><a href="/prezzi/">PREZZI</a><a href="/contatti/">CONTATTI</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Tutti i diritti riservati &middot; <a href="/privacy/">Privacy</a> &middot; <a href="/cookie/">Cookie</a> &middot; <a href="/termini/">Terms</a></p></div>',
   home="/", contact="/contatti/",
   title="Prezzi Siti Web 2026: Landing da 790 €, Sito Aziendale da 1.890 € | Carbon Stealth",
   desc="Prezzi trasparenti, almeno il 15% sotto il mercato: landing page 790 €, sito aziendale 1.890 €, premium 4.290 €, e-commerce 2.190 €. Senza IVA per aziende UE (reverse charge). Preventivo in 24 ore.",
   keywords=["prezzi siti web 2026", "quanto costa un sito web", "prezzo landing page", "prezzo sito aziendale", "prezzo e-commerce", "costo manutenzione sito", "reverse charge IVA", "Carbon Stealth"],
   eyebrow="// PREZZI 2026", h1="Prezzi trasparenti. Almeno il 15% sotto il mercato.",
   lede="Abbiamo esaminato i listini pubblici di agenzie e studi in Bulgaria, Italia e UE per il 2026 e fissato i nostri prezzi più in basso — con perimetro fisso e senza costi nascosti. Tutti i prezzi sono in euro, IVA esclusa.",
   hud="Clienti in Bulgaria: +20% IVA · Aziende UE: reverse charge",
   market_title="Quanto chiede il mercato", market_lede="Fasce medie di agenzia in EUR IVA esclusa, da rassegne prezzi pubbliche 2026 (fonti in fondo).",
   market_cols=dict(item="Servizio", bg="Bulgaria", it="Italia", eu="UE (media)"),
   market_rows=dict(landing="Landing / sito one-page", business="Sito aziendale (5–8 pagine)", corporate="Corporate, multilingua", ecommerce="E-commerce", maint="Manutenzione (al mese)", seo="SEO (al mese)"),
   per_month="/ mese", packages_title="Pacchetti",
   packages_lede="Ogni pacchetto è un prodotto finito: design, sviluppo, base SEO, 12 mesi di hosting in UE, SSL e formazione sull'uso.",
   popular="Il più scelto", market="mercato", saving="in meno", delivery="Consegna", days="giorni lavorativi", choose="Richiedi questo pacchetto",
   tiers=dict(
     start=dict(name="Start", tag="Landing page", desc="Una pagina lunga: tutto ciò che conta in un solo posto.", features=["1 pagina, fino a 8 sezioni", "1 lingua", "Design mobile + desktop", "Modulo contatti sulla tua email", "Base SEO: title, description, Open Graph, JSON-LD", "Profilo Google Business + mappa", "Hosting in UE 12 mesi + SSL", "1 giro di modifiche · 30 giorni di assistenza"]),
     business=dict(name="Business", tag="Sito aziendale", desc="Fino a 8 pagine in due lingue, con blog e SEO completa — il sito che cresce con la tua azienda.", features=["Fino a 8 pagine", "2 lingue (IT + EN o BG) con hreflang", "Design unico sul tuo brand", "Blog / news", "SEO · GEO · AEO completa: sitemap, llms.txt, schema FAQ, dati locali", "Lighthouse 95+ garantito", "Analytics senza cookie (GDPR)", "Hosting in UE 12 mesi + SSL", "2 giri di modifiche · 60 giorni di assistenza"]),
     premium=dict(name="Premium", tag="Tre lingue + pannello admin", desc="Tutto di Business, più tre lingue, un pannello di amministrazione tuo e un modulo prenotazioni o catalogo.", features=["Pagine illimitate nel perimetro", "3 lingue: BG · EN · IT", "Design system proprio + animazioni", "Pannello admin (Next.js + Prisma + PostgreSQL)", "Modulo: prenotazioni, catalogo o richieste", "Automazioni email (conferme, promemoria)", "Aiuto con i testi (copywriting)", "Report mensile su traffico e posizioni", "Assistenza prioritaria per 12 mesi"]),
     ecommerce=dict(name="Shop", tag="E-commerce", desc="Catalogo, carrello, pagamenti con carta/Stripe e fatture pronte per l'IVA UE.", features=["Catalogo con categorie e varianti", "Carrello, ordini, stati", "Pagamento con carta (Stripe) + contrassegno", "Fatture e configurazione IVA/OSS", "Spedizioni: corriere a scelta", "2 lingue", "SEO completa dei prodotti (schema Product)", "Hosting in UE 12 mesi + SSL", "Formazione del team · 60 giorni di assistenza"])),
   addons_title="Extra", addons_lede="Prendi solo ciò che ti serve. Gli extra mensili non hanno vincoli — disdici con un mese di preavviso.",
   addons=dict(language="Lingua aggiuntiva (traduzione + hreflang)", page="Pagina aggiuntiva", logo="Logo e mini brand book", copy="Copywriting per pagina", maintenance="Manutenzione: aggiornamenti, backup, piccole modifiche, monitoraggio", seo="SEO: contenuti, link, audit tecnico, report mensile", hosting="Hosting in UE + SSL + CDN (dopo il primo anno)"),
   once="una tantum", monthly="al mese",
   vat_title="IVA e fatturazione",
   vat=[("Clienti in Bulgaria", "Ai prezzi si aggiunge il 20% di IVA. La fattura è emessa in euro."),
        ("Aziende UE fuori dalla Bulgaria", "Fatturiamo SENZA IVA con il meccanismo dell'inversione contabile (reverse charge) — art. 196 della Direttiva 2006/112/CE (art. 21, c. 2 della legge IVA bulgara). Serve una partita IVA valida (VIES); l'IVA la assolvi tu nel tuo Paese. Non paghi IVA bulgara."),
        ("Aziende fuori dall'UE", "Il luogo della prestazione è fuori dalla Bulgaria — non si applica IVA bulgara.")],
   vat_note="Privati UE fuori dalla Bulgaria: si applica l'IVA secondo le regole B2C. Non è consulenza fiscale — in caso di dubbio verifica con il tuo commercialista.",
   terms_title="Condizioni, in breve",
   terms=["Acconto 40% all'avvio, 60% alla messa online. I servizi mensili si fatturano a inizio mese.", "Il perimetro fisso è descritto nel preventivo; il lavoro extra è a 45 € / ora.", "I tempi decorrono dalla ricezione di testi e foto. Aiutiamo con il copywriting se non li hai.", "Codice, dominio e dati sono tuoi. Nessun vincolo.", "L'hosting dopo il primo anno costa 15 € / mese, oppure lo sposti dove vuoi."],
   faq_title="Domande sui prezzi",
   faq=[("Perché costate meno delle agenzie?", "Niente affitto di uffici, niente venditori o project manager tra te e lo sviluppatore. Lavoriamo con componenti collaudati e test automatici — per questo un sito richiede giorni, non mesi."),
        ("Cosa non è incluso nel prezzo?", "Il dominio (circa 15 € / anno), fotografie professionali e testi se non li fornisci, e la pubblicità a pagamento. Tutto il resto che serve al sito per funzionare è incluso."),
        ("Posso partire con una landing e ampliare dopo?", "Sì. Il pacchetto Start si aggiorna a Business o Premium e quanto pagato viene interamente scalato."),
        ("Quanto ci vuole?", "Landing page — da 5 a 7 giorni lavorativi; sito aziendale — da 10 a 15; premium ed e-commerce — da 3 a 5 settimane. I tempi partono dalla ricezione dei materiali."),
        ("Come si paga e che documenti ricevo?", "Bonifico o carta. Proforma all'avvio, fattura per ogni pagamento — con reverse charge per le aziende UE."),
        ("E per ERP, software su misura e app mobile?", "Non sono pacchetti a listino: ERP da 5.000 €, software su misura da 2.000 €, app mobile da 3.000 €, con preventivo fisso dopo l'analisi dei processi.")],
   sources_title="Fonti del confronto di mercato", sources_lede="Le fasce di mercato provengono da rassegne prezzi pubbliche, verificate il",
   cta_title="Pronto? Preventivo entro 24 ore.", cta_lede="Dicci cosa ti serve: rispondiamo con prezzo fisso e tempi di consegna. Senza impegno.", cta="RICHIEDI UN PREVENTIVO",
   crumb_home="Home"),
 "en": dict(
   path="/en/pricing/", locale="en_US", nav_label="PRICING",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="70" height="30" decoding="async"></a><div><a href="/">HOME</a><a href="/en/about/">ABOUT</a><a href="/en/services/web-development/">SERVICES</a><a href="/en/portfolio/">PORTFOLIO</a><a href="/en/pricing/">PRICING</a><a href="/en/contact/">CONTACT</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>All rights reserved &middot; <a href="/en/privacy/">Privacy</a> &middot; <a href="/en/cookie/">Cookie</a> &middot; <a href="/en/terms/">Terms</a></p></div>',
   home="/en/", contact="/en/contact/",
   title="Website Pricing 2026: Landing Page from €790, Business Website from €1,890 | Carbon Stealth",
   desc="Transparent prices at least 15% below market: landing page €790, business website €1,890, premium €4,290, online shop €2,190. No VAT for EU companies (reverse charge). Quote within 24 hours.",
   keywords=["website pricing 2026", "website design cost", "landing page price", "business website price", "online shop price", "website maintenance cost", "reverse charge VAT", "Carbon Stealth"],
   eyebrow="// PRICING 2026", h1="Transparent prices. At least 15% below market.",
   lede="We reviewed the public price lists of agencies and studios in Bulgaria, Italy and the EU for 2026 and set our prices below them — with a fixed scope and no hidden costs. All prices are in euro, excluding VAT.",
   hud="Clients in Bulgaria: +20% VAT · EU companies: reverse charge",
   market_title="What the market charges", market_lede="Average agency ranges in EUR excl. VAT, from public 2026 price reviews (sources at the bottom).",
   market_cols=dict(item="Service", bg="Bulgaria", it="Italy", eu="EU (average)"),
   market_rows=dict(landing="Landing / one-page site", business="Business website (5–8 pages)", corporate="Corporate, multilingual", ecommerce="Online shop", maint="Maintenance (per month)", seo="SEO (per month)"),
   per_month="/ mo", packages_title="Packages",
   packages_lede="Every package is a finished product: design, development, SEO foundation, 12 months of EU hosting, SSL, and training on how to use it.",
   popular="Most popular", market="market", saving="cheaper", delivery="Delivery", days="working days", choose="Request this package",
   tiers=dict(
     start=dict(name="Start", tag="Landing page", desc="One long page — everything that matters in one place.", features=["1 page, up to 8 sections", "1 language", "Mobile + desktop design", "Contact form to your inbox", "SEO foundation: title, description, Open Graph, JSON-LD", "Google Business profile + map", "EU hosting 12 months + SSL", "1 round of changes · 30 days support"]),
     business=dict(name="Business", tag="Business website", desc="Up to 8 pages in two languages, with a blog and full SEO — the website that grows with your company.", features=["Up to 8 pages", "2 languages (BG + EN or IT) with hreflang", "Unique design in your brand", "Blog / news", "Full SEO · GEO · AEO: sitemap, llms.txt, FAQ schema, local data", "Lighthouse 95+ guaranteed", "Cookie-free analytics (GDPR)", "EU hosting 12 months + SSL", "2 rounds of changes · 60 days support"]),
     premium=dict(name="Premium", tag="Three languages + admin panel", desc="Everything in Business, plus three languages, your own admin panel and a booking or catalogue module.", features=["Unlimited pages within scope", "3 languages: BG · EN · IT", "Custom design system + animations", "Admin panel (Next.js + Prisma + PostgreSQL)", "Module: bookings, catalogue or enquiries", "Email automations (confirmations, reminders)", "Copywriting help", "Monthly traffic and ranking report", "Priority support for 12 months"]),
     ecommerce=dict(name="Shop", tag="Online shop", desc="Catalogue, cart, card/Stripe payments and invoices ready for EU VAT.", features=["Catalogue with categories and variants", "Cart, orders, statuses", "Card payments (Stripe) + cash on delivery", "Invoices and VAT/OSS setup", "Shipping: courier of your choice", "2 languages", "Full product SEO (Product schema)", "EU hosting 12 months + SSL", "Team training · 60 days support"])),
   addons_title="Add-ons", addons_lede="Take only what you need. Monthly add-ons have no lock-in — cancel with one month's notice.",
   addons=dict(language="Additional language (translation + hreflang)", page="Additional page", logo="Logo and mini brand book", copy="Copywriting per page", maintenance="Maintenance: updates, backups, small changes, monitoring", seo="SEO: content, links, technical audit, monthly report", hosting="EU hosting + SSL + CDN (after the first year)"),
   once="one-off", monthly="per month",
   vat_title="VAT and invoicing",
   vat=[("Clients in Bulgaria", "20% VAT is added to the prices. Invoices are issued in euro."),
        ("EU companies outside Bulgaria", "We invoice WITHOUT VAT under the reverse charge mechanism — Article 196 of Council Directive 2006/112/EC (Art. 21(2) of the Bulgarian VAT Act). A valid VAT number (VIES) is required; you self-account for VAT in your own country. You pay no Bulgarian VAT."),
        ("Companies outside the EU", "The place of supply is outside Bulgaria — no Bulgarian VAT is charged.")],
   vat_note="Private individuals in the EU outside Bulgaria: VAT applies under B2C rules. This is not tax advice — when in doubt, check with your accountant.",
   terms_title="Terms, in short",
   terms=["40% deposit at start, 60% at launch. Monthly services are billed at the start of the month.", "The fixed scope is described in the quote; work outside it is €45 / hour.", "The deadline runs from receipt of copy and photos. We help with copywriting if you have none.", "Code, domain and data are yours. No lock-in.", "Hosting after the first year is €15 / month, or move it wherever you like."],
   faq_title="Pricing questions",
   faq=[("Why are you cheaper than agencies?", "No office rent, no salespeople or project managers between you and the developer. We work with proven, ready components and automated testing — that is why a website takes days, not months."),
        ("What is not included in the price?", "The domain (about €15 / year), professional photography and copy if you do not provide them, and paid advertising. Everything else the website needs to work is included."),
        ("Can I start with a landing page and expand later?", "Yes. The Start package upgrades to Business or Premium, and what you paid is fully credited."),
        ("How fast will it be ready?", "Landing page — 5 to 7 working days; business website — 10 to 15; premium and shop — 3 to 5 weeks. The clock starts when we receive your materials."),
        ("How do I pay and what documents do I get?", "Bank transfer or card. Pro-forma at start, an invoice for every payment — with reverse charge for EU companies."),
        ("What about ERP, custom software and mobile apps?", "They are not list packages: ERP from €5,000, custom software from €2,000, mobile apps from €3,000, with a fixed quote after we analyse your processes.")],
   sources_title="Sources of the market comparison", sources_lede="Market ranges come from public price reviews, checked on",
   cta_title="Ready? Quote within 24 hours.", cta_lede="Tell us what you need: we reply with a fixed price and delivery time. No commitment.", cta="REQUEST A QUOTE",
   crumb_home="Home"),
 "bg": dict(
   path="/bg/ceni/", locale="bg_BG", nav_label="ЦЕНИ",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="70" height="30" decoding="async"></a><div><a href="/">ГЛАВНА</a><a href="/bg/za-nas/">ЗА НАС</a><a href="/bg/uslugi/web-razrabotka/">УСЛУГИ</a><a href="/bg/portfolio/">ПОРТФОЛИО</a><a href="/bg/ceni/">ЦЕНИ</a><a href="/bg/kontakti/">КОНТАКТИ</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Всички права запазени &middot; <a href="/bg/privacy/">Privacy</a> &middot; <a href="/bg/cookie/">Cookie</a> &middot; <a href="/bg/usloviya/">Terms</a></p></div>',
   home="/bg/", contact="/bg/kontakti/",
   title="Цени за изработка на сайт 2026: лендинг от 790 €, фирмен сайт от 1 890 € | Carbon Stealth",
   desc="Прозрачни цени, поне 15% под пазарните: лендинг 790 €, фирмен сайт 1 890 €, премиум 4 290 €, онлайн магазин 2 190 €. Без ДДС за фирми от ЕС (reverse charge). Оферта до 24 часа.",
   keywords=["цена за изработка на сайт", "изработка на сайт цени 2026", "лендинг страница цена", "фирмен сайт цена", "онлайн магазин цена", "поддръжка на сайт цена", "обратно начисляване ДДС", "Carbon Stealth"],
   eyebrow="// ЦЕНИ 2026", h1="Прозрачни цени. Поне 15% под пазара.",
   lede="Проучихме публичните ценоразписи на агенции и студиа в България, Италия и ЕС за 2026 г. и сложихме нашите цени под тях — с фиксиран обхват и без скрити разходи. Всички цени са в евро, без ДДС.",
   hud="Клиенти от България: +20% ДДС · Фирми от ЕС: reverse charge",
   market_title="Какво струва на пазара", market_lede="Средни агенцийни диапазони в EUR без ДДС, по публични прегледи за 2026 г. (източниците са най-долу).",
   market_cols=dict(item="Услуга", bg="България", it="Италия", eu="ЕС (средно)"),
   market_rows=dict(landing="Лендинг / сайт-визитка", business="Фирмен сайт (5–8 стр.)", corporate="Корпоративен, многоезичен", ecommerce="Онлайн магазин", maint="Поддръжка (на месец)", seo="SEO (на месец)"),
   per_month="/ мес.", packages_title="Пакети",
   packages_lede="Всеки пакет е завършен продукт: дизайн, разработка, SEO основа, хостинг в ЕС за 12 месеца, SSL, обучение как да го ползвате.",
   popular="Най-избиран", market="пазар", saving="по-евтино", delivery="Срок", days="работни дни", choose="Заяви този пакет",
   tiers=dict(
     start=dict(name="Старт", tag="Лендинг страница", desc="Една дълга страница — всичко важно на едно място.", features=["1 страница, до 8 секции", "1 език", "Мобилен + десктоп дизайн", "Форма за контакт на вашия имейл", "SEO основа: title, description, Open Graph, JSON-LD", "Google Business профил + карта", "Хостинг в ЕС 12 мес. + SSL", "1 кръг корекции · 30 дни поддръжка"]),
     business=dict(name="Бизнес", tag="Фирмен сайт", desc="До 8 страници на два езика, с блог и пълно SEO — сайтът, който расте с фирмата ви.", features=["До 8 страници", "2 езика (BG + EN или IT) с hreflang", "Уникален дизайн по вашия бранд", "Блог / новини", "Пълно SEO · GEO · AEO: sitemap, llms.txt, FAQ схема, локални данни", "Lighthouse 95+ гарантирано", "Аналитика без бисквитки (GDPR)", "Хостинг в ЕС 12 мес. + SSL", "2 кръга корекции · 60 дни поддръжка"]),
     premium=dict(name="Премиум", tag="Три езика + админ панел", desc="Всичко от Бизнес, плюс три езика, собствен админ панел и модул за резервации или каталог.", features=["Неограничен брой страници в обхвата", "3 езика: BG · EN · IT", "Собствена дизайн система + анимации", "Админ панел (Next.js + Prisma + PostgreSQL)", "Модул: резервации, каталог или запитвания", "Имейл автоматизации (потвърждения, напомняния)", "Помощ с текстовете (копирайтинг)", "Месечен отчет за трафика и позициите", "Приоритетна поддръжка 12 месеца"]),
     ecommerce=dict(name="Магазин", tag="Онлайн магазин", desc="Каталог, количка, карта/Stripe плащания и фактури, готови за ДДС в ЕС.", features=["Каталог с категории и варианти", "Количка, поръчки, статуси", "Плащане с карта (Stripe) + наложен платеж", "Фактури и ДДС/OSS настройка", "Доставка: Еконт / Speedy / куриер по избор", "2 езика", "Пълно SEO за продукти (Product схема)", "Хостинг в ЕС 12 мес. + SSL", "Обучение на екипа · 60 дни поддръжка"])),
   addons_title="Добавки", addons_lede="Взимате само това, което ви трябва. Месечните добавки са без обвързване — спирате с едномесечно предизвестие.",
   addons=dict(language="Допълнителен език (превод + hreflang)", page="Допълнителна страница", logo="Лого и мини бранд книга", copy="Копирайтинг на страница", maintenance="Поддръжка: ъпдейти, бекъпи, дребни промени, мониторинг", seo="SEO: съдържание, линкове, технически одит, месечен отчет", hosting="Хостинг в ЕС + SSL + CDN (след първата година)"),
   once="еднократно", monthly="на месец",
   vat_title="ДДС и фактуриране",
   vat=[("Клиенти от България", "Към цените се начислява 20% ДДС. Фактура се издава в евро."),
        ("Фирми от ЕС извън България", "Фактурираме БЕЗ ДДС по механизма на обратно начисляване (reverse charge) — чл. 21, ал. 2 ЗДДС и чл. 196 от Директива 2006/112/ЕО. Нужен е валиден ДДС номер (VIES); ДДС се самоначислява от вас в своята държава. Не плащате български ДДС."),
        ("Фирми извън ЕС", "Мястото на изпълнение е извън България — не се начислява български ДДС.")],
   vat_note="Частни лица от ЕС извън България: начислява се ДДС по правилата за B2C. Не е данъчен съвет — при съмнение сверете със счетоводителя си.",
   terms_title="Условия, накратко",
   terms=["Аванс 40% при старт, 60% при пускане. За месечни услуги — в началото на месеца.", "Фиксираният обхват е описан в офертата; извън него работим по 45 € / час.", "Срокът тече от получаването на текстове и снимки. Помагаме с копирайтинг, ако нямате.", "Кодът, домейнът и данните са ваши. Няма заключване към нас.", "Хостингът след първата година е 15 € / мес. или го местите където поискате."],
   faq_title="Въпроси за цените",
   faq=[("Защо сте по-евтини от агенциите?", "Нямаме офис наем, продавачи и проектни мениджъри между вас и разработчика. Работим с готови, доказани компоненти и автоматизирано тестване — затова правим сайт за дни, а не за месеци."),
        ("Какво не е включено в цената?", "Домейнът (около 15 € / год.), професионална фотография и текстове, ако не ги предоставите, и платена реклама. Всичко останало, което е нужно сайтът да работи, е вътре."),
        ("Мога ли да започна с лендинг и после да разширя?", "Да. Пакетът Старт се надгражда към Бизнес или Премиум, като платеното се приспада изцяло."),
        ("Колко бързо ще е готово?", "Лендинг — 5 до 7 работни дни; фирмен сайт — 10 до 15; премиум и магазин — 3 до 5 седмици. Срокът тече от получаването на материалите."),
        ("Как се плаща и какви документи получавам?", "Банков превод или карта. Проформа при старт, фактура при всяко плащане — с обратно начисляване за фирми от ЕС."),
        ("А за ERP, софтуер по поръчка и мобилни приложения?", "Те не са пакети от ценоразписа: ERP от 5 000 €, софтуер по поръчка от 2 000 €, мобилно приложение от 3 000 €, с фиксирана оферта след анализ на процесите.")],
   sources_title="Източници на пазарното сравнение", sources_lede="Пазарните диапазони са от публични ценови прегледи, проверени на",
   cta_title="Готови ли сте? Оферта до 24 часа.", cta_lede="Кажете ни какво ви трябва: отговаряме с фиксирана цена и срок. Без ангажимент.", cta="ЗАЯВИ ОФЕРТА",
   crumb_home="Начало"),
}

# ── Форматиране на числа по език ─────────────────────────────────
SEP = dict(it=".", en=",", bg=" ")
def fmt(n, lang):
    s = f"{int(round(n)):,}"
    return s.replace(",", SEP[lang])
def money(n, lang):
    return f"{fmt(n, lang)} €"

STYLE = "*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#ccc;font-family:'Space Mono',monospace;font-size:13px;line-height:2;padding:0}a{color:#00e5ff;text-decoration:none}.w{max-width:1100px;margin:0 auto;padding:40px 20px}h1{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2.5rem;color:#f5f5f0;margin-bottom:16px;letter-spacing:-.03em;line-height:1.1;max-width:900px}h2{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.2rem;color:#00e5ff;margin:48px 0 12px;text-transform:uppercase;letter-spacing:.05em}h3{color:#f5f5f0;font-size:1rem;margin:20px 0 8px}p,li{margin-bottom:10px;line-height:1.9}ul{padding-left:20px}.nav{position:fixed;top:0;width:100%;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,229,255,.22);box-shadow:0 1px 18px rgba(0,229,255,.1);padding:12px 20px;z-index:1000;display:flex;justify-content:space-between;align-items:center}.nav a{color:#ccc;font-size:10px;letter-spacing:.2em;margin:0 10px}.nav img{height:30px;filter:drop-shadow(0 0 6px rgba(0,229,255,.28))}.nav div{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px 0}@media(max-width:600px){.nav a{margin:0 6px;font-size:9px}}.hero-s{padding:120px 20px 60px;border-bottom:1px solid rgba(0,229,255,.1)}.tag{font-size:9px;color:#00e5ff;letter-spacing:.4em;margin-bottom:12px}.lede{max-width:820px;color:#bbb}.hud{font-size:10px;letter-spacing:.15em;color:#00e5ff;margin-top:12px}.cta{display:inline-block;padding:14px 32px;border:1px solid #00e5ff;color:#00e5ff;font-size:11px;letter-spacing:.25em;margin-top:24px;background:rgba(0,229,255,.05);box-shadow:0 0 22px rgba(0,229,255,.22)}.ft{border-top:1px solid rgba(245,245,240,.06);padding:30px 20px;text-align:center;font-size:9px;color:#8a949b;margin-top:60px}.ft a{text-decoration:underline}.faq-item{border-bottom:1px solid rgba(245,245,240,.06);padding:16px 0}.faq-q{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1rem;color:#f5f5f0;margin-bottom:6px}.faq-a{font-size:12px;color:#ccc}.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin:24px 0}.tier{border:1px solid rgba(0,229,255,.18);padding:22px;position:relative;background:rgba(0,229,255,.02);display:flex;flex-direction:column}.tier.pop{border-color:rgba(0,229,255,.6);box-shadow:0 0 28px rgba(0,229,255,.12)}.pop-badge{position:absolute;top:-10px;left:18px;background:#00e5ff;color:#000;font-size:9px;letter-spacing:.2em;padding:3px 10px;font-weight:700}.tier-tag{font-size:9px;letter-spacing:.3em;color:#00e5ff;margin-bottom:6px;text-transform:uppercase}.tier h3{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:1.5rem;color:#f5f5f0;margin:0 0 8px;letter-spacing:-.02em}.tier-desc{font-size:11px;color:#999;line-height:1.7;min-height:3.4em}.tier-price{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2.1rem;color:#f5f5f0;margin:14px 0 2px;line-height:1;letter-spacing:-.03em}.tier-market{display:block;font-size:10px;color:#999;margin-bottom:14px;line-height:1.6}.tier-market s{color:#8a949b}.tier-market b{color:#00e5ff}.tier ul{list-style:none;padding:0;margin:0 0 14px;flex:1}.tier li{font-size:11px;padding-left:16px;position:relative;margin-bottom:6px;line-height:1.6}.tier li::before{content:'\\2713';position:absolute;left:0;color:#00e5ff}.tier-delivery{font-size:10px;color:#999;margin-bottom:6px}.tier .cta{margin-top:10px;text-align:center}.addons{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;margin:20px 0}.addon{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid rgba(245,245,240,.08);padding:12px 14px;font-size:11px;line-height:1.6}.addon-price{white-space:nowrap;text-align:right}.addon strong{color:#f5f5f0;font-size:13px}.addon small{color:#999;font-size:9px;display:block}.addon em{color:#00e5ff;font-style:normal;font-size:9px}.table-wrap{overflow-x:auto}.table{width:100%;border-collapse:collapse;font-size:11px;margin:16px 0;min-width:560px}.table th,.table td{border:1px solid rgba(245,245,240,.08);padding:8px 10px;text-align:left;line-height:1.6}.table th{color:#00e5ff;font-weight:400;letter-spacing:.1em}.vat{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:16px 0}.vat article{border:1px solid rgba(0,229,255,.15);padding:16px}.vat h3{margin:0 0 6px}.vat p{font-size:11px;color:#bbb;margin:0;line-height:1.7}.tiny{font-size:10px;color:#888;line-height:1.7}.sources{font-size:10px;color:#888;padding-left:18px}.sources a{color:#8ab}.terms{list-style:none;padding:0}.terms li{padding-left:16px;position:relative;font-size:12px}.terms li::before{content:'\\2713';position:absolute;left:0;color:#00e5ff}.cta-box{border:1px solid rgba(0,229,255,.25);padding:32px;margin-top:48px;text-align:center;box-shadow:0 0 40px rgba(0,229,255,.08)}.cta-box h2{margin-top:0}"

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">')

def esc(s):
    return html.escape(s, quote=True)

def alternates():
    out = "".join(f'<link rel="alternate" hreflang="{l}" href="{BASE}{T[l]["path"]}"/>' for l in ("it", "en", "bg"))
    return out + f'<link rel="alternate" hreflang="x-default" href="{BASE}{T["it"]["path"]}"/>'

def jsonld(lang, canon):
    p = T[lang]
    graph = [
        {"@type": "WebPage", "@id": canon + "#page", "url": canon, "name": p["h1"], "description": p["desc"], "inLanguage": lang,
         "isPartOf": {"@id": f"{BASE}/#website"}, "publisher": {"@id": f"{BASE}/#organization"}, "dateModified": LASTMOD},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": p["crumb_home"], "item": BASE + p["home"]},
            {"@type": "ListItem", "position": 2, "name": p["packages_title"], "item": canon}]},
    ]
    for t in TIERS:
        x = p["tiers"][t["id"]]
        graph.append({"@type": "Product", "name": f'{x["name"]} — {x["tag"]}', "description": x["desc"],
                      "brand": {"@type": "Brand", "name": "Carbon Stealth"},
                      "offers": {"@type": "Offer", "price": t["price"], "priceCurrency": "EUR", "url": f'{canon}#{t["id"]}',
                                 "availability": "https://schema.org/InStock", "priceValidUntil": "2026-12-31",
                                 "seller": {"@id": f"{BASE}/#organization"}}})
    graph.append({"@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faq"]]})
    return '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":")) + "</script>"

def head(lang, canon):
    p = T[lang]
    og = f"{BASE}/og-image.png"
    return f"""<!DOCTYPE html><html lang="{lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(p["title"])}</title>
<meta name="description" content="{esc(p["desc"])}">
<meta name="keywords" content="{esc(", ".join(p["keywords"]))}">
<link rel="canonical" href="{canon}">
{alternates()}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Carbon Stealth VCC">
<meta property="og:title" content="{esc(p["title"])}">
<meta property="og:description" content="{esc(p["desc"])}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="{p["locale"]}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(p["title"])}">
<meta name="twitter:description" content="{esc(p["desc"])}">
<meta name="twitter:image" content="{og}">
<meta name="geo.region" content="BG-KY">
<meta name="geo.placename" content="Bobov Dol">
<meta name="theme-color" content="#00e5ff">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
{FONTS}<style>{STYLE}</style>
{jsonld(lang, canon)}
</head><body>"""

def render(lang):
    p = T[lang]
    canon = BASE + p["path"]
    rng = lambda r, sfx="": f"{fmt(r[0], lang)} – {fmt(r[1], lang)} €{sfx}"
    monthly_rows = {"maint", "seo"}
    market = "".join(
        f'<tr><th scope="row">{esc(p["market_rows"][r["id"]])}</th>'
        + "".join(f'<td>{rng(r[c], " " + p["per_month"] if r["id"] in monthly_rows else "")}</td>' for c in ("bg", "it", "eu"))
        + "</tr>" for r in MARKET_RANGES)
    tiers = ""
    for t in TIERS:
        x = p["tiers"][t["id"]]
        tiers += (f'<article class="tier{" pop" if t["popular"] else ""}" id="{t["id"]}">'
                  + (f'<span class="pop-badge">{esc(p["popular"])}</span>' if t["popular"] else "")
                  + f'<p class="tier-tag">{esc(x["tag"])}</p><h3>{esc(x["name"])}</h3><p class="tier-desc">{esc(x["desc"])}</p>'
                  + f'<p class="tier-price">{money(t["price"], lang)}</p>'
                  + f'<span class="tier-market"><s>{money(t["market"], lang)}</s> {esc(p["market"])} · <b>−{discount(t)}% {esc(p["saving"])}</b></span>'
                  + "<ul>" + "".join(f"<li>{esc(f)}</li>" for f in x["features"]) + "</ul>"
                  + f'<p class="tier-delivery">{esc(p["delivery"])}: {t["days"][0]}–{t["days"][1]} {esc(p["days"])}</p>'
                  + f'<a class="cta" href="{p["contact"]}">{esc(p["choose"])} &rarr;</a></article>')
    addons = "".join(
        f'<div class="addon"><span>{esc(p["addons"][a["id"]])}</span><span class="addon-price"><strong>{money(a["price"], lang)}</strong>'
        f'<small>{esc(p["monthly"] if a["kind"] == "monthly" else p["once"])} · <em>−{discount(a)}%</em></small></span></div>' for a in ADDONS)
    vat = "".join(f"<article><h3>{esc(t)}</h3><p>{esc(d)}</p></article>" for t, d in p["vat"])
    terms = "".join(f"<li>{esc(t)}</li>" for t in p["terms"])
    faq = "".join(f'<div class="faq-item"><div class="faq-q">{esc(q)}</div><div class="faq-a">{esc(a)}</div></div>' for q, a in p["faq"])
    sources = "".join(f'<li><a href="{u}" target="_blank" rel="noopener nofollow">{esc(n)}</a></li>' for n, u in SOURCES)
    return (head(lang, canon) + p["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">{esc(p["eyebrow"])}</div><h1>{esc(p["h1"])}</h1><p class="lede">{esc(p["lede"])}</p><p class="hud">{esc(p["hud"])}</p></div></div>'
        + '<div class="w">'
        + f'<h2 id="packages">{esc(p["packages_title"])}</h2><p class="lede">{esc(p["packages_lede"])}</p><div class="tiers">{tiers}</div>'
        + f'<h2 id="addons">{esc(p["addons_title"])}</h2><p class="lede">{esc(p["addons_lede"])}</p><div class="addons">{addons}</div>'
        + f'<h2 id="market">{esc(p["market_title"])}</h2><p class="lede">{esc(p["market_lede"])}</p><div class="table-wrap"><table class="table"><thead><tr><th>{esc(p["market_cols"]["item"])}</th><th>{esc(p["market_cols"]["bg"])}</th><th>{esc(p["market_cols"]["it"])}</th><th>{esc(p["market_cols"]["eu"])}</th></tr></thead><tbody>{market}</tbody></table></div>'
        + f'<h2 id="vat">{esc(p["vat_title"])}</h2><div class="vat">{vat}</div><p class="tiny">{esc(p["vat_note"])}</p>'
        + f'<h2 id="terms">{esc(p["terms_title"])}</h2><ul class="terms">{terms}</ul>'
        + f'<h2 id="faq">{esc(p["faq_title"])}</h2>{faq}'
        + f'<h2 id="sources">{esc(p["sources_title"])}</h2><p class="tiny">{esc(p["sources_lede"])} {RESEARCH_DATE}.</p><ol class="sources">{sources}</ol>'
        + f'<div class="cta-box"><h2>{esc(p["cta_title"])}</h2><p class="lede" style="margin:0 auto">{esc(p["cta_lede"])}</p><a class="cta" href="{p["contact"]}">{esc(p["cta"])} &rarr;</a></div>'
        + "</div>" + p["ft"] + "</body></html>\n")

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def update_sitemap():
    """Добавя трите URL-а в sitemap-pages.xml (или обновява lastmod). Идемпотентно."""
    import re
    sm = "public/sitemap-pages.xml"
    s = open(sm, encoding="utf-8").read()
    for lang in ("it", "en", "bg"):
        loc = BASE + T[lang]["path"]
        entry = f'<url><loc>{loc}</loc><lastmod>{LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.9</priority></url>'
        if f"<loc>{loc}</loc>" in s:
            s = re.sub(r'<url><loc>' + re.escape(loc) + r'</loc><lastmod>[0-9-]+</lastmod>', f'<url><loc>{loc}</loc><lastmod>{LASTMOD}</lastmod>', s)
        else:
            s = s.replace("</urlset>", entry + "\n</urlset>")
    open(sm, "w", encoding="utf-8").write(s)

def write_json():
    """Същите данни за секцията „Prezzi" на началната страница (src/App.jsx)."""
    data = dict(
        researchDate=RESEARCH_DATE, minDiscount=MIN_DISCOUNT, vatRateBg=VAT_RATE_BG,
        tiers=[dict(id=t["id"], price=t["price"], market=t["market"], days=list(t["days"]), popular=t["popular"], discount=discount(t),
                    name={l: T[l]["tiers"][t["id"]]["name"] for l in T}, tag={l: T[l]["tiers"][t["id"]]["tag"] for l in T},
                    desc={l: T[l]["tiers"][t["id"]]["desc"] for l in T}, features={l: T[l]["tiers"][t["id"]]["features"] for l in T}) for t in TIERS],
        addons=[dict(id=a["id"], price=a["price"], market=a["market"], kind=a["kind"], discount=discount(a),
                     name={l: T[l]["addons"][a["id"]] for l in T}) for a in ADDONS],
        ui={l: dict(path=T[l]["path"], eyebrow=T[l]["eyebrow"], h1=T[l]["h1"], lede=T[l]["packages_lede"], hud=T[l]["hud"], popular=T[l]["popular"],
                    market=T[l]["market"], saving=T[l]["saving"], delivery=T[l]["delivery"], days=T[l]["days"], choose=T[l]["choose"],
                    addonsTitle=T[l]["addons_title"], once=T[l]["once"], monthly=T[l]["monthly"], vatNote=T[l]["hud"], navLabel=T[l]["nav_label"]) for l in T},
    )
    write("src/pricing.json", json.dumps(data, ensure_ascii=False, indent=1) + "\n")

def main():
    for lang in ("it", "en", "bg"):
        write(os.path.join("public", T[lang]["path"].strip("/"), "index.html"), render(lang))
    update_sitemap()
    write_json()
    print("ценови страници: 3 · sitemap-pages.xml · src/pricing.json")

if __name__ == "__main__":
    main()
