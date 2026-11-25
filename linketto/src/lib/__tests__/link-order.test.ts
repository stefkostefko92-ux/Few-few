import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveInOrder, validReorder } from '../link-order';

// Подреждане на блоковете в таблото: drag & drop праща новия ред, бутоните ↑/↓ местят с едно.
// Сървърът приема реда САМО ако е точно същото множество блокове на профила — иначе
// чужд/изтрит/дублиран id би разместил или „осиротил“ позиции.

test('moveInOrder: нагоре и надолу разменя със съседа', () => {
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 'b', 'up'), ['b', 'a', 'c']);
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 'b', 'down'), ['a', 'c', 'b']);
});

test('moveInOrder: на ръба или непознат id → без промяна (null)', () => {
  assert.equal(moveInOrder(['a', 'b'], 'a', 'up'), null);
  assert.equal(moveInOrder(['a', 'b'], 'b', 'down'), null);
  assert.equal(moveInOrder(['a', 'b'], 'x', 'up'), null);
});

test('validReorder: приема само същото множество, без дубли', () => {
  assert.deepEqual(validReorder(['a', 'b', 'c'], ['c', 'a', 'b']), ['c', 'a', 'b']);
  assert.equal(validReorder(['a', 'b', 'c'], ['a', 'b']), null); // липсва
  assert.equal(validReorder(['a', 'b'], ['a', 'b', 'x']), null); // чужд
  assert.equal(validReorder(['a', 'b'], ['a', 'a']), null); // дубъл
  assert.equal(validReorder(['a', 'b'], ['b', 'x']), null); // подменен
});

test('validReorder: отхвърля нестрингове и прекалено дълъг списък', () => {
  assert.equal(validReorder(['a'], [1 as unknown as string]), null);
  const many = Array.from({ length: 600 }, (_, i) => `id${i}`);
  assert.equal(validReorder(many, many), null);
});
