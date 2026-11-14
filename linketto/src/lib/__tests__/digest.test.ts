import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  digestEmail,
  digestToken,
  shouldSendDigest,
  verifyDigestToken,
} from '../digest';

const SECRET = 'x'.repeat(32);

test('digestToken: детерминиран, проверява се, не важи за друг потребител', () => {
  const token = digestToken('user1', SECRET);
  assert.match(token, /^[0-9a-f]{32}$/);
  assert.equal(token, digestToken('user1', SECRET));
  assert.ok(verifyDigestToken('user1', token, SECRET));
  assert.ok(!verifyDigestToken('user2', token, SECRET));
  assert.ok(!verifyDigestToken('user1', token, 'y'.repeat(32)));
  assert.ok(!verifyDigestToken('user1', 'nothex', SECRET));
  assert.ok(!verifyDigestToken('', token, SECRET));
});

test('shouldSendDigest: само при посещения и след ~седмица', () => {
  const now = new Date('2026-10-23T08:00:00Z');
  assert.equal(shouldSendDigest({ views: 0, lastDigestAt: null, now }), false);
  assert.equal(shouldSendDigest({ views: 3, lastDigestAt: null, now }), true);
  assert.equal(
    shouldSendDigest({ views: 3, lastDigestAt: new Date('2026-10-20T08:00:00Z'), now }),
    false,
  );
  assert.equal(
    shouldSendDigest({ views: 3, lastDigestAt: new Date('2026-10-17T08:00:00Z'), now }),
    true,
  );
});

test('digestEmail: езикова дупка на езика на потребителя, escape на името', () => {
  const { subject, html } = digestEmail({
    locale: 'bg',
    name: '<b>Мария</b>',
    views: 1234,
    missing: [
      { locale: 'it', name: 'Italiano', visitors: 40, percent: 40, hasTranslation: false },
      { locale: 'de', name: 'Deutsch', visitors: 10, percent: 10, hasTranslation: false },
    ],
    dashboardUrl: 'https://l.example/bg/dashboard?p=1',
    unsubscribeUrl: 'https://l.example/api/digest/unsubscribe?u=1&s=abc',
  });
  assert.match(subject, /Седмицата ти в Linketto/);
  assert.ok(html.includes('Italiano'));
  assert.ok(html.includes('Deutsch'));
  assert.ok(html.includes('&lt;b&gt;Мария&lt;/b&gt;'));
  assert.ok(!html.includes('<b>Мария</b>'));
  assert.ok(html.includes('#languages'));
  assert.ok(html.includes('u=1&amp;s=abc'));
});

test('digestEmail: непознат език → en; без дупка → към аналитиката', () => {
  const { subject, html } = digestEmail({
    locale: 'fi',
    name: null,
    views: 5,
    missing: [],
    dashboardUrl: 'https://l.example/fi/dashboard',
    unsubscribeUrl: 'https://l.example/u',
  });
  assert.match(subject, /Your week on Linketto/);
  assert.ok(html.includes('#stats'));
});
