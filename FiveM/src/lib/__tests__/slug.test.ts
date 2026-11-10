import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isValidSlug, RESERVED_SLUGS, slugify } from '../slug';

test('кирилицата се транслитерира', () => {
  assert.equal(slugify('Галакси Роуплей'), 'galaksi-roupley');
  assert.equal(slugify('Ъгъл ЩЪРК'), 'agal-shtark');
  assert.equal(slugify('Xenon RP България'), 'xenon-rp-balgariya');
});

test('slug-ът остава чист', () => {
  assert.equal(slugify('  ---Drift---  '), 'drift');
  assert.equal(slugify('a!!!b@@@c'), 'a-b-c');
  assert.equal(slugify('x'.repeat(100)).length, 60);
  assert.ok(!slugify('дълго '.repeat(30)).endsWith('-'));
});

test('резервираните пътища не стават slug', () => {
  for (const reserved of RESERVED_SLUGS) {
    assert.equal(isValidSlug(reserved), false, `${reserved} е резервиран`);
  }
  assert.equal(isValidSlug('galaxy-rp'), true);
  assert.equal(isValidSlug('-galaxy'), false);
  assert.equal(isValidSlug('galaxy-'), false);
  assert.equal(isValidSlug('a'), false);
});
