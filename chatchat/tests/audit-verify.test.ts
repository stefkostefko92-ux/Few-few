import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseArgs, verifyWithConfirmation } from '../src/cli/audit-verify-core.js';

/** Проверката на одитната верига по график: счупено е само ако и втората проверка го казва. */

function sequence(results: (number | null)[]) {
  let calls = 0;
  return {
    verify: () => Promise.resolve(results[calls++] ?? null),
    calls: () => calls,
  };
}

describe('verifyWithConfirmation', () => {
  test('цяла → една проверка, без пауза', async () => {
    const s = sequence([null]);
    const waits: number[] = [];
    const verdict = await verifyWithConfirmation(s.verify, async (ms) => waits.push(ms), 30_000);
    assert.deepEqual(verdict, { status: 'intact', transient: false });
    assert.equal(s.calls(), 1);
    assert.deepEqual(waits, []);
  });

  test('счупена и при втората → счупена, със звеното от втората', async () => {
    const s = sequence([7, 9]);
    const waits: number[] = [];
    const verdict = await verifyWithConfirmation(s.verify, async (ms) => waits.push(ms), 1234);
    assert.deepEqual(verdict, { status: 'broken', eventId: 9 });
    assert.deepEqual(waits, [1234]);
  });

  test('счупена само в първата (ретенцията по същото време) → цяла, отбелязано', async () => {
    const s = sequence([3, null]);
    const verdict = await verifyWithConfirmation(s.verify, async () => undefined, 0);
    assert.deepEqual(verdict, { status: 'intact', transient: true });
    assert.equal(s.calls(), 2);
  });

  test('грешка на базата не се превръща в „цяла“', async () => {
    await assert.rejects(
      verifyWithConfirmation(
        () => Promise.reject(new Error('P1001')),
        async () => undefined,
        0,
      ),
      /P1001/,
    );
  });
});

describe('parseArgs', () => {
  test('подразбиране 30 s; число в границите; иначе отказ', () => {
    assert.equal(parseArgs([]).confirmDelayMs, 30_000);
    assert.equal(parseArgs(['--confirm-delay-ms', '0']).confirmDelayMs, 0);
    assert.throws(() => parseArgs(['--confirm-delay-ms', '-1']));
    assert.throws(() => parseArgs(['--confirm-delay-ms', 'abc']));
    assert.throws(() => parseArgs(['--confirm-delay-ms', '700000']));
  });
});
