// A machine replacement made a whole project: its survey measured where the existing ropes come up through the slab
// (src/lib/room/survey.ts: from the corner of the wall of entrance A, x along it, y into the shaft, as the plan). The
// example plan the form starts from puts the car and the counterweight elsewhere; the plan takes them where the ropes
// hang: the car's middle under its drop (its depth from the entrance, its place across), the counterweight's middle
// under its own, at the back or on the side the drop is. A direct pull's falls are then the existing sheave's
// diameter apart as measured (registry impianto.calata), and the drawings show the installation as it is. null: a
// second entrance or a niche, or a plan that cannot have them there (out of the save's ranges, or moved by the
// shaft's rules); the example's plan stays.
import { layout } from '@/shaft';
import type { Rect, ShaftInputs } from '@/shaft/types';
import type { Survey } from '@/lib/room/survey';

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1;
const middle = (r: Rect): readonly [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

export function atSurveyDrops(S: ShaftInputs, s: Pick<Survey, 'car' | 'cw'>): ShaftInputs | null {
  if (S.entrances !== 'one' || S.niches?.length) return null;
  const mx = s.cw.x - s.car.x, my = s.cw.y - s.car.y;
  const side = my >= Math.abs(mx) ? 'rear' : mx < 0 ? 'left' : 'right';
  const L = layout({ ...S, cw: side }), w = S.carWall, A = L.carInner.w, len = side === 'rear' ? L.cw.w : L.cw.h;
  const B = Math.round(2 * (s.car.y - L.car.y - w)), carX = Math.round(s.car.x - A / 2 - w);
  const gap = Math.round(side === 'rear' ? S.D - S.cwDepth / 2 - s.cw.y : side === 'left' ? s.cw.x - S.cwDepth / 2 : S.W - S.cwDepth / 2 - s.cw.x);
  const cwPos = Math.round((side === 'rear' ? s.cw.x : s.cw.y) - len / 2);
  // the ranges the save takes (src/lib/shaft-input.ts)
  if (B < 300 || carX < 0 || gap < 0 || gap > 800 || len < 100 || len > 3000 || cwPos < 0) return null;
  const out: ShaftInputs = { ...S, cw: side, cwWallGap: gap, plan: { ...S.plan, A, B, carX, cwLen: Math.round(len), cwPos } };
  const P = layout(out), [cx, cy] = middle(P.car), [wx, wy] = middle(P.cw);
  return near(cx, s.car.x) && near(cy, s.car.y) && near(wx, s.cw.x) && near(wy, s.cw.y) ? out : null;
}
