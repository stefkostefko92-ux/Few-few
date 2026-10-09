// Geometry and hardware rules found in the audit of the engine: a base cabinet's drawer above its door, drawer columns
// side by side that still reach the CNC and edge bands on the ends seen from below and on the top edges of drawer
// boxes. Runs on the base catalog and the documented hinge and slide systems.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, baseCatalogData } from '../../engine/catalog.js';
import { buildModel } from '../../engine/model.js';
import { nest } from '../../engine/nest.js';
import { cncBlockers } from '../../engine/cam.js';
import { cutSize } from '../../engine/panel.js';
import { MIN_WEB } from '../../engine/joinery.js';
import { HINGE_SYSTEMS } from '../../engine/data/hinge-systems.js';

const catalog = registerCatalog(baseCatalogData());
const SLIDES = catalog.slideFamilies.map((s) => s.id);
const HINGES = catalog.hingeFamilies.map((h) => h.id);
const GTV = SLIDES.find((s) => s.includes('gtv_h45'));
const TANDEM = SLIDES.find((s) => s.includes('blum_tandem_560h'));
const errorsOf = (m) => m.warnings.filter((w) => w.level === 'error').map((w) => w.text);
const byRole = (m, role) => m.parts.filter((p) => p.role === role);
const lowest = (parts) => Math.min(...parts.map((p) => p.box.min[1]));
const highest = (parts) => Math.max(...parts.map((p) => p.box.max[1]));
const blockers = (m) => cncBlockers(m, nest(m));

test('base cabinet „Чекмедже + врати“: the drawer sits at the top under the rails, the door and its shelves below it', () => {
  const specs = [{}, { doors: 2, shelves: 2 }, { height: 1000, legs: 0, shelves: 3 }, { width: 300, height: 600, legs: 150, shelves: 0 }];
  for (const slide of SLIDES) {
    for (const extra of specs) {
      const spec = { type: 'base', fronts: 'mixed', slide, ...extra };
      const label = JSON.stringify(spec);
      const m = buildModel(spec);
      const { height, legs, gap } = m.spec;
      const fronts = byRole(m, 'drawer-front');
      const doors = byRole(m, 'door');
      const box = [...byRole(m, 'drawer-side'), ...byRole(m, 'drawer-back')];
      const rails = byRole(m, 'rail');
      assert.equal(fronts.length, 1, `${label}: ${fronts.length} drawer fronts`);
      assert.ok(doors.length > 0 && box.length > 0 && rails.length === 2, `${label}: doors, drawer box or rails missing`);
      // the drawer front closes the top of the cabinet, the doors start at the bottom
      assert.equal(fronts[0].box.max[1], height - gap / 2, `${label}: drawer front top`);
      for (const d of doors) {
        assert.equal(d.box.min[1], legs + gap / 2, `${label}: ${d.name} bottom`);
        assert.ok(fronts[0].box.min[1] - d.box.max[1] >= gap - 0.01, `${label}: ${d.name} reaches ${d.box.max[1]}, the drawer front starts at ${fronts[0].box.min[1]}`);
      }
      // the box runs under the rails and above everything behind the door
      assert.ok(highest(box) <= lowest(rails), `${label}: drawer box top ${highest(box)} above the rails ${lowest(rails)}`);
      const shelves = byRole(m, 'shelf');
      if (shelves.length) assert.ok(highest(shelves) < lowest(box), `${label}: shelf at ${highest(shelves)} in the drawer box from ${lowest(box)}`);
      // the slide pilots sit at the drawer's height, every hinge on the door
      const slideYs = m.parts.flatMap((p) => p.features.filter((f) => f.kind === 'slide').map((f) => f.world[1]));
      assert.ok(slideYs.length > 0 && Math.min(...slideYs) > highest(doors), `${label}: slide pilots at ${Math.min(...slideYs)} below the door top ${highest(doors)}`);
      for (const d of doors) for (const y of d.hingeYs ?? []) assert.ok(y > d.box.min[1] && y < d.box.max[1], `${label}: hinge at ${y} off ${d.name}`);
      assert.deepEqual(errorsOf(m), [], label);
      assert.ok(!m.warnings.some((w) => w.text.includes('се застъпват')), `${label}: ${m.warnings.map((w) => w.text).join(' | ')}`);
      assert.deepEqual(blockers(m), [], label);
    }
  }
  // drawers under doors stay where they were: the tall cabinet's and the wardrobe's drawers are at the bottom
  for (const spec of [{ type: 'tall', drawers: 2 }, { type: 'wardrobe' }]) {
    const m = buildModel(spec);
    const fronts = byRole(m, 'drawer-front');
    assert.ok(fronts.length > 0, spec.type);
    for (const f of fronts) {
      const above = byRole(m, 'door').filter((d) => d.box.min[0] < f.box.max[0] && d.box.max[0] > f.box.min[0]);
      assert.ok(above.length > 0 && above.every((d) => d.box.min[1] > f.box.max[1]), `${spec.type}: ${f.name} not under its doors`);
    }
  }
});

test('two drawer columns side by side: the slides on the two faces of a partition get their own holes and the CNC files are made', () => {
  const specs = [
    { type: 'chest', columns: 2 },
    { type: 'chest', columns: 2, width: 1600, drawers: 3 },
    { type: 'chest', columns: 2, width: 1000, height: 1300, drawers: 6 },
    { type: 'tv', columns: 2 },
    { type: 'wallunit', width: 2200 },
    { type: 'wallunit', width: 2800, sideWidth: 700 },
  ];
  for (const slide of SLIDES) {
    for (const extra of specs) {
      const spec = { ...extra, slide };
      const label = JSON.stringify(spec);
      const m = buildModel(spec);
      assert.deepEqual(errorsOf(m), [], label);
      assert.deepEqual(blockers(m), [], label);
      const partitions = byRole(m, 'partition').filter((p) => p.features.some((f) => f.kind === 'slide'));
      assert.ok(partitions.length > 0, `${label}: no partition between drawer columns`);
      for (const part of partitions) {
        const holes = part.features.filter((f) => f.kind === 'slide');
        for (let a = 0; a < holes.length; a++) {
          for (let b = a + 1; b < holes.length; b++) {
            const web = Math.hypot(holes[a].u - holes[b].u, holes[a].v - holes[b].v) - (holes[a].d + holes[b].d) / 2;
            assert.ok(web >= MIN_WEB - 1e-9, `${label} ${part.name}: slide holes ${web.toFixed(2)} mm apart`);
          }
        }
      }
      // the fronts of neighbouring columns stay level, every box keeps the room above it (TOP_GAP 28 mm)
      const fronts = byRole(m, 'drawer-front');
      for (const f of fronts) assert.ok(fronts.some((g) => g !== f && g.module === f.module && g.box.min[1] === f.box.min[1] && g.box.max[1] === f.box.max[1]), `${label}: ${f.name} has no level neighbour`);
      for (const g of m.groups.filter((x) => x.type === 'drawer')) {
        const [front, sideA] = g.partIds.map((id) => m.parts.find((p) => p.id === id));
        assert.ok(front.box.max[1] - sideA.box.max[1] >= 28 - 0.01, `${label}: ${sideA.name} top ${sideA.box.max[1]} under the front top ${front.box.max[1]}`);
      }
    }
  }
  // a sweep over the chest: the slides never meet in a partition again
  for (const slide of SLIDES) {
    for (const width of [800, 1200, 1600]) {
      for (const height of [700, 1000, 1300]) {
        for (const drawers of [2, 3, 4, 5, 6]) {
          const m = buildModel({ type: 'chest', columns: 2, width, height, drawers, slide });
          assert.ok(!m.warnings.some((w) => w.text.includes('от двете му страни')), `${slide} ${width} ${height} ${drawers}: ${errorsOf(m).join(' | ')}`);
        }
      }
    }
  }
});

test('wall-mounted carcasses: the lower ends of the sides are edge-banded, the floor-standing ones are not', () => {
  const sidesOf = (m, wall) => byRole(m, 'side').filter((p) => wall(p.module));
  const cases = [
    [{ type: 'wall' }, () => true, () => false],
    [{ type: 'wall', bandCarcass: 2 }, () => true, () => false],
    [{ type: 'kitchen' }, (mod) => mod.startsWith('Г'), (mod) => mod.startsWith('М')],
    [{ type: 'wallunit' }, (mod) => mod === 'Р', (mod) => mod !== 'Р'],
  ];
  for (const [spec, wall, floor] of cases) {
    const m = buildModel(spec);
    const bc = m.spec.bandCarcass;
    const hung = sidesOf(m, wall);
    assert.ok(hung.length >= 2, `${spec.type}: no wall-mounted sides`);
    for (const p of hung) {
      assert.equal(p.bands['-y'], bc, `${spec.type} ${p.name}: lower end ${JSON.stringify(p.bands)}`);
      // the band comes off the cut length (the side runs along y)
      assert.ok(Math.abs(cutSize(p, true).L - (p.L - bc - (p.bands['+y'] || 0))) < 0.01, `${spec.type} ${p.name}: cut length`);
    }
    for (const p of sidesOf(m, floor)) assert.ok(!p.bands['-y'], `${spec.type} ${p.name}: a floor-standing side got a band at the floor`);
  }
  for (const type of ['base', 'tall', 'wardrobe', 'chest', 'nightstand', 'bookcase', 'tv']) {
    for (const p of byRole(buildModel({ type }), 'side')) assert.ok(!p.bands['-y'], `${type} ${p.name}: band at the floor`);
  }
});

test('drawer boxes: the top edges of the sides, the front and the back are edge-banded, the holes stay where they were', () => {
  for (const slide of SLIDES) {
    for (const spec of [{ type: 'chest' }, { type: 'nightstand', bandCarcass: 2 }, { type: 'desk', bandCarcass: 0.8 }, { type: 'base', fronts: 'drawers' }]) {
      const m = buildModel({ ...spec, slide });
      const bc = m.spec.bandCarcass;
      const box = [...byRole(m, 'drawer-side'), ...byRole(m, 'drawer-back')];
      assert.ok(box.length > 0, `${spec.type}: no drawer box`);
      for (const p of box) {
        assert.deepEqual(p.bands, { '+y': bc }, `${spec.type} ${slide} ${p.name}`);
        // the box runs along z or x and its height along y: the band comes off the cut width
        assert.ok(Math.abs(cutSize(p, true).W - (p.W - bc)) < 0.01, `${spec.type} ${p.name}: cut width`);
      }
      for (const p of byRole(m, 'drawer-bottom')) assert.deepEqual(p.bands, {}, `${spec.type} ${p.name}`);
      assert.deepEqual(errorsOf(m), [], `${spec.type} ${slide}`);
      assert.deepEqual(blockers(m), [], `${spec.type} ${slide}`);
    }
  }
  // the holes and grooves keep their distance from the cut bottom edge of the board (the groove and the confirmats are
  // set from the bottom of the box), with or without the band at the top; an explicit 0 means no band
  const fromBottom = (p) => {
    const cut = cutSize(p, true);
    const up = p.frame.ev === '+y';
    return p.features.map((f) => (f.type === 'hole' ? [f.kind, up ? f.v - cut.dv0 : cut.dv0 + cut.W - f.v] : [f.kind, up ? f.v1 - cut.dv0 : cut.dv0 + cut.W - f.v1]));
  };
  for (const slide of SLIDES) {
    const banded = [...byRole(buildModel({ type: 'chest', slide }), 'drawer-side'), ...byRole(buildModel({ type: 'chest', slide }), 'drawer-back')];
    const plain = [...byRole(buildModel({ type: 'chest', slide, bandCarcass: 0 }), 'drawer-side'), ...byRole(buildModel({ type: 'chest', slide, bandCarcass: 0 }), 'drawer-back')];
    assert.equal(banded.length, plain.length);
    banded.forEach((p, k) => {
      assert.deepEqual(plain[k].bands, { '+y': 0 }, plain[k].name);
      assert.ok(p.features.length > 0, p.name);
      assert.deepEqual(fromBottom(p), fromBottom(plain[k]), `${slide} ${p.name}`);
    });
  }
});
