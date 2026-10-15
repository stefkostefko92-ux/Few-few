// The changes of the rated speed and of the travel against what the logbook documents (src/lib/lift/modifica.ts, round
// 46, B2): UNI 10411-1 — over +5 % above the higher of the logbook's speed and the one after 50 Hz (15.1), over −5 %
// below the logbook's (15.16), the travel over 8 m above the first test (16); UNI 10411-11 — any change past the
// rounding, the UCM protection over 5 % (15 i)). Pure helpers: the acceptance test's rules do not read them yet
// (collaudoOf is as before: the parts never change with a logbook, which is carried).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { KL, NORME_AGGIUNTIVE, NORME_COLLAUDO, PARTI, VOCI_IMPIANTO, collaudoOf, withAggiunta, type Collaudo } from '@/lib/lift';
import { esistenteOf, modificaOf } from '@/lib/lift/collaudo';
import { interventoTo, rifacimentoTo, TIPI_INTERVENTO } from '@/lib/lift/intervento';
import { REGOLAZIONI, corsaOf, variazioneCorsa, variazioneVelocita, velocitaOf, type Libretto } from '@/lib/lift/modifica';

test('UNI 10411-1, 15.1: +5,00 % no, +5,01 % sì; il riferimento è la maggiore tra libretto e 50 Hz', () => {
  assert.equal(variazioneVelocita('10411-1', { v: 1 }, 1.05)?.aumento, false);
  assert.equal(variazioneVelocita('10411-1', { v: 1 }, 1.0501)?.aumento, true);
  assert.equal(variazioneVelocita('10411-1', { v: 1 }, 1.0501)?.variata, true);
  // the speed after 50 Hz higher than the logbook's is the reference
  const w = variazioneVelocita('10411-1', { v: 1, v50: 1.2 }, 1.25);
  assert.equal(w?.rif, 1.2);
  assert.equal(w?.aumento, false, '+4,2 % sopra 1,2 m/s');
  assert.equal(variazioneVelocita('10411-1', { v: 1.2, v50: 1 }, 1.27)?.aumento, true, 'il libretto è il più alto');
  // the one after 50 Hz alone
  assert.equal(variazioneVelocita('10411-1', { v50: 0.8 }, 0.85)?.aumento, true);
  assert.equal(variazioneVelocita('10411-1', { v50: 0.8 }, 0.5)?.calo, false, 'senza la velocità del libretto nessun calo');
});

test('UNI 10411-1, 15.16: −5,00 % no, −5,01 % sì, rispetto a quella del libretto', () => {
  assert.equal(variazioneVelocita('10411-1', { v: 1 }, 0.95)?.calo, false);
  assert.equal(variazioneVelocita('10411-1', { v: 1 }, 0.9499)?.calo, true);
  assert.equal(variazioneVelocita('10411-1', { v: 1 }, 0.9499)?.variata, true);
  assert.equal(variazioneVelocita('10411-1', { v: 1, v50: 1.2 }, 0.96)?.calo, false, 'il calo si misura sul libretto, non sui 50 Hz');
  const same = variazioneVelocita('10411-1', { v: 1 }, 1.03);
  assert.deepEqual([same?.aumento, same?.calo, same?.variata, same?.ucm15i], [false, false, false, false]);
  assert.ok(Math.abs((same?.dv ?? 0) - 0.03) < 1e-12);
});

test('UNI 10411-11, 15: ogni variazione oltre l’arrotondamento; 15 i) oltre il 5 %', () => {
  assert.equal(variazioneVelocita('10411-11', { v: 1 }, 1.01)?.variata, true, '+0,01 m/s');
  assert.equal(variazioneVelocita('10411-11', { v: 1 }, 1.004)?.variata, false, '+0,004 m/s');
  assert.equal(variazioneVelocita('10411-11', { v: 1 }, 0.99)?.calo, true);
  assert.equal(variazioneVelocita('10411-11', { v: 1 }, 1.04)?.ucm15i, false);
  assert.equal(variazioneVelocita('10411-11', { v: 1 }, 1.0501)?.ucm15i, true);
  assert.equal(variazioneVelocita('10411-11', { v: 1 }, 0.9499)?.ucm15i, true);
  assert.equal(variazioneVelocita('10411-11', { v50: 1 }, 1.5), null, 'la -11 non ha i 50 Hz');
  assert.equal(variazioneVelocita('10411-1', undefined, 1), null);
  assert.equal(variazioneVelocita('10411-1', { H: 12 }, 1), null);
});

test('UNI 10411-1/-11, 16: la corsa; 8,00 m è variazione senza oltre 8 m, 8,01 m sì; l’accorciamento è variazione', () => {
  const at = (H: number, n: '10411-1' | '10411-11' = '10411-1') => variazioneCorsa(n, { H: 15 }, H);
  assert.deepEqual([at(23)?.variata, at(23)?.allungata, at(23)?.oltre8], [true, true, false]);
  assert.equal(at(23.01)?.oltre8, true);
  assert.equal(at(23.01, '10411-11')?.oltre8, false, 'la -11 non ha limite');
  assert.deepEqual([at(12)?.variata, at(12)?.accorciata, at(12)?.allungata], [true, true, false]);
  assert.equal(at(15.05)?.variata, false, 'entro l’arrotondamento');
  assert.equal(at(15.06)?.variata, true);
  assert.equal(variazioneCorsa('10411-1', { v: 1 }, 20), null);
});

test('velocità e corsa del calcolo come le legge il calcolo', () => {
  const V: FormValues = { ...PRESETS.C };
  assert.ok((velocitaOf(V) ?? 0) > 0 && (corsaOf(V) ?? 0) > 0);
  assert.equal(velocitaOf({ ...V, v: '' }), null);
  assert.equal(corsaOf({ ...V, H: '' }), null);
});

test('il registro dice i numeri del codice', () => {
  const text = (id: string) => VOCI_IMPIANTO.find((v) => v.id === id)?.valore ?? '';
  const pct = (x: number) => `${String(Math.round(x * 1000) / 10).replace('.', ',')} %`;
  for (const x of [KL.speedInc1, KL.speedDec1, KL.ucmSpeed11]) assert.ok(text('impianto.variazione.velocita').includes(pct(x)), pct(x));
  assert.ok(text('impianto.variazione.corsa').includes(`${KL.travelInc1} m`));
  // after the change of the loads, in the order of the registry
  const ids = VOCI_IMPIANTO.map((v) => v.id), i = ids.indexOf('impianto.variazione.carico');
  assert.deepEqual(ids.slice(i, i + 3), ['impianto.variazione.carico', 'impianto.variazione.velocita', 'impianto.variazione.corsa']);
});

/** A small deterministic generator (mulberry32): the same cases on every run. */
const rng = (seed: number) => (): number => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('4000 casi: il libretto e la regolazione passano per interventoTo, rifacimentoTo, withAggiunta e collaudoOf senza cambiare le parti', () => {
  const r = rng(46), pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)] as T, some = <T,>(a: readonly T[]): T[] => a.filter(() => r() < 0.35);
  const libs: Libretto[] = [{ v: 1 }, { v50: 0.95, H: 21 }, { v: 1.6, v50: 1.65, H: 40.5 }, { H: 9 }];
  const loads: FormValues[] = [{}, { Q: 630, P: 700, k: 0.5 }, { ...PRESETS.A }, { ...PRESETS.C }];
  for (let i = 0; i < 4000; i++) {
    const libretto = pick(libs), regolazione = pick(REGOLAZIONI);
    const C: Collaudo = { norma: pick(NORME_COLLAUDO), parti: some(PARTI), ...(r() < 0.3 ? { rifacimento: true as const } : {}), ...(r() < 0.4 ? { marcatura: 'si' as const } : {}),
      ...(r() < 0.3 ? { documentato: { Q: 630, P: 700, Mcw: 1015 } } : {}), ...(r() < 0.3 ? { aggiuntive: some(NORME_AGGIUNTIVE) } : {}), libretto, regolazione };
    const keeps = (x: Collaudo, why: string) => assert.deepEqual([x.libretto, x.regolazione], [libretto, regolazione], `${why} ${JSON.stringify(C)}`);
    keeps(interventoTo(pick(TIPI_INTERVENTO), C).collaudo, 'interventoTo');
    keeps(rifacimentoTo(r() < 0.5, C).collaudo, 'rifacimentoTo');
    keeps(withAggiunta(r() < 0.2, C, C, pick(NORME_AGGIUNTIVE), r() < 0.5), 'withAggiunta');
    keeps({ ...C, ...esistenteOf(C) }, 'esistenteOf');
    keeps({ ...C, ...modificaOf(C) }, 'modificaOf');
    // the acceptance test's rules do not read them (round 46 S3): the same parts as without them; a modification carries them
    const V = { ...pick(loads), context: pick(['repl', 'repl', 'new']) };
    const { libretto: _l, regolazione: _r, ...senza } = C;
    void _l; void _r;
    const a = collaudoOf(V, C), b = collaudoOf(V, senza);
    assert.deepEqual(a.parti, b.parti);
    assert.equal(a.norma, b.norma);
    if (a.norma !== 'en81') keeps(a, 'collaudoOf');
  }
});
