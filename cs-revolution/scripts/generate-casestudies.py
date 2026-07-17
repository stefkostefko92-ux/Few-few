#!/usr/bin/env python3
"""Generate the trilingual CASE STUDIES section (it/en/bg).

Hub + 4 case-study pages x 3 languages, written natively per language, plus a
dedicated sitemap. Self-contained static HTML, no build step. Uses only the
true project facts below (scope + technology) — no invented metrics, clients or
revenue numbers.

Outputs:
  IT  public/case-study/            (hub)  + public/case-study/<slug>/index.html
  EN  public/en/case-studies/       (hub)  + public/en/case-studies/<slug>/index.html
  BG  public/bg/keys-studii/        (hub)  + public/bg/keys-studii/<slug>/index.html
  public/sitemap-casestudies.xml

Run from repo root: python3 scripts/generate-casestudies.py
"""
import os, html, json

BASE = "https://carbonstealth.eu"
DATE = "2026-07-17"
DATE_ISO = "2026-07-17T09:00:00+02:00"

# ── Shared chrome (identical CSS across every case-study page + hub) ──
STYLE = ("*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#ccc;font-family:'Space Mono',monospace;font-size:13px;line-height:2;padding:0}a{color:#00e5ff;text-decoration:none}.w{max-width:900px;margin:0 auto;padding:40px 20px}h1{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2.5rem;color:#f5f5f0;margin-bottom:16px;letter-spacing:-.03em;line-height:1.1}h2{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.2rem;color:#00e5ff;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.05em}h3{color:#f5f5f0;font-size:1rem;margin:20px 0 8px}p,li{margin-bottom:10px;line-height:1.9}ul{padding-left:20px}.nav{position:fixed;top:0;width:100%;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,229,255,.1);padding:12px 20px;z-index:1000;display:flex;justify-content:space-between;align-items:center}.nav a{color:#ccc;font-size:10px;letter-spacing:.2em;margin:0 10px}.nav img{height:24px}.hero-s{padding:120px 20px 60px;border-bottom:1px solid rgba(0,229,255,.1)}.tag{font-size:9px;color:#00e5ff;letter-spacing:.4em;margin-bottom:12px}.cta{display:inline-block;padding:14px 32px;border:1px solid #00e5ff;color:#00e5ff;font-size:11px;letter-spacing:.25em;margin-top:24px}.ft{border-top:1px solid rgba(245,245,240,.06);padding:30px 20px;text-align:center;font-size:9px;color:#999;margin-top:60px}.price{display:inline-block;padding:4px 12px;border:1px solid rgba(0,229,255,.2);color:#00e5ff;font-size:11px;margin:8px 0}.tags{font-size:9px;color:#999;letter-spacing:.15em;margin-top:8px}.faq-item{border-bottom:1px solid rgba(245,245,240,.06);padding:16px 0}.faq-q{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1rem;color:#f5f5f0;margin-bottom:6px}.faq-a{font-size:12px;color:#ccc}.blog-date{font-size:10px;color:#999;letter-spacing:.15em}"
         ".ctbl{overflow-x:auto;margin:16px 0}table{border-collapse:collapse;width:100%;font-size:12px;min-width:520px}th,td{border:1px solid rgba(0,229,255,.15);padding:8px 10px;text-align:left;vertical-align:top}th{color:#00e5ff;font-family:'Inter Tight',sans-serif;font-weight:700}"
         ".stack{list-style:none;padding:0;margin:16px 0;display:flex;flex-wrap:wrap;gap:8px}.stack li{margin:0;padding:4px 12px;border:1px solid rgba(0,229,255,.2);color:#00e5ff;font-size:11px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin:28px 0}.card{border:1px solid rgba(0,229,255,.15);padding:22px;display:block;transition:border-color .2s}.card:hover{border-color:rgba(0,229,255,.4)}.card h3{margin:0 0 8px;color:#f5f5f0}.card p{color:#ccc;font-size:12px;margin-bottom:0}.card .tags{color:#00e5ff;margin-top:14px}.live{display:inline-block;margin:8px 0;font-size:11px;letter-spacing:.15em}")

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">')

# ── Per-language chrome ──────────────────────────────────────────
L = {
 "it": dict(
   prefix="", og="og/og-casestudy.png", locale="it_IT",
   base="/case-study/", section_name="Case Study",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/chi-siamo/">CHI SIAMO</a><a href="/servizi/sviluppo-siti-web/">SERVIZI</a><a href="/portfolio/">PORTFOLIO</a><a href="/contatti/">CONTATTI</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Tutti i diritti riservati &middot; <a href="/privacy/">Privacy</a> &middot; <a href="/cookie/">Cookie</a> &middot; <a href="/termini/">Terms</a></p></div>',
   home="/", contact="/contatti/", cta="RICHIEDI UN PREVENTIVO GRATUITO",
   faq_h2="Domande frequenti", tag="// CASE STUDY", hub_tag="// CASE STUDIES",
   live_label="Visita il progetto live"),
 "en": dict(
   prefix="/en", og="og/og-casestudy.png", locale="en_US",
   base="/en/case-studies/", section_name="Case Studies",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">HOME</a><a href="/en/about/">ABOUT</a><a href="/en/services/web-development/">SERVICES</a><a href="/en/portfolio/">PORTFOLIO</a><a href="/en/contact/">CONTACT</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>All rights reserved &middot; <a href="/en/privacy/">Privacy</a> &middot; <a href="/en/cookie/">Cookie</a> &middot; <a href="/en/terms/">Terms</a></p></div>',
   home="/en/", contact="/en/contact/", cta="REQUEST A FREE QUOTE",
   faq_h2="Frequently asked questions", tag="// CASE STUDY", hub_tag="// CASE STUDIES",
   live_label="Visit the live project"),
 "bg": dict(
   prefix="/bg", og="og/og-casestudy.png", locale="bg_BG",
   base="/bg/keys-studii/", section_name="Кейс студии",
   nav='<nav class="nav"><a href="/"><img src="/logo.png" alt="Carbon Stealth VCC" width="56" height="24" decoding="async"></a><div><a href="/">ГЛАВНА</a><a href="/bg/za-nas/">ЗА НАС</a><a href="/bg/uslugi/web-razrabotka/">УСЛУГИ</a><a href="/bg/portfolio/">ПОРТФОЛИО</a><a href="/bg/kontakti/">КОНТАКТИ</a></div></nav>',
   ft='<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>Всички права запазени &middot; <a href="/bg/privacy/">Privacy</a> &middot; <a href="/bg/cookie/">Cookie</a> &middot; <a href="/bg/usloviya/">Terms</a></p></div>',
   home="/bg/", contact="/bg/kontakti/", cta="ЗАЯВИ БЕЗПЛАТНА ОФЕРТА",
   faq_h2="Често задавани въпроси", tag="// КЕЙС СТУДИЯ", hub_tag="// КЕЙС СТУДИИ",
   live_label="Разгледай проекта на живо"),
}

# ── Projects (true facts only; native prose per language) ────────
PROJECTS = [

# 1 ─── Nexus Dominion ───────────────────────────────────────────
dict(slug="nexus-dominion", name="Nexus Dominion", section="Game Development",
     live="https://nexus.carbonstealth.eu",
     tech=["React", "Vite", "Node.js", "TypeScript", "Prisma", "PostgreSQL", "Redis", "Socket.IO", "Docker"],
 lang=dict(
  it=dict(
   title="Nexus Dominion — Case Study | Carbon Stealth",
   desc="Case study di Nexus Dominion: un MMO per browser dark-fantasy con multiplayer in tempo reale, gilde, dungeon, arena PvP ed economia guidata dai giocatori. Stack React, Node.js, PostgreSQL, Redis, Socket.IO.",
   card="MMO per browser dark-fantasy con multiplayer in tempo reale, gilde, dungeon e arena PvP.",
   body="""<h2>Panoramica</h2>
<p><strong>Nexus Dominion</strong> è un MMO (Massively Multiplayer Online) giocabile direttamente dal browser, ambientato in un mondo dark-fantasy di ispirazione medievale. Il progetto nasce con un obiettivo tecnico preciso: offrire un'esperienza di gioco persistente e in tempo reale, con centinaia di interazioni simultanee, senza chiedere all'utente di installare nulla. Tutto vive nel browser, dal login alla battaglia. Abbiamo progettato l'intera architettura da zero, dal database al motore di gioco lato server fino all'interfaccia.</p>
<h2>La sfida</h2>
<p>Un MMO non è un sito web con qualche animazione: è un sistema in cui lo stato del mondo cambia di continuo e deve restare coerente per tutti i giocatori nello stesso istante. La sfida principale era gestire il tempo reale — movimenti, combattimenti, chat di gilda, mercato — mantenendo i dati sincronizzati e la latenza bassa. A questo si aggiunge la complessità del dominio di gioco: dungeon, arena PvP, gilde e un'economia interamente guidata dai giocatori richiedono un modello dati profondo, con oltre 52 modelli di database interconnessi e 27 pagine di gioco distinte.</p>
<h2>La soluzione</h2>
<p>Abbiamo costruito il front-end con <strong>React</strong> e <strong>Vite</strong> per un'interfaccia reattiva e un caricamento rapido, e un back-end in <strong>Node.js</strong> con <strong>TypeScript</strong> per avere tipi solidi su una logica di gioco così articolata. La comunicazione in tempo reale passa da <strong>Socket.IO</strong>, mentre <strong>Redis</strong> gestisce lo stato volatile e le sessioni ad alta frequenza, alleggerendo il database principale. La persistenza è affidata a <strong>PostgreSQL</strong> con <strong>Prisma</strong> come ORM: i 52+ modelli descrivono personaggi, gilde, oggetti, dungeon, ordini di mercato e cronologia delle battaglie. L'intero ambiente è containerizzato con <strong>Docker</strong> per garantire deploy ripetibili e scalabilità.</p>
<p>Ogni azione di gioco — un attacco nell'arena, un'offerta al mercato, un messaggio in gilda — attraversa lo stesso ciclo: il client React invia l'evento via Socket.IO, il server Node.js lo valida rispetto allo stato corrente del mondo e propaga l'aggiornamento a tutti i giocatori coinvolti. Separare lo stato transitorio in Redis dalla persistenza definitiva in PostgreSQL è ciò che permette al mondo di restare reattivo anche quando molti eventi accadono nello stesso istante. TypeScript, applicato in modo coerente su front-end e back-end, riduce gli errori in una logica di gioco con centinaia di regole interconnesse.</p>
<h2>Stack tecnologico</h2>
<ul class="stack"><li>React</li><li>Vite</li><li>Node.js</li><li>TypeScript</li><li>Prisma</li><li>PostgreSQL</li><li>Redis</li><li>Socket.IO</li><li>Docker</li></ul>
<h2>Il risultato</h2>
<p>Il risultato è una piattaforma di gioco completa e giocabile: multiplayer in tempo reale, sistema di gilde, dungeon esplorabili, un'arena PvP e un mercato dove i prezzi li fanno i giocatori. L'architettura a 27 pagine copre l'intero ciclo di vita del personaggio, dalla creazione alla progressione fino agli scontri di fine gioco. Nexus Dominion dimostra che con lo stack giusto un'applicazione real-time complessa può girare in modo fluido e affidabile interamente nel browser. Puoi provarlo dal vivo qui: <a href="https://nexus.carbonstealth.eu" target="_blank" rel="noopener">nexus.carbonstealth.eu</a>.</p>
<h2>Cosa possiamo fare per te</h2>
<p>Nexus Dominion è la prova che gestiamo applicazioni real-time complesse, non solo siti vetrina. Se hai un'idea che richiede logica di back-end seria, dati in tempo reale o un'architettura scalabile, possiamo costruirla. Scopri il nostro <a href="/servizi/sviluppo-software/">sviluppo software su misura</a>, lo <a href="/servizi/sviluppo-siti-web/">sviluppo di applicazioni web</a> e l'<a href="/servizi/hosting/">hosting cloud gestito</a> su cui gira un progetto come questo.</p>""",
   faqs=[
    ("Cos'è Nexus Dominion?", "È un MMO per browser dark-fantasy sviluppato da Carbon Stealth: multiplayer in tempo reale, gilde, dungeon, arena PvP ed economia guidata dai giocatori, tutto giocabile senza installare nulla."),
    ("Con quali tecnologie è stato costruito?", "Front-end in React e Vite, back-end in Node.js e TypeScript, comunicazione real-time con Socket.IO, dati in PostgreSQL gestiti con Prisma, stato ad alta frequenza in Redis e deploy containerizzato con Docker."),
    ("Quanto è complesso il progetto?", "Il modello dati conta oltre 52 modelli di database interconnessi e l'interfaccia è organizzata in 27 pagine di gioco distinte, dalla creazione del personaggio alle battaglie PvP."),
    ("Potete costruire applicazioni real-time anche per la mia azienda?", "Sì. La stessa architettura real-time e scalabile che regge Nexus Dominion può alimentare dashboard live, piattaforme collaborative o gestionali su misura. Raccontaci il tuo progetto e ti diciamo come realizzarlo."),
   ]),
  en=dict(
   title="Nexus Dominion — Case Study | Carbon Stealth",
   desc="Nexus Dominion case study: a dark-fantasy browser MMO with real-time multiplayer, guilds, dungeons, a PvP arena and a player-driven economy. Built on React, Node.js, PostgreSQL, Redis and Socket.IO.",
   card="A dark-fantasy browser MMO with real-time multiplayer, guilds, dungeons and a PvP arena.",
   body="""<h2>Overview</h2>
<p><strong>Nexus Dominion</strong> is a Massively Multiplayer Online (MMO) game playable straight from the browser, set in a dark-fantasy medieval world. The project started with a precise technical goal: deliver a persistent, real-time gaming experience with hundreds of simultaneous interactions, without asking the player to install anything. Everything lives in the browser, from login to battle. We designed the entire architecture from scratch — from the database to the server-side game engine to the interface.</p>
<h2>The Challenge</h2>
<p>An MMO is not a website with a few animations: it is a system where the state of the world changes constantly and must stay consistent for every player at the same instant. The main challenge was handling real time — movement, combat, guild chat, the marketplace — while keeping data synchronised and latency low. On top of that sits the complexity of the game domain: dungeons, a PvP arena, guilds and a fully player-driven economy demand a deep data model, with more than 52 interconnected database models and 27 distinct game pages.</p>
<h2>The Solution</h2>
<p>We built the front end with <strong>React</strong> and <strong>Vite</strong> for a responsive interface and fast loads, and a back end in <strong>Node.js</strong> with <strong>TypeScript</strong> to keep solid typing over such intricate game logic. Real-time communication runs through <strong>Socket.IO</strong>, while <strong>Redis</strong> handles volatile state and high-frequency sessions, taking load off the primary database. Persistence relies on <strong>PostgreSQL</strong> with <strong>Prisma</strong> as the ORM: the 52+ models describe characters, guilds, items, dungeons, market orders and battle history. The whole environment is containerised with <strong>Docker</strong> for repeatable deploys and scalability.</p>
<p>Every game action — an attack in the arena, a bid on the market, a guild message — goes through the same loop: the React client sends the event over Socket.IO, the Node.js server validates it against the current state of the world, and the update is propagated to every player involved. Splitting transient state in Redis from durable persistence in PostgreSQL is what keeps the world responsive even when many events happen in the same instant. TypeScript, applied consistently across front end and back end, cuts down errors in game logic with hundreds of interconnected rules.</p>
<h2>Tech Stack</h2>
<ul class="stack"><li>React</li><li>Vite</li><li>Node.js</li><li>TypeScript</li><li>Prisma</li><li>PostgreSQL</li><li>Redis</li><li>Socket.IO</li><li>Docker</li></ul>
<h2>The Result</h2>
<p>The result is a complete, playable game platform: real-time multiplayer, a guild system, explorable dungeons, a PvP arena and a marketplace where players set the prices. The 27-page architecture covers the full character lifecycle, from creation through progression to end-game combat. Nexus Dominion proves that with the right stack a complex real-time application can run smoothly and reliably entirely in the browser. You can try it live here: <a href="https://nexus.carbonstealth.eu" target="_blank" rel="noopener">nexus.carbonstealth.eu</a>.</p>
<h2>What We Can Do For You</h2>
<p>Nexus Dominion is proof that we handle complex real-time applications, not just brochure sites. If you have an idea that needs serious back-end logic, live data or a scalable architecture, we can build it. Explore our <a href="/en/services/software-development/">custom software development</a>, our <a href="/en/services/web-development/">web application development</a> and the <a href="/en/services/hosting/">managed cloud hosting</a> a project like this runs on.</p>""",
   faqs=[
    ("What is Nexus Dominion?", "It is a dark-fantasy browser MMO built by Carbon Stealth: real-time multiplayer, guilds, dungeons, a PvP arena and a player-driven economy, all playable without installing anything."),
    ("Which technologies were used to build it?", "A React and Vite front end, a Node.js and TypeScript back end, real-time communication with Socket.IO, data in PostgreSQL managed with Prisma, high-frequency state in Redis and containerised deploys with Docker."),
    ("How complex is the project?", "The data model spans more than 52 interconnected database models and the interface is organised into 27 distinct game pages, from character creation to PvP battles."),
    ("Can you build real-time applications for my business too?", "Yes. The same real-time, scalable architecture behind Nexus Dominion can power live dashboards, collaborative platforms or custom management systems. Tell us about your project and we'll show you how to build it."),
   ]),
  bg=dict(
   title="Nexus Dominion — Кейс Студия | Carbon Stealth",
   desc="Кейс студия за Nexus Dominion: браузър MMO в dark-fantasy стил с мултиплейър в реално време, гилдии, подземия, PvP арена и икономика, водена от играчите. React, Node.js, PostgreSQL, Redis, Socket.IO.",
   card="Браузър MMO в dark-fantasy стил с мултиплейър в реално време, гилдии, подземия и PvP арена.",
   body="""<h2>Преглед</h2>
<p><strong>Nexus Dominion</strong> е MMO (Massively Multiplayer Online) игра, която се играе директно от браузъра, в dark-fantasy средновековен свят. Проектът стартира с ясна техническа цел: да предложи постоянно, real-time игрово изживяване със стотици едновременни взаимодействия, без потребителят да инсталира каквото и да е. Всичко живее в браузъра — от вход до битка. Проектирахме цялата архитектура от нулата: от базата данни през сървърния игрови двигател до интерфейса.</p>
<h2>Предизвикателството</h2>
<p>Едно MMO не е сайт с няколко анимации: това е система, в която състоянието на света се променя постоянно и трябва да остане консистентно за всички играчи в един и същи момент. Основното предизвикателство беше управлението на реалното време — движение, битки, гилдиен чат, пазар — при синхронизирани данни и ниска латентност. Към това се добавя сложността на игровата област: подземия, PvP арена, гилдии и изцяло водена от играчите икономика изискват дълбок модел на данните — над 52 свързани модела в базата и 27 отделни игрови страници.</p>
<h2>Решението</h2>
<p>Изградихме фронтенда с <strong>React</strong> и <strong>Vite</strong> за отзивчив интерфейс и бързо зареждане, а бекенда — на <strong>Node.js</strong> с <strong>TypeScript</strong>, за да имаме стабилни типове върху толкова сложна игрова логика. Комуникацията в реално време минава през <strong>Socket.IO</strong>, а <strong>Redis</strong> поема нестабилното състояние и високочестотните сесии, разтоварвайки основната база. Постоянството е поверено на <strong>PostgreSQL</strong> с <strong>Prisma</strong> като ORM: над 52-та модела описват герои, гилдии, предмети, подземия, пазарни поръчки и история на битките. Цялата среда е контейнеризирана с <strong>Docker</strong> за повтаряеми внедрявания и скалируемост.</p>
<p>Всяко игрово действие — атака в арената, оферта на пазара, съобщение в гилдията — минава през един и същи цикъл: React клиентът изпраща събитието през Socket.IO, Node.js сървърът го валидира спрямо текущото състояние на света и обновлението се разпространява до всички засегнати играчи. Разделянето на преходното състояние в Redis от трайното постоянство в PostgreSQL е това, което поддържа света отзивчив дори когато много събития се случват в един и същи момент. TypeScript, приложен последователно на фронтенд и бекенд, намалява грешките в игрова логика със стотици свързани правила.</p>
<h2>Технологичен стек</h2>
<ul class="stack"><li>React</li><li>Vite</li><li>Node.js</li><li>TypeScript</li><li>Prisma</li><li>PostgreSQL</li><li>Redis</li><li>Socket.IO</li><li>Docker</li></ul>
<h2>Резултатът</h2>
<p>Резултатът е завършена, играема игрова платформа: мултиплейър в реално време, система от гилдии, подземия за изследване, PvP арена и пазар, на който играчите определят цените. Архитектурата от 27 страници покрива целия жизнен цикъл на героя — от създаване през прогрес до битки в края на играта. Nexus Dominion доказва, че с правилния стек сложно real-time приложение може да работи плавно и надеждно изцяло в браузъра. Можете да го пробвате на живо тук: <a href="https://nexus.carbonstealth.eu" target="_blank" rel="noopener">nexus.carbonstealth.eu</a>.</p>
<h2>Какво можем да направим за вас</h2>
<p>Nexus Dominion е доказателство, че се справяме със сложни real-time приложения, а не само с визитни сайтове. Ако имате идея, която изисква сериозна бекенд логика, данни в реално време или скалируема архитектура, можем да я изградим. Разгледайте нашата <a href="/bg/uslugi/softuer/">разработка на софтуер по поръчка</a>, <a href="/bg/uslugi/web-razrabotka/">разработката на уеб приложения</a> и <a href="/bg/uslugi/hosting/">управлявания облачен хостинг</a>, върху който работи проект като този.</p>""",
   faqs=[
    ("Какво е Nexus Dominion?", "Това е браузър MMO в dark-fantasy стил, разработено от Carbon Stealth: мултиплейър в реално време, гилдии, подземия, PvP арена и водена от играчите икономика, играеми без инсталация."),
    ("С какви технологии е изградено?", "Фронтенд с React и Vite, бекенд с Node.js и TypeScript, комуникация в реално време със Socket.IO, данни в PostgreSQL с Prisma, високочестотно състояние в Redis и контейнеризирани внедрявания с Docker."),
    ("Колко сложен е проектът?", "Моделът на данните обхваща над 52 свързани модела в базата, а интерфейсът е организиран в 27 отделни игрови страници — от създаване на герой до PvP битки."),
    ("Можете ли да изградите real-time приложения и за моя бизнес?", "Да. Същата real-time и скалируема архитектура зад Nexus Dominion може да захрани живи табла, платформи за съвместна работа или системи за управление по поръчка. Разкажете ни за проекта си и ще ви покажем как да го реализираме."),
   ]),
 )),

# 2 ─── ERP Ascensori ────────────────────────────────────────────
dict(slug="erp-ascensori", name="ERP Ascensori", section="ERP & Business Software",
     live="https://erp.carbonstealth.eu",
     tech=["React", "Prisma", "PostgreSQL"],
 lang=dict(
  it=dict(
   title="ERP Ascensori — Case Study | Carbon Stealth",
   desc="Case study di un ERP su misura per un produttore italiano di ascensori: tracciamento produzione, magazzino, fatturazione, accessi a 7 livelli e dashboard di business intelligence. Stack React, Prisma, PostgreSQL.",
   card="ERP su misura per un produttore di ascensori: produzione, magazzino, fatturazione e dashboard BI.",
   body="""<h2>Panoramica</h2>
<p>Abbiamo progettato e sviluppato un <strong>ERP su misura</strong> per un produttore italiano di ascensori. L'obiettivo era sostituire una gestione frammentata tra fogli di calcolo e programmi scollegati con un unico sistema centrale che seguisse l'intero ciclo aziendale: dalla commessa in produzione, al magazzino, fino alla fatturazione. Un ERP standard non copriva le specificità di un'azienda manifatturiera con processi propri, quindi abbiamo costruito la soluzione partendo dai suoi flussi reali.</p>
<h2>La sfida</h2>
<p>La produzione di ascensori è un processo lungo e articolato, in cui ogni commessa attraversa più reparti. La sfida era dare visibilità in tempo reale sullo stato di avanzamento senza appesantire chi lavora in officina, e allo stesso tempo collegare quel dato al magazzino e alla fatturazione, così che nulla venisse reinserito a mano. A questo si aggiungeva un requisito di controllo: persone diverse — dalla produzione all'amministrazione alla direzione — devono vedere e modificare cose diverse, con permessi chiari e sicuri.</p>
<h2>La soluzione</h2>
<p>Abbiamo realizzato un'applicazione web con front-end in <strong>React</strong>, dati su <strong>PostgreSQL</strong> e <strong>Prisma</strong> come ORM per modellare in modo pulito le entità dell'azienda. Il sistema integra il <strong>tracciamento della produzione</strong>, la gestione del <strong>magazzino</strong>, la <strong>fatturazione</strong> e un <strong>controllo degli accessi basato sui ruoli con 7 livelli</strong>, così ogni utente lavora solo su ciò che gli compete. Sopra tutto questo abbiamo costruito <strong>dashboard di business intelligence</strong> che trasformano i dati operativi in indicatori leggibili per la direzione.</p>
<p>Nel dettaglio, il tracciamento della produzione segue ogni commessa attraverso le sue fasi, così l'ufficio sa in ogni momento a che punto è un ascensore; il magazzino registra carichi, scarichi e giacenze collegati alle commesse; la fatturazione attinge agli stessi dati, senza reinserimenti manuali. I 7 livelli di accesso vanno dall'operatore di reparto fino alla direzione, ciascuno con la propria vista e i propri permessi, così i dati sensibili restano protetti. Le dashboard, infine, aggregano questi flussi in indicatori sintetici che rispondono a domande concrete: quante commesse sono in corso, cosa manca a magazzino, come procede la fatturazione.</p>
<h2>Stack tecnologico</h2>
<ul class="stack"><li>React</li><li>Prisma</li><li>PostgreSQL</li></ul>
<h2>Il risultato</h2>
<p>Il risultato è un ERP che unifica in un unico posto produzione, magazzino e fatturazione, con una gerarchia di accessi a 7 livelli che rispecchia l'organigramma reale dell'azienda. Le dashboard di BI danno alla direzione una visione immediata sull'andamento, mentre chi opera in produzione registra lo stato di avanzamento in modo semplice. Il sistema è vivo e in uso: <a href="https://erp.carbonstealth.eu" target="_blank" rel="noopener">erp.carbonstealth.eu</a>.</p>
<h2>Cosa possiamo fare per te</h2>
<p>Se la tua azienda gestisce troppi dati su Excel scollegati o su programmi che non si parlano, un ERP su misura può fare la differenza. Costruiamo il sistema attorno ai tuoi processi, non il contrario. Scopri il nostro <a href="/servizi/erp/">servizio ERP su misura</a>, lo <a href="/servizi/sviluppo-software/">sviluppo software gestionale</a> e l'<a href="/servizi/hosting/">hosting cloud gestito</a> su cui lo facciamo girare.</p>""",
   faqs=[
    ("Che cos'è questo progetto ERP?", "È un sistema ERP su misura sviluppato per un produttore italiano di ascensori, che unifica tracciamento della produzione, magazzino e fatturazione in un'unica applicazione web."),
    ("Quali funzioni include l'ERP?", "Tracciamento della produzione, gestione del magazzino, fatturazione, controllo degli accessi basato sui ruoli con 7 livelli e dashboard di business intelligence per la direzione."),
    ("Con quali tecnologie è stato costruito?", "È un'applicazione web con front-end in React, database PostgreSQL e Prisma come ORM per modellare le entità aziendali."),
    ("Potete costruire un ERP su misura per la mia azienda?", "Sì. Partiamo dai tuoi flussi di lavoro reali e costruiamo un sistema che integra i reparti, con permessi per ruolo e dashboard. Raccontaci i tuoi processi e ti proponiamo la soluzione giusta."),
   ]),
  en=dict(
   title="ERP Ascensori — Case Study | Carbon Stealth",
   desc="Case study of a custom ERP for an Italian elevator manufacturer: production tracking, warehouse, invoicing, 7-level role-based access and business intelligence dashboards. Built on React, Prisma and PostgreSQL.",
   card="A custom ERP for an elevator manufacturer: production, warehouse, invoicing and BI dashboards.",
   body="""<h2>Overview</h2>
<p>We designed and developed a <strong>custom ERP</strong> for an Italian elevator manufacturer. The goal was to replace a fragmented setup — spreadsheets and disconnected programs — with a single central system that follows the whole business cycle: from a job in production, to the warehouse, through to invoicing. An off-the-shelf ERP could not cover the specifics of a manufacturer with its own processes, so we built the solution starting from its real workflows.</p>
<h2>The Challenge</h2>
<p>Building an elevator is a long, multi-stage process in which every order passes through several departments. The challenge was to give real-time visibility over progress without slowing down the people on the shop floor, and at the same time connect that data to the warehouse and to invoicing so nothing had to be re-entered by hand. On top of that came a control requirement: different people — from production to administration to management — need to see and edit different things, with clear, secure permissions.</p>
<h2>The Solution</h2>
<p>We built a web application with a <strong>React</strong> front end, data on <strong>PostgreSQL</strong> and <strong>Prisma</strong> as the ORM to model the company's entities cleanly. The system integrates <strong>production tracking</strong>, <strong>warehouse</strong> management, <strong>invoicing</strong> and <strong>role-based access control with 7 levels</strong>, so each user works only on what concerns them. On top of all this we built <strong>business intelligence dashboards</strong> that turn operational data into readable indicators for management.</p>
<p>In detail, production tracking follows each order through its stages, so the office always knows where a given elevator stands; the warehouse records inbound, outbound and stock tied to orders; invoicing draws on the same data with no manual re-entry. The 7 access levels run from a shop-floor operator up to management, each with its own view and permissions, so sensitive data stays protected. The dashboards, finally, aggregate these flows into concise indicators that answer concrete questions: how many orders are in progress, what is missing from stock, how invoicing is going.</p>
<h2>Tech Stack</h2>
<ul class="stack"><li>React</li><li>Prisma</li><li>PostgreSQL</li></ul>
<h2>The Result</h2>
<p>The result is an ERP that unifies production, warehouse and invoicing in one place, with a 7-level access hierarchy that mirrors the company's real org chart. The BI dashboards give management an immediate view of how things are going, while people in production log progress in a simple way. The system is live and in use: <a href="https://erp.carbonstealth.eu" target="_blank" rel="noopener">erp.carbonstealth.eu</a>.</p>
<h2>What We Can Do For You</h2>
<p>If your company juggles too much data across disconnected spreadsheets or programs that don't talk to each other, a custom ERP can change things. We build the system around your processes, not the other way round. Explore our <a href="/en/services/erp/">custom ERP service</a>, our <a href="/en/services/software-development/">business software development</a> and the <a href="/en/services/hosting/">managed cloud hosting</a> we run it on.</p>""",
   faqs=[
    ("What is this ERP project?", "It is a custom ERP system built for an Italian elevator manufacturer, unifying production tracking, warehouse and invoicing in a single web application."),
    ("What features does the ERP include?", "Production tracking, warehouse management, invoicing, role-based access control with 7 levels and business intelligence dashboards for management."),
    ("Which technologies were used to build it?", "It is a web application with a React front end, a PostgreSQL database and Prisma as the ORM to model the business entities."),
    ("Can you build a custom ERP for my company?", "Yes. We start from your real workflows and build a system that integrates departments, with role-based permissions and dashboards. Tell us about your processes and we'll propose the right solution."),
   ]),
  bg=dict(
   title="ERP Ascensori — Кейс Студия | Carbon Stealth",
   desc="Кейс студия за ERP по поръчка за италиански производител на асансьори: проследяване на производството, склад, фактуриране, ролеви достъп на 7 нива и BI табла. React, Prisma, PostgreSQL.",
   card="ERP по поръчка за производител на асансьори: производство, склад, фактуриране и BI табла.",
   body="""<h2>Преглед</h2>
<p>Проектирахме и разработихме <strong>ERP по поръчка</strong> за италиански производител на асансьори. Целта беше да заменим разпокъсаната работа между електронни таблици и несвързани програми с единна централна система, която следва целия бизнес цикъл: от поръчка в производство, през склада, до фактурирането. Готово ERP не покриваше спецификите на производствена фирма със собствени процеси, затова изградихме решението, тръгвайки от реалните ѝ работни потоци.</p>
<h2>Предизвикателството</h2>
<p>Производството на асансьори е дълъг процес на много етапи, в който всяка поръчка минава през няколко отдела. Предизвикателството беше да дадем видимост в реално време върху хода на работата, без да натоварваме хората в цеха, и същевременно да свържем тези данни със склада и фактурирането, така че нищо да не се въвежда наново на ръка. Към това се добавя изискване за контрол: различни хора — от производството през администрацията до ръководството — трябва да виждат и променят различни неща, с ясни и сигурни права.</p>
<h2>Решението</h2>
<p>Изградихме уеб приложение с фронтенд на <strong>React</strong>, данни в <strong>PostgreSQL</strong> и <strong>Prisma</strong> като ORM за чисто моделиране на същностите на фирмата. Системата интегрира <strong>проследяване на производството</strong>, управление на <strong>склада</strong>, <strong>фактуриране</strong> и <strong>ролеви контрол на достъпа със 7 нива</strong>, така че всеки потребител работи само с това, което го засяга. Върху всичко това изградихме <strong>табла за business intelligence</strong>, които превръщат оперативните данни в четими показатели за ръководството.</p>
<p>В детайли, проследяването на производството следва всяка поръчка през нейните етапи, така че офисът винаги знае докъде е стигнал даден асансьор; складът записва постъпления, изписвания и наличности, свързани с поръчките; фактурирането черпи от същите данни, без ръчно повторно въвеждане. Седемте нива на достъп вървят от оператор в цеха до ръководството, всяко със свой изглед и права, така че чувствителните данни остават защитени. Таблата, накрая, обобщават тези потоци в стегнати показатели, които отговарят на конкретни въпроси: колко поръчки са в ход, какво липсва в склада, как върви фактурирането.</p>
<h2>Технологичен стек</h2>
<ul class="stack"><li>React</li><li>Prisma</li><li>PostgreSQL</li></ul>
<h2>Резултатът</h2>
<p>Резултатът е ERP, който обединява производство, склад и фактуриране на едно място, с йерархия на достъпа от 7 нива, отразяваща реалната структура на фирмата. BI таблата дават на ръководството незабавен поглед върху хода на нещата, а хората в производството отчитат напредъка лесно. Системата е жива и в реална употреба: <a href="https://erp.carbonstealth.eu" target="_blank" rel="noopener">erp.carbonstealth.eu</a>.</p>
<h2>Какво можем да направим за вас</h2>
<p>Ако фирмата ви жонглира с прекалено много данни в несвързани таблици или програми, които не си говорят, едно ERP по поръчка може да промени нещата. Изграждаме системата около вашите процеси, а не обратното. Разгледайте нашата <a href="/bg/uslugi/erp/">услуга за ERP по поръчка</a>, <a href="/bg/uslugi/softuer/">разработката на бизнес софтуер</a> и <a href="/bg/uslugi/hosting/">управлявания облачен хостинг</a>, върху който я пускаме.</p>""",
   faqs=[
    ("Какво представлява този ERP проект?", "Това е ERP система по поръчка, изградена за италиански производител на асансьори, която обединява проследяване на производството, склад и фактуриране в едно уеб приложение."),
    ("Какви функции включва ERP системата?", "Проследяване на производството, управление на склада, фактуриране, ролеви контрол на достъпа със 7 нива и business intelligence табла за ръководството."),
    ("С какви технологии е изградена?", "Уеб приложение с фронтенд на React, база данни PostgreSQL и Prisma като ORM за моделиране на бизнес същностите."),
    ("Можете ли да изградите ERP по поръчка за моята фирма?", "Да. Тръгваме от вашите реални работни потоци и изграждаме система, която интегрира отделите, с права по роля и табла. Разкажете ни за процесите си и ще предложим правилното решение."),
   ]),
 )),

# 3 ─── OU Nikola Vaptsarov ──────────────────────────────────────
dict(slug="ou-vaptsarov", name="OU Nikola Vaptsarov", section="Web Development",
     live="https://ouvaptsarov.com",
     tech=["React", "Vite", "PHP"],
 lang=dict(
  it=dict(
   title="OU Nikola Vaptsarov — Case Study | Carbon Stealth",
   desc="Case study del sito ufficiale multilingua della scuola OU Nikola Vaptsarov di Bobov Dol: sito istituzionale veloce e accessibile costruito con React, Vite e PHP.",
   card="Sito ufficiale multilingua per una scuola pubblica: veloce, accessibile e facile da aggiornare.",
   body="""<h2>Panoramica</h2>
<p>Abbiamo realizzato il <strong>sito ufficiale multilingua</strong> della scuola <strong>OU Nikola Vaptsarov</strong> di Bobov Dol, in Bulgaria. Un sito istituzionale per una scuola pubblica ha esigenze precise: deve essere chiaro, accessibile a genitori, studenti e personale, e restare aggiornato con avvisi e documenti. L'obiettivo era dare all'istituto una presenza online moderna e affidabile, semplice da consultare e da mantenere nel tempo.</p>
<p>Per una scuola, il sito ufficiale è il primo punto di contatto con le famiglie e con la comunità: è lì che genitori e studenti cercano orari, avvisi e informazioni pratiche, spesso di corsa e dal telefono. Volevamo che quel punto di contatto fosse curato, coerente con l'identità dell'istituto e sempre raggiungibile, senza le limitazioni di un modello preconfezionato. Per questo abbiamo lavorato su misura, partendo dalle reali esigenze della scuola e di chi la frequenta ogni giorno.</p>
<h2>La sfida</h2>
<p>Il pubblico di un sito scolastico è molto vario per età e dimestichezza con la tecnologia: deve funzionare bene per un genitore che apre il sito dal telefono così come per un insegnante al computer. La sfida era costruire un sito multilingua, rapido da caricare anche su connessioni non ottimali, con una struttura ordinata per informazioni istituzionali, comunicazioni e documenti, il tutto rispettando i requisiti di accessibilità di un ente pubblico.</p>
<h2>La soluzione</h2>
<p>Abbiamo costruito l'interfaccia con <strong>React</strong> e <strong>Vite</strong>, per un sito veloce, fluido e curato nella navigazione, appoggiandoci a <strong>PHP</strong> lato server per la parte dinamica e la gestione dei contenuti. La struttura multilingua permette di raggiungere tutti gli utenti nella lingua giusta, mentre l'organizzazione delle pagine rende immediato trovare orari, avvisi e documenti. L'attenzione alle prestazioni e alla struttura garantisce anche una buona visibilità del sito sui motori di ricerca.</p>
<p>Un sito scolastico vive di contenuti che cambiano nel tempo: avvisi per le famiglie, orari, moduli e documenti ufficiali da scaricare, notizie sulla vita dell'istituto. Abbiamo strutturato queste sezioni in modo che restino ordinate e facili da consultare, così genitori e studenti trovano subito ciò che cercano. La combinazione di React e Vite mantiene la navigazione rapida e fluida, mentre PHP gestisce lato server le parti dinamiche e l'erogazione dei contenuti; il risultato è un sito leggero, che si apre in fretta anche da telefono e con una connessione modesta, e con un markup pulito che i motori di ricerca leggono senza difficoltà.</p>
<h2>Stack tecnologico</h2>
<ul class="stack"><li>React</li><li>Vite</li><li>PHP</li></ul>
<h2>Il risultato</h2>
<p>Il risultato è un sito istituzionale moderno, multilingua e veloce, che dà alla scuola una presenza online all'altezza. È facile da consultare per famiglie e personale e semplice da tenere aggiornato. Il sito è online e attivo: <a href="https://ouvaptsarov.com" target="_blank" rel="noopener">ouvaptsarov.com</a>.</p>
<h2>Cosa possiamo fare per te</h2>
<p>Che tu rappresenti una scuola, un ente o un'azienda, costruiamo siti veloci, accessibili e multilingua, pensati per essere trovati e usati davvero. Scopri il nostro <a href="/servizi/sviluppo-siti-web/">sviluppo siti web</a>, l'<a href="/servizi/seo/">ottimizzazione SEO</a> e l'<a href="/servizi/hosting/">hosting cloud gestito</a> che teniamo insieme in un unico progetto.</p>""",
   faqs=[
    ("Che cos'è questo progetto?", "È il sito ufficiale multilingua della scuola OU Nikola Vaptsarov di Bobov Dol, un sito istituzionale moderno e accessibile realizzato da Carbon Stealth."),
    ("Con quali tecnologie è stato costruito?", "L'interfaccia è costruita con React e Vite per velocità e fluidità, con PHP lato server per la parte dinamica e la gestione dei contenuti."),
    ("Il sito è multilingua?", "Sì. È strutturato per servire gli utenti in più lingue, così famiglie, studenti e personale trovano le informazioni nella lingua giusta."),
    ("Potete realizzare un sito per la mia scuola o ente?", "Sì. Costruiamo siti istituzionali veloci, accessibili e multilingua, ottimizzati per i motori di ricerca e facili da aggiornare. Contattaci e ne parliamo."),
   ]),
  en=dict(
   title="OU Nikola Vaptsarov — Case Study | Carbon Stealth",
   desc="Case study of the official multilingual website for OU Nikola Vaptsarov school in Bobov Dol: a fast, accessible institutional site built with React, Vite and PHP.",
   card="An official multilingual website for a public school: fast, accessible and easy to keep updated.",
   body="""<h2>Overview</h2>
<p>We built the <strong>official multilingual website</strong> for <strong>OU Nikola Vaptsarov</strong>, a school in Bobov Dol, Bulgaria. An institutional site for a public school has precise needs: it must be clear, accessible to parents, students and staff, and stay up to date with announcements and documents. The goal was to give the school a modern, reliable online presence that is simple to browse and to maintain over time.</p>
<p>For a school, the official website is the first point of contact with families and the wider community: it is where parents and students look for schedules, notices and practical information, often in a hurry and from a phone. We wanted that point of contact to feel cared for, consistent with the school's identity and always reachable, without the limits of an off-the-shelf template. That is why we worked bespoke, starting from the real needs of the school and of the people who use it every day.</p>
<h2>The Challenge</h2>
<p>The audience of a school website varies widely in age and comfort with technology: it has to work well for a parent opening it on a phone as much as for a teacher at a computer. The challenge was to build a multilingual site that loads quickly even on modest connections, with a tidy structure for institutional information, announcements and documents, all while respecting the accessibility expectations of a public body.</p>
<h2>The Solution</h2>
<p>We built the interface with <strong>React</strong> and <strong>Vite</strong>, for a fast, smooth site with careful navigation, backed by <strong>PHP</strong> on the server for the dynamic parts and content handling. The multilingual structure reaches every user in the right language, while the page organisation makes it immediate to find schedules, notices and documents. The focus on performance and structure also gives the site solid visibility in search engines.</p>
<p>A school website lives on content that changes over time: notices for families, schedules, forms and official documents to download, news about the life of the institute. We structured these sections so they stay tidy and easy to browse, so parents and students find what they need straight away. The React and Vite combination keeps navigation fast and smooth, while PHP handles the dynamic parts and content delivery on the server; the result is a lightweight site that opens quickly even on a phone and on a modest connection, with clean markup that search engines read without trouble.</p>
<h2>Tech Stack</h2>
<ul class="stack"><li>React</li><li>Vite</li><li>PHP</li></ul>
<h2>The Result</h2>
<p>The result is a modern, multilingual, fast institutional site that gives the school an online presence to match. It is easy for families and staff to browse and simple to keep updated. The site is live and active: <a href="https://ouvaptsarov.com" target="_blank" rel="noopener">ouvaptsarov.com</a>.</p>
<h2>What We Can Do For You</h2>
<p>Whether you represent a school, a public body or a business, we build fast, accessible, multilingual sites designed to be found and genuinely used. Explore our <a href="/en/services/web-development/">web development</a>, our <a href="/en/services/seo/">SEO optimisation</a> and the <a href="/en/services/hosting/">managed cloud hosting</a> we bring together in a single project.</p>""",
   faqs=[
    ("What is this project?", "It is the official multilingual website for OU Nikola Vaptsarov school in Bobov Dol, a modern, accessible institutional site built by Carbon Stealth."),
    ("Which technologies were used to build it?", "The interface is built with React and Vite for speed and smoothness, with PHP on the server for the dynamic parts and content handling."),
    ("Is the site multilingual?", "Yes. It is structured to serve users in multiple languages, so families, students and staff find information in the right language."),
    ("Can you build a website for my school or organisation?", "Yes. We build fast, accessible, multilingual institutional sites that are optimised for search engines and easy to update. Get in touch and let's talk."),
   ]),
  bg=dict(
   title="ОУ Никола Вапцаров — Кейс Студия | Carbon Stealth",
   desc="Кейс студия за официалния многоезичен сайт на ОУ Никола Вапцаров, Бобов дол: бърз и достъпен институционален сайт, изграден с React, Vite и PHP.",
   card="Официален многоезичен сайт за държавно училище: бърз, достъпен и лесен за поддръжка.",
   body="""<h2>Преглед</h2>
<p>Изградихме <strong>официалния многоезичен сайт</strong> на <strong>ОУ Никола Вапцаров</strong> в Бобов дол, България. Институционалният сайт на държавно училище има ясни изисквания: трябва да е разбираем, достъпен за родители, ученици и персонал и да остава актуален със съобщения и документи. Целта беше да дадем на училището модерно и надеждно онлайн присъствие, лесно за разглеждане и за поддръжка във времето.</p>
<p>За едно училище официалният сайт е първата точка на контакт със семействата и с общността: там родители и ученици търсят графици, съобщения и практична информация, често набързо и от телефона. Искахме тази точка на контакт да е поддържана, съответстваща на идентичността на училището и винаги достъпна, без ограниченията на готов шаблон. Затова работихме изцяло по поръчка, тръгвайки от реалните нужди на училището и на хората, които го използват всеки ден.</p>
<h2>Предизвикателството</h2>
<p>Аудиторията на училищен сайт е много разнородна по възраст и технологична подготовка: трябва да работи добре както за родител, който го отваря от телефона, така и за учител на компютър. Предизвикателството беше да изградим многоезичен сайт, който се зарежда бързо дори при по-слаба връзка, с подредена структура за институционална информация, съобщения и документи, при спазване на очакванията за достъпност пред публична институция.</p>
<h2>Решението</h2>
<p>Изградихме интерфейса с <strong>React</strong> и <strong>Vite</strong> за бърз, плавен сайт с внимателна навигация, с <strong>PHP</strong> от страна на сървъра за динамичните части и управлението на съдържанието. Многоезичната структура достига всеки потребител на правилния език, а организацията на страниците прави намирането на графици, съобщения и документи мигновено. Вниманието към производителността и структурата дава на сайта и добра видимост в търсачките.</p>
<p>Училищният сайт живее със съдържание, което се променя във времето: съобщения за семействата, графици, формуляри и официални документи за изтегляне, новини от живота на училището. Структурирахме тези раздели така, че да остават подредени и лесни за разглеждане, за да намират родители и ученици нужното веднага. Комбинацията React и Vite поддържа навигацията бърза и плавна, а PHP управлява динамичните части и доставката на съдържание от страна на сървъра; резултатът е лек сайт, който се отваря бързо дори от телефон и при слаба връзка, с чист код, който търсачките четат без затруднение.</p>
<h2>Технологичен стек</h2>
<ul class="stack"><li>React</li><li>Vite</li><li>PHP</li></ul>
<h2>Резултатът</h2>
<p>Резултатът е модерен, многоезичен и бърз институционален сайт, който дава на училището подобаващо онлайн присъствие. Лесен е за разглеждане от семейства и персонал и прост за поддръжка. Сайтът е онлайн и активен: <a href="https://ouvaptsarov.com" target="_blank" rel="noopener">ouvaptsarov.com</a>.</p>
<h2>Какво можем да направим за вас</h2>
<p>Независимо дали представлявате училище, институция или бизнес, изграждаме бързи, достъпни и многоезични сайтове, създадени да бъдат намирани и реално използвани. Разгледайте нашата <a href="/bg/uslugi/web-razrabotka/">изработка на сайтове</a>, <a href="/bg/uslugi/seo/">SEO оптимизацията</a> и <a href="/bg/uslugi/hosting/">управлявания облачен хостинг</a>, които обединяваме в един проект.</p>""",
   faqs=[
    ("Какво представлява този проект?", "Това е официалният многоезичен сайт на ОУ Никола Вапцаров в Бобов дол — модерен, достъпен институционален сайт, изграден от Carbon Stealth."),
    ("С какви технологии е изграден?", "Интерфейсът е изграден с React и Vite за скорост и плавност, с PHP от страна на сървъра за динамичните части и управлението на съдържанието."),
    ("Сайтът многоезичен ли е?", "Да. Структуриран е да обслужва потребители на няколко езика, така че семейства, ученици и персонал намират информацията на правилния език."),
    ("Можете ли да изградите сайт за моето училище или организация?", "Да. Изграждаме бързи, достъпни и многоезични институционални сайтове, оптимизирани за търсачки и лесни за поддръжка. Свържете се с нас и да го обсъдим."),
   ]),
 )),

# 4 ─── Treti Mart ───────────────────────────────────────────────
dict(slug="treti-mart", name="Treti Mart", section="Marketplace & E-commerce",
     live="https://tretimart.carbonstealth.eu",
     tech=["React", "Node.js", "Stripe"],
 lang=dict(
  it=dict(
   title="Treti Mart — Case Study | Carbon Stealth",
   desc="Case study di Treti Mart: un marketplace bulgaro per veicoli, immobili e servizi, con annunci, inserzioni gratuite e pagamenti sicuri. Stack React, Node.js e Stripe.",
   card="Marketplace bulgaro per veicoli, immobili e servizi con annunci e pagamenti sicuri.",
   body="""<h2>Panoramica</h2>
<p><strong>Treti Mart</strong> è un <strong>marketplace bulgaro</strong> che riunisce in un'unica piattaforma tre categorie: veicoli, immobili e servizi. Gli utenti possono pubblicare annunci — anche gratuiti — sfogliare le inserzioni e concludere transazioni con pagamenti sicuri. L'obiettivo era costruire un luogo digitale unico dove domanda e offerta si incontrano, con un'esperienza semplice sia per chi vende sia per chi cerca.</p>
<p>In un unico posto convivono mondi molto diversi: chi vende un'auto, chi affitta o cede un immobile, chi offre un servizio. Riunirli in una sola piattaforma significa dare agli utenti un punto di riferimento comodo, dove pubblicare e cercare senza saltare da un sito all'altro. La sfida progettuale era proprio tenere insieme questa varietà mantenendo un'esperienza coerente, ordinata e affidabile, dalla prima ricerca fino al pagamento.</p>
<h2>La sfida</h2>
<p>Un marketplace non è un semplice catalogo: mette in relazione tante persone diverse e deve gestire annunci di natura molto diversa — un'auto, un appartamento, un servizio — con la stessa fluidità. La sfida era offrire la pubblicazione libera di inserzioni, tenere l'esperienza chiara nonostante la varietà di categorie, e soprattutto rendere i <strong>pagamenti sicuri e affidabili</strong>, elemento imprescindibile perché gli utenti si fidino di una piattaforma dove circola denaro.</p>
<h2>La soluzione</h2>
<p>Abbiamo costruito il front-end con <strong>React</strong>, per un'interfaccia rapida e ordinata su tutte le categorie, e un back-end in <strong>Node.js</strong> per gestire annunci, utenti e ricerche. I pagamenti sono affidati a <strong>Stripe</strong>, che garantisce transazioni sicure e conformi. La piattaforma permette la pubblicazione di annunci gratuiti, la navigazione per categoria tra veicoli, immobili e servizi, e un flusso di pagamento protetto per le operazioni che lo richiedono.</p>
<p>Le tre categorie — veicoli, immobili e servizi — hanno esigenze diverse, ma condividono lo stesso percorso: creazione dell'annuncio, pubblicazione, ricerca e contatto. Abbiamo tenuto questo flusso lineare per chi vende, permettendo inserzioni gratuite per abbassare la barriera d'ingresso, e chiaro per chi cerca, con una navigazione ordinata per categoria. Sul back-end, Node.js gestisce annunci, utenti e ricerche, mentre Stripe si occupa della parte più delicata, i pagamenti, con un flusso protetto e conforme che dà fiducia a entrambe le parti della transazione — un requisito essenziale per un marketplace dove circola denaro tra sconosciuti.</p>
<h2>Stack tecnologico</h2>
<ul class="stack"><li>React</li><li>Node.js</li><li>Stripe</li></ul>
<h2>Il risultato</h2>
<p>Il risultato è un marketplace funzionante che unisce veicoli, immobili e servizi in un'unica piattaforma, con annunci gratuiti e pagamenti sicuri gestiti tramite Stripe. Chi vende pubblica in modo semplice, chi cerca trova ciò che serve, e le transazioni avvengono in sicurezza. Il progetto è online: <a href="https://tretimart.carbonstealth.eu" target="_blank" rel="noopener">tretimart.carbonstealth.eu</a>.</p>
<h2>Cosa possiamo fare per te</h2>
<p>Se hai in mente un marketplace, una piattaforma con più utenti o un e-commerce con pagamenti online, possiamo costruirlo end-to-end, dalla logica di back-end all'integrazione dei pagamenti. Scopri il nostro <a href="/servizi/ecommerce/">sviluppo e-commerce</a>, lo <a href="/servizi/sviluppo-software/">sviluppo software su misura</a> e l'<a href="/servizi/hosting/">hosting cloud gestito</a> che completano un progetto come questo.</p>""",
   faqs=[
    ("Che cos'è Treti Mart?", "È un marketplace bulgaro sviluppato da Carbon Stealth per veicoli, immobili e servizi, con pubblicazione di annunci, inserzioni gratuite e pagamenti sicuri."),
    ("Con quali tecnologie è stato costruito?", "Front-end in React, back-end in Node.js e pagamenti gestiti tramite Stripe per transazioni sicure e conformi."),
    ("Come funzionano i pagamenti?", "I pagamenti passano da Stripe, che garantisce transazioni sicure. La piattaforma consente anche la pubblicazione di annunci gratuiti."),
    ("Potete costruire un marketplace o una piattaforma con pagamenti?", "Sì. Realizziamo marketplace e piattaforme multi-utente end-to-end, dalla logica di back-end all'integrazione dei pagamenti online. Raccontaci la tua idea."),
   ]),
  en=dict(
   title="Treti Mart — Case Study | Carbon Stealth",
   desc="Treti Mart case study: a Bulgarian marketplace for vehicles, real estate and services, with listings, free ads and secure payments. Built on React, Node.js and Stripe.",
   card="A Bulgarian marketplace for vehicles, real estate and services with listings and secure payments.",
   body="""<h2>Overview</h2>
<p><strong>Treti Mart</strong> is a <strong>Bulgarian marketplace</strong> that brings three categories together on one platform: vehicles, real estate and services. Users can post listings — including free ads — browse the catalogue and complete transactions with secure payments. The goal was to build a single digital place where supply and demand meet, with a simple experience for both sellers and buyers.</p>
<p>In one place, very different worlds coexist: someone selling a car, someone renting out or handing over a property, someone offering a service. Bringing them together on a single platform gives users one convenient reference point, where they publish and search without hopping between sites. The design challenge was exactly to hold this variety together while keeping the experience coherent, tidy and reliable, from the first search all the way to payment.</p>
<h2>The Challenge</h2>
<p>A marketplace is not a simple catalogue: it connects many different people and must handle listings of very different kinds — a car, an apartment, a service — with the same fluidity. The challenge was to offer open listing publication, keep the experience clear despite the variety of categories, and above all make <strong>payments secure and reliable</strong>, which is essential for users to trust a platform where money changes hands.</p>
<h2>The Solution</h2>
<p>We built the front end with <strong>React</strong>, for a fast, tidy interface across every category, and a back end in <strong>Node.js</strong> to handle listings, users and search. Payments rely on <strong>Stripe</strong>, which ensures secure, compliant transactions. The platform supports free ad publishing, browsing by category across vehicles, real estate and services, and a protected payment flow for the operations that require it.</p>
<p>The three categories — vehicles, real estate and services — have different needs but share the same path: create the listing, publish, search and get in touch. We kept this flow linear for sellers, allowing free ads to lower the barrier to entry, and clear for buyers, with tidy browsing by category. On the back end, Node.js handles listings, users and search, while Stripe takes care of the most delicate part, payments, with a protected, compliant flow that builds trust on both sides of the transaction — an essential requirement for a marketplace where money moves between strangers.</p>
<h2>Tech Stack</h2>
<ul class="stack"><li>React</li><li>Node.js</li><li>Stripe</li></ul>
<h2>The Result</h2>
<p>The result is a working marketplace that unites vehicles, real estate and services on one platform, with free ads and secure payments handled through Stripe. Sellers publish easily, buyers find what they need, and transactions happen securely. The project is live: <a href="https://tretimart.carbonstealth.eu" target="_blank" rel="noopener">tretimart.carbonstealth.eu</a>.</p>
<h2>What We Can Do For You</h2>
<p>If you have a marketplace, a multi-user platform or an e-commerce with online payments in mind, we can build it end to end, from back-end logic to payment integration. Explore our <a href="/en/services/ecommerce/">e-commerce development</a>, our <a href="/en/services/software-development/">custom software development</a> and the <a href="/en/services/hosting/">managed cloud hosting</a> that round out a project like this.</p>""",
   faqs=[
    ("What is Treti Mart?", "It is a Bulgarian marketplace built by Carbon Stealth for vehicles, real estate and services, with listing publication, free ads and secure payments."),
    ("Which technologies were used to build it?", "A React front end, a Node.js back end and payments handled through Stripe for secure, compliant transactions."),
    ("How do payments work?", "Payments run through Stripe, which ensures secure transactions. The platform also supports publishing free ads."),
    ("Can you build a marketplace or a platform with payments?", "Yes. We build marketplaces and multi-user platforms end to end, from back-end logic to online payment integration. Tell us your idea."),
   ]),
  bg=dict(
   title="Трети Март — Кейс Студия | Carbon Stealth",
   desc="Кейс студия за Трети Март: български маркетплейс за превозни средства, имоти и услуги — с обяви, безплатни обяви и сигурни плащания. React, Node.js, Stripe.",
   card="Български маркетплейс за превозни средства, имоти и услуги с обяви и сигурни плащания.",
   body="""<h2>Преглед</h2>
<p><strong>Трети Март</strong> е <strong>български маркетплейс</strong>, който обединява три категории в една платформа: превозни средства, имоти и услуги. Потребителите могат да публикуват обяви — включително безплатни — да разглеждат обявите и да извършват сделки със сигурни плащания. Целта беше да изградим единно дигитално място, където търсенето и предлагането се срещат, с просто изживяване както за продавачите, така и за търсещите.</p>
<p>На едно място съжителстват много различни светове: този, който продава кола, този, който отдава или прехвърля имот, този, който предлага услуга. Обединяването им в една платформа дава на потребителите удобна отправна точка, където публикуват и търсят, без да прескачат от сайт на сайт. Дизайнерското предизвикателство беше именно да задържим това разнообразие, запазвайки изживяването последователно, подредено и надеждно — от първото търсене чак до плащането.</p>
<h2>Предизвикателството</h2>
<p>Маркетплейсът не е обикновен каталог: свързва много различни хора и трябва да обработва обяви от много различно естество — автомобил, апартамент, услуга — с една и съща плавност. Предизвикателството беше да предложим свободно публикуване на обяви, да запазим изживяването ясно въпреки разнообразието от категории и най-вече да направим <strong>плащанията сигурни и надеждни</strong> — задължително условие, за да се доверят потребителите на платформа, през която минават пари.</p>
<h2>Решението</h2>
<p>Изградихме фронтенда с <strong>React</strong> за бърз и подреден интерфейс във всички категории, и бекенд на <strong>Node.js</strong> за управление на обявите, потребителите и търсенето. Плащанията са поверени на <strong>Stripe</strong>, който гарантира сигурни и съответстващи на изискванията транзакции. Платформата позволява публикуване на безплатни обяви, разглеждане по категория сред превозни средства, имоти и услуги, и защитен процес на плащане за операциите, които го изискват.</p>
<p>Трите категории — превозни средства, имоти и услуги — имат различни нужди, но споделят един и същ път: създаване на обява, публикуване, търсене и контакт. Запазихме този поток линеен за продавачите, позволявайки безплатни обяви за по-нисък праг на влизане, и ясен за търсещите, с подредено разглеждане по категория. На бекенда Node.js управлява обявите, потребителите и търсенето, а Stripe поема най-деликатната част — плащанията — със защитен и съответстващ на изискванията поток, който изгражда доверие и от двете страни на сделката — задължително условие за маркетплейс, през който минават пари между непознати.</p>
<h2>Технологичен стек</h2>
<ul class="stack"><li>React</li><li>Node.js</li><li>Stripe</li></ul>
<h2>Резултатът</h2>
<p>Резултатът е работещ маркетплейс, който обединява превозни средства, имоти и услуги в една платформа, с безплатни обяви и сигурни плащания през Stripe. Продавачите публикуват лесно, търсещите намират каквото им трябва, а сделките се случват сигурно. Проектът е онлайн: <a href="https://tretimart.carbonstealth.eu" target="_blank" rel="noopener">tretimart.carbonstealth.eu</a>.</p>
<h2>Какво можем да направим за вас</h2>
<p>Ако имате наум маркетплейс, платформа с много потребители или онлайн магазин с плащания, можем да я изградим изцяло — от бекенд логиката до интеграцията на плащанията. Разгледайте нашата <a href="/bg/uslugi/ecommerce/">разработка на онлайн магазини</a>, <a href="/bg/uslugi/softuer/">разработката на софтуер по поръчка</a> и <a href="/bg/uslugi/hosting/">управлявания облачен хостинг</a>, които допълват проект като този.</p>""",
   faqs=[
    ("Какво е Трети Март?", "Това е български маркетплейс, изграден от Carbon Stealth за превозни средства, имоти и услуги, с публикуване на обяви, безплатни обяви и сигурни плащания."),
    ("С какви технологии е изграден?", "Фронтенд с React, бекенд с Node.js и плащания през Stripe за сигурни и съответстващи на изискванията транзакции."),
    ("Как работят плащанията?", "Плащанията минават през Stripe, който гарантира сигурни транзакции. Платформата поддържа и публикуване на безплатни обяви."),
    ("Можете ли да изградите маркетплейс или платформа с плащания?", "Да. Изграждаме маркетплейси и платформи с много потребители изцяло — от бекенд логиката до интеграцията на онлайн плащания. Разкажете ни идеята си."),
   ]),
 )),
]

# ── Hub content per language ─────────────────────────────────────
HUB = {
 "it": dict(
   title="Case Studies — Progetti Reali | Carbon Stealth",
   desc="I nostri case study: progetti reali costruiti da Carbon Stealth. Un MMO per browser, un ERP su misura, un sito scolastico multilingua e un marketplace con pagamenti sicuri.",
   h1="Case Studies",
   intro="""<p>Questi sono <strong>progetti reali</strong> che abbiamo progettato e costruito da zero. Ogni case study racconta il problema affrontato, la soluzione tecnica adottata e il risultato online — con lo stack completo e un link al progetto live. Dai un MMO real-time a un ERP gestionale, dal sito istituzionale di una scuola a un marketplace con pagamenti sicuri: coprono l'intero spettro di ciò che sappiamo fare.</p>""",
   cta_p="""<p>Vuoi un progetto come questi? <a href="/contatti/">Raccontaci la tua idea</a> e ti diciamo come possiamo realizzarla.</p>"""),
 "en": dict(
   title="Case Studies — Real Projects | Carbon Stealth",
   desc="Our case studies: real projects built by Carbon Stealth. A browser MMO, a custom ERP, a multilingual school website and a marketplace with secure payments.",
   h1="Case Studies",
   intro="""<p>These are <strong>real projects</strong> we designed and built from scratch. Each case study covers the problem we tackled, the technical solution we chose and the live result — with the full stack and a link to the running project. From a real-time MMO to a business ERP, from a school's institutional site to a marketplace with secure payments: they span the full range of what we do.</p>""",
   cta_p="""<p>Want a project like these? <a href="/en/contact/">Tell us your idea</a> and we'll show you how we can build it.</p>"""),
 "bg": dict(
   title="Кейс Студии — Реални Проекти | Carbon Stealth",
   desc="Нашите кейс студии: реални проекти, изградени от Carbon Stealth. Браузър MMO, ERP по поръчка, многоезичен училищен сайт и маркетплейс със сигурни плащания.",
   h1="Кейс студии",
   intro="""<p>Това са <strong>реални проекти</strong>, които проектирахме и изградихме от нулата. Всяка кейс студия описва проблема, който решихме, техническото решение, което избрахме, и резултата на живо — с пълния стек и връзка към работещия проект. От real-time MMO до бизнес ERP, от институционален сайт на училище до маркетплейс със сигурни плащания: покриват целия спектър на това, което правим.</p>""",
   cta_p="""<p>Искате проект като тези? <a href="/bg/kontakti/">Разкажете ни идеята си</a> и ще ви покажем как можем да я реализираме.</p>"""),
}

# ── Rendering helpers ────────────────────────────────────────────
def esc(s):
    return html.escape(s, quote=True)

def alternates(slug):
    """4 hreflang links for a page (slug=None for the hub)."""
    parts = []
    for l in ("it", "en", "bg"):
        href = f"{BASE}{L[l]['base']}" + (f"{slug}/" if slug else "")
        parts.append(f'<link rel="alternate" hreflang="{l}" href="{href}"/>')
    xdef = f"{BASE}{L['it']['base']}" + (f"{slug}/" if slug else "")
    parts.append(f'<link rel="alternate" hreflang="x-default" href="{xdef}"/>')
    return "".join(parts)

def head(lang, canon, title, desc, slug):
    s = L[lang]
    og = f"{BASE}/{s['og']}"
    return f"""<!DOCTYPE html><html lang="{lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canon}">
{alternates(slug)}
<meta property="og:type" content="{'article' if slug else 'website'}">
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

def author_block():
    return {"@type": "Person", "@id": "https://carbonstealth.eu/#stefan",
            "name": "Stefan Kostadinov", "url": "https://carbonstealth.eu/chi-siamo/",
            "jobTitle": "CEO & Founder",
            "worksFor": {"@type": "Organization", "name": "Carbon Stealth VCC", "url": "https://carbonstealth.eu"}}

def publisher_block():
    return {"@type": "Organization", "name": "Carbon Stealth VCC",
            "logo": {"@type": "ImageObject", "url": "https://carbonstealth.eu/logo.png", "width": 1373, "height": 585}}

def jsonld_page(lang, project, canon, title, desc):
    s = L[lang]
    faqs = project["lang"][lang]["faqs"]
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "Article", "@id": f"{canon}#article", "headline": title,
         "description": desc, "image": f"{BASE}/{s['og']}",
         "datePublished": DATE_ISO, "dateModified": DATE_ISO,
         "author": author_block(), "publisher": publisher_block(),
         "mainEntityOfPage": {"@type": "WebPage", "@id": canon},
         "articleSection": project["section"], "inLanguage": lang},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + (s["prefix"] or "") + "/"},
            {"@type": "ListItem", "position": 2, "name": s["section_name"], "item": BASE + s["base"]},
            {"@type": "ListItem", "position": 3, "name": project["name"], "item": canon}]},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]},
    ]}
    return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "</script>"

def jsonld_hub(lang, canon, title, desc):
    s = L[lang]
    items = []
    for i, p in enumerate(PROJECTS, start=1):
        items.append({"@type": "ListItem", "position": i, "name": p["name"],
                      "url": f"{BASE}{s['base']}{p['slug']}/"})
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "@id": f"{canon}#collection", "name": title,
         "description": desc, "url": canon, "inLanguage": lang,
         "isPartOf": {"@type": "WebSite", "name": "Carbon Stealth VCC", "url": BASE},
         "publisher": publisher_block(),
         "mainEntity": {"@type": "ItemList", "itemListElement": items}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + (s["prefix"] or "") + "/"},
            {"@type": "ListItem", "position": 2, "name": s["section_name"], "item": canon}]},
    ]}
    return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "</script>"

def render_page(lang, project):
    s = L[lang]
    c = project["lang"][lang]
    title = c["title"]
    h1 = title.split("—")[0].strip()
    desc = c["desc"]
    slug = project["slug"]
    canon = f"{BASE}{s['base']}{slug}/"
    faqs = c["faqs"]
    faq_html = "".join(
        f'<div class="faq-item"><div class="faq-q">{esc(q)}</div><div class="faq-a">{esc(a)}</div></div>'
        for q, a in faqs)
    live = project["live"]
    return (
        head(lang, canon, title, desc, slug)
        + jsonld_page(lang, project, canon, title, desc)
        + "\n</head><body>"
        + s["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["tag"]}</div><h1>{esc(h1)}</h1>'
        + f'<a class="live" href="{live}" target="_blank" rel="noopener">{s["live_label"]}: {esc(live.split("//")[1])} &rarr;</a></div></div>'
        + '<div class="w">'
        + c["body"]
        + f'<h2>{s["faq_h2"]}</h2>{faq_html}'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a>'
        + '</div>'
        + s["ft"]
        + "</body></html>\n"
    )

def render_hub(lang):
    s = L[lang]
    h = HUB[lang]
    canon = f"{BASE}{s['base']}"
    cards = []
    for p in PROJECTS:
        c = p["lang"][lang]
        name = c["title"].split("—")[0].strip()
        tags = " &middot; ".join(p["tech"][:5])
        cards.append(
            f'<a class="card" href="{s["base"]}{p["slug"]}/"><h3>{esc(name)}</h3>'
            f'<p>{esc(c["card"])}</p><div class="tags">{tags}</div></a>')
    cards_html = f'<div class="cards">{"".join(cards)}</div>'
    return (
        head(lang, canon, h["title"], h["desc"], None)
        + jsonld_hub(lang, canon, h["title"], h["desc"])
        + "\n</head><body>"
        + s["nav"]
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["hub_tag"]}</div><h1>{esc(h["h1"])}</h1></div></div>'
        + '<div class="w">'
        + h["intro"]
        + cards_html
        + h["cta_p"]
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a>'
        + '</div>'
        + s["ft"]
        + "</body></html>\n"
    )

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def dir_for(lang):
    # filesystem directory for the section (no host, no leading/trailing issues)
    return os.path.join("public", L[lang]["base"].strip("/"))

def write_sitemap():
    urls = []
    for lang in ("it", "en", "bg"):
        base = f"{BASE}{L[lang]['base']}"
        urls.append(base)  # hub
        for p in PROJECTS:
            urls.append(f"{base}{p['slug']}/")
    body = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">'.replace("sitemap.org", "sitemaps.org")]
    for u in urls:
        body.append(f"  <url><loc>{u}</loc><lastmod>{DATE}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>")
    body.append("</urlset>\n")
    write(os.path.join("public", "sitemap-casestudies.xml"), "\n".join(body))
    return len(urls)

def main():
    n = 0
    for lang in ("it", "en", "bg"):
        d = dir_for(lang)
        write(os.path.join(d, "index.html"), render_hub(lang))
        n += 1
        for p in PROJECTS:
            write(os.path.join(d, p["slug"], "index.html"), render_page(lang, p))
            n += 1
    total_urls = write_sitemap()
    print(f"wrote {n} HTML pages (3 hubs + {len(PROJECTS)}x3 case studies)")
    print(f"wrote public/sitemap-casestudies.xml with {total_urls} URLs")

if __name__ == "__main__":
    main()
