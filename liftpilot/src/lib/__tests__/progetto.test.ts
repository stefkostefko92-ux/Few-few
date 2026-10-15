// The Progetto draws (round 45): the browser's drawing carries the geometry only, the server composes the one form from it
// and from the base calculation — the shaft's rated load and speed and the calculation are the base's, the car's mass and
// the machine as entered there, the test the base's, no catalog. A design of any time read back as a drawing and composed
// on its own calculation is the same design (same inputs, same hashes), for every intervention and every scheme of a
// machine below; what the drawing completes of the calculation is listed within the screen's tolerances.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canon, snapshotOf } from '@/calc/snapshot';
import type { FormValues } from '@/calc/types';
import { LIFT_ENGINE_VERSION, PARTI_RIFACIMENTO, deriveLift, defaultLift, newLift, type LiftInputs } from '@/lib/lift';
import { progettoInputsReadSchema, progettoInputsSchema } from '@/lib/lift-input';
import { TOLLERANZE, autoNuovo, baseOf, blankProgetto, composto, dalComposto, differenzeCalcolo, liftInputsOf, progettoOf, type ProgettoInputs } from '@/lib/lift/progetto';
import { bottomTo, missingOf } from '@/lib/lift/blank';
import { shaftSnapshot } from '@/shaft';

/** A design as the Progetto composes it: the shaft's rated load and speed are the calculation's, the car's mass and the
 *  machine as entered, no catalog. */
const composed = (L: LiftInputs): LiftInputs => {
  const { catalog: _drop, ...rest } = L;
  void _drop;
  return {
    ...rest, auto: { ...L.auto, P: false, machine: false },
    shaft: { ...L.shaft, Q: Math.round(Number(L.calc.Q)), vertical: { ...L.shaft.vertical, v: Number(L.calc.v) } },
  };
};
const repl = (): LiftInputs => { const L = defaultLift(); return { ...L, calc: { ...L.calc, context: 'repl', keepRopes: true } }; };
const below = (bottom: 'head' | 'room' | 'under'): LiftInputs => { const L = newLift(); return { ...L, calc: { ...L.calc, layout: 'bottom' }, bottom }; };

const FIXTURES: Record<string, () => LiftInputs> = {
  nuovo: () => composed(newLift()),
  sostituzione: () => composed(repl()),
  rifacimento: () => composed({ ...repl(), calc: { ...repl().calc, keepRopes: false }, collaudo: { norma: '10411-1', parti: PARTI_RIFACIMENTO, rifacimento: true } }),
  'ammodernamento 10411-11': () => composed({ ...repl(), collaudo: { norma: '10411-11', parti: ['machine', 'landingDoors', 'controller'], marcatura: 'si' } }),
  'diretto, h a mano': () => composed({ ...newLift(), calc: { ...newLift().calc, layout: 'top' } }),
  'rinvio, h dal disegno': () => { const L = composed(newLift()); return { ...L, auto: { ...L.auto, dx: false }, calc: { ...L.calc, h: 0.55 } }; },
  'in basso, testata': () => composed(below('head')),
  'in basso, locale delle pulegge': () => composed(below('room')),
  'in basso, sotto il vano': () => composed(below('under')),
};

/** The hashes a save makes of a design: the lift design's, the shaft design's and the derived calculation's — each the
 *  SHA-256 of the canonical JSON (canon-hash.ts, server-only: the same function here). */
const sha = (x: unknown): string => createHash('sha256').update(JSON.stringify(canon(x))).digest('hex');
function hashes(L: LiftInputs): { lift: string; shaft: string; calc: string } {
  const d = deriveLift(L), shaft = sha(shaftSnapshot(d.shaft).snapshot), calc = sha(snapshotOf(d.values));
  return { lift: sha({ engine: LIFT_ENGINE_VERSION, inputs: canon(L), shaft, calc }), shaft, calc };
}

test('liftInputsOf: portata e velocità dal calcolo, peso e argano come inseriti, la prova del calcolo, nessun catalogo', () => {
  const p: ProgettoInputs = { ...progettoOf(newLift()), shaft: { ...newLift().shaft, Q: 1200, vertical: { ...newLift().shaft.vertical, v: 2.5 } } };
  const base = { values: { ...newLift().calc, Q: 629.6, v: 1.6, layout: 'topDefl', h: 0.6 }, collaudo: { norma: '10411-11' as const, parti: ['machine' as const] } };
  const L = liftInputsOf({ ...p, auto: { L0: true, dx: false, Hv: true }, h: 0.45, bottom: 'head' }, base);
  assert.equal(L.shaft.Q, 630);
  assert.equal(L.shaft.vertical.v, 1.6);
  assert.deepEqual(L.auto, { P: false, machine: false, L0: true, dx: false, Hv: true });
  assert.deepEqual(L.collaudo, base.collaudo);
  assert.equal(L.catalog, undefined);
  assert.equal(L.calc.h, 0.45, 'h dal disegno sul rinvio');
  assert.equal(L.bottom, undefined, 'lo schema in basso solo con la macchina in basso');
  // the plan's h only on a diverting pulley; the same number keeps the calculation's value as stored
  assert.equal(liftInputsOf({ ...p, h: 0.45 }, { values: { ...base.values, layout: 'top', h: 0.6 } }).calc.h, 0.6);
  assert.equal(liftInputsOf({ ...p, h: 0.6 }, { values: { ...base.values, h: '0.6' } }).calc.h, '0.6');
  assert.equal(liftInputsOf(p, { values: base.values }).collaudo, undefined, 'nessuna prova scelta: nessuna');
  assert.equal(liftInputsOf({ ...p, bottom: 'room' }, { values: { ...base.values, layout: 'bottom' } }).bottom, 'room');
});

test('progettoOf ∘ liftInputsOf: il disegno ritorna com’era', () => {
  const p: ProgettoInputs = { shaft: newLift().shaft, auto: { L0: false, dx: false, Hv: true, panel: true }, h: 0.5 };
  assert.deepEqual(progettoOf(liftInputsOf(p, { values: { ...newLift().calc, layout: 'topDefl' } })), { ...p, shaft: { ...p.shaft, Q: Math.round(Number(newLift().calc.Q)),
    vertical: { ...p.shaft.vertical, v: Number(newLift().calc.v) } } });
});

for (const [name, make] of Object.entries(FIXTURES)) {
  test(`un progetto di prima ricomposto sul suo calcolo: stessi dati, stessi hash (${name})`, () => {
    const L = make(), again = liftInputsOf(progettoOf(L), baseOf(L));
    assert.deepEqual(canon(again), canon(L));
    assert.deepEqual(hashes(again), hashes(L));
    // what the browser sends parses with the save's strict schema
    assert.ok(progettoInputsSchema.safeParse(progettoOf(L)).success, name);
  });
}

test('un progetto qualsiasi ricomposto cambia solo portata e velocità del vano, peso, argano e catalogo', () => {
  const L: LiftInputs = { ...newLift(), catalog: { brand: 'SICOR' }, shaft: { ...newLift().shaft, Q: null } };
  const again = liftInputsOf(progettoOf(L), baseOf(L));
  assert.equal(again.shaft.Q, Math.round(Number(L.calc.Q)));
  assert.equal(again.shaft.vertical.v, Number(L.calc.v));
  const back = { ...again, shaft: { ...again.shaft, Q: null, vertical: L.shaft.vertical }, auto: L.auto, catalog: L.catalog };
  assert.deepEqual(canon(back), canon(L));
});

test('lo schema del disegno rifiuta calcolo, prova, catalogo e gli interruttori del peso e dell’argano', () => {
  const p = progettoOf(composed(newLift()));
  assert.ok(progettoInputsSchema.safeParse(p).success);
  assert.ok(progettoInputsReadSchema.safeParse(p).success);
  const extra: Record<string, unknown>[] = [
    { ...p, calc: newLift().calc }, { ...p, collaudo: { norma: 'en81', parti: [] } }, { ...p, catalog: { brand: 'SICOR' } },
    { ...p, auto: { ...p.auto, P: true } }, { ...p, auto: { ...p.auto, machine: false } }, { ...p, h: -1 }, { ...p, h: '0.5' }, { ...p, bottom: 'side' },
  ];
  for (const x of extra) assert.equal(progettoInputsSchema.safeParse(x).success, false, JSON.stringify(Object.keys(x)));
});

test('blankProgetto: niente portata, velocità, tiro e posto della macchina da inserire', () => {
  const b = blankProgetto();
  for (const k of ['Q', 'Qkg', 'v', 'r', 'layout'] as const) assert.ok(!b.blank.includes(k), k);
  for (const k of ['W', 'D', 'entrances', 'door', 'floors', 'pit', 'headroom', 'bottom'] as const) assert.ok(b.blank.includes(k), k);
  assert.deepEqual(b.progetto.auto, { L0: true, dx: true, Hv: true, panel: true });
  assert.deepEqual(Object.keys(b.progetto).sort(), ['auto', 'shaft']);
});

test('differenzeCalcolo: le tolleranze dello schermo, i rinvii in più mai una differenza da soli', () => {
  const base: FormValues = { layout: 'topDefl', H: 18, L0: 2, dx: 0.3, h: 0.6, Hv: 24, nps: 1 };
  const same = differenzeCalcolo(base, { ...base, H: 18.009, L0: 2.049, dx: 0.3049, h: 0.5951 }, 0);
  assert.deepEqual(same.map((r) => r.key), ['H', 'L0', 'dx', 'h', 'nps']);
  assert.ok(same.every((r) => !r.differs));
  const off = differenzeCalcolo(base, { ...base, H: 18.02, L0: 2.06, dx: 0.306, h: 0.594 }, 0);
  assert.deepEqual(off.filter((r) => r.differs).map((r) => r.key), ['H', 'L0', 'dx', 'h']);
  assert.deepEqual(TOLLERANZE, { H: 0.01, L0: 0.05, dx: 0.005, h: 0.005, Hv: 0.05 });
  // a machine below: Hv, and the extra head pulleys of its scheme added to the base's bends
  const low = differenzeCalcolo({ ...base, layout: 'bottom' }, { ...base, layout: 'bottom', Hv: 24.2, nps: 3 }, 4);
  assert.deepEqual(low.map((r) => r.key), ['H', 'L0', 'Hv', 'nps']);
  assert.deepEqual(low.find((r) => r.key === 'nps'), { key: 'nps', base: 3, drawn: 3, differs: false });
  assert.ok(low.find((r) => r.key === 'Hv')?.differs);
  // a direct pull: only the travel and the rope beyond it
  assert.deepEqual(differenzeCalcolo({ ...base, layout: 'top' }, base, 0).map((r) => r.key), ['H', 'L0', 'nps']);
  // nps of another scheme is shown, never flagged
  assert.equal(differenzeCalcolo(base, { ...base, nps: 5 }, 0).find((r) => r.key === 'nps')?.differs, false);
});

test('il disegno sulla sua base (step 6): da inserire solo la geometria; i cambi del modulo tornano disegno, h della pianta tenuta', () => {
  const b = blankProgetto(), L = defaultLift(), repl = baseOf({ ...L, calc: { ...L.calc, context: 'repl', layout: 'topDefl' } });
  const missing = missingOf(composto(b, repl));
  for (const k of ['Q', 'Qkg', 'v', 'r', 'layout', 'bottom'] as const) assert.ok(!missing.includes(k), `${k}: del calcolo`);
  assert.ok(missing.includes('W') && missing.includes('floors'));
  // a machine below asks the scheme of its ropes: the drawing's
  const low = baseOf({ ...L, calc: { ...L.calc, layout: 'bottom' } });
  assert.ok(missingOf(composto(b, low)).includes('bottom'));
  const withScheme = dalComposto(bottomTo(composto(b, low), 'room'), undefined);
  assert.equal(withScheme.progetto.bottom, 'room');
  assert.ok(!withScheme.blank.includes('bottom') && !withScheme.blank.includes('layout'));
  // the plan's h stays the drawing's through a change; the base's own is not taken as the drawing's
  const drawn = { ...b, progetto: { ...b.progetto, h: 0.75 } };
  assert.equal(dalComposto(composto(drawn, repl), drawn.progetto.h).progetto.h, 0.75);
  assert.equal(dalComposto(composto(b, repl), undefined).progetto.h, undefined);
  // the switches of a drawing started anew: dx from the plan only for a transformation
  assert.equal(autoNuovo(repl).dx, false);
  assert.equal(autoNuovo(baseOf(newLift())).dx, true);
});
