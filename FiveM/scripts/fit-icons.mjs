/**
 * Вписва векторните икони (`public/icons/<група>/*.svg`) в обща мярка:
 * `npm run brand:icons`.
 *
 * Защо е нужно. Иконите са в мрежа 24×24, но рисунката в тях стоеше на различни
 * места и в различен размер — измерено с дебелината на щриха: `tag/heavy-rp` е
 * изместена с 2 единици вдясно, `tag/transport` с 2,3 надолу, а
 * `framework/standalone`, `tag/medic` и `brand/tiktok` заемат 10 от 24 при 16–20
 * за останалите. До текст това се вижда като икона, която „виси“ или е по-дребна
 * от съседката си.
 *
 * Какво прави: мери кутията на рисунката в Chromium (`getBBox` + половин щрих),
 * центрира я в 12,12 и увеличава дребните до 17,5 единици по дългата страна.
 * По-едрите НЕ се свиват — само се центрират. Щрихът се компенсира в групата
 * (`stroke-width` = 1,75 / мащаб), тоест всички икони остават с еднаква дебелина
 * на линията. Повторимо: обвивката носи `data-fit` и при второ пускане се маха,
 * преди да се мери наново.
 *
 * Иска `playwright-core` (браузърът е в /opt/pw-browsers), като `csp-sweep.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'public', 'icons');
const GROUPS = ['status', 'framework', 'tag', 'ui', 'brand'];
const STROKE = 1.75;
const TARGET = 17.5;

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('✗ няма playwright-core (npm i -D playwright-core) — иконите не са измерени');
  process.exit(2);
}

const FIT = /<g data-fit="1"[^>]*>([\s\S]*)<\/g>\s*$/;

const files = [];
for (const group of GROUPS)
  for (const name of fs.readdirSync(path.join(ROOT, group)).filter((f) => f.endsWith('.svg')).sort()) {
    const file = path.join(ROOT, group, name);
    const raw = fs.readFileSync(file, 'utf8');
    const open = raw.match(/^[\s\S]*?<svg[^>]*>/)[0];
    let inner = raw.slice(open.length).replace(/<\/svg>\s*$/, '');
    const fitted = inner.trim().match(FIT);
    if (fitted) inner = fitted[1];
    files.push({ file, open, inner: inner.trim() });
  }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
const boxes = await page.evaluate(
  ({ items, stroke }) =>
    items.map((inner) => {
      document.body.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}">${inner}</svg>`;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let stroked = false;
      for (const el of document.body.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse')) {
        const bb = el.getBBox();
        const half = getComputedStyle(el).stroke !== 'none' ? stroke / 2 : 0;
        if (half) stroked = true;
        x0 = Math.min(x0, bb.x - half);
        y0 = Math.min(y0, bb.y - half);
        x1 = Math.max(x1, bb.x + bb.width + half);
        y1 = Math.max(y1, bb.y + bb.height + half);
      }
      return { x0, y0, x1, y1, stroked };
    }),
  { items: files.map((f) => f.inner), stroke: STROKE },
);
await browser.close();

const round = (value) => Math.round(value * 1000) / 1000;
for (let i = 0; i < files.length; i++) {
  const { file, open, inner } = files[i];
  const { x0, y0, x1, y1, stroked } = boxes[i];
  const st = stroked ? STROKE : 0;
  const longest = Math.max(x1 - x0, y1 - y0);
  // Мащабът е за ГЕОМЕТРИЯТА; щрихът остава същият (компенсиран), затова се вади.
  const scale = longest < TARGET ? (TARGET - st) / (longest - st) : 1;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const tx = round(12 - cx * scale);
  const ty = round(12 - cy * scale);
  const s = round(scale);
  const identity = s === 1 && Math.abs(tx) < 0.05 && Math.abs(ty) < 0.05;
  const body = identity
    ? inner
    : `<g data-fit="1" transform="translate(${tx} ${ty}) scale(${s})"${s !== 1 ? ` stroke-width="${round(STROKE / s)}"` : ''}>\n${inner}\n</g>`;
  fs.writeFileSync(file, `${open}\n${body}\n</svg>\n`);
  const rel = path.relative(ROOT, file).replace(/\.svg$/, '');
  if (!identity) console.log(`${rel.padEnd(24)} изместване ${round(12 - cx)}, ${round(12 - cy)} · мащаб ${s}`);
}
console.log(`готово: ${files.length} икони`);
