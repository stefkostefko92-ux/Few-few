// Every furniture type at its defaults and at the extremes of every parameter: no exceptions, positive sizes,
// holes inside their parts, no overlapping boards (backs and drawer bottoms sit in grooves), hinge and handle
// counts, and no construction errors on the defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures } from './fixtures.mjs';
import { checkModel } from './check.mjs';
import { buildModel, normalizeSpec, withType } from '../../engine/model.js';
import { TYPE_ORDER, TYPES } from '../../engine/types.js';
import { handleHoles, registerHandles } from '../../engine/hardware.js';
import { decor, decorList, decorName, isBaseDecor } from '../../engine/materials.js';

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
  // only the engine's own types: names inherited from Object.prototype fall back to the default type
  for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(buildModel({ type }).spec.type, 'base', type);
  }
  for (const input of [null, undefined, 42, 'wall']) assert.equal(buildModel(input).spec.type, 'base', String(input));
});

test('changing the type keeps materials, hardware and machine settings, not the sizes or the shelf load', () => {
  const kitchen = normalizeSpec({ type: 'kitchen', carcassDecor: 'demo:anthracite', handle: 'fx:knob', tool: 8, post: 'grbl', shelfLoad: 2, moduleWidth: 500 });
  const next = withType(kitchen, 'bookcase');
  assert.equal(next.type, 'bookcase');
  for (const k of [...Object.keys(TYPES.kitchen.defaults), 'shelfLoad']) assert.ok(!(k in next), `${k} is carried over`);
  const spec = normalizeSpec(next);
  assert.deepEqual([spec.carcassDecor, spec.handle, spec.tool, spec.post], ['demo:anthracite', 'fx:knob', 8, 'grbl']);
  assert.equal(spec.shelfLoad, 1, 'the bookcase default, not the kitchen one');
  assert.equal(spec.height, TYPES.bookcase.defaults.height);
});

test('handle holes: a pair needs two holes and their spacing, anything else gets one hole — labels and drilling alike', () => {
  assert.deepEqual(handleHoles({ holes: 2, spacing: 128 }), { pair: true, label: '128 mm' });
  assert.deepEqual(handleHoles({ holes: 1 }), { pair: false, label: '1 отвор' });
  assert.deepEqual(handleHoles({ holes: 2 }), { pair: false, label: '1 отвор' });
  registerHandles([{ id: 'fx:h2', name: 'Дръжка без междуосие (тест)', type: 'bar', holes: 2, width: 12, drill: 5 }]);
  const handleHolesOnDoor = (handle) => {
    const door = buildModel({ type: 'base', fronts: 'doors', handle }).parts.find((p) => p.role === 'door');
    return door.features.filter((f) => f.type === 'hole' && f.hw === 'handle').length;
  };
  assert.equal(handleHolesOnDoor('fx:h128'), 2);
  assert.equal(handleHolesOnDoor('fx:knob'), 1);
  assert.equal(handleHolesOnDoor('fx:h2'), 1);
});

test('the built-in decors are told apart from catalog decors by one rule', () => {
  const base = decorList().filter(isBaseDecor);
  assert.equal(base.length, 4);
  for (const d of base) assert.equal(decorName(d.id), d.name);
  assert.equal(isBaseDecor({ manufacturer: 'Egger' }), false);
  assert.equal(isBaseDecor(decor('demo:oak')), true);
});
