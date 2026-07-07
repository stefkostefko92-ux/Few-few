// Слъгове за публичния адрес /p/<slug> — транслитерация от кирилица + валидация.
import db from './db.js';

const CYR = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sht',
  ъ: 'a',
  ь: 'y',
  ю: 'yu',
  я: 'ya',
};

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

// Резервирани пътища — да не се сблъскат с реални маршрути или бъдещи страници.
const RESERVED = new Set([
  'admin',
  'api',
  'app',
  'dashboard',
  'login',
  'logout',
  'register',
  'profile',
  'photo',
  'static',
  'public',
  'vizitka',
  'qr',
  'help',
  'support',
  'terms',
  'privacy',
]);

export function slugify(text) {
  const latin = [...String(text).toLowerCase()].map((ch) => CYR[ch] ?? ch).join('');
  return latin
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function isValidSlug(slug) {
  return SLUG_RE.test(slug) && !RESERVED.has(slug);
}

// Свободен слъг на база име: „stefan-kostadinov“, при зает — „stefan-kostadinov-2“…
export function uniqueSlug(base) {
  let candidate = slugify(base);
  if (!isValidSlug(candidate)) candidate = `profil-${Date.now().toString(36)}`;
  candidate = candidate.slice(0, 34).replace(/-+$/, ''); // място за суфикс „-NN“
  const taken = db.prepare('SELECT 1 FROM profiles WHERE slug = ?');
  let slug = candidate;
  for (let i = 2; taken.get(slug); i++) slug = `${candidate}-${i}`;
  return slug;
}
