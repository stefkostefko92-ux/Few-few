// The rails' development of round 37: every rail with its own bracket and every level with its code, as the plans, the
// list of articles and the 3D count them; a side counterweight's bridge counted and described; legible at any height —
// never coarser than 1:200, in columns and on more sheets when the shaft is tall, no lettering on another, the notes
// and the rails' names clear of the dimensions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME, drawingArea, shapeBox, type Shape, type TextShape } from '@/drawing';
import { defaultInputs, layout, type ShaftInputs } from '@/shaft';
import { headOf } from '@/shaft/head';
import { cwPlanCode } from '@/shaft/plan-staffe';
import { bridgeHeights, designPieces, onBridge, railHeights, wallCarRail } from '@/shaft/rail-brackets';
import { devRails } from '@/shaft/rails-cols';
import type { Layout } from '@/shaft/types';
import { panevBom } from '../catalog/panev';
import { inputViews } from '../cad/project';
import { deriveLift, newLift, type LiftInputs } from '../lift';
import { valueMarks } from '../lift/marks';
import { designBom } from '../prices/bom';
import { makeFmt } from '../present/tr';
import { setSheets } from '../tavole/build';
import { storedInput } from '../tavole/compose';
import type { TavoleInput } from '../tavole/input';
import { RAILS_SCALES, railsNotes, railsSheets } from '../tavole/rails-sheet';

const fmt = makeFmt('it-IT'), X = { fx: '30', fy: '59', kept: false };
const lift = (shaft: Partial<ShaftInputs>): LiftInputs => ({ ...newLift(), shaft: { ...defaultInputs(1600, 1750), ...shaft } });
const floors = (n: number, rise: number): Partial<ShaftInputs> => {
  const I = defaultInputs(1600, 1750);
  return { vertical: { ...I.vertical, main: 0, floors: Array.from({ length: n }, (_, i) => ({ label: String(i), rise: i === n - 1 ? 0 : rise, door: 'A' })) } };
};
const tavole = (L0: LiftInputs): TavoleInput => {
  const d = deriveLift(L0), project = { name: 'Prova', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB 1', client: 'C' };
  const x = storedInput(d.values, d.layout, { number: '26-037', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M.R.', companyName: 'S', projectData: project, plant: {}, revisions: [] },
    null, valueMarks(L0.auto, d, d.bottom, d.collaudo));
  assert.ok(x);
  return x;
};
/** The articles a code of the plans counts ("8× SU 220 160 + SG 80 150": 8 of each). */
const articles = (code: string | null, into: Map<string, number>): void => {
  const m = /^(\d+)× (.+)$/.exec(code ?? '');
  if (m) for (const a of (m[2] ?? '').split(' + ')) into.set(a, (into.get(a) ?? 0) + Number(m[1]));
};

test('guide del contrappeso: ogni guida con la sua staffa, ogni livello con il suo codice, come le piante e la distinta (W2-L1b-01, -02)', () => {
  const cases: readonly (readonly [string, Partial<ShaftInputs>])[] = [
    ['testata più indietro', { head: { front: 0, rear: -10, left: 0, right: 0 } }],
    ['contrappeso fuori asse', { cw: 'rear', plan: { cwPos: 150 } }],
    ['contrappeso a destra, verso il fondo', { cw: 'right', plan: { cwPos: 700 } }],
  ];
  for (const [name, shaft] of cases) {
    const L: Layout = deriveLift(lift(shaft)).layout, I = L.inputs, notes = railsNotes(L, X, fmt).join(' '), plans = new Map<string, number>();
    for (const r of L.rails.filter((x) => x.kind === 'cw')) {
      const main = cwPlanCode(L, r), up = I.head ? cwPlanCode(L, r, headOf(I)) : null;
      // the sheet writes each rail's code at each level as the plans do
      for (const c of [main, up]) if (c) assert.ok(notes.includes(c), `${name}: ${c}`);
      articles(main, plans);
      articles(up, plans);
    }
    // the plans' codes add up to what the list of articles orders
    const bom = new Map(panevBom(L).rows.filter((x) => x.use === 'cw').map((x) => [x.article.code, x.qty]));
    assert.deepEqual([...plans].sort(), [...bom].sort(), name);
  }
  // two rails that take different articles: both named with their side
  const L = deriveLift(lift({ cw: 'rear', plan: { cwPos: 150 } })).layout, codes = L.rails.filter((r) => r.kind === 'cw').map((r) => cwPlanCode(L, r));
  assert.equal(new Set(codes).size, 2, codes.join(' | '));
  for (const [i, side] of ['guida SX', 'guida DX'].entries()) assert.ok(railsNotes(L, X, fmt).join(' ').includes(`${side} ${codes[i]}`), side);
});

test('staffa a ponte: contata, descritta e disegnata; la guida di cabina sul ponte senza tasselli né «0 mm» (W2-G7-03)', () => {
  const x = tavole(lift({ cw: 'left' })), s = setSheets(x), L = s.L, d = deriveLift(lift({ cw: 'left' }));
  assert.ok(L.bridge);
  const bh = bridgeHeights(L), car = L.rails.find((r) => onBridge(L, r)), wall = wallCarRail(L);
  assert.ok(car && wall);
  const notes = railsNotes(L, s.ds.rails, fmt), all = notes.join(' ');
  assert.ok(!/ 0 mm al piede/.test(all), all);
  assert.ok(all.includes('SX sulla staffa a ponte'), all);
  const bridge = notes.find((t) => t.startsWith('STAFFA A PONTE'));
  assert.ok(bridge?.includes(`${bh.length} pezzi lunghi ${fmt(L.bridge.y1 - L.bridge.y0, 0)} mm`) && bridge.includes('senza tasselli'), bridge);
  // the list of articles: the bridge at its heights, the car's brackets only on the rail anchored to a wall
  const q = (key: string): number => designBom(d).find((l) => l.key === key)?.qty ?? 0;
  assert.equal(q('bracket:bridge'), bh.length);
  assert.equal(q('bracket:car'), railHeights(d.layout, wall).length);
  // sheet 1 says so, the development draws it
  const row = s.ds.sheet.specs.find((r) => r[0] === 'STAFFE GUIDE DI CABINA');
  assert.equal(row?.[2], `${railHeights(L, wall).length + bh.length} (${bh.length} SULLA STAFFA A PONTE)`);
  const rails = s.sheets.filter(({ spec }) => spec.k === 'rails'), texts = rails.flatMap(({ drawn }) => drawn.shapes.flatMap((t) => (t.t === 'text' ? [t.text] : [])));
  assert.ok(texts.some((t) => t.endsWith('CON STAFFA A PONTE')));
});

/** The lettering of a sheet that overlaps another by more than 0.4 mm both ways. */
function overlaps(shapes: readonly Shape[]): string[] {
  const T = shapes.filter((q): q is TextShape => q.t === 'text'), out: string[] = [];
  for (let a = 0; a < T.length; a++) for (let c = a + 1; c < T.length; c++) {
    const p = shapeBox(T[a] as TextShape), r = shapeBox(T[c] as TextShape);
    if (Math.min(p.x1, r.x1) - Math.max(p.x0, r.x0) > 0.4 && Math.min(p.y1, r.y1) - Math.max(p.y0, r.y0) > 0.4) out.push(`«${T[a]?.text}» × «${T[c]?.text}»`);
  }
  return out;
}

test('sviluppo delle guide leggibile a ogni altezza: mai oltre 1:200, a colonne e su più fogli, nessun testo su un altro (W2-L5t-04, W2-L5o-01, -02)', () => {
  for (const [n, rise] of [[2, 3000], [6, 3000], [12, 3700], [18, 3000], [25, 3000], [25, 4500], [40, 3000], [60, 3000]] as const) {
    const x = tavole(lift(floors(n, rise))), s = setSheets(x), L = s.L, sheets = s.sheets.filter(({ spec }) => spec.k === 'rails');
    assert.ok(sheets.length >= 1, `${n}`);
    for (const [i, { spec, drawn }] of sheets.entries()) {
      const name = `${n}×${rise} foglio ${i + 1}`;
      assert.ok((RAILS_SCALES as readonly number[]).includes(drawn.scale), `${name}: 1:${drawn.scale}`);
      const all = [...drawn.shapes, ...drawn.notes];
      assert.deepEqual(overlaps(all), [], name);
      for (const t of all) if (t.t === 'text') {
        const b = shapeBox(t);
        assert.ok(b.x0 >= FRAME.x0 && b.x1 <= FRAME.x1 && b.y0 >= FRAME.y0 && b.y1 <= FRAME.y1, `${name}: «${t.text}» off the sheet`);
      }
      // the notes on the first sheet only, under the development; a later sheet says which it goes on from
      assert.equal(drawn.notes.length > 0, i === 0, name);
      if (i > 0) assert.ok(spec.subtitle?.startsWith('SEGUITO DEL FOGLIO'), spec.subtitle);
    }
    // every interval of every rail's brackets and every length of rail dimensioned once over all the columns
    const chains = sheets.flatMap(({ drawn }) => drawn.entities.flatMap((e) => (e.e === 'chain' ? [e.c] : [])));
    const segs = (c: (typeof chains)[number]): number => c.pts.length - 1, lengths = chains.filter((c) => c.text?.every((t) => t === 'Guida {v}'));
    const brackets = chains.filter((c) => !c.text);
    assert.equal(brackets.reduce((a, c) => a + segs(c), 0), devRails(L).reduce((a, r) => a + railHeights(L, r).length + 1, 0), `${n}: staffe`);
    assert.equal(lengths.reduce((a, c) => a + segs(c), 0), 2 * designPieces(L).pieces.length, `${n}: spezzoni`);
    if (n >= 12) assert.ok(sheets.every(({ drawn }) => drawn.scale <= 200));
  }
});

test('DXF e DWG: una vista per foglio delle guide, con le entità e le note del foglio', () => {
  const x = tavole(lift(floors(40, 3000))), s = setSheets(x), views = inputViews(x);
  const rails = s.sheets.flatMap(({ spec, drawn }, i) => (spec.k === 'rails' ? [{ drawn, i }] : []));
  assert.ok(rails.length > 1, 'più fogli delle guide');
  for (const { drawn, i } of rails) {
    const v = views[i];
    assert.ok(v && v.title === 'SVILUPPO DELLE GUIDE E POSIZIONE DELLE STAFFE');
    assert.equal(v.scale, drawn.scale);
    assert.deepEqual(v.entities, drawn.entities);
    assert.equal(v.notes?.length ?? 0, drawn.notes.length);
  }
});

test('colonne: i nomi dei piani accanto a un’interruzione non toccano la sua lettera, a ogni altezza dei piani', () => {
  // the auditors' fuzz inputs (round 37) where a floor stood just over a column's start, and a sweep of the rises
  const runs: number[][] = [[3650, 2750, 2750, 3250, 4450, 4350, 4500, 2600, 4200, 3450], [2700, 4350, 2480, 3750, 3900, 4150, 4450, 3250, 2900, 2600, 2600, 3200],
    [2700, 3550, 2700, 2750, 3800, 3900, 3350, 3400, 4200, 3500, 2850, 2800, 3600]];
  for (let r = 2600; r <= 4500; r += 100) runs.push(Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? r : 3000)));
  for (const rises of runs) {
    const I = defaultInputs(1600, 1750), floors = [...rises, 0].map((rise, i) => ({ label: String(i), rise, door: 'A' as const }));
    const L = layout({ ...I, vertical: { ...I.vertical, main: 0, floors } });
    for (const sheet of railsSheets(L, drawingArea(true), railsNotes(L, X, fmt))) assert.deepEqual(overlaps([...sheet.shapes, ...sheet.notes]), [], rises.join(','));
  }
});
