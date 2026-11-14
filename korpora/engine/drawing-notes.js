// The notes of an assembly sheet, from what the model really has: materials, the joints in use, the named hardware,
// and the warning line when the checks found errors; and the material line of the title block.
import { fmt, errorAlert } from './drawing-kit.js';
import { decorName, STOCK } from './materials.js';
import { GROOVE, HDF_T } from './joinery.js';
import { esc } from './util.js';

const HW_KIND = [['hinge:', 'панта'], ['slide:', 'водач'], ['handle:', 'дръжка']];
const VARIANT_NOTE = { full: ', покрит кант', half: ', полупокрит кант', inset: ', открит кант' };

export function materialLine(parts) {
  const main = parts.find((p) => p.role === 'side' || p.role === 'bed-rail') ?? parts[0];
  return `${STOCK[main.stock].name} ${fmt(main.T)} · ${decorName(main.decor)}`;
}

export function notes(model) {
  const { parts, spec, hardware } = model;
  const front = parts.find((p) => p.role === 'door' || p.role === 'drawer-front' || p.role === 'bed-head');
  const carcass = parts.find((p) => p.role === 'side' || p.role === 'bed-rail');
  const has = (test) => parts.some(test);
  const kinds = new Set(parts.flatMap((p) => p.features.map((f) => f.kind)));
  const lines = [];
  if (carcass) lines.push(`Корпус: ${STOCK[carcass.stock].name} ${fmt(carcass.T)} mm, ${decorName(carcass.decor)}; кант ${fmt(spec.bandCarcass)} mm.`);
  if (front) lines.push(`Фронт: ${STOCK[front.stock].name} ${fmt(front.T)} mm, ${decorName(front.decor)}${STOCK[front.stock].painted ? ' (боядисан, без кант)' : `; кант ${fmt(spec.bandFront)} mm`}. Фуга ${fmt(spec.gap)} mm.`);
  const joints = [];
  if (kinds.has('confirmat')) joints.push('конфирмат 7×50');
  // a fixed shelf doweled over the screw heads of the one on the other face of a partition (cells.js): the order matters
  if (kinds.has('dowel')) joints.push('неподвижен рафт срещу друг от другата страна на делител — на шкантове 8×35 с лепило, след като другият е завит с конфирматите си');
  if (has((p) => p.role === 'shelf')) joints.push('рафтоносачи по системата 32 mm');
  if (has((p) => p.role === 'back')) joints.push(kinds.has('back-groove') ? `гръб HDF ${HDF_T} mm в канал ${GROOVE.width}×${GROOVE.depth} mm на ${GROOVE.inset} mm от гърба` : `гръб HDF ${HDF_T} mm, прикован отзад`);
  if (has((p) => p.role === 'drawer-bottom')) joints.push(`дъна на чекмеджетата HDF ${HDF_T} mm в канал`);
  if (has((p) => p.role === 'bed-ledger')) joints.push('летви с винтове 4×30, връзки за легло по шаблона на обкова');
  if (kinds.has('stack-pilot')) joints.push('горният корпус — с винтове 4×30 към долния');
  if (kinds.has('blind-fix')) joints.push('слепите фронтове — с ъглови планки отвътре, винтовете на място');
  if (hardware.some((h) => h.key === 'worktopBolts')) joints.push('плотът — на парчета по стените, с болтове в ъглите');
  if (spec.type === 'desk') joints.push('плотът — с метални ъгълчета към страниците');
  if (joints.length) lines.push(`Съединения: ${joints.join(', ')}.`);
  // hinges, slides and handles in short: the article where the shop gives one; everything is in hardware.csv
  const named = hardware
    .map((h) => ({ h, kind: HW_KIND.find(([prefix]) => h.key.startsWith(prefix))?.[1] }))
    .filter(({ kind }) => kind)
    .map(({ h, kind }) => {
      const what = h.sku ? `${h.brand ?? ''} ${h.sku}` : kind === 'дръжка' ? h.name.replace(/\s*\([^()]*\)\s*$/, '') : `${kind} ${h.brand ?? ''}`;
      return `${what}${VARIANT_NOTE[h.variant] ?? ''} × ${h.qty}`.replace(/\s+/g, ' ').trim();
    });
  if (named.length) lines.push(`Обков: ${named.join('; ')} — пълният списък е в hardware.csv.`);
  const rows = lines.flatMap((t) => wrap(t));
  if (rows.length > 6) rows.splice(5, rows.length - 5, `${rows[5].slice(0, 120)}…`);
  return rows.map((t, i) => `<text class="d-note" x="30" y="${258 + i * 4.2}">${esc(t)}</text>`).join('') + errorAlert(model, 30, 258 + rows.length * 4.2);
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
