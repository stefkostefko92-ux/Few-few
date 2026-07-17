#!/usr/bin/env python3
"""Generate a trilingual FREE TOOLS section (it/en/bg) for carbonstealth.eu.

Writes a hub + 2 interactive, client-side tools per language:
  IT  public/strumenti/            + public/strumenti/<slug>/index.html
  EN  public/en/tools/             + public/en/tools/<slug>/index.html
  BG  public/bg/instrumenti/       + public/bg/instrumenti/<slug>/index.html

Plus public/sitemap-tools.xml (its own file). Self-contained static HTML with
inline vanilla JS (CSP-safe, no external scripts). Run from repo root:
    python3 scripts/generate-tools.py
"""
import os, html, json

BASE = "https://carbonstealth.eu"
DATE = "2026-07-17"
DATE_ISO = "2026-07-17T09:00:00+02:00"

# ── Shared chrome (matches scripts/generate-blog.py) ─────────────
STYLE = ("*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#ccc;font-family:'Space Mono',monospace;font-size:13px;line-height:2;padding:0}a{color:#00e5ff;text-decoration:none}.w{max-width:900px;margin:0 auto;padding:40px 20px}h1{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2.5rem;color:#f5f5f0;margin-bottom:16px;letter-spacing:-.03em;line-height:1.1}h2{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.2rem;color:#00e5ff;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.05em}h3{color:#f5f5f0;font-size:1rem;margin:20px 0 8px}p,li{margin-bottom:10px;line-height:1.9}ul{padding-left:20px}.nav{position:fixed;top:0;width:100%;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,229,255,.1);padding:12px 20px;z-index:1000;display:flex;justify-content:space-between;align-items:center}.nav a{color:#ccc;font-size:10px;letter-spacing:.2em;margin:0 10px}.nav img{height:24px}.hero-s{padding:120px 20px 60px;border-bottom:1px solid rgba(0,229,255,.1)}.tag{font-size:9px;color:#00e5ff;letter-spacing:.4em;margin-bottom:12px}.cta{display:inline-block;padding:14px 32px;border:1px solid #00e5ff;color:#00e5ff;font-size:11px;letter-spacing:.25em;margin-top:24px}.ft{border-top:1px solid rgba(245,245,240,.06);padding:30px 20px;text-align:center;font-size:9px;color:#999;margin-top:60px}.price{display:inline-block;padding:4px 12px;border:1px solid rgba(0,229,255,.2);color:#00e5ff;font-size:11px;margin:8px 0}.faq-item{border-bottom:1px solid rgba(245,245,240,.06);padding:16px 0}.faq-q{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1rem;color:#f5f5f0;margin-bottom:6px}.faq-a{font-size:12px;color:#ccc}"
         ".tool{border:1px solid rgba(0,229,255,.15);padding:24px;margin:24px 0;background:rgba(0,229,255,.02)}.fld{margin-bottom:16px}.fld label{display:block;font-size:11px;letter-spacing:.15em;color:#00e5ff;text-transform:uppercase;margin-bottom:6px}select,input[type=text],input[type=url],input[type=number],textarea{width:100%;background:#0a0a0a;border:1px solid rgba(0,229,255,.25);color:#f5f5f0;font-family:'Space Mono',monospace;font-size:13px;padding:10px 12px}textarea{min-height:280px;resize:vertical;line-height:1.6;white-space:pre;overflow:auto}.opts{display:flex;flex-wrap:wrap;gap:10px}.opt{display:flex;align-items:center;gap:8px;border:1px solid rgba(0,229,255,.15);padding:8px 12px;font-size:12px;cursor:pointer}.opt input{width:auto}.qc-res{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2rem;color:#00e5ff;margin:8px 0;letter-spacing:-.02em}.note{font-size:11px;color:#999;margin-bottom:16px}.btn{display:inline-block;padding:12px 28px;border:1px solid #00e5ff;color:#00e5ff;font-size:11px;letter-spacing:.2em;background:transparent;cursor:pointer;font-family:'Space Mono',monospace;text-transform:uppercase}.btn:hover{background:rgba(0,229,255,.1)}.out-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.cards{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:24px 0}.card{border:1px solid rgba(0,229,255,.15);padding:24px;background:rgba(0,229,255,.02)}.card h3{color:#f5f5f0;font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:8px}.card p{font-size:12px;color:#ccc;margin-bottom:14px}.card a.go{display:inline-block;font-size:11px;letter-spacing:.15em;color:#00e5ff;text-transform:uppercase}@media(max-width:640px){.cards{grid-template-columns:1fr}}")

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">')

# ── Per-language chrome ──────────────────────────────────────────
L = {
 "it": dict(
   prefix="", og="og-image.png", locale="it_IT", numloc="it-IT",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/chi-siamo/">CHI SIAMO</a><a href="/servizi/sviluppo-siti-web/">SERVIZI</a><a href="/strumenti/">STRUMENTI</a><a href="/contatti/">CONTATTI</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Tutti i diritti riservati &middot; <a href="/privacy/">Privacy</a> &middot; <a href="/cookie/">Cookie</a> &middot; <a href="/termini/">Terms</a></p></div>',
   home="/", tools="/strumenti/", tools_name="Strumenti", home_name="Home",
   contact="/contatti/", faq_h2="Domande frequenti", tag="// STRUMENTI",
   cta="RICHIEDI UN PREVENTIVO GRATUITO"),
 "en": dict(
   prefix="/en", og="og-image-en.png", locale="en_US", numloc="en-US",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/en/about/">ABOUT</a><a href="/en/services/web-development/">SERVICES</a><a href="/en/tools/">TOOLS</a><a href="/en/contact/">CONTACT</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>All rights reserved &middot; <a href="/en/privacy/">Privacy</a> &middot; <a href="/en/cookie/">Cookie</a> &middot; <a href="/en/terms/">Terms</a></p></div>',
   home="/en/", tools="/en/tools/", tools_name="Tools", home_name="Home",
   contact="/en/contact/", faq_h2="Frequently asked questions", tag="// TOOLS",
   cta="REQUEST A FREE QUOTE"),
 "bg": dict(
   prefix="/bg", og="og-image-bg.png", locale="bg_BG", numloc="bg-BG",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">ГЛАВНА</a><a href="/bg/za-nas/">ЗА НАС</a><a href="/bg/uslugi/web-razrabotka/">УСЛУГИ</a><a href="/bg/instrumenti/">ИНСТРУМЕНТИ</a><a href="/bg/kontakti/">КОНТАКТИ</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Всички права запазени &middot; <a href="/bg/privacy/">Privacy</a> &middot; <a href="/bg/cookie/">Cookie</a> &middot; <a href="/bg/usloviya/">Terms</a></p></div>',
   home="/bg/", tools="/bg/instrumenti/", tools_name="Инструменти", home_name="Начало",
   contact="/bg/kontakti/", faq_h2="Често задавани въпроси", tag="// ИНСТРУМЕНТИ",
   cta="ЗАЯВИ БЕЗПЛАТНА ОФЕРТА"),
}

# ── Inline JS (kept as plain strings; NOT f-strings) ─────────────
QC_JS = '''
<script>
(function(){
  var form=document.getElementById('qc-form');
  if(!form)return;
  var out=document.getElementById('qc-result');
  var PER_UNIT=100,INCLUDED=5,NUMLOC='__NUMLOC__';
  function fmt(n){return '€'+Math.round(n).toLocaleString(NUMLOC);}
  function r50(n){return Math.round(n/50)*50;}
  function calc(){
    var base=parseInt(document.getElementById('qc-type').value,10)||0;
    var qty=parseInt(document.getElementById('qc-qty').value,10);
    if(isNaN(qty)||qty<1)qty=1;
    var extra=Math.max(0,qty-INCLUDED)*PER_UNIT;
    var opt=0,boxes=form.querySelectorAll('input[type="checkbox"]');
    for(var i=0;i<boxes.length;i++){if(boxes[i].checked)opt+=parseInt(boxes[i].value,10)||0;}
    var sub=base+extra+opt;
    out.textContent=fmt(r50(sub))+' – '+fmt(r50(sub*1.35));
  }
  form.addEventListener('input',calc);
  form.addEventListener('change',calc);
  calc();
})();
</script>
'''

MT_JS = r'''
<script>
(function(){
  var f=document.getElementById('mt-form');
  if(!f)return;
  var out=document.getElementById('mt-out');
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function val(id){var e=document.getElementById(id);return e?e.value.trim():'';}
  function gen(){
    var t=val('mt-t'),d=val('mt-d'),u=val('mt-u'),img=val('mt-img'),site=val('mt-site');
    var type=document.getElementById('mt-type').value;
    var et=esc(t),ed=esc(d),eu=esc(u),eimg=esc(img),esite=esc(site);
    var ld={"@context":"https://schema.org","@type":"WebPage","name":t,"description":d};
    if(u)ld.url=u;
    if(img)ld.primaryImageOfPage={"@type":"ImageObject","url":img};
    if(site)ld.publisher={"@type":"Organization","name":site};
    var out2=[];
    out2.push('<title>'+et+'<\/title>');
    out2.push('<meta name="description" content="'+ed+'">');
    if(u)out2.push('<link rel="canonical" href="'+eu+'">');
    out2.push('<meta property="og:type" content="'+esc(type)+'">');
    out2.push('<meta property="og:title" content="'+et+'">');
    out2.push('<meta property="og:description" content="'+ed+'">');
    if(u)out2.push('<meta property="og:url" content="'+eu+'">');
    if(img)out2.push('<meta property="og:image" content="'+eimg+'">');
    if(site)out2.push('<meta property="og:site_name" content="'+esite+'">');
    out2.push('<meta name="twitter:card" content="summary_large_image">');
    out2.push('<meta name="twitter:title" content="'+et+'">');
    out2.push('<meta name="twitter:description" content="'+ed+'">');
    if(img)out2.push('<meta name="twitter:image" content="'+eimg+'">');
    out2.push('<scr'+'ipt type="application/ld+json">'+JSON.stringify(ld,null,2)+'<\/scr'+'ipt>');
    out.value=out2.join('\n');
  }
  f.addEventListener('input',gen);
  f.addEventListener('change',gen);
  gen();
  var btn=document.getElementById('mt-copy');
  if(btn)btn.addEventListener('click',function(){
    out.select();out.setSelectionRange(0,99999);
    var done=function(){var o=btn.textContent;btn.textContent='__COPIED__';setTimeout(function(){btn.textContent=o;},1500);};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(out.value).then(done).catch(function(){try{document.execCommand('copy');done();}catch(e){}});}
    else{try{document.execCommand('copy');done();}catch(e){}}
  });
})();
</script>
'''

# ── UI builders ──────────────────────────────────────────────────
def quote_ui(lang, ui):
    s = L[lang]
    types = "".join(f'<option value="{b}">{name}</option>' for name, b in ui["types"])
    opts = "".join(f'<label class="opt"><input type="checkbox" value="{v}">{name}</label>' for name, v in ui["options"])
    js = QC_JS.replace("__NUMLOC__", s["numloc"])
    return (f'<div class="tool"><form id="qc-form">'
            f'<div class="fld"><label>{ui["type_label"]}</label><select id="qc-type">{types}</select></div>'
            f'<div class="fld"><label>{ui["qty_label"]}</label><input type="number" id="qc-qty" min="1" value="5"></div>'
            f'<div class="fld"><label>{ui["options_label"]}</label><div class="opts">{opts}</div></div>'
            f'</form>'
            f'<div class="fld"><label>{ui["result_label"]}</label><div class="qc-res" id="qc-result">--</div>'
            f'<p class="note">{ui["note"]}</p></div>'
            f'<a href="{s["contact"]}" class="btn">{ui["button"]}</a></div>' + js)

def meta_ui(lang, ui):
    topts = "".join(f'<option value="{v}">{lab}</option>' for v, lab in ui["type_options"])
    js = MT_JS.replace("__COPIED__", ui["copied"])
    return (f'<div class="tool"><form id="mt-form">'
            f'<div class="fld"><label>{ui["title_label"]}</label><input type="text" id="mt-t" placeholder="{ui["ph_t"]}"></div>'
            f'<div class="fld"><label>{ui["desc_label"]}</label><input type="text" id="mt-d" placeholder="{ui["ph_d"]}"></div>'
            f'<div class="fld"><label>{ui["url_label"]}</label><input type="url" id="mt-u" placeholder="{ui["ph_u"]}"></div>'
            f'<div class="fld"><label>{ui["image_label"]}</label><input type="url" id="mt-img" placeholder="{ui["ph_img"]}"></div>'
            f'<div class="fld"><label>{ui["site_label"]}</label><input type="text" id="mt-site" placeholder="{ui["ph_site"]}"></div>'
            f'<div class="fld"><label>{ui["type_label"]}</label><select id="mt-type">{topts}</select></div>'
            f'</form>'
            f'<div class="fld"><div class="out-h"><label>{ui["output_label"]}</label>'
            f'<button type="button" class="btn" id="mt-copy">{ui["copy"]}</button></div>'
            f'<textarea id="mt-out" readonly></textarea></div></div>' + js)

UI_BUILDERS = {"quote": quote_ui, "meta": meta_ui}

# ── Tools data ───────────────────────────────────────────────────
TOOLS = [
dict(key="quote",
 slug=dict(it="preventivo", en="quote-calculator", bg="kalkulator-oferta"),
 lang=dict(
  it=dict(
   title="Calcolatore Preventivo Sito Web Gratis | Carbon Stealth",
   desc="Calcola gratis e in tempo reale il preventivo del tuo sito web, e-commerce o software. Scegli tipo, pagine e funzionalita e ottieni subito una stima di prezzo.",
   h1="Calcolatore Preventivo Sito Web",
   intro='<p>Questo <strong>calcolatore di preventivo</strong> ti d&agrave; una stima immediata del costo del tuo sito web o software. Scegli il tipo di progetto, indica il numero di pagine o prodotti e seleziona le funzionalit&agrave; che ti servono: il prezzo stimato si aggiorna in tempo reale, direttamente nel browser e senza registrazione.</p>'
         '<p>Le stime si basano sui nostri prezzi reali di partenza: sito vetrina da &euro;800, e-commerce da &euro;1.200, software su misura da &euro;2.000, app mobile da &euro;3.000 ed ERP da &euro;5.000. Per un preventivo esatto guarda i nostri servizi di <a href="/servizi/sviluppo-siti-web/">sviluppo siti web</a>, <a href="/servizi/ecommerce/">e-commerce</a> e <a href="/servizi/sviluppo-software/">software su misura</a>, oppure <a href="/contatti/">contattaci</a>.</p>',
   ui=dict(type_label="Tipo di progetto",
     types=[("Sito vetrina",800),("E-commerce",1200),("Software su misura",2000),("App mobile",3000),("ERP",5000)],
     qty_label="Numero di pagine / prodotti", options_label="Funzionalit&agrave; aggiuntive",
     options=[("SEO",400),("Multilingua",500),("Blog",300),("Integrazione pagamenti",600),("Hosting gestito",350)],
     result_label="Stima del preventivo",
     note="Stima indicativa calcolata nel browser. Il preventivo esatto dipende dai dettagli del progetto.",
     button="Richiedi preventivo esatto"),
   faqs=[
    ("Come funziona il calcolatore di preventivo?", "Scegli il tipo di progetto, inserisci il numero di pagine o prodotti e spunta le funzionalita desiderate. Il calcolatore somma un prezzo base e degli incrementi e mostra una fascia di prezzo stimata, aggiornata in tempo reale."),
    ("La stima e vincolante?", "No, e una stima indicativa per orientarti. Il preventivo esatto dipende dai dettagli del progetto e te lo forniamo gratuitamente entro 24 ore dopo una breve analisi delle tue esigenze."),
    ("Quanto costa davvero un sito web?", "Un sito vetrina parte da &euro;800, un e-commerce da &euro;1.200 e un software su misura da &euro;2.000. Il prezzo finale dipende da pagine, funzionalita e integrazioni: usa il calcolatore per una prima stima realistica."),
   ]),
  en=dict(
   title="Free Website Quote Calculator | Carbon Stealth",
   desc="Estimate the price of your website, e-commerce or software for free and in real time. Pick a type, pages and features and get an instant price range.",
   h1="Website Quote Calculator",
   intro='<p>This free <strong>quote calculator</strong> gives you an instant estimate of your website or software cost. Choose the project type, set the number of pages or products and select the features you need: the estimated price updates live, right in your browser and with no sign-up.</p>'
         '<p>The estimates are based on our real starting prices: brochure site from &euro;800, e-commerce from &euro;1,200, custom software from &euro;2,000, mobile app from &euro;3,000 and ERP from &euro;5,000. For an exact quote see our <a href="/en/services/web-development/">web development</a>, <a href="/en/services/ecommerce/">e-commerce</a> and <a href="/en/services/software-development/">custom software</a> services, or <a href="/en/contact/">get in touch</a>.</p>',
   ui=dict(type_label="Project type",
     types=[("Brochure website",800),("E-commerce",1200),("Custom software",2000),("Mobile app",3000),("ERP",5000)],
     qty_label="Number of pages / products", options_label="Additional features",
     options=[("SEO",400),("Multilingual",500),("Blog",300),("Payment integration",600),("Managed hosting",350)],
     result_label="Estimated quote",
     note="Indicative estimate calculated in your browser. The exact quote depends on your project details.",
     button="Request an exact quote"),
   faqs=[
    ("How does the quote calculator work?", "Pick the project type, enter the number of pages or products and tick the features you want. The calculator adds a base price plus increments and shows an estimated price range that updates in real time."),
    ("Is the estimate binding?", "No, it is an indicative estimate to guide you. The exact quote depends on your project details and we provide it for free within 24 hours after a short analysis of your needs."),
    ("How much does a website really cost?", "A brochure site starts at &euro;800, an e-commerce at &euro;1,200 and custom software at &euro;2,000. The final price depends on pages, features and integrations: use the calculator for a realistic first estimate."),
   ]),
  bg=dict(
   title="Безплатен Калкулатор за Оферта на Сайт | Carbon Stealth",
   desc="Изчислете безплатно и в реално време цената на вашия сайт, онлайн магазин или софтуер. Изберете тип, страници и функции и получете моментална оценка.",
   h1="Калкулатор за Оферта на Сайт",
   intro='<p>Този безплатен <strong>калкулатор за оферта</strong> ви дава моментална оценка на цената на вашия сайт или софтуер. Изберете типа проект, посочете броя страници или продукти и отметнете нужните функции: оценката се обновява в реално време, директно в браузъра и без регистрация.</p>'
         '<p>Оценките се базират на реалните ни начални цени: визитен сайт от &euro;800, онлайн магазин от &euro;1200, софтуер по поръчка от &euro;2000, мобилно приложение от &euro;3000 и ERP от &euro;5000. За точна оферта вижте услугите ни за <a href="/bg/uslugi/web-razrabotka/">изработка на сайтове</a>, <a href="/bg/uslugi/ecommerce/">онлайн магазини</a> и <a href="/bg/uslugi/softuer/">софтуер по поръчка</a>, или <a href="/bg/kontakti/">ни пишете</a>.</p>',
   ui=dict(type_label="Тип проект",
     types=[("Визитен сайт",800),("Онлайн магазин",1200),("Софтуер по поръчка",2000),("Мобилно приложение",3000),("ERP",5000)],
     qty_label="Брой страници / продукти", options_label="Допълнителни функции",
     options=[("SEO",400),("Многоезичност",500),("Блог",300),("Интеграция на плащания",600),("Управляван хостинг",350)],
     result_label="Оценка на офертата",
     note="Ориентировъчна оценка, изчислена в браузъра. Точната оферта зависи от детайлите на проекта.",
     button="Заявете точна оферта"),
   faqs=[
    ("Как работи калкулаторът за оферта?", "Изберете типа проект, въведете броя страници или продукти и отметнете желаните функции. Калкулаторът събира базова цена и надбавки и показва ориентировъчен ценови диапазон, който се обновява в реално време."),
    ("Обвързваща ли е оценката?", "Не, това е ориентировъчна оценка за насока. Точната оферта зависи от детайлите на проекта и я предоставяме безплатно до 24 часа след кратък анализ на нуждите ви."),
    ("Колко реално струва един сайт?", "Визитен сайт започва от &euro;800, онлайн магазин от &euro;1200, а софтуер по поръчка от &euro;2000. Крайната цена зависи от страници, функции и интеграции: използвайте калкулатора за реалистична първа оценка."),
   ]),
 )),

dict(key="meta",
 slug=dict(it="generatore-meta-tag", en="meta-tag-generator", bg="generator-meta-tagove"),
 lang=dict(
  it=dict(
   title="Generatore Meta Tag e Open Graph Gratis | Carbon Stealth",
   desc="Genera gratis meta tag, Open Graph, Twitter Card e dati strutturati JSON-LD per il tuo sito. Compila i campi, copia il codice pronto e incollalo nell'head.",
   h1="Generatore Meta Tag e Open Graph",
   intro='<p>Questo <strong>generatore di meta tag</strong> crea al volo tutti i tag SEO e social della tua pagina: title, meta description, canonical, Open Graph, Twitter Card e uno snippet JSON-LD. Compila i campi e copia il codice pronto da incollare nel <code>&lt;head&gt;</code> del tuo sito. Tutto avviene nel browser, nessun dato viene inviato.</p>'
         '<p>Meta tag corretti migliorano l\'aspetto dei tuoi link su Google e sui social e aiutano il posizionamento. Se vuoi una strategia completa vedi i nostri servizi di <a href="/servizi/seo/">SEO</a> e <a href="/servizi/sviluppo-siti-web/">sviluppo siti web</a>, oppure <a href="/contatti/">richiedi una consulenza</a>.</p>',
   ui=dict(title_label="Titolo", desc_label="Descrizione", url_label="URL della pagina",
     image_label="URL immagine", site_label="Nome del sito", type_label="Tipo di pagina",
     output_label="Codice generato", copy="Copia", copied="Copiato!",
     ph_t="La mia pagina - Titolo", ph_d="Breve descrizione della pagina",
     ph_u="https://esempio.it/pagina", ph_img="https://esempio.it/immagine.jpg", ph_site="Nome Azienda",
     type_options=[("website","Sito web"),("article","Articolo"),("product","Prodotto"),("profile","Profilo")]),
   faqs=[
    ("Cosa sono i meta tag e a cosa servono?", "I meta tag descrivono la tua pagina a motori di ricerca e social network. Title e description influenzano come appari su Google; i tag Open Graph e Twitter controllano l'anteprima quando il link viene condiviso."),
    ("Come uso il codice generato?", "Copia tutto il blocco e incollalo dentro il tag head della tua pagina HTML. Aggiorna i valori per ogni pagina del sito con titolo, descrizione e URL corretti."),
    ("Il generatore crea anche i dati strutturati?", "Si. Oltre ai meta tag genera uno snippet JSON-LD di tipo WebPage con l'organizzazione editrice, utile per aiutare Google a capire meglio la tua pagina."),
   ]),
  en=dict(
   title="Free Meta Tag and Open Graph Generator | Carbon Stealth",
   desc="Generate meta tags, Open Graph, Twitter Card and JSON-LD structured data for free. Fill in the fields, copy the ready code and paste it in your head.",
   h1="Meta Tag and Open Graph Generator",
   intro='<p>This free <strong>meta tag generator</strong> instantly builds every SEO and social tag for your page: title, meta description, canonical, Open Graph, Twitter Card and a JSON-LD snippet. Fill in the fields and copy the ready code to paste into the <code>&lt;head&gt;</code> of your site. Everything runs in the browser, no data is sent.</p>'
         '<p>Correct meta tags improve how your links look on Google and social media and help your rankings. For a complete strategy see our <a href="/en/services/seo/">SEO</a> and <a href="/en/services/web-development/">web development</a> services, or <a href="/en/contact/">request a consultation</a>.</p>',
   ui=dict(title_label="Title", desc_label="Description", url_label="Page URL",
     image_label="Image URL", site_label="Site name", type_label="Page type",
     output_label="Generated code", copy="Copy", copied="Copied!",
     ph_t="My page - Title", ph_d="Short description of the page",
     ph_u="https://example.com/page", ph_img="https://example.com/image.jpg", ph_site="Company Name",
     type_options=[("website","Website"),("article","Article"),("product","Product"),("profile","Profile")]),
   faqs=[
    ("What are meta tags and what are they for?", "Meta tags describe your page to search engines and social networks. Title and description affect how you appear on Google; Open Graph and Twitter tags control the preview when the link is shared."),
    ("How do I use the generated code?", "Copy the whole block and paste it inside the head tag of your HTML page. Update the values for each page of the site with the correct title, description and URL."),
    ("Does the generator also create structured data?", "Yes. Besides the meta tags it generates a JSON-LD snippet of type WebPage with the publishing organization, which helps Google understand your page better."),
   ]),
  bg=dict(
   title="Безплатен Генератор на Meta Тагове и Open Graph | Carbon Stealth",
   desc="Генерирайте безплатно meta тагове, Open Graph, Twitter Card и структурирани данни JSON-LD. Попълнете полетата, копирайте готовия код и го поставете в head.",
   h1="Генератор на Meta Тагове и Open Graph",
   intro='<p>Този безплатен <strong>генератор на meta тагове</strong> създава мигновено всички SEO и социални тагове за вашата страница: title, meta description, canonical, Open Graph, Twitter Card и JSON-LD фрагмент. Попълнете полетата и копирайте готовия код за поставяне в <code>&lt;head&gt;</code> на сайта. Всичко се случва в браузъра, без изпращане на данни.</p>'
         '<p>Правилните meta тагове подобряват вида на връзките ви в Google и социалните мрежи и помагат за класирането. За цялостна стратегия вижте услугите ни за <a href="/bg/uslugi/seo/">SEO</a> и <a href="/bg/uslugi/web-razrabotka/">изработка на сайтове</a>, или <a href="/bg/kontakti/">заявете консултация</a>.</p>',
   ui=dict(title_label="Заглавие", desc_label="Описание", url_label="URL на страницата",
     image_label="URL на изображение", site_label="Име на сайта", type_label="Тип страница",
     output_label="Генериран код", copy="Копирай", copied="Копирано!",
     ph_t="Моята страница - Заглавие", ph_d="Кратко описание на страницата",
     ph_u="https://primer.bg/stranica", ph_img="https://primer.bg/izobrazhenie.jpg", ph_site="Име на фирма",
     type_options=[("website","Уебсайт"),("article","Статия"),("product","Продукт"),("profile","Профил")]),
   faqs=[
    ("Какво представляват meta таговете и за какво служат?", "Meta таговете описват страницата ви пред търсачките и социалните мрежи. Title и description влияят как изглеждате в Google; Open Graph и Twitter таговете управляват визуализацията при споделяне на връзката."),
    ("Как да използвам генерирания код?", "Копирайте целия блок и го поставете в head тага на вашата HTML страница. Обновете стойностите за всяка страница на сайта с правилно заглавие, описание и URL."),
    ("Генераторът създава ли и структурирани данни?", "Да. Освен meta таговете генерира JSON-LD фрагмент от тип WebPage с издаващата организация, който помага на Google да разбере по-добре страницата ви."),
   ]),
 )),
]

# ── Hub content ──────────────────────────────────────────────────
HUB = {
 "it": dict(
   title="Strumenti Gratuiti per il Tuo Sito Web | Carbon Stealth",
   desc="Strumenti online gratuiti per il web: calcolatore di preventivo e generatore di meta tag. Funzionano nel browser, senza registrazione e senza installazioni.",
   h1="Strumenti Gratuiti",
   intro='<p>Una raccolta di <strong>strumenti gratuiti</strong> per chi ha un sito web o sta per farne uno. Funzionano interamente nel tuo browser, senza registrazione e senza inviare dati. Stima il costo di un progetto o genera i meta tag della tua pagina in pochi secondi.</p>',
   go="Apri lo strumento"),
 "en": dict(
   title="Free Tools for Your Website | Carbon Stealth",
   desc="Free online web tools: a website quote calculator and a meta tag generator. They run in your browser, with no sign-up and nothing to install.",
   h1="Free Tools",
   intro='<p>A collection of <strong>free tools</strong> for anyone with a website or about to build one. They run entirely in your browser, with no sign-up and no data sent. Estimate the cost of a project or generate your page meta tags in seconds.</p>',
   go="Open the tool"),
 "bg": dict(
   title="Безплатни Инструменти за Вашия Сайт | Carbon Stealth",
   desc="Безплатни онлайн инструменти за уеб: калкулатор за оферта на сайт и генератор на meta тагове. Работят в браузъра, без регистрация и без инсталация.",
   h1="Безплатни Инструменти",
   intro='<p>Колекция от <strong>безплатни инструменти</strong> за всеки със сайт или на път да си направи. Работят изцяло в браузъра ви, без регистрация и без изпращане на данни. Оценете цената на проект или генерирайте meta таговете на страницата си за секунди.</p>',
   go="Отвори инструмента"),
}

ORG = {"@type": "Organization", "name": "Carbon Stealth VCC", "url": BASE,
       "logo": {"@type": "ImageObject", "url": "https://carbonstealth.eu/logo.png", "width": 1373, "height": 585}}

# ── Path helpers ─────────────────────────────────────────────────
def tool_path(lang, tool):
    return L[lang]["tools"] + tool["slug"][lang] + "/"

def esc(s):
    return html.escape(s, quote=True)

# ── Head / JSON-LD ───────────────────────────────────────────────
def head(lang, title, desc, self_path, alt_paths):
    s = L[lang]
    canon = BASE + self_path
    alts = "".join(
        f'<link rel="alternate" hreflang="{l}" href="{BASE}{alt_paths[l]}"/>' for l in ("it", "en", "bg")
    ) + f'<link rel="alternate" hreflang="x-default" href="{BASE}{alt_paths["it"]}"/>'
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

def jsonld_tool(lang, tool):
    s = L[lang]
    c = tool["lang"][lang]
    canon = BASE + tool_path(lang, tool)
    hub = BASE + s["tools"]
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebApplication", "@id": canon + "#app", "name": c["h1"], "url": canon,
         "description": c["desc"], "applicationCategory": "BusinessApplication",
         "operatingSystem": "All", "browserRequirements": "Requires JavaScript",
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"},
         "inLanguage": lang, "isAccessibleForFree": True, "publisher": ORG},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": s["home_name"], "item": BASE + (s["prefix"] or "") + "/"},
            {"@type": "ListItem", "position": 2, "name": s["tools_name"], "item": hub},
            {"@type": "ListItem", "position": 3, "name": c["h1"], "item": canon}]},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in c["faqs"]]},
    ]}
    return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "</script>"

def jsonld_hub(lang):
    s = L[lang]
    h = HUB[lang]
    canon = BASE + s["tools"]
    parts = []
    for tool in TOOLS:
        c = tool["lang"][lang]
        parts.append({"@type": "WebApplication", "name": c["h1"], "url": BASE + tool_path(lang, tool),
                      "applicationCategory": "BusinessApplication",
                      "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"}})
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebSite", "@id": BASE + "#website", "url": BASE, "name": "Carbon Stealth VCC", "inLanguage": lang},
        {"@type": "CollectionPage", "@id": canon + "#page", "url": canon, "name": h["title"],
         "description": h["desc"], "inLanguage": lang, "isPartOf": {"@id": BASE + "#website"},
         "hasPart": parts},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": s["home_name"], "item": BASE + (s["prefix"] or "") + "/"},
            {"@type": "ListItem", "position": 2, "name": s["tools_name"], "item": canon}]},
    ]}
    return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "</script>"

# ── Renderers ────────────────────────────────────────────────────
def render_tool(lang, tool):
    s = L[lang]
    c = tool["lang"][lang]
    alt = {l: tool_path(l, tool) for l in ("it", "en", "bg")}
    self_path = tool_path(lang, tool)
    faq_html = "".join(
        f'<div class="faq-item"><div class="faq-q">{html.escape(q)}</div><div class="faq-a">{html.escape(a)}</div></div>'
        for q, a in c["faqs"])
    ui_html = UI_BUILDERS[tool["key"]](lang, c["ui"])
    return (
        head(lang, c["title"], c["desc"], self_path, alt)
        + jsonld_tool(lang, tool)
        + "\n</head><body>"
        + s["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["tag"]}</div><h1>{html.escape(c["h1"])}</h1></div></div>'
        + '<div class="w">'
        + c["intro"]
        + ui_html
        + f'<h2>{s["faq_h2"]}</h2>{faq_html}'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a>'
        + '</div>'
        + s["ft"]
        + "</body></html>\n"
    )

def render_hub(lang):
    s = L[lang]
    h = HUB[lang]
    alt = {l: L[l]["tools"] for l in ("it", "en", "bg")}
    cards = ""
    for tool in TOOLS:
        c = tool["lang"][lang]
        url = tool_path(lang, tool)
        cards += (f'<div class="card"><h3>{html.escape(c["h1"])}</h3>'
                  f'<p>{esc(c["desc"])}</p>'
                  f'<a class="go" href="{url}">{h["go"]} &rarr;</a></div>')
    return (
        head(lang, h["title"], h["desc"], s["tools"], alt)
        + jsonld_hub(lang)
        + "\n</head><body>"
        + s["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["tag"]}</div><h1>{html.escape(h["h1"])}</h1></div></div>'
        + '<div class="w">'
        + h["intro"]
        + f'<div class="cards">{cards}</div>'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a>'
        + '</div>'
        + s["ft"]
        + "</body></html>\n"
    )

# ── Sitemap ──────────────────────────────────────────────────────
def sitemap():
    urls = []
    for lang in ("it", "en", "bg"):
        urls.append(BASE + L[lang]["tools"])
        for tool in TOOLS:
            urls.append(BASE + tool_path(lang, tool))
    body = "".join(
        f'<url><loc>{u}</loc><lastmod>{DATE}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>'
        for u in urls)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            + body + '</urlset>\n'), len(urls)

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def main():
    n = 0
    for lang in ("it", "en", "bg"):
        prefix = L[lang]["prefix"].lstrip("/")
        root = os.path.join("public", prefix) if prefix else "public"
        sub = L[lang]["tools"].strip("/").split("/")[-1]  # strumenti / tools / instrumenti
        # hub
        write(os.path.join(root, sub, "index.html"), render_hub(lang))
        n += 1
        # tools
        for tool in TOOLS:
            write(os.path.join(root, sub, tool["slug"][lang], "index.html"), render_tool(lang, tool))
            n += 1
    sm, count = sitemap()
    write(os.path.join("public", "sitemap-tools.xml"), sm)
    print(f"wrote {n} tool pages (3 hubs + {len(TOOLS)}x3 tools) and sitemap-tools.xml with {count} URLs")

if __name__ == "__main__":
    main()
