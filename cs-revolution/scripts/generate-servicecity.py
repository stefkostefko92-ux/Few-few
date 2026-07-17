#!/usr/bin/env python3
"""Generate trilingual SERVICE x CITY local-landing pages (it/en/bg) + 3 hubs + sitemap.

Commercial local intent (e-commerce / ERP x city) beyond the existing "Siti Web {city}"
geo pages. Every (service x city x language) page carries genuinely UNIQUE native prose
tied to the city's real economic character and the specific service — no find-replace
doorway templating.

Usage: python3 scripts/generate-servicecity.py   (run from repo root; writes into public/)

Outputs:
  IT public/servizi-locali/            + /<slug>/index.html   /servizi-locali/<slug>/
  EN public/en/local-services/         + /<slug>/index.html   /en/local-services/<slug>/
  BG public/bg/uslugi-lokalni/         + /<slug>/index.html   /bg/uslugi-lokalni/<slug>/
  public/sitemap-servicecity.xml       (its OWN file; 3 hubs + 48 pages = 51 urls)
Slug = "<service>-<city>"  e.g. ecommerce-milano, erp-roma.
"""
import os, html, json

BASE = "https://carbonstealth.eu"
LASTMOD = "2026-07-17"

# ── Cities (8) ───────────────────────────────────────────────────
CITIES = [
    dict(slug="milano",  country="IT", region="IT-MI", name=dict(it="Milano",  en="Milan",   bg="Милано")),
    dict(slug="roma",    country="IT", region="IT-RM", name=dict(it="Roma",    en="Rome",    bg="Рим")),
    dict(slug="torino",  country="IT", region="IT-TO", name=dict(it="Torino",  en="Turin",   bg="Торино")),
    dict(slug="firenze", country="IT", region="IT-FI", name=dict(it="Firenze", en="Florence",bg="Флоренция")),
    dict(slug="napoli",  country="IT", region="IT-NA", name=dict(it="Napoli",  en="Naples",  bg="Неапол")),
    dict(slug="bologna", country="IT", region="IT-BO", name=dict(it="Bologna", en="Bologna", bg="Болоня")),
    dict(slug="sofia",   country="BG", region="BG-22", name=dict(it="Sofia",   en="Sofia",   bg="София")),
    dict(slug="plovdiv", country="BG", region="BG-16", name=dict(it="Plovdiv", en="Plovdiv", bg="Пловдив")),
]

# ── Services (2) ─────────────────────────────────────────────────
SERVICES = {
    "ecommerce": dict(
        price=dict(it="€1.200", en="€1,200", bg="€1200"),
        svc_link=dict(it="/servizi/ecommerce/", en="/en/services/ecommerce/", bg="/bg/uslugi/ecommerce/"),
        offer="1200",
        disp=dict(it="E-commerce", en="E-commerce", bg="Онлайн Магазини"),
        title=dict(
            it="E-commerce a {name} — Sviluppo Negozi Online | Carbon Stealth",
            en="E-commerce Development in {name} | Carbon Stealth",
            bg="Онлайн Магазин в {name} — Разработка на E-commerce | Carbon Stealth"),
        h1=dict(it="E-commerce a {name}", en="E-commerce Development in {name}", bg="Онлайн Магазин в {name}"),
        svc_type="E-commerce development, online store, payments and shipping integration",
        desc=dict(
            it="Sviluppo e-commerce e negozi online per aziende di {name}. Da €1.200, spedizioni e pagamenti integrati, preventivo gratuito in 24 ore.",
            en="E-commerce and online store development for {name} businesses. From €1,200, integrated payments and shipping, free quote in 24 hours.",
            bg="Разработка на онлайн магазини за фирми в {name}. От €1200, интегрирани плащания и доставки, безплатна оферта до 24 часа."),
        h2_why=dict(
            it="E-commerce su misura per le aziende di {name}",
            en="Tailored e-commerce for {name} businesses",
            bg="Онлайн магазин по поръчка за бизнеса в {name}"),
        h2_how=dict(
            it="Come costruiamo il tuo negozio online",
            en="How we build your online store",
            bg="Как изграждаме вашия онлайн магазин"),
        features=dict(
            it=["Checkout ottimizzato e pagamenti Stripe, PayPal e carte", "Catalogo, varianti e gestione stock in tempo reale", "SEO tecnico e Google Shopping inclusi", "Pannello di controllo semplice, con formazione inclusa"],
            en=["Optimized checkout with Stripe, PayPal and card payments", "Catalog, variants and real-time stock management", "Technical SEO and Google Shopping included", "Simple admin panel with training included"],
            bg=["Оптимизиран checkout със Stripe, PayPal и карти", "Каталог, варианти и управление на наличности в реално време", "Техническо SEO и Google Shopping включени", "Лесен административен панел с включено обучение"]),
        process=dict(
            it=["Analisi del catalogo, del target e dei mercati di destinazione, con preventivo gratuito entro 24 ore.", "Design del negozio e prototipo del percorso d'acquisto, approvato prima di scrivere codice.", "Sviluppo, integrazione di pagamenti, spedizioni e gestionale, con test su ordini reali.", "Lancio, formazione, SEO e Google Shopping, più 3 mesi di supporto gratuito."],
            en=["Analysis of catalog, audience and target markets, with a free quote within 24 hours.", "Store design and a checkout-journey prototype, approved before any code is written.", "Development plus payment, shipping and back-office integration, tested on real orders.", "Launch, training, SEO and Google Shopping, plus 3 months of free support."],
            bg=["Анализ на каталога, аудиторията и целевите пазари, с безплатна оферта до 24 часа.", "Дизайн на магазина и прототип на пътя за покупка, одобрен преди да напишем код.", "Разработка с интеграция на плащания, доставки и система, тествана с реални поръчки.", "Пускане, обучение, SEO и Google Shopping, плюс 3 месеца безплатна поддръжка."]),
        cost_faq=dict(
            it=("Quanto costa un e-commerce a {name}?", "Un negozio online professionale parte da €1.200 e cresce in base a catalogo, integrazioni e lingue. Preventivo dettagliato e gratuito entro 24 ore."),
            en=("How much does an e-commerce site cost in {name}?", "A professional online store starts at €1,200 and scales with catalog, integrations and languages. Detailed free quote within 24 hours."),
            bg=("Колко струва онлайн магазин в {name}?", "Професионален онлайн магазин започва от €1200 и расте според каталога, интеграциите и езиците. Подробна безплатна оферта до 24 часа.")),
    ),
    "erp": dict(
        price=dict(it="€5.000", en="€5,000", bg="€5000"),
        svc_link=dict(it="/servizi/erp/", en="/en/services/erp/", bg="/bg/uslugi/erp/"),
        offer="5000",
        disp=dict(it="Software ERP", en="ERP Systems", bg="ERP Системи"),
        title=dict(
            it="Software ERP a {name} — Gestionale su Misura | Carbon Stealth",
            en="ERP Development in {name} | Carbon Stealth",
            bg="ERP Софтуер в {name} — Система по Поръчка | Carbon Stealth"),
        h1=dict(it="Software ERP a {name}", en="ERP Systems in {name}", bg="ERP Софтуер в {name}"),
        svc_type="ERP and custom management software, warehouse, production, invoicing",
        desc=dict(
            it="Software ERP e gestionali su misura per aziende di {name}. Da €5.000, moduli magazzino, produzione e fatturazione. Preventivo gratuito.",
            en="Custom ERP and management software for {name} businesses. From €5,000, warehouse, production and invoicing modules. Free quote.",
            bg="ERP и управленски софтуер по поръчка за фирми в {name}. От €5000, модули за склад, производство и фактуриране. Безплатна оферта."),
        h2_why=dict(
            it="ERP su misura per le aziende di {name}",
            en="Tailored ERP for {name} businesses",
            bg="ERP по поръчка за бизнеса в {name}"),
        h2_how=dict(
            it="Come implementiamo il tuo gestionale",
            en="How we implement your system",
            bg="Как внедряваме вашата система"),
        features=dict(
            it=["Moduli su misura: vendite, magazzino, acquisti, produzione", "Dashboard e reportistica in tempo reale", "Permessi per ruolo e più utenti", "Integrazione con e-commerce, contabilità e fatturazione"],
            en=["Tailored modules: sales, inventory, purchasing, production", "Real-time dashboards and reporting", "Role-based permissions and multiple users", "Integration with e-commerce, accounting and invoicing"],
            bg=["Модули по поръчка: продажби, склад, доставки, производство", "Табла и отчети в реално време", "Права по роля и много потребители", "Интеграция с онлайн магазин, счетоводство и фактуриране"]),
        process=dict(
            it=["Analisi dei processi aziendali e mappatura dei flussi, con preventivo dettagliato.", "Progettazione dei moduli e prototipo delle schermate chiave, approvato insieme a voi.", "Sviluppo su misura, migrazione dei dati e integrazione con contabilità ed e-commerce.", "Formazione del personale, go-live assistito e supporto continuo dopo il lancio."],
            en=["Analysis of business processes and workflow mapping, with a detailed quote.", "Module design and a prototype of the key screens, approved together with you.", "Custom development, data migration and integration with accounting and e-commerce.", "Staff training, assisted go-live and ongoing support after launch."],
            bg=["Анализ на бизнес процесите и картографиране на потоците, с подробна оферта.", "Проектиране на модулите и прототип на ключовите екрани, одобрен заедно с вас.", "Разработка по поръчка, миграция на данни и интеграция със счетоводство и онлайн магазин.", "Обучение на персонала, асистиран старт и постоянна поддръжка след пускането."]),
        cost_faq=dict(
            it=("Quanto costa un ERP a {name}?", "Un sistema ERP su misura parte da €5.000 e cresce con moduli e integrazioni. Analizziamo i vostri processi e forniamo un preventivo dettagliato in pochi giorni."),
            en=("How much does an ERP cost in {name}?", "A custom ERP starts at €5,000 and grows with modules and integrations. We analyze your processes and provide a detailed quote within days."),
            bg=("Колко струва ERP в {name}?", "ERP по поръчка започва от €5000 и расте с модули и интеграции. Анализираме процесите ви и даваме подробна оферта в рамките на дни.")),
    ),
}

# ── Per-language chrome ──────────────────────────────────────────
L = {
    "it": dict(
        prefix="", hub_path="/servizi-locali/", og="og-image.png", locale="it_IT",
        nav=[("/", "HOME"), ("/chi-siamo/", "CHI SIAMO"), ("/servizi/sviluppo-siti-web/", "SERVIZI"), ("/portfolio/", "PORTFOLIO"), ("/contatti/", "CONTATTI")],
        home="/", contact="/contatti/",
        tag="// LOCALE — {NAME}", cta="RICHIEDI PREVENTIVO GRATUITO",
        hub_name="Servizi Locali",
        h2_features="Cosa è incluso", h2_process="Il nostro processo", h2_faq="Domande frequenti",
        price_line="Prezzi trasparenti: {disp} da {price}, senza costi nascosti.",
        cross='Approfondisci il nostro <a href="{svc}">servizio dedicato</a>, scopri tutti i servizi per la tua città su <a href="{geo}">Siti Web {name}</a> o torna al <a href="{hub}">catalogo Servizi Locali</a>.',
        ft_links=[("/privacy/", "Privacy"), ("/cookie/", "Cookie"), ("/termini/", "Termini")],
        hub_title="Servizi Locali — E-commerce ed ERP per Città | Carbon Stealth",
        hub_desc="Sviluppo e-commerce e software ERP su misura per le principali città d'Italia e Bulgaria: Milano, Roma, Torino, Firenze, Napoli, Bologna, Sofia, Plovdiv.",
        hub_h1="Servizi Locali",
        hub_intro="Servizi digitali specializzati per città: negozi e-commerce e sistemi ERP su misura per le aziende delle principali città italiane e bulgare. Scegli il servizio e la tua città.",
        card_cta="Scopri di più →",
    ),
    "en": dict(
        prefix="/en", hub_path="/en/local-services/", og="og-image-en.png", locale="en_US",
        nav=[("/en/", "HOME"), ("/en/about/", "ABOUT"), ("/en/services/web-development/", "SERVICES"), ("/en/portfolio/", "PORTFOLIO"), ("/en/contact/", "CONTACT")],
        home="/en/", contact="/en/contact/",
        tag="// LOCAL — {NAME}", cta="REQUEST A FREE QUOTE",
        hub_name="Local Services",
        h2_features="What's included", h2_process="Our process", h2_faq="Frequently asked questions",
        price_line="Transparent pricing: {disp} from {price}, with no hidden costs.",
        cross='Explore our <a href="{svc}">dedicated service</a>, see every service for your city on <a href="{geo}">Web Development {name}</a>, or return to the <a href="{hub}">Local Services</a> catalog.',
        ft_links=[("/en/privacy/", "Privacy"), ("/en/cookie/", "Cookie"), ("/en/terms/", "Terms")],
        hub_title="Local Services — E-commerce and ERP by City | Carbon Stealth",
        hub_desc="Custom e-commerce and ERP software development for major cities in Italy and Bulgaria: Milan, Rome, Turin, Florence, Naples, Bologna, Sofia, Plovdiv.",
        hub_h1="Local Services",
        hub_intro="City-specialized digital services: bespoke e-commerce stores and ERP systems for businesses in the leading cities of Italy and Bulgaria. Pick the service and your city.",
        card_cta="Learn more →",
    ),
    "bg": dict(
        prefix="/bg", hub_path="/bg/uslugi-lokalni/", og="og-image-bg.png", locale="bg_BG",
        nav=[("/bg/", "ГЛАВНА"), ("/bg/za-nas/", "ЗА НАС"), ("/bg/uslugi/web-razrabotka/", "УСЛУГИ"), ("/bg/portfolio/", "ПОРТФОЛИО"), ("/bg/kontakti/", "КОНТАКТИ")],
        home="/bg/", contact="/bg/kontakti/",
        tag="// ЛОКАЛНО — {NAME}", cta="ЗАЯВИ БЕЗПЛАТНА ОФЕРТА",
        hub_name="Локални Услуги",
        h2_features="Какво е включено", h2_process="Нашият процес", h2_faq="Често задавани въпроси",
        price_line="Прозрачни цени: {disp} от {price}, без скрити такси.",
        cross='Разгледайте нашата <a href="{svc}">специализирана услуга</a>, вижте всички услуги за вашия град на <a href="{geo}">Изработка на Сайт {name}</a> или се върнете към каталога <a href="{hub}">Локални Услуги</a>.',
        ft_links=[("/bg/privacy/", "Поверителност"), ("/bg/cookie/", "Бисквитки"), ("/bg/usloviya/", "Условия")],
        hub_title="Локални Услуги — E-commerce и ERP по Градове | Carbon Stealth",
        hub_desc="Разработка на онлайн магазини и ERP софтуер по поръчка за големите градове в Италия и България: Милано, Рим, Торино, Флоренция, Неапол, Болоня, София, Пловдив.",
        hub_h1="Локални Услуги",
        hub_intro="Дигитални услуги, специализирани по градове: онлайн магазини и ERP системи по поръчка за бизнеса в водещите градове на Италия и България. Изберете услугата и вашия град.",
        card_cta="Научете повече →",
    ),
}

# ── UNIQUE per (service, city, language) prose ───────────────────
# Each entry: lead (hero), why (economic character + service), how (approach),
# faqs = 2 city-specific Q&A (a shared per-service cost FAQ is prepended).
CONTENT = {
 "ecommerce": {
  "milano": {
   "it": dict(
    lead="Milano è la capitale italiana della moda, del design e del retail di fascia alta: i marchi milanesi hanno i margini e l'ambizione per vendere online in tutta Europa. Costruiamo e-commerce che riflettono questo posizionamento premium, veloci e curati come una vetrina in Quadrilatero.",
    why="Un negozio online a Milano deve reggere i lanci stagionali, le campagne durante la Fashion Week e clienti internazionali esigenti. Sviluppiamo store headless (Next.js con Shopify o Medusa) con schede prodotto ricche, ricerca istantanea, pagamenti Stripe e PayPal e spedizioni multi-corriere verso l'estero, calibrati su un valore medio dell'ordine elevato.",
    how="Curiamo fotografia, microcopy e prestazioni: Core Web Vitals verdi, checkout in due passaggi e integrazione con il magazzino o il gestionale esistente. Per i brand milanesi che vendono anche all'ingrosso aggiungiamo un'area B2B riservata con listini dedicati accanto allo store B2C.",
    faqs=[("Potete gestire vendite internazionali?", "Sì: configuriamo valute multiple, IVA UE, spedizioni con corrieri come DHL e UPS e contenuti in inglese, così i marchi milanesi vendono in tutta Europa dal primo giorno."),
          ("Integrate magazzino e gestionale?", "Colleghiamo lo store al vostro ERP o software di magazzino via API, sincronizzando stock, ordini e fatture: ideale per chi unisce showroom, retail e vendita online.")]),
   "en": dict(
    lead="Milan is Italy's capital of fashion, design and premium retail — Milanese brands have the margins and the ambition to sell across Europe online. We build e-commerce that mirrors that premium positioning: fast, meticulous, as considered as a Quadrilatero window display.",
    why="A Milan online store has to handle seasonal drops, Fashion Week campaigns and demanding international shoppers. We develop headless stores (Next.js with Shopify or Medusa) with rich product pages, instant search, Stripe and PayPal payments and multi-courier cross-border shipping, tuned for a high average order value.",
    how="We obsess over photography, microcopy and performance: green Core Web Vitals, a two-step checkout and integration with your existing warehouse or management system. For Milanese brands that also sell wholesale, we add a private B2B area with dedicated price lists alongside the B2C storefront.",
    faqs=[("Can you handle international sales?", "Yes — we set up multi-currency, EU VAT, shipping with couriers like DHL and UPS and English content, so Milanese brands sell across Europe from day one."),
          ("Do you integrate warehouse and ERP?", "We connect the store to your ERP or warehouse software via API, syncing stock, orders and invoices — ideal for brands combining showroom, retail and online sales.")]),
   "bg": dict(
    lead="Милано е италианската столица на модата, дизайна и висок клас търговията — миланските марки имат маржовете и амбицията да продават онлайн в цяла Европа. Изграждаме онлайн магазини, които отразяват този премиум образ: бързи и прецизни като витрина в Quadrilatero.",
    why="Онлайн магазин в Милано трябва да издържа сезонни колекции, кампании по време на Седмицата на модата и взискателни международни клиенти. Разработваме headless магазини (Next.js с Shopify или Medusa) с богати продуктови страници, мигновено търсене, Stripe и PayPal плащания и доставки с няколко куриера, оптимизирани за висока средна стойност на поръчката.",
    how="Обръщаме внимание на фотографията, текстовете и производителността: зелени Core Web Vitals, checkout в две стъпки и интеграция със съществуващия склад или система. За миланските марки, които продават и на едро, добавяме защитена B2B зона с отделни ценови листи до B2C магазина.",
    faqs=[("Можете ли да поемете международни продажби?", "Да — настройваме няколко валути, ДДС в ЕС, доставки с куриери като DHL и UPS и съдържание на английски, така че миланските марки продават в цяла Европа от първия ден."),
          ("Интегрирате ли склад и ERP?", "Свързваме магазина с вашата ERP или складова система през API, синхронизирайки наличности, поръчки и фактури — идеално за марки, съчетаващи шоурум, магазин и онлайн продажби.")]),
  },
  "roma": {
   "it": dict(
    lead="Roma vive di turismo, artigianato e prodotti tipici: dai vini dei Castelli alle specialità gastronomiche, c'è una domanda internazionale che il negozio fisico da solo non intercetta. Portiamo online i prodotti romani con e-commerce multilingue pensati per i visitatori di tutto il mondo.",
    why="Chi vende a Roma raggiunge un pubblico globale: turisti che vogliono riacquistare da casa, expat e mercati esteri. Sviluppiamo store in italiano e inglese (e altre lingue), con schede prodotto ricche di storytelling, pagamenti internazionali e spedizioni verso l'estero calibrate per alimentari e artigianato.",
    how="Ottimizziamo per le ricerche dei turisti e per Google Shopping, con dati strutturati e recensioni. Integriamo corrieri, gestione dei lotti per gli alimentari e, dove serve, il ritiro in negozio per la clientela locale della capitale.",
    faqs=[("Realizzate store multilingue per i turisti?", "Sì: costruiamo store in italiano, inglese e altre lingue, così i turisti che hanno visitato Roma possono riordinare i vostri prodotti da casa."),
          ("Gestite la vendita di alimentari?", "Gestiamo prodotti alimentari con lotti, scadenze e spedizioni adeguate, includendo imballaggi e corrieri idonei ai prodotti deperibili.")]),
   "en": dict(
    lead="Rome runs on tourism, craftsmanship and regional specialties — from Castelli wines to gastronomic delicacies, there's international demand a physical shop alone never captures. We bring Roman products online with multilingual e-commerce built for visitors worldwide.",
    why="Selling in Rome means reaching a global audience: tourists who want to reorder from home, expats and foreign markets. We build stores in Italian and English (and more), with story-rich product pages, international payments and cross-border shipping calibrated for food and artisan goods.",
    how="We optimize for tourist searches and Google Shopping, with structured data and reviews. We integrate couriers, batch tracking for food products and, where useful, in-store pickup for the capital's local clientele.",
    faqs=[("Do you build multilingual stores for tourists?", "Yes — we build stores in Italian, English and other languages, so tourists who visited Rome can reorder your products from home."),
          ("Can you handle food sales?", "We handle food products with batches, expiry dates and suitable shipping, including packaging and couriers fit for perishable goods.")]),
   "bg": dict(
    lead="Рим живее от туризъм, занаяти и регионални продукти — от вината на Castelli до гастрономически специалитети има международно търсене, което само физическият магазин не улавя. Извеждаме римските продукти онлайн с многоезични магазини за посетители от цял свят.",
    why="Продажбите в Рим означават глобална аудитория: туристи, които искат да поръчат отново, експати и външни пазари. Изграждаме магазини на италиански и английски (и още), с богати на разказ продуктови страници, международни плащания и трансгранични доставки за храни и занаятчийски стоки.",
    how="Оптимизираме за туристически търсения и Google Shopping със структурирани данни и отзиви. Интегрираме куриери, проследяване на партиди за храни и при нужда вземане от магазина за местните клиенти в столицата.",
    faqs=[("Изграждате ли многоезични магазини за туристи?", "Да — правим магазини на италиански, английски и други езици, за да могат туристите, посетили Рим, да поръчат отново вашите продукти от вкъщи."),
          ("Можете ли да поемете продажба на храни?", "Поемаме хранителни продукти с партиди, срокове на годност и подходящи доставки, включително опаковки и куриери за нетрайни стоки.")]),
  },
  "torino": {
   "it": dict(
    lead="Torino unisce l'industria all'eccellenza gastronomica: cioccolato, gianduia, nocciole delle Langhe, caffè e vini piemontesi sono prodotti che il mondo cerca online. Costruiamo e-commerce che raccontano questa qualità e la spediscono ovunque.",
    why="Per i produttori food torinesi e piemontesi sviluppiamo store con catalogo stagionale, box regalo, abbonamenti e spedizioni a temperatura controllata. Per il tessuto industriale della città realizziamo anche cataloghi di vendita B2B di ricambi e componenti, con listini per rivenditore.",
    how="Colleghiamo lo store a magazzino e fatturazione, gestiamo lotti e scadenze per il food e configuriamo Google Shopping e campagne per la stagionalità dei regali. Prestazioni elevate anche con cataloghi ampi.",
    faqs=[("Gestite box regalo e abbonamenti?", "Sì: implementiamo box regalo, abbonamenti ricorrenti e vendite stagionali, molto usati dai produttori di cioccolato e specialità piemontesi."),
          ("Potete realizzare uno store B2B?", "Realizziamo store B2B con listini per rivenditore e ordini minimi, adatti ai fornitori industriali torinesi.")]),
   "en": dict(
    lead="Turin blends heavy industry with gastronomic excellence — chocolate, gianduja, Langhe hazelnuts, coffee and Piedmont wines are products the world searches for online. We build e-commerce that tells that quality story and ships it anywhere.",
    why="For Turin and Piedmont food producers we develop stores with seasonal catalogs, gift boxes, subscriptions and temperature-controlled shipping. For the city's industrial base we also build B2B sales catalogs for parts and components, with per-dealer price lists.",
    how="We connect the store to warehouse and invoicing, manage batches and expiry for food, and set up Google Shopping and campaigns for seasonal gifting. Strong performance even with large catalogs.",
    faqs=[("Do you handle gift boxes and subscriptions?", "Yes — we implement gift boxes, recurring subscriptions and seasonal sales, widely used by Piedmont chocolate and specialty producers."),
          ("Can you build a B2B store?", "We build B2B stores with per-dealer price lists and minimum orders, suited to Turin's industrial suppliers.")]),
   "bg": dict(
    lead="Торино съчетава тежка индустрия с гастрономическо съвършенство — шоколад, джандуя, лешници от Ланге, кафе и пиемонтски вина са продукти, които светът търси онлайн. Изграждаме магазини, които разказват това качество и го доставят навсякъде.",
    why="За производителите на храни от Торино и Пиемонт разработваме магазини със сезонен каталог, подаръчни кутии, абонаменти и доставка с контролирана температура. За индустрията на града правим и B2B каталози за части и компоненти с ценови листи по дилър.",
    how="Свързваме магазина със склад и фактуриране, управляваме партиди и срокове за храните и настройваме Google Shopping и кампании за сезонни подаръци. Висока производителност дори при големи каталози.",
    faqs=[("Поемате ли подаръчни кутии и абонаменти?", "Да — внедряваме подаръчни кутии, повтарящи се абонаменти и сезонни продажби, широко използвани от пиемонтските производители на шоколад и специалитети."),
          ("Можете ли да изградите B2B магазин?", "Изграждаме B2B магазини с ценови листи по дилър и минимални поръчки, подходящи за индустриалните доставчици в Торино.")]),
  },
  "firenze": {
   "it": dict(
    lead="Firenze è sinonimo di pelletteria, moda e artigianato di lusso: borse, scarpe e accessori made in Florence hanno clienti in tutto il mondo. Realizziamo e-commerce eleganti che portano l'artigianato fiorentino sui mercati internazionali.",
    why="Per gli artigiani e le boutique toscane costruiamo store che valorizzano il prodotto: fotografia di alta qualità, personalizzazione (iniziali, colori, misure), storytelling del fatto a mano e spedizioni internazionali assicurate. SEO in inglese per intercettare i turisti che tornano a casa.",
    how="Integriamo Stripe, dazi e spedizioni extra-UE, gestione della produzione su ordinazione e lista d'attesa per i pezzi unici. Il risultato è uno store che comunica valore e converte a prezzi premium.",
    faqs=[("Gestite prodotti personalizzabili?", "Sì: gestiamo prodotti personalizzabili (iniziali, colori, taglie su misura) con configuratore e tempi di produzione, tipici della pelletteria fiorentina."),
          ("Vendete anche fuori dall'Unione Europea?", "Configuriamo spedizioni assicurate extra-UE, dazi e contenuti in inglese per vendere il made in Florence a clienti internazionali.")]),
   "en": dict(
    lead="Florence is a byword for leather goods, fashion and luxury craftsmanship — bags, shoes and accessories made in Florence have customers worldwide. We build elegant e-commerce that carries Florentine craft to international markets.",
    why="For Tuscan artisans and boutiques we build stores that showcase the product: high-end photography, personalization (initials, colors, sizes), handmade storytelling and insured international shipping. English SEO to capture tourists once they're home.",
    how="We integrate Stripe, duties and non-EU shipping, made-to-order production management and waitlists for one-off pieces. The result is a store that signals value and converts at premium prices.",
    faqs=[("Do you handle customizable products?", "Yes — we handle customizable products (initials, colors, made-to-measure sizes) with a configurator and production lead times, typical of Florentine leather goods."),
          ("Do you sell outside the EU?", "We set up insured non-EU shipping, duties and English content to sell made-in-Florence to international customers.")]),
   "bg": dict(
    lead="Флоренция е синоним на кожени изделия, мода и луксозни занаяти — чанти, обувки и аксесоари, произведени във Флоренция, имат клиенти по цял свят. Изграждаме елегантни магазини, които отвеждат флорентинския занаят на международните пазари.",
    why="За тосканските занаятчии и бутици правим магазини, които представят продукта: висококласна фотография, персонализация (инициали, цветове, размери), разказ за ръчна изработка и застраховани международни доставки. SEO на английски за туристите след завръщането им.",
    how="Интегрираме Stripe, мита и доставки извън ЕС, управление на производство по поръчка и списък на чакащи за уникални изделия. Резултатът е магазин, който излъчва стойност и продава на премиум цени.",
    faqs=[("Поемате ли персонализируеми продукти?", "Да — поемаме персонализируеми продукти (инициали, цветове, размери по поръчка) с конфигуратор и срокове за производство, типични за флорентинската кожена изработка."),
          ("Продавате ли извън ЕС?", "Настройваме застраховани доставки извън ЕС, мита и съдържание на английски за продажба на made-in-Florence на международни клиенти.")]),
  },
  "napoli": {
   "it": dict(
    lead="Napoli è food, caffè e sartoria: mozzarella, pasta, dolci, espresso e abiti su misura napoletani hanno una domanda internazionale enorme, alimentata dalla diaspora e dai turisti. Costruiamo e-commerce che spediscono il gusto e lo stile di Napoli nel mondo.",
    why="Per i food brand napoletani sviluppiamo store con spedizioni refrigerate, gestione di lotti e scadenze e box degustazione. Per la sartoria realizziamo configuratori su misura. Puntiamo su un checkout rapido e SEO in italiano e inglese per la clientela all'estero.",
    how="Integriamo corrieri specializzati nel food, pagamenti internazionali e, dove serve, la vendita su marketplace. Ottimizziamo prezzi di spedizione e imballaggi per rendere sostenibile l'export di prodotti freschi.",
    faqs=[("Gestite prodotti freschi e deperibili?", "Sì: gestiamo prodotti freschi con spedizioni refrigerate, controllo dei lotti e imballaggi idonei, essenziali per i food brand napoletani."),
          ("Vendete alla diaspora e all'estero?", "Configuriamo spedizioni internazionali e contenuti in inglese per raggiungere la diaspora e i clienti esteri che cercano le specialità di Napoli.")]),
   "en": dict(
    lead="Naples is food, coffee and tailoring — mozzarella, pasta, pastries, espresso and Neapolitan bespoke suits enjoy huge international demand, driven by the diaspora and tourists. We build e-commerce that ships the taste and style of Naples worldwide.",
    why="For Neapolitan food brands we develop stores with refrigerated shipping, batch and expiry management and tasting boxes. For tailoring we build made-to-measure configurators. We focus on fast checkout and Italian/English SEO for customers abroad.",
    how="We integrate food-specialist couriers, international payments and, where useful, marketplace selling. We optimize shipping rates and packaging to make exporting fresh products viable.",
    faqs=[("Do you handle fresh and perishable goods?", "Yes — we handle fresh goods with refrigerated shipping, batch control and suitable packaging, essential for Neapolitan food brands."),
          ("Do you sell to the diaspora and abroad?", "We set up international shipping and English content to reach the diaspora and foreign customers looking for Naples specialties.")]),
   "bg": dict(
    lead="Неапол е храна, кафе и шивачество — моцарела, паста, сладкиши, еспресо и неаполитански костюми по поръчка имат огромно международно търсене, подхранвано от диаспората и туристите. Изграждаме магазини, които доставят вкуса и стила на Неапол по света.",
    why="За неаполитанските хранителни марки разработваме магазини с хладилни доставки, управление на партиди и срокове и дегустационни кутии. За шивачеството правим конфигуратори по поръчка. Залагаме на бърз checkout и SEO на италиански и английски за клиенти в чужбина.",
    how="Интегрираме специализирани куриери за храни, международни плащания и при нужда продажба през маркетплейси. Оптимизираме цени за доставка и опаковки, за да направим износа на пресни продукти рентабилен.",
    faqs=[("Поемате ли пресни и нетрайни стоки?", "Да — поемаме пресни стоки с хладилни доставки, контрол на партиди и подходящи опаковки, ключови за неаполитанските хранителни марки."),
          ("Продавате ли на диаспората и в чужбина?", "Настройваме международни доставки и съдържание на английски, за да достигнем диаспората и чуждестранните клиенти, търсещи неаполитански специалитети.")]),
  },
  "bologna": {
   "it": dict(
    lead="Bologna è la capitale della food valley emiliana: mortadella, tortellini, Parmigiano e aceto balsamico DOP sono ambasciatori del made in Italy nel mondo. Realizziamo e-commerce che portano i sapori emiliani sulle tavole internazionali.",
    why="Per i produttori DOP e IGP bolognesi sviluppiamo store con tracciabilità dei lotti, spedizioni a temperatura controllata e box gastronomici. Valorizziamo la forte reputazione del territorio con storytelling e certificazioni in evidenza, e SEO multilingue per l'export.",
    how="Integriamo corrieri food, gestione delle scadenze e Google Shopping. Per il tessuto industriale della packaging e motor valley realizziamo anche cataloghi B2B di ricambi con riordino rapido per rivenditori e officine.",
    faqs=[("Valorizzate le certificazioni DOP e IGP?", "Sì: mettiamo in risalto le certificazioni DOP e IGP con schede dedicate, tracciabilità dei lotti e storytelling, elementi decisivi per i prodotti alimentari emiliani."),
          ("Realizzate store B2B per la meccanica?", "Realizziamo store B2B per la meccanica bolognese, con cataloghi ricambi, listini per cliente e ordini rapidi.")]),
   "en": dict(
    lead="Bologna is the capital of Emilia's food valley — mortadella, tortellini, Parmigiano and DOP balsamic vinegar are ambassadors of made-in-Italy worldwide. We build e-commerce that brings Emilian flavors to international tables.",
    why="For Bologna's DOP and IGP producers we develop stores with batch traceability, temperature-controlled shipping and gourmet boxes. We leverage the region's strong reputation with storytelling and certifications up front, plus multilingual SEO for export.",
    how="We integrate food couriers, expiry management and Google Shopping. For the packaging and motor valley industry we also build B2B parts catalogs with fast reordering for dealers and workshops.",
    faqs=[("Do you highlight DOP and IGP certifications?", "Yes — we highlight DOP and IGP certifications with dedicated pages, batch traceability and storytelling, decisive for Emilian food products."),
          ("Do you build B2B stores for machinery?", "We build B2B stores for Bologna's machinery sector, with parts catalogs, per-customer price lists and fast ordering.")]),
   "bg": dict(
    lead="Болоня е столицата на хранителната долина на Емилия — мортадела, тортелини, пармезан и DOP балсамов оцет са посланици на made-in-Italy по света. Изграждаме магазини, които отвеждат емилианските вкусове на международните маси.",
    why="За DOP и IGP производителите в Болоня разработваме магазини с проследяване на партиди, доставки с контролирана температура и гурме кутии. Използваме силната репутация на региона с разказ и сертификати на преден план, плюс многоезично SEO за износ.",
    how="Интегрираме куриери за храни, управление на срокове и Google Shopping. За индустрията на packaging и motor valley правим и B2B каталози за части с бързо повторно поръчване за дилъри и сервизи.",
    faqs=[("Извеждате ли DOP и IGP сертификатите?", "Да — извеждаме DOP и IGP сертификатите със специални страници, проследяване на партиди и разказ, решаващи за емилианските храни."),
          ("Изграждате ли B2B магазини за машиностроенето?", "Изграждаме B2B магазини за машиностроенето в Болоня, с каталози за части, ценови листи по клиент и бързо поръчване.")]),
  },
  "sofia": {
   "it": dict(
    lead="Sofia è il motore economico e tech della Bulgaria: retail in crescita, startup e brand locali pronti a espandersi nel mercato UE. Sviluppiamo e-commerce scalabili che permettono alle aziende di Sofia di vendere oltre confine.",
    why="Per i commercianti di Sofia costruiamo store veloci con pagamenti locali e internazionali, corrieri bulgari (Econt, Speedy) e contrassegno, oltre a spedizioni verso l'UE. Gestiamo il doppio prezzo BGN/EUR in vista dell'adozione dell'euro e contenuti bilingue.",
    how="Realizziamo store headless o su Shopify e WooCommerce, con SEO in bulgaro e inglese, integrazione dei marketplace e analytics per la crescita. L'obiettivo è trasformare un negozio locale in un brand che vende in tutta Europa.",
    faqs=[("Integrate i corrieri e il contrassegno bulgari?", "Sì: integriamo Econt e Speedy, il contante alla consegna e i pagamenti con carta, i metodi più usati dai clienti bulgari."),
          ("Aiutate a vendere nell'UE?", "Configuriamo spedizioni UE, valute e contenuti multilingue per aiutare i brand di Sofia a vendere oltre confine.")]),
   "en": dict(
    lead="Sofia is Bulgaria's economic and tech engine — growing retail, startups and local brands ready to expand into the EU market. We develop scalable e-commerce that lets Sofia companies sell across borders.",
    why="For Sofia retailers we build fast stores with local and international payments, Bulgarian couriers (Econt, Speedy) and cash on delivery, plus EU shipping. We handle dual BGN/EUR pricing ahead of euro adoption and bilingual content.",
    how="We build headless stores or on Shopify and WooCommerce, with Bulgarian and English SEO, marketplace integration and growth analytics. The goal is to turn a local shop into a brand that sells across Europe.",
    faqs=[("Do you integrate Bulgarian couriers and cash on delivery?", "Yes — we integrate Econt and Speedy, cash on delivery and card payments, the methods Bulgarian customers use most."),
          ("Do you help sell across the EU?", "We set up EU shipping, currencies and multilingual content to help Sofia brands sell across borders.")]),
   "bg": dict(
    lead="София е икономическият и технологичен двигател на България — растяща търговия, стартъпи и местни марки, готови да се разширят на пазара в ЕС. Разработваме мащабируеми онлайн магазини, които позволяват на софийските фирми да продават отвъд граница.",
    why="За софийските търговци изграждаме бързи магазини с местни и международни плащания, български куриери (Еконт, Спиди) и наложен платеж, плюс доставки в ЕС. Поемаме двойното ценообразуване в лева и евро преди приемането на еврото и двуезично съдържание.",
    how="Правим headless магазини или на Shopify и WooCommerce, със SEO на български и английски, интеграция на маркетплейси и аналитика за растеж. Целта е местен магазин да се превърне в марка, продаваща в цяла Европа.",
    faqs=[("Интегрирате ли български куриери и наложен платеж?", "Да — интегрираме Еконт и Спиди, наложен платеж и плащане с карта, методите, които българските клиенти използват най-много."),
          ("Помагате ли за продажби в ЕС?", "Настройваме доставки в ЕС, валути и многоезично съдържание, за да помогнем на софийските марки да продават отвъд граница.")]),
  },
  "plovdiv": {
   "it": dict(
    lead="Plovdiv, con la Trakia Economic Zone, è un polo manifatturiero, tessile e agroalimentare. Molti produttori vendono ancora solo all'ingrosso: costruiamo e-commerce che aprono loro il canale diretto verso il consumatore, in Bulgaria e nell'UE.",
    why="Per i produttori di Plovdiv sviluppiamo store D2C e B2B con cataloghi ampi, listini per cliente, corrieri bulgari e spedizioni verso l'Europa. Gestiamo prodotti tessili, alimentari e industriali con varianti, taglie e ordini minimi.",
    how="Integriamo lo store con il gestionale o l'ERP di fabbrica per sincronizzare stock e ordini, riducendo il lavoro manuale. SEO in bulgaro e inglese per intercettare gli acquirenti esteri.",
    faqs=[("Aiutate a passare dall'ingrosso alla vendita diretta?", "Sì: aiutiamo i produttori di Plovdiv a passare dall'ingrosso al D2C con uno store diretto, mantenendo anche un'area B2B per i clienti storici."),
          ("Collegate lo store all'ERP di produzione?", "Colleghiamo lo store all'ERP di produzione per sincronizzare stock, prezzi e ordini automaticamente.")]),
   "en": dict(
    lead="Plovdiv, home of the Trakia Economic Zone, is a manufacturing, textile and agrifood hub. Many producers still sell wholesale only — we build e-commerce that opens a direct-to-consumer channel for them, in Bulgaria and across the EU.",
    why="For Plovdiv manufacturers we develop D2C and B2B stores with large catalogs, per-customer price lists, Bulgarian couriers and EU shipping. We handle textile, food and industrial products with variants, sizes and minimum orders.",
    how="We connect the store to the factory's management system or ERP to sync stock and orders, cutting manual work. Bulgarian and English SEO to reach foreign buyers.",
    faqs=[("Do you help move from wholesale to direct sales?", "Yes — we help Plovdiv manufacturers move from wholesale to D2C with a direct store, while keeping a B2B area for long-standing customers."),
          ("Do you connect the store to a production ERP?", "We connect the store to the production ERP to sync stock, prices and orders automatically.")]),
   "bg": dict(
    lead="Пловдив, дом на Тракия икономическа зона, е център на производството, текстила и хранителната индустрия. Много производители още продават само на едро — изграждаме магазини, които им отварят директен канал към потребителя, в България и в ЕС.",
    why="За пловдивските производители разработваме D2C и B2B магазини с големи каталози, ценови листи по клиент, български куриери и доставки в ЕС. Поемаме текстилни, хранителни и индустриални продукти с варианти, размери и минимални поръчки.",
    how="Свързваме магазина със системата или ERP на завода, за да синхронизираме наличности и поръчки и да намалим ръчната работа. SEO на български и английски за чуждестранни купувачи.",
    faqs=[("Помагате ли за преход от едро към директни продажби?", "Да — помагаме на пловдивските производители да преминат от едро към D2C с директен магазин, като запазват и B2B зона за дългогодишните клиенти."),
          ("Свързвате ли магазина с производствен ERP?", "Свързваме магазина с производствения ERP за автоматична синхронизация на наличности, цени и поръчки.")]),
  },
 },
 "erp": {
  "milano": {
   "it": dict(
    lead="Le aziende milanesi di moda, servizi e commercio crescono in fretta e si scontrano con fogli Excel e gestionali scollegati. Sviluppiamo software ERP su misura che unificano vendite, magazzino, acquisti e fatturazione in un unico sistema.",
    why="Per i brand moda di Milano il nostro ERP gestisce collezioni, stagioni, matrici taglie/colori, showroom e vendita all'ingrosso accanto al retail. Per le società di servizi gestiamo commesse, timesheet e fatturazione, tutto conforme alla fatturazione elettronica italiana.",
    how="Analizziamo i vostri processi, poi costruiamo moduli su misura con dashboard in tempo reale, permessi per ruolo e integrazione con e-commerce e contabilità. Formazione del team in italiano inclusa.",
    faqs=[("Gestite le esigenze dei brand moda?", "Sì: gestiamo collezioni per stagione, matrici taglie/colori, ordini all'ingrosso e showroom, esigenze tipiche dei brand moda milanesi."),
          ("Supportate la fatturazione elettronica?", "Il nostro ERP genera la fatturazione elettronica conforme allo standard italiano (SdI) e si integra con il vostro commercialista.")]),
   "en": dict(
    lead="Milan's fashion, services and commerce companies grow fast and hit a wall of spreadsheets and disconnected tools. We develop custom ERP software that unifies sales, inventory, purchasing and invoicing in a single system.",
    why="For Milan fashion brands our ERP manages collections, seasons, size/color matrices, showroom and wholesale alongside retail. For service firms we handle projects, timesheets and billing, all compliant with Italian e-invoicing.",
    how="We map your processes, then build tailored modules with real-time dashboards, role-based permissions and integration with e-commerce and accounting. Team training in Italian included.",
    faqs=[("Do you handle fashion-brand needs?", "Yes — we handle season-based collections, size/color matrices, wholesale orders and showroom, needs typical of Milan fashion brands."),
          ("Do you support e-invoicing?", "Our ERP generates Italian-compliant e-invoices (SdI) and integrates with your accountant.")]),
   "bg": dict(
    lead="Миланските фирми в модата, услугите и търговията растат бързо и се сблъскват със стена от таблици и несвързани инструменти. Разработваме ERP софтуер по поръчка, който обединява продажби, склад, доставки и фактуриране в една система.",
    why="За миланските модни марки нашата ERP управлява колекции, сезони, матрици размери/цветове, шоурум и продажби на едро наред с търговията на дребно. За фирмите за услуги поемаме проекти, часове и фактуриране, всичко съвместимо с италианското електронно фактуриране.",
    how="Картографираме процесите ви, после изграждаме модули по поръчка с табла в реално време, права по роля и интеграция с онлайн магазин и счетоводство. Обучение на екипа на италиански е включено.",
    faqs=[("Поемате ли нуждите на модните марки?", "Да — поемаме сезонни колекции, матрици размери/цветове, поръчки на едро и шоурум, нужди, типични за миланските модни марки."),
          ("Поддържате ли електронно фактуриране?", "Нашата ERP генерира електронни фактури по италианския стандарт (SdI) и се интегрира със счетоводителя ви.")]),
  },
  "roma": {
   "it": dict(
    lead="A Roma dominano servizi professionali, turismo e associazioni: realtà che gestiscono commesse, prenotazioni e progetti complessi. Costruiamo ERP su misura che mettono ordine in preventivi, contratti, fatturazione e reportistica.",
    why="Per studi e società di servizi romane il nostro ERP gestisce commesse, timesheet, scadenze e fatturazione ricorrente. Per il turismo integriamo prenotazioni, disponibilità e canali OTA. Ruoli e permessi per team distribuiti.",
    how="Sviluppiamo moduli su misura con dashboard, notifiche e integrazione con la fatturazione elettronica italiana. Migriamo i dati dai vostri sistemi attuali e formiamo il personale in italiano.",
    faqs=[("Gestite commesse e fatturazione ricorrente?", "Sì: gestiamo commesse, timesheet e fatturazione ricorrente, ideali per studi professionali e società di servizi della capitale."),
          ("Integrate prenotazioni e canali OTA?", "Integriamo prenotazioni, disponibilità e canali OTA per gli operatori turistici romani.")]),
   "en": dict(
    lead="Rome is dominated by professional services, tourism and associations — organizations juggling engagements, bookings and complex projects. We build custom ERP that brings order to quotes, contracts, invoicing and reporting.",
    why="For Rome firms and service companies our ERP handles projects, timesheets, deadlines and recurring billing. For tourism we integrate bookings, availability and OTA channels. Roles and permissions for distributed teams.",
    how="We develop tailored modules with dashboards, notifications and Italian e-invoicing integration. We migrate data from your current systems and train staff in Italian.",
    faqs=[("Do you handle projects and recurring billing?", "Yes — we handle projects, timesheets and recurring billing, ideal for the capital's professional firms and service companies."),
          ("Do you integrate bookings and OTA channels?", "We integrate bookings, availability and OTA channels for Rome's tourism operators.")]),
   "bg": dict(
    lead="В Рим доминират професионалните услуги, туризмът и асоциациите — организации, които управляват ангажименти, резервации и сложни проекти. Изграждаме ERP по поръчка, който въвежда ред в оферти, договори, фактуриране и отчети.",
    why="За римските кантори и фирми за услуги нашата ERP поема проекти, часове, срокове и повтарящо се фактуриране. За туризма интегрираме резервации, наличност и OTA канали. Роли и права за разпределени екипи.",
    how="Разработваме модули по поръчка с табла, известия и интеграция с италианското електронно фактуриране. Мигрираме данните от текущите ви системи и обучаваме персонала на италиански.",
    faqs=[("Поемате ли проекти и повтарящо се фактуриране?", "Да — поемаме проекти, часове и повтарящо се фактуриране, идеални за професионалните кантори и фирми за услуги в столицата."),
          ("Интегрирате ли резервации и OTA канали?", "Интегрираме резервации, наличност и OTA канали за римските туристически оператори.")]),
  },
  "torino": {
   "it": dict(
    lead="Torino è la capitale italiana dell'automotive e della meccanica: filiere complesse, produzione su commessa e distinte base articolate. Il nostro ERP è già in produzione presso un costruttore italiano e gestisce l'intero ciclo, dall'ordine alla spedizione.",
    why="Per i produttori torinesi implementiamo moduli di produzione (MRP), magazzino, distinte base, controllo qualità e fatturazione. Tracciamo lotti e commesse, pianifichiamo la capacità e colleghiamo i fornitori della filiera automotive.",
    how="Partiamo dai vostri flussi reali di officina, digitalizziamo ordini di lavoro e avanzamento produzione, con dashboard per la direzione. Formazione in italiano e assistenza continua.",
    faqs=[("Gestite distinte base e produzione?", "Sì: gestiamo distinte base, ordini di produzione, MRP e controllo qualità, moduli essenziali per la meccanica torinese."),
          ("Avete referenze nel settore?", "Il nostro ERP è già operativo presso un costruttore italiano di ascensori, con moduli produzione, magazzino e fatturazione.")]),
   "en": dict(
    lead="Turin is Italy's automotive and mechanical engineering capital — complex supply chains, make-to-order production and intricate bills of materials. Our ERP already runs in production at an Italian manufacturer and manages the full order-to-shipment cycle.",
    why="For Turin manufacturers we implement production (MRP), warehouse, bills of materials, quality control and invoicing modules. We track batches and jobs, plan capacity and connect automotive supply-chain vendors.",
    how="We start from your real shop-floor flows, digitize work orders and production progress, with dashboards for management. Training in Italian and ongoing support.",
    faqs=[("Do you handle bills of materials and production?", "Yes — we handle bills of materials, production orders, MRP and quality control, essential modules for Turin's engineering sector."),
          ("Do you have references in the sector?", "Our ERP already runs at an Italian elevator manufacturer, with production, warehouse and invoicing modules.")]),
   "bg": dict(
    lead="Торино е италианската столица на автомобилостроенето и машиностроенето — сложни вериги за доставки, производство по поръчка и подробни спецификации. Нашата ERP вече работи в производство при италиански производител и управлява целия цикъл от поръчка до доставка.",
    why="За торинските производители внедряваме модули за производство (MRP), склад, спецификации, контрол на качеството и фактуриране. Проследяваме партиди и поръчки, планираме капацитет и свързваме доставчиците от автомобилната верига.",
    how="Тръгваме от реалните ви цехови процеси, дигитализираме работни поръчки и напредъка на производството, с табла за ръководството. Обучение на италиански и постоянна поддръжка.",
    faqs=[("Поемате ли спецификации и производство?", "Да — поемаме спецификации, производствени поръчки, MRP и контрол на качеството, ключови модули за машиностроенето в Торино."),
          ("Имате ли референции в сектора?", "Нашата ERP вече работи при италиански производител на асансьори, с модули за производство, склад и фактуриране.")]),
  },
  "firenze": {
   "it": dict(
    lead="Le botteghe e i laboratori di pelletteria e moda fiorentini crescono ma restano legati a carta e memoria. Sviluppiamo ERP su misura che governano produzione artigianale, materiali e ordini senza snaturare il lavoro manuale.",
    why="Per gli artigiani di Firenze gestiamo distinte base per articoli fatti a mano, pelle e componenti, avanzamento delle lavorazioni, ordini su misura e conto lavoro con terzisti. Colleghiamo produzione, magazzino e vendite retail e wholesale.",
    how="Digitalizziamo le fasi di lavorazione con schede semplici da usare in laboratorio, tracciamo i costi reali per pezzo e integriamo l'e-commerce. Formazione in italiano e supporto continuo.",
    faqs=[("Gestite la produzione artigianale su misura?", "Sì: gestiamo distinte base per prodotti fatti a mano, conto lavoro con terzisti e ordini su misura, esigenze tipiche della pelletteria fiorentina."),
          ("Tracciate il costo per pezzo?", "Tracciamo il costo reale per pezzo, materiali e ore, così conoscete il margine di ogni articolo.")]),
   "en": dict(
    lead="Florentine leather and fashion workshops grow but stay tied to paper and memory. We develop custom ERP that governs artisan production, materials and orders without stifling the handmade craft.",
    why="For Florence artisans we manage bills of materials for handmade items, leather and components, work-in-progress tracking, made-to-order jobs and subcontracting. We connect production, warehouse and retail and wholesale sales.",
    how="We digitize production stages with cards that are simple to use on the workshop floor, track true cost per piece and integrate e-commerce. Training in Italian and ongoing support.",
    faqs=[("Do you handle made-to-order artisan production?", "Yes — we handle bills of materials for handmade products, subcontracting and made-to-order jobs, needs typical of Florentine leather goods."),
          ("Do you track cost per piece?", "We track true cost per piece, materials and hours, so you know the margin on every item.")]),
   "bg": dict(
    lead="Флорентинските ателиета за кожа и мода растат, но остават вързани за хартия и памет. Разработваме ERP по поръчка, който управлява занаятчийското производство, материалите и поръчките, без да задушава ръчния труд.",
    why="За флорентинските занаятчии управляваме спецификации за ръчно изработени изделия, кожа и компоненти, проследяване на незавършено производство, поръчки по мярка и подизпълнители. Свързваме производство, склад и продажби на дребно и едро.",
    how="Дигитализираме етапите на производство с прости за ателието карти, проследяваме реалната себестойност на изделие и интегрираме онлайн магазина. Обучение на италиански и постоянна поддръжка.",
    faqs=[("Поемате ли занаятчийско производство по поръчка?", "Да — поемаме спецификации за ръчно изработени продукти, подизпълнители и поръчки по мярка, нужди, типични за флорентинската кожена изработка."),
          ("Проследявате ли себестойност на изделие?", "Проследяваме реалната себестойност на изделие, материали и часове, за да знаете маржа на всеки артикул.")]),
  },
  "napoli": {
   "it": dict(
    lead="A Napoli food, distribuzione e logistica portuale gestiscono volumi elevati e margini stretti. Costruiamo ERP su misura che tengono sotto controllo magazzino, lotti, scadenze e consegne, riducendo sprechi ed errori.",
    why="Per i produttori e distributori alimentari napoletani gestiamo tracciabilità dei lotti, scadenze, HACCP, ordini e giri di consegna. Per la logistica integriamo carichi, documenti di trasporto e stato delle spedizioni in tempo reale.",
    how="Digitalizziamo gli ordini dei venditori con app mobile, sincronizziamo magazzino e fatturazione elettronica e forniamo dashboard per la direzione. Formazione in italiano inclusa.",
    faqs=[("Gestite lotti, scadenze e HACCP?", "Sì: gestiamo lotti, scadenze e tracciabilità HACCP, requisiti fondamentali per i produttori alimentari napoletani."),
          ("Supportate la logistica e le consegne?", "Integriamo giri di consegna, documenti di trasporto e stato delle spedizioni per la distribuzione e la logistica.")]),
   "en": dict(
    lead="In Naples, food, distribution and port logistics move high volumes on thin margins. We build custom ERP that keeps inventory, batches, expiry dates and deliveries under control, cutting waste and errors.",
    why="For Neapolitan food producers and distributors we manage batch traceability, expiry, HACCP, orders and delivery rounds. For logistics we integrate loads, transport documents and real-time shipment status.",
    how="We digitize sales reps' orders with a mobile app, sync inventory and e-invoicing and provide management dashboards. Training in Italian included.",
    faqs=[("Do you handle batches, expiry and HACCP?", "Yes — we handle batches, expiry and HACCP traceability, fundamental requirements for Neapolitan food producers."),
          ("Do you support logistics and deliveries?", "We integrate delivery rounds, transport documents and shipment status for distribution and logistics.")]),
   "bg": dict(
    lead="В Неапол храните, дистрибуцията и пристанищната логистика движат големи обеми при тесни маржове. Изграждаме ERP по поръчка, който държи под контрол склада, партидите, сроковете и доставките, намалявайки разхищения и грешки.",
    why="За неаполитанските производители и дистрибутори на храни управляваме проследяване на партиди, срокове, HACCP, поръчки и маршрути за доставка. За логистиката интегрираме товари, транспортни документи и статус на пратките в реално време.",
    how="Дигитализираме поръчките на търговците с мобилно приложение, синхронизираме склада и електронното фактуриране и предоставяме табла за ръководството. Обучение на италиански е включено.",
    faqs=[("Поемате ли партиди, срокове и HACCP?", "Да — поемаме партиди, срокове и HACCP проследяване, основни изисквания за неаполитанските производители на храни."),
          ("Поддържате ли логистика и доставки?", "Интегрираме маршрути за доставка, транспортни документи и статус на пратките за дистрибуцията и логистиката.")]),
  },
  "bologna": {
   "it": dict(
    lead="Bologna è la packaging valley e la motor valley: costruttori di macchine e componentistica di precisione con distinte base complesse e ricambi. Sviluppiamo ERP su misura che collegano progettazione, produzione e post-vendita.",
    why="Per la meccanica bolognese gestiamo distinte base multilivello, integrazione dei file CAD, MRP, commesse e catalogo ricambi. Colleghiamo il post-vendita con anagrafiche macchine e storico interventi per rivenditori e agenti.",
    how="Integriamo i gestionali e i CAD esistenti, digitalizziamo l'avanzamento produzione e apriamo aree riservate B2B per la richiesta ricambi. Dashboard e reportistica in tempo reale.",
    faqs=[("Gestite distinte base multilivello e CAD?", "Sì: gestiamo distinte base multilivello e integrazione dei file CAD, fondamentali per i costruttori di macchine bolognesi."),
          ("Realizzate cataloghi ricambi?", "Realizziamo cataloghi ricambi con anagrafica macchine e area B2B per rivenditori e officine.")]),
   "en": dict(
    lead="Bologna is the packaging valley and the motor valley — machine builders and precision components with complex bills of materials and spare parts. We develop custom ERP that links design, production and after-sales.",
    why="For Bologna's engineering firms we manage multi-level bills of materials, CAD file integration, MRP, jobs and spare-parts catalogs. We connect after-sales with machine records and service history for dealers and agents.",
    how="We integrate existing management systems and CAD, digitize production progress and open B2B reserved areas for spare-part requests. Real-time dashboards and reporting.",
    faqs=[("Do you handle multi-level BOMs and CAD?", "Yes — we handle multi-level bills of materials and CAD file integration, fundamental for Bologna's machine builders."),
          ("Do you build spare-parts catalogs?", "We build spare-parts catalogs with machine records and a B2B area for dealers and workshops.")]),
   "bg": dict(
    lead="Болоня е packaging valley и motor valley — производители на машини и прецизни компоненти със сложни спецификации и резервни части. Разработваме ERP по поръчка, който свързва проектиране, производство и следпродажбено обслужване.",
    why="За машиностроенето в Болоня управляваме многослойни спецификации, интеграция на CAD файлове, MRP, поръчки и каталог с резервни части. Свързваме следпродажбата с досиета на машините и история на сервиза за дилъри и агенти.",
    how="Интегрираме съществуващи системи и CAD, дигитализираме напредъка на производството и отваряме B2B защитени зони за заявки на резервни части. Табла и отчети в реално време.",
    faqs=[("Поемате ли многослойни спецификации и CAD?", "Да — поемаме многослойни спецификации и интеграция на CAD файлове, основни за производителите на машини в Болоня."),
          ("Изграждате ли каталози за резервни части?", "Изграждаме каталози с резервни части с досиета на машините и B2B зона за дилъри и сервизи.")]),
  },
  "sofia": {
   "it": dict(
    lead="A Sofia, aziende tech, distribuzione e servizi scalano rapidamente e hanno bisogno di sistemi che tengano il passo. Sviluppiamo ERP su misura che unificano vendite, magazzino, acquisti e contabilità in un'unica piattaforma.",
    why="Per le imprese di Sofia gestiamo multi-magazzino, multi-valuta e più entità, con reportistica per la direzione. Integriamo pagamenti, e-commerce e i requisiti contabili bulgari, con la doppia valuta BGN/EUR in vista dell'euro.",
    how="Analizziamo i processi, costruiamo moduli su misura con permessi per ruolo e dashboard, e formiamo il team in bulgaro. Assistenza in presenza a un'ora dalla nostra sede.",
    faqs=[("Gestite più magazzini, valute ed entità?", "Sì: gestiamo più magazzini, valute ed entità legali, adatti alle aziende di Sofia in rapida crescita."),
          ("Integrate la contabilità bulgara?", "Integriamo i requisiti contabili bulgari e la doppia valuta BGN/EUR in vista dell'adozione dell'euro.")]),
   "en": dict(
    lead="In Sofia, tech, distribution and services companies scale fast and need systems that keep up. We develop custom ERP that unifies sales, inventory, purchasing and accounting on a single platform.",
    why="For Sofia businesses we handle multi-warehouse, multi-currency and multi-entity setups, with management reporting. We integrate payments, e-commerce and Bulgarian accounting requirements, with dual BGN/EUR pricing ahead of the euro.",
    how="We analyze processes, build tailored modules with role-based permissions and dashboards, and train the team in Bulgarian. On-site support an hour from our HQ.",
    faqs=[("Do you handle multiple warehouses, currencies and entities?", "Yes — we handle multiple warehouses, currencies and legal entities, suited to fast-growing Sofia companies."),
          ("Do you integrate Bulgarian accounting?", "We integrate Bulgarian accounting requirements and dual BGN/EUR currency ahead of euro adoption.")]),
   "bg": dict(
    lead="В София технологичните, дистрибуторските и обслужващите фирми растат бързо и се нуждаят от системи, които не изостават. Разработваме ERP по поръчка, който обединява продажби, склад, доставки и счетоводство в една платформа.",
    why="За софийските фирми поемаме мулти-складове, мулти-валути и няколко юридически лица, с отчети за ръководството. Интегрираме плащания, онлайн търговия и българските счетоводни изисквания, с двойна валута лев/евро преди еврото.",
    how="Анализираме процесите, изграждаме модули по поръчка с права по роля и табла и обучаваме екипа на български. Поддръжка на място на час от офиса ни.",
    faqs=[("Поемате ли няколко склада, валути и лица?", "Да — поемаме няколко склада, валути и юридически лица, подходящи за бързорастящите софийски фирми."),
          ("Интегрирате ли българското счетоводство?", "Интегрираме българските счетоводни изисквания и двойната валута лев/евро преди приемането на еврото.")]),
  },
  "plovdiv": {
   "it": dict(
    lead="Plovdiv e la Trakia Economic Zone concentrano produzione, tessile e logistica. Molte fabbriche lavorano ancora con carta ed Excel: il nostro ERP, già usato da produttori italiani, digitalizza magazzino e produzione.",
    why="Per i produttori di Plovdiv implementiamo moduli magazzino, produzione, distinte base e spedizioni, con tracciabilità dei lotti e pianificazione. Colleghiamo ordini clienti, acquisti e fornitori in un unico flusso.",
    how="Partiamo dai processi di fabbrica, digitalizziamo gli ordini di lavoro e formiamo il personale in bulgaro, in presenza. La nostra sede è vicina: assistenza rapida e sopralluoghi.",
    faqs=[("I moduli magazzino e produzione sono già collaudati?", "Sì: i moduli magazzino e produzione con distinte base e lotti sono già in uso presso produttori italiani."),
          ("Offrite formazione in presenza?", "La nostra sede è nella regione: offriamo formazione e assistenza in presenza per le fabbriche di Plovdiv.")]),
   "en": dict(
    lead="Plovdiv and the Trakia Economic Zone concentrate manufacturing, textiles and logistics. Many factories still run on paper and Excel — our ERP, already used by Italian manufacturers, digitizes warehouse and production.",
    why="For Plovdiv manufacturers we implement warehouse, production, bills of materials and shipping modules, with batch traceability and planning. We connect customer orders, purchasing and suppliers into one flow.",
    how="We start from factory processes, digitize work orders and train staff in Bulgarian, on-site. Our HQ is nearby: fast support and site visits.",
    faqs=[("Are the warehouse and production modules proven?", "Yes — the warehouse and production modules with bills of materials and batches are already in use at Italian manufacturers."),
          ("Do you offer on-site training?", "Our HQ is in the region: we offer on-site training and support for Plovdiv factories.")]),
   "bg": dict(
    lead="Пловдив и Тракия икономическа зона концентрират производство, текстил и логистика. Много фабрики още работят с хартия и Excel — нашата ERP, вече използвана от италиански производители, дигитализира склад и производство.",
    why="За пловдивските производители внедряваме модули за склад, производство, спецификации и доставки, с проследяване на партиди и планиране. Свързваме клиентски поръчки, доставки и доставчици в един поток.",
    how="Тръгваме от фабричните процеси, дигитализираме работните поръчки и обучаваме персонала на български, на място. Офисът ни е наблизо: бърза поддръжка и огледи.",
    faqs=[("Изпитани ли са модулите за склад и производство?", "Да — модулите за склад и производство със спецификации и партиди вече се използват при италиански производители."),
          ("Предлагате ли обучение на място?", "Офисът ни е в региона: предлагаме обучение и поддръжка на място за пловдивските фабрики.")]),
  },
 },
}

# ── Shared inline CSS (identical geo chrome + hub card classes) ──
STYLE = "*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#ccc;font-family:'Space Mono',monospace;font-size:13px;line-height:2;padding:0}a{color:#00e5ff;text-decoration:none}.w{max-width:900px;margin:0 auto;padding:40px 20px}h1{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2.5rem;color:#f5f5f0;margin-bottom:16px;letter-spacing:-.03em;line-height:1.1}h2{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.2rem;color:#00e5ff;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.05em}h3{color:#f5f5f0;font-size:1rem;margin:20px 0 8px}p,li{margin-bottom:10px;line-height:1.9}ul{padding-left:20px}.nav{position:fixed;top:0;width:100%;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,229,255,.1);padding:12px 20px;z-index:1000;display:flex;justify-content:space-between;align-items:center}.nav a{color:#ccc;font-size:10px;letter-spacing:.2em;margin:0 10px}.nav img{height:24px}.hero-s{padding:120px 20px 60px;border-bottom:1px solid rgba(0,229,255,.1)}.tag{font-size:9px;color:#00e5ff;letter-spacing:.4em;margin-bottom:12px}.cta{display:inline-block;padding:14px 32px;border:1px solid #00e5ff;color:#00e5ff;font-size:11px;letter-spacing:.25em;margin-top:24px}.ft{border-top:1px solid rgba(245,245,240,.06);padding:30px 20px;text-align:center;font-size:9px;color:#666;margin-top:60px}.price{display:inline-block;padding:2px 10px;border:1px solid rgba(0,229,255,.2);color:#00e5ff;font-size:11px;margin-left:8px}.faq-item{border-bottom:1px solid rgba(245,245,240,.06);padding:16px 0}.faq-q{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1rem;color:#f5f5f0;margin-bottom:6px}.faq-a{font-size:12px;color:#ccc}.cities{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.cities a{padding:6px 14px;border:1px solid rgba(0,229,255,.2);font-size:11px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin:16px 0}.card{display:block;border:1px solid rgba(0,229,255,.15);padding:18px;background:rgba(0,229,255,.02)}.card .cn{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.05rem;color:#f5f5f0;margin-bottom:4px}.card .cd{font-size:11px;color:#999;line-height:1.6}.card .cl{font-size:10px;color:#00e5ff;letter-spacing:.15em;margin-top:8px;display:inline-block}"

def jld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "</script>"

def page_url(lang, slug):
    return BASE + L[lang]["hub_path"] + slug + "/"

def head_common(lang, title, desc, canon, alt_urls, og, locale, region, placename):
    alts = "".join(
        f'<link rel="alternate" hreflang="{l}" href="{alt_urls[l]}"/>' for l in ("it", "en", "bg")
    ) + f'<link rel="alternate" hreflang="x-default" href="{alt_urls["it"]}"/>'
    geo_meta = (f'<meta name="geo.region" content="{region}">\n'
                f'<meta name="geo.placename" content="{html.escape(placename, quote=True)}">\n') if region else ""
    return f"""<!DOCTYPE html><html lang="{lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc, quote=True)}">
<link rel="canonical" href="{canon}">
{alts}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Carbon Stealth VCC">
<meta property="og:title" content="{html.escape(title, quote=True)}">
<meta property="og:description" content="{html.escape(desc, quote=True)}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{BASE}/{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="{locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{html.escape(title, quote=True)}">
<meta name="twitter:description" content="{html.escape(desc, quote=True)}">
<meta name="twitter:image" content="{BASE}/{og}">
{geo_meta}<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="theme-color" content="#00e5ff">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>{STYLE}</style>
"""

def nav_html(lang):
    s = L[lang]
    links = "".join(f'<a href="{u}">{t}</a>' for u, t in s["nav"])
    return f'<nav class="nav"><a href="{s["home"]}"><img src="/logo.png" alt="Carbon Stealth VCC"></a><div>{links}</div></nav>'

def footer_html(lang):
    s = L[lang]
    links = " &middot; ".join(f'<a href="{u}">{t}</a>' for u, t in s["ft_links"])
    return f'<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>{links}</p></div>'

def service_city_page(service_key, city, lang):
    s = L[lang]
    svc = SERVICES[service_key]
    name = city["name"][lang]
    slug = f"{service_key}-{city['slug']}"
    canon = page_url(lang, slug)
    alt_urls = {l: page_url(l, slug) for l in ("it", "en", "bg")}
    title = svc["title"][lang].format(name=name)
    desc = svc["desc"][lang].format(name=name)
    h1 = svc["h1"][lang].format(name=name)
    c = CONTENT[service_key][city["slug"]][lang]

    cost_q, cost_a = svc["cost_faq"][lang]
    faqs = [(cost_q.format(name=name), cost_a)] + c["faqs"]

    svc_link = svc["svc_link"][lang]
    geo_link = f'{s["prefix"]}/geo/{city["slug"]}/'
    hub_link = s["hub_path"]

    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "Service", "@id": f"{canon}#service", "name": h1,
         "serviceType": svc["svc_type"],
         "provider": {"@id": f"{BASE}/#organization"},
         "areaServed": {"@type": "City", "name": city["name"]["en"]},
         "url": canon, "image": f"{BASE}/{s['og']}",
         "offers": {"@type": "Offer", "price": svc["offer"], "priceCurrency": "EUR"},
         "availableChannel": {"@type": "ServiceChannel", "serviceUrl": BASE + s["contact"]}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + (s["prefix"] or "/")},
            {"@type": "ListItem", "position": 2, "name": s["hub_name"], "item": BASE + s["hub_path"]},
            {"@type": "ListItem", "position": 3, "name": h1, "item": canon}]},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]},
    ]}

    features = "".join(f"<li>{html.escape(b)}</li>" for b in svc["features"][lang])
    process = "".join(f'<li><strong>{i+1}.</strong> {html.escape(step)}</li>' for i, step in enumerate(svc["process"][lang]))
    faq_html = "".join(f'<div class="faq-item"><div class="faq-q">{html.escape(q)}</div><div class="faq-a">{html.escape(a)}</div></div>' for q, a in faqs)
    price_line = s["price_line"].format(disp=svc["disp"][lang], price=svc["price"][lang])
    cross = s["cross"].format(svc=svc_link, geo=geo_link, hub=hub_link, name=name)

    return (head_common(lang, title, desc, canon, alt_urls, s["og"], s["locale"], city["region"], city["name"]["en"])
        + jld(graph) + "\n</head><body>\n" + nav_html(lang)
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["tag"].format(NAME=name.upper())}</div><h1>{html.escape(h1)}</h1><p>{html.escape(c["lead"])}</p><a href="{s["contact"]}" class="cta">{s["cta"]}</a></div></div>'
        + '<div class="w">'
        + f'<h2>{html.escape(svc["h2_why"][lang].format(name=name))}</h2><p>{html.escape(c["why"])}</p>'
        + f'<h2>{html.escape(svc["h2_how"][lang].format(name=name))}</h2><p>{html.escape(c["how"])}</p>'
        + f'<h2>{s["h2_features"]}</h2><ul>{features}</ul>'
        + f'<h2>{s["h2_process"]}</h2><ul class="proc">{process}</ul>'
        + f'<p><span class="price">{html.escape(price_line)}</span></p>'
        + f'<p>{cross}</p>'
        + f'<h2>{s["h2_faq"]}</h2>{faq_html}'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a></div>'
        + footer_html(lang) + "</body></html>\n")

def hub_page(lang):
    s = L[lang]
    canon = BASE + s["hub_path"]
    alt_urls = {l: BASE + L[l]["hub_path"] for l in ("it", "en", "bg")}

    def cards(service_key):
        svc = SERVICES[service_key]
        out = []
        for city in CITIES:
            slug = f"{service_key}-{city['slug']}"
            name = city["name"][lang]
            lead = CONTENT[service_key][city["slug"]][lang]["lead"]
            snippet = lead.split(":")[0]
            if len(snippet) > 90:
                snippet = snippet[:88].rsplit(" ", 1)[0] + "…"
            out.append(f'<a class="card" href="{s["hub_path"]}{slug}/"><div class="cn">{html.escape(svc["h1"][lang].format(name=name))}</div><div class="cd">{html.escape(snippet)}</div><span class="cl">{s["card_cta"]}</span></a>')
        return "".join(out)

    item_list = []
    pos = 0
    for service_key in ("ecommerce", "erp"):
        for city in CITIES:
            pos += 1
            slug = f"{service_key}-{city['slug']}"
            item_list.append({"@type": "ListItem", "position": pos,
                              "name": SERVICES[service_key]["h1"][lang].format(name=city["name"][lang]),
                              "url": page_url(lang, slug)})

    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "@id": f"{canon}#page", "url": canon, "name": s["hub_h1"],
         "description": s["hub_desc"], "inLanguage": lang, "isPartOf": {"@id": f"{BASE}/#website"}},
        {"@type": "ItemList", "name": s["hub_h1"], "itemListElement": item_list},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + (s["prefix"] or "/")},
            {"@type": "ListItem", "position": 2, "name": s["hub_name"], "item": canon}]},
    ]}

    return (head_common(lang, s["hub_title"], s["hub_desc"], canon, alt_urls, s["og"], s["locale"], "", "")
        + jld(graph) + "\n</head><body>\n" + nav_html(lang)
        + f'<div class="hero-s"><div class="w"><div class="tag">// LOCAL</div><h1>{html.escape(s["hub_h1"])}</h1><p>{html.escape(s["hub_intro"])}</p></div></div>'
        + '<div class="w">'
        + f'<h2>{html.escape(SERVICES["ecommerce"]["disp"][lang])}</h2><div class="grid">{cards("ecommerce")}</div>'
        + f'<h2>{html.escape(SERVICES["erp"]["disp"][lang])}</h2><div class="grid">{cards("erp")}</div>'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a></div>'
        + footer_html(lang) + "</body></html>\n")

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def main():
    n_hub = 0
    n_page = 0
    for lang in ("it", "en", "bg"):
        hub_dir = "public" + L[lang]["hub_path"]  # hub_path starts with /
        write(os.path.join(hub_dir, "index.html"), hub_page(lang))
        n_hub += 1
        for service_key in ("ecommerce", "erp"):
            for city in CITIES:
                slug = f"{service_key}-{city['slug']}"
                write(os.path.join(hub_dir, slug, "index.html"), service_city_page(service_key, city, lang))
                n_page += 1

    # sitemap-servicecity.xml (own file)
    urls = []
    for lang in ("it", "en", "bg"):
        urls.append(BASE + L[lang]["hub_path"])
    for service_key in ("ecommerce", "erp"):
        for city in CITIES:
            slug = f"{service_key}-{city['slug']}"
            for lang in ("it", "en", "bg"):
                urls.append(page_url(lang, slug))
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sm.append(f"<url><loc>{u}</loc><lastmod>{LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>")
    sm.append("</urlset>")
    write(os.path.join("public", "sitemap-servicecity.xml"), "\n".join(sm) + "\n")

    print(f"wrote {n_hub} hubs + {n_page} service-city pages ({n_hub + n_page} html) + sitemap-servicecity.xml ({len(urls)} urls)")

if __name__ == "__main__":
    main()
