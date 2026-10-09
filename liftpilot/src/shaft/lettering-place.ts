// Lettering of a drawing of the shaft set at the first of its places clear of what the drawing already letters there:
// each option a group that goes together (a name with its dimension), tried in order against the boxes taken so far
// (tag-place.ts letteringBoxes at the drawing's scale, never under 1:25); where none is clear, of those whose words stay
// where they must the one that covers least of what matters most (`hard`, in order: the lettering the same module set
// just before, then the names already on the drawing), then least of the rest. What is set is added to the boxes taken,
// so the next lettering keeps off it. Pure apart from `taken`, which it extends.
import type { Box, Entity } from '../drawing';
import { letteringBoxes } from './tag-place';

/** The area two boxes share [mm²]. */
const shared = (a: Box, b: Box): number => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** The first of `options` whose lettering keeps off `taken` and every set of `hard`, its words inside `within` when
 *  given (a dimension's figures may run past its ends); else, of those with the fewest words outside, the one that
 *  covers least of the first set of `hard`, then of the next, then least of the rest. */
export function firstClear(options: readonly (readonly Entity[])[], taken: Box[], scale: number, within?: Box, hard: readonly (readonly Box[])[] = []): readonly Entity[] {
  const inside = (b: Box): boolean => !within || (b.x0 >= within.x0 && b.x1 <= within.x1 && b.y0 >= within.y0 && b.y1 <= within.y1);
  const cover = (bs: readonly Box[], qs: readonly Box[]): number => bs.reduce((s, b) => s + qs.reduce((t, q) => t + shared(b, q), 0), 0);
  // (each option's score: its words outside, what it covers of each set of `hard`, of the rest — compared in that order)
  const scored = options.map((o) => {
    const bs = letteringBoxes(o, scale), words = letteringBoxes(o.filter((e) => e.e === 'text'), scale);
    return { o, bs, score: [words.filter((b) => !inside(b)).length, ...hard.map((h) => cover(bs, h)), cover(bs, taken)] };
  });
  type Scored = (typeof scored)[number];
  const better = (x: Scored, m: Scored): boolean => {
    const i = x.score.findIndex((v, j) => v !== m.score[j]);
    return i >= 0 && x.score[i] < (m.score[i] ?? 0);
  };
  const got = scored.find((x) => x.score.every((v) => v === 0)) ?? scored.reduce<Scored | undefined>((m, x) => (!m || better(x, m) ? x : m), undefined);
  if (!got) return [];
  taken.push(...got.bs);
  return got.o;
}
