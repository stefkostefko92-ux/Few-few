// @ts-check
// Управление на видимостта: кои страници са скрити. Скритата страница връща 404,
// а връзките към нея се крият чрез инжектиран CSS в <head> на всяка страница.
// Обратимо е и моментално (без ре-билд на сайта).

import { readFile, writeFile, rename, mkdir, readdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';

/**
 * @typedef {Object} Visibility
 * @property {string[]} hidden  Имена на скритите .html файлове.
 */

/**
 * Зарежда списъка със скрити страници (толерантно към липса/повреда).
 * @param {string} file
 * @returns {Promise<Visibility>}
 */
export async function loadVisibility(file) {
  try {
    const v = JSON.parse(await readFile(file, 'utf8'));
    return { hidden: Array.isArray(v.hidden) ? v.hidden : [] };
  } catch {
    return { hidden: [] };
  }
}

/**
 * Атомен запис на видимостта (tmp → rename).
 * @param {string} file
 * @param {Visibility} data
 * @returns {Promise<void>}
 */
export async function saveVisibility(file, data) {
  await mkdir(dirname(file), { recursive: true }).catch(() => {});
  // Атомен запис: временен файл в същата директория → rename (атомарно на ФС),
  // за да не се корумпира списъкът при срив по средата на записа.
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify({ hidden: [...new Set(data.hidden || [])] }, null, 2));
  await rename(tmp, file);
}

/**
 * Само име на файл (без път/заявка), напр. „cordate.html". null ако не е .html.
 * @param {string|undefined|null} pathname
 * @returns {string|null}
 */
export function nomePagina(pathname) {
  let p = String(pathname || '').split('?')[0].split('#')[0];
  if (p.endsWith('/')) p += 'index.html';
  const b = basename(p);
  return b.endsWith('.html') ? b : null;
}

/**
 * Скрита ли е дадената заявка спрямо списъка? (сравнение по име на файл)
 * @param {string|undefined|null} pathname
 * @param {string[]} hidden
 * @returns {boolean}
 */
export function isHidden(pathname, hidden) {
  const n = nomePagina(pathname);
  return !!n && hidden.includes(n);
}

/**
 * CSS, който крие всички връзки към скритите страници (nav + карти + вътрешни).
 * @param {string[]|undefined|null} hidden
 * @returns {string}
 */
export function hideCss(hidden) {
  if (!hidden || !hidden.length) return '';
  const sel = hidden
    .filter((h) => /^[\w.-]+\.html$/.test(h)) // само безопасни имена
    .map((h) => `a[href$="${h}"]`)
    .join(',');
  if (!sel) return '';
  return `<style id="vis-hide">${sel}{display:none!important}</style>`;
}

/**
 * Вмъква CSS-а за скриване преди </head> (или в началото, ако липсва).
 * @param {string} html
 * @param {string[]|undefined|null} hidden
 * @returns {string}
 */
export function iniettaHideCss(html, hidden) {
  const css = hideCss(hidden);
  if (!css) return html;
  const i = html.indexOf('</head>');
  return i < 0 ? css + html : html.slice(0, i) + css + html.slice(i);
}

// Страници, които НЕ се предлагат за скриване (правно/функционално задължителни).
const PROTETTE = new Set([
  'index.html',
  'note-legali.html',
  'privacy.html',
  'accessibilita.html',
  'metodologia.html',
  'dati.html',
]);

/**
 * Сканира първо ниво на site/ за .html страници + заглавие (за админ списъка).
 * @param {string} siteDir
 * @returns {Promise<Array<{ file: string, titolo: string, protetta: boolean }>>}
 */
export async function scanPages(siteDir) {
  const files = (await readdir(siteDir)).filter((f) => f.endsWith('.html'));
  /** @type {Array<{ file: string, titolo: string, protetta: boolean }>} */
  const out = [];
  for (const f of files.sort()) {
    let titolo = f;
    try {
      const html = await readFile(join(siteDir, f), 'utf8');
      const m = html.match(/<title>([^<]*)<\/title>/i);
      if (m) titolo = m[1].replace(/\s*—\s*Ospedali Trasparenti.*$/, '').trim() || f;
    } catch {
      /* ignore */
    }
    out.push({ file: f, titolo, protetta: PROTETTE.has(f) });
  }
  return out;
}

export { PROTETTE };
