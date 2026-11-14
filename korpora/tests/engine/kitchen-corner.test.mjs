// Г and П kitchens (engine/kitchen.js): the back wall (А) with a blind corner cabinet at every corner it shares, the
// side walls (Б on the left, В on the right) turned into place (transform.js). Checked in the room: nothing stands in
// anything; every wall has its back to its wall and its fronts to the room; every door opened to 90° and every drawer
// pulled out, handles and all, stays clear of the other walls; the worktop covers every base cabinet in two or three
// pieces bolted at the corners; and what the shop gets is whole — the blind front cut, banded and fixed, the CNC files
// not withheld, the straight kitchen exactly as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures } from './fixtures.mjs';
import { checkModel, assertNoHoleOnHole } from './check.mjs';
import { buildModel } from '../../engine/model.js';
import { TYPES, typeDims } from '../../engine/types.js';
import { cornerGap, CORNER_DOOR } from '../../engine/kitchen.js';
import { STOCK, frontStock } from '../../engine/materials.js';
import { FRONT_GAP_Z } from '../../engine/joinery.js';
import { nest } from '../../engine/nest.js';
import { cncBlockers } from '../../engine/cam.js';
import { worldParts, worldBox, turnPoint, turnDir, runOf } from '../../engine/transform.js';

registerFixtures();

const SHAPES = ['left', 'right', 'u'];
const SIDES = { left: ['B'], right: ['C'], u: ['B', 'C'] };
const variants = SHAPES.flatMap((shape) => [
  { type: 'kitchen', shape },
  ...[['modulesLeft', 1], ['modulesLeft', 6], ['modulesRight', 1], ['modulesRight', 6], ['modules', 2], ['modules', 6], ['moduleWidth', 400], ['moduleWidth', 900], ['depth', 500], ['depth', 600], ['handle', 'none'], ['handle', 'fx:knob'], ['wallHeight', 900], ['mount', 1350], ['hinge', 'fx:hettich']].map(([k, v]) => ({ type: 'kitchen', shape, [k]: v })),
]);
const label = (s) => Object.entries(s).slice(1).map(([k, v]) => `${k}=${v}`).join(' ');
// the hinges of the catalogue open to 107–110° (engine/data/hinge-systems.js)
const HINGE_OPEN = 110;

// The handle of a front as a box in its run: on the face, standing out of it by its projection.
function handleBox(h) {
  const proj = h.model?.height ?? 32;
  const len = h.model?.holes === 2 && h.model.spacing ? h.model.spacing + 24 : 30;
  const [ax, ay] = h.horizontal ? [len / 2, 8] : [8, len / 2];
  return { min: [h.x - ax, h.y - ay, h.z], max: [h.x + ax, h.y + ay, h.z + proj] };
}

// What stands in the room, by run: every part, every handle, every worktop piece.
function obstacles(m) {
  const out = [];
  for (const p of worldParts(m)) out.push({ run: p.run, box: p.box, what: p.name });
  for (const s of m.symbols) {
    const run = runOf(m, s.run);
    if (s.type === 'handle') out.push({ run: s.run, box: worldBox(handleBox(s), run), what: `дръжка ${s.module}` });
    if (s.type === 'worktop') out.push({ run: s.run, box: worldBox({ min: [s.x0, s.y, s.z0], max: [s.x1, s.y + s.t, s.z1] }, run), what: 'плот' });
  }
  return out;
}

// Two convex outlines in the plan (x, z) cross by more than eps (separating axes).
function crosses(a, b, eps = 0.5) {
  const axes = [];
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
    axes.push([q[1] - p[1], p[0] - q[0]]);
  }
  for (const [ax, az] of axes) {
    const len = Math.hypot(ax, az);
    if (!len) continue;
    const pa = a.map(([x, z]) => (x * ax + z * az) / len);
    const pb = b.map(([x, z]) => (x * ax + z * az) / len);
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= eps) return false;
  }
  return true;
}
const rect = (box) => [[box.min[0], box.min[2]], [box.max[0], box.min[2]], [box.max[0], box.max[2]], [box.min[0], box.max[2]]];
const yMeet = (a, b) => Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]) > 0.5;

// A door in its run, standing out by its handle's projection (on its whole face: on the safe side), turned φ about
// its hinge axis as the 3D turns it — the free edge towards the room — and placed in the room.
function doorOutline(door, g, run, phi, proj) {
  const { min, max } = door.box;
  const [c, s] = [Math.cos(phi), Math.sin(phi)];
  return [[min[0], min[2]], [max[0], min[2]], [max[0], max[2] + proj], [min[0], max[2] + proj]].map(([x, z]) => {
    const [dx, dz] = [x - g.axisX, z - g.axisZ];
    const [rx, rz] = g.hinge === 'left' ? [dx * c - dz * s, dx * s + dz * c] : [dx * c + dz * s, -dx * s + dz * c];
    const [wx, , wz] = turnPoint([g.axisX + rx, 0, g.axisZ + rz], run);
    return [wx, wz];
  });
}

test('Г and П kitchens: nothing stands in anything, no construction error, no hole on a hole', () => {
  for (const spec of variants) {
    const m = buildModel(spec);
    const errors = checkModel(m, label(spec));
    assert.deepEqual(errors.map((e) => e.text), [], label(spec));
    assertNoHoleOnHole(m, label(spec));
  }
});

test('every wall has its back to its own wall of the room and its fronts to the room', () => {
  for (const shape of SHAPES) {
    const m = buildModel({ type: 'kitchen', shape });
    assert.deepEqual(m.runs.map((r) => r.id), ['A', ...SIDES[shape]], shape);
    const W = typeDims('kitchen', m.spec).W;
    const facing = { A: '+z', B: '+x', C: '-x' };
    for (const r of m.runs) {
      assert.equal(turnDir('+z', r.turn), facing[r.id], `${shape} ${r.id}: the fronts look into the room`);
      // the back edges of the carcass sides stand on the wall
      const sides = worldParts(m).filter((p) => p.run === r.id && p.role === 'side');
      assert.ok(sides.length > 0, `${shape} ${r.id}: sides`);
      const against = { A: Math.min(...sides.map((b) => b.box.min[2])), B: Math.min(...sides.map((b) => b.box.min[0])), C: W - Math.max(...sides.map((b) => b.box.max[0])) };
      assert.equal(against[r.id], 0, `${shape} ${r.id}: the sides ${against[r.id]} mm from the wall`);
    }
    for (const p of worldParts(m)) {
      assert.ok(p.box.min[0] > -0.01 && p.box.max[0] < W + 0.01 && p.box.min[2] > -0.01, `${shape}: ${p.name} out of the room`);
    }
  }
});

test('each door opened as far as its hinges go and each drawer pulled out clears the other walls — fronts, handles, worktop', () => {
  for (const spec of variants) {
    const m = buildModel(spec);
    const others = obstacles(m);
    const byId = new Map(m.parts.map((p) => [p.id, p]));
    for (const g of m.groups) {
      const run = runOf(m, byId.get(g.id).run);
      const free = others.filter((o) => o.run !== byId.get(g.id).run);
      if (g.type === 'door') {
        const door = byId.get(g.id);
        const proj = m.symbols.find((s) => s.type === 'handle' && s.partId === door.id)?.model?.height ?? 0;
        for (let deg = 0; deg <= HINGE_OPEN; deg += 5) {
          const outline = doorOutline(door, g, run, (deg * Math.PI) / 180, proj);
          const hit = free.find((o) => yMeet(door.box, o.box) && crosses(outline, rect(o.box)));
          assert.ok(!hit, `${label(spec)}: ${door.name} at ${deg}° runs into ${hit?.what}`);
        }
      } else {
        for (const id of g.partIds) {
          const p = byId.get(id);
          const out = { min: [...p.box.min], max: [p.box.max[0], p.box.max[1], p.box.max[2] + g.travel + 40] };
          const w = worldBox(out, run);
          const hit = free.find((o) => yMeet(w, o.box) && crosses(rect(w), rect(o.box)));
          assert.ok(!hit, `${label(spec)}: ${p.name} pulled out runs into ${hit?.what}`);
        }
      }
    }
  }
});

test('the blind corner cabinet: blind front where the side wall stands, the door beside it hinged away from the corner', () => {
  for (const shape of SHAPES) {
    for (const handle of [undefined, 'none', 'fx:knob']) {
      const m = buildModel({ type: 'kitchen', shape, ...(handle ? { handle } : {}) });
      const s = m.spec;
      const gap = cornerGap(s);
      const fT = STOCK[frontStock(s).stock].thickness;
      const proj = handle === 'none' ? 0 : 32;
      assert.ok(gap >= 50 && gap % 10 === 0 && gap >= FRONT_GAP_Z + 2 * fT + proj, `${shape} ${handle}: corner gap ${gap}`);
      const parts = worldParts(m);
      const W = typeDims('kitchen', s).W;
      for (const side of SIDES[shape]) {
        const left = side === 'B';
        const baseBlinds = parts.filter((p) => p.run === 'A' && p.role === 'blind' && p.module.startsWith('М'));
        const at = (left ? Math.min : Math.max)(...baseBlinds.map((p) => p.box.min[0]));
        const corner = parts.filter((p) => p.module === baseBlinds.find((b) => b.box.min[0] === at).module);
        const sides = corner.filter((p) => p.role === 'side');
        const width = Math.max(...sides.map((p) => p.box.max[0])) - Math.min(...sides.map((p) => p.box.min[0]));
        assert.equal(width, s.depth + gap + CORNER_DOOR, `${shape} ${side}: corner cabinet width`);
        const blind = corner.find((p) => p.role === 'blind');
        const door = corner.find((p) => p.role === 'door');
        assert.ok(blind && door, `${shape} ${side}: blind front and door`);
        const fromCorner = (x) => (left ? x : W - x);
        assert.ok(Math.abs(fromCorner(left ? blind.box.max[0] : blind.box.min[0]) - (s.depth + gap - s.gap / 2)) < 0.01, `${shape} ${side}: the blind front reaches the door`);
        assert.equal(door.hingeSide, left ? 'right' : 'left', `${shape} ${side}: the corner door hinges away from the corner`);
        // the side wall starts the corner gap in front of the back wall's cabinets, at both heights
        const run = parts.filter((p) => p.run === side && !['door', 'drawer-front', 'blind'].includes(p.role));
        for (const level of [(p) => p.module.startsWith('М'), (p) => p.module.startsWith('Г')]) {
          const z0 = Math.min(...run.filter(level).map((p) => p.box.min[2]));
          assert.equal(z0, s.depth + gap, `${shape} ${side}: the side wall starts at depth + gap`);
        }
      }
    }
  }
});

test('next to the corner a side wall has drawers: no door of it swings onto the back wall', () => {
  for (const spec of variants) {
    const m = buildModel(spec);
    for (const r of m.runs.filter((x) => x.id !== 'A')) {
      const bases = m.parts.filter((p) => p.run === r.id && p.role === 'side' && p.module.startsWith('М'));
      const atCorner = r.id === 'B' ? Math.max(...bases.map((p) => p.box.max[0])) : Math.min(...bases.map((p) => p.box.min[0]));
      const mod = bases.find((p) => (r.id === 'B' ? p.box.max[0] : p.box.min[0]) === atCorner).module;
      assert.ok(m.parts.some((p) => p.module === mod && p.role === 'drawer-front'), `${label(spec)} ${r.id}: ${mod} has drawers`);
      assert.ok(!m.parts.some((p) => p.module === mod && p.role === 'door'), `${label(spec)} ${r.id}: ${mod} has no door`);
    }
  }
});

test('a worktop longer than the standard 4100 mm gets the note of one more joint', () => {
  const long = buildModel({ type: 'kitchen', shape: 'u', modules: 6, moduleWidth: 900 });
  assert.ok(long.warnings.some((w) => w.level === 'info' && /Плотът на стена А е \d+ mm — по-дълъг от 4100 mm/.test(w.text)));
  assert.ok(!buildModel({ type: 'kitchen', shape: 'left' }).warnings.some((w) => /4100/.test(w.text)));
});

test('the blind front is a front: front board, banded all round, fixed with brackets, no hinge, no shelf in the corner', () => {
  for (const shape of SHAPES) {
    const m = buildModel({ type: 'kitchen', shape });
    const blinds = m.parts.filter((p) => p.role === 'blind');
    assert.equal(blinds.length, 2 * SIDES[shape].length, `${shape}: one blind front under and one over the worktop per corner`);
    const door = m.parts.find((p) => p.role === 'door');
    for (const b of blinds) {
      assert.equal(b.stock, door.stock);
      assert.equal(b.decor, door.decor);
      assert.equal(b.frame.n, '-z', `${b.name}: drilled from the back`);
      for (const dir of ['+x', '-x', '+y', '-y']) assert.equal(b.bands[dir], m.spec.bandFront, `${b.name}: edge ${dir}`);
      assert.ok(!b.features.some((f) => f.kind === 'cup'), `${b.name}: no hinge`);
      assert.ok(b.features.filter((f) => f.kind === 'blind-fix').length >= 3, `${b.name}: bracket screws marked`);
      assert.ok(!m.groups.some((g) => g.partIds.includes(b.id)), `${b.name}: does not move`);
      const mod = b.module;
      assert.ok(!m.parts.some((p) => p.module === mod && p.role === 'shelf'), `${mod}: a shelf over 1 m would sag`);
    }
    const brackets = m.hardware.find((h) => h.key === 'blindBrackets');
    assert.equal(brackets?.qty, 3 * blinds.length, `${shape}: brackets`);
  }
});

test('the worktop: one piece per wall, bolted at every corner, over every base cabinet and past its fronts', () => {
  for (const spec of variants) {
    const m = buildModel(spec);
    const tops = m.symbols.filter((s) => s.type === 'worktop');
    assert.equal(tops.length, m.runs.length, label(spec));
    const world = tops.map((s) => ({ s, box: worldBox({ min: [s.x0, s.y, s.z0], max: [s.x1, s.y + s.t, s.z1] }, runOf(m, s.run)) }));
    for (let i = 0; i < world.length; i++) for (let j = i + 1; j < world.length; j++) assert.ok(!crosses(rect(world[i].box), rect(world[j].box)), `${label(spec)}: worktop pieces overlap`);
    for (const p of m.parts.filter((q) => q.role === 'side' && q.module.startsWith('М'))) {
      const top = tops.find((s) => s.run === p.run);
      assert.ok(top.x0 <= p.box.min[0] + 0.01 && top.x1 >= p.box.max[0] - 0.01 && top.z0 <= 0, `${label(spec)}: ${p.name} under the worktop`);
    }
    for (const f of m.parts.filter((q) => ['door', 'drawer-front', 'blind'].includes(q.role) && q.module.startsWith('М'))) {
      const top = tops.find((s) => s.run === f.run);
      assert.ok(top.z1 - f.box.max[2] >= 20, `${label(spec)}: the worktop ${top.z1 - f.box.max[2]} mm past ${f.name}`);
    }
    assert.equal(m.hardware.find((h) => h.key === 'worktopBolts')?.qty, 2 * (m.runs.length - 1), label(spec));
    assert.equal(m.hardware.filter((h) => h.key.startsWith('worktop') && h.key !== 'worktopBolts' && h.key !== 'worktopScrews').length, m.runs.length, `${label(spec)}: one worktop to order per wall`);
  }
});

test('the size of a Г or П kitchen: the back wall, the height to the wall cabinets, the longest side wall', () => {
  for (const shape of SHAPES) {
    const m = buildModel({ type: 'kitchen', shape });
    const parts = worldParts(m);
    const d = typeDims('kitchen', m.spec);
    assert.equal(d.W, Math.max(...parts.map((p) => p.box.max[0])));
    assert.equal(d.H, m.spec.mount + m.spec.wallHeight);
    const tops = m.symbols.filter((s) => s.type === 'worktop').map((s) => worldBox({ min: [s.x0, s.y, s.z0], max: [s.x1, s.y + s.t, s.z1] }, runOf(m, s.run)));
    assert.equal(d.D, Math.max(...parts.map((p) => p.box.max[2]), ...tops.map((b) => b.max[2])), `${shape}: the side wall reaches ${d.D}`);
  }
});

test('the Г and П kitchens at their defaults: no warning, the CNC files not withheld', () => {
  for (const shape of SHAPES) {
    const m = buildModel({ type: 'kitchen', shape });
    const bad = m.warnings.filter((w) => w.level !== 'info');
    assert.deepEqual(bad.map((w) => `[${w.level}] ${w.text}`), [], shape);
    assert.deepEqual(cncBlockers(m, nest(m)), [], `${shape}: CNC blockers`);
  }
});

test('the straight kitchen is as it was: no runs, no blind front, one worktop', () => {
  const m = buildModel({ type: 'kitchen' });
  assert.equal(m.spec.shape, 'line');
  assert.equal(m.runs, undefined);
  assert.ok(!m.parts.some((p) => p.role === 'blind' || p.run !== undefined));
  assert.equal(m.symbols.filter((s) => s.type === 'worktop').length, 1);
  assert.ok(!m.hardware.some((h) => h.key === 'worktopBolts'));
  assert.deepEqual(typeDims('kitchen', m.spec), { W: 2300, H: 2170, D: 600 });
  assert.ok(TYPES.kitchen.params.some((p) => p.key === 'shape'));
});
