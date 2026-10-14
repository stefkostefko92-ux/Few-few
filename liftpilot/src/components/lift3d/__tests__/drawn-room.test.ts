// The slabs and the machine room in 3D from the drawings' own models (round 37): the slab over the shaft open for the
// governor's rope only where the governor stands over it (closed under hung pulleys, as the sheets have it); the pit's
// slab under a machine below cut where its plan and section A-A cut it, the 3D ropes through it clear of its edges; the
// machine room's lamps, light switch, sockets and grille where its plan puts them — the lamps inside the room, the wall
// fittings clear of the door's opening.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { belt, deriveLift, newLift, ropeRig, type BottomScheme, type LiftInputs, type RopePlane } from '@/lib/lift';
import { KV_VERT, section } from '@/shaft';
import { roomGeo } from '@/shaft/machine-room';
import { DOOR_JAMB, FIT_HALF, VENT_HALF, lampHalf, roomElectrics } from '@/shaft/room-electric';
import { layoutSite } from '@/shaft/room-site';
import { roomPlanEntities } from '@/shaft/room-view';
import { groovePitch } from '@/shaft/ropes';
import { pitHoles } from '@/shaft/rig-view';
import { pitSlabHoles } from '@/shaft/shaft-rig';
import { Batch, onWall } from '../geom';
import { governorFloor, governorSpot } from '../governor';
import { createLiftMaterials, SIDES } from '../materials';
import { buildShell, shellsOf } from '../roomshell';
import { pitOpenings, shaftSlabOpenings } from '../slab';

const below = (scheme: BottomScheme): LiftInputs => {
  const I = newLift();
  return { ...I, calc: { ...I.calc, layout: 'bottom' }, shaft: { ...I.shaft, room: null }, bottom: scheme };
};
const extent = (pts: readonly (readonly [number, number])[]): number[] =>
  [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];

test('soletta sopra il vano: i fori della fune del limitatore solo con il limitatore sopra la soletta', () => {
  for (const [name, inp, over] of [['argano sopra', newLift(), true], ['locale pulegge', below('room'), true], ['rinvii in testata', below('head'), false],
    ['argano sotto la fossa', below('under'), false]] as const) {
    const dv = deriveLift(inp), L = dv.layout, S = section(L), N = dv.analysis.ctx.N, rig = ropeRig(dv), gov = governorSpot(L), sim = dv.sim, slab = L.inputs.room?.slab ?? 250;
    assert.ok(gov, name);
    const travel = [sim.levels[0], sim.levels.at(-1) ?? 0].map((s) => [s, sim.cw0 - s] as const);
    const holes = shaftSlabOpenings(rig, N.n, N.d, S, slab, travel, gov).filter((o) => {
      const [x0, x1] = extent(o.pts);
      return x0 <= gov.x && x1 >= gov.x && !o.curb;
    });
    assert.equal(governorFloor(rig, S, slab) !== null, over, name);
    assert.equal(holes.length, over ? 2 : 0, `${name}: fori del limitatore`);
    // with the pulleys hung under the slab the sheets draw it closed: so does the 3D
    if (L.rig?.hung) assert.deepEqual(shaftSlabOpenings(rig, N.n, N.d, S, slab, travel, gov), [], name);
  }
});

test('soletta della fossa con l’argano sotto: i fori della pianta e della sezione A-A, le funi del 3D lontane dai bordi', () => {
  const dv = deriveLift(below('under')), L = dv.layout, S = section(L), N = dv.analysis.ctx.N, rig = ropeRig(dv), sim = dv.sim;
  assert.ok(L.rig);
  const open = pitOpenings(L);
  assert.deepEqual(open.map((o) => o.pts), pitSlabHoles(L.rig));
  assert.deepEqual(open.map((o) => extent(o.pts).slice(2)), pitHoles(L));
  assert.equal(open.length, 2);
  // the ropes as ropes.ts draws them (a run joining two pieces turns from one plane's spread to the other's)
  const n = N.n, pitch = groovePitch(N.d), at = (p: RopePlane, u: number, i: number): readonly [number, number] => {
    const off = (i - (n - 1) / 2) * pitch, [ox, oy] = p.origin, [dx, dy] = p.dir;
    return [ox + u * 1000 * dx - off * dy, oy + u * 1000 * dy + off * dx];
  };
  // the least distance from a point inside a convex opening to its edges
  const clear = (q: readonly [number, number], pts: readonly (readonly [number, number])[]): number => Math.min(...pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length], ex = b[0] - a[0], ey = b[1] - a[1];
    return Math.abs(ex * (q[1] - a[1]) - ey * (q[0] - a[0])) / Math.hypot(ex, ey);
  }));
  let seen = 0;
  for (const s of [sim.levels[0], sim.levels.at(-1) ?? 0]) {
    const runs: { p0: readonly [number, number]; pl0: RopePlane; p1: readonly [number, number]; pl1: RopePlane }[] = [];
    rig.pieces(s, sim.cw0 - s).forEach((pc, k) => belt(pc.els).runs.forEach(([p0, p1], j) => {
      const last = runs.at(-1);
      if (k > 0 && j === 0 && last) runs[runs.length - 1] = { ...last, p1, pl1: pc.plane };
      else runs.push({ p0, pl0: pc.plane, p1, pl1: pc.plane });
    }));
    for (const r of runs) for (const z of [S.pitFloor - 300, S.pitFloor]) {
      const y = z / 1000;
      if ((r.p0[1] - y) * (r.p1[1] - y) > 0 || r.p0[1] === r.p1[1]) continue;
      const t = (y - r.p0[1]) / (r.p1[1] - r.p0[1]);
      for (let i = 0; i < n; i++) {
        const a = at(r.pl0, r.p0[0], i), b = at(r.pl1, r.p1[0], i), q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const;
        const hole = open.find((o) => { const [x0, x1, y0, y1] = extent(o.pts); return q[0] > x0 && q[0] < x1 && q[1] > y0 && q[1] < y1; });
        assert.ok(hole, `fune ${i} fuori dai fori a ${z}`);
        assert.ok(clear(q, hole.pts) - N.d / 2 >= KV_VERT.holeGap - 5, `fune ${i}: ${Math.round(clear(q, hole.pts) - N.d / 2)} mm dal bordo`);
        seen++;
      }
    }
  }
  assert.ok(seen >= 4 * n, `${seen}`);
});

test('locale macchina in 3D: luci, interruttore, prese e griglia dove li mette la pianta', () => {
  const room = (I: LiftInputs, cw: 'left' | 'rear'): LiftInputs => ({ ...I, shaft: { ...I.shaft, cw } });
  for (const [name, inp] of [['esempio', newLift()], ['contrappeso a sinistra', room(newLift(), 'left')]] as const) {
    const dv = deriveLift(inp), L = dv.layout, G = roomGeo(L, dv.machine), R = L.inputs.room;
    assert.ok(G && R, name);
    const e = roomElectrics(layoutSite(L), dv.machine, G), M = createLiftMaterials();
    // the plan's own marks are these places
    const marks = roomPlanEntities(L, dv.machine, G).entities.flatMap((x) => (x.e === 'mark' && x.sym === 'light' ? [[Math.round(x.at[0]), Math.round(x.at[1])]] : []));
    assert.deepEqual(marks, e.lights.map((l) => [Math.round(l.at[0]), Math.round(l.at[1])]), name);
    const sh = shellsOf(L, ropeRig(dv))[0], groups = {
      sides: { front: new THREE.Group(), rear: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group() },
      onWall: { front: new Batch(), rear: new Batch(), left: new Batch(), right: new Batch() }, roof: new THREE.Group(), overhead: new THREE.Group(), common: new THREE.Group(),
    };
    buildShell(sh, M, groups, e);
    // a lamp over each work area
    const lamps = groups.common.children.flatMap((o) => (o instanceof THREE.PointLight ? [[Math.round(o.position.x * 1000 + R.shaftX), Math.round(-o.position.z * 1000 + R.shaftY)]] : []));
    assert.deepEqual(lamps, e.lights.map((l) => [Math.round(l.at[0]), Math.round(l.at[1])]), name);
    // the switch, the sockets and the grille on their walls, in those walls' groups (hidden with their x-ray)
    const wall = new THREE.Group();
    for (const s of SIDES) groups.onWall[s].into(wall);
    const pts: [number, number][] = [];
    wall.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) pts.push([pos.getX(i) * 1000 + R.shaftX, -pos.getZ(i) * 1000 + R.shaftY]);
    });
    for (const k of [e.lightSwitch, ...e.sockets, e.vent]) {
      const [x, y] = onWall(k.wall, R.W, R.D, k.at, 0);
      assert.ok(pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < 210), `${name}: ${k.wall} a ${Math.round(k.at)}`);
    }
  }
});

test('locale macchina: le plafoniere dentro il locale, interruttore, prese e griglia fuori dal vano della porta', () => {
  type Room = NonNullable<LiftInputs['shaft']['room']>;
  const base = newLift(), room = (I: LiftInputs, r: Partial<Room>): LiftInputs => ({ ...I, shaft: { ...I.shaft, room: { ...(I.shaft.room as Room), ...r } } });
  const cw = (I: LiftInputs, side: 'left' | 'right' | 'rear', cwPos?: number): LiftInputs =>
    ({ ...I, shaft: { ...I.shaft, cw: side, ...(cwPos !== undefined ? { plan: { ...(I.shaft.plan ?? {}), cwPos } } : {}) } });
  const direct = (I: LiftInputs): LiftInputs => ({ ...I, calc: { ...I.calc, layout: 'top' } });
  const cases: readonly (readonly [string, LiftInputs])[] = [
    ['esempio', base], ['contrappeso a sinistra', cw(base, 'left')], ['contrappeso a destra', cw(base, 'right')],
    ['contrappeso sul fondo spostato', cw(base, 'rear', 150)], ['motore verso la cabina', room(base, { motor: 'car' })],
    ['a sinistra, motore verso la cabina', room(cw(base, 'left'), { motor: 'car' })], ['calate oblique a sinistra', cw(base, 'left', 300)],
    ['calate oblique a destra', cw(base, 'right', 700)], ['calate oblique sul fondo', cw(base, 'rear', 550)],
    ['tiro diretto su travi, calate oblique', room(direct(cw(base, 'rear', 550)), { support: { kind: 'beams', profile: 'IPE 240' } })],
    ['TORO, calate oblique, motore verso la cabina', room({ ...cw(base, 'right', 700), catalog: { brand: 'Sassi', model: 'TORO' } }, { motor: 'car' })],
  ];
  for (const [name, inp] of cases) {
    const dv = deriveLift(inp), L = dv.layout, G = roomGeo(L, dv.machine);
    assert.ok(G, name);
    const R = G.room, e = roomElectrics(layoutSite(L), dv.machine, G);
    for (const l of e.lights) {
      const [hx, hy] = lampHalf(l.alongX);
      assert.ok(l.at[0] - hx >= 0 && l.at[0] + hx <= R.W && l.at[1] - hy >= 0 && l.at[1] + hy <= R.D, `${name}: plafoniera a ${l.at.map(Math.round).join(', ')}`);
    }
    for (const [s, half] of [[e.lightSwitch, FIT_HALF], ...e.sockets.map((k) => [k, FIT_HALF] as const), [e.vent, VENT_HALF]] as const) {
      const inDoor = s.wall === R.doorWall && s.at + half > R.doorAt - DOOR_JAMB && s.at - half < R.doorAt + R.doorW + DOOR_JAMB;
      assert.ok(!inDoor, `${name}: ${s.wall} a ${Math.round(s.at)} nel vano della porta (${R.doorAt}…${R.doorAt + R.doorW})`);
    }
    // the 3D fittings under the roof inside the room too
    const sh = shellsOf(L, ropeRig(dv))[0], groups = {
      sides: { front: new THREE.Group(), rear: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group() },
      onWall: { front: new Batch(), rear: new Batch(), left: new Batch(), right: new Batch() }, roof: new THREE.Group(), overhead: new THREE.Group(), common: new THREE.Group(),
    };
    buildShell(sh, createLiftMaterials(), groups, e);
    const b = new THREE.Box3().setFromObject(groups.overhead);
    assert.ok(b.min.x * 1000 + R.shaftX >= -0.5 && b.max.x * 1000 + R.shaftX <= R.W + 0.5, `${name}: plafoniere in x ${Math.round(b.min.x * 1000 + R.shaftX)}…${Math.round(b.max.x * 1000 + R.shaftX)}`);
    assert.ok(-b.max.z * 1000 + R.shaftY >= -0.5 && -b.min.z * 1000 + R.shaftY <= R.D + 0.5, `${name}: plafoniere in y`);
  }
});
