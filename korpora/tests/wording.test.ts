import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keysOf, LOCALES, translate } from '../src/i18n.js';

/** The visible words only: `{modules}` is a placeholder, not the word „modules“. */
const words = (text: string) => text.replace(/\{\w+\}/g, '');

test('one term for one thing on the landing and in the brochure', () => {
  const offenders: string[] = [];
  for (const key of keysOf('it').filter((k) => k.startsWith('landing.'))) {
    // the sheet of the nesting is a „pannello“; a „foglio“ is a sheet of paper
    if (/\bfogli(o)?\b/i.test(translate('it', key))) offenders.push(`it.${key}`);
  }
  for (const key of keysOf('en').filter((k) => /^(landing|brochure)\./.test(k))) {
    // a cabinet is a „unit“ everywhere else in English
    if (/\bmodules?\b/i.test(words(translate('en', key)))) offenders.push(`en.${key}`);
  }
  for (const key of keysOf('bg')) {
    // „G-code“ as in the rest of the Bulgarian copy; only the articled „G-кода“ is Cyrillic
    if (/G-код(?![а-я])/.test(translate('bg', key))) offenders.push(`bg.${key}`);
  }
  assert.deepEqual(offenders, []);
});

test('apostrophes are of one kind, and Italian writes the percent sign the same way everywhere', () => {
  const offenders: string[] = [];
  for (const locale of LOCALES) {
    for (const key of keysOf(locale)) {
      const text = translate(locale, key);
      if (text.includes('\u2019')) offenders.push(`${locale}.${key}: U+2019`);
      if (locale === 'it' && /[\d}]\s%/.test(text)) offenders.push(`it.${key}: %`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the brochure names the sliding table saw, not an industrial beam saw', () => {
  assert.match(translate('it', 'brochure.cover.for'), /\bsquadratrice\b/);
  assert.doesNotMatch(translate('it', 'brochure.cover.for'), /sezionatrice/);
  assert.match(translate('en', 'brochure.cover.for'), /\bsliding table saw\b/);
});

test('the FAQ names the DXF the program writes and does not promise that every CAM program opens it', () => {
  const overclaim = {
    bg: /всяка CAM/,
    en: /any CAM/i,
    it: /qualsiasi programma CAM/i,
  } as const;
  for (const locale of LOCALES) {
    const answer = translate(locale, 'landing.faq.machines.a');
    assert.doesNotMatch(answer, overclaim[locale], locale);
    // engine/dxf.js writes $ACADVER AC1009 — DXF R12
    assert.match(answer, /DXF R12/, locale);
  }
});
