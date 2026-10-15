// Round 46, S5 (B6 + B7): the speed regulation of the existing controller under a new machine (UNI 10411-1:2024
// 11.2.1, UNI 10411-11:2024 11.2 — owner's decision Q1: a controller of one or two speeds is refused, «Passa ad
// Ammodernamento con il quadro»; a record saved before only gets a ⚠ in the relazione) and the optional parts of a
// modernisation (owner's decision Q3: «No» unless answered; the scope, the obligations, the room survey), without
// moving what the records before them print.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { PARTI, PARTI_FACOLTATIVE, PARTI_RIFACIMENTO, ambitoOf, collaudoOf, disegnoDi, interventoDi, interventoValido, rifacimentoTo, type Collaudo,
  type Parte } from '@/lib/lift';
import { obblighiParti } from '@/lib/lift/obblighi';
import { collaudoReadSchema, collaudoSchema } from '@/lib/lift-input';
import { calcUncounted } from '@/lib/prices/bom';
import { collaudoRows, partiText } from '@/lib/report/collaudo';
import { regolazioneRows } from '@/lib/report/variazioni';

const REPL: FormValues = { context: 'repl', keepRopes: true, compare: true };
const C = (parti: readonly Parte[], x: Partial<Collaudo> = {}): Collaudo => ({ norma: '10411-1', parti, ...x });

test('B6 interventoValido: una macchina nuova sul quadro a una o due velocità si rifiuta (inverter), con il quadro nuovo no', () => {
  assert.deepEqual(interventoValido('SOLO_ARGANO', REPL, C(['machine'], { regolazione: '1v' })), ['inverter']);
  assert.deepEqual(interventoValido('SOLO_ARGANO', REPL, C(['machine', 'ropes'], { regolazione: '2v', norma: '10411-11' })), ['inverter']);
  assert.deepEqual(interventoValido('SOLO_ARGANO', REPL, C(['machine'], { regolazione: 'vvvf' })), []);
  assert.deepEqual(interventoValido('AMMODERNAMENTO', REPL, C(['machine', 'car'], { regolazione: '1v' })), ['inverter']);
  assert.deepEqual(interventoValido('AMMODERNAMENTO', REPL, C(['machine', 'controller'], { regolazione: '1v' })), [], 'the controller replaced');
  assert.deepEqual(interventoValido('AMMODERNAMENTO', { ...REPL, compare: false }, C(['controller', 'car'], { regolazione: '1v' })), [], 'the machine kept');
  // not answered: the form asks it, the save never refuses it (a record saved before still updates)
  assert.deepEqual(interventoValido('SOLO_ARGANO', REPL, C(['machine'])), []);
  assert.deepEqual(interventoValido('TRASFORMAZIONE_COMPLETA', { ...REPL, context: 'new' }, { norma: 'en81', parti: PARTI, regolazione: '1v' }), []);
});

test('B7 interventoValido: le porte scorrevoli solo con le porte di cabina; un «Solo argano» non ha altre parti', () => {
  assert.deepEqual(interventoValido('AMMODERNAMENTO', REPL, C(['machine', 'slidingDoors'])), ['porte']);
  assert.deepEqual(interventoValido('AMMODERNAMENTO', REPL, C(['machine', 'carDoors', 'slidingDoors'])), []);
  assert.deepEqual(interventoValido('AMMODERNAMENTO', REPL, C(['machine', 'alarm'])), [], 'an optional part makes it a modernisation');
  assert.deepEqual(interventoValido('SOLO_ARGANO', REPL, C(['machine', 'safetyGear'])), ['parti']);
});

test('B7: le parti di prima si leggono come prima — tipo, disegno, schema di lettura', () => {
  // the old matrix: the types of the records without one are the same
  assert.equal(interventoDi('repl', C(['machine', 'ropes', 'load'])), 'SOLO_ARGANO');
  assert.equal(interventoDi('repl', C(['machine', 'controller'])), 'AMMODERNAMENTO');
  assert.equal(interventoDi('new', null), 'TRASFORMAZIONE_COMPLETA');
  // the survey of the machine room with the room, its alarm and the UCM; the safety gear needs the shaft
  const top = { ...REPL, layout: 'topDefl' };
  assert.equal(disegnoDi('AMMODERNAMENTO', C(['machine', 'controller', 'room', 'alarm', 'ucm']), top), 'locale');
  assert.equal(disegnoDi('AMMODERNAMENTO', C(['machine', 'safetyGear']), top), 'vano');
  // the stored arrays before round 46 and the new parts
  for (const s of [collaudoSchema, collaudoReadSchema]) {
    assert.ok(s.safeParse(C(['machine', 'ropes', 'controller'])).success);
    assert.ok(s.safeParse(C([...PARTI_FACOLTATIVE, 'machine'])).success);
    assert.ok(s.safeParse(C(['machine'], { regolazione: '2v' })).success);
  }
});

test('B7: il rifacimento non risponde le altre parti, le lascia come sono', () => {
  const on = rifacimentoTo(true, C(['machine', 'alarm']));
  assert.ok(PARTI_RIFACIMENTO.every((p) => on.collaudo.parti.includes(p)));
  assert.deepEqual(on.collaudo.parti.filter((p) => PARTI_FACOLTATIVE.includes(p)), ['alarm']);
  assert.deepEqual(rifacimentoTo(true, C(['machine'])).collaudo.parti.filter((p) => PARTI_FACOLTATIVE.includes(p)), []);
  assert.deepEqual(rifacimentoTo(false, on.collaudo).collaudo.parti, ['machine', 'alarm']);
});

test('B7 ambito: il paracadute, il locale, le porte scorrevoli; lo spazio libero in testata resta della EN 81-20 (Q5)', () => {
  const sg = C(['safetyGear']);
  for (const id of ['sg_type', 'sg_cw', 'gr_stress', 'gr_flange', 'gr_defl', 'gr_cw'] as const) assert.equal(ambitoOf(sg, id), 'applies', id);
  for (const id of ['tr_load', 'b_car', 'h_refuge'] as const) assert.equal(ambitoOf(sg, id), 'existing', id);
  const sl = C(['slidingDoors']);
  for (const id of ['v_area', 'h_refuge', 'p_apron'] as const) assert.equal(ambitoOf(sl, id), 'applies', id);
  assert.equal(ambitoOf(sl, 'h_clear'), 'existing', 'owner’s decision Q5: no answer softens or brings h_clear');
  // the ACOP/UCM and the alarm: obligations only
  for (const p of ['ucm', 'alarm'] as const) for (const id of ['tr_load', 'm_height', 'h_refuge', 'b_car'] as const) assert.equal(ambitoOf(C([p]), id), 'existing', `${p} ${id}`);
  // tested as new: every check, as before
  assert.equal(ambitoOf(collaudoOf({ context: 'new' }), 'm_height'), 'applies');
});

test('B6 + B7 obblighi: le altre parti con le loro clausole, la regolazione che resta, lo spazio sopra le porte scorrevoli', () => {
  const rif = (c: Collaudo, V?: FormValues): string[] => obblighiParti(c, V).map((p) => p.rif);
  assert.deepEqual(rif(C(['machine', 'safetyGear', 'ucm', 'alarm', 'room'])), ['UNI 10411-1:2024, 6.6, 6.7, 15.3 e 15.6', 'UNI 10411-1:2024, 6.12, 15.4 e 14.4 c)–d)',
    'UNI 10411-1:2024, 23', 'UNI 10411-1:2024, 8']);
  assert.equal(obblighiParti(C(['safetyGear'])).at(0)?.stato, 'da_verificare', '-1 6.7 within point 6: uncertain without a change of load');
  assert.deepEqual(rif(C(['room'], { norma: '10411-11' })), ['UNI 10411-11:2024, 8']);
  // the regulation answered VVVF stays (11.2.1 / 11.2); none with the controller replaced, none unanswered
  assert.deepEqual(rif(C(['machine'], { regolazione: 'vvvf' })), ['UNI 10411-1:2024, 11.2.1']);
  assert.deepEqual(rif(C(['machine'], { regolazione: 'vvvf', norma: '10411-11' })), ['UNI 10411-11:2024, 11.2']);
  assert.deepEqual(rif(C(['machine'])), [], 'a record before the question: the obligations as before');
  assert.ok(!rif(C(['machine', 'controller'], { regolazione: 'vvvf' })).includes('UNI 10411-1:2024, 11.2.1'));
  // the car doors made sliding: 0,3 + 0,035·v² at the calculation's speed, as information
  const V = { ...PRESETS.B, ...REPL, v: '1' };
  const sl = obblighiParti(C(['carDoors', 'slidingDoors']), V).find((p) => p.rif === 'UNI 10411-1:2024, 13.1.1–13.2.4');
  assert.ok(sl?.testo.includes('0,3 + 0,035·v² m') && sl.testo.includes('con v = 1,00 m/s lo spazio è 0,335 m'), sl?.testo);
});

test('B6 relazione: ⚠ solo senza risposta su una modifica che tiene il quadro sotto la macchina nuova', () => {
  const rows = (c: Collaudo): [string, string][] => regolazioneRows(c);
  assert.match(rows(C(['machine']))[0]?.[1] ?? '', /^⚠ Non indicata: .*UNI 10411-1:2024, 11\.2\.1/);
  assert.match(rows(C(['machine'], { norma: '10411-11' }))[0]?.[1] ?? '', /UNI 10411-11:2024, 11\.2\)/);
  assert.ok(!rows(C(['machine'], { regolazione: 'vvvf' }))[0]?.[1].includes('⚠'));
  assert.deepEqual(rows(C(['machine', 'controller'])), [], 'the controller replaced');
  assert.deepEqual(rows(C(['controller'])), [], 'the machine kept');
  assert.deepEqual(rows({ norma: 'en81', parti: PARTI }), [], 'tested as new');
  // in the data of the installation, after the other rows of the test
  assert.equal(collaudoRows(C(['machine']), true).at(-1)?.[0], 'Regolazione della velocità del quadro esistente');
  assert.ok(!collaudoRows(C(['machine']), false).some(([k]) => k.startsWith('Regolazione')), 'a new lift: none');
});

test('B7: un impianto nuovo dice le sue parti come prima; le altre parti hanno il loro nome', () => {
  const en81 = collaudoOf({ context: 'new' });
  assert.deepEqual(en81.parti.slice(-5), PARTI_FACOLTATIVE, 'the longer PARTI of a transformation');
  assert.deepEqual(calcUncounted(en81).parts, ['car', 'sling', 'cw', 'rails', 'landingDoors', 'carDoors', 'buffers', 'governor'], 'the cost’s words as before');
  assert.deepEqual(calcUncounted(C(['machine', 'safetyGear', 'alarm'])).parts, ['safetyGear', 'alarm']);
  assert.equal(partiText(en81), 'tutte: l’impianto si collauda come nuovo');
  assert.equal(partiText(C(['machine', 'ucm', 'slidingDoors'])), 'macchina (argano), protezioni ACOP e UCM, porte di cabina: da battente a scorrevoli');
});
