import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hasKey, keysOf, LOCALES, translate } from '../src/i18n.js';
import { ROOT } from '../src/paths.js';

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, ext) : ext.test(name) ? [path] : [];
  });
}

test('every language has exactly the keys of the Bulgarian source', () => {
  const source = keysOf('bg');
  for (const locale of LOCALES)
    assert.deepEqual(keysOf(locale), source, `${locale} differs from bg`);
});

test('placeholders match between languages and no text is empty', () => {
  const names = (s: string) =>
    [...s.matchAll(/\{(\w+)\}/g)]
      .map((m) => m[1])
      .sort()
      .join(',');
  for (const key of keysOf('bg')) {
    const bg = translate('bg', key);
    for (const locale of LOCALES) {
      const text = translate(locale, key);
      assert.ok(text.trim().length > 0, `${locale}.${key} is empty`);
      assert.equal(names(text), names(bg), `${locale}.${key} placeholders`);
    }
  }
});

test('every literal key used in the templates exists', () => {
  const missing: string[] = [];
  for (const file of files(join(ROOT, 'views'), /\.ejs$/)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bte?\('([a-zA-Z][\w.]*)'\s*[,)]/g)) {
      const key = match[1]!;
      if (!hasKey('bg', key) && !hasKey('bg', `${key}.other`))
        missing.push(`${file.slice(ROOT.length + 1)}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('counts pick the right form in every language', () => {
  assert.equal(translate('bg', 'plan.months', { n: 1 }), '1 месец');
  assert.equal(translate('bg', 'plan.months', { n: 3 }), '3 месеца');
  assert.equal(translate('en', 'plan.months', { n: 1 }), '1 month');
  assert.equal(translate('en', 'plan.months', { n: 12 }), '12 months');
  assert.equal(translate('it', 'plan.months', { n: 1 }), '1 mese');
  assert.equal(translate('it', 'plan.months', { n: 6 }), '6 mesi');
  assert.equal(translate('bg', 'plan.chip.trialDays', { n: 1 }), 'Тест: 1 ден');
});

test('the sites carry at least five keywords, one of them “Carbon Stealth”', () => {
  for (const locale of LOCALES) {
    for (const key of ['landing.meta.keywords', 'legal.keywords']) {
      const words = translate(locale, key)
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean);
      assert.ok(words.length >= 5, `${locale}.${key}: ${words.length} keywords`);
      assert.ok(words.includes('Carbon Stealth'), `${locale}.${key} without Carbon Stealth`);
    }
  }
});

test('titles and descriptions fit search results', () => {
  for (const locale of LOCALES) {
    assert.ok(translate(locale, 'landing.meta.title').length < 60, `${locale} title`);
    assert.ok(translate(locale, 'landing.meta.description').length < 160, `${locale} description`);
    for (const key of ['legal.privacyDescription', 'legal.termsDescription']) {
      assert.ok(translate(locale, key).length < 160, `${locale}.${key}`);
    }
  }
});

test('the landing says that every account gets a 30-day trial, in every language', () => {
  const expected = {
    bg: /30 дни тестов период/,
    en: /30-day trial/,
    it: /30 giorni di prova/,
  } as const;
  for (const locale of LOCALES) {
    assert.match(translate(locale, 'landing.prices.trial', { days: 30 }), expected[locale]);
    assert.match(translate(locale, 'landing.hero.trial', { days: 30 }), expected[locale]);
  }
});

test('no stock marketing phrases in the public copy', () => {
  const banned =
    /революци|безпрецедент|иновативн|seamless|unleash|cutting-edge|game.?changer|revolutionary|next.?level|supercharge|rivoluzionari|all-in-one|всичко в едно/i;
  for (const locale of LOCALES) {
    for (const key of keysOf(locale).filter((k) => k.startsWith('landing.'))) {
      assert.ok(
        !banned.test(translate(locale, key)),
        `${locale}.${key}: ${translate(locale, key)}`,
      );
    }
  }
});

test('a Bulgarian date is never followed by a period: the date already ends with „г.“', () => {
  const offenders = keysOf('bg').filter((key) => /\{date\}\./.test(translate('bg', key)));
  assert.deepEqual(offenders, []);
});
