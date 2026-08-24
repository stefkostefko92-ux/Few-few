#!/usr/bin/env node
// Одит „повредено състояние": вдига ли се панелът, когато СОБСТВЕНИТЕ му файлове
// са счупени — и казва ли го, вместо да мълчи.
//
// Защо: панелът е инструментът, с който човек оправя счупена машина. Ако той сам
// пада при отрязан JSON (прекъснато захранване по средата на запис, пълен диск,
// повреден сектор), човекът остава без ръце точно в момента, в който му трябват.
// Доктрината е същата като при алармите: fail-closed за ДЕЙСТВИЯТА, но никога
// fail-silent за ЗНАНИЕТО — повреденият файл се КАЗВА, не се преглъща.
//
// Всеки случай: 1) вдига се сървър с валидно състояние, 2) спира се, 3) файлът се
// поврежда по конкретен начин, 4) сървърът се вдига отново и се пита.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.CSD_CORRUPT_PORT) || 7805;
const BASE = `http://127.0.0.1:${PORT}`;

// Изчаква изхода на процес, който МОЖЕ ВЕЧЕ да е излязъл: `child.on('exit')`
// след факта не се задейства никога и одитът увисва точно в случая, който търси.
function waitExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((res) => child.on('exit', res));
}

function start(stateDir) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, CSD_DEV: '1', CSD_STATE_DIR: stateDir, CSD_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (c) => (out += c));
  child.stderr.on('data', (c) => (out += c));
  // Чака се редът за СЛУШАНЕ, не редът с паролата: паролата се печата преди
  // `listen()`, значи заявка веднага след нея удря затворена врата.
  const ready = new Promise((res) => {
    const iv = setInterval(() => {
      const m = out.match(/парола "([^"]+)"/);
      if (m && /VPS Dashboard — http:\/\//.test(out)) { clearInterval(iv); res({ ok: true, pw: m[1] }); }
    }, 100);
    child.on('exit', (code) => { clearInterval(iv); res({ ok: false, code, out }); });
    setTimeout(() => { clearInterval(iv); res({ ok: false, code: null, out, timeout: true }); }, 15000);
  });
  return { child, ready, log: () => out };
}

async function login(pw) {
  const r = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csd': '1' },
    body: JSON.stringify({ user: 'admin', password: pw }),
  });
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

// Как се поврежда файл — трите начина, които се случват НАИСТИНА.
const DAMAGE = {
  'отрязан по средата': (buf) => buf.slice(0, Math.max(1, Math.floor(buf.length * 0.6))),
  'нули (лош сектор)': (buf) => Buffer.alloc(buf.length, 0),
  'празен (прекъснат запис)': () => Buffer.alloc(0),
};

const problems = [];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-corrupt-'));

// 1) Първо пускане: напълва state с истински файлове.
{
  const s = start(dir);
  const r = await s.ready;
  if (!r.ok) { console.error('✘ Чистото пускане се провали:\n' + (r.out || '')); process.exit(1); }
  const cookie = await login(r.pw);
  // Няколко заявки, за да се родят одитът, историята и базовите линии.
  // Колкото повече секции се докоснат, толкова повече state файлове се раждат —
  // а одитът може да поврежда само това, което съществува.
  for (const p of [
    '/api/metrics', '/api/alerts', '/api/audit', '/api/sessions', '/api/history?hours=1',
    '/api/overview', '/api/security', '/api/slo', '/api/guardians', '/api/backups',
    '/api/probe/targets', '/api/traffic', '/api/posture', '/api/domains', '/api/agents/fleet',
  ]) {
    await fetch(BASE + p, { headers: { cookie } }).catch(() => {});
  }
  await new Promise((res) => setTimeout(res, 2500));
  s.child.kill('SIGTERM');
  await waitExit(s.child);
}

const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
console.log(`файлове в state: ${files.length} (${files.join(', ')})`);
if (!files.length) { console.error('✘ Нищо не се е записало — одитът няма какво да поврежда.'); process.exit(1); }

for (const file of files) {
  const full = path.join(dir, file);
  const original = fs.readFileSync(full);
  for (const [how, fn] of Object.entries(DAMAGE)) {
    fs.writeFileSync(full, fn(original));
    const s = start(dir);
    const r = await s.ready;
    if (!r.ok) {
      problems.push(`${file} · ${how}: панелът НЕ СЕ ВДИГА (изход ${r.code})\n      ${(r.out || '').split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 220)}`);
    } else {
      // Вдига се — но отговаря ли, или всяка заявка гърми?
      const cookie = await login(r.pw);
      const bad = [];
      for (const p of ['/api/metrics', '/api/alerts', '/api/audit', '/api/sessions', '/api/history?hours=1', '/api/overview']) {
        const res = await fetch(BASE + p, { headers: { cookie } }).catch((e) => ({ status: 0, err: e.message }));
        if (res.status >= 500 || res.status === 0) bad.push(`${p} -> ${res.status}${res.err ? ' ' + res.err : ''}`);
      }
      if (bad.length) problems.push(`${file} · ${how}: вдига се, но ${bad.join(', ')}`);
    }
    s.child.kill('SIGKILL');
    await waitExit(s.child);
    fs.writeFileSync(full, original);
  }
}

// ── Повреден КОНФИГ — най-високият залог ─────────────────────────────────────
// Тук паднеш ли, човек няма как да влезе в панела и остава само със SSH. А до
// повредения файл стои копие на последния валиден конфиг, което `saveConfig`
// пише при всяка промяна.
{
  const cdir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-cfg-'));
  const cfgPath = path.join(cdir, 'config.json');
  const good = {
    passwordHash: null, // попълва се долу с истински хеш
    sessionSecret: 'x'.repeat(64),
    nodeName: 'ОТ-КОПИЕТО',
    host: '127.0.0.1',
    port: PORT,
    paths: { stateDir: path.join(cdir, 'state') },
  };
  const { hashPassword } = await import(path.join(ROOT, 'src/auth.js'));
  const PASS = 'тест-парола-за-одита-1234';
  good.passwordHash = hashPassword(PASS);
  fs.writeFileSync(`${cfgPath}.bak`, JSON.stringify(good, null, 2), { mode: 0o600 });

  for (const [how, fn] of Object.entries(DAMAGE)) {
    fs.writeFileSync(cfgPath, fn(Buffer.from(JSON.stringify(good))));
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, CSD_CONFIG: cfgPath, CSD_PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    const up = await new Promise((res) => {
      const iv = setInterval(() => { if (/VPS Dashboard — http:\/\//.test(out)) { clearInterval(iv); res(true); } }, 100);
      child.on('exit', () => { clearInterval(iv); res(false); });
      setTimeout(() => { clearInterval(iv); res(false); }, 15000);
    });
    if (!up) {
      problems.push(`config.json · ${how}: панелът НЕ СЕ ВДИГА, макар до него да стои валидно .bak копие`);
    } else {
      if (!/ПОВРЕДЕН/.test(out)) problems.push(`config.json · ${how}: вдига се от копието, но МЪЛЧИ за това`);
      const r = await fetch(BASE + '/api/login', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-csd': '1' },
        body: JSON.stringify({ user: 'admin', password: PASS }),
      }).catch(() => ({ status: 0 }));
      if (r.status !== 200) problems.push(`config.json · ${how}: вдига се, но входът не работи (${r.status})`);
      else {
        const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
        const me = await (await fetch(BASE + '/api/me', { headers: { cookie } })).json();
        if (!me.recovered) problems.push(`config.json · ${how}: интерфейсът не научава, че върви от копие`);
      }
      // Повреденият файл е ДОКАЗАТЕЛСТВО — панелът не бива да го е презаписал.
      const now = fs.readFileSync(cfgPath);
      if (now.equals(Buffer.from(JSON.stringify(good, null, 2)))) {
        problems.push(`config.json · ${how}: повреденият файл е ПРЕЗАПИСАН — следата от инцидента изчезна`);
      }
    }
    child.kill('SIGKILL');
    await waitExit(child);
  }
  console.log(`конфиг: ${Object.keys(DAMAGE).length} вида повреда проверени`);
  fs.rmSync(cdir, { recursive: true, force: true });
}

fs.rmSync(dir, { recursive: true, force: true });

if (problems.length) {
  console.error(`\n✘ Повредено състояние — ${problems.length} проблема:`);
  problems.forEach((p) => console.error('  ·', p));
  process.exit(1);
}
console.log(`✔ ${files.length} файла × ${Object.keys(DAMAGE).length} вида повреда: панелът се вдига и отговаря на всяка.`);
