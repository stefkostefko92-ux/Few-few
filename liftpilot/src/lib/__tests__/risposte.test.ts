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
import { PARTI, PARTI_RIFACIMENTO, collaudoOf, type Collaudo } from '@/lib/lift';
import { bloccata, daIndicare, partiDi, rispondi, risposteDopo, risposteIniziali, risposteRifacimento, sceltaSalvata } from '@/lib/lift/risposte';

const REPL: FormValues = { ...PRESETS.B, context: 'repl', keepRopes: true };
const C = (parti: Collaudo['parti'], x: Partial<Collaudo> = {}): Collaudo => ({ norma: '10411-1', parti, ...x });

test('le parti da indicare: per «Solo argano» le funi, per l’ammodernamento tutte, nessuna per la trasformazione', () => {
  assert.deepEqual(partiDi('SOLO_ARGANO'), ['machine', 'ropes']);
  assert.deepEqual(partiDi('AMMODERNAMENTO'), PARTI);
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
  assert.deepEqual(daIndicare('AMMODERNAMENTO', amm, collaudoOf(REPL, amm), REPL, ['machine']), PARTI.filter((p) => p !== 'machine'));
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
  assert.deepEqual(risposteRifacimento(true, ['machine', 'speed']), [...PARTI.filter((p) => p !== 'speed' && p !== 'load' && p !== 'travel'), 'speed']);
  assert.deepEqual(risposteRifacimento(false, PARTI), ['machine']);
});

test('le risposte iniziali: un calcolo col tipo dichiarato ha tutto risposto, uno di prima solo i suoi «Sì»', () => {
  assert.deepEqual(risposteIniziali('AMMODERNAMENTO', C(['machine', 'car']), true), [...PARTI]);
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
