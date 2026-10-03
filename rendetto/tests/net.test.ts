import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ipNetwork } from '../src/http/ip.js';
import { loadConfig } from '../src/config.js';

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

test('an empty optional setting is unset, not an error (compose writes `${SMTP_USER:-}`)', () => {
  const cfg = loadConfig({
    NODE_ENV: 'production',
    PUBLIC_BASE_URL: 'https://example.test',
    DATABASE_URL: 'postgresql://u:p@db:5432/x',
    ENC_KEY: 'a'.repeat(64),
    HMAC_KEY: 'b'.repeat(64),
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: '',
    SMTP_PASS: '',
    AUDIT_ANCHOR_PATH: '',
  });
  assert.equal(cfg.SMTP_USER, undefined);
  assert.equal(cfg.SMTP_PASS, undefined);
  assert.equal(cfg.AUDIT_ANCHOR_PATH, undefined);
  assert.equal(cfg.AUDIT_RETENTION_DAYS, 1825);
  assert.throws(() =>
    loadConfig({
      NODE_ENV: 'production',
      PUBLIC_BASE_URL: 'https://example.test',
      DATABASE_URL: 'postgresql://u:p@db:5432/x',
      ENC_KEY: 'a'.repeat(64),
      HMAC_KEY: 'b'.repeat(64),
      SMTP_HOST: '',
    }),
  );
});
