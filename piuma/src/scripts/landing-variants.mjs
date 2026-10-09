// Прави лекия вариант на всеки асет на витрината — в размера, в който наистина се показва.
//
//   node src/scripts/landing-variants.mjs
//
// Защо: телефон на 390 px сваляше 1600 px снимка на панела и 420 px лого за икона от
// 46 px. Изходните файлове остават (от тях се строи вариантът), а страницата тегли
// правилния през `srcset`/`sizes`. Пусни го пак след `landing:shots` или `landing:art`.
// Работи в Chromium (Playwright), както и другите генератори — нула нови зависимости.
import { chromium } from 'playwright';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'landing');

/** Изход → [изходен файл, ширина в px, качество]. */
const jobs = [
  // Логото се показва на 46 и 72 px; 160 покрива и двете при плътност 2×.
  ['logo-160.webp', 'logo.webp', 160, 0.9],
];
// Снимките на панела: 800 px за телефони (390 px × 2), изходните 1600 px остават за широки екрани.
for (const file of readdirSync(DIR)) {
  const m = file.match(/^(panel-[a-z]+-[a-z]{2})\.webp$/);
  if (m) jobs.push([`${m[1]}-800.webp`, file, 800, 0.82]);
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const page = await browser.newPage();
await page.goto('about:blank');

for (const [out, src, width, quality] of jobs) {
  const input = readFileSync(join(DIR, src)).toString('base64');
  const dataUrl = await page.evaluate(
    async ({ input, width, quality }) => {
      const img = new Image();
      img.src = `data:image/webp;base64,${input}`;
      await img.decode();
      const scale = Math.min(1, width / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const g = canvas.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      // WebP от canvas пази алфата — логото остава без фон.
      return canvas.toDataURL('image/webp', quality);
    },
    { input, width, quality },
  );
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
  writeFileSync(join(DIR, out), bytes);
  console.log(`${out.padEnd(28)} ${(bytes.length / 1024).toFixed(1).padStart(6)} KB  ← ${src}`);
}

await browser.close();
