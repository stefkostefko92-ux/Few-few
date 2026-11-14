// The notes of an assembly sheet, from what the model really has: materials, the joints in use, the named hardware,
// and the warning line when the checks found errors; and the material line of the title block.
import { errorAlert } from './drawing-kit.js';
import { decorName, stockName, STOCK } from './materials.js';
import { translator } from './i18n.js';
import { GROOVE, HDF_T } from './joinery.js';
import { esc } from './util.js';
import { cornerGap, cornerHandleRoom } from './kitchen.js';

const HW_KIND = [['hinge:', 'hinge'], ['slide:', 'slide'], ['handle:', 'handle']];

export function materialLine(parts, t = translator('bg')) {
  const main = parts.find((p) => p.role === 'side' || p.role === 'bed-rail') ?? parts[0];
  return `${stockName(main.stock, t)} ${t.num(main.T)} · ${decorName(main.decor, t)}`;
}

export function notes(model) {
  const t = translator(model.lang);
  const corner = Boolean(model.runs?.length);
  const { parts, spec, hardware } = model;
  const front = parts.find((p) => p.role === 'door' || p.role === 'drawer-front' || p.role === 'bed-head');
  const carcass = parts.find((p) => p.role === 'side' || p.role === 'bed-rail');
  const has = (test) => parts.some(test);
  const kinds = new Set(parts.flatMap((p) => p.features.map((f) => f.kind)));
  const lines = [];
  if (carcass) lines.push(t('note.carcass', { stock: stockName(carcass.stock, t), T: t.num(carcass.T), decor: decorName(carcass.decor, t), band: t.num(spec.bandCarcass) }));
  if (front) lines.push(t(STOCK[front.stock].painted ? 'note.frontPainted' : 'note.front', { stock: stockName(front.stock, t), T: t.num(front.T), decor: decorName(front.decor, t), band: t.num(spec.bandFront), gap: t.num(spec.gap) }));
  const joints = [];
  if (kinds.has('confirmat')) joints.push(t('note.j.confirmat'));
  // a fixed shelf doweled over the screw heads of the one on the other face of a partition (cells.js): the order matters
  if (kinds.has('dowel')) joints.push(t('note.j.dowel'));
  if (has((p) => p.role === 'shelf')) joints.push(t('note.j.shelves'));
  if (has((p) => p.role === 'back')) joints.push(kinds.has('back-groove') ? t('note.j.backGroove', { t: HDF_T, w: GROOVE.width, d: GROOVE.depth, inset: GROOVE.inset }) : t('note.j.backNailed', { t: HDF_T }));
  if (has((p) => p.role === 'drawer-bottom')) joints.push(t('note.j.drawerBottoms', { t: HDF_T }));
  if (has((p) => p.role === 'bed-ledger')) joints.push(t('note.j.ledgers'));
  if (kinds.has('stack-pilot')) joints.push(t('note.j.stack'));
  if (spec.type === 'desk') joints.push(t('note.j.desk'));
  if (joints.length) lines.push(t('note.joints', { list: joints.join(', ') }));
  // a Г or П kitchen: what the corner needs on site
  if (corner)
    lines.push(t('note.corner', { gap: t.num(cornerGap(spec)), room: t.num(cornerHandleRoom(spec)) }));
  // hinges, slides and handles in short: the article where the shop gives one; everything is in hardware.csv
  const named = hardware
    .map((h) => ({ h, kind: HW_KIND.find(([prefix]) => h.key.startsWith(prefix))?.[1] }))
    .filter(({ kind }) => kind)
    .map(({ h, kind }) => {
      const what = h.sku ? `${h.brand ?? ''} ${h.sku}` : kind === 'handle' ? h.name.replace(/\s*\([^()]*\)\s*$/, '') : `${t(`note.kind.${kind}`)} ${h.brand ?? ''}`;
      return `${what}${h.variant ? `, ${t(`variant.${h.variant}`)}` : ''} × ${h.qty}`.replace(/\s+/g, ' ').trim();
    });
  if (named.length) lines.push(t('note.hardware', { list: named.join('; ') }));
  const rows = lines.flatMap((t) => wrap(t));
  // a Г or П kitchen has one more line: the space under its plan and views allows it
  const max = corner ? 8 : 6;
  if (rows.length > max) rows.splice(max - 1, rows.length - max + 1, `${rows[max - 1].slice(0, 120)}…`);
  // past six rows the notes start higher (the views of a Г or П kitchen end over them, drawing-walls.js)
  const top = 258 - 4.2 * Math.max(0, rows.length - 6);
  return rows.map((t, i) => `<text class="d-note" x="30" y="${top + i * 4.2}">${esc(t)}</text>`).join('') + errorAlert(model, 30, top + rows.length * 4.2);
}

// A note longer than the space left of the title block goes on to the next line, broken after a comma.
function wrap(text, max = 130) {
  const out = [];
  let rest = text;
  while (rest.length > max) {
    const cut = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf('; ', max));
    const at = cut > 40 ? cut + 1 : max;
    out.push(rest.slice(0, at).trimEnd());
    rest = `   ${rest.slice(at).trimStart()}`;
  }
  out.push(rest);
  return out;
}
