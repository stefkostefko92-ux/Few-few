// Форматиране и slugify — споделено между отчета и сайта.

const eurIt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const numIt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const pctIt = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 1 });

/** Италиански формат на евро (за сайта). */
export function euroIt(v) {
  return v == null ? '—' : eurIt.format(Math.round(v));
}

/** Компактно евро: 1,2 mld / 345 mln / 12 mila. */
export function euroCompact(v) {
  if (v == null) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}${numIt.format(round1(a / 1e9))} mld €`;
  if (a >= 1e6) return `${sign}${numIt.format(Math.round(a / 1e6))} mln €`;
  if (a >= 1e3) return `${sign}${numIt.format(Math.round(a / 1e3))} mila €`;
  return `${sign}${numIt.format(Math.round(a))} €`;
}

export function numeroIt(v) {
  return v == null ? '—' : numIt.format(v);
}

export function percentualeIt(v) {
  return v == null ? '—' : pctIt.format(v);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Екранира текст за безопасно вмъкване в HTML. */
export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
