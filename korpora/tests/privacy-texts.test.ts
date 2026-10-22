import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The policy is rendered for real from its template: set the config before anything imports it.
process.env.NODE_ENV = 'test';
process.env.PUBLIC_BASE_URL = 'https://korpora.example';
process.env.DATABASE_URL = 'postgresql://127.0.0.1:5432/unused';
process.env.ENC_KEY = randomBytes(32).toString('hex');
process.env.HMAC_KEY = randomBytes(32).toString('hex');
process.env.CONTACT_EMAIL = 'contact@korpora.example';
process.env.LOG_LEVEL = 'silent';

const ejs = (await import('ejs')).default;
const { COMPANY } = await import('../src/company.js');
const { viewHelpers } = await import('../src/http/view.js');
const { LOCALES, translate, translatorFor } = await import('../src/i18n.js');
type Locale = (typeof LOCALES)[number];
const { ROOT } = await import('../src/paths.js');
const retention = await import('../src/retention.js');
const { legalPath } = await import('../src/seo/paths.js');
const { legalNumbers, privacyNumbers } = await import('../src/services/legal-numbers.js');

/** The visible text of a page: no tags, one space between words. */
const visible = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/[ \t\r\n]+/g, ' ');
async function privacy(locale: Locale): Promise<string> {
  return ejs.renderFile(join(ROOT, 'views', 'legal', 'privacy', `${locale}.ejs`), {
    ...legalNumbers(locale),
    ...privacyNumbers(locale),
    locale,
    t: translatorFor(locale),
    fmt: viewHelpers(locale),
    company: COMPANY,
    contact: 'contact@korpora.example',
    privacyEmail: 'privacy@korpora.example',
    auditKept: '5',
    legalPath,
  });
}

test('the FAQ and the deletion mail claim only what is true about the projects and the backups', () => {
  const overclaim = {
    bg: /виждате само вие|всяко отваряне/,
    en: /only you see|every opening/i,
    it: /li vedete solo voi|ogni apertura/i,
  } as const;
  const said = {
    bg: [/админ панела/, /резервните копия/],
    en: [/admin panel/, /backup/],
    it: [/pannello di amministrazione/, /copie di backup/],
  } as const;
  for (const locale of LOCALES) {
    const faq = ['data', 'delete'].map((id) => translate(locale, `landing.faq.${id}.a`)).join(' ');
    assert.doesNotMatch(faq, overclaim[locale], locale);
    for (const pattern of said[locale]) assert.match(faq, pattern, locale);
    assert.match(translate(locale, 'mail.accountDeleted.body'), said[locale][1], locale);
  }
});

test('the backup periods in the policy are the ones the backup and deploy scripts keep', () => {
  const backup = readFileSync(join(ROOT, 'deploy', 'backup.sh'), 'utf8');
  const deploy = readFileSync(join(ROOT, 'deploy', 'deploy.sh'), 'utf8');
  const defaultOf = (script: string, name: string) =>
    Number(new RegExp(`\\$\\{${name}:-(\\d+)\\}`).exec(script)?.[1]);
  assert.equal(defaultOf(backup, 'KORPORA_BACKUP_DAILY'), retention.BACKUP_KEEP_DAILY);
  assert.equal(defaultOf(backup, 'KORPORA_BACKUP_WEEKLY'), retention.BACKUP_KEEP_WEEKLY);
  assert.equal(defaultOf(deploy, 'KORPORA_KEEP_BACKUPS'), retention.PRE_DEPLOY_BACKUPS_KEPT);
  // the dumps before a deploy live no longer than their own cap, the snapshots before a restore no longer
  // than the weekly backups — in both scripts
  assert.equal(defaultOf(deploy, 'KORPORA_PREDEPLOY_DAYS'), retention.PRE_DEPLOY_MAX_DAYS);
  assert.equal(defaultOf(backup, 'KORPORA_PREDEPLOY_DAYS'), retention.PRE_DEPLOY_MAX_DAYS);
  assert.equal(defaultOf(deploy, 'KORPORA_BACKUP_WEEKLY'), retention.BACKUP_KEEP_WEEKLY);
});

test('the policy states the backups, where they are and the invoice data, in every language', async () => {
  const said = {
    // „from them“: the weeks are the daily backups' limit, not of every copy
    bg: [
      /Резервни копия на базата/,
      /данните за фактурата/,
      /Банката/,
      /резервните копия/,
      /изтрити данни изчезват от тях/,
    ],
    en: [
      /Database backups/,
      /invoice details/,
      /The bank/,
      /backups/,
      /deleted data disappears from them/,
    ],
    it: [
      /Copie di backup del database/,
      /dati per la fattura/,
      /La banca/,
      /copie di backup/,
      /spariscono da queste copie/,
    ],
  } as const;
  for (const locale of LOCALES) {
    const page = visible(await privacy(locale));
    const t = translatorFor(locale);
    assert.ok(page.includes(retention.retentionText(retention.BACKUP_KEEP_DAILY, t)), locale);
    assert.ok(page.includes(t('common.weeks', { n: retention.BACKUP_KEEP_WEEKLY })), locale);
    // the whole phrase: a bare „5“ is also in „AES-256“ and „SHA-256“
    const weeks = t('common.weeks', { n: retention.BACKUP_KEEP_WEEKLY });
    const kept = retention.PRE_DEPLOY_BACKUPS_KEPT;
    const days = retention.retentionText(retention.PRE_DEPLOY_MAX_DAYS, t);
    const preDeploy = {
      bg: `не се съберат ${kept} по-нови, но не повече от ${days}`,
      en: `until ${kept} newer ones exist, but no longer than ${days}`,
      it: `finché non ce ne sono ${kept} più recenti, ma non oltre ${days}`,
    } as const;
    assert.ok(page.includes(preDeploy[locale]), `${locale}: the dumps before a deploy`);
    const preRestore = {
      bg: `снимка на базата отпреди възстановяването пазим също не повече от ${weeks}`,
      en: `snapshot of the database taken before the restore is also kept no longer than ${weeks}`,
      it: `istantanea cifrata del database fatta prima del ripristino è conservata non oltre ${weeks}`,
    } as const;
    assert.ok(page.includes(preRestore[locale]), `${locale}: the snapshot before a restore`);
    for (const pattern of said[locale]) assert.match(page, pattern, locale);
    // the Hetzner line names the backups too: that is where the copies are
    assert.match(
      page,
      /Hetzner Online GmbH[^.;]*\.[^.]*?(резервните копия|backups|copie di backup)/,
    );
  }
});

test('the policy names the terms by their title', async () => {
  for (const locale of ['en', 'it'] as const) {
    const html = await privacy(locale);
    const link = new RegExp(`<a href="${legalPath(locale, 'terms')}">([^<]+)</a>`).exec(html)?.[1];
    assert.equal(link, translate(locale, 'legal.termsTitle').toLowerCase(), locale);
  }
});
