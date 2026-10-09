import assert from 'node:assert/strict';
import test from 'node:test';
import { keysOf } from '../src/i18n.js';
import {
  accountStatus,
  actor,
  creator,
  date,
  kind,
  roleKey,
  dateTime,
  delta,
  num,
  postStatus,
  quotaTone,
  severity,
} from '../src/admin/presenters.js';

test('състоянията сочат към ключ за превод, с икона и тон', () => {
  assert.deepEqual(postStatus('PUBLISHED'), {
    key: 'status.PUBLISHED',
    icon: 'status-published',
    tone: 'good',
  });
  assert.equal(postStatus('FAILED').tone, 'critical');
  assert.equal(accountStatus('TOKEN_EXPIRED').key, 'status.TOKEN_EXPIRED');
  assert.equal(severity('HIGH').key, 'status.HIGH');
  // Непознато състояние не чупи страницата.
  assert.equal(postStatus('НЯМА_ТАКОВА').key, 'status.unknown');
});

test('всеки ключ от представянията съществува в речниците', () => {
  const known = new Set(keysOf('bg'));
  const keys = [
    ...['DRAFT', 'REJECTED', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED'].map(
      (s) => postStatus(s).key,
    ),
    ...['ACTIVE', 'TOKEN_EXPIRED', 'DISABLED'].map((s) => accountStatus(s).key),
    ...['HIGH', 'MEDIUM', 'INFO'].map((s) => severity(s).key),
    ...['HUMAN', 'AGENT', 'SYSTEM'].map((s) => actor(s).key),
    kind('IMAGE').key,
    kind('REELS').key,
    creator({ createdByType: 'SYSTEM', createdByLabel: 'автопилот' }).key,
    postStatus('НЯМА').key,
    roleKey('OWNER'),
  ];
  const missing = keys.filter((key) => !known.has(key));
  assert.deepEqual(missing, [], `ключове без превод: ${missing.join(', ')}`);
});

test('датата е къса и не се пренася', () => {
  assert.equal(date(new Date(2026, 7, 29)), '29 авг 2026');
  assert.equal(date(new Date(2026, 2, 3)), '3 март 2026');
  assert.equal(date(null), '—');
  assert.match(dateTime(new Date(2026, 7, 29, 14, 5)), /^29 авг 2026, \d{2}:\d{2}$/);
});

test('числата са с разделител, липсващото е тире', () => {
  assert.equal(num(18420), '18 420'.replace(' ', num(18420).includes(' ') ? ' ' : ' '));
  assert.equal(num(null), '—');
  assert.equal(num(0), '0');
});

test('делтата се чете и без цвят', () => {
  assert.deepEqual(delta(52), { text: '+52', tone: 'up', icon: 'trend-up' });
  assert.equal(delta(-16)?.text, '−16');
  assert.equal(delta(0)?.tone, 'flat');
  assert.equal(delta(null), null);
});

test('квотата предупреждава преди да свърши', () => {
  assert.equal(quotaTone(10, 100), 'info');
  assert.equal(quotaTone(75, 100), 'warn');
  assert.equal(quotaTone(95, 100), 'critical');
  assert.equal(quotaTone(0, 0), 'neutral');
});

test('автопилотът се вижда като автопилот, не като „Система“', () => {
  assert.deepEqual(creator({ createdByType: 'SYSTEM', createdByLabel: 'автопилот' }), {
    key: 'status.AUTOPILOT',
    icon: 'autopilot',
    tone: 'accent',
  });
  assert.equal(
    creator({ createdByType: 'AGENT', createdByLabel: 'agent:socialdjiyata' }).key,
    'status.AGENT',
  );
  assert.equal(creator({ createdByType: 'HUMAN', createdByLabel: null }).key, 'status.HUMAN');
});
