import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaKitStrings } from '../mediakit';

test('mediaKitStrings: роден език', () => {
  assert.equal(mediaKitStrings('bg').title, 'Медиа кит');
  assert.equal(mediaKitStrings('de').ctr, 'Klickrate');
});

test('mediaKitStrings: липсващ език → en, без език → bg', () => {
  assert.equal(mediaKitStrings('pl').title, mediaKitStrings('en').title);
  assert.equal(mediaKitStrings(undefined).title, 'Медиа кит');
});
