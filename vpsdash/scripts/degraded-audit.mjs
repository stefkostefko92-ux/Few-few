#!/usr/bin/env node
// Одит „деградирала машина": какво КАЗВА панелът, когато инструментът липсва.
//
// Доктрината е: „не знам" никога не значи „наред". Липсващ `docker` не е „нула
// контейнера", липсващ `systemctl` не е „нула услуги", липсващ `ufw` не е
// „защитната стена е изключена". Разликата е между панел, който мълчи честно, и
// панел, който УСПОКОЯВА — второто е по-опасно от никакъв панел.
//
// Скриптът пуска сървъра в среда БЕЗ системните инструменти (празен PATH освен
// node) и снима какво отговаря всеки маршрут. После търси „успокояващи нули":
// празен отговор без нито един признак, че данните липсват.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.CSD_DEGRADED_PORT) || 7802;
const ROOT = path.resolve(import.meta.dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-degraded-'));

// Празен PATH: остава само папката на node, за да тръгне самият процес.
const nodeDir = path.dirname(process.execPath);
const child = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PATH: nodeDir, CSD_DEV: '1', CSD_STATE_DIR: dir, CSD_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (c) => (out += c));
child.stderr.on('data', (c) => (out += c));

const pw = await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('сървърът не тръгна:\n' + out)), 15000);
  const iv = setInterval(() => {
    const m = out.match(/парола "([^"]+)"/);
    if (m) { clearInterval(iv); clearTimeout(t); res(m[1]); }
  }, 150);
});

const B = `http://127.0.0.1:${PORT}`;
const lg = await fetch(B + '/api/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-csd': '1' },
  body: JSON.stringify({ user: 'admin', password: pw }),
});
const cookie = lg.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

const routes = [...new Set([...fs.readFileSync(path.join(ROOT, 'src/routes.js'), 'utf8').matchAll(/r\.get\('([^']+)'/g)].map((m) => m[1]))]
  .filter((r) => !r.includes(':') && !r.startsWith('/api/terminal') && !r.startsWith('/api/pty') && !r.includes('/stream'));

// Признак, че отговорът ПРИЗНАВА липсата: null вместо празен списък, или дума,
// която казва „не мога да проверя". Нула + нито един такъв признак = лъжа.
// `null` е каноничният признак за „не знам" в целия панел (за разлика от `[]`
// = „проверих, няма нищо") — затова се брои за признание.
const ADMITS = /(:\s*null|"(available|unknown|denied|missing)"\s*:\s*(false|true|\[)|неизвестн|не мога|липсв|не е инсталиран|няма достъп|недостъпн|не знам|непровер|unavailable)/i;

// Прегледани от човек: празният им отговор е ПОТВЪРДЕНА нула, не незнание.
// Списъкът е храпов механизъм — нов маршрут, който мълчи, изскача веднага.
// Причината се пише тук, за да не се приема наум втори път.
const REVIEWED = new Map([
  ['/api/auth/info', 'totp:false е истинското състояние, не липса на проверка'],
  ['/api/jobs', 'празно = наистина няма задачи в движение'],
  ['/api/agents/memories', 'няма памети = агентският слой не е разгърнат тук'],
  ['/api/env', 'няма .env файлове = няма продукти на тази машина'],
  ['/api/volumes/archives', 'няма архиви на томове = още не е правен нито един'],
  ['/api/probe/targets', 'нищо конфигурирано = нищо конфигурирано'],
  ['/api/accesslog/files', 'няма лог папка, защото няма уеб сървър — алармата за уеб сървъра го казва'],
  ['/api/backups', 'алармата за липсващ/остарял бекъп гърми отделно и силно'],
]);

const lies = [];
const crashes = [];
const rows = [];
for (const p of routes) {
  let r, body;
  try {
    r = await fetch(B + p, { headers: { cookie } });
    body = await r.text();
  } catch (e) {
    crashes.push(`${p}: заявката гръмна — ${e.message}`);
    continue;
  }
  // 5xx, което КАЗВА кой инструмент липсва, е правилният изход, не провал:
  // сървърът работи, просто на машината няма с какво да се провери. Провал е
  // само безлично „Вътрешна грешка" — от него човек търси бъг в панела.
  if (r.status >= 500) {
    if (/липсва на тази машина/.test(body)) { rows.push([p, r.status, 'липсващ инструмент, назован']); continue; }
    crashes.push(`${p} -> ${r.status} ${body.slice(0, 120)}`);
    continue;
  }
  if (r.status !== 200) { rows.push([p, r.status, '(не 200)']); continue; }

  let data;
  try { data = JSON.parse(body); } catch { rows.push([p, 200, '(не е JSON)']); continue; }

  // Празен ли е отговорът по същество?
  const empty =
    data === null ||
    (Array.isArray(data) && data.length === 0) ||
    (data && typeof data === 'object' && Object.values(data).every((v) => v === null || v === 0 || v === false || (Array.isArray(v) && !v.length)));
  const admits = ADMITS.test(body);
  rows.push([p, 200, empty ? (admits ? 'празно, но ПРИЗНАТО' : 'ПРАЗНО и МЪЛЧИ') : 'има данни']);
  if (empty && !admits && !REVIEWED.has(p)) lies.push(`${p} -> ${body.slice(0, 160)}`);
}

console.log(`проверени маршрути: ${rows.length}`);
if (crashes.length) {
  console.error('\n✘ Гръмнали (5xx) при липсващ инструмент:');
  crashes.forEach((c) => console.error('  ·', c));
}
if (lies.length) {
  console.error('\n⚠ Празен отговор БЕЗ признак, че данните липсват („успокояваща нула"):');
  lies.forEach((l) => console.error('  ·', l));
}
child.kill('SIGTERM');
fs.rmSync(dir, { recursive: true, force: true });

if (crashes.length) process.exit(1);
if (lies.length) process.exit(2);
console.log('✔ Нито един маршрут не гърми и нито един не успокоява с празна нула.');
