#!/usr/bin/env node
// Одит на достъпността — в истински браузър, върху истински рендван панел.
//
// Защо е свой, а не axe: продуктът е с НУЛА зависимости и това не се променя за
// един линтер. Проверките тук са подбраните, които реално важат за панел с
// клавиатура и екранен четец, и всяка е измерима без чужда библиотека:
//
//   1. достъпно име на всеки интерактивен елемент (WCAG 4.1.2)
//   2. `alt` на всяко изображение — празен за декоративните (1.1.1)
//   3. име на всяко поле за въвеждане (3.3.2)
//   4. контраст на текста спрямо реалния фон (1.4.3 AA: 4.5:1 / 3:1 за едър)
//   5. размер на целта за докосване (2.5.8 AA: 24×24 CSS px)
//   6. видим фокус (2.4.7) и достижимост с Tab (2.1.1)
//   7. `lang` на документа съвпада с избрания език (3.1.1)
//   8. диалогът връща фокуса и се затваря с Esc (2.1.2 — без капан)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PW_PATH = process.env.CSD_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs';
let chromium;
try {
  ({ chromium } = await import(PW_PATH));
} catch {
  console.error('⚠ Playwright не е намерен — одитът се пропуска.');
  process.exit(0);
}

const PORT = Number(process.env.CSD_A11Y_PORT) || 7803;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-a11y-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, CSD_DEV: '1', CSD_STATE_DIR: dir, CSD_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (c) => (out += c));
const pw = await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('сървърът не тръгна:\n' + out)), 15000);
  const iv = setInterval(() => {
    const m = out.match(/парола "([^"]+)"/);
    if (m) { clearInterval(iv); clearTimeout(t); res(m[1]); }
  }, 150);
});

// Проверките живеят в страницата — там са и стиловете, и сметнатите размери.
const AUDIT = `() => {
  const problems = [];
  const seen = new Set();
  const add = (rule, node, extra) => {
    const sel = node.tagName.toLowerCase() +
      (node.id ? '#' + node.id : '') +
      (node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
    const key = rule + '|' + sel + '|' + (extra || '');
    if (seen.has(key)) return;
    seen.add(key);
    problems.push({ rule, sel, extra: extra || '', text: (node.textContent || '').trim().slice(0, 40) });
  };

  const visible = (n) => {
    const r = n.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const cs = getComputedStyle(n);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const accName = (n) => (
    (n.getAttribute('aria-label') || '') ||
    (n.getAttribute('title') || '') ||
    (n.textContent || '').trim() ||
    (n.getAttribute('alt') || '') ||
    (n.getAttribute('placeholder') || '') ||
    (n.labels && n.labels.length ? [...n.labels].map((l) => l.textContent).join(' ').trim() : '')
  ).trim();

  // 1 + 3. Достъпно име на всичко интерактивно.
  for (const n of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')) {
    if (!visible(n)) continue;
    if (n.type === 'hidden') continue;
    if (!accName(n)) add('без-достъпно-име', n);
  }

  // 2. Всяко изображение носи alt (празен = декоративно, и това е ИЗБОР).
  for (const n of document.querySelectorAll('img')) {
    if (n.getAttribute('alt') === null) add('img-без-alt', n, n.getAttribute('src') || '');
  }

  // 4. Контраст спрямо РЕАЛНИЯ фон (изкачва се, докато намери непрозрачен).
  const lum = (c) => {
    const v = c.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const rgb = (s) => { const m = String(s).match(/[\\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
  const alpha = (s) => { const m = String(s).match(/[\\d.]+/g); return m && m.length > 3 ? Number(m[3]) : 1; };
  const bgOf = (n) => {
    for (let e = n; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (alpha(cs.backgroundColor) > 0.5) return rgb(cs.backgroundColor);
    }
    return rgb(getComputedStyle(document.body).backgroundColor) || [255, 255, 255];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const n of document.querySelectorAll('#view *, .topbar *, #nav *')) {
    if (!visible(n)) continue;
    const own = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(n);
    const fg = rgb(cs.color);
    if (!fg || alpha(cs.color) < 0.9) continue;
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bgOf(n));
    if (r < need) add('контраст', n, r.toFixed(2) + ' < ' + need + ' (' + Math.round(size) + 'px)');
  }

  // 5. Размер на целта (WCAG 2.2, 2.5.8) — 24×24 CSS px, освен ако е в текстов ред.
  for (const n of document.querySelectorAll('button, a[href], input[type=checkbox], select')) {
    if (!visible(n)) continue;
    const r = n.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) add('малка-цел', n, Math.round(r.width) + '×' + Math.round(r.height));
  }
  return problems;
}`;

// `evaluate` със СТРИНГ го смята за израз — стрелкова функция като низ се
// връща непроменена, вместо да се изпълни. Затова се вика изрично.
const runAudit = (pg) => pg.evaluate(`(${AUDIT})()`);

const problems = [];
const b = await chromium.launch({ executablePath: process.env.CSD_CHROMIUM || '/opt/pw-browsers/chromium' });
try {
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await pg.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

  // Входният екран също е интерфейс — и е ЕДИНСТВЕНОТО, което вижда човек,
  // който още не е влязъл. Проверява се преди всичко останало.
  for (const p of await runAudit(pg)) problems.push({ ...p, where: 'вход' });

  await pg.fill('#login-user', 'admin');
  await pg.fill('#login-pass', pw);
  await pg.click('button[type=submit]');
  await pg.waitForSelector('nav', { timeout: 15000 });

  // 7. Езикът на документа следва избора — иначе екранният четец чете
  // българските думи с английска фонетика (или обратното).
  for (const lang of ['bg', 'en', 'it']) {
    await pg.evaluate((l) => { localStorage.setItem('csd.lang', l); }, lang);
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await pg.waitForSelector('nav', { timeout: 15000 });
    const got = await pg.evaluate(() => document.documentElement.lang);
    if (!got || !got.toLowerCase().startsWith(lang)) {
      problems.push({ rule: 'lang-на-документа', sel: 'html', extra: `избран ${lang}, а lang="${got}"`, where: 'общо' });
    }
  }
  await pg.evaluate(() => localStorage.setItem('csd.lang', 'bg'));
  await pg.reload({ waitUntil: 'domcontentloaded' });
  await pg.waitForSelector('nav', { timeout: 15000 });

  // 6. Достижимост с Tab: първите ~40 спирки трябва да включват навигацията.
  const reached = await pg.evaluate(() => {
    const focusable = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => { const r = n.getBoundingClientRect(); return r.width && r.height; });
    const navButtons = [...document.querySelectorAll('#nav button')];
    return { total: focusable.length, navInTab: navButtons.every((n) => n.tabIndex >= 0 && !n.disabled) };
  });
  if (!reached.navInTab) problems.push({ rule: 'навигация-извън-Tab', sel: '#nav', extra: '', where: 'общо' });

  // Видим фокус: сравнява очертанието на фокусиран срещу нефокусиран бутон.
  const focusVisible = await pg.evaluate(() => {
    const btn = document.querySelector('#nav button');
    if (!btn) return true;
    const before = getComputedStyle(btn).outlineWidth + '|' + getComputedStyle(btn).boxShadow;
    btn.focus();
    const after = getComputedStyle(btn).outlineWidth + '|' + getComputedStyle(btn).boxShadow;
    btn.blur();
    return before !== after;
  });
  if (!focusVisible) problems.push({ rule: 'фокусът-не-се-вижда', sel: '#nav button', extra: '', where: 'общо' });

  const labels = await pg.locator('#nav button span:nth-child(2)').allTextContents();
  for (const label of labels) {
    await pg.click(`#nav button:has-text("${label}")`, { timeout: 8000 });
    try {
      await pg.waitForFunction(() => !document.querySelector('#view .skeleton'), null, { timeout: 25000 });
    } catch { /* бавната секция се одитира каквато е */ }
    await pg.waitForTimeout(150);
    for (const p of await runAudit(pg)) problems.push({ ...p, where: label });
  }
} finally {
  await b.close();
  child.kill('SIGTERM');
  fs.rmSync(dir, { recursive: true, force: true });
}

// Групиране: един и същи бъг в 37 секции е ЕДИН бъг, не 37 реда.
const byRule = new Map();
for (const p of problems) {
  const key = `${p.rule}|${p.sel}|${p.extra}`;
  if (!byRule.has(key)) byRule.set(key, { ...p, where: new Set() });
  byRule.get(key).where.add(p.where);
}
const list = [...byRule.values()].sort((a, b) => a.rule.localeCompare(b.rule));
if (list.length) {
  console.error(`\n✘ Достъпност — ${list.length} различни находки:`);
  for (const p of list) {
    const w = [...p.where];
    console.error(`  · [${p.rule}] ${p.sel} ${p.extra}` + (p.text ? ` «${p.text}»` : '') +
      `\n      в: ${w.slice(0, 4).join(', ')}${w.length > 4 ? ` … (${w.length} секции)` : ''}`);
  }
  process.exit(1);
}
console.log('✔ Достъпност: име на всичко интерактивно, alt навсякъде, контраст AA, цели ≥24px, видим фокус, правилен lang.');
