// The intervention declared in «Calcolo argano» (round 45): the legacy records read by their shape, the type chosen
// sets the context and the test without losing what is known of the lift, the renovation as a preset of a
// modernisation, the validator that the save repeats, what the Progetto draws, point 21.1 and the machine kept. And what
// phase 3 must not move: collaudoOf stays idempotent and the engines' versions stay where they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_VERSION } from '@/calc/snapshot';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { LIFT_ENGINE_VERSION, NORME_AGGIUNTIVE, NORME_COLLAUDO, PARTI, PARTI_LOCALE, PARTI_RIFACIMENTO, PARTI_SOLO, SOSTANZIALE, TIPI_INTERVENTO, collaudoOf,
  contestoDi, disegnoDi, interventoDi, interventoTo, interventoValido, isTipoIntervento, macchinaResta, rifacimentoTo, sostanziale, type Collaudo,
  type Parte } from '@/lib/lift';
import { MARCATURE } from '@/lib/lift/modifica';
import { ROOM_ENGINE_VERSION } from '@/lib/room/snapshot';
import { SHAFT_ENGINE_VERSION } from '@/shaft';

const REPL: FormValues = { context: 'repl', keepRopes: true, compare: true }, NEW: FormValues = { context: 'new', keepRopes: true, compare: true };
const C = (parti: readonly Parte[], x: Partial<Collaudo> = {}): Collaudo => ({ norma: '10411-1', parti, ...x });

test('i tipi: gli stessi nomi dell’enum del database, il contesto del calcolo', () => {
  assert.deepEqual([...TIPI_INTERVENTO], ['SOLO_ARGANO', 'AMMODERNAMENTO', 'TRASFORMAZIONE_COMPLETA']);
  assert.ok(isTipoIntervento('AMMODERNAMENTO') && !isTipoIntervento('FULL') && !isTipoIntervento(null));
  assert.equal(contestoDi('TRASFORMAZIONE_COMPLETA'), 'new');
  assert.equal(contestoDi('SOLO_ARGANO'), 'repl');
  assert.equal(contestoDi('AMMODERNAMENTO'), 'repl');
  assert.deepEqual(PARTI_SOLO, ['machine', 'ropes']);
  assert.deepEqual(PARTI_LOCALE, ['machine', 'ropes', 'controller']);
  assert.deepEqual(SOSTANZIALE, ['controller', 'machine', 'landingDoors', 'car', 'sling']);
});

test('interventoDi: i record di prima letti dalla forma', () => {
  assert.equal(interventoDi('new', null), 'TRASFORMAZIONE_COMPLETA');
  assert.equal(interventoDi('new', C(['machine'])), 'TRASFORMAZIONE_COMPLETA');
  // a replacement tested as new is a transformation
  assert.equal(interventoDi('repl', { norma: 'en81', parti: PARTI }), 'TRASFORMAZIONE_COMPLETA');
  assert.equal(interventoDi('repl', C(PARTI_RIFACIMENTO, { rifacimento: true })), 'AMMODERNAMENTO');
  // nothing chosen: the replacement's default
  assert.equal(interventoDi('repl', null), 'SOLO_ARGANO');
  assert.equal(interventoDi('repl', undefined), 'SOLO_ARGANO');
  for (const parti of [['machine'], ['machine', 'ropes'], ['machine', 'ropes', 'load']] as const) assert.equal(interventoDi('repl', C(parti)), 'SOLO_ARGANO', parti.join());
  assert.equal(interventoDi('repl', C(['machine', 'landingDoors'])), 'AMMODERNAMENTO');
  assert.equal(interventoDi('repl', C(['controller'])), 'AMMODERNAMENTO');
  assert.equal(interventoDi('repl', C(['ropes'])), 'AMMODERNAMENTO', 'senza l’argano non è «Solo argano»');
  assert.equal(interventoDi('repl', C(['machine', 'speed'])), 'AMMODERNAMENTO');
  // the stored default of a replacement read back normalised
  assert.equal(interventoDi('repl', collaudoOf(REPL)), 'SOLO_ARGANO');
});

test('interventoTo: trasformazione come impianto nuovo, solo argano, ammodernamento dalle parti di prima', () => {
  assert.deepEqual(interventoTo('TRASFORMAZIONE_COMPLETA'), { values: { context: 'new' }, collaudo: { norma: 'en81', parti: PARTI } });
  assert.deepEqual(interventoTo('SOLO_ARGANO'), { values: { context: 'repl' }, collaudo: { norma: '10411-1', parti: ['machine'] } });
  assert.deepEqual(interventoTo('AMMODERNAMENTO'), { values: { context: 'repl' }, collaudo: { norma: '10411-1', parti: ['machine'] } });
  // the ropes go with the machine when they were among the parts; the renovation is never a «Solo argano»
  assert.deepEqual(interventoTo('SOLO_ARGANO', C(PARTI_RIFACIMENTO, { norma: '10411-11', rifacimento: true })).collaudo, { norma: '10411-11', parti: ['machine', 'ropes'] });
  // a modernisation from a «Solo argano» keeps its parts with the machine; a renovation stays one
  assert.deepEqual(interventoTo('AMMODERNAMENTO', C(['ropes'])).collaudo.parti, ['machine', 'ropes']);
  assert.deepEqual(interventoTo('AMMODERNAMENTO', C(PARTI_RIFACIMENTO, { rifacimento: true })).collaudo, C(PARTI_RIFACIMENTO, { rifacimento: true }));
  // from a test as new its parts are the rule's, not answers: the machine only
  assert.deepEqual(interventoTo('AMMODERNAMENTO', { norma: 'en81', parti: PARTI }).collaudo, C(['machine']));
  assert.deepEqual(interventoTo('SOLO_ARGANO', { norma: 'en81', parti: PARTI }).collaudo, C(['machine']));
  // the standards added stay where they fit the base: EN 81-21 only as new, EN 81-80 only on a modification
  assert.deepEqual(interventoTo('TRASFORMAZIONE_COMPLETA', C(['machine'], { aggiuntive: ['en81', 'en81-21', 'en81-28', 'en81-80'] })).collaudo.aggiuntive, ['en81-21', 'en81-28']);
  assert.deepEqual(interventoTo('SOLO_ARGANO', { norma: 'en81', parti: PARTI, aggiuntive: ['en81-21', 'en81-28'] }).collaudo.aggiuntive, ['en81-28']);
});

test('interventoTo: andata e ritorno SOLO → AMMOD → TRASF → SOLO senza perdere marcatura, servizio, carichi, norme ammesse', () => {
  const known: Partial<Collaudo> = { marcatura: 'incerta', servizio: '1998-04-01', documentato: { Q: 630, P: 700, Mcw: 1015 } };
  const solo = C(['machine', 'ropes'], { norma: '10411-11', ...known, aggiuntive: ['en81-28', 'dm236'] });
  const amm = interventoTo('AMMODERNAMENTO', solo).collaudo;
  assert.deepEqual(amm, { ...solo, parti: ['machine', 'ropes'] });
  const tr = interventoTo('TRASFORMAZIONE_COMPLETA', amm);
  assert.equal(tr.values.context, 'new');
  assert.equal(tr.collaudo.norma, 'en81');
  assert.deepEqual(tr.collaudo.parti, PARTI);
  const back = interventoTo('SOLO_ARGANO', tr.collaudo).collaudo;
  assert.equal(back.marcatura, 'incerta');
  assert.equal(back.servizio, '1998-04-01');
  assert.deepEqual(back.documentato, known.documentato);
  assert.deepEqual(back.aggiuntive, ['en81-28', 'dm236']);
  // normalised, the part of UNI 10411 is the CE answer's (not known: by the service day, before the directives here)
  assert.equal(collaudoOf(REPL, back).norma, '10411-1');
  // the transformation's test as the documents read it: as new, nothing of the modification
  assert.deepEqual(collaudoOf(NEW, tr.collaudo), { norma: 'en81', parti: PARTI, aggiuntive: ['en81-28', 'dm236'] });
});

test('rifacimentoTo: tutte le parti tranne l’arcata e le variazioni risposte, funi nuove; e indietro', () => {
  const on = rifacimentoTo(true, C(['machine', 'speed', 'landingDoors'], { norma: '10411-11', marcatura: 'si', aggiuntive: ['en81-80'] }));
  assert.deepEqual(on.values, { keepRopes: false });
  assert.deepEqual(on.collaudo, { norma: '10411-11', parti: [...PARTI_RIFACIMENTO.slice(0, 3), 'cw', 'rails', 'landingDoors', 'carDoors', 'buffers', 'governor', 'controller', 'speed'],
    rifacimento: true, marcatura: 'si', aggiuntive: ['en81-80'] });
  assert.ok(PARTI_RIFACIMENTO.every((p) => on.collaudo.parti.includes(p)) && !on.collaudo.parti.includes('sling'));
  const off = rifacimentoTo(false, on.collaudo);
  assert.deepEqual(off, { values: { keepRopes: true }, collaudo: { norma: '10411-11', parti: ['machine'], marcatura: 'si', aggiuntive: ['en81-80'] } });
});

test('interventoValido: ogni regola rifiuta il suo caso', () => {
  const v = (t: Parameters<typeof interventoValido>[0], V: FormValues, ch: Collaudo | null) => interventoValido(t, V, ch);
  assert.deepEqual(v(null, REPL, C(['machine'])), ['intervento']);
  // the good ones
  assert.deepEqual(v('TRASFORMAZIONE_COMPLETA', NEW, null), []);
  assert.deepEqual(v('TRASFORMAZIONE_COMPLETA', NEW, { norma: 'en81', parti: PARTI }), []);
  assert.deepEqual(v('SOLO_ARGANO', REPL, C(['machine'])), []);
  assert.deepEqual(v('SOLO_ARGANO', REPL, C(['machine', 'ropes'], { norma: '10411-11' })), []);
  assert.deepEqual(v('AMMODERNAMENTO', REPL, C(['machine', 'landingDoors'])), []);
  assert.deepEqual(v('AMMODERNAMENTO', { ...REPL, keepRopes: false }, C(PARTI_RIFACIMENTO, { rifacimento: true })), []);
  assert.deepEqual(v('AMMODERNAMENTO', { ...REPL, compare: false }, C(['controller', 'landingDoors'])), [], 'argano che resta');
  // a transformation is a new lift, tested as new, never a renovation
  assert.deepEqual(v('TRASFORMAZIONE_COMPLETA', REPL, null), ['context']);
  assert.deepEqual(v('TRASFORMAZIONE_COMPLETA', NEW, C(['machine'])), ['norma']);
  assert.deepEqual(v('TRASFORMAZIONE_COMPLETA', NEW, { norma: 'en81', parti: PARTI, rifacimento: true }), ['rifacimento']);
  // a modification on an existing lift, under UNI 10411
  assert.deepEqual(v('SOLO_ARGANO', NEW, C(['machine'])), ['context']);
  assert.deepEqual(v('SOLO_ARGANO', REPL, null), ['norma']);
  assert.deepEqual(v('SOLO_ARGANO', REPL, { norma: 'en81', parti: PARTI }), ['norma']);
  assert.deepEqual(v('AMMODERNAMENTO', REPL, { norma: 'en81', parti: ['machine', 'car'] }), ['norma']);
  // «Solo argano»: the machine and its ropes, nothing else
  assert.deepEqual(v('SOLO_ARGANO', REPL, C(['machine', 'landingDoors'])), ['parti']);
  assert.deepEqual(v('SOLO_ARGANO', REPL, C(['machine', 'load'])), ['parti'], 'la portata non si sceglie');
  assert.deepEqual(v('SOLO_ARGANO', REPL, C(['machine', 'speed'])), ['parti'], 'la velocità fa un ammodernamento');
  assert.deepEqual(v('SOLO_ARGANO', REPL, C(['ropes'])), ['parti', 'compare']);
  assert.deepEqual(v('SOLO_ARGANO', { ...REPL, keepRopes: false }, C(PARTI_RIFACIMENTO, { rifacimento: true })), ['parti', 'rifacimento']);
  // a modernisation that is no more than a «Solo argano», or nothing
  assert.deepEqual(v('AMMODERNAMENTO', REPL, C(['machine'])), ['parti']);
  assert.deepEqual(v('AMMODERNAMENTO', REPL, C(['machine', 'ropes'])), ['parti']);
  assert.deepEqual(v('AMMODERNAMENTO', { ...REPL, compare: false }, C([])), ['parti']);
  // the renovation: every part of it, never the sling
  assert.deepEqual(v('AMMODERNAMENTO', { ...REPL, keepRopes: false }, C([...PARTI_RIFACIMENTO, 'sling'], { rifacimento: true })), ['sling']);
  assert.deepEqual(v('AMMODERNAMENTO', { ...REPL, keepRopes: false }, C(['machine', 'ropes', 'car'], { rifacimento: true })), ['rifacimento']);
  // the machine kept is not compared with itself; ropes of their own number and diameter are new
  assert.deepEqual(v('AMMODERNAMENTO', REPL, C(['controller'])), ['compare']);
  assert.deepEqual(v('SOLO_ARGANO', { ...REPL, keepRopes: false }, C(['machine'])), ['ropes']);
  assert.deepEqual(v('AMMODERNAMENTO', { ...REPL, keepRopes: false }, C(['machine', 'car'])), ['ropes']);
});

test('disegnoDi: locale macchina o vano', () => {
  const top = { ...REPL, layout: 'topDefl' }, bottom = { ...REPL, layout: 'bottom' };
  assert.equal(disegnoDi('SOLO_ARGANO', C(['machine']), top), 'locale');
  assert.equal(disegnoDi('SOLO_ARGANO', C(['machine', 'ropes', 'load']), top), 'locale');
  assert.equal(disegnoDi('AMMODERNAMENTO', C(['machine', 'controller']), top), 'locale');
  assert.equal(disegnoDi('AMMODERNAMENTO', C(['machine', 'car']), top), 'vano');
  assert.equal(disegnoDi('AMMODERNAMENTO', C(['machine', 'load']), top), 'vano', 'il carico va verificato nel vano');
  assert.equal(disegnoDi('TRASFORMAZIONE_COMPLETA', { parti: PARTI }, top), 'vano');
  // a machine below has no machine room over the shaft
  assert.equal(disegnoDi('SOLO_ARGANO', C(['machine']), bottom), 'vano');
  assert.equal(disegnoDi('AMMODERNAMENTO', C(['controller']), bottom), 'vano');
});

test('punto 21.1 e argano che resta', () => {
  assert.ok(sostanziale(C(['controller', 'machine', 'landingDoors', 'car', 'sling', 'ropes'])));
  assert.ok(!sostanziale(C(PARTI_RIFACIMENTO, { rifacimento: true })), 'il rifacimento tiene l’arcata');
  assert.ok(!sostanziale(C(['controller', 'machine', 'landingDoors', 'car'])));
  assert.ok(macchinaResta('AMMODERNAMENTO', C(['controller'])));
  assert.ok(!macchinaResta('AMMODERNAMENTO', C(['machine', 'controller'])));
  assert.ok(!macchinaResta('SOLO_ARGANO', C([])) && !macchinaResta(null, C([])));
});

/** A small deterministic generator (mulberry32): the same cases on every run. */
const rng = (seed: number) => (): number => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('collaudoOf è idempotente: la prova normalizzata, normalizzata di nuovo, è la stessa', () => {
  const r = rng(45), pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)] as T, some = <T>(a: readonly T[]): T[] => a.filter(() => r() < 0.35);
  const loads: FormValues[] = [{}, { Q: 630, P: 700, k: 0.5 }, { Q: 900, P: 800, k: 0.45, qeq: 380 }, { ...PRESETS.A }, { ...PRESETS.B }];
  const docs = [undefined, { Q: 630, P: 700, Mcw: 1015 }, { Q: 480, P: 650, Mcw: 900 }];
  let n = 0;
  for (let i = 0; i < 4000; i++) {
    const V: FormValues = { ...pick(loads), context: pick(['repl', 'repl', 'new']) };
    const marcatura = pick([undefined, ...MARCATURE]);
    const chosen: Collaudo | undefined = r() < 0.1 ? undefined : {
      norma: pick(NORME_COLLAUDO), parti: some(PARTI), ...(r() < 0.3 ? { rifacimento: true as const } : {}), ...(marcatura ? { marcatura } : {}),
      ...(marcatura === 'incerta' && r() < 0.6 ? { servizio: pick(['1990-01-01', '2001-06-30', '2015-01-01']) } : {}),
      ...(() => { const d = pick(docs); return d ? { documentato: d } : {}; })(), ...(r() < 0.5 ? { aggiuntive: some(NORME_AGGIUNTIVE) } : {}),
    };
    const once = collaudoOf(V, chosen);
    assert.deepEqual(collaudoOf(V, once), once, JSON.stringify({ V, chosen }));
    n++;
  }
  assert.equal(n, 4000);
});

test('fase 3 non tocca i motori: le versioni restano', () => {
  assert.equal(ENGINE_VERSION, '1.6.0');
  assert.equal(SHAFT_ENGINE_VERSION, '2.25.0');
  assert.equal(LIFT_ENGINE_VERSION, '1.31.0');
  assert.equal(ROOM_ENGINE_VERSION, '1.15.0');
});
