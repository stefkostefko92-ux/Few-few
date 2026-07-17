#!/usr/bin/env python3
"""Generate a trilingual AEO glossary (it/en/bg) into public/glossario,
public/en/glossary and public/bg/rechnik, plus a hub per language and its own
sitemap (public/sitemap-glossary.xml).

Run from repo root: python3 scripts/generate-glossary.py

Each term page is answer-first: a bold 1-2 sentence definition on the first line
(the kind AI engines quote), then genuine h2 sections, a 3-question FAQ block,
3-4 internal links to real service/glossary pages and a CTA. Self-contained
static HTML, no build step. JSON-LD @graph carries DefinedTerm + FAQPage +
BreadcrumbList so answer engines can cite the definition directly.
"""
import os, html, json

BASE = "https://carbonstealth.eu"
DATE = "2026-07-17"

STYLE = ("*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#ccc;font-family:'Space Mono',monospace;font-size:13px;line-height:2;padding:0}a{color:#00e5ff;text-decoration:none}.w{max-width:900px;margin:0 auto;padding:40px 20px}h1{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2.5rem;color:#f5f5f0;margin-bottom:16px;letter-spacing:-.03em;line-height:1.1}h2{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.2rem;color:#00e5ff;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.05em}h3{color:#f5f5f0;font-size:1rem;margin:20px 0 8px}p,li{margin-bottom:10px;line-height:1.9}ul{padding-left:20px}.nav{position:fixed;top:0;width:100%;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,229,255,.1);padding:12px 20px;z-index:1000;display:flex;justify-content:space-between;align-items:center}.nav a{color:#ccc;font-size:10px;letter-spacing:.2em;margin:0 10px}.nav img{height:24px}.hero-s{padding:120px 20px 60px;border-bottom:1px solid rgba(0,229,255,.1)}.tag{font-size:9px;color:#00e5ff;letter-spacing:.4em;margin-bottom:12px}.cta{display:inline-block;padding:14px 32px;border:1px solid #00e5ff;color:#00e5ff;font-size:11px;letter-spacing:.25em;margin-top:24px}.ft{border-top:1px solid rgba(245,245,240,.06);padding:30px 20px;text-align:center;font-size:9px;color:#999;margin-top:60px}.faq-item{border-bottom:1px solid rgba(245,245,240,.06);padding:16px 0}.faq-q{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1rem;color:#f5f5f0;margin-bottom:6px}.faq-a{font-size:12px;color:#ccc}.blog-date{font-size:10px;color:#999;letter-spacing:.15em}"
         ".lead{font-size:15px;line-height:1.8;color:#f5f5f0;border-left:2px solid #00e5ff;padding-left:16px;margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;margin:28px 0}.card{display:block;border:1px solid rgba(0,229,255,.15);padding:18px;transition:border-color .2s}.card:hover{border-color:#00e5ff}.card h3{color:#00e5ff;margin:0 0 8px;font-family:'Inter Tight',sans-serif;font-weight:700}.card p{font-size:11px;color:#999;margin:0;line-height:1.6}.rel{font-size:11px;color:#999;margin-top:28px;letter-spacing:.1em}.rel a{margin-right:14px}")

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">')

# ── Per-language chrome ──────────────────────────────────────────
GLOS = {"it": "/glossario/", "en": "/en/glossary/", "bg": "/bg/rechnik/"}

L = {
 "it": dict(
   og="og/og-glossario.png", locale="it_IT",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/chi-siamo/">CHI SIAMO</a><a href="/servizi/sviluppo-siti-web/">SERVIZI</a><a href="/portfolio/">PORTFOLIO</a><a href="/contatti/">CONTATTI</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Tutti i diritti riservati &middot; <a href="/privacy/">Privacy</a> &middot; <a href="/cookie/">Cookie</a> &middot; <a href="/termini/">Terms</a></p></div>',
   home="/", contact="/contatti/", glos_name="Glossario", tag="// GLOSSARIO",
   faq_h2="Domande frequenti", rel_label="Termini correlati:",
   cta="RICHIEDI UN PREVENTIVO GRATUITO",
   title=lambda q: f"Cos'è {q}? Significato e Guida | Carbon Stealth"),
 "en": dict(
   og="og/og-glossario-en.png", locale="en_US",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/en/about/">ABOUT</a><a href="/en/services/web-development/">SERVICES</a><a href="/en/portfolio/">PORTFOLIO</a><a href="/en/contact/">CONTACT</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>All rights reserved &middot; <a href="/en/privacy/">Privacy</a> &middot; <a href="/en/cookie/">Cookie</a> &middot; <a href="/en/terms/">Terms</a></p></div>',
   home="/en/", contact="/en/contact/", glos_name="Glossary", tag="// GLOSSARY",
   faq_h2="Frequently asked questions", rel_label="Related terms:",
   cta="REQUEST A FREE QUOTE",
   title=lambda q: f"What Is {q}? Definition & Guide | Carbon Stealth"),
 "bg": dict(
   og="og/og-glossario-bg.png", locale="bg_BG",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">ГЛАВНА</a><a href="/bg/za-nas/">ЗА НАС</a><a href="/bg/uslugi/web-razrabotka/">УСЛУГИ</a><a href="/bg/portfolio/">ПОРТФОЛИО</a><a href="/bg/kontakti/">КОНТАКТИ</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Всички права запазени &middot; <a href="/bg/privacy/">Privacy</a> &middot; <a href="/bg/cookie/">Cookie</a> &middot; <a href="/bg/usloviya/">Terms</a></p></div>',
   home="/bg/", contact="/bg/kontakti/", glos_name="Речник", tag="// РЕЧНИК",
   faq_h2="Често задавани въпроси", rel_label="Свързани термини:",
   cta="ЗАЯВИ БЕЗПЛАТНА ОФЕРТА",
   title=lambda q: f"Какво е {q}? Значение и Обяснение | Carbon Stealth"),
}

# ── Content (filled in below) ───────────────────────────────────
# TERMS entries: dict(slug, name, related=[slugs], lang=dict(it/en/bg={q,desc,card,answer,body,faqs}))
#   answer = plain-text 1-2 sentence definition (bold lead + schema description)
#   body   = HTML with h2 sections and inline internal links
#   faqs   = list of 3 (question, answer) plain-text tuples
#   card   = short one-line summary for the hub grid
TERMS = []

TERMS.extend([

# ── cms ──────────────────────────────────────────────────────────
dict(slug="cms", name="CMS", related=["headless-cms", "database", "framework"], lang=dict(
 it=dict(q="un CMS", q_link="CMS", card="Il software per gestire i contenuti di un sito senza scrivere codice.",
  desc="Cos'è un CMS (Content Management System)? Significato, come funziona, differenza con l'headless e quando conviene, spiegato in modo semplice.",
  answer="Un CMS (Content Management System) è un software che permette di creare, modificare e pubblicare i contenuti di un sito web senza scrivere codice, tramite un'interfaccia visuale.",
  body="""<h2>Come funziona un CMS</h2>
<p>Un CMS separa il contenuto (testi, immagini, pagine) dal codice e dal design. Accedi a un pannello di amministrazione, scrivi un articolo o modifichi una pagina come in un editor di testo, e il sistema lo pubblica online salvando tutto in un <a href="/glossario/database/">database</a>. I più diffusi sono WordPress, Joomla e Drupal.</p>
<h2>CMS tradizionale o headless</h2>
<p>Un CMS tradizionale gestisce insieme contenuto e presentazione. Un <a href="/glossario/headless-cms/">headless CMS</a> invece espone i contenuti tramite API e lascia a te la libertà di scegliere con quale tecnologia mostrarli. Il primo è più semplice e immediato, il secondo più flessibile per progetti multicanale.</p>
<h2>Quando conviene un CMS</h2>
<p>Un CMS è la scelta giusta quando aggiorni spesso i contenuti — blog, cataloghi, notizie — e vuoi farlo in autonomia, senza dipendere ogni volta da un tecnico. Nel nostro <a href="/servizi/sviluppo-siti-web/">servizio di sviluppo siti web</a> configuriamo il CMS più adatto al tuo caso e ti formiamo per gestirlo da solo.</p>""",
  faqs=[
   ("Qual è il CMS più usato?", "WordPress è il CMS più diffuso al mondo e alimenta una grande parte dei siti online. È flessibile e ha migliaia di temi e plugin, ma va tenuto aggiornato per restare sicuro."),
   ("Serve saper programmare per usare un CMS?", "No. Un CMS nasce proprio per far pubblicare e modificare contenuti a chi non è tecnico, tramite un'interfaccia visuale. Un tecnico serve solo per installazione, personalizzazione e manutenzione."),
   ("Un CMS è gratuito?", "Molti CMS come WordPress sono gratuiti e open source, ma restano i costi di hosting, dominio, eventuali temi o plugin premium e la manutenzione."),
  ]),
 en=dict(q="a CMS", q_link="CMS", card="The software for managing a website's content without writing code.",
  desc="What is a CMS (Content Management System)? Meaning, how it works, the difference from headless and when to use one, explained simply.",
  answer="A CMS (Content Management System) is software that lets you create, edit and publish the content of a website without writing code, through a visual interface.",
  body="""<h2>How a CMS works</h2>
<p>A CMS separates content (text, images, pages) from the code and the design. You log in to an admin panel, write an article or edit a page as you would in a text editor, and the system publishes it online, storing everything in a <a href="/en/glossary/database/">database</a>. The most common ones are WordPress, Joomla and Drupal.</p>
<h2>Traditional CMS vs headless</h2>
<p>A traditional CMS manages content and presentation together. A <a href="/en/glossary/headless-cms/">headless CMS</a> instead exposes content through APIs and leaves you free to choose which technology displays it. The first is simpler and more immediate; the second is more flexible for multi-channel projects.</p>
<h2>When a CMS makes sense</h2>
<p>A CMS is the right choice when you update content often — a blog, catalog or news — and want to do it yourself, without depending on a developer every time. In our <a href="/en/services/web-development/">web development service</a> we set up the CMS that fits your case and train you to run it on your own.</p>""",
  faqs=[
   ("What is the most used CMS?", "WordPress is the most widely used CMS in the world and powers a large share of sites online. It is flexible and has thousands of themes and plugins, but it must be kept updated to stay secure."),
   ("Do I need to code to use a CMS?", "No. A CMS exists precisely to let non-technical people publish and edit content through a visual interface. A developer is only needed for installation, customization and maintenance."),
   ("Is a CMS free?", "Many CMSs like WordPress are free and open source, but you still pay for hosting, a domain, any premium themes or plugins and maintenance."),
  ]),
 bg=dict(q="CMS", q_link="CMS", card="Софтуерът за управление на съдържанието на сайт без писане на код.",
  desc="Какво е CMS (система за управление на съдържание)? Значение, как работи, разликата с headless и кога е подходящ, обяснено просто.",
  answer="CMS (Content Management System, система за управление на съдържание) е софтуер, който позволява да създавате, редактирате и публикувате съдържанието на уебсайт без писане на код, чрез визуален интерфейс.",
  body="""<h2>Как работи CMS</h2>
<p>CMS разделя съдържанието (текстове, изображения, страници) от кода и дизайна. Влизате в административен панел, пишете статия или редактирате страница като в текстов редактор, а системата я публикува онлайн, съхранявайки всичко в <a href="/bg/rechnik/database/">база данни</a>. Най-разпространени са WordPress, Joomla и Drupal.</p>
<h2>Традиционен CMS или headless</h2>
<p>Традиционният CMS управлява съдържанието и представянето заедно. <a href="/bg/rechnik/headless-cms/">Headless CMS</a> вместо това предоставя съдържанието чрез API и ви оставя свободата да изберете с каква технология да го покажете. Първият е по-прост и директен, вторият е по-гъвкав за многоканални проекти.</p>
<h2>Кога е подходящ CMS</h2>
<p>CMS е правилният избор, когато обновявате съдържанието често — блог, каталог, новини — и искате да го правите сами, без всеки път да зависите от разработчик. В нашата <a href="/bg/uslugi/web-razrabotka/">услуга за изработка на сайтове</a> настройваме най-подходящия CMS за вашия случай и ви обучаваме да го управлявате сами.</p>""",
  faqs=[
   ("Кой е най-използваният CMS?", "WordPress е най-разпространеният CMS в света и захранва голяма част от сайтовете онлайн. Гъвкав е и има хиляди теми и разширения, но трябва да се поддържа обновен, за да остане сигурен."),
   ("Трябва ли да програмирам, за да ползвам CMS?", "Не. CMS съществува именно за да позволи на нетехнически хора да публикуват и редактират съдържание чрез визуален интерфейс. Разработчик е нужен само за инсталация, персонализация и поддръжка."),
   ("Безплатен ли е CMS?", "Много CMS като WordPress са безплатни и с отворен код, но остават разходите за хостинг, домейн, евентуални платени теми или разширения и поддръжка."),
  ]),
)),

# ── headless-cms ─────────────────────────────────────────────────
dict(slug="headless-cms", name="Headless CMS", related=["cms", "api", "framework"], lang=dict(
 it=dict(q="un headless CMS", q_link="Headless CMS", card="Un CMS che fornisce i contenuti via API, separati dalla presentazione.",
  desc="Cos'è un headless CMS? Significato, differenza con un CMS tradizionale, vantaggi e quando conviene, spiegato in modo chiaro.",
  answer="Un headless CMS è un sistema di gestione dei contenuti privo di parte grafica (\"testa\"): archivia i contenuti e li distribuisce tramite API a qualsiasi sito, app o dispositivo.",
  body="""<h2>La differenza con un CMS tradizionale</h2>
<p>In un <a href="/glossario/cms/">CMS tradizionale</a> come WordPress, contenuto e presentazione sono legati insieme. In un headless CMS la \"testa\" — cioè il front-end che mostra le pagine — è staccata: il CMS gestisce solo i dati e li consegna via <a href="/glossario/api/">API</a>. Il sito o l'app che li visualizza viene costruito a parte.</p>
<h2>Vantaggi dell'approccio headless</h2>
<ul>
<li><strong>Multicanale:</strong> gli stessi contenuti alimentano sito web, app mobile e altri canali.</li>
<li><strong>Prestazioni:</strong> il front-end può usare tecnologie moderne e veloci con un <a href="/glossario/framework/">framework</a> a scelta.</li>
<li><strong>Sicurezza:</strong> separando i livelli si riduce la superficie d'attacco.</li>
</ul>
<h2>Quando conviene</h2>
<p>L'headless ha senso quando pubblichi gli stessi contenuti su più piattaforme o vuoi la massima libertà tecnica sul front-end. Per un sito vetrina semplice è spesso sovradimensionato. Se non sai quale approccio scegliere, nel nostro <a href="/servizi/sviluppo-siti-web/">servizio di sviluppo siti web</a> valutiamo insieme costi e benefici.</p>""",
  faqs=[
   ("Qual è la differenza tra CMS e headless CMS?", "Un CMS tradizionale unisce contenuto e grafica; un headless CMS gestisce solo i contenuti e li distribuisce via API, lasciando la presentazione a un front-end separato e libero."),
   ("Esempi di headless CMS?", "Tra i più noti ci sono Strapi, Contentful, Sanity e Storyblok. Anche WordPress può funzionare in modalità headless usando le sue API."),
   ("Un headless CMS è più difficile da gestire?", "La redazione dei contenuti resta semplice, ma servono più competenze tecniche per costruire e mantenere il front-end separato. Per questo conviene soprattutto a progetti strutturati."),
  ]),
 en=dict(q="a headless CMS", q_link="Headless CMS", card="A CMS that delivers content via API, separate from presentation.",
  desc="What is a headless CMS? Meaning, the difference from a traditional CMS, benefits and when to use one, explained clearly.",
  answer="A headless CMS is a content management system with no presentation layer (\"head\"): it stores content and delivers it through APIs to any site, app or device.",
  body="""<h2>The difference from a traditional CMS</h2>
<p>In a traditional <a href="/en/glossary/cms/">CMS</a> like WordPress, content and presentation are tied together. In a headless CMS the \"head\" — the front-end that renders pages — is detached: the CMS only manages the data and delivers it through an <a href="/en/glossary/api/">API</a>. The site or app that displays it is built separately.</p>
<h2>Benefits of the headless approach</h2>
<ul>
<li><strong>Multi-channel:</strong> the same content feeds a website, a mobile app and other channels.</li>
<li><strong>Performance:</strong> the front-end can use modern, fast technology with a <a href="/en/glossary/framework/">framework</a> of your choice.</li>
<li><strong>Security:</strong> separating the layers reduces the attack surface.</li>
</ul>
<h2>When it makes sense</h2>
<p>Headless is worthwhile when you publish the same content across several platforms or want maximum technical freedom on the front-end. For a simple brochure site it is often overkill. If you're unsure which approach fits, our <a href="/en/services/web-development/">web development service</a> weighs the costs and benefits with you.</p>""",
  faqs=[
   ("What is the difference between a CMS and a headless CMS?", "A traditional CMS combines content and presentation; a headless CMS manages only content and delivers it via API, leaving presentation to a separate, freely chosen front-end."),
   ("Examples of headless CMS?", "Well-known ones include Strapi, Contentful, Sanity and Storyblok. WordPress can also run in headless mode using its APIs."),
   ("Is a headless CMS harder to manage?", "Editing content stays simple, but building and maintaining the separate front-end needs more technical skill. That is why it suits structured projects best."),
  ]),
 bg=dict(q="headless CMS", q_link="Headless CMS", card="CMS, който доставя съдържание чрез API, отделено от представянето.",
  desc="Какво е headless CMS? Значение, разликата с традиционния CMS, предимства и кога е подходящ, обяснено ясно.",
  answer="Headless CMS е система за управление на съдържание без графична част (\"глава\"): съхранява съдържанието и го доставя чрез API до всеки сайт, приложение или устройство.",
  body="""<h2>Разликата с традиционния CMS</h2>
<p>В традиционен <a href="/bg/rechnik/cms/">CMS</a> като WordPress съдържанието и представянето са свързани. При headless CMS \"главата\" — front-end частта, която показва страниците — е отделена: CMS управлява само данните и ги доставя чрез <a href="/bg/rechnik/api/">API</a>. Сайтът или приложението, което ги показва, се изгражда отделно.</p>
<h2>Предимства на headless подхода</h2>
<ul>
<li><strong>Многоканалност:</strong> едно и също съдържание захранва сайт, мобилно приложение и други канали.</li>
<li><strong>Производителност:</strong> front-end частта може да ползва модерна и бърза технология с <a href="/bg/rechnik/framework/">framework</a> по избор.</li>
<li><strong>Сигурност:</strong> разделянето на слоевете намалява повърхността за атаки.</li>
</ul>
<h2>Кога е подходящ</h2>
<p>Headless има смисъл, когато публикувате едно и също съдържание на няколко платформи или искате максимална техническа свобода на front-end. За прост визитен сайт често е прекалено. Ако не сте сигурни кой подход е подходящ, в нашата <a href="/bg/uslugi/web-razrabotka/">услуга за изработка на сайтове</a> преценяваме разходите и ползите заедно.</p>""",
  faqs=[
   ("Каква е разликата между CMS и headless CMS?", "Традиционният CMS обединява съдържание и представяне; headless CMS управлява само съдържанието и го доставя чрез API, оставяйки представянето на отделен, свободно избран front-end."),
   ("Примери за headless CMS?", "Сред известните са Strapi, Contentful, Sanity и Storyblok. WordPress също може да работи в headless режим чрез своите API."),
   ("По-труден ли е headless CMS за управление?", "Редактирането на съдържание остава просто, но изграждането и поддръжката на отделния front-end изискват повече техническо умение. Затова е най-подходящ за структурирани проекти."),
  ]),
)),

])  # end batch 1

TERMS.extend([

# ── pwa ──────────────────────────────────────────────────────────
dict(slug="pwa", name="PWA (Progressive Web App)", related=["cache", "responsive-design", "backend-frontend"], lang=dict(
 it=dict(q="una PWA", q_link="PWA", card="Un sito web che si comporta come un'app, installabile e usabile offline.",
  desc="Cos'è una PWA (Progressive Web App)? Significato, come funziona, differenza con un'app nativa e vantaggi, spiegato in modo semplice.",
  answer="Una PWA (Progressive Web App) è un sito web che si comporta come un'app: si può installare sulla schermata iniziale, funziona anche offline e invia notifiche, senza passare da uno store.",
  body="""<h2>Come funziona una PWA</h2>
<p>Una PWA è costruita con le tecnologie del web (HTML, CSS, JavaScript) ma aggiunge un service worker, cioè uno script che gira in background e gestisce la <a href="/glossario/cache/">cache</a>. Grazie a questo la PWA carica in fretta e resta usabile anche senza connessione. L'utente può \"installarla\" con un tocco, senza scaricarla da App Store o Google Play.</p>
<h2>PWA o app nativa</h2>
<p>Un'app nativa si scarica dagli store ed è sviluppata per iOS o Android; una PWA è un unico progetto web che funziona ovunque. La PWA costa meno e si aggiorna all'istante, ma ha accesso più limitato ad alcune funzioni del dispositivo. È spesso costruita con un <a href="/glossario/backend-frontend/">front-end</a> moderno e un design <a href="/glossario/responsive-design/">responsive</a>.</p>
<h2>Quando conviene una PWA</h2>
<p>La PWA è ideale quando vuoi un'esperienza da app senza i costi e la complessità di due app native separate: e-commerce, portali, servizi consultati spesso da mobile. Nel nostro <a href="/servizi/sviluppo-siti-web/">servizio di sviluppo siti web</a> realizziamo PWA veloci e installabili.</p>""",
  faqs=[
   ("Qual è la differenza tra PWA e app nativa?", "Una PWA è un sito web installabile che funziona su qualsiasi dispositivo con un solo progetto; un'app nativa si scarica dagli store ed è sviluppata separatamente per iOS e Android, con costi più alti ma accesso completo alle funzioni del telefono."),
   ("Una PWA funziona davvero offline?", "Sì, entro certi limiti. Grazie al service worker e alla cache, le pagine già visitate e le risorse principali restano disponibili anche senza connessione."),
   ("Le PWA si trovano su App Store?", "Non necessariamente. Si installano direttamente dal browser, anche se oggi è possibile pubblicarle pure sugli store. Questo evita le commissioni e i tempi di approvazione."),
  ]),
 en=dict(q="a PWA", q_link="PWA", card="A website that behaves like an app: installable and usable offline.",
  desc="What is a PWA (Progressive Web App)? Meaning, how it works, the difference from a native app and its benefits, explained simply.",
  answer="A PWA (Progressive Web App) is a website that behaves like an app: it can be installed on the home screen, works offline and sends notifications, without going through an app store.",
  body="""<h2>How a PWA works</h2>
<p>A PWA is built with web technologies (HTML, CSS, JavaScript) but adds a service worker — a script that runs in the background and manages the <a href="/en/glossary/cache/">cache</a>. Thanks to this the PWA loads fast and stays usable even without a connection. Users can \"install\" it with a tap, without downloading it from the App Store or Google Play.</p>
<h2>PWA vs native app</h2>
<p>A native app is downloaded from the stores and built for iOS or Android; a PWA is a single web project that runs everywhere. A PWA costs less and updates instantly, but has more limited access to some device features. It is often built with a modern <a href="/en/glossary/backend-frontend/">front-end</a> and a <a href="/en/glossary/responsive-design/">responsive</a> design.</p>
<h2>When a PWA makes sense</h2>
<p>A PWA is ideal when you want an app-like experience without the cost and complexity of two separate native apps: e-commerce, portals, services used often on mobile. In our <a href="/en/services/web-development/">web development service</a> we build fast, installable PWAs.</p>""",
  faqs=[
   ("What is the difference between a PWA and a native app?", "A PWA is an installable website that runs on any device from a single project; a native app is downloaded from stores and built separately for iOS and Android, with higher costs but full access to phone features."),
   ("Does a PWA really work offline?", "Yes, within limits. Thanks to the service worker and cache, pages you have already visited and the main resources stay available even without a connection."),
   ("Are PWAs on the App Store?", "Not necessarily. They install directly from the browser, though today you can also publish them on stores. This avoids commissions and approval delays."),
  ]),
 bg=dict(q="PWA", q_link="PWA", card="Уебсайт, който се държи като приложение: инсталируем и работи офлайн.",
  desc="Какво е PWA (прогресивно уеб приложение)? Значение, как работи, разликата с нативно приложение и предимства, обяснено просто.",
  answer="PWA (Progressive Web App, прогресивно уеб приложение) е уебсайт, който се държи като приложение: може да се инсталира на началния екран, работи офлайн и изпраща известия, без да минава през магазин за приложения.",
  body="""<h2>Как работи PWA</h2>
<p>PWA е изградено с уеб технологиите (HTML, CSS, JavaScript), но добавя service worker — скрипт, който работи във фонов режим и управлява <a href="/bg/rechnik/cache/">кеша</a>. Благодарение на това PWA се зарежда бързо и остава използваемо дори без връзка. Потребителят може да го \"инсталира\" с едно докосване, без да го тегли от App Store или Google Play.</p>
<h2>PWA или нативно приложение</h2>
<p>Нативното приложение се тегли от магазините и се разработва за iOS или Android; PWA е един уеб проект, който работи навсякъде. PWA струва по-малко и се обновява мигновено, но има по-ограничен достъп до някои функции на устройството. Често се изгражда с модерен <a href="/bg/rechnik/backend-frontend/">front-end</a> и <a href="/bg/rechnik/responsive-design/">responsive</a> дизайн.</p>
<h2>Кога е подходящо PWA</h2>
<p>PWA е идеално, когато искате изживяване като на приложение без разходите и сложността на две отделни нативни приложения: онлайн магазини, портали, услуги, ползвани често от мобилно устройство. В нашата <a href="/bg/uslugi/web-razrabotka/">услуга за изработка на сайтове</a> изграждаме бързи и инсталируеми PWA.</p>""",
  faqs=[
   ("Каква е разликата между PWA и нативно приложение?", "PWA е инсталируем уебсайт, който работи на всяко устройство от един проект; нативното приложение се тегли от магазините и се разработва отделно за iOS и Android, с по-високи разходи, но пълен достъп до функциите на телефона."),
   ("Наистина ли PWA работи офлайн?", "Да, в определени граници. Благодарение на service worker и кеша вече посетените страници и основните ресурси остават достъпни дори без връзка."),
   ("PWA намират ли се в App Store?", "Не задължително. Инсталират се директно от браузъра, макар че днес могат да се публикуват и в магазините. Това спестява комисионите и времето за одобрение."),
  ]),
)),

# ── api ──────────────────────────────────────────────────────────
dict(slug="api", name="API", related=["backend-frontend", "headless-cms", "database"], lang=dict(
 it=dict(q="un'API", q_link="API", card="L'interfaccia che permette a due software di scambiarsi dati.",
  desc="Cos'è un'API? Significato, come funziona, esempi concreti e a cosa serve, spiegato in linguaggio semplice.",
  answer="Un'API (Application Programming Interface) è un'interfaccia che permette a due software di comunicare e scambiarsi dati seguendo regole precise, senza conoscere il funzionamento interno l'uno dell'altro.",
  body="""<h2>Come funziona un'API</h2>
<p>Un'API funziona come un cameriere al ristorante: il tuo software fa una richiesta (l'ordine), l'API la porta a un altro sistema e ti restituisce la risposta (il piatto), senza che tu debba entrare in cucina. Quando un sito mostra una mappa, un meteo o un pagamento, sta chiamando l'API di un altro servizio. I dati viaggiano di solito in formato JSON.</p>
<h2>A cosa servono le API</h2>
<ul>
<li><strong>Integrazioni:</strong> collegano il tuo sito a corrieri, gateway di pagamento, gestionali o <a href="/servizi/erp/">ERP</a>.</li>
<li><strong>Separazione:</strong> permettono a un <a href="/glossario/backend-frontend/">front-end</a> di dialogare col back-end e con il <a href="/glossario/database/">database</a>.</li>
<li><strong>Contenuti:</strong> stanno alla base di un <a href="/glossario/headless-cms/">headless CMS</a>.</li>
</ul>
<h2>API e sicurezza</h2>
<p>Le API vanno protette con chiavi di accesso, autenticazione e limiti di chiamata, perché espongono dati verso l'esterno. Un'integrazione ben progettata è affidabile e sicura: nel nostro <a href="/servizi/sviluppo-siti-web/">sviluppo siti web</a> realizziamo e colleghiamo API su misura.</p>""",
  faqs=[
   ("Cosa significa API?", "API sta per Application Programming Interface, cioè interfaccia di programmazione delle applicazioni. È l'insieme di regole con cui due software si scambiano dati e funzioni."),
   ("Puoi fare un esempio di API?", "Quando prenoti un volo su un sito che confronta più compagnie, il sito chiama le API delle compagnie per ottenere prezzi e disponibilità in tempo reale. Lo stesso vale per mappe, meteo e pagamenti."),
   ("Le API sono gratuite?", "Dipende dal servizio. Molte API hanno un piano gratuito con limiti di utilizzo e piani a pagamento per volumi maggiori; altre sono completamente a pagamento."),
  ]),
 en=dict(q="an API", q_link="API", card="The interface that lets two pieces of software exchange data.",
  desc="What is an API? Meaning, how it works, concrete examples and what it is for, explained in plain language.",
  answer="An API (Application Programming Interface) is an interface that lets two software programs communicate and exchange data by following precise rules, without either one knowing how the other works inside.",
  body="""<h2>How an API works</h2>
<p>An API works like a waiter in a restaurant: your software makes a request (the order), the API takes it to another system and brings back the response (the dish), without you ever entering the kitchen. When a site shows a map, weather or a payment, it is calling another service's API. The data usually travels in JSON format.</p>
<h2>What APIs are for</h2>
<ul>
<li><strong>Integrations:</strong> they connect your site to couriers, payment gateways, management systems or an <a href="/en/services/erp/">ERP</a>.</li>
<li><strong>Separation:</strong> they let a <a href="/en/glossary/backend-frontend/">front-end</a> talk to the back-end and the <a href="/en/glossary/database/">database</a>.</li>
<li><strong>Content:</strong> they are the foundation of a <a href="/en/glossary/headless-cms/">headless CMS</a>.</li>
</ul>
<h2>APIs and security</h2>
<p>APIs must be protected with access keys, authentication and rate limits, because they expose data to the outside. A well-designed integration is reliable and secure: in our <a href="/en/services/web-development/">web development</a> we build and connect custom APIs.</p>""",
  faqs=[
   ("What does API mean?", "API stands for Application Programming Interface. It is the set of rules through which two software programs exchange data and functions."),
   ("Can you give an example of an API?", "When you book a flight on a site that compares several airlines, the site calls the airlines' APIs to get prices and availability in real time. The same applies to maps, weather and payments."),
   ("Are APIs free?", "It depends on the service. Many APIs have a free tier with usage limits and paid plans for higher volumes; others are entirely paid."),
  ]),
 bg=dict(q="API", q_link="API", card="Интерфейсът, който позволява на два софтуера да обменят данни.",
  desc="Какво е API? Значение, как работи, конкретни примери и за какво служи, обяснено на прост език.",
  answer="API (Application Programming Interface, приложно-програмен интерфейс) е интерфейс, който позволява на два софтуера да комуникират и обменят данни по точни правила, без всеки да знае как работи другият отвътре.",
  body="""<h2>Как работи API</h2>
<p>API работи като сервитьор в ресторант: вашият софтуер прави заявка (поръчката), API я отнася до друга система и връща отговора (ястието), без вие да влизате в кухнята. Когато сайт показва карта, време или плащане, той извиква API на друга услуга. Данните обикновено пътуват във формат JSON.</p>
<h2>За какво служат API</h2>
<ul>
<li><strong>Интеграции:</strong> свързват сайта ви с куриери, платежни оператори, складови системи или <a href="/bg/uslugi/erp/">ERP</a>.</li>
<li><strong>Разделяне:</strong> позволяват на <a href="/bg/rechnik/backend-frontend/">front-end</a> да общува с back-end и <a href="/bg/rechnik/database/">базата данни</a>.</li>
<li><strong>Съдържание:</strong> са в основата на <a href="/bg/rechnik/headless-cms/">headless CMS</a>.</li>
</ul>
<h2>API и сигурност</h2>
<p>API трябва да се защитават с ключове за достъп, автентикация и лимити на заявките, защото излагат данни навън. Добре проектираната интеграция е надеждна и сигурна: в нашата <a href="/bg/uslugi/web-razrabotka/">изработка на сайтове</a> изграждаме и свързваме API по поръчка.</p>""",
  faqs=[
   ("Какво означава API?", "API означава Application Programming Interface, тоест приложно-програмен интерфейс. Това е наборът от правила, чрез които два софтуера обменят данни и функции."),
   ("Може ли пример за API?", "Когато резервирате полет на сайт, който сравнява няколко авиокомпании, сайтът извиква API на компаниите, за да получи цени и наличност в реално време. Същото важи за карти, време и плащания."),
   ("Безплатни ли са API?", "Зависи от услугата. Много API имат безплатен план с лимити и платени планове за по-големи обеми; други са изцяло платени."),
  ]),
)),

])  # end batch 2

TERMS.extend([

# ── ssl ──────────────────────────────────────────────────────────
dict(slug="ssl", name="SSL", related=["dns", "dominio", "hosting"], lang=dict(
 it=dict(q="un certificato SSL", q_link="SSL", card="Il certificato che cifra i dati tra browser e sito (il lucchetto HTTPS).",
  desc="Cos'è un certificato SSL? Significato, come funziona, perché serve l'HTTPS e come ottenerlo, spiegato in modo semplice.",
  answer="Un certificato SSL (Secure Sockets Layer) è un file che cifra la connessione tra il browser dell'utente e il sito web, così i dati scambiati non possono essere letti da terzi. È ciò che attiva l'HTTPS e il lucchetto nella barra degli indirizzi.",
  body="""<h2>Come funziona SSL</h2>
<p>Quando visiti un sito con HTTPS, il certificato SSL avvia una connessione cifrata: le informazioni (password, dati della carta, moduli) viaggiano in forma illeggibile per chiunque le intercetti. Tecnicamente oggi si usa il protocollo TLS, evoluzione dell'SSL, ma il nome \"SSL\" è rimasto nell'uso comune. Il certificato è legato al tuo <a href="/glossario/dominio/">dominio</a> e verificato tramite il <a href="/glossario/dns/">DNS</a>.</p>
<h2>Perché SSL è indispensabile</h2>
<ul>
<li><strong>Sicurezza:</strong> protegge i dati sensibili degli utenti.</li>
<li><strong>Fiducia:</strong> il lucchetto rassicura i visitatori; un sito \"Non sicuro\" li allontana.</li>
<li><strong>SEO:</strong> Google privilegia i siti in HTTPS nei risultati di ricerca.</li>
</ul>
<h2>Come ottenere un certificato SSL</h2>
<p>Molti provider offrono certificati gratuiti (Let's Encrypt) che si rinnovano da soli; per e-commerce e aziende esistono certificati più avanzati. Nel nostro <a href="/servizi/hosting/">hosting</a> l'SSL è incluso e configurato correttamente, con reindirizzamento automatico a HTTPS.</p>""",
  faqs=[
   ("SSL e HTTPS sono la stessa cosa?", "Sono collegati ma non identici. SSL (oggi TLS) è il certificato che cifra la connessione; HTTPS è il protocollo del sito che usa quel certificato. In pratica, senza SSL non c'è HTTPS."),
   ("Un certificato SSL è gratuito?", "Può esserlo. Let's Encrypt offre certificati gratuiti e automatici, adatti alla maggior parte dei siti. I certificati a pagamento aggiungono garanzie e validazione dell'identità aziendale."),
   ("Cosa succede se il sito non ha SSL?", "Il browser mostra un avviso \"Non sicuro\", gli utenti si fidano meno e Google può penalizzare il posizionamento. Per un e-commerce è un problema serio che riduce le vendite."),
  ]),
 en=dict(q="an SSL certificate", q_link="SSL", card="The certificate that encrypts data between browser and site (the HTTPS padlock).",
  desc="What is an SSL certificate? Meaning, how it works, why HTTPS matters and how to get one, explained simply.",
  answer="An SSL certificate (Secure Sockets Layer) is a file that encrypts the connection between the user's browser and the website, so the data exchanged cannot be read by third parties. It is what enables HTTPS and the padlock in the address bar.",
  body="""<h2>How SSL works</h2>
<p>When you visit a site over HTTPS, the SSL certificate starts an encrypted connection: information (passwords, card details, forms) travels in a form unreadable to anyone who intercepts it. Technically today the TLS protocol is used, an evolution of SSL, but the name \"SSL\" has stuck in common use. The certificate is tied to your <a href="/en/glossary/dominio/">domain</a> and verified through the <a href="/en/glossary/dns/">DNS</a>.</p>
<h2>Why SSL is essential</h2>
<ul>
<li><strong>Security:</strong> it protects users' sensitive data.</li>
<li><strong>Trust:</strong> the padlock reassures visitors; a "Not secure" site drives them away.</li>
<li><strong>SEO:</strong> Google favours HTTPS sites in search results.</li>
</ul>
<h2>How to get an SSL certificate</h2>
<p>Many providers offer free certificates (Let's Encrypt) that renew themselves; for e-commerce and companies there are more advanced certificates. In our <a href="/en/services/hosting/">hosting</a> SSL is included and correctly configured, with automatic redirection to HTTPS.</p>""",
  faqs=[
   ("Are SSL and HTTPS the same thing?", "They are related but not identical. SSL (now TLS) is the certificate that encrypts the connection; HTTPS is the site protocol that uses that certificate. In practice, without SSL there is no HTTPS."),
   ("Is an SSL certificate free?", "It can be. Let's Encrypt offers free, automatic certificates suitable for most sites. Paid certificates add warranties and validation of the company's identity."),
   ("What happens if a site has no SSL?", "The browser shows a 'Not secure' warning, users trust it less and Google may penalise its ranking. For an e-commerce it is a serious problem that reduces sales."),
  ]),
 bg=dict(q="SSL сертификат", q_link="SSL", card="Сертификатът, който криптира данните между браузър и сайт (катинарът HTTPS).",
  desc="Какво е SSL сертификат? Значение, как работи, защо е важен HTTPS и как да го получите, обяснено просто.",
  answer="SSL сертификат (Secure Sockets Layer) е файл, който криптира връзката между браузъра на потребителя и уебсайта, така че обменяните данни да не могат да бъдат прочетени от трети страни. Той е това, което активира HTTPS и катинарчето в адресната лента.",
  body="""<h2>Как работи SSL</h2>
<p>Когато посещавате сайт през HTTPS, SSL сертификатът стартира криптирана връзка: информацията (пароли, данни на картата, форми) пътува в нечетим за прихващащия вид. Технически днес се използва протоколът TLS, еволюция на SSL, но името \"SSL\" е останало в масовата употреба. Сертификатът е свързан с вашия <a href="/bg/rechnik/dominio/">домейн</a> и се проверява чрез <a href="/bg/rechnik/dns/">DNS</a>.</p>
<h2>Защо SSL е задължителен</h2>
<ul>
<li><strong>Сигурност:</strong> защитава чувствителните данни на потребителите.</li>
<li><strong>Доверие:</strong> катинарчето успокоява посетителите; сайт \"Не е сигурен\" ги отблъсква.</li>
<li><strong>SEO:</strong> Google предпочита HTTPS сайтовете в резултатите от търсене.</li>
</ul>
<h2>Как да получите SSL сертификат</h2>
<p>Много доставчици предлагат безплатни сертификати (Let's Encrypt), които се подновяват сами; за онлайн магазини и фирми има по-разширени сертификати. В нашия <a href="/bg/uslugi/hosting/">хостинг</a> SSL е включен и правилно конфигуриран, с автоматично пренасочване към HTTPS.</p>""",
  faqs=[
   ("SSL и HTTPS едно и също ли са?", "Свързани са, но не са идентични. SSL (днес TLS) е сертификатът, който криптира връзката; HTTPS е протоколът на сайта, който използва този сертификат. На практика без SSL няма HTTPS."),
   ("Безплатен ли е SSL сертификатът?", "Може да бъде. Let's Encrypt предлага безплатни и автоматични сертификати, подходящи за повечето сайтове. Платените сертификати добавят гаранции и валидиране на фирмената идентичност."),
   ("Какво става, ако сайтът няма SSL?", "Браузърът показва предупреждение \"Не е сигурен\", потребителите му се доверяват по-малко и Google може да понижи позициите. За онлайн магазин това е сериозен проблем, който намалява продажбите."),
  ]),
)),

# ── dns ──────────────────────────────────────────────────────────
dict(slug="dns", name="DNS", related=["dominio", "hosting", "cdn"], lang=dict(
 it=dict(q="il DNS", q_link="DNS", card="La \"rubrica\" di internet che traduce i domini in indirizzi IP.",
  desc="Cos'è il DNS? Significato, come funziona la risoluzione dei nomi di dominio e a cosa serve, spiegato in modo semplice.",
  answer="Il DNS (Domain Name System) è il sistema che traduce i nomi di dominio leggibili (come carbonstealth.eu) negli indirizzi IP numerici dei server, permettendo al browser di trovare il sito giusto.",
  body="""<h2>Come funziona il DNS</h2>
<p>Il DNS è come la rubrica del telefono di internet: tu digiti un nome, lui trova il numero. Quando scrivi un indirizzo, il browser interroga i server DNS per sapere su quale server si trova quel <a href="/glossario/dominio/">dominio</a>, poi carica il sito. Tutto avviene in millisecondi. I record DNS (A, CNAME, MX, TXT) indicano dove puntano il sito, la posta e altri servizi.</p>
<h2>A cosa servono i record DNS</h2>
<ul>
<li><strong>Record A:</strong> collega il dominio all'IP del server di <a href="/servizi/hosting/">hosting</a>.</li>
<li><strong>Record MX:</strong> indirizza le email verso il server di posta.</li>
<li><strong>Record CNAME:</strong> crea alias, utile con un <a href="/glossario/cdn/">CDN</a> o sottodomini.</li>
</ul>
<h2>Perché il DNS è importante</h2>
<p>Una configurazione DNS corretta fa funzionare sito ed email e influisce sulla velocità di risoluzione. Le modifiche possono richiedere alcune ore per propagarsi in tutto il mondo. Nel nostro <a href="/servizi/hosting/">servizio di hosting</a> gestiamo il DNS per te, evitando errori che manderebbero offline il sito.</p>""",
  faqs=[
   ("Cosa significa DNS?", "DNS sta per Domain Name System. È il sistema che converte i nomi di dominio in indirizzi IP, così i computer possono trovarsi tra loro usando nomi facili da ricordare."),
   ("Quanto tempo serve per aggiornare il DNS?", "Una modifica DNS può propagarsi da pochi minuti fino a 24-48 ore, a seconda dei valori di TTL impostati e dei provider coinvolti."),
   ("Cosa succede se il DNS è configurato male?", "Il sito può risultare irraggiungibile o le email smettere di arrivare. Un errore nei record è una causa frequente di siti \"spariti\" dopo un cambio di hosting o dominio."),
  ]),
 en=dict(q="DNS", q_link="DNS", card="The \"phone book\" of the internet that turns domains into IP addresses.",
  desc="What is DNS? Meaning, how domain name resolution works and what it is for, explained simply.",
  answer="DNS (Domain Name System) is the system that translates readable domain names (like carbonstealth.eu) into the numeric IP addresses of servers, letting the browser find the right site.",
  body="""<h2>How DNS works</h2>
<p>DNS is like the internet's phone book: you type a name, it finds the number. When you enter an address, the browser queries DNS servers to learn which server hosts that <a href="/en/glossary/dominio/">domain</a>, then loads the site. It all happens in milliseconds. DNS records (A, CNAME, MX, TXT) tell where the site, mail and other services point.</p>
<h2>What DNS records are for</h2>
<ul>
<li><strong>A record:</strong> links the domain to the IP of the <a href="/en/services/hosting/">hosting</a> server.</li>
<li><strong>MX record:</strong> routes email to the mail server.</li>
<li><strong>CNAME record:</strong> creates aliases, useful with a <a href="/en/glossary/cdn/">CDN</a> or subdomains.</li>
</ul>
<h2>Why DNS matters</h2>
<p>A correct DNS setup keeps the site and email working and affects resolution speed. Changes can take a few hours to propagate worldwide. In our <a href="/en/services/hosting/">hosting service</a> we manage DNS for you, avoiding errors that would take the site offline.</p>""",
  faqs=[
   ("What does DNS mean?", "DNS stands for Domain Name System. It is the system that converts domain names into IP addresses, so computers can find each other using easy-to-remember names."),
   ("How long does a DNS update take?", "A DNS change can propagate from a few minutes up to 24-48 hours, depending on the TTL values set and the providers involved."),
   ("What happens if DNS is misconfigured?", "The site may become unreachable or email may stop arriving. A record error is a common cause of sites \"disappearing\" after a change of hosting or domain."),
  ]),
 bg=dict(q="DNS", q_link="DNS", card="\"Телефонният указател\" на интернет, който превръща домейни в IP адреси.",
  desc="Какво е DNS? Значение, как работи разрешаването на имена на домейни и за какво служи, обяснено просто.",
  answer="DNS (Domain Name System) е системата, която превежда четимите имена на домейни (като carbonstealth.eu) в числовите IP адреси на сървърите, позволявайки на браузъра да намери правилния сайт.",
  body="""<h2>Как работи DNS</h2>
<p>DNS е като телефонния указател на интернет: пишете име, той намира номера. Когато въведете адрес, браузърът пита DNS сървърите на кой сървър се намира този <a href="/bg/rechnik/dominio/">домейн</a>, след което зарежда сайта. Всичко става за милисекунди. DNS записите (A, CNAME, MX, TXT) посочват накъде сочат сайтът, пощата и други услуги.</p>
<h2>За какво служат DNS записите</h2>
<ul>
<li><strong>A запис:</strong> свързва домейна с IP на <a href="/bg/uslugi/hosting/">хостинг</a> сървъра.</li>
<li><strong>MX запис:</strong> насочва имейлите към пощенския сървър.</li>
<li><strong>CNAME запис:</strong> създава псевдоними, полезни с <a href="/bg/rechnik/cdn/">CDN</a> или поддомейни.</li>
</ul>
<h2>Защо DNS е важен</h2>
<p>Правилната DNS настройка поддържа сайта и имейла работещи и влияе на скоростта на разрешаване. Промените могат да отнемат няколко часа, за да се разпространят по света. В нашата <a href="/bg/uslugi/hosting/">услуга за хостинг</a> управляваме DNS вместо вас, избягвайки грешки, които биха свалили сайта офлайн.</p>""",
  faqs=[
   ("Какво означава DNS?", "DNS означава Domain Name System. Това е системата, която превръща имената на домейни в IP адреси, така че компютрите да се намират чрез лесни за запомняне имена."),
   ("Колко време отнема обновяване на DNS?", "DNS промяна може да се разпространи от няколко минути до 24-48 часа, в зависимост от зададените TTL стойности и участващите доставчици."),
   ("Какво става при грешна DNS настройка?", "Сайтът може да стане недостъпен или имейлите да спрат да пристигат. Грешка в записите е честа причина за \"изчезнали\" сайтове след смяна на хостинг или домейн."),
  ]),
)),

])  # end batch 3

TERMS.extend([

# ── hosting ──────────────────────────────────────────────────────
dict(slug="hosting", name="Hosting", related=["dns", "cdn", "database"], lang=dict(
 it=dict(q="l'hosting", q_link="Hosting", card="Lo spazio server dove vivono i file del tuo sito, sempre online.",
  desc="Cos'è l'hosting web? Significato, come funziona, tipi di hosting e come scegliere, spiegato in modo semplice.",
  answer="L'hosting è il servizio che mette a disposizione lo spazio su un server dove risiedono i file di un sito web, tenendolo raggiungibile online 24 ore su 24. Senza hosting il sito non esiste su internet.",
  body="""<h2>Come funziona l'hosting</h2>
<p>Il tuo sito è un insieme di file e di un <a href="/glossario/database/">database</a> che devono stare su un computer sempre acceso e connesso: il server. Quando qualcuno visita il tuo <a href="/glossario/dominio/">dominio</a>, il <a href="/glossario/dns/">DNS</a> indirizza al server e l'hosting consegna le pagine al browser. La qualità dell'hosting incide direttamente su velocità, sicurezza e affidabilità.</p>
<h2>Tipi di hosting</h2>
<ul>
<li><strong>Condiviso:</strong> più siti sullo stesso server, economico ma meno performante.</li>
<li><strong>VPS/Cloud:</strong> risorse dedicate e scalabili, ideale per siti professionali.</li>
<li><strong>Dedicato:</strong> un intero server per te, per progetti ad alto traffico.</li>
</ul>
<h2>Come scegliere l'hosting</h2>
<p>Conta la velocità (SSD, server vicini ai tuoi utenti), il tempo di attività garantito, i backup automatici, l'SSL incluso e un supporto reattivo. Un hosting lento penalizza SEO e conversioni. Il nostro <a href="/servizi/hosting/">hosting cloud</a> parte da &euro;29/mese con SSL, backup e <a href="/glossario/cdn/">CDN</a> inclusi.</p>""",
  faqs=[
   ("Qual è la differenza tra hosting e dominio?", "Il dominio è l'indirizzo del sito (il nome), l'hosting è lo spazio server dove il sito vive (la casa). Servono entrambi: uno per essere trovati, l'altro per esistere online."),
   ("Quanto costa un hosting?", "Un hosting condiviso parte da pochi euro al mese, un hosting cloud professionale da circa &euro;29/mese. Il prezzo dipende da risorse, prestazioni, backup e supporto inclusi."),
   ("Posso cambiare hosting in seguito?", "Sì. Un sito si può migrare da un hosting all'altro trasferendo file e database, con attenzione a DNS e tempi di propagazione per evitare interruzioni."),
  ]),
 en=dict(q="web hosting", q_link="Hosting", card="The server space where your site's files live, always online.",
  desc="What is web hosting? Meaning, how it works, types of hosting and how to choose, explained simply.",
  answer="Hosting is the service that provides space on a server where a website's files reside, keeping it reachable online 24/7. Without hosting, a site does not exist on the internet.",
  body="""<h2>How hosting works</h2>
<p>Your site is a set of files and a <a href="/en/glossary/database/">database</a> that must sit on a computer that is always on and connected: the server. When someone visits your <a href="/en/glossary/dominio/">domain</a>, the <a href="/en/glossary/dns/">DNS</a> points to the server and hosting delivers the pages to the browser. Hosting quality directly affects speed, security and reliability.</p>
<h2>Types of hosting</h2>
<ul>
<li><strong>Shared:</strong> several sites on the same server, cheap but slower.</li>
<li><strong>VPS/Cloud:</strong> dedicated, scalable resources, ideal for professional sites.</li>
<li><strong>Dedicated:</strong> a whole server for you, for high-traffic projects.</li>
</ul>
<h2>How to choose hosting</h2>
<p>What counts is speed (SSD, servers near your users), guaranteed uptime, automatic backups, included SSL and responsive support. Slow hosting hurts SEO and conversions. Our <a href="/en/services/hosting/">cloud hosting</a> starts at &euro;29/month with SSL, backups and a <a href="/en/glossary/cdn/">CDN</a> included.</p>""",
  faqs=[
   ("What is the difference between hosting and a domain?", "The domain is the site's address (the name), hosting is the server space where the site lives (the house). You need both: one to be found, the other to exist online."),
   ("How much does hosting cost?", "Shared hosting starts at a few euros a month, professional cloud hosting from around &euro;29/month. The price depends on the resources, performance, backups and support included."),
   ("Can I change hosting later?", "Yes. A site can be migrated from one host to another by transferring files and the database, with care for DNS and propagation times to avoid downtime."),
  ]),
 bg=dict(q="хостинг", q_link="Хостинг", card="Сървърното пространство, където живеят файловете на сайта, винаги онлайн.",
  desc="Какво е уеб хостинг? Значение, как работи, видове хостинг и как да изберете, обяснено просто.",
  answer="Хостингът е услугата, която предоставя пространство на сървър, където се намират файловете на уебсайт, поддържайки го достъпен онлайн 24 часа в денонощието. Без хостинг сайтът не съществува в интернет.",
  body="""<h2>Как работи хостингът</h2>
<p>Сайтът ви е съвкупност от файлове и <a href="/bg/rechnik/database/">база данни</a>, които трябва да са на компютър, който винаги е включен и свързан: сървъра. Когато някой посети вашия <a href="/bg/rechnik/dominio/">домейн</a>, <a href="/bg/rechnik/dns/">DNS</a> насочва към сървъра и хостингът доставя страниците до браузъра. Качеството на хостинга влияе пряко върху скоростта, сигурността и надеждността.</p>
<h2>Видове хостинг</h2>
<ul>
<li><strong>Споделен:</strong> няколко сайта на един сървър, евтин, но по-бавен.</li>
<li><strong>VPS/Облачен:</strong> отделни, мащабируеми ресурси, идеален за професионални сайтове.</li>
<li><strong>Отделен:</strong> цял сървър за вас, за проекти с висок трафик.</li>
</ul>
<h2>Как да изберете хостинг</h2>
<p>Важни са скоростта (SSD, сървъри близо до потребителите ви), гарантираното време на работа, автоматичните резервни копия, включеният SSL и отзивчивата поддръжка. Бавният хостинг вреди на SEO и конверсиите. Нашият <a href="/bg/uslugi/hosting/">облачен хостинг</a> започва от &euro;29/месец с включени SSL, резервни копия и <a href="/bg/rechnik/cdn/">CDN</a>.</p>""",
  faqs=[
   ("Каква е разликата между хостинг и домейн?", "Домейнът е адресът на сайта (името), хостингът е сървърното пространство, където живее сайтът (къщата). Нужни са и двете: едното за да ви намерят, другото за да съществувате онлайн."),
   ("Колко струва хостингът?", "Споделеният хостинг започва от няколко евро на месец, професионалният облачен хостинг от около &euro;29/месец. Цената зависи от включените ресурси, производителност, резервни копия и поддръжка."),
   ("Мога ли да сменя хостинга по-късно?", "Да. Сайтът може да се мигрира от един хостинг към друг чрез прехвърляне на файлове и база данни, с внимание към DNS и времето за разпространение, за да се избегне прекъсване."),
  ]),
)),

# ── dominio ──────────────────────────────────────────────────────
dict(slug="dominio", name="Domain", related=["dns", "ssl", "hosting"], lang=dict(
 it=dict(q="un dominio", q_link="Dominio", card="Il nome-indirizzo del tuo sito, come carbonstealth.eu.",
  desc="Cos'è un dominio? Significato, come funziona, differenza con l'hosting e come sceglierlo, spiegato in modo semplice.",
  answer="Un dominio è il nome-indirizzo di un sito web, come carbonstealth.eu, che gli utenti digitano nel browser per raggiungerlo. È l'equivalente dell'indirizzo di casa, ma su internet.",
  body="""<h2>Come funziona un dominio</h2>
<p>Un dominio è composto da un nome (carbonstealth) e da un'estensione, o TLD (.eu, .com, .it). Quando qualcuno lo digita, il <a href="/glossario/dns/">DNS</a> traduce il nome nell'indirizzo IP del server di <a href="/glossario/hosting/">hosting</a> e carica il sito. Il dominio si registra presso un registrar e va rinnovato ogni anno per mantenerne la proprietà.</p>
<h2>Come scegliere un buon dominio</h2>
<ul>
<li><strong>Breve e memorabile:</strong> facile da dire e da scrivere.</li>
<li><strong>Estensione giusta:</strong> .it o .eu per il mercato locale, .com per l'internazionale.</li>
<li><strong>Senza trattini e numeri:</strong> riduce errori e confusione.</li>
</ul>
<h2>Dominio, hosting e sicurezza</h2>
<p>Il dominio è separato dall'<a href="/glossario/hosting/">hosting</a>: puoi tenerli dallo stesso fornitore o da due diversi. Su ogni dominio va attivato un certificato <a href="/glossario/ssl/">SSL</a> per l'HTTPS. Nel nostro <a href="/servizi/sviluppo-siti-web/">servizio di sviluppo siti web</a> ci occupiamo di registrazione, DNS e SSL, così parti senza pensieri tecnici.</p>""",
  faqs=[
   ("Quanto costa un dominio?", "Un dominio costa in media &euro;10-15 all'anno, a seconda dell'estensione. Alcuni TLD particolari o nomi molto richiesti possono costare di più."),
   ("Il dominio è mio per sempre?", "No: il dominio si \"affitta\" con un rinnovo annuale. Finché lo rinnovi resta tuo; se scade, dopo un periodo di grazia torna disponibile per altri."),
   ("Posso spostare un dominio su un altro hosting?", "Sì. Il dominio è indipendente dall'hosting: basta aggiornare i record DNS per farlo puntare a un nuovo server, senza cambiare nome."),
  ]),
 en=dict(q="a domain", q_link="Domain", card="Your site's name-address, like carbonstealth.eu.",
  desc="What is a domain? Meaning, how it works, the difference from hosting and how to choose one, explained simply.",
  answer="A domain is the name-address of a website, like carbonstealth.eu, that users type into the browser to reach it. It is the equivalent of a home address, but on the internet.",
  body="""<h2>How a domain works</h2>
<p>A domain is made of a name (carbonstealth) and an extension, or TLD (.eu, .com, .it). When someone types it, the <a href="/en/glossary/dns/">DNS</a> translates the name into the IP address of the <a href="/en/glossary/hosting/">hosting</a> server and loads the site. A domain is registered with a registrar and must be renewed each year to keep ownership.</p>
<h2>How to choose a good domain</h2>
<ul>
<li><strong>Short and memorable:</strong> easy to say and to spell.</li>
<li><strong>Right extension:</strong> .it or .eu for a local market, .com for international.</li>
<li><strong>No hyphens or numbers:</strong> fewer errors and confusion.</li>
</ul>
<h2>Domain, hosting and security</h2>
<p>The domain is separate from <a href="/en/glossary/hosting/">hosting</a>: you can keep them with the same provider or two different ones. Every domain needs an <a href="/en/glossary/ssl/">SSL</a> certificate for HTTPS. In our <a href="/en/services/web-development/">web development service</a> we handle registration, DNS and SSL, so you start with no technical worries.</p>""",
  faqs=[
   ("How much does a domain cost?", "A domain costs on average &euro;10-15 per year, depending on the extension. Some special TLDs or highly sought-after names can cost more."),
   ("Is the domain mine forever?", "No: a domain is \"rented\" with an annual renewal. As long as you renew it, it stays yours; if it expires, after a grace period it becomes available to others."),
   ("Can I move a domain to another host?", "Yes. The domain is independent of hosting: you just update the DNS records to point it to a new server, without changing the name."),
  ]),
 bg=dict(q="домейн", q_link="Домейн", card="Името-адрес на сайта ви, като carbonstealth.eu.",
  desc="Какво е домейн? Значение, как работи, разликата с хостинга и как да го изберете, обяснено просто.",
  answer="Домейнът е името-адрес на уебсайт, като carbonstealth.eu, което потребителите въвеждат в браузъра, за да го достигнат. Той е еквивалентът на домашен адрес, но в интернет.",
  body="""<h2>Как работи домейнът</h2>
<p>Домейнът се състои от име (carbonstealth) и разширение, или TLD (.eu, .com, .bg). Когато някой го въведе, <a href="/bg/rechnik/dns/">DNS</a> превежда името в IP адреса на <a href="/bg/rechnik/hosting/">хостинг</a> сървъра и зарежда сайта. Домейнът се регистрира при регистратор и трябва да се подновява всяка година, за да запазите собствеността.</p>
<h2>Как да изберете добър домейн</h2>
<ul>
<li><strong>Кратък и запомнящ се:</strong> лесен за казване и изписване.</li>
<li><strong>Подходящо разширение:</strong> .bg или .eu за местния пазар, .com за международния.</li>
<li><strong>Без тирета и цифри:</strong> по-малко грешки и объркване.</li>
</ul>
<h2>Домейн, хостинг и сигурност</h2>
<p>Домейнът е отделен от <a href="/bg/rechnik/hosting/">хостинга</a>: можете да ги държите при един доставчик или при двама различни. За всеки домейн трябва да се активира <a href="/bg/rechnik/ssl/">SSL</a> сертификат за HTTPS. В нашата <a href="/bg/uslugi/web-razrabotka/">услуга за изработка на сайтове</a> се грижим за регистрацията, DNS и SSL, така че да стартирате без технически грижи.</p>""",
  faqs=[
   ("Колко струва домейн?", "Домейнът струва средно &euro;10-15 на година, в зависимост от разширението. Някои специални TLD или много търсени имена могат да струват повече."),
   ("Домейнът мой ли е завинаги?", "Не: домейнът се \"наема\" с годишно подновяване. Докато го подновявате, остава ваш; ако изтече, след гратисен период става достъпен за други."),
   ("Мога ли да преместя домейн на друг хостинг?", "Да. Домейнът е независим от хостинга: просто обновявате DNS записите, за да сочи към нов сървър, без да сменяте името."),
  ]),
)),

])  # end batch 4

TERMS.extend([

# ── database ─────────────────────────────────────────────────────
dict(slug="database", name="Database", related=["backend-frontend", "api", "hosting"], lang=dict(
 it=dict(q="un database", q_link="Database", card="L'archivio strutturato dove il sito conserva e organizza i dati.",
  desc="Cos'è un database? Significato, come funziona, tipi SQL e NoSQL e a cosa serve, spiegato in modo semplice.",
  answer="Un database è un archivio strutturato in cui un'applicazione conserva e organizza i dati — utenti, prodotti, ordini — in modo da poterli cercare, aggiornare e collegare in modo rapido e affidabile.",
  body="""<h2>Come funziona un database</h2>
<p>Un database organizza i dati in tabelle (o documenti) collegate tra loro. Quando registri un ordine su un e-commerce, il dato finisce nel database; quando cerchi un prodotto, il sito lo interroga e mostra i risultati. Il <a href="/glossario/backend-frontend/">back-end</a> comunica col database, spesso esponendo i dati al front-end tramite <a href="/glossario/api/">API</a>.</p>
<h2>SQL o NoSQL</h2>
<ul>
<li><strong>SQL (relazionali):</strong> MySQL, PostgreSQL. Dati in tabelle con relazioni precise, ideali per gestionali ed e-commerce.</li>
<li><strong>NoSQL:</strong> MongoDB, Redis. Struttura flessibile, adatta a grandi volumi e dati non uniformi.</li>
</ul>
<h2>Perché il database è importante</h2>
<p>Un database ben progettato rende il sito veloce, coerente e sicuro; uno mal strutturato genera lentezza ed errori. È il cuore di ogni gestionale o <a href="/servizi/erp/">ERP</a> e va ospitato su un <a href="/glossario/hosting/">hosting</a> affidabile con backup regolari. Nel nostro <a href="/servizi/sviluppo-siti-web/">sviluppo su misura</a> progettiamo la struttura dati adatta al tuo progetto.</p>""",
  faqs=[
   ("Qual è la differenza tra database SQL e NoSQL?", "I database SQL organizzano i dati in tabelle con relazioni rigide e sono ideali per dati strutturati; i NoSQL usano strutture flessibili adatte a grandi volumi e dati variabili. La scelta dipende dal tipo di progetto."),
   ("Un sito semplice ha bisogno di un database?", "Non sempre. Un sito statico può funzionare senza database, ma appena servono contenuti dinamici, utenti, un blog o un carrello, il database diventa necessario."),
   ("I dati nel database sono al sicuro?", "Lo sono se il database è protetto con accessi controllati, cifratura e backup regolari. La sicurezza dipende dalla configurazione e dalla manutenzione, non dal database in sé."),
  ]),
 en=dict(q="a database", q_link="Database", card="The structured store where a site keeps and organises its data.",
  desc="What is a database? Meaning, how it works, SQL vs NoSQL types and what it is for, explained simply.",
  answer="A database is a structured store where an application keeps and organises data — users, products, orders — so it can be searched, updated and linked quickly and reliably.",
  body="""<h2>How a database works</h2>
<p>A database organises data into tables (or documents) linked to each other. When you place an order on an e-commerce, the data goes into the database; when you search for a product, the site queries it and shows the results. The <a href="/en/glossary/backend-frontend/">back-end</a> talks to the database, often exposing the data to the front-end through <a href="/en/glossary/api/">APIs</a>.</p>
<h2>SQL vs NoSQL</h2>
<ul>
<li><strong>SQL (relational):</strong> MySQL, PostgreSQL. Data in tables with precise relationships, ideal for management systems and e-commerce.</li>
<li><strong>NoSQL:</strong> MongoDB, Redis. Flexible structure, suited to large volumes and non-uniform data.</li>
</ul>
<h2>Why the database matters</h2>
<p>A well-designed database makes a site fast, consistent and secure; a poorly structured one causes slowness and errors. It is the heart of every management system or <a href="/en/services/erp/">ERP</a> and must be hosted on reliable <a href="/en/glossary/hosting/">hosting</a> with regular backups. In our <a href="/en/services/web-development/">custom development</a> we design the data structure that fits your project.</p>""",
  faqs=[
   ("What is the difference between SQL and NoSQL databases?", "SQL databases organise data in tables with rigid relationships and suit structured data; NoSQL uses flexible structures for large volumes and variable data. The choice depends on the type of project."),
   ("Does a simple site need a database?", "Not always. A static site can run without a database, but as soon as you need dynamic content, users, a blog or a cart, a database becomes necessary."),
   ("Is the data in a database safe?", "It is if the database is protected with controlled access, encryption and regular backups. Security depends on configuration and maintenance, not on the database itself."),
  ]),
 bg=dict(q="база данни", q_link="База данни", card="Структурираното хранилище, където сайтът пази и организира данните.",
  desc="Какво е база данни? Значение, как работи, типове SQL и NoSQL и за какво служи, обяснено просто.",
  answer="Базата данни е структурирано хранилище, в което приложение пази и организира данни — потребители, продукти, поръчки — така че да могат да се търсят, обновяват и свързват бързо и надеждно.",
  body="""<h2>Как работи базата данни</h2>
<p>Базата данни организира данните в таблици (или документи), свързани помежду си. Когато направите поръчка в онлайн магазин, данните отиват в базата; когато търсите продукт, сайтът я запитва и показва резултатите. <a href="/bg/rechnik/backend-frontend/">Back-end</a> частта общува с базата, често предоставяйки данните на front-end чрез <a href="/bg/rechnik/api/">API</a>.</p>
<h2>SQL или NoSQL</h2>
<ul>
<li><strong>SQL (релационни):</strong> MySQL, PostgreSQL. Данни в таблици с точни връзки, идеални за складови системи и онлайн магазини.</li>
<li><strong>NoSQL:</strong> MongoDB, Redis. Гъвкава структура, подходяща за големи обеми и нееднородни данни.</li>
</ul>
<h2>Защо базата данни е важна</h2>
<p>Добре проектираната база прави сайта бърз, съгласуван и сигурен; лошо структурираната води до бавност и грешки. Тя е сърцето на всяка складова система или <a href="/bg/uslugi/erp/">ERP</a> и трябва да е на надежден <a href="/bg/rechnik/hosting/">хостинг</a> с редовни резервни копия. В нашата <a href="/bg/uslugi/web-razrabotka/">разработка по поръчка</a> проектираме структурата на данните, подходяща за вашия проект.</p>""",
  faqs=[
   ("Каква е разликата между SQL и NoSQL база данни?", "SQL базите организират данните в таблици с твърди връзки и подхождат за структурирани данни; NoSQL използва гъвкави структури за големи обеми и променливи данни. Изборът зависи от типа проект."),
   ("Има ли прост сайт нужда от база данни?", "Не винаги. Статичен сайт може да работи без база данни, но щом са нужни динамично съдържание, потребители, блог или количка, базата става необходима."),
   ("Данните в базата в безопасност ли са?", "Да, ако базата е защитена с контролиран достъп, криптиране и редовни резервни копия. Сигурността зависи от конфигурацията и поддръжката, а не от самата база."),
  ]),
)),

# ── framework ────────────────────────────────────────────────────
dict(slug="framework", name="Framework", related=["backend-frontend", "cms", "api"], lang=dict(
 it=dict(q="un framework", q_link="Framework", card="Una struttura di base già pronta su cui costruire software più in fretta.",
  desc="Cos'è un framework nello sviluppo web? Significato, a cosa serve, esempi e differenza con una libreria, spiegato in modo semplice.",
  answer="Un framework è una struttura di base già pronta, con strumenti e regole comuni, su cui gli sviluppatori costruiscono un'applicazione più in fretta e con meno errori, senza ripartire da zero ogni volta.",
  body="""<h2>A cosa serve un framework</h2>
<p>Un framework fornisce le fondamenta già collaudate — gestione delle pagine, sicurezza, connessione al <a href="/glossario/database/">database</a>, chiamate alle <a href="/glossario/api/">API</a> — così lo sviluppatore si concentra sulle funzioni specifiche del progetto. È come costruire una casa partendo da fondamenta e muri portanti già pronti, invece che dalla sabbia.</p>
<h2>Esempi di framework</h2>
<ul>
<li><strong>Front-end:</strong> React, Vue, Angular per l'interfaccia.</li>
<li><strong>Back-end:</strong> Laravel, Django, Node/Express per la logica lato server.</li>
<li><strong>CSS:</strong> Tailwind, Bootstrap per lo stile.</li>
</ul>
<h2>Framework, libreria e CMS</h2>
<p>Una libreria è un singolo strumento che richiami quando serve; un framework detta l'intera struttura del progetto. Un <a href="/glossario/cms/">CMS</a> è invece un prodotto finito per gestire contenuti. La scelta del framework giusto incide su velocità, sicurezza e manutenibilità: nel nostro <a href="/servizi/sviluppo-siti-web/">sviluppo siti web</a> usiamo lo stack più adatto a ogni progetto.</p>""",
  faqs=[
   ("Qual è la differenza tra framework e libreria?", "Una libreria è uno strumento che usi dentro il tuo codice quando serve; un framework definisce la struttura entro cui scrivi tutto il codice. In breve: tu chiami la libreria, il framework chiama te."),
   ("Serve un framework per ogni sito?", "No. Un sito semplice può usare un CMS o poco codice. I framework diventano utili per applicazioni con logica complessa, molte funzioni o forte crescita prevista."),
   ("Quale framework è il migliore?", "Non esiste un migliore assoluto: dipende dal progetto, dal team e dagli obiettivi. React è diffuso per le interfacce, Laravel e Django per il back-end. Conta la scelta adatta al caso."),
  ]),
 en=dict(q="a framework", q_link="Framework", card="A ready-made foundation for building software faster.",
  desc="What is a framework in web development? Meaning, what it is for, examples and the difference from a library, explained simply.",
  answer="A framework is a ready-made foundation, with common tools and rules, on which developers build an application faster and with fewer mistakes, without starting from scratch every time.",
  body="""<h2>What a framework is for</h2>
<p>A framework provides tried-and-tested foundations — page handling, security, <a href="/en/glossary/database/">database</a> connection, <a href="/en/glossary/api/">API</a> calls — so the developer can focus on the project's specific features. It is like building a house from ready-made foundations and load-bearing walls, instead of from sand.</p>
<h2>Examples of frameworks</h2>
<ul>
<li><strong>Front-end:</strong> React, Vue, Angular for the interface.</li>
<li><strong>Back-end:</strong> Laravel, Django, Node/Express for server-side logic.</li>
<li><strong>CSS:</strong> Tailwind, Bootstrap for styling.</li>
</ul>
<h2>Framework, library and CMS</h2>
<p>A library is a single tool you call when needed; a framework dictates the whole structure of the project. A <a href="/en/glossary/cms/">CMS</a>, instead, is a finished product for managing content. Choosing the right framework affects speed, security and maintainability: in our <a href="/en/services/web-development/">web development</a> we use the stack best suited to each project.</p>""",
  faqs=[
   ("What is the difference between a framework and a library?", "A library is a tool you use inside your code when needed; a framework defines the structure within which you write all your code. In short: you call the library, the framework calls you."),
   ("Does every site need a framework?", "No. A simple site can use a CMS or a little code. Frameworks become useful for applications with complex logic, many features or strong expected growth."),
   ("Which framework is the best?", "There is no absolute best: it depends on the project, the team and the goals. React is popular for interfaces, Laravel and Django for the back-end. What matters is the right fit for the case."),
  ]),
 bg=dict(q="framework", q_link="Framework", card="Готова основа, върху която софтуерът се изгражда по-бързо.",
  desc="Какво е framework в уеб разработката? Значение, за какво служи, примери и разликата с библиотека, обяснено просто.",
  answer="Framework е готова основа с общи инструменти и правила, върху която разработчиците изграждат приложение по-бързо и с по-малко грешки, без да започват от нулата всеки път.",
  body="""<h2>За какво служи framework</h2>
<p>Framework предоставя доказани основи — управление на страници, сигурност, връзка с <a href="/bg/rechnik/database/">базата данни</a>, извиквания към <a href="/bg/rechnik/api/">API</a> — така че разработчикът да се концентрира върху специфичните функции на проекта. Все едно да строите къща от готови основи и носещи стени, вместо от пясъка.</p>
<h2>Примери за framework</h2>
<ul>
<li><strong>Front-end:</strong> React, Vue, Angular за интерфейса.</li>
<li><strong>Back-end:</strong> Laravel, Django, Node/Express за логиката от страна на сървъра.</li>
<li><strong>CSS:</strong> Tailwind, Bootstrap за стила.</li>
</ul>
<h2>Framework, библиотека и CMS</h2>
<p>Библиотеката е отделен инструмент, който извиквате при нужда; framework диктува цялата структура на проекта. <a href="/bg/rechnik/cms/">CMS</a> пък е завършен продукт за управление на съдържание. Изборът на правилния framework влияе на скоростта, сигурността и поддръжката: в нашата <a href="/bg/uslugi/web-razrabotka/">изработка на сайтове</a> използваме най-подходящия стек за всеки проект.</p>""",
  faqs=[
   ("Каква е разликата между framework и библиотека?", "Библиотеката е инструмент, който ползвате в кода си при нужда; framework определя структурата, в която пишете целия код. Накратко: вие извиквате библиотеката, framework извиква вас."),
   ("Всеки сайт ли се нуждае от framework?", "Не. Прост сайт може да ползва CMS или малко код. Framework-ите стават полезни за приложения със сложна логика, много функции или силно очаквано развитие."),
   ("Кой framework е най-добър?", "Няма абсолютно най-добър: зависи от проекта, екипа и целите. React е популярен за интерфейси, Laravel и Django за back-end. Важно е подходящото за случая."),
  ]),
)),

])  # end batch 5

TERMS.extend([

# ── cache ────────────────────────────────────────────────────────
dict(slug="cache", name="Cache", related=["cdn", "pwa", "hosting"], lang=dict(
 it=dict(q="la cache", q_link="Cache", card="La memoria temporanea che rende il sito più veloce al secondo accesso.",
  desc="Cos'è la cache? Significato, come funziona, tipi di cache e perché velocizza i siti, spiegato in modo semplice.",
  answer="La cache è una memoria temporanea che conserva copie di dati o pagine già elaborati, così al successivo accesso vengono serviti all'istante invece di essere ricalcolati o riscaricati da capo.",
  body="""<h2>Come funziona la cache</h2>
<p>La prima volta che visiti una pagina, il server la genera e il browser scarica immagini, stili e script. La cache salva questi elementi: alla visita successiva vengono ripresi dalla memoria, la pagina appare molto più in fretta e il server lavora meno. È lo stesso principio che permette a una <a href="/glossario/pwa/">PWA</a> di funzionare offline.</p>
<h2>Tipi di cache</h2>
<ul>
<li><strong>Cache del browser:</strong> salva le risorse sul dispositivo dell'utente.</li>
<li><strong>Cache del server:</strong> conserva le pagine già generate lato hosting.</li>
<li><strong>Cache del <a href="/glossario/cdn/">CDN</a>:</strong> distribuisce i contenuti da server vicini all'utente.</li>
</ul>
<h2>Cache e prestazioni</h2>
<p>Una buona strategia di cache riduce i tempi di caricamento, migliora i Core Web Vitals e alleggerisce l'<a href="/glossario/hosting/">hosting</a>. Va però gestita bene: se non si aggiorna al momento giusto, gli utenti rischiano di vedere contenuti vecchi. Nel nostro <a href="/servizi/hosting/">hosting</a> configuriamo la cache per unire velocità e contenuti sempre aggiornati.</p>""",
  faqs=[
   ("Cosa significa svuotare la cache?", "Significa cancellare le copie temporanee salvate, così browser o server ricaricano la versione più recente. È utile quando hai aggiornato il sito ma continui a vedere la versione vecchia."),
   ("La cache rallenta o velocizza il sito?", "Lo velocizza. Servendo contenuti già pronti dalla memoria, riduce i tempi di caricamento e il carico sul server. Può creare problemi solo se non viene aggiornata correttamente."),
   ("Perché a volte non vedo le modifiche al sito?", "Spesso è colpa della cache: il browser o il server ti mostrano una copia salvata. Svuotando la cache o forzando il ricaricamento vedrai la versione aggiornata."),
  ]),
 en=dict(q="cache", q_link="Cache", card="The temporary memory that makes a site faster on the second visit.",
  desc="What is cache? Meaning, how it works, types of cache and why it speeds up sites, explained simply.",
  answer="Cache is a temporary memory that stores copies of already-processed data or pages, so on the next visit they are served instantly instead of being recalculated or re-downloaded from scratch.",
  body="""<h2>How cache works</h2>
<p>The first time you visit a page, the server generates it and the browser downloads images, styles and scripts. The cache saves these elements: on the next visit they are taken from memory, the page appears much faster and the server does less work. It is the same principle that lets a <a href="/en/glossary/pwa/">PWA</a> work offline.</p>
<h2>Types of cache</h2>
<ul>
<li><strong>Browser cache:</strong> stores resources on the user's device.</li>
<li><strong>Server cache:</strong> keeps already-generated pages on the hosting side.</li>
<li><strong><a href="/en/glossary/cdn/">CDN</a> cache:</strong> serves content from servers near the user.</li>
</ul>
<h2>Cache and performance</h2>
<p>A good cache strategy cuts load times, improves Core Web Vitals and lightens the <a href="/en/glossary/hosting/">hosting</a> load. It must be managed well, though: if it does not refresh at the right time, users may see old content. In our <a href="/en/services/hosting/">hosting</a> we configure cache to combine speed with always-fresh content.</p>""",
  faqs=[
   ("What does clearing the cache mean?", "It means deleting the saved temporary copies, so the browser or server reloads the most recent version. It is useful when you have updated a site but keep seeing the old version."),
   ("Does cache slow down or speed up a site?", "It speeds it up. By serving ready-made content from memory, it reduces load times and server load. It can only cause problems if it is not refreshed correctly."),
   ("Why do I sometimes not see changes to a site?", "It is often the cache: the browser or server shows you a saved copy. Clearing the cache or forcing a reload will show the updated version."),
  ]),
 bg=dict(q="кеш", q_link="Кеш", card="Временната памет, която прави сайта по-бърз при второто посещение.",
  desc="Какво е кеш? Значение, как работи, видове кеш и защо ускорява сайтовете, обяснено просто.",
  answer="Кешът е временна памет, която пази копия на вече обработени данни или страници, така че при следващото посещение да се показват мигновено, вместо да се пресмятат или изтеглят отново от нулата.",
  body="""<h2>Как работи кешът</h2>
<p>Първия път, когато посетите страница, сървърът я генерира и браузърът изтегля изображения, стилове и скриптове. Кешът запазва тези елементи: при следващото посещение те се вземат от паметта, страницата се появява много по-бързо и сървърът работи по-малко. Това е същият принцип, който позволява на <a href="/bg/rechnik/pwa/">PWA</a> да работи офлайн.</p>
<h2>Видове кеш</h2>
<ul>
<li><strong>Кеш на браузъра:</strong> пази ресурсите на устройството на потребителя.</li>
<li><strong>Кеш на сървъра:</strong> пази вече генерираните страници откъм хостинга.</li>
<li><strong>Кеш на <a href="/bg/rechnik/cdn/">CDN</a>:</strong> доставя съдържанието от сървъри близо до потребителя.</li>
</ul>
<h2>Кеш и производителност</h2>
<p>Добрата стратегия за кеширане намалява времето за зареждане, подобрява Core Web Vitals и облекчава <a href="/bg/rechnik/hosting/">хостинга</a>. Трябва обаче да се управлява добре: ако не се обновява навреме, потребителите може да виждат старо съдържание. В нашия <a href="/bg/uslugi/hosting/">хостинг</a> настройваме кеша, за да съчетаем скорост с винаги актуално съдържание.</p>""",
  faqs=[
   ("Какво означава изчистване на кеша?", "Означава изтриване на запазените временни копия, така че браузърът или сървърът да зареди най-новата версия. Полезно е, когато сте обновили сайта, но продължавате да виждате старата версия."),
   ("Кешът забавя ли или ускорява сайта?", "Ускорява го. Като доставя готово съдържание от паметта, намалява времето за зареждане и натоварването на сървъра. Може да създаде проблеми само ако не се обновява правилно."),
   ("Защо понякога не виждам промените по сайта?", "Често причината е кешът: браузърът или сървърът ви показва запазено копие. Изчистването на кеша или принудителното презареждане ще покаже обновената версия."),
  ]),
)),

# ── ux-ui-design ─────────────────────────────────────────────────
dict(slug="ux-ui-design", name="UX/UI Design", related=["responsive-design", "backend-frontend", "pwa"], lang=dict(
 it=dict(q="l'UX/UI design", q_link="UX/UI Design", card="La progettazione di come un sito appare (UI) e di come si usa (UX).",
  desc="Cos'è l'UX/UI design? Significato, differenza tra UX e UI e perché conta per un sito, spiegato in modo semplice.",
  answer="L'UX/UI design è la progettazione dell'esperienza d'uso (UX, come ci si sente a usare un prodotto) e dell'interfaccia (UI, come appare): insieme rendono un sito o un'app facile, piacevole ed efficace.",
  body="""<h2>UX e UI: due facce dello stesso lavoro</h2>
<p>La <strong>UX (User Experience)</strong> riguarda la logica: struttura, percorsi, chiarezza dei passaggi, facilità nel completare un'azione. La <strong>UI (User Interface)</strong> riguarda l'aspetto: colori, tipografia, pulsanti, spaziature. Un sito bello ma confuso ha una buona UI e una cattiva UX; uno funzionale ma sgradevole il contrario. Servono entrambe.</p>
<h2>Perché conta per il tuo sito</h2>
<ul>
<li><strong>Conversioni:</strong> un percorso chiaro trasforma più visitatori in clienti.</li>
<li><strong>Fiducia:</strong> un'interfaccia curata comunica professionalità.</li>
<li><strong>Accessibilità:</strong> un buon design è usabile da tutti, su ogni dispositivo grazie al <a href="/glossario/responsive-design/">responsive design</a>.</li>
</ul>
<h2>Dal design alla realizzazione</h2>
<p>Il design si traduce poi in codice sul <a href="/glossario/backend-frontend/">front-end</a>. Un buon UX/UI riduce le frustrazioni, abbassa la frequenza di rimbalzo e migliora anche la SEO. Nel nostro <a href="/servizi/ecommerce/">e-commerce</a> e nei siti su misura curiamo il design a partire dagli obiettivi di business, non solo dall'estetica.</p>""",
  faqs=[
   ("Qual è la differenza tra UX e UI?", "La UX è l'esperienza complessiva di utilizzo — quanto è facile e soddisfacente usare il prodotto; la UI è l'interfaccia visiva — colori, tipografia, pulsanti. La UX definisce come funziona, la UI come appare."),
   ("Perché il design UX/UI è importante?", "Perché determina se i visitatori capiscono, si fidano e completano un'azione. Un buon UX/UI aumenta conversioni e vendite; uno scadente allontana gli utenti anche con un ottimo prodotto."),
   ("Un bel sito basta a vendere?", "No. L'estetica attira, ma è l'esperienza d'uso a convertire. Un sito deve essere insieme gradevole (UI) e semplice da usare (UX) per portare risultati concreti."),
  ]),
 en=dict(q="UX/UI design", q_link="UX/UI Design", card="Designing how a site looks (UI) and how it feels to use (UX).",
  desc="What is UX/UI design? Meaning, the difference between UX and UI and why it matters for a site, explained simply.",
  answer="UX/UI design is the design of the user experience (UX, how it feels to use a product) and the interface (UI, how it looks): together they make a site or app easy, pleasant and effective.",
  body="""<h2>UX and UI: two sides of the same work</h2>
<p><strong>UX (User Experience)</strong> is about logic: structure, journeys, clarity of steps, ease of completing an action. <strong>UI (User Interface)</strong> is about appearance: colours, typography, buttons, spacing. A beautiful but confusing site has good UI and bad UX; a functional but ugly one is the opposite. You need both.</p>
<h2>Why it matters for your site</h2>
<ul>
<li><strong>Conversions:</strong> a clear journey turns more visitors into customers.</li>
<li><strong>Trust:</strong> a polished interface signals professionalism.</li>
<li><strong>Accessibility:</strong> good design is usable by everyone, on every device thanks to <a href="/en/glossary/responsive-design/">responsive design</a>.</li>
</ul>
<h2>From design to build</h2>
<p>The design is then turned into code on the <a href="/en/glossary/backend-frontend/">front-end</a>. Good UX/UI reduces frustration, lowers bounce rate and even improves SEO. In our <a href="/en/services/ecommerce/">e-commerce</a> and custom sites we craft design from business goals, not just aesthetics.</p>""",
  faqs=[
   ("What is the difference between UX and UI?", "UX is the overall experience of use — how easy and satisfying the product is to use; UI is the visual interface — colours, typography, buttons. UX defines how it works, UI how it looks."),
   ("Why is UX/UI design important?", "Because it decides whether visitors understand, trust and complete an action. Good UX/UI raises conversions and sales; poor UX/UI drives users away even with a great product."),
   ("Is a beautiful site enough to sell?", "No. Aesthetics attract, but the experience of use converts. A site must be both pleasant (UI) and easy to use (UX) to deliver concrete results."),
  ]),
 bg=dict(q="UX/UI дизайн", q_link="UX/UI Дизайн", card="Проектиране на това как сайтът изглежда (UI) и как се усеща (UX).",
  desc="Какво е UX/UI дизайн? Значение, разликата между UX и UI и защо е важен за сайта, обяснено просто.",
  answer="UX/UI дизайнът е проектирането на потребителското изживяване (UX, как се усеща използването на продукт) и на интерфейса (UI, как изглежда): заедно правят сайт или приложение лесно, приятно и ефективно.",
  body="""<h2>UX и UI: две страни на една работа</h2>
<p><strong>UX (User Experience)</strong> се отнася до логиката: структура, пътища, яснота на стъпките, лекота при извършване на действие. <strong>UI (User Interface)</strong> се отнася до външния вид: цветове, типография, бутони, отстъпи. Красив, но объркан сайт има добър UI и лош UX; функционален, но неприятен — обратното. Нужни са и двете.</p>
<h2>Защо е важен за сайта ви</h2>
<ul>
<li><strong>Конверсии:</strong> ясният път превръща повече посетители в клиенти.</li>
<li><strong>Доверие:</strong> изпипаният интерфейс говори за професионализъм.</li>
<li><strong>Достъпност:</strong> добрият дизайн е използваем от всички, на всяко устройство благодарение на <a href="/bg/rechnik/responsive-design/">responsive дизайна</a>.</li>
</ul>
<h2>От дизайн към изработка</h2>
<p>Дизайнът след това се превръща в код на <a href="/bg/rechnik/backend-frontend/">front-end</a>. Добрият UX/UI намалява неудовлетвореността, понижава степента на отпадане и подобрява дори SEO. В нашите <a href="/bg/uslugi/ecommerce/">онлайн магазини</a> и сайтове по поръчка изграждаме дизайна от бизнес целите, а не само от естетиката.</p>""",
  faqs=[
   ("Каква е разликата между UX и UI?", "UX е цялостното изживяване при използване — колко лесно и удовлетворяващо е да ползвате продукта; UI е визуалният интерфейс — цветове, типография, бутони. UX определя как работи, UI как изглежда."),
   ("Защо UX/UI дизайнът е важен?", "Защото решава дали посетителите разбират, доверяват се и завършват действие. Добрият UX/UI повишава конверсиите и продажбите; лошият отблъсква потребителите дори с отличен продукт."),
   ("Достатъчен ли е красив сайт, за да продава?", "Не. Естетиката привлича, но изживяването при използване конвертира. Сайтът трябва да е едновременно приятен (UI) и лесен за ползване (UX), за да носи конкретни резултати."),
  ]),
)),

])  # end batch 6

TERMS.extend([

# ── responsive-design ────────────────────────────────────────────
dict(slug="responsive-design", name="Responsive Design", related=["ux-ui-design", "pwa", "cms"], lang=dict(
 it=dict(q="il responsive design", q_link="Responsive Design", card="La tecnica per cui un sito si adatta a schermi di ogni dimensione.",
  desc="Cos'è il responsive design? Significato, come funziona e perché è indispensabile per sito ed e-commerce, spiegato in modo semplice.",
  answer="Il responsive design è la tecnica che fa adattare automaticamente un sito web a qualsiasi dimensione di schermo — smartphone, tablet, desktop — mantenendo layout, testi e immagini sempre leggibili e usabili.",
  body="""<h2>Come funziona il responsive design</h2>
<p>Con il responsive, il layout non è fisso: griglie flessibili e regole CSS (le media query) riorganizzano i contenuti in base allo schermo. Su desktop vedi più colonne, su smartphone un'unica colonna con menu compatto. Un solo sito serve tutti i dispositivi, senza versioni separate. È la base di un buon <a href="/glossario/ux-ui-design/">UX/UI design</a>.</p>
<h2>Perché è indispensabile</h2>
<ul>
<li><strong>Traffico mobile:</strong> gran parte delle visite arriva da smartphone.</li>
<li><strong>SEO:</strong> Google usa l'indicizzazione mobile-first e premia i siti responsive.</li>
<li><strong>Conversioni:</strong> un sito leggibile su mobile vende di più.</li>
</ul>
<h2>Responsive e prestazioni</h2>
<p>Il responsive va oltre l'aspetto: un sito ben fatto carica in fretta anche su rete mobile e può diventare una <a href="/glossario/pwa/">PWA</a>. Che il sito sia costruito su misura o con un <a href="/glossario/cms/">CMS</a>, il responsive è oggi uno standard, non un extra. Nel nostro <a href="/servizi/sviluppo-siti-web/">sviluppo siti web</a> ogni progetto è responsive di serie.</p>""",
  faqs=[
   ("Cosa significa sito responsive?", "Significa che il sito si adatta automaticamente allo schermo di chi lo visita, restando leggibile e usabile su smartphone, tablet e computer, senza bisogno di versioni separate."),
   ("Il responsive design è ancora necessario?", "Sì, più che mai: la maggior parte del traffico è da mobile e Google indicizza prima la versione mobile. Un sito non responsive perde visitatori e posizionamento."),
   ("Responsive design e sito mobile sono la stessa cosa?", "Non esattamente. Il responsive è un unico sito che si adatta a ogni schermo; un \"sito mobile\" separato è una versione a parte con un altro indirizzo, oggi una soluzione superata."),
  ]),
 en=dict(q="responsive design", q_link="Responsive Design", card="The technique that makes a site adapt to any screen size.",
  desc="What is responsive design? Meaning, how it works and why it is essential for sites and e-commerce, explained simply.",
  answer="Responsive design is the technique that makes a website automatically adapt to any screen size — smartphone, tablet, desktop — keeping layout, text and images readable and usable at all times.",
  body="""<h2>How responsive design works</h2>
<p>With responsive design, the layout is not fixed: flexible grids and CSS rules (media queries) reorganise content based on the screen. On desktop you see several columns, on a smartphone a single column with a compact menu. One site serves all devices, with no separate versions. It is the foundation of good <a href="/en/glossary/ux-ui-design/">UX/UI design</a>.</p>
<h2>Why it is essential</h2>
<ul>
<li><strong>Mobile traffic:</strong> most visits come from smartphones.</li>
<li><strong>SEO:</strong> Google uses mobile-first indexing and rewards responsive sites.</li>
<li><strong>Conversions:</strong> a site that reads well on mobile sells more.</li>
</ul>
<h2>Responsive and performance</h2>
<p>Responsive goes beyond looks: a well-built site loads fast even on a mobile network and can become a <a href="/en/glossary/pwa/">PWA</a>. Whether the site is custom-built or made with a <a href="/en/glossary/cms/">CMS</a>, responsive is now a standard, not an extra. In our <a href="/en/services/web-development/">web development</a> every project is responsive by default.</p>""",
  faqs=[
   ("What does a responsive site mean?", "It means the site automatically adapts to the screen of whoever visits it, staying readable and usable on smartphones, tablets and computers, with no need for separate versions."),
   ("Is responsive design still necessary?", "Yes, more than ever: most traffic is mobile and Google indexes the mobile version first. A non-responsive site loses visitors and rankings."),
   ("Are responsive design and a mobile site the same thing?", "Not quite. Responsive is a single site that adapts to every screen; a separate \"mobile site\" is a distinct version with a different address, an approach now outdated."),
  ]),
 bg=dict(q="responsive дизайн", q_link="Responsive Дизайн", card="Техниката, при която сайтът се адаптира към всеки размер екран.",
  desc="Какво е responsive дизайн? Значение, как работи и защо е задължителен за сайт и онлайн магазин, обяснено просто.",
  answer="Responsive дизайнът е техниката, която кара уебсайта автоматично да се адаптира към всеки размер екран — смартфон, таблет, десктоп — запазвайки оформлението, текстовете и изображенията четими и използваеми.",
  body="""<h2>Как работи responsive дизайнът</h2>
<p>При responsive оформлението не е фиксирано: гъвкави мрежи и CSS правила (media queries) пренареждат съдържанието според екрана. На десктоп виждате няколко колони, на смартфон една колона с компактно меню. Един сайт обслужва всички устройства, без отделни версии. Това е основата на добрия <a href="/bg/rechnik/ux-ui-design/">UX/UI дизайн</a>.</p>
<h2>Защо е задължителен</h2>
<ul>
<li><strong>Мобилен трафик:</strong> голяма част от посещенията идват от смартфони.</li>
<li><strong>SEO:</strong> Google използва mobile-first индексиране и награждава responsive сайтовете.</li>
<li><strong>Конверсии:</strong> сайт, който се чете добре на мобилно устройство, продава повече.</li>
</ul>
<h2>Responsive и производителност</h2>
<p>Responsive е повече от външен вид: добре изграден сайт се зарежда бързо дори по мобилна мрежа и може да стане <a href="/bg/rechnik/pwa/">PWA</a>. Независимо дали сайтът е по поръчка или с <a href="/bg/rechnik/cms/">CMS</a>, responsive днес е стандарт, а не екстра. В нашата <a href="/bg/uslugi/web-razrabotka/">изработка на сайтове</a> всеки проект е responsive по подразбиране.</p>""",
  faqs=[
   ("Какво означава responsive сайт?", "Означава, че сайтът автоматично се адаптира към екрана на посетителя, оставайки четим и използваем на смартфони, таблети и компютри, без нужда от отделни версии."),
   ("Още ли е нужен responsive дизайн?", "Да, повече от всякога: по-голямата част от трафика е мобилен и Google индексира първо мобилната версия. Сайт без responsive губи посетители и позиции."),
   ("Responsive дизайн и мобилен сайт едно и също ли са?", "Не съвсем. Responsive е един сайт, който се адаптира към всеки екран; отделен \"мобилен сайт\" е самостоятелна версия с друг адрес — вече остарял подход."),
  ]),
)),

# ── cdn ──────────────────────────────────────────────────────────
dict(slug="cdn", name="CDN", related=["cache", "dns", "hosting"], lang=dict(
 it=dict(q="una CDN", q_link="CDN", card="Una rete di server che serve i contenuti da vicino, più veloce.",
  desc="Cos'è una CDN (Content Delivery Network)? Significato, come funziona e perché velocizza i siti, spiegato in modo semplice.",
  answer="Una CDN (Content Delivery Network) è una rete di server distribuiti nel mondo che conservano copie dei contenuti di un sito e li servono dal punto più vicino all'utente, riducendo i tempi di caricamento.",
  body="""<h2>Come funziona una CDN</h2>
<p>Senza CDN, ogni utente scarica il sito dal server d'origine, ovunque esso sia: chi è lontano attende di più. Con una CDN, immagini, stili e script sono copiati (in <a href="/glossario/cache/">cache</a>) su server sparsi geograficamente; l'utente riceve i dati dal nodo più vicino. Il <a href="/glossario/dns/">DNS</a> instrada la richiesta al server ottimale.</p>
<h2>Vantaggi di una CDN</h2>
<ul>
<li><strong>Velocità:</strong> caricamenti più rapidi ovunque si trovi l'utente.</li>
<li><strong>Affidabilità:</strong> se un nodo cade, un altro risponde.</li>
<li><strong>Sicurezza:</strong> molte CDN filtrano attacchi DDoS e traffico malevolo.</li>
</ul>
<h2>Quando serve una CDN</h2>
<p>Una CDN è utile per siti con pubblico internazionale, molte immagini o traffico elevato, e alleggerisce l'<a href="/glossario/hosting/">hosting</a> d'origine. Per un piccolo sito locale l'impatto è minore ma comunque positivo su velocità e sicurezza. Nel nostro <a href="/servizi/hosting/">hosting</a> la CDN è inclusa e già configurata.</p>""",
  faqs=[
   ("A cosa serve una CDN?", "Serve a consegnare i contenuti di un sito dal server più vicino all'utente, rendendo il caricamento più veloce, il sito più affidabile e più protetto da picchi di traffico e attacchi."),
   ("CDN e hosting sono la stessa cosa?", "No. L'hosting è dove risiede il sito originale; la CDN è una rete che ne distribuisce copie in cache nel mondo per velocizzare l'accesso. Lavorano insieme."),
   ("Una CDN migliora la SEO?", "Indirettamente sì: velocizzando il sito migliora i Core Web Vitals e l'esperienza utente, due fattori che Google considera nel posizionamento."),
  ]),
 en=dict(q="a CDN", q_link="CDN", card="A network of servers that delivers content from nearby, faster.",
  desc="What is a CDN (Content Delivery Network)? Meaning, how it works and why it speeds up sites, explained simply.",
  answer="A CDN (Content Delivery Network) is a network of servers spread around the world that store copies of a site's content and serve them from the point closest to the user, reducing load times.",
  body="""<h2>How a CDN works</h2>
<p>Without a CDN, every user downloads the site from the origin server, wherever it is: those far away wait longer. With a CDN, images, styles and scripts are copied (into <a href="/en/glossary/cache/">cache</a>) on geographically spread servers; the user receives data from the nearest node. The <a href="/en/glossary/dns/">DNS</a> routes the request to the optimal server.</p>
<h2>Benefits of a CDN</h2>
<ul>
<li><strong>Speed:</strong> faster loads wherever the user is.</li>
<li><strong>Reliability:</strong> if one node goes down, another responds.</li>
<li><strong>Security:</strong> many CDNs filter DDoS attacks and malicious traffic.</li>
</ul>
<h2>When you need a CDN</h2>
<p>A CDN is useful for sites with an international audience, many images or high traffic, and it lightens the origin <a href="/en/glossary/hosting/">hosting</a>. For a small local site the impact is smaller but still positive on speed and security. In our <a href="/en/services/hosting/">hosting</a> the CDN is included and pre-configured.</p>""",
  faqs=[
   ("What is a CDN for?", "It delivers a site's content from the server nearest the user, making loading faster, the site more reliable and better protected against traffic spikes and attacks."),
   ("Are a CDN and hosting the same thing?", "No. Hosting is where the original site lives; a CDN is a network that distributes cached copies of it around the world to speed up access. They work together."),
   ("Does a CDN improve SEO?", "Indirectly yes: by speeding up the site it improves Core Web Vitals and user experience, two factors Google considers in ranking."),
  ]),
 bg=dict(q="CDN", q_link="CDN", card="Мрежа от сървъри, която доставя съдържание отблизо, по-бързо.",
  desc="Какво е CDN (мрежа за доставка на съдържание)? Значение, как работи и защо ускорява сайтовете, обяснено просто.",
  answer="CDN (Content Delivery Network, мрежа за доставка на съдържание) е мрежа от сървъри по света, които пазят копия на съдържанието на сайт и го доставят от най-близката до потребителя точка, намалявайки времето за зареждане.",
  body="""<h2>Как работи CDN</h2>
<p>Без CDN всеки потребител тегли сайта от сървъра-източник, където и да е той: по-отдалечените чакат повече. С CDN изображенията, стиловете и скриптовете се копират (в <a href="/bg/rechnik/cache/">кеш</a>) на географски разпръснати сървъри; потребителят получава данните от най-близкия възел. <a href="/bg/rechnik/dns/">DNS</a> насочва заявката към оптималния сървър.</p>
<h2>Предимства на CDN</h2>
<ul>
<li><strong>Скорост:</strong> по-бързо зареждане, където и да е потребителят.</li>
<li><strong>Надеждност:</strong> ако един възел падне, друг отговаря.</li>
<li><strong>Сигурност:</strong> много CDN филтрират DDoS атаки и зловреден трафик.</li>
</ul>
<h2>Кога е нужен CDN</h2>
<p>CDN е полезен за сайтове с международна аудитория, много изображения или висок трафик и облекчава <a href="/bg/rechnik/hosting/">хостинга</a>-източник. За малък локален сайт ефектът е по-малък, но пак положителен за скорост и сигурност. В нашия <a href="/bg/uslugi/hosting/">хостинг</a> CDN е включен и вече конфигуриран.</p>""",
  faqs=[
   ("За какво служи CDN?", "Доставя съдържанието на сайт от най-близкия до потребителя сървър, правейки зареждането по-бързо, сайта по-надежден и по-защитен от пикове на трафик и атаки."),
   ("CDN и хостинг едно и също ли са?", "Не. Хостингът е там, където живее оригиналният сайт; CDN е мрежа, която разпространява кеширани копия по света, за да ускори достъпа. Работят заедно."),
   ("CDN подобрява ли SEO?", "Косвено да: ускорявайки сайта, подобрява Core Web Vitals и потребителското изживяване — два фактора, които Google отчита при класирането."),
  ]),
)),

# ── backend-frontend ─────────────────────────────────────────────
dict(slug="backend-frontend", name="Back-end & Front-end", related=["api", "database", "framework"], lang=dict(
 it=dict(q="back-end e front-end", q_link="Back-end e Front-end", card="Le due parti di un sito: ciò che vedi e ciò che lavora dietro.",
  desc="Cosa sono back-end e front-end? Significato, differenza e come lavorano insieme in un sito web, spiegato in modo semplice.",
  answer="Il front-end è la parte di un sito che l'utente vede e con cui interagisce (pagine, pulsanti, moduli); il back-end è la parte nascosta che gira sul server, elabora i dati e fa funzionare tutto dietro le quinte.",
  body="""<h2>Front-end: ciò che vedi</h2>
<p>Il front-end è tutto ciò che appare nel browser: testi, immagini, menu, animazioni. È costruito con HTML, CSS e JavaScript, spesso tramite un <a href="/glossario/framework/">framework</a> come React o Vue, e deve essere <a href="/glossario/responsive-design/">responsive</a> e curato nell'<a href="/glossario/ux-ui-design/">UX/UI</a>.</p>
<h2>Back-end: ciò che lavora dietro</h2>
<p>Il back-end vive sul server: gestisce la logica, l'autenticazione degli utenti, i pagamenti e la comunicazione con il <a href="/glossario/database/">database</a>. Quando invii un modulo o completi un ordine, è il back-end a elaborarlo e a salvare i dati.</p>
<h2>Come dialogano</h2>
<p>Front-end e back-end comunicano tramite <a href="/glossario/api/">API</a>: il front-end chiede dati, il back-end risponde. Chi padroneggia entrambi è uno sviluppatore \"full-stack\". Un progetto solido richiede cura su tutti e due i livelli: nel nostro <a href="/servizi/sviluppo-siti-web/">sviluppo siti web</a> lavoriamo full-stack, dal design all'infrastruttura.</p>""",
  faqs=[
   ("Qual è la differenza tra front-end e back-end?", "Il front-end è la parte visibile con cui l'utente interagisce nel browser; il back-end è la parte nascosta sul server che elabora dati e logica. Il primo riguarda l'aspetto e l'interazione, il secondo il funzionamento."),
   ("Cosa fa uno sviluppatore full-stack?", "Uno sviluppatore full-stack si occupa sia del front-end sia del back-end: costruisce l'interfaccia e la logica lato server, gestendo l'intero flusso di un'applicazione."),
   ("Front-end e back-end usano gli stessi linguaggi?", "Non sempre. Il front-end usa HTML, CSS e JavaScript; il back-end può usare PHP, Python, Node.js, Java e altri. JavaScript però può operare su entrambi i lati."),
  ]),
 en=dict(q="back-end and front-end", q_link="Back-end & Front-end", card="A site's two parts: what you see and what works behind it.",
  desc="What are back-end and front-end? Meaning, the difference and how they work together in a website, explained simply.",
  answer="The front-end is the part of a site the user sees and interacts with (pages, buttons, forms); the back-end is the hidden part running on the server that processes data and makes everything work behind the scenes.",
  body="""<h2>Front-end: what you see</h2>
<p>The front-end is everything that appears in the browser: text, images, menus, animations. It is built with HTML, CSS and JavaScript, often through a <a href="/en/glossary/framework/">framework</a> like React or Vue, and must be <a href="/en/glossary/responsive-design/">responsive</a> and well crafted in its <a href="/en/glossary/ux-ui-design/">UX/UI</a>.</p>
<h2>Back-end: what works behind</h2>
<p>The back-end lives on the server: it handles logic, user authentication, payments and communication with the <a href="/en/glossary/database/">database</a>. When you submit a form or complete an order, it is the back-end that processes it and saves the data.</p>
<h2>How they talk</h2>
<p>Front-end and back-end communicate through <a href="/en/glossary/api/">APIs</a>: the front-end asks for data, the back-end responds. Someone who masters both is a "full-stack" developer. A solid project needs care on both layers: in our <a href="/en/services/web-development/">web development</a> we work full-stack, from design to infrastructure.</p>""",
  faqs=[
   ("What is the difference between front-end and back-end?", "The front-end is the visible part the user interacts with in the browser; the back-end is the hidden part on the server that processes data and logic. The first is about appearance and interaction, the second about how it works."),
   ("What does a full-stack developer do?", "A full-stack developer handles both the front-end and the back-end: they build the interface and the server-side logic, managing an application's entire flow."),
   ("Do front-end and back-end use the same languages?", "Not always. The front-end uses HTML, CSS and JavaScript; the back-end can use PHP, Python, Node.js, Java and others. JavaScript, however, can run on both sides."),
  ]),
 bg=dict(q="back-end и front-end", q_link="Back-end и Front-end", card="Двете части на сайта: това, което виждате, и това, което работи отзад.",
  desc="Какво са back-end и front-end? Значение, разлика и как работят заедно в уебсайт, обяснено просто.",
  answer="Front-end е частта от сайта, която потребителят вижда и с която взаимодейства (страници, бутони, форми); back-end е скритата част, която работи на сървъра, обработва данните и кара всичко да функционира зад кулисите.",
  body="""<h2>Front-end: това, което виждате</h2>
<p>Front-end е всичко, което се появява в браузъра: текстове, изображения, менюта, анимации. Изгражда се с HTML, CSS и JavaScript, често чрез <a href="/bg/rechnik/framework/">framework</a> като React или Vue, и трябва да е <a href="/bg/rechnik/responsive-design/">responsive</a> и изпипан в <a href="/bg/rechnik/ux-ui-design/">UX/UI</a>.</p>
<h2>Back-end: това, което работи отзад</h2>
<p>Back-end живее на сървъра: управлява логиката, автентикацията на потребителите, плащанията и връзката с <a href="/bg/rechnik/database/">базата данни</a>. Когато изпратите форма или завършите поръчка, именно back-end я обработва и запазва данните.</p>
<h2>Как общуват</h2>
<p>Front-end и back-end общуват чрез <a href="/bg/rechnik/api/">API</a>: front-end иска данни, back-end отговаря. Този, който владее и двете, е \"full-stack\" разработчик. Солидният проект изисква грижа и на двата слоя: в нашата <a href="/bg/uslugi/web-razrabotka/">изработка на сайтове</a> работим full-stack, от дизайна до инфраструктурата.</p>""",
  faqs=[
   ("Каква е разликата между front-end и back-end?", "Front-end е видимата част, с която потребителят взаимодейства в браузъра; back-end е скритата част на сървъра, която обработва данни и логика. Първото е за външния вид и взаимодействието, второто за функционирането."),
   ("Какво прави full-stack разработчик?", "Full-stack разработчикът се занимава и с front-end, и с back-end: изгражда интерфейса и логиката от страна на сървъра, управлявайки целия поток на приложение."),
   ("Front-end и back-end едни и същи езици ли ползват?", "Не винаги. Front-end ползва HTML, CSS и JavaScript; back-end може да ползва PHP, Python, Node.js, Java и други. JavaScript обаче може да работи и от двете страни."),
  ]),
)),

])  # end batch 7

# Hub copy per language
HUB = {
 "it": dict(
   title="Glossario Web e Tecnologia: Termini Spiegati | Carbon Stealth",
   desc="Glossario chiaro di termini web e tecnologici: CMS, hosting, API, SSL, database e altro, spiegati in linguaggio semplice per imprenditori e professionisti.",
   h1="Glossario Web e Tecnologia",
   intro="Un glossario in linguaggio semplice dei termini web e tecnologici che incontri quando realizzi un sito, un e-commerce o un software. Ogni voce apre con una definizione breve e chiara, seguita da una spiegazione pratica. Serve a capire i preventivi, parlare con chi sviluppa e decidere con cognizione.",
   faqs=[
    ("Cos'è un glossario tecnico?", "È una raccolta di definizioni chiare dei termini più usati nel web e nella tecnologia, pensata per chi non è del settore. Ogni voce spiega in poche frasi cosa significa un termine e a cosa serve."),
    ("A cosa serve conoscere questi termini?", "Capire termini come CMS, hosting o API ti aiuta a dialogare con chi sviluppa il tuo sito, valutare i preventivi e prendere decisioni più consapevoli sul tuo progetto digitale."),
    ("Le definizioni sono solo per esperti?", "No. Sono scritte in linguaggio semplice proprio per imprenditori e professionisti che vogliono orientarsi senza un background tecnico."),
   ]),
 "en": dict(
   title="Web & Tech Glossary: Terms Explained | Carbon Stealth",
   desc="A clear glossary of web and technology terms: CMS, hosting, API, SSL, databases and more, explained in plain language for business owners and professionals.",
   h1="Web & Technology Glossary",
   intro="A plain-language glossary of the web and technology terms you meet when building a website, an online store or custom software. Every entry opens with a short, clear definition, followed by a practical explanation. It helps you read quotes, talk to developers and make informed decisions.",
   faqs=[
    ("What is a technical glossary?", "It is a collection of clear definitions of the terms most used in web and technology, written for people outside the field. Each entry explains in a few sentences what a term means and what it is for."),
    ("Why should I learn these terms?", "Understanding terms like CMS, hosting or API helps you talk to the people building your site, evaluate quotes and make more informed decisions about your digital project."),
    ("Are the definitions only for experts?", "No. They are written in plain language precisely for business owners and professionals who want to find their bearings without a technical background."),
   ]),
 "bg": dict(
   title="Речник по Уеб и Технологии: Обяснени Термини | Carbon Stealth",
   desc="Ясен речник на уеб и технологични термини: CMS, хостинг, API, SSL, база данни и други, обяснени на прост език за собственици на бизнес и специалисти.",
   h1="Речник по Уеб и Технологии",
   intro="Речник на прост език на уеб и технологичните термини, които срещате при изработка на сайт, онлайн магазин или софтуер. Всяка влизания започва с кратка и ясна дефиниция, следвана от практично обяснение. Помага да разчитате офертите, да говорите с разработчици и да вземате информирани решения.",
   faqs=[
    ("Какво е технически речник?", "Това е сборка от ясни дефиниции на най-често срещаните термини в уеба и технологиите, написана за хора извън бранша. Всяка влизания обяснява с няколко изречения какво означава даден термин и за какво служи."),
    ("Защо да зная тези термини?", "Разбирането на термини като CMS, хостинг или API ви помага да говорите с разработчиците на сайта си, да оценявате оферти и да вземате по-информирани решения за дигиталния си проект."),
    ("Само за експерти ли са дефинициите?", "Не. Те са написани на прост език именно за собственици на бизнес и специалисти, които искат да се ориентират без техническа подготовка."),
   ]),
}

# ── Rendering ────────────────────────────────────────────────────

def esc(s):
    return html.escape(s, quote=True)

def term_path(lang, slug):
    return f"{GLOS[lang]}{slug}/"

def head(lang, canon, alts, title, desc, og_type="article"):
    s = L[lang]
    og = f"{BASE}/{s['og']}"
    return f"""<!DOCTYPE html><html lang="{lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canon}">
{alts}
<meta property="og:type" content="{og_type}">
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

def alts_block(kind, slug=None):
    def p(l):
        return term_path(l, slug) if kind == "term" else GLOS[l]
    a = "".join(f'<link rel="alternate" hreflang="{l}" href="{BASE}{p(l)}"/>' for l in ("it", "en", "bg"))
    a += f'<link rel="alternate" hreflang="x-default" href="{BASE}{p("it")}"/>'
    return a

def faq_html(faqs):
    return "".join(
        f'<div class="faq-item"><div class="faq-q">{esc(q)}</div><div class="faq-a">{esc(a)}</div></div>'
        for q, a in faqs)

def term_jsonld(lang, term, title, h1, desc):
    s = L[lang]
    slug = term["slug"]
    canon = f"{BASE}{term_path(lang, slug)}"
    c = term["lang"][lang]
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "DefinedTerm", "@id": f"{canon}#term",
         "name": term["name"], "description": c["answer"],
         "inDefinedTermSet": {"@type": "DefinedTermSet", "name": s["glos_name"],
                              "url": f"{BASE}{GLOS[lang]}"},
         "url": canon, "inLanguage": lang},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE}{s['home']}"},
            {"@type": "ListItem", "position": 2, "name": s["glos_name"], "item": f"{BASE}{GLOS[lang]}"},
            {"@type": "ListItem", "position": 3, "name": h1, "item": canon}]},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in c["faqs"]]},
    ]}
    return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "</script>"

def related_block(lang, term):
    s = L[lang]
    rel = term.get("related", [])
    if not rel:
        return ""
    links = "".join(
        f'<a href="{term_path(lang, r)}">{esc(TERM_INDEX[r]["lang"][lang]["q_link"])}</a>'
        for r in rel if r in TERM_INDEX)
    return f'<p class="rel">{esc(s["rel_label"])} {links}</p>'

def render_term(lang, term):
    s = L[lang]
    c = term["lang"][lang]
    title = s["title"](c["q"])
    h1 = title.split("|")[0].strip()
    desc = c["desc"]
    canon = f"{BASE}{term_path(lang, term['slug'])}"
    return (
        head(lang, canon, alts_block("term", term["slug"]), title, desc)
        + term_jsonld(lang, term, title, h1, desc)
        + "\n</head><body>"
        + s["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["tag"]}</div><h1>{esc(h1)}</h1></div></div>'
        + '<div class="w">'
        + f'<p class="lead"><strong>{esc(c["answer"])}</strong></p>'
        + c["body"]
        + related_block(lang, term)
        + f'<h2>{s["faq_h2"]}</h2>{faq_html(c["faqs"])}'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a>'
        + '</div>'
        + s["ft"]
        + "</body></html>\n"
    )

def hub_jsonld(lang):
    s = L[lang]
    hub = HUB[lang]
    hub_url = f"{BASE}{GLOS[lang]}"
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "DefinedTermSet", "@id": f"{hub_url}#set",
         "name": hub["h1"], "description": hub["desc"], "url": hub_url, "inLanguage": lang,
         "hasDefinedTerm": [
            {"@type": "DefinedTerm", "name": t["name"],
             "description": t["lang"][lang]["answer"],
             "url": f"{BASE}{term_path(lang, t['slug'])}"} for t in TERMS]},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE}{s['home']}"},
            {"@type": "ListItem", "position": 2, "name": s["glos_name"], "item": hub_url}]},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in hub["faqs"]]},
    ]}
    return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "</script>"

def render_hub(lang):
    s = L[lang]
    hub = HUB[lang]
    canon = f"{BASE}{GLOS[lang]}"
    cards = "".join(
        f'<a class="card" href="{term_path(lang, t["slug"])}"><h3>{esc(t["lang"][lang]["q_link"])}</h3>'
        f'<p>{esc(t["lang"][lang]["card"])}</p></a>'
        for t in TERMS)
    return (
        head(lang, canon, alts_block("hub"), hub["title"], hub["desc"], og_type="website")
        + hub_jsonld(lang)
        + "\n</head><body>"
        + s["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["tag"]}</div><h1>{esc(hub["h1"])}</h1></div></div>'
        + '<div class="w">'
        + f'<p class="lead">{esc(hub["intro"])}</p>'
        + f'<div class="grid">{cards}</div>'
        + f'<h2>{s["faq_h2"]}</h2>{faq_html(hub["faqs"])}'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a>'
        + '</div>'
        + s["ft"]
        + "</body></html>\n"
    )

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def sitemap():
    urls = []
    for lang in ("it", "en", "bg"):
        urls.append(GLOS[lang])
        for t in TERMS:
            urls.append(term_path(lang, t["slug"]))
    body = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        body.append(f'<url><loc>{BASE}{u}</loc><lastmod>{DATE}</lastmod>'
                    f'<changefreq>monthly</changefreq><priority>0.6</priority></url>')
    body.append('</urlset>\n')
    return "\n".join(body), len(urls)

def main():
    n = 0
    for lang in ("it", "en", "bg"):
        root = "public" + (GLOS[lang].rstrip("/"))  # e.g. public/glossario
        write(os.path.join(root, "index.html"), render_hub(lang))
        n += 1
        for t in TERMS:
            write(os.path.join(root, t["slug"], "index.html"), render_term(lang, t))
            n += 1
    xml, count = sitemap()
    write("public/sitemap-glossary.xml", xml)
    print(f"wrote {n} glossary pages ({len(TERMS)} terms + 1 hub x 3 langs)")
    print(f"wrote sitemap-glossary.xml with {count} urls")

if __name__ == "__main__":
    TERM_INDEX = {t["slug"]: t for t in TERMS}
    main()
