// legal-texts.test.ts — правните текстове казват каквото прави кодът (02.11.2026, Т1/Т2/П1/П2).
// Т2 (програма за покани) чете процента и прага от кода през плейсхолдъри; всеки роден правен локал
// трябва да ги носи и да се форматира — иначе страницата пада или обещава друго число.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { REFERRAL_MIN_PAYOUT_CENTS, REFERRAL_PERCENT } from '../referral';

const DIR = join(__dirname, '..', '..', '..', 'messages');
const LEGAL_LOCALES = ['bg', 'en', 'it', 'es', 'de', 'fr'] as const;
const load = (l: string) =>
  JSON.parse(readFileSync(join(DIR, `${l}.json`), 'utf8')) as {
    legal: { termsBody: string; privacyBody: string; cookiesBody: string };
    pricing?: Record<string, string>;
  };

test('termsBody: Т2 носи {percent} и {minPayout} и се форматира с числата от кода', () => {
  for (const l of LEGAL_LOCALES) {
    const body = load(l).legal.termsBody;
    assert.ok(body.includes('{percent}') && body.includes('{minPayout}'), `${l}: плейсхолдърите`);
    const out = String(
      new IntlMessageFormat(body, l).format({
        percent: REFERRAL_PERCENT,
        minPayout: REFERRAL_MIN_PAYOUT_CENTS / 100,
      }),
    );
    assert.match(out, /15\s?%/, `${l}: процентът`);
    assert.match(out, /100/, `${l}: прагът`);
  }
});

test('privacyBody: чл. 22(2)(а) — автоматично отпадане на платеното при пълно връщане', () => {
  const bg = load('bg').legal.privacyBody;
  assert.ok(!bg.includes('Не прилагаме автоматизирано вземане на решения по чл. 22'));
  assert.match(bg, /чл\. 22\(2\)\(а\)/);
  for (const l of LEGAL_LOCALES) assert.match(load(l).legal.privacyBody, /22\s?\(?2\)?/, `${l}: чл. 22(2)`);
});

test('никой локал не обещава бонус „от всяко плащане“ — мъртвият referralPercentNote е махнат', () => {
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
    assert.equal(load(f.replace('.json', '')).pricing?.referralPercentNote, undefined, f);
  }
});

// Revolut вместо Stripe (2026-11-14): правните текстове на всички 6 родни езика
// не споменават Stripe и носят 14-дневния отказ със стандартния формуляр.
test('legal: без Stripe; ОУ носят 14-дневен отказ и стандартен формуляр', () => {
  for (const l of LEGAL_LOCALES) {
    const legal = load(l).legal;
    for (const k of ['termsBody', 'privacyBody', 'cookiesBody'] as const) {
      assert.ok(typeof legal[k] === 'string' && !/stripe/i.test(legal[k]), `${l}.${k}: без Stripe`);
    }
    assert.match(legal.termsBody, /14/, `${l}: 14 дни`);
    assert.ok(legal.termsBody.includes('info@carbonstealth.eu'), `${l}: адрес за отказа`);
  }
  assert.match(load('bg').legal.termsBody, /Стандартен формуляр за отказ/);
  assert.match(load('en').legal.termsBody, /Model withdrawal form/);
});
