// Round 37 (package B): one machine on every path of a lift design.
// L2-03 — a direct pull hangs its falls from the sheave's two sides: the proposal the documents and the screens show
// (the relazione's section on the proposal, its alternatives, the form's proposal line, the calculation's page) takes
// only the sheave of the plan's drop, as the derivation's proposal does (lift/direct.ts, registry impianto.calata); the
// advice says why none of SICOR's and Montanari's takes it.
// L6-01 — a catalogue's machine switched to entered by hand (or carried from the calculator) is still that machine: the
// derivation draws and checks it as it stands, so its support's checks, its sheets, its relazione and its order are those
// of the machine proposed — a failing check does not pass because the value was entered by hand.
// The advice counts a model only where the proposal took it: the machine entered is not the result of every model tried.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import calcIt from '../../../messages/calc/it.json';
import { SHEAVE_GRID } from '@/calc/sizing';
import { SHAFT_ENGINE_VERSION } from '@/shaft';
import { VOCI_IMPIANTO, deriveLift, newLift, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { adviceOf, liftAdvice, liftAlternative } from '@/lib/lift/advice';
import { catalogValues } from '@/lib/lift/catalog';
import { dropSheaves, planFalls } from '@/lib/lift/direct';
import { NEW_MACHINE_FIELDS, enteredSeed } from '@/lib/lift/entered';
import { valueMarks } from '@/lib/lift/marks';
import { designMachine } from '@/lib/order/machine';
import { designBom } from '@/lib/prices/bom';
import { analyse, mirrorRopes, proposalValues } from '@/lib/present/analysis';
import { textsFor } from '@/lib/present/texts';
import { makeFmt, makePres } from '@/lib/present/tr';
import { buildReport } from '../report/build';
import { proposalBlocks } from '../report/build-parts';
import type { ReportBlock, ReportDoc } from '../report/model';
import { buildTavole } from '../tavole/build';
import { storedInput } from '../tavole/compose';

const fmt = makeFmt('it-IT'), X = textsFor(makePres(calcIt, 'it-IT'));
const direct = (L: LiftInputs): LiftInputs => ({ ...L, calc: { ...L.calc, layout: 'top' } });
const withHeb = (L: LiftInputs): LiftInputs => {
  const R = L.shaft.room;
  assert.ok(R);
  return { ...L, shaft: { ...L.shaft, room: { ...R, heb: {} } } };
};
const texts = (blocks: readonly ReportBlock[]): string[] => blocks.flatMap((b) => (b.t === 'kv' ? b.rows.flat() : b.t === 'grid' ? [...b.head, ...b.rows.flat()]
  : b.t === 'list' ? b.items : 'text' in b && typeof b.text === 'string' ? [b.text] : []));
/** The blocks of a section of the relazione, by the start of its title. */
const sectionOf = (doc: ReportDoc, title: string): ReportBlock[] => {
  const at = doc.blocks.findIndex((b) => b.t === 'h2' && b.text.replace(/^\d+\. /, '').startsWith(title));
  assert.ok(at >= 0, title);
  const end = doc.blocks.findIndex((b, j) => j > at && b.t === 'h2');
  return doc.blocks.slice(at + 1, end < 0 ? undefined : end);
};
const project = { name: 'Condominio Roma', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB-0001', client: 'Condominio Roma' };
function relazione(inp: LiftInputs, d: LiftDerived, advice = adviceOf([])): ReportDoc {
  return buildReport({
    calc: { id: 'cmtest0037', label: null, createdAt: new Date('2026-10-09T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
    project, company: 'Elevatori di prova', advice, values: d.values, reviews: [], plant: {},
    marks: valueMarks(inp.auto, d, d.bottom, d.collaudo),
    design: { id: 'cmdesign37', label: null, createdAt: new Date('2026-10-09T07:00:00Z'), sha256: 'e'.repeat(64), engineVersion: SHAFT_ENGINE_VERSION, profileId: 'IT-2026.1', author: null, source: null, layout: d.layout },
  });
}
/** Every shape of the drawing set, hashed: two sets alike to the last line and label. */
function setPrint(inp: LiftInputs, d: LiftDerived): string {
  const set = { number: '26-037', createdAt: new Date('2026-10-09T10:00:00Z'), authorInitials: 'M.R.', companyName: 'Elevatori di prova', projectData: project, plant: {}, revisions: [] };
  const x = storedInput(d.values, d.layout, set, null, valueMarks(inp.auto, d, d.bottom, d.collaudo));
  assert.ok(x);
  return createHash('sha256').update(JSON.stringify(buildTavole(x).doc)).digest('hex');
}

test('tiro diretto: la proposta del progetto, del modulo e della relazione è la puleggia della calata del piano', () => {
  const inp = direct(newLift()), d = deriveLift(inp), { N } = d.analysis.ctx, s = d.analysis.sizing;
  assert.equal(d.origin.machine, 'auto');
  assert.ok(d.calata !== null && Math.abs(d.calata - N.D) <= 1, 'la calata è la puleggia verificata');
  assert.equal(d.analysis.hold, 'drop');
  assert.ok(s.options.length > 0 && s.options.every((o) => o.D === N.D), 'alternative tutte con la puleggia della calata');
  assert.ok(s.pick && s.pick.D === N.D && s.pick.i === N.i && s.pick.n === N.n && s.pick.d === N.d, 'la proposta è l’argano verificato');
  // the same values as the calculator's (no plan): the grid, a smaller sheave
  const calc = analyse(d.values);
  assert.equal(calc.hold, null);
  assert.ok(calc.sizing.pick && calc.sizing.pick.D < N.D);
  // the calculation's page and the relazione take the design's sizing
  assert.deepEqual(analyse(d.values, true).sizing.pick?.D, N.D);
});

test('tiro diretto nella relazione: la proposta con la puleggia verificata, la nota della calata, il perché del confronto vuoto', () => {
  const inp = direct(newLift()), d = deriveLift(inp), { N } = d.analysis.ctx, doc = relazione(inp, d);
  const prop = sectionOf(doc, calcIt.c_prop), all = texts(prop);
  assert.ok(all.some((t) => t.startsWith(`${fmt(N.D, 0)} mm · D/d`) && t.endsWith(calcIt.p_drop)), 'la puleggia della calata');
  assert.ok(all.some((t) => t.startsWith(`1:${N.i} `)), 'il rapporto verificato');
  assert.ok(all.some((t) => t === `★ ${fmt(N.D, 0)} mm`), 'la stella sulla puleggia verificata');
  assert.ok(!all.some((t) => /^★ (?!\d+ mm$)/.test(t) || (t.startsWith('★ ') && t !== `★ ${fmt(N.D, 0)} mm`)));
  assert.ok(all.some((t) => t.startsWith('Tiro diretto:') && t.includes(`Ø ${fmt(N.D, 0)} mm (voce impianto.calata)`)));
  assert.ok(!all.some((t) => t.startsWith('Le alternative sono calcolate con la geometria')), 'nessuna nota su altre pulegge della griglia');
  // none of the advice's makers: why, and what another sheave asks
  const adv = texts(sectionOf(doc, 'Confronto degli argani SICOR e Montanari'));
  assert.ok(adv.some((t) => t.includes(`Ø ${fmt(N.D, 0)} mm, quanto la calata del piano`) && t.includes('il progetto va ripetuto')), adv.join('\n'));
  assert.ok(adv.some((t) => t.startsWith('Nessun argano SICOR o Montanari') && t.includes('resta l’argano verificato nel progetto')), adv.join('\n'));
  // the registry entry the notes cite is among those the relazione lists
  const calata = VOCI_IMPIANTO.find((v) => v.id === 'impianto.calata');
  assert.ok(calata && texts(sectionOf(doc, 'Voci normative usate')).includes(calata.titolo));
});

test('tiro diretto con la calata fuori dalla griglia, sostituzione col confronto: nessuna puleggia o la griglia', () => {
  const top = SHEAVE_GRID[SHEAVE_GRID.length - 1];
  assert.deepEqual(dropSheaves(top), [top]);
  assert.deepEqual(dropSheaves(top + 1), []);
  assert.deepEqual(dropSheaves(SHEAVE_GRID[0] - 1), []);
  // a machine entered by hand on falls wider than the grid: no proposal, said so
  const inp = direct(newLift()), d = deriveLift(inp), V = { ...d.values, n_D: top + 100 };
  const a = analyse(V, true);
  assert.equal(a.hold, 'drop');
  assert.deepEqual(a.sizing.options, []);
  const B = texts(proposalBlocks({ X, fmt, N: a.ctx.N, sizing: a.sizing, hold: a.hold, catalog: null, machine: null, through: false, design: true }));
  assert.ok(B.some((t) => t.startsWith('Tiro diretto:') && t.includes(`fuori dalla gamma del dimensionamento (da ${SHEAVE_GRID[0]} a ${top} mm)`)), B.join('\n'));
  // a replacement compared with the existing machine keeps its hitches: the grid
  const repl = analyse({ ...d.values, context: 'repl', compare: true }, true);
  assert.equal(planFalls(repl.ctx), false);
  assert.notEqual(repl.hold, 'drop');
  // another layout: the grid, whatever the design
  assert.equal(deriveLift(newLift()).analysis.hold, null);
});

test('relazione di un progetto con il rinvio: la proposta della griglia con un’altra puleggia è segnalata, non presentata come quella del progetto', () => {
  const inp = newLift(), d = deriveLift(inp), V = { ...d.values, n_D: 720 }, a = analyse(V, true), p = a.sizing.pick;
  assert.ok(p && p.D !== 720, 'la griglia propone un’altra puleggia');
  const B = texts(proposalBlocks({ X, fmt, N: a.ctx.N, sizing: a.sizing, hold: a.hold, catalog: null, machine: null, through: false, design: true }));
  assert.ok(B.some((t) => t.startsWith(`⚠ La puleggia proposta (Ø ${fmt(p.D, 0)} mm) non è quella verificata nel progetto (Ø 720 mm)`)), B.join('\n'));
  // the same sheave: the note on the alternatives
  const same = analyse(d.values, true), q = same.sizing.pick;
  assert.ok(q && q.D === same.ctx.N.D);
  const C = texts(proposalBlocks({ X, fmt, N: same.ctx.N, sizing: same.sizing, hold: same.hold, catalog: null, machine: null, through: false, design: true }));
  assert.ok(C.some((t) => t.startsWith(`Le alternative sono calcolate con la geometria della puleggia verificata (Ø ${fmt(q.D, 0)} mm)`)));
});

test('passare la macchina a «inserita»: ogni valore del nuovo argano, anche la massa del catalogo', () => {
  const inp: LiftInputs = { ...newLift(), catalog: { brand: 'Montanari', model: 'M93' } }, d = deriveLift(inp);
  const fit = d.catalog?.fit;
  assert.ok(fit && d.analysis.sizing.pick);
  // the fields the proposal and the catalogue set are all seeded
  const own = catalogValues(fit, d.values);
  assert.ok(own);
  for (const k of [...Object.keys(proposalValues(d.analysis.sizing.pick)), ...Object.keys(own)]) assert.ok(NEW_MACHINE_FIELDS.includes(k), k);
  const seed = enteredSeed(d, { machine: false });
  assert.equal(seed.n_mass, fit.machine.mass);
  assert.equal(seed.n_model, 'Montanari M93');
  assert.equal(seed.n_shaftMax, fit.machine.staticKg);
  // only what is switched off, and only a machine the software proposed
  assert.deepEqual(enteredSeed(d, { machine: true }), {});
  assert.deepEqual(enteredSeed({ ...d, origin: { ...d.origin, machine: 'entered' } }, { machine: false }), {});
  assert.deepEqual(enteredSeed(d, { P: false }), { P: d.values.P });
});

for (const [brand, model] of [['Montanari', 'M93'], ['SICOR', 'SH160'], ['Sassi', 'LEO']] as const) {
  for (const heb of [false, true]) {
    test(`${brand} ${model}${heb ? ' sulle putrelle HEB' : ''} proposto e poi inserito a mano: lo stesso argano, le stesse verifiche, gli stessi fogli`, () => {
      const base: LiftInputs = { ...newLift(), catalog: { brand, model } }, inp = heb ? withHeb(base) : base, a = deriveLift(inp);
      assert.equal(a.catalog?.fit?.machine.model, model);
      // the form's switch: the values as shown (LiftWorkspace setAuto)
      const hand: LiftInputs = { ...inp, auto: { ...inp.auto, machine: false }, calc: mirrorRopes({ ...inp.calc, ...enteredSeed(a, { machine: false }) }) };
      const b = deriveLift(hand);
      assert.equal(b.origin.machine, 'entered');
      assert.equal(b.catalog?.fit?.machine.model, model, 'riconosciuto dal catalogo');
      assert.ok(b.machine.shape, 'disegnato com’è');
      assert.equal(b.machine.axis, a.machine.axis);
      assert.equal(b.values.L0, a.values.L0);
      assert.deepEqual(b.supportChecks, a.supportChecks);
      assert.deepEqual(b.heb?.chosen.profile, a.heb?.chosen.profile);
      assert.equal(setPrint(hand, b), setPrint(inp, a), 'i fogli');
      // the documents name it and the order is for it, recorded
      const marks = valueMarks(hand.auto, b, b.bottom, b.collaudo);
      assert.equal(marks.machineProposed, false);
      assert.deepEqual(marks.catalog && [marks.catalog.brand, marks.catalog.model], [brand, model]);
      assert.deepEqual(designMachine(b) && [designMachine(b)?.brand, designMachine(b)?.model], [brand, model]);
      assert.equal(designBom(b).find((l) => l.label.item === 'machine')?.label.name, `${brand} ${model}`);
    });
  }
}

test('Montanari M93 sulle putrelle HEB inserito a mano: le verifiche che non passano restano, e la relazione le riporta per lo stesso argano', () => {
  const inp = withHeb({ ...newLift(), catalog: { brand: 'Montanari', model: 'M93' } }), a = deriveLift(inp);
  const hand: LiftInputs = { ...inp, auto: { ...inp.auto, machine: false }, calc: mirrorRopes({ ...inp.calc, ...enteredSeed(a, { machine: false }) }) };
  const b = deriveLift(hand), fails = (d: LiftDerived): string[] => d.supportChecks.filter((c) => c.status === 'fail').map((c) => c.id);
  assert.ok(fails(a).length > 0, 'l’argano proposto ha verifiche che non passano');
  assert.deepEqual(fails(b), fails(a));
  const doc = relazione(hand, b), all = texts(doc.blocks);
  assert.ok(all.some((t) => t.startsWith('Montanari M93 (inserito a mano con il modello del catalogo')), 'il modello');
  // the shaft's section reports the support's checks of this machine, failures included
  const shaft = doc.blocks.filter((x) => x.t === 'grid' && x.status?.includes('fail'));
  assert.ok(shaft.length > 0);
  // a machine entered by hand: the grid's proposal stays informative, not the catalogue's taken by the proposal
  assert.ok(!all.some((t) => t.startsWith('Argano a catalogo:')));
});

test('argano a catalogo inserito a mano che nessun modello prende: il consiglio non lo ripete come esito di ogni modello provato', () => {
  const inp: LiftInputs = { ...newLift(), catalog: { brand: 'Montanari', model: 'M93' } }, seed = enteredSeed(deriveLift(inp), { machine: false });
  // a car too heavy for every model: no proposal, the values entered are still M93 (drawn, checked, ordered as it)
  const heavy: LiftInputs = { ...inp, catalog: undefined, auto: { ...inp.auto, P: false }, calc: mirrorRopes({ ...inp.calc, ...seed, P: 4000 }) };
  const d = deriveLift(heavy), A = liftAdvice(heavy);
  assert.equal(d.noProposal, true);
  assert.deepEqual(d.issues, [], 'un progetto che si salva');
  assert.equal(d.catalog?.fit?.machine.model, 'M93');
  assert.equal(designMachine(d)?.model, 'M93');
  assert.deepEqual(A.candidates, []);
  assert.ok(!texts(sectionOf(relazione(heavy, d, A), 'Confronto degli argani SICOR e Montanari')).some((t) => t.includes('M93')));
  // a direct pull whose drop is beyond the grid, the machine proposed or entered: none, so the diverting pulley's advice
  for (const machine of [true, false]) {
    const deep: LiftInputs = { ...inp, catalog: undefined, auto: { ...inp.auto, machine }, shaft: { ...inp.shaft, W: 2000, D: 2300 },
      calc: mirrorRopes({ ...inp.calc, ...seed, layout: 'top' }) };
    const e = deriveLift(deep), B = liftAdvice(deep), alt = liftAlternative(deep, B);
    assert.ok(e.calata !== null && e.calata > SHEAVE_GRID[SHEAVE_GRID.length - 1]);
    assert.equal(e.catalog?.fit?.machine.model, 'M93');
    assert.deepEqual(B.candidates, []);
    assert.ok(alt && alt.candidates.length > 0 && alt.candidates.every((c) => c.I.layout === 'topDefl'));
  }
});
