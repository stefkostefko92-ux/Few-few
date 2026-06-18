import slugifyLib from 'slugify';

// Транслитерация на кирилица за SEO-приятелски URL адреси
const CYR = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',
  м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',
  ш:'sh',щ:'sht',ъ:'a',ь:'y',ю:'yu',я:'ya',
};

function translit(str) {
  return String(str)
    .toLowerCase()
    .split('')
    .map((ch) => (CYR[ch] !== undefined ? CYR[ch] : ch))
    .join('');
}

export function slugify(text) {
  const base = slugifyLib(translit(text), { lower: true, strict: true, trim: true });
  return base || 'item-' + Date.now().toString(36);
}

const MONTHS_BG = [
  'януари', 'февруари', 'март', 'април', 'май', 'юни',
  'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
];

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value.includes('T') || value.includes(' ') ? value.replace(' ', 'T') + 'Z' : value);
  if (isNaN(d)) return '';
  return `${d.getDate()} ${MONTHS_BG[d.getMonth()]} ${d.getFullYear()} г.`;
}

export function monthName(m) {
  return MONTHS_BG[(m - 1) % 12] || '';
}

export function isoDate(value) {
  if (!value) return '';
  const d = new Date(value.includes('T') || value.includes(' ') ? value.replace(' ', 'T') + 'Z' : value);
  return isNaN(d) ? '' : d.toISOString();
}

export function truncate(str, n = 160) {
  const s = (str || '').trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

export function paginate(total, page, perPage) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), pages);
  return {
    page: current,
    perPage,
    total,
    pages,
    offset: (current - 1) * perPage,
    hasPrev: current > 1,
    hasNext: current < pages,
    prev: current - 1,
    next: current + 1,
  };
}
