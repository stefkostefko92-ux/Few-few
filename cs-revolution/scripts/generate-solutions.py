#!/usr/bin/env python3
"""Четирите направления на Carbon Stealth (it/en/bg) — доклад SEO/GEO/AEO, 22.11.2026, §3.

Пуска се от cs-revolution/: python3 scripts/generate-solutions.py

Хъб + 4 страници × 3 езика: Software aziendale · Tecnologia industriale · Siti ed e-commerce ·
Game e interattivo. Всяка страница: отговор отпред, услугите с иконите от началната (public/brand/svc),
реални проекти със снимки (public/work), за кого е, какво ни трябва, обща основа (хостинг/поддръжка),
FAQ (видим = FAQPage), видими трохи (= BreadcrumbList). Само факти от кода и сайта: кейс стъдитата,
портфолиото, src/pricing.json, цените от страниците на услугите. Без клиенти, резултати и отзиви,
които ги няма. Навигацията се подменя от solutions-nav.py (менюто „Soluzioni“ с падащия списък).
Пише и public/sitemap-solutions.xml и го добавя в индекса public/sitemap.xml.
"""
import html
import json
import os
import re

BASE = "https://carbonstealth.eu"
LASTMOD = "2026-11-22"
LANGS = ("it", "en", "bg")

STYLE = ("*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#ccc;font-family:'Space Mono',monospace;font-size:13px;line-height:2;padding:0}"
         "a{color:#00e5ff;text-decoration:none}.w{max-width:900px;margin:0 auto;padding:40px 20px}"
         "h1{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2.5rem;color:#f5f5f0;margin-bottom:16px;letter-spacing:-.03em;line-height:1.1}"
         "h2{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.2rem;color:#00e5ff;margin:40px 0 12px;text-transform:uppercase;letter-spacing:.05em}"
         "h3{color:#f5f5f0;font-size:1rem;margin:20px 0 8px}p,li{margin-bottom:10px;line-height:1.9}ul,ol{padding-left:20px}"
         ".nav{position:fixed;top:0;width:100%;background:rgba(0,0,0,.9);border-bottom:1px solid rgba(0,229,255,.22);padding:12px 20px;z-index:1000;display:flex;justify-content:space-between;align-items:center}"
         ".nav a{color:#ccc;font-size:10px;letter-spacing:.2em;margin:0 10px}.nav img{height:30px}"
         ".hero-s{padding:120px 20px 60px;border-bottom:1px solid rgba(0,229,255,.1)}.tag{font-size:9px;color:#00e5ff;letter-spacing:.4em;margin-bottom:12px}"
         ".bc{font-size:10px;letter-spacing:.12em;color:#9aa5ac;margin-bottom:14px}.bc a{color:#9aa5ac;text-decoration:underline;text-underline-offset:3px}"
         ".lead{font-size:14px;color:#d6dde1;max-width:68ch}"
         ".cta{display:inline-block;padding:14px 32px;border:1px solid #00e5ff;color:#00e5ff;font-size:11px;letter-spacing:.25em;margin-top:24px}"
         ".ft{border-top:1px solid rgba(245,245,240,.06);padding:30px 20px;text-align:center;font-size:9px;color:#8a949b;margin-top:60px}.ft a{text-decoration:underline}"
         ".svc{display:grid;grid-template-columns:120px 1fr;gap:20px;align-items:center;padding:16px 0;border-bottom:1px solid rgba(245,245,240,.06)}"
         ".svc img{display:block;width:120px;height:auto;aspect-ratio:192/159}.svc h3{margin:0 0 4px}.svc p{margin:0;font-size:12px}"
         ".svc .from{display:inline-block;margin-top:6px;font-size:10px;letter-spacing:.18em;color:#00e5ff;border:1px solid rgba(0,229,255,.25);padding:1px 8px}"
         ".proofs{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin:20px 0}"
         ".proof{border:1px solid rgba(0,229,255,.15);display:flex;flex-direction:column;background:rgba(0,229,255,.015)}"
         ".proof img{display:block;width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:top;border-bottom:1px solid rgba(0,229,255,.14);background:#050607}"
         ".proof>div{padding:16px 18px}.proof h3{margin:0 0 6px}.proof p{font-size:11.5px;color:#c4ccd1;margin:0 0 10px;line-height:1.8}"
         ".proof .lk{font-size:10px;letter-spacing:.1em;display:flex;flex-wrap:wrap;gap:6px 14px}"
         ".steps{padding-left:22px}.steps li{padding-left:4px}"
         ".base{border:1px dashed rgba(0,229,255,.28);padding:16px 20px;margin:24px 0;font-size:12px}"
         ".faq-item{border-bottom:1px solid rgba(245,245,240,.06);padding:16px 0}.faq-q{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1rem;color:#f5f5f0;margin-bottom:6px}.faq-a{font-size:12px;color:#ccc}"
         ".sect{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.sect a{padding:6px 14px;border:1px solid rgba(0,229,255,.2);font-size:11px}"
         ".cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin:20px 0}"
         ".card{border:1px solid rgba(0,229,255,.15);padding:20px;display:block;color:inherit}.card:hover{border-color:rgba(0,229,255,.5)}"
         ".card h3{margin:0 0 8px;color:#f5f5f0;font-size:1.15rem}.card p{font-size:11.5px;color:#c4ccd1;margin:0 0 8px}.card .k{font-size:9px;color:#00e5ff;letter-spacing:.3em;display:block;margin-bottom:10px}"
         ".card .ico{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 12px}.card .ico img{width:64px;max-width:30%;height:auto;aspect-ratio:192/159}"
         "@media(max-width:560px){.svc{grid-template-columns:84px 1fr;gap:14px}.svc img{width:84px}}")

FONTS = '<link href="/fonts/fonts.css" rel="stylesheet">'

# ── Езиците: адреси, етикети, страниците на услугите ──────────────────────
L = {
 "it": dict(
   prefix="", urlbase="/soluzioni/", og="og/og-servizi.png", locale="it_IT", home="/", contact="/contatti/",
   hub_name="Soluzioni", tag="// SOLUZIONI", cta="RICHIEDI UN PREVENTIVO GRATUITO", faq_h2="Domande frequenti",
   svc_h2="Cosa comprende", proof_h2="Progetti reali", who_h2="Per chi è", start_h2="Cosa ci serve per partire",
   base_h2="La base comune", others_h2="Le altre soluzioni", hub_link="Tutte le soluzioni", sectors="Soluzioni per settore",
   cases="Tutti i case study", visit="Sito", case="Case study", sector="Settore ascensori", from_="da",
   proj="Progetti", svcs="Servizi", focus=("AREA PRINCIPALE", "AREA PRINCIPALE", "ESIGENZE PIÙ COMUNI", "AREA A PARTE"),
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="70" height="30" decoding="async"></a><div><a href="/">HOME</a><a href="/soluzioni/">SOLUZIONI</a><a href="/settori/">SETTORI</a><a href="/case-study/">CASE STUDY</a><a href="/prezzi/">PREZZI</a><a href="/chi-siamo/">CHI SIAMO</a><a href="/contatti/">CONTATTI</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK 208725180 &middot; Bobov Dol, Bulgaria</p><p>Tutti i diritti riservati &middot; <a href="/privacy/">Privacy</a> &middot; <a href="/cookie/">Cookie</a> &middot; <a href="/termini/">Terms</a></p><p class="ft-links" style="margin-top:10px"><a href="/prezzi/">Prezzi</a> &middot; <a href="/portfolio/">Portfolio</a> &middot; <a href="/settori/">Settori</a> &middot; <a href="/geo/">Città</a> &middot; <a href="/servizi-locali/">Servizi locali</a> &middot; <a href="/blog/">Blog</a> &middot; <a href="/glossario/">Glossario</a> &middot; <a href="/confronti/">Confronti</a> &middot; <a href="/case-study/">Case study</a> &middot; <a href="/strumenti/">Strumenti</a></p></div>',
   u=dict(erp="/servizi/erp/", software="/servizi/sviluppo-software/", web="/servizi/sviluppo-siti-web/", ecom="/servizi/ecommerce/",
          app="/servizi/app-mobile/", seo="/servizi/seo/", hosting="/servizi/hosting/", test="/test/", pricing="/prezzi/",
          sectors="/settori/", asc="/settori/ascensori/", cases="/case-study/", cs_erp="/case-study/erp-ascensori/",
          cs_nexus="/case-study/nexus-dominion/", cs_ou="/case-study/ou-vaptsarov/", cs_treti="/case-study/treti-mart/")),
 "en": dict(
   prefix="/en", urlbase="/en/solutions/", og="og/og-servizi-en.png", locale="en_US", home="/en/", contact="/en/contact/",
   hub_name="Solutions", tag="// SOLUTIONS", cta="REQUEST A FREE QUOTE", faq_h2="Frequently asked questions",
   svc_h2="What it includes", proof_h2="Real projects", who_h2="Who it is for", start_h2="What we need to start",
   base_h2="The common foundation", others_h2="Other solutions", hub_link="All solutions", sectors="Solutions by industry",
   cases="All case studies", visit="Site", case="Case study", sector="Elevator industry", from_="from",
   proj="Projects", svcs="Services", focus=("MAIN AREA", "MAIN AREA", "COMMON NEEDS", "SEPARATE AREA"),
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="70" height="30" decoding="async"></a><div><a href="/en/">HOME</a><a href="/en/solutions/">SOLUTIONS</a><a href="/en/industries/">INDUSTRIES</a><a href="/en/case-studies/">CASE STUDIES</a><a href="/en/pricing/">PRICING</a><a href="/en/about/">ABOUT</a><a href="/en/contact/">CONTACT</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK 208725180 &middot; Bobov Dol, Bulgaria</p><p>All rights reserved &middot; <a href="/en/privacy/">Privacy</a> &middot; <a href="/en/cookie/">Cookie</a> &middot; <a href="/en/terms/">Terms</a></p><p class="ft-links" style="margin-top:10px"><a href="/en/pricing/">Pricing</a> &middot; <a href="/en/portfolio/">Portfolio</a> &middot; <a href="/en/industries/">Industries</a> &middot; <a href="/en/geo/">Cities</a> &middot; <a href="/en/local-services/">Local services</a> &middot; <a href="/en/blog/">Blog</a> &middot; <a href="/en/glossary/">Glossary</a> &middot; <a href="/en/comparisons/">Comparisons</a> &middot; <a href="/en/case-studies/">Case studies</a> &middot; <a href="/en/tools/">Tools</a></p></div>',
   u=dict(erp="/en/services/erp/", software="/en/services/software-development/", web="/en/services/web-development/",
          ecom="/en/services/ecommerce/", app="/en/services/mobile-apps/", seo="/en/services/seo/", hosting="/en/services/hosting/",
          test="/en/test/", pricing="/en/pricing/", sectors="/en/industries/", asc="/en/industries/ascensori/",
          cases="/en/case-studies/", cs_erp="/en/case-studies/erp-ascensori/", cs_nexus="/en/case-studies/nexus-dominion/",
          cs_ou="/en/case-studies/ou-vaptsarov/", cs_treti="/en/case-studies/treti-mart/")),
 "bg": dict(
   prefix="/bg", urlbase="/bg/resheniya/", og="og/og-servizi-bg.png", locale="bg_BG", home="/bg/", contact="/bg/kontakti/",
   hub_name="Решения", tag="// РЕШЕНИЯ", cta="ЗАЯВИ БЕЗПЛАТНА ОФЕРТА", faq_h2="Често задавани въпроси",
   svc_h2="Какво включва", proof_h2="Реални проекти", who_h2="За кого е", start_h2="Какво ни трябва, за да започнем",
   base_h2="Общата основа", others_h2="Другите решения", hub_link="Всички решения", sectors="Решения по бранш",
   cases="Всички кейс стъдита", visit="Сайт", case="Кейс стъди", sector="Асансьорен бранш", from_="от",
   proj="Проекти", svcs="Услуги", focus=("ВОДЕЩО", "ВОДЕЩО", "НАЙ-ЧЕСТИТЕ НУЖДИ", "ОТДЕЛНО НАПРАВЛЕНИЕ"),
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="70" height="30" decoding="async"></a><div><a href="/bg/">ГЛАВНА</a><a href="/bg/resheniya/">РЕШЕНИЯ</a><a href="/bg/branshove/">БРАНШОВЕ</a><a href="/bg/keys-studii/">КЕЙС СТЪДИТА</a><a href="/bg/ceni/">ЦЕНИ</a><a href="/bg/za-nas/">ЗА НАС</a><a href="/bg/kontakti/">КОНТАКТИ</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK 208725180 &middot; Bobov Dol, Bulgaria</p><p>Всички права запазени &middot; <a href="/bg/privacy/">Privacy</a> &middot; <a href="/bg/cookie/">Cookie</a> &middot; <a href="/bg/usloviya/">Terms</a></p><p class="ft-links" style="margin-top:10px"><a href="/bg/ceni/">Цени</a> &middot; <a href="/bg/portfolio/">Портфолио</a> &middot; <a href="/bg/branshove/">Браншове</a> &middot; <a href="/bg/geo/">Градове</a> &middot; <a href="/bg/uslugi-lokalni/">Услуги по градове</a> &middot; <a href="/bg/blog/">Блог</a> &middot; <a href="/bg/rechnik/">Речник</a> &middot; <a href="/bg/sravneniya/">Сравнения</a> &middot; <a href="/bg/keys-studii/">Кейс стъдита</a> &middot; <a href="/bg/instrumenti/">Инструменти</a></p></div>',
   u=dict(erp="/bg/uslugi/erp/", software="/bg/uslugi/softuer/", web="/bg/uslugi/web-razrabotka/", ecom="/bg/uslugi/ecommerce/",
          app="/bg/uslugi/mobilni-prilozheniya/", seo="/bg/uslugi/seo/", hosting="/bg/uslugi/hosting/", test="/bg/test/",
          pricing="/bg/ceni/", sectors="/bg/branshove/", asc="/bg/branshove/ascensori/", cases="/bg/keys-studii/",
          cs_erp="/bg/keys-studii/erp-ascensori/", cs_nexus="/bg/keys-studii/nexus-dominion/",
          cs_ou="/bg/keys-studii/ou-vaptsarov/", cs_treti="/bg/keys-studii/treti-mart/")),
}

# ── Проектите (снимка в public/work/<shot>-480.webp; текстът — от портфолиото и кейс стъдитата) ──
# връзки: ("case"|"sector"|"site", адрес) — "case"/"sector" са ключове в L[lang]["u"]
P = {
 "erp": dict(name="ERP Ascensori", shot="erp-ascensori", links=[("case", "cs_erp"), ("site", "https://erp.carbonstealth.eu")], t=dict(
   it="ERP per un produttore italiano di ascensori: ogni commessa seguita nelle fasi di produzione, magazzino collegato alla fatturazione senza reinserimenti, 7 livelli di accesso e dashboard BI. React, Prisma, PostgreSQL.",
   en="An ERP for an Italian elevator manufacturer: every order tracked through production, the warehouse linked to invoicing with no re-entry, 7 access levels and BI dashboards. React, Prisma, PostgreSQL.",
   bg="ERP за италиански производител на асансьори: всяка поръчка се следи през етапите на производството, складът е свързан с фактурирането без повторно въвеждане, 7 нива на достъп и BI табла. React, Prisma, PostgreSQL.")),
 "rilievi": dict(name="Rilievi Impianti", shot="rilievi", links=[("sector", "asc"), ("site", "https://rilievi.carbonstealth.eu")], t=dict(
   it="Software web per le aziende di ascensori, con accesso su invito: il tecnico compila dal telefono la scheda di rilievo e la scheda prepara i moduli d'ordine dei costruttori. Gestisce più aziende, ognuna con i propri utenti, ruoli e logo.",
   en="Web software for elevator companies, by invitation only: the technician fills in the survey sheet from a phone and the sheet fills in the manufacturers' order forms. Supports several companies, each with its own users, roles and logo.",
   bg="Уеб софтуер за фирми за асансьори, само с покана: техникът попълва от телефона схемата за оглед, а тя сама попълва формулярите за поръчка на производителите. Поддържа няколко фирми, всяка със свои потребители, роли и лого.")),
 "fakturist": dict(name=dict(it="Fakturist", en="Fakturist", bg="Фактурист"), shot="fakturist", links=[("site", "https://fakturist.carbonstealth.eu")], t=dict(
   it="Fatturazione online per aziende e studi contabili in Bulgaria: all'emissione verifica le regole principali della legge bulgara sull'IVA e salva ogni documento anche come XML secondo lo standard europeo EN 16931 (UBL 2.1 e CII).",
   en="Online invoicing for companies and accounting firms in Bulgaria: when a document is issued it checks the main rules of the Bulgarian VAT Act, and it stores every document as structured XML under the European standard EN 16931 (UBL 2.1 and CII).",
   bg="Онлайн фактуриране за фирми и счетоводни кантори: проверява основните правила на ЗДДС в момента на издаване и записва всеки документ и като структуриран XML по европейския стандарт EN 16931 (UBL 2.1 и CII).")),
 "korpora": dict(name="Korpora", shot="korpora", links=[("site", "https://korpora.carbonstealth.eu")], t=dict(
   it="Software nel browser per progettare mobili in pannelli: da un unico progetto il modello 3D, la distinta di taglio con bordatura, l'elenco della ferramenta, i disegni con la mappa di foratura e i file per la CNC — DXF R12 a livelli e G-code per controlli ISO/Fanuc e GRBL. In beta, con 30 giorni di prova.",
   en="In-browser software for designing cabinet furniture: one project gives the 3D model, the cut list with edge banding, the hardware list, drawings with a drilling map and the CNC files — layered DXF R12 and G-code for ISO/Fanuc and GRBL controllers. In beta, with a 30-day trial.",
   bg="Програма в браузъра за проектиране на корпусни мебели: от един проект — 3D модел, разкрой с кантиране, списък с обков, чертежи с карта за пробиване и файлове за CNC машината — DXF R12 на слоеве и G-code за управления ISO/Fanuc и GRBL. В бета, с 30-дневен тестов период.")),
 "panev": dict(name="Panev Ascensori", shot="panev-ascensori", links=[("sector", "asc"), ("site", "https://panevascensori.it")], t=dict(
   it="Per un produttore di staffe brevettate per ascensori (brevetto UIBM): il listino di 48 articoli con codici e prezzi, il catalogo PDF e una vista 3D fotorealistica di ogni articolo, in italiano, inglese e bulgaro.",
   en="For a maker of patented elevator brackets (UIBM patent): the 48-item price list with codes and prices, the PDF catalogue and a photorealistic 3D view of every item, in Italian, English and Bulgarian.",
   bg="За производител на патентовани скоби за асансьори (патент UIBM): ценоразпис от 48 артикула с кодове и цени, PDF каталог и фотореалистичен 3D изглед на всеки артикул, на италиански, английски и български.")),
 "zabobovdol": dict(name=dict(it="Za Bobov Dol", en="Za Bobov Dol", bg="За Бобов дол"), shot="zabobovdol", links=[("site", "https://zabobovdol.carbonstealth.eu")], t=dict(
   it="Portale civico di Bobov Dol: numeri e servizi utili, guide passo passo ai servizi online, eventi, annunci e catalogo delle attività locali, con opzioni di accessibilità.",
   en="Civic portal for Bobov Dol: useful numbers and services, step-by-step guides to online public services, events, listings and a local business directory, with accessibility options.",
   bg="Граждански портал за Бобов дол: важни телефони и услуги, обяснения стъпка по стъпка за е-услугите, събития, обяви и каталог на местния бизнес, с настройки за достъпност.")),
 "ou": dict(name=dict(it="OU Nikola Vaptsarov", en="OU Nikola Vaptsarov", bg="ОУ „Никола Вапцаров“"), shot="ou-vaptsarov", links=[("case", "cs_ou"), ("site", "https://ouvaptsarov.com")], t=dict(
   it="Sito istituzionale della scuola elementare di Bobov Dol, con sistema di notizie.",
   en="Official website of the elementary school in Bobov Dol, with a news system.",
   bg="Официален сайт на основното училище в Бобов дол, със система за новини.")),
 "treti": dict(name="Treti Mart", shot="treti-mart", links=[("case", "cs_treti"), ("site", "https://tretimart.carbonstealth.eu")], t=dict(
   it="Marketplace bulgaro con pagamenti Stripe, verifica OTP e pannello di amministrazione.",
   en="Bulgarian marketplace with Stripe payments, OTP verification and an admin panel.",
   bg="Български маркетплейс с плащания през Stripe, OTP верификация и админ панел.")),
 "evanita": dict(name="Evanita Sport", shot="evanita-sport", links=[("site", "https://evanita-bg.com")], t=dict(
   it="Sito statico veloce per uno studio femminile di Kangoo Jumps e allenamento di forza a Dupnitsa.",
   en="Fast static website for a women's Kangoo Jumps and strength training studio in Dupnitsa.",
   bg="Бърз статичен сайт за дамско студио за Kangoo Jumps и силови тренировки в Дупница.")),
 "eternal": dict(name="Eternal Touch", shot="eternal-touch", links=[("site", "https://eternaltouch.it")], t=dict(
   it="Vetrina e catalogo in tre lingue per un atelier di decorazioni in gesso fatte a mano.",
   en="Showcase and catalogue in three languages for an atelier of handmade plaster decorations.",
   bg="Витрина и каталог на три езика за ателие за ръчно изработени гипсови декорации.")),
 "mastilko": dict(name=dict(it="Mastilko", en="Mastilko", bg="Мастилко"), shot="mastilko", links=[("site", "https://mastilko-bg.com")], t=dict(
   it="Etichette, biglietti da visita e CV gratuiti, pronti per la stampa, con anteprima dal vivo su un vero foglio A4.",
   en="Free labels, business cards and CVs, print-ready, with a live preview on a real A4 sheet.",
   bg="Безплатни етикети, визитки и CV, готови за печат, с преглед на живо върху истински А4 лист.")),
 "vizitka": dict(name="Vizitka", shot="vizitka", links=[("site", "https://vizitka-bg.com")], t=dict(
   it="Biglietto da visita digitale con QR permanente: i biglietti già distribuiti si aggiornano da soli.",
   en="Digital business card with a permanent QR: the cards already handed out update themselves.",
   bg="Дигитална визитка с постоянен QR код: вече раздадените визитки се обновяват сами.")),
 "ospedali": dict(name="Ospedali Trasparenti", shot="ospedali-trasparenti", links=[("site", "https://ospedalitrasparenti.it")], t=dict(
   it="Portale civico con i dati pubblici degli ospedali italiani, accessibili e confrontabili.",
   en="Civic portal with the public data of Italian hospitals, accessible and comparable.",
   bg="Граждански портал с публичните данни на италианските болници, достъпни и сравними.")),
 "nexus": dict(name="Nexus Dominion", shot="nexus-dominion", links=[("case", "cs_nexus"), ("site", "https://nexus.carbonstealth.eu")], t=dict(
   it="MMO browser dark fantasy medievale: React, Node.js, PostgreSQL, Redis, Socket.IO e Docker; più di 52 modelli nel database e 27 pagine di gioco.",
   en="Medieval dark fantasy browser MMO: React, Node.js, PostgreSQL, Redis, Socket.IO and Docker; 52+ database models and 27 game pages.",
   bg="Средновековно dark fantasy браузър MMO: React, Node.js, PostgreSQL, Redis, Socket.IO и Docker; над 52 модела в базата и 27 игрови страници.")),
 "fivem": dict(name="FiveM Bulgaria", shot=None, links=[("site", "https://fivembulgaria.carbonstealth.eu")], t=dict(
   it="Tutti i server FiveM RP bulgari in un posto: stato online, numero di giocatori, framework (ESX, QBCore, Qbox), whitelist e Discord, con aggiornamento automatico.",
   en="Every Bulgarian FiveM RP server in one place: online status, player count, framework (ESX, QBCore, Qbox), whitelist and Discord, updating automatically.",
   bg="Всички български FiveM RP сървъри на едно място: онлайн статус, брой играчи, фреймуърк (ESX, QBCore, Qbox), whitelist и Discord, с автоматично обновяване.")),
}

# ── Общата основа (хостинг и поддръжка: src/pricing.json, addons hosting/maintenance) ──
BASE_TXT = dict(
  it='Sotto ogni soluzione c\'è la stessa base: <a href="/servizi/hosting/">hosting in UE</a> con SSL e CDN, manutenzione con aggiornamenti, backup e monitoraggio, e dati che restano nell\'Unione Europea. Il primo anno di hosting è incluso nei pacchetti dei siti; poi l\'hosting costa €13 al mese e la manutenzione €58 al mese, IVA esclusa (<a href="/prezzi/">prezzi</a>).',
  en='Every solution sits on the same foundation: <a href="/en/services/hosting/">EU hosting</a> with SSL and CDN, maintenance with updates, backups and monitoring, and data that stays in the European Union. The first year of hosting is included in the website packages; after that hosting costs €13 a month and maintenance €58 a month, excluding VAT (<a href="/en/pricing/">pricing</a>).',
  bg='Под всяко решение стои една и съща основа: <a href="/bg/uslugi/hosting/">хостинг в ЕС</a> със SSL и CDN, поддръжка с обновления, резервни копия и наблюдение, и данни, които остават в Европейския съюз. Първата година хостинг е включена в пакетите за сайтове; после хостингът е 15 € на месец, а поддръжката — 69 € на месец, с ДДС (<a href="/bg/ceni/">цени</a>).')

START_AFTER = dict(
  it="Con queste informazioni prepariamo una proposta con ambito di lavoro, tempi e prezzo. Il preventivo è gratuito.",
  en="With this we prepare a proposal with scope, timing and price. The quote is free.",
  bg="С тази информация подготвяме предложение с обхват, срокове и цена. Офертата е безплатна.")

# ── Четирите направления ─────────────────────────────────────────────────
# svc: (икона в public/brand/svc, ключ на страницата в L[lang]["u"] или None, цена или None, {lang: (заглавие, текст)})
DIRS = [
 dict(key="business", slug=dict(it="software-aziendale", en="business-software", bg="biznes-softuer"),
  names=dict(it="Software aziendale", en="Business software", bg="Бизнес софтуер"),
  stype=dict(it="Sviluppo di ERP e software gestionale su misura", en="Custom ERP and business software development", bg="Разработка на ERP и бизнес софтуер по поръчка"),
  icons=["erp", "software", "api"], proofs=["erp", "rilievi", "fakturist"],
  svc=[("erp", "erp", dict(it="€5.000 + IVA", en="€5,000 + VAT", bg="5 000 € без ДДС"), dict(
          it=("ERP su misura", "Commesse, produzione, magazzino, fatturazione, CRM e dashboard in un solo sistema, con accessi diversi per reparto e direzione."),
          en=("Custom ERP", "Orders, production, warehouse, invoicing, CRM and dashboards in a single system, with different access for each department and for management."),
          bg=("ERP по поръчка", "Поръчки, производство, склад, фактуриране, CRM и табла в една система, с различен достъп за всеки отдел и за ръководството."))),
       ("software", "software", dict(it="€2.000 + IVA", en="€2,000 + VAT", bg="2 000 € без ДДС"), dict(
          it=("Software e gestionali su misura", "Portali interni, gestionali e automazioni costruiti sui vostri flussi di lavoro, non su un modello generico."),
          en=("Custom software and management tools", "Internal portals, management tools and automations built on your workflows, not on a generic template."),
          bg=("Софтуер и управленски системи по поръчка", "Вътрешни портали, управленски системи и автоматизации, изградени по вашите работни потоци, а не по общ шаблон."))),
       ("api", "software", None, dict(
          it=("Integrazioni API", "Colleghiamo il nuovo sistema a quelli che usate già — fatturazione, pagamenti, e-mail, fornitori — tramite API REST e webhook, così i dati non si ricopiano a mano."),
          en=("API integrations", "We connect the new system to the ones you already use — invoicing, payments, email, suppliers — through REST APIs and webhooks, so nobody retypes data."),
          bg=("API интеграции", "Свързваме новата система с тези, които вече ползвате — фактуриране, плащания, имейл, доставчици — чрез REST API и webhook, за да не се преписват данни на ръка.")))],
  t=dict(
   it=dict(title="Software aziendale e gestionale su misura | Carbon Stealth", h1="Software aziendale su misura",
     desc="ERP e gestionali su misura per aziende con processi propri: commesse, produzione, magazzino, fatture e ruoli in un unico sistema. ERP da €5.000.",
     kw="software aziendale su misura, software gestionale su misura, software aziendale personalizzato, software gestionale produzione, integrazione API, Carbon Stealth",
     promise="Software sui processi della vostra azienda: commessa, produzione, magazzino, fattura.",
     intro="Costruiamo software gestionale su misura per aziende che lavorano con processi propri: commesse di lunga durata, produzione, magazzino, sopralluoghi, fatturazione. Al posto di fogli Excel e programmi che non si parlano, un unico sistema con i permessi giusti per ogni ruolo, su server in UE. Un software su misura parte da €2.000, un ERP da €5.000, IVA esclusa.",
     who="Produttori, distributori e aziende di servizi tecnici che oggi tengono commesse, magazzino e fatture in posti diversi. Va bene anche per una piccola impresa, se il problema è un processo che si ripete ogni giorno e costa ore di lavoro manuale.",
     start=["Come lavorate oggi: i passaggi di una commessa, chi fa cosa, quali file e programmi usate.",
            "Chi userà il sistema e cosa deve vedere ognuno: reparto, ufficio, direzione, clienti.",
            "Con quali sistemi deve parlare: fatturazione elettronica, e-commerce, fornitori, banca."],
     faqs=[("Quanto costa un software gestionale su misura?", "Un software su misura parte da €2.000 e un ERP da €5.000, IVA esclusa. Il prezzo preciso dipende da moduli, numero di utenti e integrazioni: lo indichiamo nel preventivo gratuito, dopo aver visto come lavorate."),
           ("Un ERP può collegare magazzino, produzione e fatturazione?", "Sì. Nell'ERP che abbiamo costruito per un produttore di ascensori la commessa avanza nelle fasi di produzione, il magazzino registra carichi, scarichi e giacenze per commessa e la fattura usa gli stessi dati, senza reinserirli."),
           ("Meglio un gestionale standard o uno su misura?", "Uno standard conviene quando i vostri processi somigliano a quelli previsti dal programma. Il su misura conviene quando lavorate in modo vostro — commesse di lunga durata, sopralluoghi, moduli dei fornitori — e il programma generico vi costringe a tenere fogli Excel paralleli."),
           ("Dove vengono conservati i dati?", "Su server nell'Unione Europea, con accessi per ruolo: ogni utente vede e modifica solo ciò che gli compete.")]),
   en=dict(title="Custom business and management software | Carbon Stealth", h1="Custom business software",
     desc="Custom ERP and management software for companies with their own processes: orders, production, stock, invoices and roles in one system. ERP from €5,000.",
     kw="custom business software, bespoke management software, manufacturing software, business process automation, API integration, Carbon Stealth",
     promise="Software built on your company's processes: order, production, stock, invoice.",
     intro="We build custom management software for companies that work with their own processes: long-running orders, production, stock, site surveys, invoicing. Instead of spreadsheets and programs that don't talk to each other, one system with the right permissions for every role, on servers in the EU. Custom software starts from €2,000, an ERP from €5,000, excluding VAT.",
     who="Manufacturers, distributors and technical service companies that keep orders, stock and invoices in different places today. It also fits a small company, if the problem is a process repeated every day that costs hours of manual work.",
     start=["How you work today: the steps of an order, who does what, which files and programs you use.",
            "Who will use the system and what each person needs to see: shop floor, office, management, customers.",
            "Which systems it has to talk to: e-invoicing, e-commerce, suppliers, bank."],
     faqs=[("How much does custom management software cost?", "Custom software starts from €2,000 and an ERP from €5,000, excluding VAT. The exact price depends on modules, number of users and integrations: we give it in the free quote, after seeing how you work."),
           ("Can an ERP connect warehouse, production and invoicing?", "Yes. In the ERP we built for an elevator manufacturer, an order moves through the production stages, the warehouse records inbound, outbound and stock per order, and the invoice uses the same data without re-entering it."),
           ("Off-the-shelf or custom management software?", "Off-the-shelf pays off when your processes look like the ones the program expects. Custom pays off when you work your own way — long-running orders, site surveys, supplier forms — and a generic program forces you to keep parallel spreadsheets."),
           ("Where is the data stored?", "On servers in the European Union, with role-based access: every user sees and edits only what concerns them.")]),
   bg=dict(title="Бизнес и управленски софтуер по поръчка | Carbon Stealth", h1="Бизнес софтуер по поръчка",
     desc="ERP и управленски софтуер по поръчка за фирми със собствени процеси: поръчки, производство, склад, фактури и роли в една система. ERP от 5 000 € без ДДС.",
     kw="бизнес софтуер по поръчка, управленски софтуер, софтуер за фирми, софтуер за производство, API интеграции, Carbon Stealth",
     promise="Софтуер по процесите на фирмата: поръчка, производство, склад, фактура.",
     intro="Правим управленски софтуер по поръчка за фирми, които работят по собствени процеси: дългосрочни поръчки, производство, склад, огледи на място, фактуриране. Вместо таблици в Excel и програми, които не си говорят — една система с точните права за всяка роля, на сървъри в ЕС. Софтуер по поръчка започва от 2 000 €, ERP — от 5 000 €, без ДДС.",
     who="Производители, дистрибутори и фирми за технически услуги, които днес държат поръчките, склада и фактурите на различни места. Подходящо е и за малка фирма, ако проблемът е процес, който се повтаря всеки ден и отнема часове ръчна работа.",
     start=["Как работите днес: стъпките на една поръчка, кой какво прави, какви файлове и програми ползвате.",
            "Кой ще ползва системата и какво трябва да вижда всеки: цех, офис, ръководство, клиенти.",
            "С кои системи трябва да говори: електронни фактури, онлайн магазин, доставчици, банка."],
     faqs=[("Колко струва управленски софтуер по поръчка?", "Софтуер по поръчка започва от 2 000 €, а ERP — от 5 000 €, без ДДС. Точната цена зависи от модулите, броя потребители и интеграциите — даваме я в безплатната оферта, след като видим как работите."),
           ("Може ли ERP да свърже склад, производство и фактуриране?", "Да. В ERP системата, която изградихме за производител на асансьори, поръчката минава през етапите на производството, складът записва постъпления, изписвания и наличности по поръчка, а фактурата ползва същите данни, без да се въвеждат отново."),
           ("Готов софтуер или по поръчка?", "Готовият си струва, когато процесите ви приличат на тези, които програмата очаква. Софтуерът по поръчка си струва, когато работите по свой начин — дългосрочни поръчки, огледи, формуляри на доставчици — и готовата програма ви кара да водите успоредни таблици в Excel."),
           ("Къде се съхраняват данните?", "На сървъри в Европейския съюз, с достъп по роли: всеки потребител вижда и променя само това, което го засяга.")]))),

 dict(key="industrial", slug=dict(it="tecnologia-industriale", en="industrial-technology", bg="industrialni-tehnologii"),
  names=dict(it="Tecnologia industriale", en="Industrial technology", bg="Индустриални технологии"),
  stype=dict(it="Reverse engineering, stampa 3D e software per la produzione", en="Reverse engineering, 3D printing and production software", bg="Реверсивен инженеринг, 3D печат и софтуер за производството"),
  icons=["reverse", "software", "erp"], proofs=["korpora", "panev"],
  svc=[("reverse", None, None, dict(
          it=("Reverse engineering e stampa 3D", "Scansione e ricostruzione CAD di parti meccaniche, stampa 3D FDM di prototipi, ricambi e piccole serie, analisi di protocolli, firmware e dispositivi embedded."),
          en=("Reverse engineering and 3D printing", "Scanning and CAD reconstruction of mechanical parts, FDM 3D printing of prototypes, spare parts and small batches, analysis of protocols, firmware and embedded devices."),
          bg=("Реверсивен инженеринг и 3D печат", "Сканиране и CAD реконструкция на механични части, FDM 3D печат на прототипи, резервни части и малки серии, анализ на протоколи, фърмуер и embedded устройства."))),
       ("software", "software", dict(it="€2.000 + IVA", en="€2,000 + VAT", bg="2 000 € без ДДС"), dict(
          it=("Software per la produzione", "Programmi che trasformano un progetto in documenti e file per l'officina: distinte di taglio, distinte base, disegni quotati, DXF a livelli e G-code."),
          en=("Production software", "Programs that turn a design into documents and files for the workshop: cut lists, bills of materials, dimensioned drawings, layered DXF and G-code."),
          bg=("Софтуер за производството", "Програми, които превръщат проекта в документи и файлове за цеха: разкрой, спецификации, оразмерени чертежи, DXF на слоеве и G-code."))),
       ("erp", "erp", None, dict(
          it=("Avanzamento della produzione", "Lo stato di ogni commessa registrato in reparto e visibile in ufficio, collegato a magazzino e fatture."),
          en=("Production tracking", "The status of every order recorded on the shop floor and visible in the office, linked to stock and invoices."),
          bg=("Следене на производството", "Състоянието на всяка поръчка се отчита в цеха и се вижда в офиса, свързано със склада и фактурите.")))],
  t=dict(
   it=dict(title="Tecnologia industriale: dal pezzo al file CNC | Carbon Stealth", h1="Tecnologia industriale",
     desc="Reverse engineering, ricostruzione CAD, stampa 3D e software che genera i file per le macchine CNC (DXF e G-code). Progetti reali: Korpora e Panev Ascensori.",
     kw="reverse engineering, ricostruzione CAD, stampa 3D ricambi, software CNC, G-code DXF, Carbon Stealth",
     promise="Dal pezzo fisico al software: modelli, file per le macchine, cataloghi 3D.",
     intro="Lavoriamo dove il software incontra i pezzi fisici: ricostruiamo in CAD parti meccaniche, stampiamo in 3D prototipi e ricambi e scriviamo programmi che producono i file per le macchine CNC. Due progetti in uso lo mostrano: Korpora, che da un progetto di mobile genera distinta di taglio, mappa di foratura e G-code, e il sito di Panev Ascensori con una vista 3D di ogni articolo del listino.",
     who="Officine, falegnamerie e produttori con macchine CNC, uffici tecnici che devono rifare un pezzo senza disegno, aziende che vogliono mostrare i propri articoli in 3D ai clienti professionali.",
     start=["Il pezzo, oppure foto e misure, e a cosa serve: prototipo, ricambio, piccola serie.",
            "La macchina e il controllo che usate (per esempio ISO/Fanuc o GRBL) e il formato dei file che vi servono.",
            "Il flusso attuale: chi disegna, chi taglia, dove si perdono tempo e dati."],
     faqs=[("Potete ricostruire un pezzo senza disegno tecnico?", "Sì: partiamo dal pezzo, con scansione o misure, e lo ricostruiamo in CAD. Il modello può diventare un prototipo o un ricambio stampato in 3D, oppure il file da dare a chi lavora il metallo."),
           ("Che file prepara Korpora per la CNC?", "DXF R12 a livelli e G-code per controlli ISO/Fanuc e GRBL, insieme alla distinta di taglio con bordatura, all'elenco della ferramenta e ai disegni con la mappa di foratura."),
           ("Stampate in 3D anche piccole serie?", "Sì, in FDM: prototipi, ricambi e piccole serie.")]),
   en=dict(title="Industrial technology: from part to CNC file | Carbon Stealth", h1="Industrial technology",
     desc="Reverse engineering, CAD reconstruction, 3D printing and software that outputs CNC files (DXF, G-code). Real projects: Korpora and Panev Ascensori.",
     kw="reverse engineering, CAD reconstruction, 3D printed spare parts, CNC software, G-code DXF, Carbon Stealth",
     promise="From the physical part to software: models, machine files, 3D catalogues.",
     intro="We work where software meets physical parts: we rebuild mechanical parts in CAD, 3D print prototypes and spare parts, and write programs that produce the files for CNC machines. Two projects in use show it: Korpora, which turns a furniture design into a cut list, a drilling map and G-code, and the Panev Ascensori website with a 3D view of every item in the price list.",
     who="Workshops, joineries and manufacturers with CNC machines, technical offices that need to remake a part without a drawing, companies that want to show their items in 3D to trade customers.",
     start=["The part, or photos and measurements, and what it is for: prototype, spare part, small batch.",
            "The machine and controller you use (for example ISO/Fanuc or GRBL) and the file format you need.",
            "Your current flow: who draws, who cuts, where time and data get lost."],
     faqs=[("Can you rebuild a part without a technical drawing?", "Yes: we start from the part, by scanning or measuring it, and rebuild it in CAD. The model can become a 3D-printed prototype or spare part, or the file for whoever machines the metal."),
           ("Which CNC files does Korpora produce?", "Layered DXF R12 and G-code for ISO/Fanuc and GRBL controllers, together with the cut list with edge banding, the hardware list and drawings with the drilling map."),
           ("Do you 3D print small batches too?", "Yes, in FDM: prototypes, spare parts and small batches.")]),
   bg=dict(title="Индустриални технологии: от детайла до CNC файла | Carbon Stealth", h1="Индустриални технологии",
     desc="Реверсивен инженеринг, CAD реконструкция, 3D печат и софтуер, който дава файловете за CNC машините (DXF, G-code). Проекти: Korpora и Panev Ascensori.",
     kw="реверсивен инженеринг, CAD реконструкция, 3D печат на резервни части, софтуер за CNC, G-code DXF, Carbon Stealth",
     promise="От физическия детайл до софтуера: модели, файлове за машините, 3D каталози.",
     intro="Работим там, където софтуерът среща физическите детайли: реконструираме механични части в CAD, печатаме на 3D принтер прототипи и резервни части и пишем програми, които дават файловете за CNC машините. Два проекта в употреба го показват: Korpora, която от проект на мебел прави разкрой, карта за пробиване и G-code, и сайтът на Panev Ascensori с 3D изглед на всеки артикул от ценоразписа.",
     who="Цехове, мебелни работилници и производители с CNC машини, технически отдели, които трябва да изработят наново детайл без чертеж, фирми, които искат да покажат артикулите си в 3D на професионалните си клиенти.",
     start=["Детайлът или снимки и размери, и за какво е: прототип, резервна част, малка серия.",
            "Машината и управлението, което ползвате (например ISO/Fanuc или GRBL), и форматът на файловете, които ви трябват.",
            "Как работите сега: кой чертае, кой реже, къде се губят време и данни."],
     faqs=[("Можете ли да възстановите детайл без технически чертеж?", "Да: тръгваме от самия детайл, със сканиране или измерване, и го реконструираме в CAD. Моделът може да стане прототип или резервна част, отпечатани на 3D принтер, или файл за този, който обработва метала."),
           ("Какви файлове за CNC дава Korpora?", "DXF R12 на слоеве и G-code за управления ISO/Fanuc и GRBL, заедно с разкроя с кантиране, списъка с обков и чертежите с карта за пробиване."),
           ("Печатате ли на 3D принтер и малки серии?", "Да, с FDM: прототипи, резервни части и малки серии.")]))),

 dict(key="web", slug=dict(it="siti-ecommerce", en="websites-ecommerce", bg="saytove-i-magazini"),
  names=dict(it="Siti ed e-commerce", en="Websites and e-commerce", bg="Сайтове и магазини"),
  stype=dict(it="Sviluppo di siti web, e-commerce, app e SEO", en="Website, e-commerce, app development and SEO", bg="Изработка на сайтове, онлайн магазини, приложения и SEO"),
  icons=["web", "ecommerce", "mobile", "seo"], proofs=["zabobovdol", "ou", "treti", "evanita", "eternal", "mastilko", "vizitka", "ospedali"],
  svc=[("web", "web", dict(it="€658 + IVA", en="€658 + VAT", bg="790 € с ДДС"), dict(
          it=("Siti web", "Siti vetrina, siti aziendali e landing page, consegnati in 5–30 giorni lavorativi a seconda del pacchetto."),
          en=("Websites", "Brochure websites, business websites and landing pages, delivered in 5–30 working days depending on the package."),
          bg=("Сайтове", "Сайтове-визитки, фирмени сайтове и landing страници, готови за 5–30 работни дни според пакета."))),
       ("ecommerce", "ecom", dict(it="€1.825 + IVA", en="€1,825 + VAT", bg="2 190 € с ДДС"), dict(
          it=("E-commerce", "Negozi online con catalogo, pagamenti e gestione degli ordini; consegna in 15–25 giorni lavorativi."),
          en=("E-commerce", "Online stores with catalogue, payments and order management; delivered in 15–25 working days."),
          bg=("Онлайн магазини", "Магазини с каталог, плащания и управление на поръчките; готови за 15–25 работни дни."))),
       ("mobile", "app", dict(it="€3.000 + IVA", en="€3,000 + VAT", bg="3 000 € без ДДС"), dict(
          it=("App mobile", "App iOS e Android, dal progetto alla pubblicazione negli store."),
          en=("Mobile apps", "iOS and Android apps, from design to store release."),
          bg=("Мобилни приложения", "Приложения за iOS и Android — от проекта до публикуването в магазините."))),
       ("seo", "seo", dict(it="€242/mese + IVA", en="€242/month + VAT", bg="290 €/месец с ДДС"), dict(
          it=("SEO, GEO e AEO", "Contenuti, link, audit tecnico e report mensile per Google, Bing e i motori di risposta come ChatGPT e Perplexity."),
          en=("SEO, GEO and AEO", "Content, links, technical audit and a monthly report for Google, Bing and answer engines such as ChatGPT and Perplexity."),
          bg=("SEO, GEO и AEO", "Съдържание, връзки, технически одит и месечен отчет за Google, Bing и AI системите за отговори като ChatGPT и Perplexity."))),
       ("analytics", "test", None, dict(
          it=("Analisi SEO gratuita", "Un primo controllo gratuito del vostro sito con il nostro strumento online."),
          en=("Free SEO analysis", "A first free check of your website with our online tool."),
          bg=("Безплатен SEO анализ", "Първа безплатна проверка на сайта ви с нашия онлайн инструмент.")))],
  t=dict(
   it=dict(title="Siti web ed e-commerce che si fanno trovare | Carbon Stealth", h1="Siti web ed e-commerce",
     desc="Siti aziendali, negozi online, app e SEO/GEO/AEO con prezzi pubblici: sito da €658, e-commerce €1.825 + IVA, 12 mesi di hosting in UE inclusi.",
     kw="sviluppo siti web, realizzazione ecommerce, siti aziendali, app mobile, SEO GEO AEO, Carbon Stealth",
     promise="Siti e negozi che si fanno trovare e vendono.",
     intro="Siti aziendali, negozi online, portali e app costruiti per farsi trovare su Google e nelle risposte dell'intelligenza artificiale, e per trasformare le visite in richieste. I prezzi sono pubblici: un sito parte da €658, il pacchetto Business costa €1.575 e un e-commerce €1.825, IVA esclusa, con design, base SEO, 12 mesi di hosting in UE e SSL inclusi.",
     who="Piccole e medie imprese, negozi, studi professionali, scuole, enti e associazioni che vogliono un sito chiaro, veloce e trovabile, a un prezzo noto prima di iniziare.",
     start=["Cosa fate e per chi: servizi o prodotti, zona, lingue.",
            "Cosa deve fare il sito: farvi contattare, vendere, ricevere prenotazioni, informare.",
            "Testi, foto e logo che avete già, e il dominio, se esiste."],
     faqs=[("Quanto costa un sito aziendale?", "I pacchetti hanno prezzi pubblici: Start €658, Business €1.575, Premium €3.575 e Shop (e-commerce) €1.825, IVA esclusa. Ogni pacchetto include design, sviluppo, base SEO, 12 mesi di hosting in UE e SSL."),
           ("In quanto tempo va online?", "Da 5–7 giorni lavorativi per Start a 20–30 per Premium; un e-commerce richiede 15–25 giorni lavorativi."),
           ("Il sito comparirà nelle risposte di ChatGPT e di Google AI?", "Nessuno può garantirlo. Costruiamo pagine con risposte chiare, dati strutturati corretti e contenuti originali: è la stessa base che Google indica per le sue funzioni di intelligenza artificiale.")]),
   en=dict(title="Websites and e-commerce that get found and sell | Carbon Stealth", h1="Websites and e-commerce",
     desc="Business websites, online stores, apps and SEO/GEO/AEO with public prices: sites from €658, e-commerce €1,825 + VAT, 12 months of EU hosting included.",
     kw="web development, e-commerce development, business websites, mobile apps, SEO GEO AEO, Carbon Stealth",
     promise="Sites and stores that get found and sell.",
     intro="Business websites, online stores, portals and apps built to be found on Google and in AI answers, and to turn visits into enquiries. Prices are public: a website starts at €658, the Business package costs €1,575 and an online store €1,825, excluding VAT, with design, an SEO foundation, 12 months of EU hosting and SSL included.",
     who="Small and medium businesses, shops, professional firms, schools, public bodies and associations that want a clear, fast website that gets found, at a price known before work starts.",
     start=["What you do and for whom: services or products, area, languages.",
            "What the site must do: get you contacted, sell, take bookings, inform.",
            "Texts, photos and logo you already have, and the domain, if there is one."],
     faqs=[("How much does a business website cost?", "The packages have public prices: Start €658, Business €1,575, Premium €3,575 and Shop (e-commerce) €1,825, excluding VAT. Every package includes design, development, an SEO foundation, 12 months of EU hosting and SSL."),
           ("How long until it is online?", "From 5–7 working days for Start to 20–30 for Premium; an online store takes 15–25 working days."),
           ("Will the site appear in ChatGPT and Google AI answers?", "Nobody can guarantee that. We build pages with clear answers, correct structured data and original content: the same foundation Google points to for its AI features.")]),
   bg=dict(title="Сайтове и магазини, които се намират и продават | Carbon Stealth", h1="Сайтове и онлайн магазини",
     desc="Фирмени сайтове, онлайн магазини, приложения и SEO/GEO/AEO с публични цени: сайт от 790 €, магазин 2 190 € с ДДС, хостинг в ЕС за 12 месеца.",
     kw="изработка на сайтове, онлайн магазин, фирмен сайт, мобилни приложения, SEO GEO AEO, Carbon Stealth",
     promise="Сайтове и магазини, които се намират и продават.",
     intro="Фирмени сайтове, онлайн магазини, портали и приложения, направени да се намират в Google и в отговорите на изкуствения интелект и да превръщат посещенията в запитвания. Цените са публични: сайт започва от 790 €, пакетът „Бизнес“ струва 1 890 €, а онлайн магазин — 2 190 €, с ДДС, като дизайн, SEO основа, хостинг в ЕС за 12 месеца и SSL са включени.",
     who="Малки и средни фирми, магазини, кантори, училища, институции и сдружения, които искат ясен, бърз и откриваем сайт на цена, известна преди началото.",
     start=["Какво правите и за кого: услуги или продукти, район, езици.",
            "Какво трябва да прави сайтът: да ви търсят, да продава, да приема резервации, да информира.",
            "Текстове, снимки и лого, които вече имате, и домейнът, ако има такъв."],
     faqs=[("Колко струва фирмен сайт?", "Пакетите са с публични цени: „Старт“ 790 €, „Бизнес“ 1 890 €, „Премиум“ 4 290 € и „Магазин“ 2 190 €, с ДДС. Всеки пакет включва дизайн, разработка, SEO основа, хостинг в ЕС за 12 месеца и SSL."),
           ("За колко време е готов?", "От 5–7 работни дни за „Старт“ до 20–30 за „Премиум“; онлайн магазин отнема 15–25 работни дни."),
           ("Ще се появява ли сайтът в отговорите на ChatGPT и Google AI?", "Никой не може да го гарантира. Правим страници с ясни отговори, коректни структурирани данни и оригинално съдържание — същата основа, която Google посочва за функциите си с изкуствен интелект.")]))),

 dict(key="games", slug=dict(it="game-interattivo", en="games-interactive", bg="igri-i-interaktiv"),
  names=dict(it="Game e interattivo", en="Games and interactive", bg="Игри и интерактив"),
  stype=dict(it="Sviluppo di giochi browser multiplayer e anti-cheat", en="Multiplayer browser game development and anti-cheat", bg="Разработка на мултиплейър браузър игри и anti-cheat"),
  icons=["gamedev", "security"], proofs=["nexus", "fivem"],
  svc=[("gamedev", "cs_nexus", None, dict(
          it=("Giochi browser e multiplayer", "Dal database al motore di gioco lato server all'interfaccia: eventi in tempo reale con Socket.IO, stato veloce in Redis, dati permanenti in PostgreSQL."),
          en=("Browser and multiplayer games", "From the database to the server-side game engine to the interface: real-time events with Socket.IO, fast state in Redis, permanent data in PostgreSQL."),
          bg=("Браузър и мултиплейър игри", "От базата данни през игровия двигател на сървъра до интерфейса: събития в реално време със Socket.IO, бързо състояние в Redis, постоянни данни в PostgreSQL."))),
       ("security", None, None, dict(
          it=("Regole sul server e anti-cheat", "Il client invia l'azione, il server decide se è valida: è la base per impedire imbrogli e duplicazioni di oggetti."),
          en=("Server-side rules and anti-cheat", "The client sends the action, the server decides whether it is valid: the basis for stopping cheats and item duplication."),
          bg=("Правила на сървъра и anti-cheat", "Клиентът изпраща действието, сървърът решава дали е валидно: това е основата срещу измами и дублиране на предмети.")))],
  t=dict(
   it=dict(title="Sviluppo giochi browser multiplayer e anti-cheat | Carbon Stealth", h1="Game e interattivo",
     desc="Giochi browser multiplayer in tempo reale con le regole sul server: Nexus Dominion, MMO con React, Node.js, Socket.IO, PostgreSQL e Redis. E FiveM Bulgaria.",
     kw="sviluppo giochi browser, gioco multiplayer, MMO browser, anti-cheat, FiveM, Carbon Stealth",
     promise="Multiplayer in tempo reale e regole controllate dal server.",
     intro="Sviluppiamo giochi browser multiplayer in tempo reale e strumenti per le community di gioco. Il nostro banco di prova è Nexus Dominion, un MMO browser dark fantasy con gilde, dungeon, battaglie PvP ed economia gestita dai giocatori: ogni azione passa dal server, che la valida rispetto allo stato del mondo prima di mostrarla agli altri.",
     who="Studi e community di gioco, server di roleplay e aziende che vogliono un'esperienza interattiva nel browser, senza installazioni.",
     start=["Il tipo di gioco o di esperienza: giocatori per partita, durata, piattaforme.",
            "Cosa deve restare sul server: regole, economia, classifiche.",
            "Cosa esiste già: game design, grafica, community, server."],
     faqs=[("Con quali tecnologie costruite un gioco browser multiplayer?", "Per Nexus Dominion: React nel browser, Node.js e Socket.IO per il tempo reale, Redis per lo stato che cambia di continuo e PostgreSQL per i dati permanenti, il tutto in Docker."),
           ("Come si impediscono gli imbrogli?", "Il client non decide nulla di importante: invia l'azione e il server la controlla rispetto allo stato del mondo prima di applicarla. Così un client modificato non può darsi risorse o mosse che le regole non permettono."),
           ("Serve installare qualcosa per giocare?", "No: Nexus Dominion gira interamente nel browser, dal login alla battaglia.")]),
   en=dict(title="Browser game development and anti-cheat | Carbon Stealth", h1="Games and interactive",
     desc="Real-time multiplayer browser games with server-side rules: Nexus Dominion, an MMO in React, Node.js, Socket.IO, PostgreSQL and Redis. Plus FiveM Bulgaria.",
     kw="browser game development, multiplayer game, browser MMO, anti-cheat, FiveM, Carbon Stealth",
     promise="Real-time multiplayer and rules enforced by the server.",
     intro="We build real-time multiplayer browser games and tools for gaming communities. Our proving ground is Nexus Dominion, a dark fantasy browser MMO with guilds, dungeons, PvP battles and a player-driven economy: every action goes through the server, which validates it against the state of the world before showing it to other players.",
     who="Game studios and communities, roleplay servers and companies that want an interactive experience in the browser, with nothing to install.",
     start=["The kind of game or experience: players per match, session length, platforms.",
            "What must stay on the server: rules, economy, leaderboards.",
            "What already exists: game design, art, community, servers."],
     faqs=[("Which technologies do you use for a multiplayer browser game?", "For Nexus Dominion: React in the browser, Node.js and Socket.IO for real time, Redis for state that changes constantly and PostgreSQL for permanent data, all in Docker."),
           ("How do you stop cheating?", "The client decides nothing important: it sends the action and the server checks it against the state of the world before applying it. A modified client cannot grant itself resources or moves the rules do not allow."),
           ("Do players need to install anything?", "No: Nexus Dominion runs entirely in the browser, from login to battle.")]),
   bg=dict(title="Разработка на браузър игри и anti-cheat | Carbon Stealth", h1="Игри и интерактив",
     desc="Мултиплейър браузър игри в реално време с правилата на сървъра: Nexus Dominion, MMO с React, Node.js, Socket.IO, PostgreSQL и Redis. И FiveM Bulgaria.",
     kw="разработка на браузър игри, мултиплейър игра, браузър MMO, anti-cheat, FiveM, Carbon Stealth",
     promise="Мултиплейър в реално време и правила, които пази сървърът.",
     intro="Разработваме мултиплейър браузър игри в реално време и инструменти за гейминг общности. Нашият полигон е Nexus Dominion — dark fantasy браузър MMO с гилдии, подземия, PvP битки и икономика, управлявана от играчите: всяко действие минава през сървъра, който го проверява спрямо състоянието на света, преди да го покаже на останалите.",
     who="Гейм студиа и общности, roleplay сървъри и фирми, които искат интерактивно преживяване в браузъра, без инсталиране.",
     start=["Видът игра или преживяване: играчи в една партия, продължителност, платформи.",
            "Какво трябва да остане на сървъра: правила, икономика, класации.",
            "Какво вече има: гейм дизайн, графика, общност, сървъри."],
     faqs=[("С какви технологии правите мултиплейър браузър игра?", "За Nexus Dominion: React в браузъра, Node.js и Socket.IO за реалното време, Redis за състоянието, което се мени постоянно, и PostgreSQL за постоянните данни, всичко в Docker."),
           ("Как се спират измамите?", "Клиентът не решава нищо важно: изпраща действието, а сървърът го проверява спрямо състоянието на света, преди да го приложи. Така променен клиент не може да си даде ресурси или ходове, които правилата не позволяват."),
           ("Трябва ли да се инсталира нещо?", "Не: Nexus Dominion работи изцяло в браузъра — от входа до битката.")]))),
]

HUB = dict(
 it=dict(title="Soluzioni: software, industria, siti e giochi | Carbon Stealth", h1="Soluzioni",
   desc="Le quattro aree di lavoro di Carbon Stealth: software aziendale ed ERP, tecnologia industriale, siti ed e-commerce, giochi browser. Ognuna con progetti reali.",
   kw="soluzioni software aziendali, ERP su misura, tecnologia industriale, siti web ed e-commerce, sviluppo giochi browser, Carbon Stealth",
   intro="Carbon Stealth costruisce software e siti per aziende in Italia, Bulgaria e nel resto d'Europa. Il lavoro è diviso in quattro aree: le prime due — software aziendale e tecnologia industriale — sono quelle su cui ci concentriamo; siti ed e-commerce coprono le esigenze più comuni; i giochi sono un'area a parte. Ognuna ha i suoi servizi e i suoi progetti in uso.",
   more='Le soluzioni per settore partono dal <a href="/settori/ascensori/">settore ascensori</a> (<a href="/settori/">tutti i settori</a>); i progetti raccontati per intero sono nei <a href="/case-study/">case study</a>.'),
 en=dict(title="Solutions: software, industry, web and games | Carbon Stealth", h1="Solutions",
   desc="Carbon Stealth's four areas of work: business software and ERP, industrial technology, websites and e-commerce, browser games. Each with real projects.",
   kw="business software solutions, custom ERP, industrial technology, websites and e-commerce, browser game development, Carbon Stealth",
   intro="Carbon Stealth builds software and websites for companies in Italy, Bulgaria and the rest of Europe. The work is split into four areas: the first two — business software and industrial technology — are where we focus; websites and e-commerce cover the most common needs; games are an area of their own. Each has its own services and projects in use.",
   more='Solutions by industry start with the <a href="/en/industries/ascensori/">elevator industry</a> (<a href="/en/industries/">all industries</a>); the projects told in full are in the <a href="/en/case-studies/">case studies</a>.'),
 bg=dict(title="Решения: софтуер, индустрия, сайтове и игри | Carbon Stealth", h1="Решения",
   desc="Четирите направления на Carbon Stealth: бизнес софтуер и ERP, индустриални технологии, сайтове и онлайн магазини, браузър игри. Всяко с реални проекти.",
   kw="бизнес софтуер, ERP по поръчка, индустриални технологии, сайтове и онлайн магазини, разработка на браузър игри, Carbon Stealth",
   intro="Carbon Stealth прави софтуер и сайтове за фирми в Италия, България и останалата част от Европа. Работата е разделена на четири направления: първите две — бизнес софтуер и индустриални технологии — са тези, върху които се съсредоточаваме; сайтовете и онлайн магазините покриват най-честите нужди; игрите са отделно направление. Всяко има свои услуги и проекти в употреба.",
   more='Решенията по бранш започват от <a href="/bg/branshove/ascensori/">асансьорния бранш</a> (<a href="/bg/branshove/">всички браншове</a>); проектите, разказани изцяло, са в <a href="/bg/keys-studii/">кейс стъдитата</a>.'),
)


# ── Рендер ───────────────────────────────────────────────────────────────
def esc(s):
    return html.escape(s, quote=True)


def name_of(p, lang):
    n = P[p]["name"]
    return n[lang] if isinstance(n, dict) else n


def url(lang, d=None):
    return L[lang]["urlbase"] + (d["slug"][lang] + "/" if d else "")


def alternates(d=None):
    out = "".join(f'<link rel="alternate" hreflang="{l}" href="{BASE}{url(l, d)}"/>' for l in LANGS)
    return out + f'<link rel="alternate" hreflang="x-default" href="{BASE}{url("en", d)}"/>'


def head(lang, t, canon, alts):
    s = L[lang]
    og = f"{BASE}/{s['og']}"
    title, desc = t["title"], t["desc"]
    # „ | Carbon Stealth“ отпада над 65 знака (static-theme.py), но заглавията тук са писани да се събират
    assert len(title) <= 65, (lang, len(title), title)
    assert len(desc) <= 160, (lang, len(desc), desc)
    assert "Carbon Stealth" in t["kw"] and len([k for k in t["kw"].split(",") if k.strip()]) >= 5, t["kw"]
    return f"""<!DOCTYPE html><html lang="{lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="keywords" content="{esc(t['kw'])}">
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
<meta name="theme-color" content="#00e5ff">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
{FONTS}<style>{STYLE}</style>
"""


def ld(graph):
    return ('<script type="application/ld+json">'
            + json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
            + "</script>")


def crumbs(lang, d=None):
    s = L[lang]
    items = [("Home", BASE + (s["prefix"] + "/" if s["prefix"] else "/")), (s["hub_name"], BASE + url(lang))]
    if d:
        items.append((d["names"][lang], BASE + url(lang, d)))
    j = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(items)]}
    vis = ' › '.join(f'<a href="{u[len(BASE):]}">{esc(n)}</a>' for n, u in items[:-1])
    vis += f' › <span aria-current="page">{esc(items[-1][0])}</span>'
    return j, f'<nav class="bc" aria-label="Breadcrumb">{vis}</nav>'


def proof_card(lang, key):
    s, p = L[lang], P[key]
    nm = name_of(key, lang)
    img = ""
    if p["shot"]:
        alt = {"it": f"Schermata di {nm}", "en": f"Screenshot of {nm}", "bg": f"Екранна снимка на {nm}"}[lang]
        img = (f'<img src="/work/{p["shot"]}-480.webp" srcset="/work/{p["shot"]}-480.webp 480w, /work/{p["shot"]}.webp 960w" '
               f'sizes="(max-width:620px) 100vw, 300px" width="480" height="300" loading="lazy" decoding="async" alt="{esc(alt)}">')
    links = []
    for kind, target in p["links"]:
        if kind == "site":
            links.append(f'<a href="{target}" target="_blank" rel="noopener">{target.replace("https://", "")} &#8599;</a>')
        else:
            links.append(f'<a href="{s["u"][target]}">{s["case"] if kind == "case" else s["sector"]} &rarr;</a>')
    return (f'<article class="proof">{img}<div><h3>{esc(nm)}</h3><p>{esc(p["t"][lang])}</p>'
            f'<div class="lk">{"".join(links)}</div></div></article>')


def svc_row(lang, row):
    s = L[lang]
    icon, target, price, txt = row
    title, body = txt[lang]
    h = esc(title)
    if target:
        h = f'<a href="{s["u"][target]}">{h}</a>'
    pr = f'<span class="from">{s["from_"]} {esc(price[lang])}</span>' if price else ""
    return (f'<div class="svc"><img src="/brand/svc/{icon}-384.webp" width="192" height="159" loading="lazy" decoding="async" alt="">'
            f'<div><h3>{h}</h3><p>{esc(body)}</p>{pr}</div></div>')


def faq_block(lang, faqs):
    return "".join(f'<div class="faq-item"><h3 class="faq-q">{esc(q)}</h3><p class="faq-a">{esc(a)}</p></div>' for q, a in faqs)


def render_dir(lang, d):
    s, t = L[lang], d["t"][lang]
    canon = BASE + url(lang, d)
    bc_json, bc_html = crumbs(lang, d)
    graph = [
        {"@type": "Service", "@id": f"{canon}#service", "name": t["h1"], "serviceType": d["stype"][lang],
         "provider": {"@id": f"{BASE}/#organization"}, "description": t["desc"], "url": canon, "inLanguage": lang,
         "areaServed": [{"@type": "Country", "name": "Italy"}, {"@type": "Country", "name": "Bulgaria"}, {"@type": "Place", "name": "European Union"}],
         "availableChannel": {"@type": "ServiceChannel", "serviceUrl": BASE + s["contact"]}},
        bc_json,
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in t["faqs"]]},
    ]
    others = "".join(f'<a href="{url(lang, o)}">{esc(o["names"][lang])}</a>' for o in DIRS if o is not d)
    body = (
        head(lang, t, canon, alternates(d)) + ld(graph) + "\n</head><body>" + s["nav"]
        + f'<div class="hero-s"><div class="w">{bc_html}<div class="tag">{s["tag"]}</div><h1>{esc(t["h1"])}</h1>'
        + f'<p class="lead">{esc(t["intro"])}</p></div></div>'
        + '<div class="w">'
        + f'<h2>{s["svc_h2"]}</h2>' + "".join(svc_row(lang, r) for r in d["svc"])
        + f'<h2>{s["proof_h2"]}</h2><div class="proofs">' + "".join(proof_card(lang, k) for k in d["proofs"]) + '</div>'
        + f'<h2>{s["who_h2"]}</h2><p>{esc(t["who"])}</p>'
        + f'<h2>{s["start_h2"]}</h2><ol class="steps">' + "".join(f"<li>{esc(x)}</li>" for x in t["start"]) + f'</ol><p>{START_AFTER[lang]}</p>'
        + f'<h2>{s["base_h2"]}</h2><p class="base">{BASE_TXT[lang]}</p>'
        + f'<h2>{s["faq_h2"]}</h2>' + faq_block(lang, t["faqs"])
        + f'<h2>{s["others_h2"]}</h2><div class="sect">{others}</div>'
        + f'<p><a href="{url(lang)}">{s["hub_link"]} &rarr;</a> &middot; <a href="{s["u"]["sectors"]}">{s["sectors"]} &rarr;</a> &middot; <a href="{s["u"]["cases"]}">{s["cases"]} &rarr;</a></p>'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a>'
        + '</div>' + s["ft"] + "</body></html>\n")
    return body


def render_hub(lang):
    s, t = L[lang], HUB[lang]
    canon = BASE + url(lang)
    bc_json, bc_html = crumbs(lang)
    graph = [
        {"@type": "CollectionPage", "@id": f"{canon}#page", "url": canon, "name": t["h1"], "description": t["desc"],
         "inLanguage": lang, "isPartOf": {"@id": f"{BASE}/#website"}, "mainEntity": {"@id": f"{canon}#list"}},
        {"@type": "ItemList", "@id": f"{canon}#list", "name": t["h1"], "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": d["names"][lang], "url": BASE + url(lang, d)} for i, d in enumerate(DIRS)]},
        bc_json,
    ]
    cards = ""
    for i, d in enumerate(DIRS):
        dt = d["t"][lang]
        icons = "".join(f'<img src="/brand/svc/{ic}-384.webp" width="192" height="159" loading="lazy" decoding="async" alt="">' for ic in d["icons"][:3])
        svcs = ", ".join(r[3][lang][0] for r in d["svc"])
        proj = ", ".join(name_of(k, lang) for k in d["proofs"][:4])
        cards += (f'<a class="card" href="{url(lang, d)}"><span class="k">{i + 1} · {s["focus"][i]}</span><div class="ico">{icons}</div>'
                  f'<h3>{esc(d["names"][lang])}</h3><p>{esc(dt["promise"])}</p>'
                  f'<p><b>{s["svcs"]}:</b> {esc(svcs)}</p><p><b>{s["proj"]}:</b> {esc(proj)}</p></a>')
    body = (
        head(lang, t, canon, alternates()) + ld(graph) + "\n</head><body>" + s["nav"]
        + f'<div class="hero-s"><div class="w">{bc_html}<div class="tag">{s["tag"]}</div><h1>{esc(t["h1"])}</h1>'
        + f'<p class="lead">{esc(t["intro"])}</p></div></div>'
        + f'<div class="w"><div class="cards">{cards}</div>'
        + f'<h2>{s["base_h2"]}</h2><p class="base">{BASE_TXT[lang]}</p>'
        + f'<p>{t["more"]}</p>'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a>'
        + '</div>' + s["ft"] + "</body></html>\n")
    return body


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def sitemap(urls):
    """Собствен sitemap; при повторен пуск пази по-нова дата (lastmod само напред)."""
    path = os.path.join("public", "sitemap-solutions.xml")
    old = {}
    if os.path.exists(path):
        old = dict(re.findall(r"<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>", open(path, encoding="utf-8").read()))
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u, pr in urls:
        sm.append(f"<url><loc>{u}</loc><lastmod>{max(old.get(u, LASTMOD), LASTMOD)}</lastmod><changefreq>monthly</changefreq><priority>{pr}</priority></url>")
    sm.append("</urlset>")
    write(path, "\n".join(sm) + "\n")
    idx = os.path.join("public", "sitemap.xml")
    s = open(idx, encoding="utf-8").read()
    loc = f"{BASE}/sitemap-solutions.xml"
    if f"<loc>{loc}</loc>" not in s:
        s = s.replace("</sitemapindex>", f"  <sitemap>\n    <loc>{loc}</loc>\n    <lastmod>{LASTMOD}</lastmod>\n  </sitemap>\n</sitemapindex>")
        write(idx, s)


def main():
    n, urls = 0, []
    for lang in LANGS:
        write(os.path.join("public", url(lang).strip("/"), "index.html"), render_hub(lang))
        urls.append((BASE + url(lang), "0.8"))
        n += 1
        for d in DIRS:
            write(os.path.join("public", url(lang, d).strip("/"), "index.html"), render_dir(lang, d))
            urls.append((BASE + url(lang, d), "0.9" if d["key"] in ("business", "industrial") else "0.8"))
            n += 1
    sitemap(urls)
    print(f"wrote {n} solution pages (4 directions x 3 langs + 3 hubs) + sitemap-solutions.xml ({len(urls)} urls)")


if __name__ == "__main__":
    main()
