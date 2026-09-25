#!/usr/bin/env node
// Одит „документите срещу реалността".
//
// Защо: документ, който лъже, е по-лош от липсващ. Липсващият праща човека да
// чете кода; лъжещият го праща по грешен път с увереност — и точно това вече ни
// се случи веднъж на живо (README сочеше certbot към стар домейн и издаването
// падаше, докато някой не се сети да сравни).
//
// Документацията гние по три начина и трите се проверяват машинно:
//   1. ПЪТИЩА към файлове, които вече ги няма (преименувани, изтрити);
//   2. КОМАНДИ, които вече не съществуват (npm script, преименуван скрипт);
//   3. ЧИСЛА и имена, които дрейфват (брой секции, домейн, версия на Node).
//
// Каквото не може да се провери машинно (смисълът на едно изречение) не се
// преструва на проверено — то е за човешко око и не се брои за гейт.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const REPO = path.resolve(ROOT, '..');
const bad = [];
const note = (msg) => bad.push(msg);

// Авторитетно: самият git решава кое е нарочно извън дървото.
function gitIgnored(rel) {
  for (const base of [ROOT, REPO]) {
    const r = spawnSync('git', ['check-ignore', '-q', rel], { cwd: base });
    if (r.status === 0) return true;
  }
  return false;
}

const DOCS = ['README.md', 'CLAUDE.md', 'SECURITY.md'].map((f) => ({ f, text: fs.readFileSync(path.join(ROOT, f), 'utf8') }));

// ── 1. Пътища, споменати в документите ───────────────────────────────────────
// Само пътища, които ЯВНО сочат наш файл: `deploy/x.sh`, `src/y.js`, `scripts/z.mjs`.
// Разширението НЕ се изброява: списък с познати разширения пропуска точно
// сгрешеното име (`nginx.conf.НЯМА-ГО` не завършва на нищо познато и одитът го
// подминаваше — доказано мутационно). Взима се всичко след „папка/" до първия
// празен знак; крайната пунктуация от прозата се маха отделно.
const PATH_RX = /(?:^|[\s(`'"])((?:deploy|src|public|scripts|test)\/[^\s)`'"|,]+)/g;
for (const { f, text } of DOCS) {
  const seen = new Set();
  for (const m of text.matchAll(PATH_RX)) {
    const p = m[1].replace(/[.,;:]+$/, '');
    // Папка (без разширение) и шаблон с променлива не са файлове.
    // Разширението може да е и на кирилица (сгрешено име в документ). `\w` не
    // покрива кирилица, значи проверката подминаваше точно сгрешените имена —
    // доказано мутационно.
    if (!/\.[^\s./]+$/.test(p) || p.includes('$') || p.includes('*')) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    if (fs.existsSync(path.join(ROOT, p)) || fs.existsSync(path.join(REPO, p))) continue;
    // Файл в `.gitignore` ЛИПСВА нарочно: тайните живеят само на сървъра
    // (`deploy/desktop/desktop.env`, `restic.env`). Документът е прав да го
    // споменава — точно защото го няма в репото, човек трябва да научи отнякъде
    // за него. Питаме git, вместо да гадаем по шаблони.
    if (gitIgnored(p)) continue;
    note(`${f}: сочи към несъществуващ файл „${p}"`);
  }
}

// ── 2. npm скриптове, споменати в документите ────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
for (const { f, text } of DOCS) {
  const seen = new Set();
  for (const m of text.matchAll(/npm run ([\w-]+)/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    if (!pkg.scripts[m[1]]) note(`${f}: описва „npm run ${m[1]}", а такъв скрипт няма`);
  }
  // `npm test` е специален (без `run`).
  if (/npm test/.test(text) && !pkg.scripts.test) note(`${f}: описва „npm test", а такъв скрипт няма`);
}

// Обратно: гейт-проверка без нито едно споменаване е скрита от човека.
{
  const all = DOCS.map((d) => d.text).join('\n');
  for (const name of Object.keys(pkg.scripts)) {
    if (['start', 'dev'].includes(name)) continue;
    if (!all.includes(`npm run ${name}`) && !(name === 'test' && all.includes('npm test'))) {
      note(`нито един документ не споменава „npm run ${name}" — проверка, за която никой няма да научи`);
    }
  }
}

// ── 3. Домейнът ──────────────────────────────────────────────────────────────
// Живият домейн е ЕДИН. Пример със стар домейн не е безобиден: човек го копира
// дословно, certbot издава за грешно име и после чака лимита на Let's Encrypt.
const DOMAIN = 'vps.carbonstealth.eu';
for (const { f, text } of DOCS) {
  // Всеки `vpsN.carbonstealth.eu` изглежда като жив адрес и се копира дословно.
  // Точно това счупи certbot веднъж. Шаблоните ТРЯБВА да са очевидни
  // (`example.com`), не правдоподобни.
  for (const m of text.matchAll(/\b(vps[\w-]*\.carbonstealth\.eu)\b/g)) {
    if (m[1] !== DOMAIN) {
      note(f + ': ползва „' + m[1] + '" — остаряло или шаблон, който изглежда истински (живият е „' + DOMAIN + '")');
    }
  }
}

// ── 4. Броят секции в интерфейса ─────────────────────────────────────────────
// README изброява секциите в таблица. Разминаване значи, че цяла възможност е
// невидима за човек, който чете документа, вместо да щрака наслуки.
const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
// Сравняват се ИМЕНАТА, не броят: „34 срещу 37" не казва кои три липсват, а
// точно това е нужното, за да се поправи.
const sectionLabels = app
  .split('\n')
  .filter((l) => /^\s*\{ id: /.test(l))
  .map((l) => (l.match(/label: '((?:[^'\\]|\\.)*)'/) || [])[1])
  .filter(Boolean);
const readme = DOCS.find((d) => d.f === 'README.md').text;
const tableRows = [...readme.matchAll(/^\|\s*\*\*([^*|]+)\*\*\s*\|/gm)].map((m) => m[1].trim());
if (sectionLabels.length && tableRows.length) {
  const missing = sectionLabels.filter((l) => !tableRows.includes(l));
  const extra = tableRows.filter((r) => !sectionLabels.includes(r));
  if (missing.length) note('README не описва секциите: ' + missing.join(', ') + ' — цяла възможност, невидима за четящия');
  if (extra.length) note('README описва несъществуващи секции: ' + extra.join(', '));
}

// ── 5. Изискваната версия на Node ────────────────────────────────────────────
const engine = pkg.engines?.node || '';
for (const { f, text } of DOCS) {
  for (const m of text.matchAll(/Node\s*≥\s*(\d+)/g)) {
    if (!engine.includes(m[1])) note(`${f}: пише „Node ≥${m[1]}", а package.json иска „${engine}"`);
  }
}

// ── 6. Оформлението в CLAUDE.md срещу диска ──────────────────────────────────
// Блокът „## Оформление" е картата на проекта; изгние ли, всяко търсене тръгва
// от грешно място.
{
  const claude = DOCS.find((d) => d.f === 'CLAUDE.md').text;
  const block = claude.match(/## Оформление\n```([\s\S]*?)```/);
  if (!block) note('CLAUDE.md: липсва блокът „## Оформление"');
  else {
    for (const m of block[1].matchAll(/^(src\/[\w-]+\.js|scripts\/[\w-]+\.mjs|test\/)/gm)) {
      if (!fs.existsSync(path.join(ROOT, m[1]))) note(`CLAUDE.md (Оформление): „${m[1]}" вече го няма`);
    }
    // Обратно: скрипт на диска, който картата НЕ споменава.
    for (const f of fs.readdirSync(path.join(ROOT, 'scripts'))) {
      if (!block[1].includes(`scripts/${f}`)) note(`CLAUDE.md (Оформление): „scripts/${f}" го има на диска, но не е в картата`);
    }
  }
}

// ── 7. Конфигът, който install.sh пише, срещу това, което кодът чака ─────────
{
  const install = fs.existsSync(path.join(ROOT, 'deploy/install.sh'))
    ? fs.readFileSync(path.join(ROOT, 'deploy/install.sh'), 'utf8')
    : null;
  if (!install) note('deploy/install.sh липсва — README описва инсталация, която я няма');
  else {
    // Задължителните ключове: без тях `loadConfig` хвърля и панелът не тръгва.
    for (const key of ['passwordHash', 'sessionSecret', 'paths', 'stateDir']) {
      if (!install.includes(key)) note(`deploy/install.sh не пише „${key}" — панелът няма да тръгне след инсталация`);
    }
    for (const ref of [...install.matchAll(/deploy\/([\w.-]+)/g)]) {
      // Пътищата се срещат и в проза („виж deploy/install.sh.") — крайната
      // пунктуация не е част от името.
      const name = ref[1].replace(/[.,;:]+$/, '');
      const p = path.join(ROOT, 'deploy', name);
      if (!fs.existsSync(p) && !name.includes('$')) note('deploy/install.sh сочи към „deploy/' + name + '", което го няма');
    }
  }
}

if (bad.length) {
  console.error(`✘ Документите се разминават с реалността — ${bad.length}:`);
  bad.forEach((b) => console.error('  ·', b));
  process.exit(1);
}
console.log('✔ Всеки път, команда, домейн и число в документите съвпада с кода.');
