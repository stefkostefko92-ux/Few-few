// The ropes of the 3D follow real tangents: every straight run touches the wheels at their radius, on the side the
// rope wraps; with the machine above the rope hangs plumb over the car and the counterweight drops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_ALL, belt, defaultLift, deriveLift, ropeRig, tangent, type BeltEl } from '@/lib/lift';

const distToLine = (c: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.abs(dx * (c[1] - a[1]) - dy * (c[0] - a[0])) / Math.hypot(dx, dy);
};

test('tangenti: punto-ruota, ruota-ruota esterna e incrociata', () => {
  const wheel = (u: number, y: number, r: number, cw: boolean): BeltEl => ({ kind: 'wheel', u, y, r, cw });
  // up from (0, 0) to a wheel wrapped clockwise over the top: touches its left side
  const [p, q] = tangent({ kind: 'pt', u: 0, y: 0 }, wheel(1, 5, 1, true));
  assert.ok(Math.hypot(p[0], p[1]) < 1e-12 && Math.hypot(q[0] - 0, q[1] - 5) < 1e-12);
  for (const [a, b] of [[wheel(0, 0, 0.3, true), wheel(1.2, -0.7, 0.2, true)], [wheel(0, 0, 0.3, true), wheel(1.2, -0.7, 0.2, false)]] as const) {
    const [s, e] = tangent(a, b);
    if (a.kind !== 'wheel' || b.kind !== 'wheel') continue;
    assert.ok(Math.abs(distToLine([a.u, a.y], s, e) - a.r) < 1e-9, 'tangente alla prima');
    assert.ok(Math.abs(distToLine([b.u, b.y], s, e) - b.r) < 1e-9, 'tangente alla seconda');
  }
  const arcs = belt([{ kind: 'pt', u: 0, y: 0 }, wheel(0.3, 2, 0.3, true), { kind: 'pt', u: 0.6, y: 0 }]).arcs;
  assert.ok(Math.abs(Math.abs(arcs[0].sweep) - Math.PI) < 1e-9, 'mezzo giro sulla puleggia');
});

test('funi del progetto: a piombo sopra la cabina e sopra il contrappeso', () => {
  const inp = defaultLift();
  for (const layout of ['top', 'topDefl'] as const) {
    const d = deriveLift({ ...inp, calc: { ...inp.calc, layout }, auto: AUTO_ALL }), rig = ropeRig(d);
    const b = belt(rig.elements(0, 5));
    const first = b.runs[0], last = b.runs[b.runs.length - 1];
    assert.ok(Math.abs(first[0][0] - first[1][0]) < 1e-9, `${layout}: fune di cabina verticale`);
    if (layout === 'topDefl') assert.ok(Math.abs(last[0][0] - last[1][0]) < 1e-6 && Math.abs(last[1][0] - rig.calata) < 1e-9, 'fune del contrappeso verticale');
    assert.ok(rig.sheave.y > rig.roomFloor, 'la puleggia sta sopra il pavimento del locale');
  }
});

test('macchina in basso: i due tratti verso la macchina scendono tra il contrappeso e la parete, senza toccare nessuno dei due', () => {
  const inp = defaultLift();
  for (const cw of ['rear', 'left'] as const) {
    const d = deriveLift({ shaft: { ...inp.shaft, cw }, calc: { ...inp.calc, layout: 'bottom', r: '1' }, auto: AUTO_ALL }), rig = ropeRig(d);
    const back = rig.calata + d.layout.inputs.cwDepth / 2000, runs = rig.elements(0, 0).filter((e) => e.kind === 'pt' && e.u > rig.calata + 1e-6);
    assert.equal(runs.length, 4, cw);
    for (const e of runs) assert.ok(e.u > back + 0.015 && e.u < rig.wallAt - 0.015, `${cw}: ${e.u.toFixed(3)} fuori da (${back.toFixed(3)}, ${rig.wallAt.toFixed(3)})`);
  }
});
