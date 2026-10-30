// Round 46 recheck: DPR 162/1999 art. 2 c.1 lett. cc) n. 2) as the documented loads show it — the static loads
// changed without the rated load for the engineer to place, 'load' answered by hand while the documents show no change
// for the engineer to confirm, never «carichi statici variati» with nothing varied; the speed «uguale» only to the
// logbook's (or to the one after 50 Hz without the logbook's); the car sill's apron with new landing doors under UNI
// 10411-1 (19.6); n. 5)'s other parts without saying they are main components.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { ambitoOf, collaudoOf, type Collaudo } from '@/lib/lift/collaudo';
import { carichiOf, carichiVariati, variazioneVelocita, type Carichi } from '@/lib/lift/modifica';
import { obblighiParti } from '@/lib/lift/obblighi';
import { adempimentiBlocks, collaudoRows } from '../report/collaudo';

const V = (v = 1, x: FormValues = {}): FormValues => ({ ...PRESETS.C, context: 'repl', keepRopes: true, compare: true, v: String(v), H: '18', ...x });
const cc = (C: Collaudo, Vx?: FormValues): string[] =>
  adempimentiBlocks(C, true, false, Vx).flatMap((b) => (b.t === 'list' ? b.items : [])).filter((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc)'));
const ora = (): Carichi => {
  const c = carichiOf(V());
  assert.ok(c);
  return c;
};

test('DPR cc) n. 2): «portata variata» a mano con i carichi documentati uguali al progetto — da confermare, mai «carichi statici variati»', () => {
  for (const norma of ['10411-1', '10411-11'] as const) {
    const C = collaudoOf(V(), { norma, parti: ['machine', 'car', 'load'], documentato: ora() });
    assert.ok(C.parti.includes('load'), 'the hand\'s answer stays');
    const s = cc(C, V()), n2 = s.find((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc) n. 2)')) ?? '';
    assert.ok(n2.includes('portata indicata come variata, ma i carichi documentati (portata, T* e contrappeso) coincidono con quelli del progetto'), n2);
    assert.ok(n2.endsWith('lo conferma il tecnico nella comunicazione.'), n2);
    assert.ok(!s.some((x) => x.includes('carichi statici variati') || x.includes('cambio della portata: modifica costruttiva')), s.join('\n'));
  }
});

test('DPR cc): i carichi statici variati senza la portata restano per il tecnico, anche con la -11 e il carico alleggerito', () => {
  const doc = { ...ora(), P: ora().P + 100, Mcw: ora().Mcw + 100 };
  for (const norma of ['10411-1', '10411-11'] as const) {
    const C = collaudoOf(V(), { norma, parti: ['machine', 'controller'], documentato: doc });
    assert.ok(C.parti.includes('load'), `${norma}: the rule brings the load`);
    const s = cc(C, V());
    assert.ok(s.some((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc): carichi statici variati')), s.join('\n'));
    assert.ok(!s.some((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc) n. 2)')), s.join('\n'));
  }
});

test('carichiVariati: T* o contrappeso oltre l’arrotondamento dei dati, in su o in giù, o il loro rapporto', () => {
  const d = { Q: 630, P: 700, Mcw: 1015 };
  assert.equal(carichiVariati('10411-1', d, d), false);
  assert.equal(carichiVariati('10411-1', d, { ...d, P: 700.4, Mcw: 1015.4 }), false, 'within the rounding');
  assert.equal(carichiVariati('10411-11', d, { ...d, Mcw: 1016 }), true, 'the counterweight');
  assert.equal(carichiVariati('10411-11', d, { ...d, P: 699 }), true, 'T* lighter');
});

test('velocità uguale a quella dopo 50 Hz ma sopra il libretto: non «uguale», le due differenze e la nota del DPR', () => {
  const lib = { v: 0.8, v50: 0.95 }, x = variazioneVelocita('10411-1', lib, 0.95);
  assert.equal(x?.uguale, false);
  assert.deepEqual(x?.confronti.map((c) => c.di), ['libretto', '50hz']);
  assert.deepEqual(variazioneVelocita('10411-1', lib, 0.953)?.confronti.map((c) => c.di), ['libretto', '50hz'], 'within the rounding above 50 Hz');
  const C = collaudoOf(V(0.95), { norma: '10411-1', parti: ['machine', 'controller'], libretto: lib });
  const row = Object.fromEntries(collaudoRows(C, true, carichiOf(V(0.95)), V(0.95)))['Velocità documentata · variazione'] ?? '';
  assert.match(row, /\+18,\d % rispetto a 0,80 m\/s \(libretto\) e \+0,0 % rispetto a 0,95 m\/s \(dopo 50 Hz\): tra la velocità del libretto/, row);
  assert.ok(row.includes('ai sensi del DPR 162/1999 lo valuta il tecnico') && !row.includes('la velocità non cambia'), row);
  assert.ok(obblighiParti(C, V(0.95)).some((p) => p.rif === 'UNI 10411-1:2024, 15.1 e 15.16'), 'the note of a change within 5 %');
  // the logbook's speed alone, or the one after 50 Hz with no logbook's: equal; the logbook's while the lift runs at
  // another after 50 Hz: not equal (round 47 review — equal to every documented speed)
  assert.equal(variazioneVelocita('10411-1', { v: 0.8 }, 0.8)?.uguale, true);
  assert.equal(variazioneVelocita('10411-1', lib, 0.8)?.uguale, false);
  assert.equal(variazioneVelocita('10411-1', { v50: 0.95 }, 0.95)?.uguale, true);
});

test('grembiule della soglia di cabina con porte di piano nuove: solo con la UNI 10411-1 (19.6)', () => {
  assert.equal(ambitoOf({ norma: '10411-1', parti: ['machine', 'landingDoors'] }, 'p_apron'), 'applies');
  assert.equal(ambitoOf({ norma: '10411-11', parti: ['machine', 'landingDoors'] }, 'p_apron'), 'existing');
  assert.equal(ambitoOf({ norma: '10411-11', parti: ['machine', 'carDoors'] }, 'p_apron'), 'applies', 'the car doors as before');
  assert.equal(ambitoOf({ norma: '10411-1', parti: ['machine'] }, 'p_apron'), 'existing');
});

test('DPR cc) n. 5): le altre parti per il tecnico, senza dire che sono componenti principali', () => {
  const s = cc({ norma: '10411-1', parti: ['machine', 'alarm', 'ucm'] }).filter((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc) n. 5)'));
  assert.equal(s.length, 1, s.join('\n'));
  assert.ok(!s[0]?.includes('componenti principali sostituiti'), s[0]);
  assert.match(s[0] ?? '', /^DPR 162\/1999, art\. 2 c\.1 lett\. cc\) n\. 5\): altre parti sostituite \([^)]+\): se siano «altri componenti principali» lo conferma il tecnico nella comunicazione\.$/);
});
