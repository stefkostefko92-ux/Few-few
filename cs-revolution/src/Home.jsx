import React, { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════
// Homepage — "Carbon & Chrome" (docs/DESIGN-CARBON-CHROME.md).
// Styles live in public/home.css (render-blocking, shared with the
// instant-paint hero in index.html). App.jsx keeps the state: language,
// contact form, consent, SEO; this file is only markup and copy.
// Every fact here is real: projects are live, prices come from
// src/pricing.json, no invented stats.
// ═══════════════════════════════════════════════════════════════

var PROJECTS = [
  { slug: "panev-ascensori", name: "Panev Ascensori", host: "panevascensori.it",
    d: { it: "Staffe brevettate per ascensori", en: "Patented lift brackets", bg: "Патентовани скоби за асансьори" } },
  { slug: "erp-ascensori", name: "ERP Ascensori", host: "erp.carbonstealth.eu",
    d: { it: "Gestionale per un'azienda di ascensori", en: "ERP for a lift company", bg: "ERP за фирма за асансьори" } },
  { slug: "evanita-sport", name: "Evanita Sport", host: "evanita-bg.com",
    d: { it: "Sito di uno studio di Kangoo Jumps", en: "Website of a Kangoo Jumps studio", bg: "Сайт на студио за Kangoo Jumps" } },
  { slug: "treti-mart", name: "Treti Mart", host: "tretimart.carbonstealth.eu",
    d: { it: "Marketplace bulgaro con annunci e pagamenti", en: "Bulgarian marketplace with listings and payments", bg: "Български маркетплейс с обяви и плащания" } },
  { slug: "eternal-touch", name: "Eternal Touch", host: "eternaltouch.it",
    d: { it: "Atelier di calchi in gesso", en: "Plaster casting atelier", bg: "Ателие за гипсови отливки" } },
  { slug: "ou-vaptsarov", name: "ОУ „Н. Вапцаров“", host: "ouvaptsarov.com",
    d: { it: "Sito di una scuola bulgara", en: "Website of a Bulgarian school", bg: "Сайт на основно училище" } },
  { slug: "ospedali-trasparenti", name: "Ospedali Trasparenti", host: "ospedalitrasparenti.it",
    d: { it: "Dati pubblici sugli ospedali italiani", en: "Public data on Italian hospitals", bg: "Публични данни за италианските болници" } },
  { slug: "nexus-dominion", name: "Nexus Dominion", host: "nexus.carbonstealth.eu",
    d: { it: "Gioco di ruolo online nel browser", en: "Online role-playing game in the browser", bg: "Онлайн ролева игра в браузъра" } },
  { slug: "vizitka", name: "Vizitka", host: "vizitka-bg.com",
    d: { it: "Biglietto da visita digitale con QR", en: "Digital business card with a QR code", bg: "Дигитална визитка с QR код" } },
  { slug: "mastilko", name: "Мастилко", host: "mastilko-bg.com",
    d: { it: "Etichette e biglietti da stampare, gratis", en: "Free printable labels and cards", bg: "Безплатни етикети и визитки за печат" } },
];
// the project the hero opens on: the closest match to each audience
var FIRST = { it: 0, en: 7, bg: 2 };

var SERVICES = {
  it: [
    ["Siti web", "Siti aziendali, landing page e portali, veloci e facili da aggiornare.", "/servizi/sviluppo-siti-web/"],
    ["E-commerce", "Negozi online con pagamento con carta, magazzino e fatture pronte per l'IVA UE.", "/servizi/ecommerce/"],
    ["Software su misura", "Programmi che eliminano il lavoro ripetitivo e collegano i sistemi che usi già.", "/servizi/sviluppo-software/"],
    ["ERP", "Un gestionale per magazzino, clienti, contabilità e produzione, costruito sui tuoi processi.", "/servizi/erp/"],
    ["App mobile", "App per iOS e Android, dal progetto alla pubblicazione negli store.", "/servizi/app-mobile/"],
    ["SEO, GEO e AEO", "Farti trovare su Google e nelle risposte di ChatGPT, Gemini e Perplexity.", "/servizi/seo/"],
    ["Hosting e manutenzione", "Server in UE, SSL, backup e aggiornamenti: ce ne occupiamo noi.", "/servizi/hosting/"],
  ],
  en: [
    ["Websites", "Company sites, landing pages and portals that load fast and are easy to update.", "/en/services/web-development/"],
    ["E-commerce", "Online shops with card payments, stock management and invoices ready for EU VAT.", "/en/services/ecommerce/"],
    ["Custom software", "Tools that remove repetitive work and connect the systems you already use.", "/en/services/software-development/"],
    ["ERP", "One system for stock, customers, accounting and production, built around how you work.", "/en/services/erp/"],
    ["Mobile apps", "iOS and Android apps, from the first sketch to publishing in the stores.", "/en/services/mobile-apps/"],
    ["SEO, GEO and AEO", "Getting found on Google and in the answers of ChatGPT, Gemini and Perplexity.", "/en/services/seo/"],
    ["Hosting and maintenance", "EU servers, SSL, backups and updates: we look after them.", "/en/services/hosting/"],
  ],
  bg: [
    ["Уебсайтове", "Фирмени сайтове, лендинг страници и портали, бързи и лесни за обновяване.", "/bg/uslugi/web-razrabotka/"],
    ["Онлайн магазини", "Магазини с плащане с карта, склад и фактури, готови за ДДС в ЕС.", "/bg/uslugi/ecommerce/"],
    ["Софтуер по поръчка", "Програми, които махат повтарящата се работа и свързват системите, които вече ползвате.", "/bg/uslugi/softuer/"],
    ["ERP системи", "Една система за склад, клиенти, счетоводство и производство, направена по вашите процеси.", "/bg/uslugi/erp/"],
    ["Мобилни приложения", "Приложения за iOS и Android, от първата скица до публикуването в магазините.", "/bg/uslugi/mobilni-prilozheniya/"],
    ["SEO, GEO и AEO", "Да ви намират в Google и в отговорите на ChatGPT, Gemini и Perplexity.", "/bg/uslugi/seo/"],
    ["Хостинг и поддръжка", "Сървъри в ЕС, SSL, резервни копия и обновления: грижим се ние.", "/bg/uslugi/hosting/"],
  ],
};

var PRODUCTS = [
  { name: "Supreme Bot", url: "https://supremebot.carbonstealth.eu",
    d: { it: "Bot Discord per ticket e piattaforma SaaS: moduli di candidatura, pannelli, bot white-label e AI.", en: "Discord ticket bot and SaaS platform: application forms, panels, white-label bots and AI.", bg: "Discord бот за тикети и SaaS платформа: формуляри за кандидатстване, панели, white-label ботове и AI." } },
  { name: "Supreme AdBlock", url: "https://adblock.carbonstealth.eu",
    d: { it: "Estensione Chrome che blocca pubblicità e tracker, anche su YouTube. Nessuna telemetria.", en: "Chrome extension that blocks ads and trackers, YouTube included. No telemetry.", bg: "Chrome разширение, което блокира реклами и тракери, включително в YouTube. Без телеметрия." } },
  { name: "За Бобов дол", url: "https://zabobovdol.carbonstealth.eu",
    d: { it: "Portale civico della città di Bobov Dol: servizi, segnalazioni e trasparenza.", en: "Civic portal for the town of Bobov Dol: services, reports and transparency.", bg: "Граждански портал за Бобов дол: услуги, сигнали и прозрачност." } },
  { name: "FiveM Bulgaria", url: "https://fivembulgaria.carbonstealth.eu",
    d: { it: "Tutti i server FiveM RP bulgari in un posto, con stato e giocatori aggiornati da soli.", en: "Every Bulgarian FiveM RP server in one place, with status and players updated automatically.", bg: "Всички български FiveM RP сървъри на едно място, със статус и играчи, обновявани автоматично." } },
];

var FAQ = {
  it: [
    ["Quali servizi offre Carbon Stealth VCC?", "Siti web, e-commerce, software su misura, sistemi ERP, app mobile, SEO/GEO/AEO e hosting gestito. Facciamo anche reverse engineering e stampa 3D di parti e prototipi."],
    ["Dove si trova Carbon Stealth VCC?", "La sede è a Bobov Dol, in Bulgaria (EIK 208725180, ul. Samuil 3, 2670). Lavoriamo da remoto con clienti in Italia, Bulgaria e nel resto dell'Unione Europea."],
    ["In quali lingue lavorate?", "Italiano, inglese e bulgaro. Comunicazione e consegne del progetto possono essere in una qualsiasi di queste tre lingue."],
    ["Quanto tempo serve per un progetto?", "Landing page e siti aziendali: 2-3 settimane. E-commerce: 3-5 settimane. Software su misura ed ERP: 2-6 mesi, in base al perimetro. Rispondiamo al preventivo entro 24 ore."],
    ["Offrite assistenza dopo la consegna?", "Sì. Hosting gestito da 13 € al mese + IVA, monitoraggio SEO/AEO da 242 € al mese + IVA e contratti di manutenzione su misura."],
    ["Qual è il budget minimo?", "Siti da 658 € + IVA, e-commerce da 1.825 € + IVA, software su misura da 2.000 €, ERP da 5.000 €, app mobile da 3.000 €. Il preventivo è gratuito."],
  ],
  en: [
    ["What does Carbon Stealth VCC do?", "Websites, e-commerce, custom software, ERP systems, mobile apps, SEO/GEO/AEO and managed hosting. We also do reverse engineering and 3D printing of parts and prototypes."],
    ["Where is Carbon Stealth VCC based?", "In Bobov Dol, Bulgaria (EIK 208725180, ul. Samuil 3, 2670). We work remotely with clients in Italy, Bulgaria and the rest of the European Union."],
    ["Which languages do you work in?", "Italian, English and Bulgarian. Communication and project deliverables can be in any of the three."],
    ["How long does a project take?", "Landing pages and company websites: 2-3 weeks. E-commerce: 3-5 weeks. Custom software and ERP: 2-6 months depending on scope. We reply to quote requests within 24 hours."],
    ["Do you offer support after launch?", "Yes. Managed hosting from €13 a month + VAT, SEO/AEO monitoring from €242 a month + VAT, and maintenance contracts built around your needs."],
    ["What is the minimum budget?", "Websites from €658 + VAT, e-commerce from €1,825 + VAT, custom software from €2,000, ERP from €5,000, mobile apps from €3,000. Quotes are free."],
  ],
  bg: [
    ["С какво се занимава Carbon Stealth VCC?", "Уебсайтове, онлайн магазини, софтуер по поръчка, ERP системи, мобилни приложения, SEO/GEO/AEO и управляван хостинг. Правим и reverse engineering и 3D печат на части и прототипи."],
    ["Къде се намира Carbon Stealth VCC?", "В Бобов дол (ЕИК 208725180, ул. Самуил 3, 2670). Работим дистанционно с клиенти в България, Италия и останалата част от ЕС."],
    ["На какви езици работите?", "Български, английски и италиански. Комуникацията и материалите по проекта могат да са на всеки от трите."],
    ["Колко време отнема един проект?", "Лендинг и фирмен сайт: 2-3 седмици. Онлайн магазин: 3-5 седмици. Софтуер по поръчка и ERP: 2-6 месеца според обхвата. Отговаряме на запитване за оферта до 24 часа."],
    ["Поддържате ли сайта след пускането?", "Да. Управляван хостинг от 15 € на месец с ДДС, SEO/AEO наблюдение от 290 € на месец с ДДС и договори за поддръжка според нуждите."],
    ["Какъв е минималният бюджет?", "Сайт от 790 € с ДДС, онлайн магазин от 2 190 € с ДДС, софтуер по поръчка от 2 000 €, ERP от 5 000 €, мобилно приложение от 3 000 €. Офертата е безплатна."],
  ],
};

var COPY = {
  it: {
    skip: "Salta al contenuto",
    nav: [["Lavori", "#work"], ["Servizi", "#services"], ["Prezzi", "#pricing"], ["Chi siamo", "#about"], ["Contatti", "#contact"]],
    quote: "Chiedi un preventivo", prices: "Vedi i prezzi", open: "Apri il menu", close: "Chiudi il menu",
    h1: "Siti web, e-commerce e software per aziende in Italia e Bulgaria",
    lede: "Progettiamo, sviluppiamo e gestiamo il tuo sito o il tuo gestionale. Prezzo fisso, codice di tua proprietà, assistenza in italiano.",
    factA: "Siti da", factB: "+ IVA, online in 5-7 giorni lavorativi.",
    show: "Mostra", visit: "Apri il sito",
    workH: "Lavori online adesso", workP: "Dieci progetti che puoi aprire e provare: siti aziendali, negozi, gestionali e piattaforme.",
    workAll: "Tutto il portfolio su portfolio.carbonstealth.eu",
    srvH: "Cosa facciamo", srvP: "Ogni servizio ha una pagina con prezzi, tempi ed esempi.",
    also: "Facciamo anche reverse engineering e stampa 3D di parti, giochi per browser e risorse FiveM, integrazioni API e audit di sicurezza.", alsoLink: "Scrivici",
    vatWord: "+ IVA", fullList: "Listino completo, IVA e condizioni", from: "Sul mercato",
    aboutH: "Uno studio piccolo, con clienti in due paesi",
    aboutP: ["Carbon Stealth è uno studio di sviluppo con sede a Bobov Dol, in Bulgaria. Lavoriamo da remoto con aziende italiane e bulgare.", "Parli direttamente con chi scrive il codice. Il codice e il dominio restano tuoi, e i prezzi sono pubblici prima ancora di chiamarci."],
    facts: [["10", "progetti online, da aprire e provare"], ["3", "lingue di lavoro: italiano, inglese e bulgaro"], ["24", "ore al massimo per rispondere a un preventivo"]],
    prodH: "Prodotti nostri", prodP: "Piattaforme che abbiamo costruito e che gestiamo noi.",
    faqH: "Domande frequenti",
    cH: "Raccontaci il progetto", cP: "Scrivi cosa ti serve: rispondiamo entro 24 ore con un preventivo a prezzo fisso.",
    fName: "Nome e cognome", fEmail: "Email", fPhone: "Telefono (facoltativo)", fMsg: "Il tuo progetto",
    fSend: "Invia la richiesta", fSending: "Invio in corso…", fSent: "Richiesta inviata. Ti rispondiamo entro 24 ore.",
    fErr: "Invio non riuscito. Riprova oppure scrivici a info@carbonstealth.eu.",
    fGdpr: "Usiamo i tuoi dati solo per rispondere alla richiesta.", privacy: "Informativa privacy",
    dWa: "WhatsApp", dPhone: "Telefono Bulgaria", dMail: "Email",
    ftDesc: "Studio di sviluppo web e software. Sede a Bobov Dol, clienti in Italia, Bulgaria e UE.",
    ftSrv: "Servizi", ftStudio: "Studio", ftRes: "Risorse", ftLegal: "Legale",
    studio: [["Chi siamo", "#about"], ["Lavori", "#work"], ["Prezzi", "/prezzi/"], ["Blog", "/blog/"], ["Aree servite", "/geo/"], ["Analisi gratuita del sito", "/test/"]],
    res: [["Case study", "/case-study/"], ["Glossario", "/glossario/"], ["Confronti", "/confronti/"], ["Soluzioni per settore", "/settori/"], ["Strumenti gratis", "/strumenti/"]],
    legal: [["Privacy", "/privacy/"], ["Cookie", "/cookie/"], ["Termini", "/termini/"], ["Note legali", "/note-legali/"], ["Stato dei servizi", "/status/"]],
    review: "Lascia una recensione su Google",
    consentMore: "Politica cookie",
  },
  en: {
    skip: "Skip to content",
    nav: [["Work", "#work"], ["Services", "#services"], ["Pricing", "#pricing"], ["About", "#about"], ["Contact", "#contact"]],
    quote: "Request a quote", prices: "See the prices", open: "Open menu", close: "Close menu",
    h1: "Websites, e-commerce and software for companies in Italy and Bulgaria",
    lede: "We design, build and run your website or business software. Fixed price, code that belongs to you, support in English, Italian or Bulgarian.",
    factA: "Websites from", factB: "+ VAT, live in 5-7 working days.",
    show: "Show", visit: "Open the site",
    workH: "Live right now", workP: "Ten projects you can open and try: company sites, shops, business software and platforms.",
    workAll: "Full portfolio at portfolio.carbonstealth.eu",
    srvH: "What we do", srvP: "Each service has its own page with prices, timelines and examples.",
    also: "We also do reverse engineering and 3D printing of parts, browser games and FiveM resources, API integrations and security audits.", alsoLink: "Write to us",
    vatWord: "+ VAT", fullList: "Full price list, VAT and terms", from: "Market price",
    aboutH: "A small studio with clients in two countries",
    aboutP: ["Carbon Stealth is a development studio based in Bobov Dol, Bulgaria. We work remotely with companies in Italy and Bulgaria.", "You talk directly to the people who write the code. The code and the domain stay yours, and our prices are public before you ever call us."],
    facts: [["10", "live projects you can open and try"], ["3", "working languages: English, Italian and Bulgarian"], ["24", "hours at most to answer a quote request"]],
    prodH: "Our own products", prodP: "Platforms we built and run ourselves.",
    faqH: "Questions and answers",
    cH: "Tell us about your project", cP: "Write what you need: we reply within 24 hours with a fixed-price quote.",
    fName: "Full name", fEmail: "Email", fPhone: "Phone (optional)", fMsg: "Your project",
    fSend: "Send the request", fSending: "Sending…", fSent: "Request sent. We will reply within 24 hours.",
    fErr: "The request was not sent. Try again or email info@carbonstealth.eu.",
    fGdpr: "We use your details only to answer your request.", privacy: "Privacy policy",
    dWa: "WhatsApp", dPhone: "Phone in Bulgaria", dMail: "Email",
    ftDesc: "Web and software development studio. Based in Bobov Dol, with clients in Italy, Bulgaria and the EU.",
    ftSrv: "Services", ftStudio: "Studio", ftRes: "Resources", ftLegal: "Legal",
    studio: [["About", "#about"], ["Work", "#work"], ["Pricing", "/en/pricing/"], ["Blog", "/en/blog/"], ["Service areas", "/en/geo/"], ["Free site analysis", "/en/test/"]],
    res: [["Case studies", "/en/case-studies/"], ["Glossary", "/en/glossary/"], ["Comparisons", "/en/comparisons/"], ["Solutions by industry", "/en/industries/"], ["Free tools", "/en/tools/"]],
    legal: [["Privacy", "/en/privacy/"], ["Cookies", "/en/cookie/"], ["Terms", "/en/terms/"], ["Legal notice", "/en/legal-notice/"], ["Service status", "/status/"]],
    review: "Leave a review on Google",
    consentMore: "Cookie policy",
  },
  bg: {
    skip: "Към съдържанието",
    nav: [["Проекти", "#work"], ["Услуги", "#services"], ["Цени", "#pricing"], ["За нас", "#about"], ["Контакти", "#contact"]],
    quote: "Поискайте оферта", prices: "Вижте цените", open: "Отвори менюто", close: "Затвори менюто",
    h1: "Уебсайтове, онлайн магазини и софтуер за фирми в България и Италия",
    lede: "Проектираме, изработваме и поддържаме вашия сайт или фирмен софтуер. Фиксирана цена, кодът е ваш, поддръжка на български.",
    factA: "Сайт от", factB: "с ДДС, готов за 5-7 работни дни.",
    show: "Покажи", visit: "Отвори сайта",
    workH: "Проекти, които работят в момента", workP: "Десет проекта, които можете да отворите и пробвате: фирмени сайтове, магазини, ERP и платформи.",
    workAll: "Цялото портфолио на portfolio.carbonstealth.eu",
    srvH: "Какво правим", srvP: "Всяка услуга има своя страница с цени, срокове и примери.",
    also: "Правим също reverse engineering и 3D печат на части, браузър игри и FiveM ресурси, интеграции с API и одити за сигурност.", alsoLink: "Пишете ни",
    vatWord: "с ДДС", fullList: "Пълен ценоразпис, ДДС и условия", from: "Пазарна цена",
    aboutH: "Малко студио с клиенти в две държави",
    aboutP: ["Carbon Stealth е студио за разработка на софтуер от Бобов дол. Работим дистанционно с фирми в България и Италия.", "Говорите директно с хората, които пишат кода. Кодът и домейнът остават ваши, а цените ни са публични, преди изобщо да ни се обадите."],
    facts: [["10", "проекта онлайн, които можете да отворите"], ["3", "работни езика: български, английски и италиански"], ["24", "часа най-много за отговор на запитване"]],
    prodH: "Наши продукти", prodP: "Платформи, които направихме и поддържаме сами.",
    faqH: "Въпроси и отговори",
    cH: "Разкажете ни за проекта", cP: "Напишете какво ви трябва: отговаряме до 24 часа с оферта на фиксирана цена.",
    fName: "Име и фамилия", fEmail: "Имейл", fPhone: "Телефон (по желание)", fMsg: "Вашият проект",
    fSend: "Изпратете запитването", fSending: "Изпращане…", fSent: "Запитването е изпратено. Ще ви отговорим до 24 часа.",
    fErr: "Запитването не е изпратено. Опитайте пак или пишете на info@carbonstealth.eu.",
    fGdpr: "Използваме данните ви само за да отговорим на запитването.", privacy: "Политика за поверителност",
    dWa: "WhatsApp", dPhone: "Телефон в България", dMail: "Имейл",
    ftDesc: "Студио за уеб и софтуерна разработка от Бобов дол, с клиенти в България, Италия и ЕС.",
    ftSrv: "Услуги", ftStudio: "Студио", ftRes: "Ресурси", ftLegal: "Правна информация",
    studio: [["За нас", "#about"], ["Проекти", "#work"], ["Цени", "/bg/ceni/"], ["Блог", "/bg/blog/"], ["Обслужвани райони", "/bg/geo/"], ["Безплатен анализ на сайт", "/bg/test/"]],
    res: [["Кейс стъди", "/bg/keys-studii/"], ["Речник", "/bg/rechnik/"], ["Сравнения", "/bg/sravneniya/"], ["Решения по бранш", "/bg/branshove/"], ["Безплатни инструменти", "/bg/instrumenti/"]],
    legal: [["Поверителност", "/bg/privacy/"], ["Бисквитки", "/bg/cookie/"], ["Условия", "/bg/usloviya/"], ["Правни данни", "/bg/imprint/"], ["Статус на услугите", "/status/"]],
    review: "Оставете отзив в Google",
    consentMore: "Политика за бисквитки",
  },
};

// "658 €" → Bodoni digits + the € as a sans unit (see .num/.cur in home.css)
function Money(props) {
  var s = props.fmt(props.n, props.lang), m = s.match(/^(.*?)\s*€$/);
  return m ? <><span className="num">{m[1]}</span><span className="cur">{"\u00a0€"}</span></> : <span className="num">{s}</span>;
}
// keep hyphenated words (e-commerce) on one line in headlines
function nobr(t) {
  return t.split(/(\S*-\S*)/).map(function (x, i) { return /-/.test(x) ? <span key={i} className="nobr">{x}</span> : x; });
}

function shot(slug, w) { return "/work/" + slug + (w === 480 ? "-480" : "") + ".webp"; }

export default function Home(p) {
  var lang = p.lang, c = COPY[lang] || COPY.it, P = p.PRICING, ui = P.ui[lang], fmt = p.fmtEur;
  var [cur, setCur] = useState(FIRST[lang] || 0);
  var [swap, setSwap] = useState(false);
  useEffect(function () { setCur(FIRST[lang] || 0); }, [lang]);
  var pr = PROJECTS[cur];

  function pick(i) {
    if (i === cur) return;
    setSwap(true);
    setTimeout(function () { setCur(i); setSwap(false); }, 180);
  }
  function go(e, href) {
    if (href.charAt(0) !== "#") return;
    e.preventDefault(); p.setMobileMenu(false);
    var el = document.querySelector(href);
    if (el) { el.scrollIntoView(); el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
  }
  var langs = <div className="h-lang" role="group" aria-label="Language">{["it", "en", "bg"].map(function (l) {
    return <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={function () { p.setLang(l); p.setMobileMenu(false); }}>{l.toUpperCase()}</button>;
  })}</div>;
  var start = P.tiers[0];

  return (
    <div className="cs-home">
      <a href="#main" className="cs-skip">{c.skip}</a>

      <header className="h-nav">
        <div className="wrap">
          <a className="h-logo" href={lang === "it" ? "/" : "/?lang=" + lang} aria-label="Carbon Stealth VCC">
            <img src="/logo-nav.webp" alt="Carbon Stealth VCC" width={80} height={34} fetchpriority="high" decoding="async" />
          </a>
          <nav aria-label={lang === "bg" ? "Основна навигация" : lang === "en" ? "Main navigation" : "Navigazione principale"}>
            <ul className="h-links">{c.nav.map(function (n) { return <li key={n[1]}><a href={n[1]} onClick={function (e) { go(e, n[1]); }}>{n[0]}</a></li>; })}</ul>
          </nav>
          <div className="h-end">
            {langs}
            <a className="btn btn-primary" href="#contact" onClick={function (e) { go(e, "#contact"); }}>{c.quote}</a>
            <button type="button" className="h-burger" aria-expanded={p.mobileMenu} aria-controls="h-menu" aria-label={c.open} onClick={function () { p.setMobileMenu(true); }}><span /><span /><span /></button>
          </div>
        </div>
      </header>

      <div id="h-menu" className={"h-menu" + (p.mobileMenu ? " open" : "")} role="dialog" aria-modal="true" aria-label={c.open} hidden={!p.mobileMenu}>
        <div className="h-menu-top">
          <img src="/logo-nav.webp" alt="" width={80} height={34} />
          <button type="button" className="h-burger" style={{ display: "block" }} aria-label={c.close} onClick={function () { p.setMobileMenu(false); }}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
        </div>
        {c.nav.map(function (n) { return <a key={n[1]} className="h-menu-link" href={n[1]} onClick={function (e) { go(e, n[1]); }}>{n[0]}</a>; })}
        <a className="btn btn-primary" href="#contact" onClick={function (e) { go(e, "#contact"); }}>{c.quote}</a>
        {langs}
      </div>

      <main id="main">
        <section className="h-hero" aria-labelledby="h-title">
          <div className="wrap">
            <div>
              <h1 id="h-title" className="h-h1">{nobr(c.h1)}</h1>
              <p className="h-lede">{c.lede}</p>
              <div className="h-actions">
                <a className="btn btn-primary" href="#contact" onClick={function (e) { go(e, "#contact"); }}>{c.quote}</a>
                <a className="btn btn-quiet" href="#pricing" onClick={function (e) { go(e, "#pricing"); }}>{c.prices}</a>
              </div>
              <p className="h-fact">{c.factA} <Money n={start.price[lang]} lang={lang} fmt={fmt} /> {c.factB}</p>
            </div>
            <figure className="h-stage" style={{ margin: 0 }}>
              <a className="bezel" href={"https://" + pr.host} target="_blank" rel="noopener" aria-label={c.visit + ": " + pr.name} style={{ display: "block" }}>
                <img className={"h-screen" + (swap ? " swap" : "")} src={shot(pr.slug)} srcSet={shot(pr.slug, 480) + " 480w, " + shot(pr.slug) + " 960w"}
                  sizes="(max-width:900px) 92vw, 680px" width={960} height={600} alt={pr.name + ": " + pr.d[lang]} fetchpriority="high" decoding="async" />
              </a>
              <figcaption><span><b>{pr.name}</b>, {pr.d[lang].charAt(0).toLowerCase() + pr.d[lang].slice(1)}</span><span>{pr.host}</span></figcaption>
              <div className="h-thumbs" role="group" aria-label={c.workH}>
                {PROJECTS.map(function (x, i) {
                  return <button key={x.slug} type="button" aria-pressed={i === cur} aria-label={c.show + ": " + x.name} onClick={function () { pick(i); }}>
                    <img src={shot(x.slug, 480)} alt="" width={76} height={48} loading="lazy" decoding="async" />
                  </button>;
                })}
              </div>
            </figure>
          </div>
        </section>

        <section id="work" className="h-sec" aria-labelledby="work-h">
          <div className="wrap">
            <div className="h-sec-head"><h2 id="work-h" className="h-h2">{c.workH}</h2><p className="h-intro">{c.workP}</p></div>
            <div className="h-work">
              {PROJECTS.map(function (x) {
                return <a key={x.slug} className="h-proj" href={"https://" + x.host} target="_blank" rel="noopener">
                  <div className="bezel"><img src={shot(x.slug, 480)} srcSet={shot(x.slug, 480) + " 480w, " + shot(x.slug) + " 960w"} sizes="(max-width:720px) 92vw, 560px" width={480} height={300} loading="lazy" decoding="async" alt={x.name + ": " + x.d[lang]} /></div>
                  <div className="h-proj-meta"><div><h3 className="h-h3">{x.name}</h3><p>{x.d[lang]}</p></div><span>{x.host}</span></div>
                </a>;
              })}
            </div>
            <p className="h-more"><a className="link" href="https://portfolio.carbonstealth.eu/" target="_blank" rel="noopener">{c.workAll}</a></p>
          </div>
        </section>

        <section id="services" className="h-sec" aria-labelledby="srv-h">
          <div className="wrap">
            <div className="h-sec-head"><h2 id="srv-h" className="h-h2">{c.srvH}</h2><p className="h-intro">{c.srvP}</p></div>
            <ul className="h-srv">{SERVICES[lang].map(function (s) {
              return <li key={s[2]}><a href={s[2]}><h3 className="h-h3">{s[0]}</h3><p>{s[1]}</p></a></li>;
            })}</ul>
            <p className="h-also">{c.also} <a className="link" href="#contact" onClick={function (e) { go(e, "#contact"); }}>{c.alsoLink}</a>.</p>
          </div>
        </section>

        <section id="pricing" className="h-sec" aria-labelledby="price-h">
          <div className="wrap">
            <div className="h-sec-head"><h2 id="price-h" className="h-h2">{ui.h1}</h2><p className="h-intro">{ui.lede}</p></div>
            <div className="h-plans">
              {P.tiers.map(function (tier) {
                return <article key={tier.id} className={"h-plan" + (tier.popular ? " pop" : "")} aria-labelledby={"plan-" + tier.id}>
                  <div className="h-plan-top"><h3 id={"plan-" + tier.id} className="h-h3">{tier.name[lang]}</h3>{tier.popular && <span className="h-pop">{ui.popular}</span>}</div>
                  <p className="h-plan-tag">{tier.tag[lang]}</p>
                  <div className="h-price"><span><Money n={tier.price[lang]} lang={lang} fmt={fmt} /></span><small>{c.vatWord}</small></div>
                  <p className="h-market">{c.from} <s>{fmt(tier.market[lang], lang)}</s>, {tier.discount}% {ui.saving}</p>
                  <p className="h-desc">{tier.desc[lang]}</p>
                  <ul>{tier.features[lang].map(function (f) { return <li key={f}>{f.replace(/ · /g, ", ")}</li>; })}</ul>
                  <p className="h-days">{ui.delivery}: {tier.days[0]}-{tier.days[1]} {ui.days}</p>
                  <a className={"btn " + (tier.popular ? "btn-primary" : "btn-quiet")} href="#contact" onClick={function (e) { go(e, "#contact"); }}>{ui.choose}</a>
                </article>;
              })}
            </div>
            <div className="h-addons">
              <h3 className="h-h3">{ui.addonsTitle}</h3>
              {P.addons.map(function (a) {
                return <div key={a.id} className="h-addon"><span>{a.name[lang]}</span><b>{fmt(a.price[lang], lang)}<small>{a.kind === "monthly" ? ui.monthly : ui.once}</small></b></div>;
              })}
            </div>
            <p className="h-vat">{ui.vatNote.replace(/ · /g, ". ")}. <a className="link" href={ui.path}>{c.fullList}</a></p>
          </div>
        </section>

        <section id="about" className="h-sec" aria-labelledby="about-h">
          <div className="wrap h-about">
            <div><h2 id="about-h" className="h-h2">{c.aboutH}</h2>{c.aboutP.map(function (t, i) { return <p key={i}>{t}</p>; })}</div>
            <dl className="h-facts">{c.facts.map(function (f) { return <div key={f[0]}><dt className="num">{f[0]}</dt><dd>{f[1]}</dd></div>; })}</dl>
          </div>
        </section>

        <section id="products" className="h-sec" aria-labelledby="prod-h">
          <div className="wrap">
            <div className="h-sec-head"><h2 id="prod-h" className="h-h2">{c.prodH}</h2><p className="h-intro">{c.prodP}</p></div>
            <ul className="h-prods">{PRODUCTS.map(function (x) {
              return <li key={x.url}><a className="link" href={x.url} target="_blank" rel="noopener">{x.name}</a><p>{x.d[lang]}</p></li>;
            })}</ul>
          </div>
        </section>

        <section id="faq" className="h-sec" aria-labelledby="faq-h">
          <div className="wrap">
            <h2 id="faq-h" className="h-h2" style={{ marginBottom: 24 }}>{c.faqH}</h2>
            <div className="h-faq" itemScope itemType="https://schema.org/FAQPage">
              {FAQ[lang].map(function (q, i) {
                return <details key={i} itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                  <summary itemProp="name">{q[0]}</summary>
                  <div itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer"><p itemProp="text">{q[1]}</p></div>
                </details>;
              })}
            </div>
          </div>
        </section>

        <section id="contact" className="h-sec" aria-labelledby="contact-h">
          <div className="wrap h-contact">
            <div>
              <h2 id="contact-h" className="h-h2">{c.cH}</h2>
              <p className="muted">{c.cP}</p>
              <ul className="h-direct">
                <li><span>{c.dWa}</span><a className="link" href="https://wa.me/393792969699">+39 379 296 9699</a></li>
                <li><span>{c.dPhone}</span><a className="link" href="tel:+359877414874">+359 877 414 874</a></li>
                <li><span>{c.dMail}</span><a className="link" href="mailto:info@carbonstealth.eu">info@carbonstealth.eu</a></li>
              </ul>
            </div>
            {p.formSent === "ok" ? (
              <div className="h-alert ok" role="status">{c.fSent}</div>
            ) : (
              <form className="h-form" onSubmit={function (e) { e.preventDefault(); p.onSubmit(); }}>
                <label>{c.fName}<input value={p.formName} onChange={function (e) { p.setFormName(e.target.value); }} autoComplete="name" required /></label>
                <label>{c.fEmail}<input type="email" value={p.formEmail} onChange={function (e) { p.setFormEmail(e.target.value); }} autoComplete="email" required /></label>
                <label className="full">{c.fPhone}<input type="tel" value={p.formPhone} onChange={function (e) { p.setFormPhone(e.target.value); }} autoComplete="tel" /></label>
                <label className="full">{c.fMsg}<textarea value={p.formMsg} onChange={function (e) { p.setFormMsg(e.target.value); }} rows={5} required /></label>
                {p.formSent === "error" && <div className="h-alert err" role="alert">{c.fErr}</div>}
                <p className="h-note full">{c.fGdpr} <a className="link" href={lang === "bg" ? "/bg/privacy/" : lang === "en" ? "/en/privacy/" : "/privacy/"}>{c.privacy}</a>.</p>
                <button type="submit" className="btn btn-primary" disabled={p.formSent === "sending"}>{p.formSent === "sending" ? c.fSending : c.fSend}</button>
              </form>
            )}
          </div>
        </section>
      </main>

      <footer className="h-foot">
        <div className="wrap">
          <div className="h-foot-grid">
            <div className="h-foot-brand">
              <img src="/brand/cs-logo-480.webp" alt="Carbon Stealth VCC" width={96} height={96} loading="lazy" decoding="async" />
              <p>{c.ftDesc}</p>
            </div>
            <div><h2>{c.ftSrv}</h2><ul>{SERVICES[lang].map(function (s) { return <li key={s[2]}><a href={s[2]}>{s[0]}</a></li>; })}</ul></div>
            <div><h2>{c.ftStudio}</h2><ul>{c.studio.map(function (s) { return <li key={s[1]}><a href={s[1]} onClick={function (e) { go(e, s[1]); }}>{s[0]}</a></li>; })}</ul></div>
            <div><h2>{c.ftRes}</h2><ul>{c.res.map(function (s) { return <li key={s[1]}><a href={s[1]}>{s[0]}</a></li>; })}</ul></div>
            <div><h2>{c.ftLegal}</h2><ul>{c.legal.map(function (s) { return <li key={s[1]}><a href={s[1]}>{s[0]}</a></li>; })}</ul></div>
          </div>
          <div className="h-foot-bottom">
            <span>© 2025-2026 Carbon Stealth VCC, EIK 208725180, ul. Samuil 3, Bobov Dol 2670, Bulgaria</span>
            <a href="https://share.google/0XLOlO0r1ETbGpUkZ" target="_blank" rel="noopener">{c.review}</a>
          </div>
        </div>
      </footer>

      <a className={"h-wa" + (p.cookieOk ? "" : " up")} href="https://wa.me/393792969699" target="_blank" rel="noopener" aria-label="WhatsApp">
        <svg width="30" height="30" viewBox="0 0 32 32" fill="#fff" aria-hidden="true"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.6 1.4 5.7 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7.7.7-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.5-9.9 10-9.9s10 4.4 10 9.9-4.5 10.2-9.9 10.2zm5.5-7.4c-.3-.2-1.8-.9-2-.9-.3-.1-.5-.2-.7.2-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.2-.2.2-.3.3-.5.1-.2.1-.4 0-.5-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.2 4.6.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.2-.6-.4z" /></svg>
      </a>

      {!p.cookieOk && <div className="h-consent" role="region" aria-label={c.consentMore}>
        <p>{p.t("cookie_text")} <a className="link" href={lang === "bg" ? "/bg/cookie/" : lang === "en" ? "/en/cookie/" : "/cookie/"}>{c.consentMore}</a></p>
        <div className="btns">
          <button type="button" className="btn btn-quiet" onClick={p.rejectCookies}>{p.t("cookie_reject").charAt(0) + p.t("cookie_reject").slice(1).toLowerCase()}</button>
          <button type="button" className="btn btn-primary" onClick={p.acceptCookies}>{p.t("cookie_accept").charAt(0) + p.t("cookie_accept").slice(1).toLowerCase()}</button>
        </div>
      </div>}
    </div>
  );
}
