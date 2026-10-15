// The machine the intervention keeps (round 46, B8; src/lib/lift/kept.ts, src/shaft/room-kept.ts): a calculation of an
// existing installation whose test keeps the machine is drawn and loaded as it is — on its existing base where the
// calculation's L0 puts the sheave's axis, without a new support, mounts, HEB beams, hook or pulley's frame, the openings
// existing; none of a new support's checks; on sheet 1 the existing machine, the base «da rilevare» and one resultant;
// the 3D builds. Any other calculation is drawn as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entity } from '@/drawing';
import { deriveLift, newLift, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { keptAxis, keptInputs, macchinaEsistente } from '@/lib/lift/kept';
import { liftInputsOf, progettoOf } from '@/lib/lift/progetto';
import { valueMarks } from '@/lib/lift/marks';
import { buildTavole } from '@/lib/tavole/build';
import { storedInput } from '@/lib/tavole/compose';
import { roomGeo, roomPlanEntities, roomSectionEntities, section } from '@/shaft';
import { NON_SU_ESISTENTE } from '@/shaft/support-check';
import { ropeRig } from '@/lib/lift';
import { createLiftMaterials } from '@/components/lift3d/materials';
import { buildRoom } from '@/components/lift3d/room';
import { shaftSlabOpenings } from '@/components/lift3d/slab';
import { governorSpot } from '@/components/lift3d/governor';

const base = newLift();
/** The example's installation as a modification: the machine replaced (`swap`) or kept, its values the swap's. */
function pair(layout: 'topDefl' | 'top', room: Partial<NonNullable<LiftInputs['shaft']['room']>> = {}): { swap: LiftInputs; kept: LiftInputs; d0: LiftDerived } {
  const R = base.shaft.room;
  assert.ok(R, 'locale macchina');
  const swap: LiftInputs = { ...base, shaft: { ...base.shaft, room: { ...R, ...room } }, calc: { ...base.calc, layout, context: 'repl', compare: false },
    auto: { ...base.auto, machine: false, P: false }, collaudo: { norma: '10411-1', parti: ['machine', 'controller'] } };
  const d0 = deriveLift(swap);
  return { swap, kept: { ...swap, calc: { ...d0.values }, collaudo: { norma: '10411-1', parti: ['controller'] } }, d0 };
}
const words = (es: readonly Entity[]): string => es.flatMap((e) => (e.e === 'text' || e.e === 'tag' ? [e.text] : e.e === 'chain' ? (e.c.text ?? []).flatMap((t) => (t ? [t] : [])) : [])).join(' | ');
function drawings(d: LiftDerived): { section: string; plan: string; hidden: number } {
  const G = roomGeo(d.layout, d.machine);
  assert.ok(G, 'locale');
  const plan = roomPlanEntities(d.layout, d.machine, G).entities;
  return { section: words(roomSectionEntities(d.layout, d.machine, G).entities), plan: words(plan), hidden: plan.filter((e) => e.e === 'path' && e.st === 'hidden').length };
}
function sheets(inp: LiftInputs, d: LiftDerived): string[] {
  const marks = valueMarks(inp.auto, d, d.bottom, d.collaudo);
  const x = storedInput(d.values, d.layout, { number: '26-046', createdAt: new Date('2026-10-15T10:00:00Z'), authorInitials: 'M.R.', companyName: 'S',
    projectData: { name: 'R', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: '', client: '' }, plant: {}, revisions: [] }, null, marks, null, undefined, 'AMMODERNAMENTO');
  assert.ok(x);
  return buildTavole(x).doc.pages.map((p) => p.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])).join(' | '));
}

test('la condizione è fisica: calcolo di un impianto esistente che tiene la macchina, qualunque sia il tipo', () => {
  const { swap, kept } = pair('topDefl');
  assert.equal(macchinaEsistente(kept), true);
  assert.equal(macchinaEsistente(swap), false);
  assert.equal(macchinaEsistente({ calc: { ...kept.calc, context: 'new' }, collaudo: kept.collaudo }), false, 'a new lift is tested as new');
  // an existing base sent with another calculation is the software's own again
  const R = swap.shaft.room;
  assert.ok(R);
  assert.equal(keptInputs({ ...swap, shaft: { ...swap.shaft, room: { ...R, support: { kind: 'esistente', of: 'frame' } } } }).shaft.room?.support, undefined);
});

test('B-B e pianta: il basamento esistente da rilevare, nessun antivibrante, telaio, putrella HEB o gancio; i fori esistenti tratteggiati', () => {
  for (const layout of ['topDefl', 'top'] as const) {
    const { kept, swap, d0 } = pair(layout, { heb: {} }), d = deriveLift(kept), was = drawings(d0), now = drawings(d);
    assert.equal(d.shaft.room?.support?.kind, 'esistente', layout);
    assert.equal(d.heb, null, `${layout}: no HEB beams`);
    assert.ok(/antivibranti/i.test(was.section) && /telaio/i.test(was.section + was.plan) && /GANCIO/i.test(was.plan), `${layout}: the new machine as before`);
    for (const [what, text] of [['B-B', now.section], ['pianta', now.plan]] as const) {
      assert.ok(!/antivibranti/i.test(text), `${layout} ${what}: ${text}`);
      assert.ok(!/telaio/i.test(text), `${layout} ${what}: ${text}`);
      assert.ok(!/gancio/i.test(text), `${layout} ${what}`);
      assert.ok(!text.includes('(STIMA)'), `${layout} ${what}`);
    }
    // (the note wrapped in its lines)
    assert.ok(now.section.replace(/ \| /g, ' ').includes('BASAMENTO ESISTENTE — DA RILEVARE: POSIZIONE, ALTEZZA E APPOGGI'), now.section);
    assert.ok(now.plan.includes('FORO ESISTENTE') && !/FORO \d/.test(now.plan), now.plan);
    assert.ok(now.hidden > was.hidden, `${layout}: the existing openings and base dashed`);
    // the replaced machine's drawing does not move
    assert.deepEqual(drawings(deriveLift(swap)), was);
  }
});

test('le verifiche di un basamento nuovo non si calcolano; restano quelle dell’argano nel locale', () => {
  const { kept, d0 } = pair('topDefl', { support: { kind: 'beams' }, heb: {} }), d = deriveLift(kept), ids = d.supportChecks.map((c) => c.id);
  assert.ok(d0.supportChecks.some((c) => NON_SU_ESISTENTE.has(c.id)), 'the new machine on its beams is checked');
  assert.deepEqual(ids.filter((id) => NON_SU_ESISTENTE.has(id)), []);
  for (const id of ['m_fit', 'm_free', 'm_panel', 'm_quadro', 'm_route'] as const) assert.ok(ids.includes(id), id);
});

test('L0 del calcolo: l’asse ne viene; un asse impossibile è il problema L0; dx e h restano del calcolo', () => {
  const { kept, d0 } = pair('topDefl'), d = deriveLift(kept);
  assert.equal(d.values.L0, kept.calc.L0);
  assert.equal(d.origin.L0, 'entered');
  assert.equal(d.origin.dx, 'entered');
  assert.equal(d.values.h, kept.calc.h);
  assert.ok(Math.abs(d.machine.axis - keptAxis(kept)) < 0.5, `${d.machine.axis} vs ${keptAxis(kept)}`);
  assert.ok(Math.abs(d.machine.axis - d0.machine.axis) < 0.5, 'the same machine at the same L0: the same axis');
  assert.deepEqual(d.issues, []);
  assert.equal(d.machine.rinvio?.on, 'esistente', 'the existing pulley without frame or stand');
  const low = deriveLift({ ...kept, calc: { ...kept.calc, L0: 0.4 } });
  assert.ok(low.issues.includes('L0'), JSON.stringify(low.issues));
  // the Progetto on it: the calculation's L0 and dx·h, whatever the drawing's switches
  const p = progettoOf({ ...kept, auto: { ...kept.auto, L0: true, dx: true }, calc: { ...kept.calc, h: 0.9 } });
  const inp = liftInputsOf({ ...p, h: 0.95 }, { values: kept.calc, collaudo: kept.collaudo ?? null });
  assert.equal(inp.auto.L0, false);
  assert.equal(inp.auto.dx, false);
  assert.equal(inp.calc.h, kept.calc.h);
});

test('foglio 1: argano esistente, basamento da rilevare senza massa, una risultante, la nota sul punto 5', () => {
  const { kept } = pair('topDefl'), d = deriveLift(kept), [s = '', ...rest] = sheets(kept, d), drawn = rest.join(' | ');
  assert.ok(s.includes('ARGANO ESISTENTE'), s);
  assert.ok(s.includes('BASAMENTO ESISTENTE (DA RILEVARE)'));
  assert.ok(!/BASAMENTO[^|]*\(STIMA/.test(s) && !s.includes('TELAIO CON RINVIO'));
  assert.ok(s.includes('RISULTANTE SUL BASAMENTO ESISTENTE, STATICA') && s.includes('RISULTANTE SUL BASAMENTO ESISTENTE, DINAMICA'));
  assert.ok(s.includes('RIPARTIZIONE SUGLI APPOGGI DEL BASAMENTO ESISTENTE') && !/REAZIONI APPOGGI R1/.test(s) && !s.includes('GANCIO DI SOLLEVAMENTO'));
  assert.ok(s.includes('ARGANO ESISTENTE SUL SUO BASAMENTO'));
  // the drawing sheets: no mounts, no hook, not even in the plan's legend
  assert.ok(drawn.includes('FORO ESISTENTE') && !/antivibranti/i.test(drawn) && !/Gancio/.test(drawn), drawn.slice(0, 200));
});

test('3D: il basamento esistente come blocco neutro, senza gancio — si costruisce', () => {
  const { kept } = pair('topDefl'), dv = deriveLift(kept), L = dv.layout, S = section(L), N = dv.analysis.ctx.N, rig = ropeRig(dv), gov = governorSpot(L);
  const sim = dv.sim, travel = [sim.levels[0], sim.levels.at(-1) ?? 0].map((s) => [s, sim.cw0 - s] as const), slab = (L.inputs.room?.slab ?? 250);
  const G = roomGeo(L, dv.machine);
  const r = buildRoom(L, rig, N.n, N.d, N.D, S.ceiling, createLiftMaterials(), shaftSlabOpenings(rig, N.n, N.d, S, slab, travel, gov), gov,
    dv.machine.shape ?? null, dv.machine.rinvio ?? null, null, G?.dir ?? 1, null, null, null);
  assert.ok(r.common.children.length > 0);
});
