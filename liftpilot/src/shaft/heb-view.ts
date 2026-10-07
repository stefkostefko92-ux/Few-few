// The HEB beams on the shaft's walls drawn in the machine room (heb.ts, registry locale.putrelle.vano): in plan, the two
// beams on the floor across the shaft, past its inner faces into its walls, with their length — changed by choosing
// another of the six (two directions, three profiles), the shortest first; in section B-B, seen along them or cut across
// them, with their height — changed by choosing another profile the same way (the direction kept). Model entities.
import { chain, line, path, pickEdit, rect, type Edit, type Entity, type Pt } from '../drawing';
import { hebLayouts, type HebLayout, type HebShaft } from './heb';
import type { MachineSpec, RoomGeo } from './machine-room';
import { PROFILES } from './profiles';
import { HEB_PROFILES } from './support';

const WAY = { x: 'larghezza', y: 'profondità' } as const;

/** The six beams to choose from on the plan's length (the shortest first, then the lightest), the one drawn current. */
function optionPick(lay: HebLayout, G: RoomGeo, M: MachineSpec, S: HebShaft): Edit {
  const all = hebLayouts(G, M, S);
  return pickEdit('heb.option', all.map((o) => ({ label: `${o.profile} · L ${Math.round(o.length)} mm (${WAY[o.dir]} del vano)`, set: `${o.dir}:${o.profile}` })),
    Math.max(0, all.findIndex((o) => o.dir === lay.dir && o.profile === lay.profile)));
}

/** The beams' height changed by choosing another profile, their direction kept. */
const profilePick = (lay: HebLayout): Edit =>
  pickEdit('heb.option', HEB_PROFILES.map((p) => ({ label: `${p} · h ${PROFILES[p].h} mm`, set: `${lay.dir}:${p}` })), HEB_PROFILES.indexOf(lay.profile));

/** Plan: the two beams' outlines and axes; their length beside the outer one, inside the room. */
export function hebPlan(lay: HebLayout, G: RoomGeo, M: MachineSpec, S: HebShaft): Entity[] {
  const R = G.room, half = PROFILES[lay.profile].b / 2, alongX = lay.dir === 'x', out: Entity[] = [];
  const at = (a: number, c: number): Pt => (alongX ? [a, c] : [c, a]);
  for (const c of lay.at) {
    out.push(path([at(lay.ends[0], c - half), at(lay.ends[1], c - half), at(lay.ends[1], c + half), at(lay.ends[0], c + half)], true, 'outline'));
    out.push(line(at(lay.ends[0] - 60, c), at(lay.ends[1] + 60, c), 'axis'));
  }
  const room = alongX ? R.D : R.W, far = lay.at[1] + half + 320 < room - 100;
  const row = far ? lay.at[1] + half + 320 : lay.at[0] - half - 320, from = far ? lay.at[1] + half : lay.at[0] - half;
  out.push(chain({ dir: alongX ? 'x' : 'y', pts: [lay.ends[0], lay.ends[1]], at: row, from: [from, from], text: [`2 ${lay.profile} L {v}`], edit: [optionPick(lay, G, M, S)] }));
  return out;
}

/** An HEB cut across at u over the floor: its flanges and web, `w` the flanges' width along the cut. */
function cutH(u: number, w: number, lay: HebLayout): Entity {
  const P = PROFILES[lay.profile], B = w / 2, t = P.tw / 2, h = P.h, f = P.tf;
  return path([[u - B, 0], [u + B, 0], [u + B, f], [u + t, f], [u + t, h - f], [u + B, h - f], [u + B, h], [u - B, h], [u - B, h - f], [u - t, h - f], [u - t, f], [u - B, f]], true, 'outline', 'steel');
}

/** Section B-B along the drop line (u) over the room's floor: the beams seen along them (the section runs with them) or
 *  cut where the drop line crosses them; their height at u = `chainAt`, changed by choosing another profile. */
export function hebSection(lay: HebLayout, G: RoomGeo, chainAt: number): Entity[] {
  const P = PROFILES[lay.profile], out: Entity[] = [], along = lay.dir === 'x' ? 0 : 1, across = 1 - along, d: Pt = [G.ux, G.uy];
  const uOf = (p: Pt): number => (p[0] - G.carDrop[0]) * G.ux + (p[1] - G.carDrop[1]) * G.uy;
  const pt = (a: number, c: number): Pt => (along ? [c, a] : [a, c]);
  const us: number[] = [];
  if (Math.abs(d[along]) >= Math.abs(d[across])) {
    // seen beside the cut: drawn, not hatched, its flanges
    const [u0, u1] = [uOf(pt(lay.ends[0], lay.at[0])), uOf(pt(lay.ends[1], lay.at[0]))].sort((a, b) => a - b);
    out.push(rect(u0, 0, u1, P.h, 'outline'));
    for (const z of [P.tf, P.h - P.tf]) out.push(line([u0, z], [u1, z], 'thin'));
    us.push(u0, u1);
  } else {
    for (const c of lay.at) {
      const u = (c - G.carDrop[across]) / d[across];
      out.push(cutH(u, P.b / Math.abs(d[across]), lay));
      us.push(u);
    }
  }
  const near = us.reduce((p, u) => (Math.abs(u - chainAt) < Math.abs(p - chainAt) ? u : p), us[0] ?? chainAt);
  out.push(chain({ dir: 'y', pts: [0, P.h], at: chainAt, from: [near, near], text: [`${lay.profile} {v}`], edit: [profilePick(lay)] }));
  return out;
}
