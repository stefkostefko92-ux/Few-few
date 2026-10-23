// The rails of the relazione tecnica di modifica (RT plan §4.5, §4.6, §11.4): the omega method for Rm 520 at its
// breakpoints and interpolated for Rm 445, an Rm outside 370–520 refused, the permissible stresses by the steel's
// elongation, the core without options the very operations of sheet 1 (bit for bit), a hand-computed T89/B rail on a
// surveyed central sling, the suspension point in running and loading only, the counterweight rails in running with
// their deflection limits 5 / 10 mm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultInputs, layout } from '@/shaft';
import { KV_VERT } from '@/shaft/norme-vert';
import { RAILS, RAIL_SECTIONS } from '@/shaft/rails';
import { cwRailCheck, cwRailCore, cwRailGeometryOf } from '../tavole/cw-rail-check';
import { loadCasesAt, loadingCasesAt, railGeometryOf } from '../tavole/forces';
import { omega, omega520, omegaRm, railCheck, railCheckCore, railLimits } from '../tavole/rail-check';
import { cwMarcia } from '../rt/componenti/guide-cw';
import { geometriaCabina, geometriaContrappeso, opzioniDi, sezioneDi } from '../rt/componenti/geometria';
import { componentiSchemaDi } from '../rt/input-componenti';
import { KR } from '../rt/norme';

const near = (a: number | null, b: number, tol = 1e-5, msg = ''): void => assert.ok(a !== null && Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b}`);

test('ω Rm 520 ai punti di rottura 50/70/89 (λ 49, 50, 51, 70, 89, 90) e interpolato per Rm 445', () => {
  // hand values: ω = a·λ^b + c of each band (Rm 520: 50/70/89/250; Rm 370: 60/85/115/250)
  const cases: [number, number, number, number][] = [[49, 1.20218, 1.27088, 1.23653], [50, 1.21005, 1.2815, 1.24577], [51, 1.21806, 1.29709, 1.25757],
    [70, 1.41097, 1.58002, 1.4955], [89, 1.6921, 2.00543, 1.84876], [90, 1.70945, 2.05173, 1.88059]];
  for (const [l, w370, w520, w445] of cases) {
    near(omega(l), w370, 1e-5, `ω370(${l})`);
    near(omega520(l), w520, 1e-5, `ω520(${l})`);
    near(omegaRm(l, 445), w445, 1e-5, `ω445(${l})`);
  }
  // the ends of the interpolation are the two tables; beyond λ 250 none
  assert.equal(omegaRm(70, 370), omega(70));
  near(omegaRm(70, 520), omega520(70) ?? NaN, 1e-12, 'Rm 520');
  assert.equal(omega520(251), null);
  assert.equal(omegaRm(251, 445), null);
});

test('Rm 360 e 530 rifiutati: il metodo omega non li copre (schema e motore)', () => {
  assert.throws(() => omegaRm(70, 360), RangeError);
  assert.throws(() => omegaRm(70, 530), RangeError);
  const S = componentiSchemaDi(false).shape.guideCabina;
  assert.ok(!S.safeParse({ Rm: 360 }).success);
  assert.ok(!S.safeParse({ Rm: 530 }).success);
  assert.ok(S.safeParse({ Rm: 370 }).success && S.safeParse({ Rm: 520 }).success);
});

test('tensioni ammissibili: Rm/St con St 2,25 e 1,8 oltre il 12 %, 3,75 e 3,0 tra 8 e 12 %', () => {
  assert.deepEqual(railLimits(), { gear: 370 / 1.8, use: 370 / 2.25 });
  assert.deepEqual(railLimits({ Rm: 520 }), { gear: 520 / KV_VERT.railStGear, use: 520 / KV_VERT.railStRun });
  assert.deepEqual(railLimits({ Rm: 445, a5: 'da8a12' }), { gear: 445 / KR.railStGear812, use: 445 / KR.railStRun812 });
  assert.deepEqual(railLimits({ a5: 'da8a12' }), { gear: 370 / 3.0, use: 370 / 3.75 });
  // Rm 370 given is no option: the very operations of sheet 1
  assert.deepEqual(opzioniDi({ Rm: 370 }), {});
});

test('il nucleo senza opzioni dà gli stessi bit di railCheck sul layout', () => {
  for (const [W, D, cw] of [[1600, 1750, 'rear'], [1800, 2000, 'left']] as const) {
    const L = layout({ ...defaultInputs(W, D), cw });
    for (const t of ['T70-1/A', 'T89/B'] as const) {
      const a = railCheck(L, t, 700, 630, 'progressive', 2000, 18000, 'passengers');
      const b = railCheckCore(railGeometryOf(L), { ...RAIL_SECTIONS[t], q: RAILS[t].q }, 700, 630, 'progressive', 2000, 18000, 'passengers');
      assert.deepEqual(b, a);
    }
  }
});

test('guida T89/B su arcata centrale rilevata, calcolata a mano (EN 81-50 5.10)', () => {
  const g = geometriaCabina({ arcata: 'centrale', A: 1100, B: 1400, h: 3000, accessi: 'A' });
  assert.ok(g.geo && !g.mancanti.length && !g.S);
  const geo = g.geo, P = 700, Q = 630, k = 2, G = 9.81, S = RAIL_SECTIONS['T89/B'], l = 2000;
  // the load 1/8 of the depth across the rails' line, 1/8 of the width along it; the car's centre on the rails' axis
  near(geo.xQ, 1.4 / 8, 1e-12, 'xQ');
  near(geo.yQ, 1.1 / 8, 1e-12, 'yQ');
  const fx = (k * G * Q * (1.4 / 8)) / (2 * 3), fy = (k * G * Q * (1.1 / 8)) / (1 * 3);
  const sm = Math.max((0.1875 * fx * l) / S.Wy, (0.1875 * fy * l) / S.Wx);
  const rc = railCheckCore(geo, { ...S, q: RAILS['T89/B'].q }, P, Q, 'progressive', l, 22000, 'passengers');
  near(rc.gear.sm, sm, 1e-9, 'σm al paracadute');
  near(rc.gear.s, sm + ((k * G * (P + Q)) / 2 + (G * RAILS['T89/B'].q * 22000) / 1000) / S.A, 1e-9, 'σ al paracadute');
  near(rc.lambda, l / Math.sqrt(Math.min(S.Ix, S.Iy) / S.A), 1e-9, 'λ');
});

test('punto di sospensione: entra in marcia e al carico, mai all’intervento del paracadute', () => {
  const g = geometriaCabina({ arcata: 'zaino', A: 1000, B: 1300, h: 2800, accessi: 'A', xC: 600, yC: 0, xS: 300, yS: 0 });
  assert.ok(g.geo && g.S);
  near(g.S.xS, 0.3, 1e-12, 'xS orientato');
  const geo = g.geo, gear = loadCasesAt(geo, 700, 630, 2, g.S), gear0 = loadCasesAt(geo, 700, 630, 2);
  // the safety gear's case is the caller's choice not to pass S: the core passes it to running and loading only
  const S = { ...RAIL_SECTIONS['T89/B'], q: RAILS['T89/B'].q };
  const withS = railCheckCore(geo, S, 700, 630, 'progressive', 2000, 20000, undefined, { S: g.S }), without = railCheckCore(geo, S, 700, 630, 'progressive', 2000, 20000);
  assert.equal(withS.gear.sm, without.gear.sm);
  assert.ok(withS.run.sm < without.run.sm, 'la sospensione verso il centro della cabina riduce i momenti in marcia');
  // running: k2·g·(P·|xP − xS| + Q·(|xP − xS| + d))/(n·h)
  const r = loadCasesAt(geo, 700, 630, KV_VERT.k2Running, g.S).cases[0];
  near(r.fx, (KV_VERT.k2Running * 9.81 * (700 * 0.3 + 630 * (0.3 + 0.125))) / (2 * 2.8), 1e-9, 'Fx in marcia');
  assert.ok(gear.cases[0].fx < gear0.cases[0].fx);
  const load = loadingCasesAt(geo, 700, 630, 'passengers', g.S);
  assert.equal(load.length, 1);
  // a cantilever without the car's centre and the suspension point: missing, never guessed
  assert.deepEqual(geometriaCabina({ arcata: 'zaino', A: 1000, B: 1300, h: 2800, accessi: 'A' }).mancanti,
    ['componenti.guideCabina.xC', 'componenti.guideCabina.yC', 'componenti.guideCabina.xS', 'componenti.guideCabina.yS']);
});

test('profilo inserito a mano: servono tutte le misure; la sezione del catalogo altrimenti', () => {
  const part = sezioneDi({ profilo: 'custom', custom: { sigla: 'T75', A: 1000, Ix: 4e5 } }, 'componenti.guideCabina');
  assert.equal(part.S, null);
  assert.ok(part.mancanti.includes('componenti.guideCabina.custom.Wy') && part.mancanti.includes('componenti.guideCabina.custom.q'));
  const full = sezioneDi({ profilo: 'custom', custom: { sigla: 'T75', A: 1091, Ix: 402900, Iy: 264700, Wx: 9286, Wy: 7060, iMin: 15.6, c: 8, q: 8.63 } }, 'x');
  assert.ok(full.S && full.S.i === 15.6 && full.sigla === 'T75');
  assert.deepEqual(sezioneDi(undefined, 'x', 'T89/B').S, { ...RAIL_SECTIONS['T89/B'], q: RAILS['T89/B'].q });
});

test('guide del contrappeso in marcia: freccia entro 10 mm senza paracadute, 5 mm con; il nucleo come il foglio 1', () => {
  const L = layout({ ...defaultInputs(1600, 1750), cw: 'rear' }), geo = cwRailGeometryOf(L, {});
  assert.deepEqual(cwRailCore(geo, 1015, 'progressive'), cwRailCheck(L, 1015, 'progressive', {}));
  const libero = cwMarcia(geo, 1015, {}, false), conPar = cwMarcia(geo, 1015, {}, true);
  assert.equal(libero.freccia.limit, KR.cwRailDeflNoGear);
  assert.equal(conPar.freccia.limit, KV_VERT.railDeflection);
  assert.equal(libero.freccia.value, conPar.freccia.value);
  assert.equal(libero.tensione.limit, railLimits().use);
  // a counterweight heavy enough to bend its rails by 6 mm: within 10, beyond 5
  const lungo = { ...geo, l: 4000 }, m = cwMarcia(lungo, 1015, {}, false);
  const d = m.freccia.value ?? 0, M = 1015 * (7.5 / d);
  const sei = cwMarcia(lungo, M, {}, false), seiPar = cwMarcia(lungo, M, {}, true);
  near(sei.freccia.value, 7.5, 1e-9, 'freccia scalata');
  assert.equal(sei.freccia.status, 'ok');
  assert.equal(seiPar.freccia.status, 'fail');
  // the room path: everything entered, else the missing fields
  const r = geometriaContrappeso({ larghezza: 700, profondita: 120 }, null, undefined);
  assert.deepEqual(r.mancanti, ['componenti.guideContrappeso.h', 'componenti.guideContrappeso.colonna', 'impianto.cwBracketPitch']);
});
