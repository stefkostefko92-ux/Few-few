import sharp from 'sharp';
import fs from 'node:fs';
const [src, out] = process.argv.slice(2);
const CANVAS = 128, BOX = 112;
for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.png')).sort()) {
  const { data, info } = await sharp(`${src}/${f}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  // 1) черното → прозрачност (unmultiply): α = α0·max(r,g,b)/255, цвят = цвят/max.
  for (let i = 0; i < data.length; i += 4) {
    const m = Math.max(data[i], data[i + 1], data[i + 2]);
    const a = m < 14 ? 0 : Math.round((data[i + 3] * m) / 255);
    if (m) { data[i] = Math.round((data[i] * 255) / m); data[i + 1] = Math.round((data[i + 1] * 255) / m); data[i + 2] = Math.round((data[i + 2] * 255) / m); }
    data[i + 3] = a;
  }
  // 2) кутията на рисунката
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  // Широките лога (ESX, ox_core) заемат цялата ширина — иначе текстът им е нечетим.
  const wide = bw / bh > 1.6;
  const scale = Math.min((wide ? CANVAS - 4 : BOX) / bw, BOX / bh);
  const tw = Math.max(1, Math.round(bw * scale)), th = Math.max(1, Math.round(bh * scale));
  const piece = await sharp(data, { raw: info }).extract({ left: x0, top: y0, width: bw, height: bh }).resize(tw, th, { kernel: 'lanczos3' }).sharpen(scale > 1.3 ? { sigma: 0.6 } : undefined).png().toBuffer();
  await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: piece, left: Math.round((CANVAS - tw) / 2), top: Math.round((CANVAS - th) / 2) }])
    .png({ compressionLevel: 9 }).toFile(`${out}/${f}`);
  console.log(f.padEnd(20), `${W}x${H}`, `box ${bw}x${bh}`, `→ ${tw}x${th}`, scale < 1 ? '' : '(без мащаб)');
}
