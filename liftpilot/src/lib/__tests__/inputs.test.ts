// External input: the calculator values and the forms are validated before anything else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { readInputs } from '@/calc/inputs';
import { defaultInputs } from '@/shaft';
import { formValuesSchema, visibleBad } from '../calc-input';
import { shaftInputsSchema } from '../shaft-input';
import { loginSchema, newPasswordSchema, projectSchema, userCreateSchema } from '../schemas';
import { passwordPolicyOk } from '../password-policy';
import { deriveLift, newLift, type LiftInputs } from '../lift';

test('valori del calcolatore: gli esempi passano, il resto no', () => {
  for (const k of ['A', 'B', 'C'] as const) assert.ok(formValuesSchema.safeParse(PRESETS[k]).success, k);
  assert.equal(formValuesSchema.safeParse({ ...PRESETS.B, evil: '1' }).success, false, 'campo sconosciuto');
  assert.equal(formValuesSchema.safeParse({ ...PRESETS.B, Q: 'x'.repeat(33) }).success, false, 'stringa lunga');
  assert.equal(formValuesSchema.safeParse({ ...PRESETS.B, Q: Number.POSITIVE_INFINITY }).success, false, 'numero non finito');
  assert.equal(formValuesSchema.safeParse({ ...PRESETS.B, Q: { a: 1 } }).success, false, 'oggetto');
});

test('campi non validi mostrati solo se visibili', () => {
  assert.deepEqual(visibleBad(['Q', 'Hv', 'o_D'], { ...PRESETS.C }), ['Q', 'o_D']);
  assert.deepEqual(visibleBad(['o_D'], { ...PRESETS.A }), []);
  assert.deepEqual(visibleBad(['Hv', 'Hv'], { ...PRESETS.B }), ['Hv']);
});

test('moduli: e-mail normalizzata, testi opzionali a null, password', () => {
  assert.equal(loginSchema.parse({ email: '  Mario.Rossi@Example.IT ', password: 'x' }).email, 'mario.rossi@example.it');
  const p = projectSchema.parse({ name: ' Impianto A ', address: '', city: 'Milano', province: '', plantNumber: '', client: '', notes: '' });
  assert.deepEqual([p.name, p.address, p.city], ['Impianto A', null, 'Milano']);
  assert.equal(projectSchema.safeParse({ name: '', address: '', city: '', province: '', plantNumber: '', client: '', notes: '' }).success, false);
  assert.equal(userCreateSchema.safeParse({ email: 'a@b.it', name: 'A', role: 'SUPERADMIN' }).success, false, 'SUPERADMIN non assegnabile');
  assert.ok(passwordPolicyOk('Ascensore2026x') && !passwordPolicyOk('Ascensore26') && !passwordPolicyOk('abcdefghijklm'));
  assert.equal(newPasswordSchema.safeParse({ current: 'a', next: 'Ascensore2026x', confirm: 'Ascensore2026y' }).success, false);
});

test('lettura dei valori: numeri come scritti, taglia 1:1 o 2:1, poli 2-4-6-8', () => {
  const bad = (patch: Record<string, string | number>): string[] => readInputs({ ...PRESETS.B, ...patch }).bad;
  assert.ok(bad({ Q: '630abc' }).includes('Q'), 'cifre seguite da altro');
  assert.ok(bad({ Q: '0x10' }).includes('Q'), 'esadecimale');
  assert.equal(readInputs({ ...PRESETS.B, Q: '630,5' }).I.Q, 630.5, 'virgola decimale');
  assert.equal(readInputs({ ...PRESETS.B, Q: ' 630 ' }).I.Q, 630);
  assert.ok(bad({ r: '3' }).includes('r') && bad({ r: '-1' }).includes('r'), 'taglia');
  assert.ok(!bad({ r: '2' }).includes('r') && readInputs({ ...PRESETS.B, r: 2 }).I.r === 2);
  assert.ok(bad({ n_poles: '-4' }).includes('n_poles') && bad({ n_poles: '5' }).includes('n_poles'), 'poli');
  assert.equal(readInputs({ ...PRESETS.B, n_poles: '6' }).N.poles, 6);
});

test('vano: due fermate con porta sullo stesso lato almeno a una porta di distanza; mai alla stessa quota', () => {
  const S = defaultInputs(1600, 1750), F = S.vertical.floors;
  assert.ok(shaftInputsSchema.safeParse(S).success);
  const at = (rise: number, door: 'A' | 'B' = 'A') => shaftInputsSchema.safeParse({ ...S, vertical: { ...S.vertical,
    floors: F.map((f, i) => (i === 0 ? { ...f, rise } : i === 1 ? { ...f, door } : f)) } });
  assert.equal(at(S.doorHeight - 1).success, false, 'porte sovrapposte sulla stessa parete');
  assert.ok(at(S.doorHeight).success);
  assert.equal(at(0, 'B').success, false, 'stessa quota');
  assert.ok(at(500, 'B').success, 'porte su lati opposti: basta salire');
  // case c)'s reason goes into the relazione as written: no hidden characters
  assert.ok(shaftInputsSchema.safeParse({ ...S, accessReason: 'vano nella tromba delle scale' }).success);
  assert.equal(shaftInputsSchema.safeParse({ ...S, accessReason: 'vano nella\u200b tromba delle scale' }).success, false);
});

test('gola senza intaglio (U) e a cuneo temprata (VH): β non si legge, la gola U proposta è un dato valido', () => {
  const read = (patch: Record<string, string | number>) => readInputs({ ...PRESETS.B, ...patch });
  for (const g of ['U', 'VH']) {
    for (const beta of [0, '', 90]) {
      const r = read({ n_groove: g, n_beta: beta, o_groove: g, o_beta: beta, compare: 1 });
      assert.ok(!r.bad.includes('n_beta') && !r.bad.includes('o_beta'), `${g} β ${beta}`);
      assert.equal(r.N.groove.beta, 0);
    }
  }
  // with an undercut β stays a datum in (0°, 180°]
  for (const g of ['UU', 'VN']) assert.ok(read({ n_groove: g, n_beta: 0 }).bad.includes('n_beta') && read({ n_groove: g, n_beta: '' }).bad.includes('n_beta'), g);
  assert.equal(read({ n_groove: 'UU', n_beta: 95 }).N.groove.beta, 95);
  // the machine below in a pulley room with a heavy car: the sizing's groove is a U one (β 0); until round 37 the
  // design could not be saved (n_beta flagged, the field hidden for a U groove)
  const n = newLift(), L: LiftInputs = { ...n, shaft: { ...n.shaft, room: null }, calc: { ...n.calc, P: 1540, layout: 'bottom' }, auto: { ...n.auto, P: false }, bottom: 'room' };
  const d = deriveLift(L);
  assert.deepEqual([d.values.n_groove, d.values.n_beta], ['U', 0]);
  assert.deepEqual(d.analysis.ctx.bad, []);
});
