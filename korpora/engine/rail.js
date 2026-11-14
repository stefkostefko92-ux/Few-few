// Hanging rail of a wardrobe column: an oval tube 30 × 15, upright, on two end holders, across the column at half its
// depth. Where it hangs and what is checked:
// – ГОСТ 13025.1-85 „Мебель бытовая. Функциональные размеры отделений для хранения“ (ред. от 17.05.2005), черт. 1 и 2:
//   „50 min“ from the upper limiting element (the top, or a shelf above) to the top edge of the rail, and „560 min“ — the
//   depth of a compartment for clothes on hangers, measured in the zone of the rail (бележка към п. 2) from the back wall
//   to the inner face of the doors (п. 9).
//   https://www.kontur-extern.ru/info/normativ/document/9/301747-mebel-bytovaya-funktsionalnye-razmery-otdeleniy-dlya-khraneniya-gost-13025-1-85
// – Hettich, wardrobe tube oval Ø 15/30 (9304395): „Ab einer Länge von 800 mm empfehlen wir den Einsatz eines
//   Schrankrohrmittelträgers“. https://shop-diy.hettich.com/de_EN/Hettich/Cabinet-interior-fittings-%26-Accessories/Cabinet-tubes-%26-Cabinet-tube-bearing/Wardrobe-tube%2C-oval%2C-%C3%98-15-30-x-1000-mm%2C-steel-black/p/9304395
// The program keeps 10 mm off each limit (наш избор): the rail hangs with its top edge 60 mm under the top and warns 10 mm
// before the depth and the length limits.
import { dimTxt, r1 } from './util.js';

const MARGIN = 10; // наш избор
export const RAIL = {
  h: 30, // the oval's height (Hettich Ø 15/30)
  topEdge: 50 + MARGIN, // from the top of the column to the top edge of the rail (ГОСТ „50 min“)
  depth: 560, // ГОСТ „560 min“
  midLength: 800, // Hettich: a centre support from this length
  margin: MARGIN,
};
// The longest rail the generator makes is 1462 mm (a 3000 mm wardrobe in two carcasses of one column): with one centre
// support each half stays under 800 mm.

// The rail of column col (inner width col.xa…col.xb) under the inner top yInnerTop of a carcass from backFront to zEnd.
// The inner face of an overlay door stands FRONT_GAP_Z (1 mm) in front of the carcass: the depth is measured to the
// carcass edge, 1 mm on the safe side.
export function hangRail(ctx, a) {
  const { col, i, yInnerTop, backFront, zEnd, mod, nm } = a;
  const length = r1(col.xb - col.xa - 2);
  ctx.symbols.push({ type: 'rail', x0: col.xa + 1, x1: col.xb - 1, y: yInnerTop - RAIL.topEdge - RAIL.h / 2, z: (backFront + zEnd) / 2, h: RAIL.h, module: mod });
  ctx.hw(`rail${Math.round(col.xb - col.xa)}`, { name: `Лост за закачалки, овален, L=${Math.round(length)} mm`, qty: 1, unit: 'бр.', group: 'Обков' });
  ctx.hw('railHolders', { name: 'Държач за лост', qty: 2, unit: 'бр.', group: 'Обков' });
  const depth = r1(zEnd - backFront);
  if (depth < RAIL.depth + MARGIN) {
    // one note per carcass: every rail column of it has the same depth
    ctx.warn('warn', `${nm('Лост за закачалки')}: вътрешната дълбочина е ${dimTxt(depth)} mm; ГОСТ 13025.1-85 иска поне ${RAIL.depth} mm от гърба до вратата (черт. 1 и 2), а програмата — ${RAIL.depth + MARGIN} mm, с ${MARGIN} mm резерв. Задълбочете шкафа с ${dimTxt(r1(RAIL.depth + MARGIN - depth))} mm.`);
  }
  if (length >= RAIL.midLength - MARGIN) {
    ctx.hw('railCentre', { name: 'Среден държач за лост', qty: 1, unit: 'бр.', group: 'Обков' });
    ctx.warn('warn', `${nm(`Колона ${i + 1}`)}: лостът за закачалки е ${dimTxt(length)} mm — Hettich препоръчва среден държач от ${RAIL.midLength} mm нагоре (овална тръба 15/30), а програмата — от ${RAIL.midLength - MARGIN} mm. Добавен е 1 бр. в обкова; монтира се в средата на лоста.`);
  }
}
