// The impact on the buffers (round 37): nothing pushes the other side when one lands — the car when the counterweight
// is on its buffer, the counterweight when the car is on its buffers —: it carries on at 1,15·v and follows the buffer's
// compression (ropes taut) or flies on slowed by g (ropes slack). Every speed is continuous at the impact (until round
// 36 the other side's jumped by √(2·g·0,035·v²): 0,724 → 1,247 m/s at 0,63 m/s); the other side is never faster than
// 1,15·v or than the side on the buffer pulling it (a mass falling on a linear spring speeds up until k·x = m·g, the
// standard's free fall); its rise stays within the stroke and the conventional jump of the section check, and every
// speed is still the derivative of its position.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, compute, readInputs } from '../../calc/index';
import { G } from '../../calc/math';
import { DEFAULT_VERTICAL, KV_VERT, defaultInputs, layout, section, type BufferType, type Floor } from '../../shaft/index';
import { chartsFor } from '../../components/lift/charts';
import { runScenario, simModel, type SimModel } from '../index';

/** A calculation example over a shaft whose floors give its travel. */
function modelOf(preset: 'A' | 'B' | 'C'): SimModel {
  const ctx = readInputs(PRESETS[preset]), res = compute(ctx.I, ctx.N), n = Math.round(ctx.I.H / 3) + 1;
  const floors: Floor[] = Array.from({ length: n }, (_, i) => ({ label: String(i), rise: i < n - 1 ? 3000 : 0, door: 'A' }));
  const L = layout({ ...defaultInputs(1600, 1750), vertical: { ...DEFAULT_VERTICAL, v: ctx.I.v, floors } });
  return simModel(ctx.I, ctx.N, res, section(L), L.inputs.vertical);
}

/** The models: the examples with springs, and with hydraulic buffers and polyurethane pads on both sides. */
const MODELS: readonly (readonly [string, SimModel])[] = (['A', 'B', 'C'] as const).flatMap((p) => {
  const m = modelOf(p), as = (t: BufferType, car: number, cw: number): SimModel => ({ ...m, carType: t, cwType: t, carStroke: car, cwStroke: cw });
  const oil = KV_VERT.oilStrokeK * m.I.v * m.I.v * 1.05;
  return [[`${p} molle`, m], [`${p} idraulici`, as('oil', oil, oil)], [`${p} poliuretano`, as('pu', 0.072, 0.072)]] as const;
});

/** Speed of a channel over the step from sample i (upwards positive). */
const speed = (a: Float64Array, dt: number, i: number): number => (a[i + 1] - a[i]) / dt;

test('urto sugli ammortizzatori: l’altra parte prosegue a 1,15·v senza salto di velocità, entro la corsa e il salto della sezione', () => {
  for (const [name, m] of MODELS) {
    const v0 = 1.15 * m.I.v, jump = KV_VERT.jumpK * m.I.v * m.I.v;
    for (const side of ['car', 'cw'] as const) {
      const run = runScenario(m, { id: 'buffer', p: { side } }), D = run.series.data, dt = run.series.dt, n = run.series.n;
      const at = run.events.find((e) => e.id === (side === 'car' ? 'carBuffer' : 'cwBuffer'))?.t ?? Number.NaN, i0 = Math.round(at / dt);
      const what = `${name}, ${side === 'car' ? 'cabina' : 'contrappeso'} sull’ammortizzatore`;
      assert.ok(i0 > 1 && i0 < n - 2, what);
      // the side on the buffer and the other side, as positions (the car's floor, the counterweight's plate)
      const hit = side === 'car' ? D.s : D.cw, free = side === 'car' ? D.cw : D.s;
      // the other side never outruns 1,15·v nor the side on the buffer pulling it
      for (let i = 0; i < n - 1; i++) {
        const f = Math.abs(speed(free, dt, i)), h = Math.abs(speed(hit, dt, i));
        assert.ok(f <= Math.max(v0, h) + 1e-9, `${what}: ${f.toFixed(3)} m/s a ${(i * dt).toFixed(2)} s (urto a ${v0.toFixed(3)})`);
      }
      // continuous at the impact: each side's speed changes there by at most what the buffer and gravity give in a step
      for (const a of [hit, free]) {
        const jump = Math.abs(speed(a, dt, i0) - speed(a, dt, i0 - 1));
        assert.ok(jump <= 2 * G * dt + 1e-9, `${what}: salto di ${jump.toFixed(3)} m/s all’urto`);
      }
      // both meet the impact at 1,15·v, the car's speed channel its own
      assert.ok(Math.abs(Math.abs(speed(hit, dt, i0 - 1)) - v0) < 1e-6 && Math.abs(Math.abs(speed(free, dt, i0 - 1)) - v0) < 1e-6, what);
      assert.ok(Math.abs(Math.abs(D.v[i0]) - v0) < 1e-9, what);
      // the other side's rise past the contact: its free flight or the buffer's compression, within stroke + jump
      const rise = side === 'car' ? Math.max(...Array.from(D.cw)) - D.cw[i0] : Math.max(...Array.from(D.s)) - D.s[i0];
      const stroke = side === 'car' ? m.carStroke : m.cwStroke, x = run.summary.compression ?? 0;
      assert.ok(Math.abs(rise - Math.max(x, (v0 * v0) / (2 * G))) < v0 * dt, `${what}: sale ${rise.toFixed(4)} m`);
      assert.ok(rise <= stroke + jump + 1e-9, `${what}: ${rise.toFixed(4)} m oltre corsa + salto`);
    }
  }
});

test('urto sugli ammortizzatori: velocità e posizione coerenti in ogni passo (nessun gradino all’urto)', () => {
  for (const [name, m] of MODELS) {
    for (const side of ['car', 'cw'] as const) {
      const run = runScenario(m, { id: 'buffer', p: { side } }), { s, v, cw } = run.series.data, dt = run.series.dt;
      let off = 0;
      for (let i = 0; i < run.series.n - 1; i++) if (Math.abs((s[i + 1] - s[i]) / dt - (v[i] + v[i + 1]) / 2) > 0.05) off += 1;
      // the free flight landing back on taut ropes is a real kink (one step), the impact is not
      assert.ok(off <= 2, `${name} ${side}: ${off} campioni con velocità incoerente`);
      // the counterweight's positions agree with the car's speed until the impact (the ropes carry both at 1,15·v)
      const at = run.events.find((e) => e.id === (side === 'car' ? 'carBuffer' : 'cwBuffer'))?.t ?? 0;
      for (let i = 0; i + 1 < Math.round(at / dt); i++) assert.ok(Math.abs((cw[i + 1] - cw[i]) / dt + v[i]) < 1e-9, `${name} ${side}: ${i}`);
    }
  }
});

test('urto sugli ammortizzatori, grafico della velocità: la cabina e il contrappeso, quello sull’ammortizzatore a 1,15·v all’urto', () => {
  const m = modelOf('A'), v0 = 1.15 * m.I.v;
  for (const side of ['car', 'cw'] as const) {
    const run = runScenario(m, { id: 'buffer', p: { side } }), [speedChart] = chartsFor(run, (k) => k, m.phys.model.R, m.I.r, m.phys.Mn, m.I.Q);
    assert.ok(speedChart);
    assert.equal(speedChart.title, 'ch_vcw');
    assert.deepEqual(speedChart.lines.map((l) => [l.key, l.label]), [['v', 'ch_car'], ['cw', 'ch_cw']]);
    const cw = speedChart.lines[1]?.values, i0 = Math.round((run.events.find((e) => e.id === (side === 'car' ? 'carBuffer' : 'cwBuffer'))?.t ?? 0) / run.series.dt);
    assert.ok(cw);
    // before the impact the counterweight runs against the car at 1,15·v; at the impact still at 1,15·v
    assert.ok(Math.abs(cw[i0 - 5] + run.series.data.v[i0 - 5]) < 1e-9 && Math.abs(Math.abs(cw[i0 - 5]) - v0) < 1e-9, side);
    assert.ok(Math.abs(Math.abs(cw[i0 - 1]) - v0) < 1e-6, side);
  }
});
