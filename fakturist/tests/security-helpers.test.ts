import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { rateKey } from '../src/http/ip.js';
import { safeLogPath } from '../src/logger.js';

test('таванът на заявките брои IPv6 по мрежа /64, IPv4 — по адрес', () => {
  assert.equal(rateKey('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
  assert.equal(rateKey('2001:db8:1:2:ffff:ffff:ffff:ffff'), '2001:db8:1:2::/64');
  assert.equal(rateKey('2001:0db8:0001:0002::5'), '2001:db8:1:2::/64');
  assert.equal(rateKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(rateKey('203.0.113.7'), '203.0.113.7');
  assert.equal(rateKey(undefined), 'unknown');
});

test('шифрованата 2FA чернова не се пренася между акаунти (AAD = userId)', async () => {
  process.env['LEDGER_SEAL_KEY'] ??= randomBytes(32).toString('hex');
  process.env['JWT_SECRET'] ??= randomBytes(32).toString('hex');
  process.env['DATABASE_URL'] ??= 'postgresql://x@127.0.0.1/x';
  process.env['PUBLIC_BASE_URL'] ??= 'http://127.0.0.1:4340';
  const { encryptTotpDraft, decryptTotpDraft, encryptTotpSecret, decryptTotpSecret } =
    await import('../src/auth/keys.js');
  const draft = encryptTotpDraft('JBSWY3DPEHPK3PXP', 'user-a');
  assert.equal(decryptTotpDraft(draft, 'user-a'), 'JBSWY3DPEHPK3PXP');
  assert.equal(decryptTotpDraft(draft, 'user-b'), null);
  const stored = encryptTotpSecret('JBSWY3DPEHPK3PXP', 'user-a');
  assert.throws(() => decryptTotpSecret(stored, 'user-b'));
});

test('токенът от връзката на покана и заявката не стигат до лога', () => {
  const token = 'qoyVHXU11JDZ3t-R6kh_NJw5WTeunbjcZJOXkumXsyA';
  assert.equal(safeLogPath(`/pokana/${token}`), '/pokana/[токен]');
  assert.equal(safeLogPath(`/pokana/${token}?lang=en`), '/pokana/[токен]');
  assert.equal(safeLogPath('/app/o/abc?next=/x'), '/app/o/abc');
  // Express 5 не различава главни и малки букви в пътя — редакцията също.
  assert.equal(safeLogPath(`/POKANA/${token}`), '/pokana/[токен]');
});
