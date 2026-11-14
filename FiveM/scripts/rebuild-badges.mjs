/**
 * Пресглобява растерните значки в `public/icons/badges/`: `npm run brand:badges`.
 *
 * Защо е нужно. Пакетът от 72 отделни файла (комит e9a27283f) е изрязан от общия
 * лист с ГРЕШНО отместване: в `arrow-down.png` стоят стрелките наляво и надясно,
 * в `esx.png` логото е свряно в долния ляв ъгъл, а в около половината файлове има
 * парчета от съседните икони с текстовите им етикети. Първото изрязване (комит
 * 1bf9c4d2f, от същия лист, но по клетките) носи ВЯРНАТА рисунка под всяко име —
 * само е на черен фон и в различни размери (53–125 px). Оттам взимаме почти
 * всичко; трите имена, които там ги няма и в пакета са чисти, идват от пакета.
 *
 * Стъпки за всеки файл:
 *  1. черното → прозрачност по unmultiply (α = max(r,g,b)), за да не остане сив
 *     ореол около рисунката, каквато би дал праг;
 *  2. махане на ЧУЖДИТЕ парчета: свързана област, която допира ръба на изреза и е
 *     малка спрямо главната, е от съседната клетка. Вътрешните детайли (точките в
 *     сървърния шкаф, удивителната) не допират ръба и остават;
 *  3. подрязване по рисунката и вписване в еднакво поле (128 px, рисунка 112 px;
 *     широките лога — ESX, ox_core — в цялата ширина, иначе са нечетими).
 *
 * Пуска се ръчно, когато дойде нов лист; изходът се комитва. Стари файлове, които
 * не са в изхода, се трият — липсващ растер значи вектор (виж `Badge`).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

const OUT = path.join(process.cwd(), 'public', 'icons', 'badges');
const SHEET_CUT = '1bf9c4d2f'; // първото изрязване — вярната рисунка
const PACK = '476ea4165'; // пакетът след `fix-badges.py` — само за чистите имена отдолу
const FROM_PACK = ['hidden', 'unreachable', 'players'];

const CANVAS = 128;
const BOX = 112;
const ALPHA = 40;

// `ref:път` се чете от КОРЕНА на репото — пуснат от `FiveM/`, git тълкува пътя
// спрямо текущата папка и връща празно, без грешка. Затова винаги `-C <корен>`.
const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const BADGES = 'FiveM/public/icons/badges';

function gitFile(ref, file) {
  return execFileSync('git', ['-C', ROOT, 'show', `${ref}:${BADGES}/${file}`], { maxBuffer: 1 << 24 });
}

function listAt(ref) {
  const names = execFileSync('git', ['-C', ROOT, 'ls-tree', '--name-only', `${ref}:${BADGES}`], { encoding: 'utf8' })
    .split('\n')
    .filter((name) => name.endsWith('.png'));
  // Празен списък значи грешен път, не празен лист — без тази проверка скриптът
  // изтрива всички значки (случи се при първото пускане).
  if (names.length === 0) throw new Error(`няма значки в ${ref}:${BADGES}`);
  return names;
}

/** Свързаните области на непрозрачното (8 съседа). Връща етикет на пиксел и площите. */
function components(alpha, W, H) {
  const label = new Int32Array(W * H).fill(-1);
  const areas = [];
  const touches = [];
  const stack = [];
  for (let start = 0; start < W * H; start++) {
    if (label[start] !== -1 || alpha[start] <= ALPHA) continue;
    const id = areas.length;
    let area = 0;
    let edge = false;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      area++;
      const x = p % W;
      const y = (p - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (label[q] === -1 && alpha[q] > ALPHA) {
            label[q] = id;
            stack.push(q);
          }
        }
    }
    areas.push(area);
    touches.push(edge);
  }
  return { label, areas, touches };
}

async function rebuild(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  // 1) черно → прозрачност
  for (let i = 0; i < data.length; i += 4) {
    const m = Math.max(data[i], data[i + 1], data[i + 2]);
    const a = m < 14 ? 0 : Math.round((data[i + 3] * m) / 255);
    if (m) {
      data[i] = Math.round((data[i] * 255) / m);
      data[i + 1] = Math.round((data[i + 1] * 255) / m);
      data[i + 2] = Math.round((data[i + 2] * 255) / m);
    }
    data[i + 3] = a;
  }

  // 2) чуждите парчета по ръба — и прахът под 6 пиксела навсякъде
  const alpha = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = data[p * 4 + 3];
  const { label, areas, touches } = components(alpha, W, H);
  const largest = Math.max(...areas);
  const drop = areas.map((area, id) => area < 6 || (touches[id] && area < largest * 0.12));
  // Слабите пиксели (α ≤ ALPHA) около изхвърлена област се изхвърлят с нея: иначе
  // остава полупрозрачен контур на парчето.
  for (let p = 0; p < W * H; p++) {
    if (label[p] >= 0 && drop[label[p]]) data[p * 4 + 3] = 0;
  }
  for (let pass = 0; pass < 2; pass++)
    for (let p = 0; p < W * H; p++) {
      if (label[p] !== -1 || data[p * 4 + 3] === 0) continue;
      const x = p % W;
      const y = (p - x) / W;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++)
        for (let dx = -2; dx <= 2 && !near; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (label[q] >= 0 && !drop[label[q]]) near = true;
        }
      if (!near) data[p * 4 + 3] = 0;
    }

  // 3) подрязване, вписване, центриране
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[(y * W + x) * 4 + 3] > ALPHA) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const wide = bw / bh > 1.6;
  const scale = Math.min((wide ? CANVAS - 4 : BOX) / bw, BOX / bh);
  const tw = Math.max(1, Math.round(bw * scale));
  const th = Math.max(1, Math.round(bh * scale));
  let piece = sharp(data, { raw: info })
    .extract({ left: x0, top: y0, width: bw, height: bh })
    .resize(tw, th, { kernel: 'lanczos3' });
  // Увеличението размива ръба — леко изостряне го връща, без ореол.
  if (scale > 1.3) piece = piece.sharpen({ sigma: 0.6 });
  const pieceBuffer = await piece.png().toBuffer();

  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: pieceBuffer, left: Math.round((CANVAS - tw) / 2), top: Math.round((CANVAS - th) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const written = new Set();
for (const file of listAt(SHEET_CUT)) {
  if (FROM_PACK.includes(file.replace(/\.png$/, ''))) continue;
  fs.writeFileSync(path.join(OUT, file), await rebuild(gitFile(SHEET_CUT, file)));
  written.add(file);
}
for (const name of FROM_PACK) {
  const file = `${name}.png`;
  fs.writeFileSync(path.join(OUT, file), await rebuild(gitFile(PACK, file)));
  written.add(file);
}
for (const file of fs.readdirSync(OUT)) {
  if (file.endsWith('.png') && !written.has(file)) {
    fs.rmSync(path.join(OUT, file));
    console.log(`махнат (няма вярна рисунка → вектор): ${file}`);
  }
}
console.log(`готово: ${written.size} значки в ${path.relative(process.cwd(), OUT)}`);
