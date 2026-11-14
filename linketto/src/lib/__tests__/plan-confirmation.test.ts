import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planConfirmationEmail } from '../plan-confirmation';

// P14 (правен преглед 2026-11-14): потвърждение на траен носител след плащане
// (чл. 8(7) Дир. 2011/83) — търговец, план, период, срок, сума с ДДС, без
// автоматично подновяване, право на отказ + стандартен формуляр, Общи условия.
const base = {
  plan: 'PRO',
  interval: 'quarterly',
  amountCents: 1080,
  vatCents: 180,
  vatRateBp: 2000,
  paidUntil: new Date('2027-02-14T10:00:00Z'),
  orderRef: 'ord_123',
  termsUrl: 'https://l.example/bg/terms',
};

test('P14: български — всички задължителни елементи', () => {
  const { subject, html } = planConfirmationEmail({ ...base, locale: 'bg', name: 'Мария' });
  assert.match(subject, /Linketto Pro/);
  assert.match(html, /Carbon Stealth VCC/);
  assert.match(html, /208725180/);
  assert.match(html, /3 месеца/);
  assert.match(html, /€10\.80/);
  assert.match(html, /€1\.80/);
  assert.match(html, /20\s?%/);
  assert.match(html, /без автоматично подновяване/i);
  assert.match(html, /14 дни/);
  assert.match(html, /формуляр за отказ/i);
  assert.ok(html.includes('https://l.example/bg/terms'));
  assert.ok(html.includes('ord_123'));
});

test('P14: английски; Founder без срок', () => {
  const { subject, html } = planConfirmationEmail({
    ...base,
    locale: 'en',
    name: null,
    plan: 'FOUNDER',
    interval: 'lifetime',
    amountCents: 4900,
    vatCents: 817,
    paidUntil: null,
  });
  assert.match(subject, /Linketto Founder/);
  assert.match(html, /no automatic renewal/i);
  assert.match(html, /model withdrawal form/i);
  assert.match(html, /€49\.00/);
  assert.ok(!/paid until/i.test(html));
});

test('P14: непознат език → английски; потребителският вход е екраниран', () => {
  const { html } = planConfirmationEmail({ ...base, locale: 'fi', name: '<img src=x>' });
  assert.match(html, /14 days/);
  assert.ok(!html.includes('<img src=x>'));
  assert.ok(html.includes('&lt;img src=x&gt;'));
});

test('P14: ред с бутона „Откажете се от договора тук“ и последния ден на срока', () => {
  const { html } = planConfirmationEmail({
    ...base,
    locale: 'bg',
    name: null,
    withdrawUntil: new Date('2026-11-28T00:00:00Z'),
    dashboardUrl: 'https://l.example/bg/dashboard#plan',
  });
  assert.match(html, /Откажете се от договора тук/);
  assert.match(html, /28 ноември 2026/);
  assert.ok(html.includes('https://l.example/bg/dashboard#plan'));
});
