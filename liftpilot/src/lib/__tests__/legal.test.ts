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
import { PROVIDER } from '../provider';
import { MEMBER_ROLES } from '../rbac';

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

test('il testo in vigore parla solo italiano, nomina i quattro ruoli e tiene le lingue del DSA per le autorità', () => {
  // only Italian is archived from version 5 on; the en/bg texts stay only for the versions that had them
  assert.deepEqual(readdirSync(join(ARCHIVE, TERMS_VERSION)), ['it.txt']);
  const text = legalText('it');
  const roles = MEMBER_ROLES.map((r) => (it.roles as Record<string, string>)[r]);
  assert.ok(text.includes(`${roles.slice(0, -1).join(', ')} o ${roles[roles.length - 1]}`), 'the colleagues’ roles, all of them, in the matrix’s order');
  for (const gone of ['NEXT_LOCALE', 'inglese e bulgaro', 'inglese o bulgaro', 'prevale il testo']) assert.ok(!text.includes(gone), gone);
  // DSA art. 11(3): the authorities' point of contact names an official language of Bulgaria (main establishment)
  assert.ok(text.includes('(art. 11 del Regolamento (UE) 2022/2065, DSA), in bulgaro, in inglese o in italiano'), 'DSA art. 11');
  assert.ok(text.includes(PROVIDER.nameBg), 'the legal name in Bulgarian');
  // outside the hashed text, changed by hand with each version: the 1341-1342 c.c. confirmation and the e-mail's summary
  const t = createTranslator({ locale: 'it', messages: it });
  assert.ok(!t('register.clauses', legalValues()).includes('prevalenza'), 'register.clauses: no prevailing text with one language');
  const previous = TERMS_HISTORY[TERMS_HISTORY.length - 2].label;
  assert.ok(t('mail.termsNoticeChanges', legalValues()).startsWith(`Che cosa cambia rispetto alla versione ${previous}:`), 'mail.termsNoticeChanges: the summary of this version');
});

test('il testo in vigore distingue il ruolo «Titolare» dal titolare del trattamento e dice chi decide sul registro attività', () => {
  const text = legalText('it');
  // the GDPR controller always in full, the role always with its capital (as the UI and the four colleague roles)
  for (const m of text.matchAll(/\btitolar([ei])\b(.{0,30})/g)) {
    const ok = m[1] === 'e' ? /^ (?:autonomo )?del trattamento/.test(m[2]) : /^(?: del trattamento| dei marchi|,)/.test(m[2]);
    assert.ok(ok, `«titolar${m[1]}${m[2]}»: the role is «Titolare», the controller «titolare del trattamento»`);
  }
  assert.ok(text.includes('Per il Titolare, cioè chi registra l’azienda su LiftPilot,'), 'the role defined where it first appears');
  // the activity log: ours for security (art. 6(1)(f)), the company's to show and export (art. 28), and so in art. 9
  assert.ok(text.includes('Lo teniamo come titolari del trattamento per la sicurezza del servizio'), 'the log: our part');
  assert.ok(text.includes('Quali colleghi lo vedono e chi lo scarica lo decide invece l’azienda'), 'the log: the company’s part');
  assert.ok(text.includes('e per il registro attività quando l’azienda lo mostra ai colleghi o lo esporta, l’azienda è titolare del trattamento'), 'art. 9');
  assert.ok(text.includes('art. 4, comma 3, della legge 20 maggio 1970, n. 300'), 'the balance: the employer informs its people');
  // the balance names who sees the log as the privacy text does: the owner always (a hard rule), then whom it allows
  assert.ok(text.includes('Il registro attività mostra al Titolare, e ai colleghi a cui il Titolare ne dà il permesso, gli accessi'), 'the balance: who sees the log');
  // the Capotecnico downloads only while active (colleagues are deactivated when the subscription ends, art. 7)
  assert.equal(text.match(/anche il Capotecnico finché è attivo/g)?.length, 2, 'privacy and art. 10');
  assert.ok(!/ruolo, lingua,/.test(text) && text.includes('lingua del testo accettato'), 'no language on the account, only the accepted text’s');
  // the e-mail announcing this version says the same of the log: the owner sees it, the company decides who else sees and
  // downloads it
  const notice = createTranslator({ locale: 'it', messages: it })('mail.termsNoticeChanges', legalValues());
  assert.ok(notice.includes('lo vedono il Titolare e i colleghi a cui il Titolare ne dà il permesso'), 'the notice: who sees the log');
  assert.ok(notice.includes('quali colleghi lo vedono e chi lo scarica lo decide l’azienda'), 'the notice: the company’s part');
});

