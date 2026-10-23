import { LOCALES } from '@/i18n/locales';

// Slug на профила: латиница, цифри и тирета; кирилицата се транслитерира,
// за да може българин да напише „Мария“ и да получи linketto.bio/u/mariya.

const BG_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
};

// Системни пътища + езиковите кодове: на краткия хост (PROFILE_HOST) slug-ът
// стои в корена (lnkt.to/<slug>), затова не бива да съвпада с маршрут.
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'billing', 'blog', 'dashboard', 'docs',
  'help', 'login', 'logout', 'linketto', 'pricing', 'privacy', 'register',
  'root', 'settings', 'support', 'terms', 'u', 'www',
  'buyer', 'cookies', 'd', 'favicon', 'icon', 'llms', 'manifest', 'media',
  'og', 'robots', 's', 'sitemap', 'tools', 'vs', 'apple-touch-icon',
  'carbonstealth', 'carbon-stealth', 'linktree', 'official', 'staff',
  ...LOCALES,
]);

export function transliterate(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map((ch) => BG_MAP[ch] ?? ch)
    .join('');
}

export function normalizeSlug(input: string): string {
  return transliterate(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-\s_]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

export function isValidSlug(slug: string): boolean {
  if (RESERVED_SLUGS.has(slug)) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug);
}
