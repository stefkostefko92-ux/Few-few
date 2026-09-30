// Shaft layout: the tables of rated load, area and passengers; car sizing, door, counterweight and checks on hand-
// worked shafts; properties over a grid of shafts; the plan drawing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultInputs, drawPlan, layout, loadForArea, maxArea, passengers, shaftSnapshot, verdictOf } from '../index';
import type { ShaftInputs } from '../index';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const status = (I: ShaftInputs) => Object.fromEntries(layout(I).checks.map((c) => [c.id, c.status]));
const LABELS = { car: 'CABINA', counterweight: 'CONTRAPPESO', persons: 'persone', doorT2: 'T2', doorC2: 'C2', title: 'PIANTA' };

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
  assert.equal(verdictOf(L), 'ok');
  // telescopic door 800: frame 1,5·800 + 110 = 1310, 145 mm from each side wall
  assert.equal(L.door.frame1 - L.door.frame0, 1310);
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

test('contrappeso laterale: cabina spostata, contrappeso dietro la guida', () => {
  const L = layout({ ...defaultInputs(1800, 1600), cw: 'left' });
  assert.equal(L.car.x, 283); // centred between 80 + 140 + 60 = 280 and 1800 − 165 = 1635
  assert.equal(L.A, 1280);
  assert.equal(L.B, 1280);
  assert.equal(L.cw.x, 80);
  assert.equal(L.cw.h, 1560 - 965); // from 100 mm past the rail at mid-depth to 40 mm from the back wall
  assert.equal(status({ ...defaultInputs(1800, 1600), cw: 'left' }).v_cwlen, 'ok');
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

test('istantanea stabile e disegno completo', () => {
  const I = defaultInputs(1600, 1750);
  assert.deepEqual(shaftSnapshot(I).snapshot, shaftSnapshot({ ...I }).snapshot);
  const d = drawPlan(layout(I), LABELS);
  const layers = new Set(d.prims.map((p) => p.layer));
  for (const l of ['MURI', 'VANO', 'CABINA', 'PORTE', 'GUIDE', 'CONTRAPPESO', 'QUOTE', 'TESTI']) assert.ok(layers.has(l as never), l);
  assert.ok(d.prims.some((p) => p.k === 'dim' && p.text === '1600'));
  assert.ok(d.prims.some((p) => p.k === 'text' && p.text === 'CABINA 1200 × 1210'));
});
