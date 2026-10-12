// Локализация — 73 езика. Всеки локал има точно ключовете на en, без празни
// съобщения, със същите $МАРКЕРИ$ и placeholders блокове, марката непокътната,
// лимитите на Chrome Web Store спазени, и листинг за магазина на езика си.
// Всеки data-i18n / t('…') ключ в кода съществува в en. node test/i18n.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { makeChecker } from './lib.mjs';

const { check, finish } = makeChecker();
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (...p) => readFileSync(path.join(ROOT, ...p), 'utf8');

const locales = readdirSync(path.join(ROOT, '_locales')).sort();
const msgs = {};
const broken = [];
for (const l of locales) {
  try {
    msgs[l] = JSON.parse(read('_locales', l, 'messages.json'));
  } catch (err) {
    broken.push(`${l}: ${err.message}`);
  }
}
check(
  `валиден JSON във всички ${locales.length} локала (${broken.join(' | ') || 'ok'})`,
  !broken.length,
);

const en = msgs.en;
const enKeys = Object.keys(en);
const langs = new Set(locales.map((l) => l.split('_')[0]));
check(
  `73 папки / 70 езика (${locales.length} папки, ${langs.size} езика)`,
  locales.length >= 73 && langs.size >= 70,
);
check(
  'RTL езиците са налице (ar, he, fa, ur)',
  ['ar', 'he', 'fa', 'ur'].every((l) => locales.includes(l)),
);

// марката и имената, които не се превеждат: ако ги има в en, трябва да ги има и в превода
const KEEP = ['Déjà', 'Chrome', 'Gemini Nano', 'Hugging Face', 'huggingface.co', '✓', 'https://'];
const tokens = (s) => s.match(/\$[A-Z_]+\$/g) || [];
const count = (s, needle) => s.split(needle).length - 1;

const enListing = read('store', 'listing', 'en.txt');
const ticks = count(enListing, '✓');
const problems = [];
for (const l of locales) {
  const d = msgs[l];
  if (!d) continue;
  const keys = Object.keys(d);
  const missing = enKeys.filter((k) => !(k in d));
  const extra = keys.filter((k) => !(k in en));
  if (missing.length) problems.push(`${l}: липсват ${missing.slice(0, 4).join(',')}`);
  if (extra.length) problems.push(`${l}: излишни ${extra.slice(0, 4).join(',')}`);
  for (const k of enKeys) {
    const m = d[k]?.message;
    if (typeof m !== 'string' || !m.trim()) {
      if (k in d) problems.push(`${l}: празно ${k}`);
      continue;
    }
    const want = tokens(en[k].message).sort().join();
    if (tokens(m).sort().join() !== want)
      problems.push(`${l}: ${k} маркери ${tokens(m).join('')}≠${want}`);
    if (JSON.stringify(d[k].placeholders) !== JSON.stringify(en[k].placeholders)) {
      problems.push(`${l}: ${k} placeholders блокът се различава`);
    }
    for (const keep of KEEP) {
      // „Chrome“ се склонява в много езици (cs „v Chromu“, fi „Chromessa“, pl „w Chrome'ie“)
      // — пазим основата, не буквалната форма
      const needle = keep === 'Chrome' ? 'Chrom' : keep;
      if (count(en[k].message, keep) && !count(m, needle))
        problems.push(`${l}: ${k} без „${keep}“`);
    }
  }
  const name = d.extName?.message || '';
  if (!name.startsWith('Déjà — ') || name.length > 75) problems.push(`${l}: extName „${name}“`);
  if ((d.extDesc?.message || '').length > 132)
    problems.push(`${l}: extDesc ${d.extDesc.message.length} > 132`);

  // листинг за магазина на езика
  const lp = path.join(ROOT, 'store', 'listing', `${l}.txt`);
  if (!existsSync(lp)) {
    problems.push(`${l}: няма store/listing/${l}.txt`);
    continue;
  }
  const listing = readFileSync(lp, 'utf8');
  const title = /^TITLE: (.+)$/m.exec(listing)?.[1]?.trim();
  const short = /^SHORT: (.+)$/m.exec(listing)?.[1]?.trim() || '';
  if (title !== name) problems.push(`${l}: TITLE в листинга ≠ extName`);
  if (!short || short.length > 132) problems.push(`${l}: SHORT ${short.length} знака`);
  if (count(listing, '✓') !== ticks)
    problems.push(`${l}: ${count(listing, '✓')} точки ✓ (en: ${ticks})`);
}
check(
  `всеки локал е пълен и съвместим с en (${problems.length} проблема${problems.length ? ': ' + problems.slice(0, 10).join(' | ') : ''})`,
  problems.length === 0,
);

// всеки ключ, който кодът ползва, съществува
const src = path.join(ROOT, 'src');
const files = readdirSync(src, { recursive: true }).filter((f) => /\.(html|js)$/.test(f));
const used = new Set();
for (const f of files) {
  const text = readFileSync(path.join(src, f), 'utf8');
  for (const m of text.matchAll(/data-i18n(?:-placeholder)?="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
  for (const m of text.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) used.add(m[1]);
  for (const m of text.matchAll(/getMessage\('([A-Za-z0-9_]+)'/g)) used.add(m[1]);
  for (const m of text.matchAll(/key: '([A-Za-z0-9_]+)'/g)) used.add(m[1]);
}
const notInEn = [...used].filter((k) => !(k in en));
check(
  `всеки ползван ключ съществува в en (${used.size} ползвани; липсват: ${notInEn.join(',') || 'няма'})`,
  !notInEn.length,
);
const manifest = read('manifest.json');
check(
  'манифестът е локализиран (__MSG_extName__ / __MSG_extDesc__)',
  /__MSG_extName__/.test(manifest) && /__MSG_extDesc__/.test(manifest),
);

finish();
