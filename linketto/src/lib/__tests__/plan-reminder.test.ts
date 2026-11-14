import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReminderEmail } from '../plan-reminder';

// P8: напомнянето е на езика на потребителя, с линк за подновяване, без автоматично таксуване
test('P8: напомняне на български — дни, дата и линк за подновяване', () => {
  const { subject, html } = planReminderEmail({
    locale: 'bg',
    name: '<b>Мария</b>',
    plan: 'PRO',
    daysLeft: 7,
    expiresAt: new Date('2026-11-21T10:00:00Z'),
    renewUrl: 'https://l.example/bg/dashboard#plan',
  });
  assert.match(subject, /Pro/);
  assert.match(subject, /7/);
  assert.ok(html.includes('https://l.example/bg/dashboard#plan'));
  assert.ok(html.includes('&lt;b&gt;Мария&lt;/b&gt;'));
  assert.ok(!html.includes('<b>Мария</b>'));
  assert.match(html, /Не те таксуваме автоматично/);
});

test('P8: непознат език → английски; 1 ден', () => {
  const { subject, html } = planReminderEmail({
    locale: 'fi',
    name: null,
    plan: 'BUSINESS',
    daysLeft: 1,
    expiresAt: new Date('2026-11-15T10:00:00Z'),
    renewUrl: 'https://l.example/fi/dashboard#plan',
  });
  assert.match(subject, /Business/);
  assert.match(html, /we never charge you automatically/i);
});
