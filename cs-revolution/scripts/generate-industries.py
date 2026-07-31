#!/usr/bin/env python3
"""Generate the trilingual INDUSTRIES / SETTORI section (it/en/bg).

Run from repo root: python3 scripts/generate-industries.py

Long-tail, high-conversion landing pages targeting "siti web e software per {settore}".
Hub + 12 sector pages x 3 languages, written natively per language with
answer-first intros, sector-specific h2 sections, a FAQ block (FAQPage schema),
real internal links to service pages, cross-links to related sectors and a CTA.
Self-contained static HTML, no build step. Also writes public/sitemap-industries.xml.
"""
import os, html, json

BASE = "https://carbonstealth.eu"
LASTMOD = "2026-07-17"

STYLE = "*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#ccc;font-family:'Space Mono',monospace;font-size:13px;line-height:2;padding:0}a{color:#00e5ff;text-decoration:none}.w{max-width:900px;margin:0 auto;padding:40px 20px}h1{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2.5rem;color:#f5f5f0;margin-bottom:16px;letter-spacing:-.03em;line-height:1.1}h2{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.2rem;color:#00e5ff;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.05em}h3{color:#f5f5f0;font-size:1rem;margin:20px 0 8px}p,li{margin-bottom:10px;line-height:1.9}ul{padding-left:20px}.nav{position:fixed;top:0;width:100%;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,229,255,.1);padding:12px 20px;z-index:1000;display:flex;justify-content:space-between;align-items:center}.nav a{color:#ccc;font-size:10px;letter-spacing:.2em;margin:0 10px}.nav img{height:24px}.hero-s{padding:120px 20px 60px;border-bottom:1px solid rgba(0,229,255,.1)}.tag{font-size:9px;color:#00e5ff;letter-spacing:.4em;margin-bottom:12px}.cta{display:inline-block;padding:14px 32px;border:1px solid #00e5ff;color:#00e5ff;font-size:11px;letter-spacing:.25em;margin-top:24px}.ft{border-top:1px solid rgba(245,245,240,.06);padding:30px 20px;text-align:center;font-size:9px;color:#666;margin-top:60px}.price{display:inline-block;padding:2px 10px;border:1px solid rgba(0,229,255,.2);color:#00e5ff;font-size:11px;margin-left:8px}.faq-item{border-bottom:1px solid rgba(245,245,240,.06);padding:16px 0}.faq-q{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1rem;color:#f5f5f0;margin-bottom:6px}.faq-a{font-size:12px;color:#ccc}.sect{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.sect a{padding:6px 14px;border:1px solid rgba(0,229,255,.2);font-size:11px}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin:20px 0}.card{border:1px solid rgba(0,229,255,.15);padding:18px;transition:border-color .2s}.card:hover{border-color:rgba(0,229,255,.5)}.card h3{margin:0 0 6px;color:#f5f5f0}.card p{font-size:11px;color:#999;margin:0}.card .k{font-size:9px;color:#00e5ff;letter-spacing:.3em;display:block;margin-bottom:8px}"

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">')

# ── Per-language chrome ──────────────────────────────────────────
L = {
 "it": dict(
   prefix="", urlbase="/settori/", og="og/og-settori.png", locale="it_IT",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/chi-siamo/">CHI SIAMO</a><a href="/servizi/sviluppo-siti-web/">SERVIZI</a><a href="/settori/">SETTORI</a><a href="/contatti/">CONTATTI</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Tutti i diritti riservati &middot; <a href="/privacy/">Privacy</a> &middot; <a href="/cookie/">Cookie</a> &middot; <a href="/termini/">Terms</a></p></div>',
   home="/", contact="/contatti/", hub_name="Settori",
   title_fmt="Siti Web e Software per {name} | Carbon Stealth",
   tag="// SETTORE", cta="RICHIEDI UN PREVENTIVO GRATUITO", faq_h2="Domande frequenti",
   related_h2="Settori correlati", hub_link="Tutti i settori",
   svc_type="Sviluppo siti web, e-commerce, gestionali ed ERP, app e SEO",
   hub_title="Siti Web e Software per Settore | Carbon Stealth",
   hub_desc="Soluzioni web e software su misura per settore: ristoranti, moda, immobiliare, studi medici, avvocati, hotel, artigiani, industria e altro. Preventivo in 24 ore.",
   hub_h1="Soluzioni per Settore",
   hub_intro="Ogni settore ha esigenze digitali diverse. Abbiamo raccolto qui consigli concreti e soluzioni pronte per il tuo comparto: dal sito che porta clienti al gestionale che ti fa risparmiare ore ogni settimana. Scegli il tuo settore.",
   svc=dict(
     web=("/servizi/sviluppo-siti-web/", "sviluppo siti web"),
     ecom=("/servizi/ecommerce/", "e-commerce"),
     erp=("/servizi/erp/", "sistemi ERP e gestionali"),
     seo=("/servizi/seo/", "SEO e visibilità"),
     app=("/servizi/app-mobile/", "app mobile"))),
 "en": dict(
   prefix="/en", urlbase="/en/industries/", og="og/og-settori-en.png", locale="en_US",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/en/about/">ABOUT</a><a href="/en/services/web-development/">SERVICES</a><a href="/en/industries/">INDUSTRIES</a><a href="/en/contact/">CONTACT</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>All rights reserved &middot; <a href="/en/privacy/">Privacy</a> &middot; <a href="/en/cookie/">Cookie</a> &middot; <a href="/en/terms/">Terms</a></p></div>',
   home="/en/", contact="/en/contact/", hub_name="Industries",
   title_fmt="Web & Software for {name} | Carbon Stealth",
   tag="// INDUSTRY", cta="REQUEST A FREE QUOTE", faq_h2="Frequently asked questions",
   related_h2="Related industries", hub_link="All industries",
   svc_type="Web development, e-commerce, management and ERP software, apps and SEO",
   hub_title="Web & Software by Industry | Carbon Stealth",
   hub_desc="Bespoke web and software solutions by industry: restaurants, fashion, real estate, clinics, lawyers, hotels, artisans, manufacturing and more. Quote within 24 hours.",
   hub_h1="Solutions by Industry",
   hub_intro="Every industry has different digital needs. We've gathered concrete advice and ready-made solutions for your sector here: from the website that brings in customers to the software that saves you hours every week. Pick your industry.",
   svc=dict(
     web=("/en/services/web-development/", "web development"),
     ecom=("/en/services/ecommerce/", "e-commerce"),
     erp=("/en/services/erp/", "ERP and management software"),
     seo=("/en/services/seo/", "SEO and visibility"),
     app=("/en/services/mobile-apps/", "mobile apps"))),
 "bg": dict(
   prefix="/bg", urlbase="/bg/branshove/", og="og/og-settori-bg.png", locale="bg_BG",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">ГЛАВНА</a><a href="/bg/za-nas/">ЗА НАС</a><a href="/bg/uslugi/web-razrabotka/">УСЛУГИ</a><a href="/bg/branshove/">БРАНШОВЕ</a><a href="/bg/kontakti/">КОНТАКТИ</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Всички права запазени &middot; <a href="/bg/privacy/">Privacy</a> &middot; <a href="/bg/cookie/">Cookie</a> &middot; <a href="/bg/usloviya/">Terms</a></p></div>',
   home="/bg/", contact="/bg/kontakti/", hub_name="Браншове",
   title_fmt="Сайтове и Софтуер за {name} | Carbon Stealth",
   tag="// БРАНШ", cta="ЗАЯВИ БЕЗПЛАТНА ОФЕРТА", faq_h2="Често задавани въпроси",
   related_h2="Свързани браншове", hub_link="Всички браншове",
   svc_type="Изработка на сайтове, онлайн магазини, ERP системи, приложения и SEO",
   hub_title="Сайтове и Софтуер по Бранш | Carbon Stealth",
   hub_desc="Сайтове и софтуер по поръчка за вашия бранш: ресторанти, мода, имоти, лекарски кабинети, адвокати, хотели, занаятчии, производство и още. Оферта до 24 часа.",
   hub_h1="Решения по Бранш",
   hub_intro="Всеки бранш има различни дигитални нужди. Събрахме тук конкретни съвети и готови решения за вашия сектор: от сайта, който води клиенти, до софтуера, който ви спестява часове всяка седмица. Изберете вашия бранш.",
   svc=dict(
     web=("/bg/uslugi/web-razrabotka/", "изработка на сайтове"),
     ecom=("/bg/uslugi/ecommerce/", "онлайн магазини"),
     erp=("/bg/uslugi/erp/", "ERP и управленски софтуер"),
     seo=("/bg/uslugi/seo/", "SEO и видимост"),
     app=("/bg/uslugi/mobilni-prilozheniya/", "мобилни приложения"))),
}

# ── Sectors ──────────────────────────────────────────────────────
# Each: slug, names{it,en,bg}, tagline{it,en,bg} (hub card), related=[slugs],
# and per-lang dict {desc, body, faqs}. body = inner HTML (intro + h2 sections
# with inline internal links) placed after the hero; the related block, FAQ and
# CTA are added by the renderer.

SECTORS = [

# 1 ── Ristoranti ────────────────────────────────────────────────
dict(slug="ristoranti", related=["hotel-turismo", "ecommerce-alimentari", "artigiani-officine"],
 names=dict(it="Ristoranti", en="Restaurants", bg="Ресторанти"),
 tagline=dict(it="Menu digitali, prenotazioni e ordini online che riempiono i tavoli.",
   en="Digital menus, reservations and online ordering that fill tables.",
   bg="Дигитални менюта, резервации и онлайн поръчки, които пълнят масите."),
 it=dict(
  desc="Sito web, menu digitale, prenotazioni e ordini online per ristoranti, pizzerie e trattorie. Da €800, preventivo gratuito in 24 ore.",
  body="""<p>Un ristorante oggi viene scelto sullo smartphone, prima ancora che dal vivo: il cliente cerca &laquo;ristorante vicino a me&raquo;, guarda foto e menu, controlla se pu&ograve; prenotare e decide in trenta secondi. Per questo a un ristorante non serve un sito qualsiasi, ma una vetrina veloce con <strong>menu sempre aggiornato, prenotazione in un tap e una scheda Google curata</strong>. Chi non c'&egrave;, o carica in cinque secondi, perde il tavolo a favore del locale accanto.</p>
<h2>Il sito e il menu digitale</h2>
<p>La base &egrave; un sito vetrina che si apre in meno di due secondi anche sotto rete mobile, con foto dei piatti, orari, indirizzo con mappa e un menu leggibile senza PDF da scaricare. Il menu digitale ti fa risparmiare le ristampe e ti permette di cambiare piatti e prezzi in autonomia. Il nostro <a href="/servizi/sviluppo-siti-web/">sviluppo siti web</a> per la ristorazione parte da <strong>&euro;800</strong> e include galleria, menu e modulo prenotazioni.</p>
<h2>Prenotazioni e ordini online</h2>
<p>Un modulo di prenotazione collegato al calendario elimina le telefonate perse nelle ore di punta e riduce i no-show con promemoria automatici. Se fai asporto o delivery, un sistema di ordini online tuo &mdash; senza le commissioni del 25-30% delle piattaforme &mdash; ti fa tenere il margine: un piccolo <a href="/servizi/ecommerce/">e-commerce</a> per il food parte da <strong>&euro;1.200</strong>. Per i locali pi&ugrave; strutturati sviluppiamo anche <a href="/servizi/app-mobile/">app mobile</a> con fidelity e ordini ricorrenti, da <strong>&euro;3.000</strong>.</p>
<h2>Gestione della sala e del magazzino</h2>
<p>Quando cresci, il vero problema non &egrave; il sito ma la gestione: coperti, food cost, magazzino e fornitori. Un <a href="/servizi/erp/">gestionale su misura</a> (da <strong>&euro;5.000</strong>) collega prenotazioni, consumi e acquisti, cos&igrave; sai quali piatti rendono davvero e quando riordinare. &Egrave; la differenza tra tirare a indovinare e decidere sui numeri.</p>
<h2>Farsi trovare su Google e Maps</h2>
<p>La maggior parte dei clienti arriva dalla ricerca locale. Ottimizziamo la scheda Google Business, i dati strutturati del menu e le recensioni, cos&igrave; il tuo ristorante compare quando qualcuno cerca dove mangiare in zona. La nostra <a href="/servizi/seo/">SEO locale</a> parte da &euro;500/mese e si ripaga con i coperti in pi&ugrave;. Vale sia per un ristorante gourmet sia per una pizzeria di quartiere.</p>""",
  faqs=[
   ("Quanto costa un sito web per un ristorante?", "Un sito vetrina professionale con menu digitale, galleria fotografica e modulo prenotazioni parte da &euro;800. Aggiungendo ordini online per asporto e delivery si parte da &euro;1.200. Preventivo gratuito entro 24 ore."),
   ("Conviene avere un sistema di ordini proprio invece delle piattaforme?", "Sì, se hai un volume costante. Le piattaforme trattengono il 25-30% per ordine; un sistema di ordini tuo ha un costo iniziale ma poi ti fa tenere quasi tutto il margine e ti dà i dati dei clienti, che restano tuoi."),
   ("Il menu digitale posso aggiornarlo da solo?", "Sì. Consegniamo un pannello semplice dove cambi piatti, prezzi e disponibilità in pochi clic, senza chiamare noi e senza ristampare nulla. Utile per menu stagionali e piatti del giorno."),
   ("Come faccio a comparire quando qualcuno cerca un ristorante in zona?", "Con la SEO locale: scheda Google Business ottimizzata, dati strutturati, foto e gestione delle recensioni. È il canale che porta più clienti a un ristorante e parte da &euro;500/mese."),
  ]),
 en=dict(
  desc="Website, digital menu, reservations and online ordering for restaurants, pizzerias and trattorias. From €800, free quote within 24 hours.",
  body="""<p>A restaurant today is chosen on a phone, before anyone walks in: the guest searches &laquo;restaurant near me&raquo;, looks at photos and the menu, checks whether they can book and decides in thirty seconds. So a restaurant doesn't need just any website &mdash; it needs a fast storefront with an <strong>always-current menu, one-tap booking and a well-kept Google profile</strong>. A place that isn't there, or takes five seconds to load, loses the table to the one next door.</p>
<h2>The website and digital menu</h2>
<p>The foundation is a brochure site that opens in under two seconds even on mobile data, with dish photos, hours, an address with a map and a menu readable without downloading a PDF. A digital menu saves you reprints and lets you change dishes and prices yourself. Our <a href="/en/services/web-development/">web development</a> for hospitality starts at <strong>&euro;800</strong> and includes gallery, menu and a booking form.</p>
<h2>Reservations and online ordering</h2>
<p>A booking module tied to your calendar removes missed calls at peak hours and cuts no-shows with automatic reminders. If you do takeaway or delivery, your own online ordering &mdash; without the 25-30% commissions the platforms charge &mdash; keeps the margin in your pocket: a small food <a href="/en/services/ecommerce/">e-commerce</a> starts at <strong>&euro;1,200</strong>. For larger venues we also build <a href="/en/services/mobile-apps/">mobile apps</a> with loyalty and repeat orders, from <strong>&euro;3,000</strong>.</p>
<h2>Front-of-house and stock management</h2>
<p>As you grow, the real problem isn't the website but operations: covers, food cost, stock and suppliers. A <a href="/en/services/erp/">custom management system</a> (from <strong>&euro;5,000</strong>) links bookings, consumption and purchasing, so you know which dishes actually make money and when to reorder. It's the difference between guessing and deciding on numbers.</p>
<h2>Getting found on Google and Maps</h2>
<p>Most guests arrive from local search. We optimize your Google Business profile, menu structured data and reviews, so your restaurant shows up when someone looks for where to eat nearby. Our <a href="/en/services/seo/">local SEO</a> starts at &euro;500/month and pays for itself in extra covers. It works for a fine-dining room and a neighborhood pizzeria alike.</p>""",
  faqs=[
   ("How much does a restaurant website cost?", "A professional brochure site with a digital menu, photo gallery and booking form starts at &euro;800. Adding online ordering for takeaway and delivery starts at &euro;1,200. Free quote within 24 hours."),
   ("Is my own ordering system worth it versus the platforms?", "Yes, if you have steady volume. Platforms keep 25-30% per order; your own ordering system costs upfront but then lets you keep almost all the margin and gives you the customer data, which stays yours."),
   ("Can I update the digital menu myself?", "Yes. We hand over a simple panel where you change dishes, prices and availability in a few clicks, without calling us and without reprinting anything. Handy for seasonal menus and daily specials."),
   ("How do I show up when someone searches for a restaurant nearby?", "With local SEO: an optimized Google Business profile, structured data, photos and review management. It's the channel that brings a restaurant the most customers, and it starts at &euro;500/month."),
  ]),
 bg=dict(
  desc="Сайт, дигитално меню, резервации и онлайн поръчки за ресторанти, пицарии и заведения. От €800, безплатна оферта до 24 часа.",
  body="""<p>Днес ресторантът се избира от телефона, още преди клиентът да влезе: търси &laquo;ресторант близо до мен&raquo;, гледа снимки и меню, проверява дали може да резервира и решава за трийсет секунди. Затова на ресторанта не му трябва какъв да е сайт, а бърза витрина с <strong>винаги актуално меню, резервация с едно докосване и добре поддържан Google профил</strong>. Заведение, което го няма или зарежда пет секунди, губи масата в полза на съседното.</p>
<h2>Сайтът и дигиталното меню</h2>
<p>Основата е визитен сайт, който се отваря под две секунди дори на мобилни данни, със снимки на ястията, работно време, адрес с карта и меню, четимо без изтегляне на PDF. Дигиталното меню ви спестява препечатване и ви позволява сами да сменяте ястия и цени. Нашата <a href="/bg/uslugi/web-razrabotka/">изработка на сайтове</a> за заведения започва от <strong>&euro;800</strong> и включва галерия, меню и форма за резервации.</p>
<h2>Резервации и онлайн поръчки</h2>
<p>Модул за резервации, свързан с календара, премахва пропуснатите обаждания в пиковите часове и намалява неявяванията с автоматични напомняния. Ако правите за вкъщи или доставка, собствена система за поръчки &mdash; без комисионните от 25-30% на платформите &mdash; ви оставя маржа: малък <a href="/bg/uslugi/ecommerce/">онлайн магазин</a> за храна започва от <strong>&euro;1200</strong>. За по-големи заведения разработваме и <a href="/bg/uslugi/mobilni-prilozheniya/">мобилни приложения</a> с лоялни клиенти и повтарящи се поръчки, от <strong>&euro;3000</strong>.</p>
<h2>Управление на залата и склада</h2>
<p>С растежа истинският проблем не е сайтът, а управлението: заетост, себестойност, склад и доставчици. <a href="/bg/uslugi/erp/">Управленска система по поръчка</a> (от <strong>&euro;5000</strong>) свързва резервациите, разхода и покупките, така че знаете кои ястия наистина носят печалба и кога да поръчате. Това е разликата между гадаене и решения по числа.</p>
<h2>Да ви намират в Google и Maps</h2>
<p>Повечето клиенти идват от локално търсене. Оптимизираме Google Business профила, структурираните данни на менюто и отзивите, така че ресторантът ви да излиза, когато някой търси къде да яде наблизо. Нашето <a href="/bg/uslugi/seo/">локално SEO</a> започва от &euro;500/месец и се изплаща с повече заети маси. Важи както за изискан ресторант, така и за квартална пицария.</p>""",
  faqs=[
   ("Колко струва сайт за ресторант?", "Професионален визитен сайт с дигитално меню, фотогалерия и форма за резервации започва от &euro;800. С онлайн поръчки за вкъщи и доставка — от &euro;1200. Безплатна оферта до 24 часа."),
   ("Струва ли си собствена система за поръчки вместо платформите?", "Да, ако имате постоянен обем. Платформите удържат 25-30% на поръчка; собствената система има начален разход, но после ви оставя почти целия марж и ви дава данните на клиентите, които остават ваши."),
   ("Мога ли сам да обновявам дигиталното меню?", "Да. Предаваме прост панел, където сменяте ястия, цени и наличност с няколко клика, без да ни звъните и без да препечатвате нищо. Удобно за сезонни менюта и предложения на деня."),
   ("Как да излизам, когато някой търси ресторант наблизо?", "С локално SEO: оптимизиран Google Business профил, структурирани данни, снимки и управление на отзивите. Това е каналът, който носи най-много клиенти на ресторант, и започва от &euro;500/месец."),
  ])),

# 2 ── Moda e Abbigliamento ──────────────────────────────────────
dict(slug="moda-abbigliamento", related=["ecommerce-alimentari", "artigiani-officine", "servizi-professionali"],
 names=dict(it="Moda e Abbigliamento", en="Fashion & Clothing", bg="Мода и Облекло"),
 tagline=dict(it="E-commerce curati e lookbook che trasformano il brand in vendite.",
   en="Polished e-commerce and lookbooks that turn a brand into sales.",
   bg="Издържани онлайн магазини и лукбукове, които превръщат бранда в продажби."),
 it=dict(
  desc="E-commerce, lookbook e gestione taglie/colori per brand di moda, boutique e abbigliamento. Da €1.200, preventivo gratuito in 24 ore.",
  body="""<p>Nella moda si compra con gli occhi: la vendita si gioca su foto impeccabili, un catalogo che gestisce bene <strong>taglie, colori e varianti</strong> e un checkout che non fa esitare. Un brand di abbigliamento non ha bisogno di un sito &laquo;bello e basta&raquo;, ma di un e-commerce veloce che regge i picchi dei lanci e comunica identit&agrave; in ogni pixel. La differenza tra un negozio online che vende e uno che raccoglie solo like sta quasi sempre nell'esperienza d'acquisto.</p>
<h2>L'e-commerce di moda</h2>
<p>Il cuore &egrave; un <a href="/servizi/ecommerce/">e-commerce</a> (da <strong>&euro;1.200</strong>) costruito per la moda: matrice taglie/colori, gestione delle scorte per variante, zoom sulle immagini, guida alle taglie per ridurre i resi e un carrello che si apre in un lampo. Integriamo pagamenti (Stripe, PayPal, carte), spedizioni e resi automatizzati, perch&eacute; nel fashion la logistica dei resi &egrave; parte della vendita.</p>
<h2>Lookbook e brand identity</h2>
<p>Prima dell'acquisto c'&egrave; il desiderio. Un <a href="/servizi/sviluppo-siti-web/">sito</a> (da <strong>&euro;800</strong>) con lookbook, storytelling e collezioni stagionali costruisce il brand e alimenta l'e-commerce. Cura tipografica, immagini a tutta pagina e caricamento rapido raccontano il posizionamento del marchio meglio di qualsiasi descrizione.</p>
<h2>Magazzino, taglie e multicanale</h2>
<p>Chi vende moda vive di stagioni, saldi e canali multipli (sito, negozio fisico, marketplace). Un <a href="/servizi/erp/">gestionale</a> (da <strong>&euro;5.000</strong>) sincronizza le giacenze tra tutti i canali cos&igrave; da non vendere un capo gi&agrave; esaurito, e ti dice quali taglie e colori rendono. Per i brand con clientela fedele, un'<a href="/servizi/app-mobile/">app</a> (da <strong>&euro;3.000</strong>) con drop e notifiche spinge i lanci.</p>
<h2>Farsi trovare e vendere ai motori AI</h2>
<p>La ricerca di moda passa da Google Immagini, Shopping e sempre pi&ugrave; dagli assistenti AI. Ottimizziamo schede prodotto, dati strutturati e contenuti con la nostra <a href="/servizi/seo/">SEO</a> (da &euro;500/mese), cos&igrave; le tue collezioni compaiono quando qualcuno cerca quel capo, quel colore, quello stile.</p>""",
  faqs=[
   ("Quanto costa un e-commerce per un brand di moda?", "Un e-commerce professionale con gestione taglie, colori e varianti parte da &euro;1.200. Il prezzo cresce con il numero di prodotti, le integrazioni logistiche e il livello di personalizzazione del design. Preventivo gratuito in 24 ore."),
   ("Come si gestiscono taglie e colori senza errori?", "Con una matrice varianti collegata al magazzino: ogni combinazione taglia/colore ha la sua scorta, e quando una si esaurisce sparisce dal carrello. Così non vendi capi che non hai e riduci i rimborsi."),
   ("Potete ridurre i resi?", "In parte sì: guida alle taglie precisa, foto fedeli, misure reali e recensioni con taglia indossata abbassano molto i resi da taglia sbagliata, che sono la causa numero uno nel fashion."),
   ("Vendo anche in negozio: posso sincronizzare tutto?", "Sì. Con un gestionale colleghi e-commerce, negozio fisico e marketplace su un unico magazzino, così le giacenze sono sempre allineate su ogni canale e non vendi due volte lo stesso capo."),
  ]),
 en=dict(
  desc="E-commerce, lookbooks and size/color management for fashion brands, boutiques and clothing. From €1,200, free quote within 24 hours.",
  body="""<p>Fashion is bought with the eyes: the sale hinges on flawless photos, a catalog that handles <strong>sizes, colors and variants</strong> well and a checkout that never makes you hesitate. A clothing brand doesn't need a merely &laquo;pretty&raquo; site &mdash; it needs a fast e-commerce that survives launch spikes and communicates identity in every pixel. The gap between an online store that sells and one that only collects likes almost always lives in the buying experience.</p>
<h2>The fashion e-commerce</h2>
<p>The core is an <a href="/en/services/ecommerce/">e-commerce</a> (from <strong>&euro;1,200</strong>) built for fashion: a size/color matrix, per-variant stock, image zoom, a size guide to cut returns and a cart that opens instantly. We integrate payments (Stripe, PayPal, cards), shipping and automated returns, because in fashion the returns flow is part of the sale.</p>
<h2>Lookbook and brand identity</h2>
<p>Before the purchase comes desire. A <a href="/en/services/web-development/">site</a> (from <strong>&euro;800</strong>) with a lookbook, storytelling and seasonal collections builds the brand and feeds the store. Careful typography, full-bleed imagery and fast loading convey a brand's positioning better than any description.</p>
<h2>Stock, sizes and multichannel</h2>
<p>Fashion runs on seasons, sales and multiple channels (site, physical shop, marketplaces). A <a href="/en/services/erp/">management system</a> (from <strong>&euro;5,000</strong>) syncs stock across every channel so you never sell a sold-out item, and tells you which sizes and colors perform. For brands with loyal customers, an <a href="/en/services/mobile-apps/">app</a> (from <strong>&euro;3,000</strong>) with drops and push notifications powers launches.</p>
<h2>Getting found and selling to AI engines</h2>
<p>Fashion search runs through Google Images, Shopping and increasingly AI assistants. We optimize product pages, structured data and content with our <a href="/en/services/seo/">SEO</a> (from &euro;500/month), so your collections appear when someone searches for that piece, that color, that style.</p>""",
  faqs=[
   ("How much does a fashion e-commerce cost?", "A professional e-commerce with size, color and variant management starts at &euro;1,200. The price grows with the number of products, logistics integrations and how custom the design is. Free quote within 24 hours."),
   ("How are sizes and colors handled without errors?", "With a variant matrix tied to stock: every size/color combination has its own inventory, and when one runs out it disappears from the cart. So you don't sell items you don't have and you cut refunds."),
   ("Can you reduce returns?", "Partly yes: a precise size guide, faithful photos, real measurements and reviews with the size worn sharply lower wrong-size returns, which are the number-one cause in fashion."),
   ("I also sell in-store: can I sync everything?", "Yes. A management system links your e-commerce, physical shop and marketplaces to a single stock, so inventory is always aligned across every channel and you never sell the same item twice."),
  ]),
 bg=dict(
  desc="Онлайн магазин, лукбук и управление на размери/цветове за модни брандове, бутици и облекло. От €1200, безплатна оферта до 24 часа.",
  body="""<p>Модата се купува с очите: продажбата зависи от безупречни снимки, каталог, който добре управлява <strong>размери, цветове и варианти</strong>, и поръчка, която не кара клиента да се колебае. Модният бранд не се нуждае просто от &laquo;красив&raquo; сайт, а от бърз онлайн магазин, който издържа пиковете при пускане на колекции и излъчва идентичност във всеки пиксел. Разликата между магазин, който продава, и такъв, който само събира лайкове, почти винаги е в изживяването при покупка.</p>
<h2>Модният онлайн магазин</h2>
<p>Ядрото е <a href="/bg/uslugi/ecommerce/">онлайн магазин</a> (от <strong>&euro;1200</strong>), направен за мода: матрица размер/цвят, наличност по вариант, увеличение на снимките, таблица с размери за по-малко връщания и количка, която се отваря мигновено. Интегрираме плащания (Stripe, PayPal, карти), доставки и автоматизирани връщания, защото в модата логистиката на връщанията е част от продажбата.</p>
<h2>Лукбук и идентичност на бранда</h2>
<p>Преди покупката идва желанието. <a href="/bg/uslugi/web-razrabotka/">Сайт</a> (от <strong>&euro;800</strong>) с лукбук, разказ за бранда и сезонни колекции изгражда марката и захранва магазина. Прецизна типография, изображения на цял екран и бързо зареждане предават позиционирането на бранда по-добре от всяко описание.</p>
<h2>Склад, размери и много канали</h2>
<p>Модата живее от сезони, разпродажби и много канали (сайт, физически магазин, маркетплейси). <a href="/bg/uslugi/erp/">Управленска система</a> (от <strong>&euro;5000</strong>) синхронизира наличностите между всички канали, за да не продадете изчерпан артикул, и ви показва кои размери и цветове се движат. За брандове с лоялни клиенти <a href="/bg/uslugi/mobilni-prilozheniya/">приложение</a> (от <strong>&euro;3000</strong>) с дропове и известия усилва пусканията.</p>
<h2>Да ви намират и да продавате на AI търсачки</h2>
<p>Търсенето на мода минава през Google Images, Shopping и все повече през AI асистенти. Оптимизираме продуктови страници, структурирани данни и съдържание с нашето <a href="/bg/uslugi/seo/">SEO</a> (от &euro;500/месец), така че колекциите ви да излизат, когато някой търси точно тази дреха, този цвят, този стил.</p>""",
  faqs=[
   ("Колко струва онлайн магазин за моден бранд?", "Професионален онлайн магазин с управление на размери, цветове и варианти започва от &euro;1200. Цената расте с броя продукти, логистичните интеграции и степента на персонализация. Безплатна оферта до 24 часа."),
   ("Как се управляват размери и цветове без грешки?", "С матрица от варианти, свързана със склада: всяка комбинация размер/цвят има собствена наличност и когато свърши, изчезва от количката. Така не продавате артикули, които нямате, и намалявате връщанията на пари."),
   ("Можете ли да намалите връщанията?", "Отчасти да: точна таблица с размери, верни снимки, реални мерки и отзиви с носения размер силно намаляват връщанията заради грешен размер, които са причина номер едно в модата."),
   ("Продавам и в магазин: мога ли да синхронизирам всичко?", "Да. С управленска система свързвате онлайн магазина, физическия магазин и маркетплейсите в един склад, така че наличностите са винаги изравнени по всеки канал и не продавате един и същ артикул два пъти."),
  ])),

# 3 ── Immobiliare ───────────────────────────────────────────────
dict(slug="immobiliare", related=["servizi-professionali", "hotel-turismo", "avvocati"],
 names=dict(it="Immobiliare", en="Real Estate", bg="Недвижими Имоти"),
 tagline=dict(it="Portali annunci con ricerca, mappe e lead che diventano visite.",
   en="Listing portals with search, maps and leads that become viewings.",
   bg="Портали за обяви с търсене, карти и запитвания, които стават огледи."),
 it=dict(
  desc="Portale annunci, ricerca avanzata, gestione lead e CRM per agenzie immobiliari. Da €800, preventivo gratuito in 24 ore.",
  body="""<p>Nell'immobiliare vince chi cattura il lead per primo. Il cliente cerca casa online, filtra per zona, prezzo e metratura, salva gli annunci e contatta l'agenzia che presenta gli immobili in modo pi&ugrave; chiaro. Un'agenzia immobiliare ha bisogno di un <strong>portale con ricerca avanzata, schede immobile complete e un sistema che non perda nemmeno una richiesta</strong>. Il sito non &egrave; una brochure: &egrave; la tua vetrina principale e il tuo primo venditore.</p>
<h2>Il portale annunci</h2>
<p>Costruiamo <a href="/servizi/sviluppo-siti-web/">portali immobiliari</a> (da <strong>&euro;800</strong>) con ricerca per zona, prezzo, tipologia e caratteristiche, mappa interattiva, gallerie foto ad alta risoluzione, planimetrie e tour virtuali. Ogni scheda ha dati strutturati per comparire meglio su Google, e un modulo di contatto rapido che trasforma il visitatore in richiesta di visita.</p>
<h2>Gestione lead e CRM</h2>
<p>Il valore vero &egrave; nella gestione delle richieste. Un <a href="/servizi/erp/">gestionale/CRM su misura</a> (da <strong>&euro;5.000</strong>) raccoglie i lead da sito, portali esterni e telefono in un unico posto, li assegna agli agenti, traccia gli appuntamenti e ti dice quali immobili generano pi&ugrave; interesse. Con la sincronizzazione dei portali (Immobiliare.it, Idealista) pubblichi un annuncio una volta e appare ovunque.</p>
<h2>App per agenti e clienti</h2>
<p>Per le agenzie strutturate, un'<a href="/servizi/app-mobile/">app mobile</a> (da <strong>&euro;3.000</strong>) permette agli agenti di caricare immobili e foto sul posto e ai clienti di ricevere notifiche appena esce una casa che corrisponde ai loro criteri: chi arriva primo, prenota la visita.</p>
<h2>SEO locale e visibilit&agrave;</h2>
<p>Le ricerche immobiliari sono locali per definizione: &laquo;case in vendita [quartiere]&raquo;. Con la <a href="/servizi/seo/">SEO</a> (da &euro;500/mese) ottimizziamo pagine di zona, dati strutturati degli immobili e la scheda Google, cos&igrave; la tua agenzia intercetta chi cerca proprio dove operi tu, prima dei grandi portali generalisti.</p>""",
  faqs=[
   ("Quanto costa un sito per un'agenzia immobiliare?", "Un portale con ricerca avanzata, schede immobile e mappa parte da &euro;800. Aggiungendo un CRM per gestire lead e agenti si passa a un progetto su misura da &euro;5.000. Preventivo gratuito in 24 ore."),
   ("Posso sincronizzare gli annunci con i portali esterni?", "Sì. Colleghiamo il tuo sito a portali come Immobiliare.it e Idealista tramite feed, così pubblichi l'immobile una volta e viene aggiornato automaticamente su tutti i canali, senza doppio lavoro."),
   ("Come evito di perdere le richieste dei clienti?", "Con un CRM che raccoglie ogni lead da sito, portali e telefono in un unico posto, lo assegna a un agente e invia promemoria. Nessuna richiesta resta senza risposta, ed è la differenza tra chiudere o perdere una trattativa."),
   ("I tour virtuali servono davvero?", "Sì: filtrano i curiosi e portano in visita solo chi è interessato. Una scheda con foto professionali, planimetria e tour virtuale riceve molte più richieste qualificate di un annuncio con due foto sfocate."),
  ]),
 en=dict(
  desc="Listing portal, advanced search, lead management and CRM for real estate agencies. From €800, free quote within 24 hours.",
  body="""<p>In real estate, whoever captures the lead first wins. Buyers search online, filter by area, price and size, save listings and contact the agency that presents properties most clearly. A real estate agency needs a <strong>portal with advanced search, complete property pages and a system that never loses an enquiry</strong>. The website isn't a brochure &mdash; it's your main storefront and your first salesperson.</p>
<h2>The listing portal</h2>
<p>We build <a href="/en/services/web-development/">real estate portals</a> (from <strong>&euro;800</strong>) with search by area, price, type and features, an interactive map, high-resolution galleries, floor plans and virtual tours. Every listing carries structured data to rank better on Google, plus a quick contact form that turns a visitor into a viewing request.</p>
<h2>Lead management and CRM</h2>
<p>The real value is in handling enquiries. A <a href="/en/services/erp/">custom CRM/management system</a> (from <strong>&euro;5,000</strong>) gathers leads from your site, external portals and phone in one place, assigns them to agents, tracks appointments and tells you which properties draw the most interest. With portal sync (Rightmove, Idealista and similar) you publish a listing once and it appears everywhere.</p>
<h2>Apps for agents and clients</h2>
<p>For larger agencies, a <a href="/en/services/mobile-apps/">mobile app</a> (from <strong>&euro;3,000</strong>) lets agents upload properties and photos on site, and lets clients get a notification the moment a home matching their criteria appears: whoever arrives first books the viewing.</p>
<h2>Local SEO and visibility</h2>
<p>Property searches are local by nature: &laquo;houses for sale [neighborhood]&raquo;. With <a href="/en/services/seo/">SEO</a> (from &euro;500/month) we optimize area pages, property structured data and your Google profile, so your agency captures people searching exactly where you operate, ahead of the big generalist portals.</p>""",
  faqs=[
   ("How much does a real estate agency website cost?", "A portal with advanced search, property pages and a map starts at &euro;800. Adding a CRM to manage leads and agents moves it to a custom project from &euro;5,000. Free quote within 24 hours."),
   ("Can I sync listings with external portals?", "Yes. We connect your site to portals via feeds, so you publish a property once and it updates automatically across every channel, with no double work."),
   ("How do I avoid losing client enquiries?", "With a CRM that gathers every lead from site, portals and phone in one place, assigns it to an agent and sends reminders. No enquiry goes unanswered, and that's the difference between closing and losing a deal."),
   ("Are virtual tours actually worth it?", "Yes: they filter out the merely curious and bring only interested buyers to viewings. A listing with professional photos, a floor plan and a virtual tour gets far more qualified enquiries than one with two blurry photos."),
  ]),
 bg=dict(
  desc="Портал за обяви, разширено търсене, управление на запитвания и CRM за агенции за недвижими имоти. От €800, безплатна оферта до 24 часа.",
  body="""<p>При имотите печели този, който хване запитването пръв. Клиентът търси имот онлайн, филтрира по район, цена и квадратура, запазва обяви и се свързва с агенцията, която представя имотите най-ясно. Агенцията за недвижими имоти има нужда от <strong>портал с разширено търсене, пълни страници на имотите и система, която не изпуска нито едно запитване</strong>. Сайтът не е брошура — той е основната ви витрина и първият ви продавач.</p>
<h2>Порталът за обяви</h2>
<p>Изграждаме <a href="/bg/uslugi/web-razrabotka/">имотни портали</a> (от <strong>&euro;800</strong>) с търсене по район, цена, тип и характеристики, интерактивна карта, галерии с висока резолюция, разпределения и виртуални огледи. Всяка обява носи структурирани данни за по-добро класиране в Google и бърза форма за контакт, която превръща посетителя в заявка за оглед.</p>
<h2>Управление на запитвания и CRM</h2>
<p>Истинската стойност е в обработката на запитванията. <a href="/bg/uslugi/erp/">CRM/управленска система по поръчка</a> (от <strong>&euro;5000</strong>) събира запитванията от сайта, външните портали и телефона на едно място, разпределя ги към брокери, следи срещите и показва кои имоти будят най-голям интерес. Със синхронизация на порталите публикувате обява веднъж и тя се появява навсякъде.</p>
<h2>Приложения за брокери и клиенти</h2>
<p>За по-големите агенции <a href="/bg/uslugi/mobilni-prilozheniya/">мобилно приложение</a> (от <strong>&euro;3000</strong>) позволява на брокерите да качват имоти и снимки на място, а на клиентите — да получават известие в момента, в който излезе имот по техните критерии: който дойде пръв, запазва огледа.</p>
<h2>Локално SEO и видимост</h2>
<p>Търсенията за имоти са локални по природа: &laquo;имоти за продажба [квартал]&raquo;. С <a href="/bg/uslugi/seo/">SEO</a> (от &euro;500/месец) оптимизираме страници по райони, структурирани данни на имотите и Google профила, така че агенцията ви хваща търсещите точно там, където работите, преди големите общи портали.</p>""",
  faqs=[
   ("Колко струва сайт за агенция за недвижими имоти?", "Портал с разширено търсене, страници на имотите и карта започва от &euro;800. С добавен CRM за управление на запитвания и брокери се преминава към проект по поръчка от &euro;5000. Безплатна оферта до 24 часа."),
   ("Мога ли да синхронизирам обявите с външни портали?", "Да. Свързваме сайта ви с портали чрез feed, така че публикувате имот веднъж и той се обновява автоматично по всички канали, без двойна работа."),
   ("Как да не изпускам запитванията на клиентите?", "С CRM, който събира всяко запитване от сайт, портали и телефон на едно място, разпределя го към брокер и изпраща напомняния. Нито едно запитване не остава без отговор, а това е разликата между сключена и изпусната сделка."),
   ("Виртуалните огледи наистина ли помагат?", "Да: филтрират любопитните и водят на оглед само заинтересованите. Обява с професионални снимки, разпределение и виртуален оглед получава далеч повече качествени запитвания от обява с две размазани снимки."),
  ])),

# 4 ── Studi Medici ──────────────────────────────────────────────
dict(slug="studi-medici", related=["avvocati", "servizi-professionali", "palestre-fitness"],
 names=dict(it="Studi Medici", en="Medical Practices", bg="Медицински Кабинети"),
 tagline=dict(it="Prenotazioni online, agende e siti conformi per studi e cliniche.",
   en="Online booking, schedules and compliant sites for clinics and practices.",
   bg="Онлайн записване, графици и коректни сайтове за кабинети и клиники."),
 it=dict(
  desc="Sito, prenotazione visite online, gestione agenda e conformità privacy per studi medici, dentisti e cliniche. Da €800, preventivo gratuito in 24 ore.",
  body="""<p>Un paziente sceglie uno studio medico per fiducia e comodit&agrave;: cerca online, legge chi sei e quali prestazioni offri, e vuole poter prenotare senza telefonare negli orari di apertura. Uno studio medico, un dentista o una clinica hanno bisogno di un <strong>sito professionale che trasmetta seriet&agrave;, prenotazione online e una gestione dell'agenda che riduca le assenze</strong>. E, trattando dati sanitari, tutto dev'essere conforme alle norme sulla privacy.</p>
<h2>Il sito dello studio</h2>
<p>Realizziamo <a href="/servizi/sviluppo-siti-web/">siti per studi medici</a> (da <strong>&euro;800</strong>) chiari e rassicuranti: chi sei, l'&eacute;quipe, le prestazioni, gli orari, come raggiungerti e le informazioni utili al paziente. Testi comprensibili, caricamento veloce e piena accessibilit&agrave;, con cookie e informative a norma GDPR gestite correttamente.</p>
<h2>Prenotazione visite online</h2>
<p>Il modulo di prenotazione online &egrave; ci&ograve; che i pazienti chiedono di pi&ugrave;: scelgono prestazione, medico e orario disponibile senza chiamare, e ricevono promemoria automatici che abbattono le mancate presentazioni. Si collega alla tua agenda reale per evitare sovrapposizioni. Per studi con pi&ugrave; medici e sedi, un'<a href="/servizi/app-mobile/">app</a> (da <strong>&euro;3.000</strong>) semplifica appuntamenti e referti.</p>
<h2>Gestione agenda, pazienti e cartelle</h2>
<p>Dietro le quinte, un <a href="/servizi/erp/">gestionale su misura</a> (da <strong>&euro;5.000</strong>) organizza agende multiple, anagrafica pazienti, storico visite, promemoria e fatturazione. Progettato con attenzione alla protezione dei dati sanitari, ti fa risparmiare ore di segreteria e riduce gli errori. Nulla di pi&ugrave; del necessario, tutto dove serve.</p>
<h2>Farsi trovare in zona</h2>
<p>Le ricerche mediche sono locali e urgenti: &laquo;dentista [citt&agrave;]&raquo;, &laquo;pediatra vicino a me&raquo;. Con la <a href="/servizi/seo/">SEO locale</a> (da &euro;500/mese) ottimizziamo scheda Google, pagine per prestazione e recensioni, cos&igrave; il tuo studio compare nel momento in cui un paziente cerca proprio la tua specialit&agrave;.</p>""",
  faqs=[
   ("Quanto costa un sito per uno studio medico?", "Un sito professionale con presentazione, prestazioni e prenotazione online parte da &euro;800. Con gestione agenda, pazienti e fatturazione si passa a un gestionale su misura da &euro;5.000. Preventivo gratuito in 24 ore."),
   ("Il sito è conforme alla privacy per i dati sanitari?", "Sì. Gestiamo cookie, informative e moduli in conformità al GDPR, con particolare attenzione ai dati sanitari, che sono categoria particolare. Prenotazioni e dati sensibili viaggiano cifrati e su infrastruttura europea."),
   ("La prenotazione online si collega alla mia agenda?", "Sì. Il modulo mostra solo gli slot realmente liberi e si sincronizza con la tua agenda, evitando sovrapposizioni. I promemoria automatici via email o SMS riducono in modo netto le mancate presentazioni."),
   ("Serve un gestionale o basta il sito?", "Dipende dalle dimensioni. Un singolo professionista spesso parte bene con sito e prenotazione; uno studio con più medici, sedi e segreteria trae grande vantaggio da un gestionale che centralizza agende, pazienti e fatturazione."),
  ]),
 en=dict(
  desc="Website, online appointment booking, schedule management and privacy compliance for clinics, dentists and medical practices. From €800, free quote within 24 hours.",
  body="""<p>A patient chooses a practice on trust and convenience: they search online, read who you are and what you offer, and want to book without phoning during opening hours. A medical practice, dentist or clinic needs a <strong>professional website that conveys credibility, online booking and schedule management that cuts no-shows</strong>. And, because it handles health data, everything must comply with privacy rules.</p>
<h2>The practice website</h2>
<p>We build <a href="/en/services/web-development/">websites for medical practices</a> (from <strong>&euro;800</strong>) that are clear and reassuring: who you are, the team, services, hours, how to find you and information patients need. Readable copy, fast loading and full accessibility, with GDPR-compliant cookies and notices handled properly.</p>
<h2>Online appointment booking</h2>
<p>Online booking is what patients ask for most: they pick a service, doctor and available slot without calling, and get automatic reminders that slash no-shows. It connects to your real schedule to avoid clashes. For multi-doctor, multi-site practices, an <a href="/en/services/mobile-apps/">app</a> (from <strong>&euro;3,000</strong>) simplifies appointments and reports.</p>
<h2>Schedule, patient and records management</h2>
<p>Behind the scenes, a <a href="/en/services/erp/">custom management system</a> (from <strong>&euro;5,000</strong>) organizes multiple schedules, patient records, visit history, reminders and invoicing. Designed with health-data protection in mind, it saves hours of front-desk work and reduces errors. Nothing more than needed, everything where it belongs.</p>
<h2>Getting found locally</h2>
<p>Medical searches are local and urgent: &laquo;dentist [city]&raquo;, &laquo;pediatrician near me&raquo;. With <a href="/en/services/seo/">local SEO</a> (from &euro;500/month) we optimize your Google profile, per-service pages and reviews, so your practice appears the moment a patient searches for exactly your specialty.</p>""",
  faqs=[
   ("How much does a medical practice website cost?", "A professional site with an introduction, services and online booking starts at &euro;800. With schedule, patient and invoicing management it becomes a custom system from &euro;5,000. Free quote within 24 hours."),
   ("Is the site privacy-compliant for health data?", "Yes. We handle cookies, notices and forms in line with GDPR, with special attention to health data, which is a special category. Bookings and sensitive data travel encrypted and on European infrastructure."),
   ("Does online booking connect to my schedule?", "Yes. The form shows only genuinely free slots and syncs with your calendar, avoiding clashes. Automatic email or SMS reminders sharply reduce no-shows."),
   ("Do I need a management system or is a website enough?", "It depends on size. A single practitioner often starts well with a site and booking; a practice with several doctors, sites and reception staff benefits greatly from a system that centralizes schedules, patients and invoicing."),
  ]),
 bg=dict(
  desc="Сайт, онлайн записване на часове, управление на график и съответствие с GDPR за лекарски кабинети, зъболекари и клиники. От €800, безплатна оферта до 24 часа.",
  body="""<p>Пациентът избира кабинет заради доверие и удобство: търси онлайн, чете кой сте и какви услуги предлагате и иска да запише час, без да звъни в работно време. Медицинският кабинет, зъболекарят или клиниката имат нужда от <strong>професионален сайт, който вдъхва доверие, онлайн записване и управление на графика, което намалява неявяванията</strong>. И тъй като се обработват здравни данни, всичко трябва да е в съответствие с правилата за поверителност.</p>
<h2>Сайтът на кабинета</h2>
<p>Изработваме <a href="/bg/uslugi/web-razrabotka/">сайтове за лекарски кабинети</a> (от <strong>&euro;800</strong>), ясни и успокояващи: кой сте, екипът, услугите, работното време, как да ви намерят и полезна за пациента информация. Разбираем текст, бързо зареждане и пълна достъпност, с коректно управлявани бисквитки и декларации по GDPR.</p>
<h2>Онлайн записване на часове</h2>
<p>Онлайн записването е това, което пациентите искат най-много: избират услуга, лекар и свободен час без обаждане и получават автоматични напомняния, които намаляват неявяванията. Свързва се с реалния ви график, за да няма застъпвания. За кабинети с няколко лекари и локации <a href="/bg/uslugi/mobilni-prilozheniya/">приложение</a> (от <strong>&euro;3000</strong>) улеснява часовете и резултатите.</p>
<h2>Управление на график, пациенти и картони</h2>
<p>Зад кулисите <a href="/bg/uslugi/erp/">управленска система по поръчка</a> (от <strong>&euro;5000</strong>) организира няколко графика, регистър на пациентите, история на прегледите, напомняния и фактуриране. Проектирана с грижа за защитата на здравните данни, тя ви спестява часове работа на регистратурата и намалява грешките. Нищо повече от нужното, всичко на мястото си.</p>
<h2>Да ви намират в района</h2>
<p>Медицинските търсения са локални и спешни: &laquo;зъболекар [град]&raquo;, &laquo;педиатър близо до мен&raquo;. С <a href="/bg/uslugi/seo/">локално SEO</a> (от &euro;500/месец) оптимизираме Google профила, страници по услуга и отзивите, така че кабинетът ви да излиза точно когато пациент търси вашата специалност.</p>""",
  faqs=[
   ("Колко струва сайт за лекарски кабинет?", "Професионален сайт с представяне, услуги и онлайн записване започва от &euro;800. С управление на график, пациенти и фактуриране се преминава към система по поръчка от &euro;5000. Безплатна оферта до 24 часа."),
   ("Сайтът съответства ли на GDPR за здравни данни?", "Да. Управляваме бисквитки, декларации и форми в съответствие с GDPR, със специално внимание към здравните данни, които са специална категория. Записванията и чувствителните данни се предават криптирани и на европейска инфраструктура."),
   ("Онлайн записването свързва ли се с моя график?", "Да. Формата показва само реално свободните часове и се синхронизира с календара ви, за да няма застъпвания. Автоматичните напомняния по имейл или SMS чувствително намаляват неявяванията."),
   ("Трябва ли ми управленска система или сайтът стига?", "Зависи от мащаба. Един специалист често стартира добре със сайт и записване; кабинет с няколко лекари, локации и регистратура печели много от система, която централизира графици, пациенти и фактуриране."),
  ])),

# 5 ── Avvocati ──────────────────────────────────────────────────
dict(slug="avvocati", related=["servizi-professionali", "studi-medici", "immobiliare"],
 names=dict(it="Avvocati", en="Lawyers", bg="Адвокати"),
 tagline=dict(it="Siti autorevoli e gestione pratiche per studi legali e professionisti.",
   en="Authoritative sites and case management for law firms and professionals.",
   bg="Авторитетни сайтове и управление на дела за адвокатски кантори."),
 it=dict(
  desc="Sito professionale, prenotazione consulenze e gestione pratiche per avvocati e studi legali. Da €800, preventivo gratuito in 24 ore.",
  body="""<p>Un cliente sceglie un avvocato per competenza e affidabilit&agrave;, e le valuta online prima del primo contatto. Uno studio legale ha bisogno di un <strong>sito autorevole che comunichi aree di specializzazione ed esperienza, raccolga richieste di consulenza qualificate e tuteli la riservatezza</strong>. Non serve un sito appariscente: serve un sito che infonda fiducia e che porti i clienti giusti, non chiunque.</p>
<h2>Il sito dello studio legale</h2>
<p>Realizziamo <a href="/servizi/sviluppo-siti-web/">siti per avvocati</a> (da <strong>&euro;800</strong>) sobri e professionali: aree di diritto trattate, profilo dei professionisti, casi e competenze, un blog giuridico che dimostra autorevolezza e un modulo di contatto riservato. Design pulito, testi chiari e piena conformit&agrave; alle norme deontologiche e alla privacy.</p>
<h2>Prenotazione consulenze e primo contatto</h2>
<p>Un modulo di richiesta consulenza ben progettato qualifica il contatto fin da subito: tipo di questione, urgenza, dati essenziali. Puoi aggiungere la prenotazione di un primo appuntamento (in studio o in video) collegata alla tua agenda, cos&igrave; converti il visitatore mentre &egrave; motivato, senza scambi di email infiniti.</p>
<h2>Gestione pratiche e scadenze</h2>
<p>Il cuore operativo di uno studio &egrave; la gestione delle pratiche. Un <a href="/servizi/erp/">gestionale su misura</a> (da <strong>&euro;5.000</strong>) organizza fascicoli, scadenze processuali, documenti, parcelle e comunicazioni con i clienti in un unico sistema sicuro. Le scadenze non si perdono, i documenti sono tracciati e la fatturazione &egrave; ordinata: meno rischio, pi&ugrave; tempo per il lavoro legale.</p>
<h2>Farsi trovare per la propria materia</h2>
<p>Chi cerca un avvocato usa termini precisi: &laquo;avvocato divorzista [citt&agrave;]&raquo;, &laquo;recupero crediti&raquo;. Con la <a href="/servizi/seo/">SEO</a> (da &euro;500/mese) creiamo pagine per area di diritto e ottimizziamo la scheda locale, cos&igrave; il tuo studio compare quando qualcuno cerca esattamente la tua specializzazione, con contenuti che dimostrano competenza.</p>""",
  faqs=[
   ("Quanto costa un sito per uno studio legale?", "Un sito professionale con aree di diritto, profili e modulo consulenza parte da &euro;800. Con un gestionale per pratiche, scadenze e parcelle si passa a un progetto su misura da &euro;5.000. Preventivo gratuito in 24 ore."),
   ("Il sito rispetta le norme deontologiche degli avvocati?", "Sì. Progettiamo i contenuti nel rispetto delle regole deontologiche sulla comunicazione dell'avvocato: informazione corretta e non ingannevole, niente promesse di risultato, con privacy e riservatezza dei dati garantite."),
   ("Posso far prenotare le consulenze online?", "Sì. Aggiungiamo un modulo di richiesta consulenza che qualifica il contatto e, se vuoi, la prenotazione di un primo appuntamento in studio o in video collegata alla tua agenda, così converti chi è motivato senza rimbalzi di email."),
   ("Un gestionale per le pratiche serve a uno studio piccolo?", "Anche a uno studio piccolo: tenere fascicoli, scadenze e documenti in un unico sistema riduce il rischio di errori e di scadenze perse. Dimensioniamo il gestionale sulla realtà dello studio, senza funzioni inutili."),
  ]),
 en=dict(
  desc="Professional website, consultation booking and case management for lawyers and law firms. From €800, free quote within 24 hours.",
  body="""<p>A client chooses a lawyer on competence and reliability, and judges both online before the first contact. A law firm needs an <strong>authoritative website that communicates practice areas and experience, collects qualified consultation requests and protects confidentiality</strong>. It doesn't need to be flashy: it needs to inspire trust and bring the right clients, not just anyone.</p>
<h2>The law firm website</h2>
<p>We build <a href="/en/services/web-development/">websites for lawyers</a> (from <strong>&euro;800</strong>) that are restrained and professional: practice areas, lawyer profiles, cases and expertise, a legal blog that demonstrates authority and a confidential contact form. Clean design, clear copy and full compliance with professional-conduct and privacy rules.</p>
<h2>Consultation booking and first contact</h2>
<p>A well-designed consultation request qualifies the contact from the start: type of matter, urgency, essential details. You can add first-appointment booking (in office or by video) tied to your calendar, converting the visitor while motivated, without endless email exchanges.</p>
<h2>Case and deadline management</h2>
<p>The operational core of a firm is case management. A <a href="/en/services/erp/">custom management system</a> (from <strong>&euro;5,000</strong>) organizes files, court deadlines, documents, fees and client communications in one secure system. Deadlines aren't missed, documents are tracked and billing is orderly: less risk, more time for legal work.</p>
<h2>Getting found for your practice area</h2>
<p>People searching for a lawyer use precise terms: &laquo;divorce lawyer [city]&raquo;, &laquo;debt recovery&raquo;. With <a href="/en/services/seo/">SEO</a> (from &euro;500/month) we create practice-area pages and optimize your local profile, so your firm appears when someone searches for exactly your specialty, with content that proves expertise.</p>""",
  faqs=[
   ("How much does a law firm website cost?", "A professional site with practice areas, profiles and a consultation form starts at &euro;800. With a case-management system for files, deadlines and fees it becomes a custom project from &euro;5,000. Free quote within 24 hours."),
   ("Does the site respect professional-conduct rules for lawyers?", "Yes. We design content in line with professional-conduct rules on lawyer communication: accurate, non-misleading information, no promises of outcome, with privacy and data confidentiality guaranteed."),
   ("Can I take consultation bookings online?", "Yes. We add a consultation request that qualifies the contact and, if you want, first-appointment booking in office or by video tied to your calendar, converting motivated clients without email back-and-forth."),
   ("Is a case-management system useful for a small firm?", "Even for a small firm: keeping files, deadlines and documents in one system reduces the risk of errors and missed deadlines. We size the system to the firm's reality, with no unnecessary features."),
  ]),
 bg=dict(
  desc="Професионален сайт, записване на консултации и управление на дела за адвокати и кантори. От €800, безплатна оферта до 24 часа.",
  body="""<p>Клиентът избира адвокат заради компетентност и надеждност и ги преценява онлайн преди първия контакт. Адвокатската кантора има нужда от <strong>авторитетен сайт, който представя областите на специализация и опита, събира качествени запитвания за консултация и пази поверителността</strong>. Не е нужен ефектен сайт — нужен е сайт, който вдъхва доверие и води правилните клиенти, а не всеки.</p>
<h2>Сайтът на кантората</h2>
<p>Изработваме <a href="/bg/uslugi/web-razrabotka/">сайтове за адвокати</a> (от <strong>&euro;800</strong>), сдържани и професионални: области на правото, профили на юристите, казуси и компетенции, правен блог, който доказва авторитет, и поверителна форма за контакт. Чист дизайн, ясен текст и пълно съответствие с етичните правила и поверителността.</p>
<h2>Записване на консултации и първи контакт</h2>
<p>Добре направена форма за консултация квалифицира контакта от самото начало: вид на въпроса, спешност, основни данни. Може да добавите записване на първа среща (в кантората или видео), свързано с календара ви, така превръщате посетителя, докато е мотивиран, без безкрайна размяна на имейли.</p>
<h2>Управление на дела и срокове</h2>
<p>Оперативното сърце на кантората е управлението на делата. <a href="/bg/uslugi/erp/">Управленска система по поръчка</a> (от <strong>&euro;5000</strong>) организира досиета, процесуални срокове, документи, хонорари и комуникация с клиентите в една сигурна система. Сроковете не се изпускат, документите се проследяват, фактурирането е подредено: по-малко риск, повече време за правната работа.</p>
<h2>Да ви намират по вашата материя</h2>
<p>Търсещите адвокат използват точни думи: &laquo;адвокат по бракоразводни дела [град]&raquo;, &laquo;събиране на вземания&raquo;. С <a href="/bg/uslugi/seo/">SEO</a> (от &euro;500/месец) създаваме страници по област на правото и оптимизираме локалния профил, така че кантората ви да излиза, когато някой търси точно вашата специализация, със съдържание, което доказва компетентност.</p>""",
  faqs=[
   ("Колко струва сайт за адвокатска кантора?", "Професионален сайт с области на правото, профили и форма за консултация започва от &euro;800. С управленска система за дела, срокове и хонорари се преминава към проект по поръчка от &euro;5000. Безплатна оферта до 24 часа."),
   ("Сайтът спазва ли етичните правила за адвокати?", "Да. Изготвяме съдържанието в съответствие с етичните правила за адвокатска реклама: коректна и неподвеждаща информация, без обещания за резултат, с гарантирана поверителност на данните."),
   ("Мога ли да приемам записвания за консултации онлайн?", "Да. Добавяме форма за консултация, която квалифицира контакта, и по желание записване на първа среща в кантората или видео, свързано с календара ви, така превръщате мотивираните клиенти без имейл разправии."),
   ("Управленска система за дела нужна ли е на малка кантора?", "Дори на малка кантора: държането на досиета, срокове и документи в една система намалява риска от грешки и изпуснати срокове. Оразмеряваме системата спрямо реалността на кантората, без излишни функции."),
  ])),

# 6 ── Palestre e Fitness ────────────────────────────────────────
dict(slug="palestre-fitness", related=["studi-medici", "hotel-turismo", "servizi-professionali"],
 names=dict(it="Palestre e Fitness", en="Gyms & Fitness", bg="Фитнес Зали"),
 tagline=dict(it="Abbonamenti, prenotazione corsi e app che fidelizzano i soci.",
   en="Memberships, class booking and apps that retain members.",
   bg="Абонаменти, записване за занятия и приложения, които задържат клиенти."),
 it=dict(
  desc="Sito, prenotazione corsi, gestione abbonamenti e app per palestre, centri fitness e personal trainer. Da €800, preventivo gratuito in 24 ore.",
  body="""<p>Una palestra vive di iscrizioni e, soprattutto, di rinnovi. Il socio si iscrive se trova online orari chiari, corsi e prezzi, e resta se prenotare una lezione &egrave; comodo come inviare un messaggio. Un centro fitness ha bisogno di un <strong>sito che converta i curiosi in iscritti, un sistema di prenotazione corsi e una gestione abbonamenti che riduca gli abbandoni</strong>. La tecnologia giusta non &egrave; un lusso: &egrave; ci&ograve; che tiene pieni i corsi.</p>
<h2>Il sito che porta iscritti</h2>
<p>Costruiamo <a href="/servizi/sviluppo-siti-web/">siti per palestre</a> (da <strong>&euro;800</strong>) con orari dei corsi, listino trasparente, presentazione dei trainer, gallerie e una prova gratuita prenotabile subito. Un sito veloce e chiaro trasforma chi cerca &laquo;palestra vicino a me&raquo; in una prova, e la prova in un abbonamento.</p>
<h2>Prenotazione corsi e app per i soci</h2>
<p>Il cuore dell'esperienza &egrave; la prenotazione delle lezioni: posti limitati, lista d'attesa, disdette entro un orario. Un'<a href="/servizi/app-mobile/">app dedicata</a> (da <strong>&euro;3.000</strong>) con prenotazione, scheda allenamento, notifiche e check-in aumenta la frequenza e la fidelizzazione: i soci che usano l'app rinnovano di pi&ugrave;. Chi vende integratori o merchandising pu&ograve; aggiungere un piccolo <a href="/servizi/ecommerce/">e-commerce</a> (da <strong>&euro;1.200</strong>).</p>
<h2>Gestione abbonamenti e incassi</h2>
<p>Dietro, un <a href="/servizi/erp/">gestionale</a> (da <strong>&euro;5.000</strong>) tiene sotto controllo abbonamenti, scadenze, pagamenti ricorrenti, presenze e rinnovi. Ti avvisa quando un abbonamento sta per scadere e quando un socio smette di venire &mdash; il primo segnale dell'abbandono &mdash; cos&igrave; puoi intervenire prima di perderlo.</p>
<h2>Farsi trovare in zona</h2>
<p>Il fitness &egrave; iper-locale: si sceglie la palestra vicino a casa o al lavoro. Con la <a href="/servizi/seo/">SEO locale</a> (da &euro;500/mese) ottimizziamo scheda Google, recensioni e pagine per servizio (sala pesi, corsi, personal training), cos&igrave; il tuo centro intercetta chi cerca proprio nella tua zona.</p>""",
  faqs=[
   ("Quanto costa un sito per una palestra?", "Un sito con orari corsi, listino e prenotazione prova parte da &euro;800. Con app per i soci si aggiunge da &euro;3.000 e con gestione abbonamenti completa si arriva a un gestionale da &euro;5.000. Preventivo gratuito in 24 ore."),
   ("Un'app per i soci conviene davvero?", "Sì, per la fidelizzazione. I soci che prenotano corsi, seguono le schede e ricevono notifiche dall'app frequentano di più e rinnovano di più. L'app riduce anche il lavoro alla reception per prenotazioni e disdette."),
   ("Posso gestire abbonamenti e pagamenti ricorrenti?", "Sì. Il gestionale tiene traccia di abbonamenti, scadenze e pagamenti ricorrenti, invia promemoria di rinnovo e ti segnala i soci a rischio abbandono, così puoi agire prima che disdicano."),
   ("Come faccio a comparire tra le palestre della mia zona?", "Con la SEO locale: scheda Google ottimizzata, recensioni, foto e pagine dedicate ai tuoi servizi. È il canale principale per un centro fitness, perché la scelta è quasi sempre di prossimità."),
  ]),
 en=dict(
  desc="Website, class booking, membership management and apps for gyms, fitness centers and personal trainers. From €800, free quote within 24 hours.",
  body="""<p>A gym lives on sign-ups and, above all, renewals. A member joins if they find clear schedules, classes and prices online, and stays if booking a class is as easy as sending a message. A fitness center needs a <strong>website that turns browsers into members, a class-booking system and membership management that reduces churn</strong>. The right technology isn't a luxury: it's what keeps classes full.</p>
<h2>The website that brings members</h2>
<p>We build <a href="/en/services/web-development/">gym websites</a> (from <strong>&euro;800</strong>) with class schedules, transparent pricing, trainer profiles, galleries and a free trial bookable on the spot. A fast, clear site turns someone searching &laquo;gym near me&raquo; into a trial, and the trial into a membership.</p>
<h2>Class booking and a member app</h2>
<p>The heart of the experience is class booking: limited spots, waitlists, cancellations within a cutoff. A <a href="/en/services/mobile-apps/">dedicated app</a> (from <strong>&euro;3,000</strong>) with booking, workout plans, notifications and check-in boosts attendance and loyalty: members who use the app renew more. If you sell supplements or merchandise, add a small <a href="/en/services/ecommerce/">e-commerce</a> (from <strong>&euro;1,200</strong>).</p>
<h2>Membership and revenue management</h2>
<p>Behind it, a <a href="/en/services/erp/">management system</a> (from <strong>&euro;5,000</strong>) keeps memberships, expiries, recurring payments, attendance and renewals under control. It warns you when a membership is about to lapse and when a member stops showing up &mdash; the first sign of churn &mdash; so you can act before you lose them.</p>
<h2>Getting found locally</h2>
<p>Fitness is hyper-local: people choose the gym near home or work. With <a href="/en/services/seo/">local SEO</a> (from &euro;500/month) we optimize your Google profile, reviews and per-service pages (weights room, classes, personal training), so your center captures people searching right in your area.</p>""",
  faqs=[
   ("How much does a gym website cost?", "A site with class schedules, pricing and trial booking starts at &euro;800. A member app adds from &euro;3,000, and full membership management brings a system from &euro;5,000. Free quote within 24 hours."),
   ("Is a member app really worth it?", "Yes, for retention. Members who book classes, follow plans and get notifications from the app attend more and renew more. The app also cuts front-desk work for bookings and cancellations."),
   ("Can I manage memberships and recurring payments?", "Yes. The system tracks memberships, expiries and recurring payments, sends renewal reminders and flags members at risk of churn, so you can act before they cancel."),
   ("How do I show up among gyms in my area?", "With local SEO: an optimized Google profile, reviews, photos and pages dedicated to your services. It's the main channel for a fitness center, because the choice is almost always about proximity."),
  ]),
 bg=dict(
  desc="Сайт, записване за занятия, управление на абонаменти и приложение за фитнес зали, центрове и персонални треньори. От €800, безплатна оферта до 24 часа.",
  body="""<p>Фитнес залата живее от записвания и най-вече от подновявания. Клиентът се записва, ако намери онлайн ясен график, занятия и цени, и остава, ако записването за тренировка е лесно колкото да изпратиш съобщение. Фитнес центърът има нужда от <strong>сайт, който превръща любопитните в членове, система за записване за занятия и управление на абонаменти, което намалява отпадането</strong>. Правилната технология не е лукс — тя пълни залите.</p>
<h2>Сайтът, който води клиенти</h2>
<p>Изграждаме <a href="/bg/uslugi/web-razrabotka/">сайтове за фитнес зали</a> (от <strong>&euro;800</strong>) с график на занятията, прозрачни цени, представяне на треньорите, галерии и безплатна пробна тренировка за записване веднага. Бърз и ясен сайт превръща търсещия &laquo;фитнес близо до мен&raquo; в пробна тренировка, а нея — в абонамент.</p>
<h2>Записване за занятия и приложение за членове</h2>
<p>Сърцето на изживяването е записването за тренировки: ограничени места, списък на чакащите, отказ до определен час. <a href="/bg/uslugi/mobilni-prilozheniya/">Специално приложение</a> (от <strong>&euro;3000</strong>) със записване, тренировъчни програми, известия и check-in увеличава посещаемостта и лоялността: членовете, които ползват приложението, подновяват повече. Ако продавате добавки или мърчандайз, добавете малък <a href="/bg/uslugi/ecommerce/">онлайн магазин</a> (от <strong>&euro;1200</strong>).</p>
<h2>Управление на абонаменти и приходи</h2>
<p>Зад всичко <a href="/bg/uslugi/erp/">управленска система</a> (от <strong>&euro;5000</strong>) държи под контрол абонаментите, сроковете, повтарящите се плащания, посещенията и подновяванията. Предупреждава ви, когато абонамент изтича и когато член спре да идва — първият знак за отпадане — за да реагирате, преди да го загубите.</p>
<h2>Да ви намират в района</h2>
<p>Фитнесът е хипер-локален: избира се залата близо до дома или работата. С <a href="/bg/uslugi/seo/">локално SEO</a> (от &euro;500/месец) оптимизираме Google профила, отзивите и страници по услуга (зала за тежести, занятия, персонални тренировки), така че центърът ви да хваща търсещите точно във вашия район.</p>""",
  faqs=[
   ("Колко струва сайт за фитнес зала?", "Сайт с график на занятията, цени и записване за пробна тренировка започва от &euro;800. Приложение за членове добавя от &euro;3000, а пълно управление на абонаменти носи система от &euro;5000. Безплатна оферта до 24 часа."),
   ("Наистина ли си струва приложение за членове?", "Да, за задържане. Членовете, които записват занятия, следват програми и получават известия от приложението, посещават повече и подновяват повече. Приложението намалява и работата на рецепцията по записвания и откази."),
   ("Мога ли да управлявам абонаменти и повтарящи се плащания?", "Да. Системата следи абонаменти, срокове и повтарящи се плащания, изпраща напомняния за подновяване и маркира членовете с риск от отпадане, за да реагирате, преди да се откажат."),
   ("Как да излизам сред залите в моя район?", "С локално SEO: оптимизиран Google профил, отзиви, снимки и страници за вашите услуги. Това е основният канал за фитнес център, защото изборът почти винаги е по близост."),
  ])),

# 7 ── Hotel e Turismo ───────────────────────────────────────────
dict(slug="hotel-turismo", related=["ristoranti", "immobiliare", "palestre-fitness"],
 names=dict(it="Hotel e Turismo", en="Hotels & Tourism", bg="Хотели и Туризъм"),
 tagline=dict(it="Prenotazioni dirette e siti multilingue che aggirano le OTA.",
   en="Direct bookings and multilingual sites that bypass the OTAs.",
   bg="Директни резервации и многоезични сайтове, заобикалящи OTA."),
 it=dict(
  desc="Sito multilingue, motore di prenotazione diretta e gestione strutture per hotel, B&B e case vacanza. Da €800, preventivo gratuito in 24 ore.",
  body="""<p>Ogni prenotazione diretta &egrave; una commissione OTA in meno: Booking e Expedia trattengono il 15-25% per notte. Un hotel, un B&amp;B o una casa vacanza hanno bisogno di un <strong>sito multilingue con motore di prenotazione diretta</strong> che converta il traffico proprio senza intermediari. Le OTA servono per farsi trovare, ma il vero margine si costruisce spostando quante pi&ugrave; prenotazioni possibile sul canale diretto.</p>
<h2>Il sito multilingue che converte</h2>
<p>Realizziamo <a href="/servizi/sviluppo-siti-web/">siti per hotel</a> (da <strong>&euro;800</strong>) veloci, in pi&ugrave; lingue, con foto immersive delle camere, servizi, mappa e recensioni. Il caricamento rapido e le versioni tradotte sono decisivi: il turista internazionale prenota dove capisce tutto e dove il sito non lo fa aspettare.</p>
<h2>Motore di prenotazione diretta</h2>
<p>Il cuore &egrave; il booking engine: disponibilit&agrave; in tempo reale, tariffe, pagamento e conferma immediata, con integrazione al channel manager per evitare l'overbooking tra sito e OTA. Ogni prenotazione diretta ti fa risparmiare la commissione e ti d&agrave; i dati del cliente per fidelizzarlo. Per le catene o le strutture con clientela abituale, un'<a href="/servizi/app-mobile/">app</a> (da <strong>&euro;3.000</strong>) aggiunge check-in e servizi in camera.</p>
<h2>Gestione struttura e tariffe</h2>
<p>Un <a href="/servizi/erp/">gestionale (PMS su misura)</a> (da <strong>&euro;5.000</strong>) collega prenotazioni, camere, pulizie, tariffe stagionali e reportistica in un unico sistema. Sai sempre l'occupazione, il ricavo per camera e quali canali rendono, cos&igrave; puoi ottimizzare i prezzi invece di subirli.</p>
<h2>Farsi trovare dai turisti</h2>
<p>Il turismo passa da Google, Maps e sempre pi&ugrave; dagli assistenti AI. Con la <a href="/servizi/seo/">SEO multilingue</a> (da &euro;500/mese) ottimizziamo scheda Google, dati strutturati (hotel, prezzi, recensioni) e contenuti nelle lingue dei tuoi ospiti, cos&igrave; la tua struttura compare nelle ricerche di viaggio prima e meglio.</p>""",
  faqs=[
   ("Quanto costa un sito per un hotel con prenotazioni dirette?", "Un sito multilingue con motore di prenotazione diretta parte da &euro;800 per la parte web, con il booking engine integrato. Con un PMS gestionale completo si arriva a un progetto da &euro;5.000. Preventivo gratuito in 24 ore."),
   ("Come riduco le commissioni di Booking ed Expedia?", "Spostando prenotazioni sul canale diretto: un sito veloce, multilingue, con booking engine e tariffe dirette conviene all'ospite (spesso miglior prezzo) e a te (nessuna commissione). Le OTA restano utili per la visibilità iniziale."),
   ("Il sito evita l'overbooking con le OTA?", "Sì, con l'integrazione a un channel manager: le disponibilità sono sincronizzate tra sito e portali in tempo reale, così una camera venduta su un canale si chiude automaticamente sugli altri."),
   ("Serve un sito in più lingue?", "Se ricevi ospiti stranieri, sì. Un turista internazionale prenota dove capisce tutto: versioni tradotte, valuta e contenuti localizzati aumentano in modo netto le conversioni sul canale diretto."),
  ]),
 en=dict(
  desc="Multilingual website, direct booking engine and property management for hotels, B&Bs and holiday rentals. From €800, free quote within 24 hours.",
  body="""<p>Every direct booking is one less OTA commission: Booking and Expedia keep 15-25% per night. A hotel, B&amp;B or holiday rental needs a <strong>multilingual website with a direct booking engine</strong> that converts your own traffic without intermediaries. OTAs help you get found, but real margin is built by shifting as many bookings as possible to the direct channel.</p>
<h2>The multilingual site that converts</h2>
<p>We build <a href="/en/services/web-development/">hotel websites</a> (from <strong>&euro;800</strong>) that are fast, multilingual, with immersive room photos, amenities, a map and reviews. Fast loading and translated versions are decisive: the international traveler books where they understand everything and where the site doesn't keep them waiting.</p>
<h2>Direct booking engine</h2>
<p>The core is the booking engine: real-time availability, rates, payment and instant confirmation, integrated with a channel manager to avoid overbooking between site and OTAs. Every direct booking saves the commission and gives you the guest's data to build loyalty. For chains or properties with regular guests, an <a href="/en/services/mobile-apps/">app</a> (from <strong>&euro;3,000</strong>) adds check-in and in-room services.</p>
<h2>Property and rate management</h2>
<p>A <a href="/en/services/erp/">management system (custom PMS)</a> (from <strong>&euro;5,000</strong>) links bookings, rooms, housekeeping, seasonal rates and reporting in one system. You always know occupancy, revenue per room and which channels perform, so you can optimize prices instead of accepting them.</p>
<h2>Getting found by travelers</h2>
<p>Tourism runs through Google, Maps and increasingly AI assistants. With <a href="/en/services/seo/">multilingual SEO</a> (from &euro;500/month) we optimize your Google profile, structured data (hotel, prices, reviews) and content in your guests' languages, so your property appears in travel searches sooner and better.</p>""",
  faqs=[
   ("How much does a hotel website with direct bookings cost?", "A multilingual site with a direct booking engine starts at &euro;800 for the web part, with the booking engine integrated. With a full property-management system it becomes a project from &euro;5,000. Free quote within 24 hours."),
   ("How do I cut Booking and Expedia commissions?", "By shifting bookings to the direct channel: a fast, multilingual site with a booking engine and direct rates benefits the guest (often a better price) and you (no commission). OTAs stay useful for initial visibility."),
   ("Does the site prevent overbooking with OTAs?", "Yes, via channel-manager integration: availability is synced between site and portals in real time, so a room sold on one channel automatically closes on the others."),
   ("Do I need a site in several languages?", "If you host foreign guests, yes. An international traveler books where they understand everything: translated versions, currency and localized content sharply increase direct-channel conversions."),
  ]),
 bg=dict(
  desc="Многоезичен сайт, система за директни резервации и управление на обекти за хотели, къщи за гости и ваканционни имоти. От €800, безплатна оферта до 24 часа.",
  body="""<p>Всяка директна резервация е една комисионна на OTA по-малко: Booking и Expedia удържат 15-25% на нощувка. Хотелът, къщата за гости или ваканционният имот имат нужда от <strong>многоезичен сайт със система за директни резервации</strong>, който превръща собствения трафик без посредници. OTA помагат да ви намерят, но истинският марж се гради, като прехвърляте колкото се може повече резервации към директния канал.</p>
<h2>Многоезичният сайт, който конвертира</h2>
<p>Изработваме <a href="/bg/uslugi/web-razrabotka/">сайтове за хотели</a> (от <strong>&euro;800</strong>), бързи, на няколко езика, с потапящи снимки на стаите, услуги, карта и отзиви. Бързото зареждане и преведените версии са решаващи: международният турист резервира там, където разбира всичко и където сайтът не го кара да чака.</p>
<h2>Система за директни резервации</h2>
<p>Ядрото е booking engine: наличност в реално време, тарифи, плащане и моментално потвърждение, с интеграция към channel manager, за да няма overbooking между сайта и OTA. Всяка директна резервация ви спестява комисионната и ви дава данните на госта за задържане. За вериги или обекти с редовни гости <a href="/bg/uslugi/mobilni-prilozheniya/">приложение</a> (от <strong>&euro;3000</strong>) добавя check-in и услуги в стаята.</p>
<h2>Управление на обекта и тарифите</h2>
<p><a href="/bg/uslugi/erp/">Управленска система (PMS по поръчка)</a> (от <strong>&euro;5000</strong>) свързва резервации, стаи, почистване, сезонни тарифи и отчети в една система. Винаги знаете заетостта, прихода на стая и кои канали носят печалба, за да оптимизирате цените, вместо да ги търпите.</p>
<h2>Да ви намират туристите</h2>
<p>Туризмът минава през Google, Maps и все повече през AI асистенти. С <a href="/bg/uslugi/seo/">многоезично SEO</a> (от &euro;500/месец) оптимизираме Google профила, структурираните данни (хотел, цени, отзиви) и съдържанието на езиците на гостите ви, така че обектът ви да излиза в туристическите търсения по-рано и по-добре.</p>""",
  faqs=[
   ("Колко струва сайт за хотел с директни резервации?", "Многоезичен сайт със система за директни резервации започва от &euro;800 за уеб частта, с интегриран booking engine. С пълна PMS система се стига до проект от &euro;5000. Безплатна оферта до 24 часа."),
   ("Как да намаля комисионните на Booking и Expedia?", "Като прехвърляте резервации към директния канал: бърз, многоезичен сайт с booking engine и директни тарифи е изгоден за госта (често по-добра цена) и за вас (без комисионна). OTA остават полезни за началната видимост."),
   ("Сайтът предотвратява ли overbooking с OTA?", "Да, с интеграция към channel manager: наличностите се синхронизират между сайта и порталите в реално време, така че стая, продадена по един канал, автоматично се затваря по останалите."),
   ("Нужен ли е сайт на няколко езика?", "Ако приемате чуждестранни гости, да. Международният турист резервира там, където разбира всичко: преведени версии, валута и локализирано съдържание чувствително увеличават конверсиите по директния канал."),
  ])),

# 8 ── Artigiani e Officine ──────────────────────────────────────
dict(slug="artigiani-officine", related=["produzione-industria", "servizi-professionali", "ristoranti"],
 names=dict(it="Artigiani e Officine", en="Artisans & Workshops", bg="Занаятчии и Сервизи"),
 tagline=dict(it="Siti che portano preventivi e gestionali che ordinano il lavoro.",
   en="Sites that bring quote requests and software that orders the work.",
   bg="Сайтове, които носят запитвания, и софтуер, който подрежда работата."),
 it=dict(
  desc="Sito, richiesta preventivi, prenotazione interventi e gestione lavori per artigiani, officine e installatori. Da €800, preventivo gratuito in 24 ore.",
  body="""<p>Idraulici, elettricisti, falegnami, carrozzieri, gommisti: gli artigiani vengono cercati quando serve, spesso con urgenza. Chi non compare su Google in quel momento non esiste. Un artigiano o un'officina hanno bisogno di un <strong>sito semplice che comunichi cosa fanno, dove operano e come contattarli in un tocco, e di un modo ordinato per gestire preventivi e appuntamenti</strong>. Niente fronzoli: praticit&agrave; e reperibilit&agrave;.</p>
<h2>Il sito che porta chiamate</h2>
<p>Realizziamo <a href="/servizi/sviluppo-siti-web/">siti per artigiani</a> (da <strong>&euro;800</strong>) essenziali ed efficaci: servizi, zona coperta, foto dei lavori, recensioni e pulsante &laquo;chiama ora&raquo; ben visibile su mobile. La maggior parte dei clienti arriva dal telefono: il sito deve trasformare la visita in una chiamata o in una richiesta di preventivo in pochi secondi.</p>
<h2>Preventivi e prenotazione interventi</h2>
<p>Un modulo di richiesta preventivo con foto del problema ti fa arrivare richieste gi&agrave; qualificate, e la prenotazione di un sopralluogo o intervento riduce le telefonate a vuoto. Per chi lavora in squadra, un'<a href="/servizi/app-mobile/">app</a> (da <strong>&euro;3.000</strong>) permette di ricevere gli interventi, aggiornare lo stato e caricare foto direttamente dal cantiere.</p>
<h2>Gestione lavori, materiali e fatture</h2>
<p>Quando i lavori si accumulano, servono ordine e controllo dei margini. Un <a href="/servizi/erp/">gestionale su misura</a> (da <strong>&euro;5.000</strong>) tiene insieme preventivi, ordini di lavoro, materiali, ore e fatturazione. Sai quanto rende ogni lavoro, quali materiali riordinare e quali preventivi sono in sospeso: meno carta, meno dimenticanze, pi&ugrave; incasso.</p>
<h2>Farsi trovare in zona</h2>
<p>Le ricerche sono locali e immediate: &laquo;idraulico [citt&agrave;]&raquo;, &laquo;gommista aperto adesso&raquo;. Con la <a href="/servizi/seo/">SEO locale</a> (da &euro;500/mese) ottimizziamo scheda Google, recensioni e pagine per servizio e zona, cos&igrave; sei tu a comparire quando qualcuno cerca il tuo mestiere vicino a s&eacute;.</p>""",
  faqs=[
   ("Quanto costa un sito per un artigiano o un'officina?", "Un sito essenziale con servizi, zona coperta, foto lavori e pulsante di chiamata parte da &euro;800. Con gestione preventivi, lavori e fatture si passa a un gestionale da &euro;5.000. Preventivo gratuito in 24 ore."),
   ("Mi serve davvero un sito se lavoro col passaparola?", "Sì. Anche chi ti conosce ti cerca su Google prima di chiamare, e i nuovi clienti ti trovano solo se compari. Un sito con recensioni e pulsante di chiamata trasforma le ricerche locali in lavoro concreto."),
   ("Posso ricevere richieste di preventivo con le foto?", "Sì. Il modulo permette al cliente di descrivere il problema e allegare foto, così arrivi preparato al sopralluogo e filtri le richieste poco serie. Ti fa risparmiare telefonate e viaggi a vuoto."),
   ("Un gestionale è troppo per una piccola officina?", "No, lo dimensioniamo sulla tua realtà. Anche solo tenere preventivi, ore e materiali in un unico posto ti dice quanto rende ogni lavoro e riduce fatture dimenticate e materiali persi."),
  ]),
 en=dict(
  desc="Website, quote requests, job booking and work management for artisans, workshops and installers. From €800, free quote within 24 hours.",
  body="""<p>Plumbers, electricians, carpenters, body shops, tire fitters: tradespeople are searched for when needed, often urgently. Whoever doesn't appear on Google at that moment doesn't exist. An artisan or workshop needs a <strong>simple site that says what they do, where they operate and how to reach them in one tap, plus an orderly way to handle quotes and appointments</strong>. No frills: practicality and availability.</p>
<h2>The site that brings calls</h2>
<p>We build <a href="/en/services/web-development/">websites for tradespeople</a> (from <strong>&euro;800</strong>) that are lean and effective: services, service area, job photos, reviews and a prominent &laquo;call now&raquo; button on mobile. Most customers arrive by phone: the site must turn the visit into a call or a quote request in seconds.</p>
<h2>Quotes and job booking</h2>
<p>A quote-request form with a photo of the problem brings you pre-qualified requests, and booking a site visit or job cuts wasted calls. For those working in a team, an <a href="/en/services/mobile-apps/">app</a> (from <strong>&euro;3,000</strong>) lets you receive jobs, update status and upload photos straight from the site.</p>
<h2>Job, materials and invoice management</h2>
<p>When jobs pile up, you need order and margin control. A <a href="/en/services/erp/">custom management system</a> (from <strong>&euro;5,000</strong>) holds quotes, work orders, materials, hours and invoicing together. You know how much each job makes, which materials to reorder and which quotes are pending: less paper, fewer things forgotten, more revenue collected.</p>
<h2>Getting found locally</h2>
<p>Searches are local and immediate: &laquo;plumber [city]&raquo;, &laquo;tire shop open now&raquo;. With <a href="/en/services/seo/">local SEO</a> (from &euro;500/month) we optimize your Google profile, reviews and per-service and per-area pages, so you're the one appearing when someone searches for your trade nearby.</p>""",
  faqs=[
   ("How much does a website for an artisan or workshop cost?", "A lean site with services, service area, job photos and a call button starts at &euro;800. With quote, job and invoice management it becomes a system from &euro;5,000. Free quote within 24 hours."),
   ("Do I really need a site if I work by word of mouth?", "Yes. Even people who know you search Google before calling, and new customers only find you if you appear. A site with reviews and a call button turns local searches into real work."),
   ("Can I receive quote requests with photos?", "Yes. The form lets the customer describe the problem and attach photos, so you arrive prepared for the visit and filter out unserious requests. It saves calls and wasted trips."),
   ("Is a management system overkill for a small workshop?", "No, we size it to your reality. Just keeping quotes, hours and materials in one place tells you how much each job makes and reduces forgotten invoices and lost materials."),
  ]),
 bg=dict(
  desc="Сайт, запитвания за оферти, записване на посещения и управление на работата за занаятчии, сервизи и монтажници. От €800, безплатна оферта до 24 часа.",
  body="""<p>Водопроводчици, електротехници, дърводелци, автосервизи, вулканизатори: занаятчиите се търсят при нужда, често спешно. Който не излиза в Google в този момент, не съществува. Занаятчията или сервизът имат нужда от <strong>прост сайт, който казва какво правят, къде работят и как да се свържат с едно докосване, и от подреден начин да управляват оферти и посещения</strong>. Без излишества: практичност и достъпност.</p>
<h2>Сайтът, който води обаждания</h2>
<p>Изработваме <a href="/bg/uslugi/web-razrabotka/">сайтове за занаятчии</a> (от <strong>&euro;800</strong>), стегнати и ефективни: услуги, обслужван район, снимки от работата, отзиви и видим бутон &laquo;обади се сега&raquo; на мобилен. Повечето клиенти идват по телефона: сайтът трябва да превърне посещението в обаждане или запитване за оферта за секунди.</p>
<h2>Оферти и записване на посещения</h2>
<p>Форма за запитване със снимка на проблема ви носи вече квалифицирани запитвания, а записването на оглед или посещение намалява напразните обаждания. За работещите в екип <a href="/bg/uslugi/mobilni-prilozheniya/">приложение</a> (от <strong>&euro;3000</strong>) позволява да приемате поръчки, да обновявате статуса и да качвате снимки директно от обекта.</p>
<h2>Управление на работа, материали и фактури</h2>
<p>Когато поръчките се натрупат, трябват ред и контрол на маржа. <a href="/bg/uslugi/erp/">Управленска система по поръчка</a> (от <strong>&euro;5000</strong>) държи заедно оферти, работни поръчки, материали, часове и фактуриране. Знаете колко носи всяка работа, кои материали да поръчате и кои оферти висят: по-малко хартия, по-малко забравени неща, повече събрани приходи.</p>
<h2>Да ви намират в района</h2>
<p>Търсенията са локални и незабавни: &laquo;водопроводчик [град]&raquo;, &laquo;автосервиз отворен сега&raquo;. С <a href="/bg/uslugi/seo/">локално SEO</a> (от &euro;500/месец) оптимизираме Google профила, отзивите и страници по услуга и район, така че вие да излизате, когато някой търси вашия занаят наблизо.</p>""",
  faqs=[
   ("Колко струва сайт за занаятчия или сервиз?", "Стегнат сайт с услуги, обслужван район, снимки от работата и бутон за обаждане започва от &euro;800. С управление на оферти, поръчки и фактури се преминава към система от &euro;5000. Безплатна оферта до 24 часа."),
   ("Наистина ли ми трябва сайт, ако работя от уста на уста?", "Да. Дори които ви познават, ви търсят в Google преди да звъннат, а новите клиенти ви намират само ако излизате. Сайт с отзиви и бутон за обаждане превръща локалните търсения в реална работа."),
   ("Мога ли да получавам запитвания за оферта със снимки?", "Да. Формата позволява на клиента да опише проблема и да прикачи снимки, така идвате подготвени на огледа и филтрирате несериозните запитвания. Спестява обаждания и напразни пътувания."),
   ("Управленска система не е ли прекалено за малък сервиз?", "Не, оразмеряваме я спрямо вашата реалност. Дори само държането на оферти, часове и материали на едно място ви показва колко носи всяка работа и намалява забравените фактури и изгубените материали."),
  ])),

# 9 ── Produzione e Industria ────────────────────────────────────
dict(slug="produzione-industria", related=["artigiani-officine", "servizi-professionali", "immobiliare"],
 names=dict(it="Produzione e Industria", en="Manufacturing & Industry", bg="Производство и Индустрия"),
 tagline=dict(it="Portali B2B, cataloghi tecnici ed ERP di produzione su misura.",
   en="B2B portals, technical catalogs and custom production ERP.",
   bg="B2B портали, технически каталози и производствен ERP по поръчка."),
 it=dict(
  desc="Portale B2B, catalogo tecnico, ERP di produzione e digitalizzazione processi per aziende manifatturiere. Da €800, preventivo gratuito in 24 ore.",
  body="""<p>Nella produzione il sito non vende da solo, ma apre la porta: buyer e rivenditori valutano un fornitore dal suo sito, dal catalogo tecnico e dalla capacit&agrave; di gestire ordini complessi. Un'azienda manifatturiera ha bisogno di un <strong>sito B2B credibile, un catalogo consultabile e, soprattutto, di digitalizzare la produzione con un ERP che elimini Excel e carta</strong>. Qui il vero ritorno &egrave; nell'efficienza interna, non solo nella vetrina.</p>
<h2>Il sito e il catalogo B2B</h2>
<p>Realizziamo <a href="/servizi/sviluppo-siti-web/">siti industriali</a> (da <strong>&euro;800</strong>) che comunicano capacit&agrave; produttiva, certificazioni e referenze, con cataloghi tecnici, schede prodotto, download di schede dati e area riservata per clienti e agenti. Multilingua per l'export, con dati strutturati per farti trovare dai buyer internazionali.</p>
<h2>ERP di produzione: il vero salto</h2>
<p>Il cuore &egrave; l'<a href="/servizi/erp/">ERP su misura</a> (da <strong>&euro;5.000</strong>): distinte base, ordini di lavoro, avanzamento produzione, magazzino materie prime e prodotti finiti, fatturazione. Un ERP costruito sui tuoi processi &mdash; non un pacchetto da adattare a forza &mdash; ti dice il costo reale di ogni commessa, i colli di bottiglia e le scorte. Il nostro ERP &egrave; gi&agrave; in produzione presso un costruttore industriale.</p>
<h2>Portali B2B e configuratori</h2>
<p>Per chi vende su listino complesso, un portale B2B con area riservata, listini personalizzati per cliente e configuratore di prodotto trasforma le richieste in ordini gi&agrave; corretti: il cliente compone l'articolo, il sistema calcola prezzo e distinta, l'ordine entra pulito nell'ERP. Con un'<a href="/servizi/app-mobile/">app</a> (da <strong>&euro;3.000</strong>) gli operatori aggiornano la produzione dal reparto.</p>
<h2>Farsi trovare dai buyer</h2>
<p>Anche nel B2B la ricerca &egrave; il primo passo: &laquo;fornitore [componente]&raquo;, &laquo;produzione conto terzi [settore]&raquo;. Con la <a href="/servizi/seo/">SEO tecnica</a> (da &euro;500/mese) e contenuti mirati ci facciamo trovare da chi cerca esattamente ci&ograve; che produci, nei mercati che ti interessano.</p>""",
  faqs=[
   ("Quanto costa digitalizzare un'azienda di produzione?", "Il sito B2B con catalogo parte da &euro;800; il vero investimento è l'ERP di produzione su misura, da &euro;5.000, che dipende dai processi da digitalizzare. Partiamo da un'analisi gratuita per dimensionare il progetto."),
   ("Meglio un ERP standard o su misura per la produzione?", "Dipende dai processi. Se sono standard, un pacchetto può bastare; se hai lavorazioni particolari, commesse o distinte complesse, un ERP su misura modella esattamente il tuo flusso senza costringerti ad adattarti al software."),
   ("Il vostro ERP è già usato in produzione?", "Sì, il nostro ERP è in produzione presso un costruttore industriale, con moduli produzione, magazzino e fatturazione. Non partiamo da zero teorico: adattiamo una base già collaudata alla tua azienda."),
   ("Cos'è un configuratore di prodotto e a cosa serve?", "È uno strumento in cui il cliente compone l'articolo scegliendo opzioni; il sistema calcola prezzo e distinta base e genera un ordine corretto che entra direttamente nell'ERP. Elimina errori di configurazione e velocizza le vendite B2B."),
  ]),
 en=dict(
  desc="B2B portal, technical catalog, production ERP and process digitalization for manufacturers. From €800, free quote within 24 hours.",
  body="""<p>In manufacturing the website doesn't sell on its own, but it opens the door: buyers and resellers judge a supplier by its site, technical catalog and ability to handle complex orders. A manufacturer needs a <strong>credible B2B website, a browsable catalog and, above all, to digitalize production with an ERP that eliminates Excel and paper</strong>. Here the real return is in internal efficiency, not just the storefront.</p>
<h2>The website and B2B catalog</h2>
<p>We build <a href="/en/services/web-development/">industrial websites</a> (from <strong>&euro;800</strong>) that communicate production capacity, certifications and references, with technical catalogs, product pages, datasheet downloads and a reserved area for clients and agents. Multilingual for export, with structured data so international buyers find you.</p>
<h2>Production ERP: the real leap</h2>
<p>The core is the <a href="/en/services/erp/">custom ERP</a> (from <strong>&euro;5,000</strong>): bills of materials, work orders, production progress, raw-material and finished-goods stock, invoicing. An ERP built on your processes &mdash; not a package forced to fit &mdash; tells you the real cost of every job, the bottlenecks and the stock. Our ERP already runs in production at an industrial manufacturer.</p>
<h2>B2B portals and configurators</h2>
<p>For those selling on complex price lists, a B2B portal with a reserved area, per-customer pricing and a product configurator turns requests into already-correct orders: the customer builds the item, the system calculates price and BOM, and the order enters the ERP clean. With an <a href="/en/services/mobile-apps/">app</a> (from <strong>&euro;3,000</strong>) operators update production from the shop floor.</p>
<h2>Getting found by buyers</h2>
<p>In B2B too, search is the first step: &laquo;supplier [component]&raquo;, &laquo;contract manufacturing [sector]&raquo;. With <a href="/en/services/seo/">technical SEO</a> (from &euro;500/month) and targeted content we get you found by those searching for exactly what you produce, in the markets that matter to you.</p>""",
  faqs=[
   ("How much does it cost to digitalize a manufacturing company?", "The B2B site with a catalog starts at &euro;800; the real investment is the custom production ERP, from &euro;5,000, which depends on the processes to digitalize. We start with a free analysis to size the project."),
   ("Standard or custom ERP for production?", "It depends on the processes. If they're standard, a package may do; if you have unusual operations, project-based work or complex BOMs, a custom ERP models your exact flow without forcing you to adapt to the software."),
   ("Is your ERP already used in production?", "Yes, our ERP runs in production at an industrial manufacturer, with production, warehouse and invoicing modules. We don't start from a blank theory: we adapt a proven base to your company."),
   ("What is a product configurator and what is it for?", "It's a tool where the customer builds the item by choosing options; the system calculates price and BOM and generates a correct order that enters the ERP directly. It removes configuration errors and speeds up B2B sales."),
  ]),
 bg=dict(
  desc="B2B портал, технически каталог, производствен ERP и дигитализация на процеси за производствени фирми. От €800, безплатна оферта до 24 часа.",
  body="""<p>В производството сайтът не продава сам, но отваря вратата: купувачи и дистрибутори преценяват доставчика по неговия сайт, техническия каталог и способността да управлява сложни поръчки. Производствената фирма има нужда от <strong>убедителен B2B сайт, каталог за разглеждане и най-вече от дигитализация на производството с ERP, който премахва Excel и хартията</strong>. Тук истинската възвръщаемост е във вътрешната ефективност, не само във витрината.</p>
<h2>Сайтът и B2B каталогът</h2>
<p>Изработваме <a href="/bg/uslugi/web-razrabotka/">индустриални сайтове</a> (от <strong>&euro;800</strong>), които представят производствен капацитет, сертификати и референции, с технически каталози, продуктови страници, изтегляне на технически данни и защитена зона за клиенти и агенти. Многоезични за износ, със структурирани данни, за да ви намират международните купувачи.</p>
<h2>Производствен ERP: истинската крачка</h2>
<p>Ядрото е <a href="/bg/uslugi/erp/">ERP по поръчка</a> (от <strong>&euro;5000</strong>): спецификации, работни поръчки, ход на производството, склад за суровини и готова продукция, фактуриране. ERP, изграден по вашите процеси &mdash; а не пакет, натъкмен насила &mdash; ви показва реалната себестойност на всяка поръчка, тесните места и наличностите. Нашият ERP вече работи при индустриален производител.</p>
<h2>B2B портали и конфигуратори</h2>
<p>За продаващите по сложни ценови листи, B2B портал със защитена зона, персонални цени по клиент и продуктов конфигуратор превръща запитванията във вече коректни поръчки: клиентът сглобява артикула, системата изчислява цена и спецификация, а поръчката влиза чиста в ERP. С <a href="/bg/uslugi/mobilni-prilozheniya/">приложение</a> (от <strong>&euro;3000</strong>) операторите обновяват производството от цеха.</p>
<h2>Да ви намират купувачите</h2>
<p>И в B2B търсенето е първата стъпка: &laquo;доставчик [компонент]&raquo;, &laquo;производство на ишлеме [сектор]&raquo;. С <a href="/bg/uslugi/seo/">техническо SEO</a> (от &euro;500/месец) и целенасочено съдържание ви правим намираеми от търсещите точно това, което произвеждате, на пазарите, които ви интересуват.</p>""",
  faqs=[
   ("Колко струва дигитализацията на производствена фирма?", "B2B сайтът с каталог започва от &euro;800; истинската инвестиция е производственият ERP по поръчка, от &euro;5000, който зависи от процесите за дигитализация. Започваме с безплатен анализ за оразмеряване на проекта."),
   ("Стандартен или ERP по поръчка за производство?", "Зависи от процесите. Ако са стандартни, пакет може да стигне; ако имате специфични операции, поръчкова работа или сложни спецификации, ERP по поръчка моделира точно вашия поток, без да ви кара да се приспособявате към софтуера."),
   ("Вашият ERP вече използва ли се в производство?", "Да, нашият ERP работи при индустриален производител, с модули за производство, склад и фактуриране. Не тръгваме от празна теория: адаптираме доказана основа към вашата фирма."),
   ("Какво е продуктов конфигуратор и за какво служи?", "Инструмент, в който клиентът сглобява артикула, избирайки опции; системата изчислява цена и спецификация и генерира коректна поръчка, която влиза директно в ERP. Премахва грешките при конфигуриране и ускорява B2B продажбите."),
  ])),

# 10 ── Scuole e Formazione ──────────────────────────────────────
dict(slug="scuole-formazione", related=["servizi-professionali", "palestre-fitness", "studi-medici"],
 names=dict(it="Scuole e Formazione", en="Schools & Training", bg="Училища и Обучение"),
 tagline=dict(it="Iscrizioni online, piattaforme corsi e gestione allievi.",
   en="Online enrollment, course platforms and student management.",
   bg="Онлайн записване, платформи за курсове и управление на курсисти."),
 it=dict(
  desc="Sito, iscrizioni online, piattaforma corsi (LMS) e gestione allievi per scuole, academy e centri di formazione. Da €800, preventivo gratuito in 24 ore.",
  body="""<p>Una scuola o un centro di formazione si scelgono online: il genitore o l'adulto che vuole formarsi cerca corsi, programmi, costi e recensioni, e si iscrive dove il processo &egrave; chiaro e semplice. Un ente di formazione ha bisogno di un <strong>sito che presenti i corsi in modo convincente, iscrizioni online senza attriti e, se eroga formazione a distanza, una piattaforma e-learning solida</strong>. Il digitale qui &egrave; sia marketing sia strumento di erogazione.</p>
<h2>Il sito che riempie le classi</h2>
<p>Realizziamo <a href="/servizi/sviluppo-siti-web/">siti per scuole e academy</a> (da <strong>&euro;800</strong>) con catalogo corsi, calendario, docenti, costi trasparenti e testimonianze. Ogni corso ha la sua pagina ottimizzata e un modulo di iscrizione o richiesta info che converte l'interesse in candidatura, senza far scaricare moduli PDF da stampare.</p>
<h2>Iscrizioni e pagamenti online</h2>
<p>Le iscrizioni online con pagamento (o acconto) riducono le pratiche e i posti persi: l'allievo si iscrive quando &egrave; motivato, tu ricevi i dati gi&agrave; ordinati. Per la formazione a pagamento, un piccolo <a href="/servizi/ecommerce/">e-commerce di corsi</a> (da <strong>&euro;1.200</strong>) gestisce vendita, coupon e accessi.</p>
<h2>Piattaforma e-learning e gestione allievi</h2>
<p>Per chi eroga corsi online serve una piattaforma vera: lezioni, materiali, quiz, attestati e monitoraggio dei progressi. Un <a href="/servizi/erp/">LMS/gestionale su misura</a> (da <strong>&euro;5.000</strong>) unisce e-learning e amministrazione: anagrafica allievi, presenze, pagamenti, certificati. Con un'<a href="/servizi/app-mobile/">app</a> (da <strong>&euro;3.000</strong>) gli studenti seguono i corsi da mobile e ricevono notifiche.</p>
<h2>Farsi trovare da chi cerca corsi</h2>
<p>Le ricerche formative sono specifiche: &laquo;corso [materia] [citt&agrave;]&raquo;, &laquo;certificazione [ambito]&raquo;. Con la <a href="/servizi/seo/">SEO</a> (da &euro;500/mese) creiamo pagine per corso e per citt&agrave; e contenuti utili che dimostrano competenza, cos&igrave; intercetti chi cerca esattamente ci&ograve; che insegni.</p>""",
  faqs=[
   ("Quanto costa un sito per una scuola o un centro di formazione?", "Un sito con catalogo corsi, calendario e iscrizioni parte da &euro;800. Con vendita corsi online si aggiunge da &euro;1.200 e con piattaforma e-learning e gestione allievi si arriva a un LMS su misura da &euro;5.000. Preventivo gratuito in 24 ore."),
   ("Posso far iscrivere e pagare gli allievi online?", "Sì. Aggiungiamo iscrizione online con pagamento o acconto, coupon e gestione degli accessi. Riduce le pratiche manuali e i posti persi, perché l'allievo si iscrive nel momento in cui è motivato."),
   ("Cos'è un LMS e mi serve?", "Un LMS è una piattaforma per erogare corsi online: lezioni, materiali, quiz, attestati e monitoraggio dei progressi. Serve se fai formazione a distanza; se eroghi solo in aula, spesso bastano sito e iscrizioni."),
   ("Come attiro chi cerca corsi come i miei?", "Con la SEO: pagine dedicate a ogni corso e città, contenuti che rispondono alle domande di chi vuole formarsi e ottimizzazione della scheda locale. Così compari quando qualcuno cerca esattamente la tua materia."),
  ]),
 en=dict(
  desc="Website, online enrollment, course platform (LMS) and student management for schools, academies and training centers. From €800, free quote within 24 hours.",
  body="""<p>A school or training center is chosen online: the parent or adult learner searches for courses, programs, costs and reviews, and enrolls where the process is clear and simple. A training provider needs a <strong>website that presents courses convincingly, frictionless online enrollment and, if it delivers remote training, a solid e-learning platform</strong>. Here digital is both marketing and delivery tool.</p>
<h2>The website that fills classes</h2>
<p>We build <a href="/en/services/web-development/">websites for schools and academies</a> (from <strong>&euro;800</strong>) with a course catalog, calendar, tutors, transparent costs and testimonials. Each course has its own optimized page and an enrollment or info-request form that converts interest into an application, without making people download PDF forms to print.</p>
<h2>Online enrollment and payments</h2>
<p>Online enrollment with payment (or deposit) cuts paperwork and lost seats: the learner signs up while motivated, you receive the data already organized. For paid training, a small <a href="/en/services/ecommerce/">course e-commerce</a> (from <strong>&euro;1,200</strong>) handles sales, coupons and access.</p>
<h2>E-learning platform and student management</h2>
<p>For online courses you need a real platform: lessons, materials, quizzes, certificates and progress tracking. A <a href="/en/services/erp/">custom LMS/management system</a> (from <strong>&euro;5,000</strong>) unites e-learning and administration: student records, attendance, payments, certificates. With an <a href="/en/services/mobile-apps/">app</a> (from <strong>&euro;3,000</strong>) students follow courses on mobile and receive notifications.</p>
<h2>Getting found by course seekers</h2>
<p>Training searches are specific: &laquo;[subject] course [city]&raquo;, &laquo;[field] certification&raquo;. With <a href="/en/services/seo/">SEO</a> (from &euro;500/month) we create per-course and per-city pages and useful content that proves expertise, so you capture people searching for exactly what you teach.</p>""",
  faqs=[
   ("How much does a school or training center website cost?", "A site with a course catalog, calendar and enrollment starts at &euro;800. Online course sales add from &euro;1,200, and an e-learning platform with student management brings a custom LMS from &euro;5,000. Free quote within 24 hours."),
   ("Can I let students enroll and pay online?", "Yes. We add online enrollment with payment or deposit, coupons and access management. It cuts manual paperwork and lost seats, because the learner enrolls at the moment they're motivated."),
   ("What is an LMS and do I need one?", "An LMS is a platform to deliver online courses: lessons, materials, quizzes, certificates and progress tracking. You need it if you do remote training; if you only teach in person, a site and enrollment are often enough."),
   ("How do I attract people searching for courses like mine?", "With SEO: pages dedicated to each course and city, content that answers learners' questions and local profile optimization. That way you appear when someone searches for exactly your subject."),
  ]),
 bg=dict(
  desc="Сайт, онлайн записване, платформа за курсове (LMS) и управление на курсисти за училища, академии и центрове за обучение. От €800, безплатна оферта до 24 часа.",
  body="""<p>Училището или центърът за обучение се избират онлайн: родителят или възрастният, който иска да се обучава, търси курсове, програми, цени и отзиви и се записва там, където процесът е ясен и прост. Обучителната организация има нужда от <strong>сайт, който представя курсовете убедително, онлайн записване без спънки и, ако предлага дистанционно обучение, солидна платформа за е-обучение</strong>. Тук дигиталното е и маркетинг, и инструмент за преподаване.</p>
<h2>Сайтът, който пълни групите</h2>
<p>Изработваме <a href="/bg/uslugi/web-razrabotka/">сайтове за училища и академии</a> (от <strong>&euro;800</strong>) с каталог курсове, календар, преподаватели, прозрачни цени и отзиви. Всеки курс има своя оптимизирана страница и форма за записване или запитване, която превръща интереса в кандидатура, без да карате хората да свалят PDF формуляри за печат.</p>
<h2>Записване и плащания онлайн</h2>
<p>Онлайн записването с плащане (или капаро) намалява документацията и изгубените места: курсистът се записва, докато е мотивиран, а вие получавате данните вече подредени. За платено обучение малък <a href="/bg/uslugi/ecommerce/">магазин за курсове</a> (от <strong>&euro;1200</strong>) управлява продажбите, купоните и достъпа.</p>
<h2>Платформа за е-обучение и управление на курсисти</h2>
<p>За онлайн курсове трябва истинска платформа: уроци, материали, тестове, сертификати и проследяване на прогреса. <a href="/bg/uslugi/erp/">LMS/управленска система по поръчка</a> (от <strong>&euro;5000</strong>) обединява е-обучението и администрацията: регистър на курсистите, посещаемост, плащания, сертификати. С <a href="/bg/uslugi/mobilni-prilozheniya/">приложение</a> (от <strong>&euro;3000</strong>) курсистите следят курсовете от телефона и получават известия.</p>
<h2>Да ви намират търсещите курсове</h2>
<p>Обучителните търсения са конкретни: &laquo;курс [предмет] [град]&raquo;, &laquo;сертификат [област]&raquo;. С <a href="/bg/uslugi/seo/">SEO</a> (от &euro;500/месец) създаваме страници по курс и по град и полезно съдържание, което доказва компетентност, така хващате търсещите точно това, което преподавате.</p>""",
  faqs=[
   ("Колко струва сайт за училище или център за обучение?", "Сайт с каталог курсове, календар и записване започва от &euro;800. Онлайн продажба на курсове добавя от &euro;1200, а платформа за е-обучение с управление на курсисти носи LMS по поръчка от &euro;5000. Безплатна оферта до 24 часа."),
   ("Мога ли да позволя записване и плащане онлайн?", "Да. Добавяме онлайн записване с плащане или капаро, купони и управление на достъпа. Намалява ръчната документация и изгубените места, защото курсистът се записва в момента, в който е мотивиран."),
   ("Какво е LMS и нужен ли ми е?", "LMS е платформа за онлайн курсове: уроци, материали, тестове, сертификати и проследяване на прогреса. Нужен е, ако правите дистанционно обучение; ако преподавате само присъствено, често стигат сайт и записване."),
   ("Как да привлека търсещите курсове като моите?", "Със SEO: страници за всеки курс и град, съдържание, което отговаря на въпросите на обучаващите се, и оптимизация на локалния профил. Така излизате, когато някой търси точно вашия предмет."),
  ])),

# 11 ── E-commerce Alimentari ────────────────────────────────────
dict(slug="ecommerce-alimentari", related=["ristoranti", "moda-abbigliamento", "artigiani-officine"],
 names=dict(it="E-commerce Alimentari", en="Food E-commerce", bg="Хранителни Онлайн Магазини"),
 tagline=dict(it="Vendere cibo online con spedizioni fresche, lotti e scadenze.",
   en="Selling food online with fresh delivery, batches and expiry dates.",
   bg="Продажба на храна онлайн с пресни доставки, партиди и срокове."),
 it=dict(
  desc="E-commerce per prodotti alimentari, gestione lotti, scadenze e spedizioni refrigerate per produttori, cantine e negozi di gastronomia. Da €1.200, preventivo gratuito in 24 ore.",
  body="""<p>Vendere cibo online &egrave; diverso da qualsiasi altro e-commerce: entrano in gioco <strong>scadenze, lotti, catena del freddo, peso variabile e normative sulle etichette</strong>. Un produttore alimentare, una cantina, un caseificio o una gastronomia hanno bisogno di un e-commerce pensato per il food, non di un negozio generico adattato alla meno peggio. La differenza si vede nei resi, nei reclami e nella fiducia del cliente.</p>
<h2>L'e-commerce alimentare</h2>
<p>Realizziamo <a href="/servizi/ecommerce/">e-commerce per il food</a> (da <strong>&euro;1.200</strong>) con gestione di prodotti a peso variabile, allergeni ed etichette a norma, date di scadenza, vendita per confezione o sfuso e spedizioni con corriere refrigerato dove serve. Integriamo pagamenti, calcolo spedizioni per zona e gestione degli ordini freschi con giorni di consegna dedicati.</p>
<h2>Lotti, scadenze e tracciabilit&agrave;</h2>
<p>La sicurezza alimentare richiede tracciabilit&agrave;. Un <a href="/servizi/erp/">gestionale</a> (da <strong>&euro;5.000</strong>) collegato all'e-commerce gestisce lotti, scadenze, giacenze e rintracciabilit&agrave;: sai cosa hai spedito, a chi e con quale lotto, e vendi prima ci&ograve; che scade prima. &Egrave; ci&ograve; che distingue un venditore serio da uno improvvisato.</p>
<h2>Spedizioni fresche e abbonamenti</h2>
<p>Il food vive di ricorrenza: box settimanali, cantine con spedizioni stagionali, gastronomie con clienti fedeli. Gestiamo abbonamenti, ordini ricorrenti e finestre di consegna. Con un'<a href="/servizi/sviluppo-siti-web/">esperienza di sito</a> curata (foto, storytelling del prodotto, origine) trasformi la qualit&agrave; in vendite, perch&eacute; il cibo si compra anche con gli occhi.</p>
<h2>Farsi trovare e vendere i prodotti tipici</h2>
<p>Le ricerche food sono ad alta intenzione: &laquo;comprare [prodotto tipico] online&raquo;, &laquo;[specialit&agrave;] spedizione&raquo;. Con la <a href="/servizi/seo/">SEO</a> (da &euro;500/mese) ottimizziamo schede prodotto, dati strutturati e contenuti su origine e ricette, cos&igrave; intercetti chi cerca proprio ci&ograve; che produci, anche fuori dalla tua regione.</p>""",
  faqs=[
   ("Quanto costa un e-commerce per prodotti alimentari?", "Un e-commerce food con gestione scadenze, allergeni e spedizioni parte da &euro;1.200. Con tracciabilità lotti e gestione magazzino integrata si aggiunge un gestionale da &euro;5.000. Preventivo gratuito in 24 ore."),
   ("Come si gestiscono scadenze e lotti nelle vendite online?", "Con un magazzino che traccia lotti e date: il sistema vende prima ciò che scade prima e registra quale lotto è stato spedito a quale cliente. È essenziale per la sicurezza alimentare e per gestire eventuali richiami."),
   ("Posso vendere prodotti a peso variabile?", "Sì. Gestiamo prezzi al chilo, pesatura e conguaglio, così puoi vendere salumi, formaggi o prodotti sfusi con prezzo calcolato sul peso reale, senza errori di fatturazione."),
   ("Gestite le spedizioni refrigerate?", "Sì. Integriamo corrieri con catena del freddo, finestre di consegna e giorni dedicati alla spedizione dei freschi, così il prodotto arriva integro. Configuriamo anche costi di spedizione per zona e soglie di spedizione gratuita."),
  ]),
 en=dict(
  desc="E-commerce for food products, batch and expiry management and refrigerated shipping for producers, wineries and delis. From €1,200, free quote within 24 hours.",
  body="""<p>Selling food online is unlike any other e-commerce: <strong>expiry dates, batches, the cold chain, variable weight and labeling rules</strong> all come into play. A food producer, winery, dairy or deli needs an e-commerce designed for food, not a generic store bodged to fit. The difference shows up in returns, complaints and customer trust.</p>
<h2>The food e-commerce</h2>
<p>We build <a href="/en/services/ecommerce/">food e-commerce</a> (from <strong>&euro;1,200</strong>) with variable-weight products, compliant allergen and label info, expiry dates, sale by pack or loose, and refrigerated courier shipping where needed. We integrate payments, zone-based shipping calculation and fresh-order handling with dedicated delivery days.</p>
<h2>Batches, expiry and traceability</h2>
<p>Food safety requires traceability. A <a href="/en/services/erp/">management system</a> (from <strong>&euro;5,000</strong>) linked to the store handles batches, expiry, stock and traceability: you know what you shipped, to whom and with which batch, and you sell what expires first. That's what separates a serious seller from an improvised one.</p>
<h2>Fresh delivery and subscriptions</h2>
<p>Food runs on recurrence: weekly boxes, wineries with seasonal shipments, delis with loyal customers. We handle subscriptions, recurring orders and delivery windows. With a polished <a href="/en/services/web-development/">site experience</a> (photos, product storytelling, origin) you turn quality into sales, because food is bought with the eyes too.</p>
<h2>Getting found and selling regional products</h2>
<p>Food searches are high-intent: &laquo;buy [regional product] online&raquo;, &laquo;[specialty] shipping&raquo;. With <a href="/en/services/seo/">SEO</a> (from &euro;500/month) we optimize product pages, structured data and content about origin and recipes, so you capture people searching for exactly what you produce, even beyond your region.</p>""",
  faqs=[
   ("How much does a food e-commerce cost?", "A food e-commerce with expiry, allergen and shipping management starts at &euro;1,200. With batch traceability and integrated stock management, a system from &euro;5,000 is added. Free quote within 24 hours."),
   ("How are expiry dates and batches handled in online sales?", "With a stock system that tracks batches and dates: it sells what expires first and records which batch went to which customer. It's essential for food safety and for handling any recalls."),
   ("Can I sell variable-weight products?", "Yes. We handle price per kilo, weighing and adjustment, so you can sell cured meats, cheeses or loose products with a price calculated on the real weight, without invoicing errors."),
   ("Do you handle refrigerated shipping?", "Yes. We integrate cold-chain couriers, delivery windows and dedicated days for shipping fresh goods, so the product arrives intact. We also configure zone-based shipping costs and free-shipping thresholds."),
  ]),
 bg=dict(
  desc="Онлайн магазин за хранителни продукти, управление на партиди, срокове и хладилни доставки за производители, винарни и деликатесни магазини. От €1200, безплатна оферта до 24 часа.",
  body="""<p>Продажбата на храна онлайн е различна от всеки друг онлайн магазин: намесват се <strong>срокове на годност, партиди, хладилна верига, променливо тегло и изисквания за етикети</strong>. Хранителният производител, винарната, мандрата или деликатесният магазин имат нужда от онлайн магазин, направен за храна, а не от общ магазин, натъкмен как да е. Разликата се вижда във връщанията, оплакванията и доверието на клиента.</p>
<h2>Хранителният онлайн магазин</h2>
<p>Изработваме <a href="/bg/uslugi/ecommerce/">онлайн магазини за храна</a> (от <strong>&euro;1200</strong>) с продукти с променливо тегло, коректна информация за алергени и етикети, срокове на годност, продажба на опаковка или насипно и доставка с хладилен куриер, където трябва. Интегрираме плащания, изчисляване на доставка по зона и обработка на пресни поръчки със специални дни за доставка.</p>
<h2>Партиди, срокове и проследимост</h2>
<p>Безопасността на храните изисква проследимост. <a href="/bg/uslugi/erp/">Управленска система</a> (от <strong>&euro;5000</strong>), свързана с магазина, управлява партиди, срокове, наличности и проследимост: знаете какво сте изпратили, на кого и с коя партида, и продавате първо това, което изтича първо. Това отличава сериозния продавач от импровизиращия.</p>
<h2>Пресни доставки и абонаменти</h2>
<p>Храната живее от повторяемост: седмични кутии, винарни със сезонни пратки, магазини с лоялни клиенти. Управляваме абонаменти, повтарящи се поръчки и прозорци за доставка. С издържано <a href="/bg/uslugi/web-razrabotka/">изживяване на сайта</a> (снимки, разказ за продукта, произход) превръщате качеството в продажби, защото храната се купува и с очите.</p>
<h2>Да ви намират и да продавате местни продукти</h2>
<p>Търсенията за храна са с висока намереност: &laquo;купи [местен продукт] онлайн&raquo;, &laquo;[специалитет] доставка&raquo;. С <a href="/bg/uslugi/seo/">SEO</a> (от &euro;500/месец) оптимизираме продуктови страници, структурирани данни и съдържание за произход и рецепти, така хващате търсещите точно това, което произвеждате, дори извън вашия регион.</p>""",
  faqs=[
   ("Колко струва онлайн магазин за хранителни продукти?", "Хранителен онлайн магазин с управление на срокове, алергени и доставки започва от &euro;1200. С проследимост на партиди и интегрирано управление на склада се добавя система от &euro;5000. Безплатна оферта до 24 часа."),
   ("Как се управляват срокове и партиди при онлайн продажби?", "Със складова система, която следи партиди и дати: продава първо това, което изтича първо, и записва коя партида е отишла при кой клиент. Това е ключово за безопасността на храните и за управление на евентуални изтегляния."),
   ("Мога ли да продавам продукти с променливо тегло?", "Да. Управляваме цена на килограм, претегляне и изравняване, така можете да продавате колбаси, сирена или насипни продукти с цена по реалното тегло, без грешки във фактурирането."),
   ("Управлявате ли хладилни доставки?", "Да. Интегрираме куриери с хладилна верига, прозорци за доставка и специални дни за изпращане на пресни стоки, така продуктът пристига запазен. Настройваме и цени за доставка по зона и прагове за безплатна доставка."),
  ])),

# 12 ── Servizi Professionali ────────────────────────────────────
dict(slug="servizi-professionali", related=["avvocati", "studi-medici", "immobiliare"],
 names=dict(it="Servizi Professionali", en="Professional Services", bg="Професионални Услуги"),
 tagline=dict(it="Siti autorevoli, prenotazioni e gestionali per consulenti e studi.",
   en="Authoritative sites, booking and software for consultants and firms.",
   bg="Авторитетни сайтове, записване и софтуер за консултанти и кантори."),
 it=dict(
  desc="Sito professionale, prenotazione consulenze, gestione clienti e fatturazione per consulenti, commercialisti, agenzie e studi. Da €800, preventivo gratuito in 24 ore.",
  body="""<p>Commercialisti, consulenti, agenzie, architetti, ingegneri: chi vende competenza viene valutato prima di tutto online. Un professionista o uno studio hanno bisogno di un <strong>sito che comunichi autorevolezza e risultati, raccolga contatti qualificati e trasformi il primo interesse in una consulenza prenotata</strong>. E dietro le quinte, di strumenti che riducano il lavoro amministrativo e liberino tempo per il lavoro che conta.</p>
<h2>Il sito che genera clienti</h2>
<p>Realizziamo <a href="/servizi/sviluppo-siti-web/">siti per professionisti</a> (da <strong>&euro;800</strong>) chiari e credibili: servizi, casi e risultati, chi sei, testimonianze e un blog che dimostra competenza. Il design comunica posizionamento e prezzo percepito: un sito curato attira clienti migliori e giustifica tariffe pi&ugrave; alte.</p>
<h2>Prenotazione consulenze e lead qualificati</h2>
<p>Un modulo di contatto ben progettato e la prenotazione di una call collegata alla tua agenda trasformano il visitatore in appuntamento mentre &egrave; motivato. Filtri le richieste con poche domande mirate, cos&igrave; parli solo con chi &egrave; davvero in target e non sprechi tempo in consulenze a vuoto.</p>
<h2>Gestione clienti, progetti e fatturazione</h2>
<p>Il tempo &egrave; il tuo prodotto: sprecarlo in amministrazione &egrave; costoso. Un <a href="/servizi/erp/">gestionale su misura</a> (da <strong>&euro;5.000</strong>) tiene insieme clienti, progetti, ore, scadenze, documenti e fatturazione. Sai quanto rende ogni cliente e ogni progetto, e la fatturazione smette di essere una corsa a fine mese. Con un'<a href="/servizi/app-mobile/">app</a> (da <strong>&euro;3.000</strong>) segui tutto anche in mobilit&agrave;.</p>
<h2>Farsi trovare per la propria competenza</h2>
<p>I clienti cercano soluzioni a problemi precisi: &laquo;consulente [ambito] [citt&agrave;]&raquo;, &laquo;come fare [problema]&raquo;. Con la <a href="/servizi/seo/">SEO</a> (da &euro;500/mese) creiamo pagine per servizio e contenuti che rispondono a queste domande, posizionandoti come l'esperto a cui rivolgersi, non come un nome tra tanti.</p>""",
  faqs=[
   ("Quanto costa un sito per un professionista o uno studio?", "Un sito professionale con servizi, casi e modulo consulenza parte da &euro;800. Con gestionale per clienti, progetti e fatturazione si passa a un progetto su misura da &euro;5.000. Preventivo gratuito in 24 ore."),
   ("Come faccio ad attirare clienti migliori dal sito?", "Con un sito che comunica posizionamento e risultati, contenuti che dimostrano competenza e un modulo che qualifica le richieste. Un sito curato attira clienti più in target e giustifica tariffe più alte, filtrando chi cerca solo il prezzo più basso."),
   ("Posso far prenotare le consulenze online?", "Sì. Aggiungiamo la prenotazione di una call o di un incontro collegata alla tua agenda, con poche domande di qualificazione. Converti il visitatore mentre è motivato ed eviti scambi di email infiniti."),
   ("Un gestionale mi fa davvero risparmiare tempo?", "Sì. Tenere clienti, progetti, ore e fatture in un unico sistema elimina la doppia digitazione, evita scadenze perse e rende la fatturazione veloce. Il tempo recuperato dall'amministrazione lo dedichi al lavoro che genera fatturato."),
  ]),
 en=dict(
  desc="Professional website, consultation booking, client management and invoicing for consultants, accountants, agencies and firms. From €800, free quote within 24 hours.",
  body="""<p>Accountants, consultants, agencies, architects, engineers: those who sell expertise are judged online first. A professional or firm needs a <strong>website that conveys authority and results, collects qualified leads and turns first interest into a booked consultation</strong>. And behind the scenes, tools that cut administrative work and free up time for the work that matters.</p>
<h2>The website that generates clients</h2>
<p>We build <a href="/en/services/web-development/">websites for professionals</a> (from <strong>&euro;800</strong>) that are clear and credible: services, cases and results, who you are, testimonials and a blog that demonstrates expertise. Design communicates positioning and perceived price: a polished site attracts better clients and justifies higher fees.</p>
<h2>Consultation booking and qualified leads</h2>
<p>A well-designed contact form and call booking tied to your calendar turn a visitor into an appointment while they're motivated. You filter requests with a few targeted questions, so you only speak with genuinely on-target prospects and don't waste time on dead-end consultations.</p>
<h2>Client, project and invoice management</h2>
<p>Time is your product: wasting it on admin is expensive. A <a href="/en/services/erp/">custom management system</a> (from <strong>&euro;5,000</strong>) holds clients, projects, hours, deadlines, documents and invoicing together. You know how much each client and project makes, and invoicing stops being a month-end scramble. With an <a href="/en/services/mobile-apps/">app</a> (from <strong>&euro;3,000</strong>) you track everything on the move.</p>
<h2>Getting found for your expertise</h2>
<p>Clients search for solutions to precise problems: &laquo;[field] consultant [city]&raquo;, &laquo;how to [problem]&raquo;. With <a href="/en/services/seo/">SEO</a> (from &euro;500/month) we create per-service pages and content that answers these questions, positioning you as the expert to turn to, not one name among many.</p>""",
  faqs=[
   ("How much does a website for a professional or firm cost?", "A professional site with services, cases and a consultation form starts at &euro;800. With client, project and invoicing management it becomes a custom project from &euro;5,000. Free quote within 24 hours."),
   ("How do I attract better clients from the site?", "With a site that conveys positioning and results, content that proves expertise and a form that qualifies requests. A polished site attracts more on-target clients and justifies higher fees, filtering out those chasing only the lowest price."),
   ("Can I take consultation bookings online?", "Yes. We add call or meeting booking tied to your calendar, with a few qualifying questions. You convert the visitor while motivated and avoid endless email exchanges."),
   ("Does a management system really save me time?", "Yes. Keeping clients, projects, hours and invoices in one system removes double entry, avoids missed deadlines and makes invoicing fast. The time recovered from admin goes to the work that generates revenue."),
  ]),
 bg=dict(
  desc="Професионален сайт, записване на консултации, управление на клиенти и фактуриране за консултанти, счетоводители, агенции и кантори. От €800, безплатна оферта до 24 часа.",
  body="""<p>Счетоводители, консултанти, агенции, архитекти, инженери: продаващите експертиза се преценяват първо онлайн. Специалистът или кантората имат нужда от <strong>сайт, който излъчва авторитет и резултати, събира качествени запитвания и превръща първия интерес в записана консултация</strong>. А зад кулисите — от инструменти, които намаляват административната работа и освобождават време за работата, която има значение.</p>
<h2>Сайтът, който генерира клиенти</h2>
<p>Изработваме <a href="/bg/uslugi/web-razrabotka/">сайтове за специалисти</a> (от <strong>&euro;800</strong>), ясни и убедителни: услуги, казуси и резултати, кой сте, отзиви и блог, който доказва компетентност. Дизайнът излъчва позициониране и възприемана цена: издържан сайт привлича по-добри клиенти и оправдава по-високи тарифи.</p>
<h2>Записване на консултации и качествени запитвания</h2>
<p>Добре направена форма за контакт и записване на разговор, свързано с календара ви, превръщат посетителя в среща, докато е мотивиран. Филтрирате запитванията с няколко насочени въпроса, така говорите само с наистина подходящите и не губите време в безплодни консултации.</p>
<h2>Управление на клиенти, проекти и фактуриране</h2>
<p>Времето е вашият продукт: пропиляването му в администрация е скъпо. <a href="/bg/uslugi/erp/">Управленска система по поръчка</a> (от <strong>&euro;5000</strong>) държи заедно клиенти, проекти, часове, срокове, документи и фактуриране. Знаете колко носи всеки клиент и проект, а фактурирането спира да е надпревара в края на месеца. С <a href="/bg/uslugi/mobilni-prilozheniya/">приложение</a> (от <strong>&euro;3000</strong>) следите всичко и в движение.</p>
<h2>Да ви намират по вашата компетентност</h2>
<p>Клиентите търсят решения на конкретни проблеми: &laquo;консултант [област] [град]&raquo;, &laquo;как да [проблем]&raquo;. С <a href="/bg/uslugi/seo/">SEO</a> (от &euro;500/месец) създаваме страници по услуга и съдържание, което отговаря на тези въпроси, позиционирайки ви като експерта, към когото да се обърнат, а не като едно име сред много.</p>""",
  faqs=[
   ("Колко струва сайт за специалист или кантора?", "Професионален сайт с услуги, казуси и форма за консултация започва от &euro;800. С управленска система за клиенти, проекти и фактуриране се преминава към проект по поръчка от &euro;5000. Безплатна оферта до 24 часа."),
   ("Как да привлека по-добри клиенти от сайта?", "Със сайт, който излъчва позициониране и резултати, съдържание, което доказва компетентност, и форма, която квалифицира запитванията. Издържан сайт привлича по-подходящи клиенти и оправдава по-високи тарифи, филтрирайки търсещите само най-ниската цена."),
   ("Мога ли да приемам записвания за консултации онлайн?", "Да. Добавяме записване на разговор или среща, свързано с календара ви, с няколко квалифициращи въпроса. Превръщате посетителя, докато е мотивиран, и избягвате безкрайни имейли."),
   ("Управленската система наистина ли ми спестява време?", "Да. Държането на клиенти, проекти, часове и фактури в една система премахва двойното въвеждане, избягва изпуснати срокове и прави фактурирането бързо. Спестеното от администрация време отива за работата, която носи приходи."),
  ])),
]

# ── Extra body content (answer-first checklist + closing results) ────
# Injected after the intro paragraph (needs) and before the FAQ (close),
# expanding each sector to genuine, sector-specific 450-650 word bodies.
EXTRAS = {
 "ristoranti": dict(
  it=dict(needs=["Un sito rapido e mobile-first, perché quasi tutte le ricerche di ristoranti avvengono da smartphone in movimento.",
                 "Un menu digitale aggiornabile in autonomia, senza PDF e senza ristampe a ogni cambio.",
                 "Prenotazione e ordini online integrati con la sala, per non perdere coperti nelle ore di punta.",
                 "Una presenza locale curata su Google e Maps, con foto, recensioni e dati strutturati del menu."],
       close="Un ristorante ben digitalizzato riempie i tavoli anche fuori stagione e tiene per sé il margine che oggi regala alle piattaforme di delivery. Partiamo da un preventivo gratuito in 24 ore e ti diciamo, in base al tuo volume, dove conviene davvero investire: prima il sito e le prenotazioni, poi gli ordini e infine il gestionale."),
  en=dict(needs=["A fast, mobile-first site, because almost all restaurant searches happen on a phone on the move.",
                 "A digital menu you can update yourself, with no PDFs and no reprints on every change.",
                 "Online booking and ordering integrated with the floor, so you don't lose covers at peak hours.",
                 "A well-kept local presence on Google and Maps, with photos, reviews and menu structured data."],
       close="A well-digitalized restaurant fills tables even off-season and keeps the margin it currently gives away to delivery platforms. We start with a free 24-hour quote and tell you, based on your volume, where it truly pays to invest: first the site and bookings, then ordering, and finally the management system."),
  bg=dict(needs=["Бърз, mobile-first сайт, защото почти всички търсения за ресторанти стават от телефон в движение.",
                 "Дигитално меню, което обновявате сами, без PDF и без препечатване при всяка промяна.",
                 "Онлайн резервации и поръчки, свързани със залата, за да не губите маси в пиковите часове.",
                 "Поддържано локално присъствие в Google и Maps, със снимки, отзиви и структурирани данни на менюто."],
       close="Добре дигитализираният ресторант пълни масите дори извън сезона и задържа маржа, който днес подарява на платформите за доставка. Започваме с безплатна оферта до 24 часа и ви казваме, според вашия обем, къде наистина си струва да инвестирате: първо сайтът и резервациите, после поръчките и накрая управленската система.")),
 "moda-abbigliamento": dict(
  it=dict(needs=["Un e-commerce veloce che regge i picchi dei lanci e dei saldi senza rallentare il checkout.",
                 "Una gestione impeccabile di taglie, colori e varianti collegata alle scorte reali.",
                 "Foto, zoom e guida alle taglie curati, perché nel fashion la resa visiva è metà della vendita.",
                 "Sincronizzazione multicanale tra sito, negozio e marketplace su un unico magazzino."],
       close="Un brand di moda con un e-commerce costruito bene vende di più, resa di meno e non perde stock tra i canali. Ti aiutiamo a partire con il negozio giusto e a farlo crescere con SEO e app quando i numeri lo giustificano: preventivo gratuito e onesto entro 24 ore."),
  en=dict(needs=["A fast e-commerce that survives launch and sale spikes without slowing the checkout.",
                 "Flawless size, color and variant management tied to real stock.",
                 "Careful photos, zoom and a size guide, because in fashion visual delivery is half the sale.",
                 "Multichannel sync across site, shop and marketplaces on a single inventory."],
       close="A fashion brand with a well-built e-commerce sells more, returns less and never loses stock between channels. We help you launch with the right store and grow it with SEO and an app when the numbers justify it: a free, honest quote within 24 hours."),
  bg=dict(needs=["Бърз онлайн магазин, който издържа пиковете при пускания и разпродажби, без да забавя поръчката.",
                 "Безупречно управление на размери, цветове и варианти, свързано с реалните наличности.",
                 "Издържани снимки, увеличение и таблица с размери, защото в модата визията е половината продажба.",
                 "Синхронизация по канали между сайт, магазин и маркетплейси в един склад."],
       close="Моден бранд с добре изграден онлайн магазин продава повече, връща по-малко и не губи наличности между каналите. Помагаме ви да стартирате с правилния магазин и да го развиете със SEO и приложение, когато числата го оправдаят: безплатна и честна оферта до 24 часа.")),
 "immobiliare": dict(
  it=dict(needs=["Un portale con ricerca avanzata per zona, prezzo e tipologia, con mappa interattiva.",
                 "Schede immobile complete: foto professionali, planimetrie, tour virtuali e dati strutturati.",
                 "Un CRM che raccoglie e assegna ogni lead da sito, portali e telefono senza perderne uno.",
                 "SEO locale per intercettare chi cerca casa proprio nelle zone in cui operi."],
       close="Un'agenzia che cattura e gestisce i lead meglio della concorrenza chiude più trattative con lo stesso numero di immobili. Costruiamo il portale e, quando serve, il CRM che lo alimenta: preventivo gratuito in 24 ore, senza impegno."),
  en=dict(needs=["A portal with advanced search by area, price and type, with an interactive map.",
                 "Complete listing pages: professional photos, floor plans, virtual tours and structured data.",
                 "A CRM that gathers and assigns every lead from site, portals and phone without losing one.",
                 "Local SEO to capture buyers searching in exactly the areas where you operate."],
       close="An agency that captures and handles leads better than its rivals closes more deals with the same number of properties. We build the portal and, when needed, the CRM that feeds it: a free, no-obligation quote within 24 hours."),
  bg=dict(needs=["Портал с разширено търсене по район, цена и тип, с интерактивна карта.",
                 "Пълни страници на имотите: професионални снимки, разпределения, виртуални огледи и структурирани данни.",
                 "CRM, който събира и разпределя всяко запитване от сайт, портали и телефон, без да изпуска нито едно.",
                 "Локално SEO, за да хващате търсещите имот точно в районите, в които работите."],
       close="Агенция, която хваща и обработва запитванията по-добре от конкуренцията, сключва повече сделки със същия брой имоти. Изграждаме портала и, когато трябва, CRM, който го захранва: безплатна оферта до 24 часа, без ангажимент.")),
 "studi-medici": dict(
  it=dict(needs=["Un sito professionale e accessibile che trasmette fiducia e spiega chiaramente le prestazioni.",
                 "Prenotazione visite online collegata all'agenda reale, con promemoria che riducono le assenze.",
                 "Piena conformità GDPR nella gestione di cookie, moduli e dati sanitari sensibili.",
                 "SEO locale per comparire quando un paziente cerca la tua specialità in zona."],
       close="Uno studio con prenotazione online e agenda ordinata riduce le assenze, alleggerisce la segreteria e riempie meglio le giornate. Progettiamo il tutto nel rispetto della privacy dei dati sanitari: preventivo gratuito in 24 ore."),
  en=dict(needs=["A professional, accessible site that conveys trust and explains services clearly.",
                 "Online appointment booking tied to the real schedule, with reminders that cut no-shows.",
                 "Full GDPR compliance in handling cookies, forms and sensitive health data.",
                 "Local SEO to appear when a patient searches for your specialty nearby."],
       close="A practice with online booking and an orderly schedule cuts no-shows, lightens front-desk work and fills days better. We design all of it with health-data privacy in mind: a free quote within 24 hours."),
  bg=dict(needs=["Професионален, достъпен сайт, който вдъхва доверие и обяснява ясно услугите.",
                 "Онлайн записване на часове, свързано с реалния график, с напомняния, които намаляват неявяванията.",
                 "Пълно съответствие с GDPR при управление на бисквитки, форми и чувствителни здравни данни.",
                 "Локално SEO, за да излизате, когато пациент търси вашата специалност наблизо."],
       close="Кабинет с онлайн записване и подреден график намалява неявяванията, облекчава регистратурата и запълва по-добре дните. Проектираме всичко с грижа за поверителността на здравните данни: безплатна оферта до 24 часа.")),
 "avvocati": dict(
  it=dict(needs=["Un sito autorevole e sobrio che comunica aree di specializzazione ed esperienza.",
                 "Un modulo consulenza riservato che qualifica il contatto fin dal primo messaggio.",
                 "Un gestionale che tiene sotto controllo fascicoli, scadenze processuali e parcelle.",
                 "SEO per materia, con pagine dedicate a ogni area di diritto che dimostrano competenza."],
       close="Uno studio che comunica autorevolezza online e non perde una scadenza lavora con meno rischio e clienti migliori. Costruiamo sito e, quando serve, gestionale delle pratiche nel rispetto delle norme deontologiche: preventivo gratuito in 24 ore."),
  en=dict(needs=["An authoritative, restrained site that communicates practice areas and experience.",
                 "A confidential consultation form that qualifies the contact from the first message.",
                 "A management system that keeps files, court deadlines and fees under control.",
                 "SEO by practice area, with dedicated pages that demonstrate expertise."],
       close="A firm that conveys authority online and never misses a deadline works with less risk and better clients. We build the site and, when needed, case management in line with professional-conduct rules: a free quote within 24 hours."),
  bg=dict(needs=["Авторитетен, сдържан сайт, който представя областите на специализация и опита.",
                 "Поверителна форма за консултация, която квалифицира контакта още от първото съобщение.",
                 "Управленска система, която държи под контрол досиета, процесуални срокове и хонорари.",
                 "SEO по материя, със страници за всяка област на правото, които доказват компетентност."],
       close="Кантора, която излъчва авторитет онлайн и не изпуска срок, работи с по-малко риск и по-добри клиенти. Изграждаме сайта и, когато трябва, управление на делата в съответствие с етичните правила: безплатна оферта до 24 часа.")),
 "palestre-fitness": dict(
  it=dict(needs=["Un sito con orari, listino trasparente e prova gratuita prenotabile subito.",
                 "Prenotazione corsi con posti limitati, lista d'attesa e disdette entro un orario.",
                 "Un'app per i soci che aumenta frequenza e rinnovi con schede e notifiche.",
                 "Gestione abbonamenti che segnala scadenze e soci a rischio abbandono."],
       close="Una palestra con prenotazione fluida e gestione abbonamenti chiara riempie i corsi e riduce gli abbandoni, che sono il vero costo nascosto del fitness. Partiamo dal sito e cresciamo con app e gestionale quando i soci lo giustificano: preventivo gratuito in 24 ore."),
  en=dict(needs=["A site with schedules, transparent pricing and a free trial bookable on the spot.",
                 "Class booking with limited spots, waitlists and cancellations within a cutoff.",
                 "A member app that lifts attendance and renewals with plans and notifications.",
                 "Membership management that flags expiries and members at risk of churn."],
       close="A gym with smooth booking and clear membership management fills classes and cuts churn, the real hidden cost of fitness. We start with the site and grow with an app and management system when members justify it: a free quote within 24 hours."),
  bg=dict(needs=["Сайт с график, прозрачни цени и безплатна пробна тренировка за записване веднага.",
                 "Записване за занятия с ограничени места, списък на чакащите и отказ до определен час.",
                 "Приложение за членове, което повишава посещаемостта и подновяванията с програми и известия.",
                 "Управление на абонаменти, което маркира срокове и членове с риск от отпадане."],
       close="Фитнес зала с гладко записване и ясно управление на абонаменти пълни залите и намалява отпадането, което е скритият разход на фитнеса. Започваме със сайта и растем с приложение и система, когато членовете го оправдаят: безплатна оферта до 24 часа.")),
 "hotel-turismo": dict(
  it=dict(needs=["Un sito multilingue e veloce, perché il turista internazionale prenota dove capisce tutto.",
                 "Un motore di prenotazione diretta integrato con il channel manager, senza overbooking.",
                 "Un PMS che collega camere, tariffe stagionali, pulizie e reportistica.",
                 "SEO multilingue con dati strutturati per hotel, prezzi e recensioni."],
       close="Ogni prenotazione spostata sul canale diretto è una commissione OTA risparmiata e un cliente che diventa tuo. Costruiamo il sito e il motore di prenotazione e, per le strutture più grandi, il PMS: preventivo gratuito in 24 ore."),
  en=dict(needs=["A fast, multilingual site, because international travelers book where they understand everything.",
                 "A direct booking engine integrated with the channel manager, with no overbooking.",
                 "A PMS linking rooms, seasonal rates, housekeeping and reporting.",
                 "Multilingual SEO with structured data for hotel, prices and reviews."],
       close="Every booking shifted to the direct channel is an OTA commission saved and a guest who becomes yours. We build the site and booking engine and, for larger properties, the PMS: a free quote within 24 hours."),
  bg=dict(needs=["Бърз, многоезичен сайт, защото международният турист резервира там, където разбира всичко.",
                 "Система за директни резервации, интегрирана с channel manager, без overbooking.",
                 "PMS, който свързва стаи, сезонни тарифи, почистване и отчети.",
                 "Многоезично SEO със структурирани данни за хотел, цени и отзиви."],
       close="Всяка резервация, прехвърлена към директния канал, е спестена комисионна на OTA и гост, който става ваш. Изграждаме сайта и системата за резервации, а за по-големите обекти — PMS: безплатна оферта до 24 часа.")),
 "artigiani-officine": dict(
  it=dict(needs=["Un sito essenziale con servizi, zona coperta e pulsante 'chiama ora' ben visibile su mobile.",
                 "Richiesta preventivo con foto del problema, per arrivare preparato e filtrare i contatti.",
                 "Prenotazione di sopralluoghi e interventi che riduce le telefonate a vuoto.",
                 "Gestione di preventivi, lavori, materiali e fatture per non perdere margine."],
       close="Un artigiano che compare su Google e gestisce i lavori con ordine lavora di più e insegue di meno. Partiamo dal sito che porta chiamate e aggiungiamo il gestionale quando i lavori si accumulano: preventivo gratuito in 24 ore."),
  en=dict(needs=["A lean site with services, service area and a prominent 'call now' button on mobile.",
                 "Quote requests with a photo of the problem, to arrive prepared and filter contacts.",
                 "Site-visit and job booking that cuts wasted calls.",
                 "Management of quotes, jobs, materials and invoices so you don't lose margin."],
       close="A tradesperson who shows up on Google and runs jobs in order works more and chases less. We start with the site that brings calls and add the management system when jobs pile up: a free quote within 24 hours."),
  bg=dict(needs=["Стегнат сайт с услуги, обслужван район и видим бутон 'обади се сега' на мобилен.",
                 "Запитване за оферта със снимка на проблема, за да идвате подготвени и да филтрирате контактите.",
                 "Записване на огледи и посещения, което намалява напразните обаждания.",
                 "Управление на оферти, поръчки, материали и фактури, за да не губите марж."],
       close="Занаятчия, който излиза в Google и води поръчките подредено, работи повече и гони по-малко. Започваме със сайта, който носи обаждания, и добавяме системата, когато поръчките се натрупат: безплатна оферта до 24 часа.")),
 "produzione-industria": dict(
  it=dict(needs=["Un sito B2B credibile con catalogo tecnico, certificazioni e area riservata per clienti e agenti.",
                 "Un ERP di produzione su misura: distinte base, ordini di lavoro, magazzino e fatturazione.",
                 "Un portale B2B con listini personalizzati e configuratore che genera ordini corretti.",
                 "SEO tecnica multilingue per farsi trovare dai buyer nei mercati target."],
       close="Nella manifattura il ritorno più grande è l'efficienza interna: un ERP costruito sui tuoi processi taglia errori, scorte e tempi morti. Partiamo da un'analisi gratuita e adattiamo una base ERP già collaudata alla tua azienda: preventivo in 24 ore."),
  en=dict(needs=["A credible B2B site with a technical catalog, certifications and a reserved area for clients and agents.",
                 "A custom production ERP: bills of materials, work orders, warehouse and invoicing.",
                 "A B2B portal with per-customer pricing and a configurator that generates correct orders.",
                 "Multilingual technical SEO to be found by buyers in target markets."],
       close="In manufacturing the biggest return is internal efficiency: an ERP built on your processes cuts errors, stock and idle time. We start with a free analysis and adapt a proven ERP base to your company: a quote within 24 hours."),
  bg=dict(needs=["Убедителен B2B сайт с технически каталог, сертификати и защитена зона за клиенти и агенти.",
                 "Производствен ERP по поръчка: спецификации, работни поръчки, склад и фактуриране.",
                 "B2B портал с персонални цени и конфигуратор, който генерира коректни поръчки.",
                 "Многоезично техническо SEO, за да ви намират купувачите на целевите пазари."],
       close="В производството най-голямата възвръщаемост е вътрешната ефективност: ERP, изграден по вашите процеси, реже грешки, наличности и загубено време. Започваме с безплатен анализ и адаптираме доказана ERP основа към вашата фирма: оферта до 24 часа.")),
 "scuole-formazione": dict(
  it=dict(needs=["Un sito con catalogo corsi, calendario, docenti e costi trasparenti.",
                 "Iscrizioni online con pagamento o acconto, per ridurre pratiche e posti persi.",
                 "Una piattaforma e-learning (LMS) con lezioni, quiz, attestati e progressi, se eroghi corsi a distanza.",
                 "SEO per corso e per città, con contenuti che dimostrano competenza."],
       close="Un ente formativo con iscrizioni fluide e, dove serve, una piattaforma solida riempie le classi e riduce il lavoro amministrativo. Partiamo dal sito e cresciamo verso e-commerce dei corsi e LMS quando serve: preventivo gratuito in 24 ore."),
  en=dict(needs=["A site with a course catalog, calendar, tutors and transparent costs.",
                 "Online enrollment with payment or deposit, to cut paperwork and lost seats.",
                 "An e-learning platform (LMS) with lessons, quizzes, certificates and progress, if you deliver remote courses.",
                 "SEO by course and city, with content that demonstrates expertise."],
       close="A training provider with smooth enrollment and, where needed, a solid platform fills classes and cuts admin work. We start with the site and grow toward course e-commerce and an LMS when needed: a free quote within 24 hours."),
  bg=dict(needs=["Сайт с каталог курсове, календар, преподаватели и прозрачни цени.",
                 "Онлайн записване с плащане или капаро, за да намалите документацията и изгубените места.",
                 "Платформа за е-обучение (LMS) с уроци, тестове, сертификати и прогрес, ако правите дистанционни курсове.",
                 "SEO по курс и по град, със съдържание, което доказва компетентност."],
       close="Обучителна организация с гладко записване и, където трябва, солидна платформа пълни групите и намалява административната работа. Започваме със сайта и растем към магазин за курсове и LMS, когато е нужно: безплатна оферта до 24 часа.")),
 "ecommerce-alimentari": dict(
  it=dict(needs=["Un e-commerce food con prodotti a peso variabile, allergeni ed etichette a norma.",
                 "Gestione di scadenze, lotti e tracciabilità collegata al magazzino.",
                 "Spedizioni refrigerate con finestre di consegna e giorni dedicati ai freschi.",
                 "Abbonamenti e ordini ricorrenti per box, cantine e gastronomie con clienti fedeli."],
       close="Vendere cibo online bene significa niente resi per errori di scadenza o freschezza e clienti che tornano. Costruiamo l'e-commerce food e, dove serve, il gestionale con tracciabilità dei lotti: preventivo gratuito in 24 ore."),
  en=dict(needs=["A food e-commerce with variable-weight products, compliant allergen and label info.",
                 "Expiry, batch and traceability management tied to stock.",
                 "Refrigerated shipping with delivery windows and dedicated days for fresh goods.",
                 "Subscriptions and recurring orders for boxes, wineries and delis with loyal customers."],
       close="Selling food online well means no returns from expiry or freshness errors and customers who come back. We build the food e-commerce and, where needed, the system with batch traceability: a free quote within 24 hours."),
  bg=dict(needs=["Хранителен онлайн магазин с продукти с променливо тегло, коректни алергени и етикети.",
                 "Управление на срокове, партиди и проследимост, свързано със склада.",
                 "Хладилни доставки с прозорци за доставка и специални дни за пресни стоки.",
                 "Абонаменти и повтарящи се поръчки за кутии, винарни и магазини с лоялни клиенти."],
       close="Да продаваш храна онлайн добре означава без връщания заради срокове или свежест и клиенти, които се връщат. Изграждаме хранителния магазин и, където трябва, системата с проследимост на партидите: безплатна оферта до 24 часа.")),
 "servizi-professionali": dict(
  it=dict(needs=["Un sito che comunica autorevolezza, casi e risultati per attirare clienti migliori.",
                 "Prenotazione consulenze collegata all'agenda, con domande che qualificano il contatto.",
                 "Un gestionale per clienti, progetti, ore e fatturazione che libera tempo dall'amministrazione.",
                 "SEO per servizio, con contenuti che rispondono ai problemi dei tuoi clienti."],
       close="Un professionista che comunica bene online attira clienti più in target e giustifica tariffe più alte, mentre il gestionale gli restituisce tempo prezioso. Partiamo dal sito e aggiungiamo gli strumenti operativi quando servono: preventivo gratuito in 24 ore."),
  en=dict(needs=["A site that conveys authority, cases and results to attract better clients.",
                 "Consultation booking tied to your calendar, with questions that qualify the contact.",
                 "A system for clients, projects, hours and invoicing that frees time from admin.",
                 "SEO by service, with content that answers your clients' problems."],
       close="A professional who communicates well online attracts more on-target clients and justifies higher fees, while the management system gives back precious time. We start with the site and add operational tools when needed: a free quote within 24 hours."),
  bg=dict(needs=["Сайт, който излъчва авторитет, казуси и резултати, за да привлича по-добри клиенти.",
                 "Записване на консултации, свързано с календара, с въпроси, които квалифицират контакта.",
                 "Система за клиенти, проекти, часове и фактуриране, която освобождава време от администрация.",
                 "SEO по услуга, със съдържание, което отговаря на проблемите на клиентите ви."],
       close="Специалист, който комуникира добре онлайн, привлича по-подходящи клиенти и оправдава по-високи тарифи, а системата му връща ценно време. Започваме със сайта и добавяме оперативните инструменти, когато потрябват: безплатна оферта до 24 часа.")),
}

# ── Rendering ────────────────────────────────────────────────────
SLUG_NAMES = {s["slug"]: s["names"] for s in SECTORS}
SLUG_TAGLINE = {s["slug"]: s.get("tagline", {}) for s in SECTORS}

def esc(s):
    return html.escape(s, quote=True)

def alternates(slug):
    out = "".join(
        f'<link rel="alternate" hreflang="{l}" href="{BASE}{L[l]["urlbase"]}{slug}/"/>'
        for l in ("it", "en", "bg"))
    out += f'<link rel="alternate" hreflang="x-default" href="{BASE}{L["it"]["urlbase"]}{slug}/"/>'
    return out

def hub_alternates():
    out = "".join(
        f'<link rel="alternate" hreflang="{l}" href="{BASE}{L[l]["urlbase"]}"/>'
        for l in ("it", "en", "bg"))
    out += f'<link rel="alternate" hreflang="x-default" href="{BASE}{L["it"]["urlbase"]}"/>'
    return out

def head(lang, title, desc, canon, alts):
    s = L[lang]
    og = f"{BASE}/{s['og']}"
    return f"""<!DOCTYPE html><html lang="{lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canon}">
{alts}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Carbon Stealth VCC">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="{s['locale']}">
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

def sector_jsonld(lang, sector, title, desc, canon):
    s = L[lang]
    name = sector["names"][lang]
    faqs = sector[lang]["faqs"]
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "Service", "@id": f"{canon}#service",
         "name": title.split("|")[0].strip(),
         "serviceType": s["svc_type"],
         "provider": {"@id": f"{BASE}/#organization"},
         "areaServed": [{"@type": "Country", "name": "Italy"}, {"@type": "Country", "name": "Bulgaria"}],
         "description": desc, "url": canon, "image": f"{BASE}/{s['og']}",
         "availableChannel": {"@type": "ServiceChannel", "serviceUrl": BASE + s["contact"]}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + (s["prefix"] or "/")},
            {"@type": "ListItem", "position": 2, "name": s["hub_name"], "item": BASE + s["urlbase"]},
            {"@type": "ListItem", "position": 3, "name": name, "item": canon}]},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]},
    ]}
    return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "</script>"

def render_sector(lang, sector):
    s = L[lang]
    c = sector[lang]
    name = sector["names"][lang]
    slug = sector["slug"]
    canon = f"{BASE}{s['urlbase']}{slug}/"
    title = s["title_fmt"].format(name=name)
    h1 = title.split("|")[0].strip()
    desc = c["desc"]
    faqs = c["faqs"]
    alts = alternates(slug)
    faq_html = "".join(
        f'<div class="faq-item"><div class="faq-q">{html.escape(q)}</div><div class="faq-a">{html.escape(a)}</div></div>'
        for q, a in faqs)
    related = "".join(
        f'<a href="{s["urlbase"]}{rs}/">{SLUG_NAMES[rs][lang]}</a>' for rs in sector["related"])
    hub_link = f'<a href="{s["urlbase"]}">{s["hub_link"]} &rarr;</a>'
    # Inject answer-first "what you need online" checklist after the intro
    # paragraph, and a closing results paragraph before the FAQ.
    x = EXTRAS[slug][lang]
    needs_ul = "<ul>" + "".join(f"<li>{html.escape(b)}</li>" for b in x["needs"]) + "</ul>"
    intro_p, rest = c["body"].split("</p>", 1)
    body_html = intro_p + "</p>" + needs_ul + rest + f'<p>{html.escape(x["close"])}</p>'
    body = (
        head(lang, title, desc, canon, alts)
        + sector_jsonld(lang, sector, title, desc, canon)
        + "\n</head><body>"
        + s["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["tag"]}</div><h1>{html.escape(h1)}</h1></div></div>'
        + '<div class="w">'
        + body_html
        + f'<h2>{s["faq_h2"]}</h2>{faq_html}'
        + f'<h2>{s["related_h2"]}</h2><div class="sect">{related}</div><p>{hub_link}</p>'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a>'
        + '</div>'
        + s["ft"]
        + "</body></html>\n"
    )
    return body

def hub_jsonld(lang, canon):
    s = L[lang]
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "@id": f"{canon}#page", "url": canon, "name": s["hub_h1"],
         "description": s["hub_desc"], "inLanguage": lang, "isPartOf": {"@id": f"{BASE}/#website"}},
        {"@type": "ItemList", "name": s["hub_h1"], "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": sec["names"][lang],
             "url": f"{BASE}{s['urlbase']}{sec['slug']}/"}
            for i, sec in enumerate(SECTORS)]},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + (s["prefix"] or "/")},
            {"@type": "ListItem", "position": 2, "name": s["hub_name"], "item": canon}]},
    ]}
    return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "</script>"

def render_hub(lang):
    s = L[lang]
    canon = f"{BASE}{s['urlbase']}"
    cards = "".join(
        f'<a class="card" href="{s["urlbase"]}{sec["slug"]}/"><span class="k">{s["tag"]}</span>'
        f'<h3>{html.escape(sec["names"][lang])}</h3>'
        f'<p>{html.escape(SLUG_TAGLINE[sec["slug"]][lang])}</p></a>'
        for sec in SECTORS)
    body = (
        head(lang, s["hub_title"], s["hub_desc"], canon, hub_alternates())
        + hub_jsonld(lang, canon)
        + "\n</head><body>"
        + s["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["tag"]}</div><h1>{html.escape(s["hub_h1"])}</h1><p>{html.escape(s["hub_intro"])}</p></div></div>'
        + '<div class="w">'
        + f'<div class="cards">{cards}</div>'
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
        base = L[lang]["urlbase"].strip("/")  # settori | en/industries | bg/branshove
        root = os.path.join("public", base)
        write(os.path.join(root, "index.html"), render_hub(lang))
        n += 1
        for sector in SECTORS:
            write(os.path.join(root, sector["slug"], "index.html"), render_sector(lang, sector))
            n += 1
    # sitemap-industries.xml (own file)
    urls = []
    for lang in ("it", "en", "bg"):
        urls.append(f"{BASE}{L[lang]['urlbase']}")
    for sector in SECTORS:
        for lang in ("it", "en", "bg"):
            urls.append(f"{BASE}{L[lang]['urlbase']}{sector['slug']}/")
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sm.append(f"<url><loc>{u}</loc><lastmod>{LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>")
    sm.append("</urlset>")
    write(os.path.join("public", "sitemap-industries.xml"), "\n".join(sm) + "\n")
    print(f"wrote {n} industry pages ({len(SECTORS)} sectors x 3 langs + 3 hubs) + sitemap-industries.xml ({len(urls)} urls)")

if __name__ == "__main__":
    main()
