// The machine room's lettering beyond the default room (round 37 review): smaller and larger rooms, the shaft moved
// in, a higher room, a ridge roof — the plan at 1:50 and section B-B at 1:50 or tight at 1:25 included. No name, note
// or reference over another — placed in the room, else beyond the wall no row of dimensions takes (plan) or outside
// the drawing under its foot or right of it (B-B), never on the least crowded place while one is clear —; the notes in
// B-B whole, off the hatched walls; every lettering inside the sheet. The dimensions' values the kernel places (dims.ts,
// past a chain's end or beside it when crowded) are the kernel's: a value on a value is not counted here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { FRAME, drawingArea, textBox, type Box, type Entity } from '@/drawing';
import type { LiftInputs } from '@/lib/lift';
import { surveyView } from '@/lib/tavole/views';
import { AT, letteringBox } from '@/shaft/room-label';
import { deriveRoom } from '../room/derive';
import { startSurvey } from '../room/survey';
import { base, calc, cw, overlaps, overlapsOf, roomViews, sheets, viewLetterings, withRoom } from './room-lettering-helpers';

const KINDS: [string, () => LiftInputs][] = [
  ['2:1', () => calc(base(), { r: '2' })], ['HEB', () => withRoom(base(), { heb: {} })], ['sbieco', () => cw(base(), 'left', 300)],
  ['telaio diretto', () => withRoom(calc(base(), { layout: 'top' }), { support: { kind: 'frame' } })],
];
const SIZES: [string, Parameters<typeof withRoom>[1]][] = [
  ['2600×2600', { W: 2600, D: 2600, panelAt: 1500 }], ['3400×3400', { W: 3400, D: 3400 }], ['3600×3000', { W: 3600, D: 3000 }],
  ['vano spostato 3600×3200', { W: 3600, D: 3200, shaftX: 1500, shaftY: 1000 }],
];

const inArea = (b: Box, a: Box): boolean => b.x0 >= a.x0 - 0.2 && b.x1 <= a.x1 + 0.2 && b.y0 >= a.y0 - 0.2 && b.y1 <= a.y1 + 0.2;
const neitherValue = (a: { dim: boolean }, b: { dim: boolean }): boolean => !a.dim && !b.dim;

test('locali da 2600 a 3600, con il vano spostato: pianta e B-B senza nome, nota o riferimento sopra un altro, tutto nel foglio', () => {
  const area = drawingArea(true);
  for (const [kind, make] of KINDS) for (const [size, r] of SIZES) {
    const views = roomViews(withRoom(make(), r));
    for (const [name, v] of Object.entries(views)) {
      const tag = `${kind} ${size} ${name} 1:${v.place.scale}`;
      assert.deepEqual(overlapsOf(viewLetterings(v), neitherValue), [], tag);
      for (const s of v.r.shapes) if (s.t === 'text') assert.ok(inArea(textBox(s), area), `${tag}: «${s.text}» fuori dal foglio`);
    }
  }
});

/** The note lines of section B-B (each note's lines before its leader and its dot) as model boxes at the view's scale. */
function noteBoxes(es: readonly Entity[], k: number): { text: string; box: Box }[] {
  const out: { text: string; box: Box }[] = [];
  es.forEach((e, i) => {
    if (e.e !== 'mark' || e.sym !== 'dot') return;
    for (let j = i - 2; j >= 0; j--) {
      const t = es[j];
      if (t?.e !== 'text' || t.align !== 'l') break;
      out.push({ text: t.text, box: letteringBox(t.at, t.text, t.size, 'l', 0, false, k) });
    }
  });
  return out;
}

test('sezione B-B più alta, più grande, col colmo, stretta con le HEB: nessuna scritta sopra un’altra, le note intere fuori dai muri tratteggiati', () => {
  const cases: [string, LiftInputs][] = [
    ['H 3500', withRoom(base(), { H: 3500 })], ['H 3500 HEB', withRoom(base(), { H: 3500, heb: {} })], ['3400×3400', withRoom(base(), { W: 3400, D: 3400 })],
    ['3400×3400 HEB', withRoom(base(), { W: 3400, D: 3400, heb: {} })], ['colmo 3400 di sbieco', withRoom(cw(base(), 'left', 300), { H: 2400, ridge: 3400 })],
    ['2600×2600 HEB', withRoom(base(), { W: 2600, D: 2600, panelAt: 1500, heb: {} })], ['2600×2600 HEB cw sinistra', withRoom(cw(base(), 'left'), { W: 2600, D: 2600, panelAt: 1500, heb: {} })],
  ];
  for (const [name, inp] of cases) {
    const page = sheets(inp).doc.pages[8]?.shapes ?? [];
    assert.deepEqual(overlaps(page.filter((s) => s.t !== 'text' || s.at[1] > FRAME.y0 + 30)), [], name);
    for (const s of page) if (s.t === 'text') assert.ok(inArea(textBox(s), FRAME), `${name}: «${s.text}» fuori dalla cornice`);
    // the notes as placed: each line off the hatched walls, the slab and the roof (their concrete outlines)
    const { section } = roomViews(inp), notes = noteBoxes(section.entities, (AT * section.place.scale) / 25);
    const walls = section.entities.flatMap((e): Box[] => (e.e === 'path' && e.fill === 'concrete'
      ? [{ x0: Math.min(...e.pts.map((p) => p[0])), y0: Math.min(...e.pts.map((p) => p[1])), x1: Math.max(...e.pts.map((p) => p[0])), y1: Math.max(...e.pts.map((p) => p[1])) }] : []));
    assert.ok(notes.length > 0, `${name}: note`);
    for (const n of notes) for (const w of walls) assert.ok(n.box.x1 <= w.x0 || w.x1 <= n.box.x0 || n.box.y1 <= w.y0 || w.y1 <= n.box.y0, `${name}: «${n.text}» sul muro tratteggiato`);
  }
});

test('interruttore generale lontano dal nome del limitatore e da P4, anche con la porta sulla parete destra', () => {
  for (const [name, inp] of [['HEB cw sinistra', withRoom(cw(base(), 'left'), { heb: {} })], ['sbieco', cw(base(), 'left', 300)], ['2:1 cw sinistra', calc(cw(base(), 'left'), { r: '2' })]] as const) {
    const page = sheets(withRoom(inp, { doorWall: 'right', doorAt: 2000 })).doc.pages[7]?.shapes ?? [];
    assert.deepEqual(overlaps(page.filter((s) => s.t !== 'text' || s.at[1] > FRAME.y0 + 30)), [], name);
  }
});

test('sostituzione con il locale di 3400, con e senza le HEB: nessun nome, nota o riferimento sopra un altro, tutto nell’area', () => {
  const area = drawingArea(true), inner = { x0: area.x0 + 8, y0: area.y0 + 8, x1: area.x1 - 8, y1: area.y1 - 8 };
  for (const [pn, preset] of Object.entries(PRESETS)) for (const heb of [false, true]) for (const support of ['frame', null] as const) {
    const s = startSurvey(700), V: FormValues = { ...preset, context: 'repl', alphaMode: 'geo', h: 0.95 };
    const d = deriveRoom(V, { ...s, room: { ...s.room, W: 3400, D: 3400, ...(heb ? { heb: {} } : {}), ...(support ? { support: { kind: support } } : {}) } });
    for (const kind of ['plan', 'section'] as const) {
      const v = surveyView(d, kind, inner), tag = `${pn} ${heb ? 'HEB' : '-'} ${support ?? '-'} ${kind}`;
      if (!v) continue;
      assert.deepEqual(overlapsOf(viewLetterings(v), neitherValue), [], tag);
      for (const t of v.r.shapes) if (t.t === 'text') assert.ok(inArea(textBox(t), area), `${tag}: «${t.text}»`);
    }
  }
});
