// Where a name or a reference goes on the machine room's plan among what is drawn there (room-setout.ts): the boxes the
// lettering, the references and the symbols already placed take — measured as they are at 1:25, the plan's scale —
// and the first of the places offered whose box keeps off them and off what else is given. Model millimetres; pure.
import { textWidth, type Box, type Entity, type Pt } from '../drawing';

/** The plan's scale the boxes are measured at (paper millimetres to model millimetres). */
export const AT = 25;
/** A reference's circle (view.ts tag) and a symbol's half size (symbols.ts) at the plan's scale [mm]. */
const TAG_R = 1.9 * AT, MARK_R = 1.9 * AT;

const grow = (b: Box, d: number): Box => ({ x0: b.x0 - d, y0: b.y0 - d, x1: b.x1 + d, y1: b.y1 + d });
export const meets = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The box of a lettering at `at` (its baseline), `size` high on paper, aligned left, centred or right, upright or turned
 *  by a quarter. */
export function letteringBox(at: Pt, text: string, size: number, align: 'l' | 'c' | 'r' = 'l', angle = 0): Box {
  const w = textWidth(text, { size, cond: true }) * AT, h = size * AT, a0 = align === 'l' ? 0 : align === 'c' ? -w / 2 : -w;
  const quarter = Math.abs(Math.abs(angle) - 90) < 1;
  return quarter ? { x0: at[0] - 0.85 * h, y0: at[1] + a0, x1: at[0] + 0.3 * h, y1: at[1] + a0 + w } : { x0: at[0] + a0, y0: at[1] - 0.3 * h, x1: at[0] + a0 + w, y1: at[1] + 0.85 * h };
}

/** What the lettering, the references and the symbols among `es` take. */
export function takenBy(es: readonly Entity[]): Box[] {
  return es.flatMap((e): Box[] => {
    if (e.e === 'text') return [letteringBox(e.at, e.text, e.size ?? 2.5, e.align ?? 'l', e.angle ?? 0)];
    if (e.e === 'tag') return [{ x0: e.at[0] - TAG_R, y0: e.at[1] - TAG_R, x1: e.at[0] + TAG_R, y1: e.at[1] + TAG_R }];
    if (e.e === 'mark') return [{ x0: e.at[0] - MARK_R, y0: e.at[1] - MARK_R, x1: e.at[0] + MARK_R, y1: e.at[1] + MARK_R }];
    return [];
  });
}

/** The first box of `places` (each with what it is for) clear of `busy` by `gap`, and inside `within`; null: none. */
export function firstClear<T extends { box: Box }>(places: readonly T[], busy: readonly Box[], within: Box, gap = 20): T | null {
  return places.find((p) => p.box.x0 >= within.x0 && p.box.x1 <= within.x1 && p.box.y0 >= within.y0 && p.box.y1 <= within.y1 && busy.every((b) => !meets(grow(p.box, gap), b))) ?? null;
}

/** A reference's box at `c`. */
export const tagBox = (c: Pt): Box => ({ x0: c[0] - TAG_R, y0: c[1] - TAG_R, x1: c[0] + TAG_R, y1: c[1] + TAG_R });
