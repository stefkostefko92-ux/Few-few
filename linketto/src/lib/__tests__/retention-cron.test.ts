import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RETENTION_DAYS } from '../retention-days';

// Сроковете от политиката живеят на ДВЕ места: retention-days.ts (приложението
// чисти лениво) и deploy/linketto-cron.sh (дневният таймер на сървъра — реалният
// гарант, DEPLOY.md §9). Тестът пази двете да не се разминат тихо.
const CRON = readFileSync(join(__dirname, '..', '..', '..', 'deploy', 'linketto-cron.sh'), 'utf8');

function intervalFor(table: string, extra = ''): number {
  const re = new RegExp(
    `DELETE FROM "${table}"\\s+WHERE ${extra}"createdAt" < now\\(\\) - interval '(\\d+) days';`,
  );
  const m = CRON.match(re);
  assert.ok(m, `няма DELETE за ${table} в deploy/linketto-cron.sh`);
  return Number(m[1]);
}

test('cron сроковете съвпадат с RETENTION_DAYS', () => {
  assert.equal(intervalFor('ClickEvent'), RETENTION_DAYS.clickEvent);
  assert.equal(intervalFor('ContactMessage'), RETENTION_DAYS.contactMessage);
  assert.equal(intervalFor('Booking'), RETENTION_DAYS.booking);
  assert.equal(intervalFor('LoginEvent'), RETENTION_DAYS.loginEvent);
  assert.equal(
    intervalFor('Subscriber', '"confirmedAt" IS NULL AND '),
    RETENTION_DAYS.unconfirmedSubscriber,
  );
});

test('cron чисти изтеклите сесии', () => {
  assert.match(CRON, /DELETE FROM "Session"\s+WHERE "expiresAt" < now\(\);/);
});
