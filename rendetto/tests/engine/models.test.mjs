// Every furniture type at its defaults and at the extremes of every parameter: no exceptions, positive sizes,
// holes inside their parts, no overlapping boards (backs and drawer bottoms sit in grooves), hinge and handle
// counts, and no construction errors on the defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures } from './fixtures.mjs';
import { checkModel } from './check.mjs';
import { buildModel } from '../../engine/model.js';
import { TYPE_ORDER, TYPES } from '../../engine/types.js';

registerFixtures();

function casesFor(type) {
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

for (const type of TYPE_ORDER) {
  test(`${type}: defaults and parameter extremes build valid models`, () => {
    for (const [label, spec] of casesFor(type)) {
      const model = buildModel(spec);
      const errors = checkModel(model, label);
      if (label.endsWith('defaults')) assert.equal(errors.length, 0, `${label}: ${errors.map((e) => e.text).join(' | ')}`);
    }
  });
}

test('base cabinet with a knob and without a handle', () => {
  for (const [label, spec] of [
    ['base knob', { type: 'base', handle: 'fx:knob' }],
    ['base no handle', { type: 'base', handle: 'none' }],
  ]) {
    checkModel(buildModel(spec), label);
  }
});

test('unknown input is normalised, not trusted', () => {
  const model = buildModel({ type: 'base', width: 99999, height: -5, doors: 'x', post: 'evil' });
  assert.ok(model.spec.width <= 1200 && model.spec.width >= 300, `width ${model.spec.width}`);
  assert.ok(model.spec.height >= 600, `height ${model.spec.height}`);
  assert.ok(['iso', 'grbl'].includes(model.spec.post), `post ${model.spec.post}`);
});
