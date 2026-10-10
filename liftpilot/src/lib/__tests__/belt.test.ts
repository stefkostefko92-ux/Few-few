// The ropes of the 3D follow real tangents: every straight run touches the wheels at their radius, on the side the
// rope wraps; with the machine above the rope hangs plumb over the car and the counterweight drops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_ALL, BOTTOM_SCHEMES, belt, defaultLift, deriveLift, extraBends, planeAt, ropeRig, tangent, type BeltEl } from '@/lib/lift';

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
    const b = belt(rig.pieces(0, 5)[0].els);
    const first = b.runs[0], last = b.runs[b.runs.length - 1];
    assert.ok(Math.abs(first[0][0] - first[1][0]) < 1e-9, `${layout}: fune di cabina verticale`);
    if (layout === 'topDefl') assert.ok(Math.abs(last[0][0] - last[1][0]) < 1e-6 && Math.abs(last[1][0] - rig.calata) < 1e-9, 'fune del contrappeso verticale');
    assert.ok(rig.sheave.y > rig.roomFloor, 'la puleggia sta sopra il pavimento del locale');
  }
});

test('macchina in basso, tre schemi: i pezzi della fune si toccano su tratti verticali tra il contrappeso e la parete; il calcolo conta i rinvii del 3D', () => {
  const inp = defaultLift();
  for (const bottom of BOTTOM_SCHEMES) for (const cw of ['rear', 'left'] as const) for (const r of ['1', '2'] as const) {
    const d = deriveLift({ shaft: { ...inp.shaft, cw }, calc: { ...inp.calc, layout: 'bottom', r }, auto: AUTO_ALL, bottom }), rig = ropeRig(d), g = rig.scheme;
    const tag = `${bottom} ${cw} ${r}:1`;
    assert.ok(g && g.scheme === bottom && d.bottom === bottom, tag);
    // the pieces meet: the last point of one is the first of the next, in plan and in height
    const pcs = rig.pieces(0, 5);
    for (let k = 0; k + 1 < pcs.length; k++) {
      const a = pcs[k].els[pcs[k].els.length - 1], b = pcs[k + 1].els[0], pa = planeAt(pcs[k].plane, a.u), pb = planeAt(pcs[k + 1].plane, b.u);
      assert.ok(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 1e-6 && Math.abs(a.y - b.y) < 1e-9, `${tag}: pezzi ${k}/${k + 1}`);
    }
    // the runs on either side of a meeting point are vertical, when the head has two pulleys on that side
    const runs = pcs.map((pc) => belt(pc.els).runs);
    const up = (run: readonly (readonly [number, number])[]): boolean => Math.abs(run[0][0] - run[1][0]) < 1e-6;
    if (g.carPulleys === 2) assert.ok(up(runs[0][runs[0].length - 1]), `${tag}: ramo di cabina verticale`);
    if (g.cwPulleys === 2) assert.ok(up(runs[2][0]), `${tag}: ramo del contrappeso verticale`);
    assert.ok(up(runs[1][0]) && up(runs[1][runs[1].length - 1]), `${tag}: rami della puleggia verticali`);
    // the runs to the machine stand between the counterweight's back and the wall
    const back = rig.calata + (Math.abs(rig.dir[0]) * d.layout.cw.w + Math.abs(rig.dir[1]) * d.layout.cw.h) / 2000;
    for (const m of [g.mc, g.mw]) {
      const u = ((m[0] - rig.origin[0]) * rig.dir[0] + (m[1] - rig.origin[1]) * rig.dir[1]) / 1000;
      assert.ok(!g.fits || (u > back + 0.05 && u < rig.wallAt - 0.05), `${tag}: ramo a ${u.toFixed(3)} fuori da (${back.toFixed(3)}, ${rig.wallAt.toFixed(3)})`);
    }
    // the calculation's simple bends: the two it counts for the bottom layout and the scheme's others
    const heads = rig.wheels.filter((w) => w.role === 'top').length;
    assert.equal(heads, 2 + extraBends(g), tag);
    assert.equal(Number(d.values.nps), Number(inp.calc.nps ?? 0) + extraBends(g), tag);
    assert.ok(Math.abs(Number(d.values.Hv) - (g.zHead - g.zSheave) / 1000) < 1e-3, `${tag}: Hv`);
  }
});
