// Изображението за споделяне (1200×630). Без преводим текст — само името на продукта,
// което е име, не низ за превод; така едно изображение служи и на трите езика.
//
//   npm run landing:og
//
// Иска Chromium за Playwright (`PLAYWRIGHT_CHROMIUM` сочи към друг, ако трябва) и
// `plume.webp` до себе си — перото е същият файл, който стои и в героя на витрината.
import { chromium } from 'playwright';
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Коренът на продукта — скриптът работи отвсякъде, без зашит път. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'public', 'landing');

// Страницата се пише В папката с асетите, затова перото се вика по относителен път.
const html = `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:#07070d;position:relative;overflow:hidden;
    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#eef0f8}
  .aurora{position:absolute;inset:-6%;
    background:
      radial-gradient(46% 62% at 10% 14%, rgba(255,45,120,.34), transparent 64%),
      radial-gradient(42% 58% at 74% 6%, rgba(139,92,246,.32), transparent 66%),
      radial-gradient(52% 64% at 88% 78%, rgba(34,211,238,.26), transparent 68%);
    filter:blur(14px)}
  .grain{position:absolute;inset:0;opacity:.4;
    background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px);
    background-size:3px 3px}
  .wrap{position:relative;height:100%;display:flex;align-items:center;
    padding:0 84px;gap:48px}
  .copy{flex:1}
  .name{font-size:112px;font-weight:700;letter-spacing:-.045em;line-height:.95;
    background:linear-gradient(112deg,#fff 0%,#ffd6e6 26%,#a78bfa 66%,#22d3ee 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .rule{width:132px;height:4px;border-radius:99px;margin:26px 0 24px;
    background:linear-gradient(90deg,#ff2d78,#8b5cf6 52%,#22d3ee)}
  .by{font-size:23px;color:#b6bdd4;letter-spacing:.005em}
  .by b{color:#eef0f8;font-weight:600}
  .art{flex:none;display:grid;place-items:center}
  .art img{width:400px;height:435px;filter:drop-shadow(0 0 48px rgba(139,92,246,.55))}
</style>
<div class="aurora"></div><div class="grain"></div>
<div class="wrap">
  <div class="copy">
    <div class="name">Piuma</div>
    <div class="rule"></div>
    <div class="by">Instagram · <b>Carbon&nbsp;Stealth&nbsp;VCC</b></div>
  </div>
  <div class="art"><img src="plume.webp" alt=""></div>
</div>`;

const scratch = join(DIR, '.og.html');
writeFileSync(scratch, html);

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto(`file://${scratch}`);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: join(DIR, 'og.png') });
await browser.close();
rmSync(scratch, { force: true });
console.log('og готово');
