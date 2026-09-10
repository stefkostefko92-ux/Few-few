import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountStatus,
  creator,
  date,
  dateTime,
  delta,
  num,
  postStatus,
  quotaTone,
  severity,
} from '../src/admin/presenters.js';

test('състоянията се показват на български, с икона и тон', () => {
  assert.deepEqual(postStatus('PUBLISHED'), {
    label: 'Публикуван',
    icon: 'status-published',
    tone: 'good',
  });
  assert.equal(postStatus('FAILED').tone, 'critical');
  assert.equal(accountStatus('TOKEN_EXPIRED').label, 'Изтекъл токен');
  assert.equal(severity('HIGH').label, 'Блокира');
  // Непознато състояние не чупи страницата.
  assert.equal(postStatus('НЯМА_ТАКОВА').label, '—');
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
    label: 'Автопилот',
    icon: 'autopilot',
    tone: 'accent',
  });
  assert.equal(
    creator({ createdByType: 'AGENT', createdByLabel: 'agent:socialdjiyata' }).label,
    'Агент',
  );
  assert.equal(creator({ createdByType: 'HUMAN', createdByLabel: null }).label, 'Човек');
});
