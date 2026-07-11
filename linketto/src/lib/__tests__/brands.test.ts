import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandFor, isSensitiveUrl } from '../brands';

test('brandFor разпознава платформите по домейн', () => {
  assert.equal(brandFor('https://www.youtube.com/@maria'), 'youtube');
  assert.equal(brandFor('https://youtu.be/abc'), 'youtube');
  assert.equal(brandFor('https://m.youtube.com/watch?v=1'), 'youtube');
  assert.equal(brandFor('https://twitter.com/maria'), 'x');
  assert.equal(brandFor('https://x.com/maria'), 'x');
  assert.equal(brandFor('https://kick.com/maria'), 'kick');
  assert.equal(brandFor('https://www.threads.net/@maria'), 'threads');
  assert.equal(brandFor('https://discord.gg/abc'), 'discord');
  assert.equal(brandFor('https://onlyfans.com/maria'), 'onlyfans');
  assert.equal(brandFor('https://revolut.me/maria'), 'revolut');
  assert.equal(brandFor('https://paypal.me/maria'), 'paypal');
  assert.equal(brandFor('https://example.com/x'), null);
  assert.equal(brandFor(null), null);
});

test('isSensitiveUrl хваща 18+ платформите (и поддомейни)', () => {
  assert.ok(isSensitiveUrl('https://onlyfans.com/maria'));
  assert.ok(isSensitiveUrl('https://www.fansly.com/maria'));
  assert.ok(isSensitiveUrl('https://chaturbate.com/x'));
  assert.ok(!isSensitiveUrl('https://youtube.com/@maria'));
  assert.ok(!isSensitiveUrl('https://myonlyfans.example.com')); // друг домейн
  assert.ok(!isSensitiveUrl(null));
});

test('isSensitiveUrl не се лъже от подобни имена', () => {
  assert.ok(!isSensitiveUrl('https://notonlyfans.com/x'));
  assert.ok(!isSensitiveUrl('https://onlyfans.com.evil.example/x'));
});
