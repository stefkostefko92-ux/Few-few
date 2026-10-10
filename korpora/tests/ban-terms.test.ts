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

const { BAN_RULE_TERMS, LEGAL_UPDATED, TERMS_NOTICE_DAYS } = await import('../src/company.js');
const { LOCALES, translate } = await import('../src/i18n.js');
type Locale = (typeof LOCALES)[number];
const { BAN_REPLY_DAYS, BAN_WARNING_DAYS } = await import('../src/plans/ban.js');
const { LIFETIME_BASIS_MONTHS } = await import('../src/plans/pricing.js');
const { termsCopy } = await import('../src/services/terms-copy.js');
const { banRuleDates } = await import('../src/services/legal-numbers.js');

const CONTACT = 'contact@korpora.example';
const visible = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/[ \t\r\n]+/g, ' ');
const copy = async (locale: Locale) =>
  (await termsCopy(locale, 'https://korpora.example', CONTACT)).content;

/**
 * The section names a text points to: „…“ after „раздел(и)“, “…” after „section(s)“, «…» after
 * „sezione/sezioni“ — with the lists („раздели „А“, „Б“ и „В““).
 */
const SECTION = {
  bg: /раздел(?:и)? „[^“]+“(?:(?:, | и )„[^“]+“)*/g,
  en: /sections? “[^”]+”(?:(?:, | and )“[^”]+”)*/g,
  it: /sezion[ei] «[^»]+»(?:(?:, | e )«[^»]+»)*/g,
} as const;
const QUOTED = { bg: /„([^“]+)“/g, en: /“([^”]+)”/g, it: /«([^»]+)»/g } as const;

function sectionsIn(text: string, locale: Locale): string[] {
  return [...text.matchAll(SECTION[locale])].flatMap((match) =>
    [...match[0].matchAll(QUOTED[locale])].map((quoted) => quoted[1]!),
  );
}

test('the no-refund rule came with the terms of 2026-10-10 and keeps that date', () => {
  // When the terms change again, LEGAL_UPDATED.terms moves on, but the old orders got the rule with this
  // version (or with the day it was really published): write that date into BAN_RULE_TERMS in
  // src/company.ts instead of LEGAL_UPDATED.terms, then change it here.
  assert.equal(BAN_RULE_TERMS, '2026-10-10');
  assert.ok(BAN_RULE_TERMS <= LEGAL_UPDATED.terms);
});

test('the dates of the transition are computed from the version, 30 days apart, in every language', async () => {
  // the oracle is written out: 10 October 2026 + 30 days = 9 November 2026
  const expected = {
    bg: ['преди 10 октомври 2026 г., правилото', 'важи от 9 ноември 2026 г. Дотогава'],
    en: ['before 10 October 2026, the rule', 'applies from 9 November 2026. Until then'],
    it: [
      'prima del giorno 10 ottobre 2026, la regola',
      'dal giorno 9 novembre 2026. Fino ad allora',
    ],
  } as const;
  assert.equal(TERMS_NOTICE_DAYS, 30);
  for (const locale of LOCALES) {
    const page = visible(await copy(locale));
    for (const part of expected[locale]) assert.ok(page.includes(part), `${locale}: ${part}`);
  }
});

test('the terms say the notice of a change in the same number of days the transition uses', async () => {
  const notice = {
    bg: 'поне {n} дни преди',
    en: 'at least {n} days before',
    it: 'almeno {n} giorni prima',
  };
  for (const locale of LOCALES) {
    const page = visible(await copy(locale));
    const text = notice[locale].replace('{n}', String(TERMS_NOTICE_DAYS));
    assert.ok(page.includes(text), `${locale}: ${text}`);
  }
});

test('the blocking section: grounds, warning, reasons, no refund, the mistake and the numbers from the code', async () => {
  const said = {
    bg: [
      /Основания за блокиране са:/,
      /ако имейлът ви е потвърден/,
      /Платеното за плана — Premium или Lifetime — не се връща/,
      /При блокиране заради нарушение платеното за плана, включително за Lifetime, не се връща/,
      /не засяга правото на отказ/,
      /удължава с времето, през което акаунтът е бил блокиран/,
    ],
    en: [
      /The grounds for blocking are:/,
      /if your email address is confirmed/,
      /whether Premium or Lifetime, is not refunded/,
      /what was paid for the plan, Lifetime included, is not refunded/,
      /does not affect your right of withdrawal/,
      /by the time the account was blocked/,
    ],
    it: [
      /I motivi di blocco sono:/,
      /se il vostro indirizzo email è confermato/,
      /sia Premium sia Lifetime, non viene rimborsato/,
      /quanto pagato per il piano, anche per Lifetime, non viene rimborsato/,
      /non tocca il diritto di recesso/,
      /del tempo in cui l'account è rimasto bloccato/,
    ],
  } as const;
  for (const locale of LOCALES) {
    const html = await copy(locale);
    assert.ok(html.includes('<h2 id="blocking">'), `${locale}: the anchor of the plan page`);
    const page = visible(html);
    for (const pattern of said[locale]) assert.match(page, pattern, locale);
    for (const n of [BAN_WARNING_DAYS, BAN_REPLY_DAYS])
      assert.ok(page.includes(translate(locale, 'common.days', { n })), `${locale}: ${n} days`);
    const basis = translate(locale, 'plan.months', { n: LIFETIME_BASIS_MONTHS });
    assert.ok(page.includes(basis), `${locale}: ${basis}`);
  }
});

test('every section the terms and the blocking mail point to is a heading of the terms', async () => {
  for (const locale of LOCALES) {
    const html = await copy(locale);
    const headings = new Set(
      [...html.matchAll(/<h2(?: id="[a-z]+")?>([^<]+)<\/h2>/g)].map((m) =>
        m[1]!.replace(/&#39;/g, "'"),
      ),
    );
    const named = [
      ...sectionsIn(visible(html), locale),
      ...sectionsIn(
        translate(locale, 'mail.banned.body', { reason: '', terms: '', contact: '' }),
        locale,
      ),
      ...sectionsIn(translate(locale, 'mail.banned.paid'), locale),
      ...sectionsIn(translate(locale, 'mail.banned.paidOld', { since: '', from: '' }), locale),
    ];
    assert.ok(named.length > 15, `${locale}: only ${named.length} references found`);
    const missing = named.filter((name) => !headings.has(name));
    assert.deepEqual([...new Set(missing)], [], locale);
  }
});

test('the blocking mail names the four sections, the end of the contract and the extension', () => {
  const sections = {
    bg: ['Акаунт', 'Тестов период', 'Какво не е разрешено', 'Блокиране'],
    en: ['Account', 'Trial', 'What is not allowed', 'Blocking'],
    it: ['Account', 'Periodo di prova', 'Che cosa non è consentito', 'Blocco'],
  } as const;
  const said = {
    bg: [/не се връща/, /удължаваме/, /мотивирано решение до 14 дни/],
    en: [/is not refunded/, /extend/, /reasoned decision within 14 days/],
    it: [/non viene rimborsato/, /prolunghiamo/, /decisione motivata entro 14 giorni/],
  } as const;
  for (const locale of LOCALES) {
    const body = translate(locale, 'mail.banned.body', {
      reason: 'R',
      terms: 'T',
      contact: 'C',
      reply: translate(locale, 'common.days', { n: BAN_REPLY_DAYS }),
      paid: translate(locale, 'mail.banned.paid'),
    });
    const named = sectionsIn(body, locale);
    for (const name of sections[locale]) assert.ok(named.includes(name), `${locale}: ${name}`);
    for (const pattern of said[locale]) assert.match(body, pattern, locale);
  }
});

test('the blocking mail to an order under the old terms: the dates of the terms and the refund', () => {
  const said = {
    bg: [
      'отпреди 10 октомври 2026 г., а за такива поръчки',
      'важи от 9 ноември 2026 г. (раздел „Блокиране“)',
      'връщаме неизползваната част от цената',
    ],
    en: [
      'in force before 10 October 2026, and for such orders',
      'applies from 9 November 2026 (section “Blocking”)',
      'we refund the unused part of the price',
    ],
    it: [
      'in vigore prima del giorno 10 ottobre 2026 e per questi ordini',
      'a decorrere dal giorno 9 novembre 2026 (sezione «Blocco»)',
      'vi rimborsiamo la parte di prezzo non utilizzata',
    ],
  } as const;
  for (const locale of LOCALES) {
    const dates = banRuleDates(locale);
    const text = translate(locale, 'mail.banned.paidOld', {
      since: dates.banRuleSince,
      from: dates.banRuleOldOrders,
    });
    for (const part of said[locale]) assert.ok(text.includes(part), `${locale}: ${part}`);
    assert.notEqual(text, translate(locale, 'mail.banned.paid'), locale);
  }
});
