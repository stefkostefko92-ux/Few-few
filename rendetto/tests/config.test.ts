import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const ENC = 'a'.repeat(64);
const HMAC = 'b'.repeat(64);
const BASE = {
  NODE_ENV: 'production',
  PUBLIC_BASE_URL: 'https://example.test',
  DATABASE_URL: 'postgresql://u:p@db:5432/x',
  ENC_KEY: ENC,
  HMAC_KEY: HMAC,
  SMTP_HOST: 'smtp.example.test',
};

/** loadConfig must refuse the env with a message naming the setting, and never echo a key. */
function refuses(env: Record<string, string>, reason: RegExp): void {
  assert.throws(
    () => loadConfig({ ...BASE, ...env }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^Невалидна конфигурация: /);
      assert.match(error.message, reason);
      for (const value of [ENC, HMAC, env.ENC_KEY, env.HMAC_KEY, env.CATALOG_KEY])
        if (value) assert.ok(!error.message.includes(value), 'a key leaked into the error');
      return true;
    },
  );
}

test('an empty optional setting is unset, not an error (compose writes `${SMTP_USER:-}`)', () => {
  const cfg = loadConfig({ ...BASE, SMTP_USER: '', SMTP_PASS: '', AUDIT_ANCHOR_PATH: '' });
  assert.equal(cfg.SMTP_USER, undefined);
  assert.equal(cfg.SMTP_PASS, undefined);
  assert.equal(cfg.AUDIT_ANCHOR_PATH, undefined);
  assert.equal(cfg.AUDIT_RETENTION_DAYS, 1825);
  assert.equal(cfg.BREACH_CHECK, true);
});

test('production refuses to start without a mail server; development does not need one', () => {
  refuses({ SMTP_HOST: '' }, /SMTP_HOST: в продукция писмата трябва да тръгват/);
  const dev = loadConfig({ ...BASE, NODE_ENV: 'development', SMTP_HOST: '' });
  assert.equal(dev.SMTP_HOST, undefined);
});

test('the HMAC key must not be the encryption key, in any letter case', () => {
  refuses({ HMAC_KEY: ENC }, /HMAC_KEY: HMAC_KEY трябва да е различен от ENC_KEY/);
  refuses({ HMAC_KEY: 'A'.repeat(64) }, /HMAC_KEY: HMAC_KEY трябва да е различен от ENC_KEY/);
});

test('each key is exactly 32 bytes of hex', () => {
  refuses({ ENC_KEY: 'g'.repeat(64) }, /ENC_KEY: ENC_KEY трябва да е 32 байта в hex/);
  refuses({ ENC_KEY: 'a'.repeat(63) }, /ENC_KEY: ENC_KEY трябва да е 32 байта в hex/);
  refuses({ HMAC_KEY: 'c'.repeat(66) }, /HMAC_KEY: HMAC_KEY трябва да е 32 байта в hex/);
  refuses({ HMAC_KEY: '' }, /HMAC_KEY: HMAC_KEY трябва да е 32 байта в hex/);
  assert.equal(
    loadConfig({ ...BASE, ENC_KEY: 'AbCdEf01'.repeat(8) }).ENC_KEY,
    'AbCdEf01'.repeat(8),
  );
});

test('the audit is kept between one and ten years', () => {
  for (const days of ['100', '364', '3651', 'five'])
    refuses({ AUDIT_RETENTION_DAYS: days }, /AUDIT_RETENTION_DAYS: /);
  for (const days of [365, 3650])
    assert.equal(
      loadConfig({ ...BASE, AUDIT_RETENTION_DAYS: String(days) }).AUDIT_RETENTION_DAYS,
      days,
    );
});

test('the public address must be a URL and loses its trailing slash', () => {
  refuses({ PUBLIC_BASE_URL: 'example.test' }, /PUBLIC_BASE_URL: /);
  assert.equal(
    loadConfig({ ...BASE, PUBLIC_BASE_URL: 'https://example.test//' }).PUBLIC_BASE_URL,
    'https://example.test',
  );
});

test('a switch is only "true" or "false"', () => {
  assert.equal(loadConfig({ ...BASE, BREACH_CHECK: 'false' }).BREACH_CHECK, false);
  refuses({ BREACH_CHECK: 'yes' }, /BREACH_CHECK: /);
});

test('the catalog key is optional, 32 bytes of hex and none of the other two keys', () => {
  assert.equal(loadConfig({ ...BASE, CATALOG_KEY: '' }).CATALOG_KEY, undefined);
  assert.equal(loadConfig({ ...BASE, CATALOG_KEY: 'c'.repeat(64) }).CATALOG_KEY, 'c'.repeat(64));
  refuses({ CATALOG_KEY: 'c'.repeat(63) }, /CATALOG_KEY: CATALOG_KEY трябва да е 32 байта в hex/);
  for (const same of [ENC, HMAC.toUpperCase()]) {
    refuses(
      { CATALOG_KEY: same },
      /CATALOG_KEY: CATALOG_KEY трябва да е различен от ENC_KEY и HMAC_KEY/,
    );
  }
});
