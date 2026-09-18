#!/usr/bin/env node
// brand.mjs — извежда всички бранд асети от ЕДИН източник: brand/logo-source.png (квадратното лого
// на Carbon Stealth VCC — карбонов „CS" монограм в cyan пръстен + надпис „CARBON STEALTH / VCC").
// Пуска се РЪЧНО при смяна на логото; резултатът е проследен в public/ (sharp е само devDependency).
//   node tools/brand.mjs
// Изходи (всички на чист бранд-черен фон #000, защото и сайтът е #000):
//   logo.png/.webp        хоризонтален lockup (знак + надпис), прозрачен фон — nav и footer
//   logo-square.png/.webp квадратното лого 1024² — JSON-LD Organization.logo, og.png
//   mark.png/.webp        само знакът 320², прозрачен фон — boot екран, cs-bar на демата, root/404
//   icon-192.png · icon-512.png · apple-touch-icon.png (180²) · favicon.ico (32², PNG вътре)
//   og.png                1200×630 — заглавие + знак (без Chromium: чист sharp composite)
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "brand", "logo-source.png");
const OUT = join(ROOT, "public");
mkdirSync(OUT, { recursive: true });

// Кутии в източника (1254×1254), измерени по яркост >180 (без дима): пръстенът със знака и двата реда текст.
const MARK = { left: 100, top: 70, width: 1054, height: 830 };   // пръстен x125–1125, y93–873 + пас за сиянието
const WORD = { left: 60, top: 896, width: 1134, height: 172 };   // „CARBON STEALTH" y912–975 + „VCC" y1003–1052
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
const WEBP = { quality: 86, alphaQuality: 80, effort: 6 };
const PNG = { compressionLevel: 9, palette: true, quality: 92, effort: 10 }; // palette: карбоновата текстура е шум за deflate — 256 цвята режат ~4× без видима загуба

const src = sharp(SRC);
const meta = await src.metadata();
if (meta.width !== 1254 || meta.height !== 1254) throw new Error(`brand/logo-source.png: очаквам 1254×1254, получих ${meta.width}×${meta.height}`);

/** Черен фон → прозрачност. Сиянието/димът са адитивни върху черно, затова alpha = max(r,g,b) и
 *  цветът се разпремултиплицира: върху #000 резултатът е байт-идентичен с оригинала, върху почти-черно
 *  (nav rgba(0,0,0,.85), сканлинията на boot екрана) вече не се вижда черен правоъгълник. */
async function transparent(pipeline) {
  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, o = 0; i < data.length; i += 3, o += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a0 = Math.max(r, g, b), a = a0 < 10 ? 0 : a0; // <10 = шум от дима → чисто прозрачно (иначе webp/png растат ×2)
    out[o] = a ? Math.min(255, Math.round((r * 255) / a)) : 0;
    out[o + 1] = a ? Math.min(255, Math.round((g * 255) / a)) : 0;
    out[o + 2] = a ? Math.min(255, Math.round((b * 255) / a)) : 0;
    out[o + 3] = a;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function both(name, pipeline, { alpha = false } = {}) {
  if (alpha) pipeline = await transparent(pipeline);
  const buf = await pipeline.png(PNG).toBuffer();
  writeFileSync(join(OUT, `${name}.png`), buf);
  writeFileSync(join(OUT, `${name}.webp`), await sharp(buf).webp(WEBP).toBuffer());
  const m = await sharp(buf).metadata();
  console.log(`✓ public/${name}.png + .webp (${m.width}×${m.height})`);
  return buf;
}

// 1) Квадратно лого 1024² — цялото, както е дадено.
await both("logo-square", sharp(SRC).resize(1024, 1024));

// 2) Знакът (пръстен + CS) — квадрат 320² (показва се до 200px → ~1.6× за retina; 512 с alpha беше 147 KB webp).
const markBuf = await sharp(SRC).extract(MARK).resize(320, 320, { fit: "contain", background: BLACK }).png(PNG).toBuffer();
await both("mark", sharp(markBuf), { alpha: true });

// 3) Хоризонтален lockup: знак (h=160) + надпис (h≈70), центрирани вертикално, 8px луфт. Показва се на 32/48px → 160 е >3× retina.
const H = 160;
const mark = await sharp(SRC).extract(MARK).resize({ height: H }).png().toBuffer();
const word = await sharp(SRC).extract(WORD).resize({ height: 70 }).png().toBuffer();
const mm = await sharp(mark).metadata(), wm = await sharp(word).metadata();
const GAP = 8;
const W = mm.width + GAP + wm.width;
await both("logo", sharp({ create: { width: W, height: H, channels: 3, background: BLACK } }).composite([
  { input: mark, left: 0, top: 0 },
  { input: word, left: mm.width + GAP, top: Math.round((H - wm.height) / 2) },
]), { alpha: true });

// 4) Икони — знакът, запълващ квадрата (леко приближен, за да е четим на 16–32px).
const iconOf = (size) => sharp(SRC).extract({ left: 150, top: 78, width: 954, height: 812 }).resize(size, size, { fit: "cover", position: "centre" }).png(PNG).toBuffer();
for (const [name, size] of [["icon-512", 512], ["icon-192", 192], ["apple-touch-icon", 180]]) {
  writeFileSync(join(OUT, `${name}.png`), await iconOf(size));
  console.log(`✓ public/${name}.png (${size}×${size})`);
}
// favicon.ico = ICO контейнер с една PNG картинка 32² (всички съвременни браузъри четат PNG-in-ICO).
const ico32 = await iconOf(32);
const header = Buffer.alloc(6 + 16);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6); header.writeUInt8(32, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(ico32.length, 14); header.writeUInt32LE(22, 18);
writeFileSync(join(OUT, "favicon.ico"), Buffer.concat([header, ico32]));
console.log(`✓ public/favicon.ico (32×32, ${ico32.length} B PNG)`);

// 5) og.png 1200×630 — заглавие вляво (SVG текст; librsvg не вижда woff2 от public/fonts → DejaVu Sans, който има кирилица),
//    квадратното лого вдясно. Дизайн езикът на carbonstealth.eu: черно · cyan · HUD моно ъгли.
const logoOg = await sharp(SRC).resize(470, 470).png().toBuffer();
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs><pattern id="g" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="rgba(0,229,255,.07)" stroke-width="1"/></pattern></defs>
<rect width="1200" height="630" fill="#000"/><rect width="1200" height="630" fill="url(#g)"/>
<g fill="none" stroke="rgba(0,229,255,.7)" stroke-width="1"><path d="M28 56V28h28M1144 28h28v28M28 574v28h28M1172 574v28h-28"/></g>
<text x="80" y="110" font-family="DejaVu Sans Mono, monospace" font-size="13" letter-spacing="6" fill="#00e5ff">// CARBON STEALTH VCC · PORTFOLIO · BG · EN · IT</text>
<text x="80" y="215" font-family="DejaVu Sans, Arial, sans-serif" font-weight="900" font-size="66" letter-spacing="-2" fill="#f5f5f0">10 ДЕМО САЙТА.</text>
<text x="80" y="295" font-family="DejaVu Sans, Arial, sans-serif" font-weight="900" font-size="66" letter-spacing="-2" fill="#00e5ff">ИЗБЕРЕТЕ СВОЯ.</text>
<text x="80" y="370" font-family="DejaVu Sans Mono, monospace" font-size="15" letter-spacing="1" fill="#cccccc">Сервиз · Фитнес · Мебели · Адвокати · Салон · Хотел</text>
<text x="80" y="398" font-family="DejaVu Sans Mono, monospace" font-size="15" letter-spacing="1" fill="#cccccc">Счетоводство · Автокъща · Дрехи · Бързо хранене</text>
<g font-family="DejaVu Sans Mono, monospace" font-size="11" letter-spacing="2" fill="#00e5ff">
<rect x="80" y="520" width="150" height="38" fill="none" stroke="rgba(0,229,255,.3)"/><text x="98" y="544">LIGHTHOUSE 95+</text>
<rect x="244" y="520" width="176" height="38" fill="none" stroke="rgba(0,229,255,.3)"/><text x="262" y="544">≥15% ПОД ПАЗАРА</text>
<rect x="434" y="520" width="200" height="38" fill="none" stroke="rgba(0,229,255,.3)"/><text x="452" y="544">REVERSE CHARGE · ЕС</text>
</g>
<text x="1120" y="600" text-anchor="end" font-family="DejaVu Sans Mono, monospace" font-size="10" letter-spacing="3" fill="rgba(0,229,255,.7)">portfolio.carbonstealth.eu · CS CORE · ONLINE</text>
</svg>`);
await sharp({ create: { width: 1200, height: 630, channels: 3, background: BLACK } })
  .composite([{ input: svg, left: 0, top: 0 }, { input: logoOg, left: 700, top: 60 }])
  .png(PNG).toFile(join(OUT, "og.png"));
console.log("✓ public/og.png (1200×630)");
