import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidSlug, normalizeSlug, transliterate } from '../slug';

test('транслитерира кирилица', () => {
  assert.equal(transliterate('мария'), 'mariya');
  assert.equal(transliterate('Юлия Щерева'), 'yuliya shtereva');
});

test('нормализира до валиден slug', () => {
  assert.equal(normalizeSlug('Мария Петрова'), 'mariya-petrova');
  assert.equal(normalizeSlug('  hello__world  '), 'hello-world');
  assert.equal(normalizeSlug('café!'), 'cafe');
});

test('валидира slug', () => {
  assert.ok(isValidSlug('mariya-petrova'));
  assert.ok(isValidSlug('ab'));
  assert.ok(!isValidSlug('-lead'));
  assert.ok(!isValidSlug('trail-'));
  assert.ok(!isValidSlug('admin'));
  assert.ok(!isValidSlug('u'));
  // кратък хост: slug в корена не бива да съвпада с маршрут или език
  assert.ok(!isValidSlug('tools'));
  assert.ok(!isValidSlug('bg'));
  assert.ok(!isValidSlug('nap'));
  assert.ok(!isValidSlug(''));
});
