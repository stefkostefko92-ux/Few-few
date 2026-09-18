// projects.mjs — РЕАЛНИТЕ проекти на Carbon Stealth VCC (същите 10, които carbonstealth.eu показва в
// „Портфолио"; текстовете са пренесени оттам дума по дума, фактите — от кейс студиите на сайта).
// Никакви измислени клиенти, числа или отзиви. Снимка = реален скрийншот на живия продукт (public/img/projects/<id>.webp,
// 960×600); без снимка → типографска обложка (shot: false). caseStudy = слъгът на кейс студията на carbonstealth.eu.
import { BRAND_URL } from "./lib/html.mjs";

export const CASE_STUDY_PATH = { bg: (s) => `${BRAND_URL}/bg/keys-studii/${s}/`, en: (s) => `${BRAND_URL}/en/case-studies/${s}/`, it: (s) => `${BRAND_URL}/case-study/${s}/` };

export const PROJECTS = [
  {
    id: "nexus", url: "https://nexus.carbonstealth.eu", shot: true, caseStudy: "nexus-dominion", accent: "#8b5cf6",
    stack: ["React", "Node.js", "TypeScript", "PostgreSQL", "Redis", "Socket.IO", "Docker"],
    t: {
      bg: { name: "Nexus Dominion", category: "Браузър MMO игра", desc: "Средновековно dark fantasy браузър MMO. React, Node.js, PostgreSQL, Redis, Socket.IO, Docker. 52+ модела в базата, 27 игрови страници.", facts: ["52+ модела в базата", "27 игрови страници", "Real-time през Socket.IO", "Гилдии · подземия · PvP арена · пазар"] },
      en: { name: "Nexus Dominion", category: "Browser MMO game", desc: "Medieval dark fantasy browser MMO. React, Node.js, PostgreSQL, Redis, Socket.IO, Docker. 52+ database models, 27 game pages.", facts: ["52+ database models", "27 game pages", "Real-time over Socket.IO", "Guilds · dungeons · PvP arena · market"] },
      it: { name: "Nexus Dominion", category: "MMO browser", desc: "MMO browser dark fantasy medievale. React, Node.js, PostgreSQL, Redis, Socket.IO, Docker. 52+ modelli database, 27 pagine di gioco.", facts: ["52+ modelli nel database", "27 pagine di gioco", "Real-time via Socket.IO", "Gilde · dungeon · arena PvP · mercato"] },
    },
  },
  {
    id: "ouvaptsarov", url: "https://ouvaptsarov.com", shot: false, caseStudy: "ou-vaptsarov", accent: "#2563eb",
    stack: ["React", "Vite", "PHP", "Responsive"],
    t: {
      bg: { name: "ОУ „Никола Вапцаров“", category: "Училищен сайт", desc: "Официален уебсайт на ОУ „Никола Вапцаров“, Бобов дол. React SPA със система за новини и респонсив дизайн.", facts: ["Многоезичен институционален сайт", "Новини, графици, документи", "Бърз и от телефон при слаба връзка"] },
      en: { name: "OU Nikola Vaptsarov", category: "School website", desc: "Official website for Nikola Vaptsarov Elementary School in Bobov Dol, Bulgaria. React SPA with news system and responsive design.", facts: ["Multilingual institutional website", "News, schedules, documents", "Fast on a phone with a weak connection"] },
      it: { name: "OU Nikola Vaptsarov", category: "Sito scolastico", desc: "Sito web istituzionale per la Scuola Elementare Nikola Vaptsarov di Bobov Dol. React SPA con sistema notizie e design responsive.", facts: ["Sito istituzionale multilingue", "Notizie, orari, documenti", "Veloce anche da telefono con rete debole"] },
    },
  },
  {
    id: "erp", url: "https://erp.carbonstealth.eu", shot: false, caseStudy: "erp-ascensori", accent: "#0ea5e9",
    stack: ["React", "Prisma", "PostgreSQL"],
    t: {
      bg: { name: "ERP Ascensori", category: "ERP система", desc: "ERP система за Panev Ascensori SAS (Милано). Счетоводство, склад, CRM, HR, производство.", facts: ["Производство · склад · фактуриране в едно", "7 нива на достъп по роля", "BI табла за ръководството"] },
      en: { name: "ERP Ascensori", category: "ERP system", desc: "ERP system for Panev Ascensori SAS (Milan). Accounting, inventory, CRM, HR, production.", facts: ["Production · inventory · invoicing in one place", "7-level role-based access", "BI dashboards for management"] },
      it: { name: "ERP Ascensori", category: "Sistema ERP", desc: "Sistema ERP per Panev Ascensori SAS (Milano). Contabilità, magazzino, CRM, HR, produzione.", facts: ["Produzione · magazzino · fatturazione in un unico posto", "Accessi a 7 livelli per ruolo", "Dashboard BI per la direzione"] },
    },
  },
  {
    id: "tretimart", url: "https://tretimart.carbonstealth.eu", shot: false, caseStudy: "treti-mart", accent: "#f59e0b",
    stack: ["React", "Node.js", "Stripe", "PostgreSQL"],
    t: {
      bg: { name: "Трети Март", category: "Маркетплейс", desc: "Български маркетплейс с React, Node.js, PostgreSQL, Stripe, OTP верификация и админ панел със 7 таба.", facts: ["Превозни средства · имоти · услуги", "Безплатни обяви", "Сигурни плащания през Stripe", "Админ панел със 7 таба"] },
      en: { name: "Treti Mart", category: "Marketplace", desc: "Bulgarian marketplace with React, Node.js, PostgreSQL, Stripe, OTP verification and 7-tab admin panel.", facts: ["Vehicles · property · services", "Free listings", "Secure payments via Stripe", "7-tab admin panel"] },
      it: { name: "Treti Mart", category: "Marketplace", desc: "Marketplace bulgaro con React, Node.js, PostgreSQL, Stripe, verifica OTP e pannello admin con 7 tab.", facts: ["Veicoli · immobili · servizi", "Annunci gratuiti", "Pagamenti sicuri via Stripe", "Pannello admin con 7 tab"] },
    },
  },
  {
    id: "evanita", url: "https://evanita-bg.com", shot: true, accent: "#9f1239",
    stack: ["HTML", "CSS", "JS", "Nginx"],
    t: {
      bg: { name: "Evanita Sport", category: "Фитнес студио", desc: "Дамско студио за Kangoo Jumps и силови тренировки в Дупница, с лицензиран инструктор. Бърз статичен сайт, mobile-first.", facts: ["Статичен сайт, нула зависимости", "Mobile-first", "Хостинг зад Nginx"] },
      en: { name: "Evanita Sport", category: "Fitness studio", desc: "Women's studio for Kangoo Jumps and strength training in Dupnitsa, with a licensed instructor. Fast static site, mobile-first.", facts: ["Static site, zero dependencies", "Mobile-first", "Hosted behind Nginx"] },
      it: { name: "Evanita Sport", category: "Studio fitness", desc: "Studio femminile di Kangoo Jumps e allenamento di forza a Dupnitsa, con istruttrice qualificata. Sito statico veloce, ottimizzato per mobile.", facts: ["Sito statico, zero dipendenze", "Mobile-first", "Servito da Nginx"] },
    },
  },
  {
    id: "eternaltouch", url: "https://eternaltouch.it", shot: false, accent: "#a16207",
    stack: ["Express", "EJS", "Prisma", "PostgreSQL"],
    t: {
      bg: { name: "Eternal Touch", category: "Витрина и каталог", desc: "Ателие в Бобов дол: ръчно изработени гипсови декорации, бонбониери и творения по поръчка. Витрина и каталог на три езика.", facts: ["Каталог на три езика (IT · BG · EN)", "Витрина, не e-commerce", "Docker + PostgreSQL"] },
      en: { name: "Eternal Touch", category: "Showcase and catalogue", desc: "Atelier in Bobov Dol: handmade plaster decorations, favours and bespoke creations. Showcase and catalogue in three languages.", facts: ["Catalogue in three languages (IT · BG · EN)", "Showcase, not e-commerce", "Docker + PostgreSQL"] },
      it: { name: "Eternal Touch", category: "Vetrina e catalogo", desc: "Atelier a Bobov Dol: decorazioni in gesso fatte a mano, bomboniere e creazioni su misura. Vetrina e catalogo in tre lingue.", facts: ["Catalogo in tre lingue (IT · BG · EN)", "Vetrina, non e-commerce", "Docker + PostgreSQL"] },
    },
  },
  {
    id: "ospedali", url: "https://ospedalitrasparenti.it", shot: true, accent: "#0369a1",
    stack: ["Node.js", "ETL", "Open data"],
    t: {
      bg: { name: "Ospedali Trasparenti", category: "Граждански портал", desc: "Граждански портал за прозрачност на италианските болници: публични и сравними данни, достъпни за гражданите.", facts: ["Официални open data (BDAP/MEF, dati.salute)", "Отчет за всяка структура от SSN", "Нула зависимости, статичен сайт"] },
      en: { name: "Ospedali Trasparenti", category: "Civic portal", desc: "Civic portal for the transparency of Italian hospitals: public, comparable data made accessible to citizens.", facts: ["Official open data (BDAP/MEF, dati.salute)", "A report for every SSN structure", "Zero dependencies, static site"] },
      it: { name: "Ospedali Trasparenti", category: "Portale civico", desc: "Portale civico per la trasparenza degli ospedali italiani: dati pubblici, accessibili e confrontabili per i cittadini.", facts: ["Open data ufficiali (BDAP/MEF, dati.salute)", "Un report per ogni struttura del SSN", "Zero dipendenze, sito statico"] },
    },
  },
  {
    id: "vizitka", url: "https://vizitka-bg.com", shot: true, accent: "#1d4ed8",
    stack: ["Express", "EJS", "SQLite", "QR"],
    t: {
      bg: { name: "Vizitka", category: "Дигитална визитка", desc: "Дигитална визитка с постоянен QR код. Смениш ли телефон или длъжност — всички вече раздадени визитки се обновяват сами.", facts: ["Постоянен QR код", "Безплатен профил — личен или фирмен", "Печат върху хартиена визитка, стикер, табела"] },
      en: { name: "Vizitka", category: "Digital business card", desc: "Digital business card with a permanent QR. Change your job or number — every card you already handed out updates itself.", facts: ["Permanent QR code", "Free profile — personal or company", "Print it on a paper card, sticker or sign"] },
      it: { name: "Vizitka", category: "Biglietto da visita digitale", desc: "Biglietto da visita digitale con QR permanente. Cambi lavoro o numero — tutti i biglietti già distribuiti si aggiornano da soli.", facts: ["QR permanente", "Profilo gratuito — personale o aziendale", "Stampa su biglietto, adesivo o targa"] },
    },
  },
  {
    id: "mastilko", url: "https://mastilko-bg.com", shot: true, accent: "#c2410c",
    stack: ["Next.js", "React", "Tailwind", "Gemini"],
    t: {
      bg: { name: "Мастилко", category: "Инструмент за печат", desc: "Безплатни етикети, визитки и CV, готови за печат. Преглед на живо върху истински А4 лист, без регистрация.", facts: ["Преглед на живо върху А4", "Без регистрация, без проследяване", "AI помощ с Gemini"] },
      en: { name: "Mastilko", category: "Print tool", desc: "Free labels, business cards and CVs, print-ready. Live preview on a real A4 sheet, no signup.", facts: ["Live preview on an A4 sheet", "No signup, no tracking", "AI help with Gemini"] },
      it: { name: "Mastilko", category: "Strumento per la stampa", desc: "Etichette, biglietti da visita e CV gratuiti, pronti per la stampa. Anteprima dal vivo su un vero foglio A4, senza registrazione.", facts: ["Anteprima dal vivo su A4", "Senza registrazione, senza tracciamento", "Aiuto AI con Gemini"] },
    },
  },
  {
    id: "panev", url: "https://panevascensori.it", shot: true, accent: "#1e3a8a",
    stack: ["Express", "SQLite", "Stripe"],
    t: {
      bg: { name: "Panev Ascensori", category: "Сайт + e-commerce", desc: "Патентовани скоби за асансьори: регулируем монтаж на етажни врати и водачи на противотежестта върху неравна зидария. Патент UIBM, made in Italy.", facts: ["Патент за полезен модел UIBM", "Каталог с ценоразпис + PDF", "Поръчки и плащания през Stripe", "IT · EN · BG"] },
      en: { name: "Panev Ascensori", category: "Website + e-commerce", desc: "Patented elevator brackets: adjustable fixing of landing doors and counterweight guides on irregular masonry. UIBM patent, made in Italy.", facts: ["UIBM utility model patent", "Catalogue with price list + PDF", "Orders and payments via Stripe", "IT · EN · BG"] },
      it: { name: "Panev Ascensori", category: "Sito + e-commerce", desc: "Staffe brevettate per ascensori: fissaggio regolabile di porte di piano e guide del contrappeso su murature irregolari. Brevetto UIBM, made in Italy.", facts: ["Brevetto per modello di utilità UIBM", "Catalogo con listino + PDF", "Ordini e pagamenti via Stripe", "IT · EN · BG"] },
    },
  },
];
