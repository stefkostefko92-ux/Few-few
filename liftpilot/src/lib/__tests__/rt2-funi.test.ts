// The rope pages of the RT after the owner's model (round 52): the model's sheet «Funi» recomputed by LibreOffice on
// its own file (vector B of the spec: 630 kg, 900 kg car, 1215 kg counterweight, 20 m, 1 m/s, 1:1, machine above, four
// Donati 10-152 ropes, V groove 40°, 180°, D 500 mm) gives the same numbers where no correction applies; the corrections
// (the travelling cable with g, the friction factor of a semicircular groove, C1 never under its band's minimum, z
// against ≥, the larger pull over the smaller) are each shown on a case where the model is wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { funiDi, type FuniIn } from '@/lib/rt2/funi-core';
import { funiDaCalcolo } from '@/lib/rt2/funi-calc';
import { FUNI } from '@/lib/rt2/componenti/funi';
import { ctxDi } from './rt2-fixtures';

const near = (a: number, b: number, rel = 1e-9, msg = ''): void => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);

const B: FuniIn = {
  n: 4, d: 10, MBL: 46000, qf: 0.34, S: 36.5, Q: 630, P: 900, Mcw: 1215, H: 20, r: 1, v: 1, locale: 'alto', D: 500,
  gola: { type: 'VH', beta: 0, gamma: 40 }, alfa: 180, comp: { tipo: 'nessuna', d: 0, n: 0, q: 0, Mt: 0, Dt: 0, soloCwt: false }, caviQ: 0.8, aRidotta: false,
};

test('rt2-funi: il vettore B del modello (LibreOffice) dove nessuna correzione cambia il valore', () => {
  const o = funiDi(B);
  near(o.ropeWeight, 266.832, 1e-9, 'R89');
  near(o.Ctot, 15276.132, 1e-9, 'H83');
  near(o.Cfune, 3819.033, 1e-9, 'H85');
  near(o.z, 46000 / 3819.033, 1e-9, 'H89');
  near(o.dRatio, 50, 1e-12, 'H93');
  near(o.T1, 16821.207, 1e-9, 'H123');
  near(o.T2, 11919.15, 1e-9, 'H125');
  near(o.T1p, 12185.982, 1e-9, 'H129');
  near(o.C1, 1.265588914549654, 1e-9, 'H133');
  near(o.f, 0.09 / Math.sin((20 * Math.PI) / 180), 1e-12, 'H151');
  near(o.ratioLow, 2.14331, 1e-5, 'H147');
  near(o.Tstat, 15276.132, 1e-9, 'H163');
  near(o.pRes, 10.0495, 1e-4, 'H165');
  near(o.pLim, 8.09325, 1e-9, 'H170');
});

test('rt2-funi: correzioni — cavo flessibile per g, C1 mai sotto il minimo, f della gola semicircolare', () => {
  // E-F15: the model adds 0,8·H/2 = 8 «N»; the cable's weight is 0,8 kg/m · 10 m · 9,81 = 78,48 N
  near(funiDi(B).T2p, 900 * 9.81 + 78.48, 1e-9, 'T\'2');
  // E-F10: «X» gives a = 0,5 → C1 = 1,107 < 1,15 (v ≤ 1): never under the band's minimum
  near(funiDi({ ...B, aRidotta: true }).C1, 1.15, 1e-12, 'C1');
  // E-F11/E-F12: a U groove without undercut: f = 4μ/π (the model 0,2165 with β fixed at 1,83 rad, or 0)
  near(funiDi({ ...B, gola: { type: 'U', beta: 0, gamma: 0 } }).f, (4 * 0.09) / Math.PI, 1e-12, 'f U');
  // the larger pull over the smaller: a heavy counterweight makes the car side the lighter at the bottom too
  const heavy = funiDi({ ...B, Mcw: 3000 });
  near(heavy.ratioLow, heavy.C1 * heavy.C2 * (heavy.T2 / heavy.T1), 1e-12, 'ratio');
});

test('rt2-funi: dai valori del calcolo e la pagina stampata', () => {
  const ctx = ctxDi();
  const f = funiDaCalcolo(ctx.calc.V);
  assert.ok(f);
  near(f.out.Ctot, 15276.132, 1e-9, 'Ctot dal calcolo');
  const e = FUNI.calcola(ctx, {});
  assert.ok(e.verifiche.some((v) => v.id === 'funi.z' && v.esito === 'ok'));
  assert.equal(e.verifiche.find((v) => v.id === 'funi.d2')?.esito, 'fail', 'D.2 non verificata nel vettore B');
  const blocks = FUNI.pagine(ctx, {}, e, { titolo: 'Documentazione', norma: 'UNI 10411-1:2024' });
  const text = JSON.stringify(blocks);
  assert.ok(text.includes('Stabilità allo scorrimento:') && text.includes('Pressione specifica limite'));
  assert.ok(!/undefined|NaN|\[object/.test(text));
  assert.equal(blocks.filter((b) => b.t === 'pagina').length, 2);
});
