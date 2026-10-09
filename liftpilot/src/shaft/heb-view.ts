// The HEB beams on the shaft's walls drawn in the machine room (heb.ts, registry locale.putrelle.vano): in plan, the two
// beams on the floor across the shaft, past its inner faces into its walls, on their bearing plates over the walls, with
// their length — changed by choosing another of the six (two directions, three profiles), the shortest first —, the
// bearing in the wall and where their axes stand from the shaft's walls; in section B-B, seen along them or cut across
// them, on the plates and mortar that keep them off the slab between the bearings, with their height — changed by
// choosing another profile the same way (the direction kept) — and the bearing; the note of the bearings and of the
// support's fixing to the beams (hebNote) placed with the section's other notes (room-section-extra.ts). Model entities.
import { chain, line, path, pickEdit, rect, type Edit, type Entity, type Pt } from '../drawing';
import { hebLayouts, type HebLayout, type HebShaft } from './heb';
import type { MachineSpec, RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { PROFILES } from './profiles';
import type { Note } from './room-section-extra';
import { HEB_PAD, HEB_PROFILES } from './support';

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
  // the bearing plates over the walls under each end, as long as the bearing (their sides past the flanges seen)
  const pw = KV_VERT.hebPlateW / 2;
  for (const c of lay.at) for (const [a0, a1] of [[lay.ends[0], lay.span[0]], [lay.span[1], lay.ends[1]]]) out.push(path([at(a0, c - pw), at(a1, c - pw), at(a1, c + pw), at(a0, c + pw)], true, 'thin'));
  const room = alongX ? R.D : R.W, far = lay.at[1] + half + 320 < room - 100;
  const row = far ? lay.at[1] + half + 320 : lay.at[0] - half - 320, from = far ? lay.at[1] + half : lay.at[0] - half;
  out.push(chain({ dir: alongX ? 'x' : 'y', pts: [lay.ends[0], lay.ends[1]], at: row, from: [from, from], text: [`2 ${lay.profile} L {v}`], edit: [optionPick(lay, G, M, S)] }));
  // the bearing in the wall at the end nearer the room's middle, beside the beams' row; the axes from the shaft's inner
  // faces across them, past their ends in the wall (where the shaft's walls are under the floor): references the
  // derivation places
  const mid = (alongX ? R.W : R.D) / 2, near = Math.abs(lay.ends[0] - mid) <= Math.abs(lay.ends[1] - mid);
  out.push(chain({ dir: alongX ? 'x' : 'y', pts: near ? [lay.ends[0], lay.span[0]] : [lay.span[1], lay.ends[1]], at: row + (far ? 260 : -260), from: [from, from], text: ['{v} Appoggio'] }));
  const s0 = alongX ? R.shaftY : R.shaftX, s1 = s0 + (alongX ? S.D : S.W), endAt = near ? lay.ends[1] + 160 : lay.ends[0] - 160, tip = near ? lay.ends[1] : lay.ends[0];
  out.push(chain({ dir: alongX ? 'y' : 'x', pts: [s0, lay.at[0], lay.at[1], s1], at: endAt, from: [undefined, tip, tip, undefined], text: ['{v} Asse HEB', 'Interasse {v}', '{v} Asse HEB'] }));
  return out;
}

/** An HEB cut across at u, its underside at z0 over the floor: its flanges and web, `w` the flanges' width along the cut. */
function cutH(u: number, w: number, lay: HebLayout, z0: number): Entity {
  const P = PROFILES[lay.profile], B = w / 2, t = P.tw / 2, h = z0 + P.h, f = P.tf, b = z0;
  return path([[u - B, b], [u + B, b], [u + B, b + f], [u + t, b + f], [u + t, h - f], [u + B, h - f], [u + B, h], [u - B, h], [u - B, h - f], [u - t, h - f], [u - t, b + f], [u - B, b + f]], true, 'outline', 'steel');
}

/** A bearing under an HEB beam from u0 to u1: the mortar bed on the slab, the steel plate on it. */
const bearing = (u0: number, u1: number): Entity[] => [rect(u0, 0, u1, KV_VERT.hebMortar, 'thin'), rect(u0, KV_VERT.hebMortar, u1, HEB_PAD, 'outline', 'steel')];

/** The lettering of the bearings: plate, mortar and the gap left under the beam; the support's fixing to the beams. */
const FIX_TEXT = 'Basamento fissato alle ali delle putrelle con piastre e bulloni (o morsetti): dettaglio da confermare';
const PAD_TEXT = `HEB su piastre ${KV_VERT.hebBearing}×${KV_VERT.hebPlateW}×${KV_VERT.hebPlateT} e malta antiritiro ${KV_VERT.hebMortar} sopra i muri del vano · distacco ${HEB_PAD} dalla soletta fra gli appoggi`;

/** How section B-B along the drop line (u) sees the beams: along them (the section runs with them: their ends u0, u1 and
 *  the inner faces of the walls i0, i1 they bear on) or cut across where the drop line crosses each (at u, `w` the
 *  flanges' width along the cut, `onWall` over a wall on its plate). */
type HebSeen = { along: true; u: [number, number]; i: [number, number] } | { along: false; cuts: { u: number; w: number; onWall: boolean }[] };
function hebSeen(lay: HebLayout, G: RoomGeo): HebSeen {
  const along = lay.dir === 'x' ? 0 : 1, across = 1 - along, d: Pt = [G.ux, G.uy];
  const uOf = (p: Pt): number => (p[0] - G.carDrop[0]) * G.ux + (p[1] - G.carDrop[1]) * G.uy;
  const pt = (a: number, c: number): Pt => (along ? [c, a] : [a, c]);
  if (Math.abs(d[along]) >= Math.abs(d[across])) {
    const [u0, u1] = [uOf(pt(lay.ends[0], lay.at[0])), uOf(pt(lay.ends[1], lay.at[0]))].sort((a, b) => a - b);
    const [i0, i1] = [uOf(pt(lay.span[0], lay.at[0])), uOf(pt(lay.span[1], lay.at[0]))].sort((a, b) => a - b);
    return { along: true, u: [u0, u1], i: [i0, i1] };
  }
  return { along: false, cuts: lay.at.map((c) => {
    const u = (c - G.carDrop[across]) / d[across], a = G.carDrop[along] + u * d[along];
    return { u, w: PROFILES[lay.profile].b / Math.abs(d[across]), onWall: a < lay.span[0] || a > lay.span[1] };
  }) };
}

/** Section B-B along the drop line (u) over the room's floor: the beams seen along them (the section runs with them) or
 *  cut where the drop line crosses them, on their bearing plates over the walls and HEB_PAD clear of the slab between
 *  them; their height at u = `chainAt`, changed by choosing another profile; seen along them, the bearing in the wall. */
export function hebSection(lay: HebLayout, G: RoomGeo, chainAt: number): Entity[] {
  const P = PROFILES[lay.profile], out: Entity[] = [], z0 = HEB_PAD, seen = hebSeen(lay, G), us: number[] = [];
  if (seen.along) {
    // seen beside the cut: drawn, not hatched, its flanges; the plates under its ends over the walls
    const [u0, u1] = seen.u, [i0, i1] = seen.i;
    out.push(rect(u0, z0, u1, z0 + P.h, 'outline'), ...bearing(u0, i0), ...bearing(i1, u1));
    for (const z of [z0 + P.tf, z0 + P.h - P.tf]) out.push(line([u0, z], [u1, z], 'thin'));
    // the bearing at the end farther from the chain of its height, over the beam
    const left = Math.abs(u0 - chainAt) > Math.abs(u1 - chainAt);
    out.push(chain({ dir: 'x', pts: left ? [u0, i0] : [i1, u1], at: z0 + P.h + 90, from: [z0 + P.h, z0 + P.h], text: ['{v} Appoggio'] }));
    us.push(u0, u1);
  } else {
    for (const { u, w, onWall } of seen.cuts) {
      // where the drop line crosses the beam: over the shaft clear of the slab, over a wall on its plate
      out.push(cutH(u, w, lay, z0));
      if (onWall) out.push(...bearing(u - w / 2 - 20, u + w / 2 + 20));
      us.push(u);
    }
  }
  const near = us.reduce((p, u) => (Math.abs(u - chainAt) < Math.abs(p - chainAt) ? u : p), us[0] ?? chainAt);
  out.push(chain({ dir: 'y', pts: [z0, z0 + P.h], at: chainAt, from: [near, near], text: [`${lay.profile} {v}`], edit: [profilePick(lay)] }));
  return out;
}

/** The note of the beams in section B-B: their plates and mortar over the shaft's walls with the gap left under them
 *  (registry locale.putrelle.vano), and the support's fixing to their flanges; its leader to the nearest bearing seen
 *  along them, or to the gap under a beam cut across. */
export function hebNote(lay: HebLayout, G: RoomGeo): Note {
  const seen = hebSeen(lay, G), z = HEB_PAD / 2;
  const to: Pt[] = seen.along ? [[(seen.u[0] + seen.i[0]) / 2, z], [(seen.i[1] + seen.u[1]) / 2, z]] : seen.cuts.map(({ u, w }): Pt => [u + w / 2, z]);
  return { text: `${PAD_TEXT}\n${FIX_TEXT}`, to: to[0] ?? [0, z], also: to.slice(1) };
}
