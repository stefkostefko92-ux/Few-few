// Slug на профила: латиница, цифри и тирета; кирилицата се транслитерира,
// за да може българин да напише „Мария“ и да получи millelink.bio/u/mariya.

const BG_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
};

export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'billing', 'blog', 'dashboard', 'docs',
  'help', 'login', 'logout', 'millelink', 'pricing', 'privacy', 'register',
  'root', 'settings', 'support', 'terms', 'u', 'www',
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
