// Round 46 review: what the documents print after the review's findings — the speed changed against the base each clause
// measures from (an increase from the higher of the logbook's and the one after 50 Hz, 15.1; a decrease from the
// logbook's, 15.16), the speed equal to the documented one without the note of a change within 5 %, the ⚠ over 8 m
// first; DPR 162/1999 art. 2 c.1 lett. cc) n. 2) only with the rated load changed, the car doors made sliding not twice
// and the machine room out of n. 5)'s components; 9.1–9.2 without the new machine when the machine stays; D.1 naming the
// deceleration it assumed; the speed after 50 Hz kept by the test only under UNI 10411-1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { collaudoOf, type Collaudo, type Parte } from '@/lib/lift/collaudo';
import { variazioneVelocita, type Libretto } from '@/lib/lift/modifica';
import { obblighiParti } from '@/lib/lift/obblighi';
import { adempimentiBlocks, collaudoNote, collaudoRows } from '../report/collaudo';
import { carichiOf } from '@/lib/lift/modifica';

const V = (v: number, H = 18, x: FormValues = {}): FormValues => ({ ...PRESETS.C, context: 'repl', keepRopes: true, compare: true, v: String(v), H: String(H), ...x });
const C1 = (libretto: Libretto, parti: readonly Parte[] = ['machine', 'controller'], v = 0.8, x: Partial<Collaudo> = {}): Collaudo =>
  collaudoOf(V(v), { norma: '10411-1', parti, libretto, ...x });
const row = (C: Collaudo, Vx: FormValues): string => Object.fromEntries(collaudoRows(C, true, carichiOf(Vx), Vx))['Velocità documentata · variazione'] ?? '';
const nota = (C: Collaudo, Vx: FormValues): string => collaudoNote(C, 'NOTA 1', carichiOf(Vx), 'AMMODERNAMENTO', Vx)?.text ?? '';

test('velocità: l’aumento rispetto al riferimento (15.1), la riduzione rispetto al libretto (15.16)', () => {
  const lib = { v: 0.8, v50: 0.95 };
  // the design between the logbook's 0,80 and the 0,95 after 50 Hz: both differences, within both clauses
  const tra = row(C1(lib, undefined, 0.86), V(0.86));
  assert.match(tra, /progetto 0,86 m\/s, \+7,5 % rispetto a 0,80 m\/s \(libretto\) e −9,5 % rispetto a 0,95 m\/s \(dopo 50 Hz\): tra la velocità del libretto/, tra);
  assert.deepEqual(variazioneVelocita('10411-1', lib, 0.86)?.confronti.map((c) => c.di), ['libretto', '50hz']);
  // equal to the logbook's speed: no change at all, never «−15,8 % rispetto a 0,95» with «entro il 5 %»
  const uguale = row(C1(lib), V(0.8));
  assert.match(uguale, /progetto 0,80 m\/s, \+0,0 % rispetto a 0,80 m\/s \(libretto\): uguale alla velocità documentata/, uguale);
  assert.ok(!uguale.includes('entro il 5 %'));
  // a decrease past 5 % from the logbook's: measured on it (−12,5 %), 15.16 — row and sheet 1
  const C = C1(lib, undefined, 0.7), r = row(C, V(0.7)), n = nota(C, V(0.7));
  assert.match(r, /progetto 0,70 m\/s, −12,5 % rispetto a 0,80 m\/s \(libretto\): oltre il 5 % sotto la velocità iniziale/, r);
  assert.ok(n.includes('Velocità 0,80 → 0,70 m/s (−12,5 %): variata (UNI 10411-1, 15.16).'), n);
  // an increase past 5 % from the higher of the two: measured on it
  assert.match(row(C1(lib, undefined, 1.05), V(1.05)), /\+10,5 % rispetto a 0,95 m\/s \(dopo 50 Hz\): oltre il 5 % sopra il riferimento/);
});

test('velocità uguale a quella documentata: nessuna nota «entro il 5 %» tra le altre parti; entro il 5 %: la nota', () => {
  const within = (v: number): string[] => obblighiParti(C1({ v: 1 }, ['machine', 'controller'], v), V(v)).map((p) => p.rif);
  assert.ok(!within(1).includes('UNI 10411-1:2024, 15.1 e 15.16'), 'the documented speed');
  assert.ok(within(1.03).includes('UNI 10411-1:2024, 15.1 e 15.16'), '+3 %');
  assert.equal(variazioneVelocita('10411-1', { v: 1 }, 1.004)?.uguale, true, 'within the rounding');
  assert.equal(variazioneVelocita('10411-1', { v: 1 }, 1.006)?.uguale, false);
});

test('corsa oltre 8 m: il ⚠ prima del punto 16 a)–l), che non dice «fino a 8 m:» da solo', () => {
  const C = collaudoOf(V(1, 18), { norma: '10411-1', parti: ['machine', 'controller'], libretto: { H: 9 } });
  const testi = obblighiParti(C, V(1, 18)).filter((p) => p.rif.startsWith('UNI 10411-1:2024, 16')).map((p) => p.testo);
  assert.ok(testi[0]?.startsWith('⚠ corsa allungata di oltre 8 m'), testi[0]);
  assert.ok(testi[1]?.startsWith('corsa allungata rispetto al primo collaudo (fino a 8 m l’intervento non conta come nuova installazione'), testi[1]);
});

const cc = (C: Collaudo, resta = false, Vx?: FormValues): string[] =>
  adempimentiBlocks(C, true, resta, Vx).flatMap((b) => (b.t === 'list' ? b.items : [])).filter((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc)'));

test('DPR cc) n. 2): solo con la portata cambiata; i carichi senza la portata, al tecnico', () => {
  const doc = { Q: 630, P: 700, Mcw: 1015 };
  // the documented loads with the rated load the same and P lighter: the rule brings 'load', not case n. 2)
  const same = V(1, 18, { Q: 630, P: 600, k: 0.5, qeq: '' }), Cs = collaudoOf(same, { norma: '10411-1', parti: ['machine', 'controller'], documentato: doc });
  assert.ok(Cs.parti.includes('load'), 'the loads changed');
  const s = cc(Cs, false, same);
  assert.ok(!s.some((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc) n. 2)')), s.join('\n'));
  assert.ok(s.some((x) => x.includes('carichi statici variati') && x.endsWith('(da verificare sul testo vigente).')), s.join('\n'));
  // the rated load changed: n. 2), confirmed
  const more = V(1, 18, { Q: 800, P: 700, k: 0.5, qeq: '' }), Cm = collaudoOf(more, { norma: '10411-1', parti: ['machine', 'controller'], documentato: doc });
  assert.ok(cc(Cm, false, more).some((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc) n. 2): cambio della portata: modifica costruttiva')));
  // answered by hand (no documents): as answered
  assert.ok(cc({ norma: '10411-1', parti: ['machine', 'load'] }).some((x) => x.includes('n. 2): cambio della portata')));
});

test('DPR cc) n. 5): le porte scorrevoli non due volte, il locale a parte', () => {
  const items = cc({ norma: '10411-1', parti: ['car', 'carDoors', 'slidingDoors', 'room', 'alarm'] }, true);
  const altri = items.find((x) => x.includes('altri componenti principali')) ?? '';
  assert.ok(altri.includes('(cabina, porte di cabina, allarme di emergenza)') || /\(cabina, porte di cabina, [^)]*allarme[^)]*\)/i.test(altri), altri);
  assert.ok(!altri.includes('scorrevoli') && !altri.includes('locale'), altri);
  assert.ok(items.some((x) => x.includes('locale del macchinario nuovo o modificato: un’opera dell’edificio')), items.join('\n'));
});

test('argano che resta: il 9.1–9.2 senza la macchina nuova', () => {
  const punti = (resta: boolean): string => adempimentiBlocks({ norma: '10411-1', parti: ['controller', 'car'] }, true, resta)
    .flatMap((b) => (b.t === 'list' ? b.items : [])).find((x) => x.startsWith('UNI 10411-1:2024, 9.1–9.2')) ?? '';
  assert.ok(punti(false).includes('anche la macchina nuova'));
  assert.ok(!punti(true).includes('macchina nuova') && punti(true).includes('l’argano resta'), punti(true));
});

test('la velocità dopo 50 Hz resta nella prova solo con la UNI 10411-1', () => {
  const ce = (marcatura: 'si' | 'no'): Collaudo => collaudoOf(V(1), { norma: '10411-1', parti: ['machine'], marcatura, libretto: { v: 1, v50: 1.1, H: 18 } });
  assert.deepEqual(ce('no').libretto, { v: 1, v50: 1.1, H: 18 });
  assert.deepEqual(ce('si').libretto, { v: 1, H: 18 }, 'under -11 (CE marking) the hidden value is not kept');
  assert.equal(collaudoOf(V(1), { norma: '10411-1', parti: ['machine'], marcatura: 'si', libretto: { v50: 1.1 } }).libretto, undefined);
});
