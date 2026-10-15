// The parts answered in «Calcolo argano» (round 45, owner's decision Q1): every part of a modernisation answered
// explicitly but the machine, «Sì» on entry; a «Solo argano» asks only about the ropes; the rule's answers (new ropes,
// a load the documented loads changed, the sling a renovation keeps) are shown, not asked; the renovation answers its
// parts at once; a saved calculation's normalised test read back as chosen. And the list of what is missing: the type
// first, then the parts, then the fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { readInputs } from '@/calc/inputs';
import type { FormValues } from '@/calc/types';
import { shown } from '@/components/calc/fields';
import { blankCalc, calcMissing, parteId, plantReady } from '@/lib/calc-blank';
import { calcDraftSchema } from '@/lib/draft-input';
import { PARTI, PARTI_FACOLTATIVE, PARTI_RIFACIMENTO, collaudoOf, type Collaudo } from '@/lib/lift';
import { bloccata, chiediRegolazione, daIndicare, effettiva, facoltativeDi, partiDi, rispondi, risposteDopo, risposteIniziali, risposteRifacimento,
  sceltaSalvata } from '@/lib/lift/risposte';

const REPL: FormValues = { ...PRESETS.B, context: 'repl', keepRopes: true };
const C = (parti: Collaudo['parti'], x: Partial<Collaudo> = {}): Collaudo => ({ norma: '10411-1', parti, ...x });
/** The parts a modernisation asks one by one: every part but the optional ones (round 46, owner's decision Q3). */
const ASKED = PARTI.filter((p) => !PARTI_FACOLTATIVE.includes(p));

test('le parti da indicare: per «Solo argano» le funi, per l’ammodernamento tutte, nessuna per la trasformazione', () => {
  assert.deepEqual(partiDi('SOLO_ARGANO'), ['machine', 'ropes']);
  assert.deepEqual(partiDi('AMMODERNAMENTO'), ASKED);
  assert.deepEqual(partiDi('TRASFORMAZIONE_COMPLETA'), []);
  assert.deepEqual(partiDi(null), []);
  const solo = C(['machine']);
  assert.deepEqual(daIndicare('SOLO_ARGANO', solo, collaudoOf(REPL, solo), REPL, []), ['ropes'], 'the machine is the calculation’s: never asked');
  assert.deepEqual(daIndicare('SOLO_ARGANO', solo, collaudoOf(REPL, solo), REPL, ['ropes']), []);
  // ropes of their own number and diameter are new: the rule's «Sì»
  const own = { ...REPL, keepRopes: false };
  assert.deepEqual(bloccata('SOLO_ARGANO', solo, collaudoOf(own, solo), own, 'ropes'), { si: true, perche: 'funi' });
  assert.deepEqual(daIndicare('SOLO_ARGANO', solo, collaudoOf(own, solo), own, []), []);
  // a modernisation: every part but the machine answered on entry
  const amm = C(['machine']);
  assert.deepEqual(daIndicare('AMMODERNAMENTO', amm, collaudoOf(REPL, amm), REPL, ['machine']), ASKED.filter((p) => p !== 'machine'));
  assert.deepEqual(daIndicare('TRASFORMAZIONE_COMPLETA', undefined, { norma: 'en81', parti: PARTI }, { ...REPL, context: 'new' }, []), []);
});

test('le risposte della regola: carichi documentati, arcata del rifacimento', () => {
  // the documented loads 10 % under the design's under UNI 10411-1: the load is the rule's «Sì»
  const doc = C(['machine', 'car'], { documentato: { Q: 500, P: 650, Mcw: 900 } }), V = { ...REPL, Q: 630, P: 700, k: 0.5 };
  const value = collaudoOf(V, doc);
  assert.ok(value.parti.includes('load'), 'the load changed');
  assert.deepEqual(bloccata('AMMODERNAMENTO', doc, value, V, 'load'), { si: true, perche: 'carichi' });
  assert.ok(!daIndicare('AMMODERNAMENTO', doc, value, V, ['machine', 'car']).includes('load'));
  const rif = C(PARTI_RIFACIMENTO, { rifacimento: true });
  assert.deepEqual(bloccata('AMMODERNAMENTO', rif, collaudoOf(REPL, rif), REPL, 'sling'), { si: false, perche: 'arcata' });
  assert.equal(bloccata('SOLO_ARGANO', rif, collaudoOf(REPL, rif), REPL, 'sling'), null);
});

test('rispondere, cambiare tipo, il rifacimento', () => {
  assert.deepEqual(rispondi(C(['machine']), 'car', true).parti, ['machine', 'car']);
  assert.deepEqual(rispondi(C(['machine', 'car']), 'machine', false).parti, ['car']);
  assert.deepEqual(rispondi(C(['car']), 'machine', true).parti, ['machine', 'car'], 'in the parts’ order');
  // a «Solo argano»'s ropes answered stay answered in the modernisation, which has the machine answered; and back
  assert.deepEqual(risposteDopo('AMMODERNAMENTO', ['ropes']), ['machine', 'ropes']);
  assert.deepEqual(risposteDopo('SOLO_ARGANO', ['machine', 'ropes', 'car']), ['machine', 'ropes']);
  assert.deepEqual(risposteDopo('TRASFORMAZIONE_COMPLETA', ['machine', 'car']), []);
  // the renovation answers its parts and the sling at once; speed, load and travel as they were
  assert.deepEqual(risposteRifacimento(true, ['machine', 'speed']), [...ASKED.filter((p) => p !== 'speed' && p !== 'load' && p !== 'travel'), 'speed']);
  assert.deepEqual(risposteRifacimento(false, PARTI), ['machine']);
});

test('le risposte iniziali: un calcolo col tipo dichiarato ha tutto risposto, uno di prima solo i suoi «Sì»', () => {
  assert.deepEqual(risposteIniziali('AMMODERNAMENTO', C(['machine', 'car']), true), [...ASKED]);
  assert.deepEqual(risposteIniziali('AMMODERNAMENTO', C(['machine', 'car']), false), ['machine', 'car']);
  assert.deepEqual(risposteIniziali('SOLO_ARGANO', C(['machine']), false), ['machine'], 'the old default «No» of the ropes is asked again');
  assert.deepEqual(risposteIniziali(null, undefined, false), []);
});

test('il test salvato letto come scelto: il carico della regola resta fuori, quello scelto resta', () => {
  const V = { ...REPL, Q: 630, P: 700, k: 0.5 }, doc = { documentato: { Q: 500, P: 650, Mcw: 900 } };
  const stored = collaudoOf(V, C(['machine'], doc));
  assert.deepEqual(stored.parti, ['machine', 'load']);
  assert.deepEqual(sceltaSalvata(V, stored).parti, ['machine'], 'the load the documented loads give: the rule’s');
  // no documented loads: a load among the parts was chosen
  assert.deepEqual(sceltaSalvata(V, C(['machine', 'load'])).parti, ['machine', 'load']);
  assert.deepEqual(sceltaSalvata(V, { norma: 'en81', parti: PARTI }).parti, PARTI);
});

test('cosa manca: prima il tipo, poi le parti, poi i campi; senza tipo nessuna proposta', () => {
  const V = blankCalc();
  assert.equal(V.context, '', 'a new calculation has no context until a type is chosen');
  assert.equal(shown('context', V), false, 'the context is the type’s, never a field');
  const missing = calcMissing(V, readInputs(V).bad, null);
  assert.equal(missing[0], 'intervento');
  assert.equal(plantReady(missing), false);
  const parts = calcMissing(V, readInputs(V).bad, 'AMMODERNAMENTO', ['car', 'sling']);
  assert.deepEqual(parts.slice(0, 2), [parteId('car'), parteId('sling')]);
  assert.ok(!parts.includes('intervento'));
  // a complete example with its type and every part answered: nothing missing
  assert.deepEqual(calcMissing({ ...PRESETS.C }, readInputs({ ...PRESETS.C }).bad, 'SOLO_ARGANO', []), []);
  assert.equal(plantReady(calcMissing({ ...PRESETS.C }, readInputs({ ...PRESETS.C }).bad, 'SOLO_ARGANO', ['ropes'])), false, 'a part to answer holds the proposals');
});

test('la bozza del calcolo: tipo e risposte, e le bozze di prima', () => {
  const V = blankCalc();
  assert.ok(calcDraftSchema.safeParse({ values: V, collaudo: null }).success, 'a draft before round 45');
  const d = { values: V, collaudo: C(['machine']), intervento: 'AMMODERNAMENTO', risposte: ['machine', 'car'] };
  assert.deepEqual(calcDraftSchema.parse(d), d);
  assert.equal(calcDraftSchema.safeParse({ ...d, intervento: 'FULL' }).success, false);
  assert.equal(calcDraftSchema.safeParse({ ...d, risposte: ['arcata'] }).success, false);
  assert.equal(calcDraftSchema.safeParse({ ...d, risposte: [...PARTI, 'machine'] }).success, false, 'at most every part');
});

test('round 46 B7: le altre parti (facoltative) — «No» finché non si risponde, mai tra quelle da indicare, non le dà il rifacimento', () => {
  assert.deepEqual(PARTI.slice(-5), ['safetyGear', 'ucm', 'alarm', 'room', 'slidingDoors'], 'appended: the stored arrays keep their order');
  const amm = C(['machine']);
  assert.ok(PARTI_FACOLTATIVE.every((p) => !daIndicare('AMMODERNAMENTO', amm, collaudoOf(REPL, amm), REPL, ['machine']).includes(p)));
  assert.deepEqual(risposteIniziali('AMMODERNAMENTO', C(['machine', 'alarm']), false), ['machine'], 'an optional «Sì» is not an answer of the list');
  // the group: the car doors made sliding only with the car doors replaced; none outside a modernisation
  assert.deepEqual(facoltativeDi('AMMODERNAMENTO', amm), ['safetyGear', 'ucm', 'alarm', 'room']);
  assert.deepEqual(facoltativeDi('AMMODERNAMENTO', C(['machine', 'carDoors'])), PARTI_FACOLTATIVE);
  assert.deepEqual(facoltativeDi('SOLO_ARGANO', amm), []);
  // the car doors «No» take their sliding doors with them
  assert.deepEqual(rispondi(C(['machine', 'carDoors', 'slidingDoors']), 'carDoors', false).parti, ['machine']);
  assert.deepEqual(rispondi(C(['machine', 'carDoors']), 'slidingDoors', true).parti, ['machine', 'carDoors', 'slidingDoors']);
  // the renovation answers its parts, never the optional ones: those answered stay, the others stay «No»
  assert.ok(PARTI_FACOLTATIVE.every((p) => !risposteRifacimento(true, ['machine']).includes(p)));
});

test('round 46 B6: la regolazione del quadro esistente — chiesta, blocca il quadro in un ammodernamento, la parte «Sì» del salvataggio', () => {
  const solo = C(['machine']), amm = C(['machine'], { regolazione: '1v' });
  // asked: a «Solo argano» always, a modernisation with the machine and the controller answered «No»
  assert.ok(chiediRegolazione('SOLO_ARGANO', solo, []));
  assert.ok(!chiediRegolazione('AMMODERNAMENTO', C(['machine']), ['machine']), 'the controller still to answer');
  assert.ok(chiediRegolazione('AMMODERNAMENTO', C(['machine']), ['machine', 'controller']));
  assert.ok(!chiediRegolazione('AMMODERNAMENTO', C(['machine', 'controller']), ['machine', 'controller']), 'a new controller: not asked');
  assert.ok(!chiediRegolazione('AMMODERNAMENTO', C(['controller']), ['machine', 'controller']), 'the machine kept: not asked');
  assert.ok(!chiediRegolazione('TRASFORMAZIONE_COMPLETA', solo, []));
  // one or two speeds: the controller replaced, the rule's «Sì» (the answer can still be changed)
  assert.deepEqual(bloccata('AMMODERNAMENTO', amm, collaudoOf(REPL, amm), REPL, 'controller'), { si: true, perche: 'inverter' });
  assert.ok(chiediRegolazione('AMMODERNAMENTO', amm, ['machine']), 'the answer that replaces the controller stays in view');
  assert.ok(!daIndicare('AMMODERNAMENTO', amm, collaudoOf(REPL, amm), REPL, ['machine']).includes('controller'));
  assert.deepEqual(effettiva('AMMODERNAMENTO', amm, REPL)?.parti, ['machine', 'controller']);
  assert.equal(bloccata('AMMODERNAMENTO', C(['machine'], { regolazione: 'vvvf' }), collaudoOf(REPL, amm), REPL, 'controller'), null);
  assert.equal(bloccata('SOLO_ARGANO', C(['machine'], { regolazione: '2v' }), collaudoOf(REPL, solo), REPL, 'controller'), null, 'a «Solo argano» is refused instead');
  // the ropes of their own number and diameter as before, both rules together
  assert.deepEqual(effettiva('AMMODERNAMENTO', amm, { ...REPL, keepRopes: false })?.parti, ['machine', 'ropes', 'controller']);
  assert.equal(effettiva('AMMODERNAMENTO', C(['machine', 'car']), REPL)?.parti.length, 2, 'nothing to add: the same test');
  // the list of what is missing: after the parts, before the fields
  const V = blankCalc(), m = calcMissing(V, readInputs(V).bad, 'SOLO_ARGANO', ['ropes'], true);
  assert.deepEqual(m.slice(0, 2), [parteId('ropes'), 'regolazione']);
  assert.equal(plantReady(calcMissing({ ...PRESETS.C }, readInputs({ ...PRESETS.C }).bad, 'SOLO_ARGANO', [], true)), false, 'the answer holds the proposals');
});
