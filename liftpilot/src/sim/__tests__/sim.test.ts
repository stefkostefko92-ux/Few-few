// The simulation replays the verification in time: at the end positions and at the accelerations of the checks its
// forces must be the engine's, bit for bit or to rounding; the motion must reach the floor; the buffers must obey the
// energy balance; a machine that slips in the verification must slip in the replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K, PRESETS, compute, readInputs } from '../../calc/index';
import { DEFAULT_VERTICAL, defaultInputs, layout, section, type Floor } from '../../shaft/index';
import { G } from '../../calc/math';
import { frameAt, duration, motionProfile, physics, runScenario, simModel, type SimModel } from '../index';

const near = (a: number, b: number, eps = 1e-9, what = '') =>
  assert.ok(a === b || Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${what} ${a} ≠ ${b}`);

/** A calculation example with a shaft whose floors give the same travel. */
function modelOf(preset: 'A' | 'B' | 'C', patch: Record<string, string | number | boolean> = {}): SimModel {
  const ctx = readInputs({ ...PRESETS[preset], ...patch });
  const res = compute(ctx.I, ctx.N);
  const n = Math.round(ctx.I.H / 3) + 1;
  const floors: Floor[] = Array.from({ length: n }, (_, i) => ({ label: String(i), rise: i < n - 1 ? 3000 : 0, door: 'A' }));
  const I0 = defaultInputs(1600, 1750);
  const L = layout({ ...I0, vertical: { ...DEFAULT_VERTICAL, v: ctx.I.v, floors } });
  return simModel(ctx.I, ctx.N, res, section(L), L.inputs.vertical);
}

test('profilo a strappo limitato: arriva al piano, rispetta velocità, accelerazione e strappo', () => {
  for (const d of [0.4, 3, 18]) {
    const p = motionProfile(d, 1, 0.8, 1);
    near(p.at(p.T).x, d, 1e-9, 'distanza');
    let vMax = 0, aMax = 0, prev = p.at(0);
    for (let t = 0.01; t <= p.T; t += 0.01) {
      const q = p.at(t);
      vMax = Math.max(vMax, q.v);
      aMax = Math.max(aMax, Math.abs(q.a));
      assert.ok(Math.abs(q.a - prev.a) <= 1 * 0.01 + 1e-9, `strappo a ${t}`);
      assert.ok(q.x >= prev.x - 1e-12, 'la cabina non torna indietro');
      prev = q;
    }
    assert.ok(vMax <= 1 + 1e-9 && aMax <= 0.8 + 1e-9);
  }
  // 18 m reach the rated speed, 0,4 m do not
  assert.ok(Math.abs(motionProfile(18, 1, 0.8, 1).vPeak - 1) < 1e-12);
  assert.ok(motionProfile(0.4, 1, 0.8, 1).vPeak < 1);
});

test('forze della simulazione = forze della verifica agli estremi della corsa', () => {
  for (const pr of ['A', 'B', 'C'] as const) {
    const m = modelOf(pr), P = physics(m.I, m.M), r = m.res;
    const at = (pos: 'b' | 't'): number => (pos === 'b' ? 0 : m.I.H);
    for (const c of r.loadCases) {
      near(P.pull(at(c.pos), 0, K.loadTestFactor * m.I.Q).ratio, c.ratio, 1e-12, `${pr} caricamento ${c.pos}`);
      near(P.efa('loading', at(c.pos)), c.efa, 1e-12);
    }
    for (const c of r.brk) {
      const load = c.load === 'q' ? m.I.Q : 0, dir = c.dir === 'dn' ? 1 : -1;
      near(P.pull(at(c.pos), dir * c.aEff, load).ratio, c.ratio, 1e-12, `${pr} frenatura ${c.load} ${c.dir} ${c.pos}`);
      near(P.efa('braking', at(c.pos)), c.efa, 1e-12);
    }
    for (const c of r.brkReal) {
      const load = c.load === 'q' ? m.I.Q : 0, dir = c.dir === 'dn' ? 1 : -1;
      near(P.brakeDecel(at(c.pos), dir, load), c.a, 1e-12, `${pr} decelerazione del freno`);
    }
    near(P.pull(m.I.H, 0, 0, 0).ratio, r.stall.ratio, 1e-12, `${pr} cabina bloccata`);
    near(P.efa('stalled', m.I.H), r.stall.efa, 1e-12);
    // acceleration torque of the drive: loaded car up from the bottom, empty car down from the top
    const up = P.motorTorque(0, 0, m.I.aDesign, m.I.Q, 1), dn = -P.motorTorque(m.I.H, 0, -m.I.aDesign, 0, -1);
    near(Math.max(up, dn), r.drive.Macc, 1e-9, `${pr} coppia di accelerazione`);
  }
});

test('marcia tra due piani: arrivo, porte, funi e coppia', () => {
  const m = modelOf('A'), run = runScenario(m, { id: 'ride', p: { from: 0, to: 3, load: m.I.Q } });
  const end = frameAt(run.series, duration(run.series));
  near(end.s, m.levels[3], 1e-9, 'piano di arrivo');
  assert.equal(end.v, 0);
  assert.equal(end.door, 1);
  near(end.rope, m.I.r * m.levels[3], 1e-9, 'corsa delle funi');
  assert.ok(run.events.some((e) => e.id === 'start') && run.events.some((e) => e.id === 'stop'));
  assert.ok(run.summary.torque > 0 && run.summary.accel <= m.I.aDesign + 1e-9);
});

test('frenatura di emergenza: si ferma all\'estremo del caso, con l\'utilizzo della verifica', () => {
  const m = modelOf('C');
  const run = runScenario(m, { id: 'brake', p: { load: 'q', dir: 'dn', decel: 'norm' } });
  const cs = m.res.brk.filter((c) => c.load === 'q' && c.dir === 'dn').reduce((a, b) => (b.util > a.util ? b : a));
  near(run.summary.util, cs.util, 1e-12, 'utilizzo');
  if (!run.summary.slip) near(frameAt(run.series, duration(run.series)).s, cs.pos === 'b' ? 0 : m.I.H, 1e-6, 'fermata');
});

test('funi che slittano alla decelerazione reale del freno (esempio A, capitolo 7)', () => {
  const m = modelOf('A');
  const real = m.res.brkReal.filter((c) => c.load === 'e' && c.dir === 'up').reduce((a, b) => (b.util > a.util ? b : a));
  assert.ok(real.util > 1, 'l\'esempio A slitta con il freno reale');
  const run = runScenario(m, { id: 'brake', p: { load: 'e', dir: 'up', decel: 'real' } });
  assert.ok(run.summary.slip);
  assert.ok((run.summary.slipDistance ?? 0) > (run.summary.stopDistance ?? Infinity));
  near(frameAt(run.series, duration(run.series)).s, real.pos === 'b' ? 0 : m.H, 1e-6, 'fermata al piano anche slittando');
  assert.equal(run.verdict, 'warn'); // an advice in the verification (tr_real), not a requirement
  assert.ok(run.events.some((e) => e.id === 'slip'));
});

test('frenatura in ogni caso della verifica: parte e si ferma dentro la corsa, con l\'utilizzo del caso', () => {
  for (const pr of ['A', 'B', 'C'] as const) {
    for (const m of [modelOf(pr), modelOf(pr, { H: 3 })]) {
      for (const decel of ['norm', 'real'] as const) {
        for (const c of decel === 'real' ? m.res.brkReal : m.res.brk) {
          const run = runScenario(m, { id: 'brake', p: { load: c.load, dir: c.dir, decel, pos: c.pos } }), tag = `${pr} H ${m.H} ${decel} ${c.load}/${c.dir}/${c.pos}`;
          near(run.summary.util, c.util, 1e-9, `${tag} utilizzo`);
          const on = run.events.find((e) => e.id === 'brakeOn')?.t ?? Infinity, d = run.series.data;
          for (let i = 0; i < run.series.n && i * run.series.dt < on - 1e-9; i++) {
            assert.ok(d.s[i] >= -1e-9 && d.s[i] <= m.H + 1e-9, `${tag}: fuori corsa prima del freno (${d.s[i]})`);
            assert.ok(d.bufCar[i] === 0 && d.bufCw[i] === 0, `${tag}: sugli ammortizzatori prima del freno`);
          }
          const end = frameAt(run.series, duration(run.series)).s;
          if (Number.isFinite(run.summary.slipDistance ?? 0)) assert.ok(end >= -1e-6 && end <= m.H + 1e-6, `${tag}: fermata fuori corsa (${end})`);
        }
      }
    }
  }
});

test('frenata con il freno reale: l\'accelerazione e l\'esito della verifica; un freno che non trattiene la cabina non passa', () => {
  const m = modelOf('C'), hard = m.res.brake.aMaxCase;
  const run = runScenario(m, { id: 'brake', p: { load: hard.load, dir: hard.dir, decel: 'real', pos: hard.pos } });
  near(run.summary.accel, hard.aEff, 1e-9, 'decelerazione massima del freno');
  near(run.summary.brakeOwn ?? NaN, hard.a, 1e-9, 'decelerazione del freno da solo');
  // a brake too weak to hold the loaded car going down
  const weak = modelOf('C', { n_brakeNm: 5 });
  const w = runScenario(weak, { id: 'brake', p: { load: 'q', dir: 'dn', decel: 'real' } });
  assert.ok((w.summary.brakeOwn ?? 1) <= 0 && w.verdict === 'fail', `freno debole: ${w.summary.brakeOwn} ${w.verdict}`);
  assert.ok(w.events.some((e) => e.id === 'carStop') && frameAt(w.series, duration(w.series)).bufCar > 0, 'sugli ammortizzatori');
});

test('caricamento a 1,25·Q e cabina bloccata: stesso esito della verifica', () => {
  for (const pr of ['A', 'B', 'C'] as const) {
    const m = modelOf(pr);
    const ld = runScenario(m, { id: 'loading' });
    near(ld.summary.util, m.res.load.util, 1e-9, `${pr} caricamento`);
    assert.equal(ld.verdict === 'fail', m.res.load.util > 1);
    const st = runScenario(m, { id: 'stall' });
    assert.equal(st.verdict === 'ok', m.res.stall.ratio >= m.res.stall.efa);
    if (st.summary.slip) near(st.summary.ratio, st.summary.efa, 1e-6, `${pr} slittamento`);
  }
});

test('caricamento che slitta: la cabina scivola con l\'aderenza al limite, non cade; l\'esito è quello della verifica a 1,25·Q', () => {
  const m = modelOf('A', { k: 0.3 }), run = runScenario(m, { id: 'loading' });
  assert.ok(m.res.load.util > 1, 'la verifica del caricamento non passa');
  near(run.summary.util, m.res.load.util, 1e-12, 'utilizzo della verifica');
  assert.equal(run.verdict, 'fail');
  const d = run.series.data;
  let sliding = 0;
  for (let i = 0; i < run.series.n; i++) {
    if (!d.slip[i]) continue;
    sliding += 1;
    assert.ok(d.a[i] < 0 && d.a[i] > -1, `accelerazione nello slittamento ${d.a[i]}`);
    // the acceleration of the step before, at the position after it: equal to the rope's weight moved in one step
    near(d.ratio[i], d.efa[i], 1e-4, 'T1/T2 al limite mentre slitta');
  }
  assert.ok(sliding > 0, 'slitta');
});

test('cabina bloccata al limite: la simulazione dà l\'esito della verifica (funi come all\'ultimo piano)', () => {
  for (let H = 51; H <= 54.01; H += 0.25) {
    const m = modelOf('A', { n_n: 8, n_d: 13, n_qf: 0.568, n_Fmin: 80, H }), run = runScenario(m, { id: 'stall' });
    assert.equal(run.verdict === 'ok', m.res.stall.ratio >= m.res.stall.efa, `H ${H}`);
  }
});

test('ammortizzatori: bilancio di energia, corsa sufficiente o a pacco', () => {
  const m = modelOf('A'), run = runScenario(m, { id: 'buffer', p: { side: 'car' } });
  const mass = m.I.P + m.I.Q, v0 = 1.15 * m.I.v, x = run.summary.compression ?? 0, k = (m.bufferFactor * mass * G) / m.carStroke;
  near(0.5 * mass * v0 * v0 + mass * G * x, 0.5 * k * x * x, 1e-9, 'energia');
  assert.ok(x <= m.carStroke && run.verdict === 'ok');
  const weak = { ...m, carStroke: 0.02, carContact: m.carContact };
  assert.equal(runScenario(weak, { id: 'buffer', p: { side: 'car' } }).verdict, 'fail');
  const cw = runScenario(m, { id: 'buffer', p: { side: 'cw' } });
  assert.ok((cw.summary.compression ?? 0) > 0 && cw.events.some((e) => e.id === 'cwBuffer'));
});

test('moto coerente: la velocità è la derivata della posizione in ogni scenario', () => {
  for (const pr of ['A', 'C'] as const) {
    const m = modelOf(pr);
    const runs = [
      runScenario(m, { id: 'ride', p: { from: 0, to: m.levels.length - 1, load: m.I.Q } }),
      runScenario(m, { id: 'brake', p: { load: 'q', dir: 'dn', decel: 'norm' } }),
      runScenario(m, { id: 'brake', p: { load: 'e', dir: 'up', decel: 'real' } }),
      runScenario(m, { id: 'brake', p: { load: 'q', dir: 'up', decel: 'norm', pos: 'b' } }),
      runScenario(m, { id: 'brake', p: { load: 'e', dir: 'dn', decel: 'norm', pos: 't' } }),
      runScenario(m, { id: 'loading' }),
      runScenario(m, { id: 'stall' }),
      runScenario(m, { id: 'buffer', p: { side: 'car' } }),
      runScenario(m, { id: 'buffer', p: { side: 'cw' } }),
    ];
    for (const run of runs) {
      const { s, v } = run.series.data, dt = run.series.dt;
      // each step against the mean speed over it (trapezoid: exact to dt² even on a stiff buffer); a few steps may hold
      // a kink (contact, slip onset, the car landing back after its jump)
      let off = 0;
      for (let i = 0; i < run.series.n - 1; i++) if (Math.abs((s[i + 1] - s[i]) / dt - (v[i] + v[i + 1]) / 2) > 0.05) off += 1;
      assert.ok(off <= 3, `${pr} ${run.scenario.id}: ${off} campioni con velocità incoerente`);
    }
  }
});

test('ammortizzatori idraulici: decelerazione costante su tutta la corsa, la cabina ferma alla fine della corsa', () => {
  const m0 = modelOf('A'), m = { ...m0, carType: 'oil' as const, carStroke: 0.074 };
  const run = runScenario(m, { id: 'buffer', p: { side: 'car' } }), v0 = 1.15 * m.I.v;
  near(run.summary.accel, (v0 * v0) / (2 * m.carStroke), 1e-9, 'decelerazione');
  near(run.summary.compression ?? 0, m.carStroke, 1e-9, 'corsa');
  assert.equal(run.verdict, 'ok');
  // the motion stays consistent: speed is the derivative of the position
  const { s, v } = run.series.data, dt = run.series.dt;
  let off = 0;
  for (let i = 0; i < run.series.n - 1; i++) if (Math.abs((s[i + 1] - s[i]) / dt - (v[i] + v[i + 1]) / 2) > 0.05) off += 1;
  assert.ok(off <= 3, `${off} campioni con velocità incoerente`);
});
