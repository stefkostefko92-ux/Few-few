// Генерира статичните растерни ресурси (PNG) без външни зависимости:
//   public/img/icon-180.png      — икона за PWA / Apple touch
//   public/img/og-default.png    — изображение по подразбиране за споделяне (1200x630)
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imgDir = path.join(__dirname, '..', 'public', 'img');
fs.mkdirSync(imgDir, { recursive: true });

const C = {
  maroon: [165, 42, 42], maroonDark: [126, 31, 31], ink: [34, 34, 34],
  leaf: [211, 232, 178], white: [255, 255, 255], cream: [244, 246, 240],
};

function canvas(w, h, bg) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = bg[0]; buf[i * 4 + 1] = bg[1]; buf[i * 4 + 2] = bg[2]; buf[i * 4 + 3] = 255;
  }
  return { w, h, buf };
}
function px(c, x, y, color, a = 255) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const af = a / 255;
  c.buf[i] = Math.round(c.buf[i] * (1 - af) + color[0] * af);
  c.buf[i + 1] = Math.round(c.buf[i + 1] * (1 - af) + color[1] * af);
  c.buf[i + 2] = Math.round(c.buf[i + 2] * (1 - af) + color[2] * af);
  c.buf[i + 3] = 255;
}
function rect(c, x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(c, x, y, color);
}
function roundRect(c, x0, y0, x1, y1, r, color) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    let inside = true;
    const corners = [[x0 + r, y0 + r], [x1 - r, y0 + r], [x0 + r, y1 - r], [x1 - r, y1 - r]];
    if (x < x0 + r && y < y0 + r) inside = (x - corners[0][0]) ** 2 + (y - corners[0][1]) ** 2 <= r * r;
    else if (x >= x1 - r && y < y0 + r) inside = (x - corners[1][0]) ** 2 + (y - corners[1][1]) ** 2 <= r * r;
    else if (x < x0 + r && y >= y1 - r) inside = (x - corners[2][0]) ** 2 + (y - corners[2][1]) ** 2 <= r * r;
    else if (x >= x1 - r && y >= y1 - r) inside = (x - corners[3][0]) ** 2 + (y - corners[3][1]) ** 2 <= r * r;
    if (inside) px(c, x, y, color);
  }
}
function disc(c, cx, cy, r, color) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(c, x, y, color);
}
function ring(c, cx, cy, r, t, color) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d <= r * r && d >= (r - t) ** 2) px(c, x, y, color);
  }
}

function encodePNG(c) {
  const { w, h, buf } = c;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter none
    buf.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
const crcTable = (() => {
  const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }

// Стилизирана емблема (ръка/жест), мащабируема
function emblem(c, cx, cy, scale, color) {
  const fingers = [[-18, -8, 7, 30], [-6, -16, 7, 38], [6, -16, 7, 38], [16, -10, 7, 32]];
  for (const [fx, fy, fw, fh] of fingers) {
    roundRect(c, cx + Math.round(fx * scale), cy + Math.round(fy * scale),
      cx + Math.round((fx + fw) * scale), cy + Math.round((fy + fh) * scale),
      Math.max(2, Math.round(3 * scale)), color);
  }
  roundRect(c, cx - Math.round(20 * scale), cy + Math.round(10 * scale),
    cx + Math.round(24 * scale), cy + Math.round(34 * scale), Math.round(8 * scale), color);
}

// ---- icon-180 ----
(() => {
  const c = canvas(180, 180, C.cream);
  roundRect(c, 0, 0, 180, 180, 40, C.maroon);
  for (let y = 0; y < 180; y++) { const f = y / 180; rect(c, 0, y, 180, y + 1, [
    Math.round(C.maroon[0] * (1 - f) + C.maroonDark[0] * f),
    Math.round(C.maroon[1] * (1 - f) + C.maroonDark[1] * f),
    Math.round(C.maroon[2] * (1 - f) + C.maroonDark[2] * f)]); }
  // re-apply rounded mask edges by overpainting corners with cream
  const mask = canvas(180, 180, C.cream); roundRect(mask, 0, 0, 180, 180, 40, [0,0,0]);
  for (let y = 0; y < 180; y++) for (let x = 0; x < 180; x++) {
    const i = (y*180+x)*4; if (mask.buf[i+3] === 255 && mask.buf[i] === C.cream[0]) { c.buf[i]=C.cream[0];c.buf[i+1]=C.cream[1];c.buf[i+2]=C.cream[2]; }
  }
  emblem(c, 90, 78, 1.7, C.white);
  disc(c, 132, 124, 12, C.leaf);
  fs.writeFileSync(path.join(imgDir, 'icon-180.png'), encodePNG(c));
  console.log('  ✓ icon-180.png');
})();

// ---- og-default (1200x630) ----
(() => {
  const c = canvas(1200, 630, C.ink);
  for (let y = 0; y < 630; y++) { const f = y / 630; rect(c, 0, y, 1200, y + 1, [
    Math.round(56 * (1 - f) + 34 * f), Math.round(56 * (1 - f) + 34 * f), Math.round(56 * (1 - f) + 34 * f)]); }
  rect(c, 0, 0, 1200, 10, C.maroon);
  rect(c, 0, 620, 1200, 630, C.leaf);
  // емблема в кръг
  disc(c, 250, 315, 150, C.maroon);
  ring(c, 250, 315, 150, 6, C.leaf);
  emblem(c, 250, 300, 3.4, C.white);
  // лента-акцент за текстовата зона
  rect(c, 470, 250, 478, 410, C.maroon);
  fs.writeFileSync(path.join(imgDir, 'og-default.png'), encodePNG(c));
  console.log('  ✓ og-default.png (1200x630)');
})();

console.log('  Готово.');
