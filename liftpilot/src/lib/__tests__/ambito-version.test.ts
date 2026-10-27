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
import { CATENE_COMP, FUNI_COMP } from '../rt2/cataloghi/funi';
import { KR2 } from '../rt2/norme';
import { sostituite } from '../lift/sostituite';

/** The key and the versions it was pinned at (round 46; S5 — the optional parts and the controller's regulation —, S7
 *  — D.1 —, the review — the groups of parts and the roundings in the key, the obligations' words —, its recheck — the
 *  car sill's apron with new landing doors under -1 — and the final check — the load answered «Sì» with the documented
 *  loads unchanged, loadDocumentati, then its -11 wording — pinned again within the same kit: S4–S8, the review, the recheck and the final
 *  check ship together with the one bump, never deployed apart). Round 47 (owner's decision D1): the speed and the travel
 *  answered «Sì» against the documents and a new car on unchanged documented loads (speedDocumentati, travelDocumentati,
 *  loadCabinaNuova) — pinned again at the same versions: the kit is still not deployed, round 47 ships with it; its review
 *  (the new car with the sling replaced too, loadCabinaArcata, and the shared words of the car's mass) — the same; its
 *  recheck (the speed «not changed» said as the two limits of 15.1 and 15.16, speedWithin50 with the speed after 50 Hz
 *  alone) — the same. Round 48: D.2 beside D.1 (tr_d2 in the scope and among the checks of UNI 10411-1 only), with the
 *  four versions bumped (ENGINE 1.8.0, LIFT 1.33.0, ROOM 1.17.0, SHAFT 2.27.0). Round 52: the ropes of a modification
 *  under UNI 10411-1 as the owner's rope sheet checks them (fm_* in the scope, among the checks of UNI 10411-1 only, the
 *  sheet's numbers KR2 and compensation lists, S_f not counted where z stands in for it), with the four versions bumped
 *  (ENGINE 1.9.0, LIFT 1.34.0, ROOM 1.18.0, SHAFT 2.28.0). */
const PINNED = { sha256: '7053da1c5107c0f7e62e142b47a8b174a00f493db5315dd06852359c49e83e0c', engine: '1.9.0', lift: '1.34.0', room: '1.18.0', shaft: '2.28.0' };

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

/** The rope sheet's numbers and compensation lists the checks fm_* take (round 52, lift/funi-modello.ts), and which of
 *  the calculation's checks one of them stands in for (lift/sostituite.ts). */
const FOGLIO_FUNI = { KR2, FUNI_COMP, CATENE_COMP, sostituisce: sostituite([{ id: 'fm_z' }, { id: 'fm_d1' }, { id: 'fm_d2' }, { id: 'fm_comp' }]) };

const scopeKey = (): string => createHash('sha256').update(JSON.stringify(canon({
  PARTI, AMBITO_VERIFICHE, AMBITO_10411_1, SOLO_10411_1, VERIFICHE_DATI, OBBLIGHI_PARTI, OBBLIGHI_VARIAZIONI, OBBLIGHI_REGOLAZIONE, KL_MODIFICA, GRUPPI,
  FOGLIO_FUNI,
}))).digest('hex');

test('ambito-version: il perimetro del collaudo non cambia senza le versioni dei motori', () => {
  const sha = scopeKey();
  if (sha === PINNED.sha256) return;
  const still = [ENGINE_VERSION === PINNED.engine ? 'ENGINE' : '', LIFT_ENGINE_VERSION === PINNED.lift ? 'LIFT' : '', ROOM_ENGINE_VERSION === PINNED.room ? 'ROOM' : ''].filter(Boolean);
  assert.deepEqual(still, [], `perimetro cambiato (${sha}) con le versioni ancora fissate: alzare ${still.join(', ')}, poi fissare la nuova chiave`);
});

test('ambito-version: le versioni fissate con la chiave sono quelle del kit (round 52)', () => {
  // the key is taken with the versions in force: a pin left behind after a bump names the old ones
  assert.equal(SHAFT_ENGINE_VERSION, PINNED.shaft);
  assert.deepEqual([ENGINE_VERSION, LIFT_ENGINE_VERSION, ROOM_ENGINE_VERSION], [PINNED.engine, PINNED.lift, PINNED.room]);
});
