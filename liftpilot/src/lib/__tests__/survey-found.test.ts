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
import { foundSpans } from '@/shaft/room-draw';
import { letteringBox, meets } from '@/shaft/room-label';
import { roomSectionOn } from '@/shaft/room-section-view';
import { roomPlanOn } from '@/shaft/room-view';
import { governorFree } from '@/shaft/support-check';
import it from '../../../messages/it.json';
import en from '../../../messages/en.json';
import bg from '../../../messages/bg.json';
import { ambitoOf } from '../lift/collaudo';
import { deriveRoom } from '../room/derive';
import { startSurvey, surveySaveSchema, type Survey } from '../room/survey';
import { surveyGovernor } from '../room/survey-site';
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
