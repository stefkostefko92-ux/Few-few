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
import { K } from '@/calc/norme';
import { ENGINE_VERSION, canon } from '@/calc/snapshot';
import { AMBITO_10411_1, AMBITO_VERIFICHE, AUTO_PARTI, PARTI, SOLO_10411_1, VERIFICHE_DATI } from '../lift/collaudo';
import { PARTI_FACOLTATIVE, PARTI_LOCALE, PARTI_RIFACIMENTO, PARTI_SOLO, VARIAZIONI } from '../lift/intervento';
import { ROUNDING_H, ROUNDING_KG, ROUNDING_V } from '../lift/modifica';
import { KL } from '../lift/norme';
import { OBBLIGHI_PARTI, SOSTANZIALE } from '../lift/obblighi';
import { OBBLIGHI_VARIAZIONI } from '../lift/obblighi-variazioni';
import { OBBLIGHI_REGOLAZIONE } from '../lift/obblighi-facoltative';
import { LIFT_ENGINE_VERSION } from '../lift/version';
import { ROOM_ENGINE_VERSION } from '../room/snapshot';
import { SHAFT_ENGINE_VERSION } from '@/shaft/snapshot';

/** The key and the versions it was pinned at (round 46; S5 — the optional parts and the controller's regulation —, S7
 *  — D.1 — and the review — the groups of parts and the roundings in the key, the obligations' words — pinned again
 *  within the same kit: S4–S8 and the review ship together with the one bump, never deployed apart). */
const PINNED = { sha256: '6df66bb6e33eb57666dec56571cb1a78e95c0c158e5ba97e568529caf8c658a0', engine: '1.7.0', lift: '1.32.0', room: '1.16.0', shaft: '2.26.0' };

/** The constants of a modification: the loads (6.1), the CE marking's day, the speed and the travel (15, 16). */
const KL_MODIFICA = {
  loadSplitQ: KL.loadSplitQ, loadIncQ: KL.loadIncQ, loadIncT: KL.loadIncT, loadIncTcp: KL.loadIncTcp, loadStruct11: KL.loadStruct11, ceFrom: KL.ceFrom,
  speedInc1: KL.speedInc1, speedDec1: KL.speedDec1, ucmSpeed11: KL.ucmSpeed11, travelInc1: KL.travelInc1,
  // round 46 S5: the car doors made sliding (13.1.3 b), printed as information)
  slidingClear: KL.slidingClear, slidingClearV2: KL.slidingClearV2,
  // round 46 S7: D.1 with the ratio of the loads changed (6.1) — the calculation's constants, out of its golden results
  c1Bands: K.c1Bands, c1Min: K.c1Min, c2Wedge: K.c2Wedge, c2Undercut: K.c2Undercut, muD1: K.muD1,
};

/** The groups of parts and the roundings that decide which parts a record's test gets, and so its printed verdicts and
 *  obligations (round 46 review): the rule's parts, the optional ones, those of the machine room's survey, of a «Solo
 *  argano», of the renovation, the changes, the substantial modification; the documents' roundings of loads, speed and
 *  travel. */
const GRUPPI = { AUTO_PARTI, PARTI_FACOLTATIVE, PARTI_LOCALE, PARTI_SOLO, PARTI_RIFACIMENTO, VARIAZIONI, SOSTANZIALE, ROUNDING_KG, ROUNDING_V, ROUNDING_H };

const scopeKey = (): string => createHash('sha256').update(JSON.stringify(canon({
  PARTI, AMBITO_VERIFICHE, AMBITO_10411_1, SOLO_10411_1, VERIFICHE_DATI, OBBLIGHI_PARTI, OBBLIGHI_VARIAZIONI, OBBLIGHI_REGOLAZIONE, KL_MODIFICA, GRUPPI,
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
