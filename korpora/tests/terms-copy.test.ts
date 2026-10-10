import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// The confirmation mail is built for real (JSON transport, nothing leaves the machine): set the config
// before anything imports it.
process.env.NODE_ENV = 'test';
process.env.PUBLIC_BASE_URL = 'https://korpora.example';
process.env.DATABASE_URL = 'postgresql://127.0.0.1:5432/unused';
process.env.ENC_KEY = randomBytes(32).toString('hex');
process.env.HMAC_KEY = randomBytes(32).toString('hex');
process.env.CONTACT_EMAIL = 'contact@korpora.example';
process.env.LOG_LEVEL = 'silent';

const { LEGAL_UPDATED } = await import('../src/company.js');
const { LOCALES, translate } = await import('../src/i18n.js');
const { outbox } = await import('../src/mail/mailer.js');
const { formatMoney, priceTable } = await import('../src/plans/pricing.js');
const { termsCopy } = await import('../src/services/terms-copy.js');
const { sendOrderConfirmation } = await import('../src/services/order-mail.js');

test('the terms copy is the full, self-contained terms page of the language', async () => {
  const m1 = priceTable().find((row) => row.id === 'm1')!;
  for (const locale of LOCALES) {
    const copy = await termsCopy(locale, 'https://korpora.example', 'contact@korpora.example');
    assert.equal(copy.filename, `korpora-terms-${LEGAL_UPDATED.terms}-${locale}.html`);
    assert.equal(copy.contentType, 'text/html; charset=utf-8');
    assert.match(copy.content, /^<!doctype html>/);
    assert.ok(copy.content.includes(`<html lang="${locale}">`), locale);
    assert.ok(copy.content.includes('<base href="https://korpora.example/">'), locale);
    const title = translate(locale, 'legal.termsTitle').replaceAll("'", '&#39;');
    assert.ok(copy.content.includes(`<h1>${title}</h1>`), `${locale}: the title`);
    assert.ok(copy.content.includes('id="withdrawal"'), `${locale}: the right of withdrawal`);
    assert.ok(copy.content.includes('class="model-form"'), `${locale}: the model form`);
    assert.ok(
      copy.content.includes(formatMoney(m1.totalWithVatCents, locale)),
      `${locale}: prices`,
    );
    assert.ok(copy.content.includes('contact@korpora.example'), `${locale}: contact`);
    assert.doesNotMatch(copy.content, /<script|<link /, `${locale}: nothing loads from outside`);
    // the label from the drawings stays Bulgarian in the other languages, and says so (WCAG 3.1.2)
    if (locale !== 'bg')
      assert.ok(copy.content.includes('<span lang="bg">наш избор</span>'), `${locale}: label lang`);
  }
});

const order = {
  id: 'order-terms-copy',
  number: 42,
  option: 'm12',
  months: 12,
  listPriceCents: 25_500,
  buyerType: 'CONSUMER' as const,
  earlyStartRequestedAt: null,
  termsVersion: LEGAL_UPDATED.terms,
  status: 'OPEN' as const,
  createdAt: new Date('2026-10-05T10:00:00Z'),
  withdrawnAt: null,
};
const customer = {
  email: 'buyer@korpora.example',
  name: 'Купувач',
  locale: 'bg',
  emailVerifiedAt: new Date('2026-10-01T10:00:00Z'),
};

test('the order confirmation carries the accepted terms as a file', async () => {
  assert.equal(await sendOrderConfirmation(order, customer), true);
  const mail = outbox.at(-1)!;
  assert.equal(mail.to, customer.email);
  assert.equal(mail.attachments?.length, 1);
  assert.equal(mail.attachments[0]!.filename, `korpora-terms-${LEGAL_UPDATED.terms}-bg.html`);
  assert.match(
    mail.text,
    /са приложени към това писмо като файл; онлайн: https:\/\/korpora\.example\/terms/,
  );
});

test('terms changed since the order: no copy of other terms, only the link as before', async () => {
  assert.equal(
    await sendOrderConfirmation({ ...order, termsVersion: '2020-01-01' }, customer),
    true,
  );
  const mail = outbox.at(-1)!;
  assert.equal(mail.attachments, undefined);
  assert.match(
    mail.text,
    /Общите условия, които приехте с поръчката \(в сила от 1 януари 2020 г\.\): https:/,
  );
});

test('a replaced order is named in the confirmation', async () => {
  await sendOrderConfirmation(order, customer, [
    { number: 41, createdAt: new Date('2026-10-01T12:00:00Z') },
  ]);
  assert.match(
    outbox.at(-1)!.text,
    /Тази поръчка заменя поръчка № KP-2026-000041, която е отменена\./,
  );
});
