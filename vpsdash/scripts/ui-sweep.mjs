#!/usr/bin/env node
// Браузърна обиколка на ВСИЧКИ секции — гейт срещу счупен рендер.
//
// Защо съществува: `node --test` не рендва интерфейс, а `node --check` вижда само
// синтаксис. Променлива, декларирана в грешен обхват, минава и двете и чупи ЦЯЛА
// секция („broken is not defined" в „Ъпдейти" — реален случай). Единственото,
// което го хваща, е истински браузър пред истински сървър.
//
// Пуска се РЪЧНО (иска Playwright, който не е зависимост на продукта):
//   node scripts/ui-sweep.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PW_PATH = process.env.CSD_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs';
let chromium;
try {
  ({ chromium } = await import(PW_PATH));
} catch {
  console.error('⚠ Playwright не е намерен (' + PW_PATH + ') — обиколката се пропуска.');
  process.exit(0);
}

const PORT = Number(process.env.CSD_SWEEP_PORT) || 7791;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-sweep-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, CSD_DEV: '1', CSD_STATE_DIR: dir, CSD_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (c) => (out += c));
const pw = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('сървърът не тръгна за 15 s')), 15000);
  const iv = setInterval(() => {
    const m = out.match(/парола "([^"]+)"/);
    if (m) { clearInterval(iv); clearTimeout(t); resolve(m[1]); }
  }, 200);
});

const problems = [];
const b = await chromium.launch({ executablePath: process.env.CSD_CHROMIUM || '/opt/pw-browsers/chromium' });
try {
  // И трите езика: преводът се закача в `el()`/`toast()`, значи секция, която
  // сглобява текст по друг път, се чупи САМО на превод. Български проход не го
  // вижда изобщо — там всеки низ е и ключ, и стойност.
  for (const lang of (process.env.CSD_SWEEP_LANGS || 'bg,en,it').split(',')) {
    const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
    pg.on('pageerror', (e) => problems.push(`[${lang}] JS: ` + e.message.slice(0, 120)));
    pg.on('response', (r) => { if (r.status() >= 500) problems.push(`[${lang}] ${r.status()} ${r.url().replace(/^http:\/\/[^/]+/, '')}`); });
    await pg.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await pg.evaluate((l) => localStorage.setItem('csd.lang', l), lang);
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await pg.fill('#login-user', 'admin');
    await pg.fill('#login-pass', pw);
    await pg.click('button[type=submit]');
    await pg.waitForSelector('nav', { timeout: 15000 });
    const labels = await pg.locator('#nav button span:nth-child(2)').allTextContents();
    for (const label of labels) {
      await pg.click(`#nav button:has-text("${label}")`, { timeout: 8000 });
      // Чака СКЕЛЕТЪТ да си отиде, не фиксирано време: „Ъпдейти" пита apt (~2 s)
      // и при кратко чакане се мереше скелетът — а той няма текст, значи гейтът
      // щеше да вика „празен изглед" за напълно здрава секция.
      try {
        await pg.waitForFunction(() => !document.querySelector('#view .skeleton'), null, { timeout: 25000 });
      } catch {
        problems.push(`[${lang}] ${label}: не се дорендва за 25 s`);
        continue;
      }
      await pg.waitForTimeout(200);
      const txt = ((await pg.locator('#view').textContent()) || '').trim();
      // „Грешка: …" е как `go()` съобщава провалил се рендер — точно това търсим.
      // На чужд език префиксът е преведен, затова се търси и по двата варианта.
      if (/^(Грешка|Error|Errore):/.test(txt)) problems.push(`[${lang}] ${label}: ${txt.slice(0, 100)}`);
      if (!txt) problems.push(`[${lang}] ${label}: празен изглед`);
    }
    const missing = await pg.evaluate(() => [...(window.__i18nMissing || [])]);
    if (missing.length) {
      problems.push(`[${lang}] непреведени низове: ${missing.length}`);
      if (process.env.CSD_SWEEP_LIST) fs.appendFileSync(process.env.CSD_SWEEP_LIST, missing.map((m) => lang + '\t' + JSON.stringify(m)).join('\n') + '\n');
    }
    console.log(`[${lang}] обиколени секции: ${labels.length}, непреведени: ${missing.length}`);
    await pg.close();
  }
} finally {
  await b.close();
  child.kill('SIGTERM');
  fs.rmSync(dir, { recursive: true, force: true });
}

if (problems.length) {
  console.error('\n✘ Намерени проблеми:');
  problems.forEach((p) => console.error('  ·', p));
  process.exit(1);
}
console.log('✔ Всяка секция се рендва, нула JS грешки, нула 5xx, нула непреведени.');
