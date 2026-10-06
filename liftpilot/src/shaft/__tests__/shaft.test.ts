// Shaft layout: the tables of rated load, area and passengers; car sizing, doors, counterweight and checks on hand-
// worked shafts; two entrances opposite and adjacent (cantilever sling); properties over a grid of shafts; the plan
// as model entities for the drawing kernel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KV, RAILS, defaultInputs, layout, loadForArea, maxArea, passengers, planDims, planEntities, railClip, shaftSnapshot, verdictOf } from '../index';
import type { ShaftInputs } from '../index';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const status = (I: ShaftInputs) => Object.fromEntries(layout(I).checks.map((c) => [c.id, c.status]));

test('superficie massima per portata: righe, interpolazione e oltre 2500 kg', () => {
  near(maxArea(630), 1.66);
  near(maxArea(1000), 2.4);
  near(maxArea(700), 1.75 + (25 / 75) * 0.15);
  near(maxArea(2600), 5.16);
  assert.equal(loadForArea(1.66), 630);
  assert.equal(loadForArea(1.661), 675);
  assert.equal(loadForArea(5.2), 2700);
});

test('passeggeri: il minore tra Q/75 e quelli ammessi dalla superficie', () => {
  assert.equal(passengers(630, 1.66), 8);
  assert.equal(passengers(1000, 2.4), 13);
  assert.equal(passengers(450, 1.0), 5);
  assert.equal(passengers(2500, 5), 33); // Q/75 = 33 < 20 + (5 − 3,13)/0,115 = 36
});

test('vano 1600 × 1750, contrappeso sul fondo, edificio esistente: la cabina più grande', () => {
  const L = layout(defaultInputs(1600, 1750));
  // 1600 − 2·165 − 2·35 = 1200; 1750 − (80 + 140 + 60) − (80 + 30 + 80) − 2·35 = 1210
  assert.equal(L.A, 1200);
  assert.equal(L.B, 1210);
  near(L.area, 1.452);
  assert.equal(L.Q, 600);
  assert.equal(L.persons, 8);
  assert.equal(L.fits, true);
  // case c) of DM 236/1989: the largest car this shaft takes is not as deep as case b)'s (1300 mm), so the design says
  // why the existing building takes no larger one — a warning until it does
  assert.equal(verdictOf(L), 'warn');
  assert.deepEqual(L.checks.filter((c) => c.status !== 'ok').map((c) => c.id), ['v_acc_c']);
  assert.equal(verdictOf(layout({ ...defaultInputs(1600, 1750), accessReason: 'vano nella tromba delle scale esistente' })), 'ok');
  assert.ok(!layout({ ...defaultInputs(1600, 1850) }).checks.some((c) => c.id === 'v_acc_c'), 'una cabina come il caso b) non ne ha bisogno');
  // telescopic door 800: frame 1,5·800 + 110 = 1310, 145 mm from each side wall
  assert.equal(L.doors[0].frame1 - L.doors[0].frame0, 1310);
  assert.equal(L.checks.find((c) => c.id === 'v_door')?.value, 145);
});

test('portata data: la cabina resta nella superficie ammessa', () => {
  const L = layout({ ...defaultInputs(2000, 2200), Q: 630 });
  assert.ok(L.area <= 1.66 + 1e-9, `area ${L.area}`);
  assert.ok(L.B >= L.A, 'porta sul lato corto');
  assert.equal(status({ ...defaultInputs(2000, 2200), Q: 630 }).v_area, 'ok');
  // a car too small for the rules and too big for the load: the area check fails
  const tight = layout({ ...defaultInputs(1600, 1750), Q: 300, access: 'dm236_residential' });
  assert.equal(tight.checks.find((c) => c.id === 'v_area')?.status, 'fail');
});

test('vano troppo piccolo: la cabina minima non entra', () => {
  const L = layout(defaultInputs(1100, 1300));
  assert.equal(L.fits, false);
  const fit = L.checks.find((c) => c.id === 'v_fit');
  assert.equal(fit?.status, 'fail');
  // width 1100 − 330 − 70 = 700 < 850 (door 800 + 50); depth 1300 − 280 − 190 − 70 = 760 < 1200: the worst counts
  assert.equal(fit?.value, -440);
});

test('contrappeso laterale: tra la parete e la guida di cabina, la guida su una staffa a ponte', () => {
  const L = layout({ ...defaultInputs(1800, 1600), cw: 'left' });
  // counterweight zone 80 + 140 + 85 + 65 (T70-1/A) + 30 = 400; centred between 400 and 1800 − 165 = 1635
  assert.equal(L.A, 1160);
  assert.equal(L.B, 1280);
  assert.equal(L.car.x, 403);
  assert.equal(L.cw.x, 80);
  assert.equal(L.cw.h, KV.cwMaxLength);
  // centred on the rails' axis at mid-depth of the car
  assert.equal(L.cw.y + L.cw.h / 2, L.car.y + L.car.h / 2);
  assert.ok(L.bridge && L.bridge.y0 < L.cw.y && L.bridge.y1 > L.cw.y + L.cw.h, 'staffa a ponte oltre le guide del contrappeso');
  assert.equal(status({ ...defaultInputs(1800, 1600), cw: 'left' }).v_cwlen, 'ok');
});

test('due accessi opposti: la cabina va da porta a porta, il contrappeso di lato', () => {
  const L = layout({ ...defaultInputs(1800, 2000), entrances: 'opposite', Q: 630 });
  assert.equal(L.doors.length, 2);
  assert.deepEqual(L.doors.map((d) => d.wall), ['front', 'rear']);
  assert.equal(L.cwSide, 'left');
  // depth fixed: 2000 − 2 × (80 + 30 + 80) − 70
  assert.equal(L.B, 1550);
  assert.equal(L.frame.kind, 'central');
});

test('due accessi adiacenti: arcata a zaino con le lame affacciate lungo la parete', () => {
  const I: ShaftInputs = { ...defaultInputs(1800, 1900), entrances: 'adjacent', side2: 'right', Q: 400, access: 'none' };
  const L = layout(I), cr = RAILS[I.carRail];
  assert.equal(L.frame.kind, 'cantilever');
  assert.equal(L.cwSide, 'left');
  const [a, b] = L.rails.filter((r) => r.kind === 'car');
  assert.deepEqual([a.dir, b.dir], ['back', 'front'], 'lame una verso l’altra');
  assert.equal(a.x, b.x);
  assert.equal(L.frame.dbg, b.y - a.y);
  // the feet 20 mm inside the platform's depth, the car rail on the counterweight side of the car
  assert.equal(a.y - cr.h, L.car.y + KV.cantRailEnd);
  assert.equal(b.y + cr.h, L.car.y + L.car.h - KV.cantRailEnd);
  // the car clear of the clips on the feet's edges: 31,8 mm of clip and plate past the edge of a T70 foot, 10 mm more
  const clip = railClip(I.carRail);
  assert.ok(Math.abs(clip.reach - 31.8) < 0.05, `${clip.reach}`);
  assert.equal(L.car.x, a.x + cr.b / 2 + Math.ceil(clip.reach) + KV.cantClipGap);
  // the car spans from the rails to the side door: the whole width, the depth the load admits
  assert.equal(L.A, L.maxA);
  assert.ok(L.area <= L.areaMax + 1e-9);
  // the counterweight between the rails' feet, against the wall
  assert.ok(L.cw.x === I.cwWallGap && L.cw.y > a.y - cr.h && L.cw.y + L.cw.h < b.y + cr.h);
  assert.deepEqual(L.doors.map((d) => [d.side, d.wall]), [['A', 'front'], ['B', 'right']]);
  // the operators of the two doors run into each other at the corner: a warning, not a failure
  assert.equal(status(I).v_op, 'warn');
  // the D.F.G. on the counterweight's wall: its extension lines start at the blades' tips, by the rails
  const dfg = planDims(L, 'main', 0, { level: '' }).flatMap((e) => (e.e === 'chain' ? [e.c] : [])).find((c) => c.text?.[1] === '{v} D.F.G. Arcata');
  assert.ok(dfg && typeof dfg.from === 'object', 'D.F.G. Arcata');
  for (const k of [1, 2]) near(dfg.from[k] ?? NaN, a.x - cr.k / 2);
});
test('porta centrale troppo larga per il vano e distanze fuori limite', () => {
  const s = status({ ...defaultInputs(1400, 2000), door: 'C2', doorWidth: 900, access: 'none', sillGap: 40, cwCarGap: 40, landingDepth: 120 });
  assert.equal(s.v_door, 'fail');
  assert.equal(s.v_sill, 'fail');
  assert.equal(s.v_cw, 'fail');
  assert.equal(s.v_wall, 'fail');
  assert.equal(s.v_acc_car, undefined, 'accessibilità non richiesta');
});

test('proprietà: un vano più grande non dà mai una cabina più piccola', () => {
  for (const cw of ['rear', 'left', 'right'] as const) {
    for (let W = 1200; W <= 2600; W += 100) {
      for (let D = 1300; D <= 2800; D += 150) {
        const a = layout({ ...defaultInputs(W, D), cw }), b = layout({ ...defaultInputs(W + 50, D), cw }), c = layout({ ...defaultInputs(W, D + 50), cw });
        if (!a.fits) continue;
        assert.ok(b.fits && b.area >= a.area - 1e-9, `W ${W} D ${D} ${cw}`);
        assert.ok(c.fits && c.area >= a.area - 1e-9, `W ${W} D ${D} ${cw}`);
        assert.ok(a.area <= a.areaMax + 1e-9);
        assert.ok(a.car.x >= 0 && a.car.x + a.car.w <= W && a.car.y + a.car.h <= D, 'la cabina sta nel vano');
      }
    }
  }
});

test('istantanea stabile e pianta completa per il nucleo di disegno', () => {
  const I = defaultInputs(1600, 1750);
  assert.deepEqual(shaftSnapshot(I).snapshot, shaftSnapshot({ ...I }).snapshot);
  const L = layout(I), f = I.vertical.main, ents = [...planEntities(L, 'main', f), ...planDims(L, 'main', f, { level: 'piano "0"' })];
  // the clear shaft outline, the concrete walls, the car, the rails and their dimension chains
  assert.ok(ents.some((e) => e.e === 'path' && e.st === 'wall' && !e.fill && e.pts.length === 4 && e.pts[2][0] === 1600 && e.pts[2][1] === 1750), 'vano netto');
  assert.ok(ents.some((e) => e.e === 'path' && e.fill === 'concrete'), 'muri');
  assert.ok(ents.some((e) => e.e === 'path' && e.fill === 'car'), 'cabina');
  assert.ok(ents.filter((e) => e.e === 'path' && e.st === 'steel').length >= 4, 'guide');
  const chains = ents.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
  assert.ok(chains.some((c) => c.dir === 'x' && c.pts[0] === 0 && c.pts[c.pts.length - 1] === 1600 && c.text?.[0]?.includes('Vano')), 'quota del vano');
  assert.ok(chains.some((c) => c.text?.some((t) => t?.includes('D.F.G. Arcata'))), 'distanza fra le guide');
});

test('operatore della porta di cabina dal catalogo del fornitore scelto', () => {
  const base = defaultInputs(1600, 1750);
  const len = (I: ShaftInputs): number => layout(I).doors[0].op1 - layout(I).doors[0].op0;
  assert.equal(len(base), 1.5 * 800 + 50);
  assert.equal(len({ ...base, doorMaker: '2sg' }), 1.5 * 800 + 40);
  assert.equal(len({ ...base, door: 'C2', doorMaker: '2sg' }), 2 * 800 + 20);
  assert.equal(len({ ...base, door: 'C2', doorMaker: 'fermator' }), 2 * 800 + 50);
  assert.equal(len({ ...base, door: 'C2' }), 2 * 800 + 60);
});
