/**
 * Текстовете на сървърно рендираните SEO метаданни (title, description,
 * keywords, скритият за потребителя „bootstrap“ блок за краулъри без JS) и
 * на истинската 404 страница — на трите езика на играта (en/it/bg).
 *
 * Заглавието и описанието на лендинга ТРЯБВА да съвпадат дословно с
 * `seo.landingTitle` / `seo.landingDescription` в client/src/i18n/locales/*.json
 * (клиентът ги слага в document.title при смяна на езика) — тестът
 * routes/__tests__/seo.test.ts пада при разминаване.
 *
 * Само реални факти от играта (виж Landing.tsx / сийда): 4 класа, 21 региона,
 * 500 нива, 12 тира екипировка, ELO арена, аукцион в реално време, гилдии на
 * 5 тира, седмична Кула на изпитанията. Никакви измислени оценки/статистики.
 */

export const LOCALES = ['en', 'it', 'bg'] as const;
export type Locale = (typeof LOCALES)[number];

export interface LandingCopy {
  title: string;
  description: string;
  keywords: string[];
  /** Open Graph locale (език_ДЪРЖАВА). */
  ogLocale: string;
  h1: string;
  /** Пряк отговор „какво е това“ в първите ~60 думи (за AI цитиране). */
  lead: string;
}

export const LANDING: Record<Locale, LandingCopy> = {
  en: {
    title: 'Nexus Dominion — Free Browser MMORPG',
    description:
      'Server-authoritative turn-based MMORPG. Four classes, 500 levels of roster, ELO arena, real-time auction, five-tier guilds. Free, browser-based, no installer.',
    keywords: [
      'Nexus Dominion',
      'browser MMORPG',
      'free MMORPG',
      'no download MMORPG',
      'turn-based fantasy RPG',
      'free online RPG',
      'Carbon Stealth',
    ],
    ogLocale: 'en_US',
    h1: 'Nexus Dominion — Free Browser MMORPG',
    lead:
      'Nexus Dominion is a free browser MMORPG by Carbon Stealth with server-authoritative turn-based combat: four classes, twenty-one regions across 500 levels, twelve tiers of gear, an ELO arena, a real-time auction house, five-tier guilds with raid bosses and a weekly Tower of Trials. It runs in any modern browser — no download, no installer.',
  },
  it: {
    title: 'Nexus Dominion — MMORPG da browser, gratuito',
    description:
      "MMORPG con combattimenti a turni validati dal server. Quattro classi, 500 livelli di mostri, arena ELO, casa d'aste in tempo reale, gilde a cinque livelli. Gratuito, senza installazione.",
    keywords: [
      'Nexus Dominion',
      'MMORPG da browser',
      'MMORPG gratis',
      'MMORPG in italiano',
      'gioco di ruolo fantasy a turni',
      'gioco online gratuito',
      'Carbon Stealth',
    ],
    ogLocale: 'it_IT',
    h1: 'Nexus Dominion — MMORPG da browser, gratuito',
    lead:
      "Nexus Dominion è un MMORPG da browser gratuito di Carbon Stealth, con combattimenti a turni validati dal server: quattro classi, ventuno regioni su 500 livelli, dodici tier di equipaggiamento, un'arena ELO, una casa d'aste in tempo reale, gilde a cinque tier con boss raid e una Torre delle Prove settimanale. Funziona in qualsiasi browser moderno, senza download né installazione.",
  },
  bg: {
    title: 'Nexus Dominion — Безплатна браузърна ММОРПГ',
    description:
      'Пошагова ММОРПГ, валидирана на сървъра. Четири класа, 500 нива монстри, ELO арена, аукцион в реално време, гилдии на пет нива. Безплатна, без инсталация.',
    keywords: [
      'Nexus Dominion',
      'браузърна ММОРПГ',
      'MMORPG на български',
      'безплатна онлайн игра',
      'фентъзи RPG',
      'пошагови битки',
      'Carbon Stealth',
    ],
    ogLocale: 'bg_BG',
    h1: 'Nexus Dominion — Безплатна браузърна ММОРПГ',
    lead:
      'Nexus Dominion е безплатна браузърна ММОРПГ от Carbon Stealth с пошагови битки, валидирани на сървъра: четири класа, двайсет и един региона в 500 нива, дванайсет тира екипировка, ELO арена, аукционна къща в реално време, гилдии на пет тира с рейд босове и седмична Кула на изпитанията. Работи във всеки модерен браузър — без сваляне, без инсталация.',
  },
};

export interface PageCopy {
  title: string;
  description: string;
  keywords: string[];
  /** Само за индексируемите страници — H1 + изречение за краулъри без JS. */
  h1?: string;
  lead?: string;
}

/** Правните страници (индексируеми, съдържанието им е на английски). */
export const DOC_PAGES: Record<'terms' | 'privacy', PageCopy> = {
  terms: {
    title: 'Terms of Service — Nexus Dominion',
    description:
      'Terms of Service for Nexus Dominion: operator details (Impressum), age requirements, conduct and moderation, premium currency, refunds and the EU 14-day withdrawal right.',
    keywords: [
      'Nexus Dominion terms of service',
      'Nexus Dominion',
      'browser MMORPG',
      'Impressum',
      'EU withdrawal right',
      'Carbon Stealth',
    ],
    h1: 'Terms of Service',
    lead: 'Terms of Service for Nexus Dominion, the free browser MMORPG operated by Carbon Stealth VCC.',
  },
  privacy: {
    title: 'Privacy Policy — Nexus Dominion',
    description:
      'Privacy Policy for Nexus Dominion: data controller, what we collect and why, sub-processors and EU transfers, your GDPR rights, retention, cookies and children.',
    keywords: [
      'Nexus Dominion privacy policy',
      'Nexus Dominion',
      'GDPR',
      'data protection',
      'browser MMORPG',
      'Carbon Stealth',
    ],
    h1: 'Privacy Policy',
    lead: 'Privacy Policy for Nexus Dominion, the free browser MMORPG operated by Carbon Stealth VCC.',
  },
};

export type UtilityPage = 'login' | 'register' | 'forgot' | 'reset' | 'create' | 'app';

const UTILITY_KEYWORDS = ['Nexus Dominion', 'browser MMORPG', 'free MMORPG', 'online RPG', 'Carbon Stealth'];

/** Служебни страници — noindex (вход, регистрация, възстановяване, самата игра). */
export const UTILITY_PAGES: Record<UtilityPage, PageCopy> = {
  login: {
    title: 'Log in — Nexus Dominion',
    description: 'Sign in to your Nexus Dominion account and continue your journey in the free browser MMORPG.',
    keywords: ['Nexus Dominion login', ...UTILITY_KEYWORDS],
  },
  register: {
    title: 'Create a free account — Nexus Dominion',
    description: 'Create a free Nexus Dominion account and start playing the browser MMORPG — no download, no installer.',
    keywords: ['Nexus Dominion sign up', ...UTILITY_KEYWORDS],
  },
  forgot: {
    title: 'Forgot your password? — Nexus Dominion',
    description: 'Request a password reset link for your Nexus Dominion account.',
    keywords: ['Nexus Dominion password reset', ...UTILITY_KEYWORDS],
  },
  reset: {
    title: 'Choose a new password — Nexus Dominion',
    description: 'Set a new password for your Nexus Dominion account.',
    keywords: ['Nexus Dominion new password', ...UTILITY_KEYWORDS],
  },
  create: {
    title: 'Create your hero — Nexus Dominion',
    description: 'Pick a class and a name for your Nexus Dominion hero.',
    keywords: ['Nexus Dominion character creation', ...UTILITY_KEYWORDS],
  },
  app: {
    title: 'Nexus Dominion',
    description: 'Nexus Dominion — free browser MMORPG.',
    keywords: UTILITY_KEYWORDS,
  },
};

export interface NotFoundCopy {
  title: string;
  h1: string;
  body: string;
  home: string;
  register: string;
  login: string;
}

/** 404 — заглавието/текстът са същите като `notFound.*` в клиентските локали. */
export const NOT_FOUND: Record<Locale, NotFoundCopy> = {
  en: {
    title: 'Page not found — Nexus Dominion',
    h1: 'This road leads nowhere.',
    body: 'The path you seek does not exist in this realm. Perhaps the map is wrong, or perhaps the page never was.',
    home: 'Back to the home page',
    register: 'Play Free',
    login: 'Sign in',
  },
  it: {
    title: 'Pagina non trovata — Nexus Dominion',
    h1: 'Questa strada non porta da nessuna parte.',
    body: 'Il sentiero che cerchi non esiste in questo reame. Forse la mappa è sbagliata, o forse la pagina non è mai esistita.',
    home: 'Torna alla pagina iniziale',
    register: 'Gioca gratis',
    login: 'Accedi',
  },
  bg: {
    title: 'Страницата не е намерена — Nexus Dominion',
    h1: 'Този път не води доникъде.',
    body: 'Пътеката, която търсиш, не съществува в това кралство. Може би картата лъже, а може би страницата никога не е била.',
    home: 'Към началната страница',
    register: 'Играй безплатно',
    login: 'Вход',
  },
};
