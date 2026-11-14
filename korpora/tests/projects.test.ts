import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { catalogInfo, loadEngine, specOf } from '../src/services/engine.js';
import { normalizedSpec } from '../src/services/projects.js';

before(async () => {
  // no shop catalog: the engine runs with the base one, as on a fresh server
  await loadEngine(join(tmpdir(), `korpora-no-catalog-${process.pid}.json`));
});

test('a deeply nested spec is bad input (null), not a stack overflow thrown as a 500', () => {
  const depth = 32_000;
  const deepArray: unknown = JSON.parse('['.repeat(depth) + ']'.repeat(depth));
  assert.equal(normalizedSpec(deepArray), null);
  const deepValue: unknown = JSON.parse(
    `{"type":"kitchen","x":${'['.repeat(depth)}${']'.repeat(depth)}}`,
  );
  assert.equal(normalizedSpec(deepValue), null);
  assert.equal(normalizedSpec({ type: 'kitchen' })?.type, 'kitchen');
  assert.equal(normalizedSpec({ type: 'no-such-type' }), null);
});

test('a room takes its pieces in exactly their shape: flat parameters, at most eight, nothing else nested', () => {
  const piece = { type: 'chest', wall: 'A', x: 2100, params: { width: 800 } };
  const room = normalizedSpec({
    type: 'room',
    items: [{ ...piece, x: 0, type: 'wardrobe' }, piece],
  });
  assert.deepEqual(
    (room?.items as Array<{ type: string }> | undefined)?.map((it) => it.type),
    ['wardrobe', 'chest'],
  );
  assert.equal(
    normalizedSpec({ type: 'room', items: Array.from({ length: 9 }, () => piece) }),
    null,
  );
  assert.equal(
    normalizedSpec({ type: 'room', items: [{ ...piece, params: { width: { deep: 1 } } }] }),
    null,
  );
  assert.equal(normalizedSpec({ type: 'room', items: [{ ...piece, wall: 'D' }] }), null);
  assert.equal(normalizedSpec({ type: 'room', items: [{ ...piece, extra: true }] }), null);
});

test('a stored spec that is not an object reads as an empty spec', () => {
  assert.deepEqual(specOf(null), {});
  assert.deepEqual(specOf([1, 2]), {});
  assert.deepEqual(specOf('kitchen'), {});
  assert.deepEqual(specOf({ type: 'kitchen', W: 600 }), { type: 'kitchen', W: 600 });
});

test('the catalog ETag is computed at load and matches the JSON that is served', () => {
  const { json, etag } = catalogInfo();
  assert.equal(etag, `"${createHash('sha256').update(json).digest('base64url').slice(0, 27)}"`);
});
