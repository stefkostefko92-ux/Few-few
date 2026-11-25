import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTestDatabase } from './integration/db-guard.js';

test('the suite empties only a database named for tests', () => {
  for (const name of ['korpora_test', 'korpora_ci_p2d', 'shop_ci', 'TEST_korpora'])
    assert.doesNotThrow(() => assertTestDatabase(`postgresql://u:secret@127.0.0.1:5432/${name}`));
  for (const name of ['korpora', 'korpora_dev', 'contest', 'korpora_citest', 'postgres']) {
    assert.throws(
      () => assertTestDatabase(`postgresql://u:secret@db:5432/${name}`),
      (error: unknown) =>
        error instanceof Error && error.message.includes(name) && !error.message.includes('secret'),
      name,
    );
  }
  assert.throws(() => assertTestDatabase('not a url'), /not a valid URL/);
});
