// Сглобява неоновия набор на Piuma от подадената рисунка.
//
//   npm run icons:build -- <папка-с-PNG> src/scripts/icon-map.json
//
// Две неща наведнъж:
//  1. сваля черния фон — неонът върху черно е premultiplied върху нула, затова алфата
//     е най-силният канал, а цветът се развива обратно (без това ръбът посивява);
//  2. подрежда рисунките под НАШИТЕ имена по картата, като завърта там, където
//     посоката носи смисъла (стрелка надясно → тренд нагоре/надолу).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [srcDir, mapFile] = process.argv.slice(2);
if (!srcDir || !mapFile) {
  console.error('Употреба: node build-icons.mjs <папка-с-PNG> <карта.json>');
  process.exit(2);
}
const ROOT = dirname(fileURLToPath(import.meta.url));
// По подразбиране пише направо в набора, който панелът ползва.
const OUT = process.env.ICON_OUT ?? join(ROOT, '..', '..', 'public', 'icons-neon');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const MAP = JSON.parse(readFileSync(mapFile, 'utf8'));
/** 2× от най-едрата употреба (`.ic-xl` = 32 px). Смени го само ако се появи по-едра. */
const SIZE = Number(process.env.ICON_SIZE ?? 64);
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const page = await browser.newPage();
await page.goto('about:blank');

let bytesTotal = 0;
const rows = [];
for (const [name, spec] of Object.entries(MAP)) {
  const png = readFileSync(join(srcDir, `${spec.src}.png`)).toString('base64');
  const out = await page.evaluate(
    async ({ png, rotate, floor, size }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();

      // Изнася се в размера, в който наистина се показва, не в размера на източника:
      // най-едрата употреба е 32 px (празно състояние), тоест 64 px стигат за плътен
      // екран. При 145 px витрината теглеше 206 KB икони вместо 12 KB спрайт.
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingQuality = 'high';
      if (rotate) {
        g.translate(size / 2, size / 2);
        g.rotate((rotate * Math.PI) / 180);
        g.translate(-size / 2, -size / 2);
      }
      g.drawImage(img, 0, 0, size, size);

      const frame = g.getImageData(0, 0, c.width, c.height);
      const px = frame.data;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i] / 255;
        const gr = px[i + 1] / 255;
        const b = px[i + 2] / 255;
        const a = Math.max(r, gr, b);
        if (a <= floor) {
          px[i + 3] = 0;
          continue;
        }
        px[i] = Math.min(255, Math.round((r / a) * 255));
        px[i + 1] = Math.min(255, Math.round((gr / a) * 255));
        px[i + 2] = Math.min(255, Math.round((b / a) * 255));
        px[i + 3] = Math.round(a * 255);
      }
      g.putImageData(frame, 0, 0);
      return c.toDataURL('image/webp', 0.9);
    },
    { png, rotate: spec.rotate ?? 0, floor: 0.06, size: SIZE },
  );
  const bytes = Buffer.from(out.split(',')[1], 'base64');
  writeFileSync(join(OUT, `${name}.webp`), bytes);
  bytesTotal += bytes.length;
  rows.push(`${name} ← ${spec.src}${spec.rotate ? ` (завъртяна ${spec.rotate}°)` : ''}`);
}

await browser.close();
console.log(
  `${rows.length} икони · ${Math.round(bytesTotal / 1024)} KB общо · средно ${(bytesTotal / rows.length / 1024).toFixed(1)} KB`,
);
