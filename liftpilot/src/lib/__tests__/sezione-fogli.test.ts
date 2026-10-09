// Section A-A on the issued sheets (round 37): nothing of a view runs past its heights or off the A4 sheet — the
// references P2 and P3 on the dead ends of a 2:1 roping only on the sheets that show the slab they hang from (the
// section whole, the headroom's detail), the refuge's height on the car roof, where the slab is lower than it, ending at
// the slab with what it needs, the band's guard for what is cut to a detail (clipBand: a reference whose leader leaves
// the band dropped, a chain kept to its segments inside it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipBand, type Entity } from '@/drawing';
import { newLift, type LiftInputs } from '@/lib/lift';
import { defaultInputs, layout, section, type ShaftInputs } from '@/shaft';
import { sectionDims } from '@/shaft/section-dims';
import { detailWindow } from '../tavole/views';
import { liftSheets, offSheet, sheetsBy, shaftSheets, textsOf } from './sheets-helpers';

const twoToOne = (L: LiftInputs = newLift()): LiftInputs => ({ ...L, calc: { ...L.calc, r: '2' } });
const floors = (n: number): LiftInputs['shaft']['vertical']['floors'] =>
  Array.from({ length: n }, (_, i) => ({ label: String(i), rise: i === n - 1 ? 0 : 2700 + ((i * 450) % 1800), door: 'A' as const }));
const tall = (L: LiftInputs, n: number): LiftInputs => ({ ...L, shaft: { ...L.shaft, vertical: { ...L.shaft.vertical, floors: floors(n), main: Math.floor(n / 2) } } });

for (const [name, L] of [['5 fermate', twoToOne()], ['12 fermate', tall(twoToOne(), 12)]] as const) {
  test(`2:1 (${name}): P2 e P3 dove si vede la soletta, nessuna figura delle sezioni A-A fuori dal foglio`, () => {
    const r = liftSheets(L), aa = sheetsBy(r, /SEZ\. A-A$/), has = (title: RegExp, tag: string): boolean =>
      sheetsBy(r, title).some((s) => textsOf(s.shapes).some((t) => t.text === tag));
    assert.equal(aa.length, 4, name);
    for (const s of aa) assert.deepEqual(offSheet(s.shapes).map((x) => x.t), [], `${name}: «${s.title}» fuori dal foglio`);
    for (const tag of ['P2', 'P3']) {
      assert.ok(has(/^VISTA IN ELEVATO - SEZ\. A-A$/, tag) && has(/ULTIMA FERMATA SUPERIORE/, tag), `${name}: ${tag} sulla soletta`);
      assert.ok(!has(/FERMATA PIANO PRINCIPALE/, tag) && !has(/IN FOSSA - ULTIMA FERMATA INFERIORE/, tag), `${name}: ${tag} dove la soletta non c'è`);
    }
  });
}

test('rifugio sul tetto più alto della soletta: la quota finisce alla soletta e dice quanto serve, nel foglio', () => {
  // a 2000 mm refuge (type 1) under the default headroom: h_refuge fails
  const D = defaultInputs(1600, 1750), I: ShaftInputs = { ...D, vertical: { ...D.vertical, topRefuge: 1 } }, L = layout(I), S = section(L);
  const top = I.vertical.floors.length - 1, v = detailWindow(L, 'top', top);
  const chains = sectionDims(L, S, 'top', top, null).flatMap((e) => (e.e === 'chain' ? [e.c] : []));
  const ref = chains.find((c) => c.text?.[0] === 'H. Rifugio {v} < 2000');
  assert.ok(ref, 'quota del rifugio con quanto serve');
  assert.equal(Math.max(...ref.pts), S.ceiling, 'fino alla soletta');
  assert.ok(ref.edit?.[0]?.pick, 'il tipo di rifugio si sceglie lì');
  assert.ok(!chains.some((c) => c.text?.[0] === 'H. Rifugio {v}' || c.text?.[0] === '{v} ≥ 2000'), 'una quota sola');
  for (const c of chains) if (c.dir === 'y' && c.at !== undefined) for (const p of c.pts) assert.ok(p >= v.lo - 1 && p <= v.hi + 1, `${c.text?.[0] ?? ''} fuori dal particolare`);
  for (const s of sheetsBy(shaftSheets(I), /SEZ\. A-A$/)) assert.deepEqual(offSheet(s.shapes).map((x) => x.t), [], s.title);
  // where it fits, its own height and what there is up to the slab, as before
  const ok = sectionDims(layout(D), section(layout(D)), 'top', top, null).flatMap((e) => (e.e === 'chain' ? [e.c.text?.[0] ?? ''] : []));
  assert.ok(ok.includes('H. Rifugio {v}') && ok.some((t) => /^\{v\} ≥ \d+$/.test(t)), ok.join(' | '));
});

test('fascia di un particolare: un richiamo con la linea fuori è tolto, una catena tiene i segmenti dentro', () => {
  const ents: Entity[] = [
    { e: 'tag', at: [0, 500], text: 'P2', to: [0, 1500] },
    { e: 'tag', at: [0, 500], text: 'P5', to: [0, 900], also: [[100, 950]] },
    { e: 'chain', c: { dir: 'y', at: 100, pts: [-200, 300, 800, 1400], text: ['a {v}', 'b {v}', 'c {v}'], edit: [null, null, null], from: [1, 2, 3, 4] } },
    { e: 'chain', c: { dir: 'x', at: 1200, pts: [0, 500] } },
    { e: 'chain', c: { dir: 'x', at: 600, pts: [0, 500] } },
  ];
  const out = clipBand(ents, 0, 1000);
  assert.deepEqual(out.flatMap((e) => (e.e === 'tag' ? [e.text] : [])), ['P5']);
  const ys = out.flatMap((e) => (e.e === 'chain' && e.c.dir === 'y' ? [e.c] : []));
  assert.equal(ys.length, 1);
  assert.deepEqual([ys[0]?.pts, ys[0]?.text, ys[0]?.from], [[300, 800], ['b {v}'], [2, 3]]);
  assert.deepEqual(out.flatMap((e) => (e.e === 'chain' && e.c.dir === 'x' ? [e.c.at] : [])), [600]);
});
