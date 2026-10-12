// The legal page: every section has its words, the articles are numbered once, and the text in force is the one kept for
// its version (a changed text needs a new TERMS_VERSION and `npm run legal:archive`). Italian is the only language
// served; the English and Bulgarian texts of the versions accepted while the interface had them stay in the archive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { LEGACY_LOCALES, LOCALES } from '@/i18n/locales';
import it from '../../../messages/it.json';
import { PRIVACY, TERMS, TERMS_DATE, TERMS_HISTORY, TERMS_VERSION, article, dateText, legalValues } from '../legal';
import { legalSha256, legalText } from '../legal-text';
import { CONSENTS } from '../consents';

const ARCHIVE = join(process.cwd(), 'legal', 'terms');
/** The versions published while the interface was in Italian, English and Bulgarian: their three texts are the record
 *  of what was accepted in each language, never deleted (only the Italian one is shown). */
const TRILINGUAL = ['2026-10-02', '2', '3', '4'];

test('il testo in vigore è quello conservato per la sua versione', () => {
  assert.deepEqual([...LOCALES], ['it']);
  const file = join(ARCHIVE, TERMS_VERSION, 'it.txt');
  assert.ok(existsSync(file), `${file} missing: npm run legal:archive`);
  const kept = readFileSync(file, 'utf8');
  assert.equal(legalText('it'), kept, 'the text changed — raise TERMS_VERSION and run npm run legal:archive');
  assert.match(legalSha256('it'), /^[0-9a-f]{64}$/);
  assert.equal(legalSha256('it'), createHash('sha256').update(kept, 'utf8').digest('hex'));
  // every version kept, complete, and listed (the page of the earlier versions shows only the listed ones)
  for (const v of readdirSync(ARCHIVE)) assert.ok(existsSync(join(ARCHIVE, v, 'it.txt')), `${v}/it`);
  for (const v of TRILINGUAL) for (const l of LEGACY_LOCALES) assert.ok(existsSync(join(ARCHIVE, v, `${l}.txt`)), `${v}/${l}: the record stays`);
  assert.deepEqual(TERMS_HISTORY.map((h) => h.version).sort(), readdirSync(ARCHIVE).sort());
  const last = TERMS_HISTORY[TERMS_HISTORY.length - 1];
  assert.ok(last.version === TERMS_VERSION && last.date === TERMS_DATE, 'the version in force is the last one');
  assert.equal(new Set(TERMS_HISTORY.map((h) => h.label)).size, TERMS_HISTORY.length);
  // the date each kept text states is the one listed (its second line)
  for (const h of TERMS_HISTORY.slice(0, -1)) {
    assert.ok(readFileSync(join(ARCHIVE, h.version, 'it.txt'), 'utf8').split('\n')[1].endsWith(dateText('it', h.date)), h.version);
  }
});

test('ogni sezione ha titolo e testo, senza segnaposto rimasti; gli articoli sono numerati una volta', () => {
  assert.equal(new Set(TERMS).size, TERMS.length);
  assert.equal(new Set(PRIVACY).size, PRIVACY.length);
  assert.deepEqual(TERMS.map(article), TERMS.map((_, i) => i + 1));
  const text = legalText('it');
  for (const bad of ['{', '}', 'undefined', 'NaN']) assert.ok(!text.includes(bad), `«${bad}»`);
  const legal = it.legal as Record<string, string>;
  for (const k of [...PRIVACY, ...TERMS]) assert.ok(legal[`${k}Title`] && legal[`${k}Text`], k);
});

test('le conferme della registrazione citano gli articoli in vigore', () => {
  const t = createTranslator({ locale: 'it', messages: it, namespace: 'register' });
  const values = { ...legalValues(), date: '—' };
  const say = (k: (typeof CONSENTS)[number]): string => (k === 'accept' ? t.markup('accept', { ...values, link: (c) => c }) : t(k, values));
  for (const k of CONSENTS) assert.ok(say(k).length > 40, k);
  const clauses = t('clauses', values);
  for (const k of ['accounts', 'license', 'subscription', 'liability', 'exit', 'changes', 'misc', 'law'] as const) {
    assert.ok(clauses.includes(` ${article(k)} (`), `clauses: article ${k}`);
  }
  assert.ok(say('accept').includes(` ${article('dpa')})`), 'accept: dpa');
});
