// Снима РЕАЛНИЯ панел за витрината: каквото гледа посетителят на `/`, е самият продукт,
// не стокова снимка. Пусни го наново, когато панелът промени вида си — иначе витрината
// започва да лъже.
//
//   PIUMA_URL=http://127.0.0.1:4399 PIUMA_PASSWORD=… node src/scripts/landing-shots.mjs
//
// Иска жив панел с демо данни (не продукция — снимките отиват в репото). Кодирането към
// WebP минава през самия Chromium: няма cwebp/sharp, а браузърът кодира вграден.
// Всеки кадър е насочен към твърдението, което илюстрира — не е общ изглед.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Адресът на ЖИВ панел с демо данни — подава се, не се предполага. */
const BASE = process.env.PIUMA_URL ?? 'http://127.0.0.1:4399';
const EMAIL = process.env.PIUMA_EMAIL ?? 'admin@carbonstealth.eu';
const PASSWORD = process.env.PIUMA_PASSWORD ?? '';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'landing');
const TMP = new URL('./raw/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

if (!PASSWORD) {
  console.error('Липсва PIUMA_PASSWORD — скриптът влиза в панела, за да го снима.');
  process.exit(2);
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const ctx = await browser.newContext({
  viewport: { width: 1360, height: 900 },
  deviceScaleFactor: 2,
  locale: 'bg-BG',
  // Не `addStyleTag` — CSP е `style-src 'self'` и инлайн стилът се отказва (инвариант 11).
  // Предпочитанието за по-малко движение спира аврората по редовния път, от самия CSS.
  reducedMotion: 'reduce',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/admin/login?lang=bg`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle' }),
  page.click('button[type="submit"]'),
]);

const SIDEBAR = 244; // ширината на лентата в CSS пиксели

/** Кадър, закотвен към конкретен елемент — всяка снимка илюстрира едно твърдение.
    `trim` маха страничната лента, когато кадърът е за съдържанието, не за навигацията. */
async function shoot(name, { anchor = null, trim = false, height = 900 } = {}) {
  await page.waitForTimeout(450);
  const x = trim ? SIDEBAR : 0;
  let y = 0;
  if (anchor) {
    const box = await page.locator(anchor).first().boundingBox();
    if (box) y = Math.max(0, Math.round(box.y) - 80);
  }
  await page.screenshot({
    path: join(TMP, `${name}.png`),
    clip: { x, y, width: 1360 - x, height },
  });
}

async function visit(path, lang) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('lang', lang);
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
}

// Витрината показва панела на СВОЯ език — иначе италианецът гледа български екран.
const INSIGHTS_ANCHOR = { bg: 'Акаунти', en: 'Accounts', it: 'Account' };
const names = [];
for (const lang of ['bg', 'en', 'it']) {
  await visit('/admin', lang);
  await shoot(`panel-dashboard-${lang}`);

  await visit('/admin/posts', lang);
  await shoot(`panel-posts-${lang}`);

  // Празна форма изглежда мъртва — попълва се с демо стойностите, не с измислен текст.
  await visit('/admin/posts/new', lang);
  await page.selectOption('form select[name="brandId"]', { index: 1 }).catch(() => null);
  await page.waitForTimeout(250);
  await page
    .locator('form input[name="topic"]')
    .first()
    .fill('Зад кулисите: как мерим дебелината на всеки слой')
    .catch(() => null);
  await page
    .locator('form textarea[name="caption"]')
    .first()
    .fill(
      'Калникът слезе от формата днес. 380 g, шест слоя, вакуум цяла нощ.\n\nНай-тънкото място е 1,2 mm — мерено, не на око.',
    )
    .catch(() => null);
  await shoot(`panel-compose-${lang}`);

  await visit('/admin/brands', lang);
  const perf = await page.getAttribute('a[href*="/performance"]', 'href');
  if (perf) {
    await visit(perf.split('?')[0], lang);
    await shoot(`panel-insights-${lang}`, {
      anchor: `h2:has-text("${INSIGHTS_ANCHOR[lang]}")`,
      trim: true,
      height: 600,
    });
  }
  names.push(
    `panel-dashboard-${lang}`,
    `panel-posts-${lang}`,
    `panel-insights-${lang}`,
    `panel-compose-${lang}`,
  );
}

// --- PNG → WebP, мащабирано до целева ширина ---
const conv = await ctx.newPage();
await conv.goto('about:blank');
async function encode(name, targetWidth, quality) {
  const png = readFileSync(join(TMP, `${name}.png`)).toString('base64');
  const out = await conv.evaluate(
    async ({ png, targetWidth, quality }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const scale = Math.min(1, targetWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const g = canvas.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { url: canvas.toDataURL('image/webp', quality), w: canvas.width, h: canvas.height };
    },
    { png, targetWidth, quality },
  );
  const bytes = Buffer.from(out.url.split(',')[1], 'base64');
  writeFileSync(join(OUT, `${name}.webp`), bytes);
  return { name, w: out.w, h: out.h, kb: Math.round(bytes.length / 1024) };
}

const report = [];
for (const name of names) {
  report.push(
    await encode(name, 1600, 0.82).catch((e) => ({ name, error: String(e).slice(0, 100) })),
  );
}

await browser.close();
rmSync(TMP, { recursive: true, force: true });
const sizes = Object.fromEntries(
  report.filter((r) => r.w).map((r) => [r.name, `${r.w}x${r.h} ${r.kb}KB`]),
);
console.log(JSON.stringify({ sizes, errors, failed: report.filter((r) => r.error) }, null, 2));
