import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// The terms are rendered for real from their template: set the config before anything imports it.
process.env.NODE_ENV = 'test';
process.env.PUBLIC_BASE_URL = 'https://korpora.example';
process.env.DATABASE_URL = 'postgresql://127.0.0.1:5432/unused';
process.env.ENC_KEY = randomBytes(32).toString('hex');
process.env.HMAC_KEY = randomBytes(32).toString('hex');
process.env.CONTACT_EMAIL = 'contact@korpora.example';
process.env.LOG_LEVEL = 'silent';

const { LOCALES, translate } = await import('../src/i18n.js');
type Locale = (typeof LOCALES)[number];
const pricing = await import('../src/plans/pricing.js');
const { termsCopy } = await import('../src/services/terms-copy.js');
const { landingTextParams } = await import('../src/seo/structured-data.js');

const CONTACT = 'contact@korpora.example';
/** The visible text of a page: no tags, one space between words. */
const visible = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/[ \t\r\n]+/g, ' ');
const terms = async (locale: Locale) =>
  visible((await termsCopy(locale, 'https://korpora.example', CONTACT)).content);

test('Lifetime: the share of one month is the Premium month, from the price list', () => {
  assert.ok(Number.isInteger(pricing.LIFETIME_BASIS_MONTHS), 'whole months');
  assert.equal(pricing.LIFETIME_BASIS_MONTHS, 30, '750 € = 30 × 25 €');
  const share = pricing.lifetimeMonthShareCents();
  assert.equal(share.net, pricing.MONTHLY_CENTS);
  assert.equal(share.net * pricing.LIFETIME_BASIS_MONTHS, pricing.lifetimePriceCents());
  assert.equal(
    share.gross * pricing.LIFETIME_BASIS_MONTHS,
    pricing.withVatCents(pricing.lifetimePriceCents()),
  );
});

test('the terms give notice before Korpora stops and one refund basis for Lifetime, in every language', async () => {
  const share = pricing.lifetimeMonthShareCents();
  const headings = {
    bg: ['Бета версия', 'Промени в услугата', 'Ако Korpora спре', 'Планове и цени'],
    en: [
      'Beta version',
      'Changes to the service',
      'If Korpora is discontinued',
      'Plans and prices',
    ],
    it: ['Versione beta', 'Modifiche al servizio', 'Cessazione del servizio', 'Piani e prezzi'],
  } as const;
  for (const locale of LOCALES) {
    const copy = (await termsCopy(locale, 'https://korpora.example', CONTACT)).content;
    for (const heading of headings[locale])
      assert.ok(copy.includes(`<h2>${heading}</h2>`), `${locale}: ${heading}`);
    const page = visible(copy);
    const months = (n: number) => translate(locale, 'plan.months', { n });
    assert.ok(page.includes(months(pricing.LIFETIME_NOTICE_MONTHS)), `${locale}: the notice`);
    assert.ok(page.includes(months(pricing.LIFETIME_BASIS_MONTHS)), `${locale}: the basis`);
    assert.ok(page.includes(pricing.formatMoney(share.gross, locale)), `${locale}: gross share`);
    assert.ok(page.includes(pricing.formatMoney(share.net, locale)), `${locale}: net share`);
    // the share is stated once, under the prices; the withdrawal, the changes of the service, the
    // discontinuation and the changes of the terms point to that section
    const plans = page.split(headings[locale][3]).length - 1;
    assert.ok(plans >= 5, `${locale}: the prices section is referred to (${plans})`);
  }
});

test('the terms say why the VAT is Bulgarian for consumers from every country', async () => {
  const basis = {
    bg: /българският ДДС[^.]*чл\.\s59в от Директива 2006\/112\/ЕО/,
    en: /Bulgarian VAT[^.]*Article 59c of Directive 2006\/112\/EC/,
    it: /IVA bulgara[^.]*articolo 59 quater della direttiva 2006\/112\/CE/,
  } as const;
  for (const locale of LOCALES) assert.match(await terms(locale), basis[locale], locale);
});

test('the discounts are paired with their terms: „respectively“ in the terms and in the FAQ', async () => {
  const word = { bg: /отстъпката е съответно/, en: /respectively/, it: /rispettivamente/ } as const;
  // the terms are a choice („3, 6 or 12“), the discounts are their pairs („5 %, 10 % and 20 %“)
  const and = { bg: ' и ', en: ' and ', it: ' e ' } as const;
  const percents = pricing
    .priceTable()
    .filter((p) => p.discountPercent > 0)
    .map((p) => p.discountPercent);
  for (const locale of LOCALES) {
    const page = await terms(locale);
    assert.match(page, word[locale], `${locale}: terms`);
    assert.match(translate(locale, 'landing.faq.price.a'), word[locale], `${locale}: FAQ`);
    const unit = locale === 'bg' ? '\u00a0%' : '%';
    const shown = percents.map((n) => `${n}${unit}`);
    const pairs = shown.slice(0, -1).join(', ') + and[locale] + shown[shown.length - 1];
    assert.ok(page.includes(pairs), `${locale}: terms list ${pairs}`);
    const faq = landingTextParams(locale, pricing.priceTable()).faq.price?.discounts;
    assert.equal(faq, pairs, `${locale}: FAQ list`);
  }
});

test('the terms say that every change of the service is explained', async () => {
  const said = {
    bg: /За всяка промяна в Korpora ви казваме ясно какво се променя/,
    en: /For every change to Korpora we tell you clearly what changes/,
    it: /Per ogni modifica di Korpora vi diciamo chiaramente che cosa cambia/,
  } as const;
  for (const locale of LOCALES) assert.match(await terms(locale), said[locale], locale);
});

test('the refund deadline reads as a deadline, counted from the withdrawal, in every language', () => {
  const deadline = {
    bg: {
      days: 'не по-късно от {refundDays} дни от получаването на отказа',
      date: 'не по-късно от {date}',
    },
    en: {
      days: 'no later than {refundDays} days after we receive your withdrawal',
      date: 'no later than {date}',
    },
    it: {
      days: 'entro {refundDays} giorni dal ricevimento del recesso',
      date: '(termine: {date})',
    },
  } as const;
  for (const locale of LOCALES) {
    for (const key of [
      'plan.withdraw.effect',
      'plan.withdraw.effectEarly',
      'mail.order.withdrawalConsumer',
    ])
      assert.ok(translate(locale, key).includes(deadline[locale].days), `${locale}.${key}`);
    for (const key of ['mail.withdrawn.refund', 'mail.withdrawn.refundEarly'])
      assert.ok(translate(locale, key).includes(deadline[locale].date), `${locale}.${key}`);
  }
});

test('the FAQ does not promise that everything works in the beta', () => {
  const overclaim = {
    bg: /всичко работи/,
    en: /everything works/i,
    it: /tutto funziona/i,
  } as const;
  for (const locale of LOCALES)
    assert.doesNotMatch(translate(locale, 'landing.faq.beta.a'), overclaim[locale], locale);
});
