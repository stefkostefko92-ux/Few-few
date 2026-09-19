// Изображението за споделяне (1200×630). Без преводим текст — само името на продукта,
// което е име, не низ за превод; така едно изображение служи и на трите езика.
import { chromium } from 'playwright';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const plume = readFileSync(join(ROOT, 'public', 'landing', 'plume.svg'), 'utf8').replace(
  'aria-hidden="true"',
  'aria-hidden="true" class="plume"',
);

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
    padding:0 84px;gap:40px}
  .copy{flex:1}
  .name{font-size:112px;font-weight:700;letter-spacing:-.045em;line-height:.95;
    background:linear-gradient(112deg,#fff 0%,#ffd6e6 26%,#a78bfa 66%,#22d3ee 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .rule{width:132px;height:4px;border-radius:99px;margin:26px 0 24px;
    background:linear-gradient(90deg,#ff2d78,#8b5cf6 52%,#22d3ee)}
  .by{font-size:23px;color:#b6bdd4;letter-spacing:.005em}
  .by b{color:#eef0f8;font-weight:600}
  .art{width:330px;height:470px;display:grid;place-items:center;flex:none}
  .plume{width:330px;height:470px;filter:drop-shadow(0 0 40px rgba(139,92,246,.5))}
</style>
<div class="aurora"></div><div class="grain"></div>
<div class="wrap">
  <div class="copy">
    <div class="name">Piuma</div>
    <div class="rule"></div>
    <div class="by">Instagram · <b>Carbon&nbsp;Stealth&nbsp;VCC</b></div>
  </div>
  <div class="art">${plume}</div>
</div>`;

const scratch = join(ROOT, 'public', 'landing', '.og.html');
writeFileSync(scratch, html);

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto('file://' + scratch);
await page.waitForTimeout(900);
await page.screenshot({ path: join(ROOT, 'public', 'landing', 'og.png') });
await browser.close();
rmSync(scratch, { force: true });
console.log('og готово');
