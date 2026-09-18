// tools/og.mjs — Open Graph изображения за всяко демо и вертикална страница (BG/EN/IT) от статичните
// превюта (public/img/previews/<lang>/<id>.webp, tools/previews.mjs): 1200×630 JPEG — кадърът на демото
// отгоре (1200×540), отдолу черна лента с логото и cyan линия. Споделянето в Facebook/LinkedIn/Viber/
// Telegram показва самото демо, не общото og.png. Проследени в git (~60 KB всяко); пусни след previews.mjs.
//
//   node tools/og.mjs            # всички езици и демота
//   node tools/og.mjs bg salon   # само едно
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { LANGS } from "../src/lib/html.mjs";
import { DEMOS } from "../src/demos/index.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUB = join(ROOT, "public");
const W = 1200, H = 630, SHOT_H = 540, BAR = H - SHOT_H;
const argv = process.argv.slice(2);
const langs = argv.filter((a) => LANGS.includes(a));
const ids = argv.filter((a) => DEMOS.some((d) => d.id === a));

const logo = await sharp(join(PUB, "logo.png")).resize({ height: 44 }).png().toBuffer();
const logoMeta = await sharp(logo).metadata();
// Cyan линия + черна лента (SVG — без шрифтове, нищо за рендиране извън нашия контрол).
const bar = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAR}"><rect width="${W}" height="${BAR}" fill="#000"/><rect width="${W}" height="2" fill="#00e5ff"/></svg>`);

let n = 0, skipped = 0;
for (const lang of langs.length ? langs : LANGS) {
  mkdirSync(join(PUB, "og", lang), { recursive: true });
  for (const demo of DEMOS) {
    if (ids.length && !ids.includes(demo.id)) continue;
    const src = join(PUB, "img", "previews", lang, `${demo.id}.webp`);
    if (!existsSync(src)) { skipped++; console.log(`· ${lang}/${demo.id}: няма превю — пропуснато (node tools/previews.mjs ${demo.id})`); continue; }
    const out = join(PUB, "og", lang, `${demo.id}.jpg`);
    const shot = await sharp(src).resize(W, Math.round(W * 600 / 960)).extract({ left: 0, top: 0, width: W, height: SHOT_H }).png().toBuffer();
    await sharp({ create: { width: W, height: H, channels: 3, background: "#000000" } })
      .composite([{ input: shot, top: 0, left: 0 }, { input: bar, top: SHOT_H, left: 0 }, { input: logo, top: SHOT_H + Math.round((BAR - logoMeta.height) / 2), left: 40 }])
      .jpeg({ quality: 82, mozjpeg: true }).toFile(out);
    n++;
    console.log(`✓ og/${lang}/${demo.id}.jpg ${Math.round(statSync(out).size / 1024)} KB`);
  }
}
console.log(`\n${n} OG изображения → public/og/${skipped ? ` · пропуснати ${skipped}` : ""}`);
if (skipped) process.exit(1);
