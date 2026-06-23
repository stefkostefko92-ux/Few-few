#!/usr/bin/env python3
"""Generate corporate trust pages (Team, Careers, Legal Notice/Imprint) in it/en/bg.
Run from repo root. Reuses the site's shared static-page CSS."""
import os, html, json

BASE="https://carbonstealth.eu"
STYLE=open('/tmp/cs_style.txt').read()
FONTS='<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">'

NAV={
 'it':'<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/chi-siamo/">CHI SIAMO</a><a href="/team/">TEAM</a><a href="/servizi/sviluppo-siti-web/">SERVIZI</a><a href="/portfolio/">PORTFOLIO</a><a href="/contatti/">CONTATTI</a></div></nav>',
 'en':'<nav class="nav"><a href="/en/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/en/">HOME</a><a href="/en/about/">ABOUT</a><a href="/en/team/">TEAM</a><a href="/en/services/web-development/">SERVICES</a><a href="/en/portfolio/">PORTFOLIO</a><a href="/en/contact/">CONTACT</a></div></nav>',
 'bg':'<nav class="nav"><a href="/bg/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/bg/">ГЛАВНА</a><a href="/bg/za-nas/">ЗА НАС</a><a href="/bg/ekip/">ЕКИП</a><a href="/bg/uslugi/web-razrabotka/">УСЛУГИ</a><a href="/bg/portfolio/">ПОРТФОЛИО</a><a href="/bg/kontakti/">КОНТАКТИ</a></div></nav>',
}
FT={
 'it':'<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Tutti i diritti riservati &middot; <a href="/privacy/">Privacy</a> &middot; <a href="/cookie/">Cookie</a> &middot; <a href="/termini/">Termini</a> &middot; <a href="/note-legali/">Note Legali</a></p></div>',
 'en':'<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>All rights reserved &middot; <a href="/en/privacy/">Privacy</a> &middot; <a href="/en/cookie/">Cookie</a> &middot; <a href="/en/terms/">Terms</a> &middot; <a href="/en/legal-notice/">Legal Notice</a></p></div>',
 'bg':'<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; ЕИК BG208725180 &middot; Бобов дол, България</p><p>Всички права запазени &middot; <a href="/bg/privacy/">Поверителност</a> &middot; <a href="/bg/cookie/">Бисквитки</a> &middot; <a href="/bg/usloviya/">Условия</a> &middot; <a href="/bg/imprint/">Правни данни</a></p></div>',
}
LOC={'it':'it_IT','en':'en_US','bg':'bg_BG'}

def page(lang, slug_map, title, desc, schema, body, region="BG-14"):
    slug=slug_map[lang]
    canon=BASE+slug
    alts="".join(f'<link rel="alternate" hreflang="{l}" href="{BASE}{slug_map[l]}"/>' for l in ('it','en','bg'))
    alts+=f'<link rel="alternate" hreflang="x-default" href="{BASE}{slug_map["it"]}"/>'
    og = 'og-image.png' if lang=='it' else f'og-image-{lang}.png'
    h=f'''<!DOCTYPE html><html lang="{lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc,quote=True)}">
<link rel="canonical" href="{canon}">
{alts}
<meta property="og:type" content="website"><meta property="og:site_name" content="Carbon Stealth VCC">
<meta property="og:title" content="{html.escape(title,quote=True)}"><meta property="og:description" content="{html.escape(desc,quote=True)}">
<meta property="og:url" content="{canon}"><meta property="og:image" content="{BASE}/{og}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale" content="{LOC[lang]}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{BASE}/{og}">
<meta name="geo.region" content="{region}"><meta name="geo.placename" content="Bobov Dol">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="theme-color" content="#00e5ff">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" type="image/x-icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
{FONTS}
<style>{STYLE}</style>
<script type="application/ld+json">{json.dumps(schema,ensure_ascii=False,separators=(",",":"))}</script>
</head><body>
{NAV[lang]}
{body}
{FT[lang]}
</body></html>
'''
    os.makedirs('public'+os.path.dirname(slug), exist_ok=True)
    with open('public'+slug+'index.html','w',encoding='utf-8') as f: f.write(h)
    return canon

# ---- slug maps ----
TEAM={'it':'/team/','en':'/en/team/','bg':'/bg/ekip/'}
CAREERS={'it':'/carriere/','en':'/en/careers/','bg':'/bg/kariera/'}
IMPRINT={'it':'/note-legali/','en':'/en/legal-notice/','bg':'/bg/imprint/'}

def breadcrumb(lang, name, slug):
    home={'it':BASE+'/','en':BASE+'/en/','bg':BASE+'/bg/'}[lang]
    return {"@type":"BreadcrumbList","itemListElement":[
        {"@type":"ListItem","position":1,"name":"Home","item":home},
        {"@type":"ListItem","position":2,"name":name,"item":BASE+slug}]}

# ============ TEAM ============
team_txt={
 'it':("Il Team di Carbon Stealth","Chi c'è dietro Carbon Stealth VCC — fondatore, competenze e modo di lavorare. Un team full-stack remote-first con sede a Bobov Dol, Bulgaria.",
   "Stefan Kostadinov","CEO e Fondatore",
   "Stefan Kostadinov ha fondato Carbon Stealth VCC con una missione semplice: costruire software che funziona davvero, senza scorciatoie. Sviluppatore full-stack con esperienza su React, Node.js, sistemi ERP, reverse engineering e stampa 3D, guida ogni progetto dalla prima riga di codice alla messa in produzione.",
   "Come lavoriamo","Siamo un team full-stack remote-first. Ogni progetto ha un referente unico che ti segue dall'analisi al lancio — niente call center, niente intermediari. Comunichiamo in italiano, inglese e bulgaro e consegniamo con 3 mesi di supporto incluso.",
   "Le nostre competenze","Sviluppo web (React, Next.js, WordPress), e-commerce, software ed ERP su misura, app mobile, game development e anti-cheat, reverse engineering e stampa 3D, SEO/AEO, DevOps e hosting cloud.",
   "Vuoi lavorare con noi?","Contattaci","/contatti/","Cerchi lavoro? Vedi le posizioni aperte","/carriere/"),
 'en':("The Carbon Stealth Team","Who is behind Carbon Stealth VCC — founder, expertise and how we work. A full-stack, remote-first team based in Bobov Dol, Bulgaria.",
   "Stefan Kostadinov","CEO & Founder",
   "Stefan Kostadinov founded Carbon Stealth VCC with one simple mission: build software that actually works, with no shortcuts. A full-stack developer experienced in React, Node.js, ERP systems, reverse engineering and 3D printing, he leads every project from the first line of code to production.",
   "How we work","We are a full-stack, remote-first team. Every project has a single point of contact who follows you from analysis to launch — no call centers, no middlemen. We communicate in Italian, English and Bulgarian and ship with 3 months of support included.",
   "Our expertise","Web development (React, Next.js, WordPress), e-commerce, custom software and ERP, mobile apps, game development and anti-cheat, reverse engineering and 3D printing, SEO/AEO, DevOps and cloud hosting.",
   "Want to work with us?","Contact us","/en/contact/","Looking for a job? See open roles","/en/careers/"),
 'bg':("Екипът на Carbon Stealth","Кой стои зад Carbon Stealth VCC — основател, експертиза и начин на работа. Full-stack remote-first екип със седалище в Бобов дол, България.",
   "Стефан Костадинов","CEO и Основател",
   "Стефан Костадинов основава Carbon Stealth VCC с една проста мисия: да изгражда софтуер, който наистина работи, без компромиси. Full-stack разработчик с опит в React, Node.js, ERP системи, reverse engineering и 3D печат, той води всеки проект от първия ред код до пускането в продукция.",
   "Как работим","Ние сме full-stack remote-first екип. Всеки проект има един отговорник, който ви води от анализа до пускането — без call центрове, без посредници. Комуникираме на италиански, английски и български и доставяме с 3 месеца включена поддръжка.",
   "Нашата експертиза","Уеб разработка (React, Next.js, WordPress), електронна търговия, софтуер и ERP по поръчка, мобилни приложения, разработка на игри и anti-cheat, reverse engineering и 3D печат, SEO/AEO, DevOps и облачен хостинг.",
   "Искате да работите с нас?","Свържете се","/bg/kontakti/","Търсите работа? Вижте отворените позиции","/bg/kariera/"),
}
for lang,(t,d,fname,frole,fbio,h2a,pa,h2b,pb,cta1,cta1l,cta1u,cta2,cta2u) in team_txt.items():
    person={"@type":"Person","@id":BASE+"/#stefan","name":fname,"jobTitle":frole,"worksFor":{"@id":BASE+"/#organization"},"knowsAbout":["Web Development","Software Engineering","ERP","Reverse Engineering","3D Printing","SEO"]}
    schema={"@context":"https://schema.org","@graph":[
        {"@type":"AboutPage","@id":BASE+TEAM[lang]+"#page","url":BASE+TEAM[lang],"name":t,"inLanguage":lang,"about":{"@id":BASE+"/#organization"},"mainEntity":person},
        person, breadcrumb(lang,t.split(" ")[-1],TEAM[lang])]}
    body=(f'<div class="hero-s"><div class="w"><div class="tag">// TEAM</div><h1>{html.escape(t)}</h1></div></div>'
        f'<div class="w"><h2>{html.escape(frole)}: {html.escape(fname)}</h2><p>{html.escape(fbio)}</p>'
        f'<h2>{html.escape(h2a)}</h2><p>{html.escape(pa)}</p>'
        f'<h2>{html.escape(h2b)}</h2><p>{html.escape(pb)}</p>'
        f'<p style="margin-top:24px"><a class="cta" href="{cta1u}">{html.escape(cta1l)} &rarr;</a></p>'
        f'<p style="font-size:11px;margin-top:12px"><a href="{cta2u}">{html.escape(cta2)} &rarr;</a></p></div>')
    page(lang,TEAM,t+" | Carbon Stealth VCC",d,schema,body)

# ============ CAREERS ============
car_txt={
 'it':("Lavora con Noi","Posizioni aperte e candidature spontanee in Carbon Stealth VCC. Agenzia digitale remote-first: sviluppo web, software, game dev, reverse engineering e stampa 3D.",
   "Carbon Stealth è un'agenzia digitale remote-first. Cerchiamo persone curiose e autonome che amano risolvere problemi difficili — non importa il diploma, importa cosa sai costruire.",
   "Profili che ci interessano","Sviluppatori full-stack (React, Node.js, PostgreSQL), specialisti SEO/AEO, designer UI/UX, sviluppatori di giochi (FiveM, browser MMO), ingegneri embedded / reverse engineering.",
   "Cosa offriamo","Lavoro 100% remoto, progetti reali con impatto, stack moderno, crescita tecnica continua e un team piccolo dove la tua voce conta.",
   "Come candidarsi","Invia CV e portfolio (o GitHub) a","info@carbonstealth.eu","Rispondiamo a ogni candidatura entro una settimana."),
 'en':("Careers","Open roles and open applications at Carbon Stealth VCC. A remote-first digital agency: web development, software, game dev, reverse engineering and 3D printing.",
   "Carbon Stealth is a remote-first digital agency. We look for curious, self-driven people who love solving hard problems — your degree matters less than what you can build.",
   "Profiles we look for","Full-stack developers (React, Node.js, PostgreSQL), SEO/AEO specialists, UI/UX designers, game developers (FiveM, browser MMO), embedded / reverse-engineering engineers.",
   "What we offer","100% remote work, real projects with impact, a modern stack, continuous technical growth, and a small team where your voice counts.",
   "How to apply","Send your CV and portfolio (or GitHub) to","info@carbonstealth.eu","We reply to every application within a week."),
 'bg':("Кариери","Отворени позиции и спонтанни кандидатури в Carbon Stealth VCC. Remote-first дигитална агенция: уеб разработка, софтуер, игри, reverse engineering и 3D печат.",
   "Carbon Stealth е remote-first дигитална агенция. Търсим любопитни и самостоятелни хора, които обичат да решават трудни проблеми — дипломата значи по-малко от това какво можеш да изградиш.",
   "Профили, които търсим","Full-stack разработчици (React, Node.js, PostgreSQL), SEO/AEO специалисти, UI/UX дизайнери, разработчици на игри (FiveM, браузър MMO), embedded / reverse-engineering инженери.",
   "Какво предлагаме","100% дистанционна работа, реални проекти с въздействие, модерен стек, постоянно техническо развитие и малък екип, в който твоят глас има значение.",
   "Как да кандидатствате","Изпрати CV и портфолио (или GitHub) на","info@carbonstealth.eu","Отговаряме на всяка кандидатура до седмица."),
}
for lang,(t,d,intro,h2a,pa,h2b,pb,h2c,applypre,applymail,applypost) in car_txt.items():
    schema={"@context":"https://schema.org","@graph":[
        {"@type":"WebPage","@id":BASE+CAREERS[lang]+"#page","url":BASE+CAREERS[lang],"name":t,"inLanguage":lang,"about":{"@id":BASE+"/#organization"}},
        breadcrumb(lang,t,CAREERS[lang])]}
    body=(f'<div class="hero-s"><div class="w"><div class="tag">// CAREERS</div><h1>{html.escape(t)}</h1></div></div>'
        f'<div class="w"><p>{html.escape(intro)}</p>'
        f'<h2>{html.escape(h2a)}</h2><p>{html.escape(pa)}</p>'
        f'<h2>{html.escape(h2b)}</h2><p>{html.escape(pb)}</p>'
        f'<h2>{html.escape(h2c)}</h2><p>{html.escape(applypre)} <a href="mailto:{applymail}">{applymail}</a>. {html.escape(applypost)}</p>'
        f'<p style="margin-top:24px"><a class="cta" href="mailto:{applymail}">{html.escape(applymail)} &rarr;</a></p></div>')
    page(lang,CAREERS,t+" | Carbon Stealth VCC",d,schema,body)

# ============ IMPRINT / LEGAL NOTICE ============
imp_txt={
 'it':("Note Legali","Dati legali e societari di Carbon Stealth VCC: ragione sociale, EIK, partita IVA, sede, contatti e responsabile dei contenuti.",
   "Dati Societari","Ragione sociale","Carbon Stealth VCC","EIK (Registro Imprese Bulgaria)","BG208725180","Partita IVA","BG208725180","Sede legale","ul. Samuil 3, Bobov Dol 2670, Bulgaria","Email","info@carbonstealth.eu","Telefono","+39 379 296 9699 / +359 877 414 874","Responsabile dei contenuti","Stefan Kostadinov (CEO e Fondatore)",
   "Responsabilità","I contenuti di questo sito sono redatti con la massima cura. Carbon Stealth VCC non risponde di eventuali errori o omissioni. I link a siti esterni sono forniti per comodità; non abbiamo controllo sui loro contenuti.",
   "Foro competente","Per qualsiasi controversia è competente il foro di Kyustendil, Bulgaria, salvo diversa disposizione di legge."),
 'en':("Legal Notice","Legal and company information for Carbon Stealth VCC: legal name, EIK, VAT, registered office, contacts and person responsible for content.",
   "Company Details","Legal name","Carbon Stealth VCC","EIK (Bulgarian Commercial Register)","BG208725180","VAT number","BG208725180","Registered office","ul. Samuil 3, Bobov Dol 2670, Bulgaria","Email","info@carbonstealth.eu","Phone","+39 379 296 9699 / +359 877 414 874","Responsible for content","Stefan Kostadinov (CEO & Founder)",
   "Liability","The content of this website is prepared with the utmost care. Carbon Stealth VCC is not liable for any errors or omissions. Links to external sites are provided for convenience; we have no control over their content.",
   "Jurisdiction","Any dispute is subject to the jurisdiction of Kyustendil, Bulgaria, unless otherwise required by law."),
 'bg':("Правни Данни","Правна и фирмена информация за Carbon Stealth VCC: наименование, ЕИК, ДДС номер, седалище, контакти и отговорник за съдържанието.",
   "Фирмени Данни","Наименование","Carbon Stealth VCC","ЕИК (Търговски регистър)","BG208725180","ДДС номер","BG208725180","Седалище","ул. Самуил 3, Бобов дол 2670, България","Имейл","info@carbonstealth.eu","Телефон","+39 379 296 9699 / +359 877 414 874","Отговорник за съдържанието","Стефан Костадинов (CEO и Основател)",
   "Отговорност","Съдържанието на този сайт е изготвено с максимално внимание. Carbon Stealth VCC не носи отговорност за евентуални грешки или пропуски. Връзките към външни сайтове са предоставени за удобство; нямаме контрол върху тяхното съдържание.",
   "Подсъдност","Всеки спор е подсъден на съда в Кюстендил, България, освен ако законът не предвижда друго."),
}
for lang,vals in imp_txt.items():
    t,d=vals[0],vals[1]
    h2a=vals[2]; rows=vals[3:17]; h2b,pb,h2c,pc=vals[17],vals[18],vals[19],vals[20]
    schema={"@context":"https://schema.org","@graph":[
        {"@type":"WebPage","@id":BASE+IMPRINT[lang]+"#page","url":BASE+IMPRINT[lang],"name":t,"inLanguage":lang,"about":{"@id":BASE+"/#organization"}},
        breadcrumb(lang,t,IMPRINT[lang])]}
    rows_html="".join(f'<p><strong>{html.escape(rows[i])}:</strong> {html.escape(rows[i+1])}</p>' for i in range(0,len(rows),2))
    body=(f'<div class="hero-s"><div class="w"><div class="tag">// LEGAL</div><h1>{html.escape(t)}</h1></div></div>'
        f'<div class="w"><h2>{html.escape(h2a)}</h2>{rows_html}'
        f'<h2>{html.escape(h2b)}</h2><p>{html.escape(pb)}</p>'
        f'<h2>{html.escape(h2c)}</h2><p>{html.escape(pc)}</p></div>')
    page(lang,IMPRINT,t+" | Carbon Stealth VCC",d,schema,body)

print("Generated 9 corporate pages")
print("TEAM:",list(TEAM.values()))
print("CAREERS:",list(CAREERS.values()))
print("IMPRINT:",list(IMPRINT.values()))
