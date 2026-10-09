// Подготвя подадената рисунка (логото и перото) за витрината: маха черния фон и
// изнася WebP с алфа в размера, в който наистина се показва.
//
//   node src/scripts/landing-art.mjs <лого.png> <перо.png>
//
// Защо изобщо: неонов арт идва върху черно. Сложен така върху аврората, той стои като
// правоъгълник. Прозрачността НЕ се прави с изрязване по праг — това оставя сив ръб.
// Неонът върху черно е ефективно premultiplied върху нула: алфата е най-силният канал,
// а цветът се развива обратно (unmultiply), затова ръбът остава цветен и мек.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'landing');

const [logoSrc, plumeSrc] = process.argv.slice(2);
if (!logoSrc || !plumeSrc) {
  console.error('Употреба: node src/scripts/landing-art.mjs <лого.png> <перо.png>');
  process.exit(2);
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const page = await browser.newPage();
await page.goto('about:blank');

async function dekey(src, out, { width, quality, floor = 0.06 }) {
  const png = readFileSync(src).toString('base64');
  const result = await page.evaluate(
    async ({ png, width, quality, floor }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();

      const scale = Math.min(1, width / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);

      const frame = g.getImageData(0, 0, w, h);
      const px = frame.data;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i] / 255;
        const gr = px[i + 1] / 255;
        const b = px[i + 2] / 255;
        const a = Math.max(r, gr, b);
        if (a <= floor) {
          px[i + 3] = 0; // чисто черно: това е фонът
          continue;
        }
        px[i] = Math.min(255, Math.round((r / a) * 255));
        px[i + 1] = Math.min(255, Math.round((gr / a) * 255));
        px[i + 2] = Math.min(255, Math.round((b / a) * 255));
        px[i + 3] = Math.round(a * 255);
      }
      g.putImageData(frame, 0, 0);
      return { url: canvas.toDataURL('image/webp', quality), w, h };
    },
    { png, width, quality, floor },
  );
  const bytes = Buffer.from(result.url.split(',')[1], 'base64');
  writeFileSync(out, bytes);
  return `${out.split('/').pop()} ${result.w}×${result.h} ${Math.round(bytes.length / 1024)} KB`;
}

// Ширините са двойно спрямо мястото, където стоят (лого ~46 px, перо ~340 px) —
// достатъчно за плътен екран, без да мъкнем мегабайт заради декорация.
console.log(await dekey(logoSrc, join(OUT, 'logo.webp'), { width: 420, quality: 0.86 }));

// apple-touch-icon трябва да е PNG — Safari на iOS не чете WebP за икона на началния
// екран — и без прозрачност: iOS я слага върху черно, значи фонът се запича в брандовия
// тъмен тон, за да не излезе бял квадрат. 180×180 е размерът, който iOS иска.
{
  const png = readFileSync(logoSrc).toString('base64');
  const url = await page.evaluate(
    async ({ png }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 180;
      c.height = 180;
      const g = c.getContext('2d');
      g.fillStyle = '#07070d';
      g.fillRect(0, 0, 180, 180);
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, 180, 180);
      return c.toDataURL('image/png');
    },
    { png },
  );
  const bytes = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(join(OUT, 'apple-touch-icon.png'), bytes);
  console.log(`apple-touch-icon.png 180×180 ${Math.round(bytes.length / 1024)} KB`);
}
// Качеството почти не мести теглото тук: алфа-каналът на WebP е без загуби и е
// основният разход. 0.72 спестяваше 10 KB срещу видима загуба — не си струва.
console.log(await dekey(plumeSrc, join(OUT, 'plume.webp'), { width: 700, quality: 0.85 }));
await browser.close();
