// The governor and the buffers of the relazione tecnica di modifica, by hand (RT plan §11.4): the tripping window for
// 1,6 m/s with a progressive gear [1,84; 2,156] m/s (the correct 1,25·v + 0,25/v — a third party's 2,195 is its
// misprint), the rope's safety 25 400 N / 1 292 N = 19,66 ≥ 8, the governor's force max(2·600, 300) = 1 200 N, the rule at
// installation; the buffers' strokes (spring 1,0 m/s → 135 mm, 0,5 → 65 mm, oil 2,0 → 269,6 mm), the springs' 2,5×/4×
// edges included, the certificate's masses empty and loaded, 1,15·v against its impact speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strokeFor, strokeNeeded } from '@/shaft/buffers';
import { govSheaveCheck } from '@/shaft/governor';
import { DEFAULT_VERTICAL } from '@/shaft/vertical';
import { massaCertificata, molla, velocitaUrto } from '../rt/componenti/ammortizzatori';
import { finestraScatto, forzaLimitatore, funeLimitatore, limiteOrigine } from '../rt/componenti/limitatore';
import { KR } from '../rt/norme';

const G = 9.81;
const near = (a: number | null, b: number, tol = 1e-9): void => assert.ok(a !== null && Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('limitatore: finestra d’intervento a 1,6 m/s con paracadute progressivo [1,84; 2,156]', () => {
  const e = finestraScatto(1.6, 'progressive', 2);
  near(e.limitMin ?? null, 1.84);
  near(e.limit, 2.15625);
  assert.equal(e.status, 'ok');
  assert.equal(finestraScatto(1.6, 'progressive', 2.19).status, 'fail', 'il 2,195 di un modello di terzi è fuori');
  assert.equal(finestraScatto(1.6, 'progressive', 1.83).status, 'fail');
  assert.equal(finestraScatto(1.6, 'progressive', 2.15625).status, 'fail', 'il limite del paracadute è escluso: sotto, non uguale (5.6.2.2.1.1 a))');
  assert.equal(finestraScatto(1.6, 'progressive', 2.156).status, 'ok');
  assert.equal(finestraScatto(1.6, 'progressive', 1.84).status, 'ok', 'il 115 % è compreso');
  assert.equal(finestraScatto(1, 'progressive', 1.5).status, 'fail', '1,5 m/s esatti con il progressivo fino a 1 m/s: fuori');
  assert.equal(finestraScatto(0.63, 'instantaneous', 0.8).status, 'fail');
  // the other gears: 0,80 instantaneous, 1 m/s instantaneous with rollers, 1,5 progressive up to 1 m/s
  assert.equal(finestraScatto(0.63, 'instantaneous', 0.8).limit, 0.8);
  assert.equal(finestraScatto(0.63, 'roller', 0.9).limit, 1);
  assert.equal(finestraScatto(1, 'progressive', 1.3).limit, 1.5);
});

test('limitatore: fune 25 400 N su 1 292 N = 19,66 ≥ 8; forza max(2·600, 300) = 1 200 N; regola d’origine', () => {
  const f = funeLimitatore(25400, 1292);
  near(f.value, 19.659442724458206);
  assert.equal(f.status, 'ok');
  assert.equal(f.limit, KR.govRopeSf);
  assert.equal(funeLimitatore(8 * 1292 - 1, 1292).status, 'fail');
  assert.equal(funeLimitatore(8 * 1292, 1292).status, 'ok', '8 compreso');
  const t = forzaLimitatore(1200, 600);
  assert.equal(t.limit, 1200);
  assert.equal(t.status, 'ok');
  assert.equal(forzaLimitatore(1199, 600).status, 'fail');
  assert.equal(forzaLimitatore(300, 100).limit, 300, 'il minimo di 300 N');
  assert.equal(limiteOrigine(1.4, 1.5).status, 'ok');
  assert.equal(limiteOrigine(1.6, 1.5).status, 'fail');
  // the sheave over the rope: 30 included
  assert.equal(govSheaveCheck(30).status, 'ok');
  assert.equal(govSheaveCheck(29.9).status, 'fail');
});

test('ammortizzatori: corse 0,135·v² e 65 mm (molla), 0,0674·v² (idraulici), nessuna formula per il poliuretano', () => {
  near(strokeFor(1, 'spring'), 135);
  near(strokeFor(0.5, 'spring'), 65);
  near(strokeFor(2, 'oil'), 269.6, 1e-9);
  assert.equal(strokeFor(1, 'pu'), 0);
  // the shaft's function is the same expression on the vertical data's speed
  for (const v of [0.4, 0.63, 1, 1.6, 2.5]) for (const t of ['spring', 'pu', 'oil'] as const) assert.equal(strokeNeeded({ ...DEFAULT_VERTICAL, v }, t), strokeFor(v, t));
});

test('ammortizzatori a molla: forza a corsa completa tra 2,5 e 4 volte il carico statico, estremi compresi', () => {
  const m = 1330, n = 2, statico = (m * G) / n;
  assert.equal(molla(2.5 * statico, m, n).status, 'ok');
  assert.equal(molla(4 * statico, m, n).status, 'ok');
  assert.equal(molla(2.49 * statico, m, n).status, 'fail');
  assert.equal(molla(4.01 * statico, m, n).status, 'fail');
  const e = molla(3 * statico, m, n);
  near(e.value, 3);
  assert.deepEqual([e.limitMin, e.limit], [KR.springStaticMin, KR.springStaticMax]);
});

test('ammortizzatori in poliuretano e idraulici: masse del certificato (vuota e carica) e 1,15·v ≤ velocità d’urto', () => {
  const [min, max] = [400, 1200];
  assert.equal(massaCertificata(700, min, max).status, 'ok', 'vuota dentro');
  assert.equal(massaCertificata(1330, min, max).status, 'fail', 'carica fuori');
  assert.equal(massaCertificata(350, min, max).status, 'fail', 'vuota sotto il minimo');
  assert.equal(massaCertificata(400, min, max).status, 'ok', 'estremo compreso');
  const u = velocitaUrto(1, 1.15);
  near(u.value, 1.15);
  assert.equal(u.status, 'ok');
  assert.equal(velocitaUrto(1, 1.14).status, 'fail');
  assert.equal(velocitaUrto(1.6, 1.84).status, 'ok');
});
