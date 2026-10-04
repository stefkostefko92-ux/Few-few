// The legal page: every section has its words in the three languages, the articles are numbered once, and the text in
// force is the one kept for its version (a changed text needs a new TERMS_VERSION and `npm run legal:archive`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { LOCALES } from '@/i18n/locales';
import it from '../../../messages/it.json';
import en from '../../../messages/en.json';
import bg from '../../../messages/bg.json';
import { PRIVACY, TERMS, TERMS_VERSION, article, legalValues } from '../legal';
import { legalSha256, legalText } from '../legal-text';
import { CONSENTS } from '../consents';

const ARCHIVE = join(process.cwd(), 'legal', 'terms');
const MESSAGES = { it, en, bg } as const;

test('il testo in vigore è quello conservato per la sua versione, in tre lingue', () => {
  for (const l of LOCALES) {
    const file = join(ARCHIVE, TERMS_VERSION, `${l}.txt`);
    assert.ok(existsSync(file), `${file} missing: npm run legal:archive`);
    assert.equal(legalText(l), readFileSync(file, 'utf8'), `${l}: the text changed — raise TERMS_VERSION and run npm run legal:archive`);
    assert.match(legalSha256(l), /^[0-9a-f]{64}$/);
  }
  // every version kept, complete
  for (const v of readdirSync(ARCHIVE)) for (const l of LOCALES) assert.ok(existsSync(join(ARCHIVE, v, `${l}.txt`)), `${v}/${l}`);
});

test('ogni sezione ha titolo e testo, senza segnaposto rimasti; gli articoli sono numerati una volta', () => {
  assert.equal(new Set(TERMS).size, TERMS.length);
  assert.equal(new Set(PRIVACY).size, PRIVACY.length);
  assert.deepEqual(TERMS.map(article), TERMS.map((_, i) => i + 1));
  for (const l of LOCALES) {
    const text = legalText(l);
    for (const bad of ['{', '}', 'undefined', 'NaN']) assert.ok(!text.includes(bad), `${l}: «${bad}»`);
    const legal = MESSAGES[l].legal as Record<string, string>;
    for (const k of [...PRIVACY, ...TERMS]) assert.ok(legal[`${k}Title`] && legal[`${k}Text`], `${l} ${k}`);
  }
});

test('le conferme della registrazione citano gli articoli in vigore', () => {
  for (const l of LOCALES) {
    const t = createTranslator({ locale: l, messages: MESSAGES[l] as typeof it, namespace: 'register' });
    const values = { ...legalValues(), date: '—' };
    const say = (k: (typeof CONSENTS)[number]): string => (k === 'accept' ? t.markup('accept', { ...values, link: (c) => c }) : t(k, values));
    for (const k of CONSENTS) assert.ok(say(k).length > 40, `${l} ${k}`);
    const clauses = t('clauses', values);
    for (const k of ['accounts', 'license', 'subscription', 'liability', 'exit', 'changes', 'misc', 'law'] as const) {
      assert.ok(clauses.includes(` ${article(k)} (`), `${l} clauses: article ${k}`);
    }
    assert.ok(say('accept').includes(` ${article('dpa')})`), `${l} accept: dpa`);
  }
});
