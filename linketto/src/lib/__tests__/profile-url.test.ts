import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfileUrl,
  parseProfileHost,
  shortPathSlug,
} from '../profile-url';

test('parseProfileHost: валиден хост или null', () => {
  assert.equal(parseProfileHost('lnkt.to'), 'lnkt.to');
  assert.equal(parseProfileHost(' LNKT.TO '), 'lnkt.to');
  assert.equal(parseProfileHost(''), null);
  assert.equal(parseProfileHost(undefined), null);
  assert.equal(parseProfileHost('localhost'), null);
  assert.equal(parseProfileHost('https://lnkt.to'), null);
  assert.equal(parseProfileHost('lnkt.to/x'), null);
});

test('buildProfileUrl: кратък хост → https://хост/slug, иначе /u/slug', () => {
  assert.equal(
    buildProfileUrl('maria', { base: 'https://linketto.eu', host: 'lnkt.to' }),
    'https://lnkt.to/maria',
  );
  assert.equal(
    buildProfileUrl('maria', { base: 'https://linketto.eu', host: null }),
    'https://linketto.eu/u/maria',
  );
});

test('shortPathSlug: само един валиден сегмент', () => {
  assert.equal(shortPathSlug('/maria'), 'maria');
  assert.equal(shortPathSlug('/maria/'), 'maria');
  assert.equal(shortPathSlug('/'), null);
  assert.equal(shortPathSlug('/en/register'), null);
  assert.equal(shortPathSlug('/Maria'), null);
  assert.equal(shortPathSlug('/-x'), null);
});
