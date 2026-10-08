// The machine room's parts sit as on site: the floor trunking (and its floor box) never runs through the steel lying on
// the floor — the HEB beams over the shaft's walls, a support's beams from wall to wall —; every pulley's hub turns
// between the cheeks that hold its axle (in the bedplate, on its own stand, the car's and the counterweight's of a 2:1
// roping), only the axle passes through them; each room's door — its frame, its closed leaf flush with the wall's outer
// face, the handle inside — and what is fixed on the walls lie in their wall's group, hidden with its x-ray.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { deriveLift, newLift, planeAt, ropeRig, type LiftInputs, type RopePlane } from '@/lib/lift';
import { belowMachine } from '@/lib/lift/bottom';
import { hebDrawn, roomGeo, section } from '@/shaft';
import { groovePitch, ropeWidths } from '@/shaft/ropes';
import { createLiftMaterials } from '../materials';
import { slabOpenings } from '../slab';
import { governorSpot } from '../governor';
import { buildRoom } from '../room';
import { shellsOf } from '../roomshell';
import { CHEEK, HUB } from '../pulleys';
import { hitchSpots } from '../ropes';
import { buildCar } from '../car';
import { buildCounterweight } from '../counterweight';
import type { Hitch } from '../sling';

// the floors' labels are drawn on a canvas: under node, a blank one
if (!('document' in globalThis)) Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) } });

type Room = NonNullable<LiftInputs['shaft']['room']>;
const room = (I: LiftInputs, r: Partial<Room>): LiftInputs => ({ ...I, shaft: { ...I.shaft, room: { ...(I.shaft.room as Room), ...r } } });
const direct = (I: LiftInputs): LiftInputs => ({ ...I, calc: { ...I.calc, layout: 'top' } });
const cwLeft = (I: LiftInputs): LiftInputs => ({ ...I, shaft: { ...I.shaft, cw: 'left' } });
const BEAMS = { kind: 'beams', profile: 'IPE 240' } as const;

/** The installation's room in 3D as world.ts builds it, its car and counterweight with the car at the lowest floor. */
function scene(inp: LiftInputs) {
  const dv = deriveLift(inp), L = dv.layout, S = section(L), I = L.inputs, N = dv.analysis.ctx.N, M = createLiftMaterials(), rig = ropeRig(dv), gov = governorSpot(L), sim = dv.sim;
  const travel = [sim.levels[0], sim.levels.at(-1) ?? 0].map((s) => [s, sim.cw0 - s] as const), slab = (I.room?.slab ?? 250) / 1000;
  const G = rig.bottom ? null : roomGeo(L, dv.machine), heb = G ? hebDrawn(G, dv.machine, { W: I.W, D: I.D, wall: I.wall }) : null;
  const r = buildRoom(L, rig, N.n, N.d, N.D, S.ceiling, M, slabOpenings(rig, N.n, N.d, S.ceiling / 1000, S.ceiling / 1000 + slab, travel, gov), gov,
    dv.machine.shape ?? null, dv.machine.rinvio ?? null, heb, G?.dir ?? 1);
  const two = dv.analysis.ctx.I.r === 2, pcs = rig.pieces(0, 0), width = N.n * groovePitch(N.d) + 30;
  const hitch = (pl: RopePlane, u: number): Hitch => {
    const [x, y] = planeAt(pl, u);
    return two ? { kind: 'pulley', x, y, across: [-pl.dir[1], pl.dir[0]], r: dv.analysis.ctx.I.Dp / 2, width } : { kind: 'ropes', at: hitchSpots(pl, N.n, u) };
  };
  const s = sim.levels[0], w = sim.cw0 - s, car = buildCar(L, M, hitch(pcs[0].plane, 0), gov, sim.labels), cw = buildCounterweight(L, M, hitch(pcs[pcs.length - 1].plane, rig.bottom ? 0 : rig.calata));
  car.group.position.y = s;
  cw.position.y = w;
  const now = rig.pieces(s, w), p0 = now[0], p1 = now[now.length - 1], cp = p0.els[1], wp = p1.els[p1.els.length - 2];
  const at = (pl: RopePlane, u: number, y: number): THREE.Vector3 => {
    const [x, yy] = planeAt(pl, u);
    return new THREE.Vector3(x / 1000, y, -yy / 1000);
  };
  r.set(0, N.i, two && cp?.kind === 'wheel' ? at(p0.plane, cp.u, cp.y) : null, two && wp?.kind === 'wheel' ? at(p1.plane, wp.u, wp.y) : null);
  const all = new THREE.Group();
  all.add(r.common, r.roof, r.overhead, car.group, cw, ...Object.values(r.sides));
  all.updateMatrixWorld(true);
  const body = rig.bottom && rig.scheme ? belowMachine(L, rig.scheme, N.D, dv.machine.shape ?? null).body : null;
  return { dv, M, r, rig, car, cw, n: N.n, d: N.d, z0: rig.roomFloor * 1000, shells: shellsOf(L, rig, body) };
}

type V3 = readonly [number, number, number];
/** World vertices [mm] of a mesh: plan x, y and height. */
const verts = (o: THREE.Mesh): V3[] => {
  const p = o.geometry.getAttribute('position'), v = new THREE.Vector3(), out: V3[] = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
    out.push([v.x * 1000, -v.z * 1000, v.y * 1000]);
  }
  return out;
};
/** The boxes a merged mesh of boxes is made of (24 vertices each): their plan corners and heights; none for other meshes. */
function boxes(o: THREE.Mesh): { corners: (readonly [number, number])[]; z0: number; z1: number }[] {
  const vs = verts(o);
  if (vs.length % 24) return [];
  const out = [];
  for (let i = 0; i < vs.length; i += 24) {
    const c = vs.slice(i, i + 24), keys = new Map(c.map((q) => [`${q[0].toFixed(2)},${q[1].toFixed(2)}`, [q[0], q[1]] as const]));
    const pts = [...keys.values()], mx = pts.reduce((a, q) => a + q[0], 0) / pts.length, my = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    out.push({ corners: pts.sort((a, b) => Math.atan2(a[1] - my, a[0] - mx) - Math.atan2(b[1] - my, b[0] - mx)), z0: Math.min(...c.map((q) => q[2])), z1: Math.max(...c.map((q) => q[2])) });
  }
  return out;
}
/** How deep two convex plan outlines overlap (separating axes), 0 when apart. */
function overlap(a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]): number {
  let least = Infinity;
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % poly.length]], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, n = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
    const span = (s: readonly (readonly [number, number])[]) => s.map((t) => t[0] * n[0] + t[1] * n[1]);
    const [sa, sb] = [span(a), span(b)], o = Math.min(Math.max(...sa), Math.max(...sb)) - Math.max(Math.min(...sa), Math.min(...sb));
    if (o <= 0) return 0;
    least = Math.min(least, o);
  }
  return least;
}

const TRUNKING: readonly (readonly [string, () => LiftInputs])[] = [
  ['HEB lungo x, telaio', () => room(direct(newLift()), { support: { kind: 'frame' }, heb: { dir: 'x' } })],
  ['HEB, telaio con il rinvio', () => room(newLift(), { heb: {} })],
  ['HEB, contrappeso a sinistra', () => room(cwLeft(newLift()), { heb: {} })],
  ['putrelle da muro a muro', () => room(direct(newLift()), { support: BEAMS })],
  ['putrelle da muro a muro, contrappeso a sinistra', () => room(direct(cwLeft(newLift())), { support: BEAMS })],
];

for (const [name, make] of TRUNKING) {
  test(`canalina e cassetta a pavimento fuori dalle travi sul pavimento (${name})`, () => {
    const { M, r, z0 } = scene(make()), duct: ReturnType<typeof boxes> = [], steel: ReturnType<typeof boxes> = [];
    r.common.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      // the trunking's channels and lids, or the floor box: galvanized, on the floor, 60 mm high at most
      if (o.material === M.galv) for (const b of boxes(o)) if (b.z0 > z0 - 1 && b.z1 < z0 + 61 && b.z1 - b.z0 > 3 && (b.z0 < z0 + 1 || b.z0 > z0 + 55)) duct.push(b);
      if (o.material === M.steel) for (const b of boxes(o)) if (b.z0 < z0 + 300) steel.push(b);
    });
    assert.ok(duct.length > 0, 'una canalina o una cassetta');
    assert.ok(steel.length > 0, 'travi sul pavimento');
    for (const a of duct) for (const b of steel) {
      const plan = overlap(a.corners, b.corners), high = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      assert.ok(plan < 0.5 || high < 0.5, `canalina ${JSON.stringify(a.corners.map((p) => p.map(Math.round)))} dentro una trave ${JSON.stringify(b.corners.map((p) => p.map(Math.round)))} (${plan.toFixed(0)} mm, ${high.toFixed(0)} mm)`);
    }
  });
}

const PULLEYS: readonly (readonly [string, () => LiftInputs, number])[] = [
  ['nel telaio dell’argano', () => newLift(), 1],
  ['sul suo supporto', () => room(newLift(), { support: { kind: 'frame' } }), 1],
  ['2:1, di cabina e di contrappeso', () => ({ ...newLift(), calc: { ...newLift().calc, r: '2' } }), 3],
];

for (const [name, make, count] of PULLEYS) {
  test(`il mozzo della puleggia di rinvio gira tra le sue piastre (${name})`, () => {
    const { M, r, car, cw, n, d } = scene(make());
    // the coupling: the cheeks' inner faces CHEEK past the wheel's faces, the hub short of them
    assert.equal(ropeWidths(n, d).pulley - 10, (n * groovePitch(d) + 30) / 2 + CHEEK);
    assert.ok(HUB < CHEEK);
    const galv: THREE.Triangle[] = [];
    for (const root of [r.common, car.group, cw]) root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.material !== M.galv) return;
      const p = o.geometry.getAttribute('position'), index = o.geometry.getIndex(), k = index ? index.count : p.count;
      for (let i = 0; i + 2 < k; i += 3) {
        const [a, b, c] = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j).applyMatrix4(o.matrixWorld));
        galv.push(new THREE.Triangle(a, b, c));
      }
    });
    let found = 0;
    r.common.traverse((g) => {
      if (!(g instanceof THREE.Group) || g.children.length !== 4 || !g.children.every((c) => c instanceof THREE.Mesh && c.material === M.pulley)) return;
      found++;
      // in the hub's own frame (its box tight along the axle): no cheek, plate or nut in it
      const hub = g.children[3] as THREE.Mesh, inv = hub.matrixWorld.clone().invert();
      hub.geometry.computeBoundingBox();
      const box = (hub.geometry.boundingBox ?? new THREE.Box3()).clone().expandByScalar(-0.0005);
      const hits = galv.filter((t) => box.intersectsTriangle(new THREE.Triangle(t.a.clone().applyMatrix4(inv), t.b.clone().applyMatrix4(inv), t.c.clone().applyMatrix4(inv))));
      assert.equal(hits.length, 0, `${hits.length} triangoli di piastre nel mozzo a ${g.getWorldPosition(new THREE.Vector3()).toArray().map((v) => Math.round(v * 1000))}`);
    });
    assert.equal(found, count, 'pulegge');
  });
}

const DOORS: readonly (readonly [string, () => LiftInputs])[] = [
  ['locale sopra il vano', () => newLift()],
  ['locale in basso e locale pulegge', () => ({ ...newLift(), calc: { ...newLift().calc, layout: 'bottom' }, shaft: { ...newLift().shaft, room: null }, bottom: 'room' })],
];

for (const [name, make] of DOORS) {
  test(`porta del locale: telaio, anta chiusa a filo esterno e maniglia, nel gruppo della sua parete (${name})`, () => {
    const { M, r, shells } = scene(make());
    assert.ok(shells.length > 0);
    for (const sh of shells) {
      const R = sh.room, side = R.doorWall, g = r.mounted[side];
      assert.equal(g.parent, r.sides[side], 'nel gruppo della parete');
      // u along the door's wall, v in from its inner face (the outer face at −250), z over the room's floor
      const uvz = ([x, y, z]: V3): V3 => {
        const X = x + R.shaftX, Y = y + R.shaftY;
        return side === 'front' ? [X, Y, z - sh.z0] : side === 'rear' ? [X, R.D - Y, z - sh.z0] : side === 'left' ? [Y, X, z - sh.z0] : [Y, R.W - X, z - sh.z0];
      };
      const leaf = (root: THREE.Object3D): boolean => {
        let hit = false;
        root.traverse((o) => {
          if (!(o instanceof THREE.Mesh) || o.material !== M.galv) return;
          for (const b of boxes(o)) {
            const ps = b.corners.map(([x, y]) => uvz([x, y, b.z0])), us = ps.map((p) => p[0]), vs = ps.map((p) => p[1]);
            if (Math.min(...us) < R.doorAt + 20 && Math.max(...us) > R.doorAt + R.doorW - 20 && b.z0 - sh.z0 < 20 && b.z1 - sh.z0 > R.doorH - 20
              && Math.abs(Math.min(...vs) + 250) < 0.5 && Math.max(...vs) < -200) hit = true;
          }
        });
        return hit;
      };
      assert.ok(leaf(g), `anta nella porta su ${side}`);
      assert.ok(!leaf(r.common), 'l’anta non è nelle parti comuni');
      // the handle inside, on the side away from the hinges (at doorAt), about 1050 mm high
      let handle = false;
      g.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material === M.chrome) for (const q of verts(o).map(uvz)) {
          if (q[0] > R.doorAt + R.doorW / 2 && q[0] < R.doorAt + R.doorW && q[1] > -210 && q[1] < -100 && Math.abs(q[2] - 1050) < 120) handle = true;
        }
      });
      assert.ok(handle, 'maniglia all’interno, dal lato opposto alle cerniere');
    }
    // nothing fixed on a wall is left in the common parts: the cabinet, the switch and their conduit go with their wall
    r.common.traverse((o) => {
      if (o instanceof THREE.Mesh) assert.ok(![M.panel, M.glass, M.led, M.red, M.chrome].includes(o.material as THREE.MeshPhysicalNodeMaterial), 'quadro o interruttore nelle parti comuni');
    });
  });
}
