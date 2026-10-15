// Round 46 S4 (B5): what the documents print of the changes of speed, load and travel — the obligations by case
// (obblighi.ts, obblighi-variazioni.ts), the relazione's rows and sheet 1's sentence (report/variazioni.ts) only with
// what the logbook documents, the ⚠ over 8 m only under UNI 10411-1, the case of DPR 162/1999 art. 2 c.1 lett. cc) of
// every part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { collaudoOf, type Collaudo, type Parte } from '@/lib/lift/collaudo';
import { carichiOf, type Libretto } from '@/lib/lift/modifica';
import { obblighiParti } from '@/lib/lift/obblighi';
import { OBBLIGHI_VARIAZIONI } from '@/lib/lift/obblighi-variazioni';
import { adempimentiBlocks, collaudoNote, collaudoRows } from '../report/collaudo';

const V = (v: number, H = 18): FormValues => ({ ...PRESETS.C, context: 'repl', keepRopes: true, compare: true, v: String(v), H: String(H) });
const test1 = (libretto: Libretto, norma: Collaudo['norma'] = '10411-1', parti: readonly Parte[] = ['machine', 'controller'], v = 1.2, H = 18): Collaudo =>
  collaudoOf(V(v, H), { norma, parti, libretto });
const rifs = (C: Collaudo, v = 1.2, H = 18): string[] => obblighiParti(C, V(v, H)).map((p) => p.rif);

test('obblighi per caso: velocità aumentata, ridotta, entro il 5 %; -11 con il 15 i)', () => {
  assert.ok(rifs(test1({ v: 1 })).includes('UNI 10411-1:2024, 15.1–15.15'));
  assert.ok(rifs(test1({ v: 1.3 }), 1.2).includes('UNI 10411-1:2024, 15.16–15.17'), '−7,7 %');
  const entro = obblighiParti(test1({ v: 1.18 }), V(1.2));
  assert.deepEqual(entro.filter((p) => p.rif === 'UNI 10411-1:2024, 15.1 e 15.16').map((p) => p.stato), ['da_verificare'], 'entro il 5 %: una nota');
  const r11 = rifs(test1({ v: 1.18 }, '10411-11'));
  assert.ok(r11.includes('UNI 10411-11:2024, 15 a)–k) e 4.3') && r11.includes('UNI 10411-11:2024, 15 i)'));
});

test('obblighi per caso: corsa allungata (⚠ oltre 8 m con la -1), accorciata; i carichi per prospetto, calo e rapporto', () => {
  const lunga = obblighiParti(test1({ H: 9 }), V(1.2, 18)).map((p) => p.testo);
  assert.ok(lunga.some((x) => x.startsWith('corsa allungata rispetto al primo collaudo')) && lunga.some((x) => x.startsWith('⚠ corsa allungata di oltre 8 m')));
  assert.ok(!obblighiParti(test1({ H: 9 }, '10411-11'), V(1.2, 18)).some((p) => p.testo.startsWith('⚠')), 'la -11 non ha il limite');
  assert.ok(rifs(test1({ H: 20 })).includes('UNI 10411-1:2024, 16 e 4'), 'accorciata');
  assert.ok(rifs(test1({ H: 20 }, '10411-11')).includes('UNI 10411-11:2024, 16 e 4.3'));
  // documented 600 · 730 · 1015 against the design's 630 · 700 · 1015: T* the same, within the prospetti, the ratio changed
  const Vd: FormValues = { ...V(1), Q: '630', P: '700', k: '0.5', qeq: '' };
  const doc: Collaudo = collaudoOf(Vd, { norma: '10411-1', parti: ['machine'], documentato: { Q: 600, P: 730, Mcw: 1015 } });
  assert.ok(doc.parti.includes('load'));
  assert.deepEqual(obblighiParti(doc, Vd).map((p) => p.rif), ['UNI 10411-1:2024, 6.1 e App. D']);
  // without the calculation's values (or a load answered by hand): the increases' points
  assert.deepEqual(obblighiParti({ norma: '10411-1', parti: ['load'] }).map((p) => p.rif), ['UNI 10411-1:2024, 6.1, 6.3–6.12 e 6.15', 'UNI 10411-1:2024, 6.1, 6.4, 6.5, 6.8 e 6.13–6.15']);
  // the sling: its slack rope contact (-1 6.2 and 22 b)), the new car on it no more on its own
  assert.deepEqual(obblighiParti({ norma: '10411-1', parti: ['car', 'sling'] }).map((p) => p.rif), ['UNI 10411-1:2024, 6.2 e 22 b)']);
});

test('ogni caso è una clausola della sua parte di UNI 10411', () => {
  for (const n of ['10411-1', '10411-11'] as const) {
    for (const p of Object.values(OBBLIGHI_VARIAZIONI[n])) assert.ok(p?.rif.startsWith(`UNI ${n}:2024, `), `${n}: ${p?.rif}`);
  }
});

test('relazione e foglio 1: le righe della variazione solo con il libretto; ⚠ oltre 8 m solo con la -1', () => {
  const rows = (C: Collaudo, Vx: FormValues): Record<string, string> => Object.fromEntries(collaudoRows(C, true, carichiOf(Vx), Vx));
  assert.equal(rows({ norma: '10411-1', parti: ['machine'] }, V(1.2))['Velocità documentata · variazione'], undefined, 'senza libretto nulla');
  const C = test1({ v: 1, H: 9 }), r = rows(C, V(1.2, 18));
  assert.match(r['Velocità documentata · variazione'] ?? '', /^1,00 m\/s \(libretto o verbale\); progetto 1,20 m\/s, \+20,0 % rispetto a 1,00 m\/s: oltre il 5 %/);
  assert.match(r['Corsa del primo collaudo · variazione'] ?? '', /^9,00 m \(primo collaudo\); progetto 18,00 m, \+9,00 m: allungata[^⚠]*⚠ Oltre 8 m/);
  const r11 = rows(test1({ v: 1, H: 9 }, '10411-11'), V(1.2, 18));
  assert.ok(r11['Corsa documentata · variazione'] && !r11['Corsa documentata · variazione'].includes('⚠'), 'la -11: corsa documentata, nessun limite');
  const nota = collaudoNote(C, 'NOTA 1', carichiOf(V(1.2, 18)), 'AMMODERNAMENTO', V(1.2, 18))?.text ?? '';
  assert.ok(nota.includes('Velocità 1,00 → 1,20 m/s (+20,0 %): variata (UNI 10411-1, 15.1).') && nota.includes('⚠ oltre 8 m: nuova installazione'), nota);
  assert.ok(!(collaudoNote({ norma: '10411-1', parti: ['machine'] }, 'NOTA 1', null, null, V(1.2))?.text ?? '').includes('Velocità'), 'senza libretto nulla');
});

test('DPR 162/1999 art. 2 c.1 lett. cc): il numero di ogni parte', () => {
  const items = (C: Collaudo): string[] => adempimentiBlocks(C, true).flatMap((b) => (b.t === 'list' ? b.items : [])).filter((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc) n.'));
  const all = items({ norma: '10411-1', parti: ['machine', 'speed', 'load', 'travel', 'controller', 'landingDoors', 'car', 'sling', 'ropes'] });
  assert.ok(all[0]?.startsWith('DPR 162/1999, art. 2 c.1 lett. cc) n. 1): cambio della velocità nominale'));
  assert.ok(all[1]?.startsWith('DPR 162/1999, art. 2 c.1 lett. cc) n. 2)') && all[2]?.startsWith('DPR 162/1999, art. 2 c.1 lett. cc) n. 3)'));
  assert.ok(all[3]?.includes('quadro di manovra, porte di piano, cabina con l’arcata') && !all[3].includes('da verificare'), all[3]);
  assert.ok(all[4]?.includes('altri componenti principali sostituiti (funi)') && all[4].endsWith('(da verificare sul testo vigente).'), all[4]);
  // the car without its sling is one of the other main components
  assert.ok(items({ norma: '10411-1', parti: ['machine', 'car'] })[0]?.includes('altri componenti principali sostituiti (cabina)'));
  assert.deepEqual(items({ norma: '10411-1', parti: ['machine'] }), [], 'la sola macchina: il caso n. 5) degli adempimenti');
});
