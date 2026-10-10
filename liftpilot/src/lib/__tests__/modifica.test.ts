// A modification's acceptance test (src/lib/lift/modifica.ts): the part of UNI 10411 by the CE marking (or the day the
// lift was put in service), the change of the loads from the documented ones against prospetti 1 and 2 of UNI 10411-1
// and any increase under UNI 10411-11, the load counted as changed in the test, what the form stores and what the
// relazione says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KL, collaudoOf, type Collaudo } from '@/lib/lift';
import { choiceOf, esistenteOf, modificaOf } from '@/lib/lift/collaudo';
import { carichiOf, caricoVariato, isServiceDay, normaDaMarcatura, variazioneCarico, type Carichi } from '@/lib/lift/modifica';
import { interventoTo } from '@/lib/lift/intervento';
import { collaudoReadSchema, collaudoSchema } from '@/lib/lift-input';
import { collaudoRows } from '../report/collaudo';

const doc = (Q: number, P: number, Mcw: number): Carichi => ({ Q, P, Mcw });

test('parte della UNI 10411 dalla marcatura CE: con -11, senza -1, non nota dalla data di messa in servizio', () => {
  assert.equal(normaDaMarcatura('si'), '10411-11');
  assert.equal(normaDaMarcatura('no'), '10411-1');
  assert.equal(normaDaMarcatura('incerta'), null);
  assert.equal(normaDaMarcatura('incerta', '1999-06-30'), '10411-1');
  assert.equal(normaDaMarcatura('incerta', KL.ceFrom), '10411-11');
  assert.equal(normaDaMarcatura('incerta', '2012-03-15'), '10411-11');
});

test('UNI 10411-1, prospetti 1 e 2: aumenti oltre i limiti, la riga più severa sopra 500 kg', () => {
  // up to 500 kg: rated load +10 %, T* +15 %, counterweight +25 % of Q are still allowed (more than: over)
  const base = doc(400, 600, 800);
  const at = (Q: number, P: number, Mcw: number) => variazioneCarico('10411-1', base, doc(Q, P, Mcw));
  assert.deepEqual(at(440, 600, 800).limiti, { Q: 0.1, T: 0.15, Tcp: 0.25 });
  assert.equal(at(440, 560, 800).p1, false, 'portata +10 %, T* uguale');
  assert.equal(at(441, 559, 800).p1, true, 'portata oltre il 10 %');
  assert.equal(at(400, 750, 800).p1, false, 'T* +15 %');
  assert.equal(at(400, 751, 800).p1, true, 'T* oltre il 15 %');
  assert.equal(at(400, 600, 900).p2, false, 'contrappeso +25 % di Q');
  assert.equal(at(400, 600, 901).p2, true, 'contrappeso oltre il 25 % di Q');
  // over 500 kg (either load): 5 %, 10 %, 10 % of Q
  const v = variazioneCarico('10411-1', doc(480, 600, 840), doc(504, 600, 840));
  assert.deepEqual(v.limiti, { Q: 0.05, T: 0.1, Tcp: 0.1 });
  assert.equal(v.p1, false, 'portata +5 %');
  assert.equal(variazioneCarico('10411-1', doc(480, 600, 840), doc(505, 600, 840)).p1, true);
  // the counterweight's share is taken on the smaller rated load
  assert.ok(Math.abs(variazioneCarico('10411-1', doc(630, 700, 1015), doc(600, 700, 1078)).dTcp - 63 / 600) < 1e-12);
  // a decrease brings the checks of the load too (buffers, progressive safety gear)
  const down = variazioneCarico('10411-1', base, doc(400, 550, 775));
  assert.equal(down.p1 || down.p2, false);
  assert.equal(down.calo, true);
  assert.equal(caricoVariato(down), true);
  assert.equal(caricoVariato(variazioneCarico('10411-1', base, base)), false);
});

test('UNI 10411-11: ogni aumento, le strutture oltre il 10 %', () => {
  const base = doc(630, 700, 1015);
  const small = variazioneCarico('10411-11', base, doc(630, 701, 1015));
  assert.equal(small.limiti, null);
  assert.equal(small.p1, true);
  assert.equal(small.strutture, false);
  assert.equal(variazioneCarico('10411-11', base, doc(630, 700, 1016)).p2, true);
  assert.equal(variazioneCarico('10411-11', base, doc(630, 830, 1015)).strutture, false, 'T* +9,8 %');
  assert.equal(variazioneCarico('10411-11', base, doc(630, 840, 1015)).strutture, true, 'T* +10,6 %');
  assert.equal(variazioneCarico('10411-1', base, doc(630, 840, 1015)).strutture, null);
});

test('il collaudo: la marcatura sceglie la parte, la variazione porta la portata tra le parti (non come scelta)', () => {
  const calc = { context: 'repl', Q: '630', P: '700', k: '0.5' };
  assert.deepEqual(carichiOf(calc), { Q: 630, P: 700, Mcw: 1015 });
  assert.equal(carichiOf({ context: 'repl', Q: '630' }), null);
  // the CE marking picks the part, whatever was chosen; tested as new it is not asked
  assert.equal(collaudoOf(calc, { norma: '10411-1', parti: ['machine'], marcatura: 'si' }).norma, '10411-11');
  assert.equal(collaudoOf(calc, { norma: '10411-11', parti: ['machine'], marcatura: 'incerta', servizio: '1998-05-04' }).norma, '10411-1');
  assert.equal(collaudoOf(calc, { norma: '10411-11', parti: ['machine'], marcatura: 'incerta' }).norma, '10411-11');
  assert.equal(collaudoOf(calc, { norma: 'en81', parti: ['machine'], marcatura: 'no' }).norma, 'en81');
  // documented 600 kg with a heavier car: the rated load +5 % (the limit over 500 kg), T* and the counterweight the same
  const within: Collaudo = { norma: '10411-1', parti: ['machine'], documentato: doc(600, 730, 1015) };
  assert.deepEqual(collaudoOf(calc, within).parti, ['machine']);
  const over: Collaudo = { norma: '10411-1', parti: ['machine'], documentato: doc(580, 700, 990) };
  const C = collaudoOf(calc, over);
  assert.deepEqual(C.parti, ['machine', 'load']);
  assert.deepEqual(C.documentato, over.documentato);
  // what the form keeps as chosen leaves the software's load out, the designer's stays
  assert.deepEqual(choiceOf(C, over), ['machine']);
  assert.deepEqual(choiceOf(collaudoOf(calc, { ...over, parti: ['machine', 'load'] }), { ...over, parti: ['machine', 'load'] }), ['machine', 'load']);
  // the day stays only with an unknown marking; the renovation and what is known of the lift go with the intervention
  assert.deepEqual(esistenteOf({ norma: '10411-1', parti: [], marcatura: 'si', servizio: '1990-01-01' }), { marcatura: 'si' });
  assert.deepEqual(modificaOf({ norma: '10411-1', parti: [], rifacimento: true, documentato: doc(1, 2, 3) }), { rifacimento: true, documentato: doc(1, 2, 3) });
  const rif = interventoTo('rifacimento', { norma: '10411-11', parti: ['machine'], marcatura: 'si', documentato: doc(630, 700, 1015) }).collaudo;
  assert.equal(rif?.marcatura, 'si');
  assert.deepEqual(rif?.documentato, doc(630, 700, 1015));
  assert.equal(rif?.rifacimento, true);
});

test('dati salvati: marcatura, data e carichi validati; la relazione dice marcatura e variazione', () => {
  const ok = { norma: '10411-1', parti: ['machine'], marcatura: 'incerta', servizio: '1997-11-03', documentato: { Q: 480, P: 600, Mcw: 840 } };
  assert.ok(collaudoSchema.safeParse(ok).success);
  assert.ok(!collaudoSchema.safeParse({ ...ok, servizio: '1997-13-03' }).success);
  assert.ok(!collaudoSchema.safeParse({ ...ok, marcatura: 'forse' }).success);
  assert.ok(!collaudoSchema.safeParse({ ...ok, documentato: { Q: 480, P: 600 } }).success);
  assert.ok(!collaudoSchema.safeParse({ ...ok, documentato: { Q: -1, P: 600, Mcw: 840 } }).success);
  // a saved test of before (no marking, no loads) reads as it did
  assert.ok(collaudoSchema.safeParse({ norma: '10411-11', parti: ['machine'] }).success);
  const C = collaudoOf({ context: 'repl', Q: '530', P: '600', k: '0.5' }, collaudoSchema.parse(ok) as Collaudo);
  const rows = Object.fromEntries(collaudoRows(C, true, carichiOf({ Q: '530', P: '600', k: '0.5' })));
  assert.ok(rows['Marcatura CE dell’impianto']?.startsWith('non nota: messa in servizio il 03/11/1997'));
  assert.equal(rows['Carichi documentati (portata · cabina · contrappeso)'], '480 · 600 · 840 kg');
  // 480 → 530 kg: +10,4 %, over the stricter row (5 %)
  assert.ok(rows['Variazione dei carichi']?.startsWith('portata +10,4 %'));
  assert.ok(rows['Variazione dei carichi']?.includes('oltre i limiti, le verifiche del carico entrano nell’esito'));
  assert.ok(C.parti.includes('load'));
  // tested as new: no rows of a modification
  assert.equal(collaudoRows({ norma: 'en81', parti: [], marcatura: 'si' }, true).length, 2);
});

test('i carichi come li legge il calcolo; mezzo chilo è arrotondamento, non variazione; giorni del calendario', () => {
  // the measured balancing load decides the counterweight, as in the calculation (calc/model.ts): k does not count
  assert.deepEqual(carichiOf({ Q: '630', P: '700', k: '0.5', qeq: '400' }), { Q: 630, P: 700, Mcw: 1100 });
  assert.deepEqual(carichiOf({ Q: '630', P: '700', k: '', qeq: '400' }), { Q: 630, P: 700, Mcw: 1100 });
  assert.equal(carichiOf({ Q: '630', P: '700', k: '' }), null, 'k not entered');
  assert.equal(carichiOf({ Q: '630abc', P: '700', k: '0.5' }), null, 'a number as the calculation reads it');
  // documented 1015 kg, the design's counterweight 1100 kg with the measured load: +85 kg, the load's checks come in
  const documentato = doc(630, 700, 1015), chosen: Collaudo = { norma: '10411-1', parti: ['machine'], documentato };
  assert.ok(collaudoOf({ context: 'repl', Q: '630', P: '700', k: '0.5', qeq: '400' }, chosen).parti.includes('load'));
  assert.ok(!collaudoOf({ context: 'repl', Q: '630', P: '700', k: '0.5' }, chosen).parti.includes('load'));
  // 900 + 0,43 · 450 = 1093,5 kg against a report's 1094: rounding, under -1 and under -11
  assert.equal(caricoVariato(variazioneCarico('10411-1', doc(450, 900, 1094), doc(450, 900, 1093.5))), false);
  assert.equal(caricoVariato(variazioneCarico('10411-11', doc(450, 900, 1296), doc(450, 900, 1296.1))), false);
  assert.equal(variazioneCarico('10411-11', doc(450, 900, 1296), doc(450, 900, 1297)).p2, true, 'one kilogram is a change');
  // the day the lift was put in service
  assert.equal(isServiceDay('1999-02-31', '2026-10-06'), false);
  assert.equal(isServiceDay('2023-02-29', '2026-10-06'), false);
  assert.equal(isServiceDay('2024-02-29', '2026-10-06'), true);
  assert.equal(isServiceDay('2026-10-07', '2026-10-06'), false, 'not after today');
  assert.equal(isServiceDay('', '2026-10-06'), false);
  // a new record takes only such days and loads of a report; one stored by an earlier rule is read back
  const ok = { norma: '10411-1', parti: ['machine'], marcatura: 'incerta', servizio: '1997-11-03', documentato: { Q: 480, P: 600, Mcw: 840 } };
  for (const bad of [{ ...ok, servizio: '1999-02-31' }, { ...ok, servizio: '2099-01-01' }, { ...ok, documentato: { Q: 0.5, P: 600, Mcw: 840 } },
    { ...ok, documentato: { Q: 5e-324, P: 600, Mcw: 840 } }]) {
    assert.ok(!collaudoSchema.safeParse(bad).success, JSON.stringify(bad));
    assert.ok(collaudoReadSchema.safeParse(bad).success, JSON.stringify(bad));
  }
});
