// The line that names a saved machine room (src/lib/room/summary.ts, round 37): stored as data and written in the
// reader's language — no Italian words in the English and Bulgarian ones —; a record saved before round 37 (an Italian
// sentence) read again from its survey and its results, the HEB profile the software took from the sentence; the support
// named as sheet 1 names it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { PROFILE_NAMES } from '@/shaft/profiles';
import it from '../../../messages/it.json';
import en from '../../../messages/en.json';
import bg from '../../../messages/bg.json';
import { makeFmt } from '../present/tr';
import { deriveRoom } from '../room/derive';
import { roomSnapshot } from '../room/snapshot';
import { startSurvey, type Survey } from '../room/survey';
import { encodeRoomSummary, readRoomSummary, roomSummaryOf, roomSummaryText, type RoomSummary } from '../room/summary';
import { supportName } from '../tavole/survey-data';

const MESSAGES = { it, en, bg } as const;
type Lang = keyof typeof MESSAGES;

/** The messages of a namespace with their placeholders filled (they hold no other ICU syntax). */
const tr = (ns: Readonly<Record<string, string>>) => (key: string, values: Readonly<Record<string, string>> = {}): string => {
  const m = ns[key];
  assert.equal(typeof m, 'string', `message ${key}`);
  return String(m).replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`);
};
const INTL: Readonly<Record<Lang, string>> = { it: 'it-IT', en: 'en-GB', bg: 'bg-BG' };
const line = (l: Lang, s: RoomSummary): string => {
  const fmt = makeFmt(INTL[l]);
  return roomSummaryText(s, tr(MESSAGES[l].room), tr(MESSAGES[l].shaft), (x) => fmt(x, 0));
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

const ITALIAN = /\b(Locale|su|calate|argano|spessori|livellamento|telaio|putrelle|muri|vano|rinvio)\b/;

test('riepilogo del locale salvato: dati, scritti nella lingua di chi legge', () => {
  for (const [name, V, s] of CASES) {
    const d = deriveRoom(V, s), sum = roomSummaryOf(d, s.room);
    assert.deepEqual(readRoomSummary({ summary: encodeRoomSummary(sum), inputs: null, results: null }), sum, name);
    const [iT, eN, bG] = (['it', 'en', 'bg'] as const).map((l) => line(l, sum));
    assert.ok(iT.startsWith(`Locale ${sum.W} × ${sum.D} mm · `) && iT.endsWith(` · calate ${sum.calata} mm`), `${name}: ${iT}`);
    assert.ok(eN.startsWith('Room ') && !ITALIAN.test(eN), `${name}: ${eN}`);
    assert.ok(bG.startsWith('Помещение ') && !ITALIAN.test(bG) && !/\{\w+\}/.test(bG), `${name}: ${bG}`);
    // the support as sheet 1 names it: its profile, the maker's bedplate, the HEB beams the software took
    if (sum.support.profile) assert.ok(supportName(d).includes(sum.support.profile) && eN.includes(sum.support.profile), name);
    if (sum.support.maker) assert.ok(supportName(d).includes(sum.support.maker) && eN.includes(sum.support.maker), name);
    if (sum.heb) assert.ok(supportName(d).includes(`SU DUE ${sum.heb}`) && eN.includes(`on two ${sum.heb}`) && bG.includes(`върху две ${sum.heb}`), name);
  }
  // the cases cover the HEB beams and a frame's profile
  const sums = CASES.map(([, V, s]) => roomSummaryOf(deriveRoom(V, s), s.room));
  assert.ok(sums.some((x) => x.heb !== null) && sums.some((x) => x.support.kind === 'frame' && x.support.profile === frame));
});

test('riepilogo di un locale salvato prima del round 37: riletto dal rilievo e dai risultati, la HEB dalla frase', () => {
  for (const [name, V, s] of CASES) {
    const d = deriveRoom(V, s), snap = roomSnapshot(s, '0'.repeat(64), d);
    const old = { summary: legacySentence(s, V), inputs: snap.inputs, results: snap.results };
    assert.deepEqual(readRoomSummary(old), roomSummaryOf(d, s.room), name);
    assert.equal(ITALIAN.test(line('en', readRoomSummary(old) ?? roomSummaryOf(d, s.room))), false, name);
  }
  // what cannot be read is shown as it was stored
  assert.equal(readRoomSummary({ summary: 'Locale 3000 × 3000', inputs: {}, results: {} }), null);
  assert.equal(readRoomSummary({ summary: '{non json', inputs: null, results: null }), null);
  assert.equal(readRoomSummary({ summary: JSON.stringify({ v: 2 }), inputs: null, results: null }), null);
});
