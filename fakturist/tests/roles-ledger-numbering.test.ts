import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveRole, roleCan, weaker } from '../src/auth/roles.js';
import { entryHash, GENESIS, sha256, verifyChain, type StoredEntry } from '../src/ledger/chain.js';
import { formatNumber, isValidRange, overlaps } from '../src/documents/numbering.js';

test('роли: способности, не нива', () => {
  assert.ok(roleCan('ISSUER', 'documents.issue'));
  assert.equal(roleCan('ISSUER', 'documents.cancel'), false);
  assert.equal(roleCan('VIEWER', 'documents.issue'), false);
  assert.equal(roleCan('ADMIN', 'billing.manage'), false);
  assert.ok(roleCan('OWNER', 'billing.manage'));
  assert.equal(weaker('OWNER', 'ACCOUNTANT'), 'ACCOUNTANT');
});

test('кантора: достъп до клиента само с действащо пълномощно, най-много ACCOUNTANT', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  const memberships = [{ organizationId: 'firm', role: 'OWNER' as const }];
  const mandate = {
    firmId: 'firm',
    clientId: 'client',
    status: 'ACTIVE' as const,
    validFrom: new Date('2026-01-01'),
    validTo: null,
  };
  assert.deepEqual(effectiveRole('client', memberships, [mandate], now), {
    role: 'ACCOUNTANT',
    viaFirmId: 'firm',
  });
  assert.equal(
    effectiveRole('client', memberships, [{ ...mandate, status: 'REVOKED' }], now),
    null,
  );
  assert.equal(
    effectiveRole('client', memberships, [{ ...mandate, validTo: new Date('2026-06-30') }], now),
    null,
  );
  assert.equal(effectiveRole('client', [], [mandate], now), null);
  const viewer = [{ organizationId: 'firm', role: 'VIEWER' as const }];
  assert.equal(effectiveRole('client', viewer, [mandate], now)?.role, 'VIEWER');
});

test('номерация: десет цифри, диапазони без застъпване', () => {
  assert.equal(formatNumber(124n), '0000000124');
  assert.throws(() => formatNumber(0n));
  assert.throws(() => formatNumber(10_000_000_000n));
  assert.ok(isValidRange({ rangeStart: 1n, rangeEnd: 999_999_999n }));
  assert.equal(isValidRange({ rangeStart: 5n, rangeEnd: 4n }), false);
  assert.ok(overlaps({ rangeStart: 1n, rangeEnd: 100n }, { rangeStart: 100n, rangeEnd: 200n }));
  assert.equal(
    overlaps({ rangeStart: 1n, rangeEnd: 99n }, { rangeStart: 100n, rangeEnd: 200n }),
    false,
  );
});

function chainOf(count: number, seal: (h: string) => string): StoredEntry[] {
  const out: StoredEntry[] = [];
  let prev = GENESIS;
  for (let i = 1; i <= count; i += 1) {
    const content = {
      organizationId: 'org',
      chainIndex: BigInt(i),
      number: formatNumber(BigInt(i)),
      typeCode: '380',
      status: 'ISSUED' as const,
      issueDate: '2026-11-12',
      payableCents: BigInt(1000 * i),
      vatCents: BigInt(200 * i),
      ublSha256: sha256(`ubl${i}`),
      ciiSha256: sha256(`cii${i}`),
      prevHash: prev,
    };
    const hash = entryHash(content);
    out.push({ ...content, sha256: hash, seal: seal(hash) });
    prev = hash;
  }
  return out;
}

test('веригата: цяла минава; промяна на сума, връзка или печат се хваща', () => {
  const seal = (h: string) => sha256(`key:${h}`);
  const chain = chainOf(4, seal);
  assert.equal(verifyChain(chain, seal), null);

  const tampered = chain.map((e) => ({ ...e }));
  tampered[1] = { ...tampered[1]!, payableCents: 1n };
  assert.deepEqual(verifyChain(tampered, seal), { kind: 'hash', at: 2n });

  const relinked = chain.map((e) => ({ ...e }));
  relinked[2] = { ...relinked[2]!, prevHash: GENESIS };
  assert.deepEqual(verifyChain(relinked, seal), { kind: 'link', at: 3n });

  // Пренаписана верига с нов отпечатък, но без ключа за печата.
  const forged = chainOf(4, (h) => sha256(`wrong:${h}`));
  assert.deepEqual(verifyChain(forged, seal), { kind: 'seal', at: 1n });

  assert.deepEqual(verifyChain(chain.slice(1), seal), { kind: 'index', at: 2n });
});
