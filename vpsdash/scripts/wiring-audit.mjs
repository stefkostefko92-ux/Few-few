#!/usr/bin/env node
// Одит „връзките": какво е вързано, но не трябва, и какво трябва, но не е.
//
// Този клас дефекти не се вижда нито в тестовете, нито в браузъра, защото нищо
// не гърми — просто част от кода е мъртва, а друга част се извиква от място, за
// което не е писана. Расте тихо при всяка добавка и накрая никой не знае кое
// още работи.
//
// Проверява се само това, което може да се докаже машинно. Каквото иска
// преценка (дали една функция „трябва" да съществува) излиза като ДОКЛАД, не
// като провал — гейт, който гърми за вкус, се изключва след седмица.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const hard = [];
const soft = [];

const readAll = (dir, ext) =>
  fs.readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith(ext))
    .map((f) => ({ name: `${dir}/${f}`, text: fs.readFileSync(path.join(ROOT, dir, f), 'utf8') }));

const srcFiles = readAll('src', '.js');
const pubFiles = readAll('public', '.js');
const testFiles = readAll('test', '.js');
const scriptFiles = readAll('scripts', '.mjs');
const server = { name: 'server.js', text: fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8') };
const routes = srcFiles.find((f) => f.name === 'src/routes.js').text;
const app = pubFiles.find((f) => f.name === 'public/app.js').text;
const everything = [...srcFiles, ...pubFiles, ...testFiles, ...scriptFiles, server].map((f) => f.text).join('\n');

// ── 1. Изнесено, но неползвано никъде ────────────────────────────────────────
// Мъртъв износ значи или забравена работа, или код, който някой ще „поправи"
// без да знае, че никой не го вика.
for (const f of [...srcFiles, ...pubFiles]) {
  for (const m of f.text.matchAll(/^export (?:async )?function (\w+)|^export (?:const|class) (\w+)/gm)) {
    const name = m[1] || m[2];
    // Броим употребите ИЗВЪН собствения файл.
    const others = [...srcFiles, ...pubFiles, ...testFiles, ...scriptFiles, server].filter((o) => o.name !== f.name);
    const usedElsewhere = others.some((o) => new RegExp(`\\b${name}\\b`).test(o.text));
    if (!usedElsewhere) soft.push(`${f.name}: изнася „${name}", но никой друг файл не го ползва`);
  }
}

// ── 2. Маршрут, до който интерфейсът не стига ────────────────────────────────
// Маршрут без потребител е или мъртъв код, или възможност, която сме забравили
// да свържем — и двете си струва да се знаят.
const declared = [...routes.matchAll(/r\.(get|post|put|delete)\(\s*\n?\s*'([^']+)'/g)].map((m) => m[2]);
// Клиентът вика `api('/x')` БЕЗ префикса `/api`.
// Интерфейсът стига до сървъра по ПЕТ различни начина, не по един. Първата
// версия познаваше само `api('/x')` и обяви девет живи маршрута за мъртви —
// доклад с фалшиви тревоги се чете веднъж и после се игнорира завинаги.
const called = new Set();
const add = (raw) => called.add('/api/' + raw.split('?')[0].replace(/\$\{[^}]*\}/g, '*').replace(/\/+$/, ''));
const SHAPES = [
  /(?:api|runJob|streamJob|loadPanel)\([^)]*?`?'?\/([\w/:${}.?=&-]+)/g, // api('/x') · loadPanel(box, '/x', …)
  /sseUrl\(\s*`?'?\/([\w/:${}.?=&-]+)/g, //                              EventSource(sseUrl('/x'))
  /apiBase\(\)\s*\+\s*'\/([\w/:${}.?=&-]+)/g, //                        fetch(apiBase() + '/x')
  /['"`]\/api\/([\w/:${}.?=&-]+)/g, //                                   пълен път в низ
];
for (const rx of SHAPES) for (const m of app.matchAll(rx)) add(m[1]);
// Маршрути, които по замисъл НЕ се викат от браузъра.
const NOT_FROM_UI = new Map([
  ['/api/ping', 'здраве за съседа (машина-към-машина)'],
  ['/api/webhook/github', 'външна кука от GitHub'],
  ['/api/audit/mirror', 'съседът ПРАЩА към нас'],
  ['/api/backups/offsite/receive', 'съседът ПРАЩА към нас'],
  ['/api/audit/since', 'съседът ЧЕТЕ от нас'],
  ['/api/nodes/:id/*', 'прокси — пътят се сглобява динамично'],
]);
const wild = (p) => p.replace(/:[\w]+/g, '*');
for (const p of new Set(declared)) {
  if (NOT_FROM_UI.has(p)) continue;
  const w = wild(p);
  const used = [...called].some((c) => c === p || c === w || c.startsWith(w.replace(/\*$/, '')));
  if (!used) soft.push(`маршрут „${p}" не се вика от интерфейса`);
}

// ── 3. Секция без рендер / рендер без секция ─────────────────────────────────
const sections = [...app.matchAll(/\{ id: '([\w-]+)',[^}]*render: (\w+)/g)];
for (const [, id, fn] of sections) {
  if (!new RegExp(`(async )?function ${fn}\\b`).test(app)) hard.push(`секция „${id}" сочи към несъществуващ рендер „${fn}"`);
}
const renderFns = [...app.matchAll(/^(?:async )?function (render[A-Z]\w*)/gm)].map((m) => m[1]);
for (const fn of renderFns) {
  if (!sections.some(([, , f]) => f === fn) && !new RegExp(`${fn}\\s*\\(`).test(app.replace(new RegExp(`function ${fn}`), ''))) {
    soft.push(`рендерът „${fn}" не е закачен за нито една секция`);
  }
}

// ── 4. Ключове в конфига: записвани, но никога четени ────────────────────────
const config = srcFiles.find((f) => f.name === 'src/config.js').text;
const defaults = config.match(/const DEFAULTS = \{([\s\S]*?)\n\};/);
if (defaults) {
  for (const m of defaults[1].matchAll(/^\s{2}(\w+):/gm)) {
    const key = m[1];
    const uses = everything.split(`cfg.${key}`).length - 1 + everything.split(`cfg?.${key}`).length - 1;
    if (uses === 0) soft.push(`конфиг ключ „${key}" има подразбиране, но никой не го чете`);
  }
}

// ── 5. Икони, обявени в интерфейса, но липсващи на диска ─────────────────────
{
  const iconDir = path.join(ROOT, 'public/icons');
  const have = new Set(fs.existsSync(iconDir) ? fs.readdirSync(iconDir) : []);
  const wanted = new Set();
  for (const m of app.matchAll(/img: '([\w-]+)'/g)) wanted.add(m[1] + '.png');
  const ui = pubFiles.find((f) => f.name === 'public/ui.js').text;
  for (const m of ui.matchAll(/'(act-[\w-]+)'/g)) wanted.add(m[1] + '.png');
  for (const w of wanted) if (!have.has(w)) hard.push(`интерфейсът иска икона „${w}", която я няма в public/icons/`);
}

// ── 6. Преводи за низове, които никой не показва ─────────────────────────────
{
  const dict = fs.readFileSync(path.join(ROOT, 'public/i18n-dict.js'), 'utf8');
  const keys = [...dict.matchAll(/^\s{2}\['((?:[^'\\]|\\.)*)'/gm)].map((m) => m[1]);
  const uiText = [...pubFiles, { text: fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8') }]
    .map((f) => f.text).join('\n') + srcFiles.map((f) => f.text).join('\n');
  let dead = 0;
  for (const k of keys) {
    if (k.includes('⟦')) continue; // шаблон — сглобява се в движение
    const literal = k.replace(/\\'/g, "'");
    if (!uiText.includes(literal)) dead++;
  }
  if (dead) soft.push(`речникът пази ${dead} низа, които не се срещат никъде в кода (${keys.length} общо)`);
}

// ── 7. Дублирани ключове в речника ───────────────────────────────────────────
{
  const dict = fs.readFileSync(path.join(ROOT, 'public/i18n-dict.js'), 'utf8');
  const keys = [...dict.matchAll(/^\s{2}\['((?:[^'\\]|\\.)*)'/gm)].map((m) => m[1]);
  const seen = new Set();
  const dup = new Set();
  for (const k of keys) (seen.has(k) ? dup : seen).add(k);
  // Дублиран ключ значи, че вторият превод НИКОГА не се ползва — тих капан за
  // всеки, който после „поправя" грешния ред.
  for (const d of dup) hard.push(`речникът има ДВА реда за „${d.slice(0, 60)}" — вторият е мъртъв`);
}

if (hard.length) {
  console.error(`✘ Счупени връзки — ${hard.length}:`);
  hard.forEach((h) => console.error('  ·', h));
}
if (soft.length) {
  console.log(`\nℹ За човешко око — ${soft.length} (не гейтват):`);
  soft.forEach((s) => console.log('  ·', s));
}
if (hard.length) process.exit(1);
console.log('\n✔ Всяка секция има рендер, всяка икона съществува, нула дублирани преводи.');
