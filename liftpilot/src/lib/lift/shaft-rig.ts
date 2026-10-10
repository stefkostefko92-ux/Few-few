// The lift's rope rig as the shaft's sheets draw it and the car roof's spaces meet it (src/shaft/shaft-rig.ts): the
// pulleys of a 2:1 roping with their dead ends, a machine below's pulleys over the shaft with the level runs between two
// of them and the runs down to the machine, its governor under the ceiling, the openings of the slab. The places are the
// 3D's (rig.ts: the falls of falls.ts, the head pulleys of bottom.ts, a 2:1 car pulley CAR_PULLEY_GAP over the
// crosshead, the counterweight's 60 mm over its frame, the dead ends anchored 50 mm under the slab with sockets 140 mm
// long under them: pulleys.ts). Plan in the shaft's axes, heights from the lowest floor [mm]. Pure.
import { KV_VERT } from '@/shaft/norme-vert';
import type { RoomInputs } from '@/shaft/room';
import { ropeWidths } from '@/shaft/ropes';
import { fallsOf } from '@/shaft/falls';
import { governorSpot } from '@/shaft/governor';
import { section } from '@/shaft/section';
import type { RigP2, RigPulley, ShaftRig } from '@/shaft/shaft-rig';
import type { Layout, ShaftInputs } from '@/shaft/types';
import type { BottomGeo } from './bottom';
import { CAR_PULLEY_GAP } from './head';
import { KL } from './norme';

/** The counterweight's pulley of a 2:1 roping over its frame, to the rim; the dead ends' plate under the slab and the
 *  sockets under it [mm] (the 3D's: rig.ts cwHitch and deadY, pulleys.ts). */
const CW_PULLEY_GAP = 60, DEAD_PLATE = 50, DEAD_SOCKET = 140;
/** The clearance round the ropes in an opening of the slab [mm] (slab.ts CLEAR). */
const HOLE_CLEAR = 30;

const unit = (a: RigP2, b: RigP2): RigP2 => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return l > 1e-9 ? [(b[0] - a[0]) / l, (b[1] - a[1]) / l] : [1, 0];
};
const along = (o: RigP2, d: RigP2, u: number): RigP2 => [o[0] + u * d[0], o[1] + u * d[1]];

/** The pulley room over the shaft of a machine below whose design has none (scheme `room`): as large as the shaft, as
 *  high and with a door as small as a pulley room may have (registry locale.pulegge), on the slab the software takes
 *  (KL.slab) — the 3D's (roomshell.ts) and the sheets'. */
export const pulleyRoomOf = (I: ShaftInputs): RoomInputs => I.room ?? {
  W: I.W, D: I.D, shaftX: 0, shaftY: 0, H: KV_VERT.pulleyRoomH, ridge: 0, slab: KL.slab, doorWall: 'front', doorAt: 150, doorW: KV_VERT.doorMinW,
  doorH: KV_VERT.pulleyDoorH, panelWall: 'rear', panelAt: 0, panelW: 0, panelD: 0, panelH: 0,
};

/** The rig of layout `L` for the roping `roping` with pulleys of diameter `Dp`, `n` ropes of diameter `d`, and the
 *  geometry `g` of the machine below (null: the machine above). */
export function shaftRigOf(L: Layout, roping: number, Dp: number, n: number, d: number, g: BottomGeo | null): ShaftRig {
  const S = section(L), V = L.inputs.vertical, F = fallsOf(L, roping, Dp), two = roping === 2 && F.dead.length === 2, r = Dp / 2;
  const w = ropeWidths(n, d), half = w.pulley, ceiling = S.ceiling;
  // 2:1: each part's pulley half a pulley along its plane from its dead end, the dead ends anchored under the slab
  const car: RigPulley | null = two ? { c: along(F.dead[0].at, F.dead[0].dir, r), dir: F.dead[0].dir, z: V.frameTop + CAR_PULLEY_GAP + r, r, half } : null;
  const cw: RigPulley | null = two ? { c: along(F.dead[1].at, F.dead[1].dir, r), dir: F.dead[1].dir, z: V.cwH + CW_PULLEY_GAP + r, r, half } : null;
  const deadZ = ceiling - DEAD_PLATE - DEAD_SOCKET;
  const dead = two ? [{ at: F.dead[0].at, dir: F.dead[0].dir, tag: 'P2' as const, z: deadZ }, { at: F.dead[1].at, dir: F.dead[1].dir, tag: 'P3' as const, z: deadZ }] : [];
  const head: RigPulley[] = [], runs: { a: RigP2; b: RigP2; z: number }[] = [];
  if (g) {
    // over each rise the head turns the rope to its run: one pulley at 180°, or two at 90° with a level run between
    // (rig.ts carHead, cwHead), the ropes' axis over the pulleys' at the top
    for (const [rise, run, two90] of [[F.car, g.mc, g.carPulleys === 2], [F.cw, g.mw, g.cwPulleys === 2]] as const) {
      const dir = unit(rise, run), s = Math.hypot(run[0] - rise[0], run[1] - rise[1]);
      head.push({ c: along(rise, dir, r), dir, z: g.zHead, r, half });
      if (two90) {
        head.push({ c: along(rise, dir, s - r), dir, z: g.zHead, r, half });
        runs.push({ a: along(rise, dir, r), b: along(rise, dir, s - r), z: g.zHead + r });
      }
    }
  }
  // the openings of the slab over the shaft of a machine below, across the depth (section A-A): round each rope through
  // it into a pulley room — the rises and the runs down —, none under hung pulleys (the machine above: the section's own)
  const hung = g !== null && g.scheme !== 'room';
  const through: { p: RigP2; dir: RigP2 }[] = !g || hung ? []
    : [{ p: F.car, dir: unit(F.car, g.mc) }, { p: F.cw, dir: unit(F.cw, g.mw) }, { p: g.mc, dir: unit(g.mc, g.mw) }, { p: g.mw, dir: unit(g.mc, g.mw) }];
  const holes = through.map(({ p, dir }) => {
    // the pack across its plane, seen along x
    const e = Math.abs(dir[0]) * w.ropes + Math.abs(dir[1]) * (d / 2) + HOLE_CLEAR;
    return [p[1] - e, p[1] + e] as const;
  });
  const merged: [number, number][] = [];
  for (const [a, b] of [...holes].sort((p, q) => p[0] - q[0])) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 80) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  // the governor of a machine below: on its bracket under the ceiling with the pulleys hung there, in the pulley room
  // otherwise (registry limitatore.vano)
  const governor = hung && governorSpot(L) ? { z: ceiling - KV_VERT.govUnderCeiling } : null;
  return {
    scheme: g?.scheme ?? null, head, hung, runs, down: g ? [g.mc, g.mw] : [], across: g ? g.dir : [1, 0], downTo: g?.zSheave ?? 0, ropes: w.ropes, d,
    car, cw, dead, governor, holes: g ? merged : null, ceiling, roof: S.top + S.moveUp + V.carOutH,
  };
}

/** The layout of a lift design with its rig in the shaft (Layout.rig): the checks of the car roof's spaces (head.ts)
 *  and the 3D measure to what hangs there. */
export const withRig = (L: Layout, roping: number, Dp: number, n: number, d: number, g: BottomGeo | null): Layout =>
  ({ ...L, rig: shaftRigOf(L, roping, Dp, n, d, g) });

/** The layout the shaft's sheets draw of a lift design: its rig in the shaft, and over the shaft the room the lift has —
 *  none with the pulleys hung under the slab (the slab closed: a room of an earlier design above it is not the lift's),
 *  a pulley room (the design's, else as the 3D's) with the pulleys over the slab, the machine room with the machine
 *  above. */
export function sheetLayout(L: Layout, roping: number, Dp: number, n: number, d: number, g: BottomGeo | null): Layout {
  const room = g === null ? L.inputs.room : g.scheme === 'room' ? pulleyRoomOf(L.inputs) : null;
  return withRig(room === L.inputs.room ? L : { ...L, inputs: { ...L.inputs, room } }, roping, Dp, n, d, g);
}
