// Section B-B where its cut crosses the slab's existing openings a replacement's survey found (room-draw.ts foundSpans;
// round 37: the slab was drawn solid across them): the slab open there, the opening dashed with its diagonal as the plan
// draws it, named as on the plan under the slab — clear of the lettering, the dimension lines and the hatched walls
// drawn so far. Model entities (u along the drop line, z up from the room's floor) [mm]; pure.
import { TEXT, path, type Box, type Entity, type Pt } from '../drawing';
import type { RoomGeo } from './machine-room';
import { foundSpans } from './room-draw';
import { AT, dimBands, firstClear, leastOn, letteringBox, takenBy } from './room-label';
import type { RoomSite } from './room-site';

const ANYWHERE: Box = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };

/** The stretches [u0, u1] of the cut where an existing opening leaves the slab open. */
export const foundGaps = (S: Pick<RoomSite, 'openings'>, G: RoomGeo): [number, number][] => foundSpans(S, G).map(({ u0, u1 }): [number, number] => [u0, u1]);

/** The existing openings the cut crosses, over `out` drawn so far, at the section's scale 1:25·`sk`. */
export function foundSection(S: Pick<RoomSite, 'openings'>, G: RoomGeo, out: readonly Entity[], sk: number): Entity[] {
  const R = G.room, k = AT * sk, h = TEXT.min * k, res: Entity[] = [];
  const walls = out.flatMap((e): Box[] => (e.e === 'path' && e.fill === 'concrete'
    ? [{ x0: Math.min(...e.pts.map((p) => p[0])), y0: Math.min(...e.pts.map((p) => p[1])), x1: Math.max(...e.pts.map((p) => p[0])), y1: Math.max(...e.pts.map((p) => p[1])) }] : []));
  const busy = [...takenBy(out, k), ...dimBands(out, k), ...walls];
  for (const { u0, u1, box } of foundSpans(S, G)) {
    res.push(path([[u0, -R.slab], [u1, -R.slab], [u1, 0], [u0, 0]], true, 'hidden'), path([[u0, -R.slab], [u1, 0]], false, 'hidden'));
    // its name as on the plan, under the opening, a little aside or lower down when that is taken, else over the floor
    const text = `FORO ESISTENTE ${Math.round(box[2] - box[0])}×${Math.round(box[3] - box[1])}`, mid = (u0 + u1) / 2;
    const place = (at: Pt) => ({ at, box: letteringBox(at, text, TEXT.min, 'c', 0, false, k) });
    const tries = [...[0, 1, 2].map((i) => -R.slab - 60 * sk - h - i * 1.5 * h), 60 * sk].flatMap((z) => [0, -1, 1, -2, 2].map((s) => place([mid + s * 200 * sk, z])));
    const spot = firstClear(tries, busy, ANYWHERE, 20 * sk) ?? leastOn(tries, busy);
    res.push({ e: 'text', at: spot.at, text, size: TEXT.min, align: 'c', halo: true });
    busy.push(spot.box);
  }
  return res;
}
