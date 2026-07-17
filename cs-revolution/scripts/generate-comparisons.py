#!/usr/bin/env python3
"""Generate the trilingual COMPARISONS ("X vs Y") section into public/.

Run from repo root: python3 scripts/generate-comparisons.py

Outputs a hub + 8 comparison pages in three languages, each written natively
(not translated word-for-word) with an answer-first verdict, a real comparison
table, honest h2 sections weighing each option, a FAQ (FAQPage schema for AEO),
internal links to service pages, cross-links to related comparisons and a CTA.
Self-contained static HTML, no build step. Also writes sitemap-comparisons.xml.

Only touches: scripts/generate-comparisons.py, public/confronti/**,
public/en/comparisons/**, public/bg/sravneniya/**, public/sitemap-comparisons.xml
"""
import os, html, json

BASE = "https://carbonstealth.eu"
DATE = "2026-07-17"
DATE_ISO = "2026-07-17T09:00:00+02:00"

# ── Shared chrome (identical to the blog generator) ──────────────
STYLE = ("*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#ccc;font-family:'Space Mono',monospace;font-size:13px;line-height:2;padding:0}a{color:#00e5ff;text-decoration:none}.w{max-width:900px;margin:0 auto;padding:40px 20px}h1{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2.5rem;color:#f5f5f0;margin-bottom:16px;letter-spacing:-.03em;line-height:1.1}h2{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.2rem;color:#00e5ff;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.05em}h3{color:#f5f5f0;font-size:1rem;margin:20px 0 8px}p,li{margin-bottom:10px;line-height:1.9}ul{padding-left:20px}.nav{position:fixed;top:0;width:100%;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,229,255,.1);padding:12px 20px;z-index:1000;display:flex;justify-content:space-between;align-items:center}.nav a{color:#ccc;font-size:10px;letter-spacing:.2em;margin:0 10px}.nav img{height:24px}.hero-s{padding:120px 20px 60px;border-bottom:1px solid rgba(0,229,255,.1)}.tag{font-size:9px;color:#00e5ff;letter-spacing:.4em;margin-bottom:12px}.cta{display:inline-block;padding:14px 32px;border:1px solid #00e5ff;color:#00e5ff;font-size:11px;letter-spacing:.25em;margin-top:24px}.ft{border-top:1px solid rgba(245,245,240,.06);padding:30px 20px;text-align:center;font-size:9px;color:#999;margin-top:60px}.price{display:inline-block;padding:4px 12px;border:1px solid rgba(0,229,255,.2);color:#00e5ff;font-size:11px;margin:8px 0}.tags{font-size:9px;color:#999;letter-spacing:.15em;margin-top:8px}.faq-item{border-bottom:1px solid rgba(245,245,240,.06);padding:16px 0}.faq-q{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1rem;color:#f5f5f0;margin-bottom:6px}.faq-a{font-size:12px;color:#ccc}.blog-date{font-size:10px;color:#999;letter-spacing:.15em}"
         ".ctbl{overflow-x:auto;margin:16px 0}table{border-collapse:collapse;width:100%;font-size:12px;min-width:520px}th,td{border:1px solid rgba(0,229,255,.15);padding:8px 10px;text-align:left;vertical-align:top}th{color:#00e5ff;font-family:'Inter Tight',sans-serif;font-weight:700}"
         ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin:24px 0}.card{border:1px solid rgba(0,229,255,.15);padding:20px;transition:border-color .2s}.card:hover{border-color:rgba(0,229,255,.4)}.card h3{color:#00e5ff;font-family:'Inter Tight',sans-serif;font-weight:700;margin:0 0 8px}.card p{font-size:12px;color:#ccc;margin:0}")

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">')

# ── Per-language chrome ──────────────────────────────────────────
L = {
 "it": dict(
   prefix="", og="og-image.png", locale="it_IT", hub="/confronti/",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/chi-siamo/">CHI SIAMO</a><a href="/servizi/sviluppo-siti-web/">SERVIZI</a><a href="/portfolio/">PORTFOLIO</a><a href="/contatti/">CONTATTI</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Tutti i diritti riservati &middot; <a href="/privacy/">Privacy</a> &middot; <a href="/cookie/">Cookie</a> &middot; <a href="/termini/">Terms</a></p></div>',
   home="/", contact="/contatti/", hub_name="Confronti", tag="// CONFRONTO",
   faq_h2="Domande frequenti", cta="RICHIEDI UN PREVENTIVO GRATUITO",
   related_h2="Confronti correlati", verdict_word="In breve"),
 "en": dict(
   prefix="/en", og="og-image-en.png", locale="en_US", hub="/en/comparisons/",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/en/about/">ABOUT</a><a href="/en/services/web-development/">SERVICES</a><a href="/en/portfolio/">PORTFOLIO</a><a href="/en/contact/">CONTACT</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>All rights reserved &middot; <a href="/en/privacy/">Privacy</a> &middot; <a href="/en/cookie/">Cookie</a> &middot; <a href="/en/terms/">Terms</a></p></div>',
   home="/en/", contact="/en/contact/", hub_name="Comparisons", tag="// COMPARISON",
   faq_h2="Frequently asked questions", cta="REQUEST A FREE QUOTE",
   related_h2="Related comparisons", verdict_word="In short"),
 "bg": dict(
   prefix="/bg", og="og-image-bg.png", locale="bg_BG", hub="/bg/sravneniya/",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">ГЛАВНА</a><a href="/bg/za-nas/">ЗА НАС</a><a href="/bg/uslugi/web-razrabotka/">УСЛУГИ</a><a href="/bg/portfolio/">ПОРТФОЛИО</a><a href="/bg/kontakti/">КОНТАКТИ</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Всички права запазени &middot; <a href="/bg/privacy/">Privacy</a> &middot; <a href="/bg/cookie/">Cookie</a> &middot; <a href="/bg/usloviya/">Terms</a></p></div>',
   home="/bg/", contact="/bg/kontakti/", hub_name="Сравнения", tag="// СРАВНЕНИЕ",
   faq_h2="Често задавани въпроси", cta="ЗАЯВИ БЕЗПЛАТНА ОФЕРТА",
   related_h2="Свързани сравнения", verdict_word="Накратко"),
}

# Short display names per comparison, used for hub cards and related links.
NAMES = {
 "wordpress-vs-headless":       dict(it="WordPress vs Headless CMS", en="WordPress vs Headless CMS", bg="WordPress срещу Headless CMS"),
 "shopify-vs-magento":          dict(it="Shopify vs Magento",        en="Shopify vs Magento",        bg="Shopify срещу Magento"),
 "react-vs-wordpress":          dict(it="React vs WordPress",        en="React vs WordPress",        bg="React срещу WordPress"),
 "sito-vetrina-vs-landing-page":dict(it="Sito vetrina vs Landing page", en="Brochure site vs Landing page", bg="Визитен сайт срещу Landing page"),
 "app-nativa-vs-flutter":       dict(it="App nativa vs Flutter",     en="Native app vs Flutter",     bg="Нативно приложение срещу Flutter"),
 "wordpress-vs-webflow":        dict(it="WordPress vs Webflow",      en="WordPress vs Webflow",      bg="WordPress срещу Webflow"),
 "saas-vs-software-su-misura":  dict(it="SaaS vs Software su misura", en="SaaS vs Custom software",  bg="SaaS срещу Софтуер по поръчка"),
 "hosting-condiviso-vs-vps":    dict(it="Hosting condiviso vs VPS",  en="Shared hosting vs VPS",     bg="Споделен хостинг срещу VPS"),
}

def related_block(lang, slugs):
    s = L[lang]
    items = "".join(
        f'<li><a href="{s["hub"]}{sl}/">{html.escape(NAMES[sl][lang])}</a></li>'
        for sl in slugs)
    return f'<h2>{s["related_h2"]}</h2><ul>{items}</ul>'

# ── Content ──────────────────────────────────────────────────────
# Each comparison: slug, section, related (slugs), and per-lang
# {title, desc, body, faqs}. body = inner HTML after the intro line,
# before the FAQ block (verdict, table, h2 sections, service links).

CMP = [

# 1 ─── wordpress-vs-headless ────────────────────────────────────
dict(slug="wordpress-vs-headless", section="Web Development",
     related=["react-vs-wordpress", "wordpress-vs-webflow"], lang=dict(
 it=dict(
  title="WordPress vs Headless: Quale CMS Scegliere nel 2026 | Carbon Stealth",
  desc="WordPress tradizionale o headless CMS? Confronto onesto su costi, prestazioni, SEO e manutenzione, e quando conviene davvero passare all'headless nel 2026.",
  body="""<p><strong>In breve:</strong> il <strong>WordPress tradizionale</strong> &egrave; la scelta giusta per la maggior parte dei siti aziendali, dei blog e dei portali di contenuti: si mette online in pochi giorni, costa poco e ha un ecosistema di plugin enorme. L'<strong>architettura headless</strong> conviene quando ti servono prestazioni al limite, un frontend moderno (React o Next.js) o quando devi pubblicare gli stessi contenuti su pi&ugrave; canali &mdash; sito, app, totem, dispositivi. Se non hai un motivo tecnico preciso, il WordPress classico ti fa risparmiare tempo e budget senza rinunciare a nulla di importante.</p>
<h2>Confronto diretto</h2>
<div class="ctbl"><table><thead><tr><th>Criterio</th><th>WordPress tradizionale</th><th>Headless CMS</th></tr></thead><tbody>
<tr><td>Costo iniziale</td><td>da &euro;800</td><td>da &euro;2.000</td></tr>
<tr><td>Tempi di lancio</td><td>Giorni / poche settimane</td><td>Settimane</td></tr>
<tr><td>Prestazioni</td><td>Buone con ottimizzazione</td><td>Eccellenti</td></tr>
<tr><td>Modifica contenuti</td><td>Editor visuale completo</td><td>Dipende dal frontend</td></tr>
<tr><td>Multicanale (web + app)</td><td>No</td><td>S&igrave;</td></tr>
<tr><td>Manutenzione</td><td>Aggiornamenti plugin/core</td><td>Frontend e backend separati</td></tr>
<tr><td>SEO</td><td>Plugin maturi, ottimo controllo</td><td>Ottimo ma richiede lavoro tecnico</td></tr>
</tbody></table></div>
<h2>Quando scegliere WordPress tradizionale</h2>
<p>WordPress &laquo;monolitico&raquo; unisce backend e frontend in un solo sistema: chi scrive vede subito l'anteprima, i temi danno una struttura pronta e migliaia di plugin coprono form, prenotazioni, multilingua e SEO senza scrivere codice. Per un sito vetrina, un blog aziendale o un portale editoriale con qualche centinaio di pagine &egrave; la soluzione pi&ugrave; efficiente in assoluto: costa meno, si lancia in fretta e chiunque in azienda pu&ograve; aggiornarlo.</p>
<p>Con un'ottimizzazione fatta bene &mdash; caching, immagini moderne, hosting solido &mdash; anche un WordPress classico raggiunge Core Web Vitals ottimi. Il limite arriva quando il sito diventa molto complesso o quando i plugin si accumulano: allora manutenzione e prestazioni iniziano a pesare.</p>
<h2>Quando scegliere headless</h2>
<p>Headless significa separare la gestione dei contenuti (il &laquo;body&raquo;, un CMS come WordPress in modalit&agrave; API, Strapi o Sanity) dalla parte visibile (la &laquo;head&raquo;, costruita in React/Next.js). Il vantaggio &egrave; doppio: prestazioni al top grazie a pagine statiche o server-rendered, e la possibilit&agrave; di riutilizzare gli stessi contenuti su sito, app mobile e altri canali. &Egrave; la scelta giusta per progetti ad alto traffico, e-commerce complessi o aziende che vogliono un frontend su misura.</p>
<p>Il rovescio della medaglia: costa di pi&ugrave;, richiede pi&ugrave; tempo e comporta due sistemi da mantenere invece di uno. Non ha senso adottarlo &laquo;perch&eacute; &egrave; moderno&raquo; se un WordPress ottimizzato risolve gi&agrave; il problema.</p>
<h2>Come scegliere</h2>
<p>Parti dall'obiettivo, non dalla tecnologia. Se ti serve un sito che si aggiorna facilmente e si lancia in fretta, il nostro <a href="/servizi/sviluppo-siti-web/">servizio di sviluppo siti web</a> parte da &euro;800 su WordPress ottimizzato. Se punti a prestazioni estreme e a un frontend moderno, valutiamo insieme un'architettura headless. In entrambi i casi la <a href="/servizi/seo/">SEO</a> tecnica fa la differenza sul risultato finale.</p>""",
  faqs=[
   ("WordPress tradizionale o headless: quale e piu veloce?", "A parita di lavoro, headless parte avvantaggiato sulle prestazioni pure. Ma un WordPress tradizionale ben ottimizzato (caching, immagini moderne, hosting solido) raggiunge Core Web Vitals ottimi ed e sufficiente per la maggioranza dei siti. La velocita dipende piu dall'ottimizzazione che dall'architettura."),
   ("Headless costa piu di WordPress classico?", "Si. Un progetto headless parte da circa &euro;2.000 contro gli &euro;800 di un WordPress tradizionale, perche richiede un frontend su misura e due sistemi da mantenere. Conviene solo quando i vantaggi di prestazioni o multicanale ripagano davvero l'investimento."),
   ("Posso passare da WordPress tradizionale a headless in futuro?", "Si. WordPress puo funzionare da backend headless tramite le sue API, quindi i contenuti restano riutilizzabili. La migrazione riguarda soprattutto la ricostruzione del frontend e va pianificata per non perdere posizionamento SEO."),
   ("Headless e migliore per la SEO?", "Non automaticamente. Entrambe le architetture possono posizionarsi bene. Headless offre prestazioni ottime ma richiede lavoro tecnico su rendering, meta tag e dati strutturati; WordPress ha plugin SEO maturi. Conta come e realizzato, non l'etichetta."),
  ]),
 en=dict(
  title="WordPress vs Headless: Which CMS to Choose in 2026 | Carbon Stealth",
  desc="Traditional WordPress or a headless CMS? An honest comparison of cost, performance, SEO and maintenance, and when going headless actually pays off in 2026.",
  body="""<p><strong>In short:</strong> <strong>traditional WordPress</strong> is the right choice for most business sites, blogs and content portals &mdash; it goes live in days, costs little and has a huge plugin ecosystem. A <strong>headless architecture</strong> makes sense when you need top-tier performance, a modern frontend (React or Next.js) or you have to publish the same content across several channels &mdash; website, app, kiosk, devices. If you don't have a concrete technical reason, classic WordPress saves you time and budget without giving up anything that matters.</p>
<h2>Head-to-head comparison</h2>
<div class="ctbl"><table><thead><tr><th>Criterion</th><th>Traditional WordPress</th><th>Headless CMS</th></tr></thead><tbody>
<tr><td>Upfront cost</td><td>from &euro;800</td><td>from &euro;2,000</td></tr>
<tr><td>Time to launch</td><td>Days / a few weeks</td><td>Weeks</td></tr>
<tr><td>Performance</td><td>Good with optimization</td><td>Excellent</td></tr>
<tr><td>Editing content</td><td>Full visual editor</td><td>Depends on the frontend</td></tr>
<tr><td>Multi-channel (web + app)</td><td>No</td><td>Yes</td></tr>
<tr><td>Maintenance</td><td>Plugin/core updates</td><td>Separate frontend and backend</td></tr>
<tr><td>SEO</td><td>Mature plugins, great control</td><td>Excellent but needs technical work</td></tr>
</tbody></table></div>
<h2>When to choose traditional WordPress</h2>
<p>&laquo;Monolithic&raquo; WordPress bundles backend and frontend into one system: editors see an instant preview, themes give you a ready-made structure and thousands of plugins cover forms, bookings, multilingual and SEO without writing code. For a brochure site, a company blog or an editorial portal with a few hundred pages it is the most efficient option, full stop: cheaper, faster to launch and anyone in the team can update it.</p>
<p>With proper optimization &mdash; caching, modern images, solid hosting &mdash; even classic WordPress hits great Core Web Vitals. The limit shows up when the site grows very complex or plugins pile up: then maintenance and performance start to weigh.</p>
<h2>When to choose headless</h2>
<p>Headless means separating content management (the &laquo;body&raquo; &mdash; WordPress in API mode, Strapi or Sanity) from the visible layer (the &laquo;head&raquo;, built in React/Next.js). The payoff is twofold: top performance thanks to static or server-rendered pages, and the ability to reuse the same content across website, mobile app and other channels. It is the right call for high-traffic projects, complex e-commerce or companies that want a fully custom frontend.</p>
<p>The trade-off: it costs more, takes longer and means two systems to maintain instead of one. There is no point adopting it &laquo;because it's modern&raquo; if an optimized WordPress already solves the problem.</p>
<h2>How to choose</h2>
<p>Start from the goal, not the technology. If you need a site that's easy to update and quick to launch, our <a href="/en/services/web-development/">web development service</a> starts at &euro;800 on optimized WordPress. If you're chasing extreme performance and a modern frontend, we'll weigh a headless architecture together. Either way, technical <a href="/en/services/seo/">SEO</a> is what shapes the final result.</p>""",
  faqs=[
   ("Traditional WordPress or headless: which is faster?", "For the same effort, headless starts ahead on raw performance. But a well-optimized traditional WordPress (caching, modern images, solid hosting) reaches great Core Web Vitals and is enough for most sites. Speed depends more on optimization than on architecture."),
   ("Does headless cost more than classic WordPress?", "Yes. A headless project starts around &euro;2,000 versus &euro;800 for traditional WordPress, because it needs a custom frontend and two systems to maintain. It only pays off when the performance or multi-channel benefits genuinely justify the investment."),
   ("Can I move from traditional WordPress to headless later?", "Yes. WordPress can act as a headless backend through its APIs, so your content stays reusable. Migration is mainly about rebuilding the frontend and should be planned to avoid losing SEO rankings."),
   ("Is headless better for SEO?", "Not automatically. Both architectures can rank well. Headless offers great performance but needs technical work on rendering, meta tags and structured data; WordPress has mature SEO plugins. What matters is how it's built, not the label."),
  ]),
 bg=dict(
  title="WordPress срещу Headless: Коя CMS да Изберете 2026 | Carbon Stealth",
  desc="Традиционен WordPress или headless CMS? Честно сравнение на цена, производителност, SEO и поддръжка и кога headless наистина си струва през 2026.",
  body="""<p><strong>Накратко:</strong> <strong>традиционният WordPress</strong> е правилният избор за повечето фирмени сайтове, блогове и портали за съдържание &mdash; пуска се за дни, струва малко и има огромна екосистема от плъгини. <strong>Headless архитектурата</strong> е подходяща, когато ви трябва максимална производителност, модерен frontend (React или Next.js) или трябва да публикувате едно и също съдържание в няколко канала &mdash; сайт, приложение, терминал, устройства. Ако нямате конкретна техническа причина, класическият WordPress ви спестява време и бюджет, без да жертвате нищо важно.</p>
<h2>Директно сравнение</h2>
<div class="ctbl"><table><thead><tr><th>Критерий</th><th>Традиционен WordPress</th><th>Headless CMS</th></tr></thead><tbody>
<tr><td>Начален разход</td><td>от &euro;800</td><td>от &euro;2000</td></tr>
<tr><td>Срок за пускане</td><td>Дни / няколко седмици</td><td>Седмици</td></tr>
<tr><td>Производителност</td><td>Добра с оптимизация</td><td>Отлична</td></tr>
<tr><td>Редакция на съдържание</td><td>Пълен визуален редактор</td><td>Зависи от frontend-а</td></tr>
<tr><td>Многоканалност (уеб + app)</td><td>Не</td><td>Да</td></tr>
<tr><td>Поддръжка</td><td>Обновления на плъгини/ядро</td><td>Разделени frontend и backend</td></tr>
<tr><td>SEO</td><td>Зрели плъгини, отличен контрол</td><td>Отлично, но с техническа работа</td></tr>
</tbody></table></div>
<h2>Кога да изберете традиционен WordPress</h2>
<p>&laquo;Монолитният&raquo; WordPress обединява backend и frontend в една система: редакторите виждат моментален преглед, темите дават готова структура, а хиляди плъгини покриват форми, резервации, многоезичност и SEO без писане на код. За визитен сайт, фирмен блог или редакционен портал с няколкостотин страници това е най-ефективното решение: по-евтино, по-бързо за пускане и всеки в екипа може да го обновява.</p>
<p>С добра оптимизация &mdash; кеширане, модерни изображения, солиден хостинг &mdash; и класическият WordPress постига отлични Core Web Vitals. Ограничението идва, когато сайтът стане много сложен или плъгините се натрупат: тогава поддръжката и производителността започват да тежат.</p>
<h2>Кога да изберете headless</h2>
<p>Headless означава да отделите управлението на съдържанието (&laquo;тялото&raquo; &mdash; WordPress в API режим, Strapi или Sanity) от видимата част (&laquo;главата&raquo;, изградена с React/Next.js). Ползата е двойна: върхова производителност чрез статични или server-rendered страници и възможност да преизползвате едно и също съдържание в сайт, мобилно приложение и други канали. Това е правилният избор за проекти с висок трафик, сложни онлайн магазини или фирми, които искат изцяло персонализиран frontend.</p>
<p>Обратната страна: струва повече, отнема по-дълго и означава две системи за поддръжка вместо една. Няма смисъл да се възприема &laquo;защото е модерно&raquo;, ако оптимизиран WordPress вече решава проблема.</p>
<h2>Как да изберете</h2>
<p>Тръгнете от целта, не от технологията. Ако ви трябва сайт, който се обновява лесно и се пуска бързо, нашата <a href="/bg/uslugi/web-razrabotka/">услуга за изработка на сайтове</a> започва от &euro;800 на оптимизиран WordPress. Ако търсите максимална производителност и модерен frontend, ще преценим headless архитектурата заедно. И в двата случая техническото <a href="/bg/uslugi/seo/">SEO</a> определя крайния резултат.</p>""",
  faqs=[
   ("Традиционен WordPress или headless: кой е по-бърз?", "При еднаква работа headless тръгва с предимство по чиста производителност. Но добре оптимизиран традиционен WordPress (кеширане, модерни изображения, солиден хостинг) постига отлични Core Web Vitals и е достатъчен за повечето сайтове. Скоростта зависи повече от оптимизацията, отколкото от архитектурата."),
   ("Headless по-скъп ли е от класическия WordPress?", "Да. Headless проект започва от около &euro;2000 срещу &euro;800 за традиционен WordPress, защото изисква персонализиран frontend и две системи за поддръжка. Струва си само когато ползите от производителност или многоканалност реално оправдават инвестицията."),
   ("Мога ли по-късно да премина от традиционен WordPress към headless?", "Да. WordPress може да работи като headless backend чрез своите API, така че съдържанието остава преизползваемо. Миграцията е основно преизграждане на frontend-а и се планира внимателно, за да не се загубят SEO позиции."),
   ("Headless по-добър ли е за SEO?", "Не автоматично. И двете архитектури могат да се класират добре. Headless дава отлична производителност, но изисква техническа работа по рендиране, мета тагове и структурирани данни; WordPress има зрели SEO плъгини. Важно е как е изградено, не етикетът."),
  ]),
)),

# 2 ─── shopify-vs-magento ───────────────────────────────────────
dict(slug="shopify-vs-magento", section="E-commerce",
     related=["saas-vs-software-su-misura", "wordpress-vs-headless"], lang=dict(
 it=dict(
  title="Shopify vs Magento: Quale E-commerce Scegliere 2026 | Carbon Stealth",
  desc="Shopify o Magento (Adobe Commerce)? Confronto onesto tra le due piattaforme e-commerce nel 2026: costi, scalabilita, B2B, manutenzione e quando conviene ciascuna.",
  body="""<p><strong>In breve:</strong> <strong>Shopify</strong> conviene alla stragrande maggioranza dei negozi &mdash; parte in fretta, non richiede competenze tecniche e ha costi prevedibili. <strong>Magento</strong> (oggi Adobe Commerce) ha senso solo per cataloghi molto grandi, logiche B2B complesse o gruppi con pi&ugrave; negozi e sistemi da integrare, che dispongono di un team tecnico o di un budget importante. Se non rientri in questi casi, Magento ti dar&agrave; una complessit&agrave; che non ti serve.</p>
<h2>Confronto diretto</h2>
<div class="ctbl"><table><thead><tr><th>Criterio</th><th>Shopify</th><th>Magento / Adobe Commerce</th></tr></thead><tbody>
<tr><td>Costo iniziale</td><td>da &euro;1.200 + canone</td><td>da &euro;5.000</td></tr>
<tr><td>Canone piattaforma</td><td>da ~&euro;30/mese</td><td>Open Source gratis / Adobe a listino enterprise</td></tr>
<tr><td>Competenze richieste</td><td>Basse</td><td>Alte (sviluppatori dedicati)</td></tr>
<tr><td>Scalabilit&agrave;</td><td>Ottima fino a cataloghi grandi</td><td>Enterprise, cataloghi enormi</td></tr>
<tr><td>B2B e multi-store</td><td>Con app/piani superiori</td><td>Nativo e molto flessibile</td></tr>
<tr><td>Manutenzione</td><td>Gestita da Shopify</td><td>A tuo carico (server, sicurezza)</td></tr>
</tbody></table></div>
<h2>Quando scegliere Shopify</h2>
<p>Shopify &egrave; una piattaforma &laquo;chiavi in mano&raquo;: hosting, sicurezza, aggiornamenti e pagamenti sono inclusi. Apri un negozio professionale in poche settimane, lo gestisci senza toccare codice e i costi sono chiari fin dall'inizio. Per il 90% dei progetti &mdash; da chi vende poche decine di prodotti fino a cataloghi di diverse migliaia &mdash; &egrave; la scelta pi&ugrave; efficiente. Il limite &egrave; la personalizzazione: sei vincolato a temi, app e alle regole della piattaforma.</p>
<p>Se cerchi il pieno controllo senza canone, esiste anche l'alternativa WooCommerce: ne parliamo nella guida <a href="/blog/woocommerce-vs-shopify/">WooCommerce vs Shopify</a>.</p>
<h2>Quando scegliere Magento</h2>
<p>Magento &egrave; una piattaforma open source potentissima, pensata per l'enterprise. Gestisce cataloghi con centinaia di migliaia di prodotti, logiche di prezzo B2B, listini per cliente, pi&ugrave; negozi e magazzini in un'unica installazione. In cambio richiede sviluppatori dedicati, un server robusto e manutenzione continua: sicurezza, aggiornamenti e prestazioni sono responsabilit&agrave; tua. &Egrave; la scelta giusta solo se la complessit&agrave; del tuo business la giustifica davvero.</p>
<h2>Come scegliere</h2>
<p>Chiediti quanto &egrave; complesso il tuo modello di vendita, non solo quanti prodotti hai. Per la maggior parte dei negozi il nostro <a href="/servizi/ecommerce/">servizio e-commerce</a> parte da &euro;1.200 e ti mette online in fretta. Se hai logiche B2B, integrazioni con un <a href="/servizi/erp/">ERP</a> o pi&ugrave; magazzini, valutiamo insieme una soluzione enterprise o su misura. Scrivici e ti diciamo onestamente cosa ti conviene.</p>""",
  faqs=[
   ("Shopify o Magento per un negozio nuovo?", "Per un negozio nuovo, nella quasi totalita dei casi Shopify: parte in fretta, non richiede competenze tecniche e ha costi prevedibili. Magento ha senso solo se hai gia cataloghi enormi o logiche B2B complesse e un budget e un team adeguati."),
   ("Magento e davvero gratis?", "Magento Open Source e gratuito come licenza, ma non come progetto: richiede sviluppatori, un server robusto, hosting e manutenzione continua. Il costo totale e spesso superiore a Shopify per anni, non inferiore."),
   ("Shopify regge cataloghi grandi?", "Si. Shopify gestisce senza problemi cataloghi di diverse migliaia di prodotti e volumi elevati. Solo per esigenze davvero enterprise (centinaia di migliaia di SKU, B2B molto articolato) Magento o una soluzione su misura diventano piu adatti."),
   ("Posso migrare da Magento a Shopify?", "Si. Si esportano prodotti, clienti e ordini e si ricostruisce il negozio su Shopify. Molte aziende lo fanno per ridurre costi e manutenzione. La migrazione va pianificata per preservare gli URL e il posizionamento SEO."),
  ]),
 en=dict(
  title="Shopify vs Magento: Which E-commerce to Choose 2026 | Carbon Stealth",
  desc="Shopify or Magento (Adobe Commerce)? An honest comparison of the two e-commerce platforms in 2026: cost, scalability, B2B, maintenance and when each one fits.",
  body="""<p><strong>In short:</strong> <strong>Shopify</strong> fits the vast majority of stores &mdash; it launches fast, needs no technical skills and has predictable costs. <strong>Magento</strong> (now Adobe Commerce) only makes sense for very large catalogs, complex B2B logic or groups running multiple stores and systems to integrate, with a technical team or a serious budget. If you don't fall into those cases, Magento gives you complexity you don't need.</p>
<h2>Head-to-head comparison</h2>
<div class="ctbl"><table><thead><tr><th>Criterion</th><th>Shopify</th><th>Magento / Adobe Commerce</th></tr></thead><tbody>
<tr><td>Upfront cost</td><td>from &euro;1,200 + fee</td><td>from &euro;5,000</td></tr>
<tr><td>Platform fee</td><td>from ~&euro;30/mo</td><td>Open Source free / Adobe enterprise pricing</td></tr>
<tr><td>Skills required</td><td>Low</td><td>High (dedicated developers)</td></tr>
<tr><td>Scalability</td><td>Great up to large catalogs</td><td>Enterprise, huge catalogs</td></tr>
<tr><td>B2B and multi-store</td><td>Via apps/higher plans</td><td>Native and very flexible</td></tr>
<tr><td>Maintenance</td><td>Handled by Shopify</td><td>On you (server, security)</td></tr>
</tbody></table></div>
<h2>When to choose Shopify</h2>
<p>Shopify is a turnkey platform: hosting, security, updates and payments are included. You open a professional store in a few weeks, run it without touching code and costs are clear from day one. For 90% of projects &mdash; from a few dozen products up to catalogs of several thousand &mdash; it is the most efficient choice. The limit is customization: you're bound to themes, apps and the platform's rules.</p>
<p>If you want full control with no subscription, WooCommerce is another option &mdash; we cover it in our <a href="/en/blog/woocommerce-vs-shopify/">WooCommerce vs Shopify</a> guide.</p>
<h2>When to choose Magento</h2>
<p>Magento is a very powerful open-source platform built for the enterprise. It handles catalogs with hundreds of thousands of products, B2B pricing logic, per-customer price lists, multiple stores and warehouses in a single install. In return it needs dedicated developers, a robust server and ongoing maintenance: security, updates and performance are your responsibility. It's the right choice only when your business complexity genuinely justifies it.</p>
<h2>How to choose</h2>
<p>Ask how complex your sales model is, not just how many products you have. For most stores our <a href="/en/services/ecommerce/">e-commerce service</a> starts at &euro;1,200 and gets you online fast. If you have B2B logic, integrations with an <a href="/en/services/erp/">ERP</a> or multiple warehouses, we'll weigh an enterprise or custom solution together. Get in touch and we'll tell you honestly what suits you.</p>""",
  faqs=[
   ("Shopify or Magento for a new store?", "For a new store, in almost every case Shopify: it launches fast, needs no technical skills and has predictable costs. Magento only makes sense if you already have huge catalogs or complex B2B logic plus the budget and team to match."),
   ("Is Magento really free?", "Magento Open Source is free as a license, but not as a project: it needs developers, a robust server, hosting and ongoing maintenance. Total cost is often higher than Shopify over the years, not lower."),
   ("Can Shopify handle large catalogs?", "Yes. Shopify comfortably handles catalogs of several thousand products and high volumes. Only for truly enterprise needs (hundreds of thousands of SKUs, very articulated B2B) do Magento or a custom solution become a better fit."),
   ("Can I migrate from Magento to Shopify?", "Yes. You export products, customers and orders and rebuild the store on Shopify. Many businesses do it to cut cost and maintenance. The migration must be planned to preserve URLs and SEO rankings."),
  ]),
 bg=dict(
  title="Shopify срещу Magento: Коя Платформа за Магазин 2026 | Carbon Stealth",
  desc="Shopify или Magento (Adobe Commerce)? Честно сравнение на двете платформи за онлайн магазини през 2026: цена, мащабируемост, B2B, поддръжка и кога коя пасва.",
  body="""<p><strong>Накратко:</strong> <strong>Shopify</strong> пасва на огромното мнозинство магазини &mdash; пуска се бързо, не изисква технически умения и има предвидими разходи. <strong>Magento</strong> (днес Adobe Commerce) има смисъл само за много големи каталози, сложна B2B логика или групи с няколко магазина и системи за интеграция, които имат технически екип или сериозен бюджет. Ако не попадате в тези случаи, Magento ще ви даде сложност, от която нямате нужда.</p>
<h2>Директно сравнение</h2>
<div class="ctbl"><table><thead><tr><th>Критерий</th><th>Shopify</th><th>Magento / Adobe Commerce</th></tr></thead><tbody>
<tr><td>Начален разход</td><td>от &euro;1200 + такса</td><td>от &euro;5000</td></tr>
<tr><td>Такса за платформа</td><td>от ~&euro;30/мес</td><td>Open Source безплатно / Adobe enterprise цени</td></tr>
<tr><td>Нужни умения</td><td>Ниски</td><td>Високи (специализирани разработчици)</td></tr>
<tr><td>Мащабируемост</td><td>Отлична до големи каталози</td><td>Enterprise, огромни каталози</td></tr>
<tr><td>B2B и много магазини</td><td>Чрез приложения/по-високи планове</td><td>Вградено и много гъвкаво</td></tr>
<tr><td>Поддръжка</td><td>Поема се от Shopify</td><td>За ваша сметка (сървър, сигурност)</td></tr>
</tbody></table></div>
<h2>Кога да изберете Shopify</h2>
<p>Shopify е решение &laquo;до ключ&raquo;: хостинг, сигурност, обновления и плащания са включени. Отваряте професионален магазин за няколко седмици, управлявате го без код и разходите са ясни от самото начало. За 90% от проектите &mdash; от няколко десетки продукта до каталози от няколко хиляди &mdash; това е най-ефективният избор. Ограничението е персонализацията: обвързани сте с теми, приложения и правилата на платформата.</p>
<p>Ако искате пълен контрол без абонамент, WooCommerce е друга опция &mdash; разглеждаме я в статията <a href="/bg/blog/woocommerce-vs-shopify/">WooCommerce срещу Shopify</a>.</p>
<h2>Кога да изберете Magento</h2>
<p>Magento е много мощна open-source платформа, създадена за enterprise. Управлява каталози със стотици хиляди продукти, B2B ценова логика, ценоразписи по клиент, няколко магазина и складове в една инсталация. В замяна изисква специализирани разработчици, стабилен сървър и постоянна поддръжка: сигурност, обновления и производителност са ваша отговорност. Правилен избор е само когато сложността на бизнеса ви наистина го оправдава.</p>
<h2>Как да изберете</h2>
<p>Запитайте се колко сложен е моделът ви на продажби, не само колко продукта имате. За повечето магазини нашата <a href="/bg/uslugi/ecommerce/">услуга за онлайн магазини</a> започва от &euro;1200 и ви пуска онлайн бързо. Ако имате B2B логика, интеграции с <a href="/bg/uslugi/erp/">ERP</a> или няколко склада, ще преценим enterprise или решение по поръчка заедно. Пишете ни и ще ви кажем честно кое ви подхожда.</p>""",
  faqs=[
   ("Shopify или Magento за нов магазин?", "За нов магазин, почти винаги Shopify: пуска се бързо, не изисква технически умения и има предвидими разходи. Magento има смисъл само ако вече имате огромни каталози или сложна B2B логика и подходящ бюджет и екип."),
   ("Magento наистина ли е безплатен?", "Magento Open Source е безплатен като лиценз, но не и като проект: изисква разработчици, стабилен сървър, хостинг и постоянна поддръжка. Общата цена често е по-висока от Shopify през годините, а не по-ниска."),
   ("Shopify издържа ли големи каталози?", "Да. Shopify спокойно управлява каталози от няколко хиляди продукта и високи обеми. Само за наистина enterprise нужди (стотици хиляди SKU, много сложен B2B) Magento или решение по поръчка стават по-подходящи."),
   ("Мога ли да мигрирам от Magento към Shopify?", "Да. Изнасят се продукти, клиенти и поръчки и магазинът се изгражда наново на Shopify. Много фирми го правят, за да намалят разходи и поддръжка. Миграцията се планира, за да се запазят URL адресите и SEO позициите."),
  ]),
)),

# 3 ─── react-vs-wordpress ───────────────────────────────────────
dict(slug="react-vs-wordpress", section="Web Development",
     related=["wordpress-vs-headless", "wordpress-vs-webflow"], lang=dict(
 it=dict(
  title="React vs WordPress: Cosa Scegliere per il Sito 2026 | Carbon Stealth",
  desc="React o WordPress per il tuo sito? Confronto onesto su costi, contenuti aggiornabili, SEO e prestazioni, e quando conviene un sito React su misura o WordPress.",
  body="""<p><strong>In breve:</strong> scegli <strong>WordPress</strong> se il sito &egrave; fatto soprattutto di contenuti che devi aggiornare spesso da solo &mdash; pagine, blog, servizi &mdash; e vuoi spendere meno partendo in fretta. Scegli <strong>React</strong> (con Next.js) quando ti serve un'esperienza interattiva, un'interfaccia su misura, un'applicazione web o prestazioni al top. Non sono in competizione diretta: risolvono problemi diversi, e spesso la risposta migliore &egrave; usarli insieme.</p>
<h2>Confronto diretto</h2>
<div class="ctbl"><table><thead><tr><th>Criterio</th><th>WordPress</th><th>React / Next.js</th></tr></thead><tbody>
<tr><td>Costo iniziale</td><td>da &euro;800</td><td>da &euro;2.000</td></tr>
<tr><td>Aggiornamento contenuti</td><td>Autonomo, editor visuale</td><td>Serve un CMS collegato</td></tr>
<tr><td>Interattivit&agrave;</td><td>Standard</td><td>Elevata, app-like</td></tr>
<tr><td>Prestazioni</td><td>Buone con ottimizzazione</td><td>Eccellenti</td></tr>
<tr><td>Adatto a</td><td>Siti di contenuto, blog, vetrine</td><td>Web app, dashboard, UI su misura</td></tr>
<tr><td>SEO</td><td>Plugin maturi</td><td>Ottima con rendering lato server</td></tr>
</tbody></table></div>
<h2>Quando scegliere WordPress</h2>
<p>WordPress &egrave; un CMS: nasce per gestire contenuti. Se il tuo sito &egrave; fatto di pagine, articoli e schede che tu o il tuo team dovete aggiornare in autonomia, WordPress &egrave; imbattibile per rapporto costo/valore. Editor visuale, temi pronti, migliaia di plugin e strumenti SEO maturi ti fanno partire in giorni. Per siti vetrina, blog aziendali e portali editoriali &egrave; quasi sempre la scelta giusta.</p>
<h2>Quando scegliere React</h2>
<p>React &egrave; una libreria per costruire interfacce: con framework come Next.js diventa la base di siti e applicazioni web moderne, veloci e altamente interattive. &Egrave; la scelta giusta quando l'interfaccia &egrave; il cuore del prodotto &mdash; configuratori, dashboard, aree riservate, esperienze animate &mdash; o quando servono prestazioni e controllo totale sul frontend. Il rovescio: costa di pi&ugrave; e, per aggiornare i contenuti in autonomia, serve collegare un CMS (spesso WordPress in modalit&agrave; headless).</p>
<h2>Come scegliere</h2>
<p>Parti dalla domanda giusta: il tuo sito &egrave; soprattutto <em>contenuto</em> o soprattutto <em>interazione</em>? Se &egrave; contenuto, il nostro <a href="/servizi/sviluppo-siti-web/">servizio di sviluppo siti web</a> su WordPress ottimizzato parte da &euro;800. Se &egrave; interazione, costruiamo un frontend React/Next.js su misura. In entrambi i casi curiamo la <a href="/servizi/seo/">SEO tecnica</a>, perch&eacute; anche il sito piu veloce serve a poco se Google non lo trova.</p>""",
  faqs=[
   ("React o WordPress: cosa e meglio per la SEO?", "Entrambi possono posizionarsi bene. WordPress ha plugin SEO maturi e gestione contenuti immediata; React con Next.js offre prestazioni eccellenti ma richiede rendering lato server per essere indicizzato bene. La SEO dipende dall'implementazione, non dalla tecnologia in se."),
   ("Posso aggiornare da solo un sito in React?", "Non direttamente come su WordPress. Un sito React aggiorna i contenuti tramite un CMS collegato (spesso WordPress headless o servizi come Sanity). Senza questo collegamento, ogni modifica ai testi richiede uno sviluppatore."),
   ("React costa piu di WordPress?", "Si, di solito. Un sito React su misura parte da circa &euro;2.000 contro gli &euro;800 di un WordPress, perche il frontend viene costruito da zero. Conviene quando l'interattivita o le prestazioni lo giustificano."),
   ("Si possono usare React e WordPress insieme?", "Si, ed e una combinazione molto comune: WordPress gestisce i contenuti come backend headless e React/Next.js costruisce il frontend. Cosi unisci facilita di aggiornamento e prestazioni moderne."),
  ]),
 en=dict(
  title="React vs WordPress: What to Choose for Your Site 2026 | Carbon Stealth",
  desc="React or WordPress for your site? An honest comparison of cost, editable content, SEO and performance, and when a custom React build or WordPress makes more sense.",
  body="""<p><strong>In short:</strong> choose <strong>WordPress</strong> if the site is mostly content you need to update often yourself &mdash; pages, blog, services &mdash; and you want to spend less and launch fast. Choose <strong>React</strong> (with Next.js) when you need an interactive experience, a custom interface, a web application or top-tier performance. They aren't direct competitors: they solve different problems, and often the best answer is to use them together.</p>
<h2>Head-to-head comparison</h2>
<div class="ctbl"><table><thead><tr><th>Criterion</th><th>WordPress</th><th>React / Next.js</th></tr></thead><tbody>
<tr><td>Upfront cost</td><td>from &euro;800</td><td>from &euro;2,000</td></tr>
<tr><td>Content updates</td><td>Self-service, visual editor</td><td>Needs a connected CMS</td></tr>
<tr><td>Interactivity</td><td>Standard</td><td>High, app-like</td></tr>
<tr><td>Performance</td><td>Good with optimization</td><td>Excellent</td></tr>
<tr><td>Best for</td><td>Content sites, blogs, brochure sites</td><td>Web apps, dashboards, custom UI</td></tr>
<tr><td>SEO</td><td>Mature plugins</td><td>Great with server-side rendering</td></tr>
</tbody></table></div>
<h2>When to choose WordPress</h2>
<p>WordPress is a CMS: it exists to manage content. If your site is made of pages, articles and listings that you or your team need to update independently, WordPress is unbeatable on value for money. A visual editor, ready-made themes, thousands of plugins and mature SEO tools get you live in days. For brochure sites, company blogs and editorial portals it is almost always the right choice.</p>
<h2>When to choose React</h2>
<p>React is a library for building interfaces: with frameworks like Next.js it becomes the base of modern, fast, highly interactive websites and web apps. It's the right choice when the interface is the heart of the product &mdash; configurators, dashboards, member areas, animated experiences &mdash; or when you need performance and full control over the frontend. The trade-off: it costs more and, to let you edit content yourself, it needs a connected CMS (often WordPress in headless mode).</p>
<h2>How to choose</h2>
<p>Start from the right question: is your site mostly <em>content</em> or mostly <em>interaction</em>? If it's content, our <a href="/en/services/web-development/">web development service</a> on optimized WordPress starts at &euro;800. If it's interaction, we build a custom React/Next.js frontend. Either way we handle technical <a href="/en/services/seo/">SEO</a>, because even the fastest site is useless if Google can't find it.</p>""",
  faqs=[
   ("React or WordPress: which is better for SEO?", "Both can rank well. WordPress has mature SEO plugins and instant content management; React with Next.js offers excellent performance but needs server-side rendering to be indexed properly. SEO depends on implementation, not on the technology itself."),
   ("Can I update a React site myself?", "Not directly like on WordPress. A React site updates content through a connected CMS (often headless WordPress or services like Sanity). Without that link, every text change needs a developer."),
   ("Does React cost more than WordPress?", "Usually yes. A custom React site starts around &euro;2,000 versus &euro;800 for WordPress, because the frontend is built from scratch. It pays off when interactivity or performance justify it."),
   ("Can React and WordPress be used together?", "Yes, and it's a very common combination: WordPress manages content as a headless backend and React/Next.js builds the frontend. This pairs easy editing with modern performance."),
  ]),
 bg=dict(
  title="React срещу WordPress: Какво да Изберете за Сайт 2026 | Carbon Stealth",
  desc="React или WordPress за вашия сайт? Честно сравнение на цена, редактируемо съдържание, SEO и производителност и кога е по-добре React по поръчка или WordPress.",
  body="""<p><strong>Накратко:</strong> изберете <strong>WordPress</strong>, ако сайтът е предимно съдържание, което трябва да обновявате често сами &mdash; страници, блог, услуги &mdash; и искате да похарчите по-малко и да стартирате бързо. Изберете <strong>React</strong> (с Next.js), когато ви трябва интерактивно изживяване, персонализиран интерфейс, уеб приложение или върхова производителност. Те не са преки конкуренти: решават различни проблеми и често най-добрият отговор е да се използват заедно.</p>
<h2>Директно сравнение</h2>
<div class="ctbl"><table><thead><tr><th>Критерий</th><th>WordPress</th><th>React / Next.js</th></tr></thead><tbody>
<tr><td>Начален разход</td><td>от &euro;800</td><td>от &euro;2000</td></tr>
<tr><td>Обновяване на съдържание</td><td>Самостоятелно, визуален редактор</td><td>Нужна е свързана CMS</td></tr>
<tr><td>Интерактивност</td><td>Стандартна</td><td>Висока, като приложение</td></tr>
<tr><td>Производителност</td><td>Добра с оптимизация</td><td>Отлична</td></tr>
<tr><td>Подходящ за</td><td>Съдържателни сайтове, блогове, визитни</td><td>Уеб приложения, табла, персонален UI</td></tr>
<tr><td>SEO</td><td>Зрели плъгини</td><td>Отлично със server-side рендиране</td></tr>
</tbody></table></div>
<h2>Кога да изберете WordPress</h2>
<p>WordPress е CMS: създаден е да управлява съдържание. Ако сайтът ви се състои от страници, статии и карти, които вие или екипът ви трябва да обновявате самостоятелно, WordPress е ненадминат по съотношение цена/стойност. Визуален редактор, готови теми, хиляди плъгини и зрели SEO инструменти ви пускат за дни. За визитни сайтове, фирмени блогове и редакционни портали почти винаги е правилният избор.</p>
<h2>Кога да изберете React</h2>
<p>React е библиотека за изграждане на интерфейси: с фреймуърци като Next.js става основа на модерни, бързи и силно интерактивни сайтове и уеб приложения. Правилен избор е, когато интерфейсът е сърцето на продукта &mdash; конфигуратори, табла, клиентски зони, анимирани изживявания &mdash; или когато ви трябват производителност и пълен контрол над frontend-а. Обратната страна: струва повече и за да редактирате съдържание сами, е нужна свързана CMS (често WordPress в headless режим).</p>
<h2>Как да изберете</h2>
<p>Тръгнете от правилния въпрос: сайтът ви е предимно <em>съдържание</em> или предимно <em>интеракция</em>? Ако е съдържание, нашата <a href="/bg/uslugi/web-razrabotka/">услуга за изработка на сайтове</a> на оптимизиран WordPress започва от &euro;800. Ако е интеракция, изграждаме персонализиран React/Next.js frontend. И в двата случая се грижим за техническото <a href="/bg/uslugi/seo/">SEO</a>, защото и най-бързият сайт е безполезен, ако Google не го намира.</p>""",
  faqs=[
   ("React или WordPress: кое е по-добро за SEO?", "И двете могат да се класират добре. WordPress има зрели SEO плъгини и мигновено управление на съдържание; React с Next.js дава отлична производителност, но изисква server-side рендиране, за да се индексира правилно. SEO зависи от изпълнението, не от самата технология."),
   ("Мога ли сам да обновявам React сайт?", "Не директно като при WordPress. React сайт обновява съдържанието чрез свързана CMS (често headless WordPress или услуги като Sanity). Без тази връзка всяка промяна в текста изисква разработчик."),
   ("React по-скъп ли е от WordPress?", "Обикновено да. Персонализиран React сайт започва от около &euro;2000 срещу &euro;800 за WordPress, защото frontend-ът се изгражда от нулата. Струва си, когато интерактивността или производителността го оправдават."),
   ("Могат ли React и WordPress да се използват заедно?", "Да, и това е много често срещана комбинация: WordPress управлява съдържанието като headless backend, а React/Next.js изгражда frontend-а. Така съчетавате лесно редактиране и модерна производителност."),
  ]),
)),

# 4 ─── sito-vetrina-vs-landing-page ─────────────────────────────
dict(slug="sito-vetrina-vs-landing-page", section="Web Development",
     related=["react-vs-wordpress", "wordpress-vs-webflow"], lang=dict(
 it=dict(
  title="Sito Vetrina vs Landing Page: Cosa Serve nel 2026 | Carbon Stealth",
  desc="Sito vetrina o landing page? Confronto pratico su obiettivi, costi e conversioni, per capire quando basta una landing e quando serve un sito completo nel 2026.",
  body="""<p><strong>In breve:</strong> una <strong>landing page</strong> serve a un solo obiettivo &mdash; far compiere un'azione (contatto, iscrizione, acquisto) a chi arriva da una campagna pubblicitaria. Un <strong>sito vetrina</strong> presenta l'intera attivit&agrave;: chi sei, cosa offri, il portfolio, i contatti, e si posiziona su Google nel tempo. Se stai lanciando una singola offerta a traffico a pagamento, parti dalla landing. Se vuoi una presenza stabile che porta clienti anche organicamente, ti serve il sito vetrina.</p>
<h2>Confronto diretto</h2>
<div class="ctbl"><table><thead><tr><th>Criterio</th><th>Landing page</th><th>Sito vetrina</th></tr></thead><tbody>
<tr><td>Obiettivo</td><td>Una sola azione (conversione)</td><td>Presentare l'attivit&agrave;, generare contatti</td></tr>
<tr><td>Numero di pagine</td><td>Una</td><td>5-8 o pi&ugrave;</td></tr>
<tr><td>Prezzo</td><td>da &euro;500</td><td>da &euro;800</td></tr>
<tr><td>Fonte di traffico</td><td>Campagne a pagamento</td><td>SEO organica + diretto</td></tr>
<tr><td>Durata nel tempo</td><td>Legata alla campagna</td><td>Presenza stabile</td></tr>
<tr><td>Ideale per</td><td>Lanci, promozioni, lead gen</td><td>Aziende, professionisti, studi</td></tr>
</tbody></table></div>
<h2>Quando basta una landing page</h2>
<p>La landing page &egrave; uno strumento chirurgico: una sola pagina, un solo messaggio, un solo pulsante. Elimina distrazioni e menu per massimizzare le conversioni di chi arriva da Google Ads, Meta o una newsletter. &Egrave; perfetta per lanciare un prodotto, raccogliere iscrizioni a un evento o testare un'offerta prima di investire in un sito completo. Ma da sola non ti fa trovare su Google per le ricerche spontanee e non racconta la tua attivit&agrave; nel complesso.</p>
<h2>Quando serve un sito vetrina</h2>
<p>Il <a href="/servizi/sviluppo-siti-web/">sito vetrina</a> &egrave; la tua casa online stabile: pi&ugrave; pagine per servizi, chi siamo, portfolio e contatti, ottimizzate per posizionarsi su Google e trasformare i visitatori in richieste nel tempo. &Egrave; l'investimento giusto per chi vuole essere trovato senza pagare ogni clic. Spesso la strategia migliore combina i due: un sito vetrina come base e landing page dedicate per le campagne pubblicitarie.</p>
<h2>Come scegliere</h2>
<p>Chiediti da dove arriva il traffico. Se paghi la pubblicit&agrave; e vuoi convertire, parti da una landing. Se vuoi crescere in modo organico, costruisci il sito e affianca la <a href="/servizi/seo/">SEO</a>. Realizziamo entrambi: una landing parte da &euro;500, un sito vetrina da &euro;800. <a href="/contatti/">Raccontaci l'obiettivo</a> e ti diciamo da cosa conviene partire.</p>""",
  faqs=[
   ("Qual e la differenza tra landing page e sito vetrina?", "La landing page e una sola pagina con un unico obiettivo di conversione, pensata per il traffico a pagamento. Il sito vetrina ha piu pagine, presenta l'intera attivita e si posiziona su Google in modo organico nel tempo. Cambiano scopo, struttura e fonte di traffico."),
   ("Una landing page basta per la mia attivita?", "Basta se il tuo obiettivo e convertire visitatori che arrivano da una campagna specifica. Se invece vuoi essere trovato su Google per ricerche spontanee e presentare tutti i tuoi servizi, serve un sito vetrina."),
   ("Costa meno una landing page o un sito vetrina?", "La landing page costa meno: parte da &euro;500 contro gli &euro;800 di un sito vetrina, perche e una sola pagina. Ma copre un obiettivo piu ristretto e non sostituisce un sito completo."),
   ("Posso avere sia landing page che sito vetrina?", "Si, ed e spesso la strategia migliore: il sito vetrina come base stabile per la SEO e landing page dedicate per ogni campagna pubblicitaria. Cosi ottimizzi sia la visibilita organica sia le conversioni a pagamento."),
  ]),
 en=dict(
  title="Brochure Site vs Landing Page: What You Need in 2026 | Carbon Stealth",
  desc="Brochure site or landing page? A practical comparison of goals, cost and conversions, to see when a landing is enough and when you need a full site in 2026.",
  body="""<p><strong>In short:</strong> a <strong>landing page</strong> serves one goal &mdash; getting a visitor from an ad campaign to take a single action (contact, sign-up, purchase). A <strong>brochure site</strong> presents your whole business: who you are, what you offer, your portfolio, your contacts, and it ranks on Google over time. If you're launching a single offer with paid traffic, start with the landing. If you want a stable presence that also brings customers organically, you need the brochure site.</p>
<h2>Head-to-head comparison</h2>
<div class="ctbl"><table><thead><tr><th>Criterion</th><th>Landing page</th><th>Brochure site</th></tr></thead><tbody>
<tr><td>Goal</td><td>One action (conversion)</td><td>Present the business, generate leads</td></tr>
<tr><td>Number of pages</td><td>One</td><td>5-8 or more</td></tr>
<tr><td>Price</td><td>from &euro;500</td><td>from &euro;800</td></tr>
<tr><td>Traffic source</td><td>Paid campaigns</td><td>Organic SEO + direct</td></tr>
<tr><td>Lifespan</td><td>Tied to the campaign</td><td>Stable presence</td></tr>
<tr><td>Best for</td><td>Launches, promos, lead gen</td><td>Companies, professionals, firms</td></tr>
</tbody></table></div>
<h2>When a landing page is enough</h2>
<p>A landing page is a surgical tool: one page, one message, one button. It strips out distractions and menus to maximize conversions from visitors arriving via Google Ads, Meta or a newsletter. It's perfect for launching a product, collecting event sign-ups or testing an offer before investing in a full site. On its own, though, it won't get you found on Google for spontaneous searches and won't tell your whole story.</p>
<h2>When you need a brochure site</h2>
<p>A <a href="/en/services/web-development/">brochure site</a> is your stable online home: multiple pages for services, about, portfolio and contact, optimized to rank on Google and turn visitors into enquiries over time. It's the right investment if you want to be found without paying for every click. Often the best strategy combines the two: a brochure site as your base plus dedicated landing pages for ad campaigns.</p>
<h2>How to choose</h2>
<p>Ask where your traffic comes from. If you pay for ads and want to convert, start with a landing. If you want to grow organically, build the site and pair it with <a href="/en/services/seo/">SEO</a>. We build both: a landing starts at &euro;500, a brochure site at &euro;800. <a href="/en/contact/">Tell us the goal</a> and we'll say where to start.</p>""",
  faqs=[
   ("What's the difference between a landing page and a brochure site?", "A landing page is a single page with one conversion goal, built for paid traffic. A brochure site has multiple pages, presents the whole business and ranks organically on Google over time. Purpose, structure and traffic source all differ."),
   ("Is a landing page enough for my business?", "It's enough if your goal is converting visitors from a specific campaign. If instead you want to be found on Google for spontaneous searches and present all your services, you need a brochure site."),
   ("Does a landing page cost less than a brochure site?", "Yes. A landing page starts at &euro;500 versus &euro;800 for a brochure site, because it's a single page. But it covers a narrower goal and doesn't replace a full site."),
   ("Can I have both a landing page and a brochure site?", "Yes, and it's often the best strategy: the brochure site as a stable SEO base plus dedicated landing pages for each ad campaign. This optimizes both organic visibility and paid conversions."),
  ]),
 bg=dict(
  title="Визитен Сайт срещу Landing Page: Какво Ви Трябва 2026 | Carbon Stealth",
  desc="Визитен сайт или landing page? Практично сравнение на цели, цена и конверсии, за да разберете кога стига landing и кога е нужен пълен сайт през 2026.",
  body="""<p><strong>Накратко:</strong> <strong>landing page</strong> служи на една цел &mdash; да накара посетител от рекламна кампания да извърши едно действие (контакт, регистрация, покупка). <strong>Визитният сайт</strong> представя целия бизнес: кой сте, какво предлагате, портфолио, контакти, и се класира в Google с времето. Ако пускате една оферта с платен трафик, започнете с landing. Ако искате стабилно присъствие, което води клиенти и органично, трябва ви визитен сайт.</p>
<h2>Директно сравнение</h2>
<div class="ctbl"><table><thead><tr><th>Критерий</th><th>Landing page</th><th>Визитен сайт</th></tr></thead><tbody>
<tr><td>Цел</td><td>Едно действие (конверсия)</td><td>Представяне на бизнеса, запитвания</td></tr>
<tr><td>Брой страници</td><td>Една</td><td>5-8 или повече</td></tr>
<tr><td>Цена</td><td>от &euro;500</td><td>от &euro;800</td></tr>
<tr><td>Източник на трафик</td><td>Платени кампании</td><td>Органично SEO + директен</td></tr>
<tr><td>Продължителност</td><td>Обвързана с кампанията</td><td>Стабилно присъствие</td></tr>
<tr><td>Подходящ за</td><td>Стартове, промоции, lead gen</td><td>Фирми, специалисти, кантори</td></tr>
</tbody></table></div>
<h2>Кога стига landing page</h2>
<p>Landing page е хирургически инструмент: една страница, едно послание, един бутон. Премахва разсейване и менюта, за да максимизира конверсиите на посетителите от Google Ads, Meta или бюлетин. Идеална е за пускане на продукт, събиране на регистрации за събитие или тестване на оферта преди инвестиция в пълен сайт. Сама по себе си обаче не ви прави откриваеми в Google за спонтанни търсения и не разказва целия бизнес.</p>
<h2>Кога ви трябва визитен сайт</h2>
<p><a href="/bg/uslugi/web-razrabotka/">Визитният сайт</a> е стабилният ви онлайн дом: няколко страници за услуги, за нас, портфолио и контакти, оптимизирани да се класират в Google и да превръщат посетителите в запитвания с времето. Това е правилната инвестиция, ако искате да ви намират, без да плащате за всеки клик. Често най-добрата стратегия комбинира двете: визитен сайт като база плюс специални landing страници за рекламните кампании.</p>
<h2>Как да изберете</h2>
<p>Запитайте се откъде идва трафикът. Ако плащате реклама и искате конверсии, започнете с landing. Ако искате органичен растеж, изградете сайта и добавете <a href="/bg/uslugi/seo/">SEO</a>. Правим и двете: landing започва от &euro;500, визитен сайт от &euro;800. <a href="/bg/kontakti/">Разкажете ни целта</a> и ще ви кажем откъде да започнете.</p>""",
  faqs=[
   ("Каква е разликата между landing page и визитен сайт?", "Landing page е една страница с една цел за конверсия, създадена за платен трафик. Визитният сайт има няколко страници, представя целия бизнес и се класира органично в Google с времето. Различават се по цел, структура и източник на трафик."),
   ("Landing page достатъчна ли е за моя бизнес?", "Достатъчна е, ако целта ви е да конвертирате посетители от конкретна кампания. Ако искате да ви намират в Google за спонтанни търсения и да представите всичките си услуги, трябва ви визитен сайт."),
   ("Landing page по-евтина ли е от визитен сайт?", "Да. Landing page започва от &euro;500 срещу &euro;800 за визитен сайт, защото е една страница. Но покрива по-тясна цел и не замества пълен сайт."),
   ("Мога ли да имам и landing page, и визитен сайт?", "Да, и това често е най-добрата стратегия: визитният сайт като стабилна SEO база плюс специални landing страници за всяка рекламна кампания. Така оптимизирате и органичната видимост, и платените конверсии."),
  ]),
)),

# 5 ─── app-nativa-vs-flutter ────────────────────────────────────
dict(slug="app-nativa-vs-flutter", section="Mobile Apps",
     related=["saas-vs-software-su-misura", "react-vs-wordpress"], lang=dict(
 it=dict(
  title="App Nativa vs Flutter: Come Sviluppare l'App nel 2026 | Carbon Stealth",
  desc="App nativa o Flutter (cross-platform)? Confronto onesto su costi, prestazioni, tempi e manutenzione per capire come sviluppare la tua app mobile nel 2026.",
  body="""<p><strong>In breve:</strong> <strong>Flutter</strong> (cross-platform) &egrave; la scelta giusta per la maggior parte delle app: un solo codice per iOS e Android significa costi e tempi quasi dimezzati, con prestazioni ottime per app gestionali, e-commerce e servizi. Lo sviluppo <strong>nativo</strong> (Swift per iOS, Kotlin per Android) conviene quando l'app spinge l'hardware al limite &mdash; giochi 3D, realt&agrave; aumentata, elaborazione video &mdash; o quando serve l'ultima funzione di sistema appena uscita. Per il resto, Flutter fa risparmiare senza far notare la differenza all'utente.</p>
<h2>Confronto diretto</h2>
<div class="ctbl"><table><thead><tr><th>Criterio</th><th>Flutter (cross-platform)</th><th>Nativo (Swift/Kotlin)</th></tr></thead><tbody>
<tr><td>Costo</td><td>da &euro;3.000 (un solo codice)</td><td>Fino al doppio (due codebase)</td></tr>
<tr><td>Piattaforme</td><td>iOS + Android insieme</td><td>Una per volta</td></tr>
<tr><td>Prestazioni</td><td>Ottime per la maggior parte delle app</td><td>Massime, accesso hardware totale</td></tr>
<tr><td>Tempi di sviluppo</td><td>Pi&ugrave; rapidi</td><td>Pi&ugrave; lunghi</td></tr>
<tr><td>Manutenzione</td><td>Un solo codice da aggiornare</td><td>Due, in parallelo</td></tr>
<tr><td>Ideale per</td><td>Gestionali, e-commerce, servizi</td><td>Giochi, AR/VR, uso intensivo hardware</td></tr>
</tbody></table></div>
<h2>Quando scegliere Flutter</h2>
<p>Flutter &egrave; il framework di Google per creare app da un unico codice che gira su iOS e Android con la stessa interfaccia. Il vantaggio economico &egrave; enorme: sviluppi e mantieni una sola app invece di due, con tempi e costi molto pi&ugrave; bassi. Le prestazioni sono eccellenti per la stragrande maggioranza dei casi &mdash; app aziendali, negozi, prenotazioni, servizi &mdash; e l'utente non nota alcuna differenza rispetto a un'app nativa.</p>
<h2>Quando scegliere il nativo</h2>
<p>Lo sviluppo nativo usa i linguaggi ufficiali di ogni piattaforma: Swift per iOS, Kotlin per Android. Garantisce l'accesso pi&ugrave; diretto e completo all'hardware e alle ultime funzioni di sistema, con le massime prestazioni possibili. &Egrave; la scelta giusta per giochi 3D, app di realt&agrave; aumentata, editing video pesante o quando devi integrare subito una novit&agrave; appena rilasciata da Apple o Google. Il prezzo di questa potenza &egrave; il doppio lavoro: due codebase da scrivere e mantenere.</p>
<h2>Come scegliere</h2>
<p>Parti dalla natura dell'app. Se &egrave; un gestionale, un e-commerce o un servizio, Flutter &egrave; quasi sempre la scelta pi&ugrave; efficiente: il nostro <a href="/servizi/app-mobile/">servizio di sviluppo app</a> parte da &euro;3.000. Se l'app spinge l'hardware al limite, valutiamo il nativo. Spesso l'app si appoggia a un backend o a un <a href="/servizi/sviluppo-software/">software su misura</a>: ne teniamo conto fin dal preventivo.</p>""",
  faqs=[
   ("Flutter e piu economico dello sviluppo nativo?", "Si, di solito. Con Flutter scrivi un solo codice per iOS e Android invece di due, quindi costi e tempi si riducono in modo netto, spesso quasi della meta. Per questo un'app cross-platform parte da &euro;3.000."),
   ("Un'app Flutter e piu lenta di una nativa?", "Per la stragrande maggioranza delle app la differenza non e percepibile: Flutter offre prestazioni ottime. Il nativo mantiene un vantaggio solo in scenari estremi come giochi 3D, realta aumentata o elaborazione hardware intensiva."),
   ("Quando conviene davvero lo sviluppo nativo?", "Quando l'app sfrutta l'hardware al massimo (giochi, AR/VR, video), quando servono le ultime funzioni di sistema appena rilasciate o quando le prestazioni assolute sono un requisito critico. Negli altri casi Flutter e piu efficiente."),
   ("Con Flutter pubblico su App Store e Google Play?", "Si. Da un unico progetto Flutter si generano le app per entrambi gli store, iOS e Android. Gestiamo build, firma e pubblicazione su App Store e Google Play come parte del progetto."),
  ]),
 en=dict(
  title="Native App vs Flutter: How to Build Your App in 2026 | Carbon Stealth",
  desc="Native app or Flutter (cross-platform)? An honest comparison of cost, performance, time and maintenance to decide how to build your mobile app in 2026.",
  body="""<p><strong>In short:</strong> <strong>Flutter</strong> (cross-platform) is the right choice for most apps: one codebase for iOS and Android means nearly half the cost and time, with excellent performance for business, e-commerce and service apps. <strong>Native</strong> development (Swift for iOS, Kotlin for Android) makes sense when the app pushes the hardware to its limit &mdash; 3D games, augmented reality, video processing &mdash; or when you need the latest OS feature the day it ships. Otherwise, Flutter saves money without the user ever noticing the difference.</p>
<h2>Head-to-head comparison</h2>
<div class="ctbl"><table><thead><tr><th>Criterion</th><th>Flutter (cross-platform)</th><th>Native (Swift/Kotlin)</th></tr></thead><tbody>
<tr><td>Cost</td><td>from &euro;3,000 (one codebase)</td><td>Up to double (two codebases)</td></tr>
<tr><td>Platforms</td><td>iOS + Android together</td><td>One at a time</td></tr>
<tr><td>Performance</td><td>Excellent for most apps</td><td>Maximum, full hardware access</td></tr>
<tr><td>Development time</td><td>Faster</td><td>Longer</td></tr>
<tr><td>Maintenance</td><td>One codebase to update</td><td>Two, in parallel</td></tr>
<tr><td>Best for</td><td>Business, e-commerce, services</td><td>Games, AR/VR, heavy hardware use</td></tr>
</tbody></table></div>
<h2>When to choose Flutter</h2>
<p>Flutter is Google's framework for building apps from a single codebase that runs on iOS and Android with the same interface. The cost advantage is huge: you develop and maintain one app instead of two, at much lower time and expense. Performance is excellent for the vast majority of cases &mdash; business apps, shops, bookings, services &mdash; and the user notices no difference from a native app.</p>
<h2>When to choose native</h2>
<p>Native development uses each platform's official languages: Swift for iOS, Kotlin for Android. It gives the most direct, complete access to hardware and the latest OS features, with the highest possible performance. It's the right call for 3D games, augmented reality apps, heavy video editing or when you must integrate a feature Apple or Google just released. The price of that power is double the work: two codebases to write and maintain.</p>
<h2>How to choose</h2>
<p>Start from the nature of the app. If it's a business tool, an e-commerce or a service, Flutter is almost always the more efficient choice: our <a href="/en/services/mobile-apps/">app development service</a> starts at &euro;3,000. If the app pushes the hardware to its limit, we'll weigh native. Apps often rely on a backend or <a href="/en/services/software-development/">custom software</a>: we factor that in from the quote.</p>""",
  faqs=[
   ("Is Flutter cheaper than native development?", "Usually yes. With Flutter you write one codebase for iOS and Android instead of two, so cost and time drop sharply, often by nearly half. That's why a cross-platform app starts at &euro;3,000."),
   ("Is a Flutter app slower than a native one?", "For the vast majority of apps the difference isn't noticeable: Flutter offers excellent performance. Native keeps an edge only in extreme scenarios like 3D games, augmented reality or intensive hardware processing."),
   ("When is native development really worth it?", "When the app uses hardware to the max (games, AR/VR, video), when you need the latest OS features the moment they ship, or when absolute performance is a critical requirement. Otherwise Flutter is more efficient."),
   ("Does Flutter publish to the App Store and Google Play?", "Yes. From a single Flutter project you generate apps for both stores, iOS and Android. We handle build, signing and publishing to the App Store and Google Play as part of the project."),
  ]),
 bg=dict(
  title="Нативно Приложение срещу Flutter: Как да Разработите 2026 | Carbon Stealth",
  desc="Нативно приложение или Flutter (cross-platform)? Честно сравнение на цена, производителност, срокове и поддръжка как да разработите мобилното си приложение 2026.",
  body="""<p><strong>Накратко:</strong> <strong>Flutter</strong> (cross-platform) е правилният избор за повечето приложения: един код за iOS и Android означава почти наполовина по-малко разходи и време, с отлична производителност за бизнес, e-commerce и услуги. <strong>Нативната</strong> разработка (Swift за iOS, Kotlin за Android) има смисъл, когато приложението натоварва хардуера до предел &mdash; 3D игри, добавена реалност, обработка на видео &mdash; или когато ви трябва най-новата системна функция в деня на излизането ѝ. Иначе Flutter спестява пари, без потребителят изобщо да усети разлика.</p>
<h2>Директно сравнение</h2>
<div class="ctbl"><table><thead><tr><th>Критерий</th><th>Flutter (cross-platform)</th><th>Нативно (Swift/Kotlin)</th></tr></thead><tbody>
<tr><td>Разход</td><td>от &euro;3000 (един код)</td><td>До двойно (две codebase)</td></tr>
<tr><td>Платформи</td><td>iOS + Android заедно</td><td>Една по една</td></tr>
<tr><td>Производителност</td><td>Отлична за повечето приложения</td><td>Максимална, пълен достъп до хардуер</td></tr>
<tr><td>Време за разработка</td><td>По-бързо</td><td>По-дълго</td></tr>
<tr><td>Поддръжка</td><td>Един код за обновяване</td><td>Два, паралелно</td></tr>
<tr><td>Подходящо за</td><td>Бизнес, e-commerce, услуги</td><td>Игри, AR/VR, интензивен хардуер</td></tr>
</tbody></table></div>
<h2>Кога да изберете Flutter</h2>
<p>Flutter е фреймуъркът на Google за създаване на приложения от един код, който работи на iOS и Android с еднакъв интерфейс. Икономическото предимство е огромно: разработвате и поддържате едно приложение вместо две, с много по-малко време и разходи. Производителността е отлична за огромното мнозинство случаи &mdash; бизнес приложения, магазини, резервации, услуги &mdash; и потребителят не усеща разлика спрямо нативно приложение.</p>
<h2>Кога да изберете нативно</h2>
<p>Нативната разработка използва официалните езици на всяка платформа: Swift за iOS, Kotlin за Android. Дава най-директния и пълен достъп до хардуера и най-новите системни функции, с максимална производителност. Правилен избор е за 3D игри, приложения с добавена реалност, тежко видео редактиране или когато трябва веднага да интегрирате функция, току-що пусната от Apple или Google. Цената на тази мощ е двойната работа: две codebase за писане и поддръжка.</p>
<h2>Как да изберете</h2>
<p>Тръгнете от естеството на приложението. Ако е бизнес инструмент, e-commerce или услуга, Flutter почти винаги е по-ефективният избор: нашата <a href="/bg/uslugi/mobilni-prilozheniya/">услуга за разработка на приложения</a> започва от &euro;3000. Ако приложението натоварва хардуера до предел, ще преценим нативно. Приложенията често разчитат на backend или <a href="/bg/uslugi/softuer/">софтуер по поръчка</a>: отчитаме го още в офертата.</p>""",
  faqs=[
   ("Flutter по-евтин ли е от нативната разработка?", "Обикновено да. С Flutter пишете един код за iOS и Android вместо два, така че разходите и времето намаляват рязко, често почти наполовина. Затова cross-platform приложение започва от &euro;3000."),
   ("Flutter приложение по-бавно ли е от нативно?", "За огромното мнозинство приложения разликата не се усеща: Flutter дава отлична производителност. Нативното запазва предимство само в екстремни сценарии като 3D игри, добавена реалност или интензивна хардуерна обработка."),
   ("Кога наистина си струва нативната разработка?", "Когато приложението използва хардуера максимално (игри, AR/VR, видео), когато ви трябват най-новите системни функции в момента на излизането им или когато абсолютната производителност е критично изискване. Иначе Flutter е по-ефективен."),
   ("С Flutter публикувам ли в App Store и Google Play?", "Да. От един Flutter проект се генерират приложения за двата магазина, iOS и Android. Поемаме build, подписване и публикуване в App Store и Google Play като част от проекта."),
  ]),
)),

# 6 ─── wordpress-vs-webflow ─────────────────────────────────────
dict(slug="wordpress-vs-webflow", section="Web Development",
     related=["wordpress-vs-headless", "react-vs-wordpress"], lang=dict(
 it=dict(
  title="WordPress vs Webflow: Quale Scegliere nel 2026 | Carbon Stealth",
  desc="WordPress o Webflow per il tuo sito? Confronto onesto su costi, liberta, SEO, canoni e proprieta, per capire quale piattaforma conviene davvero nel 2026.",
  body="""<p><strong>In breve:</strong> scegli <strong>WordPress</strong> se vuoi il pieno controllo, nessun canone obbligatorio della piattaforma e libert&agrave; totale su funzioni e crescita: &egrave; l'opzione pi&ugrave; economica e flessibile nel tempo. Scegli <strong>Webflow</strong> se cerchi un design molto curato con animazioni raffinate e ti va bene pagare un abbonamento mensile in cambio di zero manutenzione tecnica. Per la maggior parte delle aziende WordPress resta la scelta pi&ugrave; conveniente; Webflow brilla su siti vetrina dal forte impatto visivo.</p>
<h2>Confronto diretto</h2>
<div class="ctbl"><table><thead><tr><th>Criterio</th><th>WordPress</th><th>Webflow</th></tr></thead><tbody>
<tr><td>Costo iniziale</td><td>da &euro;800</td><td>da &euro;800 + canone</td></tr>
<tr><td>Canone piattaforma</td><td>Nessuno (solo hosting)</td><td>Da ~&euro;14-39/mese per sito</td></tr>
<tr><td>Propriet&agrave;</td><td>Totale, codice tuo</td><td>Legata alla piattaforma</td></tr>
<tr><td>Funzioni ed estensioni</td><td>Illimitate (plugin, codice)</td><td>Limitate all'ecosistema Webflow</td></tr>
<tr><td>Manutenzione</td><td>Aggiornamenti da gestire</td><td>Gestita da Webflow</td></tr>
<tr><td>Design e animazioni</td><td>Ottimo con tema su misura</td><td>Eccellente, controllo visuale fine</td></tr>
</tbody></table></div>
<h2>Quando scegliere WordPress</h2>
<p>WordPress &egrave; open source: paghi solo l'hosting e il sito &egrave; davvero tuo, senza vincoli. Puoi aggiungere qualsiasi funzione &mdash; e-commerce, prenotazioni, multilingua, integrazioni con gestionali &mdash; e non dipendi da un canone che cresce sito dopo sito. &Egrave; la scelta giusta per chi vuole un progetto scalabile e la massima libert&agrave; nel tempo. In cambio, qualcuno deve occuparsi di aggiornamenti, backup e sicurezza.</p>
<h2>Quando scegliere Webflow</h2>
<p>Webflow &egrave; una piattaforma visuale che permette di realizzare siti dal design molto curato con animazioni raffinate, senza gestire server o aggiornamenti. Hosting, sicurezza e CDN sono inclusi nel canone. &Egrave; ottimo per siti vetrina e portfolio dove l'impatto visivo &egrave; centrale e non servono funzioni complesse. I limiti: un abbonamento per ogni sito, un ecosistema di estensioni pi&ugrave; ristretto e un certo lock-in, perch&eacute; portare altrove un progetto Webflow non &egrave; immediato.</p>
<h2>Come scegliere</h2>
<p>Chiediti quanto conta la libert&agrave; a lungo termine rispetto alla comodit&agrave; immediata. Se vuoi un sito tuo, estendibile e senza canoni crescenti, il nostro <a href="/servizi/sviluppo-siti-web/">servizio di sviluppo siti web</a> su WordPress parte da &euro;800. Se punti su un design d'impatto e non ti pesa l'abbonamento, Webflow &egrave; valido. In entrambi i casi la <a href="/servizi/seo/">SEO</a> tecnica decide quanto ti trova Google.</p>""",
  faqs=[
   ("WordPress o Webflow: quale e migliore per la SEO?", "Entrambi possono posizionarsi bene. WordPress offre plugin SEO maturi e controllo totale su URL e dati strutturati; Webflow genera codice pulito e veloce. La differenza la fa l'ottimizzazione, non la piattaforma."),
   ("Webflow ha un canone obbligatorio?", "Si. Webflow richiede un abbonamento mensile per ogni sito pubblicato (indicativamente da &euro;14 a &euro;39 al mese secondo il piano). WordPress non ha canone di piattaforma: paghi solo l'hosting."),
   ("Posso spostare un sito da Webflow a WordPress?", "Si, ma non e immediato: il codice esportabile da Webflow e limitato e il sito va sostanzialmente ricostruito su WordPress. Per questo il lock-in e un fattore da considerare prima di scegliere Webflow."),
   ("Webflow e piu facile da aggiornare di WordPress?", "Per modifiche visuali Webflow e molto immediato. WordPress e altrettanto semplice per i contenuti tramite il suo editor, ma piu potente quando servono funzioni aggiuntive. Dipende da cosa devi fare piu spesso."),
  ]),
 en=dict(
  title="WordPress vs Webflow: Which to Choose in 2026 | Carbon Stealth",
  desc="WordPress or Webflow for your site? An honest comparison of cost, freedom, SEO, fees and ownership, to see which platform actually pays off in 2026.",
  body="""<p><strong>In short:</strong> choose <strong>WordPress</strong> if you want full control, no mandatory platform fee and total freedom over features and growth: it's the cheaper, more flexible option over time. Choose <strong>Webflow</strong> if you want a highly polished design with refined animations and you're fine paying a monthly subscription for zero technical maintenance. For most businesses WordPress remains the more cost-effective choice; Webflow shines on visually striking brochure sites.</p>
<h2>Head-to-head comparison</h2>
<div class="ctbl"><table><thead><tr><th>Criterion</th><th>WordPress</th><th>Webflow</th></tr></thead><tbody>
<tr><td>Upfront cost</td><td>from &euro;800</td><td>from &euro;800 + fee</td></tr>
<tr><td>Platform fee</td><td>None (hosting only)</td><td>From ~&euro;14-39/mo per site</td></tr>
<tr><td>Ownership</td><td>Total, your code</td><td>Tied to the platform</td></tr>
<tr><td>Features and extensions</td><td>Unlimited (plugins, code)</td><td>Limited to Webflow's ecosystem</td></tr>
<tr><td>Maintenance</td><td>Updates to manage</td><td>Handled by Webflow</td></tr>
<tr><td>Design and animation</td><td>Great with a custom theme</td><td>Excellent, fine visual control</td></tr>
</tbody></table></div>
<h2>When to choose WordPress</h2>
<p>WordPress is open source: you pay only for hosting and the site is genuinely yours, with no lock-in. You can add any feature &mdash; e-commerce, bookings, multilingual, ERP integrations &mdash; and you don't depend on a fee that grows site after site. It's the right choice for a scalable project and maximum long-term freedom. In return, someone has to handle updates, backups and security.</p>
<h2>When to choose Webflow</h2>
<p>Webflow is a visual platform for building highly polished sites with refined animations, without managing servers or updates. Hosting, security and CDN are included in the fee. It's great for brochure sites and portfolios where visual impact is central and complex features aren't needed. The limits: a subscription per site, a narrower extension ecosystem and some lock-in, since moving a Webflow project elsewhere isn't straightforward.</p>
<h2>How to choose</h2>
<p>Ask how much long-term freedom matters versus immediate convenience. If you want a site that's yours, extensible and free of growing fees, our <a href="/en/services/web-development/">web development service</a> on WordPress starts at &euro;800. If you're after striking design and don't mind the subscription, Webflow is solid. Either way, technical <a href="/en/services/seo/">SEO</a> decides how well Google finds you.</p>""",
  faqs=[
   ("WordPress or Webflow: which is better for SEO?", "Both can rank well. WordPress offers mature SEO plugins and full control over URLs and structured data; Webflow generates clean, fast code. Optimization makes the difference, not the platform."),
   ("Does Webflow have a mandatory fee?", "Yes. Webflow requires a monthly subscription for every published site (roughly &euro;14 to &euro;39 a month depending on the plan). WordPress has no platform fee: you pay only for hosting."),
   ("Can I move a site from Webflow to WordPress?", "Yes, but it's not seamless: the code you can export from Webflow is limited and the site essentially has to be rebuilt on WordPress. That's why lock-in is a factor to weigh before choosing Webflow."),
   ("Is Webflow easier to update than WordPress?", "For visual edits Webflow is very immediate. WordPress is just as simple for content through its editor, and more powerful when you need extra features. It depends on what you'll do most often."),
  ]),
 bg=dict(
  title="WordPress срещу Webflow: Кое да Изберете през 2026 | Carbon Stealth",
  desc="WordPress или Webflow за вашия сайт? Честно сравнение на цена, свобода, SEO, такси и собственост, за да разберете коя платформа наистина си струва през 2026.",
  body="""<p><strong>Накратко:</strong> изберете <strong>WordPress</strong>, ако искате пълен контрол, без задължителна такса за платформа и пълна свобода над функции и растеж: това е по-евтината и по-гъвкава опция във времето. Изберете <strong>Webflow</strong>, ако търсите много изчистен дизайн с изтънчени анимации и сте съгласни да плащате месечен абонамент срещу нулева техническа поддръжка. За повечето фирми WordPress остава по-изгодният избор; Webflow блести при визуално впечатляващи визитни сайтове.</p>
<h2>Директно сравнение</h2>
<div class="ctbl"><table><thead><tr><th>Критерий</th><th>WordPress</th><th>Webflow</th></tr></thead><tbody>
<tr><td>Начален разход</td><td>от &euro;800</td><td>от &euro;800 + такса</td></tr>
<tr><td>Такса за платформа</td><td>Няма (само хостинг)</td><td>От ~&euro;14-39/мес на сайт</td></tr>
<tr><td>Собственост</td><td>Пълна, кодът е ваш</td><td>Обвързана с платформата</td></tr>
<tr><td>Функции и разширения</td><td>Неограничени (плъгини, код)</td><td>Ограничени до екосистемата Webflow</td></tr>
<tr><td>Поддръжка</td><td>Обновления за управление</td><td>Поема се от Webflow</td></tr>
<tr><td>Дизайн и анимации</td><td>Отличен с тема по поръчка</td><td>Отличен, фин визуален контрол</td></tr>
</tbody></table></div>
<h2>Кога да изберете WordPress</h2>
<p>WordPress е open source: плащате само хостинг и сайтът е наистина ваш, без обвързване. Можете да добавите всякаква функция &mdash; e-commerce, резервации, многоезичност, интеграции със складови системи &mdash; и не зависите от такса, която расте сайт след сайт. Правилен избор е за мащабируем проект и максимална дългосрочна свобода. В замяна някой трябва да поеме обновленията, резервните копия и сигурността.</p>
<h2>Кога да изберете Webflow</h2>
<p>Webflow е визуална платформа за изграждане на изчистени сайтове с изтънчени анимации, без управление на сървъри или обновления. Хостинг, сигурност и CDN са включени в таксата. Отличен е за визитни сайтове и портфолиа, където визуалното въздействие е централно и не са нужни сложни функции. Ограниченията: абонамент за всеки сайт, по-тясна екосистема от разширения и известно обвързване, защото преместването на Webflow проект другаде не е лесно.</p>
<h2>Как да изберете</h2>
<p>Запитайте се колко тежи дългосрочната свобода спрямо моментното удобство. Ако искате сайт, който е ваш, разширяем и без растящи такси, нашата <a href="/bg/uslugi/web-razrabotka/">услуга за изработка на сайтове</a> на WordPress започва от &euro;800. Ако търсите впечатляващ дизайн и абонаментът не ви пречи, Webflow е добър. И в двата случая техническото <a href="/bg/uslugi/seo/">SEO</a> решава колко добре ви намира Google.</p>""",
  faqs=[
   ("WordPress или Webflow: кое е по-добро за SEO?", "И двете могат да се класират добре. WordPress предлага зрели SEO плъгини и пълен контрол над URL и структурирани данни; Webflow генерира чист и бърз код. Разликата я прави оптимизацията, не платформата."),
   ("Webflow има ли задължителна такса?", "Да. Webflow изисква месечен абонамент за всеки публикуван сайт (ориентировъчно от &euro;14 до &euro;39 на месец според плана). WordPress няма такса за платформа: плащате само хостинг."),
   ("Мога ли да преместя сайт от Webflow към WordPress?", "Да, но не е безпроблемно: изнесеният от Webflow код е ограничен и сайтът по същество трябва да се изгради наново на WordPress. Затова обвързването е фактор, който да прецените преди да изберете Webflow."),
   ("Webflow по-лесен ли е за обновяване от WordPress?", "За визуални промени Webflow е много непосредствен. WordPress е също толкова лесен за съдържание чрез редактора си и по-мощен, когато трябват допълнителни функции. Зависи какво ще правите най-често."),
  ]),
)),

# 7 ─── saas-vs-software-su-misura ───────────────────────────────
dict(slug="saas-vs-software-su-misura", section="Software Development",
     related=["hosting-condiviso-vs-vps", "shopify-vs-magento"], lang=dict(
 it=dict(
  title="SaaS vs Software su Misura: Cosa Scegliere nel 2026 | Carbon Stealth",
  desc="SaaS pronto o software su misura? Confronto onesto su costi, tempi, controllo e proprieta, per capire quando conviene un gestionale in abbonamento o su misura.",
  body="""<p><strong>In breve:</strong> parti da un <strong>SaaS</strong> (software in abbonamento gi&agrave; pronto) quando le tue esigenze sono standard e vuoi essere operativo subito, con costi iniziali bassi. Passa al <strong>software su misura</strong> quando i tuoi processi sono specifici, il canone per utente diventa pesante man mano che cresci, o hai bisogno di integrazioni e controllo che il SaaS non offre. Molte aziende partono in SaaS e costruiscono su misura quando il gestionale standard inizia a costare di pi&ugrave; di quanto rende.</p>
<h2>Confronto diretto</h2>
<div class="ctbl"><table><thead><tr><th>Criterio</th><th>SaaS (in abbonamento)</th><th>Software su misura</th></tr></thead><tbody>
<tr><td>Costo iniziale</td><td>Basso (canone mensile)</td><td>da &euro;2.000</td></tr>
<tr><td>Costo nel tempo</td><td>Cresce con utenti e funzioni</td><td>Fisso una tantum + manutenzione</td></tr>
<tr><td>Tempi</td><td>Operativo subito</td><td>Settimane / mesi</td></tr>
<tr><td>Personalizzazione</td><td>Limitata alle opzioni previste</td><td>Totale, sui tuoi processi</td></tr>
<tr><td>Propriet&agrave; e dati</td><td>Del fornitore</td><td>Tuoi</td></tr>
<tr><td>Ideale per</td><td>Esigenze standard, avvio rapido</td><td>Processi specifici, scala</td></tr>
</tbody></table></div>
<h2>Quando scegliere il SaaS</h2>
<p>Un SaaS &egrave; un software gi&agrave; pronto che usi pagando un abbonamento: CRM, fatturazione, gestione progetti, help desk. Il vantaggio &egrave; l'immediatezza &mdash; sei operativo in giornata &mdash; e un costo iniziale quasi nullo. &Egrave; la scelta giusta quando le tue esigenze rientrano in quelle standard del mercato e non hai processi particolari. Il limite emerge con la crescita: il canone per utente si moltiplica, e ti adatti tu al software, non il contrario.</p>
<h2>Quando scegliere il software su misura</h2>
<p>Un <a href="/servizi/sviluppo-software/">software su misura</a> viene costruito sui tuoi processi reali: fa esattamente ci&ograve; che ti serve, si integra con gli strumenti che gi&agrave; usi e i dati restano tuoi. L'investimento iniziale &egrave; pi&ugrave; alto (da &euro;2.000, e da &euro;5.000 per un <a href="/servizi/erp/">ERP</a> completo), ma non paghi un canone crescente per utente e il valore resta nel tempo. &Egrave; la scelta giusta quando il tuo modo di lavorare &egrave; un vantaggio competitivo che nessun software pronto rispecchia.</p>
<h2>Come scegliere</h2>
<p>Fai il conto sul medio periodo, non solo sul primo mese. Somma il canone SaaS per il numero di utenti che avrai tra due o tre anni e confrontalo con un progetto su misura pagato una volta. Se i tuoi processi sono standard e piccoli, il SaaS vince. Se sono specifici o scali in fretta, il su misura ripaga. <a href="/contatti/">Raccontaci come lavori</a> e facciamo insieme il conto onesto.</p>""",
  faqs=[
   ("Conviene un SaaS o un software su misura?", "Il SaaS conviene per esigenze standard e avvio rapido, con costo iniziale basso. Il software su misura conviene quando i processi sono specifici o quando il canone per utente, moltiplicato dalla crescita, supera il costo di un progetto proprio. Dipende dalla scala e dalla specificita."),
   ("Il software su misura costa sempre di piu?", "All'inizio si: parte da &euro;2.000 contro il canone contenuto di un SaaS. Ma sul medio periodo il su misura non ha canoni per utente crescenti, quindi spesso costa meno in totale per aziende che scalano o hanno molti utenti."),
   ("Con un software su misura i dati sono miei?", "Si. Con il software su misura possiedi il codice e i dati, che risiedono dove decidi tu. Con un SaaS i dati stanno sui server del fornitore e sei legato alle sue condizioni e ai suoi prezzi."),
   ("Posso partire in SaaS e passare al su misura dopo?", "Si, ed e un percorso comune. Molte aziende validano il processo con un SaaS e costruiscono un software su misura quando il gestionale standard inizia a limitarle o a costare troppo. I dati si possono migrare."),
  ]),
 en=dict(
  title="SaaS vs Custom Software: What to Choose in 2026 | Carbon Stealth",
  desc="Ready-made SaaS or custom software? An honest comparison of cost, time, control and ownership, to see when a subscription tool or a custom build pays off.",
  body="""<p><strong>In short:</strong> start with a <strong>SaaS</strong> (a ready-made subscription tool) when your needs are standard and you want to be operational immediately, with low upfront cost. Move to <strong>custom software</strong> when your processes are specific, the per-user fee gets heavy as you grow, or you need integrations and control the SaaS can't offer. Many companies start on SaaS and build custom when the off-the-shelf tool starts costing more than it returns.</p>
<h2>Head-to-head comparison</h2>
<div class="ctbl"><table><thead><tr><th>Criterion</th><th>SaaS (subscription)</th><th>Custom software</th></tr></thead><tbody>
<tr><td>Upfront cost</td><td>Low (monthly fee)</td><td>from &euro;2,000</td></tr>
<tr><td>Cost over time</td><td>Grows with users and features</td><td>Fixed one-off + maintenance</td></tr>
<tr><td>Time</td><td>Live immediately</td><td>Weeks / months</td></tr>
<tr><td>Customization</td><td>Limited to built-in options</td><td>Total, on your processes</td></tr>
<tr><td>Ownership and data</td><td>The vendor's</td><td>Yours</td></tr>
<tr><td>Best for</td><td>Standard needs, quick start</td><td>Specific processes, scale</td></tr>
</tbody></table></div>
<h2>When to choose SaaS</h2>
<p>A SaaS is a ready-made tool you use by paying a subscription: CRM, invoicing, project management, help desk. The advantage is immediacy &mdash; you're up and running the same day &mdash; and near-zero upfront cost. It's the right choice when your needs fit the market standard and you have no unusual processes. The limit shows up with growth: the per-user fee multiplies, and you adapt to the software, not the other way around.</p>
<h2>When to choose custom software</h2>
<p>A piece of <a href="/en/services/software-development/">custom software</a> is built around your real processes: it does exactly what you need, integrates with the tools you already use and keeps your data yours. The upfront investment is higher (from &euro;2,000, and from &euro;5,000 for a full <a href="/en/services/erp/">ERP</a>), but you pay no growing per-user fee and the value lasts. It's the right choice when the way you work is a competitive edge no off-the-shelf tool reflects.</p>
<h2>How to choose</h2>
<p>Do the math over the medium term, not just the first month. Add up the SaaS fee for the number of users you'll have in two or three years and compare it with a custom project paid once. If your processes are standard and small, SaaS wins. If they're specific or you scale fast, custom pays off. <a href="/en/contact/">Tell us how you work</a> and we'll run the honest numbers together.</p>""",
  faqs=[
   ("Is SaaS or custom software the better choice?", "SaaS is better for standard needs and a quick start, with low upfront cost. Custom software is better when processes are specific or when the per-user fee, multiplied by growth, exceeds the cost of building your own. It depends on scale and specificity."),
   ("Does custom software always cost more?", "Upfront yes: it starts at &euro;2,000 versus a modest SaaS fee. But over the medium term custom has no growing per-user fees, so it often costs less in total for companies that scale or have many users."),
   ("With custom software, is the data mine?", "Yes. With custom software you own the code and the data, which live wherever you decide. With a SaaS the data sits on the vendor's servers and you're bound by their terms and pricing."),
   ("Can I start on SaaS and move to custom later?", "Yes, and it's a common path. Many companies validate the process on a SaaS and build custom software when the off-the-shelf tool starts limiting them or costing too much. The data can be migrated."),
  ]),
 bg=dict(
  title="SaaS срещу Софтуер по Поръчка: Какво да Изберете 2026 | Carbon Stealth",
  desc="Готов SaaS или софтуер по поръчка? Честно сравнение на цена, срокове, контрол и собственост, кога си струва абонаментен инструмент и кога решение по поръчка.",
  body="""<p><strong>Накратко:</strong> започнете със <strong>SaaS</strong> (готов абонаментен инструмент), когато нуждите ви са стандартни и искате да сте оперативни веднага, с нисък начален разход. Преминете към <strong>софтуер по поръчка</strong>, когато процесите ви са специфични, таксата на потребител натежава с растежа или ви трябват интеграции и контрол, които SaaS не предлага. Много фирми започват със SaaS и изграждат по поръчка, когато готовият инструмент започне да струва повече, отколкото носи.</p>
<h2>Директно сравнение</h2>
<div class="ctbl"><table><thead><tr><th>Критерий</th><th>SaaS (абонамент)</th><th>Софтуер по поръчка</th></tr></thead><tbody>
<tr><td>Начален разход</td><td>Нисък (месечна такса)</td><td>от &euro;2000</td></tr>
<tr><td>Разход във времето</td><td>Расте с потребители и функции</td><td>Фиксиран еднократно + поддръжка</td></tr>
<tr><td>Срок</td><td>Оперативен веднага</td><td>Седмици / месеци</td></tr>
<tr><td>Персонализация</td><td>Ограничена до вградените опции</td><td>Пълна, по вашите процеси</td></tr>
<tr><td>Собственост и данни</td><td>На доставчика</td><td>Ваши</td></tr>
<tr><td>Подходящ за</td><td>Стандартни нужди, бърз старт</td><td>Специфични процеси, мащаб</td></tr>
</tbody></table></div>
<h2>Кога да изберете SaaS</h2>
<p>SaaS е готов инструмент, който ползвате срещу абонамент: CRM, фактуриране, управление на проекти, help desk. Предимството е непосредствеността &mdash; работите още същия ден &mdash; и почти нулев начален разход. Правилен избор е, когато нуждите ви се вписват в пазарния стандарт и нямате специфични процеси. Ограничението идва с растежа: таксата на потребител се умножава и вие се адаптирате към софтуера, а не обратното.</p>
<h2>Кога да изберете софтуер по поръчка</h2>
<p><a href="/bg/uslugi/softuer/">Софтуерът по поръчка</a> се изгражда около реалните ви процеси: прави точно това, което ви трябва, интегрира се с инструментите, които вече ползвате, и данните остават ваши. Началната инвестиция е по-висока (от &euro;2000, а от &euro;5000 за пълна <a href="/bg/uslugi/erp/">ERP</a> система), но не плащате растяща такса на потребител и стойността остава във времето. Правилен избор е, когато начинът ви на работа е конкурентно предимство, което никой готов инструмент не отразява.</p>
<h2>Как да изберете</h2>
<p>Направете сметката в средносрочен план, не само за първия месец. Съберете SaaS таксата за броя потребители, които ще имате след две-три години, и я сравнете с проект по поръчка, платен веднъж. Ако процесите ви са стандартни и малки, SaaS печели. Ако са специфични или растете бързо, по поръчка се изплаща. <a href="/bg/kontakti/">Разкажете ни как работите</a> и ще направим честната сметка заедно.</p>""",
  faqs=[
   ("SaaS или софтуер по поръчка е по-добрият избор?", "SaaS е по-добър за стандартни нужди и бърз старт, с нисък начален разход. Софтуерът по поръчка е по-добър, когато процесите са специфични или когато таксата на потребител, умножена от растежа, надхвърли цената на собствено решение. Зависи от мащаба и спецификата."),
   ("Софтуерът по поръчка винаги ли струва повече?", "В началото да: започва от &euro;2000 срещу скромната SaaS такса. Но в средносрочен план по поръчка няма растящи такси на потребител, така че често струва по-малко общо за фирми, които растат или имат много потребители."),
   ("При софтуер по поръчка данните мои ли са?", "Да. При софтуер по поръчка притежавате кода и данните, които се намират там, където решите. При SaaS данните са на сървърите на доставчика и сте обвързани с неговите условия и цени."),
   ("Мога ли да започна със SaaS и да мина към по поръчка после?", "Да, и това е често срещан път. Много фирми валидират процеса със SaaS и изграждат софтуер по поръчка, когато готовият инструмент започне да ги ограничава или да струва твърде много. Данните могат да се мигрират."),
  ]),
)),

# 8 ─── hosting-condiviso-vs-vps ─────────────────────────────────
dict(slug="hosting-condiviso-vs-vps", section="Hosting",
     related=["saas-vs-software-su-misura", "wordpress-vs-headless"], lang=dict(
 it=dict(
  title="Hosting Condiviso vs VPS: Quale Scegliere nel 2026 | Carbon Stealth",
  desc="Hosting condiviso o VPS? Confronto onesto su costi, prestazioni, sicurezza e scalabilita, per capire quando basta il condiviso e quando serve un VPS nel 2026.",
  body="""<p><strong>In breve:</strong> l'<strong>hosting condiviso</strong> va benissimo per siti vetrina, blog e piccoli e-commerce con traffico contenuto: costa poco e non richiede competenze tecniche. Il <strong>VPS</strong> (server privato virtuale) conviene quando il sito cresce, il traffico aumenta o servono prestazioni, sicurezza e controllo che il condiviso non pu&ograve; garantire. Se il tuo sito &egrave; nuovo o piccolo, parti dal condiviso; quando inizia a rallentare sotto carico, &egrave; il segnale per passare al VPS.</p>
<h2>Confronto diretto</h2>
<div class="ctbl"><table><thead><tr><th>Criterio</th><th>Hosting condiviso</th><th>VPS</th></tr></thead><tbody>
<tr><td>Costo</td><td>Basso (pochi euro/mese)</td><td>da &euro;29/mese</td></tr>
<tr><td>Risorse</td><td>Condivise con altri siti</td><td>Dedicate e garantite</td></tr>
<tr><td>Prestazioni</td><td>Buone a basso traffico</td><td>Stabili anche sotto carico</td></tr>
<tr><td>Sicurezza e isolamento</td><td>Limitati (ambiente condiviso)</td><td>Ambiente isolato</td></tr>
<tr><td>Controllo tecnico</td><td>Minimo</td><td>Totale (root/configurazione)</td></tr>
<tr><td>Ideale per</td><td>Siti vetrina, blog, piccoli shop</td><td>E-commerce, traffico alto, app</td></tr>
</tbody></table></div>
<h2>Quando basta l'hosting condiviso</h2>
<p>Nell'hosting condiviso pi&ugrave; siti convivono sullo stesso server e ne condividono le risorse. Il costo &egrave; molto basso e la gestione &egrave; quasi nulla: il provider si occupa di tutto. &Egrave; la scelta giusta per siti vetrina, blog e piccoli e-commerce con traffico modesto. Il limite &egrave; che, se un altro sito sullo stesso server consuma troppo, le tue prestazioni possono risentirne, e hai poco controllo sulla configurazione.</p>
<h2>Quando serve un VPS</h2>
<p>Un VPS ti assegna risorse dedicate e garantite (CPU, RAM, spazio) in un ambiente isolato: le prestazioni restano stabili anche quando il traffico sale, e hai controllo totale su configurazione e sicurezza. &Egrave; la scelta giusta per e-commerce con volumi crescenti, siti ad alto traffico, applicazioni web e progetti che richiedono affidabilit&agrave;. Costa di pi&ugrave; e richiede una gestione pi&ugrave; tecnica, che per&ograve; possiamo curare noi come parte del servizio.</p>
<h2>Come scegliere</h2>
<p>Guarda traffico ed esigenze reali. Per un sito nuovo o una <a href="/servizi/sviluppo-siti-web/">vetrina</a> il condiviso basta. Quando cresci, il nostro <a href="/servizi/hosting/">hosting cloud su VPS</a> parte da &euro;29/mese e ti d&agrave; prestazioni e sicurezza dedicate, con la gestione tecnica inclusa. Il passaggio dal condiviso al VPS si fa senza downtime se pianificato bene: <a href="/contatti/">scrivici</a> e valutiamo il tuo caso.</p>""",
  faqs=[
   ("Hosting condiviso o VPS: cosa scegliere?", "Il condiviso basta per siti vetrina, blog e piccoli e-commerce a basso traffico, con costi minimi. Il VPS serve quando il traffico cresce o servono prestazioni, sicurezza e controllo dedicati. La regola pratica: parti dal condiviso e passa al VPS quando il sito rallenta sotto carico."),
   ("Un VPS e piu sicuro dell'hosting condiviso?", "Si. Il VPS isola il tuo sito in un ambiente dedicato, mentre nel condiviso le risorse e parte dell'ambiente sono comuni ad altri siti. L'isolamento del VPS riduce i rischi legati ai 'vicini' sullo stesso server."),
   ("Quando devo passare da condiviso a VPS?", "Quando il sito rallenta nei momenti di traffico, quando l'e-commerce cresce, quando ti servono configurazioni specifiche o piu sicurezza. Un calo di prestazioni ricorrente sotto carico e il segnale piu chiaro."),
   ("Il VPS richiede competenze tecniche?", "Di base si, perche offre controllo totale sulla configurazione. Ma con un hosting gestito come il nostro ce ne occupiamo noi: aggiornamenti, sicurezza e ottimizzazione sono inclusi, cosi hai i vantaggi del VPS senza gestirlo."),
  ]),
 en=dict(
  title="Shared Hosting vs VPS: Which to Choose in 2026 | Carbon Stealth",
  desc="Shared hosting or a VPS? An honest comparison of cost, performance, security and scalability, to see when shared is enough and when you need a VPS in 2026.",
  body="""<p><strong>In short:</strong> <strong>shared hosting</strong> is perfectly fine for brochure sites, blogs and small e-commerce with modest traffic: it's cheap and needs no technical skills. A <strong>VPS</strong> (virtual private server) makes sense when the site grows, traffic rises or you need performance, security and control that shared can't guarantee. If your site is new or small, start with shared; when it starts slowing under load, that's the signal to move to a VPS.</p>
<h2>Head-to-head comparison</h2>
<div class="ctbl"><table><thead><tr><th>Criterion</th><th>Shared hosting</th><th>VPS</th></tr></thead><tbody>
<tr><td>Cost</td><td>Low (a few euros/mo)</td><td>from &euro;29/mo</td></tr>
<tr><td>Resources</td><td>Shared with other sites</td><td>Dedicated and guaranteed</td></tr>
<tr><td>Performance</td><td>Good at low traffic</td><td>Stable even under load</td></tr>
<tr><td>Security and isolation</td><td>Limited (shared environment)</td><td>Isolated environment</td></tr>
<tr><td>Technical control</td><td>Minimal</td><td>Full (root/configuration)</td></tr>
<tr><td>Best for</td><td>Brochure sites, blogs, small shops</td><td>E-commerce, high traffic, apps</td></tr>
</tbody></table></div>
<h2>When shared hosting is enough</h2>
<p>On shared hosting several sites live on the same server and share its resources. The cost is very low and management is almost nil: the provider handles everything. It's the right choice for brochure sites, blogs and small e-commerce with modest traffic. The limit is that if another site on the same server consumes too much, your performance can suffer, and you have little control over the configuration.</p>
<h2>When you need a VPS</h2>
<p>A VPS gives you dedicated, guaranteed resources (CPU, RAM, storage) in an isolated environment: performance stays stable even as traffic climbs, and you have full control over configuration and security. It's the right choice for e-commerce with growing volumes, high-traffic sites, web applications and projects that demand reliability. It costs more and needs more technical management &mdash; which we can handle for you as part of the service.</p>
<h2>How to choose</h2>
<p>Look at real traffic and needs. For a new site or a <a href="/en/services/web-development/">brochure site</a>, shared is enough. As you grow, our <a href="/en/services/hosting/">cloud hosting on VPS</a> starts at &euro;29/month and gives you dedicated performance and security, with technical management included. Moving from shared to VPS can be done with no downtime when planned well: <a href="/en/contact/">get in touch</a> and we'll assess your case.</p>""",
  faqs=[
   ("Shared hosting or VPS: which to choose?", "Shared is enough for brochure sites, blogs and small low-traffic e-commerce, at minimal cost. A VPS is needed when traffic grows or you need dedicated performance, security and control. Rule of thumb: start with shared and move to a VPS when the site slows under load."),
   ("Is a VPS more secure than shared hosting?", "Yes. A VPS isolates your site in a dedicated environment, whereas on shared hosting resources and part of the environment are common to other sites. The VPS's isolation reduces the risks tied to 'neighbors' on the same server."),
   ("When should I move from shared to VPS?", "When the site slows during traffic peaks, when the e-commerce grows, when you need specific configurations or more security. A recurring performance drop under load is the clearest signal."),
   ("Does a VPS require technical skills?", "Basically yes, because it offers full control over configuration. But with managed hosting like ours we handle it: updates, security and optimization are included, so you get the benefits of a VPS without managing it."),
  ]),
 bg=dict(
  title="Споделен Хостинг срещу VPS: Кое да Изберете 2026 | Carbon Stealth",
  desc="Споделен хостинг или VPS? Честно сравнение на цена, производителност, сигурност и мащабируемост, кога стига споделеният и кога е нужен VPS през 2026.",
  body="""<p><strong>Накратко:</strong> <strong>споделеният хостинг</strong> е напълно достатъчен за визитни сайтове, блогове и малки онлайн магазини със скромен трафик: струва малко и не изисква технически умения. <strong>VPS</strong> (виртуален частен сървър) е подходящ, когато сайтът расте, трафикът се увеличава или са нужни производителност, сигурност и контрол, които споделеният не може да гарантира. Ако сайтът ви е нов или малък, започнете със споделен; когато започне да се забавя под натоварване, това е сигналът за преминаване към VPS.</p>
<h2>Директно сравнение</h2>
<div class="ctbl"><table><thead><tr><th>Критерий</th><th>Споделен хостинг</th><th>VPS</th></tr></thead><tbody>
<tr><td>Разход</td><td>Нисък (няколко евро/мес)</td><td>от &euro;29/мес</td></tr>
<tr><td>Ресурси</td><td>Споделени с други сайтове</td><td>Отделени и гарантирани</td></tr>
<tr><td>Производителност</td><td>Добра при нисък трафик</td><td>Стабилна и под натоварване</td></tr>
<tr><td>Сигурност и изолация</td><td>Ограничени (споделена среда)</td><td>Изолирана среда</td></tr>
<tr><td>Технически контрол</td><td>Минимален</td><td>Пълен (root/конфигурация)</td></tr>
<tr><td>Подходящ за</td><td>Визитни, блогове, малки магазини</td><td>E-commerce, висок трафик, приложения</td></tr>
</tbody></table></div>
<h2>Кога стига споделеният хостинг</h2>
<p>При споделения хостинг няколко сайта живеят на един сървър и делят ресурсите му. Разходът е много нисък, а управлението почти никакво: доставчикът поема всичко. Правилен избор е за визитни сайтове, блогове и малки онлайн магазини със скромен трафик. Ограничението е, че ако друг сайт на същия сървър консумира твърде много, вашата производителност може да пострада, а имате малко контрол над конфигурацията.</p>
<h2>Кога ви трябва VPS</h2>
<p>VPS ви дава отделени и гарантирани ресурси (CPU, RAM, място) в изолирана среда: производителността остава стабилна дори когато трафикът се качва, и имате пълен контрол над конфигурацията и сигурността. Правилен избор е за онлайн магазини с растящи обеми, сайтове с висок трафик, уеб приложения и проекти, изискващи надеждност. Струва повече и изисква по-техническо управление &mdash; което можем да поемем ние като част от услугата.</p>
<h2>Как да изберете</h2>
<p>Гледайте реалния трафик и нуждите. За нов сайт или <a href="/bg/uslugi/web-razrabotka/">визитен сайт</a> споделеният стига. Когато растете, нашият <a href="/bg/uslugi/hosting/">облачен хостинг на VPS</a> започва от &euro;29/месец и ви дава отделена производителност и сигурност, с включено техническо управление. Преминаването от споделен към VPS може да стане без прекъсване, ако е планирано добре: <a href="/bg/kontakti/">пишете ни</a> и ще преценим вашия случай.</p>""",
  faqs=[
   ("Споделен хостинг или VPS: кое да изберете?", "Споделеният стига за визитни сайтове, блогове и малки онлайн магазини с нисък трафик, при минимални разходи. VPS е нужен, когато трафикът расте или трябват отделени производителност, сигурност и контрол. Практично правило: започнете със споделен и минете към VPS, когато сайтът се забавя под натоварване."),
   ("VPS по-сигурен ли е от споделения хостинг?", "Да. VPS изолира сайта ви в отделна среда, докато при споделения ресурсите и част от средата са общи с други сайтове. Изолацията на VPS намалява рисковете, свързани със 'съседите' на същия сървър."),
   ("Кога да мина от споделен към VPS?", "Когато сайтът се забавя при пикове на трафика, когато онлайн магазинът расте, когато ви трябват специфични конфигурации или повече сигурност. Повтарящ се спад в производителността под натоварване е най-ясният сигнал."),
   ("VPS изисква ли технически умения?", "По принцип да, защото дава пълен контрол над конфигурацията. Но с управляван хостинг като нашия ние го поемаме: обновления, сигурност и оптимизация са включени, така че получавате предимствата на VPS, без да го управлявате."),
  ]),
)),

]

# ── Hub content per language ─────────────────────────────────────
HUB = {
 "it": dict(
  title="Confronti: Guide alla Scelta Tecnologica 2026 | Carbon Stealth",
  desc="Confronti onesti tra piattaforme e tecnologie web: WordPress, Shopify, React, Flutter, hosting e software. Guide alla scelta per decidere cosa conviene nel 2026.",
  h1="Confronti: guide alla scelta",
  intro="<p>Prima di investire in un sito, un e-commerce, un'app o un software, la domanda giusta &egrave; sempre la stessa: quale soluzione conviene davvero al tuo caso? Qui trovi confronti onesti tra le tecnologie e le piattaforme pi&ugrave; richieste, con costi reali, vantaggi e limiti di ciascuna e un verdetto chiaro su quando scegliere l'una o l'altra. Nessun tecnicismo inutile, solo criteri pratici per decidere.</p>",
  cards_h2="Tutti i confronti",
  faqs=[
   ("Come scegliere tra due tecnologie o piattaforme?", "Parti dall'obiettivo, non dalla moda del momento. Definisci budget, esigenze reali e prospettiva di crescita, poi confronta le opzioni su costi iniziali, costi nel tempo, controllo e manutenzione. Ogni nostra guida offre un verdetto pratico proprio su questi criteri."),
   ("Questi confronti valgono anche per il mio settore?", "Si. I criteri di scelta - costi, prestazioni, scalabilita, proprieta, manutenzione - valgono in ogni settore. Se hai dubbi sul tuo caso specifico, contattaci e valutiamo insieme la soluzione piu adatta senza impegno."),
   ("Realizzate voi la soluzione scelta?", "Si. Sviluppiamo siti web, e-commerce, app mobile e software su misura, e gestiamo hosting e SEO. Dopo il confronto possiamo realizzare direttamente la soluzione piu adatta, con un preventivo gratuito entro 24 ore."),
  ]),
 "en": dict(
  title="Comparisons: Technology Decision Guides 2026 | Carbon Stealth",
  desc="Honest comparisons of web platforms and technologies: WordPress, Shopify, React, Flutter, hosting and software. Decision guides to choose what fits in 2026.",
  h1="Comparisons: decision guides",
  intro="<p>Before investing in a website, an e-commerce, an app or a piece of software, the right question is always the same: which solution actually fits your case? Here you'll find honest comparisons of the most requested technologies and platforms, with real costs, the strengths and limits of each, and a clear verdict on when to choose one over the other. No needless jargon, just practical criteria to decide.</p>",
  cards_h2="All comparisons",
  faqs=[
   ("How do I choose between two technologies or platforms?", "Start from the goal, not the trend of the moment. Define your budget, real needs and growth outlook, then compare the options on upfront cost, cost over time, control and maintenance. Each of our guides gives a practical verdict on exactly these criteria."),
   ("Do these comparisons apply to my industry too?", "Yes. The decision criteria - cost, performance, scalability, ownership, maintenance - apply in every industry. If you're unsure about your specific case, contact us and we'll weigh the best fit together, no obligation."),
   ("Do you build the chosen solution?", "Yes. We develop websites, e-commerce, mobile apps and custom software, and we manage hosting and SEO. After the comparison we can build the best-fit solution directly, with a free quote within 24 hours."),
  ]),
 "bg": dict(
  title="Сравнения: Ръководства за Технологичен Избор 2026 | Carbon Stealth",
  desc="Честни сравнения на уеб платформи и технологии: WordPress, Shopify, React, Flutter, хостинг и софтуер. Ръководства за избор какво пасва през 2026.",
  h1="Сравнения: ръководства за избор",
  intro="<p>Преди да инвестирате в сайт, онлайн магазин, приложение или софтуер, правилният въпрос винаги е един и същ: кое решение наистина пасва на вашия случай? Тук ще намерите честни сравнения на най-търсените технологии и платформи, с реални разходи, силните страни и ограниченията на всяка и ясна присъда кога да изберете едното или другото. Без излишен жаргон, само практични критерии за решение.</p>",
  cards_h2="Всички сравнения",
  faqs=[
   ("Как да избера между две технологии или платформи?", "Тръгнете от целта, не от модата на момента. Определете бюджет, реални нужди и перспектива за растеж, после сравнете опциите по начален разход, разход във времето, контрол и поддръжка. Всяко наше ръководство дава практична присъда точно по тези критерии."),
   ("Тези сравнения важат ли и за моя бранш?", "Да. Критериите за избор - цена, производителност, мащабируемост, собственост, поддръжка - важат във всеки бранш. Ако се колебаете за конкретния си случай, свържете се с нас и ще преценим най-подходящото решение заедно, без ангажимент."),
   ("Вие ли изработвате избраното решение?", "Да. Разработваме сайтове, онлайн магазини, мобилни приложения и софтуер по поръчка, управляваме хостинг и SEO. След сравнението можем директно да изработим най-подходящото решение, с безплатна оферта до 24 часа."),
  ]),
}

# ── Render helpers ───────────────────────────────────────────────
def esc(s):
    return html.escape(s, quote=True)

def hreflang_block(pathfn):
    """pathfn(lang) -> absolute-path portion after BASE for that language."""
    alts = "".join(
        f'<link rel="alternate" hreflang="{l}" href="{BASE}{pathfn(l)}"/>'
        for l in ("it", "en", "bg")
    ) + f'<link rel="alternate" hreflang="x-default" href="{BASE}{pathfn("it")}"/>'
    return alts

def head(lang, title, desc, canon, alts):
    s = L[lang]
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

def jsonld_page(lang, title, desc, canon, breadcrumb, faqs):
    s = L[lang]
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebPage", "@id": f"{canon}#webpage", "url": canon, "name": title,
         "description": desc, "isPartOf": {"@type": "WebSite", "name": "Carbon Stealth VCC", "url": BASE},
         "inLanguage": lang, "datePublished": DATE_ISO, "dateModified": DATE_ISO,
         "publisher": {"@type": "Organization", "name": "Carbon Stealth VCC",
                       "logo": {"@type": "ImageObject", "url": "https://carbonstealth.eu/logo.png", "width": 1373, "height": 585}}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": item}
            for i, (name, item) in enumerate(breadcrumb)]},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]},
    ]}
    return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "</script>"

def faq_html(faqs):
    return "".join(
        f'<div class="faq-item"><div class="faq-q">{html.escape(q)}</div><div class="faq-a">{html.escape(a)}</div></div>'
        for q, a in faqs)

def render_comparison(lang, cmp):
    s = L[lang]
    c = cmp["lang"][lang]
    slug = cmp["slug"]
    title = c["title"]
    h1 = title.split("|")[0].strip()
    desc = c["desc"]
    canon = f"{BASE}{s['hub']}{slug}/"
    alts = hreflang_block(lambda l: f"{L[l]['hub']}{slug}/")
    breadcrumb = [
        ("Home", BASE + s["home"]),
        (s["hub_name"], BASE + s["hub"]),
        (h1, canon),
    ]
    body = (
        head(lang, title, desc, canon, alts)
        + jsonld_page(lang, title, desc, canon, breadcrumb, c["faqs"])
        + "\n</head><body>"
        + s["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["tag"]}</div><h1>{html.escape(h1)}</h1></div></div>'
        + '<div class="w">'
        + c["body"]
        + related_block(lang, cmp["related"])
        + f'<h2>{s["faq_h2"]}</h2>{faq_html(c["faqs"])}'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a>'
        + '</div>'
        + s["ft"]
        + "</body></html>\n"
    )
    return body

def render_hub(lang):
    s = L[lang]
    h = HUB[lang]
    title = h["title"]
    h1 = h["h1"]
    desc = h["desc"]
    canon = f"{BASE}{s['hub']}"
    alts = hreflang_block(lambda l: L[l]["hub"])
    breadcrumb = [
        ("Home", BASE + s["home"]),
        (s["hub_name"], canon),
    ]
    cards = "".join(
        f'<a class="card" href="{s["hub"]}{cmp["slug"]}/"><h3>{html.escape(NAMES[cmp["slug"]][lang])}</h3>'
        f'<p>{html.escape(cmp["lang"][lang]["desc"])}</p></a>'
        for cmp in CMP)
    body = (
        head(lang, title, desc, canon, alts)
        + jsonld_page(lang, title, desc, canon, breadcrumb, h["faqs"])
        + "\n</head><body>"
        + s["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["tag"]}</div><h1>{html.escape(h1)}</h1></div></div>'
        + '<div class="w">'
        + h["intro"]
        + f'<h2>{h["cards_h2"]}</h2><div class="grid">{cards}</div>'
        + f'<h2>{s["faq_h2"]}</h2>{faq_html(h["faqs"])}'
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

# hub path -> filesystem dir under public/
HUB_DIR = {"it": "confronti", "en": os.path.join("en", "comparisons"), "bg": os.path.join("bg", "sravneniya")}

def write_sitemap():
    urls = []
    for lang in ("it", "en", "bg"):
        urls.append(f"{BASE}{L[lang]['hub']}")
        for cmp in CMP:
            urls.append(f"{BASE}{L[lang]['hub']}{cmp['slug']}/")
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        lines.append(f'<url><loc>{u}</loc><lastmod>{DATE}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>')
    lines.append('</urlset>')
    write(os.path.join("public", "sitemap-comparisons.xml"), "\n".join(lines) + "\n")
    return len(urls)

def main():
    n = 0
    for lang in ("it", "en", "bg"):
        d = HUB_DIR[lang]
        # hub
        write(os.path.join("public", d, "index.html"), render_hub(lang))
        n += 1
        # comparison pages
        for cmp in CMP:
            write(os.path.join("public", d, cmp["slug"], "index.html"), render_comparison(lang, cmp))
            n += 1
    total_urls = write_sitemap()
    print(f"wrote {n} comparison pages (3 hubs + {len(CMP)}x3 comparisons)")
    print(f"sitemap-comparisons.xml: {total_urls} URLs")

if __name__ == "__main__":
    main()
