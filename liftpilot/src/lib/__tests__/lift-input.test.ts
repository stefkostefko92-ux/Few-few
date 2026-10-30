// The acceptance test's schemas (src/lib/lift-input.ts) with the logbook's speed and travel and the existing
// controller's regulation (round 46, B2): every shape of Calculation.collaudo and LiftDesign.inputs.collaudo stored on
// the copy argano_r46 (SELECT DISTINCT, frozen in fixtures/collaudo-r46.json) still reads, and as a record saves it; a
// new record refuses a speed or a travel of zero, out of range, or an empty logbook; what is stored before reads back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collaudoReadSchema, collaudoSchema, liftInputsReadSchema } from '../lift-input';
import { defaultLift } from '../lift';

const STORED: unknown[] = JSON.parse(readFileSync(new URL('./fixtures/collaudo-r46.json', import.meta.url), 'utf8'));
const base = { norma: '10411-1', parti: ['machine'] } as const;

test('ogni forma salvata di Calculation.collaudo si legge ancora, e si risalva', () => {
  assert.ok(STORED.length >= 10);
  for (const c of STORED) {
    assert.ok(collaudoReadSchema.safeParse(c).success, JSON.stringify(c));
    assert.ok(collaudoSchema.safeParse(c).success, JSON.stringify(c));
  }
  // and inside a saved one form
  for (const c of STORED) assert.ok(liftInputsReadSchema.safeParse({ ...defaultLift(), collaudo: c }).success, JSON.stringify(c));
});

test('libretto e regolazione: il salvataggio accetta i valori validi', () => {
  const ok = (x: object) => collaudoSchema.safeParse({ ...base, ...x }).success;
  assert.ok(ok({ libretto: { v: 1 } }));
  assert.ok(ok({ libretto: { v50: 0.95 } }));
  assert.ok(ok({ libretto: { H: 15.3 } }));
  assert.ok(ok({ libretto: { v: 0.1, v50: 10, H: 300 } }));
  assert.ok(ok({ libretto: { H: 1 } }));
  for (const r of ['vvvf', '2v', '1v']) assert.ok(ok({ regolazione: r }), r);
});

test('libretto e regolazione: il salvataggio rifiuta zero, fuori campo, il libretto vuoto e le chiavi estranee', () => {
  const ko = (x: object) => !collaudoSchema.safeParse({ ...base, ...x }).success;
  assert.ok(ko({ libretto: { v: 0 } }), 'v = 0');
  assert.ok(ko({ libretto: { H: 0 } }), 'H = 0');
  assert.ok(ko({ libretto: {} }), 'libretto vuoto');
  assert.ok(ko({ libretto: { v: 0.09 } }));
  assert.ok(ko({ libretto: { v50: 10.5 } }));
  assert.ok(ko({ libretto: { H: 300.5 } }));
  assert.ok(ko({ libretto: { v: Number.NaN } }));
  assert.ok(ko({ libretto: { v: 1, corsa: 15 } }), 'chiave estranea');
  assert.ok(ko({ regolazione: 'idraulico' }));
});

test('in lettura: valori positivi qualunque, anche un libretto vuoto; mai zero', () => {
  const read = (x: object) => collaudoReadSchema.safeParse({ ...base, ...x }).success;
  assert.ok(read({ libretto: {} }));
  assert.ok(read({ libretto: { v: 0.05, H: 0.5 } }));
  assert.ok(!read({ libretto: { v: 0 } }));
  assert.ok(!read({ libretto: { H: -3 } }));
  // what reads keeps its values
  const r = collaudoReadSchema.parse({ ...base, libretto: { v: 1, v50: 0.97, H: 21.4 }, regolazione: '2v' });
  assert.deepEqual([r.libretto, r.regolazione], [{ v: 1, v50: 0.97, H: 21.4 }, '2v']);
});
