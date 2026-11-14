import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAN_CATEGORIES, banAllowed, banNoticeEmail, isBanCategory, warningNoticeEmail } from '../dsa-notice';

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

// ОУ: „Профили не се спират без предизвестие, освен при тежки злоупотреби“ —
// спам/друго иска предупреждение и поне 7 дни срок; фишинг/представяне/незаконно — веднага.
test('banAllowed: тежките нарушения — веднага; леките — след предупреждение и 7 дни', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  assert.equal(banAllowed({ category: 'phishing', warnedAt: null, now }), 'ok');
  assert.equal(banAllowed({ category: 'illegal', warnedAt: null, now }), 'ok');
  assert.equal(banAllowed({ category: 'spam', warnedAt: null, now }), 'warn-first');
  assert.equal(banAllowed({ category: 'other', warnedAt: new Date('2026-11-18T10:00:00Z'), now }), 'wait');
  assert.equal(banAllowed({ category: 'spam', warnedAt: new Date('2026-11-13T10:00:00Z'), now }), 'ok');
});

test('бележката казва срок и обхват, без невярното „изтегли съдържанието“; правно основание при незаконно', () => {
  const { html } = banNoticeEmail({
    locale: 'bg',
    slug: 'ana',
    category: 'illegal',
    reason: 'Продава фалшиви документи.',
    legalGround: 'чл. 308 НК',
    decidedAt: new Date('2026-11-14T10:00:00Z'),
    fromReport: false,
  });
  assert.match(html, /неопределен срок/);
  assert.match(html, /всички държави/);
  assert.match(html, /чл\. 308 НК/);
  assert.ok(!/изтеглиш съдържанието/.test(html));
});

test('предупреждението носи нарушението, срока за поправка и възможност за възражение', () => {
  const { subject, html } = warningNoticeEmail({
    locale: 'bg',
    slug: 'ana',
    category: 'spam',
    reason: 'Масово изпращане на подвеждащи линкове.',
    decidedAt: new Date('2026-11-14T10:00:00Z'),
    fromReport: true,
  });
  assert.match(subject, /предупреждение/i);
  assert.match(html, /21 ноември 2026/);
  assert.match(html, /info@carbonstealth\.eu/);
  assert.match(html, /сигнал/);
  const en = warningNoticeEmail({
    locale: 'xx',
    slug: 'ana',
    category: 'other',
    reason: 'x',
    decidedAt: new Date('2026-11-14T10:00:00Z'),
    fromReport: false,
  });
  assert.match(en.subject, /warning/i);
});
