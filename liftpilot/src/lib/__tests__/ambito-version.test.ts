// The scope key (round 46, B1): which parts each check concerns, the parts that bring a check under UNI 10411-1 only,
// the parts' obligations and the constants of a modification reach the relazione di calcolo, the verdicts of the lift
// designs and of the machine rooms, sheet 1 and the relazione tecnica — while a calculation is checked by its engine
// version only and its test is outside its hash (server/records.ts). A change of the scope without a bump of the versions
// would silently change what a record prints: its SHA-256 is pinned here with the versions it was taken at, and the test
// fails when it changes while ENGINE, LIFT or ROOM are still the pinned ones. After an intended change: bump the
// versions (semver minor), then pin the new key and versions here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ENGINE_VERSION, canon } from '@/calc/snapshot';
import { AMBITO_10411_1, AMBITO_VERIFICHE, PARTI, SOLO_10411_1, VERIFICHE_DATI } from '../lift/collaudo';
import { KL } from '../lift/norme';
import { OBBLIGHI_PARTI } from '../lift/obblighi';
import { OBBLIGHI_VARIAZIONI } from '../lift/obblighi-variazioni';
import { OBBLIGHI_REGOLAZIONE } from '../lift/obblighi-facoltative';
import { LIFT_ENGINE_VERSION } from '../lift/version';
import { ROOM_ENGINE_VERSION } from '../room/snapshot';
import { SHAFT_ENGINE_VERSION } from '@/shaft/snapshot';

/** The key and the versions it was pinned at (round 46; S5 — the optional parts and the controller's regulation — pinned
 *  again within the same kit: S4–S8 ship together with the one bump, never deployed apart). */
const PINNED = { sha256: '91ed6b0220d3f6c234c0cb0b5f2a876e7ef041b243df6aaa4ab697b9795ae53c', engine: '1.7.0', lift: '1.32.0', room: '1.16.0', shaft: '2.26.0' };

/** The constants of a modification: the loads (6.1), the CE marking's day, the speed and the travel (15, 16). */
const KL_MODIFICA = {
  loadSplitQ: KL.loadSplitQ, loadIncQ: KL.loadIncQ, loadIncT: KL.loadIncT, loadIncTcp: KL.loadIncTcp, loadStruct11: KL.loadStruct11, ceFrom: KL.ceFrom,
  speedInc1: KL.speedInc1, speedDec1: KL.speedDec1, ucmSpeed11: KL.ucmSpeed11, travelInc1: KL.travelInc1,
  // round 46 S5: the car doors made sliding (13.1.3 b), printed as information)
  slidingClear: KL.slidingClear, slidingClearV2: KL.slidingClearV2,
};

const scopeKey = (): string => createHash('sha256').update(JSON.stringify(canon({
  PARTI, AMBITO_VERIFICHE, AMBITO_10411_1, SOLO_10411_1, VERIFICHE_DATI, OBBLIGHI_PARTI, OBBLIGHI_VARIAZIONI, OBBLIGHI_REGOLAZIONE, KL_MODIFICA,
}))).digest('hex');

test('ambito-version: il perimetro del collaudo non cambia senza le versioni dei motori', () => {
  const sha = scopeKey();
  if (sha === PINNED.sha256) return;
  const still = [ENGINE_VERSION === PINNED.engine ? 'ENGINE' : '', LIFT_ENGINE_VERSION === PINNED.lift ? 'LIFT' : '', ROOM_ENGINE_VERSION === PINNED.room ? 'ROOM' : ''].filter(Boolean);
  assert.deepEqual(still, [], `perimetro cambiato (${sha}) con le versioni ancora fissate: alzare ${still.join(', ')}, poi fissare la nuova chiave`);
});

test('ambito-version: le versioni fissate con la chiave sono quelle del kit (round 46)', () => {
  // the key is taken with the versions in force: a pin left behind after a bump names the old ones
  assert.equal(SHAFT_ENGINE_VERSION, PINNED.shaft);
  assert.deepEqual([ENGINE_VERSION, LIFT_ENGINE_VERSION, ROOM_ENGINE_VERSION], [PINNED.engine, PINNED.lift, PINNED.room]);
});
