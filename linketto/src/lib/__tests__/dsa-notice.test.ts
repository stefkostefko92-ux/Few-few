import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAN_CATEGORIES, banNoticeEmail, isBanCategory } from '../dsa-notice';

// DSA чл. 17: изложение на мотивите — решение и обхват, факти (вкл. по сигнал ли е),
// без автоматизирани средства, основание (ОУ/закон), възможности за обжалване.

test('категориите са известни; непозната → невалидна', () => {
  assert.ok(BAN_CATEGORIES.includes('phishing'));
  assert.equal(isBanCategory('phishing'), true);
  assert.equal(isBanCategory('constructor'), false);
});

test('писмото носи всички елементи по чл. 17 (bg)', () => {
  const { subject, html } = banNoticeEmail({
    locale: 'bg',
    slug: 'ana',
    category: 'phishing',
    reason: 'Линкът „Вход в банката“ води към <фалшива> страница.',
    decidedAt: new Date('2026-11-14T10:00:00Z'),
    fromReport: true,
  });
  assert.match(subject, /ana/);
  assert.match(html, /\/u\/ana/);
  assert.match(html, /фишинг/i);
  assert.ok(html.includes('&lt;фалшива&gt;'));
  assert.ok(!html.includes('<фалшива>'));
  assert.match(html, /сигнал/);
  assert.match(html, /автоматизирани/);
  assert.match(html, /Общите условия/);
  assert.match(html, /info@carbonstealth\.eu/);
  assert.match(html, /Координатора за цифрови услуги/);
  assert.match(html, /съд/);
});

test('непознат език → английски; по собствена инициатива', () => {
  const { html } = banNoticeEmail({
    locale: 'fi',
    slug: 'x',
    category: 'other',
    reason: 'Spam links.',
    decidedAt: new Date('2026-11-14T10:00:00Z'),
    fromReport: false,
  });
  assert.match(html, /own initiative/);
  assert.match(html, /Digital Services Coordinator/);
});
