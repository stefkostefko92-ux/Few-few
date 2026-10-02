// Bill of materials: cut list (finished and cut sizes, edge banding, grain), edge band metres, board area per
// stock and decor, hardware grouped for purchase, and the CSV exports of all three.
import { cutSize, edgeSummary } from './panel.js';
import { STOCK, decorName } from './materials.js';
import { axisOf, r1 } from './util.js';

const GROUP_ORDER = ['Обков', 'Крепежи', 'Покупни'];

// A text cell that starts like a formula (= + - @, tab, CR) gets a leading ' so a spreadsheet shows it as
// text instead of running it; plain numbers such as -12 or -3,5 stay numbers.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(?:[.,]\d+)?$/;
export const csvCell = (v) => {
  let s = String(v ?? '');
  if (typeof v === 'string' && FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
// Semicolon CSV with CRLF (opens directly in a Bulgarian-locale Excel / LibreOffice).
export const toCsv = (rows) => `${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;
const dec = (v) => String(r1(v)).replace('.', ',');

export function buildBom(model) {
  const { parts, spec } = model;
  const rows = parts.map((p) => {
    const cut = cutSize(p, spec.bandCompensation);
    const e = edgeSummary(p);
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      module: p.module ?? '',
      role: p.role,
      qty: 1,
      L: p.L,
      W: p.W,
      T: p.T,
      cutL: cut.L,
      cutW: cut.W,
      stock: p.stock,
      stockName: STOCK[p.stock].name,
      decor: p.decor,
      decorName: decorName(p.decor),
      grain: Boolean(p.grain),
      edgesL: e.L,
      edgesW: e.W,
      area: (p.L * p.W) / 1e6,
      holes: p.features.filter((f) => f.type === 'hole').length,
      grooves: p.features.filter((f) => f.type === 'groove').length,
      edgeHoles: p.edgeOps.reduce((a, o) => a + o.count, 0),
    };
  });
  // edge band: exact edge lengths, no allowance for trimming waste
  const bands = new Map();
  for (const p of parts) {
    for (const [dir, t] of Object.entries(p.bands)) {
      if (!t) continue;
      const len = axisOf(dir) === axisOf(p.frame.eu) ? p.W : p.L;
      const k = `${t}|${p.decor}`;
      const cur = bands.get(k) ?? { thickness: t, decor: p.decor, decorName: decorName(p.decor), metres: 0 };
      cur.metres += len / 1000;
      bands.set(k, cur);
    }
  }
  // board area per stock and decor (cut sizes)
  const boards = new Map();
  for (const r of rows) {
    const k = `${r.stock}|${r.decor}`;
    const cur = boards.get(k) ?? { stock: r.stock, stockName: r.stockName, thickness: r.T, decor: r.decor, decorName: r.decorName, parts: 0, area: 0 };
    cur.parts += 1;
    cur.area += (r.cutL * r.cutW) / 1e6;
    boards.set(k, cur);
  }
  const hardware = [...model.hardware].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.name.localeCompare(b.name, 'bg'));
  const priced = hardware.filter((h) => Number.isFinite(h.price) && h.currency);
  const totals = {};
  for (const h of priced) totals[h.currency] = (totals[h.currency] ?? 0) + h.price * h.qty;
  return { rows, bands: [...bands.values()], boards: [...boards.values()], hardware, hardwareTotals: totals, unpriced: hardware.length - priced.length };
}

export function cutListCsv(bom) {
  const head = ['№', 'Детайл', 'Модул', 'Материал', 'Декор', 'Дебелина', 'Дължина', 'Ширина', 'Дължина за разкрой', 'Ширина за разкрой', 'Бр.', 'Шарка по дължината', 'Кант по дължината', 'Кант по ширината', 'Отвори', 'Канали', 'Хоризонтални отвори'];
  return toCsv([head, ...bom.rows.map((r) => [r.id, r.name, r.module, r.stockName, r.decorName, r.T, dec(r.L), dec(r.W), dec(r.cutL), dec(r.cutW), r.qty, r.grain ? 'да' : 'не', r.edgesL.map(dec).join('+'), r.edgesW.map(dec).join('+'), r.holes, r.grooves, r.edgeHoles])]);
}

export function hardwareCsv(bom) {
  const head = ['Група', 'Артикул', 'Марка', 'Код', 'Бр.', 'Мярка', 'Ед. цена', 'Валута', 'Магазин', 'Линк'];
  return toCsv([head, ...bom.hardware.map((h) => [h.group, h.name, h.brand ?? '', h.sku ?? '', h.qty, h.unit, Number.isFinite(h.price) ? dec(h.price) : '', h.currency ?? '', h.shop ?? '', h.url ?? ''])]);
}
