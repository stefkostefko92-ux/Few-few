// Еднократно: прави прозрачни PNG на монетите от снимките на ЕЦБ.
// Употреба: node scripts/howto-mockups/build-coins.js <папка-обща-страна> <папка-БГ-страна>
// Изходът (assets/ecb/coins/{common,bg}/*.png) е в репото; скриптът е за възпроизводимост.
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");

const OUTDIR = path.join(__dirname, "assets/ecb/coins");
const SIZE = 560;
const COMMON = {
  "1c": "common_1cent_800.jpg", "2c": "common_2cent_800.jpg", "5c": "common_5cent_800.jpg",
  "10c": "new10common.png", "20c": "newcommon_20cent_800.jpg", "50c": "newcommon_50cent_800.jpg",
  "1e": "newcommon_1euro_800.jpg", "2e": "newcommon_2euro_800.jpg",
};
// 5c и 50c на ЕЦБ са със същото изображение като 2c и 10c (виж bg-5cent / bg-50cent в източника).
const BG = {
  "1c": "bg-1cent.jpg", "2c": "bg-2cent.jpg", "5c": "bg-2cent.jpg", "10c": "bg-10cent.jpg",
  "20c": "bg-20cent.jpg", "50c": "bg-10cent.jpg", "1e": "bg-1euro.jpg", "2e": "bg-2euro.jpg",
};

async function cutout(file) {
  const meta = await sharp(file).metadata();
  const PAD = 6;
  // 1) смаляване до SIZE (без уголемяване), бяла рамка за да има откъде да тръгне запълването
  const base = sharp(file).flatten({ background: "#fff" }).resize(SIZE, SIZE, { fit: "inside", withoutEnlargement: true });
  const { data, info } = await base.extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: "#fff" })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const isBg = (i) => data[i * 3] >= 236 && data[i * 3 + 1] >= 236 && data[i * 3 + 2] >= 236;
  // 2) запълване отвън (flood fill) — вътрешните бели блясъци на монетата остават
  const out = new Uint8Array(w * h);
  const stack = [0];
  out[0] = 1;
  while (stack.length) {
    const p = stack.pop(); const x = p % w, y = (p / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (!out[q] && isBg(q)) { out[q] = 1; stack.push(q); }
    }
  }
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = out[i] ? 0 : 255;
  // 3) меки ръбове: размиване + стесняване с ~1px (маха бялата ореола)
  const soft = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(1.1).extractChannel(0).raw().toBuffer();
  for (let i = 0; i < soft.length; i++) soft[i] = Math.max(0, Math.min(255, (soft[i] - 150) * 2.4));
  const rgb = await sharp(data, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  const res = await sharp(rgb).joinChannel(soft, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
  return sharp(res).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer();
}

(async () => {
  const [commonDir, bgDir] = process.argv.slice(2);
  if (!commonDir || !bgDir) { console.error("нужни са две папки"); process.exit(1); }
  for (const [side, dir, map] of [["common", commonDir, COMMON], ["bg", bgDir, BG]]) {
    fs.mkdirSync(path.join(OUTDIR, side), { recursive: true });
    for (const [d, f] of Object.entries(map)) {
      const buf = await cutout(path.join(dir, f));
      fs.writeFileSync(path.join(OUTDIR, side, `${d}.png`), buf);
      const m = await sharp(buf).metadata();
      console.log(side, d, `${m.width}x${m.height}`);
    }
  }
})();
