// Генерира OG изображенията 1200×630 (BG и EN) през Chromium на Playwright. Логото е
// public/img/brand/logo.png (иконите — scripts/brand-assets.mjs). Палитра: navy #0c1929, тюркоаз #05a699 (логото — почти черно и тюркоаз #00c9a8).
//   node scripts/og.mjs   (изисква `npm run build` или `node scripts/fonts.mjs` за шрифтовете)
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const img = join(root, 'public', 'img');
const logo = pathToFileURL(join(img, 'brand', 'logo.png')).href;
const fonts = pathToFileURL(join(root, 'public', 'fonts')).href;
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = createRequire('/usr/local/lib/node_modules_global/')('playwright'));
}

const NB = ' ';
const COPY = {
  bg: {
    brand: 'Фактурист',
    title: 'Фактури по ЗДДС, записани и като структуриран XML',
    sub: `Проверка по чл.${NB}114 ЗДДС при издаване. UBL${NB}2.1 и CII по EN${NB}16931 във всеки план.`,
    doc: 'Фактура',
    date: 'Дата на издаване',
    seal: 'Във верига след № 0000000123',
  },
  en: {
    brand: 'Fakturist',
    title: 'Bulgarian VAT invoices, also saved as structured XML',
    sub: `VAT Act rules checked on issue. UBL${NB}2.1 and CII under EN${NB}16931 on every plan.`,
    doc: 'Invoice',
    date: 'Issue date',
    seal: 'In the chain after no. 0000000123',
  },
};

const face = (family, file, weight) =>
  `@font-face{font-family:'${family}';font-weight:${weight};src:url('${fonts}/${file}') format('woff2')}`;
const css = (lang) => `
${['latin', 'latin-ext', 'cyrillic'].map((s) => [400, 500, 600].map((w) => face('Plex', `ibm-plex-sans-${s}-${w}-normal.woff2`, w)).join('')).join('')}
${['latin', 'cyrillic'].map((s) => [400, 500].map((w) => face('PlexMono', `ibm-plex-mono-${s}-${w}-normal.woff2`, w)).join('')).join('')}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#f4f6f8;color:#0c1929;font-family:Plex,sans-serif;position:relative;overflow:hidden}
.l{position:absolute;left:72px;top:64px;width:600px}
.brand{display:block}.brand img{display:block;height:64px;width:auto}
h1{margin-top:56px;font-size:${lang === 'bg' ? 62 : 66}px;line-height:1.08;font-weight:600;letter-spacing:-0.025em}
.sub{margin-top:28px;font-size:25px;line-height:1.45;color:#44546a;max-width:540px}
.doc{position:absolute;left:740px;top:78px;width:388px;padding:26px 24px 20px 62px;background:#fff;border:1px solid #cdd5de;
background-image:linear-gradient(to right,transparent 46px,#05a699 46px,#05a699 47px,transparent 47px),linear-gradient(to right,transparent 50px,#cdd5de 50px,#cdd5de 51px,transparent 51px)}
.dh{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #0c1929;padding-bottom:12px}
.dh b{font-size:30px;font-weight:600}.dh span{font-family:PlexMono;font-size:19px;font-weight:500}
.m{margin-top:14px;font-size:17px;color:#44546a}.m div{color:#0c1929;font-weight:500;margin-top:2px}
.xml{position:absolute;left:800px;top:318px;width:330px;padding:16px 0;background:#08111d;border-radius:3px;font-family:PlexMono;font-size:15px;line-height:1.85;color:#e6ecf3}
.xml p{display:grid;grid-template-columns:64px 1fr}.xml i{font-style:normal;color:#2cc5b5;text-align:right;padding-right:12px}
.t{color:#93b4f5}.v{color:#f0cf8e}
.seal{margin-top:18px;display:flex;gap:12px;align-items:center;font-size:15px;color:#44546a}
.seal u{width:32px;height:32px;border:2px solid #05a699;border-radius:50%;background:radial-gradient(circle,#05a699 0 28%,transparent 30%)}
.bar{position:absolute;left:0;bottom:0;width:100%;height:10px;background:#05a699}
`;
const html = (lang) => {
  const c = COPY[lang];
  return `<!doctype html><meta charset="utf-8"><style>${css(lang)}</style>
<div class="l"><div class="brand"><img src="${logo}" alt="${c.brand}"></div>
<h1>${c.title}</h1><p class="sub">${c.sub}</p></div>
<div class="doc"><div class="dh"><b>${c.doc}</b><span>0000000124</span></div>
<p class="m">${c.date}<div>12.11.2026</div></p>
<p class="seal"><u></u><span>${c.seal}</span></p></div>
<div class="xml"><p><i>BT-1</i><span><span class="t">&lt;cbc:ID&gt;</span><span class="v">0000000124</span><span class="t">&lt;/cbc:ID&gt;</span></span></p>
<p><i>BT-2</i><span><span class="t">&lt;cbc:IssueDate&gt;</span><span class="v">2026-11-12</span></span></p>
<p><i>BT-3</i><span><span class="t">&lt;cbc:InvoiceTypeCode&gt;</span><span class="v">380</span></span></p></div>
<div class="bar"></div>`;
};

const dir = mkdtempSync(join(tmpdir(), 'fakturist-og-'));
const browser = await chromium.launch();
for (const lang of ['bg', 'en']) {
  const file = join(dir, `${lang}.html`);
  writeFileSync(file, html(lang));
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(img, `og-${lang}.png`) });
  await page.close();
}
await browser.close();
console.log('og → public/img/');
