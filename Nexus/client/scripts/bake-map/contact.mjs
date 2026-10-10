/* Контактен лист от изображения (рисува се в Chromium canvas — без sharp).
 *   node contact.mjs <изход.png> <cols> <cellW> <img1> <img2> ...   (етикет = име на файла)
 */
import fs from 'node:fs';
import path from 'node:path';
import { openPage } from './host.mjs';

export async function contactSheet(files, out, cols = 3, cellW = 640) {
  const { page, close } = await openPage({ log: false });
  const imgs = files.map((f) => ({
    name: path.basename(f).replace(/\.\w+$/, ''),
    url: `data:${f.endsWith('.webp') ? 'image/webp' : 'image/png'};base64,${fs.readFileSync(f).toString('base64')}`,
  }));
  const b64 = await page.evaluate(async ({ imgs, cols, cellW }) => {
    const cellH = Math.round((cellW * 9) / 16);
    const rows = Math.ceil(imgs.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * cellW; c.height = rows * cellH;
    const g = c.getContext('2d');
    g.fillStyle = '#070b11'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < imgs.length; i++) {
      const im = new Image();
      await new Promise((res) => { im.onload = res; im.src = imgs[i].url; });
      const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
      g.imageSmoothingQuality = 'high';
      g.drawImage(im, x, y, cellW, cellH);
      g.font = '600 15px sans-serif';
      g.fillStyle = 'rgba(7,11,17,.7)'; g.fillRect(x, y + cellH - 24, 200, 24);
      g.fillStyle = '#9fe9ef'; g.fillText(imgs[i].name, x + 8, y + cellH - 7);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { imgs, cols, cellW });
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  await close();
}

if (process.argv[1] && process.argv[1].endsWith('contact.mjs')) {
  const [out, cols, cellW, ...files] = process.argv.slice(2);
  await contactSheet(files, out, +cols, +cellW);
}
