#!/usr/bin/env node
// Одит „реални обеми": панел, който работи на празна машина, не е доказан.
//
// Всичко тук расте с ВРЕМЕТО, не с натоварването — тоест проблемът не се появява
// при пускането, а след половин година, когато вече разчиташ на панела. Затова
// обемите се СЪЗДАВАТ изкуствено и се мери, вместо да се чака.
//
// Мерят се трите неща, които болят на голям обем: време за отговор, размер на
// отговора (той пътува до браузъра) и памет.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.CSD_VOLUME_PORT) || 7809;
const BASE = `http://127.0.0.1:${PORT}`;
const N_AUDIT = Number(process.env.CSD_VOLUME_AUDIT) || 100_000;
const N_HISTORY = Number(process.env.CSD_VOLUME_HISTORY) || 30_000;

const bad = [];
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? '✔' : '✘'} ${what}${detail ? ' — ' + detail : ''}`);
  if (!cond) bad.push(`${what}${detail ? ': ' + detail : ''}`);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-vol-'));
const stateDir = path.join(dir, 'state');
fs.mkdirSync(stateDir, { recursive: true });

// ── Дневник с истинска хеш-верига ────────────────────────────────────────────
// Изкуствен файл със СЧУПЕНА верига би измерил бърз изход по първата грешка,
// не истинската цена на проверката. Затова веригата се строи както в кода.
{
  const { hashLine } = await import(path.join(ROOT, 'src/audit.js')); // СЪЩИЯТ хеш, не приблизителен
  const out = fs.createWriteStream(path.join(stateDir, 'audit.jsonl'));
  let prev = 'GENESIS';
  const t0 = Date.now();
  for (let i = 0; i < N_AUDIT; i++) {
    const line = JSON.stringify({
      ts: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(),
      action: ['login', 'job.start', 'job.end', 'services.action', 'alert.firing'][i % 5],
      user: 'admin',
      detail: 'запис номер ' + i,
      prev,
    });
    prev = hashLine(line);
    if (!out.write(line + '\n')) await new Promise((r) => out.once('drain', r));
  }
  await new Promise((r) => out.end(r));
  fs.writeFileSync(path.join(stateDir, 'audit.head.json'),
    JSON.stringify({ count: N_AUDIT, lastHash: prev, at: new Date().toISOString() }));
  const mb = fs.statSync(path.join(stateDir, 'audit.jsonl')).size / 1048576;
  console.log(`дневник: ${N_AUDIT} записа, ${mb.toFixed(1)} MB (${Date.now() - t0} ms за строене)`);
}

// ── История на метриките ─────────────────────────────────────────────────────
{
  // Точките ЗАВЪРШВАТ в „сега": иначе прозорецът „последните 24 ч" не хваща нищо
  // и одитът мери празен отговор, вярвайки, че мери 30 000 точки.
  const HIST_START = Date.now() - N_HISTORY * 30000;
  const out = fs.createWriteStream(path.join(stateDir, 'metrics.jsonl'));
  for (let i = 0; i < N_HISTORY; i++) {
    const line = JSON.stringify({
      v: 2, ts: HIST_START + i * 30000,
      cpu: 10 + (i % 40), memUsed: 2e9 + i, memTotal: 8e9, memAvail: 6e9 - i, swapUsed: 0,
      load1: 0.5, rxBps: 1000 + i, txBps: 2000 + i, diskMax: 40 + (i % 30),
      disks: [['/', 40 + (i % 30), 5e10], ['/boot', 60, 3e8]], psi: null, steal: null,
    });
    if (!out.write(line + '\n')) await new Promise((r) => out.once('drain', r));
  }
  await new Promise((r) => out.end(r));
  const mb = fs.statSync(path.join(stateDir, 'metrics.jsonl')).size / 1048576;
  console.log(`история: ${N_HISTORY} точки, ${mb.toFixed(1)} MB`);
}

const cfgPath = path.join(dir, 'config.json');
const { hashPassword } = await import(path.join(ROOT, 'src/auth.js'));
const PASS = 'parola-za-odita-na-obemi';
fs.writeFileSync(cfgPath, JSON.stringify({
  passwordHash: hashPassword(PASS),
  sessionSecret: 'x'.repeat(64),
  nodeId: 'vol', nodeName: 'ОБЕМИ',
  host: '127.0.0.1', port: PORT,
  paths: { stateDir },
  alerts: { enabled: false },
}, null, 2), { mode: 0o600 });

const child = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, CSD_CONFIG: cfgPath, CSD_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const cleanup = () => { try { child.kill('SIGKILL'); } catch { /* мъртъв */ } };
process.on('exit', cleanup);
process.on('uncaughtException', (e) => { cleanup(); console.error(e); process.exit(1); });
let out = '';
child.stdout.on('data', (c) => (out += c));
child.stderr.on('data', (c) => (out += c));

const bootStart = Date.now();
await new Promise((res, rej) => {
  const iv = setInterval(() => { if (/VPS Dashboard — http:\/\//.test(out)) { clearInterval(iv); res(); } }, 20);
  child.on('exit', () => { clearInterval(iv); rej(new Error('панелът не тръгна:\n' + out)); });
  setTimeout(() => { clearInterval(iv); rej(new Error('таймаут при старт:\n' + out)); }, 60000);
});
const bootMs = Date.now() - bootStart;
// Стартът чете дневника, за да намери последния хеш и броя. Без таван това е
// цялата година наведнъж — и се плаща при ВСЕКИ рестарт, включително при
// автоматичното вдигане от systemd след срив.
ok(bootMs < 5000, 'панелът тръгва под 5 s с пълен дневник', `${bootMs} ms`);

const lg = await fetch(BASE + '/api/login', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-csd': '1' },
  body: JSON.stringify({ user: 'admin', password: PASS }),
});
const cookie = lg.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const H = { cookie, 'x-csd': '1' };

async function timed(pathname, budgetMs, maxKb) {
  const t0 = Date.now();
  const r = await fetch(BASE + pathname, { headers: H });
  const text = await r.text();
  const ms = Date.now() - t0;
  const kb = Buffer.byteLength(text) / 1024;
  ok(r.status === 200, `${pathname} отговаря 200`, String(r.status));
  ok(ms < budgetMs, `${pathname} под ${budgetMs} ms`, `${ms} ms`);
  ok(kb < maxKb, `${pathname} под ${maxKb} KB (пътува до браузъра)`, `${kb.toFixed(0)} KB`);
  return { ms, kb, text };
}

try {
  const au = await timed('/api/audit', 1500, 2048);
  ok(JSON.parse(au.text).entries?.length > 0, '/api/audit наистина връща записи',
    String(JSON.parse(au.text).entries?.length));

  const ver = await timed('/api/audit/verify', 8000, 8);
  const v = JSON.parse(ver.text);
  // 200 с `ok:false` е ПРОВАЛЕНА проверка, не успешна — а по код не се различава.
  ok(v.ok === true, 'веригата се проверява УСПЕШНО, не пада на първия ред', JSON.stringify(v).slice(0, 120));
  // Ротацията е ЗАКОННА (5 MB на файл), затова се очаква „почти всички", не
  // точно всички: първите записи може да са изпаднали от хоризонта. Важното е,
  // че проверката минава ПРЕЗ завъртените файлове, а не спира на текущия.
  ok(v.checked > N_AUDIT * 0.9, `обхожда почти всички ${N_AUDIT} записа (не само текущия файл)`, String(v.checked));
  ok(v.files >= 2, 'и наистина е минала през завъртените файлове', `${v.files} файла`);
  ok(Boolean(v.oldest), 'и КАЗВА докъде стига хоризонтът', String(v.oldest));

  const hist = await timed('/api/metrics/history?range=24h', 2000, 4096);
  const hp = JSON.parse(hist.text).points || [];
  ok(hp.length > 100, 'историята наистина връща точки в прозореца', String(hp.length));
  await timed('/api/overview', 3000, 256);

  // Паметта след всичко това: дневникът НЕ бива да остане в купа.
  const rssKb = Number(fs.readFileSync(`/proc/${child.pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]);
  ok(rssKb < 400_000, 'паметта остава разумна след четенето на всичко', `${(rssKb / 1024).toFixed(0)} MB`);

  // Повторни заявки: цената не бива да расте с всяко извикване.
  const a = await timed('/api/audit', 1500, 2048);
  const b = await timed('/api/audit', 1500, 2048);
  ok(Math.abs(b.ms - a.ms) < 1000, 'втората заявка не е драматично по-скъпа', `${a.ms} → ${b.ms} ms`);
} finally {
  const errs = out.split('\n').filter((l) => /\[csd\]|Error/.test(l));
  if (errs.length) console.log('\nсървърен лог:\n' + errs.slice(0, 8).join('\n'));
  child.kill('SIGTERM');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(bad.length ? `\n✘ ${bad.length} находки:\n  · ${bad.join('\n  · ')}` : '\n✔ Панелът издържа реален обем: време, размер и памет в границите.');
process.exit(bad.length ? 1 : 0);
