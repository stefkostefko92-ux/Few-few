// @ts-check
// Подменя ОБВИВКАТА (CSS + скрипт в <head>, горна лента, masthead с менюто,
// footer и скриптовете) на всяка страница в готовия site/ с текущата от
// lib/site-ui.js. Съдържанието (<main>), <title>, meta и JSON-LD не се пипат.
//
// Защо е отделна стъпка: част от страниците (профилите на изпълнителите,
// търсачката в договорите, CSV-тата) се генерират само от суровите ANAC данни,
// които не са в git (GB). Без проход като този нов дизайн би стигнал само до
// прегенерираните страници → два вида меню на един сайт. Проходът е
// идемпотентен: върху страница, току-що генерирана от page(), не променя нищо
// (тест: test/shell-site.test.js). Част е от `npm run site` и `npm run seo`.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { SITE_DIR } from './lib/paths.js';
import { shellHead, shellTop, shellBottom } from './lib/site-ui.js';

const RE_HEAD = /<script>[^<]*ost-theme[\s\S]*?<\/script>\s*<style>[\s\S]*?<\/style>/;
const RE_TOP = /<a href="#contenuto" class="skip">[\s\S]*?<\/header>/;
const RE_BOTTOM = /<footer class="site">[\s\S]*?(?=<\/body>)/;
const RE_REL = /class="brand" href="((?:\.\.\/)*)index\.html"/;
const RE_ACTIVE = /href="(?:\.\.\/)*([^"#?]+)" aria-current="page"/;
const RE_THEME_LIGHT = /(<meta name="theme-color" media="\(prefers-color-scheme: light\)" content=")[^"]*"/;
const RE_THEME_DARK = /(<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content=")[^"]*"/;

/**
 * Прилага текущата обвивка върху една страница. Чиста функция.
 * `percorso` = пътят на файла спрямо site/ (posix), напр. `fornitore/012.html`.
 * Връща `null`, ако страницата не носи обвивката на сайта (напр. външен HTML).
 * @param {string} html
 * @param {string} percorso
 * @returns {string|null}
 */
export function applicaShell(html, percorso) {
  const mRel = html.match(RE_REL);
  if (!mRel || !RE_HEAD.test(html) || !RE_TOP.test(html) || !RE_BOTTOM.test(html)) return null;
  const rel = mRel[1];
  // aria-current в СТАРОТО/текущото меню → резервният активен елемент
  const top = html.match(RE_TOP);
  const mAct = top ? top[0].match(RE_ACTIVE) : null;
  const active = mAct ? mAct[1] : '';
  const nuovoTop = shellTop({ rel, current: percorso, active });
  const nuovoBottom = shellBottom({ rel }) + '\n';
  return html
    .replace(RE_HEAD, () => shellHead())
    .replace(RE_THEME_LIGHT, '$1#f4f6f9"')
    .replace(RE_THEME_DARK, '$1#0b1219"')
    .replace(RE_TOP, () => nuovoTop)
    .replace(RE_BOTTOM, () => nuovoBottom);
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function htmlFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (d.name.endsWith('.html')) out.push(p);
  }
  return out.sort();
}

async function main() {
  let cambiate = 0;
  let saltate = 0;
  const files = await htmlFiles(SITE_DIR);
  for (const f of files) {
    const html = await readFile(f, 'utf8');
    const percorso = relative(SITE_DIR, f).split(sep).join('/');
    const nuovo = applicaShell(html, percorso);
    if (nuovo == null) {
      saltate++;
      continue;
    }
    if (nuovo !== html) {
      await writeFile(f, nuovo);
      cambiate++;
    }
  }
  console.log(`Обвивка: ${cambiate} страници обновени, ${files.length - cambiate - saltate} без промяна, ${saltate} без обвивка`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
