/**
 * Постоянните части на съдържанието: датите на промяна (lastmod в sitemap, „последна промяна“ на
 * правните страници), версията на условията и реда на разделите. Текстовете са в `locales/`.
 */

/** Последна промяна на статичните страници — сменя се ръчно, когато се промени текстът им. */
export const CONTENT_UPDATED = '2026-10-24';

/** Последна промяна на всеки правен текст — показва се на страницата и отива в sitemap. */
export const LEGAL_UPDATED = {
  privacy: '2026-10-25',
  vipTerms: '2026-10-24',
  rules: '2026-10-24',
  imprint: '2026-10-24',
  contact: '2026-10-24',
} as const;

/** Версията на общите условия за VIP — заявката (етап 2) я записва в `vip_requests.terms_version`. */
export const TERMS_VERSION = LEGAL_UPDATED.vipTerms;

/**
 * Сроковете по CONTRACT.md §7 — една стойност за правните текстове и за задачите за чистене.
 * `demosDays` чисти не работникът, а `cs2-demos-clean.timer` на хоста (SourceTV демотата са файлове на
 * сървъра на играта, не в базата); `test/modpack.test.mjs` пази двете стойности равни.
 */
export const RETENTION = {
  sessionsDays: 30,
  killsDays: 90,
  casesDays: 365,
  demosDays: 14,
  /** Картите на мачовете (CONTRACT §13) — matches + match_players. */
  matchesDays: 90,
} as const;

/** Въпросите на началната страница (видими като H3 и в FAQPage) — `home.faq.<id>.q/a`. */
export const HOME_FAQ = [
  'join',
  'install',
  'mode',
  'xp',
  'vip',
  'stats',
  'skins',
  'banned',
] as const;

/** Разделите на правните страници в реда им — `<страница>.sections.<id>.title/body/items`. */
export const PRIVACY_SECTIONS = [
  'controller',
  'game',
  'website',
  'purposes',
  'retention',
  'recipients',
  'steam',
  'rights',
  'changes',
] as const;

export const VIP_TERMS_SECTIONS = [
  'provider',
  'subject',
  'prices',
  'order',
  'period',
  'withdrawal',
  'rules',
  'availability',
  'complaints',
] as const;

/** Режимите на оръжията в играта (`Deathmatch.json`) — собствени имена, показват се както в играта. */
export const HOME_MODES = [
  'All Weapons',
  'Only Headshot',
  'Only Deagle',
  'Only Pistols',
  'Only SMG',
] as const;

export const RULES = ['cheats', 'toxicity', 'ads', 'exploits', 'impersonation', 'spam'] as const;

/** Публичните страници (без профила на играч) — навигацията, sitemap и llms.txt. */
export const PAGES = [
  'home',
  'leaderboard',
  'matches',
  'bans',
  'vip',
  'rules',
  'privacy',
  'vipTerms',
  'imprint',
  'contact',
] as const;
export type PageId = (typeof PAGES)[number];

/** Чистият адрес на страницата след езика: `/bg/`, `/bg/leaderboard`… */
export const PAGE_SLUG: Record<PageId, string> = {
  home: '',
  leaderboard: 'leaderboard',
  matches: 'matches',
  bans: 'bans',
  vip: 'vip',
  rules: 'rules',
  privacy: 'privacy',
  vipTerms: 'vip-terms',
  imprint: 'imprint',
  contact: 'contact',
};

/** Банлистът е публичен, но не се индексира (noindex) и не влиза в sitemap. */
export const NOINDEX_PAGES: ReadonlySet<PageId> = new Set(['bans']);
