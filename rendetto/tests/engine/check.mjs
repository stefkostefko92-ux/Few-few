// Shared model checks: positive sizes, holes inside parts, no overlapping boards, hinge/handle counts, plate holes;
// and the parameter variants every engine test walks through.
import assert from 'node:assert/strict';
import { TYPES } from '../../engine/types.js';

// A type at its defaults, at the min and max of every range and at every option of the others: [label, spec].
export function paramVariants(type) {
  const cases = [[`${type} defaults`, { type }]];
  for (const p of TYPES[type].params) {
    if (p.type === 'range') {
      cases.push([`${type} ${p.key}=min`, { type, [p.key]: p.min }], [`${type} ${p.key}=max`, { type, [p.key]: p.max }]);
    } else {
      for (const [v] of p.options) cases.push([`${type} ${p.key}=${v}`, { type, [p.key]: v }]);
    }
  }
  return cases;
}

// Every hinge plate screw has its own hole: no two plates share one (from either face of a partition).
export function assertPlateHoles(m, label) {
  for (const panelPart of m.parts.filter((p) => p.role === 'partition' || p.role === 'side')) {
    const doors = m.parts.filter((d) => d.role === 'door' && d.hingePanel === panelPart.id && d.hingeYs);
    const expected = doors.reduce((a, d) => a + d.hingeYs.length * d.plateHoles, 0);
    const actual = panelPart.features.filter((f) => f.kind === 'plate').length;
    assert.equal(actual, expected, `${label}: ${panelPart.name} has ${actual} plate holes, expected ${expected}`);
  }
}

const IN_GROOVE = [
  ['back', new Set(['side', 'bottom', 'top'])],
  ['drawer-bottom', new Set(['drawer-side', 'drawer-back'])],
];

function overlap(a, b) {
  let vol = 1;
  for (let i = 0; i < 3; i++) {
    const d = Math.min(a.box.max[i], b.box.max[i]) - Math.max(a.box.min[i], b.box.min[i]);
    if (d <= 0.05) return 0;
    vol *= d;
  }
  return vol;
}

const allowed = (a, b) => IN_GROOVE.some(([r, others]) => (a.role === r && others.has(b.role)) || (b.role === r && others.has(a.role)));

export function checkModel(m, label) {
  const { parts } = m;
  assert.ok(parts.length > 0, `${label}: no parts`);
  for (const p of parts) {
    assert.ok(p.L > 0 && p.W > 0 && p.T > 0, `${label}: ${p.name} has a non-positive size`);
    for (const f of p.features) {
      if (f.type !== 'hole' && f.type !== 'mark') continue;
      assert.ok(f.u >= 0 && f.u <= p.L && f.v >= 0 && f.v <= p.W, `${label}: ${p.name} ${f.kind} at ${f.u},${f.v} outside ${p.L}×${p.W}`);
      if (f.type === 'hole') assert.ok(f.d > 0 && f.depth > 0, `${label}: ${p.name} bad hole ${JSON.stringify(f)}`);
    }
  }
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const v = overlap(parts[i], parts[j]);
      if (v > 0 && !allowed(parts[i], parts[j])) assert.fail(`${label}: ${parts[i].id} ${parts[i].name} overlaps ${parts[j].id} ${parts[j].name} (${Math.round(v)} mm³)`);
    }
  }
  for (const d of parts.filter((p) => p.role === 'door')) {
    if (!d.hingeYs) {
      // no hinges only with an error in the model (no drilling data, or they do not fit): the CNC is withheld then
      assert.ok(m.warnings.some((w) => w.level === 'error'), `${label}: ${d.name} has no hinges and no error`);
      continue;
    }
    const cups = d.features.filter((f) => f.kind === 'cup').length;
    assert.ok(cups >= 2, `${label}: ${d.name} has ${cups} hinge cups`);
    assert.equal(cups, d.hingeYs.length, `${label}: ${d.name} cups vs hinge heights`);
  }
  for (const f of parts.filter((p) => p.role === 'door' || p.role === 'drawer-front')) {
    const n = f.features.filter((x) => x.kind === 'handle').length;
    assert.ok(n === 0 || n === 1 || n === 2, `${label}: ${f.name} has ${n} handle holes`);
  }
  for (const h of m.hardware) assert.ok(h.qty > 0, `${label}: hardware ${h.key} qty ${h.qty}`);
  assertPlateHoles(m, label);
  // shelf pins sit in plain system holes on both sides
  for (const sh of parts.filter((p) => p.role === 'shelf')) assert.ok(Number.isFinite(sh.pinY), `${label}: ${sh.name} without pin height`);
  const errors = m.warnings.filter((w) => w.level === 'error');
  return errors;
}
