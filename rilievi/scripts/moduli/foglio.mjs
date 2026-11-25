// The pen of the sheets we draw ourselves for the supplier forms (2SG, AMI 100): a vector A4 PDF in Fira
// Sans Condensed, and the place of every field written into the map of the sheet as it is drawn — the
// same map src/ordini/moduli.ts reads (boxes, lines and text areas in points, from the top). The PDF is
// pinned by its SHA-256 in the map; a fixed creation date keeps the bytes the same for the same drawing.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MODULI = join(ROOT, 'assets', 'moduli');
const FONTS = join(ROOT, 'node_modules', '@fontsource', 'fira-sans-condensed', 'files');

export const BOX = 7;
const STROKE = 0.8;
const round = (n) => Math.round(n * 10) / 10;

/** Every field of the map by key (in the order of the groups and rows). */
export function campiDi(map) {
  return new Map(map.gruppi.flatMap((g) => g.righe.flatMap((r) => r.campi)).map((f) => [f.key, f]));
}

export function foglio(map, { title, label = 7.6 }) {
  const fields = campiDi(map);
  const placed = new Set();
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: {
      Title: title,
      Producer: 'Rilievi Impianti — Carbon Stealth VCC',
      Creator: 'Rilievi Impianti — Carbon Stealth VCC',
      CreationDate: new Date('2026-10-30T00:00:00Z'),
    },
  });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.registerFont('regular', join(FONTS, 'fira-sans-condensed-latin-400-normal.woff'));
  doc.registerFont('medium', join(FONTS, 'fira-sans-condensed-latin-500-normal.woff'));
  doc.registerFont('bold', join(FONTS, 'fira-sans-condensed-latin-700-normal.woff'));

  const rect = (x, y, w, h, width = STROKE) => doc.lineWidth(width).rect(x, y, w, h).stroke();
  const hline = (x0, x1, y, width = STROKE) =>
    doc.lineWidth(width).moveTo(x0, y).lineTo(x1, y).stroke();
  const vline = (x, y0, y1, width = STROKE) =>
    doc.lineWidth(width).moveTo(x, y0).lineTo(x, y1).stroke();

  /** A label with its baseline on `y`; returns where it ends. */
  const text = (str, x, y, { font = 'medium', size = label } = {}) => {
    doc.font(font).fontSize(size).text(str, x, y, { baseline: 'alphabetic', lineBreak: false });
    return x + doc.widthOfString(str);
  };

  const field = (key) => {
    const f = fields.get(key);
    if (!f) throw new Error(`no field ${key} in the map`);
    if (placed.has(key)) throw new Error(`field ${key} placed twice`);
    placed.add(key);
    return f;
  };

  const dotted = (x0, x1, y, width = 0.5) =>
    doc
      .save()
      .lineWidth(width)
      .dash(0.8, { space: 1.6 })
      .moveTo(x0, y)
      .lineTo(x1, y)
      .stroke()
      .restore();

  /** A check box sitting on the baseline `y`; returns where it ends. */
  const check = (key, x, y) => {
    const f = field(key);
    const top = y - BOX + 0.5;
    doc.lineWidth(STROKE).roundedRect(x, top, BOX, BOX, 1).stroke();
    f.box = [round(x), round(top), round(x + BOX), round(top + BOX)];
    return x + BOX;
  };

  /** A dotted line to write on, from x0 to x1, just under the baseline `y`. */
  const line = (key, x0, x1, y) => {
    const f = field(key);
    const at = y + 1.5;
    dotted(x0, x1, at);
    f.line = [round(x0), round(x1), round(at)];
  };

  /** A text area with dotted lines of its own to write on (`righe`, from the top). */
  const area = (key, box, righe) => {
    const f = field(key);
    f.area = box.map(round);
    for (const y of righe) dotted(box[0], box[2], y, 0.4);
    f.righe = righe.map(round);
  };

  const labelLine = (str, key, x, y, x1, opts) => line(key, text(str, x, y, opts) + 4, x1, y);
  const labelCheck = (str, key, x, y, opts) => check(key, text(str, x, y, opts) + 4, y);

  /** A box with its own text tab in the top-left corner, like the paper forms. */
  const tab = (str, x, y) => {
    doc.font('medium').fontSize(label);
    const w = doc.widthOfString(str) + 8;
    doc
      .lineWidth(0.6)
      .moveTo(x, y + 11)
      .lineTo(x + w, y + 11)
      .lineTo(x + w, y)
      .stroke();
    text(str, x + 4, y + 8.4);
  };

  /** A dark band with a centred title. */
  const band = (title, x0, x1, y, h = 15, size = 8.4) => {
    doc.rect(x0, y, x1 - x0, h).fill('#000');
    doc.fillColor('#fff').font('bold').fontSize(size);
    const w = doc.widthOfString(title);
    doc.text(title, (x0 + x1 - w) / 2, y + h / 2 + size * 0.36, {
      baseline: 'alphabetic',
      lineBreak: false,
    });
    doc.fillColor('#000');
  };

  /**
   * Ends the drawing: every field of the map must be on the sheet; writes the PDF and the map with the
   * SHA-256 of the PDF.
   */
  const salva = async (file) => {
    const missing = [...fields.keys()].filter((key) => !placed.has(key));
    if (missing.length) throw new Error(`fields not on the sheet: ${missing.join(', ')}`);
    doc.end();
    await new Promise((resolve) => doc.on('end', resolve));
    const pdf = Buffer.concat(chunks);
    writeFileSync(join(MODULI, file), pdf);
    map.file = file;
    map.sha256 = createHash('sha256').update(pdf).digest('hex');
    const json = join(MODULI, file.replace(/\.pdf$/, '.json'));
    writeFileSync(json, `${JSON.stringify(map, null, 2)}\n`);
    process.stdout.write(`${join(MODULI, file)}\n${json}\nsha256 ${map.sha256}\n`);
  };

  return {
    doc,
    rect,
    hline,
    vline,
    text,
    check,
    line,
    area,
    labelLine,
    labelCheck,
    tab,
    band,
    salva,
  };
}
