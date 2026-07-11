/**
 * Typed UI dictionary for the marketing site (chrome, landing page, legal
 * pages, metadata). BG is the source of truth — its shape is the canonical
 * `Dict` type that EN and IT must satisfy in full (compile-time parity).
 *
 * Game- and FAQ-content strings are NOT here: they live as per-locale fields on
 * the structured content (src/content/*), so their JSON-LD / SEO shape stays
 * intact. This dictionary covers the surrounding chrome and page copy.
 *
 * BG keeps the „…“ typographic quotes per house style.
 */
import type { Locale } from "./locales";

export interface Dict {
  nav: {
    games: string;
    faq: string;
    about: string;
    play: string;
  };
  footer: {
    games: string;
    faq: string;
    about: string;
    terms: string;
    privacy: string;
    cookies: string;
    responsible: string;
    disclaimer: string;
    credit: string;
  };
  langSwitcher: {
    label: string;
  };
  home: {
    eyebrow: string;
    lead: string;
    playNow: string;
    browseGames: string;
    stats: { games: string; languages: string; tablesOpen: string; toStart: string };
    statValues: { toStart: string };
    features: {
      heading: string;
      sub: string;
      items: { icon: string; title: string; text: string }[];
    };
    steps: {
      heading: string;
      sub: string;
      items: { title: string; text: string }[];
    };
    games: { heading: string; sub: string; minutesShort: string; viewAll: string };
    faq: { heading: string; sub: string; allQuestions: string };
    final: {
      heading: string;
      trust: string[];
      cta: string;
    };
    breadcrumbHome: string;
  };
  games: {
    breadcrumb: string;
    indexTitle: string;
    indexLead: string;
    playersShort: string;
    minutesShort: string;
    play: string;
    howToPlay: string;
    faqHeading: string;
    bettingNote: string;
    backToAll: string;
    metaTitleSuffix: string;
  };
  faqPage: {
    breadcrumb: string;
    heading: string;
    sub: string;
    cta: string;
    ctaLink: string;
  };
  about: {
    breadcrumb: string;
    heading: string;
    p1: string;
    p2: string;
    createdByPrefix: string;
  };
  legal: {
    /** Prefix before the date, e.g. "Последна актуализация:". */
    updatedLabel: string;
  };
  notFound: {
    heading: string;
    text: string;
    back: string;
  };
  og: {
    eyebrow: string;
    footer: string;
  };
  /** Names used in JSON-LD breadcrumbs and shared labels. */
  breadcrumbs: {
    home: string;
    games: string;
    faq: string;
    about: string;
    terms: string;
    privacy: string;
    cookies: string;
    responsible: string;
  };
}

const bg: Dict = {
  nav: { games: "Игри", faq: "Въпроси", about: "За нас", play: "Играй сега" },
  footer: {
    games: "Игри",
    faq: "Въпроси",
    about: "За нас",
    terms: "Общи условия",
    privacy: "Поверителност",
    cookies: "Бисквитки",
    responsible: "Отговорна игра",
    disclaimer: "Социална игра — не е хазарт за реални пари. Само за 18+.",
    credit: "Created and Designed by Carbon Stealth VCC",
  },
  langSwitcher: { label: "Език" },
  home: {
    eyebrow: "Премиум клуб за игри",
    lead: "21 класически игри на карти, маса, кий спортове и настолни в реално време. Белот, Сантасе, Шах, Табла, билярд и снукър — срещу приятели и ботове, безплатно, направо в браузъра.",
    playNow: "Играй сега",
    browseGames: "Разгледай игрите",
    stats: { games: "игри", languages: "езика", tablesOpen: "маси отворени", toStart: "за да започнеш" },
    statValues: { toStart: "0 € / 0 лв." },
    features: {
      heading: "Защо АСО",
      sub: "Класиката, която обичаш — с качеството, което заслужава.",
      items: [
        { icon: "🃏", title: "21 истинска игра", text: "Белот с обяви, Сантасе, Шах, Табла, билярд и снукър — пълни правила, не опростени." },
        { icon: "⚡", title: "Реално време", text: "Мигновен мултиплейър със server-authoritative логика — без лаг, без измами." },
        { icon: "🎯", title: "Реалистична физика", text: "Билярдът и снукърът ползват детерминирана 2D физика с прицелване и анимация на удара." },
        { icon: "🤖", title: "Умни ботове", text: "Няма съперник? Влизаш веднага срещу бот, който се цели и вкарва — и продължаваш да играеш." },
        { icon: "🏆", title: "Класации и сезони", text: "ELO рейтинг за всяка игра, дневни мисии, сезони и постижения." },
        { icon: "🛡️", title: "Честна игра", text: "Без „плати, за да печелиш“. Игрите със залог са само с виртуални чипове." },
      ],
    },
    steps: {
      heading: "Как се започва",
      sub: "Три стъпки до първата ти ръка.",
      items: [
        { title: "Влез за секунди", text: "С имейл, Google или Facebook — без дълги формуляри." },
        { title: "Избери игра", text: "21 заглавие, всяко с матчмейкинг по ниво." },
        { title: "Играй и се изкачвай", text: "Печели чипове, нива и място в класацията." },
      ],
    },
    games: { heading: "Игрите", sub: "Всяка с пълни правила и собствена премиум маса.", minutesShort: "мин", viewAll: "Виж всички игри" },
    faq: { heading: "Често задавани въпроси", sub: "Бързи отговори, преди да седнеш на масата.", allQuestions: "Всички въпроси" },
    final: {
      heading: "Масата те чака.",
      trust: ["Безплатно за старт", "Без хазарт за реални пари", "Играй на всяко устройство"],
      cta: "Влез и играй",
    },
    breadcrumbHome: "Начало",
  },
  games: {
    breadcrumb: "Игри",
    indexTitle: "Игри",
    indexLead: "Научи правилата на всяка игра, после играй безплатно в браузъра.",
    playersShort: "играчи",
    minutesShort: "мин",
    play: "Играй",
    howToPlay: "Как се играе",
    faqHeading: "Често задавани въпроси",
    bettingNote: "⚠️ Социална игра с виртуални чипове — не е хазарт за реални пари. Чиповете не се обменят и не се изплащат.",
    backToAll: "← Всички игри",
    metaTitleSuffix: "правила и онлайн игра",
  },
  faqPage: {
    breadcrumb: "Въпроси",
    heading: "Често задавани въпроси",
    sub: "Всичко за АСО на едно място.",
    cta: "Готов за игра?",
    ctaLink: "Влез и играй",
  },
  about: {
    breadcrumb: "За нас",
    heading: "За АСО",
    p1: "АСО е премиум браузърен портал за 21 класически игри на карти и маса в реално време. Играй срещу приятели и ботове, изкачвай класацията и отключвай козметика — всичко безплатно, направо в браузъра.",
    p2: "Никакъв „плати, за да печелиш“. Парите купуват само козметика и комфорт. Игрите със залог се играят само с виртуални чипове — социална игра, не хазарт за реални пари.",
    createdByPrefix: "Създадено от",
  },
  legal: { updatedLabel: "Последна актуализация:" },
  notFound: {
    heading: "404",
    text: "Страницата не е намерена.",
    back: "← Към началото",
  },
  og: {
    eyebrow: "Премиум клуб за игри",
    footer: "21 игри · 3 езика · безплатно в браузъра",
  },
  breadcrumbs: {
    home: "Начало",
    games: "Игри",
    faq: "Въпроси",
    about: "За нас",
    terms: "Общи условия",
    privacy: "Политика за поверителност",
    cookies: "Бисквитки",
    responsible: "Отговорна игра",
  },
};

const en: Dict = {
  nav: { games: "Games", faq: "FAQ", about: "About", play: "Play now" },
  footer: {
    games: "Games",
    faq: "FAQ",
    about: "About",
    terms: "Terms",
    privacy: "Privacy",
    cookies: "Cookies",
    responsible: "Responsible play",
    disclaimer: "Social game — not real-money gambling. 18+ only.",
    credit: "Created and Designed by Carbon Stealth VCC",
  },
  langSwitcher: { label: "Language" },
  home: {
    eyebrow: "A premium games club",
    lead: "21 classic card, table, cue-sport and board games in real time. Belote, Santase, Chess, Backgammon, pool and snooker — against friends and bots, free, right in your browser.",
    playNow: "Play now",
    browseGames: "Browse the games",
    stats: { games: "games", languages: "languages", tablesOpen: "tables open", toStart: "to get started" },
    statValues: { toStart: "€0 / 0 BGN" },
    features: {
      heading: "Why АСО",
      sub: "The classics you love — with the quality they deserve.",
      items: [
        { icon: "🃏", title: "21 real games", text: "Belote with declarations, Santase, Chess, Backgammon, pool and snooker — full rules, not simplified." },
        { icon: "⚡", title: "Real time", text: "Instant multiplayer with server-authoritative logic — no lag, no cheating." },
        { icon: "🎯", title: "Realistic physics", text: "Pool and snooker use deterministic 2D physics with aiming and a shot animation." },
        { icon: "🤖", title: "Smart bots", text: "No opponent? Jump straight into a match against a bot that aims and pots — and keep playing." },
        { icon: "🏆", title: "Rankings and seasons", text: "An ELO rating for every game, daily missions, seasons and achievements." },
        { icon: "🛡️", title: "Fair play", text: "No “pay to win”. Wager games use virtual chips only." },
      ],
    },
    steps: {
      heading: "How to get started",
      sub: "Three steps to your first hand.",
      items: [
        { title: "Sign in seconds", text: "With email, Google or Facebook — no long forms." },
        { title: "Pick a game", text: "21 titles, each with skill-based matchmaking." },
        { title: "Play and climb", text: "Win chips, levels and a place on the leaderboard." },
      ],
    },
    games: { heading: "The games", sub: "Each with full rules and its own premium table.", minutesShort: "min", viewAll: "See all games" },
    faq: { heading: "Frequently asked questions", sub: "Quick answers before you take a seat.", allQuestions: "All questions" },
    final: {
      heading: "The table is waiting.",
      trust: ["Free to start", "No real-money gambling", "Play on any device"],
      cta: "Sign in and play",
    },
    breadcrumbHome: "Home",
  },
  games: {
    breadcrumb: "Games",
    indexTitle: "Games",
    indexLead: "Learn the rules of each game, then play free in your browser.",
    playersShort: "players",
    minutesShort: "min",
    play: "Play",
    howToPlay: "How to play",
    faqHeading: "Frequently asked questions",
    bettingNote: "⚠️ A social game with virtual chips — not real-money gambling. Chips cannot be exchanged or cashed out.",
    backToAll: "← All games",
    metaTitleSuffix: "rules and online play",
  },
  faqPage: {
    breadcrumb: "FAQ",
    heading: "Frequently asked questions",
    sub: "Everything about АСО in one place.",
    cta: "Ready to play?",
    ctaLink: "Sign in and play",
  },
  about: {
    breadcrumb: "About",
    heading: "About АСО",
    p1: "АСО is a premium browser portal for 21 classic card and table games in real time. Play against friends and bots, climb the leaderboard and unlock cosmetics — all free, right in your browser.",
    p2: "No “pay to win” whatsoever. Money buys cosmetics and comfort only. Wager games are played with virtual chips alone — a social game, not real-money gambling.",
    createdByPrefix: "Created by",
  },
  legal: { updatedLabel: "Last updated:" },
  notFound: {
    heading: "404",
    text: "Page not found.",
    back: "← Back home",
  },
  og: {
    eyebrow: "A premium games club",
    footer: "21 games · 3 languages · free in your browser",
  },
  breadcrumbs: {
    home: "Home",
    games: "Games",
    faq: "FAQ",
    about: "About",
    terms: "Terms",
    privacy: "Privacy Policy",
    cookies: "Cookies",
    responsible: "Responsible play",
  },
};

const it: Dict = {
  nav: { games: "Giochi", faq: "FAQ", about: "Chi siamo", play: "Gioca ora" },
  footer: {
    games: "Giochi",
    faq: "FAQ",
    about: "Chi siamo",
    terms: "Termini",
    privacy: "Privacy",
    cookies: "Cookie",
    responsible: "Gioco responsabile",
    disclaimer: "Gioco sociale — non è gioco d'azzardo con denaro reale. Solo 18+.",
    credit: "Created and Designed by Carbon Stealth VCC",
  },
  langSwitcher: { label: "Lingua" },
  home: {
    eyebrow: "Un club di giochi premium",
    lead: "21 giochi classici di carte, da tavolo, sport di stecca e da tavoliere in tempo reale. Belote, Santase, Scacchi, Backgammon, biliardo e snooker — contro amici e bot, gratis, direttamente nel browser.",
    playNow: "Gioca ora",
    browseGames: "Esplora i giochi",
    stats: { games: "giochi", languages: "lingue", tablesOpen: "tavoli aperti", toStart: "per iniziare" },
    statValues: { toStart: "€0 / 0 BGN" },
    features: {
      heading: "Perché АСО",
      sub: "I classici che ami — con la qualità che meritano.",
      items: [
        { icon: "🃏", title: "21 giochi veri", text: "Belote con dichiarazioni, Santase, Scacchi, Backgammon, biliardo e snooker — regole complete, non semplificate." },
        { icon: "⚡", title: "Tempo reale", text: "Multiplayer istantaneo con logica server-authoritative — senza lag, senza imbrogli." },
        { icon: "🎯", title: "Fisica realistica", text: "Biliardo e snooker usano una fisica 2D deterministica con mira e animazione del tiro." },
        { icon: "🤖", title: "Bot intelligenti", text: "Nessun avversario? Entri subito contro un bot che mira e imbuca — e continui a giocare." },
        { icon: "🏆", title: "Classifiche e stagioni", text: "Punteggio ELO per ogni gioco, missioni giornaliere, stagioni e obiettivi." },
        { icon: "🛡️", title: "Gioco corretto", text: "Niente “paga per vincere”. I giochi con puntate usano solo fiches virtuali." },
      ],
    },
    steps: {
      heading: "Come si inizia",
      sub: "Tre passi fino alla tua prima mano.",
      items: [
        { title: "Entra in pochi secondi", text: "Con email, Google o Facebook — senza moduli lunghi." },
        { title: "Scegli un gioco", text: "21 titoli, ciascuno con matchmaking per livello." },
        { title: "Gioca e scala la classifica", text: "Vinci fiches, livelli e un posto in classifica." },
      ],
    },
    games: { heading: "I giochi", sub: "Ognuno con regole complete e il proprio tavolo premium.", minutesShort: "min", viewAll: "Vedi tutti i giochi" },
    faq: { heading: "Domande frequenti", sub: "Risposte rapide prima di sederti al tavolo.", allQuestions: "Tutte le domande" },
    final: {
      heading: "Il tavolo ti aspetta.",
      trust: ["Gratis per iniziare", "Niente gioco d'azzardo con denaro reale", "Gioca su qualsiasi dispositivo"],
      cta: "Entra e gioca",
    },
    breadcrumbHome: "Home",
  },
  games: {
    breadcrumb: "Giochi",
    indexTitle: "Giochi",
    indexLead: "Impara le regole di ogni gioco, poi gioca gratis nel browser.",
    playersShort: "giocatori",
    minutesShort: "min",
    play: "Gioca a",
    howToPlay: "Come si gioca a",
    faqHeading: "Domande frequenti",
    bettingNote: "⚠️ Gioco sociale con fiches virtuali — non è gioco d'azzardo con denaro reale. Le fiches non si scambiano né si incassano.",
    backToAll: "← Tutti i giochi",
    metaTitleSuffix: "regole e gioco online",
  },
  faqPage: {
    breadcrumb: "FAQ",
    heading: "Domande frequenti",
    sub: "Tutto su АСО in un unico posto.",
    cta: "Pronto a giocare?",
    ctaLink: "Entra e gioca",
  },
  about: {
    breadcrumb: "Chi siamo",
    heading: "Chi è АСО",
    p1: "АСО è un portale browser premium per 21 giochi classici di carte e da tavolo in tempo reale. Gioca contro amici e bot, scala la classifica e sblocca elementi estetici — tutto gratis, direttamente nel browser.",
    p2: "Nessun “paga per vincere”. Il denaro acquista solo estetica e comodità. I giochi con puntate si giocano esclusivamente con fiches virtuali — un gioco sociale, non gioco d'azzardo con denaro reale.",
    createdByPrefix: "Creato da",
  },
  legal: { updatedLabel: "Ultimo aggiornamento:" },
  notFound: {
    heading: "404",
    text: "Pagina non trovata.",
    back: "← Torna alla home",
  },
  og: {
    eyebrow: "Un club di giochi premium",
    footer: "21 giochi · 3 lingue · gratis nel browser",
  },
  breadcrumbs: {
    home: "Home",
    games: "Giochi",
    faq: "FAQ",
    about: "Chi siamo",
    terms: "Termini",
    privacy: "Informativa sulla privacy",
    cookies: "Cookie",
    responsible: "Gioco responsabile",
  },
};

export const DICTIONARIES: Record<Locale, Dict> = { bg, en, it };

export function getDict(locale: Locale): Dict {
  return DICTIONARIES[locale] ?? bg;
}
