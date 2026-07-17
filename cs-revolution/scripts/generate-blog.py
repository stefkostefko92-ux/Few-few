#!/usr/bin/env python3
"""Generate SEO blog articles (it/en/bg) into public/blog, public/en/blog, public/bg/blog.

Run from repo root: python3 scripts/generate-blog.py
Each post is written natively in three languages with an answer-first intro, h2
sections, a comparison/list/table where relevant, a FAQ block (FAQPage schema for
AEO), 3-4 internal links and a CTA. Self-contained static HTML, no build step.
"""
import os, html, json

BASE = "https://carbonstealth.eu"
DATE = "2026-07-16"
DATE_ISO = "2026-07-16T09:00:00+02:00"

STYLE = ("*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#ccc;font-family:'Space Mono',monospace;font-size:13px;line-height:2;padding:0}a{color:#00e5ff;text-decoration:none}.w{max-width:900px;margin:0 auto;padding:40px 20px}h1{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2.5rem;color:#f5f5f0;margin-bottom:16px;letter-spacing:-.03em;line-height:1.1}h2{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.2rem;color:#00e5ff;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.05em}h3{color:#f5f5f0;font-size:1rem;margin:20px 0 8px}p,li{margin-bottom:10px;line-height:1.9}ul{padding-left:20px}.nav{position:fixed;top:0;width:100%;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,229,255,.1);padding:12px 20px;z-index:1000;display:flex;justify-content:space-between;align-items:center}.nav a{color:#ccc;font-size:10px;letter-spacing:.2em;margin:0 10px}.nav img{height:24px}.hero-s{padding:120px 20px 60px;border-bottom:1px solid rgba(0,229,255,.1)}.tag{font-size:9px;color:#00e5ff;letter-spacing:.4em;margin-bottom:12px}.cta{display:inline-block;padding:14px 32px;border:1px solid #00e5ff;color:#00e5ff;font-size:11px;letter-spacing:.25em;margin-top:24px}.ft{border-top:1px solid rgba(245,245,240,.06);padding:30px 20px;text-align:center;font-size:9px;color:#999;margin-top:60px}.price{display:inline-block;padding:4px 12px;border:1px solid rgba(0,229,255,.2);color:#00e5ff;font-size:11px;margin:8px 0}.tags{font-size:9px;color:#999;letter-spacing:.15em;margin-top:8px}.faq-item{border-bottom:1px solid rgba(245,245,240,.06);padding:16px 0}.faq-q{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1rem;color:#f5f5f0;margin-bottom:6px}.faq-a{font-size:12px;color:#ccc}.blog-date{font-size:10px;color:#999;letter-spacing:.15em}"
         ".ctbl{overflow-x:auto;margin:16px 0}table{border-collapse:collapse;width:100%;font-size:12px;min-width:520px}th,td{border:1px solid rgba(0,229,255,.15);padding:8px 10px;text-align:left;vertical-align:top}th{color:#00e5ff;font-family:'Inter Tight',sans-serif;font-weight:700}")

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">')

# ── Per-language chrome ──────────────────────────────────────────
L = {
 "it": dict(
   prefix="", og="og/og-blog.png", locale="it_IT",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/chi-siamo/">CHI SIAMO</a><a href="/servizi/sviluppo-siti-web/">SERVIZI</a><a href="/portfolio/">PORTFOLIO</a><a href="/contatti/">CONTATTI</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Tutti i diritti riservati &middot; <a href="/privacy/">Privacy</a> &middot; <a href="/cookie/">Cookie</a> &middot; <a href="/termini/">Terms</a></p></div>',
   home="/", blog="/blog/", contact="/contatti/", contact_name="Blog",
   date_label="16 Luglio 2026", read="min di lettura", faq_h2="Domande frequenti",
   cta="RICHIEDI UN PREVENTIVO GRATUITO"),
 "en": dict(
   prefix="/en", og="og/og-blog-en.png", locale="en_US",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/en/about/">ABOUT</a><a href="/en/services/web-development/">SERVICES</a><a href="/en/portfolio/">PORTFOLIO</a><a href="/en/contact/">CONTACT</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>All rights reserved &middot; <a href="/en/privacy/">Privacy</a> &middot; <a href="/en/cookie/">Cookie</a> &middot; <a href="/en/terms/">Terms</a></p></div>',
   home="/en/", blog="/en/blog/", contact="/en/contact/", contact_name="Blog",
   date_label="July 16, 2026", read="min read", faq_h2="Frequently asked questions",
   cta="REQUEST A FREE QUOTE"),
 "bg": dict(
   prefix="/bg", og="og/og-blog-bg.png", locale="bg_BG",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">ГЛАВНА</a><a href="/bg/za-nas/">ЗА НАС</a><a href="/bg/uslugi/web-razrabotka/">УСЛУГИ</a><a href="/bg/portfolio/">ПОРТФОЛИО</a><a href="/bg/kontakti/">КОНТАКТИ</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Всички права запазени &middot; <a href="/bg/privacy/">Privacy</a> &middot; <a href="/bg/cookie/">Cookie</a> &middot; <a href="/bg/usloviya/">Terms</a></p></div>',
   home="/bg/", blog="/bg/blog/", contact="/bg/kontakti/", contact_name="Блог",
   date_label="16 Юли 2026", read="мин четене", faq_h2="Често задавани въпроси",
   cta="ЗАЯВИ БЕЗПЛАТНА ОФЕРТА"),
}

# ── Content ──────────────────────────────────────────────────────
# Each post: slug, section, read (minutes), and per-lang {title, desc, body, faqs}
# body = the inner HTML that goes inside <div class="w"> after the date line and
#        before the FAQ block. It contains the intro, h2 sections, lists/tables
#        and inline internal links.

POSTS = [

# 1 ─────────────────────────────────────────────────────────────
dict(slug="quanto-costa-sito-web", section="Web Development", read=7, lang=dict(
 it=dict(
  title="Quanto Costa un Sito Web nel 2026? Prezzi Reali | Carbon Stealth",
  desc="Quanto costa davvero un sito web nel 2026? Prezzi reali per sito vetrina, e-commerce e portali su misura, cosa incide sul preventivo e come evitare sorprese.",
  body="""<p>Nel 2026 un sito web professionale costa da <strong>&euro;800</strong> per un sito vetrina, da <strong>&euro;1.200</strong> per un e-commerce e da <strong>&euro;2.000</strong> per un portale su misura. Il prezzo dipende dal numero di pagine, dalle funzionalit&agrave; richieste e da quanto lavoro grafico e di contenuti serve. Un template preconfezionato costa meno ma rende meno; un progetto costruito su misura costa di pi&ugrave; all'inizio e ripaga nel tempo con prestazioni e posizionamento migliori.</p>
<h2>Prezzi per tipologia di sito</h2>
<div class="ctbl"><table><thead><tr><th>Tipo di sito</th><th>Prezzo indicativo</th><th>Tempi</th><th>Per chi</th></tr></thead><tbody>
<tr><td>Landing page singola</td><td>da &euro;500</td><td>3-7 giorni</td><td>Campagne, lancio prodotto</td></tr>
<tr><td>Sito vetrina (5-8 pagine)</td><td>da &euro;800</td><td>1-2 settimane</td><td>Aziende, professionisti, studi</td></tr>
<tr><td>E-commerce</td><td>da &euro;1.200</td><td>3-6 settimane</td><td>Chi vende online</td></tr>
<tr><td>Portale / software web</td><td>da &euro;2.000</td><td>2-4 mesi</td><td>Gestionali, aree riservate, B2B</td></tr>
</tbody></table></div>
<h2>Cosa incide davvero sul prezzo</h2>
<p>Il numero di pagine &egrave; solo il punto di partenza. A far salire o scendere un preventivo contribuiscono soprattutto:</p>
<ul>
<li><strong>Design su misura o template:</strong> un design originale richiede pi&ugrave; ore ma d&agrave; un'identit&agrave; unica.</li>
<li><strong>Contenuti:</strong> se testi, foto e traduzioni li fornisci tu il costo scende; se li produciamo noi sale.</li>
<li><strong>Funzionalit&agrave;:</strong> form avanzati, prenotazioni, pagamenti, multilingua e integrazioni con gestionali esterni.</li>
<li><strong>SEO e prestazioni:</strong> un sito ottimizzato per Google e per i motori AI richiede lavoro tecnico in pi&ugrave;.</li>
</ul>
<p>Diffida dei prezzi troppo bassi: spesso nascondono template riciclati, canoni mensili obbligatori o l'assenza totale di ottimizzazione. Noi lavoriamo con codice pulito e ti consegniamo un sito che &egrave; tuo, senza vincoli. Scopri come funziona il nostro <a href="/servizi/sviluppo-siti-web/">servizio di sviluppo siti web</a>.</p>
<h2>Costi ricorrenti da mettere in conto</h2>
<p>Oltre alla realizzazione, un sito ha piccole spese fisse: il dominio (circa &euro;10-15 l'anno), l'<a href="/servizi/hosting/">hosting cloud</a> (da &euro;29/mese) e, se vuoi crescere sui motori di ricerca, un'attivit&agrave; di <a href="/servizi/seo/">SEO continuativa</a> (da &euro;500/mese). Se invece devi vendere online, valuta prima se ti serve davvero un negozio: ne parliamo nella guida <a href="/blog/sito-vetrina-o-ecommerce/">sito vetrina o e-commerce</a>.</p>""",
  faqs=[
   ("Quanto costa un sito web semplice?", "Un sito vetrina professionale parte da &euro;800 e include 5-8 pagine, design responsive, ottimizzazione SEO di base e modulo contatti. Una singola landing page parte da &euro;500."),
   ("Perche i prezzi dei siti web variano cosi tanto?", "Perche cambiano il design (template o su misura), i contenuti (forniti o prodotti da noi), le funzionalita e il livello di ottimizzazione. Due siti con lo stesso numero di pagine possono costare il doppio l'uno dell'altro a seconda di questi fattori."),
   ("Ci sono costi mensili dopo la consegna?", "Il sito e tuo, senza canoni obbligatori. Restano solo dominio (circa &euro;10-15/anno) e hosting (da &euro;29/mese). SEO e manutenzione evolutiva sono opzionali."),
   ("Quanto tempo serve per avere il sito online?", "Un sito vetrina richiede 1-2 settimane, un e-commerce 3-6 settimane. Concordiamo una data precisa nel preventivo, gratuito e senza impegno entro 24 ore."),
  ]),
 en=dict(
  title="How Much Does a Website Cost in 2026? Real Prices | Carbon Stealth",
  desc="How much does a website really cost in 2026? Real prices for brochure sites, e-commerce and custom portals, what drives the quote and how to avoid surprises.",
  body="""<p>In 2026 a professional website costs from <strong>&euro;800</strong> for a brochure site, from <strong>&euro;1,200</strong> for an e-commerce store and from <strong>&euro;2,000</strong> for a custom portal. The price depends on the number of pages, the features you need and how much design and content work is involved. An off-the-shelf template is cheaper but performs worse; a custom-built project costs more upfront and pays off over time through better performance and rankings.</p>
<h2>Prices by type of website</h2>
<div class="ctbl"><table><thead><tr><th>Type of site</th><th>Typical price</th><th>Timeline</th><th>Best for</th></tr></thead><tbody>
<tr><td>Single landing page</td><td>from &euro;500</td><td>3-7 days</td><td>Campaigns, product launches</td></tr>
<tr><td>Brochure site (5-8 pages)</td><td>from &euro;800</td><td>1-2 weeks</td><td>Companies, professionals, firms</td></tr>
<tr><td>E-commerce</td><td>from &euro;1,200</td><td>3-6 weeks</td><td>Selling online</td></tr>
<tr><td>Portal / web software</td><td>from &euro;2,000</td><td>2-4 months</td><td>Dashboards, member areas, B2B</td></tr>
</tbody></table></div>
<h2>What really drives the price</h2>
<p>Page count is only the starting point. What moves a quote up or down is mainly:</p>
<ul>
<li><strong>Custom design vs template:</strong> an original design takes more hours but gives you a unique identity.</li>
<li><strong>Content:</strong> if you supply text, photos and translations the cost drops; if we produce them it rises.</li>
<li><strong>Features:</strong> advanced forms, bookings, payments, multilingual support and integrations with external systems.</li>
<li><strong>SEO and performance:</strong> a site tuned for Google and AI engines needs extra technical work.</li>
</ul>
<p>Be wary of prices that look too low: they often hide recycled templates, mandatory monthly fees or a complete lack of optimization. We work with clean code and hand you a site that is truly yours, with no lock-in. See how our <a href="/en/services/web-development/">web development service</a> works.</p>
<h2>Recurring costs to plan for</h2>
<p>Beyond the build, a website has small fixed costs: the domain (around &euro;10-15/year), <a href="/en/services/hosting/">cloud hosting</a> (from &euro;29/month) and, if you want to grow in search, ongoing <a href="/en/services/seo/">SEO work</a> (from &euro;500/month). If you plan to sell online, first decide whether you actually need a store: we cover that in our guide on <a href="/en/blog/sito-vetrina-o-ecommerce/">brochure site vs e-commerce</a>.</p>""",
  faqs=[
   ("How much does a simple website cost?", "A professional brochure site starts at &euro;800 and includes 5-8 pages, responsive design, basic SEO and a contact form. A single landing page starts at &euro;500."),
   ("Why do website prices vary so much?", "Because design (template vs custom), content (supplied or produced by us), features and the level of optimization all differ. Two sites with the same page count can cost twice as much as each other depending on these factors."),
   ("Are there monthly costs after delivery?", "The site is yours, with no mandatory fees. Only the domain (around &euro;10-15/year) and hosting (from &euro;29/month) remain. SEO and ongoing maintenance are optional."),
   ("How long does it take to get the site online?", "A brochure site takes 1-2 weeks, an e-commerce 3-6 weeks. We agree on a precise date in the quote, which is free and no-obligation within 24 hours."),
  ]),
 bg=dict(
  title="Колко Струва Изработката на Сайт през 2026? | Carbon Stealth",
  desc="Колко струва изработката на сайт през 2026? Реални цени за визитен сайт, онлайн магазин и портал по поръчка, какво влияе на офертата и как да избегнете изненади.",
  body="""<p>През 2026 професионален сайт струва от <strong>&euro;800</strong> за визитен сайт, от <strong>&euro;1200</strong> за онлайн магазин и от <strong>&euro;2000</strong> за портал по поръчка. Цената зависи от броя страници, нужните функционалности и колко работа по дизайна и съдържанието е необходима. Готовият шаблон е по-евтин, но носи по-малко резултати; проектът по поръчка струва повече в началото и се изплаща с времето чрез по-добра производителност и позиции в Google.</p>
<h2>Цени по тип сайт</h2>
<div class="ctbl"><table><thead><tr><th>Тип сайт</th><th>Ориентировъчна цена</th><th>Срок</th><th>За кого</th></tr></thead><tbody>
<tr><td>Единична landing страница</td><td>от &euro;500</td><td>3-7 дни</td><td>Кампании, старт на продукт</td></tr>
<tr><td>Визитен сайт (5-8 страници)</td><td>от &euro;800</td><td>1-2 седмици</td><td>Фирми, специалисти, кантори</td></tr>
<tr><td>Онлайн магазин</td><td>от &euro;1200</td><td>3-6 седмици</td><td>Продажби онлайн</td></tr>
<tr><td>Портал / уеб софтуер</td><td>от &euro;2000</td><td>2-4 месеца</td><td>Табла, клиентски зони, B2B</td></tr>
</tbody></table></div>
<h2>Какво реално определя цената</h2>
<p>Броят страници е само началото. Офертата се движи нагоре или надолу главно от:</p>
<ul>
<li><strong>Дизайн по поръчка или шаблон:</strong> оригиналният дизайн отнема повече часове, но дава уникална идентичност.</li>
<li><strong>Съдържание:</strong> ако предоставите текстове, снимки и преводи, цената пада; ако ги правим ние, се повишава.</li>
<li><strong>Функционалности:</strong> сложни форми, резервации, плащания, многоезичност и интеграции с външни системи.</li>
<li><strong>SEO и производителност:</strong> сайт, оптимизиран за Google и за AI търсачки, изисква допълнителна техническа работа.</li>
</ul>
<p>Внимавайте с прекалено ниските цени: често крият рециклирани шаблони, задължителни месечни такси или пълна липса на оптимизация. Ние работим с чист код и предаваме сайт, който е изцяло ваш, без обвързване. Вижте как работи нашата <a href="/bg/uslugi/web-razrabotka/">услуга за изработка на сайтове</a>.</p>
<h2>Повтарящи се разходи, които да предвидите</h2>
<p>Освен изработката, всеки сайт има малки фиксирани разходи: домейн (около &euro;10-15 годишно), <a href="/bg/uslugi/hosting/">облачен хостинг</a> (от &euro;29/месец) и, ако искате растеж в търсачките, постоянно <a href="/bg/uslugi/seo/">SEO</a> (от &euro;500/месец). Ако ще продавате онлайн, първо преценете дали наистина ви трябва магазин: разглеждаме това в статията <a href="/bg/blog/sito-vetrina-o-ecommerce/">визитен сайт или онлайн магазин</a>.</p>""",
  faqs=[
   ("Колко струва прост сайт?", "Професионален визитен сайт започва от &euro;800 и включва 5-8 страници, responsive дизайн, базово SEO и форма за контакт. Единична landing страница започва от &euro;500."),
   ("Защо цените на сайтовете се различават толкова?", "Защото се различават дизайнът (шаблон или по поръчка), съдържанието (ваше или изработено от нас), функционалностите и нивото на оптимизация. Два сайта с еднакъв брой страници могат да струват двойно един спрямо друг заради тези фактори."),
   ("Има ли месечни разходи след предаването?", "Сайтът е ваш, без задължителни такси. Остават само домейн (около &euro;10-15/година) и хостинг (от &euro;29/месец). SEO и поддръжката са по избор."),
   ("За колко време сайтът е онлайн?", "Визитен сайт отнема 1-2 седмици, онлайн магазин 3-6 седмици. Договаряме точна дата в офертата — безплатна и без ангажимент до 24 часа."),
  ]),
)),

# 2 ─────────────────────────────────────────────────────────────
dict(slug="quanto-costa-ecommerce", section="E-commerce", read=7, lang=dict(
 it=dict(
  title="Quanto Costa un E-commerce? Guida ai Prezzi 2026 | Carbon Stealth",
  desc="Quanto costa aprire un e-commerce nel 2026? Prezzi reali, costi nascosti, differenza tra piattaforme e cosa serve davvero per vendere online.",
  body="""<p>Un e-commerce professionale parte da <strong>&euro;1.200</strong> per un negozio con catalogo, carrello e pagamenti online. Il costo cresce con il numero di prodotti, le integrazioni (corrieri, gestionale, fatturazione) e il livello di personalizzazione del design. A questo si aggiungono costi ricorrenti spesso sottovalutati: hosting, commissioni di pagamento e marketing.</p>
<h2>Quanto costa aprire un negozio online</h2>
<div class="ctbl"><table><thead><tr><th>Soluzione</th><th>Costo iniziale</th><th>Adatta a</th></tr></thead><tbody>
<tr><td>E-commerce base (WooCommerce)</td><td>da &euro;1.200</td><td>Fino a ~100 prodotti, chi parte</td></tr>
<tr><td>E-commerce su misura</td><td>da &euro;3.000</td><td>Cataloghi ampi, integrazioni, B2B</td></tr>
<tr><td>Piattaforma in abbonamento (Shopify)</td><td>da &euro;30/mese + setup</td><td>Chi vuole zero manutenzione tecnica</td></tr>
</tbody></table></div>
<p>La scelta della piattaforma cambia molto la struttura dei costi: ne parliamo in dettaglio nella guida <a href="/blog/woocommerce-vs-shopify/">WooCommerce vs Shopify</a>.</p>
<h2>I costi ricorrenti che tutti dimenticano</h2>
<ul>
<li><strong>Commissioni di pagamento:</strong> Stripe e PayPal trattengono circa l'1,5-3% per transazione.</li>
<li><strong>Hosting e dominio:</strong> da &euro;29/mese per un negozio veloce e sicuro.</li>
<li><strong>Marketing:</strong> un negozio senza traffico non vende. Metti in conto SEO o campagne pubblicitarie.</li>
<li><strong>Manutenzione:</strong> aggiornamenti, backup e sicurezza, soprattutto su WooCommerce.</li>
</ul>
<h2>Dove conviene investire</h2>
<p>Il budget rende di pi&ugrave; se investito su tre fronti: schede prodotto curate (foto e descrizioni che vendono), una procedura di checkout semplice e veloce, e la <a href="/servizi/seo/">visibilit&agrave; sui motori di ricerca</a>. Un e-commerce lento perde vendite: per questo cura le prestazioni fin dall'inizio, come spieghiamo nella guida ai <a href="/blog/core-web-vitals-guida/">Core Web Vitals</a>. Se vuoi capire l'investimento sul tuo caso, guarda il nostro <a href="/servizi/ecommerce/">servizio e-commerce</a> e chiedi un preventivo.</p>""",
  faqs=[
   ("Quanto costa aprire un e-commerce da zero?", "Un e-commerce professionale parte da &euro;1.200 con WooCommerce. Per cataloghi ampi, integrazioni con il gestionale o funzioni B2B, un progetto su misura parte da &euro;3.000."),
   ("Quali sono i costi mensili di un e-commerce?", "Hosting da &euro;29/mese, commissioni di pagamento dell'1,5-3% per transazione, eventuale abbonamento alla piattaforma e budget di marketing. Il dominio costa circa &euro;10-15 l'anno."),
   ("Meglio WooCommerce o Shopify per iniziare?", "Dipende. WooCommerce da piu controllo e nessun canone di piattaforma ma richiede manutenzione; Shopify e piu semplice ma ha un abbonamento e commissioni. Ne parliamo nella nostra guida dedicata."),
   ("In quanto tempo si realizza un e-commerce?", "Un negozio standard richiede 3-6 settimane, un progetto su misura anche 2-3 mesi. Dipende dal numero di prodotti e dalle integrazioni necessarie."),
  ]),
 en=dict(
  title="How Much Does an E-commerce Cost? 2026 Price Guide | Carbon Stealth",
  desc="How much does it cost to build an e-commerce in 2026? Real prices, hidden costs, platform differences and what you actually need to start selling online.",
  body="""<p>A professional e-commerce store starts at <strong>&euro;1,200</strong> for a shop with a catalog, cart and online payments. The cost grows with the number of products, integrations (couriers, ERP, invoicing) and how custom the design is. On top of that come recurring costs that are often underestimated: hosting, payment fees and marketing.</p>
<h2>What it costs to open an online store</h2>
<div class="ctbl"><table><thead><tr><th>Solution</th><th>Upfront cost</th><th>Best for</th></tr></thead><tbody>
<tr><td>Basic e-commerce (WooCommerce)</td><td>from &euro;1,200</td><td>Up to ~100 products, getting started</td></tr>
<tr><td>Custom e-commerce</td><td>from &euro;3,000</td><td>Large catalogs, integrations, B2B</td></tr>
<tr><td>Subscription platform (Shopify)</td><td>from &euro;30/mo + setup</td><td>Zero technical maintenance</td></tr>
</tbody></table></div>
<p>The platform you pick heavily shapes your cost structure &mdash; we break it down in our <a href="/en/blog/woocommerce-vs-shopify/">WooCommerce vs Shopify</a> guide.</p>
<h2>The recurring costs everyone forgets</h2>
<ul>
<li><strong>Payment fees:</strong> Stripe and PayPal keep roughly 1.5-3% per transaction.</li>
<li><strong>Hosting and domain:</strong> from &euro;29/month for a fast, secure store.</li>
<li><strong>Marketing:</strong> a store with no traffic makes no sales. Budget for SEO or paid ads.</li>
<li><strong>Maintenance:</strong> updates, backups and security, especially on WooCommerce.</li>
</ul>
<h2>Where the budget pays off</h2>
<p>Your budget goes furthest on three fronts: well-crafted product pages (photos and copy that sell), a simple, fast checkout, and <a href="/en/services/seo/">search visibility</a>. A slow store loses sales, so get performance right from the start &mdash; see our <a href="/en/blog/core-web-vitals-guida/">Core Web Vitals</a> guide. To understand the investment for your case, look at our <a href="/en/services/ecommerce/">e-commerce service</a> and request a quote.</p>""",
  faqs=[
   ("How much does it cost to build an e-commerce from scratch?", "A professional e-commerce starts at &euro;1,200 with WooCommerce. For large catalogs, ERP integrations or B2B features, a custom project starts at &euro;3,000."),
   ("What are the monthly costs of an e-commerce?", "Hosting from &euro;29/month, payment fees of 1.5-3% per transaction, any platform subscription and a marketing budget. The domain costs around &euro;10-15 per year."),
   ("WooCommerce or Shopify to start?", "It depends. WooCommerce gives more control and no platform fee but needs maintenance; Shopify is simpler but has a subscription and fees. We compare them in our dedicated guide."),
   ("How long does it take to build an e-commerce?", "A standard store takes 3-6 weeks, a custom project up to 2-3 months, depending on the number of products and the integrations required."),
  ]),
 bg=dict(
  title="Колко Струва Онлайн Магазин? Ценово Ръководство 2026 | Carbon Stealth",
  desc="Колко струва изработката на онлайн магазин през 2026? Реални цени, скрити разходи, разлика между платформите и какво наистина е нужно за продажби онлайн.",
  body="""<p>Професионален онлайн магазин започва от <strong>&euro;1200</strong> за магазин с каталог, количка и онлайн плащания. Цената нараства с броя продукти, интеграциите (куриери, ERP, фактуриране) и степента на персонализация на дизайна. Към това се добавят повтарящи се разходи, които често се подценяват: хостинг, такси за плащания и маркетинг.</p>
<h2>Колко струва да отворите онлайн магазин</h2>
<div class="ctbl"><table><thead><tr><th>Решение</th><th>Начален разход</th><th>Подходящо за</th></tr></thead><tbody>
<tr><td>Базов магазин (WooCommerce)</td><td>от &euro;1200</td><td>До ~100 продукта, за начало</td></tr>
<tr><td>Магазин по поръчка</td><td>от &euro;3000</td><td>Голям каталог, интеграции, B2B</td></tr>
<tr><td>Абонаментна платформа (Shopify)</td><td>от &euro;30/мес + setup</td><td>Нула техническа поддръжка</td></tr>
</tbody></table></div>
<p>Изборът на платформа силно влияе на структурата на разходите &mdash; разглеждаме го подробно в статията <a href="/bg/blog/woocommerce-vs-shopify/">WooCommerce срещу Shopify</a>.</p>
<h2>Повтарящите се разходи, които всички забравят</h2>
<ul>
<li><strong>Такси за плащания:</strong> Stripe и PayPal удържат около 1.5-3% на транзакция.</li>
<li><strong>Хостинг и домейн:</strong> от &euro;29/месец за бърз и сигурен магазин.</li>
<li><strong>Маркетинг:</strong> магазин без трафик не продава. Предвидете SEO или реклами.</li>
<li><strong>Поддръжка:</strong> обновления, резервни копия и сигурност, особено при WooCommerce.</li>
</ul>
<h2>Къде си струва да инвестирате</h2>
<p>Бюджетът дава най-много на три фронта: добре направени продуктови страници (снимки и текст, които продават), проста и бърза поръчка (checkout) и <a href="/bg/uslugi/seo/">видимост в търсачките</a>. Бавният магазин губи продажби, затова погрижете се за производителността от самото начало &mdash; вижте ръководството за <a href="/bg/blog/core-web-vitals-guida/">Core Web Vitals</a>. За да разберете инвестицията за вашия случай, вижте нашата <a href="/bg/uslugi/ecommerce/">услуга за онлайн магазини</a> и заявете оферта.</p>""",
  faqs=[
   ("Колко струва онлайн магазин от нулата?", "Професионален онлайн магазин започва от &euro;1200 с WooCommerce. За голям каталог, интеграция с ERP или B2B функции, проект по поръчка започва от &euro;3000."),
   ("Какви са месечните разходи на онлайн магазин?", "Хостинг от &euro;29/месец, такси за плащания 1.5-3% на транзакция, евентуален абонамент за платформа и бюджет за маркетинг. Домейнът струва около &euro;10-15 годишно."),
   ("WooCommerce или Shopify за старт?", "Зависи. WooCommerce дава повече контрол и без такса за платформа, но изисква поддръжка; Shopify е по-лесен, но има абонамент и такси. Сравняваме ги в отделно ръководство."),
   ("За колко време се прави онлайн магазин?", "Стандартен магазин отнема 3-6 седмици, проект по поръчка до 2-3 месеца, в зависимост от броя продукти и нужните интеграции."),
  ]),
)),

# 3 ─────────────────────────────────────────────────────────────
dict(slug="woocommerce-vs-shopify", section="E-commerce", read=8, lang=dict(
 it=dict(
  title="WooCommerce vs Shopify: Quale Scegliere nel 2026 | Carbon Stealth",
  desc="WooCommerce o Shopify? Confronto onesto tra le due piattaforme e-commerce nel 2026: costi, controllo, manutenzione, SEO e quando conviene l'una o l'altra.",
  body="""<p>In breve: <strong>Shopify</strong> conviene se vuoi partire in fretta senza pensare alla parte tecnica e sei disposto a pagare un canone mensile pi&ugrave; le commissioni. <strong>WooCommerce</strong> conviene se vuoi il pieno controllo, nessun vincolo di piattaforma e costi ricorrenti pi&ugrave; bassi, accettando in cambio un po' di manutenzione. Non esiste una scelta &laquo;migliore&raquo; in assoluto: dipende dal tuo modello di business.</p>
<h2>Confronto diretto</h2>
<div class="ctbl"><table><thead><tr><th>Criterio</th><th>WooCommerce</th><th>Shopify</th></tr></thead><tbody>
<tr><td>Costo mensile</td><td>Solo hosting (da &euro;29)</td><td>Da ~&euro;30 + app a pagamento</td></tr>
<tr><td>Commissioni</td><td>Solo quelle del gateway</td><td>Gateway + fee Shopify se non usi Shopify Payments</td></tr>
<tr><td>Controllo e propriet&agrave;</td><td>Totale, codice tuo</td><td>Limitato dalla piattaforma</td></tr>
<tr><td>Manutenzione</td><td>A tuo carico (o del partner)</td><td>Gestita da Shopify</td></tr>
<tr><td>Personalizzazione</td><td>Illimitata (open source)</td><td>Vincolata a temi e app</td></tr>
<tr><td>SEO</td><td>Controllo totale su URL e struttura</td><td>Buona ma con alcuni limiti</td></tr>
</tbody></table></div>
<h2>Quando scegliere WooCommerce</h2>
<p>WooCommerce &egrave; un plugin open source per WordPress: paghi solo l'hosting e hai libert&agrave; assoluta su design, funzioni e SEO. &Egrave; la scelta giusta se hai un catalogo particolare, se vuoi integrazioni su misura con un gestionale o un <a href="/servizi/erp/">ERP</a>, o se non vuoi legarti a un canone crescente. In cambio, qualcuno deve occuparsi di aggiornamenti, backup e sicurezza.</p>
<h2>Quando scegliere Shopify</h2>
<p>Shopify &egrave; una piattaforma &laquo;chiavi in mano&raquo;: hosting, sicurezza e aggiornamenti sono inclusi nel canone. &Egrave; ideale per chi vuole vendere subito senza gestire la parte tecnica e ha esigenze standard. Lo svantaggio &egrave; il costo che cresce con app e commissioni, e la minore libert&agrave; di personalizzazione.</p>
<p>Qualunque piattaforma tu scelga, il risultato dipende da come viene realizzato il negozio. Noi lavoriamo su entrambe: scopri il nostro <a href="/servizi/ecommerce/">servizio e-commerce</a>, leggi <a href="/blog/quanto-costa-ecommerce/">quanto costa un e-commerce</a> oppure <a href="/contatti/">scrivici</a> per un consiglio sul tuo caso.</p>""",
  faqs=[
   ("Meglio WooCommerce o Shopify nel 2026?", "WooCommerce se vuoi controllo totale, costi ricorrenti bassi e personalizzazione illimitata; Shopify se preferisci una soluzione gestita senza pensieri tecnici. La scelta dipende dal tuo modello di business, non da quale sia 'migliore'."),
   ("Shopify costa piu di WooCommerce?", "Di solito si, sul lungo periodo. Shopify ha un canone mensile piu app a pagamento ed eventuali fee sulle transazioni. WooCommerce ha solo il costo dell'hosting, ma richiede manutenzione che ha comunque un valore."),
   ("Posso passare da Shopify a WooCommerce?", "Si, la migrazione e possibile: si esportano prodotti, clienti e ordini e si ricostruisce il negozio su WooCommerce. Va pianificata con attenzione per non perdere posizionamento SEO."),
   ("Quale piattaforma e migliore per la SEO?", "Entrambe possono posizionarsi bene. WooCommerce offre controllo totale su URL, struttura e dati strutturati; Shopify e solido ma con qualche limite tecnico. Conta soprattutto come e ottimizzato il negozio."),
  ]),
 en=dict(
  title="WooCommerce vs Shopify: Which to Choose in 2026 | Carbon Stealth",
  desc="WooCommerce or Shopify? An honest comparison of the two e-commerce platforms in 2026: costs, control, maintenance, SEO and when each one makes sense.",
  body="""<p>In short: <strong>Shopify</strong> makes sense if you want to launch fast without touching the technical side and you accept a monthly fee plus transaction fees. <strong>WooCommerce</strong> makes sense if you want full control, no platform lock-in and lower recurring costs, in exchange for some maintenance. There is no absolute &laquo;best&raquo; choice &mdash; it depends on your business model.</p>
<h2>Head-to-head comparison</h2>
<div class="ctbl"><table><thead><tr><th>Criterion</th><th>WooCommerce</th><th>Shopify</th></tr></thead><tbody>
<tr><td>Monthly cost</td><td>Hosting only (from &euro;29)</td><td>From ~&euro;30 + paid apps</td></tr>
<tr><td>Fees</td><td>Only your gateway's</td><td>Gateway + Shopify fee unless using Shopify Payments</td></tr>
<tr><td>Control and ownership</td><td>Total, your code</td><td>Limited by the platform</td></tr>
<tr><td>Maintenance</td><td>On you (or your partner)</td><td>Handled by Shopify</td></tr>
<tr><td>Customization</td><td>Unlimited (open source)</td><td>Bound to themes and apps</td></tr>
<tr><td>SEO</td><td>Full control over URLs and structure</td><td>Good but with some limits</td></tr>
</tbody></table></div>
<h2>When to choose WooCommerce</h2>
<p>WooCommerce is an open-source plugin for WordPress: you pay only for hosting and get full freedom over design, features and SEO. It is the right call if you have an unusual catalog, want custom integrations with a management system or an <a href="/en/services/erp/">ERP</a>, or don't want to be tied to a growing subscription. In return, someone has to handle updates, backups and security.</p>
<h2>When to choose Shopify</h2>
<p>Shopify is a turnkey platform: hosting, security and updates are included in the fee. It is ideal if you want to start selling immediately without managing the technical side and have standard requirements. The downside is a cost that grows with apps and fees, and less freedom to customize.</p>
<p>Whichever platform you pick, the result depends on how the store is built. We work with both: see our <a href="/en/services/ecommerce/">e-commerce service</a>, read <a href="/en/blog/quanto-costa-ecommerce/">how much an e-commerce costs</a>, or <a href="/en/contact/">get in touch</a> for advice on your case.</p>""",
  faqs=[
   ("WooCommerce or Shopify in 2026?", "WooCommerce if you want full control, low recurring costs and unlimited customization; Shopify if you prefer a managed solution with no technical worries. The choice depends on your business model, not on which is objectively 'best'."),
   ("Does Shopify cost more than WooCommerce?", "Usually yes, over the long run. Shopify has a monthly fee plus paid apps and possible transaction fees. WooCommerce has only hosting costs, but needs maintenance that also has a value."),
   ("Can I move from Shopify to WooCommerce?", "Yes, migration is possible: you export products, customers and orders and rebuild the store on WooCommerce. It must be planned carefully to avoid losing SEO rankings."),
   ("Which platform is better for SEO?", "Both can rank well. WooCommerce gives full control over URLs, structure and structured data; Shopify is solid but has a few technical limits. What matters most is how the store is optimized."),
  ]),
 bg=dict(
  title="WooCommerce срещу Shopify: Кое да Изберете през 2026 | Carbon Stealth",
  desc="WooCommerce или Shopify? Честно сравнение на двете платформи за онлайн магазини през 2026: разходи, контрол, поддръжка, SEO и кога коя е по-подходяща.",
  body="""<p>Накратко: <strong>Shopify</strong> е подходящ, ако искате да стартирате бързо без техническа грижа и приемате месечен абонамент плюс такси. <strong>WooCommerce</strong> е подходящ, ако искате пълен контрол, без обвързване с платформа и по-ниски повтарящи се разходи, срещу малко поддръжка. Няма абсолютно &laquo;най-добро&raquo; решение &mdash; зависи от вашия бизнес модел.</p>
<h2>Директно сравнение</h2>
<div class="ctbl"><table><thead><tr><th>Критерий</th><th>WooCommerce</th><th>Shopify</th></tr></thead><tbody>
<tr><td>Месечен разход</td><td>Само хостинг (от &euro;29)</td><td>От ~&euro;30 + платени приложения</td></tr>
<tr><td>Такси</td><td>Само на платежния оператор</td><td>Оператор + такса Shopify, ако не ползвате Shopify Payments</td></tr>
<tr><td>Контрол и собственост</td><td>Пълен, кодът е ваш</td><td>Ограничен от платформата</td></tr>
<tr><td>Поддръжка</td><td>За ваша сметка (или на партньора)</td><td>Поема се от Shopify</td></tr>
<tr><td>Персонализация</td><td>Неограничена (open source)</td><td>Обвързана с теми и приложения</td></tr>
<tr><td>SEO</td><td>Пълен контрол над URL и структура</td><td>Добро, но с известни ограничения</td></tr>
</tbody></table></div>
<h2>Кога да изберете WooCommerce</h2>
<p>WooCommerce е open-source плъгин за WordPress: плащате само хостинг и имате пълна свобода над дизайн, функции и SEO. Това е правилният избор, ако имате специфичен каталог, искате интеграции по поръчка със складова система или <a href="/bg/uslugi/erp/">ERP</a>, или не искате да сте обвързани с растящ абонамент. В замяна някой трябва да поеме обновленията, резервните копия и сигурността.</p>
<h2>Кога да изберете Shopify</h2>
<p>Shopify е решение &laquo;до ключ&raquo;: хостинг, сигурност и обновления са включени в таксата. Идеален е, ако искате да продавате веднага, без да управлявате техническата част, и имате стандартни изисквания. Недостатъкът е разход, който расте с приложенията и таксите, и по-малка свобода за персонализация.</p>
<p>Която и платформа да изберете, резултатът зависи от това как е изработен магазинът. Ние работим и с двете: вижте нашата <a href="/bg/uslugi/ecommerce/">услуга за онлайн магазини</a>, прочетете <a href="/bg/blog/quanto-costa-ecommerce/">колко струва онлайн магазин</a> или <a href="/bg/kontakti/">ни пишете</a> за съвет по вашия случай.</p>""",
  faqs=[
   ("WooCommerce или Shopify през 2026?", "WooCommerce, ако искате пълен контрол, ниски повтарящи се разходи и неограничена персонализация; Shopify, ако предпочитате управлявано решение без технически грижи. Изборът зависи от вашия бизнес модел, а не от това кое е обективно 'по-добро'."),
   ("Shopify по-скъп ли е от WooCommerce?", "Обикновено да, в дългосрочен план. Shopify има месечна такса плюс платени приложения и възможни такси на транзакция. WooCommerce има само разход за хостинг, но изисква поддръжка, която също струва."),
   ("Мога ли да мигрирам от Shopify към WooCommerce?", "Да, миграцията е възможна: изнасят се продукти, клиенти и поръчки и магазинът се изгражда наново на WooCommerce. Планира се внимателно, за да не се загубят SEO позиции."),
   ("Коя платформа е по-добра за SEO?", "И двете могат да се класират добре. WooCommerce дава пълен контрол над URL, структурата и структурираните данни; Shopify е стабилен, но с няколко технически ограничения. Най-важно е как е оптимизиран магазинът."),
  ]),
)),

# 4 ─────────────────────────────────────────────────────────────
dict(slug="sito-vetrina-o-ecommerce", section="Web Development", read=6, lang=dict(
 it=dict(
  title="Sito Vetrina o E-commerce? Come Scegliere nel 2026 | Carbon Stealth",
  desc="Sito vetrina o e-commerce? Guida pratica per capire quale sito serve alla tua attivita, con differenze di costi, obiettivi e funzionalita.",
  body="""<p>La regola &egrave; semplice: se vendi prodotti direttamente online ti serve un <strong>e-commerce</strong>; se vuoi presentare la tua attivit&agrave; e ricevere contatti o richieste di preventivo, basta un <strong>sito vetrina</strong>. Molte aziende spendono di pi&ugrave; del necessario aprendo un negozio quando in realt&agrave; il loro obiettivo &egrave; generare telefonate, prenotazioni o richieste, non transazioni.</p>
<h2>Le differenze in sintesi</h2>
<div class="ctbl"><table><thead><tr><th></th><th>Sito vetrina</th><th>E-commerce</th></tr></thead><tbody>
<tr><td>Obiettivo</td><td>Farti conoscere, generare contatti</td><td>Vendere prodotti online</td></tr>
<tr><td>Prezzo</td><td>da &euro;800</td><td>da &euro;1.200</td></tr>
<tr><td>Gestione</td><td>Minima</td><td>Continua (ordini, magazzino, spedizioni)</td></tr>
<tr><td>Pagamenti</td><td>No</td><td>Si (Stripe, PayPal, carte)</td></tr>
<tr><td>Ideale per</td><td>Studi, ristoranti, artigiani, B2B</td><td>Negozi, brand, produttori</td></tr>
</tbody></table></div>
<h2>Quando basta un sito vetrina</h2>
<p>Un <a href="/servizi/sviluppo-siti-web/">sito vetrina</a> &egrave; perfetto per professionisti, ristoranti, studi medici, artigiani e aziende B2B che vendono su preventivo. Presenta servizi, portfolio e contatti, si posiziona su Google per le ricerche locali e trasforma i visitatori in richieste. Costa meno, si gestisce quasi da solo e si lancia in 1-2 settimane.</p>
<h2>Quando serve un e-commerce</h2>
<p>Se vuoi incassare direttamente online, 24 ore su 24, ti serve un <a href="/servizi/ecommerce/">e-commerce</a> con catalogo, carrello e pagamenti. Richiede pi&ugrave; investimento iniziale e gestione continua (ordini, magazzino, spedizioni), ma apre un canale di vendita nuovo. Per orientarti sui numeri leggi <a href="/blog/quanto-costa-ecommerce/">quanto costa un e-commerce</a>.</p>
<p>Una via di mezzo esiste: partire con un sito vetrina e aggiungere l'e-commerce in un secondo momento, quando il progetto &egrave; maturo. Se hai dubbi, <a href="/contatti/">raccontaci la tua attivit&agrave;</a> e ti diciamo onestamente cosa ti conviene.</p>""",
  faqs=[
   ("Qual e la differenza tra sito vetrina ed e-commerce?", "Il sito vetrina presenta la tua attivita e genera contatti, senza vendere online. L'e-commerce permette di vendere prodotti direttamente con carrello e pagamenti. Cambiano obiettivo, costo e gestione."),
   ("Costa di piu un e-commerce o un sito vetrina?", "L'e-commerce costa di piu: parte da &euro;1.200 contro gli &euro;800 di un sito vetrina, e ha una gestione continua di ordini e spedizioni. Il sito vetrina e piu economico e quasi automatico."),
   ("Posso trasformare un sito vetrina in e-commerce?", "Si. Molte attivita partono con un sito vetrina e aggiungono la parte e-commerce quando sono pronte. Se il sito e costruito bene, l'estensione e semplice e non richiede di ripartire da zero."),
   ("Ho un negozio fisico: mi serve un e-commerce?", "Non per forza. Se il tuo obiettivo e farti trovare e portare clienti in negozio, un sito vetrina con SEO locale spesso basta. L'e-commerce serve se vuoi vendere anche a distanza."),
  ]),
 en=dict(
  title="Brochure Site or E-commerce? How to Choose in 2026 | Carbon Stealth",
  desc="Brochure site or e-commerce? A practical guide to which website your business needs, with differences in cost, goals and features.",
  body="""<p>The rule is simple: if you sell products directly online you need an <strong>e-commerce</strong>; if you want to present your business and collect leads or quote requests, a <strong>brochure site</strong> is enough. Many businesses spend more than they need by opening a store when their real goal is to generate calls, bookings or enquiries, not transactions.</p>
<h2>The differences at a glance</h2>
<div class="ctbl"><table><thead><tr><th></th><th>Brochure site</th><th>E-commerce</th></tr></thead><tbody>
<tr><td>Goal</td><td>Get known, generate leads</td><td>Sell products online</td></tr>
<tr><td>Price</td><td>from &euro;800</td><td>from &euro;1,200</td></tr>
<tr><td>Management</td><td>Minimal</td><td>Ongoing (orders, stock, shipping)</td></tr>
<tr><td>Payments</td><td>No</td><td>Yes (Stripe, PayPal, cards)</td></tr>
<tr><td>Ideal for</td><td>Firms, restaurants, artisans, B2B</td><td>Shops, brands, manufacturers</td></tr>
</tbody></table></div>
<h2>When a brochure site is enough</h2>
<p>A <a href="/en/services/web-development/">brochure site</a> is perfect for professionals, restaurants, clinics, artisans and B2B companies that sell on quote. It presents services, portfolio and contacts, ranks on Google for local searches and turns visitors into enquiries. It costs less, almost runs itself and launches in 1-2 weeks.</p>
<h2>When you need an e-commerce</h2>
<p>If you want to take payments directly online, around the clock, you need an <a href="/en/services/ecommerce/">e-commerce</a> with a catalog, cart and payments. It requires more upfront investment and ongoing management (orders, stock, shipping), but opens a new sales channel. To get a sense of the numbers, read <a href="/en/blog/quanto-costa-ecommerce/">how much an e-commerce costs</a>.</p>
<p>There is a middle path: start with a brochure site and add e-commerce later, when the project is mature. If you're unsure, <a href="/en/contact/">tell us about your business</a> and we'll honestly say what suits you.</p>""",
  faqs=[
   ("What's the difference between a brochure site and an e-commerce?", "A brochure site presents your business and generates leads without selling online. An e-commerce lets you sell products directly with a cart and payments. Goal, cost and management all differ."),
   ("Does an e-commerce cost more than a brochure site?", "Yes. An e-commerce starts at &euro;1,200 versus &euro;800 for a brochure site, and involves ongoing order and shipping management. A brochure site is cheaper and almost hands-off."),
   ("Can I turn a brochure site into an e-commerce?", "Yes. Many businesses start with a brochure site and add e-commerce when ready. If the site is built well, extending it is straightforward and doesn't mean starting over."),
   ("I have a physical shop: do I need an e-commerce?", "Not necessarily. If your goal is to be found and bring customers into the shop, a brochure site with local SEO is often enough. You need e-commerce if you also want to sell remotely."),
  ]),
 bg=dict(
  title="Визитен Сайт или Онлайн Магазин? Как да Изберете 2026 | Carbon Stealth",
  desc="Визитен сайт или онлайн магазин? Практично ръководство кой сайт е нужен на вашия бизнес, с разлики в цена, цели и функционалности.",
  body="""<p>Правилото е просто: ако продавате продукти директно онлайн, трябва ви <strong>онлайн магазин</strong>; ако искате да представите бизнеса си и да събирате запитвания или заявки за оферта, достатъчен е <strong>визитен сайт</strong>. Много фирми харчат повече от необходимото, отваряйки магазин, когато реалната им цел е обаждания, резервации или запитвания, а не транзакции.</p>
<h2>Разликите накратко</h2>
<div class="ctbl"><table><thead><tr><th></th><th>Визитен сайт</th><th>Онлайн магазин</th></tr></thead><tbody>
<tr><td>Цел</td><td>Да ви опознаят, да генерира запитвания</td><td>Продажба на продукти онлайн</td></tr>
<tr><td>Цена</td><td>от &euro;800</td><td>от &euro;1200</td></tr>
<tr><td>Управление</td><td>Минимално</td><td>Постоянно (поръчки, склад, доставки)</td></tr>
<tr><td>Плащания</td><td>Не</td><td>Да (Stripe, PayPal, карти)</td></tr>
<tr><td>Подходящ за</td><td>Кантори, ресторанти, занаятчии, B2B</td><td>Магазини, брандове, производители</td></tr>
</tbody></table></div>
<h2>Кога визитният сайт е достатъчен</h2>
<p><a href="/bg/uslugi/web-razrabotka/">Визитният сайт</a> е идеален за специалисти, ресторанти, лекарски кабинети, занаятчии и B2B фирми, които продават по оферта. Представя услуги, портфолио и контакти, класира се в Google за локални търсения и превръща посетителите в запитвания. Струва по-малко, работи почти сам и се пуска за 1-2 седмици.</p>
<h2>Кога ви трябва онлайн магазин</h2>
<p>Ако искате да приемате плащания директно онлайн, денонощно, трябва ви <a href="/bg/uslugi/ecommerce/">онлайн магазин</a> с каталог, количка и плащания. Изисква повече начална инвестиция и постоянно управление (поръчки, склад, доставки), но отваря нов канал за продажби. За ориентир в числата прочетете <a href="/bg/blog/quanto-costa-ecommerce/">колко струва онлайн магазин</a>.</p>
<p>Има и междинен път: започнете с визитен сайт и добавете магазина по-късно, когато проектът узрее. Ако се колебаете, <a href="/bg/kontakti/">разкажете ни за бизнеса си</a> и ще ви кажем честно кое ви подхожда.</p>""",
  faqs=[
   ("Каква е разликата между визитен сайт и онлайн магазин?", "Визитният сайт представя бизнеса ви и генерира запитвания, без да продава онлайн. Онлайн магазинът позволява директна продажба на продукти с количка и плащания. Различават се по цел, цена и управление."),
   ("Онлайн магазинът по-скъп ли е от визитния сайт?", "Да. Онлайн магазинът започва от &euro;1200 срещу &euro;800 за визитен сайт и изисква постоянно управление на поръчки и доставки. Визитният сайт е по-евтин и почти автоматичен."),
   ("Мога ли да превърна визитен сайт в онлайн магазин?", "Да. Много фирми започват с визитен сайт и добавят магазин, когато са готови. Ако сайтът е изграден добре, разширяването е лесно и не изисква започване от нулата."),
   ("Имам физически магазин: трябва ли ми онлайн магазин?", "Не задължително. Ако целта е да ви намират и да водите клиенти в магазина, визитен сайт с локално SEO често стига. Онлайн магазин ви трябва, ако искате да продавате и от разстояние."),
  ]),
)),

# 5 ─────────────────────────────────────────────────────────────
dict(slug="quanto-costa-app-mobile", section="Mobile Apps", read=7, lang=dict(
 it=dict(
  title="Quanto Costa Sviluppare un'App nel 2026? Prezzi | Carbon Stealth",
  desc="Quanto costa sviluppare un'app mobile nel 2026? Prezzi reali per app native e cross-platform, cosa incide sul preventivo e come contenere i costi.",
  body="""<p>Sviluppare un'app mobile parte da <strong>&euro;3.000</strong> per un'app semplice e cross-platform, mentre progetti pi&ugrave; complessi con backend, account utente e integrazioni possono superare i &euro;15.000. Il costo dipende dalle funzionalit&agrave;, dal numero di piattaforme (iOS, Android o entrambe) e dal fatto che serva o meno un server e un pannello di gestione dietro l'app.</p>
<h2>Quanto costa un'app per tipologia</h2>
<div class="ctbl"><table><thead><tr><th>Tipo di app</th><th>Prezzo indicativo</th><th>Esempi</th></tr></thead><tbody>
<tr><td>App semplice (MVP)</td><td>da &euro;3.000</td><td>Catalogo, vetrina, contenuti</td></tr>
<tr><td>App con backend e account</td><td>da &euro;6.000</td><td>Login, profili, notifiche push</td></tr>
<tr><td>App complessa</td><td>da &euro;12.000</td><td>Pagamenti, geolocalizzazione, chat</td></tr>
</tbody></table></div>
<h2>Nativa o cross-platform?</h2>
<p>Un'app <strong>cross-platform</strong> (React Native, Flutter) usa un unico codice per iOS e Android: costa meno e si sviluppa pi&ugrave; in fretta, ideale per la maggior parte dei progetti. Un'app <strong>nativa</strong> (Swift, Kotlin) offre prestazioni massime e accesso completo alle funzioni del dispositivo, ma raddoppia lo sforzo perch&eacute; richiede due basi di codice. Per il 90% dei casi consigliamo il cross-platform.</p>
<h2>Cosa incide sul preventivo</h2>
<ul>
<li><strong>Backend:</strong> se l'app deve salvare dati o gestire utenti serve un server, che va progettato e mantenuto.</li>
<li><strong>Design UX/UI:</strong> un'esperienza curata richiede pi&ugrave; lavoro ma aumenta l'uso reale dell'app.</li>
<li><strong>Integrazioni:</strong> pagamenti, mappe, notifiche push, login social, servizi esterni.</li>
<li><strong>Pubblicazione e manutenzione:</strong> account sviluppatore Apple (99&euro;/anno) e Google (25&euro; una tantum), pi&ugrave; aggiornamenti nel tempo.</li>
</ul>
<p>Spesso, prima di un'app, conviene valutare una web app o un sito ottimizzato per mobile: costa meno e raggiunge tutti senza download. Ne parliamo insieme quando definiamo il progetto. Scopri il nostro <a href="/servizi/app-mobile/">servizio di sviluppo app</a>, valuta anche lo <a href="/servizi/sviluppo-software/">sviluppo software su misura</a> e leggi <a href="/blog/quanto-costa-sito-web/">quanto costa un sito web</a> per confrontare gli investimenti.</p>""",
  faqs=[
   ("Quanto costa sviluppare un'app da zero?", "Un'app semplice cross-platform parte da &euro;3.000. Con backend, account utente e notifiche si sale a &euro;6.000+, mentre app complesse con pagamenti e geolocalizzazione superano i &euro;12.000."),
   ("Meglio un'app nativa o cross-platform?", "Per la maggior parte dei progetti conviene il cross-platform (React Native, Flutter): un solo codice per iOS e Android, costi e tempi ridotti. La nativa serve solo quando servono prestazioni estreme o funzioni hardware avanzate."),
   ("Ci sono costi dopo la pubblicazione dell'app?", "Si: l'account sviluppatore Apple costa 99&euro;/anno e quello Google 25&euro; una tantum. Poi ci sono hosting del backend e aggiornamenti periodici per compatibilita e sicurezza."),
   ("Mi serve davvero un'app o basta un sito?", "Spesso un sito ottimizzato per mobile o una web app basta e costa meno, perche non richiede download. L'app conviene quando servono notifiche push, uso offline o funzioni del dispositivo."),
  ]),
 en=dict(
  title="How Much Does It Cost to Build an App in 2026? | Carbon Stealth",
  desc="How much does it cost to build a mobile app in 2026? Real prices for native and cross-platform apps, what drives the quote and how to keep costs down.",
  body="""<p>Building a mobile app starts at <strong>&euro;3,000</strong> for a simple cross-platform app, while more complex projects with a backend, user accounts and integrations can exceed &euro;15,000. The cost depends on the features, the number of platforms (iOS, Android or both) and whether the app needs a server and an admin panel behind it.</p>
<h2>App cost by type</h2>
<div class="ctbl"><table><thead><tr><th>Type of app</th><th>Typical price</th><th>Examples</th></tr></thead><tbody>
<tr><td>Simple app (MVP)</td><td>from &euro;3,000</td><td>Catalog, showcase, content</td></tr>
<tr><td>App with backend and accounts</td><td>from &euro;6,000</td><td>Login, profiles, push notifications</td></tr>
<tr><td>Complex app</td><td>from &euro;12,000</td><td>Payments, geolocation, chat</td></tr>
</tbody></table></div>
<h2>Native or cross-platform?</h2>
<p>A <strong>cross-platform</strong> app (React Native, Flutter) uses a single codebase for iOS and Android: it costs less and ships faster, ideal for most projects. A <strong>native</strong> app (Swift, Kotlin) offers maximum performance and full access to device features, but doubles the effort because it needs two codebases. For 90% of cases we recommend cross-platform.</p>
<h2>What drives the quote</h2>
<ul>
<li><strong>Backend:</strong> if the app must store data or manage users, it needs a server, which must be designed and maintained.</li>
<li><strong>UX/UI design:</strong> a polished experience takes more work but increases real usage.</li>
<li><strong>Integrations:</strong> payments, maps, push notifications, social login, external services.</li>
<li><strong>Publishing and maintenance:</strong> Apple developer account (&euro;99/year) and Google (&euro;25 one-time), plus updates over time.</li>
</ul>
<p>Often, before an app, it's worth considering a web app or a mobile-optimized site: it costs less and reaches everyone without a download. We discuss this together when scoping the project. See our <a href="/en/services/mobile-apps/">app development service</a>, consider <a href="/en/services/software-development/">custom software development</a>, and read <a href="/en/blog/quanto-costa-sito-web/">how much a website costs</a> to compare the investments.</p>""",
  faqs=[
   ("How much does it cost to build an app from scratch?", "A simple cross-platform app starts at &euro;3,000. With a backend, user accounts and notifications it rises to &euro;6,000+, while complex apps with payments and geolocation exceed &euro;12,000."),
   ("Native or cross-platform app?", "For most projects cross-platform (React Native, Flutter) is best: one codebase for iOS and Android, lower cost and time. Native is only needed when you require extreme performance or advanced hardware features."),
   ("Are there costs after publishing the app?", "Yes: the Apple developer account costs &euro;99/year and Google &euro;25 one-time. Then there's backend hosting and periodic updates for compatibility and security."),
   ("Do I really need an app or is a website enough?", "Often a mobile-optimized site or web app is enough and costs less, because it needs no download. An app is worth it when you need push notifications, offline use or device features."),
  ]),
 bg=dict(
  title="Колко Струва Разработка на Мобилно Приложение 2026? | Carbon Stealth",
  desc="Колко струва разработка на мобилно приложение през 2026? Реални цени за native и cross-platform приложения, какво влияе на офертата и как да намалите разходите.",
  body="""<p>Разработката на мобилно приложение започва от <strong>&euro;3000</strong> за просто cross-platform приложение, докато по-сложни проекти с бекенд, потребителски профили и интеграции могат да надхвърлят &euro;15000. Цената зависи от функционалностите, броя платформи (iOS, Android или и двете) и от това дали е нужен сървър и административен панел зад приложението.</p>
<h2>Цена на приложение по тип</h2>
<div class="ctbl"><table><thead><tr><th>Тип приложение</th><th>Ориентировъчна цена</th><th>Примери</th></tr></thead><tbody>
<tr><td>Просто приложение (MVP)</td><td>от &euro;3000</td><td>Каталог, витрина, съдържание</td></tr>
<tr><td>Приложение с бекенд и профили</td><td>от &euro;6000</td><td>Вход, профили, push известия</td></tr>
<tr><td>Сложно приложение</td><td>от &euro;12000</td><td>Плащания, геолокация, чат</td></tr>
</tbody></table></div>
<h2>Native или cross-platform?</h2>
<p><strong>Cross-platform</strong> приложение (React Native, Flutter) използва един код за iOS и Android: струва по-малко и се разработва по-бързо, идеално за повечето проекти. <strong>Native</strong> приложение (Swift, Kotlin) дава максимална производителност и пълен достъп до функциите на устройството, но удвоява усилието, защото изисква два кода. За 90% от случаите препоръчваме cross-platform.</p>
<h2>Какво влияе на офертата</h2>
<ul>
<li><strong>Бекенд:</strong> ако приложението трябва да пази данни или да управлява потребители, е нужен сървър, който се проектира и поддържа.</li>
<li><strong>UX/UI дизайн:</strong> изпипаното преживяване изисква повече работа, но увеличава реалната употреба.</li>
<li><strong>Интеграции:</strong> плащания, карти, push известия, социален вход, външни услуги.</li>
<li><strong>Публикуване и поддръжка:</strong> Apple developer акаунт (&euro;99/година) и Google (&euro;25 еднократно), плюс обновления с времето.</li>
</ul>
<p>Често, преди приложение, си струва да обмислите уеб приложение или сайт, оптимизиран за мобилни: струва по-малко и достига всички без изтегляне. Обсъждаме това заедно при дефинирането на проекта. Вижте нашата <a href="/bg/uslugi/mobilni-prilozheniya/">услуга за разработка на приложения</a>, обмислете и <a href="/bg/uslugi/softuer/">софтуер по поръчка</a> и прочетете <a href="/bg/blog/quanto-costa-sito-web/">колко струва сайт</a>, за да сравните инвестициите.</p>""",
  faqs=[
   ("Колко струва разработка на приложение от нулата?", "Просто cross-platform приложение започва от &euro;3000. С бекенд, потребителски профили и известия се качва на &euro;6000+, а сложни приложения с плащания и геолокация надхвърлят &euro;12000."),
   ("Native или cross-platform приложение?", "За повечето проекти cross-platform (React Native, Flutter) е най-добро: един код за iOS и Android, по-ниска цена и срок. Native е нужен само при екстремна производителност или сложни хардуерни функции."),
   ("Има ли разходи след публикуване на приложението?", "Да: Apple developer акаунтът струва &euro;99/година, а Google &euro;25 еднократно. После има хостинг на бекенда и периодични обновления за съвместимост и сигурност."),
   ("Наистина ли ми трябва приложение или стига сайт?", "Често сайт, оптимизиран за мобилни, или уеб приложение е достатъчен и струва по-малко, защото не изисква изтегляне. Приложение си струва при push известия, офлайн употреба или функции на устройството."),
  ]),
)),

# 6 ─────────────────────────────────────────────────────────────
dict(slug="cos-e-un-erp", section="ERP", read=8, lang=dict(
 it=dict(
  title="Cos'e un ERP e Come Funziona: Guida Completa 2026 | Carbon Stealth",
  desc="Cos'e un sistema ERP, come funziona e a cosa serve. Guida completa 2026 con moduli, vantaggi, costi e quando conviene davvero a una PMI.",
  body="""<p>Un <strong>ERP</strong> (Enterprise Resource Planning) &egrave; un software che unifica in un'unica piattaforma i processi principali di un'azienda: contabilit&agrave;, magazzino, vendite, acquisti, produzione e risorse umane. Invece di avere dati sparsi tra fogli Excel e programmi separati, tutto vive in un sistema centrale dove ogni reparto lavora sugli stessi numeri aggiornati in tempo reale.</p>
<h2>Come funziona un ERP</h2>
<p>Un ERP &egrave; organizzato in <strong>moduli</strong>, ciascuno dedicato a un'area aziendale, tutti collegati allo stesso database. Quando registri una vendita, il sistema aggiorna automaticamente il magazzino, la contabilit&agrave; e le statistiche. Non serve reinserire lo stesso dato tre volte: lo scrivi una volta e viaggia dove serve. I moduli tipici sono:</p>
<ul>
<li><strong>Contabilit&agrave; e fatturazione:</strong> registrazioni, fatture, scadenze, bilanci.</li>
<li><strong>Magazzino e logistica:</strong> giacenze, movimenti, carichi e scarichi.</li>
<li><strong>Vendite e CRM:</strong> clienti, preventivi, ordini, storico.</li>
<li><strong>Acquisti:</strong> fornitori, ordini di acquisto, ricezione merci.</li>
<li><strong>Produzione:</strong> distinte base, ordini di lavoro, avanzamento.</li>
<li><strong>Risorse umane:</strong> anagrafica dipendenti, presenze, costi.</li>
</ul>
<h2>Perche conviene a una PMI</h2>
<p>Il vantaggio principale &egrave; avere una sola fonte di verit&agrave;: meno errori, meno lavoro manuale e visibilit&agrave; immediata sui margini e sulle scorte. Un ERP riduce gli errori di inventario, elimina la doppia digitazione e permette di decidere sui dati reali, non su stime. Per capire se sei pronto, leggi la nostra guida <a href="/blog/erp-per-pmi/">ERP per PMI: quando serve davvero</a>.</p>
<h2>ERP pronto o su misura?</h2>
<p>Gli ERP standard (come Odoo o SAP Business One) offrono molto subito ma vanno adattati; un <a href="/servizi/erp/">ERP su misura</a> costa da &euro;5.000 e modella esattamente i tuoi processi, senza pagare moduli che non usi. La scelta dipende da quanto i tuoi flussi sono particolari. Spesso conviene integrare l'ERP con l'<a href="/servizi/ecommerce/">e-commerce</a> e i gestionali esistenti: <a href="/contatti/">parliamone</a> e valutiamo insieme la soluzione giusta.</p>""",
  faqs=[
   ("Cosa significa ERP e a cosa serve?", "ERP sta per Enterprise Resource Planning. E un software che integra contabilita, magazzino, vendite, acquisti e produzione in un'unica piattaforma, cosi ogni reparto lavora sugli stessi dati aggiornati in tempo reale."),
   ("Quanto costa un sistema ERP?", "Un ERP su misura per una PMI parte da &euro;5.000. Le soluzioni standard hanno canoni per utente, mentre un ERP custom ha un costo iniziale piu alto ma nessun canone di licenza e processi disegnati sui tuoi."),
   ("Qual e la differenza tra ERP e gestionale?", "Un gestionale copre di solito una singola area (per esempio la contabilita o il magazzino). Un ERP integra piu aree collegate tra loro nello stesso sistema, evitando dati duplicati e disallineati."),
   ("La mia PMI e troppo piccola per un ERP?", "No: esistono ERP dimensionati anche per piccole imprese con 5-20 utenti. Il segnale che serve e quando gestisci troppi dati su fogli Excel separati e fai molto lavoro manuale ripetitivo."),
  ]),
 en=dict(
  title="What Is an ERP and How Does It Work? Full Guide 2026 | Carbon Stealth",
  desc="What is an ERP system, how it works and what it's for. A complete 2026 guide with modules, benefits, costs and when it really pays off for an SME.",
  body="""<p>An <strong>ERP</strong> (Enterprise Resource Planning) is software that unifies a company's core processes on a single platform: accounting, inventory, sales, purchasing, production and HR. Instead of data scattered across spreadsheets and separate programs, everything lives in one central system where every department works on the same figures, updated in real time.</p>
<h2>How an ERP works</h2>
<p>An ERP is organized into <strong>modules</strong>, each dedicated to a business area, all connected to the same database. When you record a sale, the system automatically updates inventory, accounting and statistics. You don't re-enter the same data three times: you write it once and it travels where it's needed. Typical modules are:</p>
<ul>
<li><strong>Accounting and invoicing:</strong> entries, invoices, due dates, financial statements.</li>
<li><strong>Inventory and logistics:</strong> stock levels, movements, goods in and out.</li>
<li><strong>Sales and CRM:</strong> customers, quotes, orders, history.</li>
<li><strong>Purchasing:</strong> suppliers, purchase orders, goods receipt.</li>
<li><strong>Production:</strong> bills of materials, work orders, progress tracking.</li>
<li><strong>Human resources:</strong> employee records, attendance, costs.</li>
</ul>
<h2>Why it pays off for an SME</h2>
<p>The main benefit is a single source of truth: fewer errors, less manual work and instant visibility into margins and stock. An ERP reduces inventory errors, eliminates double data entry and lets you decide on real data, not estimates. To see if you're ready, read our guide <a href="/en/blog/erp-per-pmi/">ERP for SMEs: when you really need it</a>.</p>
<h2>Off-the-shelf or custom ERP?</h2>
<p>Standard ERPs (like Odoo or SAP Business One) offer a lot out of the box but need tailoring; a <a href="/en/services/erp/">custom ERP</a> starts at &euro;5,000 and models your processes exactly, without paying for modules you don't use. The choice depends on how unusual your workflows are. It's often worth integrating the ERP with your <a href="/en/services/ecommerce/">e-commerce</a> and existing systems: <a href="/en/contact/">let's talk</a> and find the right solution together.</p>""",
  faqs=[
   ("What does ERP mean and what is it for?", "ERP stands for Enterprise Resource Planning. It's software that integrates accounting, inventory, sales, purchasing and production on a single platform, so every department works on the same data updated in real time."),
   ("How much does an ERP system cost?", "A custom ERP for an SME starts at &euro;5,000. Standard solutions charge per-user fees, while a custom ERP has a higher upfront cost but no license fees and processes designed around yours."),
   ("What's the difference between an ERP and a management system?", "A management system usually covers a single area (for example accounting or inventory). An ERP integrates several connected areas in the same system, avoiding duplicated and misaligned data."),
   ("Is my SME too small for an ERP?", "No: there are ERPs sized for small businesses with 5-20 users. The sign you need one is when you manage too much data across separate spreadsheets and do a lot of repetitive manual work."),
  ]),
 bg=dict(
  title="Какво е ERP Система и Как Работи? Пълно Ръководство 2026 | Carbon Stealth",
  desc="Какво е ERP система, как работи и за какво служи. Пълно ръководство 2026 с модули, ползи, разходи и кога наистина си струва за малкия и среден бизнес.",
  body="""<p><strong>ERP</strong> (Enterprise Resource Planning) е софтуер, който обединява основните процеси на една фирма в единна платформа: счетоводство, склад, продажби, доставки, производство и човешки ресурси. Вместо данни, разпръснати между Excel таблици и отделни програми, всичко живее в централна система, където всеки отдел работи с едни и същи данни, обновявани в реално време.</p>
<h2>Как работи ERP</h2>
<p>ERP е организиран в <strong>модули</strong>, всеки посветен на бизнес област, свързани към една база данни. Когато запишете продажба, системата автоматично обновява склада, счетоводството и статистиката. Не въвеждате едни и същи данни три пъти: пишете ги веднъж и те стигат където трябва. Типичните модули са:</p>
<ul>
<li><strong>Счетоводство и фактуриране:</strong> записвания, фактури, падежи, отчети.</li>
<li><strong>Склад и логистика:</strong> наличности, движения, входящи и изходящи стоки.</li>
<li><strong>Продажби и CRM:</strong> клиенти, оферти, поръчки, история.</li>
<li><strong>Доставки:</strong> доставчици, поръчки за покупка, приемане на стоки.</li>
<li><strong>Производство:</strong> спецификации, работни поръчки, проследяване.</li>
<li><strong>Човешки ресурси:</strong> данни за служители, присъствия, разходи.</li>
</ul>
<h2>Защо си струва за малкия и среден бизнес</h2>
<p>Основната полза е единен източник на истина: по-малко грешки, по-малко ръчна работа и моментална видимост върху маржовете и наличностите. ERP намалява складовите грешки, премахва двойното въвеждане и позволява решения на база реални данни, а не предположения. За да проверите дали сте готови, прочетете ръководството <a href="/bg/blog/erp-per-pmi/">ERP за МСП: кога наистина е нужен</a>.</p>
<h2>Готов или ERP по поръчка?</h2>
<p>Стандартните ERP системи (като Odoo или SAP Business One) предлагат много наготово, но изискват настройка; <a href="/bg/uslugi/erp/">ERP по поръчка</a> започва от &euro;5000 и моделира точно вашите процеси, без да плащате за модули, които не ползвате. Изборът зависи колко специфични са процесите ви. Често си струва ERP да се интегрира с <a href="/bg/uslugi/ecommerce/">онлайн магазина</a> и съществуващите системи: <a href="/bg/kontakti/">пишете ни</a> и ще намерим правилното решение заедно.</p>""",
  faqs=[
   ("Какво означава ERP и за какво служи?", "ERP означава Enterprise Resource Planning. Това е софтуер, който интегрира счетоводство, склад, продажби, доставки и производство в единна платформа, така че всеки отдел работи с едни и същи данни в реално време."),
   ("Колко струва ERP система?", "ERP по поръчка за МСП започва от &euro;5000. Стандартните решения таксуват на потребител, докато ERP по поръчка има по-висок начален разход, но без лицензни такси и с процеси, проектирани спрямо вашите."),
   ("Каква е разликата между ERP и складова програма?", "Складовата програма обикновено покрива една област (например счетоводство или склад). ERP интегрира няколко свързани области в една система, като избягва дублирани и разминаващи се данни."),
   ("Моята малка фирма твърде малка ли е за ERP?", "Не: има ERP системи, оразмерени и за малки фирми с 5-20 потребители. Признакът, че ви трябва, е когато управлявате твърде много данни в отделни Excel таблици и вършите много повтаряща се ръчна работа."),
  ]),
)),

# 7 ─────────────────────────────────────────────────────────────
dict(slug="seo-per-piccole-imprese", section="SEO", read=8, lang=dict(
 it=dict(
  title="SEO per Piccole Imprese: Guida Pratica 2026 | Carbon Stealth",
  desc="Guida SEO pratica per piccole imprese nel 2026: come farsi trovare su Google con budget contenuti, SEO locale, contenuti e passi concreti da fare subito.",
  body="""<p>La SEO (Search Engine Optimization) &egrave; l'insieme delle attivit&agrave; che portano il tuo sito in cima ai risultati di Google quando qualcuno cerca ci&ograve; che offri. Per una piccola impresa &egrave; il canale con il miglior rapporto costo-risultato: a differenza della pubblicit&agrave;, il traffico organico continua ad arrivare anche quando smetti di pagare. La buona notizia &egrave; che gran parte del lavoro si pu&ograve; fare con un budget contenuto e costanza.</p>
<h2>I fondamentali su cui partire</h2>
<ul>
<li><strong>Parole chiave:</strong> scopri cosa cercano davvero i tuoi clienti (es. &laquo;idraulico Milano&raquo;, non solo &laquo;idraulica&raquo;).</li>
<li><strong>SEO on-page:</strong> titoli, meta description, intestazioni e testi che rispondono alla ricerca.</li>
<li><strong>Prestazioni tecniche:</strong> un sito veloce e mobile-friendly &egrave; un requisito, non un extra &mdash; vedi i <a href="/blog/core-web-vitals-guida/">Core Web Vitals</a>.</li>
<li><strong>Contenuti:</strong> pagine di servizio chiare e un blog che risponde alle domande dei clienti.</li>
</ul>
<h2>SEO locale: la priorit&agrave; per chi ha clienti sul territorio</h2>
<p>Se lavori in una zona precisa, la SEO locale &egrave; il tuo terreno pi&ugrave; fertile. Apri e ottimizza il profilo <strong>Google Business</strong>, raccogli recensioni autentiche, mantieni coerenti nome, indirizzo e telefono ovunque online e crea pagine dedicate alle citt&agrave; che servi &mdash; come facciamo con le nostre pagine <a href="/geo/milano/">per Milano</a> e altre citt&agrave;. Cos&igrave; compari nelle ricerche &laquo;servizio + citt&agrave;&raquo; e nella mappa.</p>
<h2>Cosa fare nei primi 90 giorni</h2>
<p>Non serve fare tutto subito. Un percorso realistico: settimana 1-2, analisi parole chiave e sistemazione tecnica del sito; settimana 3-6, ottimizzazione delle pagine di servizio e del profilo Google Business; da settimana 7 in poi, pubblicazione regolare di contenuti utili. La SEO d&agrave; frutti in 3-6 mesi, non in una settimana: la costanza vince.</p>
<p>Puoi partire da solo con i fondamentali, oppure affidarti a chi lo fa di mestiere. Il nostro <a href="/servizi/seo/">servizio SEO</a> parte da &euro;500/mese e include analisi, ottimizzazione e contenuti. Se stai anche costruendo il sito, leggi <a href="/blog/quanto-costa-sito-web/">quanto costa un sito web</a> per pianificare l'investimento complessivo.</p>""",
  faqs=[
   ("Quanto costa la SEO per una piccola impresa?", "Un'attivita SEO professionale parte da &euro;500/mese e include analisi parole chiave, ottimizzazione on-page e contenuti. Molti fondamentali puoi curarli anche internamente, con costanza e metodo."),
   ("In quanto tempo si vedono i risultati SEO?", "Di solito in 3-6 mesi per keyword competitive, prima per ricerche locali o di nicchia. La SEO e un investimento a medio termine: i risultati crescono e restano nel tempo, a differenza della pubblicita."),
   ("Cos'e la SEO locale e a chi serve?", "E l'ottimizzazione per le ricerche legate a un luogo (es. 'parrucchiere Torino'). Serve a chi ha clienti sul territorio: negozi, ristoranti, studi e artigiani. Si basa su Google Business, recensioni e pagine locali."),
   ("Posso fare SEO da solo?", "Si, i fondamentali (parole chiave, titoli, Google Business, contenuti utili) sono alla portata di tutti. Per la parte tecnica avanzata e la strategia continuativa conviene farsi affiancare da un professionista."),
  ]),
 en=dict(
  title="SEO for Small Businesses: A Practical 2026 Guide | Carbon Stealth",
  desc="A practical SEO guide for small businesses in 2026: how to get found on Google on a modest budget, with local SEO, content and concrete steps to take now.",
  body="""<p>SEO (Search Engine Optimization) is the set of activities that push your site to the top of Google when someone searches for what you offer. For a small business it's the channel with the best cost-to-result ratio: unlike ads, organic traffic keeps arriving even when you stop paying. The good news is that most of the work can be done on a modest budget and with consistency.</p>
<h2>The fundamentals to start with</h2>
<ul>
<li><strong>Keywords:</strong> find out what your customers really search for (e.g. &laquo;plumber Milan&raquo;, not just &laquo;plumbing&raquo;).</li>
<li><strong>On-page SEO:</strong> titles, meta descriptions, headings and copy that answer the search.</li>
<li><strong>Technical performance:</strong> a fast, mobile-friendly site is a requirement, not an extra &mdash; see <a href="/en/blog/core-web-vitals-guida/">Core Web Vitals</a>.</li>
<li><strong>Content:</strong> clear service pages and a blog that answers your customers' questions.</li>
</ul>
<h2>Local SEO: the priority for businesses with customers nearby</h2>
<p>If you work in a specific area, local SEO is your most fertile ground. Create and optimize your <strong>Google Business</strong> profile, collect genuine reviews, keep your name, address and phone consistent everywhere online, and build pages for the cities you serve &mdash; as we do with our pages <a href="/en/geo/milano/">for Milan</a> and other cities. That way you show up for &laquo;service + city&raquo; searches and on the map.</p>
<h2>What to do in the first 90 days</h2>
<p>You don't need to do everything at once. A realistic path: weeks 1-2, keyword research and technical clean-up of the site; weeks 3-6, optimizing service pages and the Google Business profile; from week 7, regular publishing of useful content. SEO delivers in 3-6 months, not in a week: consistency wins.</p>
<p>You can start on your own with the fundamentals, or rely on people who do it for a living. Our <a href="/en/services/seo/">SEO service</a> starts at &euro;500/month and includes analysis, optimization and content. If you're also building the site, read <a href="/en/blog/quanto-costa-sito-web/">how much a website costs</a> to plan the overall investment.</p>""",
  faqs=[
   ("How much does SEO cost for a small business?", "Professional SEO starts at &euro;500/month and includes keyword research, on-page optimization and content. Many fundamentals can also be handled in-house, with consistency and method."),
   ("How long does SEO take to show results?", "Usually 3-6 months for competitive keywords, sooner for local or niche searches. SEO is a medium-term investment: results grow and last over time, unlike advertising."),
   ("What is local SEO and who is it for?", "It's optimization for location-based searches (e.g. 'hairdresser Turin'). It's for businesses with local customers: shops, restaurants, firms and artisans. It relies on Google Business, reviews and local pages."),
   ("Can I do SEO myself?", "Yes, the fundamentals (keywords, titles, Google Business, useful content) are within everyone's reach. For advanced technical work and ongoing strategy, it's worth having a professional alongside you."),
  ]),
 bg=dict(
  title="SEO за Малкия Бизнес: Практическо Ръководство 2026 | Carbon Stealth",
  desc="Практическо SEO ръководство за малкия бизнес през 2026: как да ви намират в Google със скромен бюджет, с локално SEO, съдържание и конкретни стъпки още сега.",
  body="""<p>SEO (Search Engine Optimization) е съвкупността от дейности, които изкачват сайта ви в началото на Google, когато някой търси това, което предлагате. За малкия бизнес това е каналът с най-добро съотношение цена-резултат: за разлика от рекламата, органичният трафик продължава да идва дори когато спрете да плащате. Добрата новина е, че голяма част от работата може да се свърши със скромен бюджет и постоянство.</p>
<h2>Основите, с които да започнете</h2>
<ul>
<li><strong>Ключови думи:</strong> разберете какво реално търсят клиентите ви (напр. &laquo;водопроводчик София&raquo;, а не само &laquo;водопровод&raquo;).</li>
<li><strong>On-page SEO:</strong> заглавия, meta описания, подзаглавия и текст, които отговарят на търсенето.</li>
<li><strong>Техническа производителност:</strong> бърз и мобилен сайт е изискване, не екстра &mdash; вижте <a href="/bg/blog/core-web-vitals-guida/">Core Web Vitals</a>.</li>
<li><strong>Съдържание:</strong> ясни страници за услуги и блог, който отговаря на въпросите на клиентите.</li>
</ul>
<h2>Локално SEO: приоритет за бизнеса с клиенти наблизо</h2>
<p>Ако работите в конкретен район, локалното SEO е най-плодородната ви почва. Създайте и оптимизирайте <strong>Google Business</strong> профила си, събирайте истински отзиви, поддържайте еднакви име, адрес и телефон навсякъде онлайн и създайте страници за градовете, които обслужвате &mdash; както правим с нашите страници <a href="/bg/geo/sofia/">за София</a> и други градове. Така се появявате при търсения &laquo;услуга + град&raquo; и на картата.</p>
<h2>Какво да направите през първите 90 дни</h2>
<p>Не е нужно всичко наведнъж. Реалистичен път: седмица 1-2 &mdash; проучване на ключови думи и техническо изчистване на сайта; седмица 3-6 &mdash; оптимизация на страниците за услуги и Google Business профила; от седмица 7 &mdash; редовно публикуване на полезно съдържание. SEO дава резултати за 3-6 месеца, не за седмица: постоянството печели.</p>
<p>Можете да започнете сами с основите или да се доверите на хора, които го правят професионално. Нашата <a href="/bg/uslugi/seo/">SEO услуга</a> започва от &euro;500/месец и включва анализ, оптимизация и съдържание. Ако тепърва изграждате сайта, прочетете <a href="/bg/blog/quanto-costa-sito-web/">колко струва сайт</a>, за да планирате цялостната инвестиция.</p>""",
  faqs=[
   ("Колко струва SEO за малък бизнес?", "Професионалното SEO започва от &euro;500/месец и включва проучване на ключови думи, on-page оптимизация и съдържание. Много от основите могат да се вършат и вътрешно, с постоянство и метод."),
   ("За колко време SEO дава резултати?", "Обикновено за 3-6 месеца при конкурентни ключови думи, по-рано при локални или нишови търсения. SEO е средносрочна инвестиция: резултатите растат и остават с времето, за разлика от рекламата."),
   ("Какво е локално SEO и за кого е?", "Това е оптимизация за търсения, свързани с място (напр. 'фризьор Пловдив'). За бизнеси с местни клиенти: магазини, ресторанти, кантори и занаятчии. Стъпва на Google Business, отзиви и локални страници."),
   ("Мога ли да правя SEO сам?", "Да, основите (ключови думи, заглавия, Google Business, полезно съдържание) са по силите на всеки. За напредналата техническа част и постоянната стратегия си струва да имате специалист до себе си."),
  ]),
)),

# 8 ─────────────────────────────────────────────────────────────
dict(slug="core-web-vitals-guida", section="Web Development", read=7, lang=dict(
 it=dict(
  title="Core Web Vitals: Cosa Sono e Come Migliorarli 2026 | Carbon Stealth",
  desc="Cosa sono i Core Web Vitals (LCP, INP, CLS), perche contano per la SEO e come migliorarli. Guida pratica 2026 con soglie e interventi concreti.",
  body="""<p>I <strong>Core Web Vitals</strong> sono tre metriche con cui Google misura l'esperienza reale degli utenti su un sito: velocit&agrave; di caricamento, reattivit&agrave; e stabilit&agrave; visiva. Sono un fattore di posizionamento: a parit&agrave; di contenuto, un sito che li rispetta si posiziona meglio e trattiene di pi&ugrave; i visitatori. Migliorarli significa avere pi&ugrave; traffico e pi&ugrave; conversioni.</p>
<h2>Le tre metriche e le soglie da rispettare</h2>
<div class="ctbl"><table><thead><tr><th>Metrica</th><th>Cosa misura</th><th>Buono</th></tr></thead><tbody>
<tr><td>LCP (Largest Contentful Paint)</td><td>Velocit&agrave; di caricamento del contenuto principale</td><td>&lt; 2,5 s</td></tr>
<tr><td>INP (Interaction to Next Paint)</td><td>Reattivit&agrave; alle interazioni dell'utente</td><td>&lt; 200 ms</td></tr>
<tr><td>CLS (Cumulative Layout Shift)</td><td>Stabilit&agrave; visiva (elementi che &laquo;saltano&raquo;)</td><td>&lt; 0,1</td></tr>
</tbody></table></div>
<p>Nel 2024 INP ha sostituito la vecchia metrica FID, quindi diffida delle guide che citano ancora il FID: sono superate.</p>
<h2>Come migliorarli in pratica</h2>
<ul>
<li><strong>LCP:</strong> ottimizza e comprimi le immagini (formato WebP/AVIF), usa un buon hosting e una CDN, carica prima i contenuti visibili.</li>
<li><strong>INP:</strong> riduci e ottimizza il JavaScript, evita script bloccanti, alleggerisci i plugin di terze parti.</li>
<li><strong>CLS:</strong> imposta sempre larghezza e altezza a immagini e video, riserva lo spazio per banner e annunci.</li>
</ul>
<h2>Come misurarli</h2>
<p>Usa strumenti gratuiti come <strong>PageSpeed Insights</strong> e il report Core Web Vitals di <strong>Google Search Console</strong>, che mostra i dati reali dei tuoi utenti. Attenzione: i test in laboratorio e i dati sul campo possono differire, perch&eacute; dipendono da dispositivi e connessioni reali.</p>
<p>Le prestazioni non sono un dettaglio tecnico: sono parte della SEO e dell'esperienza cliente. Le curiamo in ogni <a href="/servizi/sviluppo-siti-web/">sito che sviluppiamo</a>, sono decisive per un <a href="/servizi/ecommerce/">e-commerce</a> che converte e vanno di pari passo con la <a href="/blog/seo-per-piccole-imprese/">SEO per piccole imprese</a>. Se il tuo sito &egrave; lento, <a href="/contatti/">chiedici un'analisi</a>.</p>""",
  faqs=[
   ("Cosa sono i Core Web Vitals?", "Sono tre metriche con cui Google misura l'esperienza utente di un sito: LCP (velocita di caricamento), INP (reattivita) e CLS (stabilita visiva). Insieme indicano quanto e veloce e piacevole navigare il sito."),
   ("I Core Web Vitals influenzano la SEO?", "Si. Sono un fattore di posizionamento di Google: a parita di contenuto, un sito che rispetta le soglie tende a posizionarsi meglio e a trattenere di piu i visitatori, riducendo l'abbandono."),
   ("Quali sono i valori ideali dei Core Web Vitals?", "LCP sotto 2,5 secondi, INP sotto 200 millisecondi e CLS sotto 0,1. Sopra queste soglie l'esperienza e considerata da migliorare o scadente."),
   ("Come posso misurare i Core Web Vitals del mio sito?", "Con strumenti gratuiti come Google PageSpeed Insights e il report Core Web Vitals di Google Search Console, che mostra i dati reali raccolti dai tuoi visitatori."),
  ]),
 en=dict(
  title="Core Web Vitals: What They Are and How to Improve Them | Carbon Stealth",
  desc="What Core Web Vitals are (LCP, INP, CLS), why they matter for SEO and how to improve them. A practical 2026 guide with thresholds and concrete fixes.",
  body="""<p><strong>Core Web Vitals</strong> are three metrics Google uses to measure the real user experience on a site: loading speed, responsiveness and visual stability. They are a ranking factor: with equal content, a site that meets them ranks better and keeps visitors longer. Improving them means more traffic and more conversions.</p>
<h2>The three metrics and the thresholds to hit</h2>
<div class="ctbl"><table><thead><tr><th>Metric</th><th>What it measures</th><th>Good</th></tr></thead><tbody>
<tr><td>LCP (Largest Contentful Paint)</td><td>Loading speed of the main content</td><td>&lt; 2.5 s</td></tr>
<tr><td>INP (Interaction to Next Paint)</td><td>Responsiveness to user interactions</td><td>&lt; 200 ms</td></tr>
<tr><td>CLS (Cumulative Layout Shift)</td><td>Visual stability (elements that &laquo;jump&raquo;)</td><td>&lt; 0.1</td></tr>
</tbody></table></div>
<p>In 2024 INP replaced the old FID metric, so be wary of guides that still cite FID: they're outdated.</p>
<h2>How to improve them in practice</h2>
<ul>
<li><strong>LCP:</strong> optimize and compress images (WebP/AVIF), use good hosting and a CDN, load visible content first.</li>
<li><strong>INP:</strong> reduce and optimize JavaScript, avoid blocking scripts, trim third-party plugins.</li>
<li><strong>CLS:</strong> always set width and height on images and video, reserve space for banners and ads.</li>
</ul>
<h2>How to measure them</h2>
<p>Use free tools like <strong>PageSpeed Insights</strong> and the Core Web Vitals report in <strong>Google Search Console</strong>, which shows real data from your users. Note: lab tests and field data can differ, because field data depends on real devices and connections.</p>
<p>Performance isn't a technical detail: it's part of SEO and of the customer experience. We look after it in every <a href="/en/services/web-development/">site we build</a>, it's decisive for an <a href="/en/services/ecommerce/">e-commerce</a> that converts, and it goes hand in hand with <a href="/en/blog/seo-per-piccole-imprese/">SEO for small businesses</a>. If your site is slow, <a href="/en/contact/">ask us for an analysis</a>.</p>""",
  faqs=[
   ("What are Core Web Vitals?", "They are three metrics Google uses to measure a site's user experience: LCP (loading speed), INP (responsiveness) and CLS (visual stability). Together they show how fast and pleasant the site is to use."),
   ("Do Core Web Vitals affect SEO?", "Yes. They are a Google ranking factor: with equal content, a site that meets the thresholds tends to rank better and keep visitors longer, reducing bounce."),
   ("What are the ideal Core Web Vitals values?", "LCP under 2.5 seconds, INP under 200 milliseconds and CLS under 0.1. Above these thresholds the experience is considered 'needs improvement' or 'poor'."),
   ("How can I measure my site's Core Web Vitals?", "With free tools like Google PageSpeed Insights and the Core Web Vitals report in Google Search Console, which shows real data collected from your visitors."),
  ]),
 bg=dict(
  title="Core Web Vitals: Какво са и Как да ги Подобрите 2026 | Carbon Stealth",
  desc="Какво са Core Web Vitals (LCP, INP, CLS), защо са важни за SEO и как да ги подобрите. Практическо ръководство 2026 с прагове и конкретни решения.",
  body="""<p><strong>Core Web Vitals</strong> са три метрики, с които Google измерва реалното потребителско изживяване на сайта: скорост на зареждане, отзивчивост и визуална стабилност. Те са фактор за класиране: при еднакво съдържание сайт, който ги спазва, се класира по-добре и задържа посетителите по-дълго. Подобряването им означава повече трафик и повече реализации.</p>
<h2>Трите метрики и праговете, които да спазите</h2>
<div class="ctbl"><table><thead><tr><th>Метрика</th><th>Какво измерва</th><th>Добро</th></tr></thead><tbody>
<tr><td>LCP (Largest Contentful Paint)</td><td>Скорост на зареждане на основното съдържание</td><td>&lt; 2,5 с</td></tr>
<tr><td>INP (Interaction to Next Paint)</td><td>Отзивчивост към действията на потребителя</td><td>&lt; 200 ms</td></tr>
<tr><td>CLS (Cumulative Layout Shift)</td><td>Визуална стабилност (елементи, които &laquo;скачат&raquo;)</td><td>&lt; 0,1</td></tr>
</tbody></table></div>
<p>През 2024 INP замени старата метрика FID, затова внимавайте с ръководства, които още цитират FID: те са остарели.</p>
<h2>Как да ги подобрите на практика</h2>
<ul>
<li><strong>LCP:</strong> оптимизирайте и компресирайте изображенията (WebP/AVIF), използвайте добър хостинг и CDN, зареждайте първо видимото съдържание.</li>
<li><strong>INP:</strong> намалете и оптимизирайте JavaScript, избягвайте блокиращи скриптове, олекотете плъгините от трети страни.</li>
<li><strong>CLS:</strong> винаги задавайте ширина и височина на изображения и видео, запазвайте място за банери и реклами.</li>
</ul>
<h2>Как да ги измерите</h2>
<p>Използвайте безплатни инструменти като <strong>PageSpeed Insights</strong> и отчета Core Web Vitals в <strong>Google Search Console</strong>, който показва реалните данни на вашите потребители. Внимание: лабораторните тестове и данните от практиката може да се различават, защото зависят от реални устройства и връзки.</p>
<p>Производителността не е технически детайл: тя е част от SEO и от клиентското изживяване. Грижим се за нея във всеки <a href="/bg/uslugi/web-razrabotka/">сайт, който изработваме</a>, тя е решаваща за <a href="/bg/uslugi/ecommerce/">онлайн магазин</a>, който продава, и върви ръка за ръка със <a href="/bg/blog/seo-per-piccole-imprese/">SEO за малкия бизнес</a>. Ако сайтът ви е бавен, <a href="/bg/kontakti/">поискайте анализ</a>.</p>""",
  faqs=[
   ("Какво са Core Web Vitals?", "Това са три метрики, с които Google измерва потребителското изживяване на сайта: LCP (скорост на зареждане), INP (отзивчивост) и CLS (визуална стабилност). Заедно показват колко бърз и приятен е сайтът за ползване."),
   ("Влияят ли Core Web Vitals на SEO?", "Да. Те са фактор за класиране в Google: при еднакво съдържание сайт, който спазва праговете, обикновено се класира по-добре и задържа посетителите по-дълго, намалявайки отпадането."),
   ("Кои са идеалните стойности на Core Web Vitals?", "LCP под 2,5 секунди, INP под 200 милисекунди и CLS под 0,1. Над тези прагове изживяването се смята за 'нуждае се от подобрение' или 'слабо'."),
   ("Как да измеря Core Web Vitals на моя сайт?", "С безплатни инструменти като Google PageSpeed Insights и отчета Core Web Vitals в Google Search Console, който показва реалните данни, събрани от вашите посетители."),
  ]),
)),

# 9 ─────────────────────────────────────────────────────────────
dict(slug="app-nativa-vs-pwa", section="Mobile Apps", read=7, lang=dict(
 it=dict(
  title="App Nativa vs PWA: Differenze, Costi e Quando Usarle | Carbon Stealth",
  desc="App nativa o PWA? Differenze reali, costi, prestazioni e limiti di ciascuna soluzione, con una tabella di confronto per capire quale conviene al tuo progetto.",
  body="""<p>In breve: un'<strong>app nativa</strong> si installa dallo store (App Store, Google Play), &egrave; sviluppata per iOS e Android e ha accesso completo alle funzioni del dispositivo. Una <strong>PWA</strong> (Progressive Web App) &egrave; un sito web che si comporta come un'app: si apre dal browser, si pu&ograve; installare sulla schermata home senza passare dagli store e funziona anche offline. La nativa offre le prestazioni migliori; la PWA costa meno, raggiunge tutti e si aggiorna da sola.</p>
<h2>Le differenze principali</h2>
<div class="ctbl"><table><thead><tr><th>Criterio</th><th>App nativa</th><th>PWA</th></tr></thead><tbody>
<tr><td>Distribuzione</td><td>Store Apple e Google</td><td>Link diretto, nessuno store</td></tr>
<tr><td>Costo indicativo</td><td>da &euro;3.000</td><td>da &euro;1.500</td></tr>
<tr><td>Accesso all'hardware</td><td>Completo (NFC, Bluetooth, sensori)</td><td>Limitato</td></tr>
<tr><td>Funziona offline</td><td>S&igrave;</td><td>S&igrave; (con cache)</td></tr>
<tr><td>Notifiche push</td><td>Complete</td><td>S&igrave;, con limiti su iOS</td></tr>
<tr><td>Aggiornamenti</td><td>Tramite store</td><td>Automatici e istantanei</td></tr>
</tbody></table></div>
<h2>Quando conviene una PWA</h2>
<p>La PWA &egrave; la scelta giusta quando l'obiettivo &egrave; raggiungere pi&ugrave; persone possibile con un budget contenuto. Non richiede il download dallo store, quindi elimina l'attrito iniziale, e con un solo progetto copri desktop, iOS e Android. &Egrave; perfetta per cataloghi, portali di prenotazione, aree clienti e servizi basati su contenuti. In pratica &egrave; un <a href="/servizi/sviluppo-siti-web/">sito web</a> costruito con criteri avanzati: veloce, installabile e utilizzabile anche senza connessione.</p>
<h2>Quando serve un'app nativa</h2>
<p>L'app nativa vale l'investimento in pi&ugrave; quando servono prestazioni elevate, un uso intenso dell'hardware (fotocamera, NFC, sensori di movimento), notifiche push affidabili anche su iOS o un funzionamento offline complesso. &Egrave; il caso di app di gaming, strumenti sul campo, applicazioni che gestiscono grandi volumi di dati locali o che devono comparire negli store per una questione di credibilit&agrave; del brand.</p>
<p>Nel dubbio, il nostro consiglio &egrave; partire dalla PWA e passare al nativo solo se emerge un limite reale. Approfondisci i costi nella guida <a href="/blog/quanto-costa-app-mobile/">quanto costa sviluppare un'app</a>, scopri il nostro <a href="/servizi/app-mobile/">servizio di sviluppo app</a> e lo <a href="/servizi/sviluppo-software/">sviluppo software su misura</a>, oppure <a href="/contatti/">raccontaci il tuo progetto</a> per un consiglio onesto.</p>""",
  faqs=[
   ("Qual e la differenza tra app nativa e PWA?", "L'app nativa si installa dallo store ed e sviluppata per iOS e Android con accesso completo al dispositivo. La PWA e un sito web installabile dal browser che funziona come un'app, anche offline, ma con accesso hardware piu limitato."),
   ("Una PWA costa meno di un'app nativa?", "Di solito si. Una PWA parte da circa &euro;1.500 perche usa un solo progetto per tutte le piattaforme, mentre un'app nativa parte da &euro;3.000 e cresce se servono versioni separate per iOS e Android."),
   ("Le PWA funzionano su iPhone?", "Si, le PWA funzionano su iOS e si possono aggiungere alla schermata home. Alcune funzioni avanzate, come certe notifiche push, restano piu limitate rispetto ad Android o a un'app nativa."),
   ("Meglio partire con una PWA o con un'app nativa?", "Per la maggior parte dei progetti conviene partire con una PWA: costa meno, raggiunge tutti subito e si aggiorna da sola. Si passa al nativo solo quando emerge un limite concreto di prestazioni o di hardware."),
  ]),
 en=dict(
  title="Native App vs PWA: Differences, Costs and When to Use Each | Carbon Stealth",
  desc="Native app or PWA? Real differences, costs, performance and limits of each option, with a comparison table to see which one fits your project best.",
  body="""<p>In short: a <strong>native app</strong> installs from the store (App Store, Google Play), is built for iOS and Android and has full access to device features. A <strong>PWA</strong> (Progressive Web App) is a website that behaves like an app: it opens in the browser, can be installed to the home screen without going through a store and works offline too. Native gives the best performance; a PWA costs less, reaches everyone and updates itself.</p>
<h2>The main differences</h2>
<div class="ctbl"><table><thead><tr><th>Criterion</th><th>Native app</th><th>PWA</th></tr></thead><tbody>
<tr><td>Distribution</td><td>Apple and Google stores</td><td>Direct link, no store</td></tr>
<tr><td>Typical cost</td><td>from &euro;3,000</td><td>from &euro;1,500</td></tr>
<tr><td>Hardware access</td><td>Full (NFC, Bluetooth, sensors)</td><td>Limited</td></tr>
<tr><td>Works offline</td><td>Yes</td><td>Yes (with caching)</td></tr>
<tr><td>Push notifications</td><td>Full</td><td>Yes, limited on iOS</td></tr>
<tr><td>Updates</td><td>Through the store</td><td>Automatic and instant</td></tr>
</tbody></table></div>
<h2>When a PWA makes sense</h2>
<p>A PWA is the right call when the goal is to reach as many people as possible on a modest budget. There is no store download, so it removes the initial friction, and a single project covers desktop, iOS and Android. It is perfect for catalogs, booking portals, customer areas and content-driven services. In practice it is a <a href="/en/services/web-development/">website</a> built to advanced standards: fast, installable and usable even without a connection.</p>
<h2>When you need a native app</h2>
<p>A native app is worth the extra investment when you need high performance, heavy use of the hardware (camera, NFC, motion sensors), reliable push notifications even on iOS, or complex offline behavior. That covers games, field tools, apps that handle large volumes of local data, or apps that need to appear in the stores for brand credibility.</p>
<p>When in doubt, our advice is to start with a PWA and move to native only if a real limit appears. Dig into the numbers in our guide on <a href="/en/blog/quanto-costa-app-mobile/">how much it costs to build an app</a>, see our <a href="/en/services/mobile-apps/">app development service</a> and <a href="/en/services/software-development/">custom software development</a>, or <a href="/en/contact/">tell us about your project</a> for honest advice.</p>""",
  faqs=[
   ("What is the difference between a native app and a PWA?", "A native app installs from the store and is built for iOS and Android with full device access. A PWA is a website installable from the browser that works like an app, even offline, but with more limited hardware access."),
   ("Does a PWA cost less than a native app?", "Usually yes. A PWA starts at around &euro;1,500 because it uses one project for all platforms, while a native app starts at &euro;3,000 and grows if you need separate iOS and Android versions."),
   ("Do PWAs work on iPhone?", "Yes, PWAs work on iOS and can be added to the home screen. Some advanced features, such as certain push notifications, remain more limited than on Android or a native app."),
   ("Should I start with a PWA or a native app?", "For most projects it is best to start with a PWA: it costs less, reaches everyone immediately and updates itself. You move to native only when a concrete performance or hardware limit appears."),
  ]),
 bg=dict(
  title="Нативно Приложение срещу PWA: Разлики, Цени и Кога Кое | Carbon Stealth",
  desc="Нативно приложение или PWA? Реални разлики, цени, производителност и ограничения на всяко решение, с таблица за сравнение кое е подходящо за вашия проект.",
  body="""<p>Накратко: <strong>нативното приложение</strong> се инсталира от магазина (App Store, Google Play), разработено е за iOS и Android и има пълен достъп до функциите на устройството. <strong>PWA</strong> (Progressive Web App) е уебсайт, който се държи като приложение: отваря се от браузъра, може да се инсталира на началния екран без магазин и работи дори офлайн. Нативното дава най-добра производителност; PWA струва по-малко, достига до всички и се обновява само.</p>
<h2>Основните разлики</h2>
<div class="ctbl"><table><thead><tr><th>Критерий</th><th>Нативно приложение</th><th>PWA</th></tr></thead><tbody>
<tr><td>Разпространение</td><td>Магазините на Apple и Google</td><td>Директен линк, без магазин</td></tr>
<tr><td>Ориентировъчна цена</td><td>от &euro;3000</td><td>от &euro;1500</td></tr>
<tr><td>Достъп до хардуера</td><td>Пълен (NFC, Bluetooth, сензори)</td><td>Ограничен</td></tr>
<tr><td>Работа офлайн</td><td>Да</td><td>Да (с кеширане)</td></tr>
<tr><td>Push известия</td><td>Пълни</td><td>Да, с ограничения на iOS</td></tr>
<tr><td>Обновления</td><td>През магазина</td><td>Автоматични и мигновени</td></tr>
</tbody></table></div>
<h2>Кога е подходяща PWA</h2>
<p>PWA е правилният избор, когато целта е да достигнете до възможно най-много хора със скромен бюджет. Няма изтегляне от магазин, което премахва началната бариера, а с един проект покривате десктоп, iOS и Android. Идеална е за каталози, портали за резервации, клиентски зони и услуги, базирани на съдържание. На практика това е <a href="/bg/uslugi/web-razrabotka/">уебсайт</a>, изграден по съвременни стандарти: бърз, инсталируем и използваем дори без връзка.</p>
<h2>Кога ви трябва нативно приложение</h2>
<p>Нативното приложение си струва допълнителната инвестиция, когато са нужни висока производителност, интензивно ползване на хардуера (камера, NFC, сензори за движение), надеждни push известия дори на iOS или сложна офлайн работа. Това важи за игри, инструменти за работа на терен, приложения с големи обеми локални данни или такива, които трябва да присъстват в магазините заради доверието към бранда.</p>
<p>При колебание съветът ни е да започнете с PWA и да преминете към нативно само ако се появи реално ограничение. Разгледайте цените в статията <a href="/bg/blog/quanto-costa-app-mobile/">колко струва разработката на приложение</a>, вижте нашата <a href="/bg/uslugi/mobilni-prilozheniya/">услуга за мобилни приложения</a> и <a href="/bg/uslugi/softuer/">софтуер по поръчка</a>, или <a href="/bg/kontakti/">разкажете ни за проекта си</a> за честен съвет.</p>""",
  faqs=[
   ("Каква е разликата между нативно приложение и PWA?", "Нативното приложение се инсталира от магазина и е разработено за iOS и Android с пълен достъп до устройството. PWA е уебсайт, инсталируем от браузъра, който работи като приложение, дори офлайн, но с по-ограничен достъп до хардуера."),
   ("PWA по-евтина ли е от нативно приложение?", "Обикновено да. PWA започва от около &euro;1500, защото използва един проект за всички платформи, докато нативно приложение започва от &euro;3000 и поскъпва, ако са нужни отделни версии за iOS и Android."),
   ("Работят ли PWA на iPhone?", "Да, PWA работят на iOS и могат да се добавят на началния екран. Някои по-сложни функции, като определени push известия, остават по-ограничени спрямо Android или нативно приложение."),
   ("Да започна ли с PWA или с нативно приложение?", "За повечето проекти е най-добре да започнете с PWA: струва по-малко, достига до всички веднага и се обновява сама. Преминава се към нативно само когато се появи конкретно ограничение в производителността или хардуера."),
  ]),
)),

# 10 ────────────────────────────────────────────────────────────
dict(slug="migrazione-sito-senza-perdere-seo", section="SEO", read=8, lang=dict(
 it=dict(
  title="Rifare il Sito senza Perdere il Posizionamento SEO | Carbon Stealth",
  desc="Come rifare o migrare un sito senza perdere il posizionamento su Google: redirect 301, mappatura degli URL, contenuti e controlli post-lancio. Guida pratica.",
  body="""<p>Rifare un sito senza perdere posizioni su Google &egrave; possibile, ma richiede metodo: la causa numero uno dei cali di traffico dopo un restyling &egrave; la mancanza di <strong>redirect 301</strong> dai vecchi URL ai nuovi. Se mantieni la struttura degli indirizzi, reindirizzi correttamente le pagine che cambiano e conservi i contenuti che gi&agrave; si posizionano, la migrazione avviene senza danni e spesso migliora il ranking.</p>
<h2>I passaggi per non perdere posizioni</h2>
<ul>
<li><strong>Mappa gli URL:</strong> elenca tutti gli indirizzi attuali e associa a ognuno la pagina corrispondente sul nuovo sito.</li>
<li><strong>Imposta i redirect 301:</strong> ogni URL che cambia deve puntare in modo permanente al nuovo, senza catene di reindirizzamenti.</li>
<li><strong>Conserva i contenuti forti:</strong> non tagliare i testi delle pagine che gi&agrave; portano traffico; semmai migliorali.</li>
<li><strong>Mantieni title e meta description:</strong> aggiornali con criterio, senza stravolgere le pagine che funzionano.</li>
<li><strong>Aggiorna la sitemap XML</strong> e inviala di nuovo in Google Search Console.</li>
</ul>
<h2>Gli errori che fanno crollare il traffico</h2>
<div class="ctbl"><table><thead><tr><th>Errore</th><th>Conseguenza</th></tr></thead><tbody>
<tr><td>Nessun redirect 301</td><td>Le vecchie pagine danno errore 404 e perdi il ranking</td></tr>
<tr><td>Redirect verso la home</td><td>Google li tratta come soft 404, valore perso</td></tr>
<tr><td>Blocco da robots.txt o noindex</td><td>Il sito sparisce dai risultati di ricerca</td></tr>
<tr><td>Sito nuovo pi&ugrave; lento</td><td>Peggiorano i <a href="/blog/core-web-vitals-guida/">Core Web Vitals</a> e le posizioni</td></tr>
</tbody></table></div>
<h2>I controlli dopo il lancio</h2>
<p>Nei giorni successivi al passaggio online tieni d'occhio Google Search Console: controlla le pagine in errore, verifica che la scansione proceda e osserva l'andamento delle impressioni. Un piccolo calo temporaneo &egrave; normale mentre Google rielabora il sito; se dopo due o tre settimane il traffico non torna, c'&egrave; un problema tecnico da correggere.</p>
<p>Noi gestiamo la migrazione come parte del nostro lavoro di <a href="/servizi/sviluppo-siti-web/">sviluppo siti web</a> e di <a href="/servizi/seo/">SEO</a>, con particolare attenzione quando si cambia piattaforma, ad esempio in un progetto <a href="/blog/woocommerce-vs-shopify/">WooCommerce o Shopify</a>. Se stai per rifare il sito, <a href="/contatti/">parliamone prima</a>: un piano di redirect fatto bene vale mesi di posizionamento.</p>""",
  faqs=[
   ("Perche un sito perde posizioni dopo il restyling?", "Nella maggior parte dei casi per la mancanza di redirect 301: i vecchi URL danno errore 404 e Google perde il collegamento con le pagine gia posizionate. Anche noindex, robots.txt e un sito piu lento possono causare cali."),
   ("Cosa sono i redirect 301 e perche sono importanti?", "Un redirect 301 e un reindirizzamento permanente da un vecchio URL a uno nuovo. Trasferisce a Google il valore SEO accumulato dalla vecchia pagina, evitando che il posizionamento vada perso quando l'indirizzo cambia."),
   ("Quanto tempo serve per recuperare il ranking dopo una migrazione?", "Un piccolo calo temporaneo e normale nei primi giorni. Con i redirect impostati bene, il traffico si stabilizza di solito entro due o tre settimane. Se non torna, c'e un problema tecnico da individuare."),
   ("Posso cambiare piattaforma senza perdere la SEO?", "Si, anche cambiando CMS o passando da un e-commerce a un altro. Serve mappare gli URL, impostare i redirect 301 e conservare i contenuti che gia funzionano. La migrazione va pianificata prima del lancio, non dopo."),
  ]),
 en=dict(
  title="Redesign Your Site Without Losing SEO Rankings | Carbon Stealth",
  desc="How to redesign or migrate a site without losing Google rankings: 301 redirects, URL mapping, content and post-launch checks. A practical guide.",
  body="""<p>Redesigning a site without losing Google rankings is possible, but it takes method: the number-one cause of traffic drops after a redesign is missing <strong>301 redirects</strong> from old URLs to new ones. If you keep the URL structure, redirect the pages that change correctly and preserve the content that already ranks, the migration happens without damage and often improves rankings.</p>
<h2>The steps to keep your rankings</h2>
<ul>
<li><strong>Map the URLs:</strong> list every current address and match each to the corresponding page on the new site.</li>
<li><strong>Set 301 redirects:</strong> every URL that changes must point permanently to the new one, with no redirect chains.</li>
<li><strong>Keep your strong content:</strong> don't cut the copy on pages that already bring traffic; improve it instead.</li>
<li><strong>Preserve titles and meta descriptions:</strong> update them sensibly, without overhauling pages that work.</li>
<li><strong>Update the XML sitemap</strong> and resubmit it in Google Search Console.</li>
</ul>
<h2>The mistakes that crash your traffic</h2>
<div class="ctbl"><table><thead><tr><th>Mistake</th><th>Consequence</th></tr></thead><tbody>
<tr><td>No 301 redirects</td><td>Old pages return 404 and you lose the ranking</td></tr>
<tr><td>Redirecting everything to the home</td><td>Google treats them as soft 404s, value lost</td></tr>
<tr><td>Blocked by robots.txt or noindex</td><td>The site disappears from search results</td></tr>
<tr><td>Slower new site</td><td>Worse <a href="/en/blog/core-web-vitals-guida/">Core Web Vitals</a> and rankings</td></tr>
</tbody></table></div>
<h2>Post-launch checks</h2>
<p>In the days after going live, keep an eye on Google Search Console: check pages in error, confirm crawling is proceeding and watch how impressions trend. A small temporary dip is normal while Google reprocesses the site; if traffic hasn't recovered after two or three weeks, there is a technical problem to fix.</p>
<p>We handle migration as part of our <a href="/en/services/web-development/">web development</a> and <a href="/en/services/seo/">SEO</a> work, with extra care when the platform changes, for example in a <a href="/en/blog/woocommerce-vs-shopify/">WooCommerce or Shopify</a> project. If you're about to redesign, <a href="/en/contact/">let's talk first</a>: a well-built redirect plan is worth months of rankings.</p>""",
  faqs=[
   ("Why does a site lose rankings after a redesign?", "In most cases because of missing 301 redirects: old URLs return 404 and Google loses the link to pages that already ranked. Noindex, robots.txt and a slower site can also cause drops."),
   ("What are 301 redirects and why do they matter?", "A 301 redirect is a permanent redirect from an old URL to a new one. It passes the SEO value the old page built up to the new page, preventing rankings from being lost when the address changes."),
   ("How long does it take to recover rankings after a migration?", "A small temporary dip is normal in the first days. With redirects set up correctly, traffic usually stabilizes within two or three weeks. If it doesn't recover, there is a technical problem to find."),
   ("Can I change platform without losing SEO?", "Yes, even when changing CMS or moving from one e-commerce to another. You need to map URLs, set 301 redirects and keep the content that already works. The migration must be planned before launch, not after."),
  ]),
 bg=dict(
  title="Смяна на Сайта без Загуба на SEO Позиции | Carbon Stealth",
  desc="Как да обновите или мигрирате сайт без загуба на позиции в Google: 301 пренасочвания, картографиране на URL адресите, съдържание и проверки след стартиране.",
  body="""<p>Обновяването на сайт без загуба на позиции в Google е възможно, но изисква метод: причина номер едно за спад на трафика след редизайн е липсата на <strong>301 пренасочвания</strong> от старите URL адреси към новите. Ако запазите структурата на адресите, пренасочите правилно променените страници и съхраните съдържанието, което вече се класира, миграцията минава без щети и често подобрява позициите.</p>
<h2>Стъпките, за да не загубите позиции</h2>
<ul>
<li><strong>Картографирайте URL адресите:</strong> избройте всички текущи адреси и свържете всеки със съответната страница в новия сайт.</li>
<li><strong>Настройте 301 пренасочвания:</strong> всеки променен URL трябва да сочи постоянно към новия, без вериги от пренасочвания.</li>
<li><strong>Запазете силното съдържание:</strong> не махайте текстовете на страниците, които вече носят трафик; по-скоро ги подобрете.</li>
<li><strong>Запазете title и meta description:</strong> обновете ги разумно, без да променяте изцяло работещите страници.</li>
<li><strong>Обновете XML sitemap</strong> и я подайте отново в Google Search Console.</li>
</ul>
<h2>Грешките, които сриват трафика</h2>
<div class="ctbl"><table><thead><tr><th>Грешка</th><th>Последствие</th></tr></thead><tbody>
<tr><td>Без 301 пренасочвания</td><td>Старите страници връщат 404 и губите позициите</td></tr>
<tr><td>Пренасочване към началната страница</td><td>Google ги третира като soft 404, стойността се губи</td></tr>
<tr><td>Блокиране от robots.txt или noindex</td><td>Сайтът изчезва от резултатите</td></tr>
<tr><td>По-бавен нов сайт</td><td>Влошени <a href="/bg/blog/core-web-vitals-guida/">Core Web Vitals</a> и позиции</td></tr>
</tbody></table></div>
<h2>Проверките след стартиране</h2>
<p>В дните след пускането онлайн следете Google Search Console: проверявайте страниците с грешки, уверете се, че обхождането протича, и наблюдавайте импресиите. Малък временен спад е нормален, докато Google преработва сайта; ако след две-три седмици трафикът не се върне, има технически проблем за отстраняване.</p>
<p>Ние управляваме миграцията като част от работата ни по <a href="/bg/uslugi/web-razrabotka/">изработка на сайтове</a> и <a href="/bg/uslugi/seo/">SEO</a>, с особено внимание при смяна на платформата, например в проект <a href="/bg/blog/woocommerce-vs-shopify/">WooCommerce или Shopify</a>. Ако предстои да обновявате сайта, <a href="/bg/kontakti/">нека поговорим предварително</a>: добре изготвеният план за пренасочвания струва месеци позиции.</p>""",
  faqs=[
   ("Защо сайтът губи позиции след редизайн?", "В повечето случаи заради липса на 301 пренасочвания: старите URL адреси връщат 404 и Google губи връзката със страниците, които вече се класираха. Noindex, robots.txt и по-бавен сайт също могат да причинят спад."),
   ("Какво са 301 пренасочванията и защо са важни?", "301 пренасочването е постоянно пренасочване от стар URL към нов. То прехвърля към Google натрупаната SEO стойност на старата страница, така че позициите да не се загубят при смяна на адреса."),
   ("За колко време се възстановяват позициите след миграция?", "Малък временен спад е нормален в първите дни. С правилно настроени пренасочвания трафикът обикновено се стабилизира до две-три седмици. Ако не се върне, има технически проблем за откриване."),
   ("Мога ли да сменя платформата без загуба на SEO?", "Да, дори при смяна на CMS или преминаване от един магазин към друг. Нужно е да картографирате URL адресите, да настроите 301 пренасочвания и да запазите работещото съдържание. Миграцията се планира преди стартиране, не след него."),
  ]),
)),

# 11 ────────────────────────────────────────────────────────────
dict(slug="sicurezza-sito-web-checklist", section="Web Development", read=8, lang=dict(
 it=dict(
  title="Sicurezza di un Sito Web: Checklist Completa 2026 | Carbon Stealth",
  desc="La checklist completa per la sicurezza di un sito web nel 2026: HTTPS, aggiornamenti, backup, password, protezione dei form e monitoraggio. Passi concreti.",
  body="""<p>La sicurezza di un sito web si costruisce con pochi accorgimenti applicati con costanza: <strong>HTTPS attivo</strong>, software sempre aggiornato, <strong>backup automatici</strong>, password forti e protezione dei moduli da spam e attacchi. La maggior parte delle violazioni non colpisce grandi aziende ma piccoli siti trascurati, con plugin non aggiornati o password deboli. La buona notizia &egrave; che le stesse contromisure fermano quasi tutti gli attacchi automatici.</p>
<h2>La checklist essenziale</h2>
<div class="ctbl"><table><thead><tr><th>Area</th><th>Cosa fare</th><th>Priorit&agrave;</th></tr></thead><tbody>
<tr><td>Certificato HTTPS</td><td>SSL attivo su tutto il sito, reindirizzamento da http</td><td>Alta</td></tr>
<tr><td>Aggiornamenti</td><td>CMS, plugin e temi sempre alla versione pi&ugrave; recente</td><td>Alta</td></tr>
<tr><td>Backup</td><td>Copie automatiche giornaliere, ripristino testato</td><td>Alta</td></tr>
<tr><td>Password e accessi</td><td>Password forti, autenticazione a due fattori</td><td>Alta</td></tr>
<tr><td>Form e commenti</td><td>Protezione anti-spam, validazione dei dati</td><td>Media</td></tr>
<tr><td>Firewall (WAF)</td><td>Blocco del traffico malevolo e dei bot</td><td>Media</td></tr>
</tbody></table></div>
<h2>Le basi da non trascurare mai</h2>
<p>Il certificato HTTPS non &egrave; pi&ugrave; opzionale: senza, i browser mostrano un avviso di sito non sicuro e Google penalizza. Gli aggiornamenti sono la difesa pi&ugrave; sottovalutata: la maggior parte delle intrusioni sfrutta falle gi&agrave; corrette da tempo su plugin lasciati vecchi. Infine, i backup automatici sono la tua rete di sicurezza: se qualcosa va storto, ripristini il sito in pochi minuti invece di rifarlo da zero.</p>
<h2>La sicurezza dipende anche dall'hosting</h2>
<p>Un buon <a href="/servizi/hosting/">hosting</a> fa met&agrave; del lavoro: isola i siti, applica firewall, offre backup gestiti e certificati SSL inclusi. La sicurezza &egrave; ancora pi&ugrave; critica su un <a href="/servizi/ecommerce/">e-commerce</a>, dove si trattano dati di pagamento, e va progettata fin dall'inizio in ogni <a href="/servizi/sviluppo-siti-web/">sito che sviluppiamo</a>. Va poi di pari passo con le prestazioni: un sito ben mantenuto &egrave; anche pi&ugrave; veloce, come spieghiamo nella guida ai <a href="/blog/core-web-vitals-guida/">Core Web Vitals</a>.</p>
<p>Se non sai in che stato &egrave; il tuo sito, <a href="/contatti/">chiedici un controllo</a>: verifichiamo HTTPS, aggiornamenti, backup e configurazione in modo trasparente.</p>""",
  faqs=[
   ("Come rendere sicuro un sito web?", "Con pochi accorgimenti costanti: HTTPS attivo su tutto il sito, CMS e plugin sempre aggiornati, backup automatici giornalieri, password forti con autenticazione a due fattori e protezione anti-spam sui form. Sono le stesse misure che fermano quasi tutti gli attacchi automatici."),
   ("Il certificato HTTPS e obbligatorio?", "Di fatto si. Senza HTTPS i browser mostrano un avviso di sito non sicuro, gli utenti se ne vanno e Google penalizza il posizionamento. Un certificato SSL e spesso incluso nell'hosting e va attivato su tutte le pagine."),
   ("Ogni quanto vanno aggiornati plugin e CMS?", "Il prima possibile dopo il rilascio di un aggiornamento, soprattutto se corregge una falla di sicurezza. La maggior parte delle intrusioni sfrutta vulnerabilita gia note su software lasciato vecchio. Backup regolari permettono di aggiornare senza rischi."),
   ("Cosa fare se il sito viene violato?", "Se hai un backup recente e testato, ripristini il sito in pochi minuti, poi individui e chiudi la falla usata dall'attaccante, aggiorni tutto e cambi le password. Senza backup, il recupero e molto piu lungo e costoso."),
  ]),
 en=dict(
  title="Website Security: Complete 2026 Checklist | Carbon Stealth",
  desc="The complete website security checklist for 2026: HTTPS, updates, backups, passwords, form protection and monitoring. Concrete steps you can act on.",
  body="""<p>Website security is built with a few measures applied consistently: <strong>HTTPS enabled</strong>, software always updated, <strong>automatic backups</strong>, strong passwords and protection of forms against spam and attacks. Most breaches don't hit large companies but small, neglected sites with outdated plugins or weak passwords. The good news is that the same measures stop almost every automated attack.</p>
<h2>The essential checklist</h2>
<div class="ctbl"><table><thead><tr><th>Area</th><th>What to do</th><th>Priority</th></tr></thead><tbody>
<tr><td>HTTPS certificate</td><td>SSL active across the whole site, redirect from http</td><td>High</td></tr>
<tr><td>Updates</td><td>CMS, plugins and themes on the latest version</td><td>High</td></tr>
<tr><td>Backups</td><td>Automatic daily copies, tested restore</td><td>High</td></tr>
<tr><td>Passwords and access</td><td>Strong passwords, two-factor authentication</td><td>High</td></tr>
<tr><td>Forms and comments</td><td>Anti-spam protection, data validation</td><td>Medium</td></tr>
<tr><td>Firewall (WAF)</td><td>Block malicious traffic and bots</td><td>Medium</td></tr>
</tbody></table></div>
<h2>The basics you must never skip</h2>
<p>An HTTPS certificate is no longer optional: without it, browsers show a "not secure" warning and Google penalizes you. Updates are the most underrated defense: most intrusions exploit flaws already fixed long ago in plugins left outdated. Finally, automatic backups are your safety net: if something goes wrong, you restore the site in minutes instead of rebuilding it from scratch.</p>
<h2>Security also depends on your hosting</h2>
<p>Good <a href="/en/services/hosting/">hosting</a> does half the work: it isolates sites, applies firewalls, offers managed backups and includes SSL certificates. Security is even more critical on an <a href="/en/services/ecommerce/">e-commerce</a>, where payment data is handled, and it must be designed in from the start in every <a href="/en/services/web-development/">site we build</a>. It also goes hand in hand with performance: a well-maintained site is also faster, as we explain in our <a href="/en/blog/core-web-vitals-guida/">Core Web Vitals</a> guide.</p>
<p>If you don't know what state your site is in, <a href="/en/contact/">ask us for a check</a>: we review HTTPS, updates, backups and configuration transparently.</p>""",
  faqs=[
   ("How do I make a website secure?", "With a few consistent measures: HTTPS across the whole site, CMS and plugins always updated, automatic daily backups, strong passwords with two-factor authentication and anti-spam protection on forms. These are the same measures that stop almost every automated attack."),
   ("Is an HTTPS certificate mandatory?", "Effectively yes. Without HTTPS browsers show a not-secure warning, users leave and Google penalizes your ranking. An SSL certificate is often included with hosting and should be active on all pages."),
   ("How often should plugins and the CMS be updated?", "As soon as possible after an update is released, especially if it fixes a security flaw. Most intrusions exploit known vulnerabilities in outdated software. Regular backups let you update without risk."),
   ("What should I do if the site is hacked?", "If you have a recent, tested backup, you restore the site in minutes, then find and close the flaw the attacker used, update everything and change passwords. Without a backup, recovery is much longer and costlier."),
  ]),
 bg=dict(
  title="Сигурност на Сайт: Пълен Чеклист 2026 | Carbon Stealth",
  desc="Пълният чеклист за сигурност на сайт през 2026: HTTPS, обновления, резервни копия, пароли, защита на формите и наблюдение. Конкретни стъпки за действие.",
  body="""<p>Сигурността на сайта се изгражда с няколко мерки, прилагани постоянно: <strong>активен HTTPS</strong>, винаги обновен софтуер, <strong>автоматични резервни копия</strong>, силни пароли и защита на формите от спам и атаки. Повечето пробиви не засягат големи компании, а малки занемарени сайтове с необновени плъгини или слаби пароли. Добрата новина е, че същите мерки спират почти всички автоматизирани атаки.</p>
<h2>Основният чеклист</h2>
<div class="ctbl"><table><thead><tr><th>Област</th><th>Какво да направите</th><th>Приоритет</th></tr></thead><tbody>
<tr><td>HTTPS сертификат</td><td>Активен SSL на целия сайт, пренасочване от http</td><td>Висок</td></tr>
<tr><td>Обновления</td><td>CMS, плъгини и теми на най-новата версия</td><td>Висок</td></tr>
<tr><td>Резервни копия</td><td>Автоматични ежедневни копия, тестван възстановяване</td><td>Висок</td></tr>
<tr><td>Пароли и достъп</td><td>Силни пароли, двуфакторна автентикация</td><td>Висок</td></tr>
<tr><td>Форми и коментари</td><td>Защита от спам, валидиране на данните</td><td>Среден</td></tr>
<tr><td>Защитна стена (WAF)</td><td>Блокиране на зловреден трафик и ботове</td><td>Среден</td></tr>
</tbody></table></div>
<h2>Основите, които никога не пропускайте</h2>
<p>HTTPS сертификатът вече не е по избор: без него браузърите показват предупреждение за несигурен сайт, а Google санкционира. Обновленията са най-подценяваната защита: повечето прониквания използват пропуски, отдавна отстранени в оставени стари плъгини. И накрая, автоматичните резервни копия са вашата предпазна мрежа: ако нещо се обърка, възстановявате сайта за минути, вместо да го правите наново.</p>
<h2>Сигурността зависи и от хостинга</h2>
<p>Добрият <a href="/bg/uslugi/hosting/">хостинг</a> върши половината работа: изолира сайтовете, прилага защитни стени, предлага управлявани резервни копия и включени SSL сертификати. Сигурността е още по-критична при <a href="/bg/uslugi/ecommerce/">онлайн магазин</a>, където се обработват платежни данни, и трябва да се залага от самото начало във всеки <a href="/bg/uslugi/web-razrabotka/">сайт, който изработваме</a>. Тя върви ръка за ръка и с производителността: добре поддържаният сайт е и по-бърз, както обясняваме в ръководството за <a href="/bg/blog/core-web-vitals-guida/">Core Web Vitals</a>.</p>
<p>Ако не знаете в какво състояние е сайтът ви, <a href="/bg/kontakti/">поискайте проверка</a>: преглеждаме прозрачно HTTPS, обновленията, резервните копия и конфигурацията.</p>""",
  faqs=[
   ("Как да направя сайта си сигурен?", "С няколко постоянни мерки: активен HTTPS на целия сайт, винаги обновени CMS и плъгини, автоматични ежедневни резервни копия, силни пароли с двуфакторна автентикация и защита от спам на формите. Това са същите мерки, които спират почти всички автоматизирани атаки."),
   ("Задължителен ли е HTTPS сертификатът?", "На практика да. Без HTTPS браузърите показват предупреждение за несигурен сайт, потребителите си тръгват и Google санкционира позициите. SSL сертификат често е включен в хостинга и трябва да е активен на всички страници."),
   ("Колко често трябва да се обновяват плъгините и CMS?", "Възможно най-скоро след излизане на обновление, особено ако то отстранява пропуск в сигурността. Повечето прониквания използват вече известни уязвимости в остарял софтуер. Редовните резервни копия позволяват обновяване без риск."),
   ("Какво да правя, ако сайтът бъде хакнат?", "Ако имате скорошно и тествано резервно копие, възстановявате сайта за минути, после откривате и затваряте използвания пропуск, обновявате всичко и сменяте паролите. Без резервно копие възстановяването е много по-дълго и скъпо."),
  ]),
)),

# 12 ────────────────────────────────────────────────────────────
dict(slug="quanto-tempo-per-un-sito", section="Web Development", read=6, lang=dict(
 it=dict(
  title="Quanto Tempo Serve per Fare un Sito Web? | Carbon Stealth",
  desc="Quanto tempo serve per realizzare un sito web nel 2026? Tempistiche reali per sito vetrina, e-commerce e portali, cosa allunga i tempi e come accelerare.",
  body="""<p>In genere un <strong>sito vetrina</strong> richiede da <strong>1 a 2 settimane</strong>, un <strong>e-commerce</strong> da <strong>3 a 6 settimane</strong> e un <strong>portale su misura</strong> da <strong>2 a 4 mesi</strong>. La variabile che pesa di pi&ugrave; non &egrave; il codice ma i contenuti: testi, foto e materiali. Un progetto con contenuti pronti procede in fretta; uno in cui bisogna scrivere tutto da zero richiede pi&ugrave; tempo, indipendentemente dalla bravura di chi sviluppa.</p>
<h2>Tempistiche per tipo di progetto</h2>
<div class="ctbl"><table><thead><tr><th>Progetto</th><th>Tempo indicativo</th><th>Cosa incide</th></tr></thead><tbody>
<tr><td>Landing page</td><td>3-7 giorni</td><td>Un solo obiettivo, poche sezioni</td></tr>
<tr><td>Sito vetrina (5-8 pagine)</td><td>1-2 settimane</td><td>Numero di pagine e contenuti</td></tr>
<tr><td>E-commerce</td><td>3-6 settimane</td><td>Catalogo, pagamenti, integrazioni</td></tr>
<tr><td>Portale / software web</td><td>2-4 mesi</td><td>Funzioni su misura, aree riservate</td></tr>
</tbody></table></div>
<h2>Le fasi di un progetto</h2>
<ul>
<li><strong>Analisi e struttura:</strong> definizione di obiettivi, pagine e funzioni (pochi giorni).</li>
<li><strong>Design:</strong> grafica e approvazione delle bozze.</li>
<li><strong>Sviluppo:</strong> costruzione delle pagine e delle funzionalit&agrave;.</li>
<li><strong>Contenuti e revisioni:</strong> inserimento di testi e immagini, correzioni.</li>
<li><strong>Test e pubblicazione:</strong> controlli finali, ottimizzazione e messa online.</li>
</ul>
<h2>Cosa allunga (o accorcia) i tempi</h2>
<p>A rallentare un progetto sono quasi sempre gli stessi fattori: contenuti forniti in ritardo, molti cicli di revisione e richieste che cambiano in corsa. Per andare veloce aiuta avere fin dall'inizio testi, logo e foto, un solo referente che approva e obiettivi chiari. Anche il budget conta sulle prestazioni finali, come spieghiamo nella guida <a href="/blog/quanto-costa-sito-web/">quanto costa un sito web</a>.</p>
<p>Nel preventivo concordiamo sempre una data di consegna precisa, che rispettiamo. Scopri il nostro <a href="/servizi/sviluppo-siti-web/">servizio di sviluppo siti web</a>, valuta un <a href="/servizi/ecommerce/">e-commerce</a> se vendi online e <a href="/contatti/">scrivici</a> per una stima sui tuoi tempi.</p>""",
  faqs=[
   ("Quanto tempo serve per fare un sito web?", "Un sito vetrina richiede in genere 1-2 settimane, un e-commerce 3-6 settimane e un portale su misura 2-4 mesi. Il fattore che incide di piu sono i contenuti: con testi e foto pronti i tempi si riducono sensibilmente."),
   ("Perche alcuni siti richiedono piu tempo di altri?", "Dipende dal numero di pagine, dalle funzioni richieste e soprattutto dai contenuti. Molti cicli di revisione e richieste che cambiano in corsa allungano i tempi piu di quanto si pensi, indipendentemente dallo sviluppo."),
   ("Posso velocizzare la realizzazione del mio sito?", "Si: preparando in anticipo testi, logo e foto, nominando un solo referente che approva le bozze e definendo obiettivi chiari fin dall'inizio. Cosi si riducono le attese e i cicli di revisione."),
   ("Fissate una data di consegna certa?", "Si. Nel preventivo indichiamo una data di consegna precisa e la rispettiamo. Eventuali ritardi derivano quasi sempre da contenuti forniti in ritardo o da modifiche richieste durante il progetto."),
  ]),
 en=dict(
  title="How Long Does It Take to Build a Website? | Carbon Stealth",
  desc="How long does it take to build a website in 2026? Real timelines for brochure sites, e-commerce and portals, what slows things down and how to speed up.",
  body="""<p>As a rule a <strong>brochure site</strong> takes <strong>1 to 2 weeks</strong>, an <strong>e-commerce</strong> <strong>3 to 6 weeks</strong> and a <strong>custom portal</strong> <strong>2 to 4 months</strong>. The variable that weighs most isn't the code but the content: text, photos and materials. A project with content ready moves fast; one where everything has to be written from scratch takes longer, no matter how good the developer is.</p>
<h2>Timelines by type of project</h2>
<div class="ctbl"><table><thead><tr><th>Project</th><th>Typical time</th><th>What drives it</th></tr></thead><tbody>
<tr><td>Landing page</td><td>3-7 days</td><td>A single goal, few sections</td></tr>
<tr><td>Brochure site (5-8 pages)</td><td>1-2 weeks</td><td>Number of pages and content</td></tr>
<tr><td>E-commerce</td><td>3-6 weeks</td><td>Catalog, payments, integrations</td></tr>
<tr><td>Portal / web software</td><td>2-4 months</td><td>Custom features, member areas</td></tr>
</tbody></table></div>
<h2>The phases of a project</h2>
<ul>
<li><strong>Analysis and structure:</strong> defining goals, pages and features (a few days).</li>
<li><strong>Design:</strong> visuals and approval of the drafts.</li>
<li><strong>Development:</strong> building the pages and functionality.</li>
<li><strong>Content and revisions:</strong> adding text and images, corrections.</li>
<li><strong>Testing and launch:</strong> final checks, optimization and going live.</li>
</ul>
<h2>What lengthens (or shortens) the timeline</h2>
<p>What slows a project down is almost always the same: content delivered late, many revision rounds and requirements that change mid-way. To move fast it helps to have text, logo and photos from the start, a single person who approves, and clear goals. Budget also affects the final result, as we explain in our guide on <a href="/en/blog/quanto-costa-sito-web/">how much a website costs</a>.</p>
<p>In the quote we always agree on a precise delivery date, and we meet it. See our <a href="/en/services/web-development/">web development service</a>, consider an <a href="/en/services/ecommerce/">e-commerce</a> if you sell online, and <a href="/en/contact/">get in touch</a> for an estimate on your timeline.</p>""",
  faqs=[
   ("How long does it take to build a website?", "A brochure site usually takes 1-2 weeks, an e-commerce 3-6 weeks and a custom portal 2-4 months. The biggest factor is content: with text and photos ready, timelines shorten noticeably."),
   ("Why do some sites take longer than others?", "It depends on the number of pages, the features required and above all the content. Many revision rounds and requirements that change mid-way lengthen timelines more than people expect, regardless of the development itself."),
   ("Can I speed up the build of my site?", "Yes: by preparing text, logo and photos in advance, appointing a single person to approve drafts and setting clear goals from the start. That reduces waiting and revision cycles."),
   ("Do you set a firm delivery date?", "Yes. In the quote we state a precise delivery date and we meet it. Any delays almost always come from content delivered late or changes requested during the project."),
  ]),
 bg=dict(
  title="Колко Време Отнема Изработката на Сайт? | Carbon Stealth",
  desc="Колко време отнема изработката на сайт през 2026? Реални срокове за визитен сайт, онлайн магазин и портал, какво ги удължава и как да ускорите процеса.",
  body="""<p>По правило <strong>визитният сайт</strong> отнема <strong>1 до 2 седмици</strong>, <strong>онлайн магазинът</strong> <strong>3 до 6 седмици</strong>, а <strong>порталът по поръчка</strong> <strong>2 до 4 месеца</strong>. Факторът с най-голяма тежест не е кодът, а съдържанието: текстове, снимки и материали. Проект с готово съдържание върви бързо; такъв, при който всичко се пише от нулата, отнема повече време, независимо колко добър е разработчикът.</p>
<h2>Срокове по тип проект</h2>
<div class="ctbl"><table><thead><tr><th>Проект</th><th>Ориентировъчно време</th><th>Какво влияе</th></tr></thead><tbody>
<tr><td>Landing страница</td><td>3-7 дни</td><td>Една цел, малко секции</td></tr>
<tr><td>Визитен сайт (5-8 страници)</td><td>1-2 седмици</td><td>Брой страници и съдържание</td></tr>
<tr><td>Онлайн магазин</td><td>3-6 седмици</td><td>Каталог, плащания, интеграции</td></tr>
<tr><td>Портал / уеб софтуер</td><td>2-4 месеца</td><td>Функции по поръчка, клиентски зони</td></tr>
</tbody></table></div>
<h2>Фазите на един проект</h2>
<ul>
<li><strong>Анализ и структура:</strong> дефиниране на цели, страници и функции (няколко дни).</li>
<li><strong>Дизайн:</strong> графика и одобрение на макетите.</li>
<li><strong>Разработка:</strong> изграждане на страниците и функционалностите.</li>
<li><strong>Съдържание и корекции:</strong> добавяне на текстове и изображения, поправки.</li>
<li><strong>Тестове и пускане:</strong> финални проверки, оптимизация и качване онлайн.</li>
</ul>
<h2>Какво удължава (или скъсява) сроковете</h2>
<p>Проектите се забавят почти винаги от едно и също: съдържание, предадено със закъснение, много цикли корекции и изисквания, които се променят в движение. За да върви бързо, помага да имате от самото начало текстове, лого и снимки, само едно лице, което одобрява, и ясни цели. Бюджетът също влияе на крайния резултат, както обясняваме в статията <a href="/bg/blog/quanto-costa-sito-web/">колко струва изработката на сайт</a>.</p>
<p>В офертата винаги договаряме точна дата за предаване и я спазваме. Вижте нашата <a href="/bg/uslugi/web-razrabotka/">услуга за изработка на сайтове</a>, преценете <a href="/bg/uslugi/ecommerce/">онлайн магазин</a>, ако продавате онлайн, и <a href="/bg/kontakti/">ни пишете</a> за оценка на вашите срокове.</p>""",
  faqs=[
   ("Колко време отнема изработката на сайт?", "Визитен сайт обикновено отнема 1-2 седмици, онлайн магазин 3-6 седмици, а портал по поръчка 2-4 месеца. Най-важният фактор е съдържанието: с готови текстове и снимки сроковете се съкращават осезаемо."),
   ("Защо някои сайтове отнемат повече време от други?", "Зависи от броя страници, нужните функции и най-вече от съдържанието. Многото цикли корекции и променящите се в движение изисквания удължават сроковете повече, отколкото се очаква, независимо от самата разработка."),
   ("Мога ли да ускоря изработката на моя сайт?", "Да: като подготвите предварително текстове, лого и снимки, определите само едно лице, което одобрява макетите, и зададете ясни цели от самото начало. Така се намаляват изчакванията и циклите корекции."),
   ("Определяте ли точна дата за предаване?", "Да. В офертата посочваме точна дата за предаване и я спазваме. Евентуални забавяния почти винаги идват от съдържание, предадено със закъснение, или от промени, поискани по време на проекта."),
  ]),
)),

# 13 ────────────────────────────────────────────────────────────
dict(slug="landing-page-che-converte", section="Web Development", read=7, lang=dict(
 it=dict(
  title="Come Creare una Landing Page che Converte | Carbon Stealth",
  desc="Come creare una landing page che converte: struttura, titolo, call to action, prova sociale e velocita. Gli elementi che trasformano i visitatori in clienti.",
  body="""<p>Una landing page che converte ha un solo obiettivo, un messaggio chiaro nei primi secondi e una <strong>call to action</strong> evidente e ripetuta. Non &egrave; una questione di grafica appariscente: converte la pagina che risponde subito alla domanda del visitatore, elimina le distrazioni e rende semplice il passo successivo. Meno scelte offri, pi&ugrave; azioni ottieni.</p>
<h2>Gli elementi che fanno convertire</h2>
<ul>
<li><strong>Titolo chiaro:</strong> in una frase dice cosa offri e a chi, senza slogan vaghi.</li>
<li><strong>Una sola azione:</strong> un obiettivo per pagina (chiamata, modulo, acquisto), niente menu che distraggono.</li>
<li><strong>Call to action visibile:</strong> un pulsante con testo concreto, ripetuto lungo la pagina.</li>
<li><strong>Benefici prima delle caratteristiche:</strong> spiega cosa ci guadagna il cliente, non solo cosa fai.</li>
<li><strong>Prova sociale:</strong> testimonianze, casi reali, loghi, numeri concreti quando esistono.</li>
<li><strong>Velocit&agrave;:</strong> una pagina lenta perde visitatori prima ancora del primo scroll.</li>
</ul>
<h2>La struttura che funziona</h2>
<div class="ctbl"><table><thead><tr><th>Sezione</th><th>Scopo</th></tr></thead><tbody>
<tr><td>Sopra la piega</td><td>Titolo, sottotitolo e prima call to action</td></tr>
<tr><td>Problema e soluzione</td><td>Mostri di aver capito il bisogno del visitatore</td></tr>
<tr><td>Benefici</td><td>Cosa ottiene concretamente, in punti brevi</td></tr>
<tr><td>Prova sociale</td><td>Recensioni, casi, garanzie</td></tr>
<tr><td>Call to action finale</td><td>Un ultimo invito chiaro all'azione</td></tr>
</tbody></table></div>
<h2>Velocit&agrave; e test</h2>
<p>La velocit&agrave; &egrave; parte della conversione: ogni secondo di attesa in pi&ugrave; fa perdere visitatori, per questo curiamo i <a href="/blog/core-web-vitals-guida/">Core Web Vitals</a> anche sulle landing. Dopo il lancio, misura e migliora: cambia un titolo, sposta la call to action, prova un'immagine diversa e osserva i risultati. Una landing non &egrave; mai finita, si affina nel tempo.</p>
<p>Una landing page ben fatta &egrave; il complemento naturale di una campagna e della <a href="/servizi/seo/">SEO</a>. La costruiamo come parte del nostro <a href="/servizi/sviluppo-siti-web/">servizio di sviluppo siti web</a>, a partire da &euro;500. Se hai una campagna da lanciare, <a href="/contatti/">raccontacela</a> e la trasformiamo in una pagina che converte.</p>""",
  faqs=[
   ("Cosa rende una landing page efficace?", "Un solo obiettivo, un titolo chiaro nei primi secondi e una call to action evidente e ripetuta. Contano piu la chiarezza del messaggio e la rimozione delle distrazioni che una grafica appariscente."),
   ("Quanto costa una landing page?", "Una landing page professionale parte da &euro;500. Il prezzo dipende dalla lunghezza, dai contenuti da produrre e dalle integrazioni, come moduli, pagamenti o strumenti di tracciamento delle conversioni."),
   ("Quante call to action mettere in una landing page?", "Una sola azione, ripetuta piu volte lungo la pagina. Offrire troppe scelte diverse disperde l'attenzione e riduce le conversioni: meglio guidare il visitatore verso un unico passo chiaro."),
   ("La velocita influenza le conversioni?", "Si, molto. Ogni secondo di caricamento in piu fa perdere visitatori prima ancora che leggano. Ottimizzare i Core Web Vitals di una landing e uno dei modi piu diretti per aumentare le conversioni."),
  ]),
 en=dict(
  title="How to Build a Landing Page That Converts | Carbon Stealth",
  desc="How to build a landing page that converts: structure, headline, call to action, social proof and speed. The elements that turn visitors into customers.",
  body="""<p>A landing page that converts has a single goal, a clear message in the first few seconds and an obvious, repeated <strong>call to action</strong>. It isn't about flashy design: the page that converts is the one that answers the visitor's question immediately, removes distractions and makes the next step easy. The fewer choices you offer, the more action you get.</p>
<h2>The elements that drive conversions</h2>
<ul>
<li><strong>Clear headline:</strong> in one sentence it says what you offer and to whom, no vague slogans.</li>
<li><strong>A single action:</strong> one goal per page (call, form, purchase), no menus that distract.</li>
<li><strong>Visible call to action:</strong> a button with concrete wording, repeated down the page.</li>
<li><strong>Benefits before features:</strong> explain what the customer gains, not just what you do.</li>
<li><strong>Social proof:</strong> testimonials, real cases, logos, concrete numbers when they exist.</li>
<li><strong>Speed:</strong> a slow page loses visitors before the first scroll.</li>
</ul>
<h2>The structure that works</h2>
<div class="ctbl"><table><thead><tr><th>Section</th><th>Purpose</th></tr></thead><tbody>
<tr><td>Above the fold</td><td>Headline, subheadline and first call to action</td></tr>
<tr><td>Problem and solution</td><td>Show you understand the visitor's need</td></tr>
<tr><td>Benefits</td><td>What they concretely gain, in short points</td></tr>
<tr><td>Social proof</td><td>Reviews, cases, guarantees</td></tr>
<tr><td>Final call to action</td><td>One last clear invitation to act</td></tr>
</tbody></table></div>
<h2>Speed and testing</h2>
<p>Speed is part of conversion: every extra second of waiting loses visitors, which is why we look after <a href="/en/blog/core-web-vitals-guida/">Core Web Vitals</a> on landing pages too. After launch, measure and improve: change a headline, move the call to action, try a different image and watch the results. A landing page is never finished, it is refined over time.</p>
<p>A well-built landing page is the natural companion to a campaign and to <a href="/en/services/seo/">SEO</a>. We build it as part of our <a href="/en/services/web-development/">web development service</a>, from &euro;500. If you have a campaign to launch, <a href="/en/contact/">tell us about it</a> and we'll turn it into a page that converts.</p>""",
  faqs=[
   ("What makes a landing page effective?", "A single goal, a clear headline in the first seconds and an obvious, repeated call to action. Clarity of message and removal of distractions matter more than flashy design."),
   ("How much does a landing page cost?", "A professional landing page starts at &euro;500. The price depends on length, the content to produce and integrations such as forms, payments or conversion-tracking tools."),
   ("How many calls to action should a landing page have?", "One action, repeated several times down the page. Offering too many different choices scatters attention and lowers conversions: it's better to guide the visitor toward one clear step."),
   ("Does speed affect conversions?", "Yes, a lot. Every extra second of loading loses visitors before they even read. Optimizing a landing page's Core Web Vitals is one of the most direct ways to increase conversions."),
  ]),
 bg=dict(
  title="Как да Направите Landing Page с Висока Конверсия | Carbon Stealth",
  desc="Как да направите landing page с висока конверсия: структура, заглавие, призив за действие, социално доказателство и скорост. Елементите, които превръщат посетители в клиенти.",
  body="""<p>Landing page с висока конверсия има една-единствена цел, ясно послание в първите секунди и очевиден, повтарящ се <strong>призив за действие</strong>. Не става дума за пищен дизайн: конвертира страницата, която отговаря веднага на въпроса на посетителя, премахва разсейващите елементи и прави следващата стъпка лесна. Колкото по-малко избори предлагате, толкова повече действия получавате.</p>
<h2>Елементите, които водят до конверсия</h2>
<ul>
<li><strong>Ясно заглавие:</strong> в едно изречение казва какво предлагате и на кого, без мъгляви слогани.</li>
<li><strong>Едно действие:</strong> една цел на страница (обаждане, форма, покупка), без разсейващи менюта.</li>
<li><strong>Видим призив за действие:</strong> бутон с конкретен текст, повторен по цялата страница.</li>
<li><strong>Ползи преди характеристики:</strong> обяснете какво печели клиентът, а не само какво правите.</li>
<li><strong>Социално доказателство:</strong> отзиви, реални случаи, лога, конкретни числа, когато ги има.</li>
<li><strong>Скорост:</strong> бавната страница губи посетители още преди първото скролване.</li>
</ul>
<h2>Структурата, която работи</h2>
<div class="ctbl"><table><thead><tr><th>Секция</th><th>Цел</th></tr></thead><tbody>
<tr><td>Над сгъвката</td><td>Заглавие, подзаглавие и първи призив за действие</td></tr>
<tr><td>Проблем и решение</td><td>Показвате, че разбирате нуждата на посетителя</td></tr>
<tr><td>Ползи</td><td>Какво печели конкретно, в кратки точки</td></tr>
<tr><td>Социално доказателство</td><td>Отзиви, случаи, гаранции</td></tr>
<tr><td>Финален призив за действие</td><td>Последна ясна покана за действие</td></tr>
</tbody></table></div>
<h2>Скорост и тестване</h2>
<p>Скоростта е част от конверсията: всяка допълнителна секунда изчакване губи посетители, затова се грижим за <a href="/bg/blog/core-web-vitals-guida/">Core Web Vitals</a> и на landing страниците. След пускането измервайте и подобрявайте: сменете заглавие, преместете призива за действие, пробвайте друго изображение и наблюдавайте резултатите. Landing страницата никога не е завършена, тя се усъвършенства с времето.</p>
<p>Добре направената landing page е естественото допълнение към една кампания и към <a href="/bg/uslugi/seo/">SEO</a>. Изграждаме я като част от нашата <a href="/bg/uslugi/web-razrabotka/">услуга за изработка на сайтове</a>, от &euro;500. Ако имате кампания за стартиране, <a href="/bg/kontakti/">разкажете ни</a> и ще я превърнем в страница, която конвертира.</p>""",
  faqs=[
   ("Какво прави една landing page ефективна?", "Една цел, ясно заглавие в първите секунди и очевиден, повтарящ се призив за действие. Яснотата на посланието и премахването на разсейващите елементи имат по-голямо значение от пищния дизайн."),
   ("Колко струва landing page?", "Професионална landing page започва от &euro;500. Цената зависи от дължината, съдържанието за изработка и интеграциите, като форми, плащания или инструменти за проследяване на конверсии."),
   ("Колко призива за действие да сложа в landing page?", "Едно действие, повторено няколко пъти по страницата. Предлагането на твърде много различни избори разсейва вниманието и намалява конверсиите: по-добре е да насочите посетителя към една ясна стъпка."),
   ("Влияе ли скоростта на конверсиите?", "Да, много. Всяка допълнителна секунда зареждане губи посетители още преди да прочетат. Оптимизирането на Core Web Vitals на landing страницата е един от най-преките начини да увеличите конверсиите."),
  ]),
)),

# 14 ────────────────────────────────────────────────────────────
dict(slug="erp-vs-gestionale", section="ERP", read=8, lang=dict(
 it=dict(
  title="ERP vs Gestionale: Quali Differenze e Cosa Scegliere | Carbon Stealth",
  desc="ERP o gestionale? Differenze reali tra un sistema ERP integrato e un semplice software gestionale, con costi, vantaggi e quando conviene passare all'uno o all'altro.",
  body="""<p>In breve: un <strong>gestionale</strong> risolve un'area specifica (fatturazione, magazzino o contabilit&agrave;), mentre un <strong>ERP</strong> integra pi&ugrave; aree in un unico sistema con dati condivisi. Il gestionale costa meno e basta a chi ha esigenze semplici; l'ERP conviene quando i dati sparsi tra pi&ugrave; programmi e fogli Excel iniziano a causare errori, doppie digitazioni e perdite di tempo.</p>
<h2>Le differenze principali</h2>
<div class="ctbl"><table><thead><tr><th>Criterio</th><th>Gestionale</th><th>ERP</th></tr></thead><tbody>
<tr><td>Ambito</td><td>Un'area (es. magazzino o fatture)</td><td>Pi&ugrave; aree integrate</td></tr>
<tr><td>Dati</td><td>Separati per programma</td><td>Unici e condivisi</td></tr>
<tr><td>Costo indicativo</td><td>da &euro;2.000</td><td>da &euro;5.000</td></tr>
<tr><td>Adatto a</td><td>Piccole attivit&agrave;, esigenze semplici</td><td>PMI con pi&ugrave; reparti</td></tr>
<tr><td>Crescita</td><td>Limitata, per moduli isolati</td><td>Scalabile, si aggiungono moduli</td></tr>
</tbody></table></div>
<h2>Quando basta un gestionale</h2>
<p>Se ti serve solo emettere fatture, tenere il magazzino o gestire gli ordini, un <a href="/servizi/sviluppo-software/">software gestionale su misura</a> &egrave; la scelta pi&ugrave; sensata: costa meno, si impara in fretta e copre bene un singolo processo. Molte piccole attivit&agrave; non hanno bisogno d'altro, almeno all'inizio.</p>
<h2>Quando conviene un ERP</h2>
<p>Quando i reparti crescono e gli stessi dati vengono digitati in pi&ugrave; programmi diversi, un <a href="/servizi/erp/">ERP</a> elimina le duplicazioni e d&agrave; una visione unica di vendite, magazzino, acquisti e contabilit&agrave;. Il segnale tipico &egrave; questo: passi pi&ugrave; tempo a far &laquo;quadrare&raquo; i numeri tra un file e l'altro che a lavorare. Ne parliamo in dettaglio nelle guide <a href="/blog/cos-e-un-erp/">cos'&egrave; un ERP</a> e <a href="/blog/erp-per-pmi/">ERP per PMI</a>.</p>
<p>La scelta giusta dipende dalla tua organizzazione, non da quale sia pi&ugrave; &laquo;avanzato&raquo;. Spesso conviene partire da un gestionale ben fatto ed evolverlo verso un ERP quando serve davvero. <a href="/contatti/">Raccontaci come lavori oggi</a> e ti diciamo cosa ha senso per te.</p>""",
  faqs=[
   ("Qual e la differenza tra ERP e gestionale?", "Un gestionale copre un'area specifica come fatturazione o magazzino, con dati separati. Un ERP integra piu aree in un unico sistema con dati condivisi, evitando doppie digitazioni e dando una visione d'insieme dell'azienda."),
   ("Costa di piu un ERP o un gestionale?", "Un ERP costa di piu: parte da &euro;5.000 contro i &euro;2.000 di un software gestionale su misura. In cambio integra piu reparti e cresce con l'azienda, mentre il gestionale resta limitato a un singolo processo."),
   ("Quando conviene passare da un gestionale a un ERP?", "Quando gli stessi dati vengono inseriti in piu programmi diversi e si perde tempo a farli quadrare tra loro. E il segnale che i processi sono cresciuti e serve un sistema unico e integrato."),
   ("Posso partire da un gestionale ed evolvere verso un ERP?", "Si, ed e spesso la scelta piu sensata. Si parte da un gestionale ben progettato che copre l'area piu critica e si aggiungono moduli integrati man mano che l'azienda cresce, senza rifare tutto da zero."),
  ]),
 en=dict(
  title="ERP vs Basic Management Software: What to Choose | Carbon Stealth",
  desc="ERP or basic management software? Real differences between an integrated ERP and simple management software, with costs, benefits and when each one makes sense.",
  body="""<p>In short: <strong>basic management software</strong> solves one specific area (invoicing, inventory or accounting), while an <strong>ERP</strong> integrates several areas into a single system with shared data. Management software costs less and is enough for simple needs; an ERP makes sense when data scattered across multiple programs and spreadsheets starts causing errors, double entry and wasted time.</p>
<h2>The main differences</h2>
<div class="ctbl"><table><thead><tr><th>Criterion</th><th>Management software</th><th>ERP</th></tr></thead><tbody>
<tr><td>Scope</td><td>One area (e.g. inventory or invoices)</td><td>Several integrated areas</td></tr>
<tr><td>Data</td><td>Separate per program</td><td>Single and shared</td></tr>
<tr><td>Typical cost</td><td>from &euro;2,000</td><td>from &euro;5,000</td></tr>
<tr><td>Best for</td><td>Small businesses, simple needs</td><td>SMEs with several departments</td></tr>
<tr><td>Growth</td><td>Limited, isolated modules</td><td>Scalable, add modules</td></tr>
</tbody></table></div>
<h2>When management software is enough</h2>
<p>If you only need to issue invoices, track inventory or manage orders, custom <a href="/en/services/software-development/">management software</a> is the sensible choice: it costs less, is quick to learn and covers a single process well. Many small businesses need nothing more, at least at the start.</p>
<h2>When an ERP makes sense</h2>
<p>When departments grow and the same data gets typed into several different programs, an <a href="/en/services/erp/">ERP</a> removes the duplication and gives a single view of sales, inventory, purchasing and accounting. The typical sign is this: you spend more time making the numbers "match" across files than actually working. We cover this in detail in our guides on <a href="/en/blog/cos-e-un-erp/">what an ERP is</a> and <a href="/en/blog/erp-per-pmi/">ERP for SMEs</a>.</p>
<p>The right choice depends on your organization, not on which is more "advanced". It often makes sense to start with well-built management software and grow it into an ERP when you truly need it. <a href="/en/contact/">Tell us how you work today</a> and we'll say what makes sense for you.</p>""",
  faqs=[
   ("What is the difference between an ERP and management software?", "Management software covers a specific area such as invoicing or inventory, with separate data. An ERP integrates several areas into a single system with shared data, avoiding double entry and giving an overall view of the company."),
   ("Does an ERP cost more than management software?", "An ERP costs more: from &euro;5,000 versus &euro;2,000 for custom management software. In return it integrates several departments and grows with the company, whereas management software stays limited to a single process."),
   ("When should I move from management software to an ERP?", "When the same data is entered into several different programs and you waste time reconciling it. That's the sign that processes have grown and you need a single, integrated system."),
   ("Can I start with management software and grow into an ERP?", "Yes, and it's often the most sensible choice. You start with well-designed software covering the most critical area and add integrated modules as the company grows, without rebuilding everything from scratch."),
  ]),
 bg=dict(
  title="ERP срещу Обикновен Складов Софтуер: Какво да Изберете | Carbon Stealth",
  desc="ERP или обикновен складов софтуер? Реални разлики между интегрирана ERP система и прост софтуер, с цени, ползи и кога кое решение е подходящо.",
  body="""<p>Накратко: <strong>обикновеният софтуер</strong> решава една конкретна област (фактуриране, склад или счетоводство), докато <strong>ERP</strong> интегрира няколко области в една система със споделени данни. Обикновеният софтуер струва по-малко и е достатъчен при прости нужди; ERP си струва, когато данните, разпръснати между няколко програми и таблици в Excel, започнат да причиняват грешки, двойно въвеждане и загуба на време.</p>
<h2>Основните разлики</h2>
<div class="ctbl"><table><thead><tr><th>Критерий</th><th>Обикновен софтуер</th><th>ERP</th></tr></thead><tbody>
<tr><td>Обхват</td><td>Една област (напр. склад или фактури)</td><td>Няколко интегрирани области</td></tr>
<tr><td>Данни</td><td>Разделени по програми</td><td>Единни и споделени</td></tr>
<tr><td>Ориентировъчна цена</td><td>от &euro;2000</td><td>от &euro;5000</td></tr>
<tr><td>Подходящ за</td><td>Малки фирми, прости нужди</td><td>МСП с няколко отдела</td></tr>
<tr><td>Растеж</td><td>Ограничен, изолирани модули</td><td>Мащабируем, добавят се модули</td></tr>
</tbody></table></div>
<h2>Кога обикновеният софтуер е достатъчен</h2>
<p>Ако трябва само да издавате фактури, да водите склад или да управлявате поръчки, <a href="/bg/uslugi/softuer/">складов софтуер по поръчка</a> е разумният избор: струва по-малко, учи се бързо и покрива добре един процес. Много малки фирми не се нуждаят от повече, поне в началото.</p>
<h2>Кога си струва ERP</h2>
<p>Когато отделите нараснат и едни и същи данни се въвеждат в няколко различни програми, <a href="/bg/uslugi/erp/">ERP</a> премахва дублирането и дава единна картина на продажби, склад, доставки и счетоводство. Типичният сигнал е този: прекарвате повече време да &laquo;уравнявате&raquo; числата между файловете, отколкото да работите. Разглеждаме това подробно в статиите <a href="/bg/blog/cos-e-un-erp/">какво е ERP</a> и <a href="/bg/blog/erp-per-pmi/">ERP за МСП</a>.</p>
<p>Правилният избор зависи от вашата организация, а не от това кое е по-&laquo;модерно&raquo;. Често е разумно да започнете с добре направен софтуер и да го развиете в ERP, когато наистина потрябва. <a href="/bg/kontakti/">Разкажете ни как работите днес</a> и ще ви кажем какво има смисъл за вас.</p>""",
  faqs=[
   ("Каква е разликата между ERP и обикновен софтуер?", "Обикновеният софтуер покрива конкретна област като фактуриране или склад, с разделени данни. ERP интегрира няколко области в една система със споделени данни, избягвайки двойно въвеждане и давайки цялостна картина на фирмата."),
   ("ERP по-скъп ли е от обикновен софтуер?", "ERP струва повече: от &euro;5000 срещу &euro;2000 за складов софтуер по поръчка. В замяна интегрира няколко отдела и расте с фирмата, докато обикновеният софтуер остава ограничен до един процес."),
   ("Кога да премина от обикновен софтуер към ERP?", "Когато едни и същи данни се въвеждат в няколко различни програми и губите време да ги уравнявате. Това е сигналът, че процесите са нараснали и е нужна единна, интегрирана система."),
   ("Мога ли да започна с обикновен софтуер и да премина към ERP?", "Да, и това често е най-разумният избор. Започвате с добре проектиран софтуер за най-критичната област и добавяте интегрирани модули с растежа на фирмата, без да правите всичко наново."),
  ]),
)),

# 15 ────────────────────────────────────────────────────────────
dict(slug="integrazione-pagamenti-online", section="E-commerce", read=8, lang=dict(
 it=dict(
  title="Integrare i Pagamenti Online: Stripe, PayPal e Alternative | Carbon Stealth",
  desc="Come integrare i pagamenti online nel tuo sito o e-commerce: Stripe, PayPal e alternative a confronto, commissioni, sicurezza e quale scegliere per il tuo caso.",
  body="""<p>Per incassare online i due standard sono <strong>Stripe</strong> e <strong>PayPal</strong>: Stripe &egrave; ideale per carte di credito e abbonamenti con un'esperienza integrata nel sito, PayPal aggiunge un metodo che molti clienti conoscono e di cui si fidano. Nella pratica conviene offrirli entrambi: pi&ugrave; metodi di pagamento accetti, meno carrelli abbandoni. Le commissioni si aggirano sull'1,5-3% per transazione a seconda del gateway e del tipo di carta.</p>
<h2>Stripe, PayPal e alternative a confronto</h2>
<div class="ctbl"><table><thead><tr><th>Gateway</th><th>Punti di forza</th><th>Da valutare</th></tr></thead><tbody>
<tr><td>Stripe</td><td>Carte, abbonamenti, ottima integrazione tecnica</td><td>Setup pi&ugrave; tecnico</td></tr>
<tr><td>PayPal</td><td>Fiducia diffusa, checkout rapido</td><td>Commissioni, gestione dispute</td></tr>
<tr><td>Bonifico / SEPA</td><td>Commissioni basse, utile nel B2B</td><td>Incasso non immediato</td></tr>
<tr><td>Contrassegno</td><td>Rassicura chi diffida</td><td>Rischio resi e mancati ritiri</td></tr>
</tbody></table></div>
<h2>Sicurezza e conformit&agrave;</h2>
<p>La buona notizia &egrave; che con Stripe e PayPal i dati della carta non transitano mai dal tuo server: la conformit&agrave; PCI &egrave; gestita dal gateway, che riduce enormemente i tuoi obblighi e i rischi. Restano a tuo carico le basi di <a href="/blog/sicurezza-sito-web-checklist/">sicurezza del sito</a>: HTTPS su tutte le pagine, software aggiornato e un <a href="/servizi/hosting/">hosting</a> affidabile. In Europa &egrave; obbligatoria l'autenticazione forte (SCA/3D Secure), gi&agrave; supportata da entrambi.</p>
<h2>Quale scegliere</h2>
<p>Per un <a href="/servizi/ecommerce/">e-commerce</a> standard, la combinazione Stripe + PayPal copre la stragrande maggioranza dei clienti. Se vendi in abbonamento o hai bisogno di logiche su misura, Stripe integrato in un <a href="/servizi/sviluppo-software/">software su misura</a> offre la massima flessibilit&agrave;. La scelta della piattaforma incide anche sulle commissioni, come spieghiamo nella guida <a href="/blog/woocommerce-vs-shopify/">WooCommerce vs Shopify</a>.</p>
<p>Integriamo i pagamenti in modo sicuro su qualsiasi sito o e-commerce. Se vuoi iniziare a incassare online, <a href="/contatti/">scrivici</a>: valutiamo insieme i gateway giusti per il tuo caso.</p>""",
  faqs=[
   ("Meglio Stripe o PayPal per un e-commerce?", "Conviene offrirli entrambi. Stripe e ideale per pagamenti con carta e abbonamenti, con un'esperienza integrata nel sito; PayPal aggiunge un metodo diffuso e di cui molti clienti si fidano. Piu metodi accetti, meno carrelli abbandoni."),
   ("Quanto costano le commissioni sui pagamenti online?", "In genere tra l'1,5% e il 3% per transazione, a seconda del gateway e del tipo di carta. A questo puo aggiungersi una piccola quota fissa per operazione. Il bonifico SEPA ha commissioni piu basse ma incasso non immediato."),
   ("Integrare i pagamenti e sicuro per i dati delle carte?", "Si. Con Stripe e PayPal i dati della carta non passano dal tuo server: la conformita PCI e gestita dal gateway. Devi comunque garantire HTTPS, software aggiornato e un hosting affidabile."),
   ("Quali metodi di pagamento conviene offrire?", "Almeno carta (Stripe) e PayPal, che coprono la maggior parte dei clienti. Nel B2B puo essere utile il bonifico SEPA, mentre il contrassegno rassicura chi diffida ma comporta il rischio di resi e mancati ritiri."),
  ]),
 en=dict(
  title="Integrating Online Payments: Stripe, PayPal and Alternatives | Carbon Stealth",
  desc="How to integrate online payments into your site or e-commerce: Stripe, PayPal and alternatives compared, fees, security and which to choose for your case.",
  body="""<p>For taking payments online the two standards are <strong>Stripe</strong> and <strong>PayPal</strong>: Stripe is ideal for cards and subscriptions with an experience built into your site, while PayPal adds a method many customers know and trust. In practice it's best to offer both: the more payment methods you accept, the fewer carts you lose. Fees are around 1.5-3% per transaction depending on the gateway and card type.</p>
<h2>Stripe, PayPal and alternatives compared</h2>
<div class="ctbl"><table><thead><tr><th>Gateway</th><th>Strengths</th><th>To consider</th></tr></thead><tbody>
<tr><td>Stripe</td><td>Cards, subscriptions, excellent technical integration</td><td>More technical setup</td></tr>
<tr><td>PayPal</td><td>Widespread trust, fast checkout</td><td>Fees, dispute handling</td></tr>
<tr><td>Bank transfer / SEPA</td><td>Low fees, useful in B2B</td><td>Payment not immediate</td></tr>
<tr><td>Cash on delivery</td><td>Reassures wary buyers</td><td>Risk of returns and no-shows</td></tr>
</tbody></table></div>
<h2>Security and compliance</h2>
<p>The good news is that with Stripe and PayPal the card data never passes through your server: PCI compliance is handled by the gateway, which greatly reduces your obligations and risks. What stays on you is basic <a href="/en/blog/sicurezza-sito-web-checklist/">website security</a>: HTTPS on all pages, updated software and reliable <a href="/en/services/hosting/">hosting</a>. In Europe strong authentication (SCA/3D Secure) is mandatory, and both already support it.</p>
<h2>Which to choose</h2>
<p>For a standard <a href="/en/services/ecommerce/">e-commerce</a>, the Stripe + PayPal combination covers the vast majority of customers. If you sell by subscription or need custom logic, Stripe integrated into <a href="/en/services/software-development/">custom software</a> offers the most flexibility. The platform you pick also affects fees, as we explain in our <a href="/en/blog/woocommerce-vs-shopify/">WooCommerce vs Shopify</a> guide.</p>
<p>We integrate payments securely into any site or e-commerce. If you want to start taking payments online, <a href="/en/contact/">get in touch</a>: we'll assess the right gateways for your case together.</p>""",
  faqs=[
   ("Stripe or PayPal for an e-commerce?", "It's best to offer both. Stripe is ideal for card payments and subscriptions with an experience built into the site; PayPal adds a widespread method many customers trust. The more methods you accept, the fewer carts you lose."),
   ("How much are online payment fees?", "Typically between 1.5% and 3% per transaction, depending on the gateway and card type. A small fixed fee per transaction may also apply. SEPA bank transfer has lower fees but the payment is not immediate."),
   ("Is integrating payments safe for card data?", "Yes. With Stripe and PayPal the card data doesn't pass through your server: PCI compliance is handled by the gateway. You still need to ensure HTTPS, updated software and reliable hosting."),
   ("Which payment methods should I offer?", "At least card (Stripe) and PayPal, which cover most customers. In B2B, SEPA bank transfer can be useful, while cash on delivery reassures wary buyers but carries the risk of returns and no-shows."),
  ]),
 bg=dict(
  title="Интеграция на Онлайн Плащания: Stripe, PayPal и Алтернативи | Carbon Stealth",
  desc="Как да интегрирате онлайн плащания в сайта или магазина си: Stripe, PayPal и алтернативи в сравнение, такси, сигурност и кое да изберете за вашия случай.",
  body="""<p>За приемане на плащания онлайн двата стандарта са <strong>Stripe</strong> и <strong>PayPal</strong>: Stripe е идеален за карти и абонаменти с изживяване, вградено в сайта, а PayPal добавя метод, който много клиенти познават и на който имат доверие. На практика е най-добре да предложите и двата: колкото повече методи за плащане приемате, толкова по-малко изоставени колички имате. Таксите са около 1.5-3% на транзакция в зависимост от оператора и вида карта.</p>
<h2>Stripe, PayPal и алтернативи в сравнение</h2>
<div class="ctbl"><table><thead><tr><th>Оператор</th><th>Силни страни</th><th>За преценка</th></tr></thead><tbody>
<tr><td>Stripe</td><td>Карти, абонаменти, отлична техническа интеграция</td><td>По-технична настройка</td></tr>
<tr><td>PayPal</td><td>Широко доверие, бърза поръчка</td><td>Такси, управление на спорове</td></tr>
<tr><td>Банков превод / SEPA</td><td>Ниски такси, полезен в B2B</td><td>Плащането не е моментално</td></tr>
<tr><td>Наложен платеж</td><td>Успокоява недоверчивите</td><td>Риск от връщания и неполучени пратки</td></tr>
</tbody></table></div>
<h2>Сигурност и съответствие</h2>
<p>Добрата новина е, че при Stripe и PayPal данните на картата никога не минават през вашия сървър: PCI съответствието се поема от оператора, което силно намалява задълженията и рисковете ви. За ваша сметка остават основите на <a href="/bg/blog/sicurezza-sito-web-checklist/">сигурността на сайта</a>: HTTPS на всички страници, обновен софтуер и надежден <a href="/bg/uslugi/hosting/">хостинг</a>. В Европа е задължителна силна автентикация (SCA/3D Secure), която и двата вече поддържат.</p>
<h2>Кое да изберете</h2>
<p>За стандартен <a href="/bg/uslugi/ecommerce/">онлайн магазин</a> комбинацията Stripe + PayPal покрива огромната част от клиентите. Ако продавате на абонамент или имате нужда от логика по поръчка, Stripe, интегриран в <a href="/bg/uslugi/softuer/">софтуер по поръчка</a>, дава най-голяма гъвкавост. Изборът на платформа влияе и на таксите, както обясняваме в статията <a href="/bg/blog/woocommerce-vs-shopify/">WooCommerce срещу Shopify</a>.</p>
<p>Интегрираме плащания сигурно във всеки сайт или онлайн магазин. Ако искате да започнете да приемате плащания онлайн, <a href="/bg/kontakti/">пишете ни</a>: заедно ще преценим подходящите оператори за вашия случай.</p>""",
  faqs=[
   ("Stripe или PayPal за онлайн магазин?", "Най-добре е да предложите и двата. Stripe е идеален за плащания с карта и абонаменти, с изживяване, вградено в сайта; PayPal добавя разпространен метод, на който много клиенти имат доверие. Колкото повече методи приемате, толкова по-малко колички изоставяте."),
   ("Колко са таксите за онлайн плащания?", "Обикновено между 1.5% и 3% на транзакция, в зависимост от оператора и вида карта. Към това може да се добави малка фиксирана такса на операция. SEPA преводът има по-ниски такси, но плащането не е моментално."),
   ("Сигурна ли е интеграцията на плащания за данните на картите?", "Да. При Stripe и PayPal данните на картата не минават през вашия сървър: PCI съответствието се поема от оператора. Все пак трябва да осигурите HTTPS, обновен софтуер и надежден хостинг."),
   ("Кои методи за плащане да предложа?", "Поне карта (Stripe) и PayPal, които покриват повечето клиенти. В B2B може да е полезен SEPA превод, а наложеният платеж успокоява недоверчивите, но носи риск от връщания и неполучени пратки."),
  ]),
)),

# 16 ────────────────────────────────────────────────────────────
dict(slug="schema-markup-guida", section="SEO", read=8, lang=dict(
 it=dict(
  title="Schema Markup e Dati Strutturati: Guida Pratica | Carbon Stealth",
  desc="Cos'e lo Schema markup, a cosa servono i dati strutturati e come usarli per ottenere risultati ricchi su Google e piu visibilita su AI e motori di ricerca.",
  body="""<p>Lo <strong>Schema markup</strong> &egrave; un codice, in formato JSON-LD, che spiega ai motori di ricerca il significato dei contenuti di una pagina: se &egrave; un articolo, un prodotto, una FAQ o un'attivit&agrave; locale. Non cambia l'aspetto del sito per l'utente, ma aiuta Google a mostrare <strong>risultati ricchi</strong> (stelle, prezzi, domande, immagini) e rende i contenuti pi&ugrave; comprensibili anche agli assistenti AI. In breve: pi&ugrave; contesto dai, pi&ugrave; visibilit&agrave; ottieni.</p>
<h2>I tipi di Schema pi&ugrave; utili</h2>
<div class="ctbl"><table><thead><tr><th>Tipo</th><th>A cosa serve</th><th>Per chi</th></tr></thead><tbody>
<tr><td>Organization / LocalBusiness</td><td>Dati aziendali, sede, contatti</td><td>Tutte le attivit&agrave;</td></tr>
<tr><td>Product</td><td>Prezzo, disponibilit&agrave;, recensioni</td><td>E-commerce</td></tr>
<tr><td>FAQPage</td><td>Domande e risposte nei risultati</td><td>Guide, servizi</td></tr>
<tr><td>Article / BlogPosting</td><td>Autore, data, argomento</td><td>Blog e contenuti</td></tr>
<tr><td>BreadcrumbList</td><td>Percorso di navigazione</td><td>Tutti i siti</td></tr>
</tbody></table></div>
<h2>Come si implementa</h2>
<p>Il formato consigliato da Google &egrave; il <strong>JSON-LD</strong>, uno script inserito nella pagina, separato dal contenuto visibile e quindi facile da mantenere. La regola d'oro &egrave; una sola: i dati strutturati devono descrivere ci&ograve; che l'utente vede davvero. Marcare prezzi o recensioni inesistenti viola le linee guida e pu&ograve; portare a penalizzazioni, non a vantaggi.</p>
<h2>Perch&eacute; conta per SEO e AI</h2>
<p>I dati strutturati sono uno dei ponti tra la SEO classica e l'<a href="/blog/aeo-guida-completa/">ottimizzazione per i motori di risposta</a>: aiutano Google a generare risultati ricchi e forniscono ai modelli AI un contesto chiaro e affidabile su chi sei e cosa offri. Vanno di pari passo con le basi tecniche di un sito ben fatto, come spieghiamo nelle guide su <a href="/blog/react-seo-2026/">SEO per siti React</a> e <a href="/blog/core-web-vitals-guida/">Core Web Vitals</a>.</p>
<p>Implementiamo dati strutturati corretti in ogni progetto di <a href="/servizi/sviluppo-siti-web/">sviluppo siti web</a> e come parte del nostro lavoro di <a href="/servizi/seo/">SEO</a>. Se vuoi capire se il tuo sito li sfrutta bene, <a href="/contatti/">chiedici un'analisi</a>.</p>""",
  faqs=[
   ("Cos'e lo Schema markup?", "E un codice in formato JSON-LD che spiega ai motori di ricerca il significato dei contenuti di una pagina: se si tratta di un articolo, un prodotto, una FAQ o un'attivita locale. Aiuta Google a mostrare risultati ricchi e rende i contenuti piu comprensibili anche alle AI."),
   ("I dati strutturati aiutano la SEO?", "Indirettamente si. Non sono un fattore di ranking diretto, ma permettono risultati ricchi (stelle, prezzi, FAQ) che aumentano la visibilita e i clic. Danno inoltre contesto ai motori di ricerca e agli assistenti AI su cosa offri."),
   ("Che formato usare per lo Schema markup?", "Google raccomanda JSON-LD, uno script inserito nella pagina e separato dal contenuto visibile. E il formato piu semplice da implementare e mantenere rispetto ai vecchi microdata inseriti nell'HTML."),
   ("Posso inserire recensioni o prezzi finti nello Schema?", "No. I dati strutturati devono descrivere cio che l'utente vede davvero sulla pagina. Marcare recensioni o prezzi inesistenti viola le linee guida di Google e puo portare a penalizzazioni invece che a vantaggi."),
  ]),
 en=dict(
  title="Schema Markup and Structured Data: A Practical Guide | Carbon Stealth",
  desc="What Schema markup is, what structured data is for and how to use it to earn rich results on Google and more visibility across AI and search engines.",
  body="""<p><strong>Schema markup</strong> is code, in JSON-LD format, that tells search engines what the content on a page means: whether it's an article, a product, an FAQ or a local business. It doesn't change how the site looks to the user, but it helps Google show <strong>rich results</strong> (stars, prices, questions, images) and makes content easier for AI assistants to understand too. In short: the more context you give, the more visibility you earn.</p>
<h2>The most useful Schema types</h2>
<div class="ctbl"><table><thead><tr><th>Type</th><th>What it's for</th><th>Best for</th></tr></thead><tbody>
<tr><td>Organization / LocalBusiness</td><td>Company data, location, contacts</td><td>All businesses</td></tr>
<tr><td>Product</td><td>Price, availability, reviews</td><td>E-commerce</td></tr>
<tr><td>FAQPage</td><td>Questions and answers in results</td><td>Guides, services</td></tr>
<tr><td>Article / BlogPosting</td><td>Author, date, topic</td><td>Blogs and content</td></tr>
<tr><td>BreadcrumbList</td><td>Navigation path</td><td>All sites</td></tr>
</tbody></table></div>
<h2>How it's implemented</h2>
<p>Google's recommended format is <strong>JSON-LD</strong>, a script placed in the page, separate from the visible content and therefore easy to maintain. The golden rule is a single one: structured data must describe what the user actually sees. Marking up prices or reviews that don't exist violates the guidelines and can lead to penalties, not benefits.</p>
<h2>Why it matters for SEO and AI</h2>
<p>Structured data is one of the bridges between classic SEO and <a href="/en/blog/aeo-guida-completa/">answer engine optimization</a>: it helps Google generate rich results and gives AI models clear, reliable context about who you are and what you offer. It goes hand in hand with the technical basics of a well-built site, as we explain in our guides on <a href="/en/blog/react-seo-2026/">SEO for React sites</a> and <a href="/en/blog/core-web-vitals-guida/">Core Web Vitals</a>.</p>
<p>We implement correct structured data in every <a href="/en/services/web-development/">web development</a> project and as part of our <a href="/en/services/seo/">SEO</a> work. If you want to know whether your site uses it well, <a href="/en/contact/">ask us for an analysis</a>.</p>""",
  faqs=[
   ("What is Schema markup?", "It's code in JSON-LD format that tells search engines what a page's content means: whether it's an article, a product, an FAQ or a local business. It helps Google show rich results and makes content easier for AI to understand too."),
   ("Does structured data help SEO?", "Indirectly, yes. It isn't a direct ranking factor, but it enables rich results (stars, prices, FAQs) that increase visibility and clicks. It also gives search engines and AI assistants context about what you offer."),
   ("What format should I use for Schema markup?", "Google recommends JSON-LD, a script placed in the page and separate from the visible content. It's the simplest format to implement and maintain compared to the older microdata embedded in HTML."),
   ("Can I add fake reviews or prices in Schema?", "No. Structured data must describe what the user actually sees on the page. Marking up reviews or prices that don't exist violates Google's guidelines and can lead to penalties rather than benefits."),
  ]),
 bg=dict(
  title="Schema Markup и Структурирани Данни: Практическо Ръководство | Carbon Stealth",
  desc="Какво е Schema markup, за какво служат структурираните данни и как да ги използвате за богати резултати в Google и повече видимост в AI и търсачките.",
  body="""<p><strong>Schema markup</strong> е код във формат JSON-LD, който обяснява на търсачките какво означава съдържанието на страницата: дали е статия, продукт, FAQ или локален бизнес. Не променя вида на сайта за потребителя, но помага на Google да показва <strong>богати резултати</strong> (звезди, цени, въпроси, изображения) и прави съдържанието по-разбираемо и за AI асистентите. Накратко: колкото повече контекст дадете, толкова повече видимост получавате.</p>
<h2>Най-полезните типове Schema</h2>
<div class="ctbl"><table><thead><tr><th>Тип</th><th>За какво служи</th><th>За кого</th></tr></thead><tbody>
<tr><td>Organization / LocalBusiness</td><td>Фирмени данни, адрес, контакти</td><td>Всички бизнеси</td></tr>
<tr><td>Product</td><td>Цена, наличност, отзиви</td><td>Онлайн магазини</td></tr>
<tr><td>FAQPage</td><td>Въпроси и отговори в резултатите</td><td>Ръководства, услуги</td></tr>
<tr><td>Article / BlogPosting</td><td>Автор, дата, тема</td><td>Блогове и съдържание</td></tr>
<tr><td>BreadcrumbList</td><td>Път на навигация</td><td>Всички сайтове</td></tr>
</tbody></table></div>
<h2>Как се внедрява</h2>
<p>Препоръчаният от Google формат е <strong>JSON-LD</strong> — скрипт, вграден в страницата, отделен от видимото съдържание и затова лесен за поддръжка. Златното правило е едно: структурираните данни трябва да описват това, което потребителят реално вижда. Маркирането на несъществуващи цени или отзиви нарушава указанията и може да доведе до санкции, а не до предимства.</p>
<h2>Защо е важно за SEO и AI</h2>
<p>Структурираните данни са един от мостовете между класическото SEO и <a href="/bg/blog/aeo-guida-completa/">оптимизацията за отговарящи машини</a>: помагат на Google да генерира богати резултати и дават на AI моделите ясен и надежден контекст кои сте и какво предлагате. Вървят ръка за ръка с техническите основи на добре направен сайт, както обясняваме в статиите за <a href="/bg/blog/react-seo-2026/">SEO за React сайтове</a> и <a href="/bg/blog/core-web-vitals-guida/">Core Web Vitals</a>.</p>
<p>Внедряваме коректни структурирани данни във всеки проект по <a href="/bg/uslugi/web-razrabotka/">изработка на сайтове</a> и като част от нашата <a href="/bg/uslugi/seo/">SEO</a> работа. Ако искате да разберете дали сайтът ви ги използва добре, <a href="/bg/kontakti/">поискайте анализ</a>.</p>""",
  faqs=[
   ("Какво е Schema markup?", "Това е код във формат JSON-LD, който обяснява на търсачките какво означава съдържанието на страницата: дали е статия, продукт, FAQ или локален бизнес. Помага на Google да показва богати резултати и прави съдържанието по-разбираемо и за AI."),
   ("Помагат ли структурираните данни за SEO?", "Косвено, да. Не са пряк фактор за класиране, но позволяват богати резултати (звезди, цени, FAQ), които увеличават видимостта и кликовете. Освен това дават на търсачките и AI асистентите контекст за това какво предлагате."),
   ("Какъв формат да използвам за Schema markup?", "Google препоръчва JSON-LD — скрипт, вграден в страницата и отделен от видимото съдържание. Това е най-простият формат за внедряване и поддръжка в сравнение със старите microdata в HTML."),
   ("Мога ли да сложа фалшиви отзиви или цени в Schema?", "Не. Структурираните данни трябва да описват това, което потребителят реално вижда на страницата. Маркирането на несъществуващи отзиви или цени нарушава указанията на Google и може да доведе до санкции вместо предимства."),
  ]),
)),
]

# ── Rendering ────────────────────────────────────────────────────

def esc(s):
    return html.escape(s, quote=True)

def head(lang, post, title, desc):
    s = L[lang]
    slug = post["slug"]
    slugpath = f"/blog/{slug}/"
    canon = f"{BASE}{s['prefix']}{slugpath}"
    alts = "".join(
        f'<link rel="alternate" hreflang="{l}" href="{BASE}{L[l]["prefix"]}{slugpath}"/>'
        for l in ("it", "en", "bg")
    ) + f'<link rel="alternate" hreflang="x-default" href="{BASE}{slugpath}"/>'
    og = f"{BASE}/{s['og']}"
    return f"""<!DOCTYPE html><html lang="{lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canon}">
{alts}
<meta property="og:type" content="article">
<meta property="og:site_name" content="Carbon Stealth VCC">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="{s['locale']}">
<meta property="article:published_time" content="{DATE_ISO}">
<meta property="article:modified_time" content="{DATE_ISO}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{og}">
<meta name="geo.region" content="BG-KY">
<meta name="geo.placename" content="Bobov Dol">
<meta name="theme-color" content="#00e5ff">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
{FONTS}<style>{STYLE}</style>
"""

def jsonld(lang, post, title, desc):
    s = L[lang]
    slug = post["slug"]
    canon = f"{BASE}{s['prefix']}/blog/{slug}/"
    faqs = post["lang"][lang]["faqs"]
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "BlogPosting", "@id": f"{canon}#article", "headline": title,
         "description": desc, "image": f"{BASE}/{s['og']}",
         "datePublished": DATE_ISO, "dateModified": DATE_ISO,
         "author": {"@type": "Person", "@id": "https://carbonstealth.eu/#stefan",
                    "name": "Stefan Kostadinov", "url": "https://carbonstealth.eu/chi-siamo/",
                    "jobTitle": "CEO & Founder",
                    "worksFor": {"@type": "Organization", "name": "Carbon Stealth VCC", "url": "https://carbonstealth.eu"}},
         "publisher": {"@type": "Organization", "name": "Carbon Stealth VCC",
                       "logo": {"@type": "ImageObject", "url": "https://carbonstealth.eu/logo.png", "width": 1373, "height": 585}},
         "mainEntityOfPage": {"@type": "WebPage", "@id": canon},
         "articleSection": post["section"], "inLanguage": lang},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + (s["prefix"] or "") + "/"},
            {"@type": "ListItem", "position": 2, "name": "Blog", "item": BASE + s["blog"]},
            {"@type": "ListItem", "position": 3, "name": title, "item": canon}]},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]},
    ]}
    return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "</script>"

def render(lang, post):
    s = L[lang]
    c = post["lang"][lang]
    title = c["title"]
    # h1 is title without the "| Carbon Stealth" suffix
    h1 = title.split("|")[0].strip()
    desc = c["desc"]
    faqs = c["faqs"]
    faq_html = "".join(
        f'<div class="faq-item"><div class="faq-q">{html.escape(q)}</div><div class="faq-a">{html.escape(a)}</div></div>'
        for q, a in faqs)
    date_line = f'<p class="blog-date">{s["date_label"]} &middot; {post["read"]} {s["read"]}</p>'
    body = (
        head(lang, post, title, desc)
        + jsonld(lang, post, title, desc)
        + "\n</head><body>"
        + s["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">// BLOG</div><h1>{html.escape(h1)}</h1></div></div>'
        + '<div class="w">'
        + date_line
        + c["body"]
        + f'<h2>{s["faq_h2"]}</h2>{faq_html}'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a>'
        + '</div>'
        + s["ft"]
        + "</body></html>\n"
    )
    return body

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def main():
    n = 0
    for lang in ("it", "en", "bg"):
        prefix = L[lang]["prefix"].lstrip("/")
        root = os.path.join("public", prefix) if prefix else "public"
        for post in POSTS:
            write(os.path.join(root, "blog", post["slug"], "index.html"), render(lang, post))
            n += 1
    print(f"wrote {n} blog pages ({len(POSTS)} posts x 3 langs)")

if __name__ == "__main__":
    main()
