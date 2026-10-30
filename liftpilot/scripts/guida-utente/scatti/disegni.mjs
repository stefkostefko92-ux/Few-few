// The files the demo uploads, all made here (no downloaded image, no file of a real installation): logos, a hand sketch
// of a shaft, a «photo» of a machine plate, a DXF plan of a shaft, small PDF documents.
import { Buffer } from 'node:buffer';
import { crc32, deflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import * as acad from '@node-projects/acad-ts';

/** An RGB PNG from a pixel function (x, y) → [r, g, b]. */
function png(w, h, pixel) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A plan sketch of a shaft: a frame, the car and its counterweight, the doors and, along the sides, dimension lines
 *  with ticks (a hand-made drawing: lines only, no text — a pen would write the numbers). */
export function sketchPng(w = 640, h = 480) {
  const px = new Uint8Array(w * h).fill(0); // 1 = ink
  const set = (x, y, t = 1) => { for (let dy = -t; dy <= t; dy++) for (let dx = -t; dx <= t; dx++) { const X = Math.round(x) + dx, Y = Math.round(y) + dy; if (X >= 0 && X < w && Y >= 0 && Y < h) px[Y * w + X] = 1; } };
  const line = (x0, y0, x1, y1, t = 1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, t); };
  const rect = (x0, y0, x1, y1, t = 1) => { line(x0, y0, x1, y0, t); line(x1, y0, x1, y1, t); line(x1, y1, x0, y1, t); line(x0, y1, x0, y0, t); };
  rect(150, 80, 490, 400, 3); // the shaft's walls
  rect(190, 150, 400, 360, 1); // the car
  rect(200, 160, 390, 350, 1);
  rect(205, 100, 385, 130, 1); // the counterweight, at the back
  line(250, 400, 390, 400, 5); // the landing door's opening
  const dim = (x0, y0, x1, y1) => { line(x0, y0, x1, y1); const v = x0 === x1; for (const [a, b] of [[x0, y0], [x1, y1]]) { if (v) line(a - 8, b, a + 8, b); else line(a, b - 8, a, b + 8); } };
  dim(150, 440, 490, 440); // the width of the shaft
  dim(100, 80, 100, 400); // its depth
  dim(190, 60, 400, 60); // the width of the car
  dim(520, 150, 520, 360); // its depth
  return png(w, h, (x, y) => (px[y * w + x] ? [35, 38, 48] : [250, 248, 240]));
}

/** A small logo (a PNG): a square and two bars in one colour. */
export const logoPng = (r, g, b) => png(192, 64, (x, y) => ((x > 8 && x < 56 && y > 8 && y < 56) || (x > 70 && x < 180 && y > 20 && y < 28) || (x > 70 && x < 150 && y > 38 && y < 44) ? [r, g, b] : [255, 255, 255]));

/** A «photo» of the machine's plate: a dark slab with lines of text-like bars. */
export const platePng = () => png(480, 320, (x, y) => {
  const inside = x > 40 && x < 440 && y > 60 && y < 260;
  if (!inside) return [88 + ((x * 7 + y * 3) % 9), 94, 100];
  const bar = [90, 112, 134, 156, 178, 200, 222].some((by) => y > by && y < by + 8 && x > 60 && x < 200 + ((by * 13) % 180));
  return bar ? [30, 32, 36] : [196, 200, 204];
});

/** A plan in millimetres: the shaft's inner faces 1600 × 1750 from 0,0 and the walls (200 thick) outside, on one layer. */
export function shaftDxf() {
  const doc = new acad.CadDocument();
  doc.header.version = acad.ACadVersion.AC1027;
  doc.header.insUnits = acad.UnitsType.Millimeters;
  const walls = new acad.Layer('MURI');
  doc.layers.add(walls);
  const rect = (x0, y0, x1, y1) => {
    const p = new acad.LwPolyline([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => new acad.XY(x, y)));
    p.isClosed = true;
    p.layer = walls;
    doc.modelSpace.entities.add(p);
  };
  rect(0, 0, 1600, 1750);
  rect(-200, -200, 1800, 1950);
  const out = [];
  new acad.DxfWriter({ write: (v) => { out.push(v); } }, doc).write();
  return Buffer.from(out.join(''), 'utf8');
}

/** A PDF of a few pages: a title and a line per page. */
export async function demoPdf(title, pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595.28, 841.89]);
    p.drawText(`${title} — pagina ${i + 1}`, { x: 50, y: 780, size: 16 });
    p.drawText('Documento di esempio per la guida utente (dati inventati).', { x: 50, y: 750, size: 10 });
  }
  return Buffer.from(await doc.save());
}
