// Медиа кит: публична страница за оферти към брандове. Водещото ни
// предимство е разбивката на аудиторията ПО ЕЗИК — данни, които никой
// конкурент няма (English-only профили). Родни низове за 6 езика + en.

export interface MediaKitStrings {
  title: string;
  subtitle: string;
  views30: string;
  clicks30: string;
  ctr: string;
  audienceLangs: string;
  topCountries: string;
  languagesSpoken: string;
  window: string;
  poweredBy: string;
  print: string;
  noData: string;
}

const STRINGS: Record<string, MediaKitStrings> = {
  bg: {
    title: 'Медиа кит',
    subtitle: 'Аудитория и обхват',
    views30: 'Посещения (30 дни)',
    clicks30: 'Кликове (30 дни)',
    ctr: 'Процент кликове',
    audienceLangs: 'Аудитория по език',
    topCountries: 'Топ държави',
    languagesSpoken: 'Говоря на',
    window: 'Данни за последните 30 дни · без бисквитки',
    poweredBy: 'Направено с Linketto',
    print: 'Запази като PDF',
    noData: 'Още няма достатъчно данни.',
  },
  en: {
    title: 'Media kit',
    subtitle: 'Audience & reach',
    views30: 'Views (30 days)',
    clicks30: 'Clicks (30 days)',
    ctr: 'Click rate',
    audienceLangs: 'Audience by language',
    topCountries: 'Top countries',
    languagesSpoken: 'Speaks',
    window: 'Last 30 days · cookieless',
    poweredBy: 'Made with Linketto',
    print: 'Save as PDF',
    noData: 'Not enough data yet.',
  },
  it: {
    title: 'Media kit',
    subtitle: 'Pubblico e portata',
    views30: 'Visite (30 giorni)',
    clicks30: 'Clic (30 giorni)',
    ctr: 'Tasso di clic',
    audienceLangs: 'Pubblico per lingua',
    topCountries: 'Paesi principali',
    languagesSpoken: 'Parla',
    window: 'Ultimi 30 giorni · senza cookie',
    poweredBy: 'Creato con Linketto',
    print: 'Salva come PDF',
    noData: 'Dati ancora insufficienti.',
  },
  es: {
    title: 'Kit de medios',
    subtitle: 'Audiencia y alcance',
    views30: 'Visitas (30 días)',
    clicks30: 'Clics (30 días)',
    ctr: 'Tasa de clics',
    audienceLangs: 'Audiencia por idioma',
    topCountries: 'Países principales',
    languagesSpoken: 'Habla',
    window: 'Últimos 30 días · sin cookies',
    poweredBy: 'Hecho con Linketto',
    print: 'Guardar como PDF',
    noData: 'Todavía no hay datos suficientes.',
  },
  de: {
    title: 'Media-Kit',
    subtitle: 'Publikum & Reichweite',
    views30: 'Aufrufe (30 Tage)',
    clicks30: 'Klicks (30 Tage)',
    ctr: 'Klickrate',
    audienceLangs: 'Publikum nach Sprache',
    topCountries: 'Top-Länder',
    languagesSpoken: 'Spricht',
    window: 'Letzte 30 Tage · ohne Cookies',
    poweredBy: 'Erstellt mit Linketto',
    print: 'Als PDF speichern',
    noData: 'Noch nicht genug Daten.',
  },
  fr: {
    title: 'Kit média',
    subtitle: 'Audience et portée',
    views30: 'Vues (30 jours)',
    clicks30: 'Clics (30 jours)',
    ctr: 'Taux de clics',
    audienceLangs: 'Audience par langue',
    topCountries: 'Principaux pays',
    languagesSpoken: 'Parle',
    window: '30 derniers jours · sans cookies',
    poweredBy: 'Créé avec Linketto',
    print: 'Enregistrer en PDF',
    noData: 'Pas encore assez de données.',
  },
};

export function mediaKitStrings(locale?: string): MediaKitStrings {
  return STRINGS[locale ?? 'bg'] ?? STRINGS.en;
}
