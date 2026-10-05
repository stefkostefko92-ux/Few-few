// The spec around the model: the value lists the editor builds its controls from, and the saved catalog choices the
// engine had to replace because they have left the catalog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerFixtures } from './fixtures.mjs';
import {
  BAND_CARCASS,
  BAND_FRONT,
  GAP_RANGE,
  TOOL_DIAMETERS,
  buildModel,
  catalogDrift,
  normalizeSpec,
} from '../../engine/model.js';

registerFixtures();

test('edge bands, front gap and router diameter keep exactly the listed values', () => {
  for (const v of BAND_CARCASS) assert.equal(normalizeSpec({ bandCarcass: v }).bandCarcass, v);
  for (const v of BAND_FRONT) assert.equal(normalizeSpec({ bandFront: v }).bandFront, v);
  for (const v of TOOL_DIAMETERS) assert.equal(normalizeSpec({ tool: v }).tool, v);
  const dflt = normalizeSpec({});
  assert.equal(normalizeSpec({ tool: 4 }).tool, dflt.tool);
  assert.equal(normalizeSpec({ bandFront: 0 }).bandFront, dflt.bandFront);
  assert.equal(normalizeSpec({ bandCarcass: 3 }).bandCarcass, dflt.bandCarcass);
  assert.equal(normalizeSpec({ gap: 99 }).gap, GAP_RANGE[1]);
  assert.equal(normalizeSpec({ gap: 0.5 }).gap, GAP_RANGE[0]);
});

const drift = (input) => catalogDrift(input, buildModel(input));

test('catalog drift: a saved choice that has left the catalog is reported', () => {
  const ok = { type: 'kitchen', hinge: 'fx:hettich', handle: 'fx:knob', slide: 'fx:tandem' };
  assert.deepEqual(drift(ok), []);
  const gone = { ...ok, hinge: 'shop:gone' };
  assert.equal(buildModel(gone).spec.hinge, 'fx:blum', 'the engine falls back to the first hinge');
  const [reason, ...rest] = drift(gone);
  assert.equal(rest.length, 0);
  assert.match(reason, /панта „shop:gone“/);
  assert.match(reason, /„fx:blum“/);
  assert.equal(drift({ ...ok, handle: 'shop:gone' }).length, 1);
  assert.equal(drift({ ...ok, slide: 'shop:gone' }).length, 1);
  assert.equal(drift({ ...ok, carcassDecor: 'shop:gone' }).length, 1);
  assert.equal(drift({ ...ok, frontDecor: 'shop:gone' }).length, 1);
  assert.equal(drift({ type: 'bed', bedFitting: 'shop:gone' }).length, 1);
});

test('catalog drift: choices the model does not use, defaults and „no handle“ are not drift', () => {
  assert.deepEqual(drift({ type: 'chest', hinge: 'shop:gone' }), [], 'a chest has no hinges');
  assert.deepEqual(drift({ type: 'base', slide: 'shop:gone' }), [], 'a base cabinet has no drawers');
  assert.deepEqual(drift({ type: 'base', bedFitting: 'shop:gone' }), []);
  assert.deepEqual(drift({ type: 'base', handle: 'none' }), []);
  assert.deepEqual(drift({ type: 'base' }), [], 'missing fields take the defaults');
  assert.deepEqual(drift({ type: 'base', frontRal: 'RAL 0000' }), [], 'decor fronts ignore the RAL');
  assert.equal(drift({ type: 'base', frontMaterial: 'ral', frontRal: 'RAL 0000' }).length, 1);
});

test('catalog drift: front decor and RAL count only when the model has parts cut from the front material', () => {
  const open = { type: 'bookcase', doorZone: 0 };
  assert.ok(!buildModel(open).parts.some((p) => ['door', 'drawer-front', 'plinth'].includes(p.role)), 'an open bookcase has no fronts');
  // the fallback front decor may well be the carcass decor: its carcass parts are not fronts
  const fallback = normalizeSpec({ frontDecor: 'shop:gone' }).frontDecor;
  assert.deepEqual(drift({ ...open, carcassDecor: fallback, frontDecor: 'shop:gone' }), []);
  assert.deepEqual(drift({ ...open, frontMaterial: 'ral', frontRal: 'RAL 0000' }), []);
  assert.equal(drift({ type: 'bookcase', doorZone: 800, frontDecor: 'shop:gone' }).length, 1, 'with doors it counts');
  assert.equal(drift({ type: 'desk', frontDecor: 'shop:gone' }).length, 1, 'the desk top is in the front decor');
});
