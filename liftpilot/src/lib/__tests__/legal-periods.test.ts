// The legal texts' promises against what makes them true: the day a new version binds a company, the periods the
// texts state against the server's scripts that keep them, the provider's data in the three languages and the register
// of the export's format (round 30).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { LOCALES } from '@/i18n/locales';
import it from '../../../messages/it.json';
import en from '../../../messages/en.json';
import bg from '../../../messages/bg.json';
import { BACKUP_DAYS, LOG_DAYS, NOTICE_DAYS, TERMS_DATE, TERMS_EFFECTIVE, TERMS_VERSION, legalValues, termsBinding, termsStateOf } from '../legal';
import { legalText } from '../legal-text';
import { PROVIDER } from '../provider';
import { EXPORT_DATA, EXPORT_ENVELOPE, EXPORT_FORMAT_HISTORY, EXPORT_FORMAT_VERSION, EXPORT_PROJECT } from '../export-format';

const MESSAGES = { it, en, bg } as const;
const DAY = 24 * 3600_000;
const day = (s: string): Date => new Date(`${s}T00:00:00Z`);

test('una nuova versione vincola un’azienda solo dopo l’e-mail, mai prima di NOTICE_DAYS né di TERMS_EFFECTIVE', () => {
  assert.ok(day(TERMS_EFFECTIVE).getTime() >= day(TERMS_DATE).getTime() + NOTICE_DAYS * DAY, 'TERMS_EFFECTIVE at least NOTICE_DAYS after TERMS_DATE');
  const old = { termsVersion: '2', termsNoticeVersion: null, termsNoticeAt: null };
  const now = new Date('2027-06-01T12:00:00Z');
  assert.deepEqual(termsStateOf({ ...old, termsVersion: TERMS_VERSION }, now), { state: 'ok', binding: null });
  assert.deepEqual(termsStateOf({ ...old, termsVersion: null }, now), { state: 'never', binding: null });
  // never told: the accepted version stays in force, however late
  assert.deepEqual(termsStateOf(old, now), { state: 'pending', binding: null });
  // told of an older version only: still not bound by this one
  assert.equal(termsStateOf({ ...old, termsNoticeVersion: '2', termsNoticeAt: new Date('2026-01-01') }, now).state, 'pending');
  // told: bound from the start of the day NOTICE_DAYS whole days after the e-mail, or TERMS_EFFECTIVE when later
  const told = new Date('2027-03-10T15:30:00Z');
  const binding = termsBinding(told);
  assert.equal(binding.toISOString(), new Date(Date.UTC(2027, 2, 10) + (NOTICE_DAYS + 1) * DAY).toISOString());
  assert.ok(binding.getTime() - told.getTime() >= NOTICE_DAYS * DAY, 'at least NOTICE_DAYS full days');
  const s = { ...old, termsNoticeVersion: TERMS_VERSION, termsNoticeAt: told };
  assert.deepEqual(termsStateOf(s, new Date(binding.getTime() - 1)), { state: 'pending', binding });
  assert.deepEqual(termsStateOf(s, binding), { state: 'changed', binding });
  // told early: TERMS_EFFECTIVE
  assert.equal(termsBinding(new Date(`${TERMS_DATE}T08:00:00Z`)).toISOString(), day(TERMS_EFFECTIVE).toISOString());
});

test('i periodi dei testi sono quelli degli script del server', () => {
  const backup = readFileSync(join(process.cwd(), 'deploy', 'backup.sh'), 'utf8');
  assert.match(backup, new RegExp(`^BACKUP_DAYS=${BACKUP_DAYS}$`, 'm'), 'deploy/backup.sh keeps the copies BACKUP_DAYS days');
  assert.match(backup, /-mtime \+"\$\(\(BACKUP_DAYS - 2\)\)"/, 'deploy/backup.sh deletes a copy by the night it reaches BACKUP_DAYS days');
  const deploy = readFileSync(join(process.cwd(), 'deploy', 'deploy.sh'), 'utf8');
  assert.match(deploy, new RegExp(`maxage ${LOG_DAYS}\\b`), 'deploy/deploy.sh deletes the web logs after LOG_DAYS');
  assert.match(deploy, /\/etc\/cron\.d\/liftpilot-backup/, 'deploy/deploy.sh installs the nightly copy');
  assert.match(deploy, /command -v cron[^\n]*\|\| die /, 'deploy/deploy.sh stops without cron: no copy would be made or deleted');
  for (const l of LOCALES) {
    const text = legalText(l);
    for (const n of [BACKUP_DAYS, LOG_DAYS, NOTICE_DAYS]) assert.ok(text.includes(String(n)), `${l}: ${n}`);
  }
});

test('il fornitore è lo stesso nelle tre lingue: nome bulgaro, codici, telefoni, e-mail, rappresentante', () => {
  for (const l of LOCALES) {
    const t = createTranslator({ locale: l, messages: MESSAGES[l] as typeof it });
    const footer = t('common.provider'), v = legalValues();
    for (const k of ['legal.controllerText', 'legal.contactText'] as const) {
      const s = t(k, v);
      for (const x of [PROVIDER.nameBg, PROVIDER.eik, PROVIDER.vat, PROVIDER.email, ...PROVIDER.phones]) assert.ok(s.includes(x), `${l} ${k}: ${x}`);
    }
    for (const x of [PROVIDER.name, PROVIDER.nameBg, PROVIDER.eik, PROVIDER.vat, PROVIDER.email, ...PROVIDER.phones]) assert.ok(footer.includes(x), `${l} footer: ${x}`);
    // the representative's name in the language's own script
    assert.ok(t('legal.contactText', v).includes(l === 'bg' ? 'Стефан Костадинов' : PROVIDER.representative), `${l} representative`);
  }
});

test('il registro del formato descrive ogni chiave dell’esportazione, in tre lingue', () => {
  for (const l of LOCALES) {
    const t = createTranslator({ locale: l, messages: MESSAGES[l] as typeof it, namespace: 'dataPage' });
    for (const k of [...EXPORT_ENVELOPE, ...EXPORT_DATA]) assert.ok(t(`keys.${k}`, { format: 'f', version: 1 }).length > 5, `${l} keys.${k}`);
    for (const k of EXPORT_PROJECT) assert.ok(t(`project.${k}`).length > 5, `${l} project.${k}`);
    assert.ok(t('keywords').split(',').length >= 5 && t('keywords').includes('Carbon Stealth'), `${l} keywords`);
    // every version of the format has its line, the last one is the version the export writes
    for (const h of EXPORT_FORMAT_HISTORY) assert.ok(t(`history.v${h.version}`, { date: h.since ?? '' }).startsWith(`${h.version} — `), `${l} history.v${h.version}`);
  }
  assert.deepEqual(EXPORT_FORMAT_HISTORY.map((h): number => h.version), Array.from({ length: EXPORT_FORMAT_VERSION }, (_, i) => i + 1));
});
