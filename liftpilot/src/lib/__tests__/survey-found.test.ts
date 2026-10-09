// What a replacement's survey finds in the machine room, on its drawings and in its checks (round 37, W2-G4-02/03/05/06):
// the governor's free area hatched as the check reads it (500 × 600, not the governor's side); no name on the plan over
// another — the governor's off its free area, the drop's dimension off the main switch's name —; the governor's ropes
// through the slab over the shaft's inside (m_govdrop); section B-B open where its cut crosses an existing opening.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { drawingArea, type Entity } from '@/drawing';
import { VOCI_VANO } from '@/shaft';
import { outlineBox } from '@/shaft/room-floor';
import { dropSpan } from '@/shaft/machine-room';
import { WALL, foundSpans } from '@/shaft/room-draw';
import { letteringBox, meets } from '@/shaft/room-label';
import { roomSectionOn } from '@/shaft/room-section-view';
import { roomPlanOn } from '@/shaft/room-view';
import { governorFree, machineParts } from '@/shaft/support-check';
import it from '../../../messages/it.json';
import en from '../../../messages/en.json';
import bg from '../../../messages/bg.json';
import { ambitoOf } from '../lift/collaudo';
import { deriveRoom } from '../room/derive';
import { startSurvey, surveySaveSchema, type Survey } from '../room/survey';
import { surveyFound, surveyGovernor } from '../room/survey-site';
import { surveyView } from '../tavole/views';
import { overlaps } from './room-lettering-helpers';

type Change = (s: Survey) => Survey;
const room: Change = (s) => ({ ...s, room: { ...s.room, W: 2800, D: 3200, H: 2300 } });
const openings = [{ x: 1300, y: 1250, W: 300, D: 200 }, { x: 2300, y: 600, W: 120, D: 120 }];
/** The round 37 audit's survey: the governor 400 × 300 off the shaft, two openings, the existing beams. */
const audit: Change = (s) => ({ ...room(s), governor: { x: 2300, y: 900, W: 400, D: 300, ropes: true }, openings, existingSupport: { kind: 'beams', keep: false } });
/** The same with the governor over the shaft (its ropes down into it). */
const over: Change = (s) => ({ ...audit(s), governor: { x: 1900, y: 900, W: 400, D: 300, ropes: true } });
/** The drop line askew (the round 37 audit's Cskew). */
const askew: Change = (s) => ({ ...room(s), car: { x: 600, y: 600 }, cw: { x: 1020, y: 1020 }, governor: { x: 750, y: 2400, W: 400, D: 300, ropes: true },
  openings: [{ x: 1400, y: 1900, W: 250, D: 250 }], existingSupport: { kind: 'frame', keep: true } });
const derive = (V: FormValues, f: Change) => {
  const d0 = deriveRoom(V, startSurvey(600)), s = f(startSurvey(Math.round(d0.calata.calc) + 20));
  return { s, d: deriveRoom(V, s) };
};
const area = drawingArea(true), inner = { x0: area.x0 + 8, y0: area.y0 + 8, x1: area.x1 - 8, y1: area.y1 - 8 };
const check = (V: FormValues, f: Change, id: string) => derive(V, f).d.checks.find((c) => c.id === id);

test('limitatore 400 × 300: la superficie libera tratteggiata è 500 × 600 come la verifica, non larga quanto il limitatore', () => {
  for (const f of [audit, over, askew]) {
    const { s, d } = derive({ ...PRESETS.C }, f), G = d.G, gov = surveyGovernor(s);
    assert.ok(G && gov);
    const free = governorFree(gov, G, d.M), [a0, a1, a2, a3] = free.area;
    assert.deepEqual([Math.round(a2 - a0), Math.round(a3 - a1)].sort((p, q) => p - q), [500, 600]);
    // the plan hatches that very area
    const hatched = roomPlanOn(d.site, d.M, G).entities.some((e) => e.e === 'path' && e.st === 'space' && e.pts.length === 4
      && Math.min(...e.pts.map((p) => p[0])) === a0 && Math.min(...e.pts.map((p) => p[1])) === a1 && Math.max(...e.pts.map((p) => p[0])) === a2 && Math.max(...e.pts.map((p) => p[1])) === a3);
    assert.ok(hatched, JSON.stringify(free.area));
    // m_govfree reads that area's depth over all its width
    const c = d.checks.find((x) => x.id === 'm_govfree');
    assert.ok(c);
    assert.equal(c.value, Math.round(free.depth));
    assert.equal(c.limit, free.need);
  }
});

test('pianta e B-B del rilievo con limitatore e aperture: nessuna scritta sopra un’altra (anche con la calata di sbieco)', () => {
  const cases: [string, FormValues, Change][] = [
    ['A', { ...PRESETS.A }, audit], ['C', { ...PRESETS.C }, audit], ['B in alto', { ...PRESETS.B, layout: 'top' }, audit],
    ['C sopra il vano', { ...PRESETS.C }, over], ['C sbieco', { ...PRESETS.C }, askew],
    ['C limitatore in un angolo', { ...PRESETS.C }, (s) => ({ ...audit(s), governor: { x: 300, y: 2900, W: 300, D: 250, ropes: false } })],
    ['C basamento che resta', { ...PRESETS.C }, (s) => ({ ...audit(s), existingSupport: { kind: 'frame', keep: true } })],
  ];
  for (const [name, V, f] of cases) {
    const { d } = derive(V, f);
    for (const kind of ['plan', 'section'] as const) {
      const v = surveyView(d, kind, inner);
      assert.ok(v, `${name} ${kind}`);
      assert.deepEqual(overlaps(v.r.shapes), [], `${name} ${kind}`);
    }
  }
});

test('pianta a 1:50 (locale 4000 × 4400): il nome del limitatore e P4 misurati alla scala della pianta, nessuna scritta sopra un’altra', () => {
  // the round 37 review's room: drawn at 1:50, the governor's lettering measured at 1:25 went over P4 and pushed the
  // frame's row onto the openings' lettering
  const big = (g: NonNullable<Survey['governor']>): Change => (s) => ({ ...s, room: { ...s.room, W: 4000, D: 4400, H: 2300 }, governor: g, openings, existingSupport: { kind: 'beams', keep: false } });
  for (const [name, V] of [['A', { ...PRESETS.A }], ['C', { ...PRESETS.C }], ['B in alto', { ...PRESETS.B, layout: 'top' }]] as [string, FormValues][]) {
    for (const g of [{ x: 2400, y: 1700, W: 400, D: 300, ropes: true }, { x: 2500, y: 2800, W: 400, D: 300, ropes: true }]) {
      const { d } = derive(V, big(g));
      for (const kind of ['plan', 'section'] as const) {
        const v = surveyView(d, kind, inner);
        assert.ok(v, `${name} ${kind}`);
        if (kind === 'plan') assert.equal(v.place.scale, 50, `${name}: la pianta a 1:50`);
        assert.deepEqual(overlaps(v.r.shapes), [], `${name} ${JSON.stringify(g)} ${kind}`);
      }
    }
  }
});

test('il nome e P4 del limitatore: le scritte misurate alla scala data, mai sopra l’argano', () => {
  const { s, d } = derive({ ...PRESETS.C }, over), G = d.G;
  assert.ok(G);
  // twice the scale, twice the lettering in the room's millimetres (the name's and P4's tight boxes: marks 1 and 2)
  const at25 = surveyFound(s, [], null, 25).marks, at50 = surveyFound(s, [], null, 50).marks;
  for (const i of [1, 2]) {
    const a = at25[i], b = at50[i];
    assert.ok(a && b);
    assert.ok(Math.abs((b.x1 - b.x0) - 2 * (a.x1 - a.x0)) < 1e-6 && Math.abs((b.y1 - b.y0) - 2 * (a.y1 - a.y0)) < 1e-6, `${i}`);
  }
  // a governor by the wall beside the machine at 1:50 (the review's A 3400 × 3800, {400, 1500}): its name nowhere on the
  // machine — on a leader where no usual place is clear —, no lettering over another
  const V = { ...PRESETS.A }, by: Change = (x) => ({ ...x, room: { ...x.room, W: 3400, D: 3800, H: 2300 }, governor: { x: 400, y: 1500, W: 400, D: 300, ropes: true }, openings,
    existingSupport: { kind: 'beams', keep: false } });
  const r = derive(V, by), Gb = r.d.G;
  assert.ok(Gb);
  const v = surveyView(r.d, 'plan', inner);
  assert.ok(v);
  assert.equal(v.place.scale, 50);
  assert.deepEqual(overlaps(v.r.shapes), []);
  const name = v.entities.find((e): e is Extract<Entity, { e: 'text' }> => e.e === 'text' && e.text === 'Limitatore esistente');
  assert.ok(name);
  const box = letteringBox(name.at, name.text, name.size, name.align, 0, false, 50);
  for (const [x0, y0, x1, y1] of machineParts(Gb, r.d.M).map(outlineBox)) assert.ok(!meets(box, { x0, y0, x1, y1 }), JSON.stringify(name.at));
});

test('il nome del limitatore esistente fuori dalla sua superficie libera, sul lato opposto quando c’è posto', () => {
  for (const f of [audit, over, askew]) {
    const { s, d } = derive({ ...PRESETS.C }, f), G = d.G, gov = surveyGovernor(s);
    assert.ok(G && gov);
    const name = d.site.governor.entities.find((e): e is Extract<Entity, { e: 'text' }> => e.e === 'text' && e.text === 'Limitatore esistente');
    assert.ok(name);
    const [x0, y0, x1, y1] = governorFree(gov, G, d.M).area;
    assert.ok(!meets(letteringBox(name.at, name.text, name.size, name.align), { x0, y0, x1, y1 }), JSON.stringify(name.at));
    // the box the rows of dimensions keep off holds the name and P4
    const box = d.site.governor.box, tag = d.site.governor.entities.find((e) => e.e === 'tag' && e.text === 'P4');
    assert.ok(box && tag && tag.e === 'tag');
    assert.ok(tag.at[0] >= box.x0 && tag.at[0] <= box.x1 && tag.at[1] >= box.y0 && tag.at[1] <= box.y1);
  }
});

test('m_govdrop: le funi del limitatore esistente attraverso la soletta scendono nel vano', () => {
  const V = { ...PRESETS.C }, withGov = (g: NonNullable<Survey['governor']>): Change => (s) => ({ ...room(s), governor: g });
  // the round 37 audit's governors: off the shaft (x 500…2100, y 500…2250 in the room), the save takes them
  for (const [g, value] of [[{ x: 2450, y: 900, W: 300, D: 250, ropes: true }, -410], [{ x: 150, y: 125, W: 300, D: 250, ropes: true }, -480]] as const) {
    const { s } = derive(V, withGov(g));
    assert.ok(surveySaveSchema.safeParse(s).success);
    const c = check(V, withGov(g), 'm_govdrop');
    assert.equal(c?.status, 'fail', JSON.stringify(g));
    assert.equal(c?.value, value);
    assert.equal(c?.limit, 0);
  }
  // over the shaft: passes; across its wall: a warning (the opening is the software's); no ropes through the slab: none
  const inside = check(V, withGov({ x: 1300, y: 1000, W: 400, D: 300, ropes: true }), 'm_govdrop');
  assert.equal(inside?.status, 'ok');
  assert.ok((inside?.value ?? -1) >= 0);
  assert.equal(check(V, withGov({ x: 2100, y: 1000, W: 400, D: 300, ropes: true }), 'm_govdrop')?.status, 'warn');
  assert.equal(check(V, withGov({ x: 2450, y: 900, W: 300, D: 250, ropes: false }), 'm_govdrop'), undefined);
  // a check of the survey's data: it applies whatever the test replaces; its entry in the registry, its label in three languages
  assert.equal(ambitoOf({ norma: '10411-1', parti: ['ropes'] }, 'm_govdrop'), 'applies');
  assert.equal(ambitoOf({ norma: '10411-11', parti: ['machine'] }, 'm_govdrop'), 'applies');
  assert.ok(VOCI_VANO.find((v) => v.id === 'limitatore.posto')?.verifiche?.includes('m_govdrop'));
  for (const m of [it, en, bg]) assert.ok((m.shaft as Record<string, string>).c_m_govdrop?.trim());
});

test('sezione B-B: la soletta aperta dove il taglio attraversa un’apertura esistente, con il suo nome', () => {
  // the cut along the drop line through the car's drop: x 1300 in the room, the opening x 1150…1450, y 1150…1350
  for (const [V, span] of [[{ ...PRESETS.C }, [85, 285]], [{ ...PRESETS.A }, [175, 375]]] as const) {
    const { d } = derive(V, over), G = d.G;
    assert.ok(G);
    assert.deepEqual(foundSpans(d.site, G).map((f) => [Math.round(f.u0), Math.round(f.u1)]), [span]);
    const sec = roomSectionOn(d.site, d.M, G).entities, slab = G.room.slab;
    const concrete = sec.flatMap((e) => (e.e === 'path' && e.fill === 'concrete' && Math.min(...e.pts.map((p) => p[1])) === -slab && Math.max(...e.pts.map((p) => p[1])) === 0
      ? [[Math.min(...e.pts.map((p) => p[0])), Math.max(...e.pts.map((p) => p[0]))]] : []));
    assert.ok(concrete.length > 1);
    for (const [a, b] of concrete) assert.ok(b <= span[0] + 1e-6 || a >= span[1] - 1e-6, `soletta piena su ${a}…${b}`);
    assert.ok(sec.some((e) => e.e === 'text' && e.text === 'FORO ESISTENTE 300×200'));
  }
  // a whole design and a survey without openings: the slab as before, open only round the ropes
  const { d } = derive({ ...PRESETS.C }, room), G = d.G;
  assert.ok(G);
  assert.deepEqual(foundSpans(d.site, G), []);
});

test('sezione B-B: un’apertura rilevata oltre il muro non apre la soletta nel muro, una a cavallo solo dentro il locale', () => {
  // the round 37 review's survey: the opening past the rear wall (y 3350…3550 in a room 3200 deep) — the save takes it
  const V = { ...PRESETS.C }, past: Change = (s) => ({ ...room(s), openings: [{ x: 1300, y: 3450, W: 300, D: 200 }] });
  const { s, d } = derive(V, past), G = d.G;
  assert.ok(G && surveySaveSchema.safeParse(s).success);
  assert.deepEqual(foundSpans(d.site, G), []);
  const [, r1] = dropSpan(G, 0, 0, G.room.W, G.room.D), sec = roomSectionOn(d.site, d.M, G).entities, slab = G.room.slab;
  const concrete = sec.flatMap((e) => (e.e === 'path' && e.fill === 'concrete' && Math.min(...e.pts.map((p) => p[1])) === -slab && Math.max(...e.pts.map((p) => p[1])) === 0
    ? [Math.max(...e.pts.map((p) => p[0]))] : []));
  assert.ok(concrete.some((u) => Math.abs(u - (r1 + WALL)) < 1e-6), `la soletta fino al filo esterno del muro: ${JSON.stringify(concrete)}`);
  assert.ok(!sec.some((e) => e.e === 'text' && e.text.startsWith('FORO ESISTENTE')));
  // across the wall: open only up to the room's inner face
  const across: Change = (x) => ({ ...room(x), openings: [{ x: 1300, y: 3200, W: 300, D: 200 }] });
  const r = derive(V, across), Ga = r.d.G;
  assert.ok(Ga);
  const spans = foundSpans(r.d.site, Ga), [, ra1] = dropSpan(Ga, 0, 0, Ga.room.W, Ga.room.D);
  assert.equal(spans.length, 1);
  assert.ok(spans.every((f) => f.u1 <= ra1 + 1e-6), JSON.stringify(spans.map((f) => [f.u0, f.u1])));
});
