// The line that names a saved machine room (src/lib/room/summary.ts, round 37): stored as data and written when it is
// shown (in Italian, the only language); a record saved before round 37 (an Italian sentence) read again from its survey
// and its results, the HEB profile the software took from the sentence; the support named as sheet 1 names it, the
// existing support kept too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { PROFILE_NAMES } from '@/shaft/profiles';
import it from '../../../messages/it.json';
import { makeFmt } from '../present/tr';
import { deriveRoom } from '../room/derive';
import { roomSnapshot } from '../room/snapshot';
import { startSurvey, type Survey } from '../room/survey';
import { encodeRoomSummary, readRoomSummary, roomSummaryOf, roomSummaryText, type RoomSummary } from '../room/summary';
import { supportName } from '../tavole/survey-data';


/** The messages of a namespace with their placeholders filled (they hold no other ICU syntax). */
const tr = (ns: Readonly<Record<string, string>>) => (key: string, values: Readonly<Record<string, string>> = {}): string => {
  const m = ns[key];
  assert.equal(typeof m, 'string', `message ${key}`);
  return String(m).replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`);
};
const line = (s: RoomSummary): string => {
  const fmt = makeFmt('it-IT');
  return roomSummaryText(s, tr(it.room), tr(it.shaft), (x) => fmt(x, 0));
};

const DIRECT: FormValues = { ...PRESETS.C };
const DEFLECTED: FormValues = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 };
const frame = PROFILE_NAMES[0];
const CASES: readonly (readonly [string, FormValues, Survey])[] = [
  ['tiro diretto, spessori', DIRECT, startSurvey(600)],
  ['rinvio sul telaio, putrelle HEB del software', DEFLECTED, ((s) => ({ ...s, room: { ...s.room, heb: {} } }))(startSurvey(780))],
  ['telaio di profilati', DIRECT, ((s) => ({ ...s, room: { ...s.room, support: { kind: 'frame' as const, profile: frame } } }))(startSurvey(600))],
];

/** The sentence a record saved before round 37 holds (the save wrote it in Italian). */
function legacySentence(s: Survey, V: FormValues): string {
  const d = deriveRoom(V, s), fmt = makeFmt('it-IT'), R = s.room;
  const machine = d.made ? `${d.made.brand} ${d.made.model}` : 'argano';
  return `Locale ${fmt(R.W, 0)} × ${fmt(R.D, 0)} · ${machine} su ${supportName(d).toLowerCase()} · calate ${fmt(Math.round(d.calata.calc), 0)} mm`;
}

test('riepilogo del locale salvato: dati, scritti quando si mostrano', () => {
  for (const [name, V, s] of CASES) {
    const d = deriveRoom(V, s), sum = roomSummaryOf(d, s);
    assert.deepEqual(readRoomSummary({ summary: encodeRoomSummary(sum), inputs: null, results: null }), sum, name);
    const iT = line(sum);
    assert.ok(iT.startsWith(`Locale ${sum.W} × ${sum.D} mm · `) && iT.endsWith(` · calate ${sum.calata} mm`) && !/\{\w+\}/.test(iT), `${name}: ${iT}`);
    // the support as sheet 1 names it: its profile, the maker's bedplate, the HEB beams the software took
    if (sum.support.profile) assert.ok(supportName(d).includes(sum.support.profile) && iT.includes(sum.support.profile), name);
    if (sum.support.maker) assert.ok(supportName(d).includes(sum.support.maker) && iT.includes(sum.support.maker), name);
    if (sum.heb) assert.ok(supportName(d).includes(`SU DUE ${sum.heb}`) && iT.includes(sum.heb), name);
  }
  // the cases cover the HEB beams and a frame's profile
  const sums = CASES.map(([, V, s]) => roomSummaryOf(deriveRoom(V, s), s));
  assert.ok(sums.some((x) => x.heb !== null) && sums.some((x) => x.support.kind === 'frame' && x.support.profile === frame));
});

test('riepilogo di un locale salvato prima del round 37: riletto dal rilievo e dai risultati, la HEB dalla frase', () => {
  for (const [name, V, s] of CASES) {
    const d = deriveRoom(V, s), snap = roomSnapshot(s, '0'.repeat(64), d);
    const old = { summary: legacySentence(s, V), inputs: snap.inputs, results: snap.results };
    assert.deepEqual(readRoomSummary(old), roomSummaryOf(d, s), name);
    assert.equal(line(readRoomSummary(old) ?? roomSummaryOf(d, s)), line(roomSummaryOf(d, s)), name);
  }
  // what cannot be read is shown as it was stored
  assert.equal(readRoomSummary({ summary: 'Locale 3000 × 3000', inputs: {}, results: {} }), null);
  assert.equal(readRoomSummary({ summary: '{non json', inputs: null, results: null }), null);
  assert.equal(readRoomSummary({ summary: JSON.stringify({ v: 2 }), inputs: null, results: null }), null);
});

test('riepilogo con il basamento esistente che resta: lo nomina come il foglio 1, da rilevare (round 37)', () => {
  const kept = (s: Survey, kind: 'frame' | 'plinth'): Survey => ({ ...s, existingSupport: { kind, keep: true } });
  const bedV = DEFLECTED, bedS = kept(startSurvey(780), 'plinth');
  const s = kept(startSurvey(600), 'frame'), d = deriveRoom(DIRECT, s), sum = roomSummaryOf(d, s);
  assert.equal(sum.kept, 'frame');
  assert.equal(supportName(d), 'ESISTENTE, DA RILEVARE');
  assert.equal(line(sum), `Locale ${sum.W} × ${sum.D} mm · argano su basamento esistente riusato (telaio di profilati, da rilevare) · calate ${sum.calata} mm`);
  assert.ok(!line(sum).includes('spessori'), 'nessun basamento nuovo');
  // our bedplate with the pulley on it: «… SU ESISTENTE» on sheet 1
  const dB = deriveRoom(bedV, bedS), sB = roomSummaryOf(dB, bedS);
  assert.ok(supportName(dB).endsWith(' SU ESISTENTE') && sB.support.own, supportName(dB));
  assert.ok(line(sB).includes('su telaio con rinvio (su misura) sul basamento esistente riusato (plinto in calcestruzzo, da rilevare)'), line(sB));
  // stored and read again; a record of round 37 saved without the field and one saved before it: from the survey
  assert.deepEqual(readRoomSummary({ summary: encodeRoomSummary(sum), inputs: null, results: null }), sum);
  const { kept: _k, ...without } = sum;
  void _k;
  const snap = roomSnapshot(s, '0'.repeat(64), d);
  assert.deepEqual(readRoomSummary({ summary: encodeRoomSummary(without as RoomSummary), inputs: snap.inputs, results: snap.results }), sum);
  assert.equal(readRoomSummary({ summary: encodeRoomSummary(without as RoomSummary), inputs: null, results: null })?.kept, null);
  assert.deepEqual(readRoomSummary({ summary: legacySentence(s, DIRECT), inputs: snap.inputs, results: snap.results }), sum);
  // removed, not kept: the new support as before
  const gone: Survey = { ...s, existingSupport: { kind: 'frame', keep: false } }, sG = roomSummaryOf(deriveRoom(DIRECT, gone), gone);
  assert.equal(sG.kept, null);
  assert.equal(line(sG), `Locale ${sG.W} × ${sG.D} mm · argano su spessori di livellamento · calate ${sG.calata} mm`);
});
