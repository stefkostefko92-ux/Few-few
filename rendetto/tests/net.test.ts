import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ipNetwork, normalizeIp } from '../src/http/ip.js';
import { safeNext } from '../src/http/meta.js';

test('rate limits key on the network: IPv4 as is, IPv6 by its /64', () => {
  assert.equal(ipNetwork('203.0.113.9'), '203.0.113.9');
  assert.equal(ipNetwork('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(ipNetwork('2001:db8::1'), '2001:0db8:0000:0000::/64');
  assert.equal(ipNetwork('2001:db8:0:0:ffff:1:2:3'), '2001:0db8:0000:0000::/64');
  assert.equal(ipNetwork('2001:DB8:1:2::abcd'), '2001:0db8:0001:0002::/64');
  assert.equal(ipNetwork('64:ff9b::192.0.2.1'), '0064:ff9b:0000:0000::/64');
  assert.equal(ipNetwork('fe80::1%eth0'), 'fe80:0000:0000:0000::/64');
  for (const bad of ['', 'nope', '1.2.3', '2001:db8:::1', null, undefined])
    assert.equal(ipNetwork(bad), null);
});

test('the client address is one rule for sessions, logins and limits', () => {
  assert.equal(normalizeIp('::FFFF:203.0.113.9'), '203.0.113.9');
  assert.equal(normalizeIp(' 2001:db8::1 '), '2001:db8::1');
  assert.equal(normalizeIp('::ffff:999.1.1.1'), null);
  assert.equal(normalizeIp(''), null);
  assert.equal(ipNetwork(' ::ffff:203.0.113.9 '), normalizeIp('::ffff:203.0.113.9'));
});

test('after login we only go to our own pages', () => {
  assert.equal(safeNext('/app/projects?x=1'), '/app/projects?x=1');
  assert.equal(safeNext('/admin'), '/admin');
  for (const bad of [
    '//evil.example',
    '/\\evil.example',
    'https://evil.example',
    '/apps',
    '/app\r\nx',
  ])
    assert.equal(safeNext(bad), '/app', bad);
});
