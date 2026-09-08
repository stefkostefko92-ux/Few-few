/** Чисти URL адреси: „Галакси Роуплей“ → „galaksi-roupley“. */

const BG_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht',
  ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
};

/** Пътища, които не могат да са slug на сървър. */
export const RESERVED_SLUGS = new Set([
  'api',
  'servers',
  'framework',
  'whitelist',
  'submit',
  'news',
  'admin',
  'about',
  'privacy',
  'terms',
  'sitemap',
  'robots',
  'llms',
]);

export function slugify(input: string): string {
  const latin = input
    .toLowerCase()
    .split('')
    .map((ch) => BG_TO_LATIN[ch] ?? ch)
    .join('');

  return latin
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/.test(slug) && !RESERVED_SLUGS.has(slug);
}
