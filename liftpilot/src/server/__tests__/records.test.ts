// The one rule of a saved record's documents (src/server/records.ts): the calculation, its shaft design and its lift
// design all reproduced by the running engines; the standards the documents set out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { ENGINE_VERSION, snapshotOf } from '@/calc/snapshot';
import { LIFT_ENGINE_VERSION, defaultLift, deriveLift } from '@/lib/lift';
import { shaftHash } from '@/lib/shaft-hash';
import { snapshotHash } from '@/lib/snapshot-hash';
import { ROOM_ENGINE_VERSION } from '@/lib/room/snapshot';
import { SHAFT_ENGINE_VERSION, shaftSnapshot } from '@/shaft';
import { calcRecord, outdated, readCalc, recordMarks, storedCollaudo } from '../records';

const calcRow = (values: typeof PRESETS.B) => {
  const s = snapshotOf(values);
  return { inputs: s.values, sha256: snapshotHash(s) };
};

/** The three records a save of the one form makes, as the database keeps them. */
function liftRows(engineVersion = LIFT_ENGINE_VERSION, inputs = defaultLift()) {
  const dv = deriveLift(inputs), S = shaftSnapshot(dv.shaft);
  const shaftDesign = {
    id: 'd1', label: null, createdAt: new Date(0), sha256: shaftHash(S.snapshot), engineVersion: S.snapshot.engine, profileId: S.snapshot.profile,
    inputs: S.snapshot.inputs, source: null, user: null,
  };
  return { ...calcRow(dv.values), shaftDesign, liftDesign: { inputs, engineVersion } };
}

test('calcolo: letto e riprodotto, oppure no', () => {
  const row = calcRow(PRESETS.B);
  assert.equal(readCalc(row)?.same, true);
  assert.equal(readCalc({ ...row, sha256: '0'.repeat(64) })?.same, false, 'hash diverso: motore cambiato');
  assert.equal(readCalc({ inputs: { nonsense: true }, sha256: row.sha256 }), null, 'valori illeggibili');
});

test('documenti: calcolo, progetto del vano e progetto dell’impianto tutti riprodotti', () => {
  const rows = liftRows(), rec = calcRecord(rows);
  assert.ok(rec);
  assert.equal(rec.ok, true);
  assert.ok(rec.design && rec.lift?.same);
  // only the derivation of the one form changed (its version): the calculation and the shaft design still reproduce,
  // but the documents follow the lift design, as its page does
  const liftOld = calcRecord({ ...rows, liftDesign: { ...rows.liftDesign, engineVersion: '0.0.0' } });
  assert.equal(liftOld?.calcSame, true);
  assert.equal(liftOld?.designSame, true);
  assert.equal(liftOld?.liftSame, false);
  assert.equal(liftOld?.ok, false);
  const shaftOld = calcRecord({ ...rows, shaftDesign: { ...rows.shaftDesign, sha256: '0'.repeat(64) } });
  assert.equal(shaftOld?.designSame, false);
  assert.equal(shaftOld?.ok, false);
});

test('progetto salvato con una distanza della pianta oltre le pareti del vano: i documenti aspettano, il campo è nominato', () => {
  // a record saved before the save refused it (round 37): read as it was, the hashes reproduce, but the sheets would
  // place the counterweight off their views; the refresh leads to the form, which names plan.cwPos (pk_cwPos)
  const base = defaultLift(), inputs = { ...base, shaft: { ...base.shaft, plan: { cwPos: 10000 } } };
  assert.ok(deriveLift(inputs).issues.includes('shaft.plan.cwPos'));
  const rec = calcRecord(liftRows(LIFT_ENGINE_VERSION, inputs));
  assert.deepEqual([rec?.calcSame, rec?.designSame, rec?.liftSame, rec?.ok], [true, true, false, false]);
  // inside the shaft the same record issues its set
  assert.equal(calcRecord(liftRows(LIFT_ENGINE_VERSION, { ...base, shaft: { ...base.shaft, plan: { cwPos: 0 } } }))?.ok, true);
});

test('calcolo senza progetti: solo il suo hash conta', () => {
  const rec = calcRecord({ ...calcRow(PRESETS.C), shaftDesign: null, liftDesign: null });
  assert.equal(rec?.ok, true);
  assert.equal(rec?.design, null);
  assert.equal(rec?.lift, null);
});

test('norme del collaudo: quelle scelte col calcolo, altrimenti quelle del contesto', () => {
  const V = PRESETS.C;
  assert.deepEqual(storedCollaudo(V, null), { norma: '10411-1', parti: ['machine'] });
  assert.deepEqual(storedCollaudo(V, { norma: '10411-11', parti: ['machine', 'ropes'] }), { norma: '10411-11', parti: ['machine', 'ropes'] });
  assert.deepEqual(storedCollaudo(V, { norma: 'bogus' }), { norma: '10411-1', parti: ['machine'] }, 'scelta illeggibile: il predefinito');
  // the drawing set of a calculation without a lift design sets out the standards chosen with it, as its report
  const rec = calcRecord({ ...calcRow(V), shaftDesign: null, liftDesign: null });
  assert.ok(rec);
  assert.deepEqual(recordMarks(rec, { norma: '10411-11', parti: ['machine'] }).collaudo, { norma: '10411-11', parti: ['machine'] });
  // a lift design's own standards win
  const lift = calcRecord(liftRows());
  assert.ok(lift?.lift);
  assert.deepEqual(recordMarks(lift, { norma: '10411-11', parti: ['machine'] }).collaudo, lift.lift.dv.collaudo);
});

test('da aggiornare: le versioni del record e di ciò di cui è fatto, come le riproduce il software', () => {
  const now = { engineVersion: ENGINE_VERSION }, old = { engineVersion: '0.0.1' };
  const shaft = { engineVersion: SHAFT_ENGINE_VERSION }, lift = { engineVersion: LIFT_ENGINE_VERSION };
  assert.equal(outdated.calc(now), false);
  assert.equal(outdated.calc(old), true);
  assert.equal(outdated.calc({ ...now, shaftDesign: old, liftDesign: null }), true, 'the shaft design it was made from');
  assert.equal(outdated.calc({ ...now, shaftDesign: shaft, liftDesign: old }), true, 'the lift design it belongs to');
  assert.equal(outdated.calc({ ...now, shaftDesign: shaft, liftDesign: lift }), false);
  assert.equal(outdated.lift({ ...lift, calculation: now, shaftDesign: shaft }), false);
  assert.equal(outdated.lift({ ...lift, calculation: old, shaftDesign: shaft }), true);
  assert.equal(outdated.lift({ ...lift, calculation: now, shaftDesign: old }), true);
  assert.equal(outdated.room({ engineVersion: ROOM_ENGINE_VERSION, calculation: now }), false);
  assert.equal(outdated.room({ engineVersion: ROOM_ENGINE_VERSION, calculation: old }), true, 'the calculation it is surveyed on');
  // what the version says is what the hash says: a lift design of another version is not reproduced
  assert.equal(calcRecord(liftRows('0.0.0'))?.ok, false);
  assert.equal(calcRecord(liftRows())?.ok, true);
});
