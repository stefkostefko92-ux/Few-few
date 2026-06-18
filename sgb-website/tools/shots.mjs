import { chromium } from 'playwright-core';
import fs from 'node:fs';

const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const base = 'http://localhost:3100';
const out = '/tmp/shots';
fs.mkdirSync(out, { recursive: true });

const pages = [
  { name: '01-home-desktop', url: '/', w: 1440, h: 1000, full: true },
  { name: '02-article-desktop', url: '/statia/dobre-doshli-v-noviya-sait-na-sgb', w: 1440, h: 1000, full: true },
  { name: '03-newspaper-desktop', url: '/vestnik', w: 1440, h: 900, full: true },
  { name: '04-news-list-desktop', url: '/novini', w: 1440, h: 1000, full: true },
  { name: '05-contact-desktop', url: '/kontakti', w: 1440, h: 900, full: true },
  { name: '06-home-mobile', url: '/', w: 390, h: 844, full: true, mobile: true },
  { name: '07-article-mobile', url: '/statia/dobre-doshli-v-noviya-sait-na-sgb', w: 390, h: 844, full: true, mobile: true },
];

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
for (const p of pages) {
  const ctx = await browser.newContext({
    viewport: { width: p.w, height: p.h },
    deviceScaleFactor: p.mobile ? 2 : 1.5,
    isMobile: !!p.mobile,
  });
  const page = await ctx.newPage();
  await page.goto(base + p.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${p.name}.png`, fullPage: p.full });
  console.log('  ✓', p.name);
  await ctx.close();
}

// Admin dashboard (needs login)
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
await page.goto(base + '/admin/login', { waitUntil: 'networkidle' });
await page.fill('#username', 'admin');
await page.fill('#password', 'TestAdmin123!');
await page.click('button[type=submit]');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: `${out}/08-admin-dashboard.png`, fullPage: true });
console.log('  ✓ 08-admin-dashboard');
await page.goto(base + '/admin/articles/new', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/09-admin-article-editor.png`, fullPage: true });
console.log('  ✓ 09-admin-article-editor');
await ctx.close();

await browser.close();
console.log('Готово.');
