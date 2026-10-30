// The pit's kit on the issued sheets (round 37): the heights of the control box's devices over each stack of its cases,
// clear of the dimensions of the pit's extremes (their words — "Parti basse ≥", "Grembiule ≥" — stay whole) and of any
// other lettering; in the plan of the pit the box's and the ladder's dimensions keep their names ("Pulsantiera",
// "Scala") clear of the items' own names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { shapeBox, type Shape } from '@/drawing';
import { defaultInputs, layout, type ShaftInputs } from '@/shaft';
import { pitKit } from '@/shaft/pit-kit';
import { buildTavole } from '../tavole/build';
import type { TavoleInput } from '../tavole/input';

type Text = Extract<Shape, { t: 'text' }>;

const input = (I: ShaftInputs): TavoleInput => ({
  values: PRESETS.C, layout: layout(I), plant: { machine: 'M 73 (Sx)', governorLoad: 300, safetyGear: 'progressive' },
  project: { name: 'Impianto di prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: 'Condominio' },
  company: { name: 'Ascensori di prova', logo: null },
  set: { number: '26-007', issuedAt: new Date('2026-09-30T10:00:00Z'), author: 'A.C.', revisions: [] },
});
const D = defaultInputs(1600, 1750), deep = (I: ShaftInputs, pit: number): ShaftInputs => ({ ...I, vertical: { ...I.vertical, pit } });
const CASES: readonly (readonly [string, ShaftInputs])[] = [
  ['contrappeso sul fondo', D],
  ['contrappeso a sinistra', { ...D, cw: 'left' }],
  ['contrappeso a destra, porte centrali', { ...D, cw: 'right', door: 'C2' }],
  ['accessi opposti', { ...D, entrances: 'opposite', D: 2000 }],
  ['accessi adiacenti', { ...defaultInputs(1900, 1900), entrances: 'adjacent', side2: 'right' }],
  ['vano stretto', { ...defaultInputs(1450, 1500), Q: 400, access: 'none' }],
  ['vano piccolo', { ...defaultInputs(1740, 1445), Q: 400, access: 'none' }],
  ['fossa 1800, due STOP', deep(D, 1800)],
  ['fossa 2800, porta di accesso', deep(D, 2800)],
];
const KIT = /^(STOP|LUCE) [+-]\d+( · (STOP|LUCE) [+-]\d+)*$/;
const meet = (a: Text, b: Text): boolean => {
  const p = shapeBox(a), q = shapeBox(b);
  return Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > 0.05 && Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > 0.05;
};

for (const [name, I] of CASES) {
  test(`fossa sui fogli (${name}): le quote degli estremi intere, le altezze della pulsantiera libere, i nomi nella pianta`, () => {
    const r = buildTavole(input(I)), k = pitKit(layout(I));
    const sheet = (title: RegExp): Text[] => r.doc.pages.flatMap((p, i) => (title.test(r.sheets[i]?.title ?? '') ? p.shapes : [])).filter((s): s is Text => s.t === 'text');
    const pit = sheet(/IN FOSSA - ULTIMA FERMATA INFERIORE/), plan = sheet(/E IN FOSSA$/);
    assert.ok(pit.length && plan.length, name);
    // the car's lowest parts with their limit, whole (until round 37 the box's labels beside it took their room)
    assert.ok(pit.some((t) => /Parti basse ≥ \d+/.test(t.text)), `${name}: «Parti basse ≥» abbreviata`);
    // the apron's (from 1800 mm the symbol of the car's overtravel takes its room, as before round 37)
    if (I.vertical.pit <= 1600) assert.ok(pit.some((t) => /^\d+ Grembiule ≥ \d+$/.test(t.text)), `${name}: «Grembiule ≥» abbreviata`);
    // each device's height, over its stack of cases, clear of every other lettering
    const kit = pit.filter((t) => KIT.test(t.text));
    assert.equal(kit.flatMap((t) => t.text.split(' · ')).length, k.lowStop === null ? 2 : 3, name);
    for (const a of kit) for (const b of pit) assert.ok(a === b || !meet(a, b), `${name}: «${a.text}» su «${b.text}»`);
    // the plan: the box's and the ladder's distances from the corner with their names
    assert.ok(plan.some((t) => /^Pulsantiera \d+$/.test(t.text)), `${name}: «Pulsantiera» abbreviata`);
    if (k.ladder) assert.ok(plan.some((t) => /^Scala \d+$/.test(t.text)), `${name}: «Scala» abbreviata`);
  });
}
