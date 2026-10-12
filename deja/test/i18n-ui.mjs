// Интерфейсът на всички 73 езика в истински Chromium (--lang=<локал>): popup-ът
// (300 px) без отрязан/препълнен текст и под 600 px височина (таванът на Chrome),
// страничният панел (400 px) без хоризонтален скрол, RTL езиците — dir="rtl".
// Бавен (един браузър на език) — не е в `npm test`: npm run test:i18n-ui
import { chromium } from 'playwright-core';
import { readdirSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EXT, makeChecker } from './lib.mjs';

const { check, finish } = makeChecker();
const ROOT = path.resolve(import.meta.dirname, '..');
const only = process.argv.slice(2);
const locales = readdirSync(path.join(ROOT, '_locales'))
  .filter((l) => !only.length || only.includes(l))
  .sort();
const RTL = new Set(['ar', 'he', 'fa', 'ur']);
const fails = [];

for (const locale of locales) {
  const lang = locale.replace('_', '-');
  const ctx = await chromium.launchPersistentContext(
    mkdtempSync(path.join(tmpdir(), 'deja-i18n-')),
    {
      headless: true,
      executablePath: process.env.DEJA_CHROME,
      locale: lang,
      env: { ...process.env, LANGUAGE: lang.replace('-', '_') },
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--lang=${lang}`],
    },
  );
  // Езикът на разширението = езикът на браузъра, а не всеки Chromium има всички 73
  // като език на интерфейса (тук напр. няма mk) — тогава тихо пада към en и
  // преводът изобщо не се проверява. Затова подаваме локала директно на
  // chrome.i18n.getMessage; реалното превключване се проверява отделно (REAL).
  const messages = JSON.parse(
    readFileSync(path.join(ROOT, '_locales', locale, 'messages.json'), 'utf8'),
  );
  await ctx.addInitScript(
    ([messages, rtl, lang]) => {
      if (!globalThis.chrome?.i18n) return;
      const real = chrome.i18n.getMessage.bind(chrome.i18n);
      chrome.i18n.getMessage = (key, subs) => {
        if (key === '@@bidi_dir') return rtl ? 'rtl' : 'ltr';
        if (key === '@@ui_locale') return lang;
        const entry = messages[key];
        if (!entry) return real(key, subs);
        const list = subs == null ? [] : [].concat(subs);
        return entry.message.replace(/\$([A-Za-z_]+)\$/g, (m, name) => {
          const ref = entry.placeholders?.[name.toLowerCase()]?.content || '';
          const n = Number(ref.replace('$', ''));
          return n ? (list[n - 1] ?? '') : m;
        });
      };
      chrome.i18n.getUILanguage = () => lang.replace('_', '-');
    },
    [messages, RTL.has(locale.split('_')[0]), locale],
  );
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const id = new URL(sw.url()).host;
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 300, height: 600 });
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.waitForTimeout(500);
    const pop = await page.evaluate(() => {
      const clipped = [
        ...document.querySelectorAll('button, .links a, .pill, .switch > span, .logo'),
      ]
        .filter((el) => !el.hidden && el.offsetParent)
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.id || el.className || el.tagName);
      const tall = [...document.querySelectorAll('button')]
        .filter((b) => b.offsetParent && b.getBoundingClientRect().height > 64)
        .map((b) => b.id);
      return {
        dir: document.documentElement.dir,
        lang: document.documentElement.lang,
        height: Math.ceil(document.querySelector('.pop').getBoundingClientRect().height),
        clipped,
        tall,
        locale: chrome.i18n.getMessage('@@ui_locale'),
      };
    });
    if (pop.clipped.length) fails.push(`${locale}: popup отрязан текст в ${pop.clipped.join(',')}`);
    if (pop.tall.length) fails.push(`${locale}: popup бутон на 3+ реда (${pop.tall.join(',')})`);
    if (pop.height > 600) fails.push(`${locale}: popup ${pop.height}px > 600`);
    const wantDir = RTL.has(locale.split('_')[0]) ? 'rtl' : 'ltr';
    if (pop.dir !== wantDir) fails.push(`${locale}: dir=${pop.dir}, очаквано ${wantDir}`);

    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto(`chrome-extension://${id}/sidepanel.html`);
    await page.waitForTimeout(500);
    const panelOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    if (panelOverflow) fails.push(`${locale}: страничният панел скролира хоризонтално`);
    console.log(`· ${locale} (${pop.locale}, ${pop.dir}, popup ${pop.height}px)`);
  } catch (err) {
    fails.push(`${locale}: ${String(err?.message || err).split('\n')[0]}`);
  } finally {
    await ctx.close();
  }
}

// REAL: без подмяна — браузърът сам избира локала на разширението от --lang
for (const locale of ['bg', 'de', 'ar'].filter((l) => locales.includes(l))) {
  const ctx = await chromium.launchPersistentContext(
    mkdtempSync(path.join(tmpdir(), 'deja-real-')),
    {
      headless: true,
      executablePath: process.env.DEJA_CHROME,
      env: { ...process.env, LANGUAGE: locale },
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--lang=${locale}`],
    },
  );
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/popup.html`);
  const real = await page.evaluate(() => ({
    locale: chrome.i18n.getMessage('@@ui_locale'),
    dir: document.documentElement.dir,
    open: document.getElementById('open').textContent,
  }));
  const want = JSON.parse(
    readFileSync(path.join(ROOT, '_locales', locale, 'messages.json'), 'utf8'),
  );
  if (
    real.open !== want.popupOpenSearch.message ||
    real.dir !== (locale === 'ar' ? 'rtl' : 'ltr')
  ) {
    fails.push(`${locale} (истински): ${JSON.stringify(real)}`);
  } else console.log(`· ${locale}: истинското превключване работи (${real.locale}, ${real.dir})`);
  await ctx.close();
}

check(
  `интерфейсът се побира на ${locales.length} езика (${fails.length} проблема${fails.length ? ': ' + fails.join(' | ') : ''})`,
  fails.length === 0,
);
finish();
