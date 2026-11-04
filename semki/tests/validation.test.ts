import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  batchCreateSchema,
  batchEditSchema,
  idListSchema,
  ruleSchema,
  seedTypeSchema,
  settingsSchema,
} from '../src/domain/validation.js';

const CH = '111111111111111111';
const RO = '222222222222222222';

test('партида: запетая като десетичен знак, граници', () => {
  const ok = batchCreateSchema.parse({ seedTypeKey: 'amnesia', count: '5', percent: '87,4' });
  assert.deepEqual(ok, { seedTypeKey: 'amnesia', count: 5, percent: 87.4 });
  assert.equal(batchCreateSchema.parse({ seedTypeKey: 'ak', count: 1, percent: 100 }).percent, 100);
  for (const bad of [
    { seedTypeKey: 'hash', count: '5', percent: '50' },
    { seedTypeKey: 'amnesia', count: '0', percent: '50' },
    { seedTypeKey: 'amnesia', count: '1.5', percent: '50' },
    { seedTypeKey: 'amnesia', count: '5', percent: '100.01' },
    { seedTypeKey: 'amnesia', count: '5', percent: '-1' },
    { seedTypeKey: 'amnesia', count: '5', percent: 'abc' },
    { seedTypeKey: 'amnesia', count: '5', percent: '' },
  ]) {
    assert.equal(batchCreateSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test('редакция на партида', () => {
  assert.deepEqual(batchEditSchema.parse({ count: '3', percent: '12.5' }), {
    count: 3,
    percent: 12.5,
  });
  assert.equal(batchEditSchema.safeParse({ count: '100001', percent: '12' }).success, false);
});

test('скорост на вид', () => {
  assert.deepEqual(seedTypeSchema.parse({ decayPercent: '0,6', decayMinutes: '60' }), {
    decayPercent: 0.6,
    decayMinutes: 60,
  });
  assert.equal(seedTypeSchema.safeParse({ decayPercent: '0', decayMinutes: '60' }).success, false);
  assert.equal(seedTypeSchema.safeParse({ decayPercent: '1', decayMinutes: '0' }).success, false);
});

test('правило: вид по избор, snowflake-ове, отметка', () => {
  const r = ruleSchema.parse({
    kind: 'PERCENT',
    threshold: '20',
    seedTypeKey: '',
    channelId: CH,
    roleId: RO,
    enabled: 'on',
  });
  assert.deepEqual(r, {
    kind: 'PERCENT',
    threshold: 20,
    seedTypeKey: null,
    channelId: CH,
    roleId: RO,
    enabled: true,
  });
  const off = ruleSchema.parse({
    kind: 'HOURS_LEFT',
    threshold: '150',
    seedTypeKey: 'skunk',
    channelId: CH,
    roleId: RO,
  });
  assert.equal(off.enabled, false);
  assert.equal(off.seedTypeKey, 'skunk');
  const base = { seedTypeKey: '', channelId: CH, roleId: RO };
  assert.equal(ruleSchema.safeParse({ ...base, kind: 'PERCENT', threshold: '150' }).success, false);
  assert.equal(ruleSchema.safeParse({ ...base, kind: 'NOPE', threshold: '10' }).success, false);
  assert.equal(
    ruleSchema.safeParse({ ...base, kind: 'PERCENT', threshold: '10', channelId: 'abc' }).success,
    false,
  );
});

test('настройки: час HH:MM, часова зона, празна роля = няма', () => {
  const s = settingsSchema.parse({
    dashboardRoleId: '',
    commandRoleId: RO,
    quietEnabled: 'on',
    windowStart: '09:30',
    windowEnd: '23:00',
    timezone: 'Europe/Sofia',
  });
  assert.deepEqual(s, {
    dashboardRoleId: null,
    commandRoleId: RO,
    quietEnabled: true,
    windowStart: '09:30',
    windowEnd: '23:00',
    timezone: 'Europe/Sofia',
  });
  const base = { dashboardRoleId: '', commandRoleId: '', windowStart: '10:00', windowEnd: '23:00' };
  assert.equal(settingsSchema.safeParse({ ...base, timezone: 'Mars/Base' }).success, false);
  assert.equal(
    settingsSchema.safeParse({ ...base, timezone: 'UTC', windowStart: '24:00' }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ ...base, timezone: 'UTC', windowEnd: '9:00' }).success,
    false,
  );
});

test('списък с партиди от отметките: един, няколко, повторения, грешни', () => {
  assert.deepEqual(idListSchema.parse('7'), [7]);
  assert.deepEqual(idListSchema.parse(['3', '9', '3']), [3, 9]);
  assert.equal(idListSchema.safeParse(undefined).success, false);
  assert.equal(idListSchema.safeParse([]).success, false);
  assert.equal(idListSchema.safeParse(['3', 'x']).success, false);
  assert.equal(
    idListSchema.safeParse(Array.from({ length: 501 }, (_, i) => String(i + 1))).success,
    false,
  );
});
